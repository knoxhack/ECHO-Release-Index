#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-modpack-drift-'))
await fs.mkdir(path.join(root, 'modules'), { recursive: true })
await fs.mkdir(path.join(root, 'modpacks'), { recursive: true })
await fs.mkdir(path.join(root, 'packs'), { recursive: true })
const repo = path.resolve(root, '..', 'ECHO-Fixture-Native-Edition')
const releaseDir = path.join(repo, 'release-assets', 'fixture-tag')
await fs.mkdir(releaseDir, { recursive: true })

await fs.writeFile(path.join(root, 'modules', 'echofixture.json'), JSON.stringify({
  id: 'echofixture',
  kind: 'module',
  version: '1.0.0',
  artifacts: {
    native: {
      file: 'echofixture-1.0.0.echo-addon',
      sha256: 'a'.repeat(64),
      size: 12,
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/test/echofixture-1.0.0.echo-addon',
    },
  },
  compatibility: ['fixture-native-edition'],
}, null, 2))

const modpack = {
  id: 'fixture-native-edition',
  kind: 'modpack',
  sourceRepo: 'knoxhack/ECHO-Fixture-Native-Edition',
  releaseTag: 'fixture-tag',
  artifacts: {
    pack: { file: 'fixture.zip', sha256: 'b'.repeat(64), size: 1 },
    manifest: { file: 'fixture.pack.json', url: 'https://example.invalid/fixture.pack.json', sha256: 'c'.repeat(64), size: 1 },
  },
}
await fs.writeFile(path.join(root, 'modpacks', 'fixture-native.json'), JSON.stringify(modpack, null, 2))
await fs.writeFile(path.join(root, 'packs', 'fixture-native-edition.json'), JSON.stringify({ id: modpack.id, assets: [] }, null, 2))
await fs.writeFile(path.join(releaseDir, 'fixture.pack.json'), JSON.stringify({
  id: modpack.id,
  loader: 'echo-native-loader',
  moduleArtifactFamily: 'echo-addon',
  artifactName: 'fixture.zip',
  artifactSha256: 'b'.repeat(64),
  artifactSize: 1,
  moduleRequirements: [
    {
      id: 'echofixture',
      moduleId: 'echofixture',
      version: '1.0.0',
      artifactFamily: 'echo-addon',
      assetName: 'echofixture-1.0.0.echo-addon',
      artifactName: 'echofixture-1.0.0.echo-addon',
      path: 'addons/echofixture-1.0.0.echo-addon',
      sha256: 'a'.repeat(64),
      size: 12,
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/test/echofixture-1.0.0.echo-addon',
    },
  ],
  files: [
    {
      id: 'echofixture',
      moduleId: 'echofixture',
      version: '1.0.0',
      artifactFamily: 'echo-addon',
      assetName: 'echofixture-1.0.0.echo-addon',
      artifactName: 'echofixture-1.0.0.echo-addon',
      path: 'addons/echofixture-1.0.0.echo-addon',
      sha256: 'a'.repeat(64),
      size: 12,
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/test/echofixture-1.0.0.echo-addon',
    },
  ],
}, null, 2))

const ok = spawnSync(process.execPath, [path.resolve('scripts/verify-modpack-module-artifact-drift.mjs'), '--root', root, '--strict'], {
  cwd: path.resolve('C:/Development/Github/ECHO-Release-Index'),
  encoding: 'utf8',
})
assert.equal(ok.status, 0, ok.stderr)

const otherRepo = path.resolve(root, '..', 'ECHO-Other-Native-Edition')
const otherReleaseDir = path.join(otherRepo, 'release-assets', 'other-tag')
await fs.mkdir(otherReleaseDir, { recursive: true })
await fs.writeFile(path.join(root, 'modpacks', 'other-native.json'), JSON.stringify({
  id: 'other-native-edition',
  kind: 'modpack',
  sourceRepo: 'knoxhack/ECHO-Other-Native-Edition',
  releaseTag: 'other-tag',
  artifacts: {
    pack: { file: 'other.zip', sha256: 'b'.repeat(64), size: 1 },
    manifest: { file: 'other.pack.json', url: 'https://example.invalid/other.pack.json', sha256: 'c'.repeat(64), size: 1 },
  },
}, null, 2))
await fs.writeFile(path.join(otherReleaseDir, 'other.pack.json'), JSON.stringify({
  id: 'other-native-edition',
  loader: 'echo-native-loader',
  moduleArtifactFamily: 'echo-addon',
  artifactName: 'other.zip',
  artifactSha256: 'e'.repeat(64),
  artifactSize: 2,
  moduleRequirements: [
    {
      id: 'echofixture',
      moduleId: 'echofixture',
      version: '1.0.0',
      artifactFamily: 'echo-addon',
      assetName: 'echofixture-1.0.0.echo-addon',
      artifactName: 'echofixture-1.0.0.echo-addon',
      path: 'addons/echofixture-1.0.0.echo-addon',
      sha256: 'd'.repeat(64),
      size: 12,
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/old/echofixture-1.0.0.echo-addon',
    },
  ],
  files: [
    {
      id: 'echofixture',
      moduleId: 'echofixture',
      version: '1.0.0',
      artifactFamily: 'echo-addon',
      assetName: 'echofixture-1.0.0.echo-addon',
      artifactName: 'echofixture-1.0.0.echo-addon',
      path: 'addons/echofixture-1.0.0.echo-addon',
      sha256: 'd'.repeat(64),
      size: 12,
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/old/echofixture-1.0.0.echo-addon',
    },
  ],
}, null, 2))
const compatibilityReportPath = path.join(root, 'compatibility-report.json')
const compatibilityScoped = spawnSync(process.execPath, [
  path.resolve('scripts/verify-modpack-module-artifact-drift.mjs'),
  '--root',
  root,
  '--strict',
  '--out',
  compatibilityReportPath,
], {
  cwd: path.resolve('C:/Development/Github/ECHO-Release-Index'),
  encoding: 'utf8',
})
assert.equal(compatibilityScoped.status, 0, compatibilityScoped.stderr)
assert.match(compatibilityScoped.stdout, /2 official pack manifest/u)
const compatibilityReport = JSON.parse(await fs.readFile(compatibilityReportPath, 'utf8'))
assert.equal(compatibilityReport.status, 'pass')
assert.equal(compatibilityReport.warningModpackCount, 1)
assert.equal(compatibilityReport.skippedModuleComparisonCount, 1)
assert.equal(compatibilityReport.deferredPackArtifactMetadataCount, 1)
const otherReport = compatibilityReport.modpacks.find((entry) => entry.id === 'other-native-edition')
assert.equal(otherReport.status, 'warning')
assert.match(otherReport.warnings.join('\n'), /artifactSha256/u)
assert.match(otherReport.warnings.join('\n'), /artifactSize/u)

const manifestPath = path.join(releaseDir, 'fixture.pack.json')
const payload = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
payload.moduleRequirements[0].sha256 = 'd'.repeat(64)
await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2))
const bad = spawnSync(process.execPath, [path.resolve('scripts/verify-modpack-module-artifact-drift.mjs'), '--root', root, '--strict'], {
  cwd: path.resolve('C:/Development/Github/ECHO-Release-Index'),
  encoding: 'utf8',
})
assert.notEqual(bad.status, 0, bad.stdout)
assert.match(bad.stderr, /moduleRequirements\.sha256/u)

console.log('verify-modpack-module-artifact-drift tests passed.')
