# Sky Relay Manual Gameplay Work Order

Status: `OPEN`

Generated from [release-readiness/sky-relay-gameplay-evidence.json](../release-readiness/sky-relay-gameplay-evidence.json).
Machine-readable work order: [release-readiness/sky-relay-manual-gameplay-work-order.json](../release-readiness/sky-relay-manual-gameplay-work-order.json).

For the full capture rules, see [Sky Relay Manual QA Handoff](sky-relay-manual-qa-handoff.md).

## Summary

| Field | Value |
| --- | --- |
| Gameplay evidence status | `BLOCKED` |
| Editions | 3 |
| Open editions | 3 |
| Open tasks | 24 |

## Refresh

```powershell
node scripts\generate-sky-relay-manual-gameplay-work-order.mjs --write
node scripts\verify-sky-relay-gameplay-evidence.mjs
node scripts\verify-sky-relay-public-alpha-readiness.mjs
```

## native

| Field | Value |
| --- | --- |
| Repository | `knoxhack/ECHO-Sky-Relay-Native-Edition` |
| Workspace | `ECHO-Sky-Relay-Native-Edition` |
| Manual evidence | `fixtures/sky-relay/gameplay-qa/manual-evidence.json` |
| Status | `open` |
| Open tasks | 8 |

### Setup

```powershell
Set-Location ..\ECHO-Sky-Relay-Native-Edition
node scripts\validate-sky-relay-edition.mjs
node scripts\verify-manual-gameplay-evidence.mjs --template-only
node scripts\init-manual-gameplay-evidence.mjs
```

### Verify

```powershell
Set-Location ..\ECHO-Sky-Relay-Native-Edition
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Tasks

| Task | Status |
| --- | --- |
| Capture kit is present | `passed` |
| Run identity and artifact match are filled | `open` |
| Manual gameplay claims are true | `open` |
| Required session records are complete | `open` |
| Gameplay notes | `open` |
| Screenshots | `open` |
| Launcher and client logs | `open` |
| Save snapshots | `open` |
| Edition local evidence verifier passes | `open` |

### Required Files

#### Gameplay notes

- `open` fixtures/sky-relay/gameplay-qa/evidence/fresh-world-notes.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/first-2-hours-notes.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/signal-crown-verification.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md

#### Screenshots

- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png
- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png
- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-2-hours.png
- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png

#### Launcher and client logs

- `open` fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log
- `open` fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log

#### Save snapshots

- `open` fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip
- `open` fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip
- `open` fixtures/sky-relay/gameplay-qa/evidence/saves/signal-crown-save.zip

### Current Blockers

- native manual evidence run.startedAt must not use the template timestamp.
- native manual evidence run.tester must be filled with real capture information.
- native manual evidence run.worldOrProfile must be filled with real capture information.
- native manual evidence sessions.fresh_world_creation must not use template timestamps.
- native manual evidence sessions.first_30_minutes must not use template timestamps.
- native manual evidence sessions.first_2_hours must not use template timestamps.
- native manual evidence sessions.signal_crown_completion must not use template timestamps.
- native manual evidence sessions.save_reload_verification must not use template timestamps.
- native manual evidence sessions.no_crash_review must not use template timestamps.
- native manual evidence claim realFirst30Playthrough must be true.
- native manual evidence claim realFirst2HourPlaythrough must be true.
- native manual evidence claim realSignalCrownPlaythrough must be true.
- native manual evidence claim freshWorldCreated must be true.
- native manual evidence claim saveReloadVerified must be true.
- native manual evidence claim noCrashEvidence must be true.

## neoforge

| Field | Value |
| --- | --- |
| Repository | `knoxhack/ECHO-Sky-Relay-NeoForge-Edition` |
| Workspace | `ECHO-Sky-Relay-NeoForge-Edition` |
| Manual evidence | `fixtures/sky-relay/gameplay-qa/manual-evidence.json` |
| Status | `open` |
| Open tasks | 8 |

### Setup

```powershell
Set-Location ..\ECHO-Sky-Relay-NeoForge-Edition
node scripts\validate-sky-relay-edition.mjs
node scripts\verify-manual-gameplay-evidence.mjs --template-only
node scripts\init-manual-gameplay-evidence.mjs
```

### Verify

```powershell
Set-Location ..\ECHO-Sky-Relay-NeoForge-Edition
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Tasks

| Task | Status |
| --- | --- |
| Capture kit is present | `passed` |
| Run identity and artifact match are filled | `open` |
| Manual gameplay claims are true | `open` |
| Required session records are complete | `open` |
| Gameplay notes | `open` |
| Screenshots | `open` |
| Launcher and client logs | `open` |
| Save snapshots | `open` |
| Edition local evidence verifier passes | `open` |

### Required Files

#### Gameplay notes

- `open` fixtures/sky-relay/gameplay-qa/evidence/fresh-world-notes.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/first-2-hours-notes.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/signal-crown-verification.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md

#### Screenshots

- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png
- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png
- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-2-hours.png
- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png

#### Launcher and client logs

- `open` fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log
- `open` fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log

#### Save snapshots

- `open` fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip
- `open` fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip
- `open` fixtures/sky-relay/gameplay-qa/evidence/saves/signal-crown-save.zip

### Current Blockers

- neoforge manual evidence run.startedAt must not use the template timestamp.
- neoforge manual evidence run.tester must be filled with real capture information.
- neoforge manual evidence run.worldOrProfile must be filled with real capture information.
- neoforge manual evidence sessions.fresh_world_creation must not use template timestamps.
- neoforge manual evidence sessions.first_30_minutes must not use template timestamps.
- neoforge manual evidence sessions.first_2_hours must not use template timestamps.
- neoforge manual evidence sessions.signal_crown_completion must not use template timestamps.
- neoforge manual evidence sessions.save_reload_verification must not use template timestamps.
- neoforge manual evidence sessions.no_crash_review must not use template timestamps.
- neoforge manual evidence claim realFirst30Playthrough must be true.
- neoforge manual evidence claim realFirst2HourPlaythrough must be true.
- neoforge manual evidence claim realSignalCrownPlaythrough must be true.
- neoforge manual evidence claim freshWorldCreated must be true.
- neoforge manual evidence claim saveReloadVerified must be true.
- neoforge manual evidence claim noCrashEvidence must be true.

## standalone

| Field | Value |
| --- | --- |
| Repository | `knoxhack/ECHO-Sky-Relay-Standalone-Edition` |
| Workspace | `ECHO-Sky-Relay-Standalone-Edition` |
| Manual evidence | `fixtures/sky-relay/gameplay-qa/manual-evidence.json` |
| Status | `open` |
| Open tasks | 8 |

### Setup

```powershell
Set-Location ..\ECHO-Sky-Relay-Standalone-Edition
node scripts\validate-sky-relay-edition.mjs
node scripts\verify-manual-gameplay-evidence.mjs --template-only
node scripts\init-manual-gameplay-evidence.mjs
```

### Verify

```powershell
Set-Location ..\ECHO-Sky-Relay-Standalone-Edition
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Tasks

| Task | Status |
| --- | --- |
| Capture kit is present | `passed` |
| Run identity and artifact match are filled | `open` |
| Manual gameplay claims are true | `open` |
| Required session records are complete | `open` |
| Gameplay notes | `open` |
| Screenshots | `open` |
| Launcher and client logs | `open` |
| Save snapshots | `open` |
| Edition local evidence verifier passes | `open` |

### Required Files

#### Gameplay notes

- `open` fixtures/sky-relay/gameplay-qa/evidence/fresh-world-notes.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/first-2-hours-notes.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/signal-crown-verification.md
- `open` fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md

#### Screenshots

- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png
- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png
- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-2-hours.png
- `open` fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png

#### Launcher and client logs

- `open` fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log
- `open` fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log

#### Save snapshots

- `open` fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip
- `open` fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip
- `open` fixtures/sky-relay/gameplay-qa/evidence/saves/signal-crown-save.zip

### Current Blockers

- standalone manual evidence run.startedAt must not use the template timestamp.
- standalone manual evidence run.tester must be filled with real capture information.
- standalone manual evidence run.worldOrProfile must be filled with real capture information.
- standalone manual evidence sessions.fresh_world_creation must not use template timestamps.
- standalone manual evidence sessions.first_30_minutes must not use template timestamps.
- standalone manual evidence sessions.first_2_hours must not use template timestamps.
- standalone manual evidence sessions.signal_crown_completion must not use template timestamps.
- standalone manual evidence sessions.save_reload_verification must not use template timestamps.
- standalone manual evidence sessions.no_crash_review must not use template timestamps.
- standalone manual evidence claim realFirst30Playthrough must be true.
- standalone manual evidence claim realFirst2HourPlaythrough must be true.
- standalone manual evidence claim realSignalCrownPlaythrough must be true.
- standalone manual evidence claim freshWorldCreated must be true.
- standalone manual evidence claim saveReloadVerified must be true.
- standalone manual evidence claim noCrashEvidence must be true.

## Promotion Boundary

Do not remove Sky Relay warning validation or declare public alpha ready until this work order is `COMPLETE` and both central `--require-release-ready` commands pass.
