#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'verify-sky-relay-public-alpha-readiness.mjs')

const blocks = [
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

const items = [
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

const fragments = [
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

const chapters = [
  'awakening',
  'power_critical',
  'first_anchor',
  'storm_warning',
  'signal_crown',
]

const editions = [
  ['native', 'ECHO-Sky-Relay-Native-Edition', 'sky-relay-native-edition', 'sky-relay-native-0.1.0-alpha'],
  ['neoforge', 'ECHO-Sky-Relay-NeoForge-Edition', 'sky-relay-neoforge-edition', 'sky-relay-neoforge-0.1.0-alpha'],
  ['standalone', 'ECHO-Sky-Relay-Standalone-Edition', 'sky-relay-standalone-edition', 'sky-relay-standalone-0.1.0-alpha'],
]

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeText(root, relPath, value = 'fixture\n') {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
}

function run(root, workspaceRoot, extraArgs = []) {
  return spawnSync(process.execPath, [
    script,
    '--root',
    root,
    '--workspace-root',
    workspaceRoot,
    ...extraArgs,
  ], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

async function writeModuleFixture(workspaceRoot) {
  const moduleRepo = path.join(workspaceRoot, 'ECHO-Modules')
  const moduleRoot = path.join(moduleRepo, 'addons/echoskyrelayprotocol')
  const dataRoot = 'addons/echoskyrelayprotocol/src/main/resources/data/echoskyrelayprotocol/skyrelay'

  await writeText(moduleRepo, 'docs/SKY_RELAY_FULL_EXPERIENCE_PLAN.md', '# fixture plan\n')
  await writeText(moduleRepo, 'settings.gradle', "include 'addons:echoskyrelayprotocol'\n")
  await writeText(moduleRepo, 'build.gradle', "tasks.register('echoskyrelayprotocol') {}\n")
  for (const relPath of [
    'build.gradle',
    'gradle.properties',
    'README.md',
    'src/main/java/com/knoxhack/echoskyrelayprotocol/EchoSkyRelayProtocol.java',
    'src/main/java/com/knoxhack/echoskyrelayprotocol/EchoSkyRelayNativeModule.java',
  ]) {
    await writeText(moduleRoot, relPath)
  }
  await writeJson(moduleRoot, 'src/main/resources/META-INF/echo.mod.json', {
    name: 'ECHO: Sky Relay Protocol',
    role: 'official_pack',
    provides: ['skyrelay.content', 'skyrelay.missions', 'skyrelay.fragments', 'skyrelay.terminal', 'skyrelay.weather_routes'],
    optional: ['echoterminal', 'echolens', 'echoholomap', 'echoweathercore', 'echopowergrid', 'echorecovery', 'echologisticsnetwork'],
  })
  await writeJson(moduleRepo, `${dataRoot}/plan/production_phase_matrix.json`, {
    phases: Array.from({ length: 10 }, (_, index) => ({
      phase: index + 1,
      subphases: ['one', 'two', 'three', 'four', 'five'],
    })),
  })
  await writeJson(moduleRepo, `${dataRoot}/content/block_catalog.json`, {
    blocks: blocks.map((id) => ({ id })),
  })
  await writeJson(moduleRepo, `${dataRoot}/content/item_catalog.json`, {
    items: items.map((id) => ({ id })),
  })
  await writeJson(moduleRepo, `${dataRoot}/fragments/fragment_catalog.json`, {
    fragments: fragments.map((id) => ({ id })),
  })
  await writeJson(moduleRepo, `${dataRoot}/fragments/anchor_rules.json`, {
    rules: fragments.map((fragmentId, index) => ({
      fragmentId,
      stablePowerRequired: index * 12,
      scanRequirement: `scan:${fragmentId}`,
      stormRisk: index > 6 ? 'extreme' : 'medium',
    })),
  })
  await writeJson(moduleRepo, `${dataRoot}/progression/chapter_catalog.json`, {
    chapters: chapters.map((id) => ({ id })),
  })
  for (const relPath of [
    'integrations/terminal_pages.json',
    'integrations/lens_scan_profiles.json',
    'integrations/holomap_layers.json',
    'integrations/weather_routes.json',
    'integrations/recovery_bindings.json',
  ]) {
    await writeJson(moduleRepo, `${dataRoot}/${relPath}`, {})
  }
}

async function writeEditionRepos(workspaceRoot) {
  for (const [, repoDir] of editions) {
    await fs.mkdir(path.join(workspaceRoot, repoDir), { recursive: true })
  }
}

async function writeCatalogFiles(root) {
  for (const relPath of [
    'addons/echoskyrelayprotocol.json',
    'packs/sky-relay-native-edition.json',
    'packs/sky-relay-neoforge-edition.json',
    'packs/sky-relay-standalone-edition.json',
    'modpacks/sky-relay-native.json',
    'modpacks/sky-relay-neoforge.json',
    'modpacks/sky-relay-standalone.json',
  ]) {
    await writeJson(root, relPath, {})
  }
}

async function writeReports(root, options = {}) {
  const launcherVersionTransitionGate = options.launcherVersionTransitionGate ?? 'passed'
  const packVersionTransitionGate = options.packVersionTransitionGate ?? 'passed'
  const gameplayStatus = options.gameplayStatus ?? 'PASS'

  await writeJson(root, 'release-readiness/sky-relay-module-draft-release.json', {
    schemaVersion: 'echo.skyrelay.module-draft-release.v1',
    project: { moduleId: 'echoskyrelayprotocol', releaseId: 'sky-relay-0.1.0-alpha' },
    gates: {
      downloadBackHashValidation: 'passed',
      publicReleasePromotion: 'passed',
      stableTaggedAssetUrls: 'passed',
    },
  })
  await writeJson(root, 'release-readiness/sky-relay-edition-draft-releases.json', {
    schemaVersion: 'echo.skyrelay.edition-draft-releases.v1',
    releases: editions.map(([, , packId, releaseTag]) => ({ packId, releaseTag })),
    gates: {
      editionRepositoriesCreated: 'passed',
      editionManifestValidators: 'passed',
      publicPrereleasesPromoted: 'passed',
    },
  })
  await writeJson(root, 'release-readiness/sky-relay-edition-pack-assets.json', {
    schemaVersion: 'echo.skyrelay.edition-pack-assets.v1',
    gates: {
      editionPackAssetsBuilt: 'passed',
      editionDraftAssetsUploaded: 'passed',
      editionDraftDownloadBack: 'passed',
      editionPublicPrereleasesPromoted: 'passed',
      stableTaggedArtifactUrls: 'passed',
      zipMatchesPackManifest: 'passed',
    },
  })
  await writeJson(root, 'release-readiness/sky-relay-edition-pack-smoke.json', {
    schemaVersion: 'echo.skyrelay.edition-pack-smoke.v1',
    gates: {
      downloadedReleaseAssetsVerified: 'passed',
      installFromPackZip: 'passed',
      versionTransitionUpdate: packVersionTransitionGate,
      repairCorruptFile: 'passed',
      rollbackSimulatedReplacement: 'passed',
      realVersionUpdate: packVersionTransitionGate === 'passed' ? 'passed_with_previous_version_fixture' : 'blocked',
    },
  })
  await writeJson(root, 'release-readiness/sky-relay-launcher-lifecycle-smoke.json', {
    schemaVersion: 'echo.skyrelay.launcher-lifecycle-smoke.v1',
    gates: {
      launcherReleaseIndexDeepLinks: 'passed',
      launcherInstallFromPackZip: 'passed',
      launcherUpdateReconciliation: 'passed',
      launcherVersionTransitionUpdate: launcherVersionTransitionGate,
      launcherRepairCorruptFile: 'passed',
      launcherRollbackSimulatedUpdate: 'passed',
      realVersionToVersionUpdate: launcherVersionTransitionGate === 'passed' ? 'passed_with_previous_version_fixture' : 'blocked',
    },
  })
  await writeJson(root, 'release-readiness/sky-relay-electron-ui-smoke.json', {
    schemaVersion: 'echo.skyrelay.electron-ui-smoke.v1',
    gates: {
      packagedElectronRendererMounted: 'passed',
      nativeBridgeBootstrap: 'passed',
      skyRelayLibraryCardsVisible: 'passed',
      skyRelayPreviewGating: 'passed',
      packagedElectronInstallClickThrough: 'passed',
      packagedElectronUpdateReconciliationClickThrough: 'passed',
      packagedElectronRepairClickThrough: 'passed',
    },
  })
  await writeJson(root, 'release-readiness/sky-relay-gameplay-route-smoke.json', {
    schemaVersion: 'echo.skyrelay.gameplay-route-smoke.v1',
    gates: {
      first30RouteContract: 'passed',
      first2HourRouteContract: 'passed',
      signalCrownContract: 'passed',
    },
  })
  await writeJson(root, 'release-readiness/sky-relay-gameplay-evidence.json', {
    schemaVersion: 'echo.skyrelay.gameplay-evidence.v1',
    status: gameplayStatus,
  })
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sky-relay-readiness-'))
try {
  const readyRoot = path.join(tmp, 'ready-release-index')
  const readyWorkspace = path.join(tmp, 'ready-workspace')
  await writeModuleFixture(readyWorkspace)
  await writeEditionRepos(readyWorkspace)
  await writeCatalogFiles(readyRoot)
  await writeReports(readyRoot)
  const ready = run(readyRoot, readyWorkspace, ['--require-release-ready'])
  assert.equal(ready.status, 0, `${ready.stdout}\n${ready.stderr}`)
  const readyReport = JSON.parse(ready.stdout)
  assert.equal(readyReport.status, 'PASS')
  assert.equal(readyReport.phaseSummary.length, 10)
  assert.equal(readyReport.gates.release_public_alpha, 'passed')

  const blockedRoot = path.join(tmp, 'blocked-release-index')
  const blockedWorkspace = path.join(tmp, 'blocked-workspace')
  await writeModuleFixture(blockedWorkspace)
  await writeEditionRepos(blockedWorkspace)
  await writeCatalogFiles(blockedRoot)
  await writeReports(blockedRoot, {
    launcherVersionTransitionGate: 'blocked',
    packVersionTransitionGate: 'blocked',
    gameplayStatus: 'BLOCKED',
  })
  const blocked = run(blockedRoot, blockedWorkspace, ['--require-release-ready'])
  assert.equal(blocked.status, 1)
  const blockedReport = JSON.parse(blocked.stdout)
  assert.equal(blockedReport.status, 'BLOCKED')
  assert.equal(blockedReport.gates.editions_launcher, 'blocked')
  assert.equal(blockedReport.gates.release_public_alpha, 'blocked')
  assert.match(blocked.stdout, /gameplay evidence report must be PASS/u)
  assert.match(blocked.stdout, /launcher lifecycle smoke gate launcherVersionTransitionUpdate must be passed/u)
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}

console.log('Sky Relay public alpha readiness verifier fixtures passed.')
