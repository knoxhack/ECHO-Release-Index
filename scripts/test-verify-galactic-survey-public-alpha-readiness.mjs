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
assert.equal(report.evidenceSources.reports.editionDraftPublish, 'release-readiness/galactic-survey-draft-publish.json')
assert.equal(report.evidenceSources.reports.editionDraftDownload, 'release-readiness/galactic-survey-draft-download.json')
assert.equal(report.evidenceSources.reports.launcherLifecycleSmoke, 'release-readiness/galactic-survey-launcher-lifecycle-smoke.json')
assert.equal(report.evidenceSources.reports.runtimePlaytest, '../ECHO-Modules/addons/echogalacticsurveyprotocol/build/reports/galactic-survey/runtime-playtest.json')
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
assert.equal(report.editionPackEvidence.smoke.gates.githubDraftDownloadBack, 'passed')
assert.equal(report.editionPackEvidence.smoke.gates.installedFromDownloadedArtifacts, 'passed')
assert.equal(report.editionPackEvidence.smoke.gates.versionTransitionUpdate, 'passed')
assert.equal(report.editionPackEvidence.smoke.gates.repairCorruptFile, 'passed')
assert.equal(report.editionPackEvidence.smoke.gates.rollbackSimulatedReplacement, 'passed')
assert.equal(report.editionPackEvidence.smoke.artifactSource, 'github-draft-release-download')
assert.equal(report.editionPackEvidence.smoke.editions.length, 3)
for (const edition of report.editionPackEvidence.smoke.editions) {
  assert.equal(edition.githubDraftReleaseDownload, true)
  assert.equal(edition.releaseMetadataDraft, true)
  assert.equal(edition.releaseMetadataPrerelease, true)
}
assert.equal(report.editionDraftPublishEvidence.schemaVersion, 'echo.galactic_survey.draft-publish.v1')
assert.equal(report.editionDraftPublishEvidence.status, 'PASS')
assert.equal(report.editionDraftPublishEvidence.summary.draftReleasesPublished, true)
assert.equal(report.editionDraftPublishEvidence.summary.publishedEditionCount, 3)
assert.equal(report.editionDraftPublishEvidence.summary.publishedAssetCount, 15)
assert.equal(report.editionDraftPublishEvidence.editions.length, 3)
assert.equal(report.editionDraftDownloadEvidence.schemaVersion, 'echo.galactic_survey.draft-download.v1')
assert.equal(report.editionDraftDownloadEvidence.status, 'PASS')
assert.equal(report.editionDraftDownloadEvidence.summary.downloadedFromGitHubRelease, true)
assert.equal(report.editionDraftDownloadEvidence.summary.downloadedEditionCount, 3)
assert.equal(report.editionDraftDownloadEvidence.summary.downloadedAssetCount, 15)
assert.equal(report.editionDraftDownloadEvidence.editions.length, 3)
assert.equal(report.launcherLifecycleEvidence.schemaVersion, 'echo.galactic_survey.launcher-lifecycle-smoke.v1')
assert.equal(report.launcherLifecycleEvidence.ok, true)
assert.equal(report.launcherLifecycleEvidence.gates.launcherReleaseIndexDeepLinks, 'passed')
assert.equal(report.launcherLifecycleEvidence.gates.launcherInstallFromPackZip, 'passed')
assert.equal(report.launcherLifecycleEvidence.gates.launcherUpdateReconciliation, 'passed')
assert.equal(report.launcherLifecycleEvidence.gates.launcherVersionTransitionUpdate, 'passed')
assert.equal(report.launcherLifecycleEvidence.gates.launcherRepairCorruptFile, 'passed')
assert.equal(report.launcherLifecycleEvidence.gates.launcherRollbackSimulatedUpdate, 'passed')
assert.equal(report.launcherLifecycleEvidence.editions.length, 3)
for (const edition of report.launcherLifecycleEvidence.editions) {
  assert.equal(edition.fileCount, 18)
  assert.equal(edition.install.verifiedAfterInstall, 18)
  assert.equal(edition.update.verifiedAfterUpdate, 18)
  assert.equal(edition.postRollbackUpdate.verifiedAfterUpdate, 18)
  assert.equal(edition.repair.verifiedAfterRepair, 18)
  assert.match(edition.deepLinks.installAddon.url, /^echo:\/\/install\/addon\/echogalacticsurveyprotocol\?pack=galactic-survey-/)
}
assert.equal(report.commandReports.runtimePlaytest.status, 'passed')
assert.equal(report.runtimePlaytestEvidence.schemaVersion, 'echo.galactic_survey.runtime-playtest.v1')
assert.equal(report.runtimePlaytestEvidence.ok, true)
assert.equal(report.runtimePlaytestEvidence.scope, 'compiled-runtime-service')
for (const check of ['first30Loop', 'first2HourLoop', 'holomapMeaningful', 'surveyArrayRestored', 'saveReloadEquivalent', 'publicAlphaStillRequiresExternalEvidence']) {
  assert.equal(report.runtimePlaytestEvidence.runtimeChecks[check], true)
}
assert.equal(report.runtimePlaytestEvidence.releaseGatePreview.publicAlphaAllowed, false)
assert.ok(report.runtimePlaytestEvidence.releaseGatePreview.blockers.includes('real_first_30_playthrough'))
assert.ok(report.runtimePlaytestEvidence.releaseGatePreview.blockers.includes('no_crash_evidence'))
assert.ok(report.runtimePlaytestEvidence.releaseGatePreview.blockers.includes('launcher_install_update_repair_rollback'))
assert.ok(report.blockers.some((blocker) => blocker.includes('draft edition GitHub Release artifacts are verified')))
assert.ok(!report.blockers.some((blocker) => blocker.includes('downloaded GitHub Release launcher install, update, repair, and rollback evidence is not present')))
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
