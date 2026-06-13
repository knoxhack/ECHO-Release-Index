#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_REPORT = 'release-readiness/galactic-survey-public-alpha-readiness.json'
const DEFAULT_OUT = 'release-readiness/galactic-survey-manual-gameplay-work-order.json'
const DEFAULT_MARKDOWN = 'docs/galactic-survey-manual-gameplay-work-order.md'

const EDITIONS = [
  { key: 'native', packId: 'galactic-survey-native-edition', repo: 'ECHO-Galactic-Survey-Native-Edition' },
  { key: 'neoforge', packId: 'galactic-survey-neoforge-edition', repo: 'ECHO-Galactic-Survey-NeoForge-Edition' },
  { key: 'standalone', packId: 'galactic-survey-standalone-edition', repo: 'ECHO-Galactic-Survey-Standalone-Edition' }
]

const REQUIRED_CLAIMS = [
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'realSurveyArrayPlaythrough',
  'freshWorldCreated',
  'saveReloadVerified',
  'noCrashEvidence'
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
  'startedAt'
]

const REQUIRED_SESSIONS = [
  { id: 'fresh_world_creation', claim: 'freshWorldCreated', minDurationMinutes: 1 },
  { id: 'first_30_minutes', claim: 'realFirst30Playthrough', minDurationMinutes: 30 },
  { id: 'first_2_hours', claim: 'realFirst2HourPlaythrough', minDurationMinutes: 120 },
  { id: 'survey_array_completion', claim: 'realSurveyArrayPlaythrough', minDurationMinutes: 1 },
  { id: 'save_reload_verification', claim: 'saveReloadVerified', minDurationMinutes: 1 },
  { id: 'no_crash_review', claim: 'noCrashEvidence', minDurationMinutes: 1 }
]

const REQUIRED_PATHS = {
  supportingFiles: [
    'fixtures/galactic-survey/gameplay-qa/evidence/fresh-world-notes.md',
    'fixtures/galactic-survey/gameplay-qa/evidence/first-30-minutes-notes.md',
    'fixtures/galactic-survey/gameplay-qa/evidence/first-2-hours-notes.md',
    'fixtures/galactic-survey/gameplay-qa/evidence/survey-array-verification.md',
    'fixtures/galactic-survey/gameplay-qa/evidence/no-crash-review.md'
  ],
  screenshots: [
    'fixtures/galactic-survey/gameplay-qa/evidence/screenshots/fresh-world-created.png',
    'fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-30-minutes.png',
    'fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-2-hours.png',
    'fixtures/galactic-survey/gameplay-qa/evidence/screenshots/survey-array-complete.png'
  ],
  logs: [
    'fixtures/galactic-survey/gameplay-qa/evidence/logs/client-playthrough.log'
  ],
  saveSnapshots: [
    'fixtures/galactic-survey/gameplay-qa/evidence/saves/first-30-minutes-save.zip',
    'fixtures/galactic-survey/gameplay-qa/evidence/saves/first-2-hours-save.zip',
    'fixtures/galactic-survey/gameplay-qa/evidence/saves/survey-array-save.zip'
  ]
}

const FILE_GROUPS = [
  { id: 'supporting_files', checkedKey: 'supportingFiles', title: 'Gameplay notes' },
  { id: 'screenshots', checkedKey: 'screenshots', title: 'Screenshots' },
  { id: 'logs', checkedKey: 'logs', title: 'Client logs' },
  { id: 'save_snapshots', checkedKey: 'saveSnapshots', title: 'Save snapshots' }
]

function usage() {
  return `Usage: node scripts/generate-galactic-survey-manual-gameplay-work-order.mjs [options]

Builds an exact per-edition manual gameplay work order from the central
Galactic Survey public-alpha readiness report.

Options:
  --root <path>      Release Index root. Default: current directory.
  --report <path>    Readiness report. Default: ${DEFAULT_REPORT}
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
    else if (arg === '--report') args.report = next()
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

async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function fileRecordOrNull(root, editionConfig, relPath) {
  try {
    const filePath = path.resolve(root, '..', editionConfig.repo, relPath)
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || stat.size < 1) return null
    return {
      path: normalizeRel(relPath),
      size: stat.size
    }
  } catch {
    return null
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
  if (value === null || value === undefined) return true
  if (typeof value === 'number') return !Number.isFinite(value) || value <= 0
  if (typeof value !== 'string') return false
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
    ...details
  }
}

function parseJsonStdout(commandReport) {
  try {
    return JSON.parse(commandReport?.stdout || '{}')
  } catch {
    return null
  }
}

async function loadEditionManualEvidence(root, editionConfig, releaseEvidence) {
  const relPath = releaseEvidence?.evidencePath ?? 'fixtures/galactic-survey/gameplay-qa/manual-evidence.json'
  const filePath = path.resolve(root, '..', editionConfig.repo, relPath)
  const evidence = await readJsonOrNull(filePath)
  const checked = {}
  for (const key of Object.keys(REQUIRED_PATHS)) {
    checked[key] = []
    for (const item of evidence?.[key] ?? []) {
      const record = await fileRecordOrNull(root, editionConfig, item)
      if (record) checked[key].push(record)
    }
  }
  return {
    relPath,
    filePath,
    evidence,
    checked
  }
}

function artifactForEdition(report, packId) {
  const edition = report.editionReleasePublicationEvidence?.editions?.find((item) => item.packId === packId)
  const zip = edition?.assets?.find((asset) => String(asset?.name ?? '').endsWith('.zip'))
  if (!zip) return null
  return {
    artifactAsset: zip.name,
    artifactSha256: zip.sha256,
    artifactSize: zip.size,
    releaseTag: edition.releaseTag,
    releaseUrl: edition.release?.htmlUrl
  }
}

function artifactMatches(run, artifact) {
  if (!artifact) return false
  return run?.artifactAsset === artifact.artifactAsset
    && run?.artifactSha256 === artifact.artifactSha256
    && Number(run?.artifactSize) === Number(artifact.artifactSize)
}

function blockersForEdition(report, packId, releaseEvidence) {
  const relevant = (report.blockers ?? []).filter((blocker) => String(blocker).includes(packId))
  return [...relevant, ...(releaseEvidence?.blockers ?? [])]
}

function checkedPaths(loadedManualEvidence, key) {
  return new Set((loadedManualEvidence?.checked?.[key] ?? []).map((record) => normalizeRel(record.path)))
}

function buildEditionWorkOrder(report, editionConfig, loadedManualEvidence) {
  const command = (report.commandReports?.editions ?? []).find((entry) => entry.id === editionConfig.packId)
  const releaseEvidence = parseJsonStdout(command?.releaseEvidence)
  const manualEvidence = loadedManualEvidence?.evidence ?? null
  const manualEvidenceFound = Boolean(manualEvidence) || releaseEvidence?.manualEvidence?.found === true
  const revision = report.sourceRevisions?.editions?.[editionConfig.key] ?? null
  const artifact = artifactForEdition(report, editionConfig.packId)
  const run = manualEvidence?.run ?? {}
  const missingRunFields = REQUIRED_RUN_FIELDS.filter((field) => !hasRealValue(run[field]))
  const artifactIsCurrent = artifactMatches(run, artifact)
  const claims = manualEvidence?.claims ?? {}
  const claimTasks = REQUIRED_CLAIMS.map((claim) => ({
    claim,
    status: claims[claim] === true ? 'passed' : 'open'
  }))
  const releaseGateTasks = (releaseEvidence?.requiredReleaseGates ?? []).map((gate) => {
    const evidenceGate = manualEvidence?.releaseGates?.find((entry) => entry.id === gate.id)
    const passed = evidenceGate?.satisfied === true && claims[gate.requiredClaim] === true && hasRealValue(evidenceGate.evidenceSource) && evidenceGate.evidenceSource !== 'template'
    return {
      id: gate.id,
      proof: gate.proof,
      requiredClaim: gate.requiredClaim,
      status: passed ? 'passed' : 'open',
      evidenceSource: evidenceGate?.evidenceSource ?? null
    }
  })
  const sessions = manualEvidence?.sessions ?? []
  const sessionTasks = REQUIRED_SESSIONS.map((required) => {
    const session = sessions.find((item) => item.id === required.id)
    const passed = Boolean(session)
      && claims[required.claim] === true
      && hasRealValue(session.startedAt)
      && hasRealValue(session.endedAt)
      && Number(session.durationMinutes) >= required.minDurationMinutes
    return {
      id: required.id,
      claim: required.claim,
      minDurationMinutes: required.minDurationMinutes,
      status: passed ? 'passed' : 'open',
      expectedEvidence: session?.evidence ?? {}
    }
  })
  const fileGroupTasks = FILE_GROUPS.map((group) => {
    const paths = REQUIRED_PATHS[group.checkedKey]
    const checked = checkedPaths(loadedManualEvidence, group.checkedKey)
    const missing = paths.filter((relPath) => !checked.has(relPath))
    return task(group.id, group.title, missing.length === 0, {
      requiredPaths: paths,
      missingPaths: missing,
      checkedCount: checked.size,
      requiredCount: paths.length
    })
  })

  const editionBlockers = blockersForEdition(report, editionConfig.packId, releaseEvidence)
  const tasks = [
    task('capture_kit', 'Manual capture kit is present', manualEvidenceFound, {
      manualEvidence: loadedManualEvidence?.relPath ?? releaseEvidence?.evidencePath ?? 'fixtures/galactic-survey/gameplay-qa/manual-evidence.json',
      workspacePath: loadedManualEvidence?.relPath
        ? normalizeRel(path.join(editionConfig.repo, loadedManualEvidence.relPath))
        : undefined
    }),
    task('run_identity', 'Run identity and artifact match are filled', missingRunFields.length === 0 && artifactIsCurrent, {
      missingRunFields,
      artifact,
      artifactMatches: artifactIsCurrent
    }),
    task('claims', 'Manual gameplay claims are true', claimTasks.every((item) => item.status === 'passed'), {
      claims: claimTasks
    }),
    task('release_gates', 'All 13 release gates cite real evidence sources', releaseGateTasks.length === 13 && releaseGateTasks.every((item) => item.status === 'passed'), {
      releaseGates: releaseGateTasks
    }),
    task('sessions', 'Required session records are complete', sessionTasks.every((item) => item.status === 'passed'), {
      sessions: sessionTasks
    }),
    ...fileGroupTasks,
    task('local_verification', 'Edition local evidence verifier passes', command?.releaseEvidence?.status === 'passed' && editionBlockers.length === 0, {
      command: 'node scripts\\verify-manual-gameplay-evidence.mjs --require-release-ready'
    })
  ]

  const openTasks = tasks.filter((item) => item.status !== 'passed')
  return {
    edition: editionConfig.key,
    packId: editionConfig.packId,
    repository: `knoxhack/${editionConfig.repo}`,
    workspaceDir: editionConfig.repo,
    manualEvidence: loadedManualEvidence?.relPath ?? releaseEvidence?.evidencePath ?? 'fixtures/galactic-survey/gameplay-qa/manual-evidence.json',
    status: openTasks.length === 0 ? 'complete' : 'open',
    artifact,
    sourceRevision: revision,
    commands: {
      capture: [
        `Set-Location ..\\${editionConfig.repo}`,
        'node scripts\\import-manual-gameplay-capture.mjs --capture-root <capture-root> --artifact <downloaded-pack-zip> --tester <name> --world-or-profile <name> --started-at <iso> --force'
      ],
      verify: [
        `Set-Location ..\\${editionConfig.repo}`,
        'node scripts\\verify-manual-gameplay-evidence.mjs --template-only',
        'node scripts\\verify-manual-gameplay-evidence.mjs --require-release-ready'
      ]
    },
    blockers: editionBlockers,
    tasks,
    openTaskCount: openTasks.length
  }
}

async function buildWorkOrder(report, args) {
  const editions = []
  for (const edition of EDITIONS) {
    const command = (report.commandReports?.editions ?? []).find((entry) => entry.id === edition.packId)
    const releaseEvidence = parseJsonStdout(command?.releaseEvidence)
    editions.push(buildEditionWorkOrder(report, edition, await loadEditionManualEvidence(args.root, edition, releaseEvidence)))
  }
  const openTasks = editions.reduce((total, edition) => total + edition.openTaskCount, 0)
  const status = report.status === 'PASS' && openTasks === 0 ? 'COMPLETE' : 'OPEN'
  return {
    schemaVersion: 'echo.galactic_survey.manual-gameplay-work-order.v1',
    status,
    generatedAt: new Date().toISOString(),
    sourceReport: normalizeRel(args.report),
    project: report.project,
    readinessStatus: report.status,
    gates: report.gates ?? {},
    totals: {
      editions: editions.length,
      openEditions: editions.filter((edition) => edition.status !== 'complete').length,
      tasks: editions.reduce((total, edition) => total + edition.tasks.length, 0),
      openTasks
    },
    promotionCommands: [
      'node scripts\\verify-galactic-survey-public-alpha-readiness.mjs --write',
      'node scripts\\generate-galactic-survey-manual-gameplay-work-order.mjs --write',
      'node scripts\\verify-galactic-survey-public-alpha-readiness.mjs --require-release-ready',
      'node scripts\\validate-index.mjs --strict',
      'node scripts\\sync-public-alpha-index.mjs --check'
    ],
    editions,
    notes: [
      'This work order is generated from the readiness report and does not itself prove gameplay happened.',
      'Keep manual claims false until the referenced notes, screenshots, logs, and save snapshots are captured from a real playthrough.'
    ]
  }
}

function markdownTable(rows) {
  return [
    '| Field | Value |',
    '| --- | --- |',
    ...rows.map(([field, value]) => `| ${field} | ${value} |`)
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
    '# Galactic Survey Manual Gameplay Work Order',
    '',
    `Status: \`${workOrder.status}\``,
    '',
    `Generated from [${reportRel}](../${reportRel}).`,
    `Machine-readable work order: [${outRel}](../${outRel}).`,
    '',
    'This checklist turns the remaining gameplay blockers into exact capture tasks. It is not release evidence by itself.',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Readiness status', `\`${workOrder.readinessStatus}\``],
      ['Editions', String(workOrder.totals.editions)],
      ['Open editions', String(workOrder.totals.openEditions)],
      ['Open tasks', String(workOrder.totals.openTasks)]
    ]),
    '',
    '## Refresh',
    '',
    powershellBlock([
      'node scripts\\verify-galactic-survey-public-alpha-readiness.mjs --write',
      'node scripts\\generate-galactic-survey-manual-gameplay-work-order.mjs --write'
    ]),
    ''
  ]

  for (const edition of workOrder.editions) {
    lines.push(
      `## ${edition.packId}`,
      '',
      markdownTable([
        ['Repository', `\`${edition.repository}\``],
        ['Workspace', `\`${edition.workspaceDir}\``],
        ['Manual evidence', `\`${edition.manualEvidence}\``],
        ['Status', `\`${edition.status}\``],
        ['Open tasks', String(edition.openTaskCount)]
      ]),
      '',
      '### Capture',
      '',
      powershellBlock(edition.commands.capture),
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
      ''
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
    'Do not remove Galactic Survey warning validation or declare public alpha ready until this work order is `COMPLETE`, first-launch/open-play evidence is PASS, and `node scripts\\verify-galactic-survey-public-alpha-readiness.mjs --require-release-ready` passes.'
  )

  return `${lines.join('\n')}\n`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  const report = await readJson(resolveFromRoot(args.root, args.report))
  const workOrder = await buildWorkOrder(report, args)
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
