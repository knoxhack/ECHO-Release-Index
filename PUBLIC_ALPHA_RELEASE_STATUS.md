# Release Index Status

ECHO Release Index is the canonical catalog, channel, trust, block, and release-routing hub for ECHO products.

The ECHO Native Platform entry is currently `1.0.0-RC1` and remains warning-gated. Local product artifact, local Native SDK main/source/Javadoc jars, external addon release-mode proof, GitHub upload/download-back, published asset attestation, attested Galactic Survey module assets, Galactic Survey public prerelease pack download-back, launcher install/update/repair/rollback evidence, packaged Electron UI install/update/repair evidence, packaged diagnostics/log export evidence, and isolated Minecraft Launcher handoff metadata evidence exist. Public approval still requires public SDK RC1 catalog artifacts with approved non-source-linked provenance, imported real packaged first-launch/open-play evidence, final catalog promotion, and real pack gameplay smoke proof.

First-launch/open-play intake now exists through `scripts/import-galactic-survey-first-launch-evidence.mjs`. It is only an evidence importer; the current readiness report remains blocked until a real capture bundle proves official launcher open/play, profile selection, logs, screenshots, support bundle export, and checksum match against the downloaded public prerelease pack ZIP.

Galactic Survey manual gameplay capture now has a generated Release Index work order through `scripts/generate-galactic-survey-manual-gameplay-work-order.mjs --write`. The current work order remains `OPEN`; it records the exact missing per-edition gameplay claims, release-gate evidence sources, notes, screenshots, client log, save ZIPs, artifact hash fields, and local verifier passes required before warning validation can be removed.

Native SDK RC1 artifact evidence now has a generated Release Index report through `scripts/verify-native-sdk-rc1-artifacts.mjs --write`. The current report is `BLOCKED`: all 15 local main/source/Javadoc jars exist for the five public SDK components, but none are yet represented as matching public catalog artifacts with approved non-source-linked provenance.

The public-alpha sync gate now refreshes only `alpha`, `experimental`, and legacy unchannelled catalog entries from `channels/alpha/release-manifest.json`; the Native Platform RC1 `beta` product entry remains governed by RC1 ingestion, attestation, download-back, launcher, and gameplay evidence.

Stable `1.0.0` catalog entries must not use `warning`, `blocked`, `alpha`, `source-linked`, source-packaged, or dev-fallback-backed evidence.
