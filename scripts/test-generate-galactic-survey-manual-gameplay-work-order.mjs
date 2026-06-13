#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'generate-galactic-survey-manual-gameplay-work-order.mjs')

const editions = [
  { key: 'native', packId: 'galactic-survey-native-edition', repo: 'ECHO-Galactic-Survey-Native-Edition', asset: 'galactic-survey-native-edition-0.1.0.zip' },
  { key: 'neoforge', packId: 'galactic-survey-neoforge-edition', repo: 'ECHO-Galactic-Survey-NeoForge-Edition', asset: 'galactic-survey-neoforge-edition-0.1.0.zip' },
  { key: 'standalone', packId: 'galactic-survey-standalone-edition', repo: 'ECHO-Galactic-Survey-Standalone-Edition', asset: 'galactic-survey-standalone-edition-0.1.0.zip' }
]

const requiredPaths = {
  supportingFiles: [
    'fixtures/galactic-survey/gameplay-qa/evidence/fresh-world-notes.md',
    'fixtures/galactic-survey/gameplay-qa/evidence/first-30-minutes-notes.md',
    'fixtures/galactic-survey/gameplay-qa/evidence/first-2-hours-notes.md',
    'fixtures/galactic-survey/gameplay-qa/evidence/survey-array-verification.md',
    'fixtures/galactic-survey/gameplay-qa/evidence/no-crash-review.md'
  ],
  screenshots: [
    'fixtures/galactic-survey/gameplay-qa/evidence/screenshots/fresh-world-created.png',
    'fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-30-minutes.png',
    'fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-2-hours.png',
    'fixtures/galactic-survey/gameplay-qa/evidence/screenshots/survey-array-complete.png'
  ],
  logs: [
    'fixtures/galactic-survey/gameplay-qa/evidence/logs/client-playthrough.log'
  ],
  saveSnapshots: [
    'fixtures/galactic-survey/gameplay-qa/evidence/saves/first-30-minutes-save.zip',
    'fixtures/galactic-survey/gameplay-qa/evidence/saves/first-2-hours-save.zip',
    'fixtures/galactic-survey/gameplay-qa/evidence/saves/survey-array-save.zip'
  ]
}

const claims = {
  realFirst30Playthrough: true,
  realFirst2HourPlaythrough: true,
  realSurveyArrayPlaythrough: true,
  freshWorldCreated: true,
  saveReloadVerified: true,
  noCrashEvidence: true
}

const releaseGates = [
  ['probe_launch_works', 'probe:starter_probe', 'realFirst30Playthrough', 'manual:first_30_minutes'],
  ['holomap_reveals_meaningful_data', 'holomap_layer:scan_cones', 'realFirst30Playthrough', 'manual:first_30_minutes'],
  ['catalog_entries_unlock_from_discoveries', 'discovery:barren_moon_kg_01a', 'realFirst30Playthrough', 'manual:first_30_minutes'],
  ['fuel_route_limits_understandable', 'route:near_sector_01_survey_hop', 'realFirst2HourPlaythrough', 'manual:first_2_hours'],
  ['one_salvage_site_playable', 'salvage:derelict_relay_osprey', 'realFirst2HourPlaythrough', 'manual:first_2_hours'],
  ['one_probe_upgrade_matters', 'item:long_range_probe', 'realFirst2HourPlaythrough', 'manual:first_2_hours'],
  ['first_2_hour_loop_no_dead_end', 'mission:first_survey_circuit', 'realFirst2HourPlaythrough', 'manual:first_2_hours'],
  ['real_first_30_playthrough', 'manual:real_first_30_playthrough', 'realFirst30Playthrough', 'manual:first_30_minutes'],
  ['real_first_2_hour_playthrough', 'manual:real_first_2_hour_playthrough', 'realFirst2HourPlaythrough', 'manual:first_2_hours'],
  ['real_survey_array_playthrough', 'manual:real_survey_array_playthrough', 'realSurveyArrayPlaythrough', 'manual:survey_array_completion'],
  ['fresh_world_created', 'manual:fresh_world_created', 'freshWorldCreated', 'manual:fresh_world_creation'],
  ['save_reload_verified', 'manual:save_reload_verified', 'saveReloadVerified', 'manual:save_reload_verification'],
  ['no_crash_evidence', 'manual:no_crash_evidence', 'noCrashEvidence', 'manual:no_crash_review']
]

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function requiredReleaseGates() {
  return releaseGates.map(([id, proof, requiredClaim]) => ({ id, proof, requiredClaim }))
}

function evidenceReleaseGates(pass) {
  return releaseGates.map(([id, proof, requiredClaim, evidenceSource]) => ({
    id,
    proof,
    requiredClaim,
    satisfied: pass,
    evidenceSource: pass ? evidenceSource : 'template'
  }))
}

function manualEvidence(packId, artifact, pass) {
  return {
    schemaVersion: 'echo.galactic_survey.gameplay-qa.manual.v1',
    packId,
    generatedAt: pass ? '2026-06-13T16:00:00Z' : '1970-01-01T00:00:00Z',
    claims: Object.fromEntries(Object.keys(claims).map((claim) => [claim, pass])),
    releaseGates: evidenceReleaseGates(pass),
    supportingFiles: pass ? requiredPaths.supportingFiles : [],
    screenshots: pass ? requiredPaths.screenshots : [],
    logs: pass ? requiredPaths.logs : [],
    saveSnapshots: pass ? requiredPaths.saveSnapshots : [],
    run: {
      tester: pass ? 'QA' : 'TBD',
      releaseTag: `${packId.replace('-edition', '')}-0.1.0-alpha`,
      artifactAsset: artifact.artifactAsset,
      artifactSha256: pass ? artifact.artifactSha256 : 'TBD',
      artifactSize: pass ? artifact.artifactSize : 0,
      launcherChannel: 'alpha',
      worldOrProfile: pass ? 'Galactic Survey QA' : 'TBD',
      installedFrom: 'ECHO Launcher',
      startedAt: pass ? '2026-06-13T16:00:00Z' : '1970-01-01T00:00:00Z'
    },
    sessions: [
      ['fresh_world_creation', 'freshWorldCreated', 2],
      ['first_30_minutes', 'realFirst30Playthrough', 31],
      ['first_2_hours', 'realFirst2HourPlaythrough', 125],
      ['survey_array_completion', 'realSurveyArrayPlaythrough', 5],
      ['save_reload_verification', 'saveReloadVerified', 2],
      ['no_crash_review', 'noCrashEvidence', 1]
    ].map(([id, claim, durationMinutes]) => ({
      id,
      claim,
      startedAt: pass ? '2026-06-13T16:00:00Z' : '1970-01-01T00:00:00Z',
      endedAt: pass ? '2026-06-13T18:10:00Z' : '1970-01-01T00:01:00Z',
      durationMinutes,
      evidence: {}
    }))
  }
}

function releaseEvidence(packId, pass) {
  return {
    schemaVersion: 'echo.galactic_survey.edition-gameplay-evidence.v1',
    status: pass ? 'PASS' : 'BLOCKED',
    evidencePath: 'fixtures/galactic-survey/gameplay-qa/manual-evidence.json',
    requiredReleaseGates: requiredReleaseGates(),
    manualEvidence: {
      found: true,
      claims: Object.fromEntries(Object.keys(claims).map((claim) => [claim, pass])),
      releaseGates: evidenceReleaseGates(pass),
      sessions: pass
        ? ['fresh_world_creation', 'first_30_minutes', 'first_2_hours', 'survey_array_completion', 'save_reload_verification', 'no_crash_review']
        : []
    },
    blockers: pass ? [] : [`${packId} manual evidence is still template-only.`]
  }
}

function readinessFixture(pass) {
  const artifactByPack = Object.fromEntries(editions.map((edition, index) => [
    edition.packId,
    {
      artifactAsset: edition.asset,
      artifactSha256: String(index + 1).padStart(64, 'a').slice(0, 64),
      artifactSize: 1000 + index
    }
  ]))
  return {
    schemaVersion: 'echo.galactic_survey.public-alpha-readiness.v1',
    status: pass ? 'PASS' : 'BLOCKED',
    project: {
      moduleId: 'echogalacticsurveyprotocol',
      packIds: editions.map((edition) => edition.packId)
    },
    gates: {
      full_progression_release: pass ? 'passed' : 'blocked'
    },
    editionReleasePublicationEvidence: {
      editions: editions.map((edition) => ({
        packId: edition.packId,
        releaseTag: `${edition.packId.replace('-edition', '')}-0.1.0-alpha`,
        release: { htmlUrl: `https://example.invalid/${edition.packId}` },
        assets: [
          {
            name: artifactByPack[edition.packId].artifactAsset,
            size: artifactByPack[edition.packId].artifactSize,
            sha256: artifactByPack[edition.packId].artifactSha256
          }
        ]
      }))
    },
    sourceRevisions: {
      editions: Object.fromEntries(editions.map((edition) => [
        edition.key,
        {
          repository: `knoxhack/${edition.repo}`,
          workspaceDir: edition.repo,
          commit: String(edition.key.length).padStart(40, '0'),
          cleanForEvidence: true
        }
      ]))
    },
    commandReports: {
      editions: editions.map((edition) => ({
        id: edition.packId,
        releaseEvidence: {
          status: pass ? 'passed' : 'blocked',
          stdout: JSON.stringify(releaseEvidence(edition.packId, pass))
        }
      }))
    },
    blockers: pass ? [] : editions.map((edition) => `${edition.packId} release-ready gameplay evidence is still missing`),
    artifactByPack
  }
}

async function writeManualEvidenceSiblings(root, fixture, pass) {
  for (const edition of editions) {
    const artifact = fixture.artifactByPack[edition.packId]
    await writeJson(
      path.resolve(root, '..', edition.repo, 'fixtures/galactic-survey/gameplay-qa/manual-evidence.json'),
      manualEvidence(edition.packId, artifact, pass)
    )
    if (pass) {
      for (const relPath of Object.values(requiredPaths).flat()) {
        const filePath = path.resolve(root, '..', edition.repo, relPath)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, `evidence for ${edition.packId} ${relPath}\n`, 'utf8')
      }
    }
  }
}

function run(root, report, out, markdown, extraArgs = []) {
  return spawnSync(process.execPath, [
    script,
    '--root', root,
    '--report', report,
    '--out', out,
    '--markdown', markdown,
    ...extraArgs
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  })
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'galactic-work-order-'))
try {
  const blockedFixture = readinessFixture(false)
  const blockedReport = 'release-readiness/galactic-survey-public-alpha-readiness.json'
  const blockedOut = 'release-readiness/galactic-survey-manual-gameplay-work-order.json'
  const blockedMarkdown = 'docs/galactic-survey-manual-gameplay-work-order.md'
  await writeJson(path.join(tmp, blockedReport), blockedFixture)
  await writeManualEvidenceSiblings(tmp, blockedFixture, false)
  const blocked = run(tmp, blockedReport, blockedOut, blockedMarkdown, ['--write'])
  assert.equal(blocked.status, 0, `${blocked.stdout}\n${blocked.stderr}`)
  const blockedWorkOrder = JSON.parse(await fs.readFile(path.join(tmp, blockedOut), 'utf8'))
  assert.equal(blockedWorkOrder.status, 'OPEN')
  assert.equal(blockedWorkOrder.totals.openEditions, 3)
  assert.ok(blockedWorkOrder.totals.openTasks > 0)
  const blockedText = await fs.readFile(path.join(tmp, blockedMarkdown), 'utf8')
  assert.match(blockedText, /Galactic Survey Manual Gameplay Work Order/u)
  assert.match(blockedText, /import-manual-gameplay-capture\.mjs/u)

  const passFixture = readinessFixture(true)
  const passReport = 'pass/galactic-survey-public-alpha-readiness.json'
  const passOut = 'pass/work-order.json'
  const passMarkdown = 'pass/work-order.md'
  await writeJson(path.join(tmp, passReport), passFixture)
  await writeManualEvidenceSiblings(tmp, passFixture, true)
  const pass = run(tmp, passReport, passOut, passMarkdown, ['--write'])
  assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`)
  const passWorkOrder = JSON.parse(await fs.readFile(path.join(tmp, passOut), 'utf8'))
  assert.equal(passWorkOrder.status, 'COMPLETE')
  assert.equal(passWorkOrder.totals.openTasks, 0)
  assert.equal(passWorkOrder.editions.length, 3)

  console.log('Galactic Survey manual gameplay work-order generator fixtures passed.')
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}
