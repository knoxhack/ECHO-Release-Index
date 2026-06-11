#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'generate-sky-relay-manual-gameplay-work-order.mjs')

const requiredPaths = {
  supportingFiles: [
    'fixtures/sky-relay/gameplay-qa/evidence/fresh-world-notes.md',
    'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md',
    'fixtures/sky-relay/gameplay-qa/evidence/first-2-hours-notes.md',
    'fixtures/sky-relay/gameplay-qa/evidence/signal-crown-verification.md',
    'fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md',
  ],
  screenshots: [
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png',
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png',
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-2-hours.png',
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png',
  ],
  logs: [
    'fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log',
    'fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log',
  ],
  saveSnapshots: [
    'fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip',
    'fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip',
    'fixtures/sky-relay/gameplay-qa/evidence/saves/signal-crown-save.zip',
  ],
}

const artifact = {
  artifactAsset: 'sky-relay-native-edition-0.1.0.zip',
  artifactSha256: '8cf781726f5cfbd1e9d87c0c8eb3c1fc502c1e6459d66a697941f814b0fa71fa',
  artifactSize: 39163330,
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function checked(paths) {
  return paths.map((relPath, index) => ({
    path: relPath,
    size: 100 + index,
    sha256: String(index).padStart(64, 'a').slice(0, 64),
  }))
}

function reportFixture(status = 'BLOCKED') {
  const pass = status === 'PASS'
  const claims = {
    realFirst30Playthrough: pass,
    realFirst2HourPlaythrough: pass,
    realSignalCrownPlaythrough: pass,
    freshWorldCreated: pass,
    saveReloadVerified: pass,
    noCrashEvidence: pass,
  }
  const sessions = [
    ['fresh_world_creation', 'freshWorldCreated', 2],
    ['first_30_minutes', 'realFirst30Playthrough', 31],
    ['first_2_hours', 'realFirst2HourPlaythrough', 125],
    ['signal_crown_completion', 'realSignalCrownPlaythrough', 15],
    ['save_reload_verification', 'saveReloadVerified', 2],
    ['no_crash_review', 'noCrashEvidence', 1],
  ].map(([id, claim, durationMinutes]) => ({
    id,
    claim,
    startedAt: pass ? '2026-06-11T00:00:00Z' : '1970-01-01T00:00:00Z',
    endedAt: pass ? '2026-06-11T00:10:00Z' : '1970-01-01T00:01:00Z',
    durationMinutes,
    evidence: {},
  }))
  return {
    schemaVersion: 'echo.skyrelay.gameplay-evidence.v1',
    status,
    moduleId: 'echoskyrelayprotocol',
    gates: {
      routeContractReport: 'passed',
      captureKitReady: 'passed',
      freshWorldCreated: pass ? 'passed' : 'blocked',
    },
    requiredEvidence: {
      editions: [
        {
          source: 'sky-relay-native',
          repository: 'knoxhack/ECHO-Sky-Relay-Native-Edition',
          workspaceDir: 'ECHO-Sky-Relay-Native-Edition',
        },
      ],
      packArtifacts: {
        native: artifact,
      },
    },
    sourceRevisions: {
      editions: {
        native: {
          source: 'sky-relay-native',
          repository: 'knoxhack/ECHO-Sky-Relay-Native-Edition',
          workspaceDir: 'ECHO-Sky-Relay-Native-Edition',
          commit: 'd2b0e38d3a9ac4a49601d3bd735f7cbf92dc1d0e',
          branch: 'feature/sky-relay-gameplay-evidence',
          dirty: false,
          cleanForEvidence: true,
          statusLines: [],
          ignoredStatusLines: [],
          blockingStatusLines: [],
        },
      },
    },
    editions: [
      {
        edition: 'native',
        source: 'sky-relay-native',
        repository: 'knoxhack/ECHO-Sky-Relay-Native-Edition',
        manualEvidence: 'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
        found: true,
        claims,
        run: pass
          ? {
              tester: 'QA',
              releaseTag: 'sky-relay-native-0.1.0-alpha',
              ...artifact,
              launcherChannel: 'alpha',
              worldOrProfile: 'sky-relay-qa',
              installedFrom: 'ECHO Launcher',
              startedAt: '2026-06-11T00:00:00Z',
            }
          : {
              tester: 'TBD',
              releaseTag: 'sky-relay-native-0.1.0-alpha',
              ...artifact,
              launcherChannel: 'alpha',
              worldOrProfile: 'TBD',
              installedFrom: 'ECHO Launcher',
              startedAt: '1970-01-01T00:00:00Z',
            },
        sessions,
        checked: pass
          ? {
              supportingFiles: checked(requiredPaths.supportingFiles),
              screenshots: checked(requiredPaths.screenshots),
              logs: checked(requiredPaths.logs),
              saveSnapshots: checked(requiredPaths.saveSnapshots),
            }
          : {
              supportingFiles: [],
              screenshots: [],
              logs: [],
              saveSnapshots: [],
            },
      },
    ],
    blockers: pass ? [] : [
      'native manual evidence claim realFirst30Playthrough must be true.',
      'native manual evidence must include checked screenshots.',
    ],
  }
}

function run(root, report, out, markdown, extraArgs = []) {
  return spawnSync(process.execPath, [
    script,
    '--report',
    report,
    '--out',
    out,
    '--markdown',
    markdown,
    ...extraArgs,
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sky-relay-work-order-'))
try {
  const blockedReport = 'release-readiness/sky-relay-gameplay-evidence.json'
  const blockedOut = 'release-readiness/sky-relay-manual-gameplay-work-order.json'
  const blockedMarkdown = 'docs/sky-relay-manual-gameplay-work-order.md'
  await writeJson(path.join(tmp, blockedReport), reportFixture('BLOCKED'))
  const blocked = run(tmp, blockedReport, blockedOut, blockedMarkdown, ['--write'])
  assert.equal(blocked.status, 0, `${blocked.stdout}\n${blocked.stderr}`)
  const blockedWorkOrder = JSON.parse(await fs.readFile(path.join(tmp, blockedOut), 'utf8'))
  assert.equal(blockedWorkOrder.status, 'OPEN')
  assert.equal(blockedWorkOrder.totals.openEditions, 1)
  assert.ok(blockedWorkOrder.totals.openTasks > 0)
  const blockedText = await fs.readFile(path.join(tmp, blockedMarkdown), 'utf8')
  assert.match(blockedText, /Sky Relay Manual Gameplay Work Order/u)
  assert.match(blockedText, /node scripts\\verify-manual-gameplay-evidence\.mjs --require-release-ready/u)

  const passReport = 'pass/sky-relay-gameplay-evidence.json'
  const passOut = 'pass/work-order.json'
  const passMarkdown = 'pass/work-order.md'
  await writeJson(path.join(tmp, passReport), reportFixture('PASS'))
  const pass = run(tmp, passReport, passOut, passMarkdown, ['--write'])
  assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`)
  const passWorkOrder = JSON.parse(await fs.readFile(path.join(tmp, passOut), 'utf8'))
  assert.equal(passWorkOrder.status, 'COMPLETE')
  assert.equal(passWorkOrder.totals.openTasks, 0)

  console.log('Sky Relay manual gameplay work-order generator fixtures passed.')
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}
