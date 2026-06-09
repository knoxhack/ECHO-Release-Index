# ECHO Release Index

Public catalog, channel, and release index metadata used by the launcher, website, and ecosystem tooling.

## Purpose

Public catalog, channel, and release index metadata used by the launcher, website, and ecosystem tooling.

## What Lives Here

Release catalog JSON, channel metadata, public status docs, validation notes, and download/index references.

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
- `node scripts/validate-index.mjs --strict`
- `node scripts/verify-artifact-urls.mjs`
- `node scripts/sync-public-alpha-index.mjs --check`
- `node scripts/test-validate-index.mjs`
- `node scripts/test-sync-public-alpha-index.mjs`
- `node scripts/test-verify-artifact-urls.mjs`
- `node scripts/test-build-public-alpha-assets.mjs`
- `node scripts/test-publish-public-alpha.mjs`
- `node scripts/test-ingest-release-local-e2e.mjs`
- `node scripts/test-publish-ingest-install-local-e2e.mjs`
- `node scripts/test-ingest-webhook-service.mjs`
- `node scripts/import-module-release.mjs --manifest ../ECHO-Modules/dist/echo-module-release/echo-release.json --release-tag <tag> --commit-sha <sha>`
- `node scripts/ingest-release.mjs --owner knoxhack --repo ECHO-Modules --tag <tag> --write-index-entry --out validation-result.json`
- `node scripts/ingest-webhook-service.mjs`

## Artifact Ownership

Index JSON and catalog metadata belong here. Binary release assets stay in their owning source repos.

Each installable entry must include stable fields for `id`, `kind`, `version`, `channel`, `publisher`, `sourceRepo`, `releaseTag`, `commitSha`, `artifacts`, `dependencies`, `compatibility`, `trust`, and `validation`.

The required schema inventory is enforced by `scripts/validate-index.mjs` and includes addon package, pack manifest, module release manifest, product update entry, Release Index entry, publisher, channel, trust, and block schemas.

`scripts/sync-public-alpha-index.mjs --check` compares product and modpack catalog artifacts with `channels/alpha/release-manifest.json`; use `--write` after publishing public alpha assets to refresh exact URLs, sizes, and SHA-256 records without changing any entry's `validation` or `trust` state.

`scripts/publish-public-alpha.mjs` uploads every generated file in each repository's public-alpha staging directory. `--strict-assets` still enforces the manifest-listed required assets, but generated assets such as the Standalone Runtime archive are not dropped just because the live manifest has not been refreshed yet. The `Public Alpha Publish` workflow runs this with `--write-manifest` during real publish runs, then runs catalog sync and commits refreshed manifest/product/modpack artifact metadata back to the index.

`scripts/verify-artifact-urls.mjs` checks live GitHub reachability for approved artifact URLs. Use `--all` before promoting warning entries or after publishing new public alpha assets.

Approved module imports require `echo-release.json` provenance from `scripts/generate-module-release.mjs`, including the module release workflow ref, commit SHA, `actions/attest@v4`, and `checksums.sha256` attestation subject.

`scripts/ingest-release.mjs` accepts `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_APP_INSTALLATION_ID` to mint an installation token. `GITHUB_TOKEN`/`GH_TOKEN` remains supported for local validation. Releases declaring `official`, `reproducible-build`, `echo-workflow-built`, or `provenance-attested` trust must use `--require-attestation` with `--attestation-commit` and `--attestation-workflow`; those values are enforced through GitHub CLI release-asset and provenance verification against downloaded asset bytes. Approved releases without a declared trust tier default to `source-linked` unless attestation verification runs. Set `ECHO_INGEST_GH_EXECUTABLE` when CI or a fixture needs to use a specific `gh` executable. Use `--write-index-entry` to write approved or rejected catalog entries after release, checksum, archive, dependency closure, block, and attestation policy checks finish.

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
- [PUBLIC_ALPHA_RELEASE_STATUS.md](PUBLIC_ALPHA_RELEASE_STATUS.md)

## Related Repos

- [knoxhack/ECHO-Launcher](https://github.com/knoxhack/ECHO-Launcher)
- [knoxhack/ECHO-Modules](https://github.com/knoxhack/ECHO-Modules)
- [knoxhack/ECHO-Ashfall-Native-Edition](https://github.com/knoxhack/ECHO-Ashfall-Native-Edition)
- [knoxhack/ECHO-Ashfall-NeoForge-Edition](https://github.com/knoxhack/ECHO-Ashfall-NeoForge-Edition)
- [knoxhack/ECHO-Ashfall-Standalone-Edition](https://github.com/knoxhack/ECHO-Ashfall-Standalone-Edition)
- [knoxhack/ECHO-Native-Platform](https://github.com/knoxhack/ECHO-Native-Platform)
- [knoxhack/ECHO-Standalone-Runtime](https://github.com/knoxhack/ECHO-Standalone-Runtime)
- [knoxhack/ECHO-SDK](https://github.com/knoxhack/ECHO-SDK)
- [knoxhack/ECHO-Developer-Studio](https://github.com/knoxhack/ECHO-Developer-Studio)
- [knoxhack/ECHO-Addons-Studio](https://github.com/knoxhack/ECHO-Addons-Studio)
- [knoxhack/ECHO-Platform-Website](https://github.com/knoxhack/ECHO-Platform-Website)
