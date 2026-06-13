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

function remainingHardGates(product) {
  const gates = []
  const attested = product.provenance?.attestation?.status === 'github-attested'
    && product.trust === 'provenance-attested'
  if (!attested) gates.push('signing-or-github-attestation')
  gates.push(
    'launcher-install-first-launch-diagnostics-repair-rollback',
    'real-native-pack-gameplay-smoke',
  )
  gates.push(attested
    ? 'stable-catalog-metadata-without-warning-blocked-alpha'
    : 'stable-catalog-trust-without-warning-blocked-alpha-source-linked')
  return gates
}

function inspectPlatformZip(errors, bytes) {
  const entries = readZipEntries(bytes)
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  const requireEntry = (name) => requireCondition(errors, byName.has(name), `platform ZIP is missing ${name}`)
  requireEntry('echo-native-platform-package.json')
  requireEntry('runtime/native-loader-runtime.json')

  const forbiddenEntries = []
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/gu, '/').toLowerCase()
    if (
      normalized === 'echo.pack.json'
      || normalized.endsWith('/echo.pack.json')
      || normalized === 'echo-native-product-package.json'
      || normalized.endsWith('/echo-native-product-package.json')
      || normalized.startsWith('modules/')
      || normalized.includes('/modules/')
      || normalized.endsWith('.jar')
      || normalized.includes('ashfall')
    ) {
      forbiddenEntries.push(entry.name)
    }
  }
  requireCondition(errors, forbiddenEntries.length === 0, `platform ZIP contains forbidden pack/product entries: ${forbiddenEntries.join(', ')}`)

  const platformPackage = byName.has('echo-native-platform-package.json')
    ? JSON.parse(readZipEntry(bytes, byName.get('echo-native-platform-package.json')).toString('utf8'))
    : {}
  const runtimeManifest = byName.has('runtime/native-loader-runtime.json')
    ? JSON.parse(readZipEntry(bytes, byName.get('runtime/native-loader-runtime.json')).toString('utf8'))
    : {}
  requireCondition(errors, platformPackage.schemaVersion === 'echo.native.platform_package.v1', 'platform package schema mismatch')
  requireCondition(errors, platformPackage.kind === 'loader_runtime', 'platform package kind must be loader_runtime')
  requireCondition(errors, platformPackage.containsModpack === false, 'platform package must declare containsModpack=false')
  requireCondition(errors, platformPackage.containsPackProfile === false, 'platform package must declare containsPackProfile=false')
  requireCondition(errors, platformPackage.containsProductModules === false, 'platform package must declare containsProductModules=false')
  requireCondition(errors, platformPackage.moduleCount === 0, 'platform package moduleCount must be zero')
  requireCondition(errors, platformPackage.moduleDirectoryIncluded === false, 'platform package must declare moduleDirectoryIncluded=false')
  requireCondition(errors, Array.isArray(platformPackage.packagedPackFiles) && platformPackage.packagedPackFiles.length === 0, 'platform package packagedPackFiles must be empty')
  requireCondition(errors, runtimeManifest.schemaVersion === 'echo.native.loader_runtime.v1', 'runtime manifest schema mismatch')
  requireCondition(errors, runtimeManifest.zeroModuleStartup === true, 'runtime manifest must declare zeroModuleStartup=true')
  requireCondition(errors, runtimeManifest.requiresPackProfile === false, 'runtime manifest must declare requiresPackProfile=false')

  return {
    entryCount: entries.length,
    packageId: platformPackage.id,
    packageKind: platformPackage.kind,
    containsModpack: platformPackage.containsModpack,
    containsPackProfile: platformPackage.containsPackProfile,
    containsProductModules: platformPackage.containsProductModules,
    moduleCount: platformPackage.moduleCount,
    runtimeId: runtimeManifest.runtimeId,
    zeroModuleStartup: runtimeManifest.zeroModuleStartup,
    requiresPackProfile: runtimeManifest.requiresPackProfile,
    builtInTheme: runtimeManifest.builtInTheme,
    entries: entries.map((entry) => entry.name).sort(),
  }
}

function inspectNativeLoaderJar(errors, bytes) {
  const entries = readZipEntries(bytes)
  const names = new Set(entries.map((entry) => entry.name))
  const requiredEntries = [
    'com/echo/NativeLoaderClient.class',
    'dev/echo/nativeplatform/loader/NativeLoaderCoreServiceRegistrar.class',
  ]
  for (const entry of requiredEntries) {
    requireCondition(errors, names.has(entry), `Native Loader direct jar is missing ${entry}`)
  }
  const forbiddenEntries = []
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/gu, '/').toLowerCase()
    if (
      normalized === 'echo.pack.json'
      || normalized.endsWith('/echo.pack.json')
      || normalized === 'meta-inf/echo.mod.json'
      || normalized.endsWith('/meta-inf/echo.mod.json')
      || normalized.startsWith('modules/')
      || normalized.includes('/modules/')
    ) {
      forbiddenEntries.push(entry.name)
    }
  }
  requireCondition(errors, forbiddenEntries.length === 0, `Native Loader direct jar contains forbidden pack/module entries: ${forbiddenEntries.join(', ')}`)
  return {
    entryCount: entries.length,
    requiredEntries,
    forbiddenEntries,
  }
}

function inspectDirectInstallDescriptor(errors, bytes, product) {
  const descriptor = JSON.parse(bytes.toString('utf8'))
  const loaderArtifact = product.artifacts?.nativeLoaderLibrary ?? {}
  requireCondition(errors, descriptor.schemaVersion === 'echo.native.loader_direct_install.v1', 'native-loader-direct-install.json schemaVersion mismatch')
  requireCondition(errors, descriptor.artifactRole === 'native-loader-library', 'native-loader-direct-install.json artifactRole must be native-loader-library')
  requireCondition(errors, descriptor.file === 'echo-native-loader-1.0.0.jar', 'native-loader-direct-install.json file mismatch')
  requireCondition(errors, descriptor.url === loaderArtifact.url, 'native-loader-direct-install.json url must match nativeLoaderLibrary.url')
  requireCondition(errors, descriptor.sha256 === loaderArtifact.sha256, 'native-loader-direct-install.json sha256 must match nativeLoaderLibrary.sha256')
  requireCondition(errors, descriptor.size === loaderArtifact.size, 'native-loader-direct-install.json size must match nativeLoaderLibrary.size')
  requireCondition(errors, descriptor.manualInstall === true, 'native-loader-direct-install.json manualInstall must be true')
  requireCondition(errors, descriptor.developerDirectDownload === true, 'native-loader-direct-install.json developerDirectDownload must be true')
  requireCondition(errors, descriptor.launcherFacing === false, 'native-loader-direct-install.json launcherFacing must be false')
  requireCondition(errors, descriptor.moduleArtifact === false, 'native-loader-direct-install.json moduleArtifact must be false')
  requireCondition(errors, descriptor.packContent === false, 'native-loader-direct-install.json packContent must be false')
  requireCondition(errors, descriptor.expectedJava?.minimumMajorVersion === 25, 'native-loader-direct-install.json expectedJava.minimumMajorVersion must be 25')
  requireCondition(errors, descriptor.expectedJava?.testedMajorVersion === 25, 'native-loader-direct-install.json expectedJava.testedMajorVersion must be 25')
  requireCondition(errors, descriptor.minecraftLibrary?.name === 'com.echo:native-loader:1.0.0', 'native-loader-direct-install.json minecraftLibrary.name mismatch')
  requireCondition(errors, descriptor.minecraftLibrary?.path === 'com/echo/native-loader/1.0.0/native-loader-1.0.0.jar', 'native-loader-direct-install.json minecraftLibrary.path mismatch')
  requireCondition(errors, descriptor.mainClass === 'com.echo.NativeLoaderClient', 'native-loader-direct-install.json mainClass mismatch')
  return {
    schemaVersion: descriptor.schemaVersion,
    artifactRole: descriptor.artifactRole,
    file: descriptor.file,
    sha256: descriptor.sha256,
    size: descriptor.size,
    manualInstall: descriptor.manualInstall,
    developerDirectDownload: descriptor.developerDirectDownload,
    moduleArtifact: descriptor.moduleArtifact,
    packContent: descriptor.packContent,
    minimumJava: descriptor.expectedJava?.minimumMajorVersion,
    minecraftLibraryPath: descriptor.minecraftLibrary?.path,
    mainClass: descriptor.mainClass,
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

  const archiveLayout = inspectPlatformZip(errors, downloaded.get(product.artifacts.archive.file))
  const nativeLoaderJar = inspectNativeLoaderJar(errors, downloaded.get(product.artifacts.nativeLoaderLibrary.file))
  const directInstallDescriptor = inspectDirectInstallDescriptor(
    errors,
    downloaded.get(product.artifacts.nativeLoaderDirectInstall.file),
    product,
  )
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
    nativeLoaderJar,
    directInstallDescriptor,
    remainingHardGates: remainingHardGates(product),
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
