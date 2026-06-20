# ECHO Platform Overview

This is a single-file, human-readable overview of the ECHO platform as of the regenerated Codex context snapshot at `2026-06-17T18:09:32-04:00`.

The canonical machine-generated orientation remains `docs/codex/generated/ECHO_PLATFORM_CONTEXT.md`. This document summarizes that context and the task-relevant source-owned docs across the platform so a reader can understand the whole system without opening every repository first.

## Executive Summary

ECHO is a multi-repository platform for first-party experience packs, shared modules, runtime lanes, launcher distribution, creator tooling, release policy, and public catalog metadata.

The platform is intentionally split by ownership:

- `ECHO-Release-Index` owns catalog records, channel files, trust tiers, block policy, public release routing, and cross-repo Codex context.
- `ECHO-Modules` owns first-party module source, module descriptors, module release artifacts, module graph architecture, Foundation modules, and the `.ECHO Content Graph` release output.
- `ECHO-SDK` owns schemas, templates, validation tools, examples, Native SDK RC1 contracts, and creator-facing documentation.
- Runtime repos own runtime binaries, loaders, diagnostics, and runtime-specific contract behavior.
- Launcher, website, studio, mobile, and command-center repos own their applications and update metadata.
- Experience edition repos own pack manifests, pack assets, edition-specific release evidence, install/update docs, and gameplay proof for their lane.

ECHO's product model is lane-based. A first-party experience can ship through Native, NeoForge, and Standalone edition repos. The same shared module graph feeds those lanes, but each lane owns its pack manifest, artifact family, runtime evidence, and gameplay evidence.

## Start Here

If you only read one part of this file, read this section and `Readiness Reality`.

ECHO is not one app and not one game repo. It is a release ecosystem. The Release Index tells clients what exists, what can be installed, where the bytes live, how those bytes are trusted, and what evidence supports them. The actual code and release assets still live in their owning repos.

The most important thing to understand is the difference between these three statements:

- "The catalog can point at it." This means the Release Index has metadata for an entry.
- "The launcher can install it." This means install/update/repair/rollback and checksums may be working.
- "The experience is gameplay-ready." This requires real play evidence, not just install evidence.

Right now, the platform has strong catalog, artifact, install, runtime, and content-graph evidence. It does not yet have green gameplay acceptance across the public-alpha families and lanes.

### Plain-English Platform Shape

The platform has a hub-and-spoke shape.

The hub is `ECHO-Release-Index`. It is the catalog, trust, channel, and routing hub.

The shared source spine is `ECHO-Modules`. It builds the reusable modules used by packs. Those modules are published in three artifact shapes: Native `.echo-addon`, NeoForge `-neoforge.jar`, and Standalone `-standalone.jar`.

The contract and creator spine is `ECHO-SDK`. It owns schemas, templates, validation tools, and the public Native SDK line.

The runtime lanes are Native Platform, NeoForge compatibility, and Standalone Runtime.

The user-facing install surface is `ECHO-Launcher`, backed by website and studio tooling.

The experience families are Ashfall, Openlands, Arcana Division, Sky Relay, and Galactic Survey. Each family has a Native edition, a NeoForge edition, and a Standalone edition.

### What Is Actually Green

The current audit says the platform has real positive evidence in these areas:

- The regenerated Codex context is current.
- Release Index strict validation passes.
- Docs audit passes.
- Public alpha live channel proof passes.
- Content graph release proof passes.
- Modpack module artifact drift passes.
- Public alpha runtime acceptance has all 10 hard gates passing.
- The launcher channel covers 15 pack lanes.
- The Release Index validates 158 indexed entries.

That is meaningful. It means the release plumbing is not imaginary.

### What Is Still Blocked

Gameplay acceptance is still blocked.

The current matrix reports 5 families, 15 lanes, 0 passed lanes, and 452 blockers. That means install/runtime success must not be described as final gameplay readiness. Any public messaging should be careful: "installable," "indexed," "runtime-gated," or "warning-gated" are different from "gameplay-ready."

### How To Use This Document

Use this document in layers:

1. Read `Start Here` for the plain-English shape.
2. Read `Current Snapshot` and `Direct Local Audit` for what is true on disk right now.
3. Read `Release Index` if the task touches catalog, channel, trust, artifacts, or validation.
4. Read `First-Party Modules` if the task touches shared modules, Foundation, descriptors, module releases, or content graphs.
5. Read `Runtime Lanes` if the task touches Native, NeoForge, or Standalone behavior.
6. Read `Experience Families` if the task touches pack-specific work.
7. Use `Channels And Routing` to pick the repo to inspect before editing.

This file is a map, not legal proof. For code changes, always inspect the owning repo files directly.

## Current Snapshot

| Area | Snapshot |
| --- | --- |
| Source root | `C:\Development\Github` |
| Canonical context hub | `C:\Development\Github\ECHO-Release-Index` |
| Configured repositories | 26 |
| Release manifest repositories | 24 |
| Launcher-channel pack lanes | 15 |
| Catalog product entries | 7 |
| Catalog modpack entries | 15 |
| Catalog pack entries | 15 |
| Catalog module JSON files | 134, including one schema helper file in the catalog folder |
| Legacy addon rows | 3 |
| Publishers | 1 (`knoxhack`) |
| Active block records | 0 |
| Known context warning | Unconfigured local repo `ECHO-Native-Platform-RC1-3d6e810` |

The generated roadmap docs describe a `133` descriptor baseline for first-party modules. A direct catalog scan found `134` JSON files under `modules/`; one of those is `module-release-manifest.schema.json`, so code and docs should distinguish module descriptors from catalog-folder JSON files.

## Direct Local Audit

The facts below come from direct local repository inspection, not only from the generated context packet. The audit checked `git` state, README headings, `AGENTS.md` presence, `PUBLIC_ALPHA_RELEASE_STATUS.md` presence, package/Gradle markers, Markdown counts, and root JSON counts.

This repository also regenerated `docs/codex/generated/ECHO_PLATFORM_CONTEXT.md` and `docs/codex/generated/context-index.json` during this audit because `node scripts/generate-codex-context.mjs --check` reported both generated files as stale. A follow-up check returned `Codex context is current.`

### Repository State

| Repository | Git State | README / Role Signal | Stack Marker | Docs |
| --- | --- | --- | --- | --- |
| `ECHO-Addons-Studio` | `main @ 9fe4365e6259`, clean | `ECHO Studio` | `echo-studio@0.1.1` | `AGENTS.md`, public status, 4 Markdown files |
| `ECHO-Arcana-Division-Native-Edition` | `main @ a27142475b04`, clean | `Arcana Division Native Edition` | `arcana-division-native-edition@1.0.0` | 4 Markdown files |
| `ECHO-Arcana-Division-NeoForge-Edition` | `main @ 300e9c992368`, clean | `Arcana Division NeoForge Edition` | `arcana-division-neoforge-edition@1.0.0` | 4 Markdown files |
| `ECHO-Arcana-Division-Standalone-Edition` | `main @ 3aff001a9146`, clean | `Arcana Division Standalone Edition` | `arcana-division-standalone-edition@1.0.0` | 4 Markdown files |
| `ECHO-Ashfall-Native-Edition` | `main @ e04827fdede5`, clean | `ECHO Ashfall Native Edition` | pack/docs repo | public status, 71 Markdown files |
| `ECHO-Ashfall-NeoForge-Edition` | `main @ f0629716a0cf`, dirty 2 | `ECHO Ashfall NeoForge Edition` | pack/docs repo | 7 Markdown files |
| `ECHO-Ashfall-Standalone-Edition` | `main @ ef3d4897b742`, clean | `ECHO Ashfall Standalone Edition` | pack/docs repo | 7 Markdown files |
| `ECHO-COMMAND-CENTER` | `main @ 67e68f252619`, clean | `ECHO Command Center` | `echo-command-center@0.1.2` | `AGENTS.md`, 7 Markdown files |
| `ECHO-Developer-Studio` | `main @ 5c30130c1b93`, clean | `ECHO Developer Studio` | `echo-developer-studio@0.1.0` | `AGENTS.md`, public status, 5 Markdown files |
| `ECHO-Galactic-Survey-Native-Edition` | `main @ 86e78041eebc`, clean | `ECHO Galactic Survey Native Edition` | pack/docs repo | 14 Markdown files |
| `ECHO-Galactic-Survey-NeoForge-Edition` | `main @ b1d1796c451d`, clean | `ECHO Galactic Survey NeoForge Edition` | pack/docs repo | 14 Markdown files |
| `ECHO-Galactic-Survey-Standalone-Edition` | `main @ a8776d366ed0`, clean | `ECHO Galactic Survey Standalone Edition` | pack/docs repo | 14 Markdown files |
| `ECHO-Launcher` | `main @ 2754af751736`, dirty 2, untracked 1 | `ECHO Launcher` | `echo-launcher@1.1.16` | public status, 12 Markdown files |
| `ECHO-Modules` | `main @ d499d0a554e7`, dirty 26 | `ECHO Modules` | Gradle | public status, 412 Markdown files |
| `ECHO-Native-Platform` | `main @ 09acd4a7838d`, dirty 4 | `ECHO Native Platform` | Gradle | public status, 34 Markdown files |
| `ECHO-Native-Platform-RC1-3d6e810` | detached/unnamed @ `fe83654eed0b`, clean | `ECHO Native Platform` | Gradle | public status, 34 Markdown files |
| `ECHO-Openlands-Native-Edition` | `main @ ca4cc038d295`, clean | `ECHO Openlands Native Edition` | pack/docs repo | 10 Markdown files |
| `ECHO-Openlands-NeoForge-Edition` | `main @ 9b6750668da4`, clean | `ECHO Openlands NeoForge Edition` | pack/docs repo | 10 Markdown files |
| `ECHO-Openlands-Standalone-Edition` | `main @ 6197d4373f07`, clean | `ECHO Openlands Standalone Edition` | pack/docs repo | 10 Markdown files |
| `ECHO-Platform-Website` | `main @ 3cd98f00652d`, clean | `ECHO Platform Website` | `echo-platform-website@0.1.0` | public status, 2 Markdown files |
| `ECHO-Release-Index` | `main @ 8eb35f550f0c`, pre-audit dirty 2, plus this docs/context update | `ECHO Release Index` | catalog/docs repo | `AGENTS.md`, public status, 21 Markdown files before this file |
| `ECHO-SDK` | `main @ 68b9d07a633f`, clean | `ECHO SDK` | schema/tools repo | `AGENTS.md`, public status, 143 Markdown files |
| `ECHO-Sky-Relay-Native-Edition` | `main @ 7b280406f988`, clean | `ECHO Sky Relay Native Edition` | pack/docs repo | 15 Markdown files |
| `ECHO-Sky-Relay-NeoForge-Edition` | `main @ f78b1c7acf9c`, clean | `ECHO Sky Relay NeoForge Edition` | pack/docs repo | 15 Markdown files |
| `ECHO-Sky-Relay-Standalone-Edition` | `main @ 9c7f2e64f0bc`, clean | `ECHO Sky Relay Standalone Edition` | pack/docs repo | 15 Markdown files |
| `ECHO-Standalone-Runtime` | `main @ 188852c567b5`, clean | `ECHO Standalone Runtime` | Gradle | public status, 40 Markdown files |
| `ECHO-Studio-Mobile` | `main @ e294bda4f6b0`, clean | no root README heading found | `echo-studio-mobile@1.0.1`, `@echo/shared@0.1.0` | `AGENTS.md`, 2 Markdown files |

### Dirty Repositories Found

These were existing local working-tree facts during the audit, separate from this overview file and regenerated context outputs.

`ECHO-Modules` has 26 modified files, concentrated around Native Loader attachment, Ashfall protocol HUD, core commands/models, creator/player/HUD/HoloMap/Index/Lens client paths, ScreenCore, ScriptCore, Terminal ScreenCore bridge, TextureForge, module metadata, and `reports/echo-native/core-module-integration-audit.json`.

`ECHO-Launcher` has 2 modified files and 1 untracked test:

- `electron/main.cjs`
- `src/components/library/usePackActions.ts`
- `src/components/library/usePackActions.test.ts`

`ECHO-Native-Platform` has 4 modified files:

- `echo-native-bootstrap-api/src/main/java/dev/echo/nativeplatform/bootstrap/EchoNativeActivationMarkerSnapshot.java`
- `echo-native-loader/src/main/java/dev/echo/nativeplatform/loader/EchoNativeModuleLoader.java`
- `echo-native-loader/src/main/java/dev/echo/nativeplatform/loader/NativeLoaderDefaultProductBridgeProvider.java`
- `echo-native-loader/src/main/java/dev/echo/nativeplatform/loader/NativeLoaderRegistryCreativeBridge.java`

`ECHO-Ashfall-NeoForge-Edition` has 2 modified docs:

- `README.md`
- `docs/module-requirements.md`

`ECHO-Release-Index` had 2 modified readiness files before this documentation/context update:

- `release-readiness/ashfall-lane-game-smoke.json`
- `release-readiness/public-alpha-live-channel-proof.json`

This audit then added or refreshed:

- `docs/codex/ECHO_PLATFORM_OVERVIEW.md`
- `docs/codex/generated/ECHO_PLATFORM_CONTEXT.md`
- `docs/codex/generated/context-index.json`

### Readiness Reality

The direct readiness audit found that platform transport and runtime gates are much greener than gameplay gates.

`release-readiness/public-alpha-runtime-acceptance.json` reports:

- status `warn`
- 10 hard gates
- 10 hard gates passing
- 0 hard gate failures
- 5 gameplay warnings
- conclusion: catalog convergence, install, handoff, lifecycle, and content graph runtime gates are green, but real gameplay proof remains warning-gated

`release-readiness/gameplay-acceptance-matrix.json` reports:

- schema `echo.gameplay.acceptance.v1`
- generated at `2026-06-17T21:52:48.582Z`
- status `BLOCKED`
- `strictReady: false`
- 5 families
- 15 lanes
- 0 passed families
- 5 blocked families
- 0 passed lanes
- 452 blockers
- 2 accepted transport proofs

Gameplay blocker counts by family and lane:

| Family | Native | NeoForge | Standalone | Family Status |
| --- | ---: | ---: | ---: | --- |
| Ashfall | 13 | 98 | 14 | blocked |
| Sky Relay | 1 | 1 | 1 | blocked |
| Galactic Survey | 77 | 77 | 77 | blocked |
| Openlands | 7 | 7 | 7 | blocked |
| Arcana Division | 7 | 7 | 7 | blocked |

Important positive evidence also exists:

- `release-readiness/public-alpha-live-channel-proof.json` is `pass` with 838 artifacts and 0 failed artifacts.
- `release-readiness/content-graph-evidence-release-proof.json` is `PASS`.
- `release-readiness/modpack-module-artifact-drift.json` is `pass`.
- `release-readiness/public-alpha-runtime-acceptance.json` records all 10 hard gates passing.

## Platform Mental Model

Think of ECHO as five stacked systems:

1. Shared contracts and policy: schemas, trust tiers, release entries, block lists, channel descriptors, and evidence contracts.
2. Shared content modules: reusable modules compiled into Native `.echo-addon`, NeoForge `-neoforge.jar`, and Standalone `-standalone.jar` artifacts.
3. Runtime lanes: Native Platform, NeoForge compatibility, and Standalone Runtime.
4. Experience lanes: Ashfall, Openlands, Arcana Division, Sky Relay, and Galactic Survey, each with Native, NeoForge, and Standalone edition repos.
5. Distribution and tooling: Launcher, website, Developer Studio, ECHO Studio, Mobile Studio, and Command Center.

The Release Index ties those systems together, but it does not replace source ownership. It records approved artifacts, exact URLs, SHA-256 values, dependencies, compatibility, validation state, and trust tier. The binaries live in the source repositories that build and publish them.

## Non-Negotiable Boundaries

- The Release Index never owns binary release assets. It indexes assets published by source repos.
- Source repos own their binaries, source code, runtime contracts, implementation details, release assets, and evidence files.
- Foundation modules own baseline survival and shared content contracts. Experience modules extend Foundation; they do not re-own shared survival basics.
- Experience modules may depend on Foundation modules. Experience modules must not depend on each other.
- Content graph evidence is diagnostics and release metadata. It is not gameplay proof.
- Hytale export plans are planning evidence only. They do not mean Hytale runtime assets exist.
- Install, update, repair, rollback, launcher handoff, and runtime load evidence do not prove gameplay readiness by themselves.
- Gameplay-ready promotion requires real local proof: screenshots, logs, notes, save snapshots, artifact identity, and source-repo evidence reports accepted by the Release Index gameplay matrix.

## Repository Map

| Repository | Owns | Read First |
| --- | --- | --- |
| `ECHO-Release-Index` | Catalog records, channel metadata, trust tiers, block policy, public alpha index, artifact routing, cross-repo Codex context | `AGENTS.md`, `README.md`, `docs/ecosystem-artifact-ownership.md`, `docs/codex/platform-primer.md`, `docs/codex/repo-routing.md` |
| `ECHO-Modules` | First-party module source, descriptors, module releases, Foundation architecture, platform roadmap, content graph generation | `README.md`, `docs/ECHO_PLATFORM_ROADMAP.md`, `docs/echo-foundations-architecture.md`, `docs/module-docs-index.md`, `docs/module-artifact-contract.md`, `docs/content-graph.md` |
| `ECHO-SDK` | Schemas, templates, validation tools, examples, Native SDK RC1 docs and contracts | `AGENTS.md`, `README.md`, `docs/schemas/index.md`, `docs/schemas/content-graph.md`, `templates/README.md` |
| `ECHO-Launcher` | Desktop launcher, updater, install/update/repair/rollback, profile manager, diagnostics, deep links | `README.md`, `PUBLIC_ALPHA_RELEASE_STATUS.md` |
| `ECHO-Native-Platform` | Native runtime, Native Loader, contracts, diagnostics, PackOS integration, native content graph planning | `README.md`, `docs/echo/native/README.md` |
| `ECHO-Standalone-Runtime` | Standalone runtime shell, standalone runtime modules, standalone content graph loading | `README.md`, `PUBLIC_ALPHA_RELEASE_STATUS.md` |
| `ECHO-Platform-Website` | Public website, docs site, directory pages, download pages, indexed `echo://` links | `README.md`, `PUBLIC_ALPHA_RELEASE_STATUS.md` |
| `ECHO-Developer-Studio` | First-party developer tooling desktop app | `AGENTS.md`, `README.md` |
| `ECHO-Addons-Studio` | Creator authoring, packaging, validation, release drafts, publishing handoffs | `AGENTS.md`, `README.md`, `docs/release-policy.md` |
| `ECHO-COMMAND-CENTER` | Private read-first release cockpit, local scanner, universe map, release train planning | `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/PHASES.md`, `docs/ROADMAP.md` |
| `ECHO-Studio-Mobile` | Mobile Studio app and shared mobile packages | `AGENTS.md`, `CLAUDE.md` |
| `ECHO-*-Native-Edition` | Native edition pack manifests, pack assets, Native runtime evidence, gameplay evidence | Edition `README.md`, `docs/install.md`, `docs/update-flow.md`, evidence docs |
| `ECHO-*-NeoForge-Edition` | NeoForge edition pack manifests, pack assets, NeoForge runtime evidence, gameplay evidence | Edition `README.md`, `docs/install.md`, `docs/update-flow.md`, evidence docs |
| `ECHO-*-Standalone-Edition` | Standalone edition pack manifests, pack assets, Standalone runtime evidence, gameplay evidence | Edition `README.md`, `docs/install.md`, `docs/update-flow.md`, evidence docs |

## Release Index

`ECHO-Release-Index` is the public catalog, channel, and release index metadata source used by the launcher, website, and ecosystem tooling.

Its catalog folders are organized by install and update lane:

- `products/` - launcher, studios, runtimes, platform products, SDK, and website/update product entries.
- `modpacks/` - pack install/update entries for edition lanes.
- `packs/` - first-party experience edition product records used by launcher and website surfaces.
- `modules/` - first-party module entries imported from `ECHO-Modules` release manifests.
- `addons/` - validated third-party or legacy addon rows.
- `publishers/` - publisher identity and trust bootstrap records.
- `channels/` - public channel descriptors and launcher channel files.
- `trust/` - trust tiers and playable/non-playable policy.
- `blocks/` - publisher, entry, version, dependency, and artifact blocks.
- `schemas/` - catalog-side JSON Schemas mirrored with the SDK.

Every installable entry is expected to carry stable fields for identity, kind, version, channel, publisher, source repository, release tag, commit SHA, artifacts, dependencies, compatibility, trust, and validation.

### Product Entries

| Entry | Kind | Version | Channel | Trust | Validation |
| --- | --- | ---: | --- | --- | --- |
| `echo-launcher` | product | `1.1.16` | alpha | source-linked | approved |
| `echo-native-platform` | runtime | `1.0.5` | beta | source-linked | approved |
| `echo-native-sdk` | product | `1.0.0-RC1` | beta | provenance-attested | approved |
| `echo-standalone-runtime` | runtime | `0.1.0` | experimental | source-linked | approved |
| `echo-developer-studio` | studio | `0.1.0` | alpha | source-linked | approved |
| `echo-addons-studio` | studio | `0.1.1` | alpha | source-linked | approved |
| `echo-arcana-division-neoforge-edition` | product | `1.0.1` | beta | source-linked | approved |

### Trust Tiers

| Tier | Rank | Playable | Meaning |
| --- | ---: | --- | --- |
| `official` | 100 | yes | First-party ECHO release with approved provenance |
| `reproducible-build` | 90 | yes | Build reproduced from source and verified |
| `echo-workflow-built` | 80 | yes | Built by the standard ECHO workflow |
| `provenance-attested` | 70 | yes | GitHub artifact attestation is present and matches the source release |
| `source-linked` | 60 | yes | Source repository and release are linked, with basic metadata verification |
| `community` | 50 | yes | Community release accepted by policy |
| `unverified` | 20 | no | Metadata is visible but not installable by default |
| `deprecated` | 10 | no | Release kept for rollback or compatibility only |
| `blocked` | 0 | no | Release explicitly blocked |

Public alpha entries may remain `source-linked` when GitHub release assets are exact and approved but not yet attested. Strict validation reserves `official`, `reproducible-build`, `echo-workflow-built`, and `provenance-attested` for entries that include required provenance and attestation metadata.

### Current Pack Lanes in Launcher Channel

| Experience | Native | NeoForge | Standalone |
| --- | --- | --- | --- |
| Ashfall | alpha | alpha | experimental |
| Openlands | alpha | alpha | experimental |
| Arcana Division | beta | beta | beta |
| Sky Relay | alpha | alpha | alpha |
| Galactic Survey | alpha | alpha | alpha |

The Release Index also has 15 matching `modpacks/` records and 15 matching `packs/` records. A catalog row being approved or source-linked does not automatically mean the lane is gameplay-ready.

### Modpack Catalog Status

| Entry | Version | Channel | Validation Notes |
| --- | ---: | --- | --- |
| `ashfall-native-edition` | `0.1.0` | alpha | source-linked, warning in `modpacks/` |
| `ashfall-neoforge-edition` | `0.1.0` | alpha | source-linked, warning in `modpacks/` |
| `ashfall-standalone-edition` | `0.1.0` | experimental | source-linked, warning in `modpacks/` |
| `openlands-native-edition` | `0.1.1` | alpha | source-linked, approved |
| `openlands-neoforge-edition` | `0.1.2` | alpha | source-linked, approved |
| `openlands-standalone-edition` | `0.1.1` | experimental | source-linked, approved |
| `arcana-division-native-edition` | `1.0.1` | beta | source-linked, approved |
| `arcana-division-neoforge-edition` | `1.0.1` | beta | source-linked, approved |
| `arcana-division-standalone-edition` | `1.0.1` | beta | source-linked, approved |
| `sky-relay-native-edition` | `0.1.1` | alpha | source-linked, approved |
| `sky-relay-neoforge-edition` | `0.1.1` | alpha | source-linked, approved |
| `sky-relay-standalone-edition` | `0.1.1` | alpha | source-linked, approved |
| `galactic-survey-native-edition` | `0.1.1` | alpha | source-linked, approved |
| `galactic-survey-neoforge-edition` | `0.1.1` | alpha | source-linked, approved |
| `galactic-survey-standalone-edition` | `0.1.1` | alpha | source-linked, approved |

## First-Party Modules

`ECHO-Modules` is the canonical source for all shared ECHO module code, descriptors, generated per-module docs, and module release artifact contracts.

Each module release owns:

- `.echo-addon` Native artifact.
- `-neoforge.jar` module artifact.
- `-standalone.jar` module artifact.
- `-sources.jar` source artifact.
- Embedded `META-INF/echo.mod.json`.
- NeoForge TOML where applicable.
- `echo-addon-package.json` where applicable.
- Per-module `.echo/content-graph/` tree embedded in every runtime archive.
- Top-level `<module>-<version>-content-graph.json` sidecar.
- Release-root `content-graph-evidence.json`.
- `echo-release.json` with `schemaVersion: "echo.module.release.v1"`.
- `checksums.sha256` covered by workflow attestation.

Strict player-facing releases are generated from compiled runtime jars. `scripts/verify-module-release.mjs` opens every produced archive and rejects missing descriptors, missing NeoForge TOML, source-packaged runtime outputs, or checksum drift before Release Index import.

### Foundation Architecture

ECHO Foundations is the shared survival/content backbone.

Locked rule: Foundations owns baseline survival. Experiences consume Foundation contracts and may extend them, but they do not re-own baseline materials, tools, starter stations, starter loot, spawn safety, first-hour survival, or shared creature roles.

Dependency rule: experience modules depend on Foundation modules; experience modules never depend on each other.

| Foundation Module | Owns |
| --- | --- |
| `echofoundationcore` | Ownership rules, aliases, legal identity, release and dependency contracts |
| `echomaterialcore` | Generic materials, generic blocks, material tags, metal progression |
| `echotoolcore` | Generic tools, tool roles, shared tool progression |
| `echostationcore` | Generic stations, storage, shared recipe surfaces |
| `echoworldstarter` | Spawn safety, starter route, shelter score, first-hour items |
| `echocommonloot` | Generic loot pools, starter caches, block drops |
| `echocreatureroles` | Shared creature pressure and spawn role taxonomy |

### Experience Ownership

| Experience | Owns |
| --- | --- |
| Openlands | Calm exploration, homesteading, old roads, waystones, map table, regional rubbings, route bindings, Openlands biomes |
| Ashfall | Volcanic survival pressure, storms, heat, ash exposure, scarcity, shelters, filtration, atmospheric scrubbers, distillation, black rain, Ashfall hazards |
| Arcana Division | Magical research, rituals, familiars, curses, rifts, anomaly containment, Arcana stations, Arcana creatures, Arcana loot rules |
| Sky Relay | Relay/fragment content, sky route mechanics, relay protocol, power/weather/recovery integrations |
| Galactic Survey | Probe networks, HoloMap routing, orbital salvage, survey catalog progression, remote depots, Survey Array completion |

### Platform Roadmap Modules

The platform roadmap is implemented as contract-first modules. The first pass focuses on release confidence, creator leverage, player state, and future gameplay depth. Roadmap modules expose descriptors, data contracts, artifact docs, and native surface probes; they do not claim completed player-facing loops until implementation-specific tests and policy/reporting gates exist.

Phase 1, shipping confidence:

- `echoplaytestcore` - gameplay evidence runner, release readiness, session proofs.
- `echomigrationcore` - save/data-key/renamed-ID/removed-module/rollback migration contracts.
- `echocapabilitycore` - capability negotiation and fallback-safe optional integrations.
- `echopolicycore` - trust, permissions, write-action approval, server rules, blocked modules, governance.
- `echodependencydoctor` - human-readable broken graph, conflict, version, artifact, and integration diagnostics.

Phase 2, creator multipliers:

- `echoblueprintcore` - reusable authoring blueprints and Studio templates.
- `echobalancecore` - balance tables and audits.
- `echopackdiff` - gameplay, dependency, migration, and changelog diffs.
- `echoassetpipeline` - asset import, naming validation, thumbnails, manifests, missing asset reports.
- `echolocalizationcore` - translation validation, fallbacks, missing-key reports, language-pack exports.

Phase 3, player state and UX:

- `echosessioncore` - onboarding, objectives, route history, hazards, deaths, pack phase.
- `echoaccessibilitycore` - HUD scale, reduced motion, contrast themes, captions, prompts, narration metadata.
- `echocurationcore` - recommendations, bundle previews, dependency explanations, readiness badges.
- `echotelemetrycore` - privacy-safe local/session metrics for crashes, install health, progression, load failures.

Phase 4, big gameplay systems:

- `echofactioncore`, `echosettlementcore`, `echohazardcore`, `echoequipmentcore`, `echoskillcore`, `echoterritorycore`.

Phase 5, event and world depth:

- `echoexpeditioncore`, `echoruincore`, `echosupplycore`, `echodisastercore`, `echoseasoncore`, `echoserveropscore`.

### Module Inventory

The current module docs and catalog cover the following first-party modules and example rows:

`echoaccessibilitycore`, `echoadaptercore`, `echoaddonapi`, `echoaetherworks`, `echoagentcore`, `echoagriculturereclamation`, `echoarcanacore`, `echoarcanadivisionprotocol`, `echoarcaneindex`, `echoarmory`, `echoashfallprotocol`, `echoassetcore`, `echoassetpipeline`, `echoatmospherecore`, `echobalancecore`, `echobasegrid`, `echobiomecore`, `echoblackboxprotocol`, `echoblockworks`, `echoblueprintcore`, `echobridgecore`, `echocameracore`, `echocapabilitycore`, `echocinematiccore`, `echocodexcore`, `echocombatcore`, `echocommonloot`, `echocommunitybridge`, `echocontentcore`, `echoconvoyprotocol`, `echocore`, `echocreatorcore`, `echocreaturecore`, `echocreatureroles`, `echocurationcore`, `echocursecore`, `echodatacore`, `echodeepreachprotocol`, `echodependencydoctor`, `echodifficultycore`, `echodisastercore`, `echoeconomycore`, `echoencountercore`, `echoequipmentcore`, `echoeventcore`, `echoexpeditioncore`, `echofactioncore`, `echofamiliarcore`, `echofoundationcore`, `echogalacticcore`, `echogalacticsurveyprotocol`, `echogrimoire`, `echoguidecore`, `echohazardcore`, `echohealthcore`, `echoholomap`, `echohudcore`, `echoindex`, `echoindustrialnexus`, `echoinputcore`, `echolens`, `echolocalizationcore`, `echologisticscore`, `echologisticsnetwork`, `echolootcore`, `echolorecore`, `echomachinecore`, `echomaterialcore`, `echometadatacore`, `echomigrationcore`, `echomissioncore`, `echomodulegraph`, `echomultiblockcore`, `echonetcore`, `echonexusprotocol`, `echonotificationcore`, `echonpcore`, `echoopenlandsprotocol`, `echoorbitalremnants`, `echopackcore`, `echopackdiff`, `echoplatformcore`, `echoplayercore`, `echoplaytestcore`, `echopolicycore`, `echopowercore`, `echopowergrid`, `echopresencelink`, `echoprimecore`, `echoprogressioncore`, `echoquestdirector`, `echorecipecore`, `echorecovery`, `echorelictech`, `echorendercore`, `echoreportcore`, `echoriftworlds`, `echoritualcore`, `echoruincore`, `echoruntimeguard`, `echoschemacore`, `echoscreencore`, `echoscriptcore`, `echoseasoncore`, `echoserveropscore`, `echosessioncore`, `echosettlementcore`, `echosignalos`, `echoskillcore`, `echoskyrelayprotocol`, `echosocialcore`, `echosoundcore`, `echospawncore`, `echospellcore`, `echostationcore`, `echostationfall`, `echostatuscore`, `echostructurecore`, `echosupplycore`, `echotelemetrycore`, `echoterminal`, `echoterritorycore`, `echotextureforge`, `echothemecore`, `echotoolcore`, `echotutorialcore`, `echovalidationcore`, `echovehiclecore`, `echoweathercore`, `echowiki`, `echoworldcore`, `echoworldstarter`, `signalosexample`.

## .ECHO Content Graph

The `.ECHO Content Graph` is a runtime-neutral semantic model of modules, addons, and gameplay content.

It models:

- Modules, addons, and dependencies.
- Blocks, items, creative tabs, recipes, entities, and NPCs.
- Regions, triggers, effects, missions, and objectives.
- UI intents, settings, and systems.
- Generic schema-backed catalogs such as creatures, weather, missions, and runtime-specific export plans.
- Minecraft datapack recipes and loot tables where relevant.

Edges capture relationships such as `module_requires_module`, `recipe_consumes_item`, `recipe_outputs_item`, `mission_has_objective`, `objective_targets_node`, `ui_intent_controls_node`, and `setting_affects_system`.

### Generated Output

Each module release writes:

```text
dist/echo-module-release/<module-id>/<version>/.echo/content-graph/
  content-graph.json
  content-graph.md
  features.json
  provenance.json
  unresolved-references.json
  export-plans/neoforge.json
  export-plans/echo_native.json
  export-plans/echo_runtime_standalone.json
  export-plans/hytale.json
```

The release root also writes:

```text
dist/echo-module-release/content-graph-evidence.json
```

That root artifact uses `schemaVersion: "echo.content_graph.evidence.v1"` and is the canonical release-level summary for graph counts, module counts, node/edge totals, feature totals, export-plan totals, Hytale blocker totals, per-module summaries, and diagnostics.

### Current Strict Baseline

The current content graph strict baseline reports:

- `133` module graphs.
- `4392` nodes.
- `5911` edges.
- `9` explicit Hytale actor blockers, all from `echoopenlandsprotocol` entity nodes that need a future Hytale entity contract or fallback declaration.

The Hytale blockers are planning diagnostics. They do not fail runtime parity by themselves, and they do not prove or disprove playable support for any current runtime.

### Consumers

- `ECHO-Modules` generates and validates official graph outputs.
- `ECHO-SDK` owns the canonical schema family.
- `ECHO-Native-Platform` can read graph trees during dry-run planning and emit evidence summaries.
- `ECHO-Standalone-Runtime` can load graph files and compare evidence summaries.
- `ECHO-Launcher` extracts embedded graph trees from installed modules and displays aggregate counts in the Library pack detail drawer.
- `ECHO-Developer-Studio` and `ECHO-COMMAND-CENTER` surface graph evidence for review and scanning.
- `ECHO-Release-Index` indexes per-module `content-graph` sidecars and release-level `content-graph-evidence` artifacts.

## SDK And Schemas

`ECHO-SDK` is the source of truth for shared schemas, contracts, templates, API docs, and creator/developer onboarding.

The active Native SDK line is `1.0.0-RC1`. The canonical Native addon template compiles against:

- `echo-native-contracts`
- `echoaddonapi`
- `echoadaptercore`
- `echo-native-testkit`
- the SDK Gradle plugin

Native-first addons should not be documented as importing NeoForge, Forge, Fabric, or `echo-native-loader`. Addons prove mutation through typed host services returning `EchoNativeMutationReceipt`.

Core schemas include:

- Module descriptor: `META-INF/echo.mod.json`
- Addon package: `schemas/echo-addon-package.schema.json`
- Pack manifest: `schemas/echo-pack.schema.json`
- Release Index entry: `schemas/release-index-entry.schema.json`
- Product update entry: `schemas/product-update-entry.schema.json`
- Publisher: `schemas/publisher.schema.json`
- Trust tier: `schemas/trust.schema.json`
- Block entry: `schemas/block.schema.json`
- Channel: `schemas/channel.schema.json`
- Module release manifest: `schemas/module-release-manifest.schema.json`
- Content graph family: `content-graph`, `content-graph-node`, `content-graph-edge`, `content-graph-export-plan`, `content-feature-list`, `content-graph-evidence`
- Pack release metadata: `echo-release.json`
- Edition-specific pack manifests: `.pack.json`

Schema changes must be reflected in SDK docs and docs CI before release.

## Runtime Lanes

### Native Platform

`ECHO-Native-Platform` owns the Native runtime, Native Loader, platform services, adapter support, diagnostics, and PackOS integration for `.echo-addon` modules.

The active line is described as `1.0.0-RC1` in Native Platform and SDK docs. The Release Index product entry currently routes approved beta metadata for `echo-native-platform`, and the Release Index README records broader RC evidence and remaining gameplay gates.

Native Platform artifacts include:

- `echo-native-platform-1.0.0-RC1.zip` as the launcher-facing platform package.
- `echo-native-loader-1.0.0.jar` as the direct Native Loader library for manual install.
- Native product metadata and direct-install metadata.

Native Platform explicitly does not own Native pack content. Native pack releases live in edition repos such as `ECHO-Ashfall-Native-Edition` and consume `.echo-addon` artifacts from `ECHO-Modules`.

Native content graph planning reads per-module graph files from the configured `echo.content.graph.root` and produces `echo.content_graph.evidence.v1` summaries. Missing graphs warn but do not block native loading.

### NeoForge Compatibility Lane

NeoForge is the Minecraft adapter packaging lane. NeoForge edition repos consume `-neoforge.jar` module artifacts and adapt ECHO IDs into NeoForge runtime behavior.

NeoForge compatibility does not make Minecraft content the design source. Edition repos should keep ECHO protocol modules and ECHO IDs as source of truth, then adapt those into NeoForge data/runtime behavior.

### Standalone Runtime

`ECHO-Standalone-Runtime` owns the standalone runtime shell and engine layer for running ECHO content outside Minecraft.

Standalone Runtime owns:

- Gradle runtime code.
- Runtime shell contracts.
- Standalone docs.
- Runtime integration guides.
- Standalone content graph loading.
- Public alpha runtime archive `echo-standalone-runtime-0.1.0-alpha.zip`.

Standalone pack releases live in edition repos and consume `-standalone.jar` module artifacts from `ECHO-Modules`.

The standalone content graph loader reads `.echo/content-graph/content-graph.json`, `features.json`, and export plans from module roots, emits graph evidence counts, and compares summaries when `content-graph-evidence.json` exists.

## Launcher

`ECHO-Launcher` is the official desktop launcher, updater, repair tool, profile manager, diagnostics center, and release consumer.

It owns:

- React/Electron launcher source.
- Launcher installers, AppImages, blockmaps, `latest.yml`, and `latest-linux.yml`.
- Install, update, repair, rollback, and diagnostics flows.
- Deep-link resolution for `echo://install/...` and `echo://update/...`.
- Pack export and capture-assist scripts.

It consumes:

- Release Index channel metadata.
- Pack manifests from edition repos.
- Module artifacts from `ECHO-Modules`.
- Runtime products from `ECHO-Native-Platform` and `ECHO-Standalone-Runtime`.

When a Native pack is installed or repaired, the launcher extracts embedded `.echo/content-graph/` trees from `.echo-addon` modules and writes an aggregate `.echo/content-graph.json` to the install root. Library detail surfaces can display module counts, node counts, edge counts, feature counts, and Hytale export blockers.

Launcher smoke tests prove mechanics such as install, update reconciliation, repair after corruption, rollback, diagnostics export, and Minecraft Launcher handoff metadata. They do not prove real official-launcher open/play or gameplay readiness unless paired with required gameplay evidence.

## Website

`ECHO-Platform-Website` is the public website, docs site, product catalog, and download routing surface.

It owns:

- Next.js app source.
- MDX docs.
- Website content and public-facing ecosystem pages.
- Download pages.
- Indexed `echo://` install and update links.

The website should link to release assets owned by other repos. It should not become a binary owner.

## Studios And Tools

### Developer Studio

`ECHO-Developer-Studio` is a desktop app for module, platform, release, and developer workflows. It consumes SDK schemas and Release Index metadata. Its Graph Review workspace reads generated `.echo/content-graph/` sidecars and reports graph evidence counts, validation issues, and Hytale blockers.

Developer Studio app update checks first resolve the canonical Release Index product entry `echo-developer-studio` from the alpha launcher channel. Legacy GitHub updater feeds are compatibility fallback only.

### ECHO Studio

`ECHO-Addons-Studio` currently contains ECHO Studio, the creator and developer workspace for building experiences, addons, modules, local dev workspaces, validation runs, release assets, and publishing handoffs.

It owns:

- Electron app source and packaging.
- Authoring workflows.
- Local Gradle tooling.
- Release policy docs.
- Update feed settings.
- Release Index handoff generation.
- Internal project Content Graph visualizer.
- Generated addon packages and handoff sidecars.

Its compatibility product key in the Release Index is `echo-addons-studio`, while the installed product name and UI are ECHO Studio.

### Mobile Studio

`ECHO-Studio-Mobile` is the mobile Studio app and shared mobile package repo. Its agent note is explicit that Expo docs must be read at the exact versioned URL for Expo `v56.0.0` before code changes.

### Command Center

`ECHO-COMMAND-CENTER` is a private read-first release cockpit prototype. It is intended to become a standalone desktop app for seeing the whole ECHO product universe, scanning local repository state, preparing release trains, and eventually promoting guarded updates.

Current posture:

- It is read-first and intentionally incomplete.
- It can inspect local repos, visualize platform state, and document release train roadmaps.
- It must not own other repositories' artifacts.
- It must not mutate Git, GitHub releases, channel files, trust metadata, or release assets until the guarded command surface is explicitly implemented.

Current capabilities include universe scanning, product inventory from generated Release Index context, read-only local repo scans, dirty-file routing, release candidate evidence bundles, release train planning, command allowlist classification, settings/path diagnostics, scanner event panels, and graph evidence surfacing.

## Experience Families

Each first-party experience has three edition repos: Native, NeoForge, and Standalone. Each edition repo owns its pack manifest and lane evidence. The canonical gameplay/source module generally lives in `ECHO-Modules` as a protocol module.

### Ashfall

Ashfall is the volcanic survival pressure experience.

Ashfall owns:

- storms
- heat
- ash exposure
- scarcity
- shelters
- filtration
- atmospheric scrubbers
- distillation
- black rain
- Ashfall-specific hazards

Edition lanes:

| Lane | Repo | Artifact Family | Current Channel | Current Posture |
| --- | --- | --- | --- | --- |
| Native | `ECHO-Ashfall-Native-Edition` | `.echo-addon` | alpha | Warning-gated until real pack assets replace historical placeholder outputs and required release evidence passes |
| NeoForge | `ECHO-Ashfall-NeoForge-Edition` | `-neoforge.jar` | alpha | Warning-gated in modpack catalog; pack manifest declares module requirements |
| Standalone | `ECHO-Ashfall-Standalone-Edition` | `-standalone.jar` | experimental | Warning-gated in modpack catalog; standalone lane remains experimental |

Ashfall promotion requires checksum-backed pack artifacts, compiled runtime module artifacts, launcher install/update/repair/rollback evidence, diagnostics export proof, and gameplay smoke evidence. The Native Platform product is not a pack substitute.

### Openlands

Openlands is the calm exploration, homesteading, road, waystone, and route-binding experience.

Openlands owns:

- calm exploration
- homesteading
- old roads
- waystones
- map table
- regional rubbings
- route bindings
- Openlands biomes

Edition lanes:

| Lane | Repo | Artifact Family | Current Channel | Current Posture |
| --- | --- | --- | --- | --- |
| Native | `ECHO-Openlands-Native-Edition` | `.echo-addon` | alpha | Uses `echoopenlandsprotocol` as source of truth; requires real gameplay evidence before gameplay-ready promotion |
| NeoForge | `ECHO-Openlands-NeoForge-Edition` | `-neoforge.jar` | alpha | Adapts ECHO IDs into NeoForge behavior without making Minecraft content the design source |
| Standalone | `ECHO-Openlands-Standalone-Edition` | `-standalone.jar` | experimental | Proves Openlands can exist without Minecraft or NeoForge; preview-only until real runtime/gameplay evidence passes |

Openlands runtime evidence must come from the shared load plan in `echoopenlandsprotocol`, and gameplay promotion is blocked until the Release Index has accepted Openlands evidence across lanes.

### Arcana Division

Arcana Division is the magical research, ritual, and anomaly-containment experience.

Arcana Division owns:

- magical research
- rituals
- familiars
- curses
- rifts
- anomaly containment
- Arcana stations
- Arcana creatures
- Arcana loot rules

Edition lanes:

| Lane | Repo | Artifact Family | Current Channel | Current Posture |
| --- | --- | --- | --- | --- |
| Native | `ECHO-Arcana-Division-Native-Edition` | `.echo-addon` | beta | Launcher-installable beta lane; gameplay-ready promotion still requires real lane evidence |
| NeoForge | `ECHO-Arcana-Division-NeoForge-Edition` | `-neoforge.jar` | beta | Launcher-installable beta lane; also has a product entry in Release Index |
| Standalone | `ECHO-Arcana-Division-Standalone-Edition` | `-standalone.jar` | beta | Launcher-installable beta lane; gameplay-ready promotion still requires real lane evidence |

Arcana Division gameplay docs explicitly say install, content graph, and runtime load evidence are insufficient for gameplay-ready promotion.

### Sky Relay

Sky Relay is Official ECHO Pack 3 and uses `echoskyrelayprotocol` as its canonical content source.

Sky Relay owns:

- relay and fragment content
- fragment anchoring
- sky route progression
- Signal Crown completion
- weather, power, and recovery integrations
- lane-specific runtime proof for relay behavior

Edition lanes:

| Lane | Repo | Artifact Family | Current Channel | Current Posture |
| --- | --- | --- | --- | --- |
| Native | `ECHO-Sky-Relay-Native-Edition` | `.echo-addon` | alpha | Requires real Native runtime evidence for fragment anchoring, integrations, and playthrough routes |
| NeoForge | `ECHO-Sky-Relay-NeoForge-Edition` | `-neoforge.jar` | alpha | Requires real NeoForge runtime evidence for registration, fragment anchoring, weather/power behavior, save/load, and routes |
| Standalone | `ECHO-Sky-Relay-Standalone-Edition` | `-standalone.jar` | alpha | Requires real Standalone runtime evidence for loading data, rendering relay experience, saving fragment state, and routes |

All Sky Relay lanes require real gameplay captures before gameplay-ready promotion.

### Galactic Survey

Galactic Survey uses `echogalacticsurveyprotocol` as the canonical content source.

Galactic Survey owns:

- survey networks
- probe launch state
- HoloMap routing
- orbital salvage
- catalog progression
- fuel route planning
- remote depots
- Survey Array completion

Edition lanes:

| Lane | Repo | Artifact Family | Current Channel | Current Posture |
| --- | --- | --- | --- | --- |
| Native | `ECHO-Galactic-Survey-Native-Edition` | `.echo-addon` | alpha | Public prerelease pack flow with real launcher handoff evidence; first-launch/open-play and gameplay evidence remain promotion gates |
| NeoForge | `ECHO-Galactic-Survey-NeoForge-Edition` | `-neoforge.jar` | alpha | Requires real runtime and gameplay evidence for survey network loading and playthrough goals |
| Standalone | `ECHO-Galactic-Survey-Standalone-Edition` | `-standalone.jar` | alpha | Requires real standalone runtime and gameplay evidence for survey systems and Survey Array completion |

Galactic Survey has the most detailed public-alpha gate tooling in the Release Index. Draft/prerelease upload, download-back, pack smoke, Electron UI smoke, real `.minecraft` handoff preparation, and first-launch capture tooling are separate stages. Prepare-only handoff evidence is prerequisite launcher evidence, not gameplay/open-play proof.

## Release Evidence Model

ECHO release readiness is deliberately split into evidence layers:

1. Source and artifact evidence - source repos build artifacts, publish release assets, checksums, and release manifests.
2. Catalog evidence - Release Index records exact artifact URLs, SHA-256 values, sizes, dependencies, compatibility, trust, validation, and channel routes.
3. Attestation evidence - higher trust tiers require provenance and attestation metadata.
4. Launcher lifecycle evidence - install, update, repair, rollback, diagnostics export, and profile handoff.
5. Runtime evidence - target runtime loads modules and reports lane-specific behavior.
6. Content graph evidence - graph counts, validation, features, export plans, and diagnostics.
7. Gameplay evidence - real user-visible proof from gameplay sessions, including screenshots, logs, notes, save snapshots, support bundles, and artifact identity.

Only the last layer can prove gameplay readiness. Earlier layers can be green while gameplay remains blocked.

### Gameplay Acceptance

The cross-platform public-alpha gameplay gate is:

```text
ECHO-Release-Index/release-readiness/gameplay-acceptance-matrix.json
```

Its schema is:

```text
echo.gameplay.acceptance.v1
```

The matrix covers Ashfall, Sky Relay, Galactic Survey, Openlands, and Arcana Division across Native, NeoForge, and Standalone lanes. It is intentionally separate from content graph evidence and install/runtime load gates.

A release-ready lane must point at non-empty local gameplay evidence JSON plus non-empty notes/supporting files, screenshots, logs, and save snapshots. Boolean gameplay claims without local proof remain blocked even when a source report marks the claim true.

### Computer Use Gameplay Capture

Computer Use capture attempts can record UI/gameplay checks such as:

- HUD visible
- inventory Index visible
- Terminal visible
- HoloMap visible
- Lens visible
- creative-tab checks
- save/reload
- no-crash review

These attempts are blocker/provenance evidence only unless their captured files are imported through the owning family or edition evidence tooling and accepted by the gameplay gate.

## Channels And Routing

The launcher channel file at `channels/alpha/launcher-channel.json` currently lists 15 pack lanes. It also points at release manifest and catalog URLs used by launcher and website surfaces.

### User-Friendly Routing

When you are not sure where a change belongs, start from the thing the user would notice.

If a player cannot install, update, repair, roll back, open diagnostics, or follow an `echo://` link, start in `ECHO-Launcher`. If the launcher is reading bad metadata, then move to `ECHO-Release-Index`.

If a download page, public docs page, product directory, or website install button is wrong, start in `ECHO-Platform-Website`. If the website is faithfully showing bad catalog data, move to `ECHO-Release-Index`.

If a catalog row has the wrong version, trust tier, channel, artifact URL, checksum, dependency, compatibility value, or validation state, start in `ECHO-Release-Index`.

If a module artifact is missing, has the wrong descriptor, lacks content graph files, has bad runtime jars, or needs a new module contract, start in `ECHO-Modules`.

If a schema, template, creator contract, SDK guide, Native SDK jar, or validation tool is wrong, start in `ECHO-SDK`.

If Native loading, Native contracts, native diagnostics, or Native Loader behavior is wrong, start in `ECHO-Native-Platform`.

If the standalone runtime shell, standalone loading, standalone graph smoke, or standalone runtime archive is wrong, start in `ECHO-Standalone-Runtime`.

If a specific pack has the wrong modules, assets, pack manifest, install docs, runtime evidence, or gameplay evidence, start in that pack edition repo. For example, use `ECHO-Galactic-Survey-Native-Edition` for Galactic Survey Native pack work, then move to `ECHO-Modules` only if the shared module content or artifacts are wrong.

If the issue is "is this safe to promote?", start in `ECHO-Release-Index`, then inspect the referenced evidence files and source repos. Promotion is a cross-repo decision, but evidence is still owned by the source repo that produced it.

### Common Mistakes To Avoid

Do not patch the Release Index to hide a source repo problem. The index should describe reality, not manufacture it.

Do not patch a pack repo to duplicate shared Foundation behavior. If the content is shared survival, shared materials, shared tools, common loot, spawn safety, or first-hour survival, it belongs in Foundation modules.

Do not treat a passing content graph as proof the pack is fun, visible, stable, or playable. Content graph evidence says the content can be inspected and reasoned about across runtimes.

Do not treat a successful install as proof of gameplay readiness. Install success says the launcher could place files and verify checksums.

Do not treat Hytale export plans as supported Hytale runtime output. They are planning notes until a real adapter/codegen and validation gate exist.

Do not move binaries into `ECHO-Release-Index`. Binary assets belong to source repo GitHub Releases.

Do not hand-edit generated context files. Update source docs or context config, then regenerate.

The broad routing rule is:

| Task Area | Start In |
| --- | --- |
| Release catalog, channels, trust, blocks, public alpha index, artifact routing | `ECHO-Release-Index` |
| First-party module source, module graph, Foundation architecture, module release manifests | `ECHO-Modules` |
| Shared schemas, templates, creator contracts, SDK examples | `ECHO-SDK` |
| Launcher install, update, repair, rollback, deep links | `ECHO-Launcher` |
| Native runtime, loader, PackOS integration, native diagnostics | `ECHO-Native-Platform` |
| Standalone runtime shell and standalone runtime modules | `ECHO-Standalone-Runtime` |
| Public website, directory pages, download pages, indexed deep-link UI | `ECHO-Platform-Website` |
| First-party developer tooling app | `ECHO-Developer-Studio` |
| Third-party creator authoring and packaging app | `ECHO-Addons-Studio` |
| Release cockpit, scanner dashboard, visual universe map, guarded command surface | `ECHO-COMMAND-CENTER` |
| Mobile Studio app | `ECHO-Studio-Mobile` |
| Ashfall pack work | relevant `ECHO-Ashfall-*` edition repo first, then `ECHO-Modules` |
| Openlands pack work | relevant `ECHO-Openlands-*` edition repo first, then `ECHO-Modules` |
| Arcana Division pack work | relevant `ECHO-Arcana-Division-*` edition repo first, then `ECHO-Modules` |
| Sky Relay pack work | relevant `ECHO-Sky-Relay-*` edition repo first, then `ECHO-Modules` |
| Galactic Survey pack work | relevant `ECHO-Galactic-Survey-*` edition repo first, then `ECHO-Modules` |

## Common Commands

Release Index:

```text
node scripts/generate-codex-context.mjs --check
node scripts/generate-codex-context.mjs --write
node scripts/docs-audit.mjs
node scripts/validate-index.mjs --strict
node scripts/verify-content-graph-release-proof.mjs
node scripts/verify-artifact-urls.mjs
node scripts/sync-launcher-channel-catalog.mjs --check
node scripts/sync-public-alpha-index.mjs --check
```

Modules:

```text
node scripts/generate-module-release.mjs --module <module-id>
node scripts/verify-module-release.mjs --release-dir dist/echo-module-release
node scripts/generate-content-graph.mjs --all --write
node scripts/validate-content-graph.mjs --strict --sdk-root ..\ECHO-SDK
node scripts/validate-module-graph.mjs
node scripts/validate-foundations-split.mjs
node scripts/validate-platform-roadmap.mjs
```

SDK:

```text
python tools/echo_sdk.py validate templates --json
python tools/validate_echo_contracts.py --json
python tools/test_echo_contract_schemas.py --json
node scripts/stage-native-sdk-rc1-release.mjs --clean --require-complete
```

Launcher:

```text
npm run test:e2e:release-index
npm run test:e2e:galactic-survey-electron-ui
npm run package:win
```

Native Platform:

```text
.\gradlew.bat check packageNativePlatformLayout packagePublicAlphaRelease
node scripts/generate-ashfall-native-code-gate.mjs
node scripts/generate-ashfall-native-public-beta-evidence.mjs
node scripts/generate-ashfall-gameplay-qa-evidence.mjs
```

Standalone Runtime:

```text
.\gradlew.bat build
.\gradlew.bat packagePublicAlphaRelease
.\gradlew.bat runStandaloneContentGraphLoadSmoke -PechoModulesRepoRoot=..\ECHO-Modules
```

## Practical Operating Rules

- Before broad ECHO work, read `docs/codex/generated/ECHO_PLATFORM_CONTEXT.md`.
- If the generated context is missing or stale, run `node scripts/generate-codex-context.mjs --write` from `ECHO-Release-Index`.
- Use `docs/codex/repo-routing.md` to choose the owning repo.
- Before editing, read the owning repo's `AGENTS.md`, `README.md`, and task-relevant canonical docs.
- Do not edit generated context files by hand.
- Do not use Release Index catalog approval as a substitute for source repo evidence.
- Do not treat content graph evidence as gameplay evidence.
- Do not treat Hytale export-plan statuses as Hytale runtime support.
- Keep pack content in edition repos, module content in `ECHO-Modules`, runtime binaries in runtime repos, and channel/trust routing in `ECHO-Release-Index`.
- When a task crosses ownership boundaries, start in `ECHO-Release-Index`, then inspect the named source repos directly.

## Status Vocabulary

Use these words carefully in docs, issues, release notes, and PR summaries.

`cataloged` means an entry exists in the Release Index or a channel file.

`approved` means the catalog validation field permits the row according to current index rules. It does not automatically mean the experience is gameplay-ready.

`warning` means the row is intentionally visible or installable in some contexts, but still has a known gate. For Ashfall, warning-gated rows are especially about gameplay/release-readiness evidence.

`source-linked` means source repository and release metadata are linked and basically verified. It is lower trust than provenance-attested release bytes.

`provenance-attested` means the indexed artifact set has matching build provenance/attestation evidence.

`installable` means the launcher can plausibly fetch and place the artifacts. It does not mean the runtime proves gameplay.

`runtime-gated` means a runtime-specific smoke or load path has evidence. It does not mean a player completed a real session.

`content-graph evidence` means graph files were generated, published, indexed, and/or consumed. It is excellent for inspection and diagnostics, but it is not play evidence.

`transport evidence` means install/update/repair/rollback/handoff style evidence. It shows the delivery path works.

`gameplay evidence` means a real lane-specific session produced accepted notes, screenshots, logs, saves, support files, and artifact identity.

`strictReady` means the relevant reducer believes all required gates are satisfied. In the current gameplay matrix, `strictReady` is false.

`blocked` means a gate is deliberately fail-closed. A blocked gate should be named plainly instead of softened into "pending" when it is preventing promotion.

## Human Workflows

These workflows describe how a person should move through the platform without getting lost.

### To Add Or Fix A Module

Start in `ECHO-Modules`.

Read the module README, descriptor, generated docs index, compatibility matrix, and content graph docs. Make the source change there. Regenerate descriptors, docs, and content graph files if the change affects contracts or content. Build the runtime artifacts. Verify the module release before importing it into the Release Index.

Only after the module artifacts exist should the Release Index be changed. The index should record the artifact truth, not predict it.

### To Fix A Pack Lane

Start in the exact edition repo.

A Native pack consumes `.echo-addon` files. A NeoForge pack consumes `-neoforge.jar` files. A Standalone pack consumes `-standalone.jar` files. Check the pack manifest, module requirements, install docs, update flow, runtime evidence, and gameplay evidence. If the module set is wrong because a shared module is wrong, move to `ECHO-Modules`.

When the edition repo has correct artifacts and evidence, update or verify the matching Release Index `packs/` and `modpacks/` rows.

### To Promote A Release

Start in `ECHO-Release-Index`.

Read the relevant readiness reducer output first. Then trace each evidence pointer back to the owning source repo. Promotion should require exact artifacts, checksums, catalog state, trust policy, launcher lifecycle proof, runtime proof where relevant, and gameplay proof when the promotion claims playability.

If gameplay proof is missing, the release can still be installable or warning-gated, but it should not be described as gameplay-ready.

### To Fix Launcher Behavior

Start in `ECHO-Launcher`.

Check whether the launcher behavior is wrong or whether it is faithfully consuming bad catalog data. If the UI, IPC handler, installer, repair path, rollback path, diagnostics export, or deep-link handling is wrong, keep the fix in Launcher. If the data is wrong, update Release Index or the source artifact owner.

### To Fix Website Behavior

Start in `ECHO-Platform-Website`.

If the page is rendering or routing incorrectly, fix the website. If a download link or status is wrong because the catalog is wrong, fix the Release Index. If the website is asking for an artifact that does not exist, fix the source repo release process first.

### To Fix Native Runtime Behavior

Start in `ECHO-Native-Platform`.

Native runtime problems include Native Loader behavior, bootstrap contracts, diagnostics, direct loader install metadata, native content graph planning, and native platform packaging. Pack content and module jars do not belong here.

### To Fix Standalone Runtime Behavior

Start in `ECHO-Standalone-Runtime`.

Standalone runtime problems include runtime shell behavior, standalone module loading, standalone graph loading, runtime archives, and standalone compatibility. Pack content still belongs in the edition repo.

### To Fix Creator Tooling

Start in `ECHO-SDK` if the problem is schemas, templates, validation, Native SDK artifacts, or creator docs.

Start in `ECHO-Addons-Studio` if the problem is the creator desktop workflow, local Gradle workspace generation, release draft handoff, or authoring UI.

Start in `ECHO-Developer-Studio` if the problem is first-party module/platform developer workflows.

Start in `ECHO-Studio-Mobile` only after reading the exact Expo versioned docs required by that repo's `AGENTS.md`.

## Source Documents Used

This overview was derived from:

- `ECHO-Release-Index/docs/codex/generated/ECHO_PLATFORM_CONTEXT.md`
- `ECHO-Release-Index/docs/codex/repo-routing.md`
- `ECHO-Release-Index/README.md`
- `ECHO-Release-Index/docs/ecosystem-artifact-ownership.md`
- `ECHO-Release-Index/docs/codex/platform-primer.md`
- `ECHO-Release-Index/channels/alpha/release-manifest.json`
- `ECHO-Release-Index/channels/alpha/launcher-channel.json`
- `ECHO-Release-Index/trust/tiers.json`
- `ECHO-Modules/README.md`
- `ECHO-Modules/docs/ECHO_PLATFORM_ROADMAP.md`
- `ECHO-Modules/docs/echo-foundations-architecture.md`
- `ECHO-Modules/docs/module-docs-index.md`
- `ECHO-Modules/docs/content-graph.md`
- `ECHO-SDK/README.md`
- `ECHO-SDK/docs/schemas/index.md`
- `ECHO-SDK/docs/schemas/content-graph.md`
- `ECHO-Launcher/README.md`
- `ECHO-Native-Platform/README.md`
- `ECHO-Standalone-Runtime/README.md`
- `ECHO-Platform-Website/README.md`
- `ECHO-Developer-Studio/README.md`
- `ECHO-Addons-Studio/README.md`
- `ECHO-COMMAND-CENTER/README.md`
- `ECHO-Studio-Mobile/AGENTS.md`
- first-party edition repo `README.md`, `docs/module-requirements.md`, `docs/runtime-evidence.md`, and `docs/gameplay-evidence.md` files where present
