#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-official-pack-launcher-proof-'))
await fs.mkdir(path.join(root, 'modpacks'), { recursive: true })
await fs.mkdir(path.join(root, 'release-readiness'), { recursive: true })

const modpack = {
  id: 'fixture-native-edition',
  kind: 'modpack',
  version: '0.1.0',
  sourceRepo: 'knoxhack/ECHO-Fixture-Native-Edition',
  releaseTag: 'fixture-tag',
  validation: 'warning',
  artifacts: {
    pack: { file: 'fixture.zip', sha256: 'a'.repeat(64), size: 42 },
    manifest: { file: 'fixture.pack.json', sha256: 'b'.repeat(64), size: 43 },
    checksums: { file: 'checksums.txt', sha256: 'c'.repeat(64), size: 44 },
    releaseManifest: { file: 'echo-release.json', sha256: 'd'.repeat(64), size: 45 },
  },
}
await fs.writeFile(path.join(root, 'modpacks', 'fixture-native.json'), JSON.stringify(modpack, null, 2))

const report = {
  schemaVersion: 'echo.official_pack.launcher_lifecycle_smoke.v1',
  ok: true,
  generatedAt: new Date().toISOString(),
  source: 'live-github-release-assets',
  officialPackCount: 1,
  coveredPackCount: 1,
  blockers: [],
  gates: {
    liveReleaseAssetsDownloaded: 'passed',
    packagedElectronClickThrough: 'covered_separately',
  },
  editions: [
    {
      status: 'pass',
      packId: modpack.id,
      pack: modpack.id,
      repoName: 'ECHO-Fixture-Native-Edition',
      sourceRepo: modpack.sourceRepo,
      releaseTag: modpack.releaseTag,
      validation: modpack.validation,
      moduleArtifactFamily: 'echo-addon',
      manifestAsset: 'fixture.pack.json',
      artifactAsset: 'fixture.zip',
      moduleCount: 1,
      fileCount: 1,
      selectedModuleId: 'echofixture',
      downloadedAssets: [
        { role: 'pack', name: 'fixture.zip', sha256: 'a'.repeat(64), size: 42, reused: false },
        { role: 'manifest', name: 'fixture.pack.json', sha256: 'b'.repeat(64), size: 43, reused: false },
        { role: 'checksums', name: 'checksums.txt', sha256: 'c'.repeat(64), size: 44, reused: false },
        { role: 'releaseManifest', name: 'echo-release.json', sha256: 'd'.repeat(64), size: 45, reused: false },
      ],
      topLevelChecksums: { verified: ['echo-release.json', 'fixture.pack.json', 'fixture.zip'] },
      packZip: {
        requiredEntries: ['.echo/pack-manifest.json', '.echo/export-report.json', '.echo/checksums.sha256'],
        embeddedManifestFileCount: 1,
      },
      deepLinks: {
        update: { url: 'echo://update/pack/fixture-native-edition', resolved: true, artifact: 'fixture.pack.json', dependencyCount: 1 },
        installAddon: { url: 'echo://install/addon/echofixture?pack=fixture-native-edition', resolved: true, artifact: 'echofixture.echo-addon', dependencyCount: 1 },
      },
      install: { installed: 1, verifiedAfterInstall: 1 },
      update: { fromVersion: '0.1.0-previous-smoke', toVersion: '0.1.0', versionTransition: true, updated: 1, removed: 1, verifiedAfterUpdate: 1 },
      rollback: { restoredPreviousTarget: 'addons/echofixture.echo-addon', restoredObsoletePath: 'addons/obsolete.echo-addon', restoredPreviousVersion: '0.1.0-previous-smoke', verifiedAfterRollback: 2 },
      postRollbackUpdate: { updated: 1, removed: 1, verifiedAfterUpdate: 1 },
      repair: { repaired: 'addons/echofixture.echo-addon', verifiedAfterRepair: 1 },
    },
  ],
}

const reportPath = path.join(root, 'release-readiness', 'official-pack-launcher-lifecycle-smoke.json')
await fs.writeFile(reportPath, JSON.stringify(report, null, 2))

const script = path.resolve('scripts/verify-official-pack-launcher-lifecycle-smoke.mjs')
const ok = spawnSync(process.execPath, [script, '--root', root, '--strict'], {
  cwd: path.resolve('C:/Development/Github/ECHO-Release-Index'),
  encoding: 'utf8',
})
assert.equal(ok.status, 0, ok.stderr)

const badReport = structuredClone(report)
badReport.editions[0].update.verifiedAfterUpdate = 0
await fs.writeFile(reportPath, JSON.stringify(badReport, null, 2))
const bad = spawnSync(process.execPath, [script, '--root', root, '--strict'], {
  cwd: path.resolve('C:/Development/Github/ECHO-Release-Index'),
  encoding: 'utf8',
})
assert.notEqual(bad.status, 0, bad.stdout)
assert.match(bad.stderr, /verifiedAfterUpdate/u)

console.log('verify-official-pack-launcher-lifecycle-smoke tests passed.')
