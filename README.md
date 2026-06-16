# ECHO Release Index

Public catalog, channel, and release index metadata used by the launcher, website, and ecosystem tooling.

## Purpose

Public catalog, channel, and release index metadata used by the launcher, website, and ecosystem tooling.

## What Lives Here

Release catalog JSON, channel metadata, public status docs, validation notes, download/index references, and `content-graph` artifact roles for module/addon entries.

The canonical catalog is organized by install/update lane:

- `products/` for launcher, studios, runtimes, platform products, and website artifacts.
- `modpacks/` for Ashfall Native, NeoForge, and Standalone pack entries.
- `modules/` for first-party module artifacts from `ECHO-Modules`.
- `addons/` for validated third-party addon entries.
- `publishers/` for GitHub publisher identity records.
- `channels/` for public channel metadata and launcher channel files.
- `trust/` for trust tiers.
- `blocks/` for publisher/addon/module/product/version/artifact blocks.
- `schemas/` for the canonical catalog-side JSON Schemas.

## Release And Update Role

Does not own binaries. It points clients at the correct launcher, pack, module, studio, and website release feeds.

## Public Or Private

Public is strongly recommended. A private release index prevents unauthenticated launcher and website update discovery.

## Build And Dev Commands

Run commands from the repository root.

- `node scripts/docs-audit.mjs`
- `node scripts/generate-codex-context.mjs --check`
- `node scripts/validate-index.mjs --strict`
- `node scripts/verify-content-graph-release-proof.mjs`
- `node scripts/verify-artifact-urls.mjs`
- `node scripts/sync-launcher-channel-catalog.mjs --check`
- `node scripts/sync-public-alpha-index.mjs --check`
- `node scripts/test-validate-index.mjs`
- `node scripts/test-verify-content-graph-release-proof.mjs`
- `node scripts/test-sync-public-alpha-index.mjs`
- `node scripts/test-verify-artifact-urls.mjs`
- `node scripts/test-build-public-alpha-assets.mjs`
- `node scripts/test-verify-ashfall-artifact-truth.mjs`
- `node scripts/test-verify-ashfall-release-readiness.mjs`
- `node scripts/test-generate-ashfall-rc-smoke.mjs`
- `node scripts/test-download-ashfall-draft-release.mjs`
- `node scripts/test-promote-ashfall-native-catalog.mjs`
- `node scripts/verify-ashfall-artifact-truth.mjs --download-live`
- `node scripts/verify-ashfall-artifact-truth.mjs --require-release-ready`
- `node scripts/download-ashfall-draft-release.mjs --clean`
- `node scripts/generate-ashfall-rc-smoke.mjs`
- `node scripts/promote-ashfall-native-catalog.mjs --write`
- `node scripts/test-publish-galactic-survey-draft-releases.mjs`
- `node scripts/publish-galactic-survey-draft-releases.mjs --publish --prune-unlisted`
- `node scripts/download-galactic-survey-draft-releases.mjs --clean`
- `node ..\ECHO-Launcher\scripts\galactic-survey-real-minecraft-handoff-smoke.mjs --allow-real-minecraft-root --clean`
- `node scripts/prepare-galactic-survey-first-launch-capture.mjs --tester <name> --world-or-profile <name> --started-at <iso> [--open-launcher]`
- `node scripts/import-galactic-survey-first-launch-evidence.mjs --capture-root <path> --artifact <downloaded-pack-zip> --tester <name> --world-or-profile <name> --started-at <iso>`
- `node scripts/test-prepare-galactic-survey-first-launch-capture.mjs`
- `node scripts/test-import-galactic-survey-first-launch-evidence.mjs`
- `node scripts/generate-galactic-survey-manual-gameplay-work-order.mjs --write`
- `node scripts/test-generate-galactic-survey-manual-gameplay-work-order.mjs`
- `node scripts/download-native-sdk-rc1-artifacts.mjs --write --clean`
- `node scripts/test-download-native-sdk-rc1-artifacts.mjs`
- `node scripts/verify-native-sdk-rc1-artifacts.mjs --write`
- `node scripts/verify-native-sdk-rc1-attestation.mjs`
- `node scripts/test-verify-native-sdk-rc1-artifacts.mjs`
- `node scripts/verify-ashfall-release-readiness.mjs --require-release-ready`
- `node scripts/verify-galactic-survey-public-alpha-readiness.mjs --write`
- `node scripts/test-verify-galactic-survey-public-alpha-readiness.mjs`
- `node scripts/test-publish-public-alpha.mjs`
- `node scripts/test-ingest-release-local-e2e.mjs`
- `node scripts/test-publish-ingest-install-local-e2e.mjs`
- `node scripts/test-ingest-webhook-service.mjs`
- `node scripts/import-module-release.mjs --manifest ../ECHO-Modules/dist/echo-module-release/echo-release.json --release-tag <tag> --commit-sha <sha>`
- `node scripts/ingest-release.mjs --owner knoxhack --repo ECHO-Modules --tag <tag> --write-index-entry --out validation-result.json`
- `node scripts/ingest-webhook-service.mjs`

## Artifact Ownership

Index JSON and catalog metadata belong here. Binary release assets stay in their owning source repos.

## Native Platform RC1

The Native Platform product entry currently points at `1.0.0-RC1` and is checksum-backed, download-smoked, attested, and approved for beta/RC launcher installation. Local artifact, local Native SDK main/source/Javadoc jars, SDK public catalog and download-back proof, SDK workflow-built attestation, external addon release-mode proof, GitHub upload/download-back, published runtime asset attestation, attested Galactic Survey module assets, Galactic Survey public prerelease pack download-back, launcher install/update/repair/rollback evidence, packaged Electron UI install/update/rollback/repair evidence, packaged diagnostics/log export evidence, isolated Minecraft Launcher handoff metadata evidence, and real `.minecraft` prepare-only profile handoff evidence exist. Stable `1.0.0` and public-ready pack promotion remain blocked until a real packaged first-launch/open-play path passes, final catalog promotion is complete, and real pack gameplay evidence passes. See `docs/native-platform-rc1-handoff.md`.

Each installable entry must include stable fields for `id`, `kind`, `version`, `channel`, `publisher`, `sourceRepo`, `releaseTag`, `commitSha`, `artifacts`, `dependencies`, `compatibility`, `trust`, and `validation`.

The required schema inventory is enforced by `scripts/validate-index.mjs` and includes addon package, pack manifest, module release manifest, product update entry, Release Index entry, publisher, channel, trust, and block schemas.

## Content Graph Artifact Role

Every `module` and `addon` entry must index a `content-graph` artifact that points to the module's `-content-graph.json` sidecar:

```json
{
  "artifacts": {
    "content-graph": {
      "file": "echocore-1.0.0-content-graph.json",
      "sha256": "...",
      "size": 12345,
      "url": "https://github.com/knoxhack/ECHO-Modules/releases/download/.../echocore-1.0.0-content-graph.json",
      "runtimeTarget": "content-graph",
      "buildMode": "generated",
      "contains": [".echo/content-graph/content-graph.json"]
    }
  }
}
```

`scripts/validate-index.mjs --strict` rejects approved entries that lack this role. Non-approved entries receive a warning so cataloging can proceed before the sidecar URL is published. Historical addon rows superseded by current module rows may set `contentGraphEvidencePolicy: "legacy-fallback-only"` to make the sidecar-only fallback explicit without implying release-level aggregate evidence exists for the preserved legacy row. Historical non-approved rows whose sidecar is retained only as metadata may also set `contentGraphArtifactPolicy: "legacy-metadata-only"`; current installable module rows must still carry live content graph artifact URLs.

`scripts/sync-launcher-channel-catalog.mjs --check` compares `alpha`, `experimental`, and legacy unchannelled product/modpack catalog artifacts with `channels/alpha/release-manifest.json`; `beta` and later lane entries are owned by their own release evidence and are not rewritten from the historical alpha manifest. Use `--write` after publishing public alpha assets to refresh exact URLs, sizes, and SHA-256 records without changing any entry's `validation` or `trust` state.

`scripts/sync-launcher-channel-catalog.mjs --check` verifies that each launcher channel references every catalog entry in `products/`, `modpacks/`, `modules/`, and `addons/`. Run it without `--check` after adding or removing catalog files so `channels/<channel>/launcher-channel.json` stays aligned with strict validation.

`scripts/publish-public-alpha.mjs` uploads every generated file in each repository's public-alpha staging directory. Use `--only <repo>` for a single release candidate lane and `--draft --prune-unlisted` for Ashfall Native release candidates so stale placeholder assets are removed from the draft before download smoke testing. `--draft` refuses to convert an existing public release back to draft unless `--convert-existing-public-release-to-draft` is supplied; prefer a fresh RC tag unless reusing the public tag is intentional. Ashfall Native publish filtering intentionally skips generic staged `manifest.json` and uploads only the release-ready `checksums.txt`, `echo-release.json`, `.pack.json`, and pack ZIP assets. `--strict-assets` still enforces the manifest-listed required assets, but generated assets such as the Standalone Runtime archive are not dropped just because the live manifest has not been refreshed yet. The `Public Alpha Publish` workflow runs this with `--write-manifest` during real publish runs, then runs catalog sync and commits refreshed manifest/product/modpack artifact metadata back to the index.

`scripts/build-public-alpha-assets.mjs` stages Ashfall Native Edition through the ECHO Launcher pack exporter using `ECHO_ASHFALL_NATIVE_SOURCE`, then `ECHO_ASHFALL_SOURCE`, then the default CurseForge instance path. It must not copy the Native Platform product zip as a pack substitute. ECHO Modules staging selects the full Ashfall required module set by default and fails without compiled runtime jars; use `--allow-source-packaged-modules` only for source-visible alpha staging, not player-ready release evidence.

`scripts/verify-ashfall-artifact-truth.mjs` keeps the current Ashfall Native catalog honest while legacy assets remain live. Warning-level metadata can point at the old placeholder for continuity, but `--require-release-ready` fails until the catalog has an exporter-built Native pack zip, `.pack.json` sidecar, `echo-release.json`, and matching checksums. Add `--download-live` to inspect the live GitHub manifest and ZIP contents.

`scripts/verify-ashfall-release-readiness.mjs` is the full Ashfall promotion gate. It reads `release-readiness/ashfall-native-public-alpha.json` and verifies artifact truth, Launcher pack metadata, Native Platform beta/crash/public-beta evidence, real gameplay QA evidence, Native Edition player-facing polish assets, and release-candidate install smoke evidence. Run it without `--require-release-ready` for an audit report; run it with `--require-release-ready` before any public-ready promotion.

Phase 5 Native Platform code-gate evidence is produced in `ECHO-Native-Platform` by `node scripts/generate-ashfall-native-code-gate.mjs`. The report must prove a real `gradlew check` execution exited with code 0.

Phase 7 Native Platform beta evidence is produced in `ECHO-Native-Platform` by `node scripts/generate-ashfall-native-public-beta-evidence.mjs`. That reducer must stay fail-closed until `fixtures/ashfall/native-public-beta/manual-evidence.json` cites real session logs, crash review notes, a checksum-verified tester package, support runbook, rollback plan, and published limitations.

`scripts/download-ashfall-draft-release.mjs --clean` is the Phase 10 draft-download gate. It requires a GitHub token, refuses non-draft releases, downloads only the four release-ready Ashfall Native assets, rejects stale placeholder/generic assets, writes them under `tmp/ashfall-draft-download/ECHO-Ashfall-Native-Edition`, and records `release-readiness/ashfall-draft-download.json`.

`scripts/generate-ashfall-rc-smoke.mjs` creates the Phase 10 smoke evidence from locally staged Ashfall Native and ECHO Modules public-alpha assets. It verifies the release manifest, top-level checksums, embedded ZIP checksums, required pack files, required compiled modules, and a temporary launcher-style install/repair/rollback cycle. By default it records `draftReleaseDownloaded` and `promotedAfterGreen` as false because local staged assets are not a downloaded GitHub draft release and have not been promoted. To smoke the downloaded draft release bytes, run it with `--native-stage tmp/ashfall-draft-download/ECHO-Ashfall-Native-Edition --draft-download-evidence`; the deprecated `--draft-release-downloaded` flag now fails unless real draft-download evidence is supplied.

`scripts/promote-ashfall-native-catalog.mjs --write` is the guarded Phase 2/3 promotion step after the Ashfall Native release candidate is published, downloaded, smoke-tested, and promoted out of draft. It refuses to approve `modpacks/ashfall-native.json` or `packs/ashfall-native-edition.json` while the release manifest is still draft, still contains placeholder/generic assets, lacks release-ready asset names, has local staged SHA/size drift, or lacks green downloaded-draft RC smoke promotion evidence linked to the draft-download gate.

`scripts/publish-galactic-survey-draft-releases.mjs --publish --prune-unlisted` is the Galactic Survey draft upload gate for pre-public staging. It creates or updates only draft prereleases for the Native, NeoForge, and Standalone edition repos, uploads the five expected assets per edition from `tmp/galactic-survey-edition-assets`, refuses existing public releases, and writes `release-readiness/galactic-survey-draft-publish.json`. Once those assets are promoted or replaced on public prerelease tags, verify the public bytes with `scripts/download-galactic-survey-draft-releases.mjs --clean --allow-public-prerelease`, then run `scripts/smoke-galactic-survey-edition-pack-assets.mjs --download-root tmp/galactic-survey-draft-download --draft-download-evidence release-readiness/galactic-survey-draft-download.json --clean`, `npm --prefix ../ECHO-Launcher run test:e2e:galactic-survey-launcher -- --clean`, and `npm --prefix ../ECHO-Launcher run test:e2e:galactic-survey-electron-ui -- --clean` before refreshing the Galactic Survey public-alpha readiness report. The packaged Electron smoke requires a current Windows unpacked Launcher executable; rebuild it with `npm --prefix ../ECHO-Launcher run package:win:dir` after Launcher source changes. Current public prerelease evidence is summarized from the download-back report, while the draft-publish report remains a staging artifact only.

`../ECHO-Launcher/scripts/galactic-survey-real-minecraft-handoff-smoke.mjs --allow-real-minecraft-root --clean` is the packaged-launcher real `.minecraft` prepare-only handoff gate. It installs Galactic Survey Native Edition from downloaded public prerelease bytes, writes an ECHO-managed Minecraft Launcher profile and Native Loader version metadata in the detected user Minecraft root, verifies all 23 installed module files, and records `release-readiness/galactic-survey-real-minecraft-handoff-smoke.json`. It deliberately keeps `officialMinecraftLauncherOpened` as `not_run_prepare_only` and `firstLaunchOpenPlay` as `blocked_not_proven`; it is prerequisite launcher evidence, not gameplay/open-play proof.

`scripts/prepare-galactic-survey-first-launch-capture.mjs` creates a timestamped, fail-closed capture kit for real first-launch/open-play evidence. It verifies the downloaded GitHub pack ZIP against `release-readiness/galactic-survey-draft-download.json`, records local Minecraft Launcher/profile status using the pack-specific Native Loader version from the prepared profile, writes the exact required capture checklist, and can open the official Minecraft Launcher with `--open-launcher`. The generated `capture-manifest.json` also inventories local candidate launcher logs, client logs, crash reports, and screenshots so the tester can copy confirmed real-run files into the required evidence paths. It does not produce release evidence; the generated note templates contain a marker that the importer rejects until real observations, screenshots, logs, and support bundle files replace them.

`scripts/import-galactic-survey-first-launch-evidence.mjs` is the catalog-side first-launch/open-play intake. It requires a capture root with launcher handoff notes, official Minecraft Launcher open notes, first open/play notes, no-crash review notes, PNG screenshots, launcher and client logs, and a support ZIP. The `--artifact` must be the downloaded pack ZIP whose size and SHA-256 match `release-readiness/galactic-survey-draft-download.json`. A passing import writes `release-readiness/galactic-survey-first-launch-open-play.json`; the readiness reducer accepts that report only when all first-launch claims are true and checksum-backed.

`scripts/generate-galactic-survey-manual-gameplay-work-order.mjs --write` turns the Galactic Survey readiness report into exact per-edition manual gameplay capture tasks at `release-readiness/galactic-survey-manual-gameplay-work-order.json` and `docs/galactic-survey-manual-gameplay-work-order.md`. It does not prove gameplay by itself; it names the missing first-30-minute, first-2-hour, Survey Array, save/reload, no-crash, notes, screenshots, log, save ZIP, artifact hash, and local verifier work required before promotion.

`scripts/download-native-sdk-rc1-artifacts.mjs --write --clean` downloads every SDK jar indexed by `products/native-sdk.json`, verifies exact size/SHA-256, and writes `release-readiness/native-sdk-rc1-download-smoke.json`. It proves public URL byte round-trip only; it does not prove signing, attestation, or workflow-built provenance.

`scripts/verify-native-sdk-rc1-attestation.mjs` verifies the public SDK RC1 release bytes against GitHub workflow-built SLSA provenance and records `release-readiness/native-sdk-rc1-attestation.json`.

`scripts/verify-native-sdk-rc1-artifacts.mjs --write` records the Native public SDK RC1 artifact gate at `release-readiness/native-sdk-rc1-artifacts.json`. It checks `echo-native-contracts`, `echoaddonapi`, `echoadaptercore`, `echo-native-testkit`, and the SDK Gradle plugin for local main/source/Javadoc jars, matching public GitHub catalog artifacts, live download-back evidence, attested public artifacts, and stable non-source-linked provenance. The current SDK RC1 artifact set is approved through `products/native-sdk.json` while the wider stable release remains gated by real first-launch/open-play and gameplay evidence.

`scripts/verify-artifact-urls.mjs` checks live GitHub reachability for approved artifact URLs. Use `--all` before promoting warning entries or after publishing new public alpha assets.

Approved module imports require `echo-release.json` using `schemaVersion: "echo.module.release.v1"` with provenance from `scripts/generate-module-release.mjs`, including the module release workflow ref, commit SHA, `actions/attest@v4`, and `checksums.sha256` attestation subject.

`scripts/ingest-release.mjs` accepts `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_APP_INSTALLATION_ID` to mint an installation token. `GITHUB_TOKEN`/`GH_TOKEN` remains supported for local validation. Releases declaring `official`, `reproducible-build`, `echo-workflow-built`, or `provenance-attested` trust must use `--require-attestation` with `--attestation-commit` and `--attestation-workflow`; those values are enforced through GitHub CLI provenance verification against the downloaded asset bytes. `gh release verify-asset` is recorded as a best-effort signal because GitHub may not expose workflow attestations as release-tag attestations even when `gh attestation verify` succeeds for the exact asset bytes. Approved releases without a declared trust tier default to `source-linked` unless attestation verification runs. Set `ECHO_INGEST_GH_EXECUTABLE` when CI or a fixture needs to use a specific `gh` executable. Use `--write-index-entry` to write approved or rejected catalog entries after release, checksum, archive, dependency closure, block, and attestation policy checks finish.

Bare attestation workflow paths such as `.github/workflows/release-modules.yml` are accepted for ingestion configuration, but the verifier passes the repository-qualified signer workflow identity, for example `knoxhack/ECHO-Modules/.github/workflows/release-modules.yml`, to `gh attestation verify` and stores that exact verified signer workflow in catalog provenance.

Public alpha entries may remain `source-linked` while their GitHub release assets are exact and approved but not yet attested. Strict validation reserves `official`, `reproducible-build`, `echo-workflow-built`, and `provenance-attested` approval for entries that include provenance and attestation metadata.

For deterministic local tests, `GITHUB_API_BASE_URL` can point ingestion at a GitHub-compatible fixture API, and `ECHO_INGEST_DOWNLOAD_MIRROR_BASE_URL` can mirror asset bytes while preserving GitHub HTTPS `browser_download_url` values in approved index entries. `scripts/test-ingest-release-local-e2e.mjs` uses those hooks to prove webhook HMAC verification, release/asset fetches, checksum checks, archive metadata inspection, dependency closure, block rejection, approved index writes, required attestation verification through a fake `gh`, and strict index validation without external network calls. `scripts/test-publish-ingest-install-local-e2e.mjs` composes fake published releases, real ingestion writes, strict index validation, launcher-style deep link install, update, corrupt-file repair, and rollback planning in one local end-to-end path.

`scripts/ingest-webhook-service.mjs` exposes the same ingestion path as an HTTP service:

- `GET /healthz` reports service readiness and write/attestation modes.
- `POST /github/releases` accepts GitHub `release` webhooks and forwards the raw payload, `X-Hub-Signature-256`, and configured policy flags to `scripts/ingest-release.mjs`.
- `ECHO_WEBHOOK_SECRET` enables HMAC verification.
- `ECHO_INGEST_WRITE_INDEX_ENTRY=true` allows approved/rejected catalog writes.
- `ECHO_INGEST_REQUIRE_ATTESTATION=true` requires GitHub CLI attestation verification.
- `ECHO_INGEST_CHANNEL`, `ECHO_INGEST_PUBLISHER`, `ECHO_INGEST_TRUST`, `ECHO_INGEST_ENTRY_KIND`, `ECHO_INGEST_ENTRY_ID`, `ECHO_INGEST_ATTESTATION_COMMIT`, and `ECHO_INGEST_ATTESTATION_WORKFLOW` map to the matching CLI flags.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_APP_INSTALLATION_ID` are still read by the delegated ingestion script for GitHub App installation-token access.

## Docs Index

- [README.md](README.md)
- [docs/ecosystem-artifact-ownership.md](docs/ecosystem-artifact-ownership.md)
- [docs/codex/README.md](docs/codex/README.md)
- [docs/codex/platform-primer.md](docs/codex/platform-primer.md)
- [docs/codex/repo-routing.md](docs/codex/repo-routing.md)
- [docs/codex/maintenance.md](docs/codex/maintenance.md)
- [docs/native-platform-rc1-handoff.md](docs/native-platform-rc1-handoff.md)
- [docs/galactic-survey-manual-gameplay-work-order.md](docs/galactic-survey-manual-gameplay-work-order.md)
- [PUBLIC_ALPHA_RELEASE_STATUS.md](PUBLIC_ALPHA_RELEASE_STATUS.md)

## Related Repos

- [knoxhack/ECHO-Launcher](https://github.com/knoxhack/ECHO-Launcher)
- [knoxhack/ECHO-Modules](https://github.com/knoxhack/ECHO-Modules)
- [knoxhack/ECHO-Ashfall-Native-Edition](https://github.com/knoxhack/ECHO-Ashfall-Native-Edition)
- [knoxhack/ECHO-Ashfall-NeoForge-Edition](https://github.com/knoxhack/ECHO-Ashfall-NeoForge-Edition)
- [knoxhack/ECHO-Ashfall-Standalone-Edition](https://github.com/knoxhack/ECHO-Ashfall-Standalone-Edition)
- [knoxhack/ECHO-Galactic-Survey-Native-Edition](https://github.com/knoxhack/ECHO-Galactic-Survey-Native-Edition)
- [knoxhack/ECHO-Galactic-Survey-NeoForge-Edition](https://github.com/knoxhack/ECHO-Galactic-Survey-NeoForge-Edition)
- [knoxhack/ECHO-Galactic-Survey-Standalone-Edition](https://github.com/knoxhack/ECHO-Galactic-Survey-Standalone-Edition)
- [knoxhack/ECHO-Native-Platform](https://github.com/knoxhack/ECHO-Native-Platform)
- [knoxhack/ECHO-Standalone-Runtime](https://github.com/knoxhack/ECHO-Standalone-Runtime)
- [knoxhack/ECHO-SDK](https://github.com/knoxhack/ECHO-SDK)
- [knoxhack/ECHO-Developer-Studio](https://github.com/knoxhack/ECHO-Developer-Studio)
- [knoxhack/ECHO-Addons-Studio](https://github.com/knoxhack/ECHO-Addons-Studio)
- [knoxhack/ECHO-Platform-Website](https://github.com/knoxhack/ECHO-Platform-Website)
