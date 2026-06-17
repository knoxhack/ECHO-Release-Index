#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OUT = path.join('release-readiness', 'computer-use-gameplay-capture-attempt.json')
const SCHEMA_VERSION = 'echo.release_index.computer_use_gameplay_capture_attempt.v1'
const SCREENSHOT_STATUSES = new Set(['captured', 'failed', 'not-attempted'])
const LANES = new Set(['native', 'neoforge', 'standalone'])

function usage() {
  return `Usage:
  node scripts/record-computer-use-gameplay-capture-attempt.mjs --family Ashfall --lane neoforge --pack-id ashfall-neoforge-edition [options]

Records the latest platform-level visible Computer Use gameplay capture attempt.
This report is blocker/provenance evidence only. It never marks gameplay claims
true; screenshots, logs, notes, and save snapshots still have to be imported
through the lane/family gameplay evidence tooling.

Options:
  --root <path>                 Release Index root. Defaults to cwd.
  --out <path>                  Output JSON path. Defaults to release-readiness/computer-use-gameplay-capture-attempt.json.
  --generated-at <iso>          Timestamp. Defaults to current time.
  --family <name>               Target family, for example Ashfall.
  --lane <lane>                 native, neoforge, or standalone.
  --pack-id <id>                Target pack id.
  --launcher-instance <name>    Launcher instance name.
  --observed-app <d|t|running>  Observed app display name, window title, and running flag. Repeatable.
  --launcher-observed           Launcher window was observed.
  --launcher-selected-pack <v>  Selected pack read from accessibility/UI.
  --launcher-status <v>         Launcher status text.
  --launcher-play-button <v>    Launcher play button text.
  --launcher-preparing <v>      Launcher preparing/status text.
  --launcher-ready <v>          Launcher ready text.
  --screenshot-status <status>  captured, failed, or not-attempted. Defaults to failed.
  --screenshot-error <message>  Exact capture failure.
  --screenshot-api <name>       Capture API. Defaults to Windows.Graphics.Capture.
  --input-stopped               App input was stopped after capture failure.
  --imported-evidence-file <p>  Real imported evidence file path/reference. Repeatable.
  --blocker <text>              Blocker. Repeatable.
  --note <text>                 Note. Repeatable.
  --no-write                    Print without writing.
  --json                        Print report JSON.
  --help                        Show this help.`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    out: null,
    write: true,
    json: false,
    help: false,
    generatedAt: null,
    family: null,
    lane: null,
    packId: null,
    launcherInstance: null,
    observedApps: [],
    launcherObserved: false,
    launcherSelectedPack: null,
    launcherStatus: null,
    launcherPlayButton: null,
    launcherPreparing: null,
    launcherReady: null,
    screenshotStatus: 'failed',
    screenshotError: null,
    screenshotApi: 'Windows.Graphics.Capture',
    inputStopped: false,
    importedEvidenceFiles: [],
    blockers: [],
    notes: [],
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--generated-at') args.generatedAt = next()
    else if (arg === '--family') args.family = next()
    else if (arg === '--lane') args.lane = next().toLowerCase()
    else if (arg === '--pack-id') args.packId = next()
    else if (arg === '--launcher-instance') args.launcherInstance = next()
    else if (arg === '--observed-app') args.observedApps.push(parseObservedApp(next()))
    else if (arg === '--launcher-observed') args.launcherObserved = true
    else if (arg === '--launcher-selected-pack') args.launcherSelectedPack = next()
    else if (arg === '--launcher-status') args.launcherStatus = next()
    else if (arg === '--launcher-play-button') args.launcherPlayButton = next()
    else if (arg === '--launcher-preparing') args.launcherPreparing = next()
    else if (arg === '--launcher-ready') args.launcherReady = next()
    else if (arg === '--screenshot-status') args.screenshotStatus = next().toLowerCase()
    else if (arg === '--screenshot-error') args.screenshotError = next()
    else if (arg === '--screenshot-api') args.screenshotApi = next()
    else if (arg === '--input-stopped') args.inputStopped = true
    else if (arg === '--imported-evidence-file') args.importedEvidenceFiles.push(next())
    else if (arg === '--blocker') args.blockers.push(next())
    else if (arg === '--note') args.notes.push(next())
    else if (arg === '--no-write') args.write = false
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.out) args.out = path.join(args.root, DEFAULT_OUT)
  return args
}

function parseObservedApp(value) {
  const [displayName, windowTitle, running = 'true'] = value.split('|')
  if (!displayName || !windowTitle) {
    throw new Error('--observed-app must use displayName|windowTitle|running.')
  }
  return {
    displayName,
    windowTitle,
    running: !/^(false|0|no)$/iu.test(running.trim()),
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateArgs(args) {
  const errors = []
  if (!nonEmpty(args.family)) errors.push('--family is required.')
  if (!LANES.has(args.lane)) errors.push('--lane must be native, neoforge, or standalone.')
  if (!nonEmpty(args.packId)) errors.push('--pack-id is required.')
  if (!SCREENSHOT_STATUSES.has(args.screenshotStatus)) {
    errors.push(`--screenshot-status must be one of ${[...SCREENSHOT_STATUSES].join(', ')}.`)
  }
  if (args.screenshotStatus === 'failed' && !nonEmpty(args.screenshotError)) {
    errors.push('--screenshot-error is required when --screenshot-status failed.')
  }
  if (args.generatedAt && Number.isNaN(Date.parse(args.generatedAt))) {
    errors.push('--generated-at must be an ISO-compatible timestamp.')
  }
  if (errors.length) throw new Error(errors.join('\n'))
}

function unique(values) {
  return [...new Set(values.filter(nonEmpty).map((value) => value.trim()))]
}

function displayLane(lane) {
  const value = String(lane ?? '').toLowerCase()
  if (value === 'neoforge') return 'NeoForge'
  if (value === 'native') return 'Native'
  if (value === 'standalone') return 'Standalone'
  return String(lane ?? '').replace(/^\w/u, (match) => match.toUpperCase())
}

function buildReport(args) {
  validateArgs(args)
  const generatedAt = args.generatedAt ?? new Date().toISOString()
  const importedEvidenceFiles = unique(args.importedEvidenceFiles)
  const inferredBlockers = []
  if (args.screenshotStatus !== 'captured') {
    inferredBlockers.push('Computer Use window screenshot capture failed before visible gameplay screenshots could be recorded.')
  }
  if (args.launcherObserved || args.launcherSelectedPack || args.launcherStatus) {
    inferredBlockers.push('Launcher accessibility text is useful context but is not accepted as gameplay proof.')
  }
  if (importedEvidenceFiles.length === 0) {
    inferredBlockers.push(`No screenshots, gameplay logs, or save snapshots were imported for ${args.family} ${displayLane(args.lane)}.`)
  }
  const blockers = unique([...args.blockers, ...inferredBlockers])
  const status = blockers.length === 0 && args.screenshotStatus === 'captured'
    ? 'captured'
    : 'blocked'
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    status,
    scope: 'public-alpha-real-gameplay-capture',
    target: {
      family: args.family,
      lane: args.lane,
      packId: args.packId,
      launcherInstance: args.launcherInstance ?? null,
    },
    observedApps: args.observedApps,
    launcherWindow: {
      observed: args.launcherObserved,
      accessibility: {
        observed: Boolean(args.launcherSelectedPack || args.launcherStatus || args.launcherPlayButton || args.launcherPreparing || args.launcherReady),
        selectedPack: args.launcherSelectedPack ?? null,
        statusText: args.launcherStatus ?? null,
        playButtonText: args.launcherPlayButton ?? null,
        preparingText: args.launcherPreparing ?? null,
        readyText: args.launcherReady ?? null,
      },
    },
    screenshotCapture: {
      attempted: args.screenshotStatus !== 'not-attempted',
      status: args.screenshotStatus,
      api: args.screenshotApi,
      error: args.screenshotError ?? null,
    },
    inputStoppedAfterCaptureFailure: args.inputStopped,
    acceptedAsGameplayProof: false,
    claimsPromoted: false,
    importedEvidenceFiles,
    blockers,
    notes: unique([
      ...args.notes,
      'This report records an attempted visible Computer Use verification session only.',
      'It must not be used to mark gameplay evidence claims true.',
    ]),
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  const report = buildReport(args)
  if (args.write) await writeJson(args.out, report)
  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Computer Use gameplay capture attempt ${report.status}: ${report.target.family} ${displayLane(report.target.lane)}; ${report.blockers.length} blocker(s).`)
    if (args.write) console.log(`Wrote ${path.relative(args.root, args.out).replace(/\\/gu, '/')}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
