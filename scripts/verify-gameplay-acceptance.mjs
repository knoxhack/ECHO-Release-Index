#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OUT = path.join('release-readiness', 'gameplay-acceptance-matrix.json')
const REQUIRED_LANES = ['native', 'neoforge', 'standalone']
const PASS_STATUSES = new Set(['pass', 'passed', 'ready', 'complete', 'completed', 'closed'])
const BLOCKED_STATUSES = new Set(['blocked', 'failed', 'fail', 'open', 'missing'])

function usage() {
  return `Usage:
  node scripts/verify-gameplay-acceptance.mjs [--out release-readiness/gameplay-acceptance-matrix.json]
  node scripts/verify-gameplay-acceptance.mjs --strict
  node scripts/verify-gameplay-acceptance.mjs --no-write --json

Generates echo.gameplay.acceptance.v1 from public-alpha gameplay evidence reports.
Strict mode exits non-zero until every official family has release-ready gameplay
evidence across Native, NeoForge, and Standalone lanes.`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    out: null,
    write: true,
    json: false,
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
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--no-write') args.write = false
    else if (arg === '--json') args.json = true
    else if (arg === '--strict') args.strict = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.out) args.out = path.join(args.root, DEFAULT_OUT)
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

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/gu, '/')
}

function statusValue(value) {
  return String(value ?? '').trim().toLowerCase()
}

function statusIsPass(value) {
  return PASS_STATUSES.has(statusValue(value))
}

function statusIsBlocked(value) {
  return BLOCKED_STATUSES.has(statusValue(value))
}

function laneFrom(value) {
  const text = String(value ?? '').toLowerCase()
  if (text.includes('neoforge')) return 'neoforge'
  if (text.includes('standalone')) return 'standalone'
  if (text.includes('native')) return 'native'
  return null
}

function laneFromRecord(record) {
  return laneFrom(record?.lane)
    ?? laneFrom(record?.edition)
    ?? laneFrom(record?.packId)
    ?? laneFrom(record?.id)
    ?? laneFrom(record?.source)
    ?? null
}

function firstItems(values, count = 20) {
  return values.slice(0, count)
}

function sourceReport(pathName, report) {
  return {
    path: pathName,
    present: Boolean(report),
    schemaVersion: report?.schemaVersion ?? null,
    status: report?.status ?? (typeof report?.ok === 'boolean' ? (report.ok ? 'PASS' : 'BLOCKED') : null),
    generatedAt: report?.generatedAt ?? null,
  }
}

function currentUiEvidence(family, sourcePath, report) {
  if (!report) {
    return {
      family,
      sourceReport: sourcePath,
      status: 'missing',
      ok: false,
      blocker: `${family} Launcher UI install/update/repair smoke report is missing.`,
    }
  }
  const gates = report.gates ?? {}
  const updateGate = String(gates.packagedElectronUpdateReconciliationClickThrough ?? '')
  const update = report.clickThrough?.update ?? null
  const ok = report.ok === true
    && String(gates.packagedElectronInstallClickThrough ?? '').startsWith('passed')
    && updateGate.startsWith('passed')
    && update?.ok === true
  return {
    family,
    sourceReport: sourcePath,
    status: ok ? 'pass' : 'blocked',
    ok,
    generatedAt: report.generatedAt ?? null,
    update: update ? {
      operation: update.operation ?? null,
      observedAction: update.observedAction ?? null,
      acceptedAction: update.acceptedAction ?? null,
      currentCatalogState: update.currentCatalogState ?? null,
      reconciliationMode: update.reconciliation?.mode ?? null,
      verifiedModule: Boolean(update.verifiedModule),
    } : null,
    blocker: ok ? null : `${family} Launcher UI install/update/repair smoke is not accepted.`,
  }
}

function laneBlockerMessage(family, lane, message) {
  return `${family} ${lane}: ${message}`
}

function familyStatusFromLanes(lanes, familyBlockers = []) {
  return lanes.every((lane) => lane.status === 'pass') && familyBlockers.length === 0 ? 'pass' : 'blocked'
}

function buildAshfallFamily(report) {
  const sourcePath = 'release-readiness/ashfall-lane-game-smoke.json'
  const reportLanes = new Map((report?.lanes ?? []).map((lane) => [laneFromRecord(lane), lane]))
  const lanes = REQUIRED_LANES.map((lane) => {
    const source = reportLanes.get(lane)
    if (!source) {
      return {
        lane,
        packId: `ashfall-${lane}-edition`,
        status: 'missing',
        blockerCount: 1,
        blockers: [laneBlockerMessage('Ashfall', lane, 'Missing lane gameplay smoke entry.')],
        evidencePresent: false,
        crashReport: null,
      }
    }
    const blockers = source.blockers ?? []
    return {
      lane,
      packId: source.packId ?? `ashfall-${lane}-edition`,
      status: source.ok === true && blockers.length === 0 ? 'pass' : 'blocked',
      blockerCount: blockers.length,
      blockers,
      evidencePresent: source.evidence?.present === true,
      crashReport: source.crashReport?.path ?? null,
      installedManifest: {
        present: source.installedManifest?.present === true,
        missingModuleFileCount: source.installedManifest?.missingModuleFileCount ?? null,
      },
    }
  })
  const familyBlockers = report
    ? [...(report.blockers ?? [])]
    : ['Ashfall lane gameplay smoke report is missing.']
  const blockerCount = familyBlockers.length || lanes.reduce((sum, lane) => sum + lane.blockerCount, 0)
  return {
    family: 'Ashfall',
    status: familyStatusFromLanes(lanes, familyBlockers),
    sourceReports: [sourceReport(sourcePath, report)],
    laneCount: lanes.length,
    passedLaneCount: lanes.filter((lane) => lane.status === 'pass').length,
    blockerCount,
    blockers: familyBlockers.length ? familyBlockers : lanes.flatMap((lane) => lane.blockers),
    lanes,
    conclusion: blockerCount === 0
      ? 'Ashfall gameplay evidence is release-ready.'
      : 'Ashfall install/handoff evidence exists, but gameplay acceptance remains blocked by lane-level proof gaps.',
  }
}

function findEditionForLane(editions, lane) {
  return editions.find((edition) => laneFromRecord(edition) === lane) ?? null
}

function buildManualFamily({
  family,
  gameplayPath,
  gameplayReport,
  workOrderPath,
  workOrder,
  expectedPackPrefix,
}) {
  const editions = Array.isArray(gameplayReport?.editions)
    ? gameplayReport.editions
    : Array.isArray(workOrder?.editions)
      ? workOrder.editions
      : []
  const reportStatus = gameplayReport?.status ?? workOrder?.status ?? null
  const reportBlockers = [
    ...(gameplayReport?.blockers ?? []),
    ...(workOrder?.blockers ?? []),
  ]
  const lanes = REQUIRED_LANES.map((lane) => {
    const edition = findEditionForLane(editions, lane)
    if (!edition) {
      return {
        lane,
        packId: `${expectedPackPrefix}-${lane}-edition`,
        status: 'missing',
        blockerCount: 1,
        blockers: [laneBlockerMessage(family, lane, 'Missing manual gameplay evidence lane.')],
        openTaskCount: null,
      }
    }
    const editionBlockers = edition.blockers ?? []
    const laneStatus = statusIsPass(edition.status) && editionBlockers.length === 0 && statusIsPass(reportStatus)
      ? 'pass'
      : 'blocked'
    const blockers = [
      ...(statusIsBlocked(edition.status) || !statusIsPass(edition.status)
        ? [laneBlockerMessage(family, lane, `Manual gameplay work order status is ${edition.status ?? 'unknown'}.`)]
        : []),
      ...editionBlockers,
    ]
    return {
      lane,
      packId: edition.packId ?? `${expectedPackPrefix}-${lane}-edition`,
      status: laneStatus,
      blockerCount: blockers.length,
      blockers,
      manualEvidence: edition.manualEvidence ?? null,
      openTaskCount: edition.openTaskCount ?? null,
      artifact: edition.artifact ?? null,
    }
  })
  const blockers = [
    ...reportBlockers,
    ...lanes.flatMap((lane) => lane.blockers),
  ]
  return {
    family,
    status: familyStatusFromLanes(lanes, reportBlockers),
    sourceReports: [
      sourceReport(gameplayPath, gameplayReport),
      sourceReport(workOrderPath, workOrder),
    ],
    laneCount: lanes.length,
    passedLaneCount: lanes.filter((lane) => lane.status === 'pass').length,
    blockerCount: blockers.length,
    blockers,
    lanes,
    conclusion: blockers.length === 0
      ? `${family} gameplay evidence is release-ready.`
      : `${family} gameplay acceptance remains blocked by manual evidence work-order gaps.`,
  }
}

function buildGenericFamily({ family, gameplayPath, report, expectedPackPrefix }) {
  const lanes = REQUIRED_LANES.map((lane) => {
    const source = findEditionForLane(report?.lanes ?? report?.editions ?? [], lane)
    if (!source) {
      return {
        lane,
        packId: `${expectedPackPrefix}-${lane}-edition`,
        status: 'missing',
        blockerCount: 1,
        blockers: [laneBlockerMessage(family, lane, 'Missing gameplay evidence lane.')],
      }
    }
    const blockers = source.blockers ?? []
    const laneStatus = (source.ok === true || statusIsPass(source.status)) && blockers.length === 0 ? 'pass' : 'blocked'
    return {
      lane,
      packId: source.packId ?? `${expectedPackPrefix}-${lane}-edition`,
      status: laneStatus,
      blockerCount: blockers.length,
      blockers,
      evidencePath: source.evidencePath ?? source.evidence?.path ?? null,
    }
  })
  const reportBlockers = report
    ? [...(report.blockers ?? [])]
    : [`${family} gameplay evidence report is missing.`]
  const blockers = [
    ...reportBlockers,
    ...lanes.flatMap((lane) => lane.blockers),
  ]
  return {
    family,
    status: report && statusIsPass(report.status) ? familyStatusFromLanes(lanes, reportBlockers) : 'blocked',
    sourceReports: [sourceReport(gameplayPath, report)],
    laneCount: lanes.length,
    passedLaneCount: lanes.filter((lane) => lane.status === 'pass').length,
    blockerCount: blockers.length,
    blockers,
    lanes,
    conclusion: blockers.length === 0
      ? `${family} gameplay evidence is release-ready.`
      : `${family} gameplay acceptance has no release-ready real gameplay evidence yet.`,
  }
}

function reportBlockers(families) {
  const blockers = []
  for (const family of families) {
    if (family.status === 'pass') continue
    blockers.push({
      family: family.family,
      blockerCount: family.blockerCount,
      sample: firstItems(family.blockers, 12),
    })
  }
  return blockers
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const rr = path.join(args.root, 'release-readiness')
  const reportPath = (name) => path.join(rr, name)
  const optionalReport = async (name) => readJson(reportPath(name), { optional: true })

  const ashfallGameplay = await optionalReport('ashfall-lane-game-smoke.json')
  const skyRelayGameplay = await optionalReport('sky-relay-gameplay-evidence.json')
  const skyRelayWorkOrder = await optionalReport('sky-relay-manual-gameplay-work-order.json')
  const skyRelayUi = await optionalReport('sky-relay-electron-ui-smoke.json')
  const galacticGameplay = await optionalReport('galactic-survey-public-alpha-readiness.json')
  const galacticWorkOrder = await optionalReport('galactic-survey-manual-gameplay-work-order.json')
  const galacticUi = await optionalReport('galactic-survey-electron-ui-smoke.json')
  const openlandsGameplay = await optionalReport('openlands-gameplay-evidence.json')
  const arcanaGameplay = await optionalReport('arcana-division-gameplay-evidence.json')

  const families = [
    buildAshfallFamily(ashfallGameplay),
    buildManualFamily({
      family: 'Sky Relay',
      gameplayPath: 'release-readiness/sky-relay-gameplay-evidence.json',
      gameplayReport: skyRelayGameplay,
      workOrderPath: 'release-readiness/sky-relay-manual-gameplay-work-order.json',
      workOrder: skyRelayWorkOrder,
      expectedPackPrefix: 'sky-relay',
    }),
    buildManualFamily({
      family: 'Galactic Survey',
      gameplayPath: 'release-readiness/galactic-survey-public-alpha-readiness.json',
      gameplayReport: galacticGameplay,
      workOrderPath: 'release-readiness/galactic-survey-manual-gameplay-work-order.json',
      workOrder: galacticWorkOrder,
      expectedPackPrefix: 'galactic-survey',
    }),
    buildGenericFamily({
      family: 'Openlands',
      gameplayPath: 'release-readiness/openlands-gameplay-evidence.json',
      report: openlandsGameplay,
      expectedPackPrefix: 'openlands',
    }),
    buildGenericFamily({
      family: 'Arcana Division',
      gameplayPath: 'release-readiness/arcana-division-gameplay-evidence.json',
      report: arcanaGameplay,
      expectedPackPrefix: 'arcana-division',
    }),
  ]

  const transportEvidence = [
    currentUiEvidence('Sky Relay', 'release-readiness/sky-relay-electron-ui-smoke.json', skyRelayUi),
    currentUiEvidence('Galactic Survey', 'release-readiness/galactic-survey-electron-ui-smoke.json', galacticUi),
  ]
  const blockedFamilies = families.filter((family) => family.status !== 'pass')
  const blockedTransport = transportEvidence.filter((entry) => entry.status !== 'pass')
  const status = blockedFamilies.length === 0 && blockedTransport.length === 0 ? 'PASS' : 'BLOCKED'
  const blockerCount = families.reduce((sum, family) => sum + family.blockerCount, 0)
    + blockedTransport.length
  const report = {
    schemaVersion: 'echo.gameplay.acceptance.v1',
    generatedAt: new Date().toISOString(),
    status,
    strictReady: status === 'PASS',
    scope: 'public-alpha-real-gameplay-acceptance',
    requiredLanes: REQUIRED_LANES,
    summary: {
      familyCount: families.length,
      laneCount: families.reduce((sum, family) => sum + family.laneCount, 0),
      passedFamilyCount: families.filter((family) => family.status === 'pass').length,
      blockedFamilyCount: blockedFamilies.length,
      passedLaneCount: families.reduce((sum, family) => sum + family.passedLaneCount, 0),
      blockerCount,
      transportProofCount: transportEvidence.length,
      acceptedTransportProofCount: transportEvidence.filter((entry) => entry.status === 'pass').length,
      conclusion: status === 'PASS'
        ? 'All public-alpha gameplay evidence is release-ready.'
        : 'Public-alpha install/runtime gates may be green, but real gameplay acceptance remains blocked until each family and lane has release-ready evidence.',
    },
    transportEvidence,
    families,
    blockers: reportBlockers(families),
    notes: [
      'This contract is gameplay evidence only. It does not replace content-graph evidence, install smoke reports, native runtime load reports, or Standalone content graph load reports.',
      'Hytale statuses remain export-planning evidence only and are intentionally outside gameplay acceptance until a runtime adapter and validation gate exist.',
    ],
  }

  if (args.write) await writeJson(args.out, report)
  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Gameplay acceptance ${status}: ${report.summary.passedFamilyCount}/${report.summary.familyCount} families passed; ${blockerCount} blocker(s).`)
    if (args.write) console.log(`Wrote ${rel(args.root, args.out)}`)
  }
  if (args.strict && status !== 'PASS') process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
