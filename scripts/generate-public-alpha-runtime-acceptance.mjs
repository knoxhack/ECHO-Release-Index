#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OUT = path.join('release-readiness', 'public-alpha-runtime-acceptance.json')
const CANONICAL_MODULE_RELEASE = 'modules-canonical-full-20260616'
const EXPECTED_MODULE_ROWS = 133
const EXPECTED_OFFICIAL_PACKS = 15
const EXPECTED_NATIVE_PACKS = 5
const EXPECTED_ASHFALL_HANDOFF_PACKS = 2
const EXPECTED_HYTALE_BLOCKERS = 9

function usage() {
  return `Usage:
  node scripts/generate-public-alpha-runtime-acceptance.mjs [--out release-readiness/public-alpha-runtime-acceptance.json]
  node scripts/generate-public-alpha-runtime-acceptance.mjs --no-write --json

Generates a consolidated public-alpha runtime acceptance report from the current
Release Index release-readiness artifacts. Hard catalog/install/runtime gates
must pass. Gameplay evidence blockers are reported as warning-level acceptance
gaps until real in-game proof exists.`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    out: null,
    write: true,
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
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--no-write') args.write = false
    else if (arg === '--json') args.json = true
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

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/gu, '/')
}

function statusFrom(condition) {
  return condition ? 'pass' : 'fail'
}

function passGate(name, sourceReport, generatedAt, details = {}) {
  return {
    name,
    status: 'pass',
    sourceReport,
    generatedAt: generatedAt ?? null,
    ...details,
  }
}

function failGate(name, sourceReport, generatedAt, blockers, details = {}) {
  return {
    name,
    status: 'fail',
    sourceReport,
    generatedAt: generatedAt ?? null,
    blockers,
    ...details,
  }
}

function makeGate(name, sourceReport, report, passed, blockers, details = {}) {
  return passed
    ? passGate(name, sourceReport, report?.generatedAt, details)
    : failGate(name, sourceReport, report?.generatedAt, blockers, details)
}

function countBy(values, keyFn) {
  const out = new Map()
  for (const value of values) {
    const key = keyFn(value)
    out.set(key, (out.get(key) ?? 0) + 1)
  }
  return [...out.entries()]
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([key, count]) => ({ key, count }))
}

function packFamily(packId) {
  if (packId.startsWith('ashfall-')) return 'Ashfall'
  if (packId.startsWith('sky-relay-')) return 'Sky Relay'
  if (packId.startsWith('galactic-survey-')) return 'Galactic Survey'
  if (packId.startsWith('openlands-')) return 'Openlands'
  if (packId.startsWith('arcana-division-')) return 'Arcana Division'
  return packId
}

function packLane(packId) {
  if (packId.includes('-native-')) return 'native'
  if (packId.includes('-neoforge-')) return 'neoforge'
  if (packId.includes('-standalone-')) return 'standalone'
  return 'unknown'
}

function summarizePackCoverage(report) {
  const packs = Array.isArray(report?.packs) ? report.packs : []
  const moduleReleaseSources = new Map()
  for (const pack of packs) {
    for (const source of pack.moduleReleaseSources ?? []) {
      const key = `${source.releaseSourceState ?? 'unknown'}:${source.releaseTag ?? 'unknown'}`
      const current = moduleReleaseSources.get(key) ?? {
        releaseSourceState: source.releaseSourceState ?? 'unknown',
        releaseTag: source.releaseTag ?? 'unknown',
        packCount: 0,
        moduleCount: 0,
        fileCount: 0,
      }
      current.packCount += 1
      current.moduleCount += Number(source.moduleCount ?? 0)
      current.fileCount += Number(source.fileCount ?? 0)
      moduleReleaseSources.set(key, current)
    }
  }
  return {
    expectedPackCount: report?.expectedPackCount ?? null,
    observedPackCount: packs.length,
    families: countBy(packs, (pack) => packFamily(pack.profileId ?? pack.packId ?? 'unknown'))
      .map(({ key, count }) => ({ family: key, packCount: count })),
    lanes: countBy(packs, (pack) => packLane(pack.profileId ?? pack.packId ?? 'unknown'))
      .map(({ key, count }) => ({ lane: key, packCount: count })),
    moduleReleaseSources: [...moduleReleaseSources.values()]
      .sort((left, right) => left.releaseTag.localeCompare(right.releaseTag)),
  }
}

function summarizeLifecycle(report) {
  const editions = Array.isArray(report?.editions) ? report.editions : []
  return {
    officialPackCount: report?.officialPackCount ?? null,
    coveredPackCount: report?.coveredPackCount ?? null,
    passCount: editions.filter((entry) => entry.status === 'pass').length,
    updateCount: editions.filter((entry) => entry.update?.versionTransition === true).length,
    rollbackCount: editions.filter((entry) => entry.rollback?.restoredPreviousTarget).length,
    repairCount: editions.filter((entry) => entry.repair?.repaired).length,
  }
}

function gameplayEntryFromAshfall(report) {
  const lanes = (report?.lanes ?? []).map((lane) => ({
    packId: lane.packId,
    lane: lane.lane,
    status: lane.ok ? 'pass' : 'warn',
    blockerCount: lane.blockers?.length ?? 0,
    blockers: lane.blockers ?? [],
    crashReport: lane.crashReport?.path ?? null,
    evidencePresent: lane.evidence?.present === true,
  }))
  const blockerCount = report?.blockers?.length ?? lanes.reduce((sum, lane) => sum + lane.blockerCount, 0)
  return {
    family: 'Ashfall',
    status: blockerCount === 0 && report?.ok === true ? 'pass' : 'warn',
    sourceReport: 'release-readiness/ashfall-lane-game-smoke.json',
    generatedAt: report?.generatedAt ?? null,
    laneCount: lanes.length,
    blockerCount,
    lanes,
    conclusion: blockerCount === 0
      ? 'Ashfall gameplay proof is current.'
      : 'Ashfall install/handoff is proven, but real launch/world/UI/creative gameplay proof is not accepted yet.',
  }
}

function staleGameplayEntry(family, sourceReport, reason) {
  return {
    family,
    status: 'warn',
    sourceReport,
    current: false,
    blockerCount: 1,
    blockers: [reason],
    conclusion: reason,
  }
}

async function gitHead(repoRoot) {
  try {
    const gitDir = path.join(repoRoot, '.git')
    const head = (await fs.readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim()
    if (!head.startsWith('ref: ')) return head
    const refPath = head.slice(5).trim()
    return (await fs.readFile(path.join(gitDir, refPath), 'utf8')).trim()
  } catch {
    return null
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const rr = path.join(args.root, 'release-readiness')
  const reportPath = (name) => path.join(rr, name)
  const publicAlpha = await readJson(reportPath('public-alpha-live-channel-proof.json'))
  const contentGraph = await readJson(reportPath('content-graph-evidence-release-proof.json'))
  const drift = await readJson(reportPath('modpack-module-artifact-drift.json'))
  const pipeline = await readJson(reportPath('all-modpacks-pipeline-audit.json'))
  const lifecycle = await readJson(reportPath('official-pack-launcher-lifecycle-smoke.json'))
  const allModpacks = await readJson(reportPath('all-modpacks-electron-install-smoke.json'))
  const allNative = await readJson(reportPath('all-native-modpacks-runtime-load-smoke.json'))
  const ashfallHandoff = await readJson(reportPath('ashfall-electron-install-handoff-smoke.json'))
  const ashfallGameplay = await readJson(reportPath('ashfall-lane-game-smoke.json'), { optional: true })
  const standaloneReportPath = path.resolve(args.root, '..', 'ECHO-Standalone-Runtime', 'reports', 'echo', 'standalone', 'content-graph-load.json')
  const standalone = await readJson(standaloneReportPath, { optional: true })
  const releaseIndexHead = await gitHead(args.root)

  const gates = []
  const moduleDistribution = publicAlpha.moduleEvidenceDistribution ?? []
  const canonicalDistribution = moduleDistribution.find((entry) => entry.releaseTag === CANONICAL_MODULE_RELEASE)
  gates.push(makeGate(
    'public-alpha-live-channel',
    'release-readiness/public-alpha-live-channel-proof.json',
    publicAlpha,
    publicAlpha.status === 'pass'
      && publicAlpha.failedArtifactCount === 0
      && publicAlpha.artifactCount === 827
      && canonicalDistribution?.moduleCount === EXPECTED_MODULE_ROWS,
    [
      `Expected public alpha live proof status pass, 0 failed artifacts, 827 artifacts, and ${EXPECTED_MODULE_ROWS} modules from ${CANONICAL_MODULE_RELEASE}.`,
    ],
    {
      artifactCount: publicAlpha.artifactCount,
      failedArtifactCount: publicAlpha.failedArtifactCount,
      totalVerifiedBytes: publicAlpha.totalVerifiedBytes,
      moduleEvidenceDistribution: moduleDistribution,
    },
  ))

  gates.push(makeGate(
    'content-graph-release-proof',
    'release-readiness/content-graph-evidence-release-proof.json',
    contentGraph,
    contentGraph.status === 'PASS'
      && contentGraph.moduleRelease?.tag === CANONICAL_MODULE_RELEASE
      && contentGraph.catalogComposition?.moduleRows === EXPECTED_MODULE_ROWS
      && contentGraph.moduleRelease?.counts?.hytaleBlockerCount === EXPECTED_HYTALE_BLOCKERS,
    [
      `Expected ${CANONICAL_MODULE_RELEASE}, ${EXPECTED_MODULE_ROWS} module rows, status PASS, and Hytale blocker count ${EXPECTED_HYTALE_BLOCKERS}.`,
    ],
    {
      moduleRelease: contentGraph.moduleRelease?.tag,
      counts: contentGraph.moduleRelease?.counts ?? null,
      catalogComposition: contentGraph.catalogComposition ?? null,
    },
  ))

  gates.push(makeGate(
    'modpack-module-artifact-drift',
    'release-readiness/modpack-module-artifact-drift.json',
    drift,
    drift.status === 'pass' && (drift.blockers?.length ?? 0) === 0,
    drift.blockers ?? ['Modpack module artifact drift report did not pass.'],
    {
      checkedManifestCount: drift.checkedManifestCount ?? drift.manifestCount ?? null,
    },
  ))

  gates.push(makeGate(
    'all-modpacks-pipeline-audit',
    'release-readiness/all-modpacks-pipeline-audit.json',
    pipeline,
    pipeline.ok === true
      && pipeline.summary?.total === EXPECTED_OFFICIAL_PACKS
      && pipeline.summary?.failed === 0
      && pipeline.summary?.warnings === 0,
    ['Expected all-modpacks pipeline audit to pass all 15 official packs with 0 warnings.'],
    {
      summary: pipeline.summary ?? null,
    },
  ))

  gates.push(makeGate(
    'official-pack-launcher-lifecycle',
    'release-readiness/official-pack-launcher-lifecycle-smoke.json',
    lifecycle,
    lifecycle.ok === true
      && lifecycle.officialPackCount === EXPECTED_OFFICIAL_PACKS
      && lifecycle.coveredPackCount === EXPECTED_OFFICIAL_PACKS
      && (lifecycle.blockers?.length ?? 0) === 0,
    lifecycle.blockers ?? ['Expected official pack lifecycle smoke to cover all official packs.'],
    summarizeLifecycle(lifecycle),
  ))

  const allModpacksCoverage = summarizePackCoverage(allModpacks)
  gates.push(makeGate(
    'all-modpacks-electron-install-handoff',
    'release-readiness/all-modpacks-electron-install-smoke.json',
    allModpacks,
    allModpacks.ok === true
      && allModpacks.expectedPackCount === EXPECTED_OFFICIAL_PACKS
      && (allModpacks.packs?.length ?? 0) === EXPECTED_OFFICIAL_PACKS
      && (allModpacks.failures?.length ?? 0) === 0
      && allModpacksCoverage.moduleReleaseSources.length === 1
      && allModpacksCoverage.moduleReleaseSources[0]?.releaseTag === CANONICAL_MODULE_RELEASE
      && allModpacksCoverage.moduleReleaseSources[0]?.releaseSourceState === 'full-release-evidence',
    allModpacks.failures ?? ['Expected 15-pack Electron install/handoff smoke to pass from the canonical full evidence release.'],
    allModpacksCoverage,
  ))

  gates.push(makeGate(
    'all-native-modpacks-runtime-load',
    'release-readiness/all-native-modpacks-runtime-load-smoke.json',
    allNative,
    allNative.ok === true
      && allNative.expectedPackCount === EXPECTED_NATIVE_PACKS
      && (allNative.packs?.length ?? 0) === EXPECTED_NATIVE_PACKS
      && (allNative.failures?.length ?? 0) === 0,
    allNative.failures ?? ['Expected all native modpack runtime load smoke to pass.'],
    summarizePackCoverage(allNative),
  ))

  gates.push(makeGate(
    'ashfall-electron-install-handoff-repair',
    'release-readiness/ashfall-electron-install-handoff-smoke.json',
    ashfallHandoff,
    ashfallHandoff.ok === true
      && ashfallHandoff.expectedPackCount === EXPECTED_ASHFALL_HANDOFF_PACKS
      && (ashfallHandoff.packs?.length ?? 0) === EXPECTED_ASHFALL_HANDOFF_PACKS
      && (ashfallHandoff.failures?.length ?? 0) === 0
      && (ashfallHandoff.packs ?? []).every((pack) => pack.repairFixture?.skipped === false && pack.launchRoute?.repair?.ok === true),
    ashfallHandoff.failures ?? ['Expected Ashfall Native and NeoForge install/handoff repair smoke to pass.'],
    summarizePackCoverage(ashfallHandoff),
  ))

  const nativeGate = (contentGraph.runtimeGates ?? [])
    .find((gate) => String(gate.command ?? '').includes('runNativeContentGraphEvidenceGate'))
  gates.push(nativeGate?.status === 'PASS'
    ? passGate('native-content-graph-evidence-gate', 'release-readiness/content-graph-evidence-release-proof.json', contentGraph.generatedAt, {
      command: nativeGate.command,
      result: nativeGate.result,
    })
    : failGate('native-content-graph-evidence-gate', 'release-readiness/content-graph-evidence-release-proof.json', contentGraph.generatedAt, [
      'Native content graph evidence gate is missing or not PASS in content graph proof.',
    ]))

  gates.push(makeGate(
    'standalone-content-graph-load-smoke',
    rel(args.root, standaloneReportPath),
    standalone,
    standalone?.status === 'PASS'
      && standalone?.canonicalEvidence === true
      && standalone?.moduleCount === EXPECTED_MODULE_ROWS
      && standalone?.hytaleBlockedNodes === EXPECTED_HYTALE_BLOCKERS
      && standalone?.failures === 0,
    ['Expected Standalone content graph load smoke to pass against canonical evidence.'],
    {
      schemaVersion: standalone?.schema ?? null,
      evidenceSchemaVersion: standalone?.evidenceSchemaVersion ?? null,
      graphs: standalone?.graphs ?? null,
      moduleCount: standalone?.moduleCount ?? null,
      nodes: standalone?.nodes ?? null,
      edges: standalone?.edges ?? null,
      features: standalone?.features ?? null,
      exportPlans: standalone?.exportPlans ?? null,
      hytaleBlockedNodes: standalone?.hytaleBlockedNodes ?? null,
      checked: standalone?.checked ?? null,
      failures: standalone?.failures ?? null,
    },
  ))

  const gameplayMatrix = [
    gameplayEntryFromAshfall(ashfallGameplay),
    staleGameplayEntry(
      'Sky Relay',
      'release-readiness/sky-relay-electron-ui-smoke.json',
      'Current UI smoke rerun timed out waiting for a scoped Update action after catalog convergence; install/handoff proof is current, gameplay route proof needs an updated current-state smoke.',
    ),
    staleGameplayEntry(
      'Galactic Survey',
      'release-readiness/galactic-survey-electron-ui-smoke.json',
      'Only older UI/gameplay evidence reports exist; rerun or update the gameplay smoke against the converged catalog.',
    ),
    staleGameplayEntry(
      'Openlands',
      null,
      'No current Openlands gameplay smoke report exists; install/handoff and content graph load are proven, but in-game proof is still required.',
    ),
    staleGameplayEntry(
      'Arcana Division',
      null,
      'No current Arcana Division gameplay smoke report exists; install/handoff is proven, but in-game proof is still required.',
    ),
  ]

  const hardFailures = gates.filter((gate) => gate.status === 'fail')
  const gameplayWarnings = gameplayMatrix.filter((entry) => entry.status !== 'pass')
  const status = hardFailures.length ? 'fail' : gameplayWarnings.length ? 'warn' : 'pass'
  const report = {
    schemaVersion: 'echo.release_index.public_alpha_runtime_acceptance.v1',
    generatedAt: new Date().toISOString(),
    status,
    releaseIndexHeadAtGeneration: releaseIndexHead,
    reportCommitNote: 'This report records the Release Index HEAD observed before the report file is committed; use Git history for the commit that contains the report.',
    summary: {
      hardGateCount: gates.length,
      hardGatePassCount: gates.filter((gate) => gate.status === 'pass').length,
      hardGateFailureCount: hardFailures.length,
      gameplayWarningCount: gameplayWarnings.length,
      conclusion: hardFailures.length
        ? 'Public-alpha runtime acceptance is blocked by hard catalog/install/runtime gate failures.'
        : gameplayWarnings.length
          ? 'Catalog convergence, install, handoff, lifecycle, and content graph runtime gates are green; real gameplay proof remains warning-gated.'
          : 'Public-alpha runtime acceptance is fully green.',
    },
    moduleEvidence: {
      canonicalReleaseTag: CANONICAL_MODULE_RELEASE,
      expectedModuleRows: EXPECTED_MODULE_ROWS,
      distribution: moduleDistribution,
      hytale: {
        runtimeSupported: false,
        evidenceOnly: true,
        expectedBlockerCount: EXPECTED_HYTALE_BLOCKERS,
        observedBlockerCount: contentGraph.moduleRelease?.counts?.hytaleBlockerCount ?? standalone?.hytaleBlockedNodes ?? null,
        note: 'Hytale evidence remains export planning only; no UI should present playable/runtime Hytale support.',
      },
    },
    hardGates: gates,
    gameplayMatrix,
    recoveryAndLifecycle: {
      sourceReport: 'release-readiness/official-pack-launcher-lifecycle-smoke.json',
      installUpdateRollbackRepairCovered: lifecycle.ok === true && (lifecycle.blockers?.length ?? 0) === 0,
      ...summarizeLifecycle(lifecycle),
    },
    nextRequiredProof: [
      'Update Sky Relay and Galactic Survey UI/gameplay smokes so current/no-update catalog state is accepted explicitly instead of timing out on an obsolete Update button expectation.',
      'Capture real gameplay evidence JSON for Ashfall, Sky Relay, Galactic Survey, Openlands, and Arcana Division across Native, NeoForge, and Standalone lanes.',
      'Resolve Ashfall NeoForge client renderer crash before treating gameplay as release-green.',
      'Keep Native and Standalone content graph gates required, with any canonical evidence mismatch failing release readiness.',
    ],
  }

  if (args.write) {
    await fs.mkdir(path.dirname(args.out), { recursive: true })
    await fs.writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`)
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Public alpha runtime acceptance ${status.toUpperCase()}: ${report.summary.hardGatePassCount}/${report.summary.hardGateCount} hard gates passed; ${gameplayWarnings.length} gameplay warning group(s).`)
    if (args.write) console.log(`Wrote ${rel(args.root, args.out)}`)
  }

  if (hardFailures.length) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
