# Sky Relay Manual QA Handoff

This runbook is the central handoff for moving `ECHO: Sky Relay` from warning
metadata toward public-alpha promotion. It does not replace the real gameplay
evidence requirement.

## Current Gate State

The current Release Index gate is:

```powershell
node scripts\verify-sky-relay-gameplay-evidence.mjs
node scripts\verify-sky-relay-public-alpha-readiness.mjs
node scripts\generate-sky-relay-manual-gameplay-work-order.mjs --write
```

Expected current state:

- `repo_foundation` through `editions_launcher`: `passed`
- `release_public_alpha`: `blocked` until gameplay evidence passes
- `launcherVersionTransitionUpdate`: `passed`
- `versionTransitionUpdate`: `passed`
- `routeContractReport`: `passed`
- `captureKitReady`: `passed`
- `freshWorldCreated`: `blocked`
- `realFirst30Playthrough`: `blocked`
- `realFirst2HourPlaythrough`: `blocked`
- `realSignalCrownPlaythrough`: `blocked`
- `saveReloadVerified`: `blocked`
- `noCrashEvidence`: `blocked`

The blocker is real manual gameplay evidence, not tooling, artifact, launcher,
or update readiness.

## Edition Repositories

Capture evidence in each edition repository:

- `knoxhack/ECHO-Sky-Relay-Native-Edition`
- `knoxhack/ECHO-Sky-Relay-NeoForge-Edition`
- `knoxhack/ECHO-Sky-Relay-Standalone-Edition`

Each edition repo must contain:

- `scripts/init-manual-gameplay-evidence.mjs`
- `scripts/verify-manual-gameplay-evidence.mjs`
- `scripts/test-manual-gameplay-evidence-tools.mjs`
- `fixtures/sky-relay/gameplay-qa/manual-evidence.template.json`
- `fixtures/sky-relay/gameplay-qa/evidence/CAPTURE_CHECKLIST.md`
- `fixtures/sky-relay/gameplay-qa/evidence/templates/fresh-world-notes.template.md`
- `fixtures/sky-relay/gameplay-qa/evidence/templates/first-30-minutes-notes.template.md`
- `fixtures/sky-relay/gameplay-qa/evidence/templates/first-2-hours-notes.template.md`
- `fixtures/sky-relay/gameplay-qa/evidence/templates/signal-crown-verification.template.md`
- `fixtures/sky-relay/gameplay-qa/evidence/templates/no-crash-review.template.md`

## Capture Setup

For each edition repo, run:

```powershell
node scripts\validate-sky-relay-edition.mjs
node scripts\verify-manual-gameplay-evidence.mjs --template-only
node scripts\init-manual-gameplay-evidence.mjs
```

The initializer creates:

- `fixtures/sky-relay/gameplay-qa/manual-evidence.json`
- `fixtures/sky-relay/gameplay-qa/evidence/`
- `fixtures/sky-relay/gameplay-qa/evidence/logs/`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/`

All claims in `manual-evidence.json` must remain `false` until the referenced
evidence files are produced by the real manual run.

Fill the `run` object with real capture identity before release-ready
verification:

- `tester`
- `releaseTag`
- `artifactAsset`
- `artifactSha256`
- `artifactSize`
- `launcherChannel`
- `worldOrProfile`
- `installedFrom`
- `startedAt`

The release tag, artifact asset name, artifact SHA-256, and artifact byte size
must match the public prerelease ZIP recorded in
`release-readiness/sky-relay-edition-pack-assets.json` for that edition.

Fill the `sessions` array with `fresh_world_creation`, `first_30_minutes`,
`first_2_hours`, `signal_crown_completion`, `save_reload_verification`, and
`no_crash_review`. Each session must use real start/end timestamps, meet the
minimum duration in the verifier, and link back to the matching required note,
screenshot, save snapshot, and log paths. The fresh-world session must link to
its note, screenshot, client log, and launcher install log. The save/reload
session must link to all three save snapshots plus the client log. The central
verifier rejects `TBD` run values and `1970-01-01T...` template timestamps.
Release-ready sessions must be chronological: every session starts at or after
`run.startedAt`; `fresh_world_creation`, `first_30_minutes`, and
`first_2_hours` must all start exactly at `run.startedAt` as the same cumulative
playthrough route; Signal Crown starts after the two-hour route window;
save/reload starts after Signal Crown; no-crash review starts after save/reload.
Each session's `durationMinutes` must match its start/end timestamps within one
minute, and `generatedAt` must be after the recorded sessions have ended.
Notes, screenshots, logs, and save snapshots must not be copied placeholder
content reused under different filenames; each accepted evidence file must have
unique content within its group.
Each note must include this run's pack ID, tester, release tag, artifact asset,
artifact SHA-256, artifact size, launcher channel, install source,
world/profile, run start time, session ID, session start/end timestamps, session
duration, and the exact session evidence paths it is documenting.

The initializer also creates Markdown worksheets for the four required notes.
Those worksheets contain `ECHO_SKY_RELAY_TEMPLATE_ONLY`, and both local and
central verifiers reject that marker until the worksheets are replaced with real
playthrough observations.
Keep the worksheet section headings and fill every `- Field:` line; blank
worksheet fields are blocked. Each worksheet must also mention the gameplay
objects and actions named by its checklist, such as `relay_anchor_key`,
`hydroponics_deck`, `weather_mast`, and `sky_relay_badge` where applicable.

## Required Evidence Per Edition

Each edition must produce these notes:

- `fixtures/sky-relay/gameplay-qa/evidence/fresh-world-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/first-2-hours-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/signal-crown-verification.md`
- `fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md`

Each edition must produce these screenshots:

- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-2-hours.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png`

Screenshots must be complete PNG images with valid chunks, an `IEND` chunk,
dimensions at least 640x360, and visible pixel variation rather than blank
placeholder frames.

Each edition must produce these logs:

- `fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log`
- `fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log`

Each edition must produce these save snapshots:

- `fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/signal-crown-save.zip`

Save snapshots must be ZIP archives with `level.dat`, at least one
`region/r.*.*.mca` chunk entry, at least one player/profile data entry under
`playerdata/`, `data/`, `stats/`, or `advancements/`, and no absolute or
parent-directory entry paths.
Logs must not contain blocking crash or corruption signatures such as
`crash report`, `fatal`, `uncaught exception`, `unhandled exception`,
`exception in thread`, Java stack trace lines, `failed to load world`, or
world/save corruption markers. Logs must also include the same pack ID, release
tag, artifact asset name, artifact SHA-256, artifact byte size, launcher
channel, install source, world/profile, and run start time recorded in the `run`
object. The client playthrough log must also include every required session ID,
start time, and end time as explicit markers such as
`signal_crown_completion.startedAt=2026-06-11T02:05:00Z`.

The central Release Index verifier records byte size and SHA-256 for every
accepted notes, log, screenshot, and save file. Screenshot entries also record
PNG dimensions, so the final readiness report can identify the exact evidence
set reviewed for promotion.

## Claims

Set each claim in `manual-evidence.json` to `true` only after the corresponding
evidence exists:

- `realFirst30Playthrough`
- `realFirst2HourPlaythrough`
- `realSignalCrownPlaythrough`
- `freshWorldCreated`
- `saveReloadVerified`
- `noCrashEvidence`

## Edition Verification

For each edition repo, run:

```powershell
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

This must pass before the evidence is treated as release-ready.

## Release Index Verification

After all three edition repos have passing local evidence verification, run from
`ECHO-Release-Index`:

```powershell
node scripts\generate-sky-relay-manual-gameplay-work-order.mjs --write
node scripts\verify-sky-relay-gameplay-evidence.mjs --require-release-ready
node scripts\verify-sky-relay-gameplay-evidence.mjs --write
node scripts\verify-sky-relay-public-alpha-readiness.mjs --require-release-ready
node scripts\verify-sky-relay-public-alpha-readiness.mjs --write
node scripts\generate-sky-relay-manual-gameplay-work-order.mjs --write
node scripts\validate-index.mjs --strict
node scripts\sync-public-alpha-index.mjs --check
```

Both `--require-release-ready` commands must pass before any Sky Relay warning
metadata can be promoted. The public-alpha readiness verifier writes the
10-phase audit to `release-readiness/sky-relay-public-alpha-readiness.json`.
It also requires `release-readiness/sky-relay-gameplay-evidence.json` to include
the detailed gameplay gates, capture kit summaries, all three edition evidence
summaries, checked evidence file groups, expected source report paths, an empty
blocker list when status is `PASS`, and pack artifact names, hashes, and sizes
that match `release-readiness/sky-relay-edition-pack-assets.json`. A `PASS`
gameplay report must also preserve detailed checked-artifact metadata from the
gameplay verifier, including session evidence coverage, PNG dimensions and pixel
variation, log provenance and session markers, structured save ZIP state, and
Git source revisions for Release Index plus all three edition repos. When status
is `PASS`, those source revisions must be clean for evidence so the captured
evidence can be traced back to committed repository state. The verifier records
raw Git status separately from blocking status; generated Sky Relay readiness
JSON outputs may be ignored, but manual evidence, capture tooling, manifests, and
source files may not be dirty. A stub report with only `status: PASS` is not
release-ready.
The manual gameplay work-order generator turns the current gameplay evidence
report into `release-readiness/sky-relay-manual-gameplay-work-order.json` and
`docs/sky-relay-manual-gameplay-work-order.md`, listing the exact remaining
claim, session, note, screenshot, log, and save-snapshot tasks per edition.

## Promotion Boundary

Do not promote Sky Relay public-alpha validation while any of these remain
blocked in `release-readiness/sky-relay-gameplay-evidence.json`:

- `realFirst30Playthrough`
- `realFirst2HourPlaythrough`
- `realSignalCrownPlaythrough`
- `freshWorldCreated`
- `saveReloadVerified`
- `noCrashEvidence`

The `captureKitReady` gate proves capture tooling is present. It does not prove
that gameplay happened.

The launcher and pack version-transition gates use a fixture-local previous
Sky Relay manifest plus the current public `0.1.0` assets. They prove update
mechanics without claiming a second public Sky Relay release exists.
