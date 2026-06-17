#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'

const repoRoot = process.cwd()
const recorder = path.join(repoRoot, 'scripts', 'record-computer-use-gameplay-capture-attempt.mjs')

function run(args) {
  return spawnSync(process.execPath, [recorder, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

test('records failed Computer Use screenshot capture as blocker evidence only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-computer-use-capture-attempt-'))
  const generatedAt = '2026-06-17T19:11:40.000Z'

  const result = run([
    '--root', root,
    '--generated-at', generatedAt,
    '--family', 'Ashfall',
    '--lane', 'neoforge',
    '--pack-id', 'ashfall-neoforge-edition',
    '--launcher-instance', 'Ashfall NeoForge Edition',
    '--observed-app', 'ECHO Launcher|ECHO Launcher|true',
    '--observed-app', 'Minecraft|Minecraft Launcher|true',
    '--launcher-observed',
    '--launcher-selected-pack', 'Ashfall NeoForge Edition',
    '--launcher-status', 'Ready',
    '--launcher-play-button', 'Play Ashfall NeoForge Edition',
    '--screenshot-status', 'failed',
    '--screenshot-error', 'SetIsBorderRequired failed: No such interface supported (0x80004002)',
    '--input-stopped',
    '--verification-check', 'hudVisible|HUD visible|blocked||Screenshot capture failed before HUD could be visually verified.',
    '--verification-check', 'inventoryIndexVisible|Inventory Index visible|not-attempted||Stopped input after screenshot capture failure.',
    '--verification-check', 'terminalVisible|Terminal visible|not-attempted||Stopped input after screenshot capture failure.',
    '--blocker', 'Observed Ashfall NeoForge crash report must be re-proven after renderer/runtime fixes.',
  ])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

  const reportPath = path.join(root, 'release-readiness', 'computer-use-gameplay-capture-attempt.json')
  const historyPath = path.join(root, 'release-readiness', 'computer-use-gameplay-capture-attempts.json')
  const report = await readJson(reportPath)
  assert.equal(report.schemaVersion, 'echo.release_index.computer_use_gameplay_capture_attempt.v1')
  assert.match(report.attemptId, /2026-06-17t19-11-40-000z__ashfall__neoforge__ashfall-neoforge-edition/u)
  assert.equal(report.generatedAt, generatedAt)
  assert.equal(report.status, 'blocked')
  assert.equal(report.target.family, 'Ashfall')
  assert.equal(report.target.lane, 'neoforge')
  assert.equal(report.screenshotCapture.status, 'failed')
  assert.equal(report.inputStoppedAfterCaptureFailure, true)
  assert.equal(report.acceptedAsGameplayProof, false)
  assert.equal(report.claimsPromoted, false)
  assert.deepEqual(report.importedEvidenceFiles, [])
  assert.equal(report.verificationSummary.checkCount, 3)
  assert.equal(report.verificationSummary.capturedCount, 0)
  assert.equal(report.verificationSummary.blockedCount, 1)
  assert.equal(report.verificationSummary.notAttemptedCount, 2)
  assert.equal(report.verificationChecks[0].id, 'hudVisible')
  assert.equal(report.verificationChecks[0].status, 'blocked')
  assert.match(report.blockers.join('\n'), /window screenshot capture failed/u)
  assert.match(report.blockers.join('\n'), /not accepted as gameplay proof/u)
  assert.match(report.blockers.join('\n'), /No screenshots, gameplay logs, or save snapshots/u)
  assert.match(report.blockers.join('\n'), /verification check hudVisible/u)

  const history = await readJson(historyPath)
  assert.equal(history.schemaVersion, 'echo.release_index.computer_use_gameplay_capture_attempts.v1')
  assert.equal(history.attemptCount, 1)
  assert.equal(history.latestAttemptId, report.attemptId)
  assert.equal(history.attempts[0].attemptId, report.attemptId)
  assert.equal(history.attempts[0].acceptedAsGameplayProof, false)

  const secondResult = run([
    '--root', root,
    '--generated-at', '2026-06-17T20:00:00.000Z',
    '--family', 'Sky Relay',
    '--lane', 'native',
    '--pack-id', 'sky-relay-native-edition',
    '--screenshot-status', 'not-attempted',
    '--verification-check', 'hudVisible|HUD visible|not-attempted||Computer Use capture not started.',
  ])
  assert.equal(secondResult.status, 0, `${secondResult.stdout}\n${secondResult.stderr}`)
  const secondHistory = await readJson(historyPath)
  assert.equal(secondHistory.attemptCount, 2)
  assert.equal(secondHistory.attempts[0].target.family, 'Ashfall')
  assert.equal(secondHistory.attempts[1].target.family, 'Sky Relay')

  const duplicateResult = run([
    '--root', root,
    '--generated-at', '2026-06-17T20:00:00.000Z',
    '--family', 'Sky Relay',
    '--lane', 'native',
    '--pack-id', 'sky-relay-native-edition',
    '--screenshot-status', 'not-attempted',
    '--verification-check', 'hudVisible|HUD visible|not-attempted||Computer Use capture not started.',
  ])
  assert.equal(duplicateResult.status, 0, `${duplicateResult.stdout}\n${duplicateResult.stderr}`)
  const dedupedHistory = await readJson(historyPath)
  assert.equal(dedupedHistory.attemptCount, 2)

  await fs.rm(root, { recursive: true, force: true })
})

test('rejects failed screenshot attempts without exact error text', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-computer-use-capture-attempt-invalid-'))
  const result = run([
    '--root', root,
    '--family', 'Ashfall',
    '--lane', 'neoforge',
    '--pack-id', 'ashfall-neoforge-edition',
    '--screenshot-status', 'failed',
  ])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--screenshot-error is required/u)
  await fs.rm(root, { recursive: true, force: true })
})

test('rejects captured verification checks without evidence references', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-computer-use-capture-attempt-check-invalid-'))
  const result = run([
    '--root', root,
    '--family', 'Ashfall',
    '--lane', 'neoforge',
    '--pack-id', 'ashfall-neoforge-edition',
    '--screenshot-status', 'captured',
    '--verification-check', 'hudVisible|HUD visible|captured||Missing evidence reference.',
  ])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /captured status requires an evidenceRef/u)
  await fs.rm(root, { recursive: true, force: true })
})
