# Computer Use Gameplay Capture Work Order

Status: `OPEN`

Machine-readable work order: [release-readiness/computer-use-gameplay-capture-work-order.json](../release-readiness/computer-use-gameplay-capture-work-order.json).

This queue is not gameplay proof. Use it to drive visible UI capture, then import the real screenshots, logs, notes, and save snapshots through the owning family evidence tools.

## Summary

| Field | Value |
| --- | --- |
| Acceptance status | `BLOCKED` |
| Families | 5 |
| Lanes | 15 |
| Open lanes | 15 |
| Lanes with Computer Use attempts | 1 |

## Refresh

```powershell
node scripts\verify-gameplay-acceptance.mjs
node scripts\generate-computer-use-gameplay-capture-work-order.mjs --write
node scripts\generate-public-alpha-runtime-acceptance.mjs
```

## Ashfall Native

| Field | Value |
| --- | --- |
| Pack | `ashfall-native-edition` |
| Repository | `knoxhack/ECHO-Ashfall-Native-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 13 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Client/game window started | `not-attempted` | `launcher-log`, `client-log` |
| Native main menu replacement visible | `not-attempted` | `screenshot` |
| World or profile loaded | `not-attempted` | `screenshot` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| Lens visible | `not-attempted` | `screenshot` |
| Creative tab visible | `not-attempted` | `screenshot` |
| Creative tab search visible | `not-attempted` | `screenshot` |
| Creative item selectable | `not-attempted` | `screenshot` |
| Creative item usable in world | `not-attempted` | `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Ashfall" --lane native --pack-id ashfall-native-edition --launcher-instance "Ashfall Native Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "clientStarted|Client/game window started|not-attempted||Pending real visible capture." --verification-check "mainMenuNativeReplacement|Native main menu replacement visible|not-attempted||Pending real visible capture." --verification-check "worldCreatedOrLoaded|World or profile loaded|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "lensVisible|Lens visible|not-attempted||Pending real visible capture." --verification-check "creativeTabVisible|Creative tab visible|not-attempted||Pending real visible capture." --verification-check "creativeTabSearchVisible|Creative tab search visible|not-attempted||Pending real visible capture." --verification-check "creativeItemSelectable|Creative item selectable|not-attempted||Pending real visible capture." --verification-check "creativeItemPlayable|Creative item usable in world|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Launcher
npm run assist:ashfall-lane-game-capture -- --lane native --json
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Launcher
node scripts\ashfall-lane-game-capture-assist.mjs --lane native --claim <claim>=proofs\screenshots\<proof>.png --json --strict
npm run test:e2e:ashfall-lane-game-smoke
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Missing real gameplay evidence JSON for launch/world/UI/creative-tab proof.
- Missing gameplay proof: mainMenuNativeReplacement
- Missing gameplay proof: worldCreatedOrLoaded
- Missing gameplay proof: hudVisible
- Missing gameplay proof: inventoryIndexVisible
- Missing gameplay proof: terminalVisible
- Missing gameplay proof: holomapVisible
- Missing gameplay proof: lensVisible
- Missing gameplay proof: creativeTabVisible
- Missing gameplay proof: creativeTabSearchVisible
- Missing gameplay proof: creativeItemSelectable
- Missing gameplay proof: creativeItemPlayable

## Ashfall NeoForge

| Field | Value |
| --- | --- |
| Pack | `ashfall-neoforge-edition` |
| Repository | `knoxhack/ECHO-Ashfall-NeoForge-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 46 |
| Latest Computer Use attempt | `2026-06-17t20-05-39-304z__ashfall__neoforge__ashfall-neoforge-edition` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Client/game window started | `not-attempted` | `launcher-log`, `client-log` |
| World or profile loaded | `not-attempted` | `screenshot` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| Lens visible | `not-attempted` | `screenshot` |
| Creative tab visible | `not-attempted` | `screenshot` |
| Creative tab search visible | `not-attempted` | `screenshot` |
| Creative item selectable | `not-attempted` | `screenshot` |
| Creative item usable in world | `not-attempted` | `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Ashfall" --lane neoforge --pack-id ashfall-neoforge-edition --launcher-instance "Ashfall NeoForge Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "clientStarted|Client/game window started|not-attempted||Pending real visible capture." --verification-check "worldCreatedOrLoaded|World or profile loaded|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "lensVisible|Lens visible|not-attempted||Pending real visible capture." --verification-check "creativeTabVisible|Creative tab visible|not-attempted||Pending real visible capture." --verification-check "creativeTabSearchVisible|Creative tab search visible|not-attempted||Pending real visible capture." --verification-check "creativeItemSelectable|Creative item selectable|not-attempted||Pending real visible capture." --verification-check "creativeItemPlayable|Creative item usable in world|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Launcher
npm run assist:ashfall-lane-game-capture -- --lane neoforge --json
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Launcher
node scripts\ashfall-lane-game-capture-assist.mjs --lane neoforge --claim <claim>=proofs\screenshots\<proof>.png --json --strict
npm run test:e2e:ashfall-lane-game-smoke
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- No runtime log file found under the instance logs directory.
- Missing real gameplay evidence JSON for launch/world/UI/creative-tab proof.
- Missing gameplay proof: clientStarted
- Missing gameplay proof: worldCreatedOrLoaded
- Missing gameplay proof: hudVisible
- Missing gameplay proof: inventoryIndexVisible
- Missing gameplay proof: terminalVisible
- Missing gameplay proof: holomapVisible
- Missing gameplay proof: lensVisible
- Missing gameplay proof: creativeTabVisible
- Missing gameplay proof: creativeTabSearchVisible
- Missing gameplay proof: creativeItemSelectable

## Ashfall Standalone

| Field | Value |
| --- | --- |
| Pack | `ashfall-standalone-edition` |
| Repository | `knoxhack/ECHO-Ashfall-Standalone-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 14 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Client/game window started | `not-attempted` | `launcher-log`, `client-log` |
| World or profile loaded | `not-attempted` | `screenshot` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| Lens visible | `not-attempted` | `screenshot` |
| Creative tab visible | `not-attempted` | `screenshot` |
| Creative tab search visible | `not-attempted` | `screenshot` |
| Creative item selectable | `not-attempted` | `screenshot` |
| Creative item usable in world | `not-attempted` | `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Ashfall" --lane standalone --pack-id ashfall-standalone-edition --launcher-instance "Ashfall Standalone Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "clientStarted|Client/game window started|not-attempted||Pending real visible capture." --verification-check "worldCreatedOrLoaded|World or profile loaded|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "lensVisible|Lens visible|not-attempted||Pending real visible capture." --verification-check "creativeTabVisible|Creative tab visible|not-attempted||Pending real visible capture." --verification-check "creativeTabSearchVisible|Creative tab search visible|not-attempted||Pending real visible capture." --verification-check "creativeItemSelectable|Creative item selectable|not-attempted||Pending real visible capture." --verification-check "creativeItemPlayable|Creative item usable in world|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Launcher
npm run assist:ashfall-lane-game-capture -- --lane standalone --json
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Launcher
node scripts\ashfall-lane-game-capture-assist.mjs --lane standalone --claim <claim>=proofs\screenshots\<proof>.png --json --strict
npm run test:e2e:ashfall-lane-game-smoke
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- No runtime log file found under the instance logs directory.
- Missing real gameplay evidence JSON for launch/world/UI/creative-tab proof.
- Missing gameplay proof: clientStarted
- Missing gameplay proof: worldCreatedOrLoaded
- Missing gameplay proof: hudVisible
- Missing gameplay proof: inventoryIndexVisible
- Missing gameplay proof: terminalVisible
- Missing gameplay proof: holomapVisible
- Missing gameplay proof: lensVisible
- Missing gameplay proof: creativeTabVisible
- Missing gameplay proof: creativeTabSearchVisible
- Missing gameplay proof: creativeItemSelectable

## Sky Relay Native

| Field | Value |
| --- | --- |
| Pack | `sky-relay-native-edition` |
| Repository | `knoxhack/ECHO-Sky-Relay-Native-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 1 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Signal Crown objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Sky Relay" --lane native --pack-id sky-relay-native-edition --launcher-instance "Sky Relay Native Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "realSignalCrownPlaythrough|Signal Crown objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Sky-Relay-Native-Edition
node scripts\init-manual-gameplay-evidence.mjs
node scripts\verify-manual-gameplay-evidence.mjs --template-only
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Sky-Relay-Native-Edition
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-sky-relay-gameplay-evidence.mjs --write
node scripts\generate-sky-relay-manual-gameplay-work-order.mjs --write
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Sky Relay native: Manual gameplay work order status is unknown.

## Sky Relay NeoForge

| Field | Value |
| --- | --- |
| Pack | `sky-relay-neoforge-edition` |
| Repository | `knoxhack/ECHO-Sky-Relay-NeoForge-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 1 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Signal Crown objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Sky Relay" --lane neoforge --pack-id sky-relay-neoforge-edition --launcher-instance "Sky Relay NeoForge Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "realSignalCrownPlaythrough|Signal Crown objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Sky-Relay-NeoForge-Edition
node scripts\init-manual-gameplay-evidence.mjs
node scripts\verify-manual-gameplay-evidence.mjs --template-only
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Sky-Relay-NeoForge-Edition
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-sky-relay-gameplay-evidence.mjs --write
node scripts\generate-sky-relay-manual-gameplay-work-order.mjs --write
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Sky Relay neoforge: Manual gameplay work order status is unknown.

## Sky Relay Standalone

| Field | Value |
| --- | --- |
| Pack | `sky-relay-standalone-edition` |
| Repository | `knoxhack/ECHO-Sky-Relay-Standalone-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 1 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Signal Crown objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Sky Relay" --lane standalone --pack-id sky-relay-standalone-edition --launcher-instance "Sky Relay Standalone Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "realSignalCrownPlaythrough|Signal Crown objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Sky-Relay-Standalone-Edition
node scripts\init-manual-gameplay-evidence.mjs
node scripts\verify-manual-gameplay-evidence.mjs --template-only
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Sky-Relay-Standalone-Edition
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-sky-relay-gameplay-evidence.mjs --write
node scripts\generate-sky-relay-manual-gameplay-work-order.mjs --write
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Sky Relay standalone: Manual gameplay work order status is unknown.

## Galactic Survey Native

| Field | Value |
| --- | --- |
| Pack | `galactic-survey-native-edition` |
| Repository | `knoxhack/ECHO-Galactic-Survey-Native-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 77 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Survey Array objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Galactic Survey" --lane native --pack-id galactic-survey-native-edition --launcher-instance "Galactic Survey Native Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "realSurveyArrayPlaythrough|Survey Array objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Galactic-Survey-Native-Edition
node scripts\prepare-manual-gameplay-capture.mjs --release-index-root ..\ECHO-Release-Index --tester <name> --world-or-profile <name> --started-at <iso>
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Galactic-Survey-Native-Edition
node scripts\import-manual-gameplay-capture.mjs --capture-root <capture-root> --artifact <prepared-artifact-path> --tester <name> --world-or-profile <name> --started-at <iso> --force
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-galactic-survey-public-alpha-readiness.mjs --write
node scripts\generate-galactic-survey-manual-gameplay-work-order.mjs --write
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Galactic Survey native: Manual gameplay work order status is open.
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

## Galactic Survey NeoForge

| Field | Value |
| --- | --- |
| Pack | `galactic-survey-neoforge-edition` |
| Repository | `knoxhack/ECHO-Galactic-Survey-NeoForge-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 77 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Survey Array objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Galactic Survey" --lane neoforge --pack-id galactic-survey-neoforge-edition --launcher-instance "Galactic Survey NeoForge Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "realSurveyArrayPlaythrough|Survey Array objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Galactic-Survey-NeoForge-Edition
node scripts\prepare-manual-gameplay-capture.mjs --release-index-root ..\ECHO-Release-Index --tester <name> --world-or-profile <name> --started-at <iso>
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Galactic-Survey-NeoForge-Edition
node scripts\import-manual-gameplay-capture.mjs --capture-root <capture-root> --artifact <prepared-artifact-path> --tester <name> --world-or-profile <name> --started-at <iso> --force
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-galactic-survey-public-alpha-readiness.mjs --write
node scripts\generate-galactic-survey-manual-gameplay-work-order.mjs --write
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Galactic Survey neoforge: Manual gameplay work order status is open.
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

## Galactic Survey Standalone

| Field | Value |
| --- | --- |
| Pack | `galactic-survey-standalone-edition` |
| Repository | `knoxhack/ECHO-Galactic-Survey-Standalone-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 77 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Survey Array objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Galactic Survey" --lane standalone --pack-id galactic-survey-standalone-edition --launcher-instance "Galactic Survey Standalone Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "realSurveyArrayPlaythrough|Survey Array objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Galactic-Survey-Standalone-Edition
node scripts\prepare-manual-gameplay-capture.mjs --release-index-root ..\ECHO-Release-Index --tester <name> --world-or-profile <name> --started-at <iso>
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Galactic-Survey-Standalone-Edition
node scripts\import-manual-gameplay-capture.mjs --capture-root <capture-root> --artifact <prepared-artifact-path> --tester <name> --world-or-profile <name> --started-at <iso> --force
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-galactic-survey-public-alpha-readiness.mjs --write
node scripts\generate-galactic-survey-manual-gameplay-work-order.mjs --write
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Galactic Survey standalone: Manual gameplay work order status is open.
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

## Openlands Native

| Field | Value |
| --- | --- |
| Pack | `openlands-native-edition` |
| Repository | `knoxhack/ECHO-Openlands-Native-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 7 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Primary objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Openlands" --lane native --pack-id openlands-native-edition --launcher-instance "Openlands Native Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "primaryObjectiveCompleted|Primary objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\prepare-family-gameplay-capture.mjs --family openlands --lane native --tester <name> --world-or-profile <name> --started-at <iso>
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\import-family-gameplay-capture.mjs --family openlands --lane native --capture-root <capture-root> --artifact <pack.zip> --tester <name> --world-or-profile <name> --started-at <iso> --force
node scripts\generate-family-gameplay-evidence.mjs --family openlands
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Missing real gameplay evidence JSON.
- Missing fresh install and fresh world/profile proof.
- Missing first 30-minute playthrough proof.
- Missing first 2-hour playthrough proof.
- Missing primary Openlands route or systems objective reached and recorded.
- Missing save/reload verification proof.
- Missing no-crash review proof.

## Openlands NeoForge

| Field | Value |
| --- | --- |
| Pack | `openlands-neoforge-edition` |
| Repository | `knoxhack/ECHO-Openlands-NeoForge-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 7 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Primary objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Openlands" --lane neoforge --pack-id openlands-neoforge-edition --launcher-instance "Openlands NeoForge Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "primaryObjectiveCompleted|Primary objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\prepare-family-gameplay-capture.mjs --family openlands --lane neoforge --tester <name> --world-or-profile <name> --started-at <iso>
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\import-family-gameplay-capture.mjs --family openlands --lane neoforge --capture-root <capture-root> --artifact <pack.zip> --tester <name> --world-or-profile <name> --started-at <iso> --force
node scripts\generate-family-gameplay-evidence.mjs --family openlands
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Missing real gameplay evidence JSON.
- Missing fresh install and fresh world/profile proof.
- Missing first 30-minute playthrough proof.
- Missing first 2-hour playthrough proof.
- Missing primary Openlands route or systems objective reached and recorded.
- Missing save/reload verification proof.
- Missing no-crash review proof.

## Openlands Standalone

| Field | Value |
| --- | --- |
| Pack | `openlands-standalone-edition` |
| Repository | `knoxhack/ECHO-Openlands-Standalone-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 7 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Primary objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Openlands" --lane standalone --pack-id openlands-standalone-edition --launcher-instance "Openlands Standalone Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "primaryObjectiveCompleted|Primary objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\prepare-family-gameplay-capture.mjs --family openlands --lane standalone --tester <name> --world-or-profile <name> --started-at <iso>
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\import-family-gameplay-capture.mjs --family openlands --lane standalone --capture-root <capture-root> --artifact <pack.zip> --tester <name> --world-or-profile <name> --started-at <iso> --force
node scripts\generate-family-gameplay-evidence.mjs --family openlands
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Missing real gameplay evidence JSON.
- Missing fresh install and fresh world/profile proof.
- Missing first 30-minute playthrough proof.
- Missing first 2-hour playthrough proof.
- Missing primary Openlands route or systems objective reached and recorded.
- Missing save/reload verification proof.
- Missing no-crash review proof.

## Arcana Division Native

| Field | Value |
| --- | --- |
| Pack | `arcana-division-native-edition` |
| Repository | `knoxhack/ECHO-Arcana-Division-Native-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 7 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Primary objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Arcana Division" --lane native --pack-id arcana-division-native-edition --launcher-instance "Arcana Division Native Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "primaryObjectiveCompleted|Primary objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\prepare-family-gameplay-capture.mjs --family arcana-division --lane native --tester <name> --world-or-profile <name> --started-at <iso>
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\import-family-gameplay-capture.mjs --family arcana-division --lane native --capture-root <capture-root> --artifact <pack.zip> --tester <name> --world-or-profile <name> --started-at <iso> --force
node scripts\generate-family-gameplay-evidence.mjs --family arcana-division
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Missing real gameplay evidence JSON.
- Missing fresh install and fresh world/profile proof.
- Missing first 30-minute playthrough proof.
- Missing first 2-hour playthrough proof.
- Missing primary Arcana Division route or systems objective reached and recorded.
- Missing save/reload verification proof.
- Missing no-crash review proof.

## Arcana Division NeoForge

| Field | Value |
| --- | --- |
| Pack | `arcana-division-neoforge-edition` |
| Repository | `knoxhack/ECHO-Arcana-Division-NeoForge-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 7 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Primary objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Arcana Division" --lane neoforge --pack-id arcana-division-neoforge-edition --launcher-instance "Arcana Division NeoForge Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "primaryObjectiveCompleted|Primary objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\prepare-family-gameplay-capture.mjs --family arcana-division --lane neoforge --tester <name> --world-or-profile <name> --started-at <iso>
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\import-family-gameplay-capture.mjs --family arcana-division --lane neoforge --capture-root <capture-root> --artifact <pack.zip> --tester <name> --world-or-profile <name> --started-at <iso> --force
node scripts\generate-family-gameplay-evidence.mjs --family arcana-division
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Missing real gameplay evidence JSON.
- Missing fresh install and fresh world/profile proof.
- Missing first 30-minute playthrough proof.
- Missing first 2-hour playthrough proof.
- Missing primary Arcana Division route or systems objective reached and recorded.
- Missing save/reload verification proof.
- Missing no-crash review proof.

## Arcana Division Standalone

| Field | Value |
| --- | --- |
| Pack | `arcana-division-standalone-edition` |
| Repository | `knoxhack/ECHO-Arcana-Division-Standalone-Edition` |
| Status | `open` |
| Acceptance lane status | `blocked` |
| Blockers | 7 |
| Latest Computer Use attempt | `none` |

### Computer Use Checks

| Check | Current Attempt | Required Evidence |
| --- | --- | --- |
| Fresh world/profile created | `not-attempted` | `notes`, `screenshot`, `launcher-log`, `client-log` |
| HUD visible | `not-attempted` | `screenshot` |
| Inventory Index visible after opening inventory | `not-attempted` | `screenshot` |
| Terminal visible | `not-attempted` | `screenshot` |
| HoloMap visible | `not-attempted` | `screenshot` |
| First 30 minutes captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| First 2 hours captured | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Primary objective completed | `not-attempted` | `notes`, `screenshot`, `client-log`, `save-snapshot` |
| Save/reload verified | `not-attempted` | `client-log`, `save-snapshot` |
| No-crash review completed | `not-attempted` | `notes`, `launcher-log`, `client-log` |

### Record Attempt

```powershell
node scripts\record-computer-use-gameplay-capture-attempt.mjs --family "Arcana Division" --lane standalone --pack-id arcana-division-standalone-edition --launcher-instance "Arcana Division Standalone Edition" --screenshot-status not-attempted --note "Work-order generated placeholder. Replace statuses and evidence refs after a real visible Computer Use capture." --verification-check "freshWorldCreated|Fresh world/profile created|not-attempted||Pending real visible capture." --verification-check "hudVisible|HUD visible|not-attempted||Pending real visible capture." --verification-check "inventoryIndexVisible|Inventory Index visible after opening inventory|not-attempted||Pending real visible capture." --verification-check "terminalVisible|Terminal visible|not-attempted||Pending real visible capture." --verification-check "holomapVisible|HoloMap visible|not-attempted||Pending real visible capture." --verification-check "realFirst30Playthrough|First 30 minutes captured|not-attempted||Pending real visible capture." --verification-check "realFirst2HourPlaythrough|First 2 hours captured|not-attempted||Pending real visible capture." --verification-check "primaryObjectiveCompleted|Primary objective completed|not-attempted||Pending real visible capture." --verification-check "saveReloadVerified|Save/reload verified|not-attempted||Pending real visible capture." --verification-check "noCrashEvidence|No-crash review completed|not-attempted||Pending real visible capture."
```

### Prepare

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\prepare-family-gameplay-capture.mjs --family arcana-division --lane standalone --tester <name> --world-or-profile <name> --started-at <iso>
```

### Import Or Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\import-family-gameplay-capture.mjs --family arcana-division --lane standalone --capture-root <capture-root> --artifact <pack.zip> --tester <name> --world-or-profile <name> --started-at <iso> --force
node scripts\generate-family-gameplay-evidence.mjs --family arcana-division
```

### Central Refresh

```powershell
Set-Location ..\ECHO-Release-Index
node scripts\verify-gameplay-acceptance.mjs
```

### Current Blockers

- Missing real gameplay evidence JSON.
- Missing fresh install and fresh world/profile proof.
- Missing first 30-minute playthrough proof.
- Missing first 2-hour playthrough proof.
- Missing primary Arcana Division route or systems objective reached and recorded.
- Missing save/reload verification proof.
- Missing no-crash review proof.

## Boundary

Do not mark a lane release-ready from this work order or from a platform-level Computer Use attempt alone. Gameplay acceptance changes only after the owning family evidence importer accepts non-empty local screenshots, logs, notes, and save snapshots.

