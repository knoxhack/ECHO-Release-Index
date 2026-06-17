#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OUT = path.join('release-readiness', 'computer-use-gameplay-capture-attempt.json')
const DEFAULT_HISTORY_OUT = path.join('release-readiness', 'computer-use-gameplay-capture-attempts.json')
const SCHEMA_VERSION = 'echo.release_index.computer_use_gameplay_capture_attempt.v1'
const HISTORY_SCHEMA_VERSION = 'echo.release_index.computer_use_gameplay_capture_attempts.v1'
const SCREENSHOT_STATUSES = new Set(['captured', 'failed', 'not-attempted'])
const VERIFICATION_CHECK_STATUSES = new Set(['captured', 'blocked', 'not-attempted'])
const PLAY_ACTIVATION_STATUSES = new Set(['activated', 'blocked', 'not-attempted'])
const LANES = new Set(['native', 'neoforge', 'standalone'])

function usage() {
  return `Usage:
  node scripts/record-computer-use-gameplay-capture-attempt.mjs --family Ashfall --lane neoforge --pack-id ashfall-neoforge-edition [options]

Records the latest platform-level visible Computer Use gameplay capture attempt.
Also appends it to release-readiness/computer-use-gameplay-capture-attempts.json
so multi-lane verification attempts are preserved instead of overwritten.
This report is blocker/provenance evidence only. It never marks gameplay claims
true; screenshots, logs, notes, and save snapshots still have to be imported
through the lane/family gameplay evidence tooling.

Options:
  --root <path>                 Release Index root. Defaults to cwd.
  --out <path>                  Output JSON path. Defaults to release-readiness/computer-use-gameplay-capture-attempt.json.
  --history-out <path>          History JSON path. Defaults to release-readiness/computer-use-gameplay-capture-attempts.json.
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
  --minecraft-launcher-observed Minecraft Launcher window was observed.
  --minecraft-launcher-profile <v>
                                Selected Minecraft Launcher profile/version text.
  --minecraft-launcher-play-button <v>
                                Minecraft Launcher play button text.
  --minecraft-launcher-play-activation-status <status>
                                activated, blocked, or not-attempted. Defaults to not-attempted.
  --minecraft-launcher-play-activation-method <v>
                                Method attempted, for example keyboard Return, UIA Invoke.
  --minecraft-launcher-play-activation-error <v>
                                Exact play activation failure or blocker.
  --minecraft-launcher-key-attempt <v>
                                Key attempt as key|result. Repeatable.
  --screenshot-status <status>  captured, failed, or not-attempted. Defaults to failed.
  --screenshot-error <message>  Exact capture failure.
  --screenshot-api <name>       Capture API. Defaults to Windows.Graphics.Capture.
  --input-stopped               App input was stopped after capture failure.
  --imported-evidence-file <p>  Real imported evidence file path/reference. Repeatable.
  --verification-check <v>      Gameplay/UI check as id|label|status|evidenceRef|note. Repeatable.
                                Status must be captured, blocked, or not-attempted.
                                Captured checks require a non-empty evidenceRef.
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
    historyOut: null,
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
    minecraftLauncherObserved: false,
    minecraftLauncherProfile: null,
    minecraftLauncherPlayButton: null,
    minecraftLauncherPlayActivationStatus: 'not-attempted',
    minecraftLauncherPlayActivationMethod: null,
    minecraftLauncherPlayActivationError: null,
    minecraftLauncherKeyAttempts: [],
    screenshotStatus: 'failed',
    screenshotError: null,
    screenshotApi: 'Windows.Graphics.Capture',
    inputStopped: false,
    importedEvidenceFiles: [],
    verificationChecks: [],
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
    else if (arg === '--history-out') args.historyOut = path.resolve(next())
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
    else if (arg === '--minecraft-launcher-observed') args.minecraftLauncherObserved = true
    else if (arg === '--minecraft-launcher-profile') args.minecraftLauncherProfile = next()
    else if (arg === '--minecraft-launcher-play-button') args.minecraftLauncherPlayButton = next()
    else if (arg === '--minecraft-launcher-play-activation-status') args.minecraftLauncherPlayActivationStatus = next().toLowerCase()
    else if (arg === '--minecraft-launcher-play-activation-method') args.minecraftLauncherPlayActivationMethod = next()
    else if (arg === '--minecraft-launcher-play-activation-error') args.minecraftLauncherPlayActivationError = next()
    else if (arg === '--minecraft-launcher-key-attempt') args.minecraftLauncherKeyAttempts.push(parseKeyAttempt(next()))
    else if (arg === '--screenshot-status') args.screenshotStatus = next().toLowerCase()
    else if (arg === '--screenshot-error') args.screenshotError = next()
    else if (arg === '--screenshot-api') args.screenshotApi = next()
    else if (arg === '--input-stopped') args.inputStopped = true
    else if (arg === '--imported-evidence-file') args.importedEvidenceFiles.push(next())
    else if (arg === '--verification-check') args.verificationChecks.push(parseVerificationCheck(next()))
    else if (arg === '--blocker') args.blockers.push(next())
    else if (arg === '--note') args.notes.push(next())
    else if (arg === '--no-write') args.write = false
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.out) args.out = path.join(args.root, DEFAULT_OUT)
  if (!args.historyOut) args.historyOut = path.join(args.root, DEFAULT_HISTORY_OUT)
  return args
}

function parseKeyAttempt(value) {
  const [key, result = ''] = value.split('|')
  if (!key) throw new Error('--minecraft-launcher-key-attempt must use key|result.')
  return {
    key: key.trim(),
    result: result.trim() || null,
  }
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

function parseVerificationCheck(value) {
  const [id, label, status, evidenceRef = '', note = ''] = value.split('|')
  if (!id || !label || !status) {
    throw new Error('--verification-check must use id|label|status|evidenceRef|note.')
  }
  return {
    id: id.trim(),
    label: label.trim(),
    status: status.trim().toLowerCase(),
    evidenceRef: evidenceRef.trim() || null,
    note: note.trim() || null,
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
  if (!PLAY_ACTIVATION_STATUSES.has(args.minecraftLauncherPlayActivationStatus)) {
    errors.push(`--minecraft-launcher-play-activation-status must be one of ${[...PLAY_ACTIVATION_STATUSES].join(', ')}.`)
  }
  if (args.minecraftLauncherPlayActivationStatus === 'blocked' && !nonEmpty(args.minecraftLauncherPlayActivationError)) {
    errors.push('--minecraft-launcher-play-activation-error is required when --minecraft-launcher-play-activation-status blocked.')
  }
  for (const attempt of args.minecraftLauncherKeyAttempts) {
    if (!nonEmpty(attempt.key)) errors.push('--minecraft-launcher-key-attempt key is required.')
  }
  if (args.screenshotStatus === 'failed' && !nonEmpty(args.screenshotError)) {
    errors.push('--screenshot-error is required when --screenshot-status failed.')
  }
  if (args.generatedAt && Number.isNaN(Date.parse(args.generatedAt))) {
    errors.push('--generated-at must be an ISO-compatible timestamp.')
  }
  for (const check of args.verificationChecks) {
    if (!nonEmpty(check.id)) errors.push('--verification-check id is required.')
    if (!nonEmpty(check.label)) errors.push('--verification-check label is required.')
    if (!VERIFICATION_CHECK_STATUSES.has(check.status)) {
      errors.push(`--verification-check status for ${check.id || 'unknown'} must be one of ${[...VERIFICATION_CHECK_STATUSES].join(', ')}.`)
    }
    if (check.status === 'captured' && !nonEmpty(check.evidenceRef)) {
      errors.push(`--verification-check ${check.id || 'unknown'} captured status requires an evidenceRef.`)
    }
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
  const verificationChecks = args.verificationChecks.map((check) => ({
    id: check.id,
    label: check.label,
    status: check.status,
    evidenceRef: check.evidenceRef,
    note: check.note,
  }))
  const inferredBlockers = []
  if (args.screenshotStatus === 'failed') {
    inferredBlockers.push('Computer Use window screenshot capture failed before visible gameplay screenshots could be recorded.')
  } else if (args.screenshotStatus === 'not-attempted') {
    inferredBlockers.push('Computer Use window screenshot capture was not attempted, so visible gameplay screenshots were not recorded.')
  }
  if (args.launcherObserved || args.launcherSelectedPack || args.launcherStatus) {
    inferredBlockers.push('Launcher accessibility text is useful context but is not accepted as gameplay proof.')
  }
  if (args.minecraftLauncherObserved || args.minecraftLauncherProfile || args.minecraftLauncherPlayButton) {
    inferredBlockers.push('Minecraft Launcher accessibility text proves official-launcher handoff/profile selection only; it is not accepted as gameplay proof.')
  }
  if (args.minecraftLauncherPlayActivationStatus === 'blocked') {
    inferredBlockers.push('Minecraft Launcher play activation was blocked before the Java client could start.')
  } else if (args.minecraftLauncherPlayActivationStatus === 'not-attempted' && (args.minecraftLauncherObserved || args.minecraftLauncherProfile || args.minecraftLauncherPlayButton)) {
    inferredBlockers.push('Minecraft Launcher play activation was not attempted or not recorded, so no Java client start was proven.')
  } else if (args.minecraftLauncherPlayActivationStatus === 'activated' && importedEvidenceFiles.length === 0) {
    inferredBlockers.push('Minecraft Launcher play activation was recorded, but no imported gameplay screenshots, logs, or save snapshots prove in-game state.')
  }
  if (importedEvidenceFiles.length === 0) {
    inferredBlockers.push(`No screenshots, gameplay logs, or save snapshots were imported for ${args.family} ${displayLane(args.lane)}.`)
  }
  for (const check of verificationChecks) {
    if (check.status === 'captured') continue
    inferredBlockers.push(`Computer Use verification check ${check.id} (${check.label}) was ${check.status}.`)
  }
  const blockers = unique([...args.blockers, ...inferredBlockers])
  const status = blockers.length === 0 && args.screenshotStatus === 'captured'
    ? 'captured'
    : 'blocked'
  return {
    schemaVersion: SCHEMA_VERSION,
    attemptId: attemptId({
      generatedAt,
      family: args.family,
      lane: args.lane,
      packId: args.packId,
    }),
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
    minecraftLauncher: {
      observed: args.minecraftLauncherObserved,
      selectedProfile: args.minecraftLauncherProfile ?? null,
      playButtonText: args.minecraftLauncherPlayButton ?? null,
      playActivation: {
        status: args.minecraftLauncherPlayActivationStatus,
        method: args.minecraftLauncherPlayActivationMethod ?? null,
        error: args.minecraftLauncherPlayActivationError ?? null,
        keyAttempts: args.minecraftLauncherKeyAttempts,
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
    verificationChecks,
    verificationSummary: {
      checkCount: verificationChecks.length,
      capturedCount: verificationChecks.filter((check) => check.status === 'captured').length,
      blockedCount: verificationChecks.filter((check) => check.status === 'blocked').length,
      notAttemptedCount: verificationChecks.filter((check) => check.status === 'not-attempted').length,
    },
    blockers,
    notes: unique([
      ...args.notes,
      'This report records an attempted visible Computer Use verification session only.',
      'It must not be used to mark gameplay evidence claims true.',
    ]),
  }
}

function attemptId({ generatedAt, family, lane, packId }) {
  const parts = [generatedAt, family, lane, packId]
    .map((value) => String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, ''))
    .filter(Boolean)
  return parts.join('__')
}

function attemptKey(report) {
  return report?.attemptId
    ?? attemptId({
      generatedAt: report?.generatedAt,
      family: report?.target?.family,
      lane: report?.target?.lane,
      packId: report?.target?.packId,
    })
}

async function readJson(filePath, { optional = false } = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null
    throw error
  }
}

async function buildHistory(args, report) {
  const existing = await readJson(args.historyOut, { optional: true })
  if (existing && existing.schemaVersion !== HISTORY_SCHEMA_VERSION) {
    throw new Error(`${path.relative(args.root, args.historyOut).replace(/\\/gu, '/')} schemaVersion is ${existing.schemaVersion ?? 'missing'}, expected ${HISTORY_SCHEMA_VERSION}.`)
  }
  const attemptsByKey = new Map()
  for (const attempt of Array.isArray(existing?.attempts) ? existing.attempts : []) {
    attemptsByKey.set(attemptKey(attempt), attempt)
  }
  attemptsByKey.set(attemptKey(report), report)
  const attempts = [...attemptsByKey.values()]
    .sort((left, right) => String(left.generatedAt ?? '').localeCompare(String(right.generatedAt ?? '')))
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    scope: 'public-alpha-real-gameplay-capture-history',
    latestAttemptId: report.attemptId,
    attemptCount: attempts.length,
    attempts,
    notes: [
      'This history preserves Computer Use gameplay verification attempts across families and lanes.',
      'Entries are non-promotional blocker/provenance evidence until required screenshots, logs, notes, and save snapshots are imported through gameplay evidence tooling.',
    ],
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
  let history = null
  if (args.write) {
    await writeJson(args.out, report)
    history = await buildHistory(args, report)
    await writeJson(args.historyOut, history)
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Computer Use gameplay capture attempt ${report.status}: ${report.target.family} ${displayLane(report.target.lane)}; ${report.blockers.length} blocker(s).`)
    if (args.write) console.log(`Wrote ${path.relative(args.root, args.out).replace(/\\/gu, '/')}`)
    if (args.write) console.log(`Wrote ${path.relative(args.root, args.historyOut).replace(/\\/gu, '/')}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
