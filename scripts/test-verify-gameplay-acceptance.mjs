#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const repoRoot = process.cwd()
const verifier = path.join(repoRoot, 'scripts', 'verify-gameplay-acceptance.mjs')
const lanes = ['native', 'neoforge', 'standalone']

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
      manualEvidence: `fixtures/${prefix}/gameplay-qa/manual-evidence.json`,
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
      evidencePath: `fixtures/${prefix}/${lane}/gameplay-evidence.json`,
    })),
  }
}

test('strict mode fails when required gameplay evidence is missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-gameplay-acceptance-missing-'))
  await fs.mkdir(path.join(root, 'release-readiness'), { recursive: true })

  const result = spawnVerifier(root, ['--strict', '--no-write'])
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(`${result.stdout}\n${result.stderr}`, /Gameplay acceptance BLOCKED/u)

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

  const result = spawnVerifier(root, ['--strict', '--out', out])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Gameplay acceptance PASS/u)

  const report = await readJson(out)
  assert.equal(report.schemaVersion, 'echo.gameplay.acceptance.v1')
  assert.equal(report.status, 'PASS')
  assert.equal(report.summary.familyCount, 5)
  assert.equal(report.summary.laneCount, 15)
  assert.equal(report.summary.blockerCount, 0)

  await fs.rm(root, { recursive: true, force: true })
})
