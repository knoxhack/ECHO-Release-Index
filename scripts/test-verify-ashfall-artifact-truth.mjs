#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'verify-ashfall-artifact-truth.mjs')
const sha = 'c'.repeat(64)

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function run(root, extraArgs = []) {
  return spawnSync(process.execPath, [script, '--root', root, ...extraArgs], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

function modpackEntry(validation, artifacts) {
  return {
    id: 'ashfall-native-edition',
    kind: 'modpack',
    version: '0.1.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Ashfall-Native-Edition',
    releaseTag: 'v0.1.0-ashfall-native-edition',
    commitSha: 'abc1234',
    artifacts,
    dependencies: [],
    compatibility: ['native'],
    trust: 'source-linked',
    validation,
  }
}

function artifact(name) {
  return {
    file: name,
    name,
    size: 10,
    sha256: sha,
    url: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0/${name}`,
    browserDownloadUrl: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0/${name}`,
  }
}

async function writeFixture(root, validation, assetNames) {
  const assets = assetNames.map(artifact)
  const artifacts = {}
  for (const asset of assets) {
    if (/\.zip$/u.test(asset.name)) artifacts.pack = asset
    else if (/\.pack\.json$|^manifest\.json$/u.test(asset.name)) artifacts.manifest = asset
    else if (/^checksums\./u.test(asset.name)) artifacts.checksums = asset
    else if (asset.name === 'echo-release.json') artifacts.releaseManifest = asset
  }
  await writeJson(root, 'modpacks/ashfall-native.json', modpackEntry(validation, artifacts))
  await writeJson(root, 'packs/ashfall-native-edition.json', {
    schemaVersion: 1,
    id: 'ashfall-native-edition',
    name: 'Ashfall Native Edition',
    channel: 'alpha',
    loader: 'echo-native-loader',
    assets,
  })
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-truth-test-'))
try {
  const approvedPlaceholderRoot = path.join(root, 'approved-placeholder')
  await writeFixture(approvedPlaceholderRoot, 'approved', [
    'checksums.txt',
    'manifest.json',
    'echo-native-product-1.0.0-existing-layout-rc.zip',
  ])
  const approvedPlaceholder = run(approvedPlaceholderRoot)
  assert.equal(approvedPlaceholder.status, 1)
  assert.match(`${approvedPlaceholder.stdout}\n${approvedPlaceholder.stderr}`, /placeholder filename/u)
  assert.match(`${approvedPlaceholder.stdout}\n${approvedPlaceholder.stderr}`, /missing echo-release\.json/u)

  const warningPlaceholderRoot = path.join(root, 'warning-placeholder')
  await writeFixture(warningPlaceholderRoot, 'warning', [
    'checksums.txt',
    'manifest.json',
    'echo-native-product-1.0.0-existing-layout-rc.zip',
  ])
  const warningPlaceholder = run(warningPlaceholderRoot)
  assert.equal(warningPlaceholder.status, 0, `${warningPlaceholder.stdout}\n${warningPlaceholder.stderr}`)
  assert.match(`${warningPlaceholder.stdout}\n${warningPlaceholder.stderr}`, /passed with/u)

  const releaseReadyRoot = path.join(root, 'release-ready')
  await writeFixture(releaseReadyRoot, 'approved', [
    'checksums.txt',
    'echo-release.json',
    'ashfall-native-edition-alpha-0.1.0.pack.json',
    'ashfall-native-edition-0.1.0.zip',
  ])
  const releaseReady = run(releaseReadyRoot)
  assert.equal(releaseReady.status, 0, `${releaseReady.stdout}\n${releaseReady.stderr}`)

  const requireReadyPlaceholder = run(warningPlaceholderRoot, ['--require-release-ready'])
  assert.equal(requireReadyPlaceholder.status, 1)
  assert.match(`${requireReadyPlaceholder.stdout}\n${requireReadyPlaceholder.stderr}`, /release-ready promotion requires approved validation/u)
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('Ashfall artifact truth verifier fixtures passed.')
