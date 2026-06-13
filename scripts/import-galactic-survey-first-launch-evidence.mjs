#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OUT = 'release-readiness/galactic-survey-first-launch-open-play.json'
const DEFAULT_DOWNLOAD_EVIDENCE = 'release-readiness/galactic-survey-draft-download.json'
const SCHEMA_VERSION = 'echo.galactic_survey.first-launch-open-play.v1'
const TEMPLATE_MARKER = 'ECHO_GALACTIC_SURVEY_FIRST_LAUNCH_TEMPLATE_ONLY'
const REQUIRED_OPTIONS = ['captureRoot', 'artifact', 'tester', 'worldOrProfile', 'startedAt']
const REQUIRED_CLAIMS = [
  'echoManagedProfileVisible',
  'officialMinecraftLauncherOpened',
  'packProfileSelected',
  'firstPlayOpenedWorldOrTitle',
  'noCrashEvidence',
  'supportBundleCaptured'
]
const REQUIRED_CAPTURE_FILES = [
  {
    group: 'notes',
    relPath: 'launcher-handoff-notes.md',
    type: 'text',
    claim: 'echoManagedProfileVisible'
  },
  {
    group: 'notes',
    relPath: 'official-launcher-open-notes.md',
    type: 'text',
    claim: 'officialMinecraftLauncherOpened'
  },
  {
    group: 'notes',
    relPath: 'first-open-play-notes.md',
    type: 'text',
    claim: 'firstPlayOpenedWorldOrTitle'
  },
  {
    group: 'notes',
    relPath: 'no-crash-review.md',
    type: 'text',
    claim: 'noCrashEvidence'
  },
  {
    group: 'screenshots',
    relPath: 'screenshots/echo-managed-profile.png',
    type: 'png',
    claim: 'echoManagedProfileVisible'
  },
  {
    group: 'screenshots',
    relPath: 'screenshots/minecraft-launcher-open.png',
    type: 'png',
    claim: 'officialMinecraftLauncherOpened'
  },
  {
    group: 'screenshots',
    relPath: 'screenshots/pack-profile-selected.png',
    type: 'png',
    claim: 'packProfileSelected'
  },
  {
    group: 'screenshots',
    relPath: 'screenshots/world-or-title-loaded.png',
    type: 'png',
    claim: 'firstPlayOpenedWorldOrTitle'
  },
  {
    group: 'logs',
    relPath: 'logs/echo-launcher-latest.log',
    type: 'text',
    claim: 'echoManagedProfileVisible'
  },
  {
    group: 'logs',
    relPath: 'logs/minecraft-client.log',
    type: 'text',
    claim: 'firstPlayOpenedWorldOrTitle'
  },
  {
    group: 'supportBundles',
    relPath: 'support-bundles/echo-launcher-support.zip',
    type: 'zip',
    claim: 'supportBundleCaptured'
  }
]

function usage() {
  return `Usage: node scripts/import-galactic-survey-first-launch-evidence.mjs --capture-root <path> --artifact <path> --tester <name> --world-or-profile <name> --started-at <iso> [options]

Imports real first-launch/open-play evidence for Galactic Survey into the
Release Index. The capture root must contain these files:

  launcher-handoff-notes.md
  official-launcher-open-notes.md
  first-open-play-notes.md
  no-crash-review.md
  screenshots/echo-managed-profile.png
  screenshots/minecraft-launcher-open.png
  screenshots/pack-profile-selected.png
  screenshots/world-or-title-loaded.png
  logs/echo-launcher-latest.log
  logs/minecraft-client.log
  support-bundles/echo-launcher-support.zip

Options:
  --root <path>               Release Index root. Default: current directory.
  --out <path>                Output report path. Default: ${DEFAULT_OUT}
  --download-evidence <path>  GitHub download-back report. Default: ${DEFAULT_DOWNLOAD_EVIDENCE}
  --pack-id <id>              Pack id. Default: galactic-survey-native-edition
  --capture-root <path>       Folder containing real launcher/open-play evidence.
  --artifact <path>           Published pack ZIP used for the run.
  --tester <name>             Tester/device/run identifier.
  --world-or-profile <name>   World or launcher profile used for the run.
  --started-at <iso>          Real run start timestamp.
  --runtime-mode <mode>       Default: official-minecraft-launcher-handoff.
  --launcher-channel <name>   Default: alpha.
  --dry-run                   Validate and print the import report only.
  --force                     Replace an existing output report.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    out: DEFAULT_OUT,
    downloadEvidence: DEFAULT_DOWNLOAD_EVIDENCE,
    packId: 'galactic-survey-native-edition',
    captureRoot: '',
    artifact: '',
    tester: '',
    worldOrProfile: '',
    startedAt: '',
    runtimeMode: 'official-minecraft-launcher-handoff',
    launcherChannel: 'alpha',
    dryRun: false,
    force: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--out') args.out = next()
    else if (arg === '--download-evidence') args.downloadEvidence = next()
    else if (arg === '--pack-id') args.packId = next()
    else if (arg === '--capture-root') args.captureRoot = path.resolve(next())
    else if (arg === '--artifact') args.artifact = path.resolve(next())
    else if (arg === '--tester') args.tester = next()
    else if (arg === '--world-or-profile') args.worldOrProfile = next()
    else if (arg === '--started-at') args.startedAt = next()
    else if (arg === '--runtime-mode') args.runtimeMode = next()
    else if (arg === '--launcher-channel') args.launcherChannel = next()
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--force') args.force = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function resolveInside(root, relPath) {
  if (typeof relPath !== 'string' || relPath.trim() === '' || path.isAbsolute(relPath)) {
    return { error: 'relative-path-required' }
  }
  const base = path.resolve(root)
  const target = path.resolve(base, relPath)
  const relative = path.relative(base, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { error: 'outside-root', target }
  return { target }
}

async function fileExists(filePath) {
  try {
    return (await fs.stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function fileDigest(filePath) {
  const bytes = await fs.readFile(filePath)
  const stat = await fs.stat(filePath)
  return {
    size: stat.size,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes
  }
}

function assertIsoDate(value, label, blockers) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp <= Date.parse('2020-01-01T00:00:00Z')) {
    blockers.push(`${label} must be a real ISO timestamp after 2020-01-01.`)
    return null
  }
  return new Date(timestamp)
}

function relativeCapturePath(filePath, captureRoot) {
  return path.relative(captureRoot, filePath).replace(/\\/g, '/')
}

function validateTextCapture(bytes, filePath, blockers) {
  const text = bytes.toString('utf8')
  if (text.trim().length < 40) blockers.push(`${filePath} must contain real notes, not a one-line placeholder.`)
  if (text.includes(TEMPLATE_MARKER)) blockers.push(`${filePath} still contains template marker ${TEMPLATE_MARKER}.`)
  if (/\bTBD\b|\bTODO\b|placeholder|template only/iu.test(text)) blockers.push(`${filePath} still looks like placeholder text.`)
}

function validatePngCapture(bytes, filePath, blockers) {
  const pngSignature = '89504e470d0a1a0a'
  if (bytes.subarray(0, 8).toString('hex') !== pngSignature) blockers.push(`${filePath} is not a PNG file.`)
}

function validateZipCapture(bytes, filePath, blockers) {
  const signature = bytes.subarray(0, 4).toString('hex')
  if (signature !== '504b0304' && signature !== '504b0506' && signature !== '504b0708') {
    blockers.push(`${filePath} is not a ZIP file.`)
  }
}

async function validateCaptureFile({ captureRoot, spec, blockers }) {
  const source = path.join(captureRoot, spec.relPath)
  if (!(await fileExists(source))) {
    blockers.push(`capture file missing for ${spec.relPath}: ${source}`)
    return null
  }
  const digest = await fileDigest(source)
  if (digest.size < 1) blockers.push(`capture file is empty for ${spec.relPath}: ${source}`)
  if (spec.type === 'text') validateTextCapture(digest.bytes, source, blockers)
  if (spec.type === 'png') validatePngCapture(digest.bytes, source, blockers)
  if (spec.type === 'zip') validateZipCapture(digest.bytes, source, blockers)
  return {
    group: spec.group,
    claim: spec.claim,
    relativePath: relativeCapturePath(source, captureRoot),
    size: digest.size,
    sha256: digest.sha256
  }
}

function findExpectedDownloadedAsset(downloadEvidence, packId) {
  if (downloadEvidence?.status !== 'PASS') return null
  if (downloadEvidence?.summary?.downloadedFromGitHubRelease !== true) return null
  const edition = downloadEvidence?.data?.editions?.find((entry) => entry?.packId === packId)
  if (!edition) return null
  return edition.downloadedAssets?.find((asset) => String(asset?.name ?? '').endsWith('.zip')) ?? null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const root = path.resolve(args.root)
  const blockers = []
  for (const option of REQUIRED_OPTIONS) {
    if (!String(args[option] ?? '').trim()) blockers.push(`--${option.replace(/[A-Z]/gu, (char) => `-${char.toLowerCase()}`)} is required.`)
  }
  const startedAt = assertIsoDate(args.startedAt, '--started-at', blockers)
  const outPath = resolveInside(root, args.out)
  const downloadEvidencePath = resolveInside(root, args.downloadEvidence)
  if (outPath.error) blockers.push(`Output path must stay inside the Release Index: ${args.out}`)
  if (downloadEvidencePath.error) blockers.push(`Download evidence path must stay inside the Release Index: ${args.downloadEvidence}`)

  const captureRootStat = await fs.stat(args.captureRoot).catch(() => null)
  if (!captureRootStat?.isDirectory()) blockers.push(`capture root does not exist or is not a directory: ${args.captureRoot}`)
  if (!(await fileExists(args.artifact))) blockers.push(`artifact does not exist: ${args.artifact}`)
  if (!args.packId.startsWith('galactic-survey-')) blockers.push(`pack id must be a Galactic Survey pack id: ${args.packId}`)
  if (await fileExists(outPath.target) && !args.force && !args.dryRun) blockers.push(`${args.out} already exists; pass --force to replace it.`)

  const artifactDigest = await fileDigest(args.artifact).catch(() => null)
  const downloadEvidence = downloadEvidencePath.error ? null : await readJsonOrNull(downloadEvidencePath.target)
  const expectedDownloadedAsset = findExpectedDownloadedAsset(downloadEvidence, args.packId)
  const artifactMatchesDownloadedRelease = Boolean(
    artifactDigest &&
    expectedDownloadedAsset &&
    expectedDownloadedAsset.size === artifactDigest.size &&
    expectedDownloadedAsset.sha256 === artifactDigest.sha256
  )
  if (!expectedDownloadedAsset) blockers.push(`${args.downloadEvidence} does not contain a PASS GitHub download-back ZIP asset for ${args.packId}.`)
  else if (!artifactMatchesDownloadedRelease) {
    blockers.push(`artifact ${path.basename(args.artifact)} does not match downloaded GitHub asset ${expectedDownloadedAsset.name}.`)
  }

  const evidenceFiles = []
  if (captureRootStat?.isDirectory()) {
    for (const spec of REQUIRED_CAPTURE_FILES) {
      const captureFile = await validateCaptureFile({ captureRoot: args.captureRoot, spec, blockers })
      if (captureFile) evidenceFiles.push(captureFile)
    }
  }

  const claims = Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [
    claim,
    blockers.length === 0 && evidenceFiles.some((file) => file.claim === claim)
  ]))
  const gates = {
    checksumBackedPublishedArtifact: artifactMatchesDownloadedRelease ? 'passed' : 'blocked',
    echoManagedProfileVisible: claims.echoManagedProfileVisible ? 'passed' : 'blocked',
    officialMinecraftLauncherOpened: claims.officialMinecraftLauncherOpened ? 'passed' : 'blocked',
    packProfileSelected: claims.packProfileSelected ? 'passed' : 'blocked',
    firstPlayOpenedWorldOrTitle: claims.firstPlayOpenedWorldOrTitle ? 'passed' : 'blocked',
    noCrashEvidence: claims.noCrashEvidence ? 'passed' : 'blocked',
    supportBundleCaptured: claims.supportBundleCaptured ? 'passed' : 'blocked',
    firstLaunchOpenPlayEvidence: blockers.length === 0 ? 'passed' : 'blocked'
  }
  const status = blockers.length ? 'BLOCKED' : 'PASS'
  const report = {
    schemaVersion: SCHEMA_VERSION,
    status,
    mode: args.dryRun ? 'dry-run' : 'write',
    generatedAt: new Date().toISOString(),
    packId: args.packId,
    runtimeMode: args.runtimeMode,
    launcherChannel: args.launcherChannel,
    requiredClaims: REQUIRED_CLAIMS,
    claims,
    gates,
    run: {
      tester: args.tester,
      worldOrProfile: args.worldOrProfile,
      startedAt: startedAt?.toISOString() ?? args.startedAt,
      importedAt: new Date().toISOString()
    },
    artifact: artifactDigest
      ? {
          path: args.artifact,
          name: path.basename(args.artifact),
          size: artifactDigest.size,
          sha256: artifactDigest.sha256,
          expectedDownloadedAsset: expectedDownloadedAsset
            ? {
                name: expectedDownloadedAsset.name,
                size: expectedDownloadedAsset.size,
                sha256: expectedDownloadedAsset.sha256
              }
            : null,
          matchesDownloadedRelease: artifactMatchesDownloadedRelease
        }
      : null,
    capture: {
      captureRoot: args.captureRoot,
      fileCount: evidenceFiles.length,
      totalBytes: evidenceFiles.reduce((sum, file) => sum + file.size, 0),
      files: evidenceFiles
    },
    blockers
  }

  if (!args.dryRun && status === 'PASS') {
    await fs.mkdir(path.dirname(outPath.target), { recursive: true })
    await fs.writeFile(outPath.target, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  console.log(JSON.stringify(report, null, 2))
  if (status !== 'PASS') process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
