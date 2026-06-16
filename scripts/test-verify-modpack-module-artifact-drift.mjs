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
