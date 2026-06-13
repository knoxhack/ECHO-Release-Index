import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const downloader = path.join(repoRoot, 'scripts', 'download-native-sdk-rc1-artifacts.mjs')
const releaseLine = '1.0.0-RC1'

const artifactNames = [
  `echo-native-contracts-${releaseLine}.jar`,
  `echo-native-contracts-${releaseLine}-sources.jar`,
  `echo-native-contracts-${releaseLine}-javadoc.jar`,
  `echoaddonapi-${releaseLine}.jar`,
  `echoaddonapi-${releaseLine}-sources.jar`,
  `echoaddonapi-${releaseLine}-javadoc.jar`,
  `echoadaptercore-${releaseLine}.jar`,
  `echoadaptercore-${releaseLine}-sources.jar`,
  `echoadaptercore-${releaseLine}-javadoc.jar`,
  `echo-native-testkit-${releaseLine}.jar`,
  `echo-native-testkit-${releaseLine}-sources.jar`,
  `echo-native-testkit-${releaseLine}-javadoc.jar`,
  `echo-sdk-gradle-plugin-${releaseLine}.jar`,
  `echo-sdk-gradle-plugin-${releaseLine}-sources.jar`,
  `echo-sdk-gradle-plugin-${releaseLine}-javadoc.jar`
]

function run(root, mirrorRoot, args = []) {
  return spawnSync(process.execPath, [
    downloader,
    '--root',
    root,
    '--mirror-root',
    mirrorRoot,
    ...args
  ], {
    encoding: 'utf8',
    windowsHide: true
  })
}

async function writeJson(root, relPath, payload) {
  const target = path.join(root, relPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function writeFixture(root, mirrorRoot, overrides = {}) {
  await fs.mkdir(mirrorRoot, { recursive: true })
  const artifacts = {}

  for (const [index, name] of artifactNames.entries()) {
    const bytes = Buffer.from(`native sdk rc1 fixture ${name}\n`, 'utf8')
    await fs.writeFile(path.join(mirrorRoot, name), bytes)
    artifacts[`artifact${index}`] = {
      file: name,
      url: `https://github.com/knoxhack/ECHO-SDK/releases/download/v${releaseLine}/${name}`,
      size: overrides.size?.[name] ?? bytes.length,
      sha256: overrides.sha256?.[name] ?? crypto.createHash('sha256').update(bytes).digest('hex')
    }
  }

  await writeJson(root, 'products/native-sdk.json', {
    id: 'echo-native-sdk',
    kind: 'product',
    version: releaseLine,
    channel: 'beta',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-SDK',
    releaseTag: `v${releaseLine}`,
    commitSha: 'a'.repeat(40),
    artifacts,
    provenance: {
      status: 'source-linked-prerelease',
      releaseUrl: `https://github.com/knoxhack/ECHO-SDK/releases/tag/v${releaseLine}`,
      releaseTargetCommit: 'a'.repeat(40)
    },
    trust: 'source-linked',
    validation: 'warning'
  })
}

async function withFixture(name, body) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `echo-sdk-download-${name}-`))
  const mirrorRoot = path.join(root, 'mirror')
  try {
    await body({ root, mirrorRoot })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

await withFixture('pass', async ({ root, mirrorRoot }) => {
  await writeFixture(root, mirrorRoot)
  const result = run(root, mirrorRoot, ['--write', '--require-release-ready'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, 'echo.native_sdk.rc1-download-smoke.v1')
  assert.equal(report.status, 'PASS')
  assert.equal(report.mode, 'mirror')
  assert.equal(report.summary.artifactCount, 15)
  assert.equal(report.summary.downloadedCount, 15)
  assert.equal(report.summary.matchedCount, 15)
  assert.equal(report.gates.catalogEntry, 'passed')
  assert.equal(report.gates.artifactSetComplete, 'passed')
  assert.equal(report.gates.downloadBackArtifacts, 'passed')
  assert.equal(report.gates.checksumMatch, 'passed')
  assert.equal(report.artifacts.length, 15)
  assert.ok(report.artifacts.every((artifact) => artifact.matches))
  await fs.stat(path.join(root, 'release-readiness', 'native-sdk-rc1-download-smoke.json'))
})

await withFixture('checksum-blocked', async ({ root, mirrorRoot }) => {
  await writeFixture(root, mirrorRoot, {
    sha256: {
      [artifactNames[0]]: '0'.repeat(64)
    }
  })
  const result = run(root, mirrorRoot, ['--require-release-ready'])
  assert.notEqual(result.status, 0, 'require-release-ready must fail when a checksum mismatches')
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'BLOCKED')
  assert.equal(report.summary.artifactCount, 15)
  assert.equal(report.summary.downloadedCount, 15)
  assert.equal(report.summary.matchedCount, 14)
  assert.equal(report.gates.downloadBackArtifacts, 'passed')
  assert.equal(report.gates.checksumMatch, 'blocked')
  assert.ok(report.blockers.some((blocker) => blocker.includes('sha256 mismatch')))
})

console.log('Native SDK RC1 download smoke fixtures passed.')
