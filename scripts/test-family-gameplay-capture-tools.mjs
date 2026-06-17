#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const repoRoot = process.cwd()
const prepareScript = path.join(repoRoot, 'scripts', 'prepare-family-gameplay-capture.mjs')
const importScript = path.join(repoRoot, 'scripts', 'import-family-gameplay-capture.mjs')
const generatorScript = path.join(repoRoot, 'scripts', 'generate-family-gameplay-evidence.mjs')
const lanes = ['native', 'neoforge', 'standalone']

function run(script, args, cwd = repoRoot) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
}

async function writeRealCaptureFiles(captureRoot) {
  const textFiles = [
    'evidence/notes/fresh-world.md',
    'evidence/notes/first-30-minutes.md',
    'evidence/notes/first-2-hours.md',
    'evidence/notes/primary-objective.md',
    'evidence/notes/no-crash-review.md',
    'evidence/logs/client-playthrough.log',
    'evidence/logs/launcher-install.log',
  ]
  const binaryFiles = [
    'evidence/screenshots/fresh-world.png',
    'evidence/screenshots/first-30-minutes.png',
    'evidence/screenshots/first-2-hours.png',
    'evidence/screenshots/primary-objective.png',
    'evidence/saves/first-30-minutes-save.zip',
    'evidence/saves/first-2-hours-save.zip',
    'evidence/saves/primary-objective-save.zip',
  ]
  for (const relativePath of textFiles) {
    const filePath = path.join(captureRoot, relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `Real gameplay observation for ${relativePath}.\n`, 'utf8')
  }
  for (const relativePath of binaryFiles) {
    const filePath = path.join(captureRoot, relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, Buffer.from(`real binary evidence ${relativePath}`))
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

test('family gameplay capture tools reject placeholders and import real local proof files', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-family-gameplay-capture-'))
  const root = path.join(workspace, 'ECHO-Release-Index')
  await fs.mkdir(root, { recursive: true })
  const artifact = path.join(workspace, 'openlands-native-edition.zip')
  await fs.writeFile(artifact, 'artifact bytes')

  const startedAt = '2026-06-16T20:00:00.000Z'
  const nativeCapture = path.join(workspace, 'capture-native')
  const prep = run(prepareScript, [
    '--root', root,
    '--family', 'openlands',
    '--lane', 'native',
    '--tester', 'QA Tester',
    '--world-or-profile', 'Openlands QA World',
    '--started-at', startedAt,
    '--capture-root', nativeCapture,
  ])
  assert.equal(prep.status, 0, `${prep.stdout}\n${prep.stderr}`)

  const rejected = run(importScript, [
    '--root', root,
    '--family', 'openlands',
    '--lane', 'native',
    '--capture-root', nativeCapture,
    '--artifact', artifact,
    '--tester', 'QA Tester',
    '--world-or-profile', 'Openlands QA World',
    '--started-at', startedAt,
    '--force',
  ])
  assert.notEqual(rejected.status, 0, 'placeholder capture should not import')
  assert.match(rejected.stderr, /template markers/u)

  for (const lane of lanes) {
    const captureRoot = lane === 'native' ? nativeCapture : path.join(workspace, `capture-${lane}`)
    if (lane !== 'native') {
      const prepare = run(prepareScript, [
        '--root', root,
        '--family', 'openlands',
        '--lane', lane,
        '--tester', 'QA Tester',
        '--world-or-profile', 'Openlands QA World',
        '--started-at', startedAt,
        '--capture-root', captureRoot,
      ])
      assert.equal(prepare.status, 0, `${prepare.stdout}\n${prepare.stderr}`)
    }
    await writeRealCaptureFiles(captureRoot)
    const laneArtifact = path.join(workspace, `openlands-${lane}-edition.zip`)
    await fs.writeFile(laneArtifact, `artifact bytes ${lane}`)
    const imported = run(importScript, [
      '--root', root,
      '--family', 'openlands',
      '--lane', lane,
      '--capture-root', captureRoot,
      '--artifact', laneArtifact,
      '--tester', 'QA Tester',
      '--world-or-profile', 'Openlands QA World',
      '--started-at', startedAt,
      '--force',
    ])
    assert.equal(imported.status, 0, `${imported.stdout}\n${imported.stderr}`)
  }

  const evidencePath = path.join(
    workspace,
    'ECHO-Openlands-Native-Edition',
    'fixtures/openlands/gameplay-qa/native/manual-evidence.json',
  )
  const evidence = await readJson(evidencePath)
  assert.equal(evidence.schemaVersion, 'echo.release_index.family_gameplay_manual_evidence.v1')
  assert.equal(evidence.claims.freshWorldCreated, true)
  assert.equal(evidence.supportingFiles.length, 5)

  const generated = run(generatorScript, ['--root', root, '--family', 'openlands', '--no-write', '--json'])
  assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`)
  const [entry] = JSON.parse(generated.stdout)
  assert.equal(entry.report.status, 'PASS')
  assert.equal(entry.report.summary.passedLaneCount, 3)
  assert.equal(entry.report.summary.blockerCount, 0)

  await fs.rm(workspace, { recursive: true, force: true })
})
