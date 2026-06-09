# ECHO Artifact Ownership

The Release Index owns catalog records, trust policy, and channel routing. It does not own binary release assets. Each source repository publishes its own artifacts, then the Release Index records the approved artifact URLs, SHA-256 hashes, trust tier, validation state, dependencies, and compatibility targets.

| Repository | Owns | Release Index responsibility |
| --- | --- | --- |
| `knoxhack/ECHO-Launcher` | Desktop launcher installers, updater metadata, and launcher release notes. | `products/launcher.json` routes launcher self-updates through exact installer, blockmap, executable, and `latest.yml` records. |
| `knoxhack/ECHO-Modules` | First-party module source plus `.echo-addon`, `-neoforge.jar`, `-standalone.jar`, and `-sources.jar` release assets. | `modules/*.json` records imported module artifacts, dependency edges, trust, validation, and pack compatibility. |
| `knoxhack/ECHO-Ashfall-Native-Edition` | Native Edition pack manifest and pack assets. | `modpacks/ashfall-native.json` routes Native Edition installs and updates through the approved pack manifest and archive records. |
| `knoxhack/ECHO-Ashfall-NeoForge-Edition` | NeoForge Edition pack manifest and pack assets. | `modpacks/ashfall-neoforge.json` routes NeoForge Edition installs and updates through the approved pack manifest and archive records. |
| `knoxhack/ECHO-Ashfall-Standalone-Edition` | Standalone Edition pack manifest and pack assets. | `modpacks/ashfall-standalone.json` routes Standalone Edition installs and updates through indexed pack metadata while the standalone lane remains experimental. |
| `knoxhack/ECHO-Native-Platform` | Native runtime, loader, contracts, diagnostics, and PackOS integration assets. | `products/native-platform.json` records native runtime/product artifacts and compatibility with `ashfall-native-edition`. |
| `knoxhack/ECHO-Standalone-Runtime` | Standalone runtime shell and runtime modules. | `products/standalone-runtime.json` records standalone runtime artifacts and compatibility with `ashfall-standalone-edition`. |
| `knoxhack/ECHO-Addons-Studio` | Third-party addon authoring, packaging, SDK validation, and release draft tooling. | `products/addons-studio.json` routes Addons Studio updates and its publishing workflow uses the final addon package contract. |
| `knoxhack/ECHO-Developer-Studio` | First-party developer tooling app. | `products/developer-studio.json` routes Developer Studio updates through indexed updater artifacts. |
| `knoxhack/ECHO-Platform-Website` | Public website, directory pages, download pages, and deep-link UI. | Website pages consume `channels/alpha/launcher-channel.json` and emit `echo://` install/update links only for approved indexed entries. |
| `knoxhack/ECHO-SDK` | Shared schemas, templates, local validation tools, and contract documentation. | SDK schemas mirror Release Index schemas so creators and CI can validate package, pack, publisher, trust, block, product, and module-release records before publishing. |

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
