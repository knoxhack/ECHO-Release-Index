#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'generate-computer-use-gameplay-capture-work-order.mjs')

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function matrixFixture() {
  return {
    schemaVersion: 'echo.gameplay.acceptance.v1',
    status: 'BLOCKED',
    generatedAt: '2026-06-17T20:00:00.000Z',
    families: [
      {
        family: 'Ashfall',
        lanes: [
          {
            lane: 'native',
            packId: 'ashfall-native-edition',
            sourceRepo: 'knoxhack/ECHO-Ashfall-Native-Edition',
            workspaceDir: 'ECHO-Ashfall-Native-Edition',
            status: 'blocked',
            releaseReady: false,
            blockerCount: 2,
            blockers: [
              'Missing gameplay proof: mainMenuNativeReplacement',
              'Missing gameplay proof: inventoryIndexVisible',
            ],
            claims: {
              clientStarted: true,
              mainMenuNativeReplacement: false,
              inventoryIndexVisible: false,
            },
          },
          {
            lane: 'neoforge',
            packId: 'ashfall-neoforge-edition',
            sourceRepo: 'knoxhack/ECHO-Ashfall-NeoForge-Edition',
            workspaceDir: 'ECHO-Ashfall-NeoForge-Edition',
            status: 'blocked',
            releaseReady: false,
            blockerCount: 1,
            blockers: ['Missing gameplay proof: hudVisible'],
            claims: {
              clientStarted: false,
              hudVisible: false,
              inventoryIndexVisible: false,
            },
          },
        ],
      },
      {
        family: 'Openlands',
        lanes: [
          {
            lane: 'native',
            packId: 'openlands-native-edition',
            sourceRepo: 'knoxhack/ECHO-Openlands-Native-Edition',
            workspaceDir: 'ECHO-Openlands-Native-Edition',
            status: 'blocked',
            releaseReady: false,
            blockerCount: 1,
            blockers: ['Missing primary Openlands route or systems objective reached and recorded.'],
            evidencePath: 'fixtures/openlands/gameplay-qa/native/manual-evidence.json',
            claims: {
              freshWorldCreated: false,
              realFirst30Playthrough: false,
              realFirst2HourPlaythrough: false,
              primaryObjectiveCompleted: false,
              saveReloadVerified: false,
              noCrashEvidence: false,
            },
          },
        ],
      },
    ],
  }
}

function attemptFixture() {
  return {
    schemaVersion: 'echo.release_index.computer_use_gameplay_capture_attempt.v1',
    attemptId: 'ashfall-neoforge-visible-attempt',
    generatedAt: '2026-06-17T20:01:00.000Z',
    status: 'blocked',
    target: {
      family: 'Ashfall',
      lane: 'neoforge',
      packId: 'ashfall-neoforge-edition',
    },
    screenshotCapture: {
      status: 'failed',
      error: 'SetIsBorderRequired failed: No such interface supported (0x80004002)',
    },
    acceptedAsGameplayProof: false,
    claimsPromoted: false,
    verificationChecks: [
      {
        id: 'hudVisible',
        label: 'HUD visible',
        status: 'blocked',
        evidenceRef: null,
        note: 'Screenshot capture failed.',
      },
    ],
    verificationSummary: {
      checkCount: 1,
      capturedCount: 0,
      blockedCount: 1,
      notAttemptedCount: 0,
    },
    blockers: ['Visible screenshot capture failed.'],
  }
}

test('generates platform Computer Use capture queue without promoting gameplay proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-computer-use-work-order-'))
  await writeJson(path.join(root, 'release-readiness', 'gameplay-acceptance-matrix.json'), matrixFixture())
  await writeJson(path.join(root, 'release-readiness', 'computer-use-gameplay-capture-attempts.json'), {
    schemaVersion: 'echo.release_index.computer_use_gameplay_capture_attempts.v1',
    generatedAt: '2026-06-17T20:02:00.000Z',
    attemptCount: 1,
    latestAttemptId: 'ashfall-neoforge-visible-attempt',
    attempts: [attemptFixture()],
  })

  const result = run(['--root', root, '--write'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Computer Use gameplay capture work order OPEN/u)

  const workOrder = await readJson(path.join(root, 'release-readiness', 'computer-use-gameplay-capture-work-order.json'))
  assert.equal(workOrder.schemaVersion, 'echo.release_index.computer_use_gameplay_capture_work_order.v1')
  assert.equal(workOrder.status, 'OPEN')
  assert.equal(workOrder.summary.laneCount, 3)
  assert.equal(workOrder.summary.openLaneCount, 3)
  assert.equal(workOrder.summary.attemptCount, 1)
  assert.equal(workOrder.summary.targetsWithAttempts, 1)

  const ashfallNative = workOrder.targets.find((target) => target.packId === 'ashfall-native-edition')
  assert.ok(ashfallNative.verificationChecks.some((entry) => entry.id === 'mainMenuNativeReplacement'))
  assert.ok(ashfallNative.verificationChecks.some((entry) => entry.id === 'inventoryIndexVisible'))
  assert.match(ashfallNative.computerUseRecorderCommand, /record-computer-use-gameplay-capture-attempt\.mjs/u)
  assert.match(ashfallNative.computerUseRecorderCommand, /mainMenuNativeReplacement/u)
  assert.match(ashfallNative.captureCommands.importOrRefresh.join('\n'), /assist:ashfall-computer-use-proof/u)
  assert.match(ashfallNative.captureCommands.importOrRefresh.join('\n'), /--claim "<claim>=<captured-screenshot\.png>"/u)
  assert.match(ashfallNative.captureCommands.importOrRefresh.join('\n'), /--action "<visible UI action>"/u)
  assert.equal(ashfallNative.latestComputerUseAttempt, null)

  const ashfallNeoForge = workOrder.targets.find((target) => target.packId === 'ashfall-neoforge-edition')
  assert.equal(ashfallNeoForge.latestComputerUseAttempt.attemptId, 'ashfall-neoforge-visible-attempt')
  assert.equal(ashfallNeoForge.latestComputerUseAttempt.acceptedAsGameplayProof, false)
  assert.equal(ashfallNeoForge.latestComputerUseAttempt.claimsPromoted, false)
  assert.equal(
    ashfallNeoForge.verificationChecks.find((entry) => entry.id === 'hudVisible').currentAttempt.status,
    'blocked',
  )
  assert.ok(!ashfallNeoForge.verificationChecks.some((entry) => entry.id === 'mainMenuNativeReplacement'))

  const openlands = workOrder.targets.find((target) => target.packId === 'openlands-native-edition')
  assert.ok(openlands.verificationChecks.some((entry) => entry.id === 'primaryObjectiveCompleted'))
  assert.ok(openlands.verificationChecks.some((entry) => entry.id === 'inventoryIndexVisible'))
  assert.match(openlands.captureCommands.prepare.join('\n'), /prepare-family-gameplay-capture\.mjs/u)

  const markdown = await fs.readFile(path.join(root, 'docs', 'computer-use-gameplay-capture-work-order.md'), 'utf8')
  assert.match(markdown, /Computer Use Gameplay Capture Work Order/u)
  assert.match(markdown, /Openlands Native/u)
  assert.match(markdown, /Inventory Index visible/u)

  const noWrite = run(['--root', root, '--no-markdown', '--json'])
  assert.equal(noWrite.status, 0, `${noWrite.stdout}\n${noWrite.stderr}`)
  const printed = JSON.parse(noWrite.stdout)
  assert.equal(printed.summary.laneCount, 3)

  await fs.rm(root, { recursive: true, force: true })
})
