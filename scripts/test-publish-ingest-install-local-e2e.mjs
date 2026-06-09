import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { spawn } from 'node:child_process'

const repoRoot = process.cwd()
const ingestScript = path.join(repoRoot, 'scripts', 'ingest-release.mjs')
const validatorScript = path.join(repoRoot, 'scripts', 'validate-index.mjs')
const rawIndexPrefix = 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/'
const publisher = 'knoxhack'
const owner = 'knoxhack'
const repo = 'ECHO-E2E'
const moduleId = 'e2e.weather'
const packId = 'ashfall-native-edition'
const now = '2026-06-09T00:00:00.000Z'

const crcTable = new Uint32Array(256)
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  crcTable[index] = value >>> 0
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath))
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function u16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

function storedZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, '/')
    const nameBuffer = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8')
    const checksum = crc32(data)
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer,
    ])
    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuffer,
    ])
    localParts.push(localHeader, data)
    centralParts.push(centralHeader)
    offset += localHeader.length + data.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const endRecord = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ])
  return Buffer.concat([...localParts, centralDirectory, endRecord])
}

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, jsonBytes(value))
}

async function runNode(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

async function writeBaseIndex(root) {
  for (const dir of ['products', 'modpacks', 'modules', 'addons', 'publishers', 'channels', 'trust', 'blocks']) {
    await fs.mkdir(path.join(root, dir), { recursive: true })
  }
  await fs.cp(path.join(repoRoot, 'schemas'), path.join(root, 'schemas'), { recursive: true })
  await writeJson(root, 'channels/alpha.json', { id: 'alpha', name: 'Alpha', stability: 'alpha', priority: 10 })
  await writeJson(root, 'publishers/knoxhack.json', {
    id: publisher,
    name: 'Knoxhack',
    githubOwner: 'knoxhack',
    trust: 'source-linked',
  })
  await writeJson(root, 'trust/tiers.json', [
    { id: 'official', rank: 100, description: 'Official fixture trust.', playable: true },
    { id: 'source-linked', rank: 60, description: 'Source-linked fixture trust.', playable: true },
    { id: 'community', rank: 40, description: 'Community fixture trust.', playable: true },
    { id: 'blocked', rank: 0, description: 'Blocked fixture trust.', playable: false },
  ])
}

function addonArchive(version) {
  const packageManifest = {
    schemaVersion: 'echo.addon.package.v1',
    id: moduleId,
    version,
    publisher: { githubOwner: owner, githubRepo: repo },
    targets: ['native'],
    dependencies: [],
    artifacts: { native: `${moduleId}-${version}.echo-addon` },
  }
  const moduleManifest = {
    id: moduleId,
    version,
    name: 'E2E Weather Module',
  }
  const packageBytes = jsonBytes(packageManifest)
  const moduleBytes = jsonBytes(moduleManifest)
  const contentBytes = Buffer.from(`${version}\n`, 'utf8')
  const checksums = Buffer.from([
    `${sha256(packageBytes)} echo-addon-package.json`,
    `${sha256(moduleBytes)} META-INF/echo.mod.json`,
    `${sha256(contentBytes)} content/version.txt`,
    '',
  ].join('\n'), 'utf8')
  return storedZip([
    { name: 'echo-addon-package.json', data: packageBytes },
    { name: 'META-INF/echo.mod.json', data: moduleBytes },
    { name: 'content/version.txt', data: contentBytes },
    { name: 'checksums.sha256', data: checksums },
  ])
}

async function writePublishedReleaseAssets(assetRoot, version) {
  const tag = `v${version}`
  const addonName = `${moduleId}-${version}.echo-addon`
  const addonBytes = addonArchive(version)
  const addonSha = sha256(addonBytes)
  const releaseMetadata = {
    schemaVersion: 'echo.release.index.entry.v1',
    id: moduleId,
    kind: 'module',
    version,
    channel: 'alpha',
    publisher,
    sourceRepo: `${owner}/${repo}`,
    releaseTag: tag,
    commitSha: version === '1.0.0' ? 'abc1000' : 'abc1100',
    trust: 'community',
    validation: 'approved',
    compatibility: [packId],
    dependencies: [],
    assets: [{ name: addonName, sha256: addonSha }],
  }
  const metadataBytes = jsonBytes(releaseMetadata)
  const checksumsBytes = Buffer.from(`${addonSha} ${addonName}\n${sha256(metadataBytes)} echo-release.json\n`, 'utf8')
  const assets = new Map([
    ['echo-release.json', metadataBytes],
    ['checksums.sha256', checksumsBytes],
    [addonName, addonBytes],
  ])
  const filePaths = new Map()
  const versionDir = path.join(assetRoot, version)
  await fs.mkdir(versionDir, { recursive: true })
  for (const [name, bytes] of assets) {
    const filePath = path.join(versionDir, name)
    await fs.writeFile(filePath, bytes)
    filePaths.set(name, filePath)
  }
  return { tag, addonName, addonSha, assets, filePaths, targetCommitish: releaseMetadata.commitSha }
}

async function withFakeGithubServer(releases, callback) {
  let currentRelease = releases[0]
  const byTag = new Map(releases.map((release, index) => [release.tag, { ...release, id: index + 1 }]))
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const releaseMatch = /^\/repos\/knoxhack\/ECHO-E2E\/releases\/tags\/([^/]+)$/u.exec(url.pathname)
    if (releaseMatch) {
      const tag = decodeURIComponent(releaseMatch[1])
      const release = byTag.get(tag)
      if (!release) {
        response.writeHead(404)
        response.end('not found')
        return
      }
      currentRelease = release
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        id: release.id,
        tag_name: release.tag,
        draft: false,
        target_commitish: release.targetCommitish,
        assets_url: `http://127.0.0.1:${server.address().port}/repos/knoxhack/ECHO-E2E/releases/${release.id}/assets`,
      }))
      return
    }
    const assetsMatch = /^\/repos\/knoxhack\/ECHO-E2E\/releases\/(\d+)\/assets$/u.exec(url.pathname)
    if (assetsMatch) {
      const release = releases[Number(assetsMatch[1]) - 1]
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify([...release.assets].map(([name, bytes]) => ({
        name,
        size: bytes.length,
        browser_download_url: `https://github.com/${owner}/${repo}/releases/download/${release.tag}/${name}`,
        digest: `sha256:${sha256(bytes)}`,
      }))))
      return
    }
    if (url.pathname.startsWith('/download/')) {
      const name = decodeURIComponent(path.basename(url.pathname))
      const bytes = currentRelease.assets.get(name)
      if (bytes) {
        response.writeHead(200, { 'content-type': name.endsWith('.json') ? 'application/json' : 'application/octet-stream' })
        response.end(bytes)
        return
      }
    }
    response.writeHead(404)
    response.end('not found')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    return await callback(baseUrl)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
}

async function ingestVersion(indexRoot, baseUrl, release) {
  const out = `ingestion-${release.tag}.json`
  const result = await runNode([
    ingestScript,
    '--owner', owner,
    '--repo', repo,
    '--tag', release.tag,
    '--write-index-entry',
    '--entry-kind', 'module',
    '--entry-id', moduleId,
    '--trust', 'community',
    '--out', out,
  ], {
    cwd: indexRoot,
    env: {
      ...process.env,
      GITHUB_API_BASE_URL: baseUrl,
      ECHO_INGEST_DOWNLOAD_MIRROR_BASE_URL: `${baseUrl}/download/`,
    },
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(await fs.readFile(path.join(indexRoot, out), 'utf8'))
  assert.equal(payload.validation, 'approved')
  assert.deepEqual(payload.writtenIndexEntries, [`modules/${moduleId}.json`])
  return JSON.parse(await fs.readFile(path.join(indexRoot, 'modules', `${moduleId}.json`), 'utf8'))
}

async function writePackAndChannel(indexRoot, release) {
  const manifestName = `${packId}-alpha-${release.tag.slice(1)}.pack.json`
  const manifestBytes = jsonBytes({
    pack: packId,
    version: release.tag.slice(1),
    channel: 'alpha',
    moduleRequirements: [{ id: moduleId, version: release.tag.slice(1) }],
    files: [{ path: `addons/${release.addonName}`, sha256: release.addonSha, required: true }],
  })
  const manifestSha = sha256(manifestBytes)
  await writeJson(indexRoot, `modpacks/${packId}.json`, {
    id: packId,
    kind: 'modpack',
    version: release.tag.slice(1),
    channel: 'alpha',
    publisher,
    sourceRepo: 'knoxhack/ECHO-Ashfall-Native-Edition',
    releaseTag: `pack-${release.tag}`,
    commitSha: '1111111111111111111111111111111111111111',
    artifacts: {
      manifest: {
        file: manifestName,
        url: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/pack-${release.tag}/${manifestName}`,
        sha256: manifestSha,
        size: manifestBytes.length,
      },
    },
    dependencies: [{ id: moduleId, kind: 'module', version: '*' }],
    compatibility: [packId],
    trust: 'source-linked',
    validation: 'approved',
  })
  await writeJson(indexRoot, 'channels/alpha/launcher-channel.json', {
    schemaVersion: 1,
    channel: 'alpha',
    generatedAt: now,
    releaseManifestUrl: `${rawIndexPrefix}channels/alpha/release-manifest.json`,
    repositoryCatalogUrl: `${rawIndexPrefix}channels/alpha/repositories.json`,
    catalogUrls: {
      products: [],
      modpacks: [`${rawIndexPrefix}modpacks/${packId}.json`],
      modules: [`${rawIndexPrefix}modules/${moduleId}.json`],
      addons: [],
    },
  })
}

async function validateIndex(indexRoot) {
  const result = await runNode([validatorScript, '--root', indexRoot, '--strict'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
}

async function loadCatalog(indexRoot) {
  const channel = JSON.parse(await fs.readFile(path.join(indexRoot, 'channels', 'alpha', 'launcher-channel.json'), 'utf8'))
  const urls = Object.values(channel.catalogUrls).flat()
  const entries = []
  for (const url of urls) {
    assert(url.startsWith(rawIndexPrefix), `Catalog URL must use raw index prefix: ${url}`)
    const relPath = url.slice(rawIndexPrefix.length)
    const payload = JSON.parse(await fs.readFile(path.join(indexRoot, relPath), 'utf8'))
    entries.push(...(Array.isArray(payload) ? payload : [payload]))
  }
  return entries
}

function artifactRecords(entry) {
  const records = []
  const visit = (node, role = 'asset') => {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, role))
      return
    }
    if (!node || typeof node !== 'object') return
    if (node.file || node.name || node.url || node.sha256) {
      records.push({ role, name: String(node.file ?? node.name ?? role), url: node.url, sha256: node.sha256, size: node.size })
    }
    Object.entries(node).forEach(([key, value]) => visit(value, key))
  }
  visit(entry.artifacts)
  return records
}

function artifactForPackTarget(entry) {
  return artifactRecords(entry).find((record) => record.role === 'native' || /\.echo-addon$/i.test(record.name))
}

function dependencyClosure(entries, rootIds) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const seen = new Set()
  const out = []
  const visit = (id) => {
    if (seen.has(id)) return
    const entry = byId.get(id)
    assert(entry, `Missing dependency ${id}`)
    assert.equal(entry.validation, 'approved')
    seen.add(id)
    for (const dependency of entry.dependencies ?? []) visit(dependency.id)
    out.push(entry)
  }
  rootIds.forEach(visit)
  return out
}

function resolveInstall(entries) {
  const entry = entries.find((candidate) => candidate.id === moduleId && candidate.kind === 'module' && candidate.validation === 'approved')
  const pack = entries.find((candidate) => candidate.id === packId && candidate.kind === 'modpack' && candidate.validation === 'approved')
  assert(entry && pack, 'Approved module and pack entries are required.')
  assert((pack.dependencies ?? []).some((dependency) => dependency.id === moduleId), 'Pack must depend on module.')
  const artifact = artifactForPackTarget(entry)
  assert(artifact?.url && artifact.sha256, 'Module install artifact must have URL and SHA-256.')
  dependencyClosure(entries, [entry.id, pack.id])
  return { entry, pack, artifact }
}

function pathForArtifactUrl(url, releases) {
  const name = path.basename(new URL(url).pathname)
  for (const release of releases) {
    const filePath = release.filePaths.get(name)
    if (filePath) return filePath
  }
  throw new Error(`No local artifact fixture for ${url}`)
}

async function installArtifact(releases, installRoot, artifact) {
  const sourcePath = pathForArtifactUrl(artifact.url, releases)
  assert.equal(await sha256File(sourcePath), artifact.sha256)
  const installedPath = path.join(installRoot, 'addons', artifact.name)
  await fs.mkdir(path.dirname(installedPath), { recursive: true })
  await fs.copyFile(sourcePath, installedPath)
  assert.equal(await sha256File(installedPath), artifact.sha256)
  return installedPath
}

async function updateInstall(releases, installRoot, previous, nextArtifact) {
  const backupDir = path.join(installRoot, '.echo', 'rollback', `update-${Date.now()}`)
  const oldRelative = path.relative(installRoot, previous.installedPath).replace(/\\/g, '/')
  const backupPath = path.join(backupDir, oldRelative)
  await fs.mkdir(path.dirname(backupPath), { recursive: true })
  await fs.copyFile(previous.installedPath, backupPath)
  assert.equal(await sha256File(backupPath), previous.artifact.sha256)
  await fs.rm(previous.installedPath)
  const installedPath = await installArtifact(releases, installRoot, nextArtifact)
  return {
    installedPath,
    artifact: nextArtifact,
    rollbackPlan: {
      installPath: installRoot,
      backedUp: [{ path: oldRelative, backupPath }],
      removed: [path.relative(installRoot, installedPath).replace(/\\/g, '/')],
    },
  }
}

async function repairInstall(releases, current) {
  await fs.writeFile(current.installedPath, Buffer.from('corrupted\n', 'utf8'))
  assert.notEqual(await sha256File(current.installedPath), current.artifact.sha256)
  const sourcePath = pathForArtifactUrl(current.artifact.url, releases)
  await fs.copyFile(sourcePath, current.installedPath)
  assert.equal(await sha256File(current.installedPath), current.artifact.sha256)
}

async function rollbackUpdate(plan) {
  for (const relativePath of plan.removed) await fs.rm(path.join(plan.installPath, relativePath), { force: true })
  for (const backup of plan.backedUp) {
    const destination = path.join(plan.installPath, backup.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(backup.backupPath, destination)
  }
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-publish-ingest-install-e2e-'))
  const indexRoot = path.join(tempRoot, 'index')
  const assetRoot = path.join(tempRoot, 'published-assets')
  const installRoot = path.join(tempRoot, 'install')
  try {
    await writeBaseIndex(indexRoot)
    const releaseV1 = await writePublishedReleaseAssets(assetRoot, '1.0.0')
    const releaseV2 = await writePublishedReleaseAssets(assetRoot, '1.1.0')
    const releases = [releaseV1, releaseV2]
    await withFakeGithubServer(releases, async (baseUrl) => {
      const entryV1 = await ingestVersion(indexRoot, baseUrl, releaseV1)
      assert.equal(entryV1.version, '1.0.0')
      await writePackAndChannel(indexRoot, releaseV1)
      await validateIndex(indexRoot)
      const installResolution = resolveInstall(await loadCatalog(indexRoot))
      const installedPath = await installArtifact(releases, installRoot, installResolution.artifact)
      const installed = { installedPath, artifact: installResolution.artifact }

      const entryV2 = await ingestVersion(indexRoot, baseUrl, releaseV2)
      assert.equal(entryV2.version, '1.1.0')
      await writePackAndChannel(indexRoot, releaseV2)
      await validateIndex(indexRoot)
      const updateResolution = resolveInstall(await loadCatalog(indexRoot))
      assert.equal(updateResolution.entry.version, '1.1.0')
      const updated = await updateInstall(releases, installRoot, installed, updateResolution.artifact)
      await repairInstall(releases, updated)
      await rollbackUpdate(updated.rollbackPlan)

      const restoredPath = path.join(installRoot, updated.rollbackPlan.backedUp[0].path)
      assert.equal(await sha256File(restoredPath), installResolution.artifact.sha256)
      await fs.access(path.join(installRoot, updated.rollbackPlan.removed[0])).then(
        () => { throw new Error('Rollback did not remove updated artifact.') },
        () => undefined,
      )
    })
    console.log(JSON.stringify({
      ok: true,
      published: [releaseV1.addonName, releaseV2.addonName],
      indexRoot,
      installRoot,
      tempCleaned: true,
    }, null, 2))
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

await main()
