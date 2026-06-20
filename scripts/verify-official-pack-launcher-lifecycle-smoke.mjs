#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OWNER = 'knoxhack'
const DEFAULT_REPORT = path.join('release-readiness', 'official-pack-launcher-lifecycle-smoke.json')
const REQUIRED_ZIP_ENTRIES = ['.echo/pack-manifest.json', '.echo/export-report.json', '.echo/checksums.sha256']

function usage() {
  return `Usage: node scripts/verify-official-pack-launcher-lifecycle-smoke.mjs [--strict]

Verifies the Launcher official-pack lifecycle report covers every official pack
lane with install, update, rollback, post-rollback update, repair, checksum, and
deep-link evidence.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    owner: DEFAULT_OWNER,
    report: null,
    strict: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--owner') args.owner = next()
    else if (arg === '--report') args.report = path.resolve(next())
    else if (arg === '--strict') args.strict = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.report) args.report = path.join(args.root, DEFAULT_REPORT)
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function loadOfficialModpacks(root, owner) {
  const rows = []
  for (const fileName of (await fs.readdir(path.join(root, 'modpacks'))).sort()) {
    if (!fileName.endsWith('.json')) continue
    const modpackPath = path.join(root, 'modpacks', fileName)
    const modpack = await readJson(modpackPath)
    if (modpack.kind !== 'modpack' || !String(modpack.sourceRepo ?? '').startsWith(`${owner}/ECHO-`)) continue
    rows.push({ modpack, catalogPath: path.relative(root, modpackPath).replace(/\\/gu, '/') })
  }
  return rows
}

function add(blockers, message) {
  blockers.push(message)
}

function requireValue(blockers, condition, message) {
  if (!condition) add(blockers, message)
}

function requireEqual(blockers, actual, expected, message) {
  if (actual !== expected) add(blockers, `${message}: expected ${JSON.stringify(expected)} but found ${JSON.stringify(actual)}`)
}

function artifactNames(modpack) {
  return Object.values(modpack.artifacts ?? {})
    .filter((artifact) => artifact?.file)
    .map((artifact) => artifact.file)
    .sort()
}

function auditLifecycleEntry(row, entry) {
  const blockers = []
  const id = row.modpack.id
  requireValue(blockers, entry, `${id}: missing lifecycle report entry`)
  if (!entry) return blockers

  requireEqual(blockers, entry.status, 'pass', `${id}: status`)
  requireEqual(blockers, entry.packId, id, `${id}: packId`)
  requireEqual(blockers, entry.sourceRepo, row.modpack.sourceRepo, `${id}: sourceRepo`)
  requireEqual(blockers, entry.releaseTag, row.modpack.releaseTag, `${id}: releaseTag`)
  requireEqual(blockers, entry.validation, row.modpack.validation, `${id}: validation`)
  requireEqual(blockers, entry.manifestAsset, row.modpack.artifacts?.manifest?.file, `${id}: manifestAsset`)
  requireEqual(blockers, entry.artifactAsset, row.modpack.artifacts?.pack?.file, `${id}: artifactAsset`)
  requireValue(blockers, Number(entry.moduleCount) > 0, `${id}: moduleCount must be positive`)
  requireValue(blockers, Number(entry.fileCount) > 0, `${id}: fileCount must be positive`)
  requireValue(blockers, entry.moduleCount <= entry.fileCount, `${id}: moduleCount must not exceed fileCount`)
  requireValue(blockers, entry.selectedModuleId, `${id}: selectedModuleId is required`)

  const downloaded = new Set((entry.downloadedAssets ?? []).map((asset) => asset.name))
  for (const expectedAsset of artifactNames(row.modpack)) {
    requireValue(blockers, downloaded.has(expectedAsset), `${id}: downloaded asset missing ${expectedAsset}`)
  }

  const checksumVerified = entry.topLevelChecksums?.verified ?? []
  requireValue(blockers, Array.isArray(checksumVerified) && checksumVerified.length >= 3, `${id}: top-level checksum verification is incomplete`)
  requireValue(blockers, checksumVerified.includes(entry.manifestAsset), `${id}: manifest asset checksum was not verified`)
  requireValue(blockers, checksumVerified.includes(entry.artifactAsset), `${id}: pack artifact checksum was not verified`)

  const zipEntries = entry.packZip?.requiredEntries ?? []
  for (const requiredEntry of REQUIRED_ZIP_ENTRIES) {
    requireValue(blockers, zipEntries.includes(requiredEntry), `${id}: ZIP payload missing required verification for ${requiredEntry}`)
  }
  requireEqual(blockers, entry.packZip?.embeddedManifestFileCount, entry.fileCount, `${id}: embedded manifest file count`)

  requireValue(blockers, entry.deepLinks?.update?.resolved === true, `${id}: update deep link did not resolve`)
  requireEqual(blockers, entry.deepLinks?.update?.url, `echo://update/pack/${id}`, `${id}: update deep link URL`)
  requireValue(blockers, entry.deepLinks?.update?.artifact === entry.manifestAsset, `${id}: update deep link artifact must be the pack manifest`)
  requireValue(blockers, entry.deepLinks?.installAddon?.resolved === true, `${id}: install-addon deep link did not resolve`)
  requireEqual(blockers, entry.deepLinks?.installAddon?.url, `echo://install/addon/${entry.selectedModuleId}?pack=${id}`, `${id}: install-addon deep link URL`)
  requireValue(blockers, entry.deepLinks?.installAddon?.artifact, `${id}: install-addon artifact is required`)

  requireEqual(blockers, entry.install?.installed, entry.fileCount, `${id}: installed file count`)
  requireEqual(blockers, entry.install?.verifiedAfterInstall, entry.fileCount, `${id}: verifiedAfterInstall`)
  requireValue(blockers, entry.update?.versionTransition === true, `${id}: update must prove a version transition fixture`)
  requireValue(blockers, Number(entry.update?.updated) > 0, `${id}: update must replace at least one file`)
  requireValue(blockers, Number(entry.update?.removed) > 0, `${id}: update must remove at least one obsolete file`)
  requireEqual(blockers, entry.update?.verifiedAfterUpdate, entry.fileCount, `${id}: verifiedAfterUpdate`)
  requireValue(blockers, entry.rollback?.restoredPreviousTarget, `${id}: rollback restoredPreviousTarget is required`)
  requireValue(blockers, entry.rollback?.restoredObsoletePath, `${id}: rollback restoredObsoletePath is required`)
  requireValue(blockers, entry.rollback?.restoredPreviousVersion, `${id}: rollback restoredPreviousVersion is required`)
  requireEqual(blockers, entry.rollback?.verifiedAfterRollback, entry.fileCount + 1, `${id}: verifiedAfterRollback`)
  requireValue(blockers, Number(entry.postRollbackUpdate?.updated) > 0, `${id}: post-rollback update must replace at least one file`)
  requireEqual(blockers, entry.postRollbackUpdate?.verifiedAfterUpdate, entry.fileCount, `${id}: postRollbackUpdate.verifiedAfterUpdate`)
  requireValue(blockers, entry.repair?.repaired, `${id}: repair target is required`)
  requireEqual(blockers, entry.repair?.verifiedAfterRepair, entry.fileCount, `${id}: verifiedAfterRepair`)

  return blockers
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const officialRows = await loadOfficialModpacks(args.root, args.owner)
  const report = await readJson(args.report)
  const blockers = []
  requireEqual(blockers, report.schemaVersion, 'echo.official_pack.launcher_lifecycle_smoke.v1', 'report schemaVersion')
  requireEqual(blockers, report.ok, true, 'report ok')
  requireEqual(blockers, report.source, 'live-github-release-assets', 'report source')
  requireValue(blockers, Array.isArray(report.blockers) && report.blockers.length === 0, 'report blockers must be empty')
  requireEqual(blockers, report.officialPackCount, officialRows.length, 'officialPackCount')
  requireEqual(blockers, report.coveredPackCount, officialRows.length, 'coveredPackCount')
  for (const [gate, status] of Object.entries(report.gates ?? {})) {
    requireValue(blockers, String(status).startsWith('passed') || String(status).startsWith('covered_separately'), `gate ${gate} has non-passing status ${status}`)
  }

  const entriesByPack = new Map((report.editions ?? []).map((entry) => [entry.packId, entry]))
  for (const row of officialRows) {
    blockers.push(...auditLifecycleEntry(row, entriesByPack.get(row.modpack.id)))
  }
  for (const entry of report.editions ?? []) {
    if (!officialRows.some((row) => row.modpack.id === entry.packId)) add(blockers, `unexpected lifecycle entry ${entry.packId}`)
  }

  if (blockers.length) {
    console.error(`Official pack launcher lifecycle smoke verification failed with ${blockers.length} blocker(s):`)
    for (const blocker of blockers) console.error(`- ${blocker}`)
    if (args.strict) process.exit(1)
  } else {
    console.log(`Official pack launcher lifecycle smoke covers ${officialRows.length} official pack lane(s).`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
