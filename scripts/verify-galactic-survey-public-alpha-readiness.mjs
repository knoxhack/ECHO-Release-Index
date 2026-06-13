import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const DEFAULT_OUT = 'release-readiness/galactic-survey-public-alpha-readiness.json'
const RELEASE_INDEX_RELEVANT_STATUS_PATHS = [
  'release-readiness/galactic-survey-draft-download.json',
  'release-readiness/galactic-survey-draft-publish.json',
  'release-readiness/galactic-survey-edition-pack-assets.json',
  'release-readiness/galactic-survey-edition-pack-smoke.json',
  'release-readiness/galactic-survey-electron-ui-smoke.json',
  'release-readiness/galactic-survey-launcher-lifecycle-smoke.json',
  'release-readiness/galactic-survey-module-release-ingest.json',
  'release-readiness/galactic-survey-public-alpha-readiness.json',
  'scripts/build-galactic-survey-edition-assets.mjs',
  'scripts/download-galactic-survey-draft-releases.mjs',
  'scripts/publish-galactic-survey-draft-releases.mjs',
  'scripts/sync-launcher-channel-catalog.mjs',
  'scripts/smoke-galactic-survey-edition-pack-assets.mjs',
  'scripts/test-publish-galactic-survey-draft-releases.mjs',
  'scripts/test-verify-galactic-survey-public-alpha-readiness.mjs',
  'scripts/verify-galactic-survey-public-alpha-readiness.mjs'
]
const RELEASE_INDEX_GENERATED_STATUS_PATHS = new Set([
  'release-readiness/galactic-survey-draft-download.json',
  'release-readiness/galactic-survey-draft-publish.json',
  'release-readiness/galactic-survey-edition-pack-assets.json',
  'release-readiness/galactic-survey-edition-pack-smoke.json',
  'release-readiness/galactic-survey-electron-ui-smoke.json',
  'release-readiness/galactic-survey-launcher-lifecycle-smoke.json',
  'release-readiness/galactic-survey-module-release-ingest.json',
  'release-readiness/galactic-survey-public-alpha-readiness.json'
])
const MODULE_RELEVANT_STATUS_PATHS = [
  'addons/echoaddonapi/build.gradle',
  'addons/echoaddonapi/src/main/templates',
  'addons/echogalacticcore/README.md',
  'addons/echogalacticcore/build.gradle',
  'addons/echogalacticcore/docs/artifacts.md',
  'addons/echogalacticcore/src/main/templates',
  'addons/echogalacticsurveyprotocol',
  'docs/GALACTIC_SURVEY_FULL_EXPERIENCE_PLAN.md',
  'build.gradle'
]
const MODULE_SETTINGS_RELEVANCE_PATTERN = /echogalacticsurveyprotocol/u

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    workspaceRoot: null,
    out: DEFAULT_OUT,
    write: false,
    requireReleaseReady: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--workspace-root') args.workspaceRoot = path.resolve(argv[++index])
    else if (arg === '--out') args.out = argv[++index]
    else if (arg === '--write') args.write = true
    else if (arg === '--require-release-ready') args.requireReleaseReady = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  args.root = path.resolve(args.root)
  args.workspaceRoot = args.workspaceRoot ?? path.resolve(args.root, '..')
  return args
}

const args = parseArgs(process.argv.slice(2))
const releaseIndexRoot = args.root
const workspaceRoot = args.workspaceRoot
const moduleRepo = path.join(workspaceRoot, 'ECHO-Modules')
const moduleRoot = path.join(moduleRepo, 'addons', 'echogalacticsurveyprotocol')
const runtimePlaytestReportPath = path.join(moduleRoot, 'build', 'reports', 'galactic-survey', 'runtime-playtest.json')

const editions = [
  {
    id: 'galactic-survey-native-edition',
    lane: 'native',
    repo: 'ECHO-Galactic-Survey-Native-Edition',
    loader: 'echo-native-loader',
    artifactFamily: 'echo-addon'
  },
  {
    id: 'galactic-survey-neoforge-edition',
    lane: 'neoforge',
    repo: 'ECHO-Galactic-Survey-NeoForge-Edition',
    loader: 'neoforge',
    artifactFamily: 'neoforge'
  },
  {
    id: 'galactic-survey-standalone-edition',
    lane: 'standalone',
    repo: 'ECHO-Galactic-Survey-Standalone-Edition',
    loader: 'echo-standalone-runtime',
    artifactFamily: 'standalone'
  }
].map((edition) => ({
  ...edition,
  path: path.join(workspaceRoot, edition.repo)
}))

function rel(filePath) {
  return path.relative(releaseIndexRoot, filePath).replace(/\\/g, '/')
}

function readJsonOrNull(filePath) {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function runNode(cwd, script, scriptArgs = []) {
  if (!fs.existsSync(path.join(cwd, script))) {
    return {
      status: 'missing',
      command: `node ${script} ${scriptArgs.join(' ')}`.trim(),
      cwd,
      stdout: '',
      stderr: `${script} is missing`
    }
  }
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd,
    encoding: 'utf8',
    shell: false
  })
  return {
    status: result.status === 0 ? 'passed' : 'blocked',
    exitCode: result.status,
    command: `node ${script} ${scriptArgs.join(' ')}`.trim(),
    cwd,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

function runGradle(cwd, taskArgs = []) {
  const wrapper = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew'
  const wrapperPath = path.join(cwd, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
  if (!fs.existsSync(wrapperPath)) {
    return {
      status: 'missing',
      command: `${wrapper} ${taskArgs.join(' ')}`.trim(),
      cwd,
      stdout: '',
      stderr: `${wrapperPath} is missing`
    }
  }
  const command = process.platform === 'win32' ? 'cmd.exe' : wrapper
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', wrapper, ...taskArgs]
    : taskArgs
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    shell: false
  })
  return {
    status: result.status === 0 ? 'passed' : 'blocked',
    exitCode: result.status,
    command: `${wrapper} ${taskArgs.join(' ')}`.trim(),
    cwd,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

function gitHead(cwd) {
  if (!fs.existsSync(cwd)) return null
  return gitOutput(cwd, ['rev-parse', '--verify', 'HEAD'])
}

function gitOutput(cwd, gitArgs, options = {}) {
  if (!fs.existsSync(cwd)) return null
  const result = spawnSync('git', gitArgs, {
    cwd,
    encoding: 'utf8',
    shell: false
  })
  if (result.status !== 0) return null
  const output = result.stdout.replace(/\r?\n$/u, '')
  return options.trim === false ? output : output.trim()
}

function gitStatusLines(cwd, pathspecs = []) {
  const statusArgs = ['status', '--short', '--untracked-files=all']
  if (pathspecs.length) statusArgs.push('--', ...pathspecs)
  const status = gitOutput(cwd, statusArgs, { trim: false })
  return status ? status.split(/\r?\n/u).filter(Boolean) : []
}

function statusPath(statusLine) {
  return statusLine.slice(3).trim().replace(/^"|"$/gu, '').replace(/\\/g, '/')
}

function gitDiff(cwd, pathspecs = []) {
  const diffArgs = ['diff', '--']
  diffArgs.push(...pathspecs)
  return gitOutput(cwd, diffArgs, { trim: false }) ?? ''
}

function isGitCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/iu.test(value)
}

function commitHasPath(cwd, commit, relPath) {
  if (!isGitCommit(commit)) return false
  const result = spawnSync('git', ['cat-file', '-e', `${commit}:${relPath}`], {
    cwd,
    encoding: 'utf8',
    shell: false
  })
  return result.status === 0
}

function repositoryRevision(cwd, metadata = {}) {
  const commit = gitHead(cwd)
  const statusLines = gitStatusLines(cwd)
  return {
    ...metadata,
    workspaceDir: path.basename(cwd),
    commit,
    branch: gitOutput(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: statusLines.length > 0,
    cleanForEvidence: statusLines.length === 0,
    statusLines,
    ignoredStatusLines: [],
    blockingStatusLines: statusLines
  }
}

function releaseIndexRepositoryRevision(cwd, metadata = {}) {
  const commit = gitHead(cwd)
  const statusLines = gitStatusLines(cwd, RELEASE_INDEX_RELEVANT_STATUS_PATHS)
  const ignoredStatusLines = statusLines.filter((line) => RELEASE_INDEX_GENERATED_STATUS_PATHS.has(statusPath(line)))
  const blockingStatusLines = statusLines.filter((line) => !RELEASE_INDEX_GENERATED_STATUS_PATHS.has(statusPath(line)))
  return {
    ...metadata,
    workspaceDir: path.basename(cwd),
    commit,
    branch: gitOutput(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: statusLines.length > 0,
    cleanForEvidence: blockingStatusLines.length === 0,
    statusLines,
    ignoredStatusLines,
    blockingStatusLines
  }
}

function moduleRepositoryRevision(cwd) {
  const commit = gitHead(cwd)
  const statusLines = gitStatusLines(cwd, MODULE_RELEVANT_STATUS_PATHS)
  const settingsDiff = gitDiff(cwd, ['settings.gradle'])
  const settingsStatusLines = MODULE_SETTINGS_RELEVANCE_PATTERN.test(settingsDiff) ? [' M settings.gradle'] : []
  const blockingStatusLines = [...statusLines, ...settingsStatusLines]
  return {
    repository: 'knoxhack/ECHO-Modules',
    workspaceDir: path.basename(cwd),
    commit,
    branch: gitOutput(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: blockingStatusLines.length > 0,
    cleanForEvidence: blockingStatusLines.length === 0,
    statusLines: blockingStatusLines,
    ignoredStatusLines: [],
    blockingStatusLines,
    committedProtocolModule: commitHasPath(cwd, commit, 'addons/echogalacticsurveyprotocol/src/main/resources/META-INF/echo.mod.json'),
    committedExperiencePlan: commitHasPath(cwd, commit, 'docs/GALACTIC_SURVEY_FULL_EXPERIENCE_PLAN.md')
  }
}

function makePhase(phase, id, name) {
  return { phase, id, name, status: 'passed', evidence: [], blockers: [] }
}

function requireCondition(phase, condition, evidence, blocker) {
  if (condition) phase.evidence.push(evidence)
  else phase.blockers.push(blocker)
}

function finalizePhase(phase) {
  phase.status = phase.blockers.length ? 'blocked' : 'passed'
  return phase
}

function ids(rows) {
  return Array.isArray(rows) ? rows.map((row) => row?.id).filter(Boolean) : []
}

function reportGatePassed(report, gate) {
  return report?.gates?.[gate] === 'passed'
}

function setContainsAll(values, requiredValues) {
  const set = new Set(Array.isArray(values) ? values : [])
  return requiredValues.every((value) => set.has(value))
}

function assetsByName(assets) {
  return new Map((Array.isArray(assets) ? assets : [])
    .filter((asset) => asset?.name)
    .map((asset) => [asset.name, asset]))
}

function compareDownloadedAssetsToLocalStage(localReport, downloadReport) {
  const localEditions = Array.isArray(localReport?.localStage?.editions) ? localReport.localStage.editions : []
  const downloadEditions = Array.isArray(downloadReport?.data?.editions) ? downloadReport.data.editions : []
  const downloadByPackId = new Map(downloadEditions.map((edition) => [edition.packId, edition]))
  const mismatches = []

  for (const localEdition of localEditions) {
    const downloadedEdition = downloadByPackId.get(localEdition.packId)
    if (!downloadedEdition) {
      mismatches.push(`${localEdition.packId}: no downloaded GitHub release assets`)
      continue
    }
    const downloadedAssetsByName = assetsByName(downloadedEdition.downloadedAssets)
    for (const localAsset of localEdition.assets ?? []) {
      const downloadedAsset = downloadedAssetsByName.get(localAsset.name)
      if (!downloadedAsset) {
        mismatches.push(`${localEdition.packId}/${localAsset.name}: missing from downloaded GitHub release`)
        continue
      }
      if (downloadedAsset.size !== localAsset.size || downloadedAsset.sha256 !== localAsset.sha256) {
        mismatches.push(`${localEdition.packId}/${localAsset.name}: local ${localAsset.size}/${localAsset.sha256} != downloaded ${downloadedAsset.size}/${downloadedAsset.sha256}`)
      }
    }
  }

  return {
    matches: localEditions.length > 0 && mismatches.length === 0,
    checkedEditionCount: localEditions.length,
    checkedAssetCount: localEditions.reduce((count, edition) => count + (edition.assets?.length ?? 0), 0),
    mismatches
  }
}

const dataRoot = path.join(moduleRoot, 'src/main/resources/data/echogalacticsurveyprotocol/galacticsurvey')
const planDoc = path.join(moduleRepo, 'docs', 'GALACTIC_SURVEY_FULL_EXPERIENCE_PLAN.md')
const productionMatrix = readJsonOrNull(path.join(dataRoot, 'plan', 'production_phase_matrix.json'))
const blockCatalog = readJsonOrNull(path.join(dataRoot, 'content', 'block_catalog.json'))
const itemCatalog = readJsonOrNull(path.join(dataRoot, 'content', 'item_catalog.json'))
const sectorCatalog = readJsonOrNull(path.join(dataRoot, 'survey', 'sector_catalog.json'))
const bodyCatalog = readJsonOrNull(path.join(dataRoot, 'survey', 'body_catalog.json'))
const probeCatalog = readJsonOrNull(path.join(dataRoot, 'survey', 'probe_catalog.json'))
const routeCatalog = readJsonOrNull(path.join(dataRoot, 'survey', 'route_catalog.json'))
const discoveryCatalog = readJsonOrNull(path.join(dataRoot, 'survey', 'discovery_catalog.json'))
const salvageSites = readJsonOrNull(path.join(dataRoot, 'survey', 'salvage_sites.json'))
const depotCatalog = readJsonOrNull(path.join(dataRoot, 'survey', 'depot_catalog.json'))
const holoMapLayers = readJsonOrNull(path.join(dataRoot, 'integrations', 'holomap_layers.json'))
const missionContracts = readJsonOrNull(path.join(dataRoot, 'integrations', 'mission_contracts.json'))
const releaseGates = readJsonOrNull(path.join(dataRoot, 'release', 'release_gates.json'))
const descriptor = readJsonOrNull(path.join(moduleRoot, 'src/main/resources/META-INF/echo.mod.json'))
const alphaChannel = readJsonOrNull(path.join(releaseIndexRoot, 'channels', 'alpha', 'launcher-channel.json'))
const editionPackAssets = readJsonOrNull(path.join(releaseIndexRoot, 'release-readiness', 'galactic-survey-edition-pack-assets.json'))
const editionPackSmoke = readJsonOrNull(path.join(releaseIndexRoot, 'release-readiness', 'galactic-survey-edition-pack-smoke.json'))
const editionDraftPublish = readJsonOrNull(path.join(releaseIndexRoot, 'release-readiness', 'galactic-survey-draft-publish.json'))
const editionDraftDownload = readJsonOrNull(path.join(releaseIndexRoot, 'release-readiness', 'galactic-survey-draft-download.json'))
const launcherLifecycleSmoke = readJsonOrNull(path.join(releaseIndexRoot, 'release-readiness', 'galactic-survey-launcher-lifecycle-smoke.json'))
const launcherElectronUiSmoke = readJsonOrNull(path.join(releaseIndexRoot, 'release-readiness', 'galactic-survey-electron-ui-smoke.json'))
const moduleReleaseIngest = readJsonOrNull(path.join(releaseIndexRoot, 'release-readiness', 'galactic-survey-module-release-ingest.json'))
const galacticModpackCatalog = Object.fromEntries(editions.map((edition) => [
  edition.id,
  readJsonOrNull(path.join(releaseIndexRoot, 'modpacks', `${edition.id.replace(/-edition$/u, '')}.json`))
]))
const requiredPackagedModules = [
  'echocore',
  'echoplatformcore',
  'echoschemacore',
  'echovalidationcore',
  'echocontentcore',
  'echorecipecore',
  'echoaddonapi',
  'echoadaptercore',
  'echonetcore',
  'echoruntimeguard',
  'echoterminal',
  'echoindex',
  'echolens',
  'echoholomap',
  'echomissioncore',
  'echopowergrid',
  'echologisticsnetwork',
  'echoprogressioncore',
  'echosoundcore',
  'echogalacticcore',
  'echoorbitalremnants',
  'echovehiclecore',
  'echogalacticsurveyprotocol'
]
const expectedPackagedModuleCount = requiredPackagedModules.length
const publicPrereleaseDownload = editionDraftDownload?.summary?.publicPrereleasesDownloaded === true

const commandReports = {
  moduleContract: runNode(moduleRepo, 'addons/echogalacticsurveyprotocol/scripts/validate-galactic-survey-contract.mjs', ['--module-root', 'addons/echogalacticsurveyprotocol']),
  routeSmoke: runNode(moduleRepo, 'addons/echogalacticsurveyprotocol/scripts/smoke-galactic-survey-route.mjs', ['--module-root', 'addons/echogalacticsurveyprotocol']),
  runtimePlaytest: runGradle(moduleRepo, [':echogalacticsurveyprotocol:runGalacticSurveyRuntimePlaytest', '--console=plain']),
  editions: editions.map((edition) => ({
    id: edition.id,
    validator: runNode(edition.path, 'scripts/validate-galactic-survey-edition.mjs', ['--root', '.']),
    templateEvidence: runNode(edition.path, 'scripts/verify-manual-gameplay-evidence.mjs', ['--template-only']),
    releaseEvidence: runNode(edition.path, 'scripts/verify-manual-gameplay-evidence.mjs', ['--require-release-ready'])
  }))
}

const runtimePlaytest = readJsonOrNull(runtimePlaytestReportPath)

const sourceRevisions = {
  releaseIndex: releaseIndexRepositoryRevision(releaseIndexRoot, {
    repository: 'knoxhack/ECHO-Release-Index'
  }),
  module: moduleRepositoryRevision(moduleRepo),
  editions: Object.fromEntries(editions.map((edition) => [
    edition.lane,
    repositoryRevision(edition.path, {
      repository: `knoxhack/${edition.repo}`
    })
  ]))
}
const editionDownloadMatchesLocalStage = compareDownloadedAssetsToLocalStage(editionPackAssets, editionDraftDownload)

const phases = []

{
  const phase = makePhase(1, 'vision_scope', 'Vision And Scope')
  requireCondition(phase, fs.existsSync(planDoc), 'full experience plan exists', 'full experience plan is missing')
  requireCondition(phase, productionMatrix?.phases?.length === 10, 'production phase matrix has 10 phases', 'production phase matrix must have 10 phases')
  requireCondition(phase, descriptor?.id === 'echogalacticsurveyprotocol', 'protocol descriptor identity is present', 'protocol descriptor identity is missing')
  requireCondition(phase, descriptor?.gameModes?.includes('long_range_survey'), 'long_range_survey mode is declared', 'long_range_survey mode is missing')
  requireCondition(phase, descriptor?.conflicts?.some((entry) => String(entry).includes(':default_profile')), 'experience default-profile conflicts are declared', 'experience default-profile conflicts must be declared')
  phases.push(finalizePhase(phase))
}

{
  const phase = makePhase(2, 'protocol_foundation', 'Protocol Foundation')
  requireCondition(phase, fs.existsSync(moduleRoot), 'echogalacticsurveyprotocol module exists', 'echogalacticsurveyprotocol module is missing')
  requireCondition(phase, fs.existsSync(path.join(moduleRoot, 'src/main/java/com/knoxhack/echogalacticsurveyprotocol/EchoGalacticSurveyProtocol.java')), 'main protocol entrypoint exists', 'main protocol entrypoint is missing')
  requireCondition(phase, fs.existsSync(path.join(moduleRoot, 'src/main/java/com/knoxhack/echogalacticsurveyprotocol/EchoGalacticSurveyNativeModule.java')), 'native module adapter exists', 'native module adapter is missing')
  requireCondition(phase, descriptor?.optional?.includes('echoholomap') && descriptor?.optional?.includes('echologisticsnetwork'), 'core support modules are connected through descriptor optional integrations', 'descriptor must connect core support modules')
  requireCondition(phase, commandReports.moduleContract.status === 'passed', 'module contract validator passed', 'module contract validator must pass')
  phases.push(finalizePhase(phase))
}

{
  const phase = makePhase(3, 'data_content_framework', 'Data And Content Framework')
  requireCondition(phase, blockCatalog?.blocks?.length === 10, 'block catalog has 10 blocks', 'block catalog must have 10 blocks')
  requireCondition(phase, itemCatalog?.items?.length === 16, 'item catalog has 16 items', 'item catalog must have 16 items')
  requireCondition(phase, sectorCatalog?.sectors?.length === 4, 'sector catalog has 4 sectors', 'sector catalog must have 4 sectors')
  requireCondition(phase, bodyCatalog?.bodies?.length === 5, 'body catalog has 5 bodies', 'body catalog must have 5 bodies')
  requireCondition(phase, releaseGates?.gates?.length === 13, 'release gate catalog has 13 gameplay/runtime gates', 'release gate catalog must have 13 gameplay/runtime gates')
  phases.push(finalizePhase(phase))
}

{
  const phase = makePhase(4, 'first_playable_loop', 'First Playable Loop')
  let smoke = null
  try { smoke = JSON.parse(commandReports.routeSmoke.stdout || '{}') } catch {}
  const first30 = smoke?.routes?.find((route) => route.id === 'first_30_minutes')
  requireCondition(phase, commandReports.routeSmoke.status === 'passed', 'route smoke command passed', 'route smoke command must pass')
  requireCondition(phase, first30?.stepCount === 12, 'first 30-minute route has 12 steps', 'first 30-minute route must have 12 steps')
  requireCondition(phase, first30?.requiredProofsCovered?.includes('probe:starter_probe'), 'starter probe proof is covered', 'starter probe proof must be covered')
  requireCondition(phase, first30?.requiredProofsCovered?.includes('discovery:barren_moon_kg_01a'), 'first catalog discovery proof is covered', 'first catalog discovery proof must be covered')
  phases.push(finalizePhase(phase))
}

{
  const phase = makePhase(5, 'probe_exploration_system', 'Probe Exploration System')
  const probeIds = ids(probeCatalog?.probes)
  requireCondition(phase, probeIds.includes('starter_probe'), 'starter_probe is data-defined', 'starter_probe must be data-defined')
  requireCondition(phase, probeIds.includes('long_range_probe'), 'long_range_probe is data-defined', 'long_range_probe must be data-defined')
  requireCondition(phase, probeCatalog?.probes?.length === 4, 'probe catalog has 4 probe chassis entries', 'probe catalog must have 4 probe chassis entries')
  requireCondition(phase, descriptor?.provides?.includes('galacticsurvey.probes'), 'probe system contract is provided', 'probe system contract must be provided')
  phases.push(finalizePhase(phase))
}

{
  const phase = makePhase(6, 'holomap_navigation', 'HoloMap And Navigation')
  const layerIds = ids(holoMapLayers?.layers)
  requireCondition(phase, layerIds.includes('scan_cones'), 'scan_cones HoloMap layer exists', 'scan_cones HoloMap layer must exist')
  requireCondition(phase, layerIds.includes('fuel_range'), 'fuel_range HoloMap layer exists', 'fuel_range HoloMap layer must exist')
  requireCondition(phase, layerIds.includes('derelict_beacons'), 'derelict_beacons HoloMap layer exists', 'derelict_beacons HoloMap layer must exist')
  requireCondition(phase, holoMapLayers?.layers?.length === 7, 'HoloMap layer catalog has 7 layers', 'HoloMap layer catalog must have 7 layers')
  phases.push(finalizePhase(phase))
}

{
  const phase = makePhase(7, 'catalog_progression', 'Catalog And Progression')
  requireCondition(phase, discoveryCatalog?.discoveries?.length === 9, 'discovery catalog has 9 entries', 'discovery catalog must have 9 entries')
  requireCondition(phase, missionContracts?.missions?.length === 6, 'mission catalog has 6 contracts', 'mission catalog must have 6 contracts')
  requireCondition(phase, descriptor?.provides?.includes('galacticsurvey.discoveries'), 'discovery contract is provided', 'discovery contract must be provided')
  requireCondition(phase, descriptor?.provides?.includes('galacticsurvey.release_readiness'), 'release-readiness contract is provided', 'release-readiness contract must be provided')
  phases.push(finalizePhase(phase))
}

{
  const phase = makePhase(8, 'logistics_fuel_networks', 'Logistics And Fuel Networks')
  requireCondition(phase, routeCatalog?.routes?.length === 4, 'route catalog has 4 routes', 'route catalog must have 4 routes')
  requireCondition(phase, depotCatalog?.depots?.length === 3, 'depot catalog has 3 depots', 'depot catalog must have 3 depots')
  requireCondition(phase, ids(routeCatalog?.routes).includes('deep_sector_beacon_route'), 'deep-sector route is data-defined', 'deep-sector route must be data-defined')
  requireCondition(phase, descriptor?.optional?.includes('echologisticsnetwork'), 'logistics network integration is declared', 'logistics network integration must be declared')
  phases.push(finalizePhase(phase))
}

{
  const phase = makePhase(9, 'salvage_upgrades', 'Salvage And Upgrades')
  const salvageIds = ids(salvageSites?.sites)
  requireCondition(phase, salvageSites?.sites?.length === 5, 'salvage site catalog has 5 sites', 'salvage site catalog must have 5 sites')
  requireCondition(phase, salvageIds.includes('derelict_relay_osprey'), 'derelict_relay_osprey salvage site exists', 'derelict_relay_osprey salvage site must exist')
  requireCondition(phase, salvageIds.includes('lost_survey_craft_lysander'), 'lost survey craft salvage site exists', 'lost survey craft salvage site must exist')
  requireCondition(phase, descriptor?.optional?.includes('echoorbitalremnants'), 'orbital remnants integration is declared', 'orbital remnants integration must be declared')
  phases.push(finalizePhase(phase))
}

{
  const phase = makePhase(10, 'full_progression_release', 'Full Progression And Release')
  const channelPackIds = new Set(ids(alphaChannel?.packs))
  const moduleRevision = sourceRevisions.module
  requireCondition(phase, isGitCommit(moduleRevision.commit), `ECHO-Modules committed source revision ${moduleRevision.commit}`, 'ECHO-Modules must have a committed Galactic Survey source revision')
  requireCondition(phase, moduleRevision.committedProtocolModule === true, 'ECHO-Modules commit contains echogalacticsurveyprotocol descriptor', 'ECHO-Modules committed source must contain echogalacticsurveyprotocol descriptor')
  requireCondition(phase, moduleRevision.committedExperiencePlan === true, 'ECHO-Modules commit contains Galactic Survey full experience plan', 'ECHO-Modules committed source must contain the Galactic Survey full experience plan')
  requireCondition(
    phase,
    moduleRevision.cleanForEvidence === true,
    'ECHO-Modules has no uncommitted Galactic Survey source drift',
    `ECHO-Modules has uncommitted Galactic Survey source drift: ${moduleRevision.blockingStatusLines.join('; ')}`
  )
  const assetEditionPackIds = editionPackAssets?.localStage?.editions?.map((edition) => edition.packId) ?? []
  const smokeEditionPackIds = editionPackSmoke?.editions?.map((edition) => edition.pack) ?? []
  const smokeEditions = Array.isArray(editionPackSmoke?.editions) ? editionPackSmoke.editions : []
  requireCondition(phase, editionPackAssets?.schemaVersion === 'echo.galactic_survey.edition-pack-assets.v1', 'local edition pack asset report exists', 'local edition pack asset report must be generated')
  requireCondition(phase, reportGatePassed(editionPackAssets, 'editionPackAssetsBuilt'), 'local edition pack assets built successfully', 'local edition pack assets must build successfully')
  requireCondition(phase, reportGatePassed(editionPackAssets, 'localStageChecksums'), 'local staged edition asset checksums passed', 'local staged edition asset checksums must pass')
  requireCondition(phase, reportGatePassed(editionPackAssets, 'zipMatchesPackManifest'), 'local edition ZIP manifests match pack manifests', 'local edition ZIP manifests must match pack manifests')
  requireCondition(phase, setContainsAll(editionPackAssets?.packagedModules, requiredPackagedModules), 'local edition assets include the full 23-module runtime spine', 'local edition assets must include the full 23-module runtime spine')
  requireCondition(phase, setContainsAll(assetEditionPackIds, editions.map((edition) => edition.id)), 'local edition asset report covers Native, NeoForge, and Standalone packs', 'local edition asset report must cover Native, NeoForge, and Standalone packs')
  requireCondition(phase, editionPackSmoke?.schemaVersion === 'echo.galactic_survey.edition-pack-smoke.v1', 'local edition lifecycle smoke report exists', 'local edition lifecycle smoke report must be generated')
  requireCondition(phase, editionPackSmoke?.ok === true, 'local edition lifecycle smoke completed successfully', 'local edition lifecycle smoke must complete successfully')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'stagedReleaseAssetsVerified'), 'local staged release assets verified during smoke', 'local staged release assets must verify during smoke')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'installFromPackZip'), 'local pack ZIP install smoke passed', 'local pack ZIP install smoke must pass')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'versionTransitionUpdate'), 'local pack version-transition update smoke passed', 'local pack version-transition update smoke must pass')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'repairCorruptFile'), 'local pack repair smoke passed', 'local pack repair smoke must pass')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'rollbackSimulatedReplacement'), 'local pack rollback smoke passed', 'local pack rollback smoke must pass')
  requireCondition(phase, setContainsAll(smokeEditionPackIds, editions.map((edition) => edition.id)), 'local lifecycle smoke covers Native, NeoForge, and Standalone packs', 'local lifecycle smoke must cover Native, NeoForge, and Standalone packs')
  requireCondition(phase, smokeEditions.every((edition) => edition.installedFiles === expectedPackagedModuleCount && edition.verifiedAfterInstall === expectedPackagedModuleCount && edition.versionUpdate?.verifiedAfterUpdate === expectedPackagedModuleCount && edition.postRollbackVersionUpdate?.verifiedAfterUpdate === expectedPackagedModuleCount && edition.verifiedAfterRollback === expectedPackagedModuleCount), `local lifecycle smoke verified all ${expectedPackagedModuleCount} module files through install, update, repair, and rollback`, `local lifecycle smoke must verify all ${expectedPackagedModuleCount} module files through install, update, repair, and rollback`)
  const draftPublishEditions = Array.isArray(editionDraftPublish?.data?.editions) ? editionDraftPublish.data.editions : []
  const draftPublishPackIds = draftPublishEditions.map((edition) => edition.packId)
  if (!publicPrereleaseDownload) {
  requireCondition(phase, editionDraftPublish?.schemaVersion === 'echo.galactic_survey.draft-publish.v1', 'draft release publish evidence report exists', 'draft release publish evidence report must be generated')
  requireCondition(phase, editionDraftPublish?.status === 'PASS', 'draft release publish evidence passed', 'draft release publish evidence must pass')
  requireCondition(phase, editionDraftPublish?.summary?.draftReleasesPublished === true, 'draft release assets were published to GitHub', 'draft release assets must be published to GitHub')
  requireCondition(phase, editionDraftPublish?.summary?.publishedEditionCount === 3, 'draft release publish evidence covers all 3 editions', 'draft release publish evidence must cover all 3 editions')
  requireCondition(phase, editionDraftPublish?.summary?.publishedAssetCount === 15, 'draft release publish evidence covers all 15 edition assets', 'draft release publish evidence must cover all 15 edition assets')
  requireCondition(phase, setContainsAll(draftPublishPackIds, editions.map((edition) => edition.id)), 'draft release publish evidence covers Native, NeoForge, and Standalone packs', 'draft release publish evidence must cover Native, NeoForge, and Standalone packs')
  requireCondition(phase, draftPublishEditions.every((edition) => edition.release?.draft === true && edition.release?.prerelease === true), 'draft release publish evidence is draft prerelease-only', 'draft release publish evidence must be draft prerelease-only')
  requireCondition(phase, draftPublishEditions.every((edition) => edition.assets?.length === 5), 'draft release publish evidence contains all required assets per edition', 'draft release publish evidence must contain all required assets per edition')
  }
  const draftDownloadEditions = Array.isArray(editionDraftDownload?.data?.editions) ? editionDraftDownload.data.editions : []
  const draftDownloadPackIds = draftDownloadEditions.map((edition) => edition.packId)
  const downloadBackReleaseMetadataAccepted = draftDownloadEditions.every((edition) =>
    edition.release?.prerelease === true && (edition.release?.draft === true || edition.release?.draft === false)
  )
  if (publicPrereleaseDownload) {
    requireCondition(phase, editionDraftDownload?.status === 'PASS', 'public prerelease publication evidence passed', 'public prerelease publication evidence must pass')
    requireCondition(phase, editionDraftDownload?.summary?.downloadedEditionCount === 3, 'public prerelease publication evidence covers all 3 editions', 'public prerelease publication evidence must cover all 3 editions')
    requireCondition(phase, editionDraftDownload?.summary?.downloadedAssetCount === 15, 'public prerelease publication evidence covers all 15 edition assets', 'public prerelease publication evidence must cover all 15 edition assets')
    requireCondition(phase, setContainsAll(draftDownloadPackIds, editions.map((edition) => edition.id)), 'public prerelease publication evidence covers Native, NeoForge, and Standalone packs', 'public prerelease publication evidence must cover Native, NeoForge, and Standalone packs')
    requireCondition(phase, draftDownloadEditions.every((edition) => edition.release?.draft === false && edition.release?.prerelease === true), 'public prerelease publication evidence uses public prerelease metadata', 'public prerelease publication evidence must use public prerelease metadata')
    requireCondition(phase, draftDownloadEditions.every((edition) => edition.downloadedAssets?.length === 5), 'public prerelease publication evidence contains all required assets per edition', 'public prerelease publication evidence must contain all required assets per edition')
  }
  const smokeUsedGitHubDownloadBack = ['github-draft-release-download', 'github-public-prerelease-download'].includes(editionPackSmoke?.artifactSource)
  requireCondition(phase, editionDraftDownload?.schemaVersion === 'echo.galactic_survey.draft-download.v1', 'download-back release evidence report exists', 'download-back release evidence report must be generated')
  requireCondition(phase, editionDraftDownload?.status === 'PASS', 'download-back release evidence passed', 'download-back release evidence must pass')
  requireCondition(phase, editionDraftDownload?.summary?.downloadedFromGitHubRelease === true, 'release assets were downloaded back from GitHub', 'release assets must be downloaded back from GitHub')
  requireCondition(phase, editionDraftDownload?.summary?.downloadedEditionCount === 3, 'download-back evidence covers all 3 editions', 'download-back evidence must cover all 3 editions')
  requireCondition(phase, editionDraftDownload?.summary?.downloadedAssetCount === 15, 'download-back evidence covers all 15 edition assets', 'download-back evidence must cover all 15 edition assets')
  requireCondition(phase, setContainsAll(draftDownloadPackIds, editions.map((edition) => edition.id)), 'download-back evidence covers Native, NeoForge, and Standalone packs', 'download-back evidence must cover Native, NeoForge, and Standalone packs')
  requireCondition(phase, downloadBackReleaseMetadataAccepted, 'download-back evidence is from prerelease GitHub releases', 'download-back evidence must come from prerelease GitHub releases')
  requireCondition(phase, draftDownloadEditions.every((edition) => edition.downloadedAssets?.length === 5), 'download-back evidence contains all required assets per edition', 'download-back evidence must contain all required assets per edition')
  requireCondition(
    phase,
    editionDownloadMatchesLocalStage.matches,
    'download-back asset checksums match current local staged edition assets',
    `download-back asset checksums must match current local staged edition assets: ${editionDownloadMatchesLocalStage.mismatches.slice(0, 5).join('; ')}`
  )
  requireCondition(phase, smokeUsedGitHubDownloadBack, 'lifecycle smoke used downloaded GitHub release assets', 'lifecycle smoke must use downloaded GitHub release assets')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'githubReleaseDownloadBack') || reportGatePassed(editionPackSmoke, 'githubDraftDownloadBack'), 'lifecycle smoke verified GitHub download-back evidence', 'lifecycle smoke must verify GitHub download-back evidence')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'installedFromDownloadedArtifacts'), 'lifecycle smoke installed downloaded GitHub artifacts', 'lifecycle smoke must install downloaded GitHub artifacts')
  requireCondition(phase, smokeEditions.every((edition) => edition.githubReleaseDownloadBack === true && edition.releaseMetadataPrerelease === true), 'lifecycle smoke covers GitHub release metadata for all editions', 'lifecycle smoke must cover GitHub release metadata for all editions')
  const launcherLifecycleEditions = Array.isArray(launcherLifecycleSmoke?.editions) ? launcherLifecycleSmoke.editions : []
  const launcherLifecyclePackIds = launcherLifecycleEditions.map((edition) => edition.pack)
  requireCondition(phase, launcherLifecycleSmoke?.schemaVersion === 'echo.galactic_survey.launcher-lifecycle-smoke.v1', 'Launcher-owned lifecycle smoke report exists', 'Launcher-owned lifecycle smoke report must be generated')
  requireCondition(phase, launcherLifecycleSmoke?.ok === true, 'Launcher-owned lifecycle smoke passed', 'Launcher-owned lifecycle smoke must pass')
  requireCondition(phase, reportGatePassed(launcherLifecycleSmoke, 'launcherReleaseIndexDeepLinks'), 'Launcher lifecycle deep-link resolver smoke passed', 'Launcher lifecycle deep-link resolver smoke must pass')
  requireCondition(phase, reportGatePassed(launcherLifecycleSmoke, 'launcherInstallFromPackZip'), 'Launcher lifecycle install smoke passed', 'Launcher lifecycle install smoke must pass')
  requireCondition(phase, reportGatePassed(launcherLifecycleSmoke, 'launcherUpdateReconciliation'), 'Launcher lifecycle update reconciliation smoke passed', 'Launcher lifecycle update reconciliation smoke must pass')
  requireCondition(phase, reportGatePassed(launcherLifecycleSmoke, 'launcherVersionTransitionUpdate'), 'Launcher lifecycle version-transition update smoke passed', 'Launcher lifecycle version-transition update smoke must pass')
  requireCondition(phase, reportGatePassed(launcherLifecycleSmoke, 'launcherRepairCorruptFile'), 'Launcher lifecycle repair smoke passed', 'Launcher lifecycle repair smoke must pass')
  requireCondition(phase, reportGatePassed(launcherLifecycleSmoke, 'launcherRollbackSimulatedUpdate'), 'Launcher lifecycle rollback smoke passed', 'Launcher lifecycle rollback smoke must pass')
  requireCondition(phase, setContainsAll(launcherLifecyclePackIds, editions.map((edition) => edition.id)), 'Launcher lifecycle smoke covers Native, NeoForge, and Standalone packs', 'Launcher lifecycle smoke must cover Native, NeoForge, and Standalone packs')
  requireCondition(phase, launcherLifecycleEditions.every((edition) =>
    edition.fileCount === expectedPackagedModuleCount &&
    edition.install?.verifiedAfterInstall === expectedPackagedModuleCount &&
    edition.update?.verifiedAfterUpdate === expectedPackagedModuleCount &&
    edition.postRollbackUpdate?.verifiedAfterUpdate === expectedPackagedModuleCount &&
    edition.repair?.verifiedAfterRepair === expectedPackagedModuleCount
  ), `Launcher lifecycle smoke verified all ${expectedPackagedModuleCount} module files through install, update, repair, and rollback`, `Launcher lifecycle smoke must verify all ${expectedPackagedModuleCount} module files through install, update, repair, and rollback`)
  requireCondition(phase, launcherElectronUiSmoke?.schemaVersion === 'echo.galactic_survey.electron-ui-smoke.v1', 'packaged Electron UI smoke report exists', 'packaged Electron UI smoke report must be generated')
  requireCondition(phase, launcherElectronUiSmoke?.ok === true, 'packaged Electron UI smoke passed', 'packaged Electron UI smoke must pass')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'packagedElectronRendererMounted'), 'packaged Electron renderer mounted', 'packaged Electron renderer must mount')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'nativeBridgeBootstrap'), 'packaged Electron native bridge bootstrap passed', 'packaged Electron native bridge bootstrap must pass')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'galacticSurveyLibraryCardsVisible'), 'Galactic Survey library cards rendered in packaged Electron', 'Galactic Survey library cards must render in packaged Electron')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'galacticSurveyScopedCardActions'), 'Galactic Survey packaged card actions are scoped', 'Galactic Survey packaged card actions must be scoped')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'galacticSurveyHeadingOverflow'), 'Galactic Survey packaged card headings fit', 'Galactic Survey packaged card headings must fit')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'packagedElectronInstallClickThrough'), 'packaged Electron install click-through passed', 'packaged Electron install click-through must pass')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'packagedElectronUpdateReconciliationClickThrough'), 'packaged Electron update reconciliation click-through passed', 'packaged Electron update reconciliation click-through must pass')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'packagedElectronRepairClickThrough'), 'packaged Electron repair click-through passed', 'packaged Electron repair click-through must pass')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'packagedElectronDiagnosticExport'), 'packaged Electron diagnostic export passed', 'packaged Electron diagnostic export must pass')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'packagedElectronLogExport'), 'packaged Electron log export passed', 'packaged Electron log export must pass')
  requireCondition(phase, launcherElectronUiSmoke?.gates?.packagedElectronMinecraftLauncherHandoffPreparation === 'passed_isolated_prepare_only', 'packaged Electron prepared Minecraft Launcher handoff metadata in isolated mode', 'packaged Electron must prepare Minecraft Launcher handoff metadata in isolated mode')
  requireCondition(phase, launcherElectronUiSmoke?.gates?.packagedElectronFirstLaunch === 'blocked_legacy_native_launch_removed', 'packaged Electron first launch limitation is explicit', 'packaged Electron first launch limitation must be explicit until a real Native launch path passes')
  requireCondition(phase, reportGatePassed(launcherElectronUiSmoke, 'packagedElectronRollbackClickThrough'), 'packaged Electron rollback click-through passed', 'packaged Electron rollback click-through must pass')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.selectedPack?.packId === 'galactic-survey-native-edition', 'packaged Electron selected Galactic Survey Native Edition', 'packaged Electron smoke must select Galactic Survey Native Edition')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.install?.verifiedModule?.relativePath === 'addons/echogalacticsurveyprotocol-0.1.0.echo-addon', 'packaged Electron install verified the Galactic Survey addon hash', 'packaged Electron install must verify the Galactic Survey addon hash')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.rollback?.ok === true, 'packaged Electron rollback restore report passed', 'packaged Electron rollback restore report must pass')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.rollback?.restored?.includes('.echo/installed-manifest.json'), 'packaged Electron rollback restored the previous installed manifest', 'packaged Electron rollback must restore the previous installed manifest')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.rollback?.restored?.includes('addons/echogalacticsurveyprotocol-0.1.0.echo-addon'), 'packaged Electron rollback restored the previous Galactic Survey addon', 'packaged Electron rollback must restore the previous Galactic Survey addon')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.rollback?.restoredObsoleteFile?.relativePath === 'addons/galactic-survey-obsolete-packaged-ui-smoke.echo-addon', 'packaged Electron rollback restored the obsolete previous-version file fixture', 'packaged Electron rollback must restore the obsolete previous-version file fixture')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.rollback?.verifiedPreviousModule?.relativePath === 'addons/echogalacticsurveyprotocol-0.1.0.echo-addon', 'packaged Electron rollback verified the previous Galactic Survey addon hash', 'packaged Electron rollback must verify the previous Galactic Survey addon hash')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.reupdateAfterRollback?.verifiedModule?.relativePath === 'addons/echogalacticsurveyprotocol-0.1.0.echo-addon', 'packaged Electron re-updated to the current Galactic Survey addon after rollback', 'packaged Electron must re-update to the current Galactic Survey addon after rollback')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.repair?.repaired?.includes('addons/echogalacticsurveyprotocol-0.1.0.echo-addon'), 'packaged Electron repair restored the Galactic Survey addon', 'packaged Electron repair must restore the Galactic Survey addon')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.diagnostics?.summary?.missing === 0, 'packaged Electron diagnostics found no missing files', 'packaged Electron diagnostics must find no missing files')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.diagnostics?.summary?.corrupt === 0, 'packaged Electron diagnostics found no corrupt files', 'packaged Electron diagnostics must find no corrupt files')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.diagnostics?.report?.verification?.valid === expectedPackagedModuleCount, `packaged Electron diagnostics verified all ${expectedPackagedModuleCount} module files`, `packaged Electron diagnostics must verify all ${expectedPackagedModuleCount} module files`)
  requireCondition(phase, Number(launcherElectronUiSmoke?.clickThrough?.logs?.zip?.size ?? 0) > 0, 'packaged Electron log export wrote a support bundle', 'packaged Electron log export must write a support bundle')
  requireCondition(phase, Array.isArray(launcherElectronUiSmoke?.clickThrough?.logs?.sourceFiles) && launcherElectronUiSmoke.clickThrough.logs.sourceFiles.length > 0, 'packaged Electron log export included source files', 'packaged Electron log export must include source files')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.firstLaunch?.state === 'fail_closed_legacy_native_launch_removed', 'packaged Electron first launch fails closed on legacy native launch path', 'packaged Electron first launch must fail closed until real launch proof exists')
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.firstLaunch?.preflight?.verification?.valid === expectedPackagedModuleCount, `packaged Electron first-launch preflight verified all ${expectedPackagedModuleCount} module files`, `packaged Electron first-launch preflight must verify all ${expectedPackagedModuleCount} module files`)
  requireCondition(phase, launcherElectronUiSmoke?.clickThrough?.firstLaunch?.preflight?.blockers?.some((blocker) => blocker.id === 'minecraft-launcher-handoff'), 'packaged Electron first-launch preflight names Minecraft Launcher Handoff blocker', 'packaged Electron first-launch preflight must name the real launch blocker')
  const isolatedHandoff = launcherElectronUiSmoke?.clickThrough?.minecraftLauncherHandoff
  requireCondition(phase, isolatedHandoff?.state === 'prepared_profile_in_isolated_minecraft_root', 'packaged Electron handoff preparation is explicitly isolated', 'packaged Electron handoff preparation must be isolated from the user Minecraft root')
  requireCondition(phase, isolatedHandoff?.ok === true, 'packaged Electron handoff preparation passed', 'packaged Electron handoff preparation must pass')
  requireCondition(phase, isolatedHandoff?.runtimeMode === 'native-loader-minecraft', 'packaged Electron handoff used Native Loader Minecraft mode', 'packaged Electron handoff must use Native Loader Minecraft mode')
  requireCondition(phase, isolatedHandoff?.verification?.valid === expectedPackagedModuleCount, `packaged Electron handoff preparation verified all ${expectedPackagedModuleCount} module files`, `packaged Electron handoff preparation must verify all ${expectedPackagedModuleCount} module files`)
  requireCondition(phase, isolatedHandoff?.handoff?.profileCurrent === true, 'packaged Electron handoff profile is current', 'packaged Electron handoff profile must be current')
  requireCondition(phase, isolatedHandoff?.handoff?.versionReady === true, 'packaged Electron handoff version metadata is ready', 'packaged Electron handoff version metadata must be ready')
  requireCondition(phase, isolatedHandoff?.handoff?.updatedProfile === true, 'packaged Electron handoff wrote launcher profile metadata', 'packaged Electron handoff must write launcher profile metadata')
  requireCondition(phase, isolatedHandoff?.handoff?.openedLauncher === false && isolatedHandoff?.handoff?.openSkipped === true, 'packaged Electron handoff did not open the official launcher during isolated proof', 'packaged Electron isolated handoff proof must not open the official launcher')
  requireCondition(phase, isolatedHandoff?.handoff?.validatedModsCount === expectedPackagedModuleCount, `packaged Electron handoff validated all ${expectedPackagedModuleCount} module files`, `packaged Electron handoff must validate all ${expectedPackagedModuleCount} module files`)
  requireCondition(phase, isolatedHandoff?.writtenProfile?.echoManaged === true, 'packaged Electron handoff wrote an ECHO-managed launcher profile', 'packaged Electron handoff must write an ECHO-managed launcher profile')
  requireCondition(phase, isolatedHandoff?.writtenProfile?.profileId === 'galactic-survey-native-edition', 'packaged Electron handoff launcher profile points at Galactic Survey Native Edition', 'packaged Electron handoff launcher profile must point at Galactic Survey Native Edition')
  requireCondition(phase, isolatedHandoff?.writtenProfile?.runtimeMode === 'native-loader-minecraft', 'packaged Electron handoff launcher profile records Native Loader Minecraft mode', 'packaged Electron handoff launcher profile must record Native Loader Minecraft mode')
  requireCondition(phase, isolatedHandoff?.writtenVersionMetadata?.loader === 'native-loader', 'packaged Electron handoff wrote Native Loader version metadata', 'packaged Electron handoff must write Native Loader version metadata')
  const runtimeChecks = runtimePlaytest?.runtimeChecks ?? {}
  const releasePreview = runtimePlaytest?.releaseGatePreview ?? {}
  const releasePreviewBlockers = Array.isArray(releasePreview.blockers) ? releasePreview.blockers : []
  requireCondition(phase, commandReports.runtimePlaytest.status === 'passed', 'compiled runtime playtest task passed', 'compiled runtime playtest task must pass')
  requireCondition(phase, runtimePlaytest?.schemaVersion === 'echo.galactic_survey.runtime-playtest.v1', 'compiled runtime playtest report exists', 'compiled runtime playtest report must be generated')
  requireCondition(phase, runtimePlaytest?.ok === true, 'compiled runtime playtest report passed', 'compiled runtime playtest report must pass')
  for (const check of ['first30Loop', 'first2HourLoop', 'holomapMeaningful', 'surveyArrayRestored', 'saveReloadEquivalent', 'publicAlphaStillRequiresExternalEvidence']) {
    requireCondition(phase, runtimeChecks[check] === true, `compiled runtime playtest check ${check} passed`, `compiled runtime playtest check ${check} must pass`)
  }
  requireCondition(phase, releasePreview.publicAlphaAllowed === false, 'compiled runtime playtest keeps public alpha blocked without external evidence', 'compiled runtime playtest must not declare public alpha ready')
  requireCondition(phase, releasePreviewBlockers.includes('real_first_30_playthrough'), 'compiled runtime playtest still requires real first-30-minute evidence', 'compiled runtime playtest must still require real first-30-minute evidence')
  requireCondition(phase, releasePreviewBlockers.includes('no_crash_evidence'), 'compiled runtime playtest still requires no-crash evidence', 'compiled runtime playtest must still require no-crash evidence')
  requireCondition(phase, !releasePreviewBlockers.includes('launcher_install_update_repair_rollback'), 'compiled runtime playtest leaves launcher lifecycle evidence to Release Index reports', 'compiled runtime playtest must not claim launcher lifecycle evidence is missing after Release Index launcher evidence passes')
  for (const edition of editions) {
    const packManifest = readJsonOrNull(path.join(releaseIndexRoot, 'packs', `${edition.id}.json`))
    const revision = sourceRevisions.editions[edition.lane]
    const head = revision?.commit
    const command = commandReports.editions.find((entry) => entry.id === edition.id)
    requireCondition(phase, fs.existsSync(edition.path), `${edition.repo} checkout exists`, `${edition.repo} checkout is missing`)
    requireCondition(phase, Boolean(packManifest), `packs/${edition.id}.json exists`, `packs/${edition.id}.json is missing`)
    requireCondition(phase, packManifest?.moduleRequirements?.some((entry) => entry.id === 'echogalacticsurveyprotocol'), `${edition.id} requires echogalacticsurveyprotocol`, `${edition.id} must require echogalacticsurveyprotocol`)
    requireCondition(phase, packManifest?.sourceRevision === head, `${edition.id} sourceRevision matches ${head}`, `${edition.id} sourceRevision must match ${edition.repo} HEAD`)
    requireCondition(phase, packManifest?.moduleSourceRevision === moduleRevision.commit, `${edition.id} moduleSourceRevision matches ${moduleRevision.commit}`, `${edition.id} moduleSourceRevision must match ECHO-Modules HEAD`)
    requireCondition(phase, channelPackIds.has(edition.id), `${edition.id} appears in alpha launcher channel as unpublished`, `${edition.id} must appear in alpha launcher channel`)
    requireCondition(phase, command?.validator.status === 'passed', `${edition.id} manifest validator passed`, `${edition.id} manifest validator must pass`)
    requireCondition(phase, command?.templateEvidence.status === 'passed', `${edition.id} manual-evidence template validator passed`, `${edition.id} manual-evidence template validator must pass`)
    if (head) phase.evidence.push(`${edition.repo} committed source revision ${head}`)
    else phase.blockers.push(`${edition.repo} has no committed source revision yet`)
    if (command?.releaseEvidence.status === 'passed') {
      phase.evidence.push(`${edition.id} release-ready gameplay evidence passed`)
    } else {
      phase.blockers.push(`${edition.id} release-ready gameplay evidence is still missing`)
    }
  }
  requireCondition(phase, moduleReleaseIngest?.validation === 'approved', 'Galactic module release ingestion is approved', 'Galactic module release ingestion must be approved')
  requireCondition(phase, moduleReleaseIngest?.assetCount === 96, 'Galactic module release exposes 96 source-owned release assets', 'Galactic module release must expose the 23-module runtime/source artifact set')
  requireCondition(phase, moduleReleaseIngest?.writtenIndexEntries?.length === 23, 'Release Index wrote 23 Galactic module catalog entries', 'Release Index must write the full 23-module Galactic module catalog set')
  for (const edition of editions) {
    const modpack = galacticModpackCatalog[edition.id]
    requireCondition(phase, modpack?.validation === 'approved', `${edition.id} installable modpack catalog entry is approved`, `${edition.id} modpack catalog entry must be approved`)
    requireCondition(phase, alphaChannel?.packs?.some((pack) => pack.id === edition.id && pack.catalogStatus === 'approved'), `${edition.id} launcher channel entry is approved`, `${edition.id} launcher channel entry must be approved`)
  }
  requireCondition(phase, (publicPrereleaseDownload || editionDraftPublish?.status === 'PASS') && editionDraftDownload?.status === 'PASS', 'edition GitHub Release artifacts are published and downloaded back', 'checksum-backed edition GitHub Release artifacts must be published and downloaded back')
  phase.blockers.push('real first-30-minute, first-2-hour, Survey Array, save/reload, and no-crash evidence is not present')
  phases.push(finalizePhase(phase))
}

const blockers = phases.flatMap((phase) => phase.blockers.map((blocker) => `phase ${phase.phase} ${phase.name}: ${blocker}`))
const status = blockers.length ? 'BLOCKED' : 'PASS'
const report = {
  schemaVersion: 'echo.galactic_survey.public-alpha-readiness.v1',
  status,
  generatedAt: new Date().toISOString(),
  project: {
    name: 'ECHO: Galactic Survey',
    moduleId: 'echogalacticsurveyprotocol',
    version: '0.1.0',
    channel: 'alpha',
    packIds: editions.map((edition) => edition.id)
  },
  evidenceSources: {
    workspaceRoot,
    releaseIndexRoot,
    moduleRepo,
    moduleRoot,
    reports: {
      moduleContract: commandReports.moduleContract.command,
      routeSmoke: commandReports.routeSmoke.command,
      editionValidators: editions.map((edition) => `${edition.repo}/scripts/validate-galactic-survey-edition.mjs`),
      editionGameplayEvidence: editions.map((edition) => `${edition.repo}/scripts/verify-manual-gameplay-evidence.mjs`),
      editionPackAssets: 'release-readiness/galactic-survey-edition-pack-assets.json',
      editionPackSmoke: 'release-readiness/galactic-survey-edition-pack-smoke.json',
      editionDraftPublish: 'release-readiness/galactic-survey-draft-publish.json',
      editionReleasePublication: publicPrereleaseDownload ? 'release-readiness/galactic-survey-draft-download.json' : 'release-readiness/galactic-survey-draft-publish.json',
      editionDraftDownload: 'release-readiness/galactic-survey-draft-download.json',
      launcherLifecycleSmoke: 'release-readiness/galactic-survey-launcher-lifecycle-smoke.json',
      launcherElectronUiSmoke: 'release-readiness/galactic-survey-electron-ui-smoke.json',
      runtimePlaytest: rel(runtimePlaytestReportPath),
      moduleRelease: '../ECHO-Modules/dist/echo-module-release/echo-release.json'
    }
  },
  editionPackEvidence: {
    assets: editionPackAssets
      ? {
          schemaVersion: editionPackAssets.schemaVersion,
          generatedAt: editionPackAssets.generatedAt,
          packagedModules: editionPackAssets.packagedModules,
          editions: editionPackAssets.localStage?.editions?.map((edition) => ({
            packId: edition.packId,
            repoName: edition.repoName,
            releaseTag: edition.releaseTag,
            assets: edition.assets?.map((asset) => asset.name),
            moduleCount: edition.modules?.length,
            zip: edition.zip
          })) ?? [],
          gates: editionPackAssets.gates,
          promotionBlockers: editionPackAssets.promotionBlockers
        }
      : null,
    downloadBackMatchesLocalStage: editionDownloadMatchesLocalStage,
    smoke: editionPackSmoke
      ? {
          schemaVersion: editionPackSmoke.schemaVersion,
          ok: editionPackSmoke.ok,
          generatedAt: editionPackSmoke.generatedAt,
          editions: editionPackSmoke.editions?.map((edition) => ({
            pack: edition.pack,
            repoName: edition.repoName,
            releaseTag: edition.releaseTag,
            localReleaseCandidate: edition.localReleaseCandidate,
            artifactSource: edition.artifactSource,
            githubDraftReleaseDownload: edition.githubDraftReleaseDownload,
            releaseMetadataDraft: edition.releaseMetadataDraft,
            releaseMetadataPrerelease: edition.releaseMetadataPrerelease,
            installedFiles: edition.installedFiles,
            verifiedAfterInstall: edition.verifiedAfterInstall,
            versionUpdate: edition.versionUpdate,
            versionRollback: edition.versionRollback,
            postRollbackVersionUpdate: edition.postRollbackVersionUpdate,
            verifiedAfterRollback: edition.verifiedAfterRollback
          })) ?? [],
          gates: editionPackSmoke.gates,
          artifactSource: editionPackSmoke.artifactSource,
          draftDownloadEvidence: editionPackSmoke.draftDownloadEvidence,
          residualRisks: editionPackSmoke.residualRisks
        }
      : null
  },
  editionReleasePublicationEvidence: publicPrereleaseDownload && editionDraftDownload
    ? {
        schemaVersion: 'echo.galactic_survey.public-prerelease-publication.v1',
        status: editionDraftDownload.status,
        generatedAt: editionDraftDownload.generatedAt,
        summary: {
          publicPrereleasesPublished: true,
          publishedEditionCount: editionDraftDownload.summary?.downloadedEditionCount,
          publishedAssetCount: editionDraftDownload.summary?.downloadedAssetCount,
          downloadedBack: editionDraftDownload.summary?.downloadedFromGitHubRelease === true
        },
        editions: editionDraftDownload.data?.editions?.map((edition) => ({
          repoName: edition.repoName,
          packId: edition.packId,
          releaseTag: edition.releaseTag,
          release: {
            draft: edition.release?.draft,
            prerelease: edition.release?.prerelease,
            htmlUrl: edition.release?.htmlUrl
          },
          assetCount: edition.downloadedAssets?.length ?? 0,
          assets: edition.downloadedAssets?.map((asset) => ({
            name: asset.name,
            size: asset.size,
            sha256: asset.sha256
          })) ?? []
        })) ?? []
      }
    : editionDraftPublish
      ? {
          schemaVersion: editionDraftPublish.schemaVersion,
          status: editionDraftPublish.status,
          generatedAt: editionDraftPublish.generatedAt,
          summary: editionDraftPublish.summary,
          editions: editionDraftPublish.data?.editions?.map((edition) => ({
            repoName: edition.repoName,
            packId: edition.packId,
            releaseTag: edition.releaseTag,
            release: {
              draft: edition.release?.draft,
              prerelease: edition.release?.prerelease,
              htmlUrl: edition.release?.htmlUrl
            },
            assetCount: edition.assets?.length ?? 0,
            assets: edition.assets?.map((asset) => ({
              name: asset.name,
              size: asset.size,
              sha256: asset.sha256
            })) ?? []
          })) ?? []
        }
      : null,
  editionDraftPublishEvidence: !publicPrereleaseDownload && editionDraftPublish
    ? {
        schemaVersion: editionDraftPublish.schemaVersion,
        status: editionDraftPublish.status,
        generatedAt: editionDraftPublish.generatedAt,
        summary: editionDraftPublish.summary,
        editions: editionDraftPublish.data?.editions?.map((edition) => ({
          repoName: edition.repoName,
          packId: edition.packId,
          releaseTag: edition.releaseTag,
          release: {
            draft: edition.release?.draft,
            prerelease: edition.release?.prerelease,
            htmlUrl: edition.release?.htmlUrl
          },
          assetCount: edition.assets?.length ?? 0,
          assets: edition.assets?.map((asset) => ({
            name: asset.name,
            size: asset.size,
            sha256: asset.sha256
          })) ?? []
        })) ?? []
      }
    : null,
  editionDraftDownloadEvidence: editionDraftDownload
    ? {
        schemaVersion: editionDraftDownload.schemaVersion,
        status: editionDraftDownload.status,
        generatedAt: editionDraftDownload.generatedAt,
        summary: editionDraftDownload.summary,
        editions: editionDraftDownload.data?.editions?.map((edition) => ({
          repoName: edition.repoName,
          packId: edition.packId,
          releaseTag: edition.releaseTag,
          release: {
            draft: edition.release?.draft,
            prerelease: edition.release?.prerelease,
            htmlUrl: edition.release?.htmlUrl
          },
          downloadedAssets: edition.downloadedAssets?.map((asset) => ({
            name: asset.name,
            size: asset.size,
            sha256: asset.sha256
          })) ?? [],
          verifiedTopLevelChecksumCount: edition.verifiedTopLevelChecksums?.length ?? 0
        })) ?? []
      }
    : null,
  launcherLifecycleEvidence: launcherLifecycleSmoke
    ? {
        schemaVersion: launcherLifecycleSmoke.schemaVersion,
        ok: launcherLifecycleSmoke.ok,
        generatedAt: launcherLifecycleSmoke.generatedAt,
        editions: launcherLifecycleSmoke.editions?.map((edition) => ({
          pack: edition.pack,
          repoName: edition.repoName,
          releaseTag: edition.releaseTag,
          moduleCount: edition.moduleCount,
          fileCount: edition.fileCount,
          deepLinks: edition.deepLinks,
          install: edition.install,
          update: edition.update,
          rollback: edition.rollback,
          postRollbackUpdate: edition.postRollbackUpdate,
          repair: edition.repair
        })) ?? [],
        gates: launcherLifecycleSmoke.gates,
        residualRisks: launcherLifecycleSmoke.residualRisks
      }
    : null,
  launcherElectronUiEvidence: launcherElectronUiSmoke
    ? {
        schemaVersion: launcherElectronUiSmoke.schemaVersion,
        ok: launcherElectronUiSmoke.ok,
        generatedAt: launcherElectronUiSmoke.generatedAt,
        scope: launcherElectronUiSmoke.scope,
        executable: launcherElectronUiSmoke.executable,
        catalog: launcherElectronUiSmoke.catalog,
        nativeBridge: launcherElectronUiSmoke.nativeBridge,
        ui: {
          activeHeading: launcherElectronUiSmoke.ui?.activeHeading,
          officialPacksLabelVisible: launcherElectronUiSmoke.ui?.officialPacksLabelVisible,
          cards: launcherElectronUiSmoke.ui?.cards?.map((card) => ({
            name: card.name,
            found: card.found,
            headingOverflow: card.heading?.overflow,
            hasManifestState: card.hasManifestState,
            hasCatalogState: card.hasCatalogState,
            hasInstallState: card.hasInstallState,
            hasActionState: card.hasActionState,
            hasDiagnosticsAction: card.hasDiagnosticsAction,
            hasHomeAction: card.hasHomeAction,
            hasScopedAction: card.hasScopedAction
          })) ?? [],
          hasGlobalInstallUpdate: launcherElectronUiSmoke.ui?.hasGlobalInstallUpdate,
          hasScopedGalacticSurveyAction: launcherElectronUiSmoke.ui?.hasScopedGalacticSurveyAction
        },
        clickThrough: {
          selectedPack: launcherElectronUiSmoke.clickThrough?.selectedPack,
          install: launcherElectronUiSmoke.clickThrough?.install,
          update: launcherElectronUiSmoke.clickThrough?.update,
          reupdateAfterRollback: launcherElectronUiSmoke.clickThrough?.reupdateAfterRollback,
          repair: launcherElectronUiSmoke.clickThrough?.repair,
          diagnostics: launcherElectronUiSmoke.clickThrough?.diagnostics,
          logs: launcherElectronUiSmoke.clickThrough?.logs,
          firstLaunch: launcherElectronUiSmoke.clickThrough?.firstLaunch,
          minecraftLauncherHandoff: launcherElectronUiSmoke.clickThrough?.minecraftLauncherHandoff,
          rollback: launcherElectronUiSmoke.clickThrough?.rollback
        },
        gates: launcherElectronUiSmoke.gates
      }
    : null,
  runtimePlaytestEvidence: runtimePlaytest
    ? {
        schemaVersion: runtimePlaytest.schemaVersion,
        ok: runtimePlaytest.ok,
        generatedAt: runtimePlaytest.generatedAt,
        scope: runtimePlaytest.scope,
        moduleId: runtimePlaytest.moduleId,
        packId: runtimePlaytest.packId,
        mode: runtimePlaytest.mode,
        milestones: Object.fromEntries(Object.entries(runtimePlaytest.milestones ?? {}).map(([id, milestone]) => [
          id,
          {
            schema: milestone.schema,
            probeCount: milestone.probeCount,
            catalogedDiscoveries: milestone.catalogedDiscoveries,
            routeCount: milestone.routeCount,
            depotCount: milestone.depotCount,
            salvageCount: milestone.salvageCount,
            proofCount: milestone.completedProofs?.length ?? 0
          }
        ])),
        holomap: runtimePlaytest.holomap,
        runtimeChecks: runtimePlaytest.runtimeChecks,
        releaseGatePreview: {
          publicAlphaAllowed: runtimePlaytest.releaseGatePreview?.publicAlphaAllowed,
          reason: runtimePlaytest.releaseGatePreview?.reason,
          blockers: runtimePlaytest.releaseGatePreview?.blockers,
          satisfiedRuntimeGateCount: runtimePlaytest.releaseGatePreview?.satisfiedRuntimeGateCount
        },
        residualRisks: runtimePlaytest.residualRisks
      }
    : null,
  sourceRevisions,
  phaseSummary: phases.map((phase) => ({
    phase: phase.phase,
    id: phase.id,
    name: phase.name,
    status: phase.status
  })),
  phases,
  gates: Object.fromEntries(phases.map((phase) => [phase.id, phase.status])),
  promotion: {
    eligible: status === 'PASS',
    warningValidationCanBeRemoved: status === 'PASS',
    publicAlphaCanBeDeclaredReady: status === 'PASS'
  },
  commandReports,
  blockers,
  notes: [
    'This audit composes source contracts, Release Index routing, and edition evidence validators.',
    'Galactic Survey catalog install is checksum-backed, but release-ready promotion remains blocked until real gameplay evidence passes.',
    'Packaged Electron rollback now has visible Restore Last Known Good click-through evidence; real first launch and gameplay evidence remain separate gates.'
  ]
}

if (args.write) {
  const outPath = path.resolve(releaseIndexRoot, args.out)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
}

console.log(JSON.stringify(report, null, 2))

if (args.requireReleaseReady && status !== 'PASS') {
  process.exitCode = 1
}
