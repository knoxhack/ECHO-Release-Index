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
  },
  {
    key: 'neoforge',
    packId: 'sky-relay-neoforge-edition',
    workspaceDir: 'ECHO-Sky-Relay-NeoForge-Edition',
  },
  {
    key: 'standalone',
    packId: 'sky-relay-standalone-edition',
    workspaceDir: 'ECHO-Sky-Relay-Standalone-Edition',
  },
]

const captureKitFiles = [
  'scripts/init-manual-gameplay-evidence.mjs',
  'scripts/verify-manual-gameplay-evidence.mjs',
  'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json',
  'fixtures/sky-relay/gameplay-qa/evidence/CAPTURE_CHECKLIST.md',
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

    for (const relPath of supportingFiles) await writeText(root, relPath)
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
      claims,
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
  assert.equal(nativeEvidence.checked.supportingFiles[0].size, 8)
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
