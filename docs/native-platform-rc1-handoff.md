# ECHO Native Platform RC1 Handoff

## Current State

`echo-native-platform` is indexed as `1.0.0-RC1` with approved runtime provenance. The wider Native full-release train remains gated by real launcher first-launch/open-play evidence and real gameplay/player evidence.

The RC1 GitHub prerelease now exists and the product assets have passed download-back smoke from GitHub bytes:

- Release: `https://github.com/knoxhack/ECHO-Native-Platform/releases/tag/v1.0.0-RC1`
- Release target: `d2a0536de2e2d4d13e02c8574e906f6013724d8b`
- Evidence: `release-readiness/native-platform-rc1-download-smoke.json`
- Ingestion: `release-readiness/native-platform-rc1-ingestion.json`

Published asset attestation evidence now exists:

- Attestation workflow: `https://github.com/knoxhack/ECHO-Native-Platform/actions/runs/27464082128`
- Attestation workflow commit: `2f59e8dee210392e252d7dea7c069d12dd43a93f`
- Evidence: `release-readiness/native-platform-rc1-attestation.json`
- Verified command: `gh attestation verify`
- Scope: published release asset bytes for all 9 RC1 release assets.

`gh release verify-asset` still reports no release-tag-scoped attestations for this tag. Do not treat that command as green unless it starts passing in a future GitHub CLI/API behavior. The accepted RC1 evidence is the asset-byte `gh attestation verify` result recorded above.

Local artifact evidence exists:

- Artifact: `C:/Development/Github/ECHO-Native-Platform/build/public-alpha/echo-native-product-1.0.0-RC1.zip`
- Size: `60744144`
- SHA-256: `16b96ea676d7f64f84653f1d08d89ba03eddb4a08eed9698fac51637801b8e45`
- Native Platform commit: `d2a0536de2e2d4d13e02c8574e906f6013724d8b`
- SDK proof commit: `ec0d9b83b695309ef895c8e591ec41bf84336211`
- Module proof commit: `7f452ce44db8628ca0724f0e5b94f252ffa5bb1a`

The local external addon proof generated, built, packaged, and loaded a `.echo-addon` through Native release mode. That proves the developer export path, but it does not prove public distribution.

Native SDK RC1 artifact evidence now exists:

- Evidence: `release-readiness/native-sdk-rc1-artifacts.json`
- Download smoke: `release-readiness/native-sdk-rc1-download-smoke.json`
- Attestation evidence: `release-readiness/native-sdk-rc1-attestation.json`
- Provenance workflow: `https://github.com/knoxhack/ECHO-SDK/actions/runs/27472775602`
- Provenance workflow commit: `d167e4cae7a5643d7cca978aca6cdaeb132862cc`
- Scope: `echo-native-contracts`, `echoaddonapi`, `echoadaptercore`, `echo-native-testkit`, and the SDK Gradle plugin.
- Local status: all 15 required main/source/Javadoc jars exist in the owning repos.
- Public status: passed. All 15 jars are indexed in `products/native-sdk.json` with GitHub release URLs, exact size, and SHA-256.
- Download-back status: passed. All 15 jars downloaded from the public SDK RC1 release and matched their indexed size/SHA-256 values.
- Attestation status: passed. `gh attestation verify` confirms the workflow-built SLSA statement covers all 15 public SDK jars plus `checksums.sha256` and `native-sdk-rc1-manifest.json`.
- Stable provenance status: passed for the SDK artifact set. `products/native-sdk.json` is now `provenance-attested` and `approved`.

Galactic Survey module and pack prerelease evidence now exists:

- Module release workflow: `https://github.com/knoxhack/ECHO-Modules/actions/runs/27467968646`
- Module release: `https://github.com/knoxhack/ECHO-Modules/releases/tag/galactic-survey-0.1.0-alpha`
- Module source commit: `9decbb1c5ef07e3ed749301fca1eaa383fa1cef2`
- Module ingest evidence: `release-readiness/galactic-survey-module-release-ingest.json`
- Edition pack assets: `release-readiness/galactic-survey-edition-pack-assets.json`
- Public prerelease download-back: `release-readiness/galactic-survey-draft-download.json`
- Pack lifecycle smoke: `release-readiness/galactic-survey-edition-pack-smoke.json`
- Reducer proof: `release-readiness/galactic-survey-public-alpha-readiness.json`
- Result: all 23 required runtime modules are checksum-backed from the attested module release, all 15 public prerelease edition assets download back from GitHub, and downloaded public bytes match the locally staged pack asset hashes.

Launcher lifecycle evidence now exists:

- Evidence: `release-readiness/galactic-survey-launcher-lifecycle-smoke.json`
- Packaged Electron evidence: `release-readiness/galactic-survey-electron-ui-smoke.json`
- Real `.minecraft` prepare-only handoff evidence: `release-readiness/galactic-survey-real-minecraft-handoff-smoke.json`
- Reducer: `release-readiness/galactic-survey-public-alpha-readiness.json`
- Scope: Galactic Survey public prerelease GitHub pack assets, including `galactic-survey-native-edition`.
- Passed: Launcher-owned deep-link resolution, pack ZIP install, update reconciliation, version-transition update, corrupt-file repair, rollback, and post-rollback update.
- Passed in packaged Electron: renderer mount, native bridge bootstrap, Galactic Survey Library cards, scoped card actions, install click-through, update reconciliation click-through, visible Restore Last Known Good rollback click-through, post-rollback re-update, corrupt-file repair click-through, diagnostic export, log/support bundle export, and prepare-only Minecraft Launcher handoff metadata in an isolated Minecraft root.
- Handoff status: the packaged launcher wrote an ECHO-managed Native Loader Minecraft profile and `echo-native-loader-1.0.0` version metadata inside `tmp/galactic-survey-electron-ui-smoke/isolated-minecraft-root`, verified all 23 installed module files, and deliberately skipped opening the official Minecraft Launcher. This proves metadata handoff mechanics without touching the user's real `.minecraft` folder.
- Real root handoff status: `../ECHO-Launcher/scripts/galactic-survey-real-minecraft-handoff-smoke.mjs --allow-real-minecraft-root --clean` installed Galactic Survey Native Edition from downloaded public prerelease bytes, wrote the ECHO-managed `echo-galactic-survey-native-edition-native-loader` profile and Native Loader version metadata in the detected user `.minecraft` root, verified all 23 installed module files, and deliberately stayed in prepare-only mode.
- Official launcher attempt status: `release-readiness/galactic-survey-first-launch-official-launcher-attempt.json` records a 2026-06-13 Windows attempt against the installed launcher at `C:/XboxGames/Minecraft Launcher/Content/Minecraft.exe`. The launcher opened, the Microsoft account was visible, and the selected profile was `Galactic Survey Native Edition - Native Loader` with `echo-galactic-survey-native-edition-native-loader-1.0.0`. This is useful evidence for profile visibility only. It is still `BLOCKED` because window screenshot capture failed with `SetIsBorderRequired` `0x80004002`, the Play button did not expose a supported automation action, keyboard focus stayed on the launcher document, and no title/world-loaded screenshot, current client log, support bundle, or no-crash review was imported.
- First-launch status: the legacy `launch:start` path fails closed with the explicit Minecraft Launcher Handoff blocker after verifying all 23 installed module files. This is not first-launch proof; a real Native runtime launch path or an official Minecraft Launcher open/play handoff must pass before approval.
- Not covered: real packaged first launch, final catalog promotion, and real gameplay/player evidence. Packaged Electron rollback is now covered by the visible Restore Last Known Good path and recorded in `release-readiness/galactic-survey-electron-ui-smoke.json`.
- Gameplay capture intake now exists in all three Galactic Survey edition repos through `scripts/prepare-manual-gameplay-capture.mjs` and `scripts/import-manual-gameplay-capture.mjs`. The prepare step verifies the Release Index downloaded public prerelease artifact, writes a checksum-bound `capture-manifest.json`, and creates only note templates plus empty capture directories. The import step requires that manifest, real notes, PNG screenshots, logs, save ZIPs, and an artifact size/SHA-256 match before it can write release-ready `manual-evidence.json`. This tooling does not satisfy the gameplay gate by itself.

Launcher artifact and handoff repair is now committed in `ECHO-Launcher`:

- Commits: `4d55635 Repair modpack artifact and handoff pipeline`, `5238ffb Harden all-modpacks smoke reporting`
- Scope: public module release fallback URLs, Release Index/module metadata asset ingestion, hash-verified multi-URL artifact downloads, legacy `pack-root/` module archive-path normalization, pack-specific install/handoff messages, NeoForge installer metadata repair from official Maven bytes, packaged standalone runtime staging, and all-modpack install-smoke route preparation checks.
- Verification already run before commit: `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run package:win:dir`.
- Boundary: this fixes the launcher/export pipeline mechanics. It does not close first-launch/open-play or gameplay evidence gates until real captures are imported.

First-launch/open-play capture intake now exists in the Release Index:

```text
node scripts/prepare-galactic-survey-first-launch-capture.mjs --tester <name> --world-or-profile <name> --started-at <iso> [--open-launcher]
```

The prep command verifies the downloaded GitHub pack ZIP against `release-readiness/galactic-survey-draft-download.json`, creates a timestamped capture folder under `tmp/galactic-survey-first-launch-open-play/`, records local Minecraft Launcher/profile status using the prepared profile's pack-specific Native Loader version id, inventories local candidate launcher/client logs, crash reports, and screenshots, and writes the exact file checklist and importer command. It is intentionally not release evidence: note templates include a marker that the importer rejects until real observations replace them, and it does not create fake screenshots, logs, or ZIP bundles.

After the real `.minecraft` prepare-only handoff smoke passes, the prep command should report the expected ECHO-managed Galactic Survey Native Loader profile and its `echo-galactic-survey-native-edition-native-loader-1.0.0` version metadata as present. The local inventory is only a convenience pointer to possible files from the workstation; the tester must open the official launcher, select the profile, launch/open the game, and copy confirmed notes, screenshots, logs, and a support bundle into the required capture paths before import.

```text
node scripts/import-galactic-survey-first-launch-evidence.mjs --capture-root <path> --artifact <downloaded-pack-zip> --tester <name> --world-or-profile <name> --started-at <iso>
```

The capture root must contain:

- `launcher-handoff-notes.md`
- `official-launcher-open-notes.md`
- `first-open-play-notes.md`
- `no-crash-review.md`
- `screenshots/echo-managed-profile.png`
- `screenshots/minecraft-launcher-open.png`
- `screenshots/pack-profile-selected.png`
- `screenshots/world-or-title-loaded.png`
- `logs/echo-launcher-latest.log`
- `logs/minecraft-client.log`
- `support-bundles/echo-launcher-support.zip`

The importer rejects missing files, empty files, placeholder/TODO text, non-PNG screenshots, non-ZIP support bundles, and pack artifacts whose size or SHA-256 do not match `release-readiness/galactic-survey-draft-download.json`. A passing import writes `release-readiness/galactic-survey-first-launch-open-play.json`; `scripts/verify-galactic-survey-public-alpha-readiness.mjs` accepts first-launch/open-play only from that PASS report or a future automated launch smoke with `packagedElectronFirstLaunch: "passed"`.

Manual gameplay work-order generation also exists in the Release Index:

```text
node scripts/generate-galactic-survey-manual-gameplay-work-order.mjs --write
```

It writes `release-readiness/galactic-survey-manual-gameplay-work-order.json` and `docs/galactic-survey-manual-gameplay-work-order.md`. The current work order is `OPEN`; it names the missing first-30-minute, first-2-hour, Survey Array, fresh world, save/reload, no-crash, notes, screenshots, client log, save ZIP, artifact-hash, prepared capture manifest, and local verifier tasks for Native, NeoForge, and Standalone. Each edition section now starts with:

```text
node scripts\prepare-manual-gameplay-capture.mjs --release-index-root ..\ECHO-Release-Index --tester <name> --world-or-profile <name> --started-at <iso>
node scripts\import-manual-gameplay-capture.mjs --capture-root <capture-root> --artifact <prepared-artifact-path> --tester <name> --world-or-profile <name> --started-at <iso> --force
```

## Approval Boundary

Do not approve stable `1.0.0` and do not remove warning validation until all of these are real, current, and attached to Release Index evidence:

- Packaged Launcher first launch passes through a real runtime path or an official Minecraft Launcher open/play handoff.
- `release-readiness/galactic-survey-first-launch-open-play.json` is PASS, checksum-backed, and captured from real launcher/open-play evidence unless the packaged Electron smoke gains a real automated first-launch path.
- `release-readiness/galactic-survey-manual-gameplay-work-order.json` is COMPLETE and all three Galactic Survey edition `verify-manual-gameplay-evidence.mjs --require-release-ready` commands pass.
- Final public pack promotion evidence is approved.
- At least one Native pack gameplay smoke passes from the published runtime.
- `release-readiness/native-sdk-rc1-download-smoke.json` remains PASS, proving public SDK main/source/Javadoc jar URLs download back with exact size/SHA-256 matches.
- `release-readiness/native-sdk-rc1-attestation.json` remains passed, proving the public SDK bytes are covered by GitHub workflow-built SLSA provenance.
- `release-readiness/native-sdk-rc1-artifacts.json` remains PASS, proving public SDK main/source/Javadoc jars are cataloged, download-smoked, attested, and approved with non-source-linked provenance.
- Stable-target catalog metadata has no `warning`, `blocked`, or `alpha` release blocker, and no stable artifact remains `source-linked`.

## Mutation Truth

The current Native release contract is typed-host-receipt based:

- `MUTATED` requires an `EchoNativeMutationReceipt` returned by a typed host service.
- Descriptor metadata, diagnostic maps, legacy `activateNative(Map)`, and addon-created receipts do not prove mutation.
- Release mode rejects dev classpath fallback and inferred classpath tokens.

## Related Evidence

- `products/native-platform.json`
- `release-readiness/galactic-survey-edition-pack-assets.json`
- `release-readiness/galactic-survey-edition-pack-smoke.json`
- `release-readiness/galactic-survey-electron-ui-smoke.json`
- `release-readiness/galactic-survey-first-launch-official-launcher-attempt.json`
- `release-readiness/galactic-survey-real-minecraft-handoff-smoke.json`
- `release-readiness/galactic-survey-public-alpha-readiness.json`
- `release-readiness/native-sdk-rc1-artifacts.json`
- `release-readiness/native-sdk-rc1-attestation.json`
- `release-readiness/native-sdk-rc1-download-smoke.json`
- `../ECHO-Native-Platform/docs/echo/native/RELEASE_CANDIDATE_CHECKLIST.md`
