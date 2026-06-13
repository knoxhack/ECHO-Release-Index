# ECHO Native Platform RC1 Handoff

## Current State

`echo-native-platform` is indexed as `1.0.0-RC1` and remains warning-gated.

Local artifact evidence exists:

- Artifact: `C:/Development/Github/ECHO-Native-Platform/build/public-alpha/echo-native-product-1.0.0-RC1.zip`
- Size: `60744144`
- SHA-256: `16b96ea676d7f64f84653f1d08d89ba03eddb4a08eed9698fac51637801b8e45`
- Native Platform commit: `d2a0536de2e2d4d13e02c8574e906f6013724d8b`
- SDK proof commit: `ec0d9b83b695309ef895c8e591ec41bf84336211`
- Module proof commit: `7f452ce44db8628ca0724f0e5b94f252ffa5bb1a`

The local external addon proof generated, built, packaged, and loaded a `.echo-addon` through Native release mode. That proves the developer export path, but it does not prove public distribution.

## Approval Boundary

Do not approve stable `1.0.0` and do not remove warning validation until all of these are real, current, and attached to Release Index evidence:

- GitHub release `v1.0.0-RC1` contains the product ZIP and sidecars.
- Download-back smoke verifies SHA-256, size, and archive layout from GitHub bytes.
- Signing or attestation policy is satisfied.
- Launcher install, first launch, diagnostics export, repair, and rollback pass.
- At least one Native pack gameplay smoke passes from the published runtime.
- Public SDK artifacts have main, source, and Javadoc jars.
- Stable-target catalog metadata has no `warning`, `blocked`, `alpha`, or `source-linked` release blocker.

## Mutation Truth

The current Native release contract is typed-host-receipt based:

- `MUTATED` requires an `EchoNativeMutationReceipt` returned by a typed host service.
- Descriptor metadata, diagnostic maps, legacy `activateNative(Map)`, and addon-created receipts do not prove mutation.
- Release mode rejects dev classpath fallback and inferred classpath tokens.

## Related Evidence

- `products/native-platform.json`
- `release-readiness/galactic-survey-edition-pack-assets.json`
- `release-readiness/galactic-survey-edition-pack-smoke.json`
- `release-readiness/galactic-survey-public-alpha-readiness.json`
- `../ECHO-Native-Platform/docs/echo/native/RELEASE_CANDIDATE_CHECKLIST.md`
