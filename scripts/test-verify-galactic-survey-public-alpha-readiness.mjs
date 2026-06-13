import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(process.cwd())
const script = path.join(repoRoot, 'scripts', 'verify-galactic-survey-public-alpha-readiness.mjs')

const audit = spawnSync(process.execPath, [script], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: false
})

assert.equal(audit.status, 0, audit.stderr)
const report = JSON.parse(audit.stdout)
assert.equal(report.schemaVersion, 'echo.galactic_survey.public-alpha-readiness.v1')
assert.equal(report.status, 'BLOCKED')
assert.equal(report.project.moduleId, 'echogalacticsurveyprotocol')
assert.equal(report.phaseSummary.length, 10)
assert.equal(report.gates.full_progression_release, 'blocked')
assert.match(report.sourceRevisions.module.commit, /^[0-9a-f]{40}$/i)
assert.equal(report.sourceRevisions.module.committedProtocolModule, true)
assert.equal(report.sourceRevisions.module.committedExperiencePlan, true)
assert.equal(report.sourceRevisions.module.cleanForEvidence, true)
assert.match(report.sourceRevisions.editions.native.commit, /^[0-9a-f]{40}$/i)
assert.match(report.sourceRevisions.editions.neoforge.commit, /^[0-9a-f]{40}$/i)
assert.match(report.sourceRevisions.editions.standalone.commit, /^[0-9a-f]{40}$/i)
assert.ok(report.blockers.some((blocker) => blocker.includes('release-ready gameplay evidence is still missing')))
assert.equal(report.evidenceSources.reports.editionPackAssets, 'release-readiness/galactic-survey-edition-pack-assets.json')
assert.equal(report.evidenceSources.reports.editionPackSmoke, 'release-readiness/galactic-survey-edition-pack-smoke.json')
assert.equal(report.editionPackEvidence.assets.schemaVersion, 'echo.galactic_survey.edition-pack-assets.v1')
assert.equal(report.editionPackEvidence.assets.gates.editionPackAssetsBuilt, 'passed')
assert.equal(report.editionPackEvidence.assets.gates.localStageChecksums, 'passed')
assert.equal(report.editionPackEvidence.assets.gates.zipMatchesPackManifest, 'passed')
assert.equal(report.editionPackEvidence.assets.packagedModules.length, 18)
assert.ok(report.editionPackEvidence.assets.packagedModules.includes('echoaddonapi'))
assert.equal(report.editionPackEvidence.assets.editions.length, 3)
assert.equal(report.editionPackEvidence.smoke.schemaVersion, 'echo.galactic_survey.edition-pack-smoke.v1')
assert.equal(report.editionPackEvidence.smoke.ok, true)
assert.equal(report.editionPackEvidence.smoke.gates.installFromPackZip, 'passed')
assert.equal(report.editionPackEvidence.smoke.gates.versionTransitionUpdate, 'passed')
assert.equal(report.editionPackEvidence.smoke.gates.repairCorruptFile, 'passed')
assert.equal(report.editionPackEvidence.smoke.gates.rollbackSimulatedReplacement, 'passed')
assert.equal(report.editionPackEvidence.smoke.editions.length, 3)
assert.ok(report.blockers.some((blocker) => blocker.includes('downloaded GitHub Release launcher install, update, repair, and rollback evidence is not present')))
assert.equal(report.promotion.publicAlphaCanBeDeclaredReady, false)

const releaseReady = spawnSync(process.execPath, [script, '--require-release-ready'], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: false
})

assert.notEqual(releaseReady.status, 0, 'require-release-ready must fail while Galactic Survey is blocked')
const blockedReport = JSON.parse(releaseReady.stdout)
assert.equal(blockedReport.status, 'BLOCKED')
assert.ok(blockedReport.blockers.length > 0)

console.log('Galactic Survey public-alpha readiness verifier test passed.')
