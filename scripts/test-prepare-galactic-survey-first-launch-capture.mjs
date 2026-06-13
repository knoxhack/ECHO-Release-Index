#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(process.cwd())
const prepareScript = path.join(repoRoot, 'scripts', 'prepare-galactic-survey-first-launch-capture.mjs')
const importScript = path.join(repoRoot, 'scripts', 'import-galactic-survey-first-launch-evidence.mjs')
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-galactic-first-launch-prep-'))
const releaseReadiness = path.join(tmpRoot, 'release-readiness')
const artifact = path.join(tmpRoot, 'downloads', 'galactic-survey-native-edition-0.1.0.zip')
const captureRoot = path.join(tmpRoot, 'capture')
const minecraftRoot = path.join(tmpRoot, '.minecraft')
const profileGameDir = path.join(tmpRoot, 'Instances', 'Galactic Survey Native Edition')
const profileVersionId = 'echo-galactic-survey-native-edition-native-loader-1.0.0'
const fakeLauncherLog = path.join(tmpRoot, 'evidence', 'launcher-install.json')
const zipBytes = Buffer.from('504b050600000000000000000000000000000000', 'hex')

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

await fs.mkdir(path.dirname(artifact), { recursive: true })
await fs.mkdir(releaseReadiness, { recursive: true })
await fs.mkdir(path.join(minecraftRoot, 'versions', profileVersionId), { recursive: true })
await fs.mkdir(path.join(profileGameDir, 'logs'), { recursive: true })
await fs.mkdir(path.dirname(fakeLauncherLog), { recursive: true })
await fs.writeFile(artifact, zipBytes)
await fs.writeFile(path.join(profileGameDir, 'logs', 'latest.log'), 'Galactic Survey first-launch candidate client log\n')
await writeJson(fakeLauncherLog, {
  ok: true,
  operation: 'install',
  profileId: 'galactic-survey-native-edition'
})
await writeJson(path.join(minecraftRoot, 'launcher_profiles.json'), {
  profiles: {
    'echo-galactic-survey-native-edition-native-loader': {
      name: 'Galactic Survey Native Edition - Native Loader',
      lastVersionId: profileVersionId,
      gameDir: profileGameDir,
      echoManaged: true,
      echoLauncher: {
        profileId: 'galactic-survey-native-edition',
        runtimeMode: 'native-loader-minecraft'
      }
    }
  }
})
await writeJson(path.join(minecraftRoot, 'versions', profileVersionId, `${profileVersionId}.json`), {
  id: profileVersionId
})
await writeJson(path.join(releaseReadiness, 'galactic-survey-real-minecraft-handoff-smoke.json'), {
  schemaVersion: 'echo.galactic_survey.real-minecraft-handoff-smoke.v1',
  ok: true,
  install: {
    reportPath: fakeLauncherLog
  }
})

const artifactSha256 = crypto.createHash('sha256').update(zipBytes).digest('hex')
await writeJson(path.join(releaseReadiness, 'galactic-survey-draft-download.json'), {
  schemaVersion: 'echo.galactic_survey.draft-download.v1',
  status: 'PASS',
  summary: {
    downloadedFromGitHubRelease: true
  },
  data: {
    editions: [
      {
        packId: 'galactic-survey-native-edition',
        downloadedAssets: [
          {
            name: 'galactic-survey-native-edition-0.1.0.zip',
            size: zipBytes.length,
            sha256: artifactSha256,
            browserDownloadUrl: 'https://example.invalid/galactic-survey-native-edition-0.1.0.zip',
            localPath: 'downloads/galactic-survey-native-edition-0.1.0.zip'
          }
        ]
      }
    ]
  }
})

try {
  const prep = spawnSync(process.execPath, [
    prepareScript,
    '--root', tmpRoot,
    '--capture-root', captureRoot,
    '--minecraft-root', minecraftRoot,
    '--tester', 'QA Workstation',
    '--world-or-profile', 'Galactic Survey Native Loader',
    '--started-at', '2026-06-13T20:00:00Z'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  })

  assert.equal(prep.status, 0, prep.stderr)
  const report = JSON.parse(prep.stdout)
  assert.equal(report.schemaVersion, 'echo.galactic_survey.first-launch-capture-prep.v1')
  assert.equal(report.status, 'READY_FOR_CAPTURE')
  assert.equal(report.artifact.matchesDownloadedRelease, true)
  assert.equal(report.openLauncher.attempted, false)
  assert.equal(report.minecraft.expectedProfilePresent, true)
  assert.equal(report.minecraft.nativeLoaderVersionExists, true)
  assert.equal(report.minecraft.expectedVersionId, profileVersionId)
  assert.equal(report.minecraft.expectedVersionMetadataExists, true)
  assert.equal(report.localEvidenceInventory.realHandoffReport.path, path.join(releaseReadiness, 'galactic-survey-real-minecraft-handoff-smoke.json'))
  assert.ok(report.localEvidenceInventory.launcherLogs.some((candidate) => candidate.path === fakeLauncherLog))
  assert.ok(report.localEvidenceInventory.clientLogs.some((candidate) => candidate.path === path.join(profileGameDir, 'logs', 'latest.log')))
  assert.match(report.importerCommand, /import-galactic-survey-first-launch-evidence\.mjs/u)
  assert.ok(await fs.stat(path.join(captureRoot, 'capture-manifest.json')).then((stat) => stat.isFile()))
  assert.ok(await fs.stat(path.join(captureRoot, 'README.md')).then((stat) => stat.isFile()))
  assert.match(await fs.readFile(path.join(captureRoot, 'launcher-handoff-notes.md'), 'utf8'), /ECHO_GALACTIC_SURVEY_FIRST_LAUNCH_TEMPLATE_ONLY/u)
  assert.ok(await fs.stat(path.join(captureRoot, 'screenshots')).then((stat) => stat.isDirectory()))
  assert.ok(await fs.stat(path.join(captureRoot, 'logs')).then((stat) => stat.isDirectory()))
  assert.ok(await fs.stat(path.join(captureRoot, 'support-bundles')).then((stat) => stat.isDirectory()))

  const importAttempt = spawnSync(process.execPath, [
    importScript,
    '--root', tmpRoot,
    '--capture-root', captureRoot,
    '--artifact', artifact,
    '--tester', 'QA Workstation',
    '--world-or-profile', 'Galactic Survey Native Loader',
    '--started-at', '2026-06-13T20:00:00Z',
    '--dry-run'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  })

  assert.notEqual(importAttempt.status, 0, 'capture scaffold must not import as passing evidence')
  const blockedReport = JSON.parse(importAttempt.stdout)
  assert.equal(blockedReport.status, 'BLOCKED')
  assert.ok(blockedReport.blockers.some((blocker) => blocker.includes('template marker')))
  assert.ok(blockedReport.blockers.some((blocker) => blocker.includes('screenshots/echo-managed-profile.png')))
  assert.ok(blockedReport.blockers.some((blocker) => blocker.includes('support-bundles/echo-launcher-support.zip')))

  const secondPrep = spawnSync(process.execPath, [
    prepareScript,
    '--root', tmpRoot,
    '--capture-root', captureRoot,
    '--tester', 'QA Workstation',
    '--world-or-profile', 'Galactic Survey Native Loader',
    '--started-at', '2026-06-13T20:00:00Z'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  })
  assert.notEqual(secondPrep.status, 0, 'existing capture root should require --force')
  assert.match(secondPrep.stdout, /capture root already exists/u)

  console.log('Galactic Survey first-launch capture prep test passed.')
} finally {
  await fs.rm(tmpRoot, { recursive: true, force: true })
}
