import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const verifier = path.join(repoRoot, 'scripts', 'verify-native-sdk-rc1-artifacts.mjs')
const releaseLine = '1.0.0-RC1'

const components = [
  {
    id: 'echo-native-contracts',
    artifactId: 'echo-native-contracts',
    ownerRepo: 'ECHO-Native-Platform',
    sourcePath: 'echo-native-contracts/build/libs'
  },
  {
    id: 'echoaddonapi',
    artifactId: 'echoaddonapi',
    ownerRepo: 'ECHO-Modules',
    sourcePath: 'addons/echoaddonapi/build/libs'
  },
  {
    id: 'echoadaptercore',
    artifactId: 'echoadaptercore',
    ownerRepo: 'ECHO-Modules',
    sourcePath: 'addons/echoadaptercore/build/libs'
  },
  {
    id: 'echo-native-testkit',
    artifactId: 'echo-native-testkit',
    ownerRepo: 'ECHO-Native-Platform',
    sourcePath: 'echo-native-testkit/build/libs'
  },
  {
    id: 'sdk-gradle-plugin',
    artifactId: 'echo-sdk-gradle-plugin',
    ownerRepo: 'ECHO-SDK',
    sourcePath: 'gradle-plugin/echo-addon-gradle-plugin/build/libs'
  }
]

const classifiers = [
  { classifier: 'main', suffix: '.jar' },
  { classifier: 'sources', suffix: '-sources.jar' },
  { classifier: 'javadoc', suffix: '-javadoc.jar' }
]

function fileName(component, classifier) {
  return `${component.artifactId}-${releaseLine}${classifier.suffix}`
}

function run(root, workspaceRoot, args = []) {
  return spawnSync(process.execPath, [verifier, '--root', root, '--workspace-root', workspaceRoot, ...args], {
    encoding: 'utf8',
    windowsHide: true
  })
}

async function writeJson(root, relPath, payload) {
  const target = path.join(root, relPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function writeLocalArtifacts(workspaceRoot, options = {}) {
  const skip = new Set(options.skip ?? [])
  const artifacts = new Map()

  for (const component of components) {
    const dir = path.join(workspaceRoot, component.ownerRepo, component.sourcePath)
    await fs.mkdir(dir, { recursive: true })
    for (const classifier of classifiers) {
      const name = fileName(component, classifier)
      if (skip.has(name)) continue
      const content = Buffer.from(`fixture ${component.id} ${classifier.classifier}\n`, 'utf8')
      const target = path.join(dir, name)
      await fs.writeFile(target, content)
      artifacts.set(name, {
        file: name,
        size: content.length,
        sha256: crypto.createHash('sha256').update(content).digest('hex')
      })
    }
  }

  return artifacts
}

async function writeCatalog(root, artifacts, overrides = {}) {
  await writeJson(root, 'products/native-sdk-public.json', {
    id: 'echo-native-sdk',
    kind: 'product',
    version: releaseLine,
    channel: 'beta',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-SDK',
    releaseTag: 'v1.0.0-RC1',
    commitSha: 'a'.repeat(40),
    trust: overrides.trust ?? 'provenance-attested',
    validation: overrides.validation ?? 'approved',
    artifacts: Object.fromEntries([...artifacts.values()].map((artifact, index) => [
      `artifact${index}`,
      {
        file: artifact.file,
        url: `https://github.com/knoxhack/ECHO-SDK/releases/download/v1.0.0-RC1/${artifact.file}`,
        sha256: artifact.sha256,
        size: artifact.size
      }
    ]))
  })
}

async function writeDownloadSmoke(root, artifacts, overrides = {}) {
  const rows = [...artifacts.values()]
  const blockedFile = overrides.blockedFile
  await writeJson(root, 'release-readiness/native-sdk-rc1-download-smoke.json', {
    schemaVersion: 'echo.native_sdk.rc1-download-smoke.v1',
    status: blockedFile ? 'BLOCKED' : 'PASS',
    generatedAt: '2026-06-13T00:00:00.000Z',
    catalog: 'products/native-sdk-public.json',
    release: {
      id: 'echo-native-sdk',
      version: releaseLine,
      sourceRepo: 'knoxhack/ECHO-SDK',
      releaseTag: 'v1.0.0-RC1',
      releaseUrl: 'https://github.com/knoxhack/ECHO-SDK/releases/tag/v1.0.0-RC1'
    },
    mode: 'mirror',
    downloadRoot: 'tmp/native-sdk-rc1-download',
    summary: {
      artifactCount: rows.length,
      downloadedCount: rows.length,
      matchedCount: blockedFile ? rows.length - 1 : rows.length
    },
    gates: {
      catalogEntry: 'passed',
      artifactSetComplete: rows.length === 15 ? 'passed' : 'blocked',
      downloadBackArtifacts: rows.length === 15 ? 'passed' : 'blocked',
      checksumMatch: blockedFile ? 'blocked' : 'passed'
    },
    artifacts: rows.map((artifact) => ({
      key: artifact.file,
      file: artifact.file,
      url: `https://github.com/knoxhack/ECHO-SDK/releases/download/v1.0.0-RC1/${artifact.file}`,
      downloaded: true,
      downloadPath: `tmp/native-sdk-rc1-download/${artifact.file}`,
      expectedSize: artifact.size,
      size: artifact.size,
      expectedSha256: artifact.sha256,
      sha256: blockedFile === artifact.file ? '0'.repeat(64) : artifact.sha256,
      matches: blockedFile !== artifact.file,
      blockers: blockedFile === artifact.file ? ['sha256 mismatch'] : []
    })),
    blockers: blockedFile ? [`${blockedFile}: sha256 mismatch`] : []
  })
}

async function withFixture(name, body) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), `echo-sdk-artifacts-${name}-`))
  const root = path.join(workspaceRoot, 'ECHO-Release-Index')
  await fs.mkdir(root, { recursive: true })
  try {
    await body({ root, workspaceRoot })
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
}

await withFixture('local-complete-public-missing', async ({ root, workspaceRoot }) => {
  await writeLocalArtifacts(workspaceRoot)
  const result = run(root, workspaceRoot)
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, 'echo.native_sdk.rc1-artifacts.v1')
  assert.equal(report.status, 'BLOCKED')
  assert.equal(report.summary.componentCount, 5)
  assert.equal(report.summary.requiredFileCount, 15)
  assert.equal(report.summary.localPresentFileCount, 15)
  assert.equal(report.summary.publicCatalogMatchedFileCount, 0)
  assert.equal(report.gates.localMainSourceJavadocJars, 'passed')
  assert.equal(report.gates.publicCatalogArtifacts, 'blocked')
  assert.equal(report.gates.downloadBackArtifacts, 'blocked')
  assert.equal(report.gates.stablePublicProvenance, 'blocked')
  assert.ok(report.blockers.some((blocker) => blocker.includes('has no matching public catalog artifact')))
  assert.ok(report.blockers.some((blocker) => blocker.includes('download smoke report is missing')))

  const releaseReady = run(root, workspaceRoot, ['--require-release-ready'])
  assert.notEqual(releaseReady.status, 0, 'require-release-ready must fail without public SDK catalog provenance')
})

await withFixture('missing-local-javadoc', async ({ root, workspaceRoot }) => {
  await writeLocalArtifacts(workspaceRoot, { skip: ['echoadaptercore-1.0.0-RC1-javadoc.jar'] })
  const result = run(root, workspaceRoot)
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'BLOCKED')
  assert.equal(report.summary.localPresentFileCount, 14)
  assert.equal(report.gates.localMainSourceJavadocJars, 'blocked')
  assert.ok(report.blockers.includes('echoadaptercore missing javadoc jar echoadaptercore-1.0.0-RC1-javadoc.jar'))
})

await withFixture('public-provenance-complete', async ({ root, workspaceRoot }) => {
  const artifacts = await writeLocalArtifacts(workspaceRoot)
  await writeCatalog(root, artifacts)
  await writeDownloadSmoke(root, artifacts)
  const result = run(root, workspaceRoot, ['--require-release-ready'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'PASS')
  assert.equal(report.summary.localPresentFileCount, 15)
  assert.equal(report.summary.publicCatalogMatchedFileCount, 15)
  assert.equal(report.summary.downloadBackMatchedFileCount, 15)
  assert.equal(report.summary.stableProvenanceFileCount, 15)
  assert.equal(report.gates.localMainSourceJavadocJars, 'passed')
  assert.equal(report.gates.publicCatalogArtifacts, 'passed')
  assert.equal(report.gates.downloadBackArtifacts, 'passed')
  assert.equal(report.gates.stablePublicProvenance, 'passed')
  assert.equal(report.promotion.stableReleaseCanUseSdkEvidence, true)
  assert.equal(report.downloadSmoke.status, 'PASS')
})

console.log('Native SDK RC1 artifact verifier fixtures passed.')
