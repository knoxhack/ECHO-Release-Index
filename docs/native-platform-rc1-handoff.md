# ECHO Native Platform RC1 Handoff

## Current State

`echo-native-platform` is indexed as `1.0.0-RC1` and remains warning-gated.

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
- Scope: `echo-native-contracts`, `echoaddonapi`, `echoadaptercore`, `echo-native-testkit`, and the SDK Gradle plugin.
- Local status: all 15 required main/source/Javadoc jars exist in the owning repos.
- Public status: passed. All 15 jars are indexed in `products/native-sdk.json` with GitHub release URLs, exact size, and SHA-256.
- Download-back status: passed. All 15 jars downloaded from the public SDK RC1 release and matched their indexed size/SHA-256 values.
- Stable provenance status: blocked. The SDK jar set must be approved with non-source-linked provenance before stable `1.0.0`.

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
- Reducer: `release-readiness/galactic-survey-public-alpha-readiness.json`
- Scope: Galactic Survey public prerelease GitHub pack assets, including `galactic-survey-native-edition`.
- Passed: Launcher-owned deep-link resolution, pack ZIP install, update reconciliation, version-transition update, corrupt-file repair, rollback, and post-rollback update.
- Passed in packaged Electron: renderer mount, native bridge bootstrap, Galactic Survey Library cards, scoped card actions, install click-through, update reconciliation click-through, visible Restore Last Known Good rollback click-through, post-rollback re-update, corrupt-file repair click-through, diagnostic export, log/support bundle export, and prepare-only Minecraft Launcher handoff metadata in an isolated Minecraft root.
- Handoff status: the packaged launcher wrote an ECHO-managed Native Loader Minecraft profile and `echo-native-loader-1.0.0` version metadata inside `tmp/galactic-survey-electron-ui-smoke/isolated-minecraft-root`, verified all 23 installed module files, and deliberately skipped opening the official Minecraft Launcher. This proves metadata handoff mechanics without touching the user's real `.minecraft` folder.
- First-launch status: the legacy `launch:start` path fails closed with the explicit Minecraft Launcher Handoff blocker after verifying all 23 installed module files. This is not first-launch proof; a real Native runtime launch path or an official Minecraft Launcher open/play handoff must pass before approval.
- Not covered: real packaged first launch, final catalog promotion, and real gameplay/player evidence. Packaged Electron rollback is now covered by the visible Restore Last Known Good path and recorded in `release-readiness/galactic-survey-electron-ui-smoke.json`.
- Gameplay capture intake now exists in all three Galactic Survey edition repos through `scripts/import-manual-gameplay-capture.mjs`; it imports real notes, PNG screenshots, logs, save ZIPs, and the published pack artifact hash into `manual-evidence.json`. This tooling does not satisfy the gameplay gate by itself.

First-launch/open-play capture intake now exists in the Release Index:

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

It writes `release-readiness/galactic-survey-manual-gameplay-work-order.json` and `docs/galactic-survey-manual-gameplay-work-order.md`. The current work order is `OPEN`; it names the missing first-30-minute, first-2-hour, Survey Array, fresh world, save/reload, no-crash, notes, screenshots, client log, save ZIP, artifact-hash, and local verifier tasks for Native, NeoForge, and Standalone.

## Approval Boundary

Do not approve stable `1.0.0` and do not remove warning validation until all of these are real, current, and attached to Release Index evidence:

- Packaged Launcher first launch passes through a real runtime path or an official Minecraft Launcher open/play handoff.
- `release-readiness/galactic-survey-first-launch-open-play.json` is PASS, checksum-backed, and captured from real launcher/open-play evidence unless the packaged Electron smoke gains a real automated first-launch path.
- `release-readiness/galactic-survey-manual-gameplay-work-order.json` is COMPLETE and all three Galactic Survey edition `verify-manual-gameplay-evidence.mjs --require-release-ready` commands pass.
- Final public pack promotion evidence is approved.
- At least one Native pack gameplay smoke passes from the published runtime.
- `release-readiness/native-sdk-rc1-download-smoke.json` is PASS, proving public SDK main/source/Javadoc jar URLs download back with exact size/SHA-256 matches.
- `release-readiness/native-sdk-rc1-artifacts.json` is PASS, proving public SDK main/source/Javadoc jars are cataloged, download-smoked, and approved with non-source-linked provenance.
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
- `release-readiness/galactic-survey-public-alpha-readiness.json`
- `release-readiness/native-sdk-rc1-artifacts.json`
- `release-readiness/native-sdk-rc1-download-smoke.json`
- `../ECHO-Native-Platform/docs/echo/native/RELEASE_CANDIDATE_CHECKLIST.md`
