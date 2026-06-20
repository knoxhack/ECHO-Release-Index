#!/usr/bin/env node
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { inflateRawSync } from 'node:zlib'

const PACK_ID = 'ashfall-standalone-engine-edition'
const RUNTIME_ID = 'echo-standalone-engine'
const EXPECTED_VERSION = '2.0.0-beta.2'

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    out: path.resolve(process.cwd(), 'release-readiness', 'ashfall-standalone-engine-public-assets.json'),
    cacheRoot: path.resolve(process.cwd(), 'tmp', 'ashfall-standalone-engine-public-assets'),
    clean: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--cache-root') args.cacheRoot = path.resolve(next())
    else if (arg === '--clean') args.clean = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function assertGitHubUrl(url, label) {
  assert(/^https:\/\/github\.com\/knoxhack\//u.test(String(url ?? '')), `${label} must use a public GitHub URL, got ${url ?? '(missing)'}.`)
}

function artifactRows(entry, prefix) {
  return Object.entries(entry.artifacts ?? {}).map(([role, artifact]) => ({
    key: `${prefix}:${role}`,
    role,
    file: artifact.file,
    url: artifact.url,
    sha256: artifact.sha256,
    size: artifact.size,
  }))
}

function packAssetRows(packEntry) {
  return (packEntry.assets ?? []).map((asset) => ({
    key: `pack-descriptor:${asset.name}`,
    role: 'packDescriptorAsset',
    file: asset.name,
    url: asset.browserDownloadUrl,
    sha256: asset.sha256,
    size: asset.size,
  }))
}

async function downloadArtifact(args, row) {
  assert(row.file, `${row.key} is missing file.`)
  assert(row.url, `${row.key} is missing URL.`)
  assert(/^[a-f0-9]{64}$/iu.test(String(row.sha256 ?? '')), `${row.key} has invalid sha256.`)
  assert(Number.isFinite(Number(row.size)) && Number(row.size) > 0, `${row.key} has invalid size.`)
  assertGitHubUrl(row.url, row.key)

  const target = path.join(args.cacheRoot, row.file)
  let bytes = null
  let reused = false
  if (await exists(target)) {
    const cached = await fs.readFile(target)
    if (sha256Bytes(cached) === String(row.sha256).toLowerCase() && cached.length === Number(row.size)) {
      bytes = cached
      reused = true
    }
  }
  if (!bytes) {
    const response = await fetch(row.url, { headers: { 'user-agent': 'echo-release-index-public-asset-verifier' } })
    if (!response.ok) throw new Error(`${row.key} returned HTTP ${response.status}: ${row.url}`)
    bytes = Buffer.from(await response.arrayBuffer())
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, bytes)
  }

  const actualSha256 = sha256Bytes(bytes)
  assert(actualSha256 === String(row.sha256).toLowerCase(), `${row.key} SHA-256 mismatch: ${actualSha256} != ${row.sha256}.`)
  assert(bytes.length === Number(row.size), `${row.key} size mismatch: ${bytes.length} != ${row.size}.`)
  return { ...row, cachePath: target, sha256: actualSha256, size: bytes.length, reused }
}

function parseChecksums(text) {
  const rows = new Map()
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([a-f0-9]{64})\s+\*?(.+)$/iu)
    if (!match) throw new Error(`Invalid checksum row: ${line}`)
    rows.set(match[2].trim().replace(/\\/g, '/'), match[1].toLowerCase())
  }
  return rows
}

function normalizedPath(value) {
  return String(value ?? '').replace(/\\/g, '/')
}

function readZipEntries(zipBytes) {
  const minEocdSize = 22
  const maxCommentSize = 0xffff
  const start = Math.max(0, zipBytes.length - minEocdSize - maxCommentSize)
  let eocd = -1
  for (let offset = zipBytes.length - minEocdSize; offset >= start; offset -= 1) {
    if (zipBytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  assert(eocd >= 0, 'Pack ZIP does not contain an end-of-central-directory record.')
  const entryCount = zipBytes.readUInt16LE(eocd + 10)
  let cursor = zipBytes.readUInt32LE(eocd + 16)
  const entries = new Map()
  for (let index = 0; index < entryCount; index += 1) {
    assert(zipBytes.readUInt32LE(cursor) === 0x02014b50, `Invalid central directory header at ${cursor}.`)
    const method = zipBytes.readUInt16LE(cursor + 10)
    const compressedSize = zipBytes.readUInt32LE(cursor + 20)
    const uncompressedSize = zipBytes.readUInt32LE(cursor + 24)
    const nameLength = zipBytes.readUInt16LE(cursor + 28)
    const extraLength = zipBytes.readUInt16LE(cursor + 30)
    const commentLength = zipBytes.readUInt16LE(cursor + 32)
    const localOffset = zipBytes.readUInt32LE(cursor + 42)
    const name = normalizedPath(zipBytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'))
    entries.set(name, {
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      directory: name.endsWith('/'),
    })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return { bytes: zipBytes, entries }
}

function zipEntryData(zip, name) {
  const entry = zip.entries.get(normalizedPath(name))
  assert(entry && !entry.directory, `Pack ZIP missing ${name}.`)
  const cursor = entry.localOffset
  assert(zip.bytes.readUInt32LE(cursor) === 0x04034b50, `Invalid local file header for ${name}.`)
  const nameLength = zip.bytes.readUInt16LE(cursor + 26)
  const extraLength = zip.bytes.readUInt16LE(cursor + 28)
  const dataStart = cursor + 30 + nameLength + extraLength
  const compressed = zip.bytes.subarray(dataStart, dataStart + entry.compressedSize)
  let data
  if (entry.method === 0) data = Buffer.from(compressed)
  else if (entry.method === 8) data = Buffer.from(inflateRawSync(compressed))
  else throw new Error(`${name} uses unsupported ZIP compression method ${entry.method}.`)
  assert(data.length === entry.uncompressedSize, `${name} uncompressed size mismatch in ZIP.`)
  return data
}

function detectZipRoot(zip, manifest) {
  const firstPath = normalizedPath(manifest.files?.[0]?.path)
  assert(firstPath, 'Pack manifest has no files.')
  if (zip.entries.has(firstPath)) return ''
  const suffix = `/${firstPath}`
  const entry = [...zip.entries.values()].find((item) => !item.directory && item.name.endsWith(suffix))
  assert(entry, `Could not locate ${firstPath} in pack ZIP.`)
  return entry.name.slice(0, -suffix.length)
}

function entryBytes(zip, root, filePath) {
  const entryName = root ? `${root}/${normalizedPath(filePath)}` : normalizedPath(filePath)
  return zipEntryData(zip, entryName)
}

function validatePackZip(zipPath, manifest) {
  const zip = readZipEntries(readFileSync(zipPath))
  const root = detectZipRoot(zip, manifest)
  const verified = []
  for (const file of manifest.files ?? []) {
    const bytes = entryBytes(zip, root, file.path)
    const actualSha256 = sha256Bytes(bytes)
    assert(actualSha256 === String(file.sha256).toLowerCase(), `${file.path} SHA-256 mismatch in pack ZIP.`)
    assert(bytes.length === Number(file.size), `${file.path} size mismatch in pack ZIP.`)
    verified.push(file.path)
  }
  const evidence = JSON.parse(entryBytes(zip, root, 'content-graph-evidence.json').toString('utf8'))
  assert(evidence.status === 'PASS', `content-graph-evidence.json status is ${evidence.status ?? '(missing)'}, expected PASS.`)
  return { root, verifiedFiles: verified.length, contentGraphStatus: evidence.status }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.clean) await fs.rm(args.cacheRoot, { recursive: true, force: true })

  const product = await readJson(path.join(args.root, 'products', 'standalone-engine.json'))
  const modpack = await readJson(path.join(args.root, 'modpacks', 'ashfall-standalone-engine.json'))
  const pack = await readJson(path.join(args.root, 'packs', 'ashfall-standalone-engine-edition.json'))
  assert(product.id === RUNTIME_ID, `Runtime product id is ${product.id}, expected ${RUNTIME_ID}.`)
  assert(modpack.id === PACK_ID, `Modpack id is ${modpack.id}, expected ${PACK_ID}.`)
  assert(pack.id === PACK_ID, `Pack descriptor id is ${pack.id}, expected ${PACK_ID}.`)
  assert(product.version === EXPECTED_VERSION && modpack.version === EXPECTED_VERSION && pack.version === EXPECTED_VERSION, 'Engine version metadata is not consistent.')
  assert(product.validation === 'warning' && modpack.validation === 'warning' && pack.validation === 'warning', 'Engine lane must remain warning-gated.')

  const rows = [
    ...artifactRows(product, 'runtime-product'),
    ...artifactRows(modpack, 'modpack'),
    ...packAssetRows(pack),
  ]
  const uniqueRows = [...new Map(rows.map((row) => [`${row.url}|${row.sha256}`, row])).values()]
  const downloads = []
  for (const row of uniqueRows) downloads.push(await downloadArtifact(args, row))

  const byFile = new Map(downloads.map((row) => [row.file, row]))
  const manifestDownload = byFile.get(modpack.artifacts.manifest.file)
  const packDownload = byFile.get(modpack.artifacts.pack.file)
  const checksumsDownload = byFile.get(modpack.artifacts.checksums.file)
  const releaseDownload = byFile.get(modpack.artifacts.releaseManifest.file)
  const auditDownload = byFile.get(modpack.artifacts.releaseAudit.file)
  assert(manifestDownload && packDownload && checksumsDownload && releaseDownload && auditDownload, 'Missing required Engine Edition public assets in download set.')

  const manifest = await readJson(manifestDownload.cachePath)
  assert((manifest.pack ?? manifest.id) === PACK_ID, `Public pack manifest id is ${manifest.pack ?? manifest.id}, expected ${PACK_ID}.`)
  assert(manifest.loader === RUNTIME_ID, `Public pack manifest loader is ${manifest.loader}, expected ${RUNTIME_ID}.`)
  assert(manifest.runtime?.requiredJava === '21+', `Public pack manifest runtime.requiredJava is ${manifest.runtime?.requiredJava}, expected 21+.`)
  assert(manifest.artifactMode === 'zip', `Public pack manifest artifactMode is ${manifest.artifactMode}, expected zip.`)
  assert(manifest.artifactName === packDownload.file, 'Public pack manifest artifactName does not match public ZIP asset.')
  assert(String(manifest.artifactSha256).toLowerCase() === packDownload.sha256, 'Public pack manifest artifactSha256 does not match public ZIP asset.')
  assert(Number(manifest.artifactSize) === packDownload.size, 'Public pack manifest artifactSize does not match public ZIP asset.')
  assert(Array.isArray(manifest.moduleRequirements) && manifest.moduleRequirements.length === 18, 'Public pack manifest must keep the 18-module engine verification slice.')

  const checksums = parseChecksums(await fs.readFile(checksumsDownload.cachePath, 'utf8'))
  for (const name of [packDownload.file, manifestDownload.file, releaseDownload.file, auditDownload.file]) {
    const expected = checksums.get(name)
    assert(expected === byFile.get(name)?.sha256, `checksums.txt does not match public ${name}.`)
  }

  const release = await readJson(releaseDownload.cachePath)
  const audit = await readJson(auditDownload.cachePath)
  assert(release.validation === 'warning' || release.warningGated === true, 'Public echo-release.json must be warning-gated.')
  assert(release.engine?.artifact?.file === product.artifacts.engineJar.file, 'Public echo-release.json does not identify the engine artifact.')
  assert(Array.isArray(release.moduleFiles) && release.moduleFiles.length === 18, 'Public echo-release.json must identify 18 module files.')
  assert((audit.checks ?? []).some((check) => check.id === 'gameplay-parity' && check.status === 'NOT_CLAIMED'), 'Public release-audit.json must not claim gameplay parity.')

  const zip = validatePackZip(packDownload.cachePath, manifest)
  const report = {
    schemaVersion: 'echo.ashfall-standalone-engine-public-assets.v1',
    generatedAt: new Date().toISOString(),
    packId: PACK_ID,
    runtimeId: RUNTIME_ID,
    version: EXPECTED_VERSION,
    validation: 'warning',
    downloadedArtifacts: downloads.map(({ key, role, file, url, sha256, size, reused }) => ({ key, role, file, url, sha256, size, reused })),
    manifest: {
      file: manifestDownload.file,
      moduleRequirements: manifest.moduleRequirements.length,
      files: manifest.files.length,
      loader: manifest.loader,
      requiredJava: manifest.runtime.requiredJava,
      artifactName: manifest.artifactName,
      artifactSha256: manifest.artifactSha256,
      artifactSize: manifest.artifactSize,
    },
    zip,
    checksums: {
      rows: [...checksums.keys()].sort(),
    },
    release: {
      warningGated: release.warningGated === true,
      validation: release.validation,
      engineArtifact: release.engine?.artifact?.file,
      moduleFiles: release.moduleFiles?.length ?? 0,
    },
    audit: {
      status: audit.status,
      validation: audit.validation,
      gameplayParity: (audit.checks ?? []).find((check) => check.id === 'gameplay-parity')?.status,
    },
  }
  await writeJson(args.out, report)
  console.log(`Ashfall Standalone Engine public asset verification PASS: ${args.out}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
