# ECHO Artifact Ownership

The Release Index owns catalog records, trust policy, and channel routing. It does not own binary release assets. Each source repository publishes its own artifacts, then the Release Index records the approved artifact URLs, SHA-256 hashes, trust tier, validation state, dependencies, and compatibility targets.

| Repository | Owns | Release Index responsibility |
| --- | --- | --- |
| `knoxhack/ECHO-Launcher` | Desktop launcher installers, updater metadata, and launcher release notes. | `products/launcher.json` routes launcher self-updates through exact installer, blockmap, executable, and `latest.yml` records. |
| `knoxhack/ECHO-Modules` | First-party module source plus `.echo-addon`, `-neoforge.jar`, `-standalone.jar`, `-sources.jar`, per-module `.echo/content-graph/` release assets, release-root `content-graph-evidence.json`, and per-host `runtime-conformance.json` artifacts. | `modules/*.json` records imported module artifacts, dependency edges, trust, validation, pack compatibility, the `content-graph-evidence` role, and `runtimeConformanceEvidence` required for `playerReady` promotion. |
| `knoxhack/ECHO-Ashfall-Native-Edition` | Native Edition pack manifest and pack assets. | `modpacks/ashfall-native.json` routes Native Edition installs and updates through the approved pack manifest and archive records. |
| `knoxhack/ECHO-Ashfall-NeoForge-Edition` | NeoForge Edition pack manifest and pack assets. | `modpacks/ashfall-neoforge.json` routes NeoForge Edition installs and updates through the approved pack manifest and archive records. |
| `knoxhack/ECHO-Ashfall-Standalone-Edition` | Standalone Edition pack manifest and pack assets. | `modpacks/ashfall-standalone.json` routes Standalone Edition installs and updates through indexed pack metadata while the standalone lane remains experimental. |
| `knoxhack/ECHO-Galactic-Survey-Native-Edition` | Galactic Survey Native Edition pack manifest, gameplay evidence, and public prerelease pack assets. | `packs/galactic-survey-native-edition.json` records the Native lane and keeps it blocked until real gameplay evidence exists, even after committed sources, GitHub Release artifacts, and launcher lifecycle evidence pass. |
| `knoxhack/ECHO-Galactic-Survey-NeoForge-Edition` | Galactic Survey NeoForge Edition pack manifest, gameplay evidence, and public prerelease pack assets. | `packs/galactic-survey-neoforge-edition.json` records the NeoForge lane and keeps it blocked until real gameplay evidence exists, even after committed sources, GitHub Release artifacts, and launcher lifecycle evidence pass. |
| `knoxhack/ECHO-Galactic-Survey-Standalone-Edition` | Galactic Survey Standalone Edition pack manifest, gameplay evidence, and public prerelease pack assets. | `packs/galactic-survey-standalone-edition.json` records the Standalone lane and keeps it blocked until real gameplay evidence exists, even after committed sources, GitHub Release artifacts, and launcher lifecycle evidence pass. |
| `knoxhack/ECHO-Native-Platform` | Native runtime, loader, contracts, diagnostics, PackOS integration assets, and native host runtime conformance evidence. | `products/native-platform.json` records loader/runtime artifacts only; pack compatibility and modules stay in pack-owned catalog entries. |
| `knoxhack/ECHO-Standalone-Runtime` | Standalone runtime shell and runtime modules. | `products/standalone-runtime.json` records standalone runtime artifacts and compatibility with `ashfall-standalone-edition`. |
| `knoxhack/ECHO-Addons-Studio` | Third-party addon authoring, packaging, SDK validation, and release draft tooling. | `products/addons-studio.json` routes Addons Studio updates and its publishing workflow uses the final addon package contract. |
| `knoxhack/ECHO-Developer-Studio` | First-party developer tooling app. | `products/developer-studio.json` routes Developer Studio updates through indexed updater artifacts. |
| `knoxhack/ECHO-Platform-Website` | Public website, directory pages, download pages, and deep-link UI. | Website pages consume `channels/alpha/launcher-channel.json` and emit `echo://` install/update links only for approved indexed entries. |
| `knoxhack/ECHO-SDK` | Shared schemas, templates, local validation tools, and contract documentation, including canonical `.ECHO Content Graph`, player surface, and runtime conformance schemas. | SDK schemas mirror Release Index schemas so creators and CI can validate package, pack, publisher, trust, block, product, module-release, content-graph, and runtime-conformance records before publishing. |

## Catalog Ownership

| Catalog path | Owner | Purpose |
| --- | --- | --- |
| `products/` | Release Index | Launcher, studio, runtime, platform, and website update entries. |
| `modpacks/` | Release Index | Pack install/update entries for Ashfall editions. |
| `modules/` | Release Index | First-party module entries imported from `ECHO-Modules` release manifests. |
| `addons/` | Release Index | Third-party addon entries approved through ingestion. |
| `publishers/` | Release Index | Publisher identity and trust bootstrap records. |
| `channels/` | Release Index | Public channel descriptors and launcher catalog URLs. |
| `trust/` | Release Index | Trust tiers and playable/non-playable policy. |
| `blocks/` | Release Index | Publisher, entry, version, dependency, and artifact blocks. |
| `schemas/` | Release Index and SDK | Canonical JSON Schemas used by index validation and creator tooling. |
