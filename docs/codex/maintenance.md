# ECHO Codex Context Maintenance

The context system has three layers:

1. Human-maintained docs in `docs/codex/`.
2. Source inventory in `docs/codex/context-sources.json`.
3. Generated packets in `docs/codex/generated/`.

## Updating Context

Update `context-sources.json` when adding, removing, renaming, or changing the role of an ECHO repository.

Update `platform-primer.md` or `repo-routing.md` when the platform architecture or ownership boundary changes.

After source changes, run:

```text
node scripts/generate-codex-context.mjs --write
node scripts/generate-codex-context.mjs --check
node scripts/docs-audit.mjs
node scripts/validate-index.mjs --strict
```

## Generated File Rules

- Do not hand-edit files under `docs/codex/generated/`.
- Keep generated context concise enough to load before a task.
- Prefer routing pointers and summaries over copying large source documents.
- Treat warnings in `context-index.json` as maintenance TODOs.

## Local Codex Layer

The local skill `C:\Users\knox\.codex\skills\echo-platform-context` points Codex at this folder. If this repository moves, update the local skill and global `C:\Users\knox\.codex\AGENTS.md`.
