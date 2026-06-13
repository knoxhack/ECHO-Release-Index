import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(process.cwd())
const script = path.join(repoRoot, 'scripts', 'import-galactic-survey-first-launch-evidence.mjs')
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-galactic-first-launch-'))
const releaseReadiness = path.join(tmpRoot, 'release-readiness')
const captureRoot = path.join(tmpRoot, 'capture')
const artifact = path.join(tmpRoot, 'galactic-survey-native-edition-0.1.0.zip')
const output = 'release-readiness/galactic-survey-first-launch-open-play.json'

const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex')
const zipBytes = Buffer.from('504b050600000000000000000000000000000000', 'hex')

async function writeText(relPath, text) {
  const filePath = path.join(captureRoot, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${text}\n`, 'utf8')
}

async function writeBytes(relPath, bytes) {
  const filePath = path.join(captureRoot, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, bytes)
}

async function writeCaptureFiles(overrides = {}) {
  await writeText('launcher-handoff-notes.md', overrides.handoff ?? 'The packaged launcher prepared an ECHO-managed Galactic Survey profile and the tester verified the Native Loader version metadata before opening the launcher.')
  await writeText('official-launcher-open-notes.md', overrides.launcher ?? 'The official Minecraft Launcher opened from the handoff path and displayed the expected Galactic Survey launcher profile for this run.')
  await writeText('first-open-play-notes.md', overrides.play ?? 'The tester selected the Galactic Survey profile and reached a visible loaded title or world state from the published pack artifact.')
  await writeText('no-crash-review.md', overrides.crash ?? 'The launcher and client logs were reviewed after the session and no crash report or fatal exception was present.')
  await writeBytes('screenshots/echo-managed-profile.png', pngBytes)
  await writeBytes('screenshots/minecraft-launcher-open.png', pngBytes)
  await writeBytes('screenshots/pack-profile-selected.png', pngBytes)
  await writeBytes('screenshots/world-or-title-loaded.png', pngBytes)
  await writeText('logs/echo-launcher-latest.log', 'ECHO Launcher packaged evidence log: install, handoff preparation, and open-play support bundle export completed for Galactic Survey.')
  await writeText('logs/minecraft-client.log', 'Minecraft client log evidence: selected Galactic Survey profile, loaded client state, no crash markers, and closed cleanly.')
  await writeBytes('support-bundles/echo-launcher-support.zip', zipBytes)
}

await fs.mkdir(releaseReadiness, { recursive: true })
await fs.writeFile(artifact, zipBytes)
await writeCaptureFiles()

const artifactSha256 = crypto.createHash('sha256').update(zipBytes).digest('hex')
await fs.writeFile(
  path.join(releaseReadiness, 'galactic-survey-draft-download.json'),
  `${JSON.stringify({
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
              sha256: artifactSha256
            }
          ]
        }
      ]
    }
  }, null, 2)}\n`,
  'utf8'
)

const pass = spawnSync(process.execPath, [
  script,
  '--root', tmpRoot,
  '--capture-root', captureRoot,
  '--artifact', artifact,
  '--tester', 'QA Workstation 2026-06-13',
  '--world-or-profile', 'Galactic Survey Native Smoke',
  '--started-at', '2026-06-13T15:00:00Z',
  '--out', output
], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: false
})

assert.equal(pass.status, 0, pass.stderr)
const report = JSON.parse(pass.stdout)
assert.equal(report.schemaVersion, 'echo.galactic_survey.first-launch-open-play.v1')
assert.equal(report.status, 'PASS')
assert.equal(report.mode, 'write')
assert.equal(report.packId, 'galactic-survey-native-edition')
assert.equal(report.artifact.matchesDownloadedRelease, true)
assert.equal(report.capture.fileCount, 11)
assert.equal(report.gates.firstLaunchOpenPlayEvidence, 'passed')
assert.equal(report.claims.echoManagedProfileVisible, true)
assert.equal(report.claims.officialMinecraftLauncherOpened, true)
assert.equal(report.claims.packProfileSelected, true)
assert.equal(report.claims.firstPlayOpenedWorldOrTitle, true)
assert.equal(report.claims.noCrashEvidence, true)
assert.equal(report.claims.supportBundleCaptured, true)

const writtenReport = JSON.parse(await fs.readFile(path.join(tmpRoot, output), 'utf8'))
assert.equal(writtenReport.status, 'PASS')
assert.equal(writtenReport.artifact.sha256, artifactSha256)

await fs.rm(captureRoot, { recursive: true, force: true })
await writeCaptureFiles({ handoff: 'TODO placeholder first launch notes' })

const blocked = spawnSync(process.execPath, [
  script,
  '--root', tmpRoot,
  '--capture-root', captureRoot,
  '--artifact', artifact,
  '--tester', 'QA Workstation 2026-06-13',
  '--world-or-profile', 'Galactic Survey Native Smoke',
  '--started-at', '2026-06-13T15:00:00Z',
  '--out', 'release-readiness/blocked-first-launch.json',
  '--dry-run'
], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: false
})

assert.notEqual(blocked.status, 0, 'placeholder capture should fail')
const blockedReport = JSON.parse(blocked.stdout)
assert.equal(blockedReport.status, 'BLOCKED')
assert.ok(blockedReport.blockers.some((blocker) => blocker.includes('placeholder text')))

await fs.rm(tmpRoot, { recursive: true, force: true })
console.log('Galactic Survey first-launch evidence importer test passed.')
