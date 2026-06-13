# ECHO Prompt Preamble

Use this before an ECHO task when you want to manually front-load platform context.

```text
You are working on the ECHO platform.
Start from the local ECHO repo root: C:\Development\Github
Use ECHO-Release-Index as the canonical cross-repo context hub: C:\Development\Github\ECHO-Release-Index
Before broad cross-platform work, read ECHO-Release-Index/docs/codex/generated/ECHO_PLATFORM_CONTEXT.md.
Use ECHO-Release-Index/docs/codex/repo-routing.md to choose the owning repo.
Then inspect only the task-relevant AGENTS.md, README.md, canonical docs, source files, schemas, and tests.
Do not assume this context replaces direct file inspection for edits, tests, reviews, or release work.
Keep AGENTS.md files small; put durable platform knowledge in ECHO-Release-Index/docs/codex and regenerate the context packet when sources change.
```

## Configured Repositories

- `ECHO-Release-Index`: Canonical catalog, channel, trust, block, release routing, and cross-repo Codex context source.
- `ECHO-Modules`: First-party module source, module graph, Foundation architecture, platform roadmap, and module release artifacts.
- `ECHO-SDK`: Shared schemas, templates, validation tools, examples, and creator-facing contract docs.
- `ECHO-Launcher`: Desktop launcher, install/update/repair/rollback flows, launcher updater metadata, and deep-link handling.
- `ECHO-Native-Platform`: Native runtime, loader, contracts, diagnostics, and PackOS integration assets.
- `ECHO-Standalone-Runtime`: Standalone runtime shell and standalone runtime modules.
- `ECHO-Platform-Website`: Public website, directory pages, download pages, and indexed echo:// install/update UI.
- `ECHO-Developer-Studio`: First-party developer tooling desktop app.
- `ECHO-Addons-Studio`: Third-party addon authoring, packaging, SDK validation, and release draft tooling.
- `ECHO-COMMAND-CENTER`: Private read-first release cockpit, scanner, visual universe map, release train planner, and future guarded command surface.
- `ECHO-Studio-Mobile`: Mobile Studio app and shared mobile packages.
- `ECHO-Ashfall-Native-Edition`: Ashfall Native Edition pack manifest, assets, install docs, and native release readiness evidence.
- `ECHO-Ashfall-NeoForge-Edition`: Ashfall NeoForge Edition pack manifest, assets, install docs, and update flow.
- `ECHO-Ashfall-Standalone-Edition`: Ashfall Standalone Edition pack manifest, assets, install docs, and experimental standalone lane metadata.
- `ECHO-Openlands-Native-Edition`: Openlands Native Edition pack manifest, assets, install docs, and runtime evidence.
- `ECHO-Openlands-NeoForge-Edition`: Openlands NeoForge Edition pack manifest, assets, install docs, and runtime evidence.
- `ECHO-Openlands-Standalone-Edition`: Openlands Standalone Edition pack manifest, assets, install docs, and runtime evidence.
- `ECHO-Arcana-Division-Native-Edition`: Arcana Division Native Edition pack manifest and assets.
- `ECHO-Arcana-Division-NeoForge-Edition`: Arcana Division NeoForge Edition pack manifest and assets.
- `ECHO-Arcana-Division-Standalone-Edition`: Arcana Division Standalone Edition pack manifest and assets.
- `ECHO-Sky-Relay-Native-Edition`: Sky Relay Native Edition pack manifest, assets, runtime evidence, and gameplay QA evidence.
- `ECHO-Sky-Relay-NeoForge-Edition`: Sky Relay NeoForge Edition pack manifest, assets, runtime evidence, and gameplay QA evidence.
- `ECHO-Sky-Relay-Standalone-Edition`: Sky Relay Standalone Edition pack manifest, assets, runtime evidence, and gameplay QA evidence.
- `ECHO-Galactic-Survey-Native-Edition`: Galactic Survey Native Edition pack manifest, gameplay QA evidence, and native release readiness.
- `ECHO-Galactic-Survey-NeoForge-Edition`: Galactic Survey NeoForge Edition pack manifest, gameplay QA evidence, and NeoForge release readiness.
- `ECHO-Galactic-Survey-Standalone-Edition`: Galactic Survey Standalone Edition pack manifest, gameplay QA evidence, and standalone release readiness.
