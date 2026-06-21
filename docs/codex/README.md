# ECHO Codex Context

This folder is the central orientation layer for Codex work across the ECHO platform.

## Read Order

1. `generated/ECHO_PLATFORM_CONTEXT.md` for the current cross-repo snapshot.
2. `repo-routing.md` to decide which repository owns the requested change.
3. `platform-primer.md` for stable platform boundaries and terms.
4. `unified-echo-native-player-runtime-goal.md` for the active 10-phase ECHO Native player runtime cutover.
5. `maintenance.md` before changing this context system.

## Generated Outputs

Run the generator from the repository root:

```text
node scripts/generate-codex-context.mjs --write
node scripts/generate-codex-context.mjs --check
```

The generated files are committed on purpose so Codex can read them immediately in future sessions.

## Source Inventory

`context-sources.json` lists the local ECHO repositories, canonical docs, read-first agent notes, and ownership roles that feed the generated context packet.
