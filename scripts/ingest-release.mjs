import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import zlib from 'node:zlib'

const root = process.cwd()
const sha256Pattern = /^[a-f0-9]{64}$/i
const githubApiBaseUrl = process.env.GITHUB_API_BASE_URL || 'https://api.github.com'
const downloadMirrorBaseUrl = process.env.ECHO_INGEST_DOWNLOAD_MIRROR_BASE_URL

function withTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`
}

function githubApiUrl(route) {
  return new URL(route.replace(/^\/+/, ''), withTrailingSlash(githubApiBaseUrl)).toString()
}

function downloadUrlForFetch(url) {
  if (!downloadMirrorBaseUrl) return url
  const parsed = new URL(url)
  const name = path.basename(parsed.pathname)
  return new URL(encodeURIComponent(name), withTrailingSlash(downloadMirrorBaseUrl)).toString()
}

function parseArgs(argv) {
  const args = { out: 'ingestion-result.json', requireAttestation: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--payload') args.payload = argv[++index]
    else if (arg === '--secret') args.secret = argv[++index]
    else if (arg === '--signature') args.signature = argv[++index]
    else if (arg === '--owner') args.owner = argv[++index]
    else if (arg === '--repo') args.repo = argv[++index]
    else if (arg === '--tag') args.tag = argv[++index]
    else if (arg === '--out') args.out = argv[++index]
    else if (arg === '--write-index-entry') args.writeIndexEntry = true
    else if (arg === '--entry-kind') args.entryKind = argv[++index]
    else if (arg === '--entry-id') args.entryId = argv[++index]
    else if (arg === '--channel') args.channel = argv[++index]
    else if (arg === '--publisher') args.publisher = argv[++index]
    else if (arg === '--trust') args.trust = argv[++index]
    else if (arg === '--require-attestation') args.requireAttestation = true
    else if (arg === '--attestation-commit') args.attestationCommit = argv[++index]
    else if (arg === '--attestation-workflow') args.attestationWorkflow = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function verifyWebhookHmac(rawPayload, secret, signature) {
  if (!secret) return { ok: true, warning: 'No webhook secret supplied; HMAC verification skipped.' }
  if (!signature) return { ok: false, error: 'Webhook signature is required when --secret is supplied.' }
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawPayload).digest('hex')}`
  const left = Buffer.from(expected)
  const right = Buffer.from(signature)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false, error: 'Webhook HMAC signature mismatch.' }
  }
  return { ok: true }
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ECHO-Release-Index-Ingestion',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) throw new Error(`GitHub request failed ${response.status}: ${await response.text()}`)
  return response.json()
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function githubAppJwt() {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!appId || !privateKey) return null
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const input = `${header}.${payload}`
  const signature = crypto.createSign('RSA-SHA256').update(input).sign(privateKey, 'base64url')
  return `${input}.${signature}`
}

async function installationAccessToken() {
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID
  const jwt = githubAppJwt()
  if (!installationId || !jwt) return null
  const response = await fetch(githubApiUrl(`/app/installations/${installationId}/access_tokens`), {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwt}`,
      'User-Agent': 'ECHO-Release-Index-Ingestion',
    },
  })
  if (!response.ok) throw new Error(`Unable to mint GitHub App installation token: ${response.status} ${await response.text()}`)
  const payload = await response.json()
  return payload.token
}

async function fetchRelease(owner, repo, tag, token) {
  return githubJson(githubApiUrl(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`), token)
}

async function fetchReleaseAssets(release, token) {
  const assets = []
  for (let page = 1; page <= 20; page += 1) {
    const separator = release.assets_url.includes('?') ? '&' : '?'
    const pageAssets = await githubJson(`${release.assets_url}${separator}per_page=100&page=${page}`, token)
    if (!Array.isArray(pageAssets)) break
    assets.push(...pageAssets)
    if (pageAssets.length < 100) break
  }
  return assets
}

async function fetchText(url, token) {
  const fetchUrl = downloadUrlForFetch(url)
  const response = await fetch(fetchUrl, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'ECHO-Release-Index-Ingestion',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`)
  return response.text()
}

async function fetchBytes(url, token) {
  const fetchUrl = downloadUrlForFetch(url)
  const response = await fetch(fetchUrl, {
    headers: {
      Accept: 'application/octet-stream, application/zip, */*',
      'User-Agent': 'ECHO-Release-Index-Ingestion',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function parseChecksums(text) {
  const checksums = new Map()
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+(.+)$/i)
    if (match) checksums.set(match[2].trim(), match[1].toLowerCase())
  }
  return checksums
}

function metadataAssetSha(metadata, name) {
  if (!name) return undefined
  if (Array.isArray(metadata?.assets)) return metadata.assets.find((asset) => asset.name === name)?.sha256
  if (Array.isArray(metadata?.modules)) {
    for (const moduleRecord of metadata.modules) {
      const artifact = moduleRecord?.artifacts?.find((item) => item.filename === name || item.name === name || item.file === name)
      if (artifact?.sha256) return artifact.sha256
    }
  }
  return metadata?.assets?.[name]?.sha256
}

function assetSha(asset, metadata, checksums = new Map()) {
  const fromChecksums = checksums.get(asset.name)
  if (fromChecksums) return fromChecksums
  const fromMetadata = metadataAssetSha(metadata, asset.name)
  if (fromMetadata) return fromMetadata
  const digest = String(asset.digest ?? '')
  const match = digest.match(/^sha256:([a-f0-9]{64})$/i)
  return match?.[1]
}

function flattenArtifacts(value) {
  const artifacts = []
  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk)
    } else if (node && typeof node === 'object') {
      if (node.file || node.name || node.filename || node.sha256 || node.url) artifacts.push(node)
      Object.values(node).forEach(walk)
    }
  }
  walk(value)
  return artifacts
}

function readZipEntries(buffer) {
  let eocd = -1
  const minimum = Math.max(0, buffer.length - 65557)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory record not found.')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralDirOffset = buffer.readUInt32LE(eocd + 16)
  const entries = []
  let cursor = centralDirOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory entry.')
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readZipEntry(buffer, entry) {
  const cursor = entry.localHeaderOffset
  if (buffer.readUInt32LE(cursor) !== 0x04034b50) throw new Error(`Invalid ZIP local header for ${entry.name}.`)
  const nameLength = buffer.readUInt16LE(cursor + 26)
  const extraLength = buffer.readUInt16LE(cursor + 28)
  const dataStart = cursor + 30 + nameLength + extraLength
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize)
  if (entry.method === 0) return compressed
  if (entry.method === 8) return zlib.inflateRawSync(compressed, { finishFlush: zlib.constants.Z_SYNC_FLUSH })
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}.`)
}

function parseJsonEntry(buffer, entryMap, name) {
  const entry = entryMap.get(name)
  if (!entry) return null
  return JSON.parse(readZipEntry(buffer, entry).toString('utf8'))
}

function inspectArchive(asset, bytes) {
  const reasons = []
  const warnings = []
  if (!/\.(zip|jar|echo-addon)$/i.test(asset.name)) return { reasons, warnings }

  let entries
  try {
    entries = readZipEntries(bytes)
  } catch (error) {
    return { reasons: [`${asset.name} is not a readable ZIP/JAR archive: ${error.message}`], warnings }
  }
  const entryMap = new Map(entries.map((entry) => [entry.name, entry]))
  const has = (name) => entryMap.has(name)
  const requireEntry = (name) => {
    if (!has(name)) reasons.push(`${asset.name} is missing embedded ${name}.`)
  }

  if (/\.echo-addon$/i.test(asset.name)) {
    requireEntry('echo-addon-package.json')
    requireEntry('META-INF/echo.mod.json')
  }
  if (/-neoforge\.jar$/i.test(asset.name)) {
    requireEntry('META-INF/echo.mod.json')
    requireEntry('META-INF/neoforge.mods.toml')
  }
  if (/-(standalone|sources)\.jar$/i.test(asset.name)) {
    requireEntry('META-INF/echo.mod.json')
  }

  try {
    const packageJson = parseJsonEntry(bytes, entryMap, 'echo-addon-package.json')
    if (packageJson && packageJson.schemaVersion !== 'echo.addon.package.v1') {
      reasons.push(`${asset.name} echo-addon-package.json must use schemaVersion echo.addon.package.v1.`)
    }
  } catch (error) {
    reasons.push(`${asset.name} has invalid echo-addon-package.json: ${error.message}`)
  }

  try {
    const moduleJson = parseJsonEntry(bytes, entryMap, 'META-INF/echo.mod.json')
    if (moduleJson && (!moduleJson.id || !moduleJson.version)) {
      reasons.push(`${asset.name} META-INF/echo.mod.json must include id and version.`)
    }
  } catch (error) {
    reasons.push(`${asset.name} has invalid META-INF/echo.mod.json: ${error.message}`)
  }

  const checksumEntry = entryMap.get('checksums.sha256')
  if (checksumEntry) {
    const archiveChecksums = parseChecksums(readZipEntry(bytes, checksumEntry).toString('utf8'))
    for (const [name, expected] of archiveChecksums) {
      const entry = entryMap.get(name)
      if (!entry) {
        reasons.push(`${asset.name} checksums.sha256 references missing ${name}.`)
        continue
      }
      const actual = sha256(readZipEntry(bytes, entry))
      if (actual !== expected) reasons.push(`${asset.name} checksum mismatch for ${name}.`)
    }
  } else if (/\.echo-addon$/i.test(asset.name)) {
    warnings.push(`${asset.name} does not embed checksums.sha256.`)
  }

  return { reasons, warnings }
}

function safeId(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '')
}

function artifactFileName(asset) {
  return asset.name ?? asset.filename ?? asset.file
}

function artifactKindFromName(name) {
  if (/\.echo-addon$/i.test(name)) return 'native'
  if (/-neoforge\.jar$/i.test(name)) return 'neoforge'
  if (/-standalone\.jar$/i.test(name)) return 'standalone'
  if (/-sources\.jar$/i.test(name)) return 'sources'
  if (/\.ya?ml$/i.test(name)) return 'manifest'
  if (/\.json$/i.test(name)) return 'metadata'
  return 'asset'
}

function assetArtifactMap(assets, metadata, checksums) {
  const out = {}
  for (const asset of assets) {
    const name = artifactFileName(asset)
    if (!name || name === 'echo-release.json' || name === 'checksums.sha256' || name === 'checksums.txt') continue
    out[artifactKindFromName(name)] = {
      file: name,
      sha256: assetSha(asset, metadata, checksums) ?? null,
      url: asset.browser_download_url,
      size: asset.size ?? 0,
    }
  }
  return out
}

function artifactMapFromModule(moduleRecord, assets, metadata, checksums) {
  const out = {}
  for (const artifact of moduleRecord.artifacts ?? []) {
    const name = artifactFileName(artifact)
    if (!name) continue
    const asset = assets.find((item) => item.name === name)
    out[artifactKindFromName(name)] = {
      file: name,
      sha256: artifact.sha256 ?? assetSha(asset ?? { name }, metadata, checksums) ?? null,
      url: artifact.downloadUrl || asset?.browser_download_url || '',
      size: artifact.size ?? asset?.size ?? 0,
      buildMode: artifact.buildMode,
    }
  }
  return out
}

async function writeIndexEntries({ args, owner, repo, tag, release, metadata, assets, checksums, validation }) {
  if (!args.writeIndexEntry) return []
  const commitSha = metadata?.commitSha ?? (/^[a-f0-9]{7,40}$/i.test(release.target_commitish ?? '') ? release.target_commitish : '0000000')
  const common = {
    channel: args.channel ?? metadata?.channel ?? 'alpha',
    publisher: args.publisher ?? metadata?.publisher ?? owner.toLowerCase(),
    sourceRepo: `${owner}/${repo}`,
    releaseTag: tag,
    commitSha,
    dependencies: [],
    compatibility: metadata?.compatibility ?? [],
    trust: args.trust ?? metadata?.trust ?? (validation === 'approved' ? 'provenance-attested' : 'unverified'),
    validation,
  }
  const entries = []

  if (Array.isArray(metadata?.modules)) {
    for (const moduleRecord of metadata.modules) {
      entries.push({
        id: moduleRecord.moduleId,
        kind: 'module',
        version: moduleRecord.version,
        artifacts: artifactMapFromModule(moduleRecord, assets, metadata, checksums),
        dependencies: [
          ...(moduleRecord.requires ?? []).map((id) => ({ id, kind: 'module' })),
        ],
        compatibility: ['ashfall-native-edition', 'ashfall-neoforge-edition', 'ashfall-standalone-edition'],
        ...common,
      })
    }
  } else {
    entries.push({
      id: args.entryId ?? metadata?.id ?? safeId(repo),
      kind: args.entryKind ?? metadata?.kind ?? 'product',
      version: metadata?.version ?? release.tag_name ?? tag,
      artifacts: assetArtifactMap(assets, metadata, checksums),
      dependencies: metadata?.dependencies ?? [],
      ...common,
    })
  }

  const written = []
  for (const entry of entries) {
    const dir = entry.kind === 'modpack' ? 'modpacks'
      : entry.kind === 'module' ? 'modules'
        : entry.kind === 'addon' ? 'addons'
          : 'products'
    const filePath = path.join(root, dir, `${safeId(entry.id)}.json`)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
    written.push(path.relative(root, filePath).replace(/\\/g, '/'))
  }
  return written
}

async function loadBlocks() {
  const blocksDir = path.join(root, 'blocks')
  const blocked = new Set()
  try {
    for (const entry of await fs.readdir(blocksDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const payload = await readJson(path.join(blocksDir, entry.name))
      const rows = Array.isArray(payload) ? payload : [payload]
      for (const row of rows) {
        if (row.target) blocked.add(String(row.target))
      }
    }
  } catch {
    return blocked
  }
  return blocked
}

async function loadKnownIndexIds() {
  const ids = new Set()
  for (const dir of ['products', 'modpacks', 'modules', 'addons']) {
    const dirPath = path.join(root, dir)
    let files = []
    try {
      files = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const payload = await readJson(path.join(dirPath, entry.name))
      const rows = Array.isArray(payload) ? payload : [payload]
      for (const row of rows) {
        if (row?.$schema) continue
        if (row?.id) ids.add(String(row.id))
      }
    }
  }
  return ids
}

function plannedReleaseIds(args, metadata, repo) {
  if (Array.isArray(metadata?.modules)) {
    return metadata.modules.map((moduleRecord) => moduleRecord?.moduleId).filter(Boolean).map(String)
  }
  return [args.entryId ?? metadata?.id ?? safeId(repo)].filter(Boolean).map(String)
}

function dependencyIdsFromMetadata(metadata) {
  if (Array.isArray(metadata?.modules)) {
    return metadata.modules.flatMap((moduleRecord) => moduleRecord?.requires ?? []).filter(Boolean).map(String)
  }
  return (metadata?.dependencies ?? [])
    .map((dependency) => typeof dependency === 'string' ? dependency : dependency?.id)
    .filter(Boolean)
    .map(String)
}

function attestationTextIncludes(output, expected, label) {
  if (!expected) return []
  return output.includes(expected) ? [] : [`attestation does not reference ${label} ${expected}`]
}

function runGhAttestation(args) {
  const override = process.env.ECHO_INGEST_GH_EXECUTABLE
  return spawnSync(override || 'gh', args, {
    encoding: 'utf8',
    shell: Boolean(override && process.platform === 'win32'),
    windowsHide: true,
  })
}

function verifyAttestation(asset, localPath, owner, repo, tag, actualSha256, options = {}) {
  const reasons = []
  const releaseResult = runGhAttestation(['release', 'verify-asset', tag, localPath, '--repo', `${owner}/${repo}`, '--format', 'json'])
  if (releaseResult.status !== 0) {
    reasons.push(releaseResult.stderr || releaseResult.stdout || 'gh release verify-asset failed')
  } else {
    try {
      const payload = JSON.parse(releaseResult.stdout)
      const text = JSON.stringify(payload)
      reasons.push(...attestationTextIncludes(text, actualSha256, 'asset digest'))
    } catch (error) {
      reasons.push(`Unable to parse release asset attestation JSON: ${error.message}`)
    }
  }

  const attestArgs = [
    'attestation',
    'verify',
    localPath,
    '--repo',
    `${owner}/${repo}`,
    '--signer-repo',
    `${owner}/${repo}`,
    '--format',
    'json',
  ]
  if (options.attestationCommit) attestArgs.push('--source-digest', options.attestationCommit)
  if (options.attestationWorkflow) attestArgs.push('--signer-workflow', options.attestationWorkflow)

  const result = runGhAttestation(attestArgs)
  if (result.status !== 0) {
    reasons.push(result.stderr || result.stdout || 'gh attestation verify failed')
  } else {
    try {
      const payload = JSON.parse(result.stdout)
      const text = JSON.stringify(payload)
      reasons.push(...attestationTextIncludes(text, actualSha256, 'asset digest'))
      reasons.push(...attestationTextIncludes(text, options.attestationCommit, 'commit'))
      reasons.push(...attestationTextIncludes(text, options.attestationWorkflow, 'workflow'))
    } catch (error) {
      reasons.push(`Unable to parse attestation JSON: ${error.message}`)
    }
  }
  return {
    ok: reasons.length === 0,
    reasons,
    stdout: `${releaseResult.stdout}\n${result.stdout}`,
    stderr: `${releaseResult.stderr}\n${result.stderr}`,
  }
}

async function ingest(args) {
  let owner = args.owner
  let repo = args.repo
  let tag = args.tag
  let hmac = { ok: true }
  if (args.payload) {
    const raw = await fs.readFile(args.payload)
    hmac = verifyWebhookHmac(raw, args.secret, args.signature)
    if (!hmac.ok) return { validation: 'rejected', reasons: [hmac.error], warnings: [] }
    const payload = JSON.parse(raw.toString('utf8'))
    owner ??= payload.repository?.owner?.login
    repo ??= payload.repository?.name
    tag ??= payload.release?.tag_name
  }
  if (!owner || !repo || !tag) throw new Error('owner, repo, and tag are required.')

  const token = await installationAccessToken() || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const release = await fetchRelease(owner, repo, tag, token)
  const assets = await fetchReleaseAssets(release, token)
  const reasons = []
  const warnings = []
  const downloadedAssets = new Map()
  const attestationTempDir = args.requireAttestation
    ? await fs.mkdtemp(path.join(os.tmpdir(), 'echo-release-attestation-'))
    : null
  if (hmac.warning) warnings.push(hmac.warning)
  if (release.draft) reasons.push('Release is draft.')

  const metadataAsset = assets.find((asset) => asset.name === 'echo-release.json')
  let metadata = null
  if (metadataAsset?.browser_download_url) {
    metadata = JSON.parse(await fetchText(metadataAsset.browser_download_url, token))
  } else {
    reasons.push('Missing echo-release.json release metadata.')
  }

  const checksumsAsset = assets.find((asset) => asset.name === 'checksums.sha256' || asset.name === 'checksums.txt')
  const releaseChecksums = checksumsAsset?.browser_download_url
    ? parseChecksums(await fetchText(checksumsAsset.browser_download_url, token))
    : new Map()

  const blocks = await loadBlocks()
  for (const target of [repo, `${owner}/${repo}`, metadata?.id, metadata?.pack].filter(Boolean)) {
    if (blocks.has(String(target))) reasons.push(`Blocked target: ${target}`)
  }
  for (const asset of assets) {
    if (blocks.has(asset.name)) reasons.push(`Blocked asset: ${asset.name}`)
  }
  const knownIndexIds = await loadKnownIndexIds()
  for (const id of plannedReleaseIds(args, metadata, repo)) knownIndexIds.add(id)
  for (const dependencyId of dependencyIdsFromMetadata(metadata)) {
    if (blocks.has(dependencyId)) reasons.push(`Blocked dependency: ${dependencyId}`)
    if (!knownIndexIds.has(dependencyId)) reasons.push(`Unknown dependency: ${dependencyId}`)
  }

  try {
  for (const asset of assets) {
    const expectedSha = assetSha(asset, metadata, releaseChecksums)
    if (expectedSha && !sha256Pattern.test(expectedSha)) reasons.push(`${asset.name} has invalid SHA-256 metadata.`)
    if (!asset.browser_download_url) {
      reasons.push(`${asset.name} is missing browser_download_url.`)
      continue
    }
    if (/\.(zip|jar|echo-addon)$/i.test(asset.name) || expectedSha) {
      try {
        const bytes = await fetchBytes(asset.browser_download_url, token)
        const actualSha = sha256(bytes)
        downloadedAssets.set(asset.name, { sha256: actualSha })
        if (attestationTempDir && /\.(zip|jar|echo-addon|exe|appimage)$/i.test(asset.name)) {
          const localPath = path.join(attestationTempDir, path.basename(asset.name).replace(/[^A-Za-z0-9_.-]+/g, '-'))
          await fs.writeFile(localPath, bytes)
          downloadedAssets.set(asset.name, { sha256: actualSha, localPath })
        }
        if (expectedSha && actualSha !== String(expectedSha).toLowerCase()) {
          reasons.push(`${asset.name} SHA-256 mismatch: expected ${expectedSha}, got ${actualSha}.`)
        }
        const inspection = inspectArchive(asset, bytes)
        reasons.push(...inspection.reasons)
        warnings.push(...inspection.warnings)
      } catch (error) {
        reasons.push(`${asset.name} could not be downloaded or inspected: ${error.message}`)
      }
    }
  }

  for (const artifact of flattenArtifacts(metadata ?? [])) {
    if (artifact.sha256 && !sha256Pattern.test(String(artifact.sha256))) reasons.push(`${artifact.file ?? artifact.name ?? artifact.filename ?? 'artifact'} has invalid SHA-256.`)
    if (artifact.url && !String(artifact.url).startsWith('https://github.com/')) reasons.push(`${artifact.file ?? artifact.name ?? artifact.filename ?? 'artifact'} URL is not a GitHub HTTPS URL.`)
  }

  if (args.requireAttestation) {
    for (const asset of assets.filter((item) => /\.(zip|jar|echo-addon|exe|appimage)$/i.test(item.name))) {
      const downloaded = downloadedAssets.get(asset.name)
      if (!downloaded?.localPath || !downloaded.sha256) {
        reasons.push(`Attestation verification failed for ${asset.name}: asset was not downloaded for local verification.`)
        continue
      }
      const attestation = verifyAttestation(asset, downloaded.localPath, owner, repo, tag, downloaded.sha256, args)
      if (!attestation.ok) reasons.push(`Attestation verification failed for ${asset.name}: ${attestation.reasons.join('; ')}`.trim())
    }
  }

  const validation = reasons.length ? 'rejected' : 'approved'
  const writtenIndexEntries = await writeIndexEntries({
    args,
    owner,
    repo,
    tag,
    release,
    metadata,
    assets,
    checksums: releaseChecksums,
    validation,
  })

  return {
    validation,
    sourceRepo: `${owner}/${repo}`,
    releaseTag: tag,
    releaseUrl: release.html_url,
    assetCount: assets.length,
    assets: assets.map((asset) => ({
      name: asset.name,
      size: asset.size ?? 0,
      url: asset.browser_download_url,
      sha256: assetSha(asset, metadata, releaseChecksums) ?? null,
    })),
    writtenIndexEntries,
    reasons,
    warnings,
  }
  } finally {
    if (attestationTempDir) await fs.rm(attestationTempDir, { recursive: true, force: true })
  }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const result = await ingest(args)
  await fs.writeFile(path.resolve(root, args.out), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(`${result.validation}: wrote ${args.out}`)
  if (result.validation !== 'approved') process.exitCode = 1
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
