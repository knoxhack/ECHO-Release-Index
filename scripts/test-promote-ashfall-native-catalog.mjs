#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'promote-ashfall-native-catalog.mjs')
const requiredAssets = [
  'checksums.txt',
  'echo-release.json',
  'ashfall-native-edition-alpha-0.1.0.pack.json',
  'ashfall-native-edition-0.1.0.zip',
]

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeFile(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value)
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

function githubAsset(name, bytes) {
  return {
    name,
    size: bytes.length,
    sha256: sha256(bytes),
    browserDownloadUrl: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0-ashfall-native-edition/${encodeURIComponent(name)}`,
  }
}

async function writeFixture(root, options = {}) {
  const assets = []
  for (const name of requiredAssets) {
    const bytes = Buffer.from(`${name} fixture\n`, 'utf8')
    await writeFile(root, `tmp/public-alpha-assets/ECHO-Ashfall-Native-Edition/${name}`, bytes)
    assets.push(githubAsset(name, bytes))
  }
  if (options.includePlaceholder) {
    assets.push(githubAsset('echo-native-product-1.0.0-existing-layout-rc.zip', Buffer.from('placeholder\n', 'utf8')))
  }
  await writeJson(root, 'channels/alpha/release-manifest.json', {
    owner: 'knoxhack',
    releaseTag: 'v0.1.0-native-public-alpha',
    repositories: [
      {
        repoName: 'ECHO-Ashfall-Native-Edition',
        product: 'Ashfall Native Edition',
        releaseKind: 'modpack',
        releaseTag: 'v0.1.0-ashfall-native-edition',
        release: {
          id: 10,
          htmlUrl: 'https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/tag/v0.1.0-ashfall-native-edition',
          uploadUrl: 'https://uploads.github.com/repos/knoxhack/ECHO-Ashfall-Native-Edition/releases/10/assets{?name,label}',
          draft: Boolean(options.draft),
          prerelease: true,
        },
        assets,
      },
    ],
  })
  await writeJson(root, 'modpacks/ashfall-native.json', {
    id: 'ashfall-native-edition',
    kind: 'modpack',
    version: '0.1.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Ashfall-Native-Edition',
    releaseTag: 'v0.1.0-ashfall-native-edition',
    commitSha: 'abc1234',
    artifacts: {
      pack: {
        file: 'echo-native-product-1.0.0-existing-layout-rc.zip',
        url: 'https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0-ashfall-native-edition/echo-native-product-1.0.0-existing-layout-rc.zip',
        sha256: 'a'.repeat(64),
        size: 10,
      },
      manifest: {
        file: 'manifest.json',
        url: 'https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0-ashfall-native-edition/manifest.json',
        sha256: 'b'.repeat(64),
        size: 10,
      },
    },
    dependencies: [],
    compatibility: ['native'],
    trust: 'source-linked',
    validation: 'warning',
  })
  await writeJson(root, 'packs/ashfall-native-edition.json', {
    schemaVersion: 1,
    id: 'ashfall-native-edition',
    releaseReadiness: {
      status: 'warning',
      blockers: ['fixture blocker'],
    },
    assets: [
      { name: 'manifest.json', size: 10, sha256: 'b'.repeat(64), browserDownloadUrl: 'https://github.com/fixture/manifest.json' },
    ],
  })
  if (!options.omitSmoke) {
    await writeJson(root, 'release-readiness/ashfall-rc-smoke.json', {
      schemaVersion: 'echo.ashfall.rc-smoke.v1',
      status: 'PASS',
      generatedAt: '2026-06-11T00:00:00Z',
      data: {
        localStagedArtifactSmoke: true,
        draftReleaseDownloaded: true,
        installedFromDownloadedArtifacts: true,
        launcherInstallSmoke: true,
        updateSmoke: true,
        rollbackPlanVerified: true,
        promotedAfterGreen: true,
        artifactSource: 'github-draft-release-download',
        draftDownloadEvidence: {
          path: 'release-readiness/ashfall-draft-download.json',
        },
      },
    })
  }
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-promote-catalog-test-'))
try {
  const passRoot = path.join(tmp, 'pass')
  await writeFixture(passRoot)
  const dry = run(passRoot)
  assert.equal(dry.status, 0, `${dry.stdout}\n${dry.stderr}`)
  assert.equal(JSON.parse(await fs.readFile(path.join(passRoot, 'modpacks/ashfall-native.json'), 'utf8')).validation, 'warning')

  const pass = run(passRoot, ['--write'])
  assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`)
  const modpack = JSON.parse(await fs.readFile(path.join(passRoot, 'modpacks/ashfall-native.json'), 'utf8'))
  assert.equal(modpack.validation, 'approved')
  assert.equal(modpack.version, '0.1.0')
  assert.equal(modpack.artifacts.releaseManifest.file, 'echo-release.json')
  assert.equal(modpack.artifacts.manifest.file, 'ashfall-native-edition-alpha-0.1.0.pack.json')
  assert.equal(modpack.artifacts.pack.file, 'ashfall-native-edition-0.1.0.zip')
  const pack = JSON.parse(await fs.readFile(path.join(passRoot, 'packs/ashfall-native-edition.json'), 'utf8'))
  assert.equal(pack.releaseReadiness.status, 'approved')
  assert.deepEqual(pack.releaseReadiness.blockers, [])
  assert.deepEqual(pack.assets.map((asset) => asset.name), requiredAssets)

  const draftRoot = path.join(tmp, 'draft')
  await writeFixture(draftRoot, { draft: true })
  const draft = run(draftRoot, ['--write'])
  assert.equal(draft.status, 1)
  assert.match(`${draft.stdout}\n${draft.stderr}`, /must be promoted out of draft/u)

  const placeholderRoot = path.join(tmp, 'placeholder')
  await writeFixture(placeholderRoot, { includePlaceholder: true })
  const placeholder = run(placeholderRoot, ['--write'])
  assert.equal(placeholder.status, 1)
  assert.match(`${placeholder.stdout}\n${placeholder.stderr}`, /placeholder\/generic asset/u)

  const smokeRoot = path.join(tmp, 'smoke')
  await writeFixture(smokeRoot, { omitSmoke: true })
  const smoke = run(smokeRoot, ['--write'])
  assert.equal(smoke.status, 1)
  assert.match(`${smoke.stdout}\n${smoke.stderr}`, /RC smoke evidence is missing/u)

  const localSmokeRoot = path.join(tmp, 'local-smoke')
  await writeFixture(localSmokeRoot)
  await writeJson(localSmokeRoot, 'release-readiness/ashfall-rc-smoke.json', {
    schemaVersion: 'echo.ashfall.rc-smoke.v1',
    status: 'PASS_WITH_WARNINGS',
    generatedAt: '2026-06-11T00:00:00Z',
    data: {
      localStagedArtifactSmoke: true,
      draftReleaseDownloaded: false,
      installedFromDownloadedArtifacts: false,
      launcherInstallSmoke: true,
      updateSmoke: true,
      rollbackPlanVerified: true,
      promotedAfterGreen: false,
      artifactSource: 'local-public-alpha-staging',
      draftDownloadEvidence: null,
    },
  })
  const localSmoke = run(localSmokeRoot, ['--write'])
  assert.equal(localSmoke.status, 1)
  assert.match(`${localSmoke.stdout}\n${localSmoke.stderr}`, /artifactSource must be github-draft-release-download/u)
  assert.match(`${localSmoke.stdout}\n${localSmoke.stderr}`, /installedFromDownloadedArtifacts must be true/u)
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}

console.log('Ashfall Native catalog promotion fixtures passed.')
