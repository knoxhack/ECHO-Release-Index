#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'promote-sky-relay-public-alpha.mjs')
const editions = [
  ['native', 'sky-relay-native-edition', 'ECHO-Sky-Relay-Native-Edition', 'sky-relay-native-0.1.0-alpha'],
  ['neoforge', 'sky-relay-neoforge-edition', 'ECHO-Sky-Relay-NeoForge-Edition', 'sky-relay-neoforge-0.1.0-alpha'],
  ['standalone', 'sky-relay-standalone-edition', 'ECHO-Sky-Relay-Standalone-Edition', 'sky-relay-standalone-0.1.0-alpha'],
]

const requiredClaims = [
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'realSignalCrownPlaythrough',
  'freshWorldCreated',
  'saveReloadVerified',
  'noCrashEvidence',
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

function run(root, extraArgs = []) {
  return spawnSync(process.execPath, [
    script,
    '--root',
    root,
    ...extraArgs,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function artifact(file, repository, tag, sha256 = 'a'.repeat(64), size = 1234) {
  return {
    file,
    url: `https://github.com/knoxhack/${repository}/releases/download/${tag}/${file}`,
    sha256,
    size,
  }
}

function assetRecord(file, repository, tag, sha256 = 'a'.repeat(64), size = 1234) {
  return {
    name: file,
    size,
    sha256,
    browserDownloadUrl: `https://github.com/knoxhack/${repository}/releases/download/${tag}/${file}`,
  }
}

function readinessFixture(status = 'PASS') {
  const passed = status === 'PASS'
  return {
    schemaVersion: 'echo.skyrelay.public-alpha-readiness.v1',
    status,
    generatedAt: '2026-06-11T20:00:00Z',
    phaseSummary: Array.from({ length: 10 }, (_, index) => ({
      phase: index + 1,
      id: `phase_${index + 1}`,
      status: passed ? 'passed' : index === 9 ? 'blocked' : 'passed',
    })),
    gates: {
      repo_foundation: 'passed',
      protocol_module: 'passed',
      identity_metadata: 'passed',
      core_blocks: 'passed',
      core_items: 'passed',
      fragments_world_loop: 'passed',
      player_progression: 'passed',
      systems_integration: 'passed',
      editions_launcher: 'passed',
      release_public_alpha: passed ? 'passed' : 'blocked',
    },
    promotion: {
      eligible: passed,
      warningValidationCanBeRemoved: passed,
      publicAlphaCanBeDeclaredReady: passed,
    },
    blockers: passed ? [] : ['gameplay evidence report must be PASS before public alpha promotion'],
  }
}

function checked(paths) {
  return paths.map((relPath, index) => ({
    path: relPath,
    size: 100 + index,
    sha256: String(index).padStart(64, 'b').slice(0, 64),
  }))
}

function gameplayFixture(status = 'PASS') {
  const passed = status === 'PASS'
  const claims = Object.fromEntries(requiredClaims.map((claim) => [claim, passed]))
  return {
    schemaVersion: 'echo.skyrelay.gameplay-evidence.v1',
    status,
    gates: {
      routeContractReport: 'passed',
      captureKitReady: 'passed',
      freshWorldCreated: passed ? 'passed' : 'blocked',
      realFirst30Playthrough: passed ? 'passed' : 'blocked',
      realFirst2HourPlaythrough: passed ? 'passed' : 'blocked',
      realSignalCrownPlaythrough: passed ? 'passed' : 'blocked',
      saveReloadVerified: passed ? 'passed' : 'blocked',
      noCrashEvidence: passed ? 'passed' : 'blocked',
    },
    requiredEvidence: {
      packArtifacts: Object.fromEntries(Object.entries(artifactByEdition).map(([key, value]) => [key, value])),
    },
    editions: editions.map(([key, packId]) => ({
      edition: key,
      source: `sky-relay-${key}`,
      repository: `knoxhack/ECHO-Sky-Relay-${key}-Edition`,
      manualEvidence: 'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
      found: true,
      claims,
      checked: passed
        ? {
            supportingFiles: checked([`fixtures/sky-relay/gameplay-qa/evidence/${key}-notes.md`]),
            screenshots: checked([`fixtures/sky-relay/gameplay-qa/evidence/screenshots/${key}.png`]),
            logs: checked([`fixtures/sky-relay/gameplay-qa/evidence/logs/${key}.log`]),
            saveSnapshots: checked([`fixtures/sky-relay/gameplay-qa/evidence/saves/${key}.zip`]),
          }
        : {
            supportingFiles: [],
            screenshots: [],
            logs: [],
            saveSnapshots: [],
          },
      run: {
        releaseTag: `${packId}-0.1.0-alpha`,
      },
    })),
    blockers: passed ? [] : ['gameplay evidence report must be PASS before public alpha promotion'],
  }
}

function workOrderFixture(status = 'COMPLETE') {
  const complete = status === 'COMPLETE'
  return {
    schemaVersion: 'echo.skyrelay.manual-gameplay-work-order.v1',
    status,
    totals: {
      openEditions: complete ? 0 : 3,
      openTasks: complete ? 0 : 24,
    },
    editions: editions.map(([key]) => ({
      edition: key,
      status: complete ? 'complete' : 'open',
    })),
  }
}

function addonFixture() {
  const tag = 'sky-relay-0.1.0-alpha'
  return {
    id: 'echoskyrelayprotocol',
    kind: 'addon',
    version: '0.1.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Modules',
    releaseTag: tag,
    commitSha: 'ea45c08c611abbb2331ec3a3e0ebda91c51ca1ee',
    artifacts: {
      native: artifact('echoskyrelayprotocol-0.1.0.echo-addon', 'ECHO-Modules', tag),
      neoforge: artifact('echoskyrelayprotocol-0.1.0-neoforge.jar', 'ECHO-Modules', tag),
      standalone: artifact('echoskyrelayprotocol-0.1.0-standalone.jar', 'ECHO-Modules', tag),
      sources: artifact('echoskyrelayprotocol-0.1.0-sources.jar', 'ECHO-Modules', tag),
      checksums: artifact('checksums.sha256', 'ECHO-Modules', tag),
      releaseManifest: artifact('echo-release.json', 'ECHO-Modules', tag),
    },
    dependencies: [{ id: 'echocore', kind: 'module', version: '>=1.0.0' }],
    compatibility: editions.map(([, packId]) => packId),
    trust: 'echo-workflow-built',
    validation: 'warning',
  }
}

function modpackFixture(key, packId, repoName, tag) {
  const packArtifact = artifactByEdition[key]
  return {
    id: packId,
    kind: 'modpack',
    version: '0.1.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: `knoxhack/${repoName}`,
    releaseTag: tag,
    commitSha: 'd2b0e38d3a9ac4a49601d3bd735f7cbf92dc1d0e',
    artifacts: {
      pack: artifact(packArtifact.artifactAsset, repoName, tag, packArtifact.artifactSha256, packArtifact.artifactSize),
      manifest: artifact(`${packId}-alpha-0.1.0.pack.json`, repoName, tag, 'c'.repeat(64), 12345),
      checksums: artifact('checksums.txt', repoName, tag, 'd'.repeat(64), 400),
      releaseManifest: artifact('echo-release.json', repoName, tag, 'e'.repeat(64), 4500),
      buildReport: artifact('sky-relay-pack-build-report.json', repoName, tag, 'f'.repeat(64), 6000),
    },
    dependencies: [{ id: 'echoskyrelayprotocol', kind: 'addon', version: '0.1.0' }],
    compatibility: [key, 'sky-relay'],
    trust: 'echo-workflow-built',
    validation: 'warning',
  }
}

function packFixture(packId) {
  return {
    schemaVersion: 1,
    id: packId,
    name: packId,
    channel: 'alpha',
    loader: 'fixture',
    moduleArtifactFamily: 'fixture',
    moduleArtifactPattern: '<module>',
    moduleRequirements: [{ id: 'echoskyrelayprotocol', version: '0.1.0' }],
    assets: [],
  }
}

async function writeFixture(root, status = 'PASS') {
  await writeJson(root, 'release-readiness/sky-relay-public-alpha-readiness.json', readinessFixture(status === 'PASS' ? 'PASS' : 'BLOCKED'))
  await writeJson(root, 'release-readiness/sky-relay-gameplay-evidence.json', gameplayFixture(status === 'PASS' ? 'PASS' : 'BLOCKED'))
  await writeJson(root, 'release-readiness/sky-relay-manual-gameplay-work-order.json', workOrderFixture(status === 'PASS' ? 'COMPLETE' : 'OPEN'))
  await writeJson(root, 'addons/echoskyrelayprotocol.json', addonFixture())
  for (const [key, packId, repoName, tag] of editions) {
    const fileKey = key === 'native' ? 'native' : key === 'neoforge' ? 'neoforge' : 'standalone'
    await writeJson(root, `modpacks/sky-relay-${fileKey}.json`, modpackFixture(key, packId, repoName, tag))
    await writeJson(root, `packs/${packId}.json`, packFixture(packId))
  }
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sky-relay-promote-public-alpha-'))
try {
  const blockedRoot = path.join(tmp, 'blocked')
  await writeFixture(blockedRoot, 'BLOCKED')
  const blocked = run(blockedRoot, ['--write'])
  assert.equal(blocked.status, 1)
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /promotion refused/u)
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /readiness status must be PASS/u)

  const passRoot = path.join(tmp, 'pass')
  await writeFixture(passRoot, 'PASS')
  const dry = run(passRoot)
  assert.equal(dry.status, 0, `${dry.stdout}\n${dry.stderr}`)
  assert.equal(JSON.parse(await fs.readFile(path.join(passRoot, 'addons/echoskyrelayprotocol.json'), 'utf8')).validation, 'warning')

  const written = run(passRoot, ['--write'])
  assert.equal(written.status, 0, `${written.stdout}\n${written.stderr}`)
  const addon = JSON.parse(await fs.readFile(path.join(passRoot, 'addons/echoskyrelayprotocol.json'), 'utf8'))
  assert.equal(addon.validation, 'approved')
  assert.equal(addon.trust, 'source-linked')
  assert.match(addon.validationReason, /real manual gameplay evidence/u)
  assert.ok(addon.promotionEvidence.reports.includes('release-readiness/sky-relay-public-alpha-readiness.json'))

  for (const [key, packId] of editions) {
    const modpack = JSON.parse(await fs.readFile(path.join(passRoot, `modpacks/sky-relay-${key}.json`), 'utf8'))
    assert.equal(modpack.validation, 'approved')
    assert.equal(modpack.trust, 'source-linked')
    const pack = JSON.parse(await fs.readFile(path.join(passRoot, `packs/${packId}.json`), 'utf8'))
    assert.equal(pack.releaseReadiness.status, 'approved')
    assert.deepEqual(pack.releaseReadiness.blockers, [])
    assert.equal(pack.assets.length, 5)
    assert.ok(pack.assets.every((asset) => asset.browserDownloadUrl.startsWith('https://github.com/')))
  }

  console.log('Sky Relay public-alpha promotion fixtures passed.')
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}
