import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const DEFAULT_OUT = 'release-readiness/galactic-survey-public-alpha-readiness.json'
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
const requiredPackagedModules = [
  'echocore',
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
  releaseIndex: repositoryRevision(releaseIndexRoot, {
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
  requireCondition(phase, releaseGates?.gates?.length === 14, 'release gate catalog has 14 gates', 'release gate catalog must have 14 gates')
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
  requireCondition(phase, setContainsAll(editionPackAssets?.packagedModules, requiredPackagedModules), 'local edition assets include the full 18-module runtime spine', 'local edition assets must include the full 18-module runtime spine')
  requireCondition(phase, setContainsAll(assetEditionPackIds, editions.map((edition) => edition.id)), 'local edition asset report covers Native, NeoForge, and Standalone packs', 'local edition asset report must cover Native, NeoForge, and Standalone packs')
  requireCondition(phase, editionPackSmoke?.schemaVersion === 'echo.galactic_survey.edition-pack-smoke.v1', 'local edition lifecycle smoke report exists', 'local edition lifecycle smoke report must be generated')
  requireCondition(phase, editionPackSmoke?.ok === true, 'local edition lifecycle smoke completed successfully', 'local edition lifecycle smoke must complete successfully')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'stagedReleaseAssetsVerified'), 'local staged release assets verified during smoke', 'local staged release assets must verify during smoke')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'installFromPackZip'), 'local pack ZIP install smoke passed', 'local pack ZIP install smoke must pass')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'versionTransitionUpdate'), 'local pack version-transition update smoke passed', 'local pack version-transition update smoke must pass')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'repairCorruptFile'), 'local pack repair smoke passed', 'local pack repair smoke must pass')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'rollbackSimulatedReplacement'), 'local pack rollback smoke passed', 'local pack rollback smoke must pass')
  requireCondition(phase, setContainsAll(smokeEditionPackIds, editions.map((edition) => edition.id)), 'local lifecycle smoke covers Native, NeoForge, and Standalone packs', 'local lifecycle smoke must cover Native, NeoForge, and Standalone packs')
  requireCondition(phase, smokeEditions.every((edition) => edition.installedFiles === 18 && edition.verifiedAfterInstall === 18 && edition.versionUpdate?.verifiedAfterUpdate === 18 && edition.postRollbackVersionUpdate?.verifiedAfterUpdate === 18 && edition.verifiedAfterRollback === 18), 'local lifecycle smoke verified all 18 module files through install, update, repair, and rollback', 'local lifecycle smoke must verify all 18 module files through install, update, repair, and rollback')
  const draftPublishEditions = Array.isArray(editionDraftPublish?.data?.editions) ? editionDraftPublish.data.editions : []
  const draftPublishPackIds = draftPublishEditions.map((edition) => edition.packId)
  requireCondition(phase, editionDraftPublish?.schemaVersion === 'echo.galactic_survey.draft-publish.v1', 'draft release publish evidence report exists', 'draft release publish evidence report must be generated')
  requireCondition(phase, editionDraftPublish?.status === 'PASS', 'draft release publish evidence passed', 'draft release publish evidence must pass')
  requireCondition(phase, editionDraftPublish?.summary?.draftReleasesPublished === true, 'draft release assets were published to GitHub', 'draft release assets must be published to GitHub')
  requireCondition(phase, editionDraftPublish?.summary?.publishedEditionCount === 3, 'draft release publish evidence covers all 3 editions', 'draft release publish evidence must cover all 3 editions')
  requireCondition(phase, editionDraftPublish?.summary?.publishedAssetCount === 15, 'draft release publish evidence covers all 15 edition assets', 'draft release publish evidence must cover all 15 edition assets')
  requireCondition(phase, setContainsAll(draftPublishPackIds, editions.map((edition) => edition.id)), 'draft release publish evidence covers Native, NeoForge, and Standalone packs', 'draft release publish evidence must cover Native, NeoForge, and Standalone packs')
  requireCondition(phase, draftPublishEditions.every((edition) => edition.release?.draft === true && edition.release?.prerelease === true), 'draft release publish evidence is draft prerelease-only', 'draft release publish evidence must be draft prerelease-only')
  requireCondition(phase, draftPublishEditions.every((edition) => edition.assets?.length === 5), 'draft release publish evidence contains all required assets per edition', 'draft release publish evidence must contain all required assets per edition')
  const draftDownloadEditions = Array.isArray(editionDraftDownload?.data?.editions) ? editionDraftDownload.data.editions : []
  const draftDownloadPackIds = draftDownloadEditions.map((edition) => edition.packId)
  requireCondition(phase, editionDraftDownload?.schemaVersion === 'echo.galactic_survey.draft-download.v1', 'downloaded draft release evidence report exists', 'downloaded draft release evidence report must be generated')
  requireCondition(phase, editionDraftDownload?.status === 'PASS', 'downloaded draft release evidence passed', 'downloaded draft release evidence must pass')
  requireCondition(phase, editionDraftDownload?.summary?.downloadedFromGitHubRelease === true, 'draft release assets were downloaded back from GitHub', 'draft release assets must be downloaded back from GitHub')
  requireCondition(phase, editionDraftDownload?.summary?.downloadedEditionCount === 3, 'downloaded draft release evidence covers all 3 editions', 'downloaded draft release evidence must cover all 3 editions')
  requireCondition(phase, editionDraftDownload?.summary?.downloadedAssetCount === 15, 'downloaded draft release evidence covers all 15 edition assets', 'downloaded draft release evidence must cover all 15 edition assets')
  requireCondition(phase, setContainsAll(draftDownloadPackIds, editions.map((edition) => edition.id)), 'downloaded draft release evidence covers Native, NeoForge, and Standalone packs', 'downloaded draft release evidence must cover Native, NeoForge, and Standalone packs')
  requireCondition(phase, draftDownloadEditions.every((edition) => edition.release?.draft === true && edition.release?.prerelease === true), 'downloaded draft release evidence is from draft prereleases', 'downloaded draft release evidence must come from draft prereleases')
  requireCondition(phase, draftDownloadEditions.every((edition) => edition.downloadedAssets?.length === 5), 'downloaded draft release evidence contains all required assets per edition', 'downloaded draft release evidence must contain all required assets per edition')
  requireCondition(phase, editionPackSmoke?.artifactSource === 'github-draft-release-download', 'lifecycle smoke used downloaded GitHub draft assets', 'lifecycle smoke must use downloaded GitHub draft assets')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'githubDraftDownloadBack'), 'lifecycle smoke verified GitHub draft download evidence', 'lifecycle smoke must verify GitHub draft download evidence')
  requireCondition(phase, reportGatePassed(editionPackSmoke, 'installedFromDownloadedArtifacts'), 'lifecycle smoke installed downloaded GitHub draft artifacts', 'lifecycle smoke must install downloaded GitHub draft artifacts')
  requireCondition(phase, smokeEditions.every((edition) => edition.githubDraftReleaseDownload === true && edition.releaseMetadataDraft === true && edition.releaseMetadataPrerelease === true), 'lifecycle smoke covers draft release metadata for all editions', 'lifecycle smoke must cover draft release metadata for all editions')
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
  requireCondition(phase, releasePreviewBlockers.includes('launcher_install_update_repair_rollback'), 'compiled runtime playtest still requires launcher lifecycle evidence', 'compiled runtime playtest must still require launcher lifecycle evidence')
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
  requireCondition(phase, !fs.existsSync(path.join(releaseIndexRoot, 'modpacks', 'galactic-survey-native.json')), 'no installable Native modpack catalog entry has been published yet', 'Native modpack catalog must remain absent until release evidence exists')
  requireCondition(phase, !fs.existsSync(path.join(releaseIndexRoot, 'modpacks', 'galactic-survey-neoforge.json')), 'no installable NeoForge modpack catalog entry has been published yet', 'NeoForge modpack catalog must remain absent until release evidence exists')
  requireCondition(phase, !fs.existsSync(path.join(releaseIndexRoot, 'modpacks', 'galactic-survey-standalone.json')), 'no installable Standalone modpack catalog entry has been published yet', 'Standalone modpack catalog must remain absent until release evidence exists')
  if (editionDraftPublish?.status === 'PASS' && editionDraftDownload?.status === 'PASS') {
    phase.blockers.push('draft edition GitHub Release artifacts are verified, but final catalog promotion and module release ingestion are not approved')
  } else {
    phase.blockers.push('checksum-backed module and edition GitHub Release artifacts are not published')
  }
  phase.blockers.push('downloaded GitHub Release launcher install, update, repair, and rollback evidence is not present')
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
      editionDraftDownload: 'release-readiness/galactic-survey-draft-download.json',
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
  editionDraftPublishEvidence: editionDraftPublish
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
    'Galactic Survey must remain non-installable until published artifacts, real gameplay evidence, and launcher lifecycle evidence all pass.'
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
