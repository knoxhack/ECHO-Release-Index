# ECHO Release Index Public Alpha

This repository is the machine-readable public alpha index for ECHO launcher updates, pack updates, release assets, checksums, and website download metadata.

The official ECHO website is the public download hub. This repo exists so products can read stable JSON manifests during alpha testing.

Generated files are written under:

- `channels/alpha/release-manifest.json`
- `channels/alpha/launcher-channel.json`
- `channels/alpha/repositories.json`
- `packs/ashfall-native-edition.json`
- `packs/standalone-runtime-showcase.json`

## Public Alpha Repo Layout

The public alpha is split by ownership so each product can release, update, and receive issues without mixing concerns.

| Repo | Owns |
| --- | --- |
| `ECHO-Release-Index-Public-Alpha` | Launcher channel JSON, pack update JSON, website download metadata, and release catalog metadata. |
| `ECHO-Native-Platform-Public-Alpha` | Native Platform source, Native Loader, PackOS, diagnostics, native contracts, and core platform release assets. |
| `ECHO-SDK-Public-Alpha` | SDK source, Gradle plugin, templates, samples, schemas, authoring tools, and addon developer docs. |
| `ECHO-Standalone-Runtime-Public-Alpha` | Standalone Runtime source, experimental showcase runtime, runtime modules, and standalone addon compatibility surface. |
| `ECHO-Modules-Public-Alpha` | Public addon module source and module release assets for Native, NeoForge, and Standalone targets. |
| `ECHO-Ashfall-Native-Edition-Public-Alpha` | Ashfall Native Edition pack metadata, pack assets, and launcher pack-update source. |
| `ECHO-Launcher-Public-Alpha` | Launcher source, installer releases, auto-update feed, and public alpha catalog integration. |
| `ECHO-Addons-Studio-Public-Alpha` | Addon creation app for Native and Standalone addons. |
| `ECHO-Developer-Studio-Public-Alpha` | Developer operations app for release validation, metadata checks, and publishing workflows. |
| `ECHO-Platform-Website-Public-Alpha` | Official website source and public download hub surface. |

The launcher should read `channels/alpha/launcher-channel.json`. The website should read `channels/alpha/release-manifest.json` and `channels/alpha/repositories.json`. The studios should read the release manifest plus the SDK and module repo entries.
