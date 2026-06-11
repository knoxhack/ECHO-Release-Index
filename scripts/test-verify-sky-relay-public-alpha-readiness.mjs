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

const artifactByEdition = {
  native: {
    artifactAsset: 'sky-relay-native-edition-0.1.0.zip',
    artifactSha256: '8cf781726f5cfbd1e9d87c0c8eb3c1fc502c1e6459d66a697941f814b0fa71fa',
    artifactSize: 39163330,
  },
  neoforge: {
    artifactAsset: 'sky-relay-neoforge-edition-0.1.0.zip',
    artifactSha256: '04fde5ab03cd89ee3717a90491d818de2659cf77cfc5ea9b0e1ad43e64a9ca7b',
    artifactSize: 40132235,
  },
  standalone: {
    artifactAsset: 'sky-relay-standalone-edition-0.1.0.zip',
    artifactSha256: '93c7ae635467138c2b0e594d18de535ee7a25075e361e64c111b2505d84f8cf2',
    artifactSize: 40131817,
  },
}

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

const gameplayClaims = [
  'freshWorldCreated',
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'realSignalCrownPlaythrough',
  'saveReloadVerified',
  'noCrashEvidence',
]

const gameplayGates = [
  'routeContractReport',
  'captureKitReady',
  ...gameplayClaims,
]

const logProvenanceFields = [
  'packId',
  'releaseTag',
  'artifactAsset',
  'artifactSha256',
  'artifactSize',
  'launcherChannel',
  'installedFrom',
  'worldOrProfile',
  'runStartedAt',
]

function shaFixture(seed) {
  return seed.toString(16).padStart(2, '0').repeat(32).slice(0, 64)
}

function evidencePaths() {
  const base = 'fixtures/sky-relay/gameplay-qa/evidence'
  return {
    supportingFiles: [
      `${base}/fresh-world-notes.md`,
      `${base}/first-30-minutes-notes.md`,
      `${base}/first-2-hours-notes.md`,
      `${base}/signal-crown-verification.md`,
      `${base}/no-crash-review.md`,
    ],
    screenshots: [
      `${base}/screenshots/fresh-world-created.png`,
      `${base}/screenshots/first-30-minutes.png`,
      `${base}/screenshots/first-2-hours.png`,
      `${base}/screenshots/signal-crown-complete.png`,
    ],
    logs: [
      `${base}/logs/client-playthrough.log`,
      `${base}/logs/launcher-install.log`,
    ],
    saveSnapshots: [
      `${base}/saves/first-30-minutes-save.zip`,
      `${base}/saves/first-2-hours-save.zip`,
      `${base}/saves/signal-crown-save.zip`,
    ],
  }
}

function sessionsFixture(paths) {
  return [
    {
      id: 'fresh_world_creation',
      claim: 'freshWorldCreated',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T00:02:00Z',
      durationMinutes: 2,
      evidence: {
        notes: paths.supportingFiles[0],
        screenshot: paths.screenshots[0],
        clientLog: paths.logs[0],
        launcherLog: paths.logs[1],
      },
    },
    {
      id: 'first_30_minutes',
      claim: 'realFirst30Playthrough',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T00:31:00Z',
      durationMinutes: 31,
      evidence: {
        notes: paths.supportingFiles[1],
        screenshot: paths.screenshots[1],
        saveSnapshot: paths.saveSnapshots[0],
        clientLog: paths.logs[0],
      },
    },
    {
      id: 'first_2_hours',
      claim: 'realFirst2HourPlaythrough',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T02:05:00Z',
      durationMinutes: 125,
      evidence: {
        notes: paths.supportingFiles[2],
        screenshot: paths.screenshots[2],
        saveSnapshot: paths.saveSnapshots[1],
        clientLog: paths.logs[0],
      },
    },
    {
      id: 'signal_crown_completion',
      claim: 'realSignalCrownPlaythrough',
      startedAt: '2026-06-11T02:05:00Z',
      endedAt: '2026-06-11T02:20:00Z',
      durationMinutes: 15,
      evidence: {
        notes: paths.supportingFiles[3],
        screenshot: paths.screenshots[3],
        saveSnapshot: paths.saveSnapshots[2],
        clientLog: paths.logs[0],
      },
    },
    {
      id: 'save_reload_verification',
      claim: 'saveReloadVerified',
      startedAt: '2026-06-11T02:20:00Z',
      endedAt: '2026-06-11T02:22:00Z',
      durationMinutes: 2,
      evidence: {
        first30SaveSnapshot: paths.saveSnapshots[0],
        first2HourSaveSnapshot: paths.saveSnapshots[1],
        signalCrownSaveSnapshot: paths.saveSnapshots[2],
        clientLog: paths.logs[0],
      },
    },
    {
      id: 'no_crash_review',
      claim: 'noCrashEvidence',
      startedAt: '2026-06-11T02:22:00Z',
      endedAt: '2026-06-11T02:23:00Z',
      durationMinutes: 1,
      evidence: {
        notes: paths.supportingFiles[4],
        clientLog: paths.logs[0],
        launcherLog: paths.logs[1],
      },
    },
  ]
}

function checkedEvidence(paths, sessions) {
  return {
    supportingFiles: paths.supportingFiles.map((filePath, index) => ({
      path: filePath,
      size: 512 + index,
      sha256: shaFixture(index + 1),
    })),
    screenshots: paths.screenshots.map((filePath, index) => ({
      path: filePath,
      size: 2048 + index,
      sha256: shaFixture(index + 11),
      dimensions: { width: 1280, height: 720 },
      chunks: 3,
      idatChunks: 1,
      bitDepth: 8,
      colorType: 0,
      pixelVariation: {
        supported: true,
        uniquePixelSamples: 64,
        luminanceRange: 128,
      },
    })),
    logs: paths.logs.map((filePath, index) => ({
      path: filePath,
      size: 1024 + index,
      sha256: shaFixture(index + 21),
      lineCount: 24 + index,
      blockingSignatures: 0,
      provenanceMatches: logProvenanceFields,
      sessionMatches: index === 0
        ? sessions.flatMap((session) => [`${session.id}.id`, `${session.id}.startedAt`, `${session.id}.endedAt`])
        : [],
    })),
    saveSnapshots: paths.saveSnapshots.map((filePath, index) => ({
      path: filePath,
      size: 4096 + index,
      sha256: shaFixture(index + 31),
      entries: 3,
      centralDirectorySize: 128,
      hasLevelDat: true,
      hasRegionChunk: true,
      hasPlayerOrDataState: true,
      worldStateEntries: ['save/region/r.0.0.mca', `save/playerdata/test-player-${index + 1}.dat`],
      unsafeEntries: [],
    })),
  }
}

function gameplayEvidenceReport(status = 'PASS') {
  const passed = status === 'PASS'
  return {
    schemaVersion: 'echo.skyrelay.gameplay-evidence.v1',
    status,
    generatedAt: '2026-06-11T00:00:00.000Z',
    moduleId: 'echoskyrelayprotocol',
    routeContractReport: 'release-readiness/sky-relay-gameplay-route-smoke.json',
    editionPackAssets: 'release-readiness/sky-relay-edition-pack-assets.json',
    manualEvidencePath: 'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
    requiredEvidence: {
      packArtifacts: artifactByEdition,
    },
    gates: Object.fromEntries(gameplayGates.map((gate) => [gate, passed ? 'passed' : 'blocked'])),
    captureKits: editions.map(([key]) => ({
      edition: key,
      status: passed ? 'passed' : 'blocked',
    })),
    editions: editions.map(([key, repoDir]) => {
      const paths = evidencePaths()
      const sessions = sessionsFixture(paths)
      return {
        edition: key,
        repository: `knoxhack/${repoDir}`,
        found: passed,
        claims: Object.fromEntries(gameplayClaims.map((claim) => [claim, passed])),
        sessions,
        checked: passed
          ? checkedEvidence(paths, sessions)
          : {
              supportingFiles: [],
              screenshots: [],
              logs: [],
              saveSnapshots: [],
            },
      }
    }),
    blockers: passed ? [] : ['manual evidence blocked'],
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
    downloadBackValidation: {
      editions: editions.map(([key, repoDir, packId, releaseTag]) => ({
        packId,
        repository: `knoxhack/${repoDir}`,
        releaseTag,
        assets: [
          {
            name: artifactByEdition[key].artifactAsset,
            size: artifactByEdition[key].artifactSize,
            sha256: artifactByEdition[key].artifactSha256,
          },
        ],
        zip: {
          name: artifactByEdition[key].artifactAsset,
          validated: true,
        },
      })),
    },
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
  await writeJson(root, 'release-readiness/sky-relay-gameplay-evidence.json', options.gameplayReport ?? gameplayEvidenceReport(gameplayStatus))
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

  const stubGameplayRoot = path.join(tmp, 'stub-gameplay-release-index')
  const stubGameplayWorkspace = path.join(tmp, 'stub-gameplay-workspace')
  await writeModuleFixture(stubGameplayWorkspace)
  await writeEditionRepos(stubGameplayWorkspace)
  await writeCatalogFiles(stubGameplayRoot)
  await writeReports(stubGameplayRoot, {
    gameplayReport: {
      schemaVersion: 'echo.skyrelay.gameplay-evidence.v1',
      status: 'PASS',
    },
  })
  const stubGameplay = run(stubGameplayRoot, stubGameplayWorkspace, ['--require-release-ready'])
  assert.equal(stubGameplay.status, 1)
  assert.match(stubGameplay.stdout, /gameplay evidence report moduleId must be echoskyrelayprotocol/u)
  assert.match(stubGameplay.stdout, /gameplay evidence report must include all edition summaries/u)

  const contradictoryGameplayRoot = path.join(tmp, 'contradictory-gameplay-release-index')
  const contradictoryGameplayWorkspace = path.join(tmp, 'contradictory-gameplay-workspace')
  await writeModuleFixture(contradictoryGameplayWorkspace)
  await writeEditionRepos(contradictoryGameplayWorkspace)
  await writeCatalogFiles(contradictoryGameplayRoot)
  await writeReports(contradictoryGameplayRoot, {
    gameplayReport: {
      ...gameplayEvidenceReport('PASS'),
      blockers: ['leftover blocker'],
    },
  })
  const contradictoryGameplay = run(contradictoryGameplayRoot, contradictoryGameplayWorkspace, ['--require-release-ready'])
  assert.equal(contradictoryGameplay.status, 1)
  assert.match(contradictoryGameplay.stdout, /gameplay evidence report must not contain blockers/u)

  const artifactDriftRoot = path.join(tmp, 'artifact-drift-release-index')
  const artifactDriftWorkspace = path.join(tmp, 'artifact-drift-workspace')
  const artifactDriftReport = JSON.parse(JSON.stringify(gameplayEvidenceReport('PASS')))
  artifactDriftReport.requiredEvidence.packArtifacts.native.artifactSha256 = '0'.repeat(64)
  await writeModuleFixture(artifactDriftWorkspace)
  await writeEditionRepos(artifactDriftWorkspace)
  await writeCatalogFiles(artifactDriftRoot)
  await writeReports(artifactDriftRoot, {
    gameplayReport: artifactDriftReport,
  })
  const artifactDrift = run(artifactDriftRoot, artifactDriftWorkspace, ['--require-release-ready'])
  assert.equal(artifactDrift.status, 1)
  assert.match(artifactDrift.stdout, /gameplay evidence native artifact artifactSha256 must match edition pack assets/u)

  const thinCheckedRoot = path.join(tmp, 'thin-checked-release-index')
  const thinCheckedWorkspace = path.join(tmp, 'thin-checked-workspace')
  const thinCheckedReport = JSON.parse(JSON.stringify(gameplayEvidenceReport('PASS')))
  delete thinCheckedReport.editions[0].checked.screenshots[0].dimensions
  await writeModuleFixture(thinCheckedWorkspace)
  await writeEditionRepos(thinCheckedWorkspace)
  await writeCatalogFiles(thinCheckedRoot)
  await writeReports(thinCheckedRoot, {
    gameplayReport: thinCheckedReport,
  })
  const thinChecked = run(thinCheckedRoot, thinCheckedWorkspace, ['--require-release-ready'])
  assert.equal(thinChecked.status, 1)
  assert.match(thinChecked.stdout, /gameplay evidence native screenshots\[0\] must record dimensions at least 640x360/u)

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
