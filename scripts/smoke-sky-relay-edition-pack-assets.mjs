#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const EDITIONS = [
  'ECHO-Sky-Relay-Native-Edition',
  'ECHO-Sky-Relay-NeoForge-Edition',
  'ECHO-Sky-Relay-Standalone-Edition',
]

function usage() {
  return `Usage: node scripts/smoke-sky-relay-edition-pack-assets.mjs [options]

Smoke-tests downloaded Sky Relay draft pack assets by verifying checksums,
installing manifest files from the pack ZIP, repairing a corrupted file, and
rolling back a simulated file replacement.

Options:
  --download-root <path>  Root containing downloaded edition assets.
                          Default: tmp/sky-relay-edition-pack-download
  --work-root <path>      Temporary install/rollback root. Default: tmp/sky-relay-edition-pack-smoke
  --out <path>            Evidence output path. Default: release-readiness/sky-relay-edition-pack-smoke.json
  --clean                 Remove work-root before running.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    root,
    downloadRoot: path.resolve(root, 'tmp', 'sky-relay-edition-pack-download'),
    workRoot: path.resolve(root, 'tmp', 'sky-relay-edition-pack-smoke'),
    out: path.resolve(root, 'release-readiness', 'sky-relay-edition-pack-smoke.json'),
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
    if (signature !== 0x04034b50) {
      throw new Error(`${zipPath}: unsupported ZIP signature 0x${signature.toString(16)} at ${offset}`)
    }
    const method = bytes.readUInt16LE(offset + 8)
    if (method !== 0) {
      throw new Error(`${zipPath}: ZIP entry uses unsupported compression method ${method}`)
    }
    const compressedSize = bytes.readUInt32LE(offset + 18)
    const uncompressedSize = bytes.readUInt32LE(offset + 22)
    const nameLength = bytes.readUInt16LE(offset + 26)
    const extraLength = bytes.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const dataEnd = dataStart + compressedSize
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString('utf8').replace(/\\/g, '/')
    const data = Buffer.from(bytes.subarray(dataStart, dataEnd))
    if (data.length !== uncompressedSize) {
      throw new Error(`${zipPath}: ${name} size mismatch in ZIP header`)
    }
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

async function repairOneFile({ installRoot, manifest, entries }) {
  const targetFile = manifest.files.find((file) => file.moduleId === 'echoskyrelayprotocol') ?? manifest.files[0]
  const targetPath = path.join(installRoot, targetFile.path)
  await fs.writeFile(targetPath, Buffer.from('corrupted sky relay smoke fixture\n', 'utf8'))
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
  const targetFile = manifest.files.find((file) => file.moduleId === 'echoskyrelayprotocol') ?? manifest.files[0]
  const targetPath = path.join(installRoot, targetFile.path)
  const backupDir = path.join(installRoot, '.echo', 'rollback', 'sky-relay-smoke')
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
  if (zipSha !== release.artifactSha256 || zipSha !== manifest.artifactSha256) {
    throw new Error(`${repoName}: artifact SHA-256 mismatch`)
  }
  if (zipBytes.length !== release.artifactSize || zipBytes.length !== manifest.artifactSize) {
    throw new Error(`${repoName}: artifact size mismatch`)
  }
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
  const repairedPath = await repairOneFile({ installRoot, manifest, entries })
  const rolledBackPath = await rollbackSimulatedReplacement({ installRoot, manifest })
  const verifiedAfterRollback = await verifyInstall({ installRoot, manifest })
  return {
    repoName,
    pack: release.pack,
    releaseTag: repoName.includes('Native') ? 'sky-relay-native-0.1.0-alpha'
      : repoName.includes('NeoForge') ? 'sky-relay-neoforge-0.1.0-alpha'
        : 'sky-relay-standalone-0.1.0-alpha',
    releaseDraft: true,
    manifestAsset: release.manifestAsset,
    artifactAsset: release.artifactAsset,
    artifactSha256: release.artifactSha256,
    artifactSize: release.artifactSize,
    topLevelChecksums,
    installedFiles: installed.length,
    verifiedAfterInstall: verifiedAfterInstall.length,
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
  for (const repoName of EDITIONS) {
    editions.push(await smokeEdition(args, repoName))
  }
  const report = {
    schemaVersion: 'echo.skyrelay.edition-pack-smoke.v1',
    ok: true,
    generatedAt: new Date().toISOString(),
    downloadRoot: args.downloadRoot,
    workRoot: args.workRoot,
    editions,
    gates: {
      downloadedDraftAssetsVerified: 'passed',
      installFromPackZip: 'passed',
      repairCorruptFile: 'passed',
      rollbackSimulatedReplacement: 'passed',
      realVersionUpdate: 'blocked',
      electronLauncherEndToEnd: 'blocked',
    },
    blockers: [
      'Only one Sky Relay pack version exists, so real version-to-version update remains blocked.',
      'This smoke uses the Launcher pack manifest and archive contract directly; a desktop Electron install/update/repair/rollback pass is still required before catalog promotion.',
    ],
  }
  await writeJson(args.out, report)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
