# ECHO Platform Primer

ECHO is a multi-repository platform for first-party experiences, modules, runtimes, launcher distribution, creator tooling, and public release metadata.

## Core Rules

- `ECHO-Release-Index` owns catalog records, trust policy, channel routing, public index metadata, and cross-repo Codex orientation.
- Source repositories own their binaries, source code, release assets, runtime contracts, and product-specific implementation.
- `ECHO-Modules` owns first-party module source and the platform roadmap. Its Foundation modules define the shared survival/content backbone.
- `ECHO-SDK` owns shared schemas, templates, local validation tools, and creator-facing contract documentation.
- Experience repositories own pack manifests, pack assets, and edition-specific release work for their experience lane.
- Studio and launcher repositories own their applications and update artifacts.

## Architecture Baseline

Foundations owns baseline survival. Experience modules consume Foundation contracts and may extend them, but they must not re-own shared materials, tools, starter stations, starter loot, spawn safety, first-hour survival, or shared creature roles.

Experience modules depend on Foundation modules. Experience modules do not depend on each other.

## Release Boundary

The Release Index does not own binaries. It points clients at approved source-repo artifacts and records exact URLs, checksums, compatibility, dependencies, validation state, and trust tier.

Public alpha entries may remain `source-linked` while GitHub release assets are exact and approved but not yet attested. Strict validation reserves higher trust tiers for entries that include the required provenance and attestation metadata.

## Codex Operating Rule

Use this context system to avoid broad rediscovery. Still inspect task-relevant files directly before editing, testing, reviewing, or publishing changes.
