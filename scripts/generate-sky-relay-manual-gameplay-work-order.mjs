#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_REPORT = 'release-readiness/sky-relay-gameplay-evidence.json'
const DEFAULT_OUT = 'release-readiness/sky-relay-manual-gameplay-work-order.json'
const DEFAULT_MARKDOWN = 'docs/sky-relay-manual-gameplay-work-order.md'

const REQUIRED_CLAIMS = [
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'realSignalCrownPlaythrough',
  'freshWorldCreated',
  'saveReloadVerified',
  'noCrashEvidence',
]

const REQUIRED_RUN_FIELDS = [
  'tester',
  'releaseTag',
  'artifactAsset',
  'artifactSha256',
  'artifactSize',
  'launcherChannel',
  'worldOrProfile',
  'installedFrom',
  'startedAt',
]

const REQUIRED_SESSIONS = [
  { id: 'fresh_world_creation', claim: 'freshWorldCreated', minDurationMinutes: 1 },
  { id: 'first_30_minutes', claim: 'realFirst30Playthrough', minDurationMinutes: 30 },
  { id: 'first_2_hours', claim: 'realFirst2HourPlaythrough', minDurationMinutes: 120 },
  { id: 'signal_crown_completion', claim: 'realSignalCrownPlaythrough', minDurationMinutes: 1 },
  { id: 'save_reload_verification', claim: 'saveReloadVerified', minDurationMinutes: 1 },
  { id: 'no_crash_review', claim: 'noCrashEvidence', minDurationMinutes: 1 },
]

const REQUIRED_PATHS = {
  supportingFiles: [
    'fixtures/sky-relay/gameplay-qa/evidence/fresh-world-notes.md',
    'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md',
    'fixtures/sky-relay/gameplay-qa/evidence/first-2-hours-notes.md',
    'fixtures/sky-relay/gameplay-qa/evidence/signal-crown-verification.md',
    'fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md',
  ],
  screenshots: [
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png',
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png',
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-2-hours.png',
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png',
  ],
  logs: [
    'fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log',
    'fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log',
  ],
  saveSnapshots: [
    'fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip',
    'fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip',
    'fixtures/sky-relay/gameplay-qa/evidence/saves/signal-crown-save.zip',
  ],
}

const FILE_GROUPS = [
  { id: 'supporting_files', checkedKey: 'supportingFiles', title: 'Gameplay notes' },
  { id: 'screenshots', checkedKey: 'screenshots', title: 'Screenshots' },
  { id: 'logs', checkedKey: 'logs', title: 'Launcher and client logs' },
  { id: 'save_snapshots', checkedKey: 'saveSnapshots', title: 'Save snapshots' },
]

function usage() {
  return `Usage: node scripts/generate-sky-relay-manual-gameplay-work-order.mjs [options]

Builds an exact per-edition manual gameplay work order from the central Sky
Relay gameplay evidence report.

Options:
  --report <path>    Gameplay evidence report. Default: ${DEFAULT_REPORT}
  --out <path>       JSON work-order output. Default: ${DEFAULT_OUT}
  --markdown <path>  Markdown work-order output. Default: ${DEFAULT_MARKDOWN}
  --write            Write JSON and Markdown outputs. Without this, JSON prints to stdout.
  --help             Print this help text.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    report: DEFAULT_REPORT,
    out: DEFAULT_OUT,
    markdown: DEFAULT_MARKDOWN,
    write: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--report') args.report = next()
    else if (arg === '--out') args.out = next()
    else if (arg === '--markdown') args.markdown = next()
    else if (arg === '--write') args.write = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
}

function normalizeRel(value) {
  return String(value).replace(/\\/g, '/')
}

function resolveFromRoot(root, relPath) {
  return path.resolve(root, relPath)
}

function relativeFromRoot(root, target) {
  return normalizeRel(path.relative(root, target))
}

function isPlaceholder(value) {
  if (typeof value !== 'string') return value === null || value === undefined
  const normalized = value.trim().toLowerCase()
  return normalized === '' || ['tbd', 'todo', 'pending', 'template'].includes(normalized)
}

function isTemplateTimestamp(value) {
  return typeof value === 'string' && value.startsWith('1970-01-01T')
}

function hasRealValue(value) {
  return !isPlaceholder(value) && !isTemplateTimestamp(value)
}

function task(id, title, passed, details = {}) {
  return {
    id,
    title,
    status: passed ? 'passed' : 'open',
    ...details,
  }
}

function checkedPaths(edition, key) {
  return new Set((edition.checked?.[key] ?? []).map((record) => normalizeRel(record.path)))
}

function workOrderBlockers(report, editionKey) {
  return (report.blockers ?? []).filter((blocker) => {
    const normalized = String(blocker).toLowerCase()
    return normalized.includes(` ${editionKey.toLowerCase()} `)
      || normalized.includes(`${editionKey.toLowerCase()} manual evidence`)
      || normalized.includes(`gameplay evidence ${editionKey.toLowerCase()}`)
  })
}

function artifactMatches(run, artifact) {
  if (!artifact) return false
  return run?.artifactAsset === artifact.artifactAsset
    && run?.artifactSha256 === artifact.artifactSha256
    && Number(run?.artifactSize) === Number(artifact.artifactSize)
}

function buildEditionWorkOrder(report, edition) {
  const editionKey = edition.edition
  const sourceRevision = report.sourceRevisions?.editions?.[editionKey] ?? null
  const requiredEdition = (report.requiredEvidence?.editions ?? []).find((item) => item.source === edition.source) ?? null
  const workspaceDir = sourceRevision?.workspaceDir ?? requiredEdition?.workspaceDir ?? null
  const artifact = report.requiredEvidence?.packArtifacts?.[editionKey] ?? null
  const run = edition.run ?? {}
  const missingRunFields = REQUIRED_RUN_FIELDS.filter((field) => !hasRealValue(run[field]))
  const artifactIsCurrent = artifactMatches(run, artifact)
  const claimTasks = REQUIRED_CLAIMS.map((claim) => ({
    claim,
    status: edition.claims?.[claim] === true ? 'passed' : 'open',
  }))
  const sessionTasks = REQUIRED_SESSIONS.map((required) => {
    const session = (edition.sessions ?? []).find((item) => item.id === required.id)
    const passed = Boolean(session)
      && edition.claims?.[required.claim] === true
      && hasRealValue(session.startedAt)
      && hasRealValue(session.endedAt)
      && Number(session.durationMinutes) >= required.minDurationMinutes
    return {
      id: required.id,
      claim: required.claim,
      minDurationMinutes: required.minDurationMinutes,
      status: passed ? 'passed' : 'open',
      expectedEvidence: session?.evidence ?? {},
    }
  })
  const fileGroupTasks = FILE_GROUPS.map((group) => {
    const paths = REQUIRED_PATHS[group.checkedKey]
    const checked = checkedPaths(edition, group.checkedKey)
    const missing = paths.filter((relPath) => !checked.has(relPath))
    return task(group.id, group.title, missing.length === 0, {
      requiredPaths: paths,
      missingPaths: missing,
      checkedCount: checked.size,
      requiredCount: paths.length,
    })
  })

  const tasks = [
    task('capture_kit', 'Capture kit is present', edition.found === true, {
      manualEvidence: edition.manualEvidence,
    }),
    task('run_identity', 'Run identity and artifact match are filled', missingRunFields.length === 0 && artifactIsCurrent, {
      missingRunFields,
      artifact,
      artifactMatches: artifactIsCurrent,
    }),
    task('claims', 'Manual gameplay claims are true', claimTasks.every((item) => item.status === 'passed'), {
      claims: claimTasks,
    }),
    task('sessions', 'Required session records are complete', sessionTasks.every((item) => item.status === 'passed'), {
      sessions: sessionTasks,
    }),
    ...fileGroupTasks,
    task('local_verification', 'Edition local evidence verifier passes', edition.found === true && workOrderBlockers(report, editionKey).length === 0, {
      command: 'node scripts\\verify-manual-gameplay-evidence.mjs --require-release-ready',
    }),
  ]

  const openTasks = tasks.filter((item) => item.status !== 'passed')

  return {
    edition: editionKey,
    source: edition.source,
    repository: edition.repository,
    workspaceDir,
    manualEvidence: edition.manualEvidence,
    status: openTasks.length === 0 ? 'complete' : 'open',
    artifact,
    sourceRevision,
    commands: {
      setup: workspaceDir ? [
        `Set-Location ..\\${workspaceDir}`,
        'node scripts\\validate-sky-relay-edition.mjs',
        'node scripts\\verify-manual-gameplay-evidence.mjs --template-only',
        'node scripts\\init-manual-gameplay-evidence.mjs',
      ] : [],
      verify: workspaceDir ? [
        `Set-Location ..\\${workspaceDir}`,
        'node scripts\\verify-manual-gameplay-evidence.mjs --require-release-ready',
      ] : [],
    },
    blockers: workOrderBlockers(report, editionKey),
    tasks,
    openTaskCount: openTasks.length,
  }
}

function buildWorkOrder(report, args) {
  const editions = (report.editions ?? []).map((edition) => buildEditionWorkOrder(report, edition))
  const openTasks = editions.reduce((total, edition) => total + edition.openTaskCount, 0)
  const status = report.status === 'PASS' && openTasks === 0 ? 'COMPLETE' : 'OPEN'

  return {
    schemaVersion: 'echo.skyrelay.manual-gameplay-work-order.v1',
    status,
    generatedAt: new Date().toISOString(),
    sourceReport: normalizeRel(args.report),
    moduleId: report.moduleId,
    gameplayEvidenceStatus: report.status,
    gates: report.gates ?? {},
    totals: {
      editions: editions.length,
      openEditions: editions.filter((edition) => edition.status !== 'complete').length,
      tasks: editions.reduce((total, edition) => total + edition.tasks.length, 0),
      openTasks,
    },
    promotionCommands: [
      'node scripts\\verify-sky-relay-gameplay-evidence.mjs --require-release-ready',
      'node scripts\\verify-sky-relay-gameplay-evidence.mjs --write',
      'node scripts\\verify-sky-relay-public-alpha-readiness.mjs --require-release-ready',
      'node scripts\\verify-sky-relay-public-alpha-readiness.mjs --write',
      'node scripts\\generate-sky-relay-manual-gameplay-work-order.mjs --write',
      'node scripts\\promote-sky-relay-public-alpha.mjs',
      'node scripts\\promote-sky-relay-public-alpha.mjs --write',
      'node scripts\\validate-index.mjs --strict',
      'node scripts\\sync-public-alpha-index.mjs --check',
    ],
    editions,
    notes: [
      'This work order is generated from the gameplay evidence report and does not itself prove gameplay happened.',
      'Keep claims false until the referenced notes, screenshots, logs, and save snapshots are captured from a real manual run.',
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

function statusLabel(status) {
  return status === 'passed' || status === 'complete' ? 'passed' : 'open'
}

function powershellBlock(commands) {
  return ['```powershell', ...commands, '```'].join('\n')
}

function renderMarkdown(workOrder, args) {
  const reportRel = relativeFromRoot(args.root, resolveFromRoot(args.root, args.report))
  const outRel = relativeFromRoot(args.root, resolveFromRoot(args.root, args.out))
  const lines = [
    '# Sky Relay Manual Gameplay Work Order',
    '',
    `Status: \`${workOrder.status}\``,
    '',
    `Generated from [${reportRel}](../${reportRel}).`,
    `Machine-readable work order: [${outRel}](../${outRel}).`,
    '',
    'For the full capture rules, see [Sky Relay Manual QA Handoff](sky-relay-manual-qa-handoff.md).',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Gameplay evidence status', `\`${workOrder.gameplayEvidenceStatus}\``],
      ['Editions', String(workOrder.totals.editions)],
      ['Open editions', String(workOrder.totals.openEditions)],
      ['Open tasks', String(workOrder.totals.openTasks)],
    ]),
    '',
    '## Refresh',
    '',
    powershellBlock([
      'node scripts\\generate-sky-relay-manual-gameplay-work-order.mjs --write',
      'node scripts\\verify-sky-relay-gameplay-evidence.mjs',
      'node scripts\\verify-sky-relay-public-alpha-readiness.mjs',
    ]),
    '',
  ]

  for (const edition of workOrder.editions) {
    lines.push(
      `## ${edition.edition}`,
      '',
      markdownTable([
        ['Repository', `\`${edition.repository}\``],
        ['Workspace', `\`${edition.workspaceDir ?? 'unknown'}\``],
        ['Manual evidence', `\`${edition.manualEvidence}\``],
        ['Status', `\`${edition.status}\``],
        ['Open tasks', String(edition.openTaskCount)],
      ]),
      '',
      '### Setup',
      '',
      powershellBlock(edition.commands.setup),
      '',
      '### Verify',
      '',
      powershellBlock(edition.commands.verify),
      '',
      '### Tasks',
      '',
      '| Task | Status |',
      '| --- | --- |',
      ...edition.tasks.map((item) => `| ${item.title} | \`${statusLabel(item.status)}\` |`),
      '',
      '### Required Files',
      '',
    )

    for (const group of FILE_GROUPS) {
      const taskItem = edition.tasks.find((item) => item.id === group.id)
      lines.push(`#### ${group.title}`, '')
      for (const relPath of REQUIRED_PATHS[group.checkedKey]) {
        const marker = taskItem?.missingPaths?.includes(relPath) ? 'open' : 'passed'
        lines.push(`- \`${marker}\` ${relPath}`)
      }
      lines.push('')
    }

    lines.push('### Current Blockers', '')
    if (edition.blockers.length) {
      for (const blocker of edition.blockers) lines.push(`- ${blocker}`)
    } else {
      lines.push('- None recorded for this edition.')
    }
    lines.push('')
  }

  lines.push(
    '## Promotion Boundary',
    '',
    'Do not remove Sky Relay warning validation or declare public alpha ready until this work order is `COMPLETE` and both central `--require-release-ready` commands pass.',
  )

  return `${lines.join('\n')}\n`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  const reportPath = resolveFromRoot(args.root, args.report)
  const report = await readJson(reportPath)
  const workOrder = buildWorkOrder(report, args)
  const json = `${JSON.stringify(workOrder, null, 2)}\n`

  if (!args.write) {
    process.stdout.write(json)
    return
  }

  await writeJson(resolveFromRoot(args.root, args.out), workOrder)
  await writeText(resolveFromRoot(args.root, args.markdown), renderMarkdown(workOrder, args))
  process.stdout.write(json)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
