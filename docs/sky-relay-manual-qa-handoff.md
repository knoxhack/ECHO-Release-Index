# Sky Relay Manual QA Handoff

This runbook is the central handoff for moving `ECHO: Sky Relay` from warning
metadata toward public-alpha promotion. It does not replace the real gameplay
evidence requirement.

## Current Gate State

The current Release Index gate is:

```powershell
node scripts\verify-sky-relay-gameplay-evidence.mjs
node scripts\verify-sky-relay-public-alpha-readiness.mjs
```

Expected current state:

- `repo_foundation` through `editions_launcher`: `passed`
- `release_public_alpha`: `blocked` until gameplay evidence passes
- `launcherVersionTransitionUpdate`: `passed`
- `versionTransitionUpdate`: `passed`
- `routeContractReport`: `passed`
- `captureKitReady`: `passed`
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

The initializer also creates Markdown worksheets for the four required notes.
Those worksheets contain `ECHO_SKY_RELAY_TEMPLATE_ONLY`, and both local and
central verifiers reject that marker until the worksheets are replaced with real
playthrough observations.
Keep the worksheet section headings and fill every `- Field:` line; blank
worksheet fields are blocked.

## Required Evidence Per Edition

Each edition must produce these notes:

- `fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/first-2-hours-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/signal-crown-verification.md`
- `fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md`

Each edition must produce these screenshots:

- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-2-hours.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png`

Screenshots must be PNG files at least 640x360.

Each edition must produce these logs:

- `fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log`
- `fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log`

Each edition must produce these save snapshots:

- `fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/signal-crown-save.zip`

Save snapshots must be ZIP files.

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
node scripts\verify-sky-relay-gameplay-evidence.mjs --require-release-ready
node scripts\verify-sky-relay-gameplay-evidence.mjs --write
node scripts\verify-sky-relay-public-alpha-readiness.mjs --require-release-ready
node scripts\verify-sky-relay-public-alpha-readiness.mjs --write
node scripts\validate-index.mjs --strict
node scripts\sync-public-alpha-index.mjs --check
```

Both `--require-release-ready` commands must pass before any Sky Relay warning
metadata can be promoted. The public-alpha readiness verifier writes the
10-phase audit to `release-readiness/sky-relay-public-alpha-readiness.json`.

## Promotion Boundary

Do not promote Sky Relay public-alpha validation while any of these remain
blocked in `release-readiness/sky-relay-gameplay-evidence.json`:

- `realFirst30Playthrough`
- `realFirst2HourPlaythrough`
- `realSignalCrownPlaythrough`
- `saveReloadVerified`
- `noCrashEvidence`

The `captureKitReady` gate proves capture tooling is present. It does not prove
that gameplay happened.

The launcher and pack version-transition gates use a fixture-local previous
Sky Relay manifest plus the current public `0.1.0` assets. They prove update
mechanics without claiming a second public Sky Relay release exists.
