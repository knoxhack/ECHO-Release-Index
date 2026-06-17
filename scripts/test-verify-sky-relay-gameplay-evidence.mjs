#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import zlib from 'node:zlib'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'verify-sky-relay-gameplay-evidence.mjs')
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')

const editions = [
  {
    key: 'native',
    packId: 'sky-relay-native-edition',
    workspaceDir: 'ECHO-Sky-Relay-Native-Edition',
    releaseTag: 'sky-relay-native-0.1.0-alpha',
  },
  {
    key: 'neoforge',
    packId: 'sky-relay-neoforge-edition',
    workspaceDir: 'ECHO-Sky-Relay-NeoForge-Edition',
    releaseTag: 'sky-relay-neoforge-0.1.0-alpha',
  },
  {
    key: 'standalone',
    packId: 'sky-relay-standalone-edition',
    workspaceDir: 'ECHO-Sky-Relay-Standalone-Edition',
    releaseTag: 'sky-relay-standalone-0.1.0-alpha',
  },
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

const captureKitFiles = [
  'scripts/init-manual-gameplay-evidence.mjs',
  'scripts/verify-manual-gameplay-evidence.mjs',
  'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json',
  'fixtures/sky-relay/gameplay-qa/evidence/CAPTURE_CHECKLIST.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/fresh-world-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-30-minutes-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-2-hours-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/signal-crown-verification.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/no-crash-review.template.md',
]

function pngFixture(width = 1280, height = 720, shade = 0) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 0
  const rawScanlines = Buffer.alloc((width + 1) * height)
  const pixel = shade & 0xff
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (width + 1)
    rawScanlines[rowStart] = 0
    for (let column = 0; column < width; column += 1) {
      rawScanlines[rowStart + 1 + column] = (pixel + row + column) & 0xff
    }
  }
  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rawScanlines)),
    pngChunk('IEND'),
  ])
}

function blankPngFixture(width = 1280, height = 720, shade = 0) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 0
  const rawScanlines = Buffer.alloc((width + 1) * height)
  const pixel = shade & 0xff
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (width + 1)
    rawScanlines[rowStart] = 0
    rawScanlines.fill(pixel, rowStart + 1, rowStart + 1 + width)
  }
  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rawScanlines)),
    pngChunk('IEND'),
  ])
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([length, typeBytes, data, checksum])
}

function pngHeaderOnlyFixture(width = 1280, height = 720) {
  const header = Buffer.alloc(33)
  pngSignature.copy(header, 0)
  header.writeUInt32BE(13, 8)
  header.write('IHDR', 12, 'ascii')
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  header[24] = 8
  header[25] = 0
  return header
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipFixture(filename = 'save/level.dat', content = 'fixture save snapshot\n') {
  const entries = Array.isArray(filename)
    ? filename
    : [{ filename, content }]
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.filename, 'utf8')
    const data = Buffer.from(entry.content, 'utf8')
    const checksum = crc32(data)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(name.length, 26)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt32LE(offset, 42)

    localParts.push(localHeader, name, data)
    centralParts.push(centralHeader, name)
    offset += localHeader.length + name.length + data.length
  }

  const centralDirectoryOffset = offset
  const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0)
  const endOfCentralDirectory = Buffer.alloc(22)
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(entries.length, 8)
  endOfCentralDirectory.writeUInt16LE(entries.length, 10)
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12)
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16)

  return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory])
}

function worldSaveZipFixture(index, relPath) {
  return zipFixture([
    {
      filename: 'save/level.dat',
      content: `fixture level.dat ${index + 1}: ${relPath}\n`,
    },
    {
      filename: 'save/region/r.0.0.mca',
      content: `fixture region chunk ${index + 1}: ${relPath}\n`,
    },
    {
      filename: `save/playerdata/test-player-${index + 1}.dat`,
      content: `fixture player state ${index + 1}: ${relPath}\n`,
    },
  ])
}

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeText(root, relPath, value = 'fixture\n') {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
}

function sessionForNote(evidence, relPath) {
  return evidence?.sessions?.find((session) => session.evidence?.notes === relPath) ?? null
}

function noteIdentityLines(relPath, evidence) {
  const session = sessionForNote(evidence, relPath)
  return [
    `- Pack: ${evidence?.packId ?? 'sky-relay-test-edition'}`,
    `- Tester: ${evidence?.run?.tester ?? 'test fixture'}`,
    `- Release tag: ${evidence?.run?.releaseTag ?? 'sky-relay-test-0.1.0-alpha'}`,
    `- Artifact asset: ${evidence?.run?.artifactAsset ?? 'sky-relay-test-edition-0.1.0.zip'}`,
    `- Artifact SHA-256: ${evidence?.run?.artifactSha256 ?? '0'.repeat(64)}`,
    `- Artifact size: ${evidence?.run?.artifactSize ?? 1}`,
    `- Launcher channel: ${evidence?.run?.launcherChannel ?? 'alpha'}`,
    `- Installed from: ${evidence?.run?.installedFrom ?? 'ECHO Launcher'}`,
    `- World/profile: ${evidence?.run?.worldOrProfile ?? 'fixture-world'}`,
    `- Run started at: ${evidence?.run?.startedAt ?? '2026-06-11T00:00:00Z'}`,
    `- Session ID: ${session?.id ?? 'fixture_session'}`,
    `- Session started at: ${session?.startedAt ?? '2026-06-11T00:00:00Z'}`,
    `- Session ended at: ${session?.endedAt ?? '2026-06-11T00:01:00Z'}`,
    `- Session duration minutes: ${session?.durationMinutes ?? 1}`,
  ]
}

function noteEvidenceLines(relPath, evidence) {
  const session = sessionForNote(evidence, relPath)
  return Object.entries(session?.evidence ?? {})
    .filter(([field]) => field !== 'notes')
    .map(([field, value]) => `- ${field}: ${value}`)
}

function noteFixture(relPath, evidence = null) {
  const identityLines = noteIdentityLines(relPath, evidence)
  const evidenceLines = noteEvidenceLines(relPath, evidence)
  if (relPath.includes('no-crash')) {
    return `# No Crash Review

## Reviewed Files

${identityLines.join('\n')}
- Client playthrough log: client-playthrough.log reviewed
- Launcher install log: launcher-install.log reviewed
- Save snapshots: all snapshots opened
- Screenshots: all screenshots reviewed
${evidenceLines.join('\n')}

## Required Checks

- No blocking crash: confirmed
- No world corruption: confirmed
- Save reload verified: confirmed
- Fresh world/profile confirmed: confirmed
- Known non-blocking warnings: none

## Reviewer Notes

- Reviewer: test fixture
- Date: 2026-06-11
- Decision: pass
- Follow-up: none
`
  }
  const routeSection = relPath.includes('fresh-world')
    ? 'Required Fresh World Checks'
    : relPath.includes('signal-crown')
      ? 'Required Completion Checks'
      : 'Required Route Checks'
  const checks = noteChecks(relPath)
  return `# Gameplay Notes

## Run Identity

${identityLines.join('\n')}
- Date: 2026-06-11

## ${routeSection}

${checks.map((line) => `- ${line}: confirmed`).join('\n')}

## Evidence Links

${evidenceLines.join('\n')}
- Screenshot: fixture.png
- Save snapshot: fixture.zip
- Client log: client-playthrough.log

## Notes

- Observations: fixture observations recorded
- Issues: none
- Follow-up: none
`
}

function noteChecks(relPath) {
  if (relPath.includes('fresh-world')) {
    return [
      'Public alpha package installed from launcher',
      'New Sky Relay profile or world created',
      'No existing save or copied world used',
      'Initial spawn loaded successfully',
      'Damaged Relay Core visible or reachable',
    ]
  }
  if (relPath.includes('first-30')) {
    return [
      'Damaged Relay Core reached',
      'Terminal relay status opened',
      'Lens scan completed',
      'Hand crank restored',
      'Small battery power restored',
      'relay_anchor_key claimed',
      'hydroponics_deck revealed and attached',
    ]
  }
  if (relPath.includes('first-2')) {
    return [
      'Food stabilized',
      'Water stabilized',
      'atmospheric_condenser built',
      'aero_salvage_yard attached',
      'relay_alloy_plate processed',
      'storm_shield_pylon built',
      'solar_wing attached',
      'Logistics route started',
      'weather_mast unlocked',
      'Severe storm survived',
      'stabilized_platform_core crafted',
    ]
  }
  return [
    'Stabilized platform core restored',
    'relay_signal_array online',
    'Storm shield network confirmed',
    'Logistics route confirmed',
    'Orbital alloy components collected',
    'Terminal restoration sequence completed',
    'sky_relay_badge awarded',
  ]
}

function sessionFixture({ supportingFiles, screenshots, logs, saveSnapshots }) {
  const find = (values, pattern) => values.find((relPath) => pattern.test(relPath))
  const clientLog = find(logs, /client/i)
  const launcherLog = find(logs, /(launcher|pack)[-_]?install/i)
  return [
    {
      id: 'fresh_world_creation',
      claim: 'freshWorldCreated',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T00:02:00Z',
      durationMinutes: 2,
      evidence: {
        notes: find(supportingFiles, /fresh[-_]?world/i),
        screenshot: find(screenshots, /fresh[-_]?world/i),
        clientLog,
        launcherLog,
      },
    },
    {
      id: 'first_30_minutes',
      claim: 'realFirst30Playthrough',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T00:31:00Z',
      durationMinutes: 31,
      evidence: {
        notes: find(supportingFiles, /first[-_]?30[-_]?minutes/i),
        screenshot: find(screenshots, /first[-_]?30[-_]?minutes/i),
        saveSnapshot: find(saveSnapshots, /first[-_]?30[-_]?minutes/i),
        clientLog,
      },
    },
    {
      id: 'first_2_hours',
      claim: 'realFirst2HourPlaythrough',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T02:05:00Z',
      durationMinutes: 125,
      evidence: {
        notes: find(supportingFiles, /first[-_]?2[-_]?hours/i),
        screenshot: find(screenshots, /first[-_]?2[-_]?hours/i),
        saveSnapshot: find(saveSnapshots, /first[-_]?2[-_]?hours/i),
        clientLog,
      },
    },
    {
      id: 'signal_crown_completion',
      claim: 'realSignalCrownPlaythrough',
      startedAt: '2026-06-11T02:05:00Z',
      endedAt: '2026-06-11T02:20:00Z',
      durationMinutes: 15,
      evidence: {
        notes: find(supportingFiles, /signal[-_]?crown/i),
        screenshot: find(screenshots, /signal[-_]?crown/i),
        saveSnapshot: find(saveSnapshots, /signal[-_]?crown/i),
        clientLog,
      },
    },
    {
      id: 'save_reload_verification',
      claim: 'saveReloadVerified',
      startedAt: '2026-06-11T02:20:00Z',
      endedAt: '2026-06-11T02:22:00Z',
      durationMinutes: 2,
      evidence: {
        first30SaveSnapshot: find(saveSnapshots, /first[-_]?30[-_]?minutes/i),
        first2HourSaveSnapshot: find(saveSnapshots, /first[-_]?2[-_]?hours/i),
        signalCrownSaveSnapshot: find(saveSnapshots, /signal[-_]?crown/i),
        clientLog,
      },
    },
    {
      id: 'no_crash_review',
      claim: 'noCrashEvidence',
      startedAt: '2026-06-11T02:22:00Z',
      endedAt: '2026-06-11T02:23:00Z',
      durationMinutes: 1,
      evidence: {
        notes: find(supportingFiles, /no[-_]?crash/i),
        clientLog,
        launcherLog,
      },
    },
  ]
}

function logFixture({ packId, run, sessions }, relPath) {
  const kind = /launcher|pack/u.test(relPath) ? 'launcher install' : 'client playthrough'
  const lines = [
    `Sky Relay ${kind} log`,
    `Pack ID: ${packId}`,
    `Release tag: ${run.releaseTag}`,
    `Artifact asset: ${run.artifactAsset}`,
    `Artifact SHA-256: ${run.artifactSha256}`,
    `Artifact size: ${run.artifactSize}`,
    `Launcher channel: ${run.launcherChannel}`,
    `Installed from: ${run.installedFrom}`,
    `World/profile: ${run.worldOrProfile}`,
    `Run started at: ${run.startedAt}`,
    'Status: completed without blocking crash',
  ]
  if (/client/u.test(relPath)) {
    for (const session of sessions ?? []) {
      lines.push(`${session.id}.id=${session.id}`)
      lines.push(`${session.id}.startedAt=${session.startedAt}`)
      lines.push(`${session.id}.endedAt=${session.endedAt}`)
    }
  }
  return lines.join('\n')
}

async function writeBytes(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value)
}

function run(root, workspaceRoot, extraArgs = []) {
  return spawnSync(process.execPath, [
    script,
    '--root',
    root,
    '--workspace-root',
    workspaceRoot,
    ...extraArgs,
  ], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

async function writeRouteReport(root) {
  await writeJson(root, 'release-readiness/sky-relay-gameplay-route-smoke.json', {
    schemaVersion: 'echo.skyrelay.gameplay-route-smoke.v1',
    ok: true,
    gates: {
      first30RouteContract: 'passed',
      first2HourRouteContract: 'passed',
      signalCrownContract: 'passed',
    },
  })
  await writeJson(root, 'release-readiness/sky-relay-edition-pack-assets.json', {
    schemaVersion: 'echo.skyrelay.edition-pack-assets.v1',
    downloadBackValidation: {
      editions: editions.map((edition) => ({
        packId: edition.packId,
        releaseTag: edition.releaseTag,
        assets: [
          {
            name: artifactByEdition[edition.key].artifactAsset,
            size: artifactByEdition[edition.key].artifactSize,
            sha256: artifactByEdition[edition.key].artifactSha256,
          },
        ],
        zip: {
          name: artifactByEdition[edition.key].artifactAsset,
          validated: true,
        },
      })),
    },
    gates: {
      editionPackAssetsBuilt: 'passed',
      editionDraftDownloadBack: 'passed',
      editionPublicPrereleasesPromoted: 'passed',
      stableTaggedArtifactUrls: 'passed',
      zipMatchesPackManifest: 'passed',
    },
  })
}

async function writeGameplayEvidence(workspaceRoot, options = {}) {
  for (const edition of editions) {
    const root = path.join(workspaceRoot, edition.workspaceDir)
    for (const relPath of captureKitFiles) await writeText(root, relPath)
    const base = 'fixtures/sky-relay/gameplay-qa/evidence'
    const supportingFiles = [
      `${base}/fresh-world-notes.md`,
      `${base}/first-30-minutes-notes.md`,
      `${base}/first-2-hours-notes.md`,
      `${base}/signal-crown-verification.md`,
      `${base}/no-crash-review.md`,
    ]
    const screenshots = [
      `${base}/screenshots/fresh-world-created.png`,
      `${base}/screenshots/first-30-minutes.png`,
      `${base}/screenshots/first-2-hours.png`,
      `${base}/screenshots/signal-crown-complete.png`,
    ]
    const logs = [
      `${base}/logs/client-playthrough.log`,
      `${base}/logs/launcher-install.log`,
    ]
    const saveSnapshots = [
      `${base}/saves/first-30-minutes-save.zip`,
      `${base}/saves/first-2-hours-save.zip`,
      `${base}/saves/signal-crown-save.zip`,
    ]

    const claims = {
      realFirst30Playthrough: true,
      realFirst2HourPlaythrough: true,
      realSignalCrownPlaythrough: true,
      freshWorldCreated: true,
      saveReloadVerified: true,
      noCrashEvidence: true,
      ...(options.claimsByEdition?.[edition.key] ?? {}),
    }

    const run = {
      tester: 'test fixture',
      releaseTag: edition.releaseTag,
      ...artifactByEdition[edition.key],
      launcherChannel: 'alpha',
      worldOrProfile: 'fixture-world',
      installedFrom: 'ECHO Launcher',
      startedAt: '2026-06-11T00:00:00Z',
    }

    const sessions = sessionFixture({ supportingFiles, screenshots, logs, saveSnapshots })
    const evidence = {
      schemaVersion: 'echo.skyrelay.gameplay-qa.manual.v1',
      packId: edition.packId,
      generatedAt: '2026-06-11T02:24:00Z',
      run,
      claims,
      sessions,
      supportingFiles,
      screenshots,
      logs,
      saveSnapshots,
    }

    for (const relPath of supportingFiles) await writeText(root, relPath, noteFixture(relPath, evidence))
    for (const [index, relPath] of screenshots.entries()) await writeBytes(root, relPath, pngFixture(1280, 720, index + 1))
    for (const relPath of logs) await writeText(root, relPath, logFixture({ packId: edition.packId, run, sessions }, relPath))
    for (const [index, relPath] of saveSnapshots.entries()) {
      await writeBytes(root, relPath, worldSaveZipFixture(index, relPath))
    }

    await writeJson(root, 'fixtures/sky-relay/gameplay-qa/manual-evidence.json', evidence)
  }
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sky-relay-gameplay-evidence-'))
try {
  const missingRoot = path.join(tmp, 'missing-release-index')
  const missingWorkspace = path.join(tmp, 'missing-workspace')
  await writeRouteReport(missingRoot)
  const missing = run(missingRoot, missingWorkspace, ['--require-release-ready'])
  assert.equal(missing.status, 1)
  assert.match(`${missing.stdout}\n${missing.stderr}`, /native manual evidence is missing/u)
  assert.match(`${missing.stdout}\n${missing.stderr}`, /neoforge manual evidence is missing/u)
  assert.match(`${missing.stdout}\n${missing.stderr}`, /standalone manual evidence is missing/u)

  const readyRoot = path.join(tmp, 'ready-release-index')
  const readyWorkspace = path.join(tmp, 'ready-workspace')
  await writeRouteReport(readyRoot)
  await writeGameplayEvidence(readyWorkspace)
  const ready = run(readyRoot, readyWorkspace, ['--require-release-ready'])
  assert.equal(ready.status, 0, `${ready.stdout}\n${ready.stderr}`)
  const readyReport = JSON.parse(ready.stdout)
  assert.equal(readyReport.status, 'PASS')
  assert.equal(readyReport.gates.captureKitReady, 'passed')
  assert.equal(readyReport.captureKits.length, 3)
  assert.equal(readyReport.gates.freshWorldCreated, 'passed')
  assert.equal(readyReport.gates.realFirst30Playthrough, 'passed')
  assert.equal(readyReport.gates.realSignalCrownPlaythrough, 'passed')
  const nativeEvidence = readyReport.editions.find((edition) => edition.edition === 'native')
  assert.match(nativeEvidence.checked.supportingFiles[0].sha256, /^[a-f0-9]{64}$/u)
  assert.ok(nativeEvidence.checked.supportingFiles[0].size > 100)
  assert.ok(nativeEvidence.checked.screenshots[0].size > 33)
  assert.match(nativeEvidence.checked.screenshots[0].sha256, /^[a-f0-9]{64}$/u)
  assert.equal(new Set(nativeEvidence.checked.screenshots.map((screenshot) => screenshot.sha256)).size, 4)
  assert.deepEqual(nativeEvidence.checked.screenshots[0].dimensions, { width: 1280, height: 720 })
  assert.equal(nativeEvidence.checked.screenshots[0].idatChunks, 1)
  assert.ok(nativeEvidence.checked.screenshots[0].chunks >= 3)
  assert.equal(nativeEvidence.checked.screenshots[0].pixelVariation.supported, true)
  assert.ok(nativeEvidence.checked.screenshots[0].pixelVariation.uniquePixelSamples >= 16)
  assert.equal(nativeEvidence.checked.logs[0].blockingSignatures, 0)
  assert.ok(nativeEvidence.checked.logs[0].lineCount >= 1)
  assert.deepEqual(nativeEvidence.checked.logs[0].provenanceMatches, [
    'packId',
    'releaseTag',
    'artifactAsset',
    'artifactSha256',
    'artifactSize',
    'launcherChannel',
    'installedFrom',
    'worldOrProfile',
    'runStartedAt',
  ])
  assert.ok(nativeEvidence.checked.logs[0].sessionMatches.includes('signal_crown_completion.startedAt'))
  assert.equal(nativeEvidence.checked.saveSnapshots[0].entries, 3)
  assert.equal(nativeEvidence.checked.saveSnapshots[0].hasLevelDat, true)
  assert.equal(nativeEvidence.checked.saveSnapshots[0].hasRegionChunk, true)
  assert.equal(nativeEvidence.checked.saveSnapshots[0].hasPlayerOrDataState, true)
  assert.ok(nativeEvidence.checked.saveSnapshots[0].worldStateEntries.length >= 2)
  assert.deepEqual(nativeEvidence.checked.saveSnapshots[0].unsafeEntries, [])
  assert.equal(new Set(nativeEvidence.checked.saveSnapshots.map((snapshot) => snapshot.sha256)).size, 3)

  const badClaimRoot = path.join(tmp, 'bad-claim-release-index')
  const badClaimWorkspace = path.join(tmp, 'bad-claim-workspace')
  await writeRouteReport(badClaimRoot)
  await writeGameplayEvidence(badClaimWorkspace, {
    claimsByEdition: {
      native: { realSignalCrownPlaythrough: false },
    },
  })
  const badClaim = run(badClaimRoot, badClaimWorkspace, ['--require-release-ready'])
  assert.equal(badClaim.status, 1)
  assert.match(`${badClaim.stdout}\n${badClaim.stderr}`, /native manual evidence claim realSignalCrownPlaythrough must be true/u)

  const templateMarkerRoot = path.join(tmp, 'template-marker-release-index')
  const templateMarkerWorkspace = path.join(tmp, 'template-marker-workspace')
  await writeRouteReport(templateMarkerRoot)
  await writeGameplayEvidence(templateMarkerWorkspace)
  await writeText(
    path.join(templateMarkerWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md',
    'ECHO_SKY_RELAY_TEMPLATE_ONLY\n',
  )
  const templateMarker = run(templateMarkerRoot, templateMarkerWorkspace, ['--require-release-ready'])
  assert.equal(templateMarker.status, 1)
  assert.match(`${templateMarker.stdout}\n${templateMarker.stderr}`, /template marker ECHO_SKY_RELAY_TEMPLATE_ONLY/u)

  const missingSessionRoot = path.join(tmp, 'missing-session-release-index')
  const missingSessionWorkspace = path.join(tmp, 'missing-session-workspace')
  await writeRouteReport(missingSessionRoot)
  await writeGameplayEvidence(missingSessionWorkspace)
  const missingSessionEvidencePath = path.join(
    missingSessionWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const missingSessionEvidence = JSON.parse(await fs.readFile(missingSessionEvidencePath, 'utf8'))
  missingSessionEvidence.sessions = missingSessionEvidence.sessions.filter((session) => session.id !== 'save_reload_verification')
  await fs.writeFile(missingSessionEvidencePath, `${JSON.stringify(missingSessionEvidence, null, 2)}\n`, 'utf8')
  const missingSession = run(missingSessionRoot, missingSessionWorkspace, ['--require-release-ready'])
  assert.equal(missingSession.status, 1)
  assert.match(`${missingSession.stdout}\n${missingSession.stderr}`, /native manual evidence sessions must include save_reload_verification/u)

  const missingFreshSessionRoot = path.join(tmp, 'missing-fresh-session-release-index')
  const missingFreshSessionWorkspace = path.join(tmp, 'missing-fresh-session-workspace')
  await writeRouteReport(missingFreshSessionRoot)
  await writeGameplayEvidence(missingFreshSessionWorkspace)
  const missingFreshSessionEvidencePath = path.join(
    missingFreshSessionWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const missingFreshSessionEvidence = JSON.parse(await fs.readFile(missingFreshSessionEvidencePath, 'utf8'))
  missingFreshSessionEvidence.sessions = missingFreshSessionEvidence.sessions.filter((session) => session.id !== 'fresh_world_creation')
  await fs.writeFile(missingFreshSessionEvidencePath, `${JSON.stringify(missingFreshSessionEvidence, null, 2)}\n`, 'utf8')
  const missingFreshSession = run(missingFreshSessionRoot, missingFreshSessionWorkspace, ['--require-release-ready'])
  assert.equal(missingFreshSession.status, 1)
  assert.match(`${missingFreshSession.stdout}\n${missingFreshSession.stderr}`, /native manual evidence sessions must include fresh_world_creation/u)

  const shortSessionRoot = path.join(tmp, 'short-session-release-index')
  const shortSessionWorkspace = path.join(tmp, 'short-session-workspace')
  await writeRouteReport(shortSessionRoot)
  await writeGameplayEvidence(shortSessionWorkspace)
  const shortSessionEvidencePath = path.join(
    shortSessionWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const shortSessionEvidence = JSON.parse(await fs.readFile(shortSessionEvidencePath, 'utf8'))
  const shortSessionRecord = shortSessionEvidence.sessions.find((session) => session.id === 'first_30_minutes')
  shortSessionRecord.endedAt = '2026-06-11T00:05:00Z'
  shortSessionRecord.durationMinutes = 5
  await fs.writeFile(shortSessionEvidencePath, `${JSON.stringify(shortSessionEvidence, null, 2)}\n`, 'utf8')
  const shortSession = run(shortSessionRoot, shortSessionWorkspace, ['--require-release-ready'])
  assert.equal(shortSession.status, 1)
  assert.match(`${shortSession.stdout}\n${shortSession.stderr}`, /first_30_minutes.*durationMinutes must be at least 30/u)

  const mismatchedArtifactRoot = path.join(tmp, 'mismatched-artifact-release-index')
  const mismatchedArtifactWorkspace = path.join(tmp, 'mismatched-artifact-workspace')
  await writeRouteReport(mismatchedArtifactRoot)
  await writeGameplayEvidence(mismatchedArtifactWorkspace)
  const mismatchedArtifactEvidencePath = path.join(
    mismatchedArtifactWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const mismatchedArtifactEvidence = JSON.parse(await fs.readFile(mismatchedArtifactEvidencePath, 'utf8'))
  mismatchedArtifactEvidence.run.artifactSha256 = 'f'.repeat(64)
  await fs.writeFile(mismatchedArtifactEvidencePath, `${JSON.stringify(mismatchedArtifactEvidence, null, 2)}\n`, 'utf8')
  const mismatchedArtifact = run(mismatchedArtifactRoot, mismatchedArtifactWorkspace, ['--require-release-ready'])
  assert.equal(mismatchedArtifact.status, 1)
  assert.match(`${mismatchedArtifact.stdout}\n${mismatchedArtifact.stderr}`, /native manual evidence run\.artifactSha256 must be/u)

  const noteProvenanceRoot = path.join(tmp, 'note-provenance-release-index')
  const noteProvenanceWorkspace = path.join(tmp, 'note-provenance-workspace')
  await writeRouteReport(noteProvenanceRoot)
  await writeGameplayEvidence(noteProvenanceWorkspace)
  const noteProvenanceEditionRoot = path.join(noteProvenanceWorkspace, 'ECHO-Sky-Relay-Native-Edition')
  const noteProvenanceEvidencePath = path.join(noteProvenanceEditionRoot, 'fixtures/sky-relay/gameplay-qa/manual-evidence.json')
  const noteProvenanceEvidence = JSON.parse(await fs.readFile(noteProvenanceEvidencePath, 'utf8'))
  const noteProvenancePath = 'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md'
  await writeText(
    noteProvenanceEditionRoot,
    noteProvenancePath,
    noteFixture(noteProvenancePath, noteProvenanceEvidence).replace(noteProvenanceEvidence.run.artifactSha256, '0'.repeat(64)),
  )
  const noteProvenance = run(noteProvenanceRoot, noteProvenanceWorkspace, ['--require-release-ready'])
  assert.equal(noteProvenance.status, 1)
  assert.match(`${noteProvenance.stdout}\n${noteProvenance.stderr}`, /missing required note provenance artifactSha256/u)

  const noteRunProvenanceRoot = path.join(tmp, 'note-run-provenance-release-index')
  const noteRunProvenanceWorkspace = path.join(tmp, 'note-run-provenance-workspace')
  await writeRouteReport(noteRunProvenanceRoot)
  await writeGameplayEvidence(noteRunProvenanceWorkspace)
  const noteRunProvenanceEditionRoot = path.join(noteRunProvenanceWorkspace, 'ECHO-Sky-Relay-Native-Edition')
  const noteRunProvenanceEvidencePath = path.join(noteRunProvenanceEditionRoot, 'fixtures/sky-relay/gameplay-qa/manual-evidence.json')
  const noteRunProvenanceEvidence = JSON.parse(await fs.readFile(noteRunProvenanceEvidencePath, 'utf8'))
  await writeText(
    noteRunProvenanceEditionRoot,
    noteProvenancePath,
    noteFixture(noteProvenancePath, noteRunProvenanceEvidence).replace(noteRunProvenanceEvidence.run.installedFrom, 'Manual side-load'),
  )
  const noteRunProvenance = run(noteRunProvenanceRoot, noteRunProvenanceWorkspace, ['--require-release-ready'])
  assert.equal(noteRunProvenance.status, 1)
  assert.match(`${noteRunProvenance.stdout}\n${noteRunProvenance.stderr}`, /missing required note provenance installedFrom/u)

  const chronologyRoot = path.join(tmp, 'chronology-release-index')
  const chronologyWorkspace = path.join(tmp, 'chronology-workspace')
  await writeRouteReport(chronologyRoot)
  await writeGameplayEvidence(chronologyWorkspace)
  const chronologyEvidencePath = path.join(
    chronologyWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const chronologyEvidence = JSON.parse(await fs.readFile(chronologyEvidencePath, 'utf8'))
  const saveReloadSession = chronologyEvidence.sessions.find((session) => session.id === 'save_reload_verification')
  saveReloadSession.startedAt = '2026-06-11T02:10:00Z'
  await fs.writeFile(chronologyEvidencePath, `${JSON.stringify(chronologyEvidence, null, 2)}\n`, 'utf8')
  const chronology = run(chronologyRoot, chronologyWorkspace, ['--require-release-ready'])
  assert.equal(chronology.status, 1)
  assert.match(
    `${chronology.stdout}\n${chronology.stderr}`,
    /native manual evidence sessions\.save_reload_verification\.startedAt must be at or after signal_crown_completion\.endedAt/u,
  )

  const splitRouteRoot = path.join(tmp, 'split-route-release-index')
  const splitRouteWorkspace = path.join(tmp, 'split-route-workspace')
  await writeRouteReport(splitRouteRoot)
  await writeGameplayEvidence(splitRouteWorkspace)
  const splitRouteEvidencePath = path.join(
    splitRouteWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const splitRouteEvidence = JSON.parse(await fs.readFile(splitRouteEvidencePath, 'utf8'))
  const splitRouteSession = splitRouteEvidence.sessions.find((session) => session.id === 'first_2_hours')
  splitRouteSession.startedAt = '2026-06-11T00:01:00Z'
  splitRouteSession.durationMinutes = 124
  await fs.writeFile(splitRouteEvidencePath, `${JSON.stringify(splitRouteEvidence, null, 2)}\n`, 'utf8')
  const splitRoute = run(splitRouteRoot, splitRouteWorkspace, ['--require-release-ready'])
  assert.equal(splitRoute.status, 1)
  assert.match(
    `${splitRoute.stdout}\n${splitRoute.stderr}`,
    /native manual evidence sessions\.first_2_hours\.startedAt must match native manual evidence run\.startedAt/u,
  )

  const durationMismatchRoot = path.join(tmp, 'duration-mismatch-release-index')
  const durationMismatchWorkspace = path.join(tmp, 'duration-mismatch-workspace')
  await writeRouteReport(durationMismatchRoot)
  await writeGameplayEvidence(durationMismatchWorkspace)
  const durationMismatchEvidencePath = path.join(
    durationMismatchWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const durationMismatchEvidence = JSON.parse(await fs.readFile(durationMismatchEvidencePath, 'utf8'))
  const first2HourSession = durationMismatchEvidence.sessions.find((session) => session.id === 'first_2_hours')
  first2HourSession.durationMinutes = 121
  await fs.writeFile(durationMismatchEvidencePath, `${JSON.stringify(durationMismatchEvidence, null, 2)}\n`, 'utf8')
  const durationMismatch = run(durationMismatchRoot, durationMismatchWorkspace, ['--require-release-ready'])
  assert.equal(durationMismatch.status, 1)
  assert.match(
    `${durationMismatch.stdout}\n${durationMismatch.stderr}`,
    /native manual evidence sessions\.first_2_hours\.durationMinutes must match startedAt\/endedAt/u,
  )

  const earlyGeneratedRoot = path.join(tmp, 'early-generated-release-index')
  const earlyGeneratedWorkspace = path.join(tmp, 'early-generated-workspace')
  await writeRouteReport(earlyGeneratedRoot)
  await writeGameplayEvidence(earlyGeneratedWorkspace)
  const earlyGeneratedEvidencePath = path.join(
    earlyGeneratedWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/manual-evidence.json',
  )
  const earlyGeneratedEvidence = JSON.parse(await fs.readFile(earlyGeneratedEvidencePath, 'utf8'))
  earlyGeneratedEvidence.generatedAt = '2026-06-11T02:10:00Z'
  await fs.writeFile(earlyGeneratedEvidencePath, `${JSON.stringify(earlyGeneratedEvidence, null, 2)}\n`, 'utf8')
  const earlyGenerated = run(earlyGeneratedRoot, earlyGeneratedWorkspace, ['--require-release-ready'])
  assert.equal(earlyGenerated.status, 1)
  assert.match(
    `${earlyGenerated.stdout}\n${earlyGenerated.stderr}`,
    /native manual evidence generatedAt must be at or after native manual evidence sessions\.signal_crown_completion\.endedAt/u,
  )

  const duplicateScreenshotRoot = path.join(tmp, 'duplicate-screenshot-release-index')
  const duplicateScreenshotWorkspace = path.join(tmp, 'duplicate-screenshot-workspace')
  await writeRouteReport(duplicateScreenshotRoot)
  await writeGameplayEvidence(duplicateScreenshotWorkspace)
  await writeBytes(
    path.join(duplicateScreenshotWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png',
    pngFixture(1280, 720, 1),
  )
  const duplicateScreenshot = run(duplicateScreenshotRoot, duplicateScreenshotWorkspace, ['--require-release-ready'])
  assert.equal(duplicateScreenshot.status, 1)
  assert.match(`${duplicateScreenshot.stdout}\n${duplicateScreenshot.stderr}`, /native\.screenshots must contain unique file content/u)

  const duplicateSaveRoot = path.join(tmp, 'duplicate-save-release-index')
  const duplicateSaveWorkspace = path.join(tmp, 'duplicate-save-workspace')
  await writeRouteReport(duplicateSaveRoot)
  await writeGameplayEvidence(duplicateSaveWorkspace)
  const first30SaveBytes = await fs.readFile(path.join(
    duplicateSaveWorkspace,
    'ECHO-Sky-Relay-Native-Edition',
    'fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip',
  ))
  await writeBytes(
    path.join(duplicateSaveWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip',
    first30SaveBytes,
  )
  const duplicateSave = run(duplicateSaveRoot, duplicateSaveWorkspace, ['--require-release-ready'])
  assert.equal(duplicateSave.status, 1)
  assert.match(`${duplicateSave.stdout}\n${duplicateSave.stderr}`, /native\.saveSnapshots must contain unique file content/u)

  const missingLevelDatRoot = path.join(tmp, 'missing-level-dat-release-index')
  const missingLevelDatWorkspace = path.join(tmp, 'missing-level-dat-workspace')
  await writeRouteReport(missingLevelDatRoot)
  await writeGameplayEvidence(missingLevelDatWorkspace)
  await writeBytes(
    path.join(missingLevelDatWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip',
    zipFixture('notes/readme.txt', 'not a world save\n'),
  )
  const missingLevelDat = run(missingLevelDatRoot, missingLevelDatWorkspace, ['--require-release-ready'])
  assert.equal(missingLevelDat.status, 1)
  assert.match(`${missingLevelDat.stdout}\n${missingLevelDat.stderr}`, /ZIP must contain a level\.dat world save entry/u)

  const missingWorldStateRoot = path.join(tmp, 'missing-world-state-release-index')
  const missingWorldStateWorkspace = path.join(tmp, 'missing-world-state-workspace')
  await writeRouteReport(missingWorldStateRoot)
  await writeGameplayEvidence(missingWorldStateWorkspace)
  await writeBytes(
    path.join(missingWorldStateWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip',
    zipFixture('save/level.dat', 'level.dat alone is not a full captured world state\n'),
  )
  const missingWorldState = run(missingWorldStateRoot, missingWorldStateWorkspace, ['--require-release-ready'])
  assert.equal(missingWorldState.status, 1)
  assert.match(`${missingWorldState.stdout}\n${missingWorldState.stderr}`, /captured world state entries beyond level\.dat/u)

  const blankFieldRoot = path.join(tmp, 'blank-field-release-index')
  const blankFieldWorkspace = path.join(tmp, 'blank-field-workspace')
  await writeRouteReport(blankFieldRoot)
  await writeGameplayEvidence(blankFieldWorkspace)
  await writeText(
    path.join(blankFieldWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md',
    noteFixture('first-30-minutes-notes.md').replace('- Tester: test fixture', '- Tester:'),
  )
  const blankField = run(blankFieldRoot, blankFieldWorkspace, ['--require-release-ready'])
  assert.equal(blankField.status, 1)
  assert.match(`${blankField.stdout}\n${blankField.stderr}`, /blank worksheet fields/u)

  const missingSectionRoot = path.join(tmp, 'missing-section-release-index')
  const missingSectionWorkspace = path.join(tmp, 'missing-section-workspace')
  await writeRouteReport(missingSectionRoot)
  await writeGameplayEvidence(missingSectionWorkspace)
  await writeText(
    path.join(missingSectionWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md',
    noteFixture('first-30-minutes-notes.md').replace('## Evidence Links\n\n', ''),
  )
  const missingSection = run(missingSectionRoot, missingSectionWorkspace, ['--require-release-ready'])
  assert.equal(missingSection.status, 1)
  assert.match(`${missingSection.stdout}\n${missingSection.stderr}`, /missing section ## Evidence Links/u)

  const missingNoteTermRoot = path.join(tmp, 'missing-note-term-release-index')
  const missingNoteTermWorkspace = path.join(tmp, 'missing-note-term-workspace')
  await writeRouteReport(missingNoteTermRoot)
  await writeGameplayEvidence(missingNoteTermWorkspace)
  await writeText(
    path.join(missingNoteTermWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md',
    noteFixture('first-30-minutes-notes.md').replace('hydroponics_deck revealed and attached', 'garden deck revealed and attached'),
  )
  const missingNoteTerm = run(missingNoteTermRoot, missingNoteTermWorkspace, ['--require-release-ready'])
  assert.equal(missingNoteTerm.status, 1)
  assert.match(`${missingNoteTerm.stdout}\n${missingNoteTerm.stderr}`, /missing required note term.*hydroponics_deck/u)

  const blockingLogRoot = path.join(tmp, 'blocking-log-release-index')
  const blockingLogWorkspace = path.join(tmp, 'blocking-log-workspace')
  await writeRouteReport(blockingLogRoot)
  await writeGameplayEvidence(blockingLogWorkspace)
  await writeText(
    path.join(blockingLogWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log',
    '[main/FATAL] Crash report generated after failed to load world\n',
  )
  const blockingLog = run(blockingLogRoot, blockingLogWorkspace, ['--require-release-ready'])
  assert.equal(blockingLog.status, 1)
  assert.match(`${blockingLog.stdout}\n${blockingLog.stderr}`, /blocking log signature.*crash report/u)

  const missingLogProvenanceRoot = path.join(tmp, 'missing-log-provenance-release-index')
  const missingLogProvenanceWorkspace = path.join(tmp, 'missing-log-provenance-workspace')
  await writeRouteReport(missingLogProvenanceRoot)
  await writeGameplayEvidence(missingLogProvenanceWorkspace)
  await writeText(
    path.join(missingLogProvenanceWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log',
    'Sky Relay launcher install log\nStatus: completed without blocking crash\n',
  )
  const missingLogProvenance = run(missingLogProvenanceRoot, missingLogProvenanceWorkspace, ['--require-release-ready'])
  assert.equal(missingLogProvenance.status, 1)
  assert.match(`${missingLogProvenance.stdout}\n${missingLogProvenance.stderr}`, /missing required provenance artifactSha256/u)

  const missingClientSessionRoot = path.join(tmp, 'missing-client-session-release-index')
  const missingClientSessionWorkspace = path.join(tmp, 'missing-client-session-workspace')
  await writeRouteReport(missingClientSessionRoot)
  await writeGameplayEvidence(missingClientSessionWorkspace)
  const clientSessionEditionRoot = path.join(missingClientSessionWorkspace, 'ECHO-Sky-Relay-Native-Edition')
  const clientSessionEvidence = JSON.parse(await fs.readFile(
    path.join(clientSessionEditionRoot, 'fixtures/sky-relay/gameplay-qa/manual-evidence.json'),
    'utf8',
  ))
  const signalCrownSession = clientSessionEvidence.sessions.find((session) => session.id === 'signal_crown_completion')
  const signalCrownStartMarker = `${signalCrownSession.id}.startedAt=${signalCrownSession.startedAt}`
  await writeText(
    clientSessionEditionRoot,
    'fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log',
    logFixture(
      { packId: clientSessionEvidence.packId, run: clientSessionEvidence.run, sessions: clientSessionEvidence.sessions },
      'fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log',
    )
      .replace(signalCrownStartMarker, `${signalCrownSession.id}.startedAt=2026-06-11T02:04:59Z`),
  )
  const missingClientSession = run(missingClientSessionRoot, missingClientSessionWorkspace, ['--require-release-ready'])
  assert.equal(missingClientSession.status, 1)
  assert.match(`${missingClientSession.stdout}\n${missingClientSession.stderr}`, /missing required client log session marker signal_crown_completion\.startedAt/u)

  const incompletePngRoot = path.join(tmp, 'incomplete-png-release-index')
  const incompletePngWorkspace = path.join(tmp, 'incomplete-png-workspace')
  await writeRouteReport(incompletePngRoot)
  await writeGameplayEvidence(incompletePngWorkspace)
  await writeBytes(
    path.join(incompletePngWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png',
    pngHeaderOnlyFixture(),
  )
  const incompletePng = run(incompletePngRoot, incompletePngWorkspace, ['--require-release-ready'])
  assert.equal(incompletePng.status, 1)
  assert.match(`${incompletePng.stdout}\n${incompletePng.stderr}`, /complete PNG image with valid chunks/u)

  const blankPngRoot = path.join(tmp, 'blank-png-release-index')
  const blankPngWorkspace = path.join(tmp, 'blank-png-workspace')
  await writeRouteReport(blankPngRoot)
  await writeGameplayEvidence(blankPngWorkspace)
  await writeBytes(
    path.join(blankPngWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png',
    blankPngFixture(),
  )
  const blankPng = run(blankPngRoot, blankPngWorkspace, ['--require-release-ready'])
  assert.equal(blankPng.status, 1)
  assert.match(`${blankPng.stdout}\n${blankPng.stderr}`, /PNG must contain visible pixel variation/u)

  const lowResolutionRoot = path.join(tmp, 'low-resolution-release-index')
  const lowResolutionWorkspace = path.join(tmp, 'low-resolution-workspace')
  await writeRouteReport(lowResolutionRoot)
  await writeGameplayEvidence(lowResolutionWorkspace)
  await writeBytes(
    path.join(lowResolutionWorkspace, 'ECHO-Sky-Relay-Native-Edition'),
    'fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png',
    pngFixture(320, 180),
  )
  const lowResolution = run(lowResolutionRoot, lowResolutionWorkspace, ['--require-release-ready'])
  assert.equal(lowResolution.status, 1)
  assert.match(`${lowResolution.stdout}\n${lowResolution.stderr}`, /PNG dimensions must be at least 640x360/u)

  const computerUseRoot = path.join(tmp, 'computer-use-release-index')
  const computerUseWorkspace = path.join(tmp, 'computer-use-workspace')
  await writeRouteReport(computerUseRoot)
  await writeGameplayEvidence(computerUseWorkspace)
  const computerUseEditionRoot = path.join(computerUseWorkspace, 'ECHO-Sky-Relay-Native-Edition')
  const computerUseEvidencePath = path.join(computerUseEditionRoot, 'fixtures/sky-relay/gameplay-qa/manual-evidence.json')
  const computerUseEvidence = JSON.parse(await fs.readFile(computerUseEvidencePath, 'utf8'))
  computerUseEvidence.capture = {
    computerUseSession: 'fixtures/sky-relay/gameplay-qa/computer-use-session.json',
  }
  await fs.writeFile(computerUseEvidencePath, `${JSON.stringify(computerUseEvidence, null, 2)}\n`, 'utf8')
  await writeJson(computerUseEditionRoot, 'fixtures/sky-relay/gameplay-qa/computer-use-session.json', {
    schemaVersion: 'echo.release_index.family_gameplay_computer_use_session.v1',
    familyKey: 'sky-relay',
    family: 'Sky Relay',
    lane: 'native',
    packId: 'sky-relay-native-edition',
    appId: 'SkyRelayNativeTest.exe',
    windowTitle: 'Sky Relay Native Test Window',
    actions: [
      'Opened inventory and verified Index UI from the visible game window.',
      'Opened Terminal, HoloMap, and Lens surfaces during the captured route.',
    ],
    verificationChecks: [
      {
        id: 'inventoryIndexVisible',
        label: 'Inventory Index visible after opening inventory',
        status: 'captured',
        evidenceRef: 'fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png',
        note: 'Visible UI action is tied to the imported first-30-minute screenshot.',
      },
      {
        id: 'freshWorldCreated',
        label: 'Fresh world/profile created',
        status: 'captured',
        evidenceRef: 'freshWorldCreated',
        note: 'Claim is backed by required notes, screenshot, and logs.',
      },
    ],
    verificationSummary: {
      checkCount: 2,
      capturedCount: 2,
      blockedCount: 0,
      notAttemptedCount: 0,
    },
  })
  const computerUse = run(computerUseRoot, computerUseWorkspace, ['--require-release-ready'])
  assert.equal(computerUse.status, 0, `${computerUse.stdout}\n${computerUse.stderr}`)
  const computerUseReport = JSON.parse(computerUse.stdout)
  assert.equal(computerUseReport.editions[0].capture.computerUseSession.status, 'provided')
  assert.equal(computerUseReport.editions[0].capture.computerUseSession.verificationSummary.capturedCount, 2)

  const badComputerUseRoot = path.join(tmp, 'bad-computer-use-release-index')
  const badComputerUseWorkspace = path.join(tmp, 'bad-computer-use-workspace')
  await writeRouteReport(badComputerUseRoot)
  await writeGameplayEvidence(badComputerUseWorkspace)
  const badComputerUseEditionRoot = path.join(badComputerUseWorkspace, 'ECHO-Sky-Relay-Native-Edition')
  const badComputerUseEvidencePath = path.join(badComputerUseEditionRoot, 'fixtures/sky-relay/gameplay-qa/manual-evidence.json')
  const badComputerUseEvidence = JSON.parse(await fs.readFile(badComputerUseEvidencePath, 'utf8'))
  badComputerUseEvidence.capture = {
    computerUseSession: 'fixtures/sky-relay/gameplay-qa/computer-use-session.json',
  }
  await fs.writeFile(badComputerUseEvidencePath, `${JSON.stringify(badComputerUseEvidence, null, 2)}\n`, 'utf8')
  await writeJson(badComputerUseEditionRoot, 'fixtures/sky-relay/gameplay-qa/computer-use-session.json', {
    schemaVersion: 'echo.release_index.family_gameplay_computer_use_session.v1',
    familyKey: 'sky-relay',
    lane: 'native',
    packId: 'sky-relay-native-edition',
    actions: ['Opened inventory and claimed a captured check without local proof.'],
    verificationChecks: [
      {
        id: 'terminalVisible',
        label: 'Terminal visible',
        status: 'captured',
        evidenceRef: 'missing-terminal-proof.png',
        note: 'This is not a required claim or local proof path.',
      },
    ],
    verificationSummary: {
      checkCount: 1,
      capturedCount: 1,
      blockedCount: 0,
      notAttemptedCount: 0,
    },
  })
  const badComputerUse = run(badComputerUseRoot, badComputerUseWorkspace, ['--require-release-ready'])
  assert.equal(badComputerUse.status, 1)
  assert.match(`${badComputerUse.stdout}\n${badComputerUse.stderr}`, /must reference a required claim or local proof path/u)
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}

console.log('Sky Relay gameplay evidence verifier fixtures passed.')
