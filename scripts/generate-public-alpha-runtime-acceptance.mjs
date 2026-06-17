#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OUT = path.join('release-readiness', 'public-alpha-runtime-acceptance.json')
const CANONICAL_MODULE_RELEASE = 'modules-canonical-full-20260616'
const ASHFALL_RENDERER_HOTFIX_RELEASE = 'modules-ashfall-renderer-hotfix-20260617'
const EXPECTED_MODULE_ROWS = 133
const EXPECTED_FULL_RELEASE_MODULE_ROWS = 131
const EXPECTED_PARTIAL_HOTFIX_MODULE_ROWS = 2
const EXPECTED_PUBLIC_ALPHA_ARTIFACTS = 838
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

function findSource(sources, releaseTag, releaseSourceState) {
  return (sources ?? []).find((source) =>
    source.releaseTag === releaseTag
      && source.releaseSourceState === releaseSourceState)
}

function hasOnlyKnownModuleSources(sources) {
  return (sources ?? []).every((source) =>
    (source.releaseTag === CANONICAL_MODULE_RELEASE && source.releaseSourceState === 'full-release-evidence')
      || (source.releaseTag === ASHFALL_RENDERER_HOTFIX_RELEASE && source.releaseSourceState === 'partial-hotfix-evidence'))
}

function hasExpectedCatalogDistribution(distribution) {
  const fullRelease = findSource(distribution, CANONICAL_MODULE_RELEASE, undefined)
    ?? (distribution ?? []).find((entry) => entry.releaseTag === CANONICAL_MODULE_RELEASE)
  const hotfixRelease = findSource(distribution, ASHFALL_RENDERER_HOTFIX_RELEASE, undefined)
    ?? (distribution ?? []).find((entry) => entry.releaseTag === ASHFALL_RENDERER_HOTFIX_RELEASE)
  const totalRows = (distribution ?? []).reduce((total, entry) => total + Number(entry.moduleCount ?? entry.moduleRows ?? 0), 0)
  return totalRows === EXPECTED_MODULE_ROWS
    && Number(fullRelease?.moduleCount ?? fullRelease?.moduleRows ?? 0) === EXPECTED_FULL_RELEASE_MODULE_ROWS
    && Number(hotfixRelease?.moduleCount ?? hotfixRelease?.moduleRows ?? 0) === EXPECTED_PARTIAL_HOTFIX_MODULE_ROWS
}

function hasExpectedInstalledSourceMix(sources, { requireHotfix }) {
  const fullRelease = findSource(sources, CANONICAL_MODULE_RELEASE, 'full-release-evidence')
  const hotfixRelease = findSource(sources, ASHFALL_RENDERER_HOTFIX_RELEASE, 'partial-hotfix-evidence')
  return Boolean(fullRelease)
    && (!requireHotfix || Boolean(hotfixRelease))
    && hasOnlyKnownModuleSources(sources)
}

function contentGraphCatalog(report) {
  return report?.catalogComposition
    ? {
      moduleRows: report.catalogComposition.moduleRows,
      primaryReleaseTag: report.catalogComposition.primaryReleaseTag,
      primaryReleaseModuleRows: report.catalogComposition.primaryReleaseModuleRows,
      alternateEvidenceReleases: report.catalogComposition.alternateEvidenceReleases ?? [],
      releaseTagDistribution: report.catalogComposition.releaseTagDistribution ?? null,
    }
    : {
      moduleRows: report?.moduleRows ?? null,
      primaryReleaseTag: report?.releaseTag ?? null,
      primaryReleaseModuleRows: report?.primaryReleaseModuleRows ?? null,
      alternateEvidenceReleases: report?.alternateEvidenceReleases ?? [],
      releaseTagDistribution: report?.releaseTagDistribution ?? null,
    }
}

function contentGraphCounts(report, standalone) {
  return report?.moduleRelease?.counts ?? {
    graphCount: standalone?.graphs ?? null,
    moduleCount: standalone?.moduleCount ?? null,
    nodeCount: standalone?.nodes ?? null,
    edgeCount: standalone?.edges ?? null,
    featureCount: standalone?.features ?? null,
    exportPlanCount: standalone?.exportPlans ?? null,
    hytaleBlockerCount: standalone?.hytaleBlockedNodes ?? null,
  }
}

function gameplayMatrixFromAcceptance(report) {
  if (!report) {
    return [{
      family: 'Public Alpha',
      status: 'blocked',
      sourceReport: 'release-readiness/gameplay-acceptance-matrix.json',
      current: false,
      blockerCount: 1,
      blockers: ['Gameplay acceptance matrix is missing. Run node scripts/verify-gameplay-acceptance.mjs before generating public-alpha runtime acceptance.'],
      conclusion: 'Gameplay acceptance has not been generated.',
    }]
  }
  return (report.families ?? []).map((family) => ({
    family: family.family,
    status: family.status === 'pass' ? 'pass' : 'blocked',
    sourceReports: family.sourceReports ?? [],
    current: family.status === 'pass',
    laneCount: family.laneCount ?? 0,
    passedLaneCount: family.passedLaneCount ?? 0,
    blockerCount: family.blockerCount ?? 0,
    blockerSample: (family.blockers ?? []).slice(0, 20),
    lanes: (family.lanes ?? []).map((lane) => ({
      lane: lane.lane,
      packId: lane.packId,
      sourceRepo: lane.sourceRepo ?? null,
      workspaceDir: lane.workspaceDir ?? null,
      status: lane.status,
      releaseReady: lane.releaseReady === true,
      blockerCount: lane.blockerCount ?? 0,
      blockers: lane.blockers ?? [],
      evidencePath: lane.evidencePath ?? null,
      evidencePresent: lane.evidencePresent ?? null,
      claims: lane.claims ?? null,
      openTaskCount: lane.openTaskCount ?? null,
      logSummary: lane.logSummary ?? null,
      crashSummary: lane.crashSummary ?? null,
      crashReport: lane.crashReport ?? null,
      computerUseCaptureAttempt: lane.computerUseCaptureAttempt ?? null,
    })),
    conclusion: family.conclusion ?? null,
  }))
}

function computerUseCaptureAttemptFromReport(report) {
  if (!report) {
    return {
      sourceReport: 'release-readiness/computer-use-gameplay-capture-attempt.json',
      present: false,
      status: 'missing',
      acceptedAsGameplayProof: false,
      blockers: ['No Computer Use gameplay capture attempt report has been recorded.'],
    }
  }
  const blockers = Array.isArray(report.blockers) ? report.blockers : []
  const status = String(report.status ?? '').toLowerCase()
  return {
    sourceReport: 'release-readiness/computer-use-gameplay-capture-attempt.json',
    present: true,
    schemaVersion: report.schemaVersion ?? null,
    generatedAt: report.generatedAt ?? null,
    status: status || null,
    targetFamily: report.target?.family ?? null,
    targetLane: report.target?.lane ?? null,
    targetPackId: report.target?.packId ?? null,
    launcherWindowObserved: report.launcherWindow?.observed === true,
    launcherAccessibilityObserved: report.launcherWindow?.accessibility?.observed === true,
    screenshotCapture: report.screenshotCapture ?? null,
    inputStoppedAfterCaptureFailure: report.inputStoppedAfterCaptureFailure === true,
    acceptedAsGameplayProof: report.acceptedAsGameplayProof === true,
    claimsPromoted: report.claimsPromoted === true,
    verificationChecks: Array.isArray(report.verificationChecks) ? report.verificationChecks : [],
    verificationSummary: report.verificationSummary ?? null,
    blockers,
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
  const gameplayAcceptance = await readJson(reportPath('gameplay-acceptance-matrix.json'), { optional: true })
  const computerUseCaptureAttempt = await readJson(reportPath('computer-use-gameplay-capture-attempt.json'), { optional: true })
  const standaloneReportPath = path.resolve(args.root, '..', 'ECHO-Standalone-Runtime', 'reports', 'echo', 'standalone', 'content-graph-load.json')
  const standalone = await readJson(standaloneReportPath, { optional: true })
  const releaseIndexHead = await gitHead(args.root)

  const gates = []
  const moduleDistribution = publicAlpha.moduleEvidenceDistribution ?? []
  const catalogComposition = contentGraphCatalog(contentGraph)
  const graphCounts = contentGraphCounts(contentGraph, standalone)
  gates.push(makeGate(
    'public-alpha-live-channel',
    'release-readiness/public-alpha-live-channel-proof.json',
    publicAlpha,
    publicAlpha.status === 'pass'
      && publicAlpha.failedArtifactCount === 0
      && publicAlpha.artifactCount === EXPECTED_PUBLIC_ALPHA_ARTIFACTS
      && hasExpectedCatalogDistribution(moduleDistribution),
    [
      `Expected public alpha live proof status pass, 0 failed artifacts, ${EXPECTED_PUBLIC_ALPHA_ARTIFACTS} artifacts, ${EXPECTED_FULL_RELEASE_MODULE_ROWS} modules from ${CANONICAL_MODULE_RELEASE}, and ${EXPECTED_PARTIAL_HOTFIX_MODULE_ROWS} modules from ${ASHFALL_RENDERER_HOTFIX_RELEASE}.`,
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
      && catalogComposition.primaryReleaseTag === CANONICAL_MODULE_RELEASE
      && catalogComposition.moduleRows === EXPECTED_MODULE_ROWS
      && catalogComposition.primaryReleaseModuleRows === EXPECTED_FULL_RELEASE_MODULE_ROWS
      && (catalogComposition.alternateEvidenceReleases ?? []).some((entry) =>
        entry.releaseTag === ASHFALL_RENDERER_HOTFIX_RELEASE
          && Number(entry.moduleRows ?? entry.moduleCount ?? 0) === EXPECTED_PARTIAL_HOTFIX_MODULE_ROWS
          && entry.releaseSourceState === 'partial-hotfix-evidence')
      && graphCounts.hytaleBlockerCount === EXPECTED_HYTALE_BLOCKERS,
    [
      `Expected ${CANONICAL_MODULE_RELEASE} as the full evidence release with ${EXPECTED_FULL_RELEASE_MODULE_ROWS} active rows, ${ASHFALL_RENDERER_HOTFIX_RELEASE} as a ${EXPECTED_PARTIAL_HOTFIX_MODULE_ROWS}-row partial hotfix, status PASS, and Hytale blocker count ${EXPECTED_HYTALE_BLOCKERS}.`,
    ],
    {
      moduleRelease: contentGraph.moduleRelease?.tag ?? contentGraph.releaseTag,
      counts: graphCounts,
      catalogComposition,
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
      && hasExpectedInstalledSourceMix(allModpacksCoverage.moduleReleaseSources, { requireHotfix: true }),
    allModpacks.failures ?? [`Expected 15-pack Electron install/handoff smoke to pass from ${CANONICAL_MODULE_RELEASE} plus ${ASHFALL_RENDERER_HOTFIX_RELEASE} partial hotfix evidence.`],
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
      && (ashfallHandoff.packs ?? []).every((pack) => pack.repairFixture?.skipped === false && pack.launchRoute?.repair?.ok === true)
      && hasExpectedInstalledSourceMix(summarizePackCoverage(ashfallHandoff).moduleReleaseSources, { requireHotfix: true }),
    ashfallHandoff.failures ?? [`Expected Ashfall Native and NeoForge install/handoff repair smoke to pass with ${ASHFALL_RENDERER_HOTFIX_RELEASE} partial hotfix evidence.`],
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

  const gameplayMatrix = gameplayMatrixFromAcceptance(gameplayAcceptance)
  const computerUseGameplayCapture = computerUseCaptureAttemptFromReport(computerUseCaptureAttempt)
  const nextRequiredProof = [
    ...(computerUseGameplayCapture.present && computerUseGameplayCapture.acceptedAsGameplayProof !== true
      ? ['Resolve the Computer Use screenshot capture failure or rerun capture on a machine where visible window screenshots can be recorded, then import screenshots/logs/save snapshots before marking gameplay claims true.']
      : []),
    'Capture real gameplay evidence JSON for Ashfall, Sky Relay, Galactic Survey, Openlands, and Arcana Division across Native, NeoForge, and Standalone lanes.',
    'Capture Ashfall NeoForge runtime logs and real gameplay proof before treating gameplay as release-green.',
    'Keep Openlands and Arcana Division fail-closed until their family gameplay evidence reports contain real lane captures.',
    'Keep Native and Standalone content graph gates required, with any canonical evidence mismatch failing release readiness.',
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
      fullReleaseRows: EXPECTED_FULL_RELEASE_MODULE_ROWS,
      partialHotfixReleaseTag: ASHFALL_RENDERER_HOTFIX_RELEASE,
      partialHotfixRows: EXPECTED_PARTIAL_HOTFIX_MODULE_ROWS,
      hytale: {
        runtimeSupported: false,
        evidenceOnly: true,
        expectedBlockerCount: EXPECTED_HYTALE_BLOCKERS,
        observedBlockerCount: graphCounts.hytaleBlockerCount ?? standalone?.hytaleBlockedNodes ?? null,
        note: 'Hytale evidence remains export planning only; no UI should present playable/runtime Hytale support.',
      },
    },
    hardGates: gates,
    gameplayAcceptance: {
      sourceReport: 'release-readiness/gameplay-acceptance-matrix.json',
      present: Boolean(gameplayAcceptance),
      schemaVersion: gameplayAcceptance?.schemaVersion ?? null,
      status: gameplayAcceptance?.status ?? null,
      generatedAt: gameplayAcceptance?.generatedAt ?? null,
      strictReady: gameplayAcceptance?.strictReady === true,
      summary: gameplayAcceptance?.summary ?? null,
      transportEvidence: gameplayAcceptance?.transportEvidence ?? [],
      computerUseCaptureAttempts: gameplayAcceptance?.computerUseCaptureAttempts ?? [],
    },
    computerUseGameplayCapture,
    gameplayMatrix,
    recoveryAndLifecycle: {
      sourceReport: 'release-readiness/official-pack-launcher-lifecycle-smoke.json',
      installUpdateRollbackRepairCovered: lifecycle.ok === true && (lifecycle.blockers?.length ?? 0) === 0,
      ...summarizeLifecycle(lifecycle),
    },
    nextRequiredProof,
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
