#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import zlib from 'node:zlib'

const DEFAULT_NATIVE_STAGE = 'tmp/public-alpha-assets/ECHO-Ashfall-Native-Edition'
const DEFAULT_MODULE_STAGE = 'tmp/public-alpha-assets/ECHO-Modules'
const DEFAULT_OUT = 'release-readiness/ashfall-rc-smoke.json'
const DEFAULT_DRAFT_DOWNLOAD_EVIDENCE = 'release-readiness/ashfall-draft-download.json'
const REQUIRED_NATIVE_ASSETS = [
  'checksums.txt',
  'echo-release.json',
  'ashfall-native-edition-alpha-0.1.0.pack.json',
  'ashfall-native-edition-0.1.0.zip',
]
const REQUIRED_MODULES = [
  'echocore',
  'echoplatformcore',
  'echoadaptercore',
  'echonetcore',
  'echoruntimeguard',
  'echolens',
  'echopresencelink',
  'echoterminal',
  'echoblockworks',
  'echoashfallprotocol',
]
const PLACEHOLDER_PATTERN = /echo-native-product|existing-layout|placeholder/iu
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu

function usage() {
  return `Usage: node scripts/generate-ashfall-rc-smoke.mjs [options]

Verifies locally staged Ashfall Native release-candidate assets, performs a
launcher-style install/repair/rollback smoke against the staged ZIP, and writes
release-readiness/ashfall-rc-smoke.json.

Options:
  --root <dir>                  Release Index repository root. Default: current directory.
  --native-stage <dir>          Staged Ashfall Native asset directory. Default: ${DEFAULT_NATIVE_STAGE}.
  --module-stage <dir>          Staged ECHO Modules asset directory. Default: ${DEFAULT_MODULE_STAGE}.
  --out <path>                  Smoke evidence JSON path. Default: ${DEFAULT_OUT}.
  --draft-download-evidence <path>
                                Evidence from download-ashfall-draft-release.mjs.
                                Default when supplied without a path elsewhere: ${DEFAULT_DRAFT_DOWNLOAD_EVIDENCE}.
  --draft-release-downloaded    Deprecated; requires --draft-download-evidence and no longer asserts proof by itself.
  --promoted-after-green        Mark the release as promoted after all gates were green.
  --keep-temp                   Keep the temporary install root for inspection.
  --help                        Print this help text.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    nativeStage: DEFAULT_NATIVE_STAGE,
    moduleStage: DEFAULT_MODULE_STAGE,
    out: DEFAULT_OUT,
    requestedDraftReleaseDownloaded: false,
    draftDownloadEvidence: null,
    promotedAfterGreen: false,
    keepTemp: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = argv[++index]
    else if (arg === '--native-stage') args.nativeStage = argv[++index]
    else if (arg === '--module-stage') args.moduleStage = argv[++index]
    else if (arg === '--out') args.out = argv[++index]
    else if (arg === '--draft-download-evidence') {
      const value = argv[index + 1]
      if (value && !value.startsWith('--')) {
        args.draftDownloadEvidence = value
        index += 1
      } else {
        args.draftDownloadEvidence = DEFAULT_DRAFT_DOWNLOAD_EVIDENCE
      }
    }
    else if (arg === '--draft-release-downloaded') args.requestedDraftReleaseDownloaded = true
    else if (arg === '--promoted-after-green') args.promotedAfterGreen = true
    else if (arg === '--keep-temp') args.keepTemp = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  args.root = path.resolve(args.root)
  args.nativeStage = path.isAbsolute(args.nativeStage) ? args.nativeStage : path.join(args.root, args.nativeStage)
  args.moduleStage = path.isAbsolute(args.moduleStage) ? args.moduleStage : path.join(args.root, args.moduleStage)
  args.out = path.isAbsolute(args.out) ? args.out : path.join(args.root, args.out)
  if (args.draftDownloadEvidence) {
    args.draftDownloadEvidence = path.isAbsolute(args.draftDownloadEvidence)
      ? args.draftDownloadEvidence
      : path.join(args.root, args.draftDownloadEvidence)
  }
  return args
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath))
}

async function fileSize(filePath) {
  return (await fs.stat(filePath)).size
}

function rel(root, filePath) {
  const relative = path.relative(root, filePath).replace(/\\/g, '/')
  return relative && !relative.startsWith('../') && relative !== '..' ? relative : filePath.replace(/\\/g, '/')
}

function parseChecksums(text) {
  const checksums = new Map()
  for (const line of String(text ?? '').split(/\r?\n/u)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/iu)
    if (match) checksums.set(match[2].trim().replace(/\\/g, '/'), match[1].toLowerCase())
  }
  return checksums
}

function normalizeArchivePath(value) {
  const raw = String(value ?? '').replace(/\\/g, '/').replace(/^\/+/u, '')
  if (!raw || raw.includes('\0')) throw new Error(`Unsafe empty archive path: ${value}`)
  const parts = raw.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe archive path: ${value}`)
  }
  return parts.join('/')
}

function safeJoin(root, relativePath) {
  const safeRelative = normalizeArchivePath(relativePath)
  const target = path.resolve(root, ...safeRelative.split('/'))
  const resolvedRoot = path.resolve(root)
  const back = path.relative(resolvedRoot, target)
  if (back === '' || back.startsWith('..') || path.isAbsolute(back)) {
    throw new Error(`Refusing to write outside install root: ${relativePath}`)
  }
  return target
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
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replace(/\\/g, '/')
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
  if (entry.method === 0) return Buffer.from(compressed)
  if (entry.method === 8) return zlib.inflateRawSync(compressed)
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}.`)
}

function requireTrue(condition, message) {
  if (!condition) throw new Error(message)
}

async function requireFile(filePath, label) {
  try {
    const stat = await fs.stat(filePath)
    requireTrue(stat.isFile(), `${label} is not a file: ${filePath}`)
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${label} is missing: ${filePath}`)
    throw error
  }
}

async function verifyTopLevelChecksums(nativeStage, checksums, names) {
  for (const name of names) {
    const expected = checksums.get(name)
    requireTrue(expected, `checksums.txt is missing ${name}`)
    const actual = await sha256File(path.join(nativeStage, name))
    requireTrue(actual === expected, `${name} SHA-256 mismatch: expected ${expected}, found ${actual}`)
  }
}

async function verifyDraftDownloadEvidence(args, expectedAssets) {
  if (args.requestedDraftReleaseDownloaded && !args.draftDownloadEvidence) {
    throw new Error('--draft-release-downloaded is deprecated and requires --draft-download-evidence from download-ashfall-draft-release.mjs')
  }
  if (!args.draftDownloadEvidence) return null

  const evidence = await readJson(args.draftDownloadEvidence)
  requireTrue(evidence.schemaVersion === 'echo.ashfall.draft-download.v1', 'Draft download evidence must use schemaVersion echo.ashfall.draft-download.v1')
  requireTrue(evidence.status === 'PASS', `Draft download evidence status must be PASS, found ${evidence.status ?? '(missing)'}`)
  requireTrue(Number(evidence.summary?.blockingDiagnostics) === 0, `Draft download evidence blockingDiagnostics expected 0, found ${evidence.summary?.blockingDiagnostics ?? '(missing)'}`)
  requireTrue(Number(evidence.summary?.unlistedAssetCount) === 0, `Draft download evidence unlistedAssetCount expected 0, found ${evidence.summary?.unlistedAssetCount ?? '(missing)'}`)
  requireTrue(Number(evidence.summary?.placeholderAssetCount) === 0, `Draft download evidence placeholderAssetCount expected 0, found ${evidence.summary?.placeholderAssetCount ?? '(missing)'}`)
  requireTrue(evidence.data?.downloadedFromGitHubRelease === true, 'Draft download evidence must prove downloadedFromGitHubRelease=true')
  requireTrue(evidence.data?.draftReleaseDownloaded === true, 'Draft download evidence must prove draftReleaseDownloaded=true')
  requireTrue(evidence.data?.release?.draft === true, 'Draft download evidence release must still be marked draft=true')
  requireTrue(evidence.data?.release?.prerelease === true, 'Draft download evidence release must still be marked prerelease=true')
  requireTrue(evidence.data?.release?.repoName === 'ECHO-Ashfall-Native-Edition', `Draft download evidence repoName expected ECHO-Ashfall-Native-Edition, found ${evidence.data?.release?.repoName ?? '(missing)'}`)
  requireTrue(evidence.data?.release?.tagName === 'v0.1.0-ashfall-native-edition', `Draft download evidence tagName expected v0.1.0-ashfall-native-edition, found ${evidence.data?.release?.tagName ?? '(missing)'}`)

  const evidenceDir = evidence.data?.downloadDir
  requireTrue(typeof evidenceDir === 'string' && evidenceDir.trim(), 'Draft download evidence is missing data.downloadDir')
  const evidenceDirPath = path.isAbsolute(evidenceDir) ? evidenceDir : path.join(args.root, evidenceDir)
  requireTrue(path.resolve(evidenceDirPath) === path.resolve(args.nativeStage), `Draft download evidence directory ${evidenceDir} does not match --native-stage ${rel(args.root, args.nativeStage)}`)

  const assets = evidence.data?.downloadedAssets
  requireTrue(Array.isArray(assets), 'Draft download evidence must include downloadedAssets')
  const downloadedAssetCount = Number(evidence.summary?.downloadedAssetCount)
  requireTrue(downloadedAssetCount === assets.length, `Draft download evidence downloadedAssetCount expected ${assets.length}, found ${evidence.summary?.downloadedAssetCount ?? '(missing)'}`)
  const totalBytes = assets.reduce((sum, asset) => sum + Number(asset?.size ?? 0), 0)
  requireTrue(Number(evidence.summary?.totalBytes) === totalBytes, `Draft download evidence totalBytes expected ${totalBytes}, found ${evidence.summary?.totalBytes ?? '(missing)'}`)
  const byName = new Map(assets.map((asset) => [asset?.name, asset]))
  for (const [name, expected] of expectedAssets) {
    const asset = byName.get(name)
    requireTrue(asset, `Draft download evidence is missing downloaded asset ${name}`)
    requireTrue(asset.sha256 === expected.sha256, `${name} SHA-256 does not match draft download evidence`)
    requireTrue(Number(asset.size) === Number(expected.size), `${name} size does not match draft download evidence`)
  }
  const unlisted = assets.find((asset) => !expectedAssets.has(asset?.name))
  requireTrue(!unlisted, `Draft download evidence contains unlisted asset ${unlisted?.name ?? '(missing)'}`)
  return {
    path: rel(args.root, args.draftDownloadEvidence),
    release: evidence.data.release,
    downloadedAssetCount: assets.length,
    totalBytes,
  }
}

function requireAssetRecord(releaseManifest, name, role, sha, size) {
  const asset = (releaseManifest.assets ?? []).find((candidate) => candidate?.name === name)
  requireTrue(asset, `echo-release.json assets is missing ${name}`)
  requireTrue(asset.role === role, `${name} role expected ${role}, found ${asset.role ?? '(missing)'}`)
  requireTrue(asset.sha256 === sha, `${name} asset SHA-256 mismatch in echo-release.json`)
  requireTrue(Number(asset.size) === Number(size), `${name} asset size mismatch in echo-release.json`)
}

function verifyModuleRelease(moduleRelease) {
  requireTrue(moduleRelease.schemaVersion === 'echo.module.release.v1', 'ECHO Modules staged echo-release.json must use schemaVersion echo.module.release.v1')
  requireTrue(Array.isArray(moduleRelease.modules), 'ECHO Modules staged echo-release.json must include modules')
  requireTrue(moduleRelease.modules.length >= REQUIRED_MODULES.length, `ECHO Modules release must include at least ${REQUIRED_MODULES.length} modules`)
  const byId = new Map(moduleRelease.modules.map((moduleRecord) => [moduleRecord.moduleId, moduleRecord]))
  for (const moduleId of REQUIRED_MODULES) {
    const moduleRecord = byId.get(moduleId)
    requireTrue(moduleRecord, `ECHO Modules release is missing required module ${moduleId}`)
    requireTrue(Array.isArray(moduleRecord.artifacts) && moduleRecord.artifacts.length >= 4, `${moduleId} must include runtime and source artifacts`)
    for (const artifact of moduleRecord.artifacts) {
      if (artifact.kind === 'sources') continue
      requireTrue(artifact.buildMode === 'compiled-runtime', `${moduleId} ${artifact.filename ?? artifact.kind} must be compiled-runtime`)
    }
  }
  return {
    moduleCount: moduleRelease.modules.length,
    requiredModules: REQUIRED_MODULES,
  }
}

function parseJsonEntry(zipBytes, entryMap, name) {
  const entry = entryMap.get(name)
  requireTrue(entry, `Native ZIP is missing ${name}`)
  return JSON.parse(readZipEntry(zipBytes, entry).toString('utf8'))
}

async function writeEntryToInstall(zipBytes, entry, installRoot, relativePath) {
  const target = safeJoin(installRoot, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  const bytes = readZipEntry(zipBytes, entry)
  await fs.writeFile(target, bytes)
  return { target, bytes }
}

async function installPackFiles({ zipBytes, entryMap, packFiles, installRoot }) {
  const installed = []
  for (const file of packFiles) {
    const relativePath = normalizeArchivePath(file.path)
    const entry = entryMap.get(relativePath)
    requireTrue(entry, `Native ZIP is missing pack file ${relativePath}`)
    const { target, bytes } = await writeEntryToInstall(zipBytes, entry, installRoot, relativePath)
    if (file.sha256) {
      requireTrue(sha256(bytes) === file.sha256, `${relativePath} SHA-256 mismatch inside Native ZIP`)
    }
    if (file.size !== undefined) {
      requireTrue(bytes.length === Number(file.size), `${relativePath} size mismatch inside Native ZIP`)
    }
    installed.push({ path: relativePath, target, sha256: sha256(bytes), size: bytes.length })
  }
  for (const echoPath of ['.echo/pack-manifest.json', '.echo/export-report.json', '.echo/checksums.sha256']) {
    const entry = entryMap.get(echoPath)
    requireTrue(entry, `Native ZIP is missing ${echoPath}`)
    const { target, bytes } = await writeEntryToInstall(zipBytes, entry, installRoot, echoPath)
    installed.push({ path: echoPath, target, sha256: sha256(bytes), size: bytes.length })
  }
  return installed
}

function verifyEmbeddedChecksums(zipBytes, entryMap) {
  const checksumEntry = entryMap.get('.echo/checksums.sha256')
  requireTrue(checksumEntry, 'Native ZIP is missing .echo/checksums.sha256')
  const checksums = parseChecksums(readZipEntry(zipBytes, checksumEntry).toString('utf8'))
  requireTrue(checksums.size > 0, '.echo/checksums.sha256 must include at least one entry')
  for (const [entryName, expected] of checksums) {
    const normalized = normalizeArchivePath(entryName)
    const entry = entryMap.get(normalized)
    requireTrue(entry, `.echo/checksums.sha256 references missing ${normalized}`)
    const actual = sha256(readZipEntry(zipBytes, entry))
    requireTrue(actual === expected, `Native ZIP embedded checksum mismatch for ${normalized}`)
  }
  return checksums.size
}

async function smokeRepairAndRollback({ zipBytes, entryMap, installRoot, packFiles }) {
  const targetFile = packFiles.find((file) => file.required !== false && Number(file.size ?? 0) > 0) ?? packFiles[0]
  requireTrue(targetFile, 'Pack manifest must include at least one file for repair smoke')
  const relativePath = normalizeArchivePath(targetFile.path)
  const entry = entryMap.get(relativePath)
  requireTrue(entry, `Repair smoke target is missing from Native ZIP: ${relativePath}`)
  const sourceBytes = readZipEntry(zipBytes, entry)
  const targetPath = safeJoin(installRoot, relativePath)
  const originalSha = sha256(await fs.readFile(targetPath))
  requireTrue(originalSha === sha256(sourceBytes), `Repair smoke target was not installed from ZIP: ${relativePath}`)

  await fs.writeFile(targetPath, Buffer.from('corrupted by ashfall rc smoke\n', 'utf8'))
  requireTrue(await sha256File(targetPath) !== originalSha, `Repair smoke did not corrupt ${relativePath}`)
  await fs.writeFile(targetPath, sourceBytes)
  requireTrue(await sha256File(targetPath) === originalSha, `Repair smoke did not restore ${relativePath}`)

  const backupPath = safeJoin(path.join(installRoot, '.echo/rollback/rc-smoke'), relativePath)
  await fs.mkdir(path.dirname(backupPath), { recursive: true })
  await fs.copyFile(targetPath, backupPath)
  await fs.rm(targetPath)
  await fs.writeFile(targetPath, sourceBytes)
  requireTrue(await sha256File(targetPath) === originalSha, `Update smoke did not reinstall ${relativePath}`)

  await fs.rm(targetPath)
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.copyFile(backupPath, targetPath)
  requireTrue(await sha256File(targetPath) === originalSha, `Rollback smoke did not restore ${relativePath}`)

  return {
    target: relativePath,
    restoredSha256: originalSha,
    rollbackPlan: {
      backedUp: [{ path: relativePath, backupPath: path.relative(installRoot, backupPath).replace(/\\/g, '/') }],
      removed: [relativePath],
    },
  }
}

async function generate(args) {
  for (const name of REQUIRED_NATIVE_ASSETS) {
    await requireFile(path.join(args.nativeStage, name), `Native staged asset ${name}`)
  }

  const nativeNames = await fs.readdir(args.nativeStage)
  const placeholder = nativeNames.find((name) => PLACEHOLDER_PATTERN.test(name))
  requireTrue(!placeholder, `Native staging still contains placeholder/source-style asset ${placeholder}`)

  const releasePath = path.join(args.nativeStage, 'echo-release.json')
  const releaseManifest = await readJson(releasePath)
  const manifestName = releaseManifest.manifestAsset
  const artifactName = releaseManifest.artifactAsset
  requireTrue(manifestName === 'ashfall-native-edition-alpha-0.1.0.pack.json', `echo-release.json manifestAsset must be ashfall-native-edition-alpha-0.1.0.pack.json, found ${manifestName ?? '(missing)'}`)
  requireTrue(artifactName === 'ashfall-native-edition-0.1.0.zip', `echo-release.json artifactAsset must be ashfall-native-edition-0.1.0.zip, found ${artifactName ?? '(missing)'}`)
  requireTrue(!PLACEHOLDER_PATTERN.test(artifactName), `echo-release.json artifactAsset is still placeholder/source-style: ${artifactName}`)

  const manifestPath = path.join(args.nativeStage, manifestName)
  const artifactPath = path.join(args.nativeStage, artifactName)
  await requireFile(manifestPath, `Native pack manifest ${manifestName}`)
  await requireFile(artifactPath, `Native pack artifact ${artifactName}`)

  const topLevelChecksums = parseChecksums(await fs.readFile(path.join(args.nativeStage, 'checksums.txt'), 'utf8'))
  await verifyTopLevelChecksums(args.nativeStage, topLevelChecksums, ['echo-release.json', manifestName, artifactName])

  const manifestSha = await sha256File(manifestPath)
  const artifactSha = await sha256File(artifactPath)
  const releaseSha = await sha256File(releasePath)
  const checksumsSha = await sha256File(path.join(args.nativeStage, 'checksums.txt'))
  const artifactBytes = await fs.readFile(artifactPath)
  const artifactSize = artifactBytes.length
  const expectedDraftAssets = new Map([
    ['checksums.txt', { sha256: checksumsSha, size: await fileSize(path.join(args.nativeStage, 'checksums.txt')) }],
    ['echo-release.json', { sha256: releaseSha, size: await fileSize(releasePath) }],
    [manifestName, { sha256: manifestSha, size: await fileSize(manifestPath) }],
    [artifactName, { sha256: artifactSha, size: artifactSize }],
  ])
  const draftDownloadEvidence = await verifyDraftDownloadEvidence(args, expectedDraftAssets)
  const draftReleaseDownloaded = Boolean(draftDownloadEvidence)
  requireTrue(releaseManifest.manifestSha256 === manifestSha, 'echo-release.json manifestSha256 does not match staged pack manifest')
  requireTrue(releaseManifest.artifactSha256 === artifactSha, 'echo-release.json artifactSha256 does not match staged ZIP')
  requireTrue(Number(releaseManifest.artifactSize) === artifactSize, 'echo-release.json artifactSize does not match staged ZIP')
  requireAssetRecord(releaseManifest, manifestName, 'pack-manifest', manifestSha, await fileSize(manifestPath))
  requireAssetRecord(releaseManifest, artifactName, 'pack-artifact', artifactSha, artifactSize)

  const packManifest = await readJson(manifestPath)
  requireTrue(packManifest.pack === 'ashfall-native-edition', `Pack manifest pack must be ashfall-native-edition, found ${packManifest.pack ?? '(missing)'}`)
  requireTrue(!packManifest.loader, 'Ashfall Native pack manifest must not include NeoForge loader metadata')
  requireTrue(packManifest.nativeLoader, 'Ashfall Native pack manifest must include Native Loader metadata')
  requireTrue(packManifest.moduleArtifactFamily === 'echo-addon', `Ashfall Native moduleArtifactFamily must be echo-addon, found ${packManifest.moduleArtifactFamily ?? '(missing)'}`)
  requireTrue(packManifest.artifactMode === 'zip', `Pack manifest artifactMode must be zip, found ${packManifest.artifactMode ?? '(missing)'}`)
  requireTrue(packManifest.artifactName === artifactName, 'Pack manifest artifactName does not match echo-release.json artifactAsset')
  requireTrue(packManifest.artifactSha256 === artifactSha, 'Pack manifest artifactSha256 does not match staged ZIP')
  requireTrue(Number(packManifest.artifactSize) === artifactSize, 'Pack manifest artifactSize does not match staged ZIP')
  requireTrue(Array.isArray(packManifest.files) && packManifest.files.length > 0, 'Pack manifest must include files')
  const moduleRequirements = packManifest.moduleRequirements ?? packManifest.requiredModules
  requireTrue(Array.isArray(moduleRequirements) && moduleRequirements.length >= REQUIRED_MODULES.length, 'Pack manifest must include Native module requirements')
  for (const requirement of moduleRequirements) {
    requireTrue(requirement.artifactFamily === 'echo-addon' || requirement.family === 'echo-addon', `Module requirement ${requirement.id ?? requirement.moduleId ?? '(missing)'} must use echo-addon artifacts`)
  }
  for (const file of packManifest.files) {
    normalizeArchivePath(file.path)
    requireTrue(/^addons\/.+\.echo-addon$/iu.test(file.path), `Native pack file must be an .echo-addon under addons/: ${file.path ?? '(missing)'}`)
    requireTrue(SHA256_PATTERN.test(String(file.sha256 ?? '')), `Pack manifest file ${file.path ?? '(missing)'} has invalid SHA-256`)
  }

  const moduleRelease = await readJson(path.join(args.moduleStage, 'echo-release.json'))
  const moduleSummary = verifyModuleRelease(moduleRelease)

  const zipEntries = readZipEntries(artifactBytes)
  const modEntry = zipEntries.find((entry) => /^mods\//iu.test(entry.name))
  requireTrue(!modEntry, `Native ZIP must not contain NeoForge mods folder entries: ${modEntry?.name ?? '(missing)'}`)
  const entryMap = new Map(zipEntries.map((entry) => [entry.name, entry]))
  const embeddedPackManifest = parseJsonEntry(artifactBytes, entryMap, '.echo/pack-manifest.json')
  parseJsonEntry(artifactBytes, entryMap, '.echo/export-report.json')
  requireTrue(embeddedPackManifest.pack === packManifest.pack, 'Embedded pack manifest pack does not match staged pack manifest')
  if (Array.isArray(embeddedPackManifest.files)) {
    requireTrue(embeddedPackManifest.files.length === packManifest.files.length, 'Embedded pack manifest file count does not match staged pack manifest')
  }
  const embeddedChecksumCount = verifyEmbeddedChecksums(artifactBytes, entryMap)

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-rc-smoke-'))
  const installRoot = path.join(tempRoot, 'install')
  let tempCleaned = false
  let report
  try {
    const installed = await installPackFiles({
      zipBytes: artifactBytes,
      entryMap,
      packFiles: packManifest.files,
      installRoot,
    })
    const repair = await smokeRepairAndRollback({
      zipBytes: artifactBytes,
      entryMap,
      installRoot,
      packFiles: packManifest.files,
    })

    const publishWarnings = []
    if (!draftReleaseDownloaded) publishWarnings.push('GitHub draft release download has not been recorded; smoke used local staged assets.')
    if (!args.promotedAfterGreen) publishWarnings.push('Release has not been promoted after all readiness gates were green.')
    const status = publishWarnings.length === 0 ? 'PASS' : 'PASS_WITH_WARNINGS'
    report = {
      schemaVersion: 'echo.ashfall.rc-smoke.v1',
      generatedAt: new Date().toISOString(),
      status,
      summary: {
        blockingDiagnostics: publishWarnings.length,
        warningCount: publishWarnings.length,
        installedFileCount: installed.length,
        packFileCount: packManifest.files.length,
        zipEntryCount: zipEntries.length,
        embeddedChecksumCount,
        warnings: publishWarnings,
      },
      data: {
        localStagedArtifactSmoke: true,
        draftReleaseDownloaded,
        installedFromDownloadedArtifacts: draftReleaseDownloaded,
        launcherInstallSmoke: true,
        updateSmoke: true,
        rollbackPlanVerified: true,
        promotedAfterGreen: args.promotedAfterGreen,
        artifactSource: draftReleaseDownloaded ? 'github-draft-release-download' : 'local-public-alpha-staging',
        launcherInstallSmokeMode: 'pack-manifest-checksum-install',
        updateSmokeMode: 'same-artifact-reinstall-with-rollback-plan',
        publishBlockedReason: publishWarnings.length > 0 ? publishWarnings.join(' ') : null,
        nativeStage: rel(args.root, args.nativeStage),
        moduleStage: rel(args.root, args.moduleStage),
        draftDownloadEvidence,
        artifact: {
          file: artifactName,
          sha256: artifactSha,
          size: artifactSize,
        },
        manifest: {
          file: manifestName,
          sha256: manifestSha,
          size: await fileSize(manifestPath),
        },
        releaseManifest: {
          file: 'echo-release.json',
          sha256: releaseSha,
          size: await fileSize(releasePath),
        },
        moduleRelease: moduleSummary,
        installRoot: args.keepTemp ? installRoot : null,
        tempRoot: args.keepTemp ? tempRoot : null,
        repairSmoke: {
          ok: true,
          target: repair.target,
          restoredSha256: repair.restoredSha256,
        },
        rollbackPlan: repair.rollbackPlan,
      },
    }
  } finally {
    if (!args.keepTemp) {
      await fs.rm(tempRoot, { recursive: true, force: true })
      tempCleaned = true
    }
  }
  report.data.tempCleaned = tempCleaned
  return report
}

async function writeReport(outPath, report) {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, jsonBytes(report))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  try {
    const report = await generate(args)
    await writeReport(args.out, report)
    process.stdout.write(`${JSON.stringify({
      ok: true,
      status: report.status,
      out: rel(args.root, args.out),
      installedFileCount: report.summary.installedFileCount,
      warnings: report.summary.warnings,
    }, null, 2)}\n`)
  } catch (error) {
    const failed = {
      schemaVersion: 'echo.ashfall.rc-smoke.v1',
      generatedAt: new Date().toISOString(),
      status: 'FAILED',
      summary: {
        blockingDiagnostics: 1,
        warningCount: 0,
        errors: [error.message],
      },
      data: {
        localStagedArtifactSmoke: false,
        draftReleaseDownloaded: false,
        installedFromDownloadedArtifacts: false,
        launcherInstallSmoke: false,
        updateSmoke: false,
        rollbackPlanVerified: false,
        promotedAfterGreen: args.promotedAfterGreen,
        nativeStage: rel(args.root, args.nativeStage),
        moduleStage: rel(args.root, args.moduleStage),
      },
    }
    await writeReport(args.out, failed).catch(() => undefined)
    process.stderr.write(`Ashfall RC smoke failed: ${error.message}\n`)
    process.exitCode = 1
  }
}

await main()
