# ECHO Release Index Agent Notes

This repository is the canonical cross-repo orientation point for ECHO platform work.

Before cross-platform ECHO changes, read `docs/codex/generated/ECHO_PLATFORM_CONTEXT.md`. If it is missing or stale, run:

```text
node scripts/generate-codex-context.mjs --write
```

Use `docs/codex/repo-routing.md` to choose which ECHO repo owns a change. Keep large platform knowledge in `docs/codex/` and generated context files; keep this `AGENTS.md` small.

Run these checks after editing release-index metadata or Codex context files:

```text
node scripts/generate-codex-context.mjs --check
node scripts/docs-audit.mjs
node scripts/validate-index.mjs --strict
```
