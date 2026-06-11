#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'verify-sky-relay-gameplay-evidence.mjs')
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
const zipFixture = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])

const editions = [
  {
    key: 'native',
    packId: 'sky-relay-native-edition',
    workspaceDir: 'ECHO-Sky-Relay-Native-Edition',
    releaseTag: 'sky-relay-native-0.1.0-alpha',
  },
  {
    key: 'neoforge',
    packId: 'sky-relay-neoforge-edition',
    workspaceDir: 'ECHO-Sky-Relay-NeoForge-Edition',
    releaseTag: 'sky-relay-neoforge-0.1.0-alpha',
  },
  {
    key: 'standalone',
    packId: 'sky-relay-standalone-edition',
    workspaceDir: 'ECHO-Sky-Relay-Standalone-Edition',
    releaseTag: 'sky-relay-standalone-0.1.0-alpha',
  },
]

const captureKitFiles = [
  'scripts/init-manual-gameplay-evidence.mjs',
  'scripts/verify-manual-gameplay-evidence.mjs',
  'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json',
  'fixtures/sky-relay/gameplay-qa/evidence/CAPTURE_CHECKLIST.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-30-minutes-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-2-hours-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/signal-crown-verification.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/no-crash-review.template.md',
]

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

function noteFixture(relPath) {
  if (relPath.includes('no-crash')) {
    return `# No Crash Review

## Reviewed Files

- Client playthrough log: client-playthrough.log reviewed
- Launcher install log: launcher-install.log reviewed
- Save snapshots: all snapshots opened
- Screenshots: all screenshots reviewed

## Required Checks

- No blocking crash: confirmed
- No world corruption: confirmed
- Save reload verified: confirmed
- Fresh world/profile confirmed: confirmed
- Known non-blocking warnings: none

## Reviewer Notes

- Reviewer: test fixture
- Date: 2026-06-11
- Decision: pass
- Follow-up: none
`
  }
  const routeSection = relPath.includes('signal-crown') ? 'Required Completion Checks' : 'Required Route Checks'
  return `# Gameplay Notes

## Run Identity

- Pack: sky-relay-test-edition
- Release tag: sky-relay-test-0.1.0-alpha
- Tester: test fixture
- Date: 2026-06-11
- World or profile: fixture-world

## ${routeSection}

- Gate reached: confirmed
- Terminal state: confirmed
- Lens scan state: confirmed
- Save state: confirmed

## Evidence Links

- Screenshot: fixture.png
- Save snapshot: fixture.zip
- Client log: client-playthrough.log

## Notes

- Observations: fixture observations recorded
- Issues: none
- Follow-up: none
`
}

function sessionFixture({ supportingFiles, screenshots, logs, saveSnapshots }) {
  const find = (values, pattern) => values.find((relPath) => pattern.test(relPath))
  const clientLog = find(logs, /client/i)
  const launcherLog = find(logs, /(launcher|pack)[-_]?install/i)
  return [
    {
      id: 'first_30_minutes',
      claim: 'realFirst30Playthrough',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T00:31:00Z',
      durationMinutes: 31,
      evidence: {
        notes: find(supportingFiles, /first[-_]?30[-_]?minutes/i),
        screenshot: find(screenshots, /first[-_]?30[-_]?minutes/i),
        saveSnapshot: find(saveSnapshots, /first[-_]?30[-_]?minutes/i),
        clientLog,
      },
    },
    {
      id: 'first_2_hours',
      claim: 'realFirst2HourPlaythrough',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T02:05:00Z',
      durationMinutes: 125,
      evidence: {
        notes: find(supportingFiles, /first[-_]?2[-_]?hours/i),
        screenshot: find(screenshots, /first[-_]?2[-_]?hours/i),
        saveSnapshot: find(saveSnapshots, /first[-_]?2[-_]?hours/i),
        clientLog,
      },
    },
    {
      id: 'signal_crown_completion',
      claim: 'realSignalCrownPlaythrough',
      startedAt: '2026-06-11T02:05:00Z',
      endedAt: '2026-06-11T02:20:00Z',
      durationMinutes: 15,
      evidence: {
        notes: find(supportingFiles, /signal[-_]?crown/i),
        screenshot: find(screenshots, /signal[-_]?crown/i),
        saveSnapshot: find(saveSnapshots, /signal[-_]?crown/i),
        clientLog,
      },
    },
    {
      id: 'save_reload_verification',
      claim: 'saveReloadVerified',
      startedAt: '2026-06-11T02:20:00Z',
      endedAt: '2026-06-11T02:22:00Z',
      durationMinutes: 2,
      evidence: {
        first30SaveSnapshot: find(saveSnapshots, /first[-_]?30[-_]?minutes/i),
        first2HourSaveSnapshot: find(saveSnapshots, /first[-_]?2[-_]?hours/i),
        signalCrownSaveSnapshot: find(saveSnapshots, /signal[-_]?crown/i),
        clientLog,
      },
    },
    {
      id: 'no_crash_review',
      claim: 'noCrashEvidence',
      startedAt: '2026-06-11T02:22:00Z',
      endedAt: '2026-06-11T02:23:00Z',
      durationMinutes: 1,
      evidence: {
        notes: find(supportingFiles, /no[-_]?crash/i),
        clientLog,
        launcherLog,
      },
    },
  ]
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

async function writeRouteReport(root) {
  await writeJson(root, 'release-readiness/sky-relay-gameplay-route-smoke.json', {
    schemaVersion: 'echo.skyrelay.gameplay-route-smoke.v1',
    ok: true,
    gates: {
      first30RouteContract: 'passed',
      first2HourRouteContract: 'passed',
      signalCrownContract: 'passed',
    },
  })
}

async function writeGameplayEvidence(workspaceRoot, options = {}) {
  for (const edition of editions) {
    const root = path.join(workspaceRoot, edition.workspaceDir)
    for (const relPath of captureKitFiles) await writeText(root, relPath)
    const base = 'fixtures/sky-relay/gameplay-qa/evidence'
    const supportingFiles = [
      `${base}/first-30-minutes-notes.md`,
      `${base}/first-2-hours-notes.md`,
      `${base}/signal-crown-verification.md`,
      `${base}/no-crash-review.md`,
    ]
    const screenshots = [
      `${base}/screenshots/first-30-minutes.png`,
      `${base}/screenshots/first-2-hours.png`,
      `${base}/screenshots/signal-crown-complete.png`,
    ]
    const logs = [
      `${base}/logs/client-playthrough.log`,
      `${base}/logs/launcher-install.log`,
    ]
    const saveSnapshots = [
      `${base}/saves/first-30-minutes-save.zip`,
      `${base}/saves/first-2-hours-save.zip`,
      `${base}/saves/signal-crown-save.zip`,
    ]

    for (const relPath of supportingFiles) await writeText(root, relPath, noteFixture(relPath))
    for (const relPath of screenshots) await writeBytes(root, relPath, pngFixture())
    for (const relPath of logs) await writeText(root, relPath)
    for (const relPath of saveSnapshots) await writeBytes(root, relPath, zipFixture)

    const claims = {
      realFirst30Playthrough: true,
      realFirst2HourPlaythrough: true,
      realSignalCrownPlaythrough: true,
      freshWorldCreated: true,
      saveReloadVerified: true,
      noCrashEvidence: true,
      ...(options.claimsByEdition?.[edition.key] ?? {}),
    }

    await writeJson(root, 'fixtures/sky-relay/gameplay-qa/manual-evidence.json', {
      schemaVersion: 'echo.skyrelay.gameplay-qa.manual.v1',
      packId: edition.packId,
      generatedAt: '2026-06-11T00:00:00Z',
      run: {
        tester: 'test fixture',
        releaseTag: edition.releaseTag,
        launcherChannel: 'alpha',
        worldOrProfile: 'fixture-world',
        installedFrom: 'ECHO Launcher',
        startedAt: '2026-06-11T00:00:00Z',
      },
      claims,
      sessions: sessionFixture({ supportingFiles, screenshots, logs, saveSnapshots }),
      supportingFiles,
      screenshots,
      logs,
      saveSnapshots,
    })
  }
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sky-relay-gameplay-evidence-'))
try {
  const missingRoot = path.join(tmp, 'missing-release-index')
  const missingWorkspace = path.join(tmp, 'missing-workspace')
  await writeRouteReport(missingRoot)
  const missing = run(missingRoot, missingWorkspace, ['--require-release-ready'])
  assert.equal(missing.status, 1)
  assert.match(`${missing.stdout}\n${missing.stderr}`, /native manual evidence is missing/u)
  assert.match(`${missing.stdout}\n${missing.stderr}`, /neoforge manual evidence is missing/u)
  assert.match(`${missing.stdout}\n${missing.stderr}`, /standalone manual evidence is missing/u)

  const readyRoot = path.join(tmp, 'ready-release-index')
  const readyWorkspace = path.join(tmp, 'ready-workspace')
  await writeRouteReport(readyRoot)
  await writeGameplayEvidence(readyWorkspace)
  const ready = run(readyRoot, readyWorkspace, ['--require-release-ready'])
  assert.equal(ready.status, 0, `${ready.stdout}\n${ready.stderr}`)
  const readyReport = JSON.parse(ready.stdout)
  assert.equal(readyReport.status, 'PASS')
  assert.equal(readyReport.gates.captureKitReady, 'passed')
  assert.equal(readyReport.captureKits.length, 3)
  assert.equal(readyReport.gates.realFirst30Playthrough, 'passed')
  assert.equal(readyReport.gates.realSignalCrownPlaythrough, 'passed')
  const nativeEvidence = readyReport.editions.find((edition) => edition.edition === 'native')
  assert.match(nativeEvidence.checked.supportingFiles[0].sha256, /^[a-f0-9]{64}$/u)
  assert.ok(nativeEvidence.checked.supportingFiles[0].size > 100)
  assert.equal(nativeEvidence.checked.screenshots[0].size, 33)
  assert.match(nativeEvidence.checked.screenshots[0].sha256, /^[a-f0-9]{64}$/u)
  assert.deepEqual(nativeEvidence.checked.screenshots[0].dimensions, { width: 1280, height: 720 })

  const badClaimRoot = path.join(tmp, 'bad-claim-release-index')
  const badClaimWorkspace = path.join(tmp, 'bad-claim-workspace')
  await writeRouteReport(badClaimRoot)
  await writeGameplayEvidence(badClaimWorkspace, {
    claimsByEdition: {
      native: { realSignalCrownPlaythrough: false },
    },
  })
  const badClaim = run(badClaimRoot, badClaimWorkspace, ['--require-release-ready'])
  assert.equal(badClaim.status, 1)
  assert.match(`${badClaim.stdout}\n${badClaim.stderr}`, /native manual evidence claim realSignalCrownPlaythrough must be true/u)

  const templateMarkerRoot = path.join(tmp, 'template-marker-release-index')
  const templateMarkerWorkspace = path.join(tmp, 'template-marker-workspace')
  await writeRouteReport(templateMarkerRoot)
  await writeGameplayEvidence(templateMarkerWorkspace)
  await writeText(
    path.join(templateMarkerWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md',
    'ECHO_SKY_RELAY_TEMPLATE_ONLY\n',
  )
  const templateMarker = run(templateMarkerRoot, templateMarkerWorkspace, ['--require-release-ready'])
  assert.equal(templateMarker.status, 1)
  assert.match(`${templateMarker.stdout}\n${templateMarker.stderr}`, /template marker ECHO_SKY_RELAY_TEMPLATE_ONLY/u)

  const missingSessionRoot = path.join(tmp, 'missing-session-release-index')
  const missingSessionWorkspace = path.join(tmp, 'missing-session-workspace')
  await writeRouteReport(missingSessionRoot)
  await writeGameplayEvidence(missingSessionWorkspace)
  const missingSessionEvidencePath = path.join(
    missingSessionWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const missingSessionEvidence = JSON.parse(await fs.readFile(missingSessionEvidencePath, 'utf8'))
  missingSessionEvidence.sessions = missingSessionEvidence.sessions.filter((session) => session.id !== 'save_reload_verification')
  await fs.writeFile(missingSessionEvidencePath, `${JSON.stringify(missingSessionEvidence, null, 2)}\n`, 'utf8')
  const missingSession = run(missingSessionRoot, missingSessionWorkspace, ['--require-release-ready'])
  assert.equal(missingSession.status, 1)
  assert.match(`${missingSession.stdout}\n${missingSession.stderr}`, /native manual evidence sessions must include save_reload_verification/u)

  const shortSessionRoot = path.join(tmp, 'short-session-release-index')
  const shortSessionWorkspace = path.join(tmp, 'short-session-workspace')
  await writeRouteReport(shortSessionRoot)
  await writeGameplayEvidence(shortSessionWorkspace)
  const shortSessionEvidencePath = path.join(
    shortSessionWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const shortSessionEvidence = JSON.parse(await fs.readFile(shortSessionEvidencePath, 'utf8'))
  const shortSessionRecord = shortSessionEvidence.sessions.find((session) => session.id === 'first_30_minutes')
  shortSessionRecord.endedAt = '2026-06-11T00:05:00Z'
  shortSessionRecord.durationMinutes = 5
  await fs.writeFile(shortSessionEvidencePath, `${JSON.stringify(shortSessionEvidence, null, 2)}\n`, 'utf8')
  const shortSession = run(shortSessionRoot, shortSessionWorkspace, ['--require-release-ready'])
  assert.equal(shortSession.status, 1)
  assert.match(`${shortSession.stdout}\n${shortSession.stderr}`, /first_30_minutes.*durationMinutes must be at least 30/u)

  const blankFieldRoot = path.join(tmp, 'blank-field-release-index')
  const blankFieldWorkspace = path.join(tmp, 'blank-field-workspace')
  await writeRouteReport(blankFieldRoot)
  await writeGameplayEvidence(blankFieldWorkspace)
  await writeText(
    path.join(blankFieldWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md',
    noteFixture('first-30-minutes-notes.md').replace('- Tester: test fixture', '- Tester:'),
  )
  const blankField = run(blankFieldRoot, blankFieldWorkspace, ['--require-release-ready'])
  assert.equal(blankField.status, 1)
  assert.match(`${blankField.stdout}\n${blankField.stderr}`, /blank worksheet fields/u)

  const missingSectionRoot = path.join(tmp, 'missing-section-release-index')
  const missingSectionWorkspace = path.join(tmp, 'missing-section-workspace')
  await writeRouteReport(missingSectionRoot)
  await writeGameplayEvidence(missingSectionWorkspace)
  await writeText(
    path.join(missingSectionWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md',
    noteFixture('first-30-minutes-notes.md').replace('## Evidence Links\n\n', ''),
  )
  const missingSection = run(missingSectionRoot, missingSectionWorkspace, ['--require-release-ready'])
  assert.equal(missingSection.status, 1)
  assert.match(`${missingSection.stdout}\n${missingSection.stderr}`, /missing section ## Evidence Links/u)

  const lowResolutionRoot = path.join(tmp, 'low-resolution-release-index')
  const lowResolutionWorkspace = path.join(tmp, 'low-resolution-workspace')
  await writeRouteReport(lowResolutionRoot)
  await writeGameplayEvidence(lowResolutionWorkspace)
  await writeBytes(
    path.join(lowResolutionWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png',
    pngFixture(320, 180),
  )
  const lowResolution = run(lowResolutionRoot, lowResolutionWorkspace, ['--require-release-ready'])
  assert.equal(lowResolution.status, 1)
  assert.match(`${lowResolution.stdout}\n${lowResolution.stderr}`, /PNG dimensions must be at least 640x360/u)
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}

console.log('Sky Relay gameplay evidence verifier fixtures passed.')
