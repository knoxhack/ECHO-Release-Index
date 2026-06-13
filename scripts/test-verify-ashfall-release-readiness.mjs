#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'verify-ashfall-release-readiness.mjs')
const sha = 'd'.repeat(64)
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
const zipFixture = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function pngFixture(width = 1280, height = 720) {
  const header = Buffer.alloc(33)
  pngSignature.copy(header, 0)
  header.writeUInt32BE(13, 8)
  header.write('IHDR', 12, 'ascii')
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  header[24] = 8
  header[25] = 6
  return header
}

const tinyPng = pngFixture()

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

async function writeBytes(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value)
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

function artifact(name) {
  return {
    name,
    file: name,
    size: 10,
    sha256: sha,
    url: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0-ashfall-native-edition/${name}`,
    browserDownloadUrl: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0-ashfall-native-edition/${name}`,
    state: 'uploaded',
  }
}

function downloadedAssetBytes(name) {
  if (name.endsWith('.zip')) return zipFixture
  if (name === 'echo-release.json') {
    return Buffer.from(`${JSON.stringify({
      schemaVersion: 'echo.release.fixture.v1',
      modules: [],
    }, null, 2)}\n`, 'utf8')
  }
  if (name.endsWith('.json')) {
    return Buffer.from(`${JSON.stringify({
      schemaVersion: 'echo.pack.fixture.v1',
      id: 'ashfall-native-edition',
    }, null, 2)}\n`, 'utf8')
  }
  return Buffer.from(`${name} downloaded fixture\n`, 'utf8')
}

function report(data = {}) {
  return {
    status: 'PASS',
    generatedAt: '2026-06-11T00:00:00Z',
    summary: {
      dryRunOnly: false,
      blockingDiagnostics: 0,
      diagnosticCount: 0,
    },
    data,
  }
}

async function writeModuleReleaseFixture(workspaceRoot) {
  const moduleIds = [
    'echocore',
    'echoplatformcore',
    'echoadaptercore',
    'echonetcore',
    'echoruntimeguard',
    'echolens',
    'echopresencelink',
    'echoterminal',
    'echoblockworks',
    'echoashfallprotocol',
  ]
  await writeJson(workspaceRoot, 'echo-release.json', {
    schemaVersion: 'echo.module.release.v1',
    modules: moduleIds.map((moduleId) => ({
      moduleId,
      version: '1.0.0',
      artifacts: [
        { kind: 'echo-addon', filename: `${moduleId}-1.0.0.echo-addon`, buildMode: 'compiled-runtime' },
        { kind: 'neoforge', filename: `${moduleId}-1.0.0-neoforge.jar`, buildMode: 'compiled-runtime' },
        { kind: 'standalone', filename: `${moduleId}-1.0.0-standalone.jar`, buildMode: 'compiled-runtime' },
        { kind: 'sources', filename: `${moduleId}-1.0.0-sources.jar` },
      ],
    })),
  })
}

async function writeReleaseReadyFixture(root, workspaceRoot) {
  const nativeRoot = path.join(workspaceRoot, 'ECHO-Native-Platform')
  const assets = [
    artifact('checksums.txt'),
    artifact('echo-release.json'),
    artifact('ashfall-native-edition-alpha-0.1.0.pack.json'),
    artifact('ashfall-native-edition-0.1.0.zip'),
  ]
  const downloadedAssets = []
  for (const asset of assets) {
    const bytes = downloadedAssetBytes(asset.name)
    const assetSha256 = sha256(bytes)
    const localPath = `tmp/ashfall-draft-download/ECHO-Ashfall-Native-Edition/${asset.name}`
    await writeBytes(root, localPath, bytes)
    downloadedAssets.push({
      ...asset,
      size: bytes.length,
      sha256: assetSha256,
      githubDigestSha256: assetSha256,
      apiUrl: `https://api.github.com/repos/knoxhack/ECHO-Ashfall-Native-Edition/releases/assets/${downloadedAssets.length + 1}`,
      state: 'uploaded',
      localPath,
    })
  }
  await writeJson(root, 'modpacks/ashfall-native.json', {
    id: 'ashfall-native-edition',
    kind: 'modpack',
    version: '0.1.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Ashfall-Native-Edition',
    releaseTag: 'v0.1.0-ashfall-native-edition',
    commitSha: 'abc1234',
    artifacts: {
      checksums: assets[0],
      releaseManifest: assets[1],
      manifest: assets[2],
      pack: assets[3],
    },
    dependencies: [],
    compatibility: ['native'],
    trust: 'source-linked',
    validation: 'approved',
  })
  await writeJson(root, 'packs/ashfall-native-edition.json', {
    id: 'ashfall-native-edition',
    releaseReadiness: {
      status: 'approved',
      blockers: [],
    },
    assets,
  })
  await writeModuleReleaseFixture(path.join(root, 'tmp/public-alpha-assets/ECHO-Modules'))
  await writeJson(workspaceRoot, 'ECHO-Native-Platform/reports/echo-native/ashfall/native-code-gate.json', {
    schemaVersion: 'echo.ashfall.native-code-gate.v1',
    status: 'PASS',
    generatedAt: '2026-06-11T00:00:00Z',
    summary: {
      dryRunOnly: false,
      commandExecuted: true,
    },
    data: {
      gradleCheckPassed: true,
      commandExecuted: true,
      exitCode: 0,
    },
  })

  const betaSessionProofs = []
  for (let index = 1; index <= 3; index += 1) {
    const logPath = `fixtures/ashfall/native-public-beta/session-${index}.log`
    const notesPath = `fixtures/ashfall/native-public-beta/session-${index}-notes.md`
    const supportBundlePath = `fixtures/ashfall/native-public-beta/session-${index}-support.zip`
    await writeText(nativeRoot, logPath)
    await writeText(nativeRoot, notesPath)
    await writeBytes(nativeRoot, supportBundlePath, zipFixture)
    betaSessionProofs.push({
      id: `session-${index}`,
      tester: `tester-${index}`,
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T01:00:00Z',
      durationMinutes: 60,
      buildId: 'ashfall-native-0.1.0+fixture',
      artifactSha256: sha,
      logPath,
      notesPath,
      supportBundlePath,
      noCrash: true,
    })
  }
  await writeJson(nativeRoot, 'fixtures/ashfall/native-public-beta/release-manifest.json', {
    schemaVersion: 'echo.ashfall.public-beta.release-manifest.fixture.v1',
    packId: 'ashfall',
    buildId: 'ashfall-native-0.1.0+fixture',
    artifactSha256: sha,
  })
  await writeBytes(nativeRoot, 'fixtures/ashfall/native-public-beta/public-beta-package.zip', zipFixture)
  await writeText(nativeRoot, 'fixtures/ashfall/native-public-beta/support-runbook.md')
  await writeText(nativeRoot, 'fixtures/ashfall/native-public-beta/rollback-plan.md')
  await writeText(nativeRoot, 'fixtures/ashfall/native-public-beta/known-limitations.md')
  await writeText(nativeRoot, 'fixtures/ashfall/native-public-beta/latest.log')
  await writeText(nativeRoot, 'fixtures/ashfall/native-public-beta/crash-review.md')

  await writeJson(workspaceRoot, 'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json', {
    schema: 'echo.native.native_loader_beta_session_proof_matrix.v1',
    generatedAt: '2026-06-11T00:00:00Z',
    generator: 'generate-ashfall-native-public-beta-evidence.mjs',
    packId: 'ashfall',
    status: 'PASS',
    summary: {
      dryRunOnly: false,
      blockingDiagnostics: 0,
      diagnosticCount: 0,
    },
    data: {
      packId: 'ashfall',
      phase: 'phase7_native_public_beta_sessions',
      generatedEvidenceAt: '2026-06-11T00:00:00Z',
      reportOnly: false,
      qualifiedSessionCount: 3,
      targetInternalSessionCount: 3,
      sessionProofs: betaSessionProofs,
      publicBetaOpen: true,
    },
  })
  await writeJson(workspaceRoot, 'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-crash-intake.json', {
    schema: 'echo.native.native_loader_beta_crash_intake.v1',
    generatedAt: '2026-06-11T00:00:00Z',
    generator: 'generate-ashfall-native-public-beta-evidence.mjs',
    packId: 'ashfall',
    status: 'PASS',
    summary: {
      dryRunOnly: false,
      blockingDiagnostics: 0,
      diagnosticCount: 0,
    },
    data: {
      packId: 'ashfall',
      phase: 'phase7_native_public_beta_crash_intake',
      generatedEvidenceAt: '2026-06-11T00:00:00Z',
      reportOnly: false,
      noCrashEvidence: true,
      crashSignalInLatestLog: false,
      crashReportCount: 0,
      latestLog: 'fixtures/ashfall/native-public-beta/latest.log',
      reviewPath: 'fixtures/ashfall/native-public-beta/crash-review.md',
      reviewedAt: '2026-06-11T00:00:00Z',
    },
  })
  await writeJson(workspaceRoot, 'ECHO-Native-Platform/reports/echo-native/ashfall/public-beta-tester-package-readiness.json', {
    schema: 'echo.native.public_beta_tester_package_readiness.v1',
    generatedAt: '2026-06-11T00:00:00Z',
    generator: 'generate-ashfall-native-public-beta-evidence.mjs',
    packId: 'ashfall',
    status: 'PASS',
    summary: {
      dryRunOnly: false,
      blockingDiagnostics: 0,
      diagnosticCount: 0,
    },
    data: {
      packId: 'ashfall',
      phase: 'phase7_public_beta_tester_package',
      generatedEvidenceAt: '2026-06-11T00:00:00Z',
      reportOnly: false,
      releaseCandidate: {
        buildId: 'ashfall-native-0.1.0+fixture',
        artifactSha256: sha,
        releaseManifestPath: 'fixtures/ashfall/native-public-beta/release-manifest.json',
      },
    publicBetaOpen: true,
    publicBetaReady: true,
    testerPackageReady: true,
      testerSafePackageReady: true,
    supportBundleExportReady: true,
      supportBundleLocalOnly: false,
      rollbackReady: true,
      knownLimitationsPublished: true,
      packagePath: 'fixtures/ashfall/native-public-beta/public-beta-package.zip',
      supportRunbookPath: 'fixtures/ashfall/native-public-beta/support-runbook.md',
      rollbackPlanPath: 'fixtures/ashfall/native-public-beta/rollback-plan.md',
      knownLimitationsPath: 'fixtures/ashfall/native-public-beta/known-limitations.md',
    },
  })

  const gameplaySupportingFiles = [
    'fixtures/ashfall/gameplay-qa/evidence/route-verification.md',
    'fixtures/ashfall/gameplay-qa/evidence/ending-verification.md',
    'fixtures/ashfall/gameplay-qa/evidence/first-hour-notes.md',
    'fixtures/ashfall/gameplay-qa/evidence/no-crash-review.md',
  ]
  const gameplayScreenshots = [
    'fixtures/ashfall/gameplay-qa/evidence/screenshots/first-launch.png',
    'fixtures/ashfall/gameplay-qa/evidence/screenshots/server-client-export.png',
  ]
  const gameplayServerLogs = [
    'fixtures/ashfall/gameplay-qa/evidence/logs/dedicated-server.log',
    'fixtures/ashfall/gameplay-qa/evidence/logs/client-export.log',
  ]
  const gameplaySaveSnapshots = [
    'fixtures/ashfall/gameplay-qa/evidence/saves/fresh-world.zip',
    'fixtures/ashfall/gameplay-qa/evidence/saves/reloaded-world.zip',
  ]
  for (const relPath of gameplaySupportingFiles) await writeText(nativeRoot, relPath)
  for (const relPath of gameplayScreenshots) await writeBytes(nativeRoot, relPath, tinyPng)
  for (const relPath of gameplayServerLogs) await writeText(nativeRoot, relPath)
  for (const relPath of gameplaySaveSnapshots) await writeBytes(nativeRoot, relPath, zipFixture)
  await writeJson(nativeRoot, 'reports/echo-native/ashfall/tester-playable-evidence.json', report({
    baselinePlayableEvidence: true,
    playerJoinObserved: true,
    worldSavePresent: true,
    screenshotCount: 2,
  }))
  await writeJson(nativeRoot, 'reports/echo-native/ashfall/minecraft-baseline-playability.json', report({
    baselinePlayable: true,
    minecraftWorldLoaded: true,
    worldSavePresent: true,
  }))
  await writeJson(nativeRoot, 'fixtures/ashfall/gameplay-qa/manual-evidence.json', {
    schemaVersion: 'echo.ashfall.gameplay-qa.manual.v1',
    packId: 'ashfall',
    generatedAt: '2026-06-11T00:00:00Z',
    claims: {
      realClientFirstHourSmoke: true,
      freshWorldCreated: true,
      saveReloadVerified: true,
      routeVerified: true,
      dedicatedServerSmoke: true,
      serverClientExportSmoke: true,
      endingVerified: true,
      noCrashEvidence: true,
    },
    supportingFiles: gameplaySupportingFiles,
    screenshots: gameplayScreenshots,
    serverLogs: gameplayServerLogs,
    saveSnapshots: gameplaySaveSnapshots,
  })
  await writeJson(workspaceRoot, 'ECHO-Native-Platform/fixtures/ashfall/tester-playable-evidence.json', {
    schemaVersion: 'echo.ashfall.gameplay-qa.evidence.v1',
    generatedAt: '2026-06-11T00:00:00Z',
    status: 'PASS',
    summary: {
      dryRunOnly: false,
      blockingDiagnostics: 0,
      diagnosticCount: 0,
      diagnostics: [],
    },
    data: {
      realClientFirstHourSmoke: true,
      freshWorldCreated: true,
      saveReloadVerified: true,
      routeVerified: true,
      dedicatedServerSmoke: true,
      serverClientExportSmoke: true,
      endingVerified: true,
      noCrashEvidence: true,
      testerPlayableReport: 'reports/echo-native/ashfall/tester-playable-evidence.json',
      baselinePlayabilityReport: 'reports/echo-native/ashfall/minecraft-baseline-playability.json',
      crashIntakeReport: 'reports/echo-native/ashfall/native-loader-beta-crash-intake.json',
      manualEvidence: 'fixtures/ashfall/gameplay-qa/manual-evidence.json',
      screenshotCount: 2,
      supportingFiles: gameplaySupportingFiles,
      screenshots: gameplayScreenshots,
      serverLogs: gameplayServerLogs,
      saveSnapshots: gameplaySaveSnapshots,
    },
  })

  const ashfallRoot = path.join(workspaceRoot, 'ECHO-Ashfall-Native-Edition')
  await writeJson(ashfallRoot, 'metadata/official_packs/ashfall.json', {
    version: '1.7.6',
    iconPath: 'metadata/assets/official_packs/ashfall/icon.png',
    bannerPath: 'metadata/assets/official_packs/ashfall/banner.png',
    packCardPath: 'metadata/assets/official_packs/ashfall/pack_card.png',
    showcasePath: 'metadata/assets/official_packs/ashfall/showcase.png',
    screenshotsNeeded: [],
    screenshots: [
      'metadata/assets/official_packs/ashfall/first_launch.png',
      'metadata/assets/official_packs/ashfall/server_export.png',
      'metadata/assets/official_packs/ashfall/route_verification.png',
      'metadata/assets/official_packs/ashfall/ending_verification.png',
    ],
    changelogPath: 'docs/official_packs/ashfall/CHANGELOG_1.7.6.md',
    knownIssuesPath: 'docs/official_packs/ashfall/KNOWN_ISSUES.md',
    releaseNotesPath: 'docs/NATIVE_RELEASE_NOTES.md',
    supportPath: 'docs/SUPPORT.md',
    launcherCard: {
      cardPath: 'metadata/assets/official_packs/ashfall/pack_card.png',
    },
  })
  await writeText(ashfallRoot, 'docs/official_packs/ashfall/CHANGELOG_1.7.6.md')
  await writeText(ashfallRoot, 'docs/official_packs/ashfall/KNOWN_ISSUES.md')
  await writeText(ashfallRoot, 'docs/NATIVE_RELEASE_NOTES.md')
  await writeText(ashfallRoot, 'docs/SUPPORT.md')
  await writeBytes(ashfallRoot, 'metadata/assets/official_packs/ashfall/icon.png', tinyPng)
  await writeBytes(ashfallRoot, 'metadata/assets/official_packs/ashfall/banner.png', tinyPng)
  await writeBytes(ashfallRoot, 'metadata/assets/official_packs/ashfall/pack_card.png', tinyPng)
  await writeBytes(ashfallRoot, 'metadata/assets/official_packs/ashfall/showcase.png', tinyPng)
  await writeBytes(ashfallRoot, 'metadata/assets/official_packs/ashfall/first_launch.png', tinyPng)
  await writeBytes(ashfallRoot, 'metadata/assets/official_packs/ashfall/server_export.png', tinyPng)
  await writeBytes(ashfallRoot, 'metadata/assets/official_packs/ashfall/route_verification.png', tinyPng)
  await writeBytes(ashfallRoot, 'metadata/assets/official_packs/ashfall/ending_verification.png', tinyPng)

  await writeJson(root, 'release-readiness/ashfall-rc-smoke.json', {
    schemaVersion: 'echo.ashfall.rc-smoke.v1',
    status: 'PASS',
    generatedAt: '2026-06-11T00:00:00Z',
    summary: {
      blockingDiagnostics: 0,
      warningCount: 0,
      installedFileCount: 10,
      packFileCount: 10,
      zipEntryCount: 13,
      embeddedChecksumCount: 12,
      warnings: [],
    },
    data: {
      localStagedArtifactSmoke: true,
      draftReleaseDownloaded: true,
      installedFromDownloadedArtifacts: true,
      launcherInstallSmoke: true,
      updateSmoke: true,
      rollbackPlanVerified: true,
      promotedAfterGreen: true,
      artifactSource: 'github-draft-release-download',
      publishBlockedReason: null,
      artifact: {
        file: 'ashfall-native-edition-0.1.0.zip',
        sha256: downloadedAssets.find((asset) => asset.name === 'ashfall-native-edition-0.1.0.zip').sha256,
        size: downloadedAssets.find((asset) => asset.name === 'ashfall-native-edition-0.1.0.zip').size,
      },
      manifest: {
        file: 'ashfall-native-edition-alpha-0.1.0.pack.json',
        sha256: downloadedAssets.find((asset) => asset.name === 'ashfall-native-edition-alpha-0.1.0.pack.json').sha256,
        size: downloadedAssets.find((asset) => asset.name === 'ashfall-native-edition-alpha-0.1.0.pack.json').size,
      },
      releaseManifest: {
        file: 'echo-release.json',
        sha256: downloadedAssets.find((asset) => asset.name === 'echo-release.json').sha256,
        size: downloadedAssets.find((asset) => asset.name === 'echo-release.json').size,
      },
      moduleRelease: {
        moduleCount: 10,
      },
      repairSmoke: {
        ok: true,
      },
      tempCleaned: true,
      draftDownloadEvidence: {
        path: 'release-readiness/ashfall-draft-download.json',
        downloadedAssetCount: 4,
        totalBytes: downloadedAssets.reduce((sum, asset) => sum + asset.size, 0),
      },
    },
  })
  await writeJson(root, 'release-readiness/ashfall-draft-download.json', {
    schemaVersion: 'echo.ashfall.draft-download.v1',
    status: 'PASS',
    generatedAt: '2026-06-11T00:00:00Z',
    summary: {
      blockingDiagnostics: 0,
      downloadedAssetCount: 4,
      totalBytes: downloadedAssets.reduce((sum, asset) => sum + asset.size, 0),
      unlistedAssetCount: 0,
      placeholderAssetCount: 0,
    },
    data: {
      downloadedFromGitHubRelease: true,
      draftReleaseDownloaded: true,
      downloadDir: 'tmp/ashfall-draft-download/ECHO-Ashfall-Native-Edition',
      requiredAssets: [
        'checksums.txt',
        'echo-release.json',
        'ashfall-native-edition-alpha-0.1.0.pack.json',
        'ashfall-native-edition-0.1.0.zip',
      ],
      release: {
        repoName: 'ECHO-Ashfall-Native-Edition',
        tagName: 'v0.1.0-ashfall-native-edition',
        draft: true,
        prerelease: true,
      },
      downloadedAssets,
    },
  })
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-readiness-test-'))
try {
  const incompleteRoot = path.join(tmp, 'release-index-incomplete')
  const incompleteWorkspace = path.join(tmp, 'workspace-incomplete')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(incompleteRoot, 'release-readiness'), { recursive: true })
  await writeJson(incompleteRoot, 'modpacks/ashfall-native.json', {
    id: 'ashfall-native-edition',
    channel: 'alpha',
    sourceRepo: 'knoxhack/ECHO-Ashfall-Native-Edition',
    releaseTag: 'v0.1.0-ashfall-native-edition',
    validation: 'warning',
    artifacts: {
      pack: artifact('echo-native-product-1.0.0-existing-layout-rc.zip'),
      manifest: artifact('manifest.json'),
      checksums: artifact('checksums.txt'),
    },
  })
  await writeJson(incompleteRoot, 'packs/ashfall-native-edition.json', {
    releaseReadiness: {
      status: 'warning',
      blockers: ['fixture blocker'],
    },
    assets: [
      artifact('checksums.txt'),
      artifact('manifest.json'),
      artifact('echo-native-product-1.0.0-existing-layout-rc.zip'),
    ],
  })
  const incomplete = run(incompleteRoot, incompleteWorkspace)
  assert.equal(incomplete.status, 0, `${incomplete.stdout}\n${incomplete.stderr}`)
  assert.match(`${incomplete.stdout}\n${incomplete.stderr}`, /passed with/u)
  assert.match(`${incomplete.stdout}\n${incomplete.stderr}`, /native-artifact-truth/u)

  const incompleteRequired = run(incompleteRoot, incompleteWorkspace, ['--require-release-ready'])
  assert.equal(incompleteRequired.status, 1)
  assert.match(`${incompleteRequired.stdout}\n${incompleteRequired.stderr}`, /failed/u)
  assert.match(`${incompleteRequired.stdout}\n${incompleteRequired.stderr}`, /gameplay-qa/u)

  const readyRoot = path.join(tmp, 'release-index-ready')
  const readyWorkspace = path.join(tmp, 'workspace-ready')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(readyRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(readyRoot, readyWorkspace)
  const ready = run(readyRoot, readyWorkspace, ['--require-release-ready'])
  assert.equal(ready.status, 0, `${ready.stdout}\n${ready.stderr}`)
  assert.match(ready.stdout, /passed/u)

  const thinBetaRoot = path.join(tmp, 'release-index-thin-beta')
  const thinBetaWorkspace = path.join(tmp, 'workspace-thin-beta')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(thinBetaRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(thinBetaRoot, thinBetaWorkspace)
  await writeJson(thinBetaWorkspace, 'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json', report({
    reportOnly: false,
    qualifiedSessionCount: 3,
    targetInternalSessionCount: 3,
    publicBetaOpen: true,
  }))
  const thinBeta = run(thinBetaRoot, thinBetaWorkspace, ['--require-release-ready'])
  assert.equal(thinBeta.status, 1)
  assert.match(`${thinBeta.stdout}\n${thinBeta.stderr}`, /schema expected "echo\.native\.native_loader_beta_session_proof_matrix\.v1"/u)
  assert.match(`${thinBeta.stdout}\n${thinBeta.stderr}`, /data\.sessionProofs expected at least 3 item/u)

  const duplicateSessionRoot = path.join(tmp, 'release-index-duplicate-session')
  const duplicateSessionWorkspace = path.join(tmp, 'workspace-duplicate-session')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(duplicateSessionRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(duplicateSessionRoot, duplicateSessionWorkspace)
  const duplicateSessionReportPath = path.join(
    duplicateSessionWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
  )
  const duplicateSessionReport = JSON.parse(await fs.readFile(duplicateSessionReportPath, 'utf8'))
  duplicateSessionReport.data.sessionProofs[1].id = duplicateSessionReport.data.sessionProofs[0].id
  duplicateSessionReport.data.sessionProofs[1].logPath = duplicateSessionReport.data.sessionProofs[0].logPath
  duplicateSessionReport.data.sessionProofs[1].notesPath = duplicateSessionReport.data.sessionProofs[0].notesPath
  duplicateSessionReport.data.sessionProofs[2].supportBundlePath = duplicateSessionReport.data.sessionProofs[0].supportBundlePath
  duplicateSessionReport.data.sessionProofs[2].durationMinutes = 0
  await writeJson(
    duplicateSessionWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
    duplicateSessionReport,
  )
  const duplicateSession = run(duplicateSessionRoot, duplicateSessionWorkspace, ['--require-release-ready'])
  assert.equal(duplicateSession.status, 1)
  assert.match(`${duplicateSession.stdout}\n${duplicateSession.stderr}`, /data\.sessionProofs\[1\]\.id duplicates/u)
  assert.match(`${duplicateSession.stdout}\n${duplicateSession.stderr}`, /data\.sessionProofs\[1\]\.logPath duplicates/u)
  assert.match(`${duplicateSession.stdout}\n${duplicateSession.stderr}`, /data\.sessionProofs\[1\]\.notesPath duplicates/u)
  assert.match(`${duplicateSession.stdout}\n${duplicateSession.stderr}`, /data\.sessionProofs\[2\]\.supportBundlePath duplicates/u)
  assert.match(`${duplicateSession.stdout}\n${duplicateSession.stderr}`, /durationMinutes expected >= 1/u)

  const mismatchedSessionBuildRoot = path.join(tmp, 'release-index-mismatched-session-build')
  const mismatchedSessionBuildWorkspace = path.join(tmp, 'workspace-mismatched-session-build')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(mismatchedSessionBuildRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(mismatchedSessionBuildRoot, mismatchedSessionBuildWorkspace)
  const mismatchedSessionBuildReportPath = path.join(
    mismatchedSessionBuildWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
  )
  const mismatchedSessionBuildReport = JSON.parse(await fs.readFile(mismatchedSessionBuildReportPath, 'utf8'))
  mismatchedSessionBuildReport.data.sessionProofs[0].buildId = 'ashfall-native-0.1.0+other'
  mismatchedSessionBuildReport.data.sessionProofs[1].artifactSha256 = 'e'.repeat(64)
  await writeJson(
    mismatchedSessionBuildWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
    mismatchedSessionBuildReport,
  )
  const mismatchedSessionBuild = run(mismatchedSessionBuildRoot, mismatchedSessionBuildWorkspace, ['--require-release-ready'])
  assert.equal(mismatchedSessionBuild.status, 1)
  assert.match(`${mismatchedSessionBuild.stdout}\n${mismatchedSessionBuild.stderr}`, /buildId expected to match reports\/echo-native\/ashfall\/public-beta-tester-package-readiness\.json:data\.releaseCandidate\.buildId/u)
  assert.match(`${mismatchedSessionBuild.stdout}\n${mismatchedSessionBuild.stderr}`, /artifactSha256 expected to match reports\/echo-native\/ashfall\/public-beta-tester-package-readiness\.json:data\.releaseCandidate\.artifactSha256/u)

  const emptySessionEvidenceRoot = path.join(tmp, 'release-index-empty-session-evidence')
  const emptySessionEvidenceWorkspace = path.join(tmp, 'workspace-empty-session-evidence')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(emptySessionEvidenceRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(emptySessionEvidenceRoot, emptySessionEvidenceWorkspace)
  await writeText(
    emptySessionEvidenceWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/native-public-beta/session-1-notes.md',
    '',
  )
  const emptySessionEvidence = run(emptySessionEvidenceRoot, emptySessionEvidenceWorkspace, ['--require-release-ready'])
  assert.equal(emptySessionEvidence.status, 1)
  assert.match(`${emptySessionEvidence.stdout}\n${emptySessionEvidence.stderr}`, /data\.sessionProofs\[0\] target size expected >= 1 byte\(s\) but found 0: fixtures\/ashfall\/native-public-beta\/session-1-notes\.md/u)

  const emptyCrashIntakeEvidenceRoot = path.join(tmp, 'release-index-empty-crash-intake-evidence')
  const emptyCrashIntakeEvidenceWorkspace = path.join(tmp, 'workspace-empty-crash-intake-evidence')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(emptyCrashIntakeEvidenceRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(emptyCrashIntakeEvidenceRoot, emptyCrashIntakeEvidenceWorkspace)
  await writeText(
    emptyCrashIntakeEvidenceWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/native-public-beta/latest.log',
    '',
  )
  const emptyCrashIntakeEvidence = run(emptyCrashIntakeEvidenceRoot, emptyCrashIntakeEvidenceWorkspace, ['--require-release-ready'])
  assert.equal(emptyCrashIntakeEvidence.status, 1)
  assert.match(`${emptyCrashIntakeEvidence.stdout}\n${emptyCrashIntakeEvidence.stderr}`, /data\.latestLog target size expected >= 1 byte\(s\) but found 0: fixtures\/ashfall\/native-public-beta\/latest\.log/u)

  const blankCrashPathRoot = path.join(tmp, 'release-index-blank-crash-path')
  const blankCrashPathWorkspace = path.join(tmp, 'workspace-blank-crash-path')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(blankCrashPathRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(blankCrashPathRoot, blankCrashPathWorkspace)
  const blankCrashReportPath = path.join(
    blankCrashPathWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-crash-intake.json',
  )
  const blankCrashReport = JSON.parse(await fs.readFile(blankCrashReportPath, 'utf8'))
  blankCrashReport.data.latestLog = ''
  await writeJson(
    blankCrashPathWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-crash-intake.json',
    blankCrashReport,
  )
  const blankCrashPath = run(blankCrashPathRoot, blankCrashPathWorkspace, ['--require-release-ready'])
  const blankCrashPathOutput = `${blankCrashPath.stdout}\n${blankCrashPath.stderr}`
  assert.equal(blankCrashPath.status, 1)
  assert.equal((blankCrashPathOutput.match(/data\.latestLog must be a relative file path/gu) ?? []).length, 1)

  const missingCrashReviewTimeRoot = path.join(tmp, 'release-index-missing-crash-review-time')
  const missingCrashReviewTimeWorkspace = path.join(tmp, 'workspace-missing-crash-review-time')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(missingCrashReviewTimeRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(missingCrashReviewTimeRoot, missingCrashReviewTimeWorkspace)
  const missingCrashReviewTimePath = path.join(
    missingCrashReviewTimeWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-crash-intake.json',
  )
  const missingCrashReviewTimeReport = JSON.parse(await fs.readFile(missingCrashReviewTimePath, 'utf8'))
  delete missingCrashReviewTimeReport.data.reviewedAt
  await writeJson(
    missingCrashReviewTimeWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-crash-intake.json',
    missingCrashReviewTimeReport,
  )
  const missingCrashReviewTime = run(missingCrashReviewTimeRoot, missingCrashReviewTimeWorkspace, ['--require-release-ready'])
  const missingCrashReviewTimeOutput = `${missingCrashReviewTime.stdout}\n${missingCrashReviewTime.stderr}`
  assert.equal(missingCrashReviewTime.status, 1)
  assert.match(missingCrashReviewTimeOutput, /data\.reviewedAt is missing/u)
  assert.doesNotMatch(missingCrashReviewTimeOutput, /data\.reviewedAt must be an ISO-8601 UTC timestamp/u)
  assert.doesNotMatch(missingCrashReviewTimeOutput, /data\.reviewedAt expected on or after/u)

  const directoryEvidencePathRoot = path.join(tmp, 'release-index-directory-evidence-path')
  const directoryEvidencePathWorkspace = path.join(tmp, 'workspace-directory-evidence-path')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(directoryEvidencePathRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(directoryEvidencePathRoot, directoryEvidencePathWorkspace)
  const packagePathAsDirectory = path.join(
    directoryEvidencePathWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/native-public-beta/public-beta-package.zip',
  )
  await fs.rm(packagePathAsDirectory)
  await fs.mkdir(packagePathAsDirectory, { recursive: true })
  const directoryEvidencePath = run(directoryEvidencePathRoot, directoryEvidencePathWorkspace, ['--require-release-ready'])
  assert.equal(directoryEvidencePath.status, 1)
  assert.match(`${directoryEvidencePath.stdout}\n${directoryEvidencePath.stderr}`, /data\.packagePath target is not a file: fixtures\/ashfall\/native-public-beta\/public-beta-package\.zip/u)

  const emptyPackageEvidenceRoot = path.join(tmp, 'release-index-empty-package-evidence')
  const emptyPackageEvidenceWorkspace = path.join(tmp, 'workspace-empty-package-evidence')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(emptyPackageEvidenceRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(emptyPackageEvidenceRoot, emptyPackageEvidenceWorkspace)
  await writeText(
    emptyPackageEvidenceWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/native-public-beta/support-runbook.md',
    '',
  )
  const emptyPackageEvidence = run(emptyPackageEvidenceRoot, emptyPackageEvidenceWorkspace, ['--require-release-ready'])
  assert.equal(emptyPackageEvidence.status, 1)
  assert.match(`${emptyPackageEvidence.stdout}\n${emptyPackageEvidence.stderr}`, /data\.supportRunbookPath target size expected >= 1 byte\(s\) but found 0: fixtures\/ashfall\/native-public-beta\/support-runbook\.md/u)

  const invalidPackageManifestRoot = path.join(tmp, 'release-index-invalid-package-manifest')
  const invalidPackageManifestWorkspace = path.join(tmp, 'workspace-invalid-package-manifest')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(invalidPackageManifestRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(invalidPackageManifestRoot, invalidPackageManifestWorkspace)
  await writeText(
    invalidPackageManifestWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/native-public-beta/release-manifest.json',
    'not json\n',
  )
  const invalidPackageManifest = run(invalidPackageManifestRoot, invalidPackageManifestWorkspace, ['--require-release-ready'])
  assert.equal(invalidPackageManifest.status, 1)
  assert.match(`${invalidPackageManifest.stdout}\n${invalidPackageManifest.stderr}`, /data\.releaseCandidate\.releaseManifestPath target is not valid JSON: fixtures\/ashfall\/native-public-beta\/release-manifest\.json/u)

  const mismatchedPackageManifestRoot = path.join(tmp, 'release-index-mismatched-package-manifest')
  const mismatchedPackageManifestWorkspace = path.join(tmp, 'workspace-mismatched-package-manifest')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(mismatchedPackageManifestRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(mismatchedPackageManifestRoot, mismatchedPackageManifestWorkspace)
  await writeJson(
    mismatchedPackageManifestWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/native-public-beta/release-manifest.json',
    {
      schemaVersion: 'echo.ashfall.public-beta.release-manifest.fixture.v1',
      packId: 'other-pack',
      buildId: 'ashfall-native-0.1.0+other',
      artifactSha256: 'e'.repeat(64),
    },
  )
  const mismatchedPackageManifest = run(mismatchedPackageManifestRoot, mismatchedPackageManifestWorkspace, ['--require-release-ready'])
  assert.equal(mismatchedPackageManifest.status, 1)
  assert.match(`${mismatchedPackageManifest.stdout}\n${mismatchedPackageManifest.stderr}`, /data\.releaseCandidate\.releaseManifestPath target packId expected "ashfall" but found "other-pack": fixtures\/ashfall\/native-public-beta\/release-manifest\.json/u)
  assert.match(`${mismatchedPackageManifest.stdout}\n${mismatchedPackageManifest.stderr}`, /data\.releaseCandidate\.releaseManifestPath target buildId expected to match data\.releaseCandidate\.buildId: expected "ashfall-native-0\.1\.0\+fixture" but found "ashfall-native-0\.1\.0\+other": fixtures\/ashfall\/native-public-beta\/release-manifest\.json/u)
  assert.match(`${mismatchedPackageManifest.stdout}\n${mismatchedPackageManifest.stderr}`, /data\.releaseCandidate\.releaseManifestPath target artifactSha256 expected to match data\.releaseCandidate\.artifactSha256: expected "d{64}" but found "e{64}": fixtures\/ashfall\/native-public-beta\/release-manifest\.json/u)

  const badPackageZipRoot = path.join(tmp, 'release-index-bad-package-zip')
  const badPackageZipWorkspace = path.join(tmp, 'workspace-bad-package-zip')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(badPackageZipRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(badPackageZipRoot, badPackageZipWorkspace)
  await writeText(
    badPackageZipWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/native-public-beta/public-beta-package.zip',
    'not zip\n',
  )
  const badPackageZip = run(badPackageZipRoot, badPackageZipWorkspace, ['--require-release-ready'])
  assert.equal(badPackageZip.status, 1)
  assert.match(`${badPackageZip.stdout}\n${badPackageZip.stderr}`, /data\.packagePath target is not a ZIP file: fixtures\/ashfall\/native-public-beta\/public-beta-package\.zip/u)

  const mismatchedEvidenceCountsRoot = path.join(tmp, 'release-index-mismatched-evidence-counts')
  const mismatchedEvidenceCountsWorkspace = path.join(tmp, 'workspace-mismatched-evidence-counts')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(mismatchedEvidenceCountsRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(mismatchedEvidenceCountsRoot, mismatchedEvidenceCountsWorkspace)
  const mismatchedCountSessionPath = path.join(
    mismatchedEvidenceCountsWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
  )
  const mismatchedCountSessionReport = JSON.parse(await fs.readFile(mismatchedCountSessionPath, 'utf8'))
  mismatchedCountSessionReport.data.qualifiedSessionCount = 4
  await writeJson(
    mismatchedEvidenceCountsWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
    mismatchedCountSessionReport,
  )
  const mismatchedCountGameplayPath = path.join(
    mismatchedEvidenceCountsWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/tester-playable-evidence.json',
  )
  const mismatchedCountGameplayReport = JSON.parse(await fs.readFile(mismatchedCountGameplayPath, 'utf8'))
  mismatchedCountGameplayReport.data.screenshotCount = 3
  await writeJson(
    mismatchedEvidenceCountsWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/tester-playable-evidence.json',
    mismatchedCountGameplayReport,
  )
  const mismatchedEvidenceCounts = run(mismatchedEvidenceCountsRoot, mismatchedEvidenceCountsWorkspace, ['--require-release-ready'])
  assert.equal(mismatchedEvidenceCounts.status, 1)
  assert.match(`${mismatchedEvidenceCounts.stdout}\n${mismatchedEvidenceCounts.stderr}`, /data\.qualifiedSessionCount expected to match data\.sessionProofs\.length/u)
  assert.match(`${mismatchedEvidenceCounts.stdout}\n${mismatchedEvidenceCounts.stderr}`, /data\.screenshotCount expected to match data\.screenshots\.length/u)

  const missingManualEvidenceRoot = path.join(tmp, 'release-index-missing-manual-evidence')
  const missingManualEvidenceWorkspace = path.join(tmp, 'workspace-missing-manual-evidence')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(missingManualEvidenceRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(missingManualEvidenceRoot, missingManualEvidenceWorkspace)
  await fs.rm(path.join(
    missingManualEvidenceWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/gameplay-qa/manual-evidence.json',
  ))
  const missingManualEvidence = run(missingManualEvidenceRoot, missingManualEvidenceWorkspace, ['--require-release-ready'])
  const missingManualEvidenceOutput = `${missingManualEvidence.stdout}\n${missingManualEvidence.stderr}`
  assert.equal(missingManualEvidence.status, 1)
  assert.match(missingManualEvidenceOutput, /data\.manualEvidence target does not exist: fixtures\/ashfall\/gameplay-qa\/manual-evidence\.json/u)
  assert.doesNotMatch(missingManualEvidenceOutput, /data\.manualEvidence\.claims jsonFilePath target does not exist/u)

  const mismatchedManualClaimsRoot = path.join(tmp, 'release-index-mismatched-manual-claims')
  const mismatchedManualClaimsWorkspace = path.join(tmp, 'workspace-mismatched-manual-claims')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(mismatchedManualClaimsRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(mismatchedManualClaimsRoot, mismatchedManualClaimsWorkspace)
  const mismatchedManualClaimsPath = path.join(
    mismatchedManualClaimsWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/gameplay-qa/manual-evidence.json',
  )
  const mismatchedManualClaims = JSON.parse(await fs.readFile(mismatchedManualClaimsPath, 'utf8'))
  mismatchedManualClaims.claims.routeVerified = false
  mismatchedManualClaims.claims.serverClientExportSmoke = false
  mismatchedManualClaims.screenshots = mismatchedManualClaims.screenshots.slice(1)
  await writeJson(
    mismatchedManualClaimsWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/gameplay-qa/manual-evidence.json',
    mismatchedManualClaims,
  )
  const mismatchedManualClaimResult = run(mismatchedManualClaimsRoot, mismatchedManualClaimsWorkspace, ['--require-release-ready'])
  assert.equal(mismatchedManualClaimResult.status, 1)
  assert.match(`${mismatchedManualClaimResult.stdout}\n${mismatchedManualClaimResult.stderr}`, /data\.routeVerified expected to match fixtures\/ashfall\/gameplay-qa\/manual-evidence\.json:claims\.routeVerified/u)
  assert.match(`${mismatchedManualClaimResult.stdout}\n${mismatchedManualClaimResult.stderr}`, /data\.serverClientExportSmoke expected to match fixtures\/ashfall\/gameplay-qa\/manual-evidence\.json:claims\.serverClientExportSmoke/u)
  assert.match(`${mismatchedManualClaimResult.stdout}\n${mismatchedManualClaimResult.stderr}`, /data\.screenshots expected to match fixtures\/ashfall\/gameplay-qa\/manual-evidence\.json:screenshots/u)

  const duplicateGameplayEvidenceRoot = path.join(tmp, 'release-index-duplicate-gameplay-evidence')
  const duplicateGameplayEvidenceWorkspace = path.join(tmp, 'workspace-duplicate-gameplay-evidence')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(duplicateGameplayEvidenceRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(duplicateGameplayEvidenceRoot, duplicateGameplayEvidenceWorkspace)
  const duplicateGameplayManualPath = path.join(
    duplicateGameplayEvidenceWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/gameplay-qa/manual-evidence.json',
  )
  const duplicateGameplayManual = JSON.parse(await fs.readFile(duplicateGameplayManualPath, 'utf8'))
  duplicateGameplayManual.supportingFiles[2] = duplicateGameplayManual.supportingFiles[0]
  duplicateGameplayManual.screenshots.push(duplicateGameplayManual.screenshots[0])
  duplicateGameplayManual.serverLogs.push(duplicateGameplayManual.serverLogs[0])
  duplicateGameplayManual.saveSnapshots.push(duplicateGameplayManual.saveSnapshots[0])
  await writeJson(
    duplicateGameplayEvidenceWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/gameplay-qa/manual-evidence.json',
    duplicateGameplayManual,
  )
  const duplicateGameplayRollupPath = path.join(
    duplicateGameplayEvidenceWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/tester-playable-evidence.json',
  )
  const duplicateGameplayRollup = JSON.parse(await fs.readFile(duplicateGameplayRollupPath, 'utf8'))
  duplicateGameplayRollup.data.supportingFiles = duplicateGameplayManual.supportingFiles
  duplicateGameplayRollup.data.screenshots = duplicateGameplayManual.screenshots
  duplicateGameplayRollup.data.serverLogs = duplicateGameplayManual.serverLogs
  duplicateGameplayRollup.data.saveSnapshots = duplicateGameplayManual.saveSnapshots
  duplicateGameplayRollup.data.screenshotCount = duplicateGameplayManual.screenshots.length
  await writeJson(
    duplicateGameplayEvidenceWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/tester-playable-evidence.json',
    duplicateGameplayRollup,
  )
  const duplicateGameplayEvidence = run(duplicateGameplayEvidenceRoot, duplicateGameplayEvidenceWorkspace, ['--require-release-ready'])
  assert.equal(duplicateGameplayEvidence.status, 1)
  assert.match(`${duplicateGameplayEvidence.stdout}\n${duplicateGameplayEvidence.stderr}`, /data\.supportingFiles\[2\]\.\(item\) duplicates/u)
  assert.match(`${duplicateGameplayEvidence.stdout}\n${duplicateGameplayEvidence.stderr}`, /data\.screenshots\[2\]\.\(item\) duplicates/u)
  assert.match(`${duplicateGameplayEvidence.stdout}\n${duplicateGameplayEvidence.stderr}`, /data\.serverLogs\[2\]\.\(item\) duplicates/u)
  assert.match(`${duplicateGameplayEvidence.stdout}\n${duplicateGameplayEvidence.stderr}`, /data\.saveSnapshots\[2\]\.\(item\) duplicates/u)

  const emptyGameplayEvidenceRoot = path.join(tmp, 'release-index-empty-gameplay-evidence')
  const emptyGameplayEvidenceWorkspace = path.join(tmp, 'workspace-empty-gameplay-evidence')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(emptyGameplayEvidenceRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(emptyGameplayEvidenceRoot, emptyGameplayEvidenceWorkspace)
  await writeText(
    emptyGameplayEvidenceWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/gameplay-qa/evidence/route-verification.md',
    '',
  )
  const emptyGameplayEvidence = run(emptyGameplayEvidenceRoot, emptyGameplayEvidenceWorkspace, ['--require-release-ready'])
  assert.equal(emptyGameplayEvidence.status, 1)
  assert.match(`${emptyGameplayEvidence.stdout}\n${emptyGameplayEvidence.stderr}`, /data\.supportingFiles\[0\] target size expected >= 1 byte\(s\) but found 0: fixtures\/ashfall\/gameplay-qa\/evidence\/route-verification\.md/u)

  const emptyGameplayReportPointerRoot = path.join(tmp, 'release-index-empty-gameplay-report-pointer')
  const emptyGameplayReportPointerWorkspace = path.join(tmp, 'workspace-empty-gameplay-report-pointer')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(emptyGameplayReportPointerRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(emptyGameplayReportPointerRoot, emptyGameplayReportPointerWorkspace)
  await writeText(
    emptyGameplayReportPointerWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/tester-playable-evidence.json',
    '',
  )
  const emptyGameplayReportPointer = run(emptyGameplayReportPointerRoot, emptyGameplayReportPointerWorkspace, ['--require-release-ready'])
  assert.equal(emptyGameplayReportPointer.status, 1)
  assert.match(`${emptyGameplayReportPointer.stdout}\n${emptyGameplayReportPointer.stderr}`, /data\.testerPlayableReport target size expected >= 1 byte\(s\) but found 0: reports\/echo-native\/ashfall\/tester-playable-evidence\.json/u)

  const invalidGameplayReportPointerRoot = path.join(tmp, 'release-index-invalid-gameplay-report-pointer')
  const invalidGameplayReportPointerWorkspace = path.join(tmp, 'workspace-invalid-gameplay-report-pointer')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(invalidGameplayReportPointerRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(invalidGameplayReportPointerRoot, invalidGameplayReportPointerWorkspace)
  await writeText(
    invalidGameplayReportPointerWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/tester-playable-evidence.json',
    'not json\n',
  )
  const invalidGameplayReportPointer = run(invalidGameplayReportPointerRoot, invalidGameplayReportPointerWorkspace, ['--require-release-ready'])
  assert.equal(invalidGameplayReportPointer.status, 1)
  assert.match(`${invalidGameplayReportPointer.stdout}\n${invalidGameplayReportPointer.stderr}`, /data\.testerPlayableReport target is not valid JSON: reports\/echo-native\/ashfall\/tester-playable-evidence\.json/u)

  const failedGameplaySourceReportRoot = path.join(tmp, 'release-index-failed-gameplay-source-report')
  const failedGameplaySourceReportWorkspace = path.join(tmp, 'workspace-failed-gameplay-source-report')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(failedGameplaySourceReportRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(failedGameplaySourceReportRoot, failedGameplaySourceReportWorkspace)
  const failedGameplaySourceReportPath = path.join(
    failedGameplaySourceReportWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/tester-playable-evidence.json',
  )
  const failedGameplaySourceReport = JSON.parse(await fs.readFile(failedGameplaySourceReportPath, 'utf8'))
  failedGameplaySourceReport.status = 'FAILED'
  failedGameplaySourceReport.summary.dryRunOnly = true
  failedGameplaySourceReport.summary.blockingDiagnostics = 1
  await writeJson(
    failedGameplaySourceReportWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/tester-playable-evidence.json',
    failedGameplaySourceReport,
  )
  const failedGameplaySource = run(failedGameplaySourceReportRoot, failedGameplaySourceReportWorkspace, ['--require-release-ready'])
  assert.equal(failedGameplaySource.status, 1)
  assert.match(`${failedGameplaySource.stdout}\n${failedGameplaySource.stderr}`, /data\.testerPlayableReport target status expected one of "PASS", "PASS_WITH_WARNINGS" but found "FAILED": reports\/echo-native\/ashfall\/tester-playable-evidence\.json/u)
  assert.match(`${failedGameplaySource.stdout}\n${failedGameplaySource.stderr}`, /data\.testerPlayableReport target summary\.dryRunOnly expected false but found true: reports\/echo-native\/ashfall\/tester-playable-evidence\.json/u)
  assert.match(`${failedGameplaySource.stdout}\n${failedGameplaySource.stderr}`, /data\.testerPlayableReport target summary\.blockingDiagnostics expected 0 but found 1: reports\/echo-native\/ashfall\/tester-playable-evidence\.json/u)

  const failedRollupSkipsSourceReportRoot = path.join(tmp, 'release-index-failed-rollup-skips-source-report')
  const failedRollupSkipsSourceReportWorkspace = path.join(tmp, 'workspace-failed-rollup-skips-source-report')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(failedRollupSkipsSourceReportRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(failedRollupSkipsSourceReportRoot, failedRollupSkipsSourceReportWorkspace)
  const failedRollupReportPath = path.join(
    failedRollupSkipsSourceReportWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/tester-playable-evidence.json',
  )
  const failedRollupReport = JSON.parse(await fs.readFile(failedRollupReportPath, 'utf8'))
  failedRollupReport.status = 'FAILED'
  await writeJson(
    failedRollupSkipsSourceReportWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/tester-playable-evidence.json',
    failedRollupReport,
  )
  const failedRollupSourceReportPath = path.join(
    failedRollupSkipsSourceReportWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/tester-playable-evidence.json',
  )
  const failedRollupSourceReport = JSON.parse(await fs.readFile(failedRollupSourceReportPath, 'utf8'))
  failedRollupSourceReport.status = 'FAILED'
  failedRollupSourceReport.summary.dryRunOnly = true
  failedRollupSourceReport.summary.blockingDiagnostics = 1
  await writeJson(
    failedRollupSkipsSourceReportWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/tester-playable-evidence.json',
    failedRollupSourceReport,
  )
  const failedRollupSkipsSource = run(failedRollupSkipsSourceReportRoot, failedRollupSkipsSourceReportWorkspace, ['--require-release-ready'])
  const failedRollupSkipsSourceOutput = `${failedRollupSkipsSource.stdout}\n${failedRollupSkipsSource.stderr}`
  assert.equal(failedRollupSkipsSource.status, 1)
  assert.match(failedRollupSkipsSourceOutput, /phase 8 gameplay-qa .*status expected one of "PASS", "PASS_WITH_WARNINGS" but found "FAILED"/u)
  assert.doesNotMatch(failedRollupSkipsSourceOutput, /data\.testerPlayableReport target status expected/u)

  const badSaveSnapshotZipRoot = path.join(tmp, 'release-index-bad-save-snapshot-zip')
  const badSaveSnapshotZipWorkspace = path.join(tmp, 'workspace-bad-save-snapshot-zip')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(badSaveSnapshotZipRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(badSaveSnapshotZipRoot, badSaveSnapshotZipWorkspace)
  await writeText(
    badSaveSnapshotZipWorkspace,
    'ECHO-Native-Platform/fixtures/ashfall/gameplay-qa/evidence/saves/fresh-world.zip',
    'not zip\n',
  )
  const badSaveSnapshotZip = run(badSaveSnapshotZipRoot, badSaveSnapshotZipWorkspace, ['--require-release-ready'])
  assert.equal(badSaveSnapshotZip.status, 1)
  assert.match(`${badSaveSnapshotZip.stdout}\n${badSaveSnapshotZip.stderr}`, /data\.saveSnapshots\[0\] target is not a ZIP file: fixtures\/ashfall\/gameplay-qa\/evidence\/saves\/fresh-world\.zip/u)

  const staleTimestampRoot = path.join(tmp, 'release-index-stale-timestamp')
  const staleTimestampWorkspace = path.join(tmp, 'workspace-stale-timestamp')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(staleTimestampRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(staleTimestampRoot, staleTimestampWorkspace)
  const staleSessionReportPath = path.join(
    staleTimestampWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
  )
  const staleSessionReport = JSON.parse(await fs.readFile(staleSessionReportPath, 'utf8'))
  staleSessionReport.data.sessionProofs[0].startedAt = '2026-05-31T23:59:59Z'
  await writeJson(
    staleTimestampWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
    staleSessionReport,
  )
  const staleRcSmoke = JSON.parse(await fs.readFile(path.join(staleTimestampRoot, 'release-readiness/ashfall-rc-smoke.json'), 'utf8'))
  staleRcSmoke.generatedAt = '2026-06-11'
  await writeJson(staleTimestampRoot, 'release-readiness/ashfall-rc-smoke.json', staleRcSmoke)
  const staleTimestamp = run(staleTimestampRoot, staleTimestampWorkspace, ['--require-release-ready'])
  assert.equal(staleTimestamp.status, 1)
  assert.match(`${staleTimestamp.stdout}\n${staleTimestamp.stderr}`, /startedAt expected on or after 2026-06-01T00:00:00Z/u)
  assert.match(`${staleTimestamp.stdout}\n${staleTimestamp.stderr}`, /generatedAt must be an ISO-8601 UTC timestamp/u)

  const reversedSessionRoot = path.join(tmp, 'release-index-reversed-session')
  const reversedSessionWorkspace = path.join(tmp, 'workspace-reversed-session')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(reversedSessionRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(reversedSessionRoot, reversedSessionWorkspace)
  const reversedSessionReportPath = path.join(
    reversedSessionWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
  )
  const reversedSessionReport = JSON.parse(await fs.readFile(reversedSessionReportPath, 'utf8'))
  reversedSessionReport.data.sessionProofs[0].startedAt = '2026-06-11T02:00:00Z'
  reversedSessionReport.data.sessionProofs[0].endedAt = '2026-06-11T01:00:00Z'
  await writeJson(
    reversedSessionWorkspace,
    'ECHO-Native-Platform/reports/echo-native/ashfall/native-loader-beta-session-proof-matrix.json',
    reversedSessionReport,
  )
  const reversedSession = run(reversedSessionRoot, reversedSessionWorkspace, ['--require-release-ready'])
  assert.equal(reversedSession.status, 1)
  assert.match(`${reversedSession.stdout}\n${reversedSession.stderr}`, /endedAt expected on or after startedAt/u)

  const thinGameplayRoot = path.join(tmp, 'release-index-thin-gameplay')
  const thinGameplayWorkspace = path.join(tmp, 'workspace-thin-gameplay')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(thinGameplayRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(thinGameplayRoot, thinGameplayWorkspace)
  await writeJson(thinGameplayWorkspace, 'ECHO-Native-Platform/fixtures/ashfall/tester-playable-evidence.json', report({
    realClientFirstHourSmoke: true,
    freshWorldCreated: true,
    saveReloadVerified: true,
    routeVerified: true,
    dedicatedServerSmoke: true,
    serverClientExportSmoke: true,
    endingVerified: true,
    noCrashEvidence: true,
  }))
  const thinGameplay = run(thinGameplayRoot, thinGameplayWorkspace, ['--require-release-ready'])
  assert.equal(thinGameplay.status, 1)
  assert.match(`${thinGameplay.stdout}\n${thinGameplay.stderr}`, /schemaVersion expected "echo\.ashfall\.gameplay-qa\.evidence\.v1"/u)
  assert.match(`${thinGameplay.stdout}\n${thinGameplay.stderr}`, /data\.screenshots expected at least 2 item/u)

  const staleSmokeRoot = path.join(tmp, 'release-index-stale-smoke')
  const staleSmokeWorkspace = path.join(tmp, 'workspace-stale-smoke')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(staleSmokeRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(staleSmokeRoot, staleSmokeWorkspace)
  await writeJson(staleSmokeRoot, 'release-readiness/ashfall-rc-smoke.json', {
    status: 'PASS',
    generatedAt: '2026-06-11T00:00:00Z',
    data: {
      draftReleaseDownloaded: true,
      installedFromDownloadedArtifacts: true,
      launcherInstallSmoke: true,
      updateSmoke: true,
      rollbackPlanVerified: true,
      promotedAfterGreen: true,
    },
  })
  const staleSmoke = run(staleSmokeRoot, staleSmokeWorkspace, ['--require-release-ready'])
  assert.equal(staleSmoke.status, 1)
  assert.match(`${staleSmoke.stdout}\n${staleSmoke.stderr}`, /schemaVersion expected "echo\.ashfall\.rc-smoke\.v1"/u)
  assert.match(`${staleSmoke.stdout}\n${staleSmoke.stderr}`, /data\.artifactSource expected "github-draft-release-download"/u)

  const mismatchedSmokeAssetRoot = path.join(tmp, 'release-index-mismatched-smoke-asset')
  const mismatchedSmokeAssetWorkspace = path.join(tmp, 'workspace-mismatched-smoke-asset')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(mismatchedSmokeAssetRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(mismatchedSmokeAssetRoot, mismatchedSmokeAssetWorkspace)
  const mismatchedSmokePath = path.join(mismatchedSmokeAssetRoot, 'release-readiness/ashfall-rc-smoke.json')
  const mismatchedSmoke = JSON.parse(await fs.readFile(mismatchedSmokePath, 'utf8'))
  mismatchedSmoke.data.artifact.sha256 = '0'.repeat(64)
  await writeJson(mismatchedSmokeAssetRoot, 'release-readiness/ashfall-rc-smoke.json', mismatchedSmoke)
  const mismatchedSmokeAsset = run(mismatchedSmokeAssetRoot, mismatchedSmokeAssetWorkspace, ['--require-release-ready'])
  assert.equal(mismatchedSmokeAsset.status, 1)
  assert.match(`${mismatchedSmokeAsset.stdout}\n${mismatchedSmokeAsset.stderr}`, /data\.artifact\.sha256 expected to match release-readiness\/ashfall-draft-download\.json/u)

  const mismatchedSmokeCountRoot = path.join(tmp, 'release-index-mismatched-smoke-count')
  const mismatchedSmokeCountWorkspace = path.join(tmp, 'workspace-mismatched-smoke-count')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(mismatchedSmokeCountRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(mismatchedSmokeCountRoot, mismatchedSmokeCountWorkspace)
  const mismatchedSmokeCountPath = path.join(mismatchedSmokeCountRoot, 'release-readiness/ashfall-rc-smoke.json')
  const mismatchedSmokeCount = JSON.parse(await fs.readFile(mismatchedSmokeCountPath, 'utf8'))
  mismatchedSmokeCount.data.draftDownloadEvidence.downloadedAssetCount = 3
  await writeJson(mismatchedSmokeCountRoot, 'release-readiness/ashfall-rc-smoke.json', mismatchedSmokeCount)
  const mismatchedSmokeCountResult = run(mismatchedSmokeCountRoot, mismatchedSmokeCountWorkspace, ['--require-release-ready'])
  assert.equal(mismatchedSmokeCountResult.status, 1)
  assert.match(`${mismatchedSmokeCountResult.stdout}\n${mismatchedSmokeCountResult.stderr}`, /data\.draftDownloadEvidence\.downloadedAssetCount expected to match release-readiness\/ashfall-draft-download\.json:summary\.downloadedAssetCount/u)

  const mismatchedSmokeTotalRoot = path.join(tmp, 'release-index-mismatched-smoke-total')
  const mismatchedSmokeTotalWorkspace = path.join(tmp, 'workspace-mismatched-smoke-total')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(mismatchedSmokeTotalRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(mismatchedSmokeTotalRoot, mismatchedSmokeTotalWorkspace)
  const mismatchedSmokeTotalPath = path.join(mismatchedSmokeTotalRoot, 'release-readiness/ashfall-rc-smoke.json')
  const mismatchedSmokeTotal = JSON.parse(await fs.readFile(mismatchedSmokeTotalPath, 'utf8'))
  mismatchedSmokeTotal.data.draftDownloadEvidence.totalBytes += 1
  await writeJson(mismatchedSmokeTotalRoot, 'release-readiness/ashfall-rc-smoke.json', mismatchedSmokeTotal)
  const mismatchedSmokeTotalResult = run(mismatchedSmokeTotalRoot, mismatchedSmokeTotalWorkspace, ['--require-release-ready'])
  assert.equal(mismatchedSmokeTotalResult.status, 1)
  assert.match(`${mismatchedSmokeTotalResult.stdout}\n${mismatchedSmokeTotalResult.stderr}`, /data\.draftDownloadEvidence\.totalBytes expected to match release-readiness\/ashfall-draft-download\.json:summary\.totalBytes/u)

  const missingSmokeDraftEvidenceRoot = path.join(tmp, 'release-index-missing-smoke-draft-evidence')
  const missingSmokeDraftEvidenceWorkspace = path.join(tmp, 'workspace-missing-smoke-draft-evidence')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(missingSmokeDraftEvidenceRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(missingSmokeDraftEvidenceRoot, missingSmokeDraftEvidenceWorkspace)
  const missingSmokeDraftEvidencePath = path.join(missingSmokeDraftEvidenceRoot, 'release-readiness/ashfall-rc-smoke.json')
  const missingSmokeDraftEvidence = JSON.parse(await fs.readFile(missingSmokeDraftEvidencePath, 'utf8'))
  missingSmokeDraftEvidence.data.draftDownloadEvidence = null
  await writeJson(missingSmokeDraftEvidenceRoot, 'release-readiness/ashfall-rc-smoke.json', missingSmokeDraftEvidence)
  const missingSmokeDraftEvidenceResult = run(missingSmokeDraftEvidenceRoot, missingSmokeDraftEvidenceWorkspace, ['--require-release-ready'])
  const missingSmokeDraftEvidenceOutput = `${missingSmokeDraftEvidenceResult.stdout}\n${missingSmokeDraftEvidenceResult.stderr}`
  assert.equal(missingSmokeDraftEvidenceResult.status, 1)
  assert.match(missingSmokeDraftEvidenceOutput, /data\.draftDownloadEvidence\.path expected "release-readiness\/ashfall-draft-download\.json" but found \(missing\)/u)
  assert.doesNotMatch(missingSmokeDraftEvidenceOutput, /data\.draftDownloadEvidence\.downloadedAssetCount expected 4/u)
  assert.doesNotMatch(missingSmokeDraftEvidenceOutput, /data\.draftDownloadEvidence\.downloadedAssetCount expected to match release-readiness\/ashfall-draft-download\.json/u)

  const dirtySmokeDraftEvidenceRoot = path.join(tmp, 'release-index-dirty-smoke-draft-evidence')
  const dirtySmokeDraftEvidenceWorkspace = path.join(tmp, 'workspace-dirty-smoke-draft-evidence')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(dirtySmokeDraftEvidenceRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(dirtySmokeDraftEvidenceRoot, dirtySmokeDraftEvidenceWorkspace)
  const dirtySmokeDraftEvidencePath = path.join(dirtySmokeDraftEvidenceRoot, 'release-readiness/ashfall-draft-download.json')
  const dirtySmokeDraftEvidence = JSON.parse(await fs.readFile(dirtySmokeDraftEvidencePath, 'utf8'))
  dirtySmokeDraftEvidence.status = 'FAILED'
  dirtySmokeDraftEvidence.summary.blockingDiagnostics = 1
  dirtySmokeDraftEvidence.summary.unlistedAssetCount = 1
  dirtySmokeDraftEvidence.summary.placeholderAssetCount = 1
  await writeJson(dirtySmokeDraftEvidenceRoot, 'release-readiness/ashfall-draft-download.json', dirtySmokeDraftEvidence)
  const dirtySmokeDraftEvidenceResult = run(dirtySmokeDraftEvidenceRoot, dirtySmokeDraftEvidenceWorkspace, ['--require-release-ready'])
  assert.equal(dirtySmokeDraftEvidenceResult.status, 1)
  assert.match(`${dirtySmokeDraftEvidenceResult.stdout}\n${dirtySmokeDraftEvidenceResult.stderr}`, /data\.draftDownloadEvidence\.path target status expected "PASS" but found "FAILED": release-readiness\/ashfall-draft-download\.json/u)
  assert.match(`${dirtySmokeDraftEvidenceResult.stdout}\n${dirtySmokeDraftEvidenceResult.stderr}`, /data\.draftDownloadEvidence\.path target summary\.blockingDiagnostics expected 0 but found 1: release-readiness\/ashfall-draft-download\.json/u)
  assert.match(`${dirtySmokeDraftEvidenceResult.stdout}\n${dirtySmokeDraftEvidenceResult.stderr}`, /data\.draftDownloadEvidence\.path target summary\.unlistedAssetCount expected 0 but found 1: release-readiness\/ashfall-draft-download\.json/u)
  assert.match(`${dirtySmokeDraftEvidenceResult.stdout}\n${dirtySmokeDraftEvidenceResult.stderr}`, /data\.draftDownloadEvidence\.path target summary\.placeholderAssetCount expected 0 but found 1: release-readiness\/ashfall-draft-download\.json/u)

  const tamperedDownloadRoot = path.join(tmp, 'release-index-tampered-download')
  const tamperedDownloadWorkspace = path.join(tmp, 'workspace-tampered-download')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(tamperedDownloadRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(tamperedDownloadRoot, tamperedDownloadWorkspace)
  await writeText(
    tamperedDownloadRoot,
    'tmp/ashfall-draft-download/ECHO-Ashfall-Native-Edition/checksums.txt',
    'tampered\n',
  )
  const tamperedDownload = run(tamperedDownloadRoot, tamperedDownloadWorkspace, ['--require-release-ready'])
  assert.equal(tamperedDownload.status, 1)
  assert.match(`${tamperedDownload.stdout}\n${tamperedDownload.stderr}`, /SHA-256 mismatch/u)

  const wrongDownloadSizeRoot = path.join(tmp, 'release-index-wrong-download-size')
  const wrongDownloadSizeWorkspace = path.join(tmp, 'workspace-wrong-download-size')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(wrongDownloadSizeRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(wrongDownloadSizeRoot, wrongDownloadSizeWorkspace)
  const wrongDownloadSizePath = path.join(wrongDownloadSizeRoot, 'release-readiness/ashfall-draft-download.json')
  const wrongDownloadSizeReport = JSON.parse(await fs.readFile(wrongDownloadSizePath, 'utf8'))
  wrongDownloadSizeReport.data.downloadedAssets[0].size += 1
  await writeJson(wrongDownloadSizeRoot, 'release-readiness/ashfall-draft-download.json', wrongDownloadSizeReport)
  const wrongDownloadSize = run(wrongDownloadSizeRoot, wrongDownloadSizeWorkspace, ['--require-release-ready'])
  assert.equal(wrongDownloadSize.status, 1)
  assert.match(`${wrongDownloadSize.stdout}\n${wrongDownloadSize.stderr}`, /size mismatch/u)

  const wrongDownloadCountRoot = path.join(tmp, 'release-index-wrong-download-count')
  const wrongDownloadCountWorkspace = path.join(tmp, 'workspace-wrong-download-count')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(wrongDownloadCountRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(wrongDownloadCountRoot, wrongDownloadCountWorkspace)
  const wrongDownloadCountPath = path.join(wrongDownloadCountRoot, 'release-readiness/ashfall-draft-download.json')
  const wrongDownloadCountReport = JSON.parse(await fs.readFile(wrongDownloadCountPath, 'utf8'))
  wrongDownloadCountReport.data.downloadedAssets.pop()
  await writeJson(wrongDownloadCountRoot, 'release-readiness/ashfall-draft-download.json', wrongDownloadCountReport)
  const wrongDownloadCount = run(wrongDownloadCountRoot, wrongDownloadCountWorkspace, ['--require-release-ready'])
  assert.equal(wrongDownloadCount.status, 1)
  assert.match(`${wrongDownloadCount.stdout}\n${wrongDownloadCount.stderr}`, /summary\.downloadedAssetCount expected to match data\.downloadedAssets\.length/u)

  const missingDownloadAssetsRoot = path.join(tmp, 'release-index-missing-download-assets')
  const missingDownloadAssetsWorkspace = path.join(tmp, 'workspace-missing-download-assets')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(missingDownloadAssetsRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(missingDownloadAssetsRoot, missingDownloadAssetsWorkspace)
  const missingDownloadAssetsPath = path.join(missingDownloadAssetsRoot, 'release-readiness/ashfall-draft-download.json')
  const missingDownloadAssetsReport = JSON.parse(await fs.readFile(missingDownloadAssetsPath, 'utf8'))
  delete missingDownloadAssetsReport.data.downloadedAssets
  await writeJson(missingDownloadAssetsRoot, 'release-readiness/ashfall-draft-download.json', missingDownloadAssetsReport)
  const missingDownloadAssets = run(missingDownloadAssetsRoot, missingDownloadAssetsWorkspace, ['--require-release-ready'])
  const missingDownloadAssetsOutput = `${missingDownloadAssets.stdout}\n${missingDownloadAssets.stderr}`
  assert.equal(missingDownloadAssets.status, 1)
  assert.match(missingDownloadAssetsOutput, /data\.downloadedAssets expected at least 4 item\(s\) but found \(missing\)/u)
  assert.doesNotMatch(missingDownloadAssetsOutput, /summary\.downloadedAssetCount data\.downloadedAssets must be an array/u)
  assert.doesNotMatch(missingDownloadAssetsOutput, /data\.downloadedAssets must be an array/u)

  const wrongRequiredAssetsRoot = path.join(tmp, 'release-index-wrong-required-assets')
  const wrongRequiredAssetsWorkspace = path.join(tmp, 'workspace-wrong-required-assets')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(wrongRequiredAssetsRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(wrongRequiredAssetsRoot, wrongRequiredAssetsWorkspace)
  const wrongRequiredAssetsPath = path.join(wrongRequiredAssetsRoot, 'release-readiness/ashfall-draft-download.json')
  const wrongRequiredAssetsReport = JSON.parse(await fs.readFile(wrongRequiredAssetsPath, 'utf8'))
  wrongRequiredAssetsReport.data.requiredAssets = wrongRequiredAssetsReport.data.requiredAssets.filter((name) => name !== 'checksums.txt')
  wrongRequiredAssetsReport.data.requiredAssets.push('manifest.json')
  await writeJson(wrongRequiredAssetsRoot, 'release-readiness/ashfall-draft-download.json', wrongRequiredAssetsReport)
  const wrongRequiredAssets = run(wrongRequiredAssetsRoot, wrongRequiredAssetsWorkspace, ['--require-release-ready'])
  assert.equal(wrongRequiredAssets.status, 1)
  assert.match(`${wrongRequiredAssets.stdout}\n${wrongRequiredAssets.stderr}`, /data\.requiredAssets does not contain "checksums\.txt"/u)

  const duplicateRequiredAssetsRoot = path.join(tmp, 'release-index-duplicate-required-assets')
  const duplicateRequiredAssetsWorkspace = path.join(tmp, 'workspace-duplicate-required-assets')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(duplicateRequiredAssetsRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(duplicateRequiredAssetsRoot, duplicateRequiredAssetsWorkspace)
  const duplicateRequiredAssetsPath = path.join(duplicateRequiredAssetsRoot, 'release-readiness/ashfall-draft-download.json')
  const duplicateRequiredAssetsReport = JSON.parse(await fs.readFile(duplicateRequiredAssetsPath, 'utf8'))
  duplicateRequiredAssetsReport.data.requiredAssets.push(duplicateRequiredAssetsReport.data.requiredAssets[0])
  await writeJson(duplicateRequiredAssetsRoot, 'release-readiness/ashfall-draft-download.json', duplicateRequiredAssetsReport)
  const duplicateRequiredAssets = run(duplicateRequiredAssetsRoot, duplicateRequiredAssetsWorkspace, ['--require-release-ready'])
  assert.equal(duplicateRequiredAssets.status, 1)
  assert.match(`${duplicateRequiredAssets.stdout}\n${duplicateRequiredAssets.stderr}`, /data\.requiredAssets\[4\]\.\(item\) duplicates "checksums\.txt"/u)

  const mismatchedRequiredDownloadSetRoot = path.join(tmp, 'release-index-mismatched-required-download-set')
  const mismatchedRequiredDownloadSetWorkspace = path.join(tmp, 'workspace-mismatched-required-download-set')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(mismatchedRequiredDownloadSetRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(mismatchedRequiredDownloadSetRoot, mismatchedRequiredDownloadSetWorkspace)
  const mismatchedRequiredDownloadSetPath = path.join(mismatchedRequiredDownloadSetRoot, 'release-readiness/ashfall-draft-download.json')
  const mismatchedRequiredDownloadSetReport = JSON.parse(await fs.readFile(mismatchedRequiredDownloadSetPath, 'utf8'))
  const wrongPackName = 'ashfall-native-edition-beta-0.1.0.pack.json'
  const packAsset = mismatchedRequiredDownloadSetReport.data.downloadedAssets.find((asset) => asset.name === 'ashfall-native-edition-alpha-0.1.0.pack.json')
  const oldPackPath = packAsset.localPath
  const newPackPath = oldPackPath.replace('ashfall-native-edition-alpha-0.1.0.pack.json', wrongPackName)
  await fs.copyFile(path.join(mismatchedRequiredDownloadSetRoot, oldPackPath), path.join(mismatchedRequiredDownloadSetRoot, newPackPath))
  packAsset.name = wrongPackName
  packAsset.file = wrongPackName
  packAsset.localPath = newPackPath
  packAsset.browserDownloadUrl = `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0-ashfall-native-edition/${wrongPackName}`
  await writeJson(mismatchedRequiredDownloadSetRoot, 'release-readiness/ashfall-draft-download.json', mismatchedRequiredDownloadSetReport)
  const mismatchedRequiredDownloadSetSmokePath = path.join(mismatchedRequiredDownloadSetRoot, 'release-readiness/ashfall-rc-smoke.json')
  const mismatchedRequiredDownloadSetSmoke = JSON.parse(await fs.readFile(mismatchedRequiredDownloadSetSmokePath, 'utf8'))
  mismatchedRequiredDownloadSetSmoke.data.manifest.file = wrongPackName
  await writeJson(mismatchedRequiredDownloadSetRoot, 'release-readiness/ashfall-rc-smoke.json', mismatchedRequiredDownloadSetSmoke)
  const mismatchedRequiredDownloadSet = run(mismatchedRequiredDownloadSetRoot, mismatchedRequiredDownloadSetWorkspace, ['--require-release-ready'])
  assert.equal(mismatchedRequiredDownloadSet.status, 1)
  assert.match(`${mismatchedRequiredDownloadSet.stdout}\n${mismatchedRequiredDownloadSet.stderr}`, /data\.downloadedAssets\.name expected to match set data\.requiredAssets/u)

  const wrongDownloadTotalBytesRoot = path.join(tmp, 'release-index-wrong-download-total-bytes')
  const wrongDownloadTotalBytesWorkspace = path.join(tmp, 'workspace-wrong-download-total-bytes')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(wrongDownloadTotalBytesRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(wrongDownloadTotalBytesRoot, wrongDownloadTotalBytesWorkspace)
  const wrongDownloadTotalBytesPath = path.join(wrongDownloadTotalBytesRoot, 'release-readiness/ashfall-draft-download.json')
  const wrongDownloadTotalBytesReport = JSON.parse(await fs.readFile(wrongDownloadTotalBytesPath, 'utf8'))
  wrongDownloadTotalBytesReport.summary.totalBytes += 1
  await writeJson(wrongDownloadTotalBytesRoot, 'release-readiness/ashfall-draft-download.json', wrongDownloadTotalBytesReport)
  const wrongDownloadTotalBytes = run(wrongDownloadTotalBytesRoot, wrongDownloadTotalBytesWorkspace, ['--require-release-ready'])
  assert.equal(wrongDownloadTotalBytes.status, 1)
  assert.match(`${wrongDownloadTotalBytes.stdout}\n${wrongDownloadTotalBytes.stderr}`, /summary\.totalBytes expected to match sum of data\.downloadedAssets\.size/u)

  const wrongDownloadUrlRoot = path.join(tmp, 'release-index-wrong-download-url')
  const wrongDownloadUrlWorkspace = path.join(tmp, 'workspace-wrong-download-url')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(wrongDownloadUrlRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(wrongDownloadUrlRoot, wrongDownloadUrlWorkspace)
  const wrongDownloadUrlPath = path.join(wrongDownloadUrlRoot, 'release-readiness/ashfall-draft-download.json')
  const wrongDownloadUrlReport = JSON.parse(await fs.readFile(wrongDownloadUrlPath, 'utf8'))
  wrongDownloadUrlReport.data.downloadedAssets[0].apiUrl = 'https://api.github.com/repos/knoxhack/ECHO-Wrong-Repo/releases/assets/1'
  wrongDownloadUrlReport.data.downloadedAssets[1].browserDownloadUrl = 'https://example.invalid/echo-release.json'
  await writeJson(wrongDownloadUrlRoot, 'release-readiness/ashfall-draft-download.json', wrongDownloadUrlReport)
  const wrongDownloadUrl = run(wrongDownloadUrlRoot, wrongDownloadUrlWorkspace, ['--require-release-ready'])
  assert.equal(wrongDownloadUrl.status, 1)
  assert.match(`${wrongDownloadUrl.stdout}\n${wrongDownloadUrl.stderr}`, /data\.downloadedAssets\[0\]\.apiUrl expected to match/u)
  assert.match(`${wrongDownloadUrl.stdout}\n${wrongDownloadUrl.stderr}`, /data\.downloadedAssets\[1\]\.browserDownloadUrl expected to match/u)

  const duplicateDownloadLocatorRoot = path.join(tmp, 'release-index-duplicate-download-locator')
  const duplicateDownloadLocatorWorkspace = path.join(tmp, 'workspace-duplicate-download-locator')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(duplicateDownloadLocatorRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(duplicateDownloadLocatorRoot, duplicateDownloadLocatorWorkspace)
  const duplicateDownloadLocatorPath = path.join(duplicateDownloadLocatorRoot, 'release-readiness/ashfall-draft-download.json')
  const duplicateDownloadLocatorReport = JSON.parse(await fs.readFile(duplicateDownloadLocatorPath, 'utf8'))
  duplicateDownloadLocatorReport.data.downloadedAssets[1].apiUrl = duplicateDownloadLocatorReport.data.downloadedAssets[0].apiUrl
  await writeJson(duplicateDownloadLocatorRoot, 'release-readiness/ashfall-draft-download.json', duplicateDownloadLocatorReport)
  const duplicateDownloadLocator = run(duplicateDownloadLocatorRoot, duplicateDownloadLocatorWorkspace, ['--require-release-ready'])
  assert.equal(duplicateDownloadLocator.status, 1)
  assert.match(`${duplicateDownloadLocator.stdout}\n${duplicateDownloadLocator.stderr}`, /data\.downloadedAssets\[1\]\.apiUrl duplicates/u)

  const wrongDownloadDigestRoot = path.join(tmp, 'release-index-wrong-download-digest')
  const wrongDownloadDigestWorkspace = path.join(tmp, 'workspace-wrong-download-digest')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(wrongDownloadDigestRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(wrongDownloadDigestRoot, wrongDownloadDigestWorkspace)
  const wrongDownloadDigestPath = path.join(wrongDownloadDigestRoot, 'release-readiness/ashfall-draft-download.json')
  const wrongDownloadDigestReport = JSON.parse(await fs.readFile(wrongDownloadDigestPath, 'utf8'))
  wrongDownloadDigestReport.data.downloadedAssets[0].githubDigestSha256 = '0'.repeat(64)
  await writeJson(wrongDownloadDigestRoot, 'release-readiness/ashfall-draft-download.json', wrongDownloadDigestReport)
  const wrongDownloadDigest = run(wrongDownloadDigestRoot, wrongDownloadDigestWorkspace, ['--require-release-ready'])
  assert.equal(wrongDownloadDigest.status, 1)
  assert.match(`${wrongDownloadDigest.stdout}\n${wrongDownloadDigest.stderr}`, /data\.downloadedAssets\[0\]\.githubDigestSha256 expected to match sha256/u)

  const wrongDownloadStateRoot = path.join(tmp, 'release-index-wrong-download-state')
  const wrongDownloadStateWorkspace = path.join(tmp, 'workspace-wrong-download-state')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(wrongDownloadStateRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(wrongDownloadStateRoot, wrongDownloadStateWorkspace)
  const wrongDownloadStatePath = path.join(wrongDownloadStateRoot, 'release-readiness/ashfall-draft-download.json')
  const wrongDownloadStateReport = JSON.parse(await fs.readFile(wrongDownloadStatePath, 'utf8'))
  wrongDownloadStateReport.data.downloadedAssets[0].state = 'processing'
  await writeJson(wrongDownloadStateRoot, 'release-readiness/ashfall-draft-download.json', wrongDownloadStateReport)
  const wrongDownloadState = run(wrongDownloadStateRoot, wrongDownloadStateWorkspace, ['--require-release-ready'])
  assert.equal(wrongDownloadState.status, 1)
  assert.match(`${wrongDownloadState.stdout}\n${wrongDownloadState.stderr}`, /data\.downloadedAssets\[0\]\.state expected "uploaded" but found "processing"/u)

  const wrongDownloadLocalPathRoot = path.join(tmp, 'release-index-wrong-download-local-path')
  const wrongDownloadLocalPathWorkspace = path.join(tmp, 'workspace-wrong-download-local-path')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(wrongDownloadLocalPathRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(wrongDownloadLocalPathRoot, wrongDownloadLocalPathWorkspace)
  const wrongDownloadLocalPathPath = path.join(wrongDownloadLocalPathRoot, 'release-readiness/ashfall-draft-download.json')
  const wrongDownloadLocalPathReport = JSON.parse(await fs.readFile(wrongDownloadLocalPathPath, 'utf8'))
  wrongDownloadLocalPathReport.data.downloadedAssets[0].localPath = wrongDownloadLocalPathReport.data.downloadedAssets[1].localPath
  wrongDownloadLocalPathReport.data.downloadedAssets[0].sha256 = wrongDownloadLocalPathReport.data.downloadedAssets[1].sha256
  wrongDownloadLocalPathReport.data.downloadedAssets[0].size = wrongDownloadLocalPathReport.data.downloadedAssets[1].size
  await writeJson(wrongDownloadLocalPathRoot, 'release-readiness/ashfall-draft-download.json', wrongDownloadLocalPathReport)
  const wrongDownloadLocalPath = run(wrongDownloadLocalPathRoot, wrongDownloadLocalPathWorkspace, ['--require-release-ready'])
  assert.equal(wrongDownloadLocalPath.status, 1)
  assert.match(`${wrongDownloadLocalPath.stdout}\n${wrongDownloadLocalPath.stderr}`, /data\.downloadedAssets\[1\]\.localPath duplicates/u)
  assert.match(`${wrongDownloadLocalPath.stdout}\n${wrongDownloadLocalPath.stderr}`, /data\.downloadedAssets\[0\]\.localPath path filename expected/u)

  const zeroByteDownloadRoot = path.join(tmp, 'release-index-zero-byte-download')
  const zeroByteDownloadWorkspace = path.join(tmp, 'workspace-zero-byte-download')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(zeroByteDownloadRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(zeroByteDownloadRoot, zeroByteDownloadWorkspace)
  const zeroByteDownloadReportPath = path.join(zeroByteDownloadRoot, 'release-readiness/ashfall-draft-download.json')
  const zeroByteDownloadReport = JSON.parse(await fs.readFile(zeroByteDownloadReportPath, 'utf8'))
  const zeroByteDownloadAsset = zeroByteDownloadReport.data.downloadedAssets.find((asset) => asset.name === 'checksums.txt')
  const zeroByteDownloadBytes = Buffer.alloc(0)
  await writeBytes(zeroByteDownloadRoot, zeroByteDownloadAsset.localPath, zeroByteDownloadBytes)
  zeroByteDownloadAsset.size = zeroByteDownloadBytes.length
  zeroByteDownloadAsset.sha256 = sha256(zeroByteDownloadBytes)
  zeroByteDownloadAsset.githubDigestSha256 = zeroByteDownloadAsset.sha256
  zeroByteDownloadReport.summary.totalBytes = zeroByteDownloadReport.data.downloadedAssets.reduce((sum, asset) => sum + asset.size, 0)
  await writeJson(zeroByteDownloadRoot, 'release-readiness/ashfall-draft-download.json', zeroByteDownloadReport)
  const zeroByteDownload = run(zeroByteDownloadRoot, zeroByteDownloadWorkspace, ['--require-release-ready'])
  assert.equal(zeroByteDownload.status, 1)
  assert.match(`${zeroByteDownload.stdout}\n${zeroByteDownload.stderr}`, /data\.downloadedAssets\[0\]\.size expected >= 1 but found 0/u)

  const invalidDownloadedJsonRoot = path.join(tmp, 'release-index-invalid-downloaded-json')
  const invalidDownloadedJsonWorkspace = path.join(tmp, 'workspace-invalid-downloaded-json')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(invalidDownloadedJsonRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(invalidDownloadedJsonRoot, invalidDownloadedJsonWorkspace)
  const invalidDownloadedJsonReportPath = path.join(invalidDownloadedJsonRoot, 'release-readiness/ashfall-draft-download.json')
  const invalidDownloadedJsonReport = JSON.parse(await fs.readFile(invalidDownloadedJsonReportPath, 'utf8'))
  const invalidDownloadedJsonAsset = invalidDownloadedJsonReport.data.downloadedAssets.find((asset) => asset.name === 'echo-release.json')
  const invalidDownloadedJsonBytes = Buffer.from('not json\n', 'utf8')
  await writeBytes(invalidDownloadedJsonRoot, invalidDownloadedJsonAsset.localPath, invalidDownloadedJsonBytes)
  invalidDownloadedJsonAsset.size = invalidDownloadedJsonBytes.length
  invalidDownloadedJsonAsset.sha256 = sha256(invalidDownloadedJsonBytes)
  invalidDownloadedJsonAsset.githubDigestSha256 = invalidDownloadedJsonAsset.sha256
  invalidDownloadedJsonReport.summary.totalBytes = invalidDownloadedJsonReport.data.downloadedAssets.reduce((sum, asset) => sum + asset.size, 0)
  await writeJson(invalidDownloadedJsonRoot, 'release-readiness/ashfall-draft-download.json', invalidDownloadedJsonReport)
  const invalidDownloadedJson = run(invalidDownloadedJsonRoot, invalidDownloadedJsonWorkspace, ['--require-release-ready'])
  assert.equal(invalidDownloadedJson.status, 1)
  assert.match(`${invalidDownloadedJson.stdout}\n${invalidDownloadedJson.stderr}`, /data\.downloadedAssets\[1\] target is not valid JSON: tmp\/ashfall-draft-download\/ECHO-Ashfall-Native-Edition\/echo-release\.json/u)

  const invalidDownloadedZipRoot = path.join(tmp, 'release-index-invalid-downloaded-zip')
  const invalidDownloadedZipWorkspace = path.join(tmp, 'workspace-invalid-downloaded-zip')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(invalidDownloadedZipRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(invalidDownloadedZipRoot, invalidDownloadedZipWorkspace)
  const invalidDownloadedZipReportPath = path.join(invalidDownloadedZipRoot, 'release-readiness/ashfall-draft-download.json')
  const invalidDownloadedZipReport = JSON.parse(await fs.readFile(invalidDownloadedZipReportPath, 'utf8'))
  const invalidDownloadedZipAsset = invalidDownloadedZipReport.data.downloadedAssets.find((asset) => asset.name === 'ashfall-native-edition-0.1.0.zip')
  const invalidDownloadedZipBytes = Buffer.from('not zip\n', 'utf8')
  await writeBytes(invalidDownloadedZipRoot, invalidDownloadedZipAsset.localPath, invalidDownloadedZipBytes)
  invalidDownloadedZipAsset.size = invalidDownloadedZipBytes.length
  invalidDownloadedZipAsset.sha256 = sha256(invalidDownloadedZipBytes)
  invalidDownloadedZipAsset.githubDigestSha256 = invalidDownloadedZipAsset.sha256
  invalidDownloadedZipReport.summary.totalBytes = invalidDownloadedZipReport.data.downloadedAssets.reduce((sum, asset) => sum + asset.size, 0)
  await writeJson(invalidDownloadedZipRoot, 'release-readiness/ashfall-draft-download.json', invalidDownloadedZipReport)
  const invalidDownloadedZip = run(invalidDownloadedZipRoot, invalidDownloadedZipWorkspace, ['--require-release-ready'])
  assert.equal(invalidDownloadedZip.status, 1)
  assert.match(`${invalidDownloadedZip.stdout}\n${invalidDownloadedZip.stderr}`, /data\.downloadedAssets\[3\] target is not a ZIP file: tmp\/ashfall-draft-download\/ECHO-Ashfall-Native-Edition\/ashfall-native-edition-0\.1\.0\.zip/u)

  const badScreenshotRoot = path.join(tmp, 'release-index-bad-screenshot')
  const badScreenshotWorkspace = path.join(tmp, 'workspace-bad-screenshot')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(badScreenshotRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(badScreenshotRoot, badScreenshotWorkspace)
  await writeText(
    path.join(badScreenshotWorkspace, 'ECHO-Ashfall-Native-Edition'),
    'metadata/assets/official_packs/ashfall/first_launch.png',
    'not a png\n',
  )
  const badScreenshot = run(badScreenshotRoot, badScreenshotWorkspace, ['--require-release-ready'])
  assert.equal(badScreenshot.status, 1)
  assert.match(`${badScreenshot.stdout}\n${badScreenshot.stderr}`, /not a PNG file/u)

  const lowResolutionScreenshotRoot = path.join(tmp, 'release-index-low-resolution-screenshot')
  const lowResolutionScreenshotWorkspace = path.join(tmp, 'workspace-low-resolution-screenshot')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(lowResolutionScreenshotRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(lowResolutionScreenshotRoot, lowResolutionScreenshotWorkspace)
  await writeBytes(
    path.join(lowResolutionScreenshotWorkspace, 'ECHO-Ashfall-Native-Edition'),
    'metadata/assets/official_packs/ashfall/first_launch.png',
    pngFixture(320, 180),
  )
  const lowResolutionScreenshot = run(lowResolutionScreenshotRoot, lowResolutionScreenshotWorkspace, ['--require-release-ready'])
  assert.equal(lowResolutionScreenshot.status, 1)
  assert.match(`${lowResolutionScreenshot.stdout}\n${lowResolutionScreenshot.stderr}`, /PNG width expected >= 640/u)

  const badScreenshotNamesRoot = path.join(tmp, 'release-index-bad-screenshot-names')
  const badScreenshotNamesWorkspace = path.join(tmp, 'workspace-bad-screenshot-names')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(badScreenshotNamesRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(badScreenshotNamesRoot, badScreenshotNamesWorkspace)
  const badScreenshotNamesAshfallRoot = path.join(badScreenshotNamesWorkspace, 'ECHO-Ashfall-Native-Edition')
  const badScreenshotNamesMetadataPath = path.join(badScreenshotNamesAshfallRoot, 'metadata/official_packs/ashfall.json')
  const badScreenshotNamesMetadata = JSON.parse(await fs.readFile(badScreenshotNamesMetadataPath, 'utf8'))
  badScreenshotNamesMetadata.screenshots = [
    'metadata/assets/official_packs/ashfall/first_launch.png',
    'metadata/assets/official_packs/ashfall/server_export.png',
    'metadata/assets/official_packs/ashfall/midgame_scene.png',
    'metadata/assets/official_packs/ashfall/final_scene.png',
  ]
  await writeJson(badScreenshotNamesAshfallRoot, 'metadata/official_packs/ashfall.json', badScreenshotNamesMetadata)
  await writeBytes(badScreenshotNamesAshfallRoot, 'metadata/assets/official_packs/ashfall/midgame_scene.png', tinyPng)
  await writeBytes(badScreenshotNamesAshfallRoot, 'metadata/assets/official_packs/ashfall/final_scene.png', tinyPng)
  const badScreenshotNames = run(badScreenshotNamesRoot, badScreenshotNamesWorkspace, ['--require-release-ready'])
  assert.equal(badScreenshotNames.status, 1)
  assert.match(`${badScreenshotNames.stdout}\n${badScreenshotNames.stderr}`, /route\[-_\]\?verification/u)
  assert.match(`${badScreenshotNames.stdout}\n${badScreenshotNames.stderr}`, /ending\[-_\]\?verification/u)

  const duplicatePolishScreenshotRoot = path.join(tmp, 'release-index-duplicate-polish-screenshot')
  const duplicatePolishScreenshotWorkspace = path.join(tmp, 'workspace-duplicate-polish-screenshot')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(duplicatePolishScreenshotRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(duplicatePolishScreenshotRoot, duplicatePolishScreenshotWorkspace)
  const duplicatePolishScreenshotAshfallRoot = path.join(duplicatePolishScreenshotWorkspace, 'ECHO-Ashfall-Native-Edition')
  const duplicatePolishScreenshotMetadataPath = path.join(duplicatePolishScreenshotAshfallRoot, 'metadata/official_packs/ashfall.json')
  const duplicatePolishScreenshotMetadata = JSON.parse(await fs.readFile(duplicatePolishScreenshotMetadataPath, 'utf8'))
  duplicatePolishScreenshotMetadata.screenshots.push(duplicatePolishScreenshotMetadata.screenshots[0])
  await writeJson(duplicatePolishScreenshotAshfallRoot, 'metadata/official_packs/ashfall.json', duplicatePolishScreenshotMetadata)
  const duplicatePolishScreenshot = run(duplicatePolishScreenshotRoot, duplicatePolishScreenshotWorkspace, ['--require-release-ready'])
  assert.equal(duplicatePolishScreenshot.status, 1)
  assert.match(`${duplicatePolishScreenshot.stdout}\n${duplicatePolishScreenshot.stderr}`, /screenshots\[4\]\.\(item\) duplicates/u)

  const emptyReleaseNotesRoot = path.join(tmp, 'release-index-empty-release-notes')
  const emptyReleaseNotesWorkspace = path.join(tmp, 'workspace-empty-release-notes')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(emptyReleaseNotesRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(emptyReleaseNotesRoot, emptyReleaseNotesWorkspace)
  await writeText(
    path.join(emptyReleaseNotesWorkspace, 'ECHO-Ashfall-Native-Edition'),
    'docs/NATIVE_RELEASE_NOTES.md',
    '',
  )
  const emptyReleaseNotes = run(emptyReleaseNotesRoot, emptyReleaseNotesWorkspace, ['--require-release-ready'])
  assert.equal(emptyReleaseNotes.status, 1)
  assert.match(`${emptyReleaseNotes.stdout}\n${emptyReleaseNotes.stderr}`, /releaseNotesPath target size expected >= 1 byte/u)

  const badLauncherCardRoot = path.join(tmp, 'release-index-bad-launcher-card')
  const badLauncherCardWorkspace = path.join(tmp, 'workspace-bad-launcher-card')
  await fs.cp(path.join(repoRoot, 'release-readiness'), path.join(badLauncherCardRoot, 'release-readiness'), { recursive: true })
  await writeReleaseReadyFixture(badLauncherCardRoot, badLauncherCardWorkspace)
  await writeText(
    path.join(badLauncherCardWorkspace, 'ECHO-Ashfall-Native-Edition'),
    'metadata/assets/official_packs/ashfall/pack_card.png',
    'not a png\n',
  )
  const badLauncherCard = run(badLauncherCardRoot, badLauncherCardWorkspace, ['--require-release-ready'])
  assert.equal(badLauncherCard.status, 1)
  assert.match(`${badLauncherCard.stdout}\n${badLauncherCard.stderr}`, /launcherCard\.cardPath target is not a PNG file/u)
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}

console.log('Ashfall release readiness verifier fixtures passed.')
