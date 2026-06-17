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
| Computer Use session | `fixtures/sky-relay/gameplay-qa/computer-use-session.json` |
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
| Optional Computer Use provenance is valid when supplied | `passed` |
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

### Optional Computer Use Provenance

Place visible automation metadata at `fixtures/sky-relay/gameplay-qa/computer-use-session.json` and set `capture.computerUseSession` in `fixtures/sky-relay/gameplay-qa/manual-evidence.json` to that path.

- The session must use schema `echo.release_index.family_gameplay_computer_use_session.v1`.
- The session must identify lane `native`, pack ID `sky-relay-native-edition`, and family key `sky-relay`.
- It must list visible actions, such as opening inventory to verify Index and checking HUD, Terminal, HoloMap, and Lens surfaces.
- Captured checks must cite a required claim or one of the local proof files listed above.
- This metadata is provenance only and does not replace the required notes, screenshots, logs, or save snapshots.

Suggested check IDs:

- `hudVisible`
- `inventoryIndexVisible`
- `terminalVisible`
- `holomapVisible`
- `lensVisible`
- `freshWorldCreated`
- `realFirst30Playthrough`
- `realFirst2HourPlaythrough`
- `realSignalCrownPlaythrough`
- `saveReloadVerified`
- `noCrashEvidence`

### Current Blockers

- native manual evidence is missing: ECHO-Sky-Relay-Native-Edition/fixtures/sky-relay/gameplay-qa/manual-evidence.json

## neoforge

| Field | Value |
| --- | --- |
| Repository | `knoxhack/ECHO-Sky-Relay-NeoForge-Edition` |
| Workspace | `ECHO-Sky-Relay-NeoForge-Edition` |
| Manual evidence | `fixtures/sky-relay/gameplay-qa/manual-evidence.json` |
| Computer Use session | `fixtures/sky-relay/gameplay-qa/computer-use-session.json` |
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
| Optional Computer Use provenance is valid when supplied | `passed` |
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

### Optional Computer Use Provenance

Place visible automation metadata at `fixtures/sky-relay/gameplay-qa/computer-use-session.json` and set `capture.computerUseSession` in `fixtures/sky-relay/gameplay-qa/manual-evidence.json` to that path.

- The session must use schema `echo.release_index.family_gameplay_computer_use_session.v1`.
- The session must identify lane `neoforge`, pack ID `sky-relay-neoforge-edition`, and family key `sky-relay`.
- It must list visible actions, such as opening inventory to verify Index and checking HUD, Terminal, HoloMap, and Lens surfaces.
- Captured checks must cite a required claim or one of the local proof files listed above.
- This metadata is provenance only and does not replace the required notes, screenshots, logs, or save snapshots.

Suggested check IDs:

- `hudVisible`
- `inventoryIndexVisible`
- `terminalVisible`
- `holomapVisible`
- `lensVisible`
- `freshWorldCreated`
- `realFirst30Playthrough`
- `realFirst2HourPlaythrough`
- `realSignalCrownPlaythrough`
- `saveReloadVerified`
- `noCrashEvidence`

### Current Blockers

- neoforge manual evidence is missing: ECHO-Sky-Relay-NeoForge-Edition/fixtures/sky-relay/gameplay-qa/manual-evidence.json

## standalone

| Field | Value |
| --- | --- |
| Repository | `knoxhack/ECHO-Sky-Relay-Standalone-Edition` |
| Workspace | `ECHO-Sky-Relay-Standalone-Edition` |
| Manual evidence | `fixtures/sky-relay/gameplay-qa/manual-evidence.json` |
| Computer Use session | `fixtures/sky-relay/gameplay-qa/computer-use-session.json` |
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
| Optional Computer Use provenance is valid when supplied | `passed` |
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

### Optional Computer Use Provenance

Place visible automation metadata at `fixtures/sky-relay/gameplay-qa/computer-use-session.json` and set `capture.computerUseSession` in `fixtures/sky-relay/gameplay-qa/manual-evidence.json` to that path.

- The session must use schema `echo.release_index.family_gameplay_computer_use_session.v1`.
- The session must identify lane `standalone`, pack ID `sky-relay-standalone-edition`, and family key `sky-relay`.
- It must list visible actions, such as opening inventory to verify Index and checking HUD, Terminal, HoloMap, and Lens surfaces.
- Captured checks must cite a required claim or one of the local proof files listed above.
- This metadata is provenance only and does not replace the required notes, screenshots, logs, or save snapshots.

Suggested check IDs:

- `hudVisible`
- `inventoryIndexVisible`
- `terminalVisible`
- `holomapVisible`
- `lensVisible`
- `freshWorldCreated`
- `realFirst30Playthrough`
- `realFirst2HourPlaythrough`
- `realSignalCrownPlaythrough`
- `saveReloadVerified`
- `noCrashEvidence`

### Current Blockers

- standalone manual evidence is missing: ECHO-Sky-Relay-Standalone-Edition/fixtures/sky-relay/gameplay-qa/manual-evidence.json

## Promotion Boundary

Do not remove Sky Relay warning validation or declare public alpha ready until this work order is `COMPLETE` and both central `--require-release-ready` commands pass.
