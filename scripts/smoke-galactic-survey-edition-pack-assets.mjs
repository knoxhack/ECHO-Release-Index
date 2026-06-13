#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const EDITIONS = [
  'ECHO-Galactic-Survey-Native-Edition',
  'ECHO-Galactic-Survey-NeoForge-Edition',
  'ECHO-Galactic-Survey-Standalone-Edition',
]

const RELEASES = {
  'ECHO-Galactic-Survey-Native-Edition': {
    releaseTag: 'galactic-survey-native-0.1.0-alpha',
    releaseUrl: 'local-release-candidate',
  },
  'ECHO-Galactic-Survey-NeoForge-Edition': {
    releaseTag: 'galactic-survey-neoforge-0.1.0-alpha',
    releaseUrl: 'local-release-candidate',
  },
  'ECHO-Galactic-Survey-Standalone-Edition': {
    releaseTag: 'galactic-survey-standalone-0.1.0-alpha',
    releaseUrl: 'local-release-candidate',
  },
}

function usage() {
  return `Usage: node scripts/smoke-galactic-survey-edition-pack-assets.mjs [options]

Smoke-tests local Galactic Survey pack assets by verifying checksums,
installing manifest files from the pack ZIP, repairing a corrupted file, and
rolling back a simulated file replacement.

Options:
  --download-root <path>  Root containing staged edition assets.
                          Default: tmp/galactic-survey-edition-assets
  --work-root <path>      Temporary install/rollback root. Default: tmp/galactic-survey-edition-pack-smoke
  --out <path>            Evidence output path. Default: release-readiness/galactic-survey-edition-pack-smoke.json
  --clean                 Remove work-root before running.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    root,
    downloadRoot: path.resolve(root, 'tmp', 'galactic-survey-edition-assets'),
    workRoot: path.resolve(root, 'tmp', 'galactic-survey-edition-pack-smoke'),
    out: path.resolve(root, 'release-readiness', 'galactic-survey-edition-pack-smoke.json'),
    clean: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--download-root') args.downloadRoot = path.resolve(next())
    else if (arg === '--work-root') args.workRoot = path.resolve(next())
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--clean') args.clean = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath))
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function parseChecksums(text) {
  const checksums = new Map()
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([a-f0-9]{64})\s+\*?(.+)$/iu)
    if (!match) throw new Error(`Invalid checksum line: ${line}`)
    checksums.set(match[2].trim().replace(/\\/g, '/'), match[1].toLowerCase())
  }
  return checksums
}

function parseStoredZip(zipPath, bytes) {
  const entries = new Map()
  let offset = 0
  while (offset + 4 <= bytes.length) {
    const signature = bytes.readUInt32LE(offset)
    if (signature === 0x02014b50 || signature === 0x06054b50) break
    if (signature !== 0x04034b50) throw new Error(`${zipPath}: unsupported ZIP signature 0x${signature.toString(16)} at ${offset}`)
    const method = bytes.readUInt16LE(offset + 8)
    if (method !== 0) throw new Error(`${zipPath}: ZIP entry uses unsupported compression method ${method}`)
    const compressedSize = bytes.readUInt32LE(offset + 18)
    const uncompressedSize = bytes.readUInt32LE(offset + 22)
    const nameLength = bytes.readUInt16LE(offset + 26)
    const extraLength = bytes.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const dataEnd = dataStart + compressedSize
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString('utf8').replace(/\\/g, '/')
    const data = Buffer.from(bytes.subarray(dataStart, dataEnd))
    if (data.length !== uncompressedSize) throw new Error(`${zipPath}: ${name} size mismatch in ZIP header`)
    entries.set(name, data)
    offset = dataEnd
  }
  return entries
}

async function verifyTopLevelChecksums(dir) {
  const checksums = parseChecksums(await fs.readFile(path.join(dir, 'checksums.txt'), 'utf8'))
  const verified = []
  for (const [name, expected] of checksums.entries()) {
    const target = path.join(dir, name)
    const actual = await sha256File(target)
    if (actual !== expected) throw new Error(`${dir}: checksum mismatch for ${name}`)
    verified.push(name)
  }
  return verified
}

async function installFromZip({ installRoot, manifest, entries }) {
  const installed = []
  for (const file of manifest.files) {
    const data = entries.get(file.path)
    if (!data) throw new Error(`${manifest.pack}: ZIP missing ${file.path}`)
    const actualSha = sha256Bytes(data)
    if (actualSha !== file.sha256) throw new Error(`${manifest.pack}: ZIP hash mismatch for ${file.path}`)
    if (data.length !== file.size) throw new Error(`${manifest.pack}: ZIP size mismatch for ${file.path}`)
    const destination = path.join(installRoot, file.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, data)
    installed.push(file.path)
  }
  await fs.mkdir(path.join(installRoot, '.echo'), { recursive: true })
  await writeJson(path.join(installRoot, '.echo', 'installed-manifest.json'), manifest)
  return installed
}

async function verifyInstall({ installRoot, manifest }) {
  const verified = []
  for (const file of manifest.files) {
    const target = path.join(installRoot, file.path)
    const actual = await sha256File(target)
    if (actual !== file.sha256) throw new Error(`${manifest.pack}: installed hash mismatch for ${file.path}`)
    const stat = await fs.stat(target)
    if (stat.size !== file.size) throw new Error(`${manifest.pack}: installed size mismatch for ${file.path}`)
    verified.push(file.path)
  }
  return verified
}

async function scanInstall({ installRoot, manifest }) {
  const valid = []
  const missing = []
  const corrupt = []
  for (const file of manifest.files) {
    const target = path.join(installRoot, file.path)
    try {
      const actual = await sha256File(target)
      const stat = await fs.stat(target)
      if (actual === file.sha256 && stat.size === file.size) valid.push(file.path)
      else corrupt.push(file.path)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      missing.push(file.path)
    }
  }
  return { ok: missing.length === 0 && corrupt.length === 0, valid, missing, corrupt }
}

async function backupFileIfExists(installRoot, backupRoot, relativePath) {
  const source = path.join(installRoot, relativePath)
  try {
    await fs.access(source)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  const backupPath = path.join(backupRoot, relativePath)
  await fs.mkdir(path.dirname(backupPath), { recursive: true })
  await fs.copyFile(source, backupPath)
  return backupPath
}

function protocolFile(manifest) {
  return manifest.files.find((file) => file.moduleId === 'echogalacticsurveyprotocol') ?? manifest.files[0]
}

async function preparePreviousInstallFixture({ installRoot, manifest }) {
  const targetFile = protocolFile(manifest)
  const targetPath = path.join(installRoot, targetFile.path)
  await fs.writeFile(targetPath, Buffer.from('previous version placeholder for Galactic Survey pack update smoke\n', 'utf8'))
  const previousTargetSha = await sha256File(targetPath)
  const previousTargetStat = await fs.stat(targetPath)
  const obsoletePath = manifest.pack.endsWith('native-edition')
    ? 'addons/galactic-survey-obsolete-pack-smoke.echo-addon'
    : 'mods/galactic-survey-obsolete-pack-smoke.jar'
  const obsoleteAbsolute = path.join(installRoot, obsoletePath)
  await fs.mkdir(path.dirname(obsoleteAbsolute), { recursive: true })
  await fs.writeFile(obsoleteAbsolute, Buffer.from('obsolete Galactic Survey pack update smoke file\n', 'utf8'))
  const obsoleteStat = await fs.stat(obsoleteAbsolute)
  const previousVersion = `${manifest.version}-previous-smoke`
  const previousManifest = {
    ...manifest,
    version: previousVersion,
    files: [
      ...manifest.files.map((file) => file.path === targetFile.path
        ? { ...file, version: `${file.version ?? manifest.version}-previous-smoke`, sha256: previousTargetSha, size: previousTargetStat.size }
        : file),
      {
        path: obsoletePath,
        sha256: await sha256File(obsoleteAbsolute),
        size: obsoleteStat.size,
        required: true,
        moduleId: 'galactic-survey-obsolete-pack-smoke',
      },
    ],
  }
  await writeJson(path.join(installRoot, '.echo', 'installed-manifest.json'), previousManifest)
  const previousVerification = await scanInstall({ installRoot, manifest: previousManifest })
  if (!previousVerification.ok) throw new Error(`${manifest.pack}: previous-version fixture did not verify`)
  return { obsoletePath, previousVersion, previousManifest, previousVerification }
}

async function updateFromZip({ installRoot, manifest, entries, fixture }) {
  const backupRoot = path.join(installRoot, '.echo', 'rollback', 'galactic-survey-version-update-smoke')
  const before = await scanInstall({ installRoot, manifest })
  const valid = new Set(before.valid)
  const updated = []
  const verified = []
  const backedUp = []
  const removed = []

  for (const file of manifest.files) {
    if (valid.has(file.path)) {
      verified.push(file.path)
      continue
    }
    const source = entries.get(file.path)
    if (!source) throw new Error(`${manifest.pack}: missing update source ${file.path}`)
    const backupPath = await backupFileIfExists(installRoot, backupRoot, file.path)
    if (backupPath) backedUp.push({ path: file.path, backupPath })
    const targetPath = path.join(installRoot, file.path)
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, source)
    updated.push(file.path)
  }

  const obsoleteBackupPath = await backupFileIfExists(installRoot, backupRoot, fixture.obsoletePath)
  if (obsoleteBackupPath) {
    backedUp.push({ path: fixture.obsoletePath, backupPath: obsoleteBackupPath })
    await fs.rm(path.join(installRoot, fixture.obsoletePath), { force: true })
    removed.push(fixture.obsoletePath)
  }

  await writeJson(path.join(installRoot, '.echo', 'installed-manifest.json'), manifest)
  const verifiedAfterUpdate = await verifyInstall({ installRoot, manifest })
  const rollbackPlan = {
    operation: 'update',
    installPath: installRoot,
    fromVersion: fixture.previousVersion,
    toVersion: manifest.version,
    backedUp,
    removed: updated,
    createdAt: new Date().toISOString(),
  }
  await writeJson(path.join(backupRoot, 'rollback-plan.json'), rollbackPlan)
  return { updated, verified, removed, backedUp, verifiedAfterUpdate, rollbackPlan }
}

async function rollbackUpdate(rollbackPlan) {
  for (const relativePath of rollbackPlan.removed ?? []) {
    await fs.rm(path.join(rollbackPlan.installPath, relativePath), { force: true })
  }
  for (const backup of rollbackPlan.backedUp ?? []) {
    const destination = path.join(rollbackPlan.installPath, backup.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(backup.backupPath, destination)
  }
}

async function repairOneFile({ installRoot, manifest, entries }) {
  const targetFile = protocolFile(manifest)
  const targetPath = path.join(installRoot, targetFile.path)
  await fs.writeFile(targetPath, Buffer.from('corrupted Galactic Survey smoke fixture\n', 'utf8'))
  const corruptSha = await sha256File(targetPath)
  if (corruptSha === targetFile.sha256) throw new Error(`${manifest.pack}: corruption did not change ${targetFile.path}`)
  const source = entries.get(targetFile.path)
  if (!source) throw new Error(`${manifest.pack}: missing repair source ${targetFile.path}`)
  await fs.writeFile(targetPath, source)
  const repairedSha = await sha256File(targetPath)
  if (repairedSha !== targetFile.sha256) throw new Error(`${manifest.pack}: repair failed for ${targetFile.path}`)
  return targetFile.path
}

async function rollbackSimulatedReplacement({ installRoot, manifest }) {
  const targetFile = protocolFile(manifest)
  const targetPath = path.join(installRoot, targetFile.path)
  const backupDir = path.join(installRoot, '.echo', 'rollback', 'galactic-survey-smoke')
  const backupPath = path.join(backupDir, targetFile.path)
  const createdPath = path.join(installRoot, '.echo', 'rollback-created-marker.txt')
  await fs.mkdir(path.dirname(backupPath), { recursive: true })
  await fs.copyFile(targetPath, backupPath)
  await fs.writeFile(targetPath, Buffer.from('simulated update replacement\n', 'utf8'))
  await fs.writeFile(createdPath, 'created during simulated update\n', 'utf8')
  const changedSha = await sha256File(targetPath)
  if (changedSha === targetFile.sha256) throw new Error(`${manifest.pack}: simulated update did not replace ${targetFile.path}`)
  await fs.copyFile(backupPath, targetPath)
  await fs.rm(createdPath, { force: true })
  const restoredSha = await sha256File(targetPath)
  if (restoredSha !== targetFile.sha256) throw new Error(`${manifest.pack}: rollback did not restore ${targetFile.path}`)
  try {
    await fs.access(createdPath)
    throw new Error(`${manifest.pack}: rollback did not remove simulated created marker`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return targetFile.path
}

async function smokeEdition(args, repoName) {
  const dir = path.join(args.downloadRoot, repoName)
  const release = await readJson(path.join(dir, 'echo-release.json'))
  const manifest = await readJson(path.join(dir, release.manifestAsset))
  const zipPath = path.join(dir, release.artifactAsset)
  const zipBytes = await fs.readFile(zipPath)
  const zipSha = sha256Bytes(zipBytes)
  if (zipSha !== release.artifactSha256 || zipSha !== manifest.artifactSha256) throw new Error(`${repoName}: artifact SHA-256 mismatch`)
  if (zipBytes.length !== release.artifactSize || zipBytes.length !== manifest.artifactSize) throw new Error(`${repoName}: artifact size mismatch`)
  const entries = parseStoredZip(zipPath, zipBytes)
  for (const required of ['.echo/pack-manifest.json', '.echo/export-report.json', '.echo/checksums.sha256']) {
    if (!entries.has(required)) throw new Error(`${repoName}: missing ${required}`)
  }
  const installRoot = path.join(args.workRoot, repoName, 'install')
  await fs.rm(installRoot, { recursive: true, force: true })
  await fs.mkdir(installRoot, { recursive: true })
  const topLevelChecksums = await verifyTopLevelChecksums(dir)
  const installed = await installFromZip({ installRoot, manifest, entries })
  const verifiedAfterInstall = await verifyInstall({ installRoot, manifest })
  const previousFixture = await preparePreviousInstallFixture({ installRoot, manifest })
  const versionUpdate = await updateFromZip({ installRoot, manifest, entries, fixture: previousFixture })
  await rollbackUpdate(versionUpdate.rollbackPlan)
  const previousAfterRollback = await scanInstall({ installRoot, manifest: previousFixture.previousManifest })
  if (!previousAfterRollback.ok) throw new Error(`${manifest.pack}: version rollback did not restore previous fixture`)
  const postRollbackVersionUpdate = await updateFromZip({ installRoot, manifest, entries, fixture: previousFixture })
  const repairedPath = await repairOneFile({ installRoot, manifest, entries })
  const rolledBackPath = await rollbackSimulatedReplacement({ installRoot, manifest })
  const verifiedAfterRollback = await verifyInstall({ installRoot, manifest })
  return {
    repoName,
    pack: release.pack,
    releaseTag: RELEASES[repoName].releaseTag,
    releaseUrl: RELEASES[repoName].releaseUrl,
    publicPrerelease: false,
    localReleaseCandidate: Boolean(release.localReleaseCandidate),
    manifestAsset: release.manifestAsset,
    artifactAsset: release.artifactAsset,
    artifactSha256: release.artifactSha256,
    artifactSize: release.artifactSize,
    topLevelChecksums,
    installedFiles: installed.length,
    verifiedAfterInstall: verifiedAfterInstall.length,
    versionUpdate: {
      fromVersion: previousFixture.previousVersion,
      toVersion: manifest.version,
      updated: versionUpdate.updated.length,
      verified: versionUpdate.verified.length,
      removed: versionUpdate.removed.length,
      verifiedAfterUpdate: versionUpdate.verifiedAfterUpdate.length,
    },
    versionRollback: {
      restoredPreviousVersion: previousFixture.previousVersion,
      verifiedAfterRollback: previousAfterRollback.valid.length,
    },
    postRollbackVersionUpdate: {
      updated: postRollbackVersionUpdate.updated.length,
      verifiedAfterUpdate: postRollbackVersionUpdate.verifiedAfterUpdate.length,
    },
    repairedPath,
    rolledBackPath,
    verifiedAfterRollback: verifiedAfterRollback.length,
    installRoot,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (args.clean) await fs.rm(args.workRoot, { recursive: true, force: true })
  await fs.mkdir(args.workRoot, { recursive: true })
  const editions = []
  for (const repoName of EDITIONS) editions.push(await smokeEdition(args, repoName))
  const report = {
    schemaVersion: 'echo.galactic_survey.edition-pack-smoke.v1',
    ok: true,
    generatedAt: new Date().toISOString(),
    downloadRoot: args.downloadRoot,
    workRoot: args.workRoot,
    editions,
    gates: {
      stagedReleaseAssetsVerified: 'passed',
      installFromPackZip: 'passed',
      versionTransitionUpdate: 'passed',
      repairCorruptFile: 'passed',
      rollbackSimulatedReplacement: 'passed',
      realVersionUpdate: 'passed_with_previous_version_fixture',
      packagedLauncherEndToEnd: 'not_started',
    },
    blockers: [],
    residualRisks: [
      'The previous Galactic Survey version is a fixture-local manifest generated from current staged assets plus an older module placeholder; it proves pack update mechanics without claiming a second public release exists.',
      'This smoke uses local release-candidate assets, not downloaded GitHub Release assets.',
      'Real gameplay evidence is still required before public alpha promotion.',
    ],
  }
  await writeJson(args.out, report)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
