# ECHO Repo Routing

Use this guide to choose the first repository to inspect for a task. If the task crosses ownership boundaries, start in `ECHO-Release-Index`, then inspect the owning source repos named by the catalog entry or context packet.

| Task area | Start here |
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
| Mobile Studio app | `ECHO-Studio-Mobile` |
| Ashfall pack work | `ECHO-Ashfall-*` edition repo first, then `ECHO-Modules` for shared modules |
| Openlands pack work | `ECHO-Openlands-*` edition repo first, then `ECHO-Modules` for shared modules |
| Arcana Division pack work | `ECHO-Arcana-Division-*` edition repo first, then `ECHO-Modules` for shared modules |
| Sky Relay pack work | `ECHO-Sky-Relay-*` edition repo first, then `ECHO-Modules` for shared modules |

## Edition Lanes

- Native Edition repos target the ECHO native platform lane.
- NeoForge Edition repos target Minecraft NeoForge module integration.
- Standalone Edition repos target the standalone runtime lane.

## When In Doubt

Read `generated/ECHO_PLATFORM_CONTEXT.md`, find the repo whose ownership role matches the task, then inspect that repo's `AGENTS.md`, `README.md`, and listed canonical docs before editing.
