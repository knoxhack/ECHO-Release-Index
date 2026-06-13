# Galactic Survey Manual Gameplay Work Order

Status: `OPEN`

Generated from [release-readiness/galactic-survey-public-alpha-readiness.json](../release-readiness/galactic-survey-public-alpha-readiness.json).
Machine-readable work order: [release-readiness/galactic-survey-manual-gameplay-work-order.json](../release-readiness/galactic-survey-manual-gameplay-work-order.json).

This checklist turns the remaining gameplay blockers into exact capture tasks. It is not release evidence by itself.

## Summary

| Field | Value |
| --- | --- |
| Readiness status | `BLOCKED` |
| Editions | 3 |
| Open editions | 3 |
| Open tasks | 27 |

## Refresh

```powershell
node scripts\verify-galactic-survey-public-alpha-readiness.mjs --write
node scripts\generate-galactic-survey-manual-gameplay-work-order.mjs --write
```

## galactic-survey-native-edition

| Field | Value |
| --- | --- |
| Repository | `knoxhack/ECHO-Galactic-Survey-Native-Edition` |
| Workspace | `ECHO-Galactic-Survey-Native-Edition` |
| Manual evidence | `fixtures/galactic-survey/gameplay-qa/manual-evidence.json` |
| Status | `open` |
| Open tasks | 9 |

### Capture

```powershell
Set-Location ..\ECHO-Galactic-Survey-Native-Edition
node scripts\import-manual-gameplay-capture.mjs --capture-root <capture-root> --artifact <downloaded-pack-zip> --tester <name> --world-or-profile <name> --started-at <iso> --force
```

### Verify

```powershell
Set-Location ..\ECHO-Galactic-Survey-Native-Edition
node scripts\verify-manual-gameplay-evidence.mjs --template-only
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Tasks

| Task | Status |
| --- | --- |
| Manual capture kit is present | `passed` |
| Run identity and artifact match are filled | `open` |
| Manual gameplay claims are true | `open` |
| All 13 release gates cite real evidence sources | `open` |
| Required session records are complete | `open` |
| Gameplay notes | `open` |
| Screenshots | `open` |
| Client logs | `open` |
| Save snapshots | `open` |
| Edition local evidence verifier passes | `open` |

### Required Files

#### Gameplay notes

- `open` fixtures/galactic-survey/gameplay-qa/evidence/fresh-world-notes.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/first-30-minutes-notes.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/first-2-hours-notes.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/survey-array-verification.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/no-crash-review.md

#### Screenshots

- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/fresh-world-created.png
- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-30-minutes.png
- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-2-hours.png
- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/survey-array-complete.png

#### Client logs

- `open` fixtures/galactic-survey/gameplay-qa/evidence/logs/client-playthrough.log

#### Save snapshots

- `open` fixtures/galactic-survey/gameplay-qa/evidence/saves/first-30-minutes-save.zip
- `open` fixtures/galactic-survey/gameplay-qa/evidence/saves/first-2-hours-save.zip
- `open` fixtures/galactic-survey/gameplay-qa/evidence/saves/survey-array-save.zip

### Current Blockers

- phase 10 Full Progression And Release: galactic-survey-native-edition release-ready gameplay evidence is still missing
- manualEvidence.sessions missing fresh_world_creation.
- manualEvidence.sessions missing first_30_minutes.
- manualEvidence.sessions missing first_2_hours.
- manualEvidence.sessions missing survey_array_completion.
- manualEvidence.sessions missing save_reload_verification.
- manualEvidence.sessions missing no_crash_review.
- manualEvidence claim realFirst30Playthrough must be true.
- manualEvidence claim realFirst2HourPlaythrough must be true.
- manualEvidence claim realSurveyArrayPlaythrough must be true.
- manualEvidence claim freshWorldCreated must be true.
- manualEvidence claim saveReloadVerified must be true.
- manualEvidence claim noCrashEvidence must be true.
- manualEvidence release gate probe_launch_works must be satisfied.
- manualEvidence release gate probe_launch_works requires claim realFirst30Playthrough.
- manualEvidence release gate probe_launch_works must name real evidenceSource.
- manualEvidence release gate holomap_reveals_meaningful_data must be satisfied.
- manualEvidence release gate holomap_reveals_meaningful_data requires claim realFirst30Playthrough.
- manualEvidence release gate holomap_reveals_meaningful_data must name real evidenceSource.
- manualEvidence release gate catalog_entries_unlock_from_discoveries must be satisfied.
- manualEvidence release gate catalog_entries_unlock_from_discoveries requires claim realFirst30Playthrough.
- manualEvidence release gate catalog_entries_unlock_from_discoveries must name real evidenceSource.
- manualEvidence release gate fuel_route_limits_understandable must be satisfied.
- manualEvidence release gate fuel_route_limits_understandable requires claim realFirst2HourPlaythrough.
- manualEvidence release gate fuel_route_limits_understandable must name real evidenceSource.
- manualEvidence release gate one_salvage_site_playable must be satisfied.
- manualEvidence release gate one_salvage_site_playable requires claim realFirst2HourPlaythrough.
- manualEvidence release gate one_salvage_site_playable must name real evidenceSource.
- manualEvidence release gate one_probe_upgrade_matters must be satisfied.
- manualEvidence release gate one_probe_upgrade_matters requires claim realFirst2HourPlaythrough.
- manualEvidence release gate one_probe_upgrade_matters must name real evidenceSource.
- manualEvidence release gate first_2_hour_loop_no_dead_end must be satisfied.
- manualEvidence release gate first_2_hour_loop_no_dead_end requires claim realFirst2HourPlaythrough.
- manualEvidence release gate first_2_hour_loop_no_dead_end must name real evidenceSource.
- manualEvidence release gate real_first_30_playthrough must be satisfied.
- manualEvidence release gate real_first_30_playthrough requires claim realFirst30Playthrough.
- manualEvidence release gate real_first_30_playthrough must name real evidenceSource.
- manualEvidence release gate real_first_2_hour_playthrough must be satisfied.
- manualEvidence release gate real_first_2_hour_playthrough requires claim realFirst2HourPlaythrough.
- manualEvidence release gate real_first_2_hour_playthrough must name real evidenceSource.
- manualEvidence release gate real_survey_array_playthrough must be satisfied.
- manualEvidence release gate real_survey_array_playthrough requires claim realSurveyArrayPlaythrough.
- manualEvidence release gate real_survey_array_playthrough must name real evidenceSource.
- manualEvidence release gate fresh_world_created must be satisfied.
- manualEvidence release gate fresh_world_created requires claim freshWorldCreated.
- manualEvidence release gate fresh_world_created must name real evidenceSource.
- manualEvidence release gate save_reload_verified must be satisfied.
- manualEvidence release gate save_reload_verified requires claim saveReloadVerified.
- manualEvidence release gate save_reload_verified must name real evidenceSource.
- manualEvidence release gate no_crash_evidence must be satisfied.
- manualEvidence release gate no_crash_evidence requires claim noCrashEvidence.
- manualEvidence release gate no_crash_evidence must name real evidenceSource.
- manualEvidence.run.tester must contain real capture data.
- manualEvidence.run.artifactSha256 must contain real capture data.
- manualEvidence.run.artifactSize must contain real capture data.
- manualEvidence.run.worldOrProfile must contain real capture data.
- manualEvidence.run.startedAt must contain real capture data.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/fresh-world-notes.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/first-30-minutes-notes.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/first-2-hours-notes.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/survey-array-verification.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/no-crash-review.md.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/fresh-world-created.png.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-30-minutes.png.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-2-hours.png.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/survey-array-complete.png.
- manualEvidence.logs missing file fixtures/galactic-survey/gameplay-qa/evidence/logs/client-playthrough.log.
- manualEvidence.saveSnapshots missing file fixtures/galactic-survey/gameplay-qa/evidence/saves/first-30-minutes-save.zip.
- manualEvidence.saveSnapshots missing file fixtures/galactic-survey/gameplay-qa/evidence/saves/first-2-hours-save.zip.
- manualEvidence.saveSnapshots missing file fixtures/galactic-survey/gameplay-qa/evidence/saves/survey-array-save.zip.

## galactic-survey-neoforge-edition

| Field | Value |
| --- | --- |
| Repository | `knoxhack/ECHO-Galactic-Survey-NeoForge-Edition` |
| Workspace | `ECHO-Galactic-Survey-NeoForge-Edition` |
| Manual evidence | `fixtures/galactic-survey/gameplay-qa/manual-evidence.json` |
| Status | `open` |
| Open tasks | 9 |

### Capture

```powershell
Set-Location ..\ECHO-Galactic-Survey-NeoForge-Edition
node scripts\import-manual-gameplay-capture.mjs --capture-root <capture-root> --artifact <downloaded-pack-zip> --tester <name> --world-or-profile <name> --started-at <iso> --force
```

### Verify

```powershell
Set-Location ..\ECHO-Galactic-Survey-NeoForge-Edition
node scripts\verify-manual-gameplay-evidence.mjs --template-only
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Tasks

| Task | Status |
| --- | --- |
| Manual capture kit is present | `passed` |
| Run identity and artifact match are filled | `open` |
| Manual gameplay claims are true | `open` |
| All 13 release gates cite real evidence sources | `open` |
| Required session records are complete | `open` |
| Gameplay notes | `open` |
| Screenshots | `open` |
| Client logs | `open` |
| Save snapshots | `open` |
| Edition local evidence verifier passes | `open` |

### Required Files

#### Gameplay notes

- `open` fixtures/galactic-survey/gameplay-qa/evidence/fresh-world-notes.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/first-30-minutes-notes.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/first-2-hours-notes.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/survey-array-verification.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/no-crash-review.md

#### Screenshots

- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/fresh-world-created.png
- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-30-minutes.png
- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-2-hours.png
- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/survey-array-complete.png

#### Client logs

- `open` fixtures/galactic-survey/gameplay-qa/evidence/logs/client-playthrough.log

#### Save snapshots

- `open` fixtures/galactic-survey/gameplay-qa/evidence/saves/first-30-minutes-save.zip
- `open` fixtures/galactic-survey/gameplay-qa/evidence/saves/first-2-hours-save.zip
- `open` fixtures/galactic-survey/gameplay-qa/evidence/saves/survey-array-save.zip

### Current Blockers

- phase 10 Full Progression And Release: galactic-survey-neoforge-edition release-ready gameplay evidence is still missing
- manualEvidence.sessions missing fresh_world_creation.
- manualEvidence.sessions missing first_30_minutes.
- manualEvidence.sessions missing first_2_hours.
- manualEvidence.sessions missing survey_array_completion.
- manualEvidence.sessions missing save_reload_verification.
- manualEvidence.sessions missing no_crash_review.
- manualEvidence claim realFirst30Playthrough must be true.
- manualEvidence claim realFirst2HourPlaythrough must be true.
- manualEvidence claim realSurveyArrayPlaythrough must be true.
- manualEvidence claim freshWorldCreated must be true.
- manualEvidence claim saveReloadVerified must be true.
- manualEvidence claim noCrashEvidence must be true.
- manualEvidence release gate probe_launch_works must be satisfied.
- manualEvidence release gate probe_launch_works requires claim realFirst30Playthrough.
- manualEvidence release gate probe_launch_works must name real evidenceSource.
- manualEvidence release gate holomap_reveals_meaningful_data must be satisfied.
- manualEvidence release gate holomap_reveals_meaningful_data requires claim realFirst30Playthrough.
- manualEvidence release gate holomap_reveals_meaningful_data must name real evidenceSource.
- manualEvidence release gate catalog_entries_unlock_from_discoveries must be satisfied.
- manualEvidence release gate catalog_entries_unlock_from_discoveries requires claim realFirst30Playthrough.
- manualEvidence release gate catalog_entries_unlock_from_discoveries must name real evidenceSource.
- manualEvidence release gate fuel_route_limits_understandable must be satisfied.
- manualEvidence release gate fuel_route_limits_understandable requires claim realFirst2HourPlaythrough.
- manualEvidence release gate fuel_route_limits_understandable must name real evidenceSource.
- manualEvidence release gate one_salvage_site_playable must be satisfied.
- manualEvidence release gate one_salvage_site_playable requires claim realFirst2HourPlaythrough.
- manualEvidence release gate one_salvage_site_playable must name real evidenceSource.
- manualEvidence release gate one_probe_upgrade_matters must be satisfied.
- manualEvidence release gate one_probe_upgrade_matters requires claim realFirst2HourPlaythrough.
- manualEvidence release gate one_probe_upgrade_matters must name real evidenceSource.
- manualEvidence release gate first_2_hour_loop_no_dead_end must be satisfied.
- manualEvidence release gate first_2_hour_loop_no_dead_end requires claim realFirst2HourPlaythrough.
- manualEvidence release gate first_2_hour_loop_no_dead_end must name real evidenceSource.
- manualEvidence release gate real_first_30_playthrough must be satisfied.
- manualEvidence release gate real_first_30_playthrough requires claim realFirst30Playthrough.
- manualEvidence release gate real_first_30_playthrough must name real evidenceSource.
- manualEvidence release gate real_first_2_hour_playthrough must be satisfied.
- manualEvidence release gate real_first_2_hour_playthrough requires claim realFirst2HourPlaythrough.
- manualEvidence release gate real_first_2_hour_playthrough must name real evidenceSource.
- manualEvidence release gate real_survey_array_playthrough must be satisfied.
- manualEvidence release gate real_survey_array_playthrough requires claim realSurveyArrayPlaythrough.
- manualEvidence release gate real_survey_array_playthrough must name real evidenceSource.
- manualEvidence release gate fresh_world_created must be satisfied.
- manualEvidence release gate fresh_world_created requires claim freshWorldCreated.
- manualEvidence release gate fresh_world_created must name real evidenceSource.
- manualEvidence release gate save_reload_verified must be satisfied.
- manualEvidence release gate save_reload_verified requires claim saveReloadVerified.
- manualEvidence release gate save_reload_verified must name real evidenceSource.
- manualEvidence release gate no_crash_evidence must be satisfied.
- manualEvidence release gate no_crash_evidence requires claim noCrashEvidence.
- manualEvidence release gate no_crash_evidence must name real evidenceSource.
- manualEvidence.run.tester must contain real capture data.
- manualEvidence.run.artifactSha256 must contain real capture data.
- manualEvidence.run.artifactSize must contain real capture data.
- manualEvidence.run.worldOrProfile must contain real capture data.
- manualEvidence.run.startedAt must contain real capture data.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/fresh-world-notes.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/first-30-minutes-notes.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/first-2-hours-notes.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/survey-array-verification.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/no-crash-review.md.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/fresh-world-created.png.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-30-minutes.png.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-2-hours.png.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/survey-array-complete.png.
- manualEvidence.logs missing file fixtures/galactic-survey/gameplay-qa/evidence/logs/client-playthrough.log.
- manualEvidence.saveSnapshots missing file fixtures/galactic-survey/gameplay-qa/evidence/saves/first-30-minutes-save.zip.
- manualEvidence.saveSnapshots missing file fixtures/galactic-survey/gameplay-qa/evidence/saves/first-2-hours-save.zip.
- manualEvidence.saveSnapshots missing file fixtures/galactic-survey/gameplay-qa/evidence/saves/survey-array-save.zip.

## galactic-survey-standalone-edition

| Field | Value |
| --- | --- |
| Repository | `knoxhack/ECHO-Galactic-Survey-Standalone-Edition` |
| Workspace | `ECHO-Galactic-Survey-Standalone-Edition` |
| Manual evidence | `fixtures/galactic-survey/gameplay-qa/manual-evidence.json` |
| Status | `open` |
| Open tasks | 9 |

### Capture

```powershell
Set-Location ..\ECHO-Galactic-Survey-Standalone-Edition
node scripts\import-manual-gameplay-capture.mjs --capture-root <capture-root> --artifact <downloaded-pack-zip> --tester <name> --world-or-profile <name> --started-at <iso> --force
```

### Verify

```powershell
Set-Location ..\ECHO-Galactic-Survey-Standalone-Edition
node scripts\verify-manual-gameplay-evidence.mjs --template-only
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Tasks

| Task | Status |
| --- | --- |
| Manual capture kit is present | `passed` |
| Run identity and artifact match are filled | `open` |
| Manual gameplay claims are true | `open` |
| All 13 release gates cite real evidence sources | `open` |
| Required session records are complete | `open` |
| Gameplay notes | `open` |
| Screenshots | `open` |
| Client logs | `open` |
| Save snapshots | `open` |
| Edition local evidence verifier passes | `open` |

### Required Files

#### Gameplay notes

- `open` fixtures/galactic-survey/gameplay-qa/evidence/fresh-world-notes.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/first-30-minutes-notes.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/first-2-hours-notes.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/survey-array-verification.md
- `open` fixtures/galactic-survey/gameplay-qa/evidence/no-crash-review.md

#### Screenshots

- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/fresh-world-created.png
- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-30-minutes.png
- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-2-hours.png
- `open` fixtures/galactic-survey/gameplay-qa/evidence/screenshots/survey-array-complete.png

#### Client logs

- `open` fixtures/galactic-survey/gameplay-qa/evidence/logs/client-playthrough.log

#### Save snapshots

- `open` fixtures/galactic-survey/gameplay-qa/evidence/saves/first-30-minutes-save.zip
- `open` fixtures/galactic-survey/gameplay-qa/evidence/saves/first-2-hours-save.zip
- `open` fixtures/galactic-survey/gameplay-qa/evidence/saves/survey-array-save.zip

### Current Blockers

- phase 10 Full Progression And Release: galactic-survey-standalone-edition release-ready gameplay evidence is still missing
- manualEvidence.sessions missing fresh_world_creation.
- manualEvidence.sessions missing first_30_minutes.
- manualEvidence.sessions missing first_2_hours.
- manualEvidence.sessions missing survey_array_completion.
- manualEvidence.sessions missing save_reload_verification.
- manualEvidence.sessions missing no_crash_review.
- manualEvidence claim realFirst30Playthrough must be true.
- manualEvidence claim realFirst2HourPlaythrough must be true.
- manualEvidence claim realSurveyArrayPlaythrough must be true.
- manualEvidence claim freshWorldCreated must be true.
- manualEvidence claim saveReloadVerified must be true.
- manualEvidence claim noCrashEvidence must be true.
- manualEvidence release gate probe_launch_works must be satisfied.
- manualEvidence release gate probe_launch_works requires claim realFirst30Playthrough.
- manualEvidence release gate probe_launch_works must name real evidenceSource.
- manualEvidence release gate holomap_reveals_meaningful_data must be satisfied.
- manualEvidence release gate holomap_reveals_meaningful_data requires claim realFirst30Playthrough.
- manualEvidence release gate holomap_reveals_meaningful_data must name real evidenceSource.
- manualEvidence release gate catalog_entries_unlock_from_discoveries must be satisfied.
- manualEvidence release gate catalog_entries_unlock_from_discoveries requires claim realFirst30Playthrough.
- manualEvidence release gate catalog_entries_unlock_from_discoveries must name real evidenceSource.
- manualEvidence release gate fuel_route_limits_understandable must be satisfied.
- manualEvidence release gate fuel_route_limits_understandable requires claim realFirst2HourPlaythrough.
- manualEvidence release gate fuel_route_limits_understandable must name real evidenceSource.
- manualEvidence release gate one_salvage_site_playable must be satisfied.
- manualEvidence release gate one_salvage_site_playable requires claim realFirst2HourPlaythrough.
- manualEvidence release gate one_salvage_site_playable must name real evidenceSource.
- manualEvidence release gate one_probe_upgrade_matters must be satisfied.
- manualEvidence release gate one_probe_upgrade_matters requires claim realFirst2HourPlaythrough.
- manualEvidence release gate one_probe_upgrade_matters must name real evidenceSource.
- manualEvidence release gate first_2_hour_loop_no_dead_end must be satisfied.
- manualEvidence release gate first_2_hour_loop_no_dead_end requires claim realFirst2HourPlaythrough.
- manualEvidence release gate first_2_hour_loop_no_dead_end must name real evidenceSource.
- manualEvidence release gate real_first_30_playthrough must be satisfied.
- manualEvidence release gate real_first_30_playthrough requires claim realFirst30Playthrough.
- manualEvidence release gate real_first_30_playthrough must name real evidenceSource.
- manualEvidence release gate real_first_2_hour_playthrough must be satisfied.
- manualEvidence release gate real_first_2_hour_playthrough requires claim realFirst2HourPlaythrough.
- manualEvidence release gate real_first_2_hour_playthrough must name real evidenceSource.
- manualEvidence release gate real_survey_array_playthrough must be satisfied.
- manualEvidence release gate real_survey_array_playthrough requires claim realSurveyArrayPlaythrough.
- manualEvidence release gate real_survey_array_playthrough must name real evidenceSource.
- manualEvidence release gate fresh_world_created must be satisfied.
- manualEvidence release gate fresh_world_created requires claim freshWorldCreated.
- manualEvidence release gate fresh_world_created must name real evidenceSource.
- manualEvidence release gate save_reload_verified must be satisfied.
- manualEvidence release gate save_reload_verified requires claim saveReloadVerified.
- manualEvidence release gate save_reload_verified must name real evidenceSource.
- manualEvidence release gate no_crash_evidence must be satisfied.
- manualEvidence release gate no_crash_evidence requires claim noCrashEvidence.
- manualEvidence release gate no_crash_evidence must name real evidenceSource.
- manualEvidence.run.tester must contain real capture data.
- manualEvidence.run.artifactSha256 must contain real capture data.
- manualEvidence.run.artifactSize must contain real capture data.
- manualEvidence.run.worldOrProfile must contain real capture data.
- manualEvidence.run.startedAt must contain real capture data.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/fresh-world-notes.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/first-30-minutes-notes.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/first-2-hours-notes.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/survey-array-verification.md.
- manualEvidence.supportingFiles missing file fixtures/galactic-survey/gameplay-qa/evidence/no-crash-review.md.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/fresh-world-created.png.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-30-minutes.png.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/first-2-hours.png.
- manualEvidence.screenshots missing file fixtures/galactic-survey/gameplay-qa/evidence/screenshots/survey-array-complete.png.
- manualEvidence.logs missing file fixtures/galactic-survey/gameplay-qa/evidence/logs/client-playthrough.log.
- manualEvidence.saveSnapshots missing file fixtures/galactic-survey/gameplay-qa/evidence/saves/first-30-minutes-save.zip.
- manualEvidence.saveSnapshots missing file fixtures/galactic-survey/gameplay-qa/evidence/saves/first-2-hours-save.zip.
- manualEvidence.saveSnapshots missing file fixtures/galactic-survey/gameplay-qa/evidence/saves/survey-array-save.zip.

## Promotion Boundary

Do not remove Galactic Survey warning validation or declare public alpha ready until this work order is `COMPLETE`, first-launch/open-play evidence is PASS, and `node scripts\verify-galactic-survey-public-alpha-readiness.mjs --require-release-ready` passes.
