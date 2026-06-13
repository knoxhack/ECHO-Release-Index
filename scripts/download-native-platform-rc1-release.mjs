#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import zlib from 'node:zlib'

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    product: 'products/native-platform.json',
    out: 'release-readiness/native-platform-rc1-download-smoke.json',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--product') args.product = argv[++index]
    else if (arg === '--out') args.out = argv[++index]
    else if (arg === '--owner') args.owner = argv[++index]
    else if (arg === '--repo') args.repo = argv[++index]
    else if (arg === '--tag') args.tag = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN

function githubHeaders(extra = {}) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ECHO-Native-Platform-RC1-Download-Smoke',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function githubJson(route) {
  const response = await fetch(`https://api.github.com${route}`, { headers: githubHeaders() })
  if (!response.ok) throw new Error(`GitHub ${route} failed ${response.status}: ${await response.text()}`)
  return response.json()
}

async function listReleaseAssets(release) {
  const assets = []
  for (let page = 1; page <= 20; page += 1) {
    const separator = release.assets_url.includes('?') ? '&' : '?'
    const response = await fetch(`${release.assets_url}${separator}per_page=100&page=${page}`, { headers: githubHeaders() })
    if (!response.ok) throw new Error(`GitHub assets failed ${response.status}: ${await response.text()}`)
    const pageAssets = await response.json()
    if (!Array.isArray(pageAssets)) break
    assets.push(...pageAssets)
    if (pageAssets.length < 100) break
  }
  return assets
}

async function downloadBytes(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream, application/zip, application/json, text/plain, */*',
      'User-Agent': 'ECHO-Native-Platform-RC1-Download-Smoke',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function parseChecksums(text) {
  const checksums = new Map()
  for (const line of String(text ?? '').split(/\r?\n/u)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+(.+)$/iu)
    if (match) checksums.set(match[2].trim(), match[1].toLowerCase())
  }
  return checksums
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
  if (entry.method === 8) return zlib.inflateRawSync(compressed)
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}.`)
}

function requireCondition(errors, condition, message) {
  if (!condition) errors.push(message)
}

function expectedAssetRecords(product) {
  const records = new Map()
  for (const artifact of Object.values(product.artifacts ?? {})) {
    if (artifact?.file) records.set(artifact.file, artifact)
  }
  for (const required of ['checksums.txt', 'echo-release.json']) {
    if (!records.has(required)) records.set(required, { file: required })
  }
  return records
}

function inspectProductZip(errors, bytes) {
  const entries = readZipEntries(bytes)
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  const requireEntry = (name) => requireCondition(errors, byName.has(name), `product ZIP is missing ${name}`)
  requireEntry('echo-native-product-package.json')
  requireEntry('echo.pack.json')

  const productPackage = JSON.parse(readZipEntry(bytes, byName.get('echo-native-product-package.json')).toString('utf8'))
  const packProfile = JSON.parse(readZipEntry(bytes, byName.get('echo.pack.json')).toString('utf8'))
  requireCondition(errors, productPackage.schema === 'echo.native.product_package.v1', 'product package schema mismatch')
  requireCondition(errors, productPackage.releaseClasspath === 'explicit-packaged-artifacts', 'product package must use explicit packaged artifacts')
  requireCondition(errors, productPackage.packagedModules === productPackage.totalModules, 'packaged module count must equal total module count')
  requireCondition(errors, packProfile.loader?.kind === 'echo_native', 'echo.pack.json loader.kind must be echo_native')

  const descriptorModules = new Set()
  const jarModules = new Set()
  for (const entry of entries) {
    const descriptorMatch = entry.name.match(/^modules\/([^/]+)\/META-INF\/echo\.mod\.json$/u)
    if (descriptorMatch) descriptorModules.add(descriptorMatch[1])
    const jarMatch = entry.name.match(/^modules\/([^/]+)\/lib\/[^/]+\.jar$/u)
    if (jarMatch) jarModules.add(jarMatch[1])
  }
  requireCondition(errors, descriptorModules.size === productPackage.packagedModules, `descriptor module count ${descriptorModules.size} must equal packagedModules ${productPackage.packagedModules}`)
  requireCondition(errors, jarModules.size === productPackage.packagedModules, `runtime jar module count ${jarModules.size} must equal packagedModules ${productPackage.packagedModules}`)
  for (const moduleId of descriptorModules) {
    requireCondition(errors, jarModules.has(moduleId), `${moduleId} has descriptor but no runtime jar`)
  }

  return {
    entryCount: entries.length,
    packId: productPackage.packId,
    releaseClasspath: productPackage.releaseClasspath,
    packagedModules: productPackage.packagedModules,
    totalModules: productPackage.totalModules,
    descriptorModuleCount: descriptorModules.size,
    runtimeJarModuleCount: jarModules.size,
    requiredModules: packProfile.requiredModules ?? [],
  }
}

async function main() {
  const productPath = path.resolve(args.root, args.product)
  const product = await readJson(productPath)
  const [ownerFromProduct, repoFromProduct] = String(product.sourceRepo).split('/')
  const owner = args.owner ?? ownerFromProduct
  const repo = args.repo ?? repoFromProduct
  const tag = args.tag ?? product.releaseTag
  const release = await githubJson(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
  const assets = await listReleaseAssets(release)
  const assetsByName = new Map(assets.map((asset) => [asset.name, asset]))
  const expected = expectedAssetRecords(product)
  const errors = []
  const downloaded = new Map()
  const verifiedAssets = []

  requireCondition(errors, release.draft === false, 'RC1 release must not be draft for download-back evidence')
  requireCondition(errors, release.prerelease === true, 'RC1 release must remain marked prerelease')
  requireCondition(errors, release.target_commitish === product.commitSha, `release target ${release.target_commitish} must match product commit ${product.commitSha}`)

  for (const [name, expectedRecord] of expected) {
    const asset = assetsByName.get(name)
    requireCondition(errors, asset, `release is missing asset ${name}`)
    if (!asset) continue
    const bytes = await downloadBytes(asset.browser_download_url)
    const actualSha256 = sha256(bytes)
    downloaded.set(name, bytes)
    if (expectedRecord.sha256) requireCondition(errors, actualSha256 === expectedRecord.sha256.toLowerCase(), `${name} SHA-256 mismatch`)
    if (expectedRecord.size) requireCondition(errors, bytes.length === Number(expectedRecord.size), `${name} downloaded size mismatch`)
    requireCondition(errors, asset.size === bytes.length, `${name} GitHub asset size does not match downloaded byte length`)
    verifiedAssets.push({
      name,
      url: asset.browser_download_url,
      githubAssetId: asset.id,
      size: bytes.length,
      sha256: actualSha256,
    })
  }

  const checksumsText = downloaded.get('checksums.txt')?.toString('utf8') ?? ''
  const checksums = parseChecksums(checksumsText)
  for (const [name, expectedSha] of checksums) {
    const bytes = downloaded.get(name)
    requireCondition(errors, bytes, `checksums.txt lists ${name}, but it was not downloaded`)
    if (bytes) requireCondition(errors, sha256(bytes) === expectedSha, `checksums.txt hash mismatch for ${name}`)
  }

  const releaseMetadata = JSON.parse(downloaded.get('echo-release.json').toString('utf8'))
  requireCondition(errors, releaseMetadata.schemaVersion === 'echo.release.index.entry.v1', 'echo-release.json schemaVersion mismatch')
  requireCondition(errors, releaseMetadata.id === product.id, 'echo-release.json id mismatch')
  requireCondition(errors, releaseMetadata.version === product.version, 'echo-release.json version mismatch')
  requireCondition(errors, releaseMetadata.commitSha === product.commitSha, 'echo-release.json commitSha mismatch')
  requireCondition(errors, releaseMetadata.validation === 'warning', 'echo-release.json must keep RC1 warning-gated')

  const archiveLayout = inspectProductZip(errors, downloaded.get(product.artifacts.archive.file))
  const result = {
    schemaVersion: 'echo.native-platform.rc1-download-smoke.v1',
    status: errors.length === 0 ? 'passed' : 'failed',
    generatedAt: new Date().toISOString(),
    sourceRepo: `${owner}/${repo}`,
    releaseTag: tag,
    releaseUrl: release.html_url,
    release: {
      draft: release.draft,
      prerelease: release.prerelease,
      targetCommitish: release.target_commitish,
      publishedAt: release.published_at,
    },
    verifiedAssetCount: verifiedAssets.length,
    verifiedAssets,
    verifiedChecksumEntries: [...checksums.keys()].sort(),
    archiveLayout,
    remainingHardGates: [
      'signing-or-github-attestation',
      'launcher-install-first-launch-diagnostics-repair-rollback',
      'real-native-pack-gameplay-smoke',
      'stable-catalog-trust-without-warning-blocked-alpha-source-linked',
    ],
    errors,
  }

  const outPath = path.resolve(args.root, args.out)
  await writeJson(outPath, result)
  console.log(`${result.status}: wrote ${path.relative(args.root, outPath).replace(/\\/g, '/')}`)
  if (errors.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
