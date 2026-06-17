#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const repoRoot = process.cwd()
const verifier = path.join(repoRoot, 'scripts', 'verify-gameplay-acceptance.mjs')
const familyGenerator = path.join(repoRoot, 'scripts', 'generate-family-gameplay-evidence.mjs')
const lanes = ['native', 'neoforge', 'standalone']
const standardClaims = {
  freshWorldCreated: true,
  realFirst30Playthrough: true,
  realFirst2HourPlaythrough: true,
  primaryObjectiveCompleted: true,
  saveReloadVerified: true,
  noCrashEvidence: true,
}

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function spawnVerifier(root, extraArgs = []) {
  return spawnSync(process.execPath, [
    verifier,
    '--root',
    root,
    ...extraArgs,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function spawnFamilyGenerator(root, extraArgs = []) {
  return spawnSync(process.execPath, [
    familyGenerator,
    '--root',
    root,
    ...extraArgs,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function uiSmoke() {
  return {
    schemaVersion: 'echo.fixture.electron-ui-smoke.v1',
    ok: true,
    generatedAt: '2026-06-16T00:00:00.000Z',
    gates: {
      packagedElectronInstallClickThrough: 'passed',
      packagedElectronUpdateReconciliationClickThrough: 'passed',
    },
    clickThrough: {
      update: {
        ok: true,
        operation: 'verify',
        acceptedAction: 'current',
        currentCatalogState: 'current',
        reconciliation: {
          mode: 'current-state-backend-install-reconciliation',
        },
        verifiedModule: {
          sha256: 'a'.repeat(64),
        },
      },
    },
  }
}

function manualGameplay(prefix) {
  return {
    status: 'PASS',
    generatedAt: '2026-06-16T00:00:00.000Z',
    blockers: [],
    editions: lanes.map((lane) => ({
      lane,
      packId: `${prefix}-${lane}-edition`,
      status: 'passed',
      blockers: [],
      workspaceDir: '.',
      manualEvidence: `fixtures/${prefix}/${lane}/manual-evidence.json`,
    })),
  }
}

function genericGameplay(prefix) {
  return {
    schemaVersion: 'echo.fixture.gameplay-evidence.v1',
    status: 'PASS',
    generatedAt: '2026-06-16T00:00:00.000Z',
    blockers: [],
    lanes: lanes.map((lane) => ({
      lane,
      packId: `${prefix}-${lane}-edition`,
      status: 'passed',
      blockers: [],
      sourceRepo: `knoxhack/ECHO-${prefix}-${lane}`,
      workspaceDir: '.',
      evidencePath: `fixtures/${prefix}/${lane}/gameplay-evidence.json`,
      claims: { ...standardClaims },
    })),
  }
}

function proofPaths(prefix, lane) {
  const base = `fixtures/${prefix}/${lane}/evidence`
  return {
    supportingFiles: [
      `${base}/notes/fresh-world.md`,
      `${base}/notes/first-30.md`,
      `${base}/notes/first-2-hours.md`,
      `${base}/notes/objective.md`,
      `${base}/notes/no-crash.md`,
    ],
    screenshots: [
      `${base}/screenshots/fresh-world.png`,
      `${base}/screenshots/first-30.png`,
      `${base}/screenshots/first-2-hours.png`,
      `${base}/screenshots/objective.png`,
    ],
    logs: [
      `${base}/logs/client-playthrough.log`,
      `${base}/logs/launcher-install.log`,
    ],
    saveSnapshots: [
      `${base}/saves/first-30.zip`,
      `${base}/saves/first-2-hours.zip`,
      `${base}/saves/objective.zip`,
    ],
  }
}

async function writeFile(root, relPath, content = 'captured evidence\n') {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

async function writeGameplayEvidenceBundle(root, prefix, lane, evidenceRelPath, claims = standardClaims) {
  const groups = proofPaths(prefix, lane)
  for (const paths of Object.values(groups)) {
    for (const relPath of paths) await writeFile(root, relPath)
  }
  const firstProof = groups.supportingFiles[0]
  await writeJson(root, evidenceRelPath, {
    schemaVersion: 'echo.fixture.real-gameplay-evidence.v1',
    packId: `${prefix}-${lane}-edition`,
    claims,
    proofs: Object.fromEntries(Object.keys(claims).map((claim) => [claim, [firstProof]])),
    ...groups,
  })
}

test('strict mode fails when required gameplay evidence is missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-gameplay-acceptance-missing-'))
  await fs.mkdir(path.join(root, 'release-readiness'), { recursive: true })

  const result = spawnVerifier(root, ['--strict', '--no-write'])
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(`${result.stdout}\n${result.stderr}`, /Gameplay acceptance BLOCKED/u)

  await fs.rm(root, { recursive: true, force: true })
})

test('fail-closed Openlands and Arcana reports are concrete source reports', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-gameplay-acceptance-fail-closed-'))

  const generated = spawnFamilyGenerator(root)
  assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`)

  const result = spawnVerifier(root, ['--no-write', '--json'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(result.stdout)
  const openlands = report.families.find((family) => family.family === 'Openlands')
  const arcana = report.families.find((family) => family.family === 'Arcana Division')
  assert.equal(openlands.sourceReports[0].present, true)
  assert.equal(arcana.sourceReports[0].present, true)
  assert.equal(openlands.lanes[0].sourceRepo, 'knoxhack/ECHO-Openlands-Native-Edition')
  assert.equal(openlands.lanes[0].releaseReady, false)
  assert.equal(openlands.lanes[0].claims.freshWorldCreated, false)

  await fs.rm(root, { recursive: true, force: true })
})

test('pass-shaped family claims require local evidence files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-gameplay-acceptance-proof-files-'))
  await writeJson(root, 'release-readiness/openlands-gameplay-evidence.json', genericGameplay('openlands'))

  const result = spawnVerifier(root, ['--no-write', '--json'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(result.stdout)
  const openlands = report.families.find((family) => family.family === 'Openlands')
  const native = openlands.lanes.find((lane) => lane.lane === 'native')
  assert.equal(openlands.status, 'blocked')
  assert.equal(native.status, 'blocked')
  assert.match(native.blockers.join('\n'), /Missing local gameplay evidence file/u)
  assert.match(native.blockers.join('\n'), /Gameplay claim freshWorldCreated is true but has no non-empty local proof file/u)

  await fs.rm(root, { recursive: true, force: true })
})

test('Computer Use capture attempts attach to matching gameplay lane without promoting claims', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-gameplay-acceptance-computer-use-'))
  await writeJson(root, 'release-readiness/ashfall-lane-game-smoke.json', {
    schemaVersion: 'echo.ashfall.lane-game-smoke.v1',
    ok: false,
    generatedAt: '2026-06-17T19:00:00.000Z',
    blockers: [],
    lanes: lanes.map((lane) => ({
      lane,
      packId: `ashfall-${lane}-edition`,
      ok: false,
      blockers: [`Missing ${lane} gameplay proof.`],
      installedManifest: {
        present: true,
        missingModuleFileCount: 0,
      },
    })),
  })
  await writeJson(root, 'release-readiness/computer-use-gameplay-capture-attempt.json', {
    schemaVersion: 'echo.release_index.computer_use_gameplay_capture_attempt.v1',
    generatedAt: '2026-06-17T19:11:40.000Z',
    status: 'blocked',
    target: {
      family: 'Ashfall',
      lane: 'neoforge',
      packId: 'ashfall-neoforge-edition',
    },
    launcherWindow: {
      observed: true,
      accessibility: {
        observed: true,
      },
    },
    screenshotCapture: {
      attempted: true,
      status: 'failed',
      api: 'Windows.Graphics.Capture',
      error: 'SetIsBorderRequired failed: No such interface supported (0x80004002)',
    },
    inputStoppedAfterCaptureFailure: true,
    acceptedAsGameplayProof: false,
    claimsPromoted: false,
    importedEvidenceFiles: [],
    verificationChecks: [
      {
        id: 'hudVisible',
        label: 'HUD visible',
        status: 'blocked',
        evidenceRef: null,
        note: 'Screenshot capture failed before HUD could be visually verified.',
      },
      {
        id: 'inventoryIndexVisible',
        label: 'Inventory Index visible',
        status: 'not-attempted',
        evidenceRef: null,
        note: 'Stopped input after screenshot capture failure.',
      },
    ],
    verificationSummary: {
      checkCount: 2,
      capturedCount: 0,
      blockedCount: 1,
      notAttemptedCount: 1,
    },
    blockers: [
      'Computer Use window screenshot capture failed before visible gameplay screenshots could be recorded.',
      'No screenshots, gameplay logs, or save snapshots were imported for Ashfall NeoForge.',
    ],
  })

  const result = spawnVerifier(root, ['--no-write', '--json'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(result.stdout)
  const ashfall = report.families.find((family) => family.family === 'Ashfall')
  const neoforge = ashfall.lanes.find((lane) => lane.lane === 'neoforge')
  const native = ashfall.lanes.find((lane) => lane.lane === 'native')

  assert.equal(report.computerUseCaptureAttempts.length, 1)
  assert.equal(report.computerUseCaptureAttempts[0].attached, true)
  assert.equal(neoforge.computerUseCaptureAttempt.acceptedAsGameplayProof, false)
  assert.equal(neoforge.computerUseCaptureAttempt.claimsPromoted, false)
  assert.equal(neoforge.computerUseCaptureAttempt.screenshotCapture.status, 'failed')
  assert.equal(neoforge.computerUseCaptureAttempt.verificationSummary.checkCount, 2)
  assert.equal(neoforge.computerUseCaptureAttempt.verificationChecks[0].id, 'hudVisible')
  assert.equal(neoforge.computerUseCaptureAttempt.verificationChecks[0].status, 'blocked')
  assert.match(neoforge.blockers.join('\n'), /Computer Use capture attempt: Computer Use window screenshot capture failed/u)
  assert.equal(neoforge.releaseReady, false)
  assert.equal(native.computerUseCaptureAttempt, undefined)

  await fs.rm(root, { recursive: true, force: true })
})

test('Computer Use capture attempt history attaches multiple lane attempts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-gameplay-acceptance-computer-use-history-'))
  const ashfallAttempt = {
    schemaVersion: 'echo.release_index.computer_use_gameplay_capture_attempt.v1',
    attemptId: 'ashfall-neoforge-attempt',
    generatedAt: '2026-06-17T19:11:40.000Z',
    status: 'blocked',
    target: {
      family: 'Ashfall',
      lane: 'neoforge',
      packId: 'ashfall-neoforge-edition',
    },
    launcherWindow: { observed: true, accessibility: { observed: true } },
    screenshotCapture: {
      attempted: true,
      status: 'failed',
      api: 'Windows.Graphics.Capture',
      error: 'SetIsBorderRequired failed: No such interface supported (0x80004002)',
    },
    inputStoppedAfterCaptureFailure: true,
    acceptedAsGameplayProof: false,
    claimsPromoted: false,
    importedEvidenceFiles: [],
    verificationChecks: [],
    verificationSummary: {
      checkCount: 0,
      capturedCount: 0,
      blockedCount: 0,
      notAttemptedCount: 0,
    },
    blockers: ['Ashfall NeoForge visible gameplay capture is blocked by screenshot capture failure.'],
  }
  const skyRelayAttempt = {
    ...ashfallAttempt,
    attemptId: 'sky-relay-native-attempt',
    generatedAt: '2026-06-17T20:00:00.000Z',
    target: {
      family: 'Sky Relay',
      lane: 'native',
      packId: 'sky-relay-native-edition',
    },
    blockers: ['Sky Relay Native gameplay capture has not started on this machine.'],
  }
  await writeJson(root, 'release-readiness/ashfall-lane-game-smoke.json', {
    schemaVersion: 'echo.ashfall.lane-game-smoke.v1',
    ok: false,
    generatedAt: '2026-06-17T19:00:00.000Z',
    blockers: [],
    lanes: lanes.map((lane) => ({
      lane,
      packId: `ashfall-${lane}-edition`,
      ok: false,
      blockers: [`Missing ${lane} gameplay proof.`],
    })),
  })
  await writeJson(root, 'release-readiness/sky-relay-gameplay-evidence.json', manualGameplay('sky-relay'))
  await writeJson(root, 'release-readiness/sky-relay-manual-gameplay-work-order.json', manualGameplay('sky-relay'))
  await writeJson(root, 'release-readiness/computer-use-gameplay-capture-attempts.json', {
    schemaVersion: 'echo.release_index.computer_use_gameplay_capture_attempts.v1',
    generatedAt: '2026-06-17T20:01:00.000Z',
    attemptCount: 2,
    latestAttemptId: skyRelayAttempt.attemptId,
    attempts: [ashfallAttempt, skyRelayAttempt],
  })

  const result = spawnVerifier(root, ['--no-write', '--json'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.computerUseCaptureAttempts.length, 2)

  const ashfall = report.families.find((family) => family.family === 'Ashfall')
  const ashfallNeoForge = ashfall.lanes.find((lane) => lane.lane === 'neoforge')
  assert.equal(ashfallNeoForge.computerUseCaptureAttempts.length, 1)
  assert.equal(ashfallNeoForge.computerUseCaptureAttempt.attemptId, 'ashfall-neoforge-attempt')
  assert.match(ashfallNeoForge.blockers.join('\n'), /Ashfall NeoForge visible gameplay capture/u)

  const skyRelay = report.families.find((family) => family.family === 'Sky Relay')
  const skyRelayNative = skyRelay.lanes.find((lane) => lane.lane === 'native')
  assert.equal(skyRelayNative.computerUseCaptureAttempts.length, 1)
  assert.equal(skyRelayNative.computerUseCaptureAttempt.attemptId, 'sky-relay-native-attempt')
  assert.match(skyRelayNative.blockers.join('\n'), /Sky Relay Native gameplay capture has not started/u)

  await fs.rm(root, { recursive: true, force: true })
})

test('all required family and lane evidence can pass strict mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-gameplay-acceptance-pass-'))
  const out = path.join(root, 'release-readiness', 'gameplay-acceptance-matrix.json')

  await writeJson(root, 'release-readiness/ashfall-lane-game-smoke.json', {
    schemaVersion: 'echo.ashfall.lane-game-smoke.v1',
    ok: true,
    generatedAt: '2026-06-16T00:00:00.000Z',
    blockers: [],
    lanes: lanes.map((lane) => ({
      lane,
      packId: `ashfall-${lane}-edition`,
      ok: true,
      blockers: [],
      evidence: {
        present: true,
        path: `fixtures/ashfall/${lane}/gameplay-evidence.json`,
      },
      installedManifest: {
        present: true,
        missingModuleFileCount: 0,
      },
    })),
  })
  await writeJson(root, 'release-readiness/sky-relay-gameplay-evidence.json', manualGameplay('sky-relay'))
  await writeJson(root, 'release-readiness/sky-relay-manual-gameplay-work-order.json', manualGameplay('sky-relay'))
  await writeJson(root, 'release-readiness/sky-relay-electron-ui-smoke.json', uiSmoke())
  await writeJson(root, 'release-readiness/galactic-survey-public-alpha-readiness.json', manualGameplay('galactic-survey'))
  await writeJson(root, 'release-readiness/galactic-survey-manual-gameplay-work-order.json', manualGameplay('galactic-survey'))
  await writeJson(root, 'release-readiness/galactic-survey-electron-ui-smoke.json', uiSmoke())
  await writeJson(root, 'release-readiness/openlands-gameplay-evidence.json', genericGameplay('openlands'))
  await writeJson(root, 'release-readiness/arcana-division-gameplay-evidence.json', genericGameplay('arcana-division'))
  for (const prefix of ['sky-relay', 'galactic-survey']) {
    for (const lane of lanes) {
      await writeGameplayEvidenceBundle(root, prefix, lane, `fixtures/${prefix}/${lane}/manual-evidence.json`)
    }
  }
  for (const prefix of ['openlands', 'arcana-division']) {
    for (const lane of lanes) {
      await writeGameplayEvidenceBundle(root, prefix, lane, `fixtures/${prefix}/${lane}/gameplay-evidence.json`)
    }
  }

  const result = spawnVerifier(root, ['--strict', '--out', out])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Gameplay acceptance PASS/u)

  const report = await readJson(out)
  assert.equal(report.schemaVersion, 'echo.gameplay.acceptance.v1')
  assert.equal(report.status, 'PASS')
  assert.equal(report.summary.familyCount, 5)
  assert.equal(report.summary.laneCount, 15)
  assert.equal(report.summary.blockerCount, 0)
  const openlands = report.families.find((family) => family.family === 'Openlands')
  assert.equal(openlands.lanes[0].sourceRepo, 'knoxhack/ECHO-openlands-native')
  assert.equal(openlands.lanes[0].releaseReady, true)
  assert.equal(openlands.lanes[0].claims.freshWorldCreated, true)

  await fs.rm(root, { recursive: true, force: true })
})
