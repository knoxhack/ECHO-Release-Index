#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_MATRIX = path.join('release-readiness', 'gameplay-acceptance-matrix.json')
const DEFAULT_LATEST_ATTEMPT = path.join('release-readiness', 'computer-use-gameplay-capture-attempt.json')
const DEFAULT_ATTEMPTS = path.join('release-readiness', 'computer-use-gameplay-capture-attempts.json')
const DEFAULT_OUT = path.join('release-readiness', 'computer-use-gameplay-capture-work-order.json')
const DEFAULT_MARKDOWN = path.join('docs', 'computer-use-gameplay-capture-work-order.md')

const SCHEMA_VERSION = 'echo.release_index.computer_use_gameplay_capture_work_order.v1'

const LANE_LABELS = {
  native: 'Native',
  neoforge: 'NeoForge',
  standalone: 'Standalone',
}

const CHECK_LABELS = {
  clientStarted: 'Client/game window started',
  mainMenuNativeReplacement: 'Native main menu replacement visible',
  worldCreatedOrLoaded: 'World or profile loaded',
  freshWorldCreated: 'Fresh world/profile created',
  hudVisible: 'HUD visible',
  inventoryIndexVisible: 'Inventory Index visible after opening inventory',
  terminalVisible: 'Terminal visible',
  holomapVisible: 'HoloMap visible',
  lensVisible: 'Lens visible',
  creativeTabVisible: 'Creative tab visible',
  creativeTabSearchVisible: 'Creative tab search visible',
  creativeItemSelectable: 'Creative item selectable',
  creativeItemPlayable: 'Creative item usable in world',
  realFirst30Playthrough: 'First 30 minutes captured',
  realFirst2HourPlaythrough: 'First 2 hours captured',
  realSignalCrownPlaythrough: 'Signal Crown objective completed',
  realSurveyArrayPlaythrough: 'Survey Array objective completed',
  primaryObjectiveCompleted: 'Primary objective completed',
  saveReloadVerified: 'Save/reload verified',
  noCrashEvidence: 'No-crash review completed',
}

const FAMILY_KEYS = {
  Ashfall: 'ashfall',
  'Sky Relay': 'sky-relay',
  'Galactic Survey': 'galactic-survey',
  Openlands: 'openlands',
  'Arcana Division': 'arcana-division',
}

const FAMILY_ORDER = ['Ashfall', 'Sky Relay', 'Galactic Survey', 'Openlands', 'Arcana Division']

function usage() {
  return `Usage:
  node scripts/generate-computer-use-gameplay-capture-work-order.mjs --write
  node scripts/generate-computer-use-gameplay-capture-work-order.mjs --no-markdown --json

Generates the platform-level Computer Use gameplay capture work order from the
current gameplay acceptance matrix. The output is a queue for visible UI-driven
gameplay verification. It is not proof by itself and never promotes gameplay
claims; screenshots, logs, notes, and save snapshots must still be imported
through the owning family or edition evidence tooling.`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    matrix: null,
    latestAttempt: null,
    attempts: null,
    out: null,
    markdown: null,
    write: false,
    markdownEnabled: true,
    json: false,
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
    else if (arg === '--matrix') args.matrix = path.resolve(args.root, next())
    else if (arg === '--latest-attempt') args.latestAttempt = path.resolve(args.root, next())
    else if (arg === '--attempts') args.attempts = path.resolve(args.root, next())
    else if (arg === '--out') args.out = path.resolve(args.root, next())
    else if (arg === '--markdown') args.markdown = path.resolve(args.root, next())
    else if (arg === '--write') args.write = true
    else if (arg === '--no-markdown') args.markdownEnabled = false
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  args.matrix ??= path.join(args.root, DEFAULT_MATRIX)
  args.latestAttempt ??= path.join(args.root, DEFAULT_LATEST_ATTEMPT)
  args.attempts ??= path.join(args.root, DEFAULT_ATTEMPTS)
  args.out ??= path.join(args.root, DEFAULT_OUT)
  args.markdown ??= path.join(args.root, DEFAULT_MARKDOWN)
  return args
}

async function readJson(filePath, { optional = false } = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null
    throw error
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/gu, '/')
}

function normalized(value) {
  return String(value ?? '').trim().toLowerCase()
}

function laneLabel(lane) {
  return LANE_LABELS[lane] ?? String(lane ?? '')
}

function familyKey(family) {
  return FAMILY_KEYS[family] ?? normalized(family).replace(/\s+/gu, '-')
}

function laneTitle(target) {
  return `${target.family} ${laneLabel(target.lane)}`
}

function workspaceFromRepo(sourceRepo) {
  return String(sourceRepo ?? '').split('/').pop() || null
}

function check(id, options = {}) {
  return {
    id,
    label: options.label ?? CHECK_LABELS[id] ?? id,
    requiredEvidence: options.requiredEvidence ?? ['screenshot', 'log-or-notes'],
    captureHint: options.captureHint ?? null,
  }
}

function genericUiChecks() {
  return [
    check('freshWorldCreated', {
      requiredEvidence: ['notes', 'screenshot', 'launcher-log', 'client-log'],
      captureHint: 'Start from a fresh install plus fresh world/profile.',
    }),
    check('hudVisible', {
      requiredEvidence: ['screenshot'],
      captureHint: 'Capture the in-game HUD after the world/profile is loaded.',
    }),
    check('inventoryIndexVisible', {
      requiredEvidence: ['screenshot'],
      captureHint: 'Open inventory and capture the Index or equivalent catalog surface.',
    }),
    check('terminalVisible', {
      requiredEvidence: ['screenshot'],
      captureHint: 'Open Terminal from the in-game UI or assigned key path.',
    }),
    check('holomapVisible', {
      requiredEvidence: ['screenshot'],
      captureHint: 'Open HoloMap or the family equivalent map/navigation surface.',
    }),
  ]
}

function timedGameplayChecks() {
  return [
    check('realFirst30Playthrough', {
      requiredEvidence: ['notes', 'screenshot', 'client-log', 'save-snapshot'],
      captureHint: 'Capture a real first 30-minute run from the fresh world/profile.',
    }),
    check('realFirst2HourPlaythrough', {
      requiredEvidence: ['notes', 'screenshot', 'client-log', 'save-snapshot'],
      captureHint: 'Capture a real first 2-hour run from the same release lane.',
    }),
  ]
}

function familyChecks(family, lane, claims = {}) {
  if (family === 'Ashfall') {
    const ids = [
      'clientStarted',
      ...(lane === 'native' ? ['mainMenuNativeReplacement'] : []),
      'worldCreatedOrLoaded',
      'hudVisible',
      'inventoryIndexVisible',
      'terminalVisible',
      'holomapVisible',
      'lensVisible',
      'creativeTabVisible',
      'creativeTabSearchVisible',
      'creativeItemSelectable',
      'creativeItemPlayable',
      'saveReloadVerified',
    ]
    return ids.map((id) => check(id, {
      requiredEvidence: ashfallEvidenceFor(id),
      captureHint: ashfallHintFor(id),
    }))
  }

  const checks = [
    ...genericUiChecks(),
    ...timedGameplayChecks(),
  ]
  if (family === 'Sky Relay') {
    checks.push(check('realSignalCrownPlaythrough', {
      requiredEvidence: ['notes', 'screenshot', 'client-log', 'save-snapshot'],
      captureHint: 'Complete the Signal Crown objective and capture the completion state.',
    }))
  } else if (family === 'Galactic Survey') {
    checks.push(check('realSurveyArrayPlaythrough', {
      requiredEvidence: ['notes', 'screenshot', 'client-log', 'save-snapshot'],
      captureHint: 'Complete the Survey Array objective and capture the completion state.',
    }))
  } else {
    checks.push(check('primaryObjectiveCompleted', {
      requiredEvidence: ['notes', 'screenshot', 'client-log', 'save-snapshot'],
      captureHint: `${family} primary route or systems objective must be completed and recorded.`,
    }))
  }
  checks.push(
    check('saveReloadVerified', {
      requiredEvidence: ['client-log', 'save-snapshot'],
      captureHint: 'Save, exit or return to launcher/menu, reload, then capture the restored state.',
    }),
    check('noCrashEvidence', {
      requiredEvidence: ['notes', 'launcher-log', 'client-log'],
      captureHint: 'Review logs/crash reports after the run and record a no-crash note.',
    }),
  )

  const claimIds = new Set(Object.keys(claims ?? {}))
  return checks.filter((entry) => claimIds.size === 0 || claimIds.has(entry.id) || entry.id.includes('Visible'))
}

function ashfallEvidenceFor(id) {
  if (id === 'clientStarted') return ['launcher-log', 'client-log']
  if (id === 'saveReloadVerified') return ['client-log', 'save-snapshot']
  if (id === 'creativeItemPlayable') return ['screenshot', 'client-log', 'save-snapshot']
  return ['screenshot']
}

function ashfallHintFor(id) {
  const hints = {
    clientStarted: 'Launch the lane from ECHO Launcher and capture the game/client start log.',
    mainMenuNativeReplacement: 'Native lane only: capture the ECHO/Ashfall native main menu replacement.',
    worldCreatedOrLoaded: 'Create or load a fresh Ashfall world/profile and capture it after load.',
    hudVisible: 'Capture the in-game HUD after world entry.',
    inventoryIndexVisible: 'Open inventory and capture the Index surface.',
    terminalVisible: 'Open Terminal and capture it.',
    holomapVisible: 'Open HoloMap and capture it.',
    lensVisible: 'Open or equip Lens and capture the visible Lens UI/effect.',
    creativeTabVisible: 'Open creative inventory and capture the ECHO/Ashfall creative tab.',
    creativeTabSearchVisible: 'Use creative search and capture the result.',
    creativeItemSelectable: 'Select an ECHO/Ashfall creative item and capture the selection.',
    creativeItemPlayable: 'Use the selected item in the world and capture the visible effect/log.',
    saveReloadVerified: 'Save, reload, and capture the restored world/profile state.',
  }
  return hints[id] ?? null
}

function latestMatchingAttempt(attempts, family, lane, packId) {
  const matches = attempts.filter((attempt) =>
    normalized(attempt?.target?.family) === normalized(family)
      && normalized(attempt?.target?.lane) === normalized(lane)
      && (!attempt?.target?.packId || normalized(attempt.target.packId) === normalized(packId)))
  return matches[matches.length - 1] ?? null
}

function attemptKey(attempt) {
  return [
    attempt?.attemptId,
    attempt?.generatedAt,
    attempt?.target?.family,
    attempt?.target?.lane,
    attempt?.target?.packId,
  ].map(normalized).join('|')
}

function allAttempts(latest, history) {
  const entries = []
  if (Array.isArray(history?.attempts)) entries.push(...history.attempts)
  if (latest) entries.push(latest)
  const deduped = new Map()
  for (const attempt of entries) deduped.set(attemptKey(attempt), attempt)
  return [...deduped.values()]
    .sort((left, right) => String(left.generatedAt ?? '').localeCompare(String(right.generatedAt ?? '')))
}

function checkStatusFromAttempt(attempt, id) {
  const found = (attempt?.verificationChecks ?? []).find((entry) => entry.id === id)
  return {
    status: found?.status ?? 'not-attempted',
    evidenceRef: found?.evidenceRef ?? null,
    note: found?.note ?? null,
  }
}

function recorderCommand(target, checks) {
  const parts = [
    'node scripts\\record-computer-use-gameplay-capture-attempt.mjs',
    `--family "${target.family}"`,
    `--lane ${target.lane}`,
    `--pack-id ${target.packId}`,
    `--launcher-instance "${target.launcherInstance}"`,
    '--screenshot-status not-attempted',
    '--note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture."',
  ]
  for (const item of checks) {
    parts.push(`--verification-check "${item.id}|${item.label}|not-attempted||Pending real visible capture."`)
  }
  return parts.join(' ')
}

function captureCommands(family, lane, packId, workspaceDir) {
  const familySlug = familyKey(family)
  if (family === 'Ashfall') {
    return {
      prepare: [
        'Set-Location ..\\ECHO-Launcher',
        `npm run assist:ashfall-lane-game-capture -- --lane ${lane} --json`,
      ],
      importOrRefresh: [
        'Set-Location ..\\ECHO-Launcher',
        `node scripts\\ashfall-lane-game-capture-assist.mjs --lane ${lane} --claim <claim>=proofs\\screenshots\\<proof>.png --json --strict`,
        'npm run test:e2e:ashfall-lane-game-smoke',
      ],
      centralRefresh: [
        'Set-Location ..\\ECHO-Release-Index',
        'node scripts\\verify-gameplay-acceptance.mjs',
      ],
    }
  }
  if (family === 'Sky Relay') {
    return {
      prepare: [
        `Set-Location ..\\${workspaceDir}`,
        'node scripts\\init-manual-gameplay-evidence.mjs',
        'node scripts\\verify-manual-gameplay-evidence.mjs --template-only',
      ],
      importOrRefresh: [
        `Set-Location ..\\${workspaceDir}`,
        'node scripts\\verify-manual-gameplay-evidence.mjs --require-release-ready',
      ],
      centralRefresh: [
        'Set-Location ..\\ECHO-Release-Index',
        'node scripts\\verify-sky-relay-gameplay-evidence.mjs --write',
        'node scripts\\generate-sky-relay-manual-gameplay-work-order.mjs --write',
        'node scripts\\verify-gameplay-acceptance.mjs',
      ],
    }
  }
  if (family === 'Galactic Survey') {
    return {
      prepare: [
        `Set-Location ..\\${workspaceDir}`,
        'node scripts\\prepare-manual-gameplay-capture.mjs --release-index-root ..\\ECHO-Release-Index --tester <name> --world-or-profile <name> --started-at <iso>',
      ],
      importOrRefresh: [
        `Set-Location ..\\${workspaceDir}`,
        'node scripts\\import-manual-gameplay-capture.mjs --capture-root <capture-root> --artifact <prepared-artifact-path> --tester <name> --world-or-profile <name> --started-at <iso> --force',
        'node scripts\\verify-manual-gameplay-evidence.mjs --require-release-ready',
      ],
      centralRefresh: [
        'Set-Location ..\\ECHO-Release-Index',
        'node scripts\\verify-galactic-survey-public-alpha-readiness.mjs --write',
        'node scripts\\generate-galactic-survey-manual-gameplay-work-order.mjs --write',
        'node scripts\\verify-gameplay-acceptance.mjs',
      ],
    }
  }
  return {
    prepare: [
      'Set-Location ..\\ECHO-Release-Index',
      `node scripts\\prepare-family-gameplay-capture.mjs --family ${familySlug} --lane ${lane} --tester <name> --world-or-profile <name> --started-at <iso>`,
    ],
    importOrRefresh: [
      'Set-Location ..\\ECHO-Release-Index',
      `node scripts\\import-family-gameplay-capture.mjs --family ${familySlug} --lane ${lane} --capture-root <capture-root> --artifact <pack.zip> --tester <name> --world-or-profile <name> --started-at <iso> --force`,
      `node scripts\\generate-family-gameplay-evidence.mjs --family ${familySlug}`,
    ],
    centralRefresh: [
      'Set-Location ..\\ECHO-Release-Index',
      'node scripts\\verify-gameplay-acceptance.mjs',
    ],
  }
}

function launcherInstanceName(family, lane) {
  return `${family} ${laneLabel(lane)} Edition`
}

function buildTarget(family, lane, attempts) {
  const checks = familyChecks(family.family, lane.lane, lane.claims)
  const latestAttempt = latestMatchingAttempt(attempts, family.family, lane.lane, lane.packId)
  const workspaceDir = lane.workspaceDir ?? workspaceFromRepo(lane.sourceRepo)
  const target = {
    family: family.family,
    familyKey: familyKey(family.family),
    lane: lane.lane,
    packId: lane.packId,
    sourceRepo: lane.sourceRepo ?? null,
    workspaceDir,
    launcherInstance: launcherInstanceName(family.family, lane.lane),
  }
  const verificationChecks = checks.map((item) => ({
    ...item,
    currentAttempt: checkStatusFromAttempt(latestAttempt, item.id),
  }))
  const currentBlockers = lane.blockers ?? []
  const taskStatus = lane.releaseReady === true
    ? 'complete'
    : latestAttempt?.status === 'captured'
      ? 'needs-imported-proof-review'
      : 'open'
  return {
    ...target,
    status: taskStatus,
    acceptanceStatus: lane.status ?? null,
    releaseReady: lane.releaseReady === true,
    blockerCount: lane.blockerCount ?? currentBlockers.length,
    blockerSample: currentBlockers.slice(0, 12),
    evidencePath: lane.evidencePath ?? null,
    latestComputerUseAttempt: latestAttempt ? {
      attemptId: latestAttempt.attemptId ?? null,
      generatedAt: latestAttempt.generatedAt ?? null,
      status: latestAttempt.status ?? null,
      screenshotStatus: latestAttempt.screenshotCapture?.status ?? null,
      acceptedAsGameplayProof: latestAttempt.acceptedAsGameplayProof === true,
      claimsPromoted: latestAttempt.claimsPromoted === true,
      verificationSummary: latestAttempt.verificationSummary ?? null,
      blockerCount: Array.isArray(latestAttempt.blockers) ? latestAttempt.blockers.length : 0,
    } : null,
    verificationChecks,
    evidenceRequirements: {
      screenshots: 'Required for visible UI checks such as HUD, inventory Index, Terminal, HoloMap, Lens, creative tab, and objective completion.',
      logs: 'Required for launcher/client start, runtime no-crash review, and timed playthrough evidence.',
      saveSnapshots: 'Required for timed playthroughs, primary objective completion, and save/reload verification.',
      notes: 'Required to describe tester, profile/world, exact route, start/end times, and no-crash review.',
    },
    computerUseRecorderCommand: recorderCommand(target, verificationChecks),
    captureCommands: captureCommands(family.family, lane.lane, lane.packId, workspaceDir),
  }
}

function buildWorkOrder(matrix, attempts, args) {
  const families = [...(matrix.families ?? [])]
    .sort((left, right) => FAMILY_ORDER.indexOf(left.family) - FAMILY_ORDER.indexOf(right.family))
  const targets = families.flatMap((family) =>
    (family.lanes ?? []).map((lane) => buildTarget(family, lane, attempts)))
  const openTargets = targets.filter((target) => target.status !== 'complete')
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status: openTargets.length === 0 && matrix.status === 'PASS' ? 'COMPLETE' : 'OPEN',
    scope: 'public-alpha-visible-gameplay-computer-use-work-order',
    sourceReports: {
      gameplayAcceptanceMatrix: rel(args.root, args.matrix),
      latestComputerUseAttempt: rel(args.root, args.latestAttempt),
      computerUseAttemptHistory: rel(args.root, args.attempts),
    },
    acceptanceStatus: matrix.status ?? null,
    summary: {
      familyCount: families.length,
      laneCount: targets.length,
      openLaneCount: openTargets.length,
      releaseReadyLaneCount: targets.filter((target) => target.releaseReady).length,
      attemptCount: attempts.length,
      targetsWithAttempts: targets.filter((target) => target.latestComputerUseAttempt).length,
      conclusion: openTargets.length === 0
        ? 'Every public-alpha lane has release-ready gameplay evidence.'
        : 'Visible Computer Use verification still requires real screenshots, logs, notes, and save snapshots before gameplay can pass.',
    },
    captureProtocol: [
      'Use ECHO Launcher or the owning edition capture kit to start from a fresh install and fresh world/profile.',
      'Use visible UI automation to open inventory and verify Index, HUD, Terminal, HoloMap, Lens, family objective surfaces, save/reload, and no-crash evidence where applicable.',
      'Record Computer Use attempts with the generated command, but treat that platform report as provenance only.',
      'Import the actual screenshots, logs, notes, and save snapshots through the owning family/edition evidence importer before setting gameplay claims true.',
      'Do not treat install, handoff, content graph load, or Hytale export planning as gameplay proof.',
    ],
    targets,
    promotionCommands: [
      'node scripts\\verify-gameplay-acceptance.mjs',
      'node scripts\\generate-computer-use-gameplay-capture-work-order.mjs --write',
      'node scripts\\generate-public-alpha-runtime-acceptance.mjs',
      'node scripts\\verify-gameplay-acceptance.mjs --strict',
    ],
    notes: [
      'This work order is generated evidence for the capture queue only.',
      'Captured verification checks require imported local proof paths before they can affect family gameplay acceptance.',
    ],
  }
}

function markdownTable(rows) {
  return [
    '| Field | Value |',
    '| --- | --- |',
    ...rows.map(([field, value]) => `| ${field} | ${value} |`),
  ].join('\n')
}

function commandBlock(commands) {
  return ['```powershell', ...commands, '```'].join('\n')
}

function renderMarkdown(workOrder, args) {
  const outRel = rel(args.root, args.out)
  const lines = [
    '# Computer Use Gameplay Capture Work Order',
    '',
    `Status: \`${workOrder.status}\``,
    '',
    `Machine-readable work order: [${outRel}](../${outRel}).`,
    '',
    'This queue is not gameplay proof. Use it to drive visible UI capture, then import the real screenshots, logs, notes, and save snapshots through the owning family evidence tools.',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Acceptance status', `\`${workOrder.acceptanceStatus}\``],
      ['Families', String(workOrder.summary.familyCount)],
      ['Lanes', String(workOrder.summary.laneCount)],
      ['Open lanes', String(workOrder.summary.openLaneCount)],
      ['Lanes with Computer Use attempts', String(workOrder.summary.targetsWithAttempts)],
    ]),
    '',
    '## Refresh',
    '',
    commandBlock([
      'node scripts\\verify-gameplay-acceptance.mjs',
      'node scripts\\generate-computer-use-gameplay-capture-work-order.mjs --write',
      'node scripts\\generate-public-alpha-runtime-acceptance.mjs',
    ]),
    '',
  ]

  for (const target of workOrder.targets) {
    lines.push(
      `## ${laneTitle(target)}`,
      '',
      markdownTable([
        ['Pack', `\`${target.packId}\``],
        ['Repository', `\`${target.sourceRepo ?? 'unknown'}\``],
        ['Status', `\`${target.status}\``],
        ['Acceptance lane status', `\`${target.acceptanceStatus}\``],
        ['Blockers', String(target.blockerCount)],
        ['Latest Computer Use attempt', target.latestComputerUseAttempt?.attemptId ? `\`${target.latestComputerUseAttempt.attemptId}\`` : '`none`'],
      ]),
      '',
      '### Computer Use Checks',
      '',
      '| Check | Current Attempt | Required Evidence |',
      '| --- | --- | --- |',
      ...target.verificationChecks.map((item) =>
        `| ${item.label} | \`${item.currentAttempt.status}\` | ${item.requiredEvidence.map((entry) => `\`${entry}\``).join(', ')} |`),
      '',
      '### Record Attempt',
      '',
      commandBlock([target.computerUseRecorderCommand]),
      '',
      '### Prepare',
      '',
      commandBlock(target.captureCommands.prepare),
      '',
      '### Import Or Refresh',
      '',
      commandBlock(target.captureCommands.importOrRefresh),
      '',
      '### Central Refresh',
      '',
      commandBlock(target.captureCommands.centralRefresh),
      '',
      '### Current Blockers',
      '',
    )
    if (target.blockerSample.length) {
      for (const blocker of target.blockerSample) lines.push(`- ${blocker}`)
    } else {
      lines.push('- None recorded.')
    }
    lines.push('')
  }

  lines.push(
    '## Boundary',
    '',
    'Do not mark a lane release-ready from this work order or from a platform-level Computer Use attempt alone. Gameplay acceptance changes only after the owning family evidence importer accepts non-empty local screenshots, logs, notes, and save snapshots.',
    '',
  )
  return `${lines.join('\n')}\n`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const matrix = await readJson(args.matrix)
  const latest = await readJson(args.latestAttempt, { optional: true })
  const history = await readJson(args.attempts, { optional: true })
  const workOrder = buildWorkOrder(matrix, allAttempts(latest, history), args)

  if (args.write) {
    await writeJson(args.out, workOrder)
    if (args.markdownEnabled) await writeText(args.markdown, renderMarkdown(workOrder, args))
  }

  if (args.json || !args.write) {
    console.log(JSON.stringify(workOrder, null, 2))
  } else {
    console.log(`Computer Use gameplay capture work order ${workOrder.status}: ${workOrder.summary.openLaneCount}/${workOrder.summary.laneCount} lane(s) open.`)
    console.log(`Wrote ${rel(args.root, args.out)}`)
    if (args.markdownEnabled) console.log(`Wrote ${rel(args.root, args.markdown)}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
