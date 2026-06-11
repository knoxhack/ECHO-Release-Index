#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const MODULE_REPO = 'ECHO-Modules'
const MODULE_ROOT = 'addons/echoskyrelayprotocol'
const MODULE_ID = 'echoskyrelayprotocol'
const DEFAULT_OUT = 'release-readiness/sky-relay-public-alpha-readiness.json'

const EDITIONS = [
  {
    key: 'native',
    repoDir: 'ECHO-Sky-Relay-Native-Edition',
    packId: 'sky-relay-native-edition',
    releaseTag: 'sky-relay-native-0.1.0-alpha',
  },
  {
    key: 'neoforge',
    repoDir: 'ECHO-Sky-Relay-NeoForge-Edition',
    packId: 'sky-relay-neoforge-edition',
    releaseTag: 'sky-relay-neoforge-0.1.0-alpha',
  },
  {
    key: 'standalone',
    repoDir: 'ECHO-Sky-Relay-Standalone-Edition',
    packId: 'sky-relay-standalone-edition',
    releaseTag: 'sky-relay-standalone-0.1.0-alpha',
  },
]

const REPORTS = {
  moduleRelease: 'release-readiness/sky-relay-module-draft-release.json',
  editionReleases: 'release-readiness/sky-relay-edition-draft-releases.json',
  editionPackAssets: 'release-readiness/sky-relay-edition-pack-assets.json',
  editionPackSmoke: 'release-readiness/sky-relay-edition-pack-smoke.json',
  launcherLifecycleSmoke: 'release-readiness/sky-relay-launcher-lifecycle-smoke.json',
  electronUiSmoke: 'release-readiness/sky-relay-electron-ui-smoke.json',
  gameplayRouteSmoke: 'release-readiness/sky-relay-gameplay-route-smoke.json',
  gameplayEvidence: 'release-readiness/sky-relay-gameplay-evidence.json',
}

const EXPECTED_BLOCKS = [
  'damaged_relay_core',
  'relay_anchor_node',
  'fragment_docking_clamp',
  'atmospheric_condenser',
  'storm_shield_pylon',
  'pressure_bulkhead',
  'sky_fragment_beacon',
  'relay_signal_array',
  'relay_marker_light',
  'aero_salvage_crate',
  'void_recovery_cache',
  'skybridge_projector',
  'signal_crown_interface',
  'storm_output_collector',
]

const EXPECTED_ITEMS = [
  'operator_badge',
  'relay_anchor_key',
  'sky_fragment_chart',
  'charged_relay_coil',
  'relay_alloy_plate',
  'signal_calibration_chip',
  'atmospheric_filter',
  'stormproof_wrap',
  'relay_firmware_shard',
  'stabilized_platform_core',
  'fragment_access_cipher',
  'static_filament',
  'orbital_alloy_scrap',
  'satellite_lens',
  'echo_crystal_charge',
  'sky_relay_badge',
]

const EXPECTED_FRAGMENTS = [
  'starter_relay',
  'hydroponics_deck',
  'aero_salvage_yard',
  'solar_wing',
  'weather_mast',
  'machine_bay',
  'logistics_spur',
  'orbital_debris_dock',
  'signal_crown',
]

const EXPECTED_CHAPTERS = [
  'awakening',
  'power_critical',
  'first_anchor',
  'storm_warning',
  'signal_crown',
]

const EXPECTED_PROVIDES = [
  'skyrelay.content',
  'skyrelay.missions',
  'skyrelay.fragments',
  'skyrelay.terminal',
  'skyrelay.weather_routes',
]

const EXPECTED_OPTIONAL_INTEGRATIONS = [
  'echoterminal',
  'echolens',
  'echoholomap',
  'echoweathercore',
  'echopowergrid',
  'echorecovery',
  'echologisticsnetwork',
]

const REQUIRED_GAMEPLAY_EVIDENCE_CLAIMS = [
  'freshWorldCreated',
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'realSignalCrownPlaythrough',
  'saveReloadVerified',
  'noCrashEvidence',
]

const REQUIRED_GAMEPLAY_EVIDENCE_GATES = [
  'routeContractReport',
  'captureKitReady',
  ...REQUIRED_GAMEPLAY_EVIDENCE_CLAIMS,
]

const PHASES = [
  [1, 'repo_foundation', 'Repo Foundation'],
  [2, 'protocol_module', 'Protocol Module'],
  [3, 'identity_metadata', 'Identity And Metadata'],
  [4, 'core_blocks', 'Core Blocks'],
  [5, 'core_items', 'Core Items'],
  [6, 'fragments_world_loop', 'Fragments And World Loop'],
  [7, 'player_progression', 'Player Progression'],
  [8, 'systems_integration', 'Systems Integration'],
  [9, 'editions_launcher', 'Editions And Launcher'],
  [10, 'release_public_alpha', 'Release And Public Alpha'],
]

function usage() {
  return `Usage: node scripts/verify-sky-relay-public-alpha-readiness.mjs [options]

Builds a 10-phase Sky Relay readiness audit from source files and existing
release-readiness evidence. The command is fail-closed: use
--require-release-ready to exit non-zero while public-alpha promotion remains
blocked.

Options:
  --root <dir>                 Release Index repository root. Default: current directory.
  --workspace-root <dir>       Workspace containing sibling ECHO repos. Default: parent of --root.
  --out <path>                 Output report path. Default: ${DEFAULT_OUT}
  --write                      Write the computed readiness report.
  --require-release-ready      Exit non-zero unless every phase is passed.
  --help                       Print this help text.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    workspaceRoot: null,
    out: DEFAULT_OUT,
    write: false,
    requireReleaseReady: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--workspace-root') args.workspaceRoot = path.resolve(next())
    else if (arg === '--out') args.out = next()
    else if (arg === '--write') args.write = true
    else if (arg === '--require-release-ready') args.requireReleaseReady = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!args.workspaceRoot) args.workspaceRoot = path.resolve(args.root, '..')
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readTextOrNull(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function readJsonOrNull(filePath) {
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

function ids(values) {
  return new Set((values ?? []).map((value) => value.id))
}

function phase(number) {
  const [, id, name] = PHASES.find(([candidate]) => candidate === number)
  return {
    phase: number,
    id,
    name,
    status: 'passed',
    evidence: [],
    blockers: [],
  }
}

function requireCondition(item, condition, evidence, blocker) {
  if (condition) item.evidence.push(evidence)
  else item.blockers.push(blocker)
}

async function requireFile(item, root, relPath, label = relPath) {
  const ok = await fileExists(path.join(root, relPath))
  requireCondition(item, ok, `${label} exists`, `${label} is missing`)
}

async function requireDir(item, root, relPath, label = relPath) {
  const ok = await dirExists(path.join(root, relPath))
  requireCondition(item, ok, `${label} exists`, `${label} is missing`)
}

function requireIncludes(item, set, expected, label) {
  for (const value of expected) {
    requireCondition(item, set.has(value), `${label} includes ${value}`, `${label} is missing ${value}`)
  }
}

function requireGate(item, report, reportName, gate, accepted = ['passed']) {
  const actual = report?.gates?.[gate]
  requireCondition(
    item,
    accepted.includes(actual),
    `${reportName} gate ${gate}=${actual}`,
    `${reportName} gate ${gate} must be ${accepted.join(' or ')}, found ${actual ?? 'missing'}`,
  )
}

function requireReport(item, report, reportName, schemaVersion = null) {
  requireCondition(item, Boolean(report), `${reportName} exists`, `${reportName} is missing`)
  if (report && schemaVersion) {
    requireCondition(
      item,
      report.schemaVersion === schemaVersion,
      `${reportName} schemaVersion=${schemaVersion}`,
      `${reportName} schemaVersion must be ${schemaVersion}`,
    )
  }
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function expectedArtifactFromPackAssets(editionPackAssets, edition) {
  const entry = editionPackAssets?.downloadBackValidation?.editions?.find((candidate) =>
    candidate?.packId === edition.packId && candidate?.releaseTag === edition.releaseTag)
  const zipName = entry?.zip?.name
  const zipAsset = entry?.assets?.find((asset) => asset?.name === zipName)
  if (!entry || entry.zip?.validated !== true || !zipName || !zipAsset) return null
  return {
    artifactAsset: zipName,
    artifactSha256: zipAsset.sha256,
    artifactSize: Number(zipAsset.size),
  }
}

function requireGameplayEvidenceReport(item, report, editionPackAssets) {
  requireReport(item, report, 'gameplay evidence report', 'echo.skyrelay.gameplay-evidence.v1')
  if (!report) return

  requireCondition(item, report.status === 'PASS', 'gameplay evidence report is PASS', 'gameplay evidence report must be PASS before public alpha promotion')
  requireCondition(item, Array.isArray(report.blockers), 'gameplay evidence report includes blockers array', 'gameplay evidence report blockers must be an array')
  if (Array.isArray(report.blockers)) {
    requireCondition(item, report.status !== 'PASS' || report.blockers.length === 0, 'gameplay evidence report has no PASS/blocker contradiction', 'gameplay evidence report must not contain blockers')
  }
  requireCondition(item, report.moduleId === MODULE_ID, 'gameplay evidence report moduleId matches echoskyrelayprotocol', 'gameplay evidence report moduleId must be echoskyrelayprotocol')
  requireCondition(item, isIsoTimestamp(report.generatedAt), 'gameplay evidence report generatedAt is an ISO timestamp', 'gameplay evidence report generatedAt must be an ISO timestamp')
  requireCondition(item, report.routeContractReport === REPORTS.gameplayRouteSmoke, 'gameplay evidence report references the route smoke report', `gameplay evidence report routeContractReport must be ${REPORTS.gameplayRouteSmoke}`)
  requireCondition(item, report.editionPackAssets === REPORTS.editionPackAssets, 'gameplay evidence report references the edition pack assets report', `gameplay evidence report editionPackAssets must be ${REPORTS.editionPackAssets}`)
  requireCondition(item, report.manualEvidencePath === 'fixtures/sky-relay/gameplay-qa/manual-evidence.json', 'gameplay evidence report manual evidence path is recorded', 'gameplay evidence report manualEvidencePath must be fixtures/sky-relay/gameplay-qa/manual-evidence.json')
  for (const gate of REQUIRED_GAMEPLAY_EVIDENCE_GATES) {
    requireGate(item, report, 'gameplay evidence report', gate)
  }

  requireCondition(item, Array.isArray(report.captureKits) && report.captureKits.length === EDITIONS.length, 'gameplay evidence report includes all capture kit summaries', 'gameplay evidence report must include all capture kit summaries')
  for (const edition of EDITIONS) {
    const captureKit = report.captureKits?.find((entry) => entry?.edition === edition.key)
    requireCondition(item, captureKit?.status === 'passed', `gameplay evidence capture kit ${edition.key}=passed`, `gameplay evidence capture kit ${edition.key} must be passed`)
  }

  requireCondition(item, Boolean(report.requiredEvidence?.packArtifacts), 'gameplay evidence report includes required pack artifacts', 'gameplay evidence report must include requiredEvidence.packArtifacts')
  requireCondition(item, Array.isArray(report.editions) && report.editions.length === EDITIONS.length, 'gameplay evidence report includes all edition summaries', 'gameplay evidence report must include all edition summaries')
  for (const edition of EDITIONS) {
    const expectedArtifact = expectedArtifactFromPackAssets(editionPackAssets, edition)
    const actualArtifact = report.requiredEvidence?.packArtifacts?.[edition.key]
    requireCondition(item, Boolean(expectedArtifact), `edition pack assets include ${edition.key} public artifact`, `edition pack assets must include validated public artifact for ${edition.key}`)
    if (expectedArtifact) {
      for (const field of ['artifactAsset', 'artifactSha256', 'artifactSize']) {
        requireCondition(
          item,
          actualArtifact?.[field] === expectedArtifact[field],
          `gameplay evidence ${edition.key} artifact ${field} matches edition pack assets`,
          `gameplay evidence ${edition.key} artifact ${field} must match edition pack assets`,
        )
      }
    }

    const evidence = report.editions?.find((entry) => entry?.edition === edition.key)
    requireCondition(item, Boolean(evidence), `gameplay evidence report includes ${edition.key}`, `gameplay evidence report must include ${edition.key}`)
    if (!evidence) continue
    requireCondition(item, evidence.repository === `knoxhack/${edition.repoDir}`, `gameplay evidence ${edition.key} repository is recorded`, `gameplay evidence ${edition.key} repository must be knoxhack/${edition.repoDir}`)
    requireCondition(item, evidence.found === true, `gameplay evidence ${edition.key} manual evidence found`, `gameplay evidence ${edition.key} manual evidence must be found`)
    for (const claim of REQUIRED_GAMEPLAY_EVIDENCE_CLAIMS) {
      requireCondition(item, evidence.claims?.[claim] === true, `gameplay evidence ${edition.key} claim ${claim}=true`, `gameplay evidence ${edition.key} claim ${claim} must be true`)
    }
    requireCondition(item, (evidence.checked?.supportingFiles?.length ?? 0) >= 5, `gameplay evidence ${edition.key} checked supporting files`, `gameplay evidence ${edition.key} must include checked supporting files`)
    requireCondition(item, (evidence.checked?.screenshots?.length ?? 0) >= 4, `gameplay evidence ${edition.key} checked screenshots`, `gameplay evidence ${edition.key} must include checked screenshots`)
    requireCondition(item, (evidence.checked?.logs?.length ?? 0) >= 2, `gameplay evidence ${edition.key} checked logs`, `gameplay evidence ${edition.key} must include checked logs`)
    requireCondition(item, (evidence.checked?.saveSnapshots?.length ?? 0) >= 3, `gameplay evidence ${edition.key} checked save snapshots`, `gameplay evidence ${edition.key} must include checked save snapshots`)
  }
}

function finalizePhase(item) {
  item.status = item.blockers.length ? 'blocked' : 'passed'
  return item
}

function flattenBlockers(phases) {
  return phases.flatMap((item) => item.blockers.map((blocker) => `phase ${item.phase} ${item.name}: ${blocker}`))
}

async function buildReport(args) {
  const root = path.resolve(args.root)
  const workspaceRoot = path.resolve(args.workspaceRoot)
  const moduleRepoRoot = path.join(workspaceRoot, MODULE_REPO)
  const moduleRoot = path.join(moduleRepoRoot, MODULE_ROOT)
  const dataRoot = path.join(moduleRoot, 'src/main/resources/data/echoskyrelayprotocol/skyrelay')
  const reports = Object.fromEntries(
    await Promise.all(Object.entries(REPORTS).map(async ([key, relPath]) => [key, await readJsonOrNull(path.join(root, relPath))])),
  )

  const echoMod = await readJsonOrNull(path.join(moduleRoot, 'src/main/resources/META-INF/echo.mod.json'))
  const phaseMatrix = await readJsonOrNull(path.join(dataRoot, 'plan/production_phase_matrix.json'))
  const blockCatalog = await readJsonOrNull(path.join(dataRoot, 'content/block_catalog.json'))
  const itemCatalog = await readJsonOrNull(path.join(dataRoot, 'content/item_catalog.json'))
  const fragmentCatalog = await readJsonOrNull(path.join(dataRoot, 'fragments/fragment_catalog.json'))
  const anchorRules = await readJsonOrNull(path.join(dataRoot, 'fragments/anchor_rules.json'))
  const chapterCatalog = await readJsonOrNull(path.join(dataRoot, 'progression/chapter_catalog.json'))
  const settingsText = await readTextOrNull(path.join(moduleRepoRoot, 'settings.gradle'))
  const buildText = await readTextOrNull(path.join(moduleRepoRoot, 'build.gradle'))

  const phases = []

  {
    const item = phase(1)
    await requireFile(item, moduleRepoRoot, 'docs/SKY_RELAY_FULL_EXPERIENCE_PLAN.md', 'full experience plan')
    requireCondition(item, phaseMatrix?.phases?.length === 10, 'production phase matrix has 10 phases', 'production phase matrix must have 10 phases')
    requireCondition(
      item,
      (phaseMatrix?.phases ?? []).every((entry) => entry.subphases?.length === 5),
      'each production phase has 5 subphases',
      'each production phase must have exactly 5 subphases',
    )
    for (const edition of EDITIONS) await requireDir(item, workspaceRoot, edition.repoDir, `${edition.repoDir} repository checkout`)
    requireCondition(item, reports.moduleRelease?.project?.releaseId === 'sky-relay-0.1.0-alpha', 'module alpha release naming is recorded', 'module alpha release naming is missing')
    requireCondition(
      item,
      EDITIONS.every((edition) => reports.editionReleases?.releases?.some((release) => release.packId === edition.packId && release.releaseTag === edition.releaseTag)),
      'all edition alpha release names are recorded',
      'one or more edition alpha release names are missing',
    )
    phases.push(finalizePhase(item))
  }

  {
    const item = phase(2)
    await requireDir(item, moduleRepoRoot, MODULE_ROOT, MODULE_ROOT)
    for (const relPath of [
      `${MODULE_ROOT}/build.gradle`,
      `${MODULE_ROOT}/gradle.properties`,
      `${MODULE_ROOT}/README.md`,
      `${MODULE_ROOT}/src/main/java/com/knoxhack/echoskyrelayprotocol/EchoSkyRelayProtocol.java`,
      `${MODULE_ROOT}/src/main/java/com/knoxhack/echoskyrelayprotocol/EchoSkyRelayNativeModule.java`,
      `${MODULE_ROOT}/src/main/resources/META-INF/echo.mod.json`,
    ]) {
      await requireFile(item, moduleRepoRoot, relPath)
    }
    requireCondition(item, settingsText?.includes(MODULE_ID), 'settings.gradle includes echoskyrelayprotocol', 'settings.gradle is not wired for echoskyrelayprotocol')
    requireCondition(item, buildText?.includes(MODULE_ID), 'root build.gradle includes echoskyrelayprotocol release tasks', 'root build.gradle is not wired for echoskyrelayprotocol')
    phases.push(finalizePhase(item))
  }

  {
    const item = phase(3)
    requireCondition(item, echoMod?.name === 'ECHO: Sky Relay Protocol', 'module name is ECHO: Sky Relay Protocol', 'module name is incorrect')
    requireCondition(item, echoMod?.role === 'official_pack', 'module role is official_pack', 'module role must be official_pack')
    requireIncludes(item, new Set(echoMod?.provides ?? []), EXPECTED_PROVIDES, 'echo.mod.json provides')
    requireIncludes(item, new Set(echoMod?.optional ?? []), EXPECTED_OPTIONAL_INTEGRATIONS, 'echo.mod.json optional integrations')
    requireCondition(item, reports.moduleRelease?.project?.moduleId === MODULE_ID, 'Release Index module metadata exists', 'Release Index module metadata is missing')
    phases.push(finalizePhase(item))
  }

  {
    const item = phase(4)
    const blockIds = ids(blockCatalog?.blocks)
    requireCondition(item, blockCatalog?.blocks?.length === EXPECTED_BLOCKS.length, `block catalog has ${EXPECTED_BLOCKS.length} blocks`, `block catalog must contain ${EXPECTED_BLOCKS.length} blocks`)
    requireIncludes(item, blockIds, EXPECTED_BLOCKS, 'block catalog')
    phases.push(finalizePhase(item))
  }

  {
    const item = phase(5)
    const itemIds = ids(itemCatalog?.items)
    requireCondition(item, itemCatalog?.items?.length === EXPECTED_ITEMS.length, `item catalog has ${EXPECTED_ITEMS.length} items`, `item catalog must contain ${EXPECTED_ITEMS.length} items`)
    requireIncludes(item, itemIds, EXPECTED_ITEMS, 'item catalog')
    phases.push(finalizePhase(item))
  }

  {
    const item = phase(6)
    const fragmentIds = ids(fragmentCatalog?.fragments)
    const ruleIds = new Set((anchorRules?.rules ?? []).map((rule) => rule.fragmentId))
    requireCondition(item, fragmentCatalog?.fragments?.length === EXPECTED_FRAGMENTS.length, `fragment catalog has ${EXPECTED_FRAGMENTS.length} fragments`, `fragment catalog must contain ${EXPECTED_FRAGMENTS.length} fragments`)
    requireIncludes(item, fragmentIds, EXPECTED_FRAGMENTS, 'fragment catalog')
    requireIncludes(item, ruleIds, EXPECTED_FRAGMENTS, 'anchor rules')
    requireCondition(
      item,
      (anchorRules?.rules ?? []).every((rule) => Number.isFinite(rule.powerCost ?? rule.stablePowerRequired) && rule.scanRequirement && rule.stormRisk),
      'each anchor rule includes power cost, scan requirement, and storm risk',
      'each anchor rule must include power cost, scan requirement, and storm risk',
    )
    phases.push(finalizePhase(item))
  }

  {
    const item = phase(7)
    const chapterIds = ids(chapterCatalog?.chapters)
    requireIncludes(item, chapterIds, EXPECTED_CHAPTERS, 'chapter catalog')
    requireReport(item, reports.gameplayRouteSmoke, 'gameplay route smoke', 'echo.skyrelay.gameplay-route-smoke.v1')
    requireGate(item, reports.gameplayRouteSmoke, 'gameplay route smoke', 'first30RouteContract')
    requireGate(item, reports.gameplayRouteSmoke, 'gameplay route smoke', 'first2HourRouteContract')
    requireGate(item, reports.gameplayRouteSmoke, 'gameplay route smoke', 'signalCrownContract')
    phases.push(finalizePhase(item))
  }

  {
    const item = phase(8)
    for (const relPath of [
      'integrations/terminal_pages.json',
      'integrations/lens_scan_profiles.json',
      'integrations/holomap_layers.json',
      'integrations/weather_routes.json',
      'integrations/recovery_bindings.json',
    ]) {
      await requireFile(item, dataRoot, relPath, `skyrelay ${relPath}`)
    }
    phases.push(finalizePhase(item))
  }

  {
    const item = phase(9)
    requireReport(item, reports.editionReleases, 'edition release report', 'echo.skyrelay.edition-draft-releases.v1')
    requireGate(item, reports.editionReleases, 'edition release report', 'editionRepositoriesCreated')
    requireGate(item, reports.editionReleases, 'edition release report', 'editionManifestValidators')
    requireGate(item, reports.editionReleases, 'edition release report', 'publicPrereleasesPromoted')
    requireReport(item, reports.launcherLifecycleSmoke, 'launcher lifecycle smoke', 'echo.skyrelay.launcher-lifecycle-smoke.v1')
    for (const gate of [
      'launcherReleaseIndexDeepLinks',
      'launcherInstallFromPackZip',
      'launcherUpdateReconciliation',
      'launcherVersionTransitionUpdate',
      'launcherRepairCorruptFile',
      'launcherRollbackSimulatedUpdate',
    ]) {
      requireGate(item, reports.launcherLifecycleSmoke, 'launcher lifecycle smoke', gate)
    }
    requireReport(item, reports.electronUiSmoke, 'packaged Electron UI smoke', 'echo.skyrelay.electron-ui-smoke.v1')
    for (const gate of [
      'packagedElectronRendererMounted',
      'nativeBridgeBootstrap',
      'skyRelayLibraryCardsVisible',
      'skyRelayPreviewGating',
      'packagedElectronInstallClickThrough',
      'packagedElectronUpdateReconciliationClickThrough',
      'packagedElectronRepairClickThrough',
    ]) {
      requireGate(item, reports.electronUiSmoke, 'packaged Electron UI smoke', gate)
    }
    phases.push(finalizePhase(item))
  }

  {
    const item = phase(10)
    requireReport(item, reports.moduleRelease, 'module release report', 'echo.skyrelay.module-draft-release.v1')
    for (const gate of [
      'downloadBackHashValidation',
      'publicReleasePromotion',
      'stableTaggedAssetUrls',
    ]) {
      requireGate(item, reports.moduleRelease, 'module release report', gate)
    }
    requireReport(item, reports.editionPackAssets, 'edition pack assets report', 'echo.skyrelay.edition-pack-assets.v1')
    for (const gate of [
      'editionPackAssetsBuilt',
      'editionDraftAssetsUploaded',
      'editionDraftDownloadBack',
      'editionPublicPrereleasesPromoted',
      'stableTaggedArtifactUrls',
      'zipMatchesPackManifest',
    ]) {
      requireGate(item, reports.editionPackAssets, 'edition pack assets report', gate)
    }
    requireReport(item, reports.editionPackSmoke, 'edition pack smoke', 'echo.skyrelay.edition-pack-smoke.v1')
    for (const gate of [
      'downloadedReleaseAssetsVerified',
      'installFromPackZip',
      'versionTransitionUpdate',
      'repairCorruptFile',
      'rollbackSimulatedReplacement',
    ]) {
      requireGate(item, reports.editionPackSmoke, 'edition pack smoke', gate)
    }
    for (const relPath of [
      'addons/echoskyrelayprotocol.json',
      'packs/sky-relay-native-edition.json',
      'packs/sky-relay-neoforge-edition.json',
      'packs/sky-relay-standalone-edition.json',
      'modpacks/sky-relay-native.json',
      'modpacks/sky-relay-neoforge.json',
      'modpacks/sky-relay-standalone.json',
    ]) {
      await requireFile(item, root, relPath)
    }
    requireGameplayEvidenceReport(item, reports.gameplayEvidence, reports.editionPackAssets)
    phases.push(finalizePhase(item))
  }

  const blockers = flattenBlockers(phases)
  const status = blockers.length ? 'BLOCKED' : 'PASS'
  return {
    schemaVersion: 'echo.skyrelay.public-alpha-readiness.v1',
    status,
    generatedAt: new Date().toISOString(),
    project: {
      name: 'ECHO: Sky Relay',
      moduleId: MODULE_ID,
      version: '0.1.0',
      channel: 'alpha',
      releaseTag: 'sky-relay-0.1.0-alpha',
      packIds: EDITIONS.map((edition) => edition.packId),
    },
    evidenceSources: {
      workspaceRoot,
      moduleRepo: path.join(workspaceRoot, MODULE_REPO),
      reports: REPORTS,
    },
    phaseSummary: phases.map(({ phase, id, name, status }) => ({ phase, id, name, status })),
    phases,
    gates: Object.fromEntries(phases.map((item) => [item.id, item.status])),
    promotion: {
      eligible: status === 'PASS',
      warningValidationCanBeRemoved: status === 'PASS',
      publicAlphaCanBeDeclaredReady: status === 'PASS',
    },
    blockers,
    notes: [
      'This audit composes source contracts and release-readiness evidence; it does not replace real manual gameplay evidence.',
      'Sky Relay remains warning-gated while any phase is blocked.',
    ],
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const report = await buildReport(args)
  if (args.write) await writeJson(path.resolve(args.root, args.out), report)
  console.log(JSON.stringify(report, null, 2))
  if (args.requireReleaseReady && report.status !== 'PASS') process.exitCode = 1
}

await main()
