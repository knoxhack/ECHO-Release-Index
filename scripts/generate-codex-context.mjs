import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const releaseIndexRoot = path.resolve(scriptDir, "..");
const defaultConfigPath = path.join(releaseIndexRoot, "docs", "codex", "context-sources.json");
const outputDir = path.join(releaseIndexRoot, "docs", "codex", "generated");
const generatedFiles = {
  platformContext: path.join(outputDir, "ECHO_PLATFORM_CONTEXT.md"),
  promptPreamble: path.join(outputDir, "ECHO_PROMPT_PREAMBLE.md"),
  contextIndex: path.join(outputDir, "context-index.json"),
};

function parseArgs(argv) {
  const args = { mode: null, repoRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") args.mode = "write";
    else if (arg === "--check") args.mode = "check";
    else if (arg === "--repo-root") args.repoRoot = path.resolve(argv[++index]);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.mode) throw new Error("Use --write or --check.");
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate-codex-context.mjs --write [--repo-root C:\\Development\\Github]
  node scripts/generate-codex-context.mjs --check [--repo-root C:\\Development\\Github]`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function slash(value) {
  return value.replace(/\\/g, "/");
}

function localPath(repoRoot, repoName) {
  return path.join(repoRoot, repoName);
}

function relToReleaseIndex(filePath) {
  return slash(path.relative(releaseIndexRoot, filePath));
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function runRaw(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.replace(/\r?\n$/u, "");
}

function gitInfo(repoPath, repoName) {
  if (!exists(path.join(repoPath, ".git"))) {
    return {
      available: false,
      branch: null,
      commit: null,
      commitDate: null,
      dirty: false,
      dirtyFiles: [],
    };
  }

  const branch = run("git", ["branch", "--show-current"], repoPath) || run("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoPath);
  const commit = run("git", ["rev-parse", "--short=12", "HEAD"], repoPath);
  const commitDate = run("git", ["log", "-1", "--format=%cI"], repoPath);
  const statusText = runRaw("git", ["status", "--short"], repoPath) || "";
  const dirtyFiles = statusText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !isSelfContextStatus(repoName, line))
    .map((line) => slash(line));

  return {
    available: true,
    branch,
    commit,
    commitDate,
    dirty: dirtyFiles.length > 0,
    dirtyFiles,
  };
}

function isSelfContextStatus(repoName, statusLine) {
  if (repoName !== "ECHO-Release-Index") return false;
  const filePart = slash(statusLine.slice(3).trim().replace(/^"|"$/g, ""));
  return filePart === "AGENTS.md"
    || filePart === "README.md"
    || filePart === "scripts/generate-codex-context.mjs"
    || filePart.startsWith("docs/codex/");
}

function readTextSummary(filePath) {
  if (!exists(filePath)) return null;
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const heading = asciiSafe(lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim() || path.basename(filePath));
  const bodyLine = lines
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("```") && !line.startsWith("---"));

  return {
    bytes: Buffer.byteLength(text, "utf8"),
    heading,
    excerpt: compact(bodyLine || heading, 280),
  };
}

function compact(value, limit) {
  const squashed = asciiSafe(value).replace(/\s+/g, " ").trim();
  if (squashed.length <= limit) return squashed;
  return `${squashed.slice(0, limit - 3).trimEnd()}...`;
}

function asciiSafe(value) {
  return String(value)
    .replace(/\u00e2\u20ac[\u201c\u201d]|[\u2013\u2014]/g, "-")
    .replace(/\u00e2\u2020\u2019/g, "->")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

function summarizeMetadata(filePath) {
  if (!exists(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      bytes: Buffer.byteLength(raw, "utf8"),
      summary: "Present, but not valid JSON.",
    };
  }

  if (path.basename(filePath) === "package.json") {
    const scripts = value.scripts ? Object.keys(value.scripts).slice(0, 8) : [];
    return {
      bytes: Buffer.byteLength(raw, "utf8"),
      summary: compact(`package ${value.name || "(unnamed)"} ${value.version || ""}; scripts: ${scripts.join(", ") || "none listed"}`, 220),
    };
  }

  if (path.basename(filePath) === "release-manifest.json") {
    return {
      bytes: Buffer.byteLength(raw, "utf8"),
      summary: compact(`release manifest ${value.releaseTag || "(no tag)"}; repositories: ${Array.isArray(value.repositories) ? value.repositories.length : 0}`, 220),
    };
  }

  if (path.basename(filePath) === "launcher-channel.json") {
    return {
      bytes: Buffer.byteLength(raw, "utf8"),
      summary: compact(`launcher channel ${value.channel || value.id || "(unknown)"}; generatedAt: ${value.generatedAt || "not listed"}`, 220),
    };
  }

  if (path.basename(filePath) === "tiers.json") {
    const count = Array.isArray(value.tiers) ? value.tiers.length : Object.keys(value).length;
    return {
      bytes: Buffer.byteLength(raw, "utf8"),
      summary: compact(`trust tiers metadata; entries: ${count}`, 220),
    };
  }

  return {
    bytes: Buffer.byteLength(raw, "utf8"),
    summary: compact(`JSON keys: ${Object.keys(value).slice(0, 10).join(", ") || "none"}`, 220),
  };
}

function inspectRepo(repoRoot, source) {
  const repoPath = localPath(repoRoot, source.name);
  const repoExists = exists(repoPath);
  const warnings = [];
  if (!repoExists) warnings.push(`Missing local repository ${source.name}`);

  const docs = (source.canonicalDocs || []).map((docPath) => {
    const fullPath = path.join(repoPath, docPath);
    const summary = repoExists ? readTextSummary(fullPath) : null;
    if (repoExists && !summary) warnings.push(`${source.name} missing canonical doc ${docPath}`);
    return {
      path: slash(docPath),
      exists: Boolean(summary),
      ...(summary || {}),
    };
  });

  const agentDocs = (source.agentDocs || []).map((docPath) => {
    const fullPath = path.join(repoPath, docPath);
    const summary = repoExists ? readTextSummary(fullPath) : null;
    if (repoExists && !summary) warnings.push(`${source.name} missing agent doc ${docPath}`);
    return {
      path: slash(docPath),
      exists: Boolean(summary),
      ...(summary || {}),
    };
  });

  const metadata = (source.metadata || []).map((metaPath) => {
    const fullPath = path.join(repoPath, metaPath);
    const summary = repoExists ? summarizeMetadata(fullPath) : null;
    if (repoExists && !summary) warnings.push(`${source.name} missing metadata ${metaPath}`);
    return {
      path: slash(metaPath),
      exists: Boolean(summary),
      ...(summary || {}),
    };
  });

  return {
    id: source.id,
    name: source.name,
    github: source.github,
    role: source.role,
    localPath: repoPath,
    exists: repoExists,
    git: repoExists ? gitInfo(repoPath, source.name) : gitInfo(repoPath, source.name),
    canonicalDocs: docs,
    agentDocs,
    metadata,
    warnings,
  };
}

function discoverUnconfiguredRepos(repoRoot, configuredNames) {
  if (!exists(repoRoot)) return [];
  return fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^ECHO-/i.test(entry.name) && !configuredNames.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function snapshotTime(repos) {
  const dates = repos
    .map((repo) => repo.git.commitDate)
    .filter(Boolean)
    .sort();
  return dates.at(-1) || "1970-01-01T00:00:00.000Z";
}

function buildIndex(config, repoRoot, repos, discoveredRepos) {
  const warnings = [];
  for (const repo of repos) warnings.push(...repo.warnings);
  for (const repoName of discoveredRepos) warnings.push(`Unconfigured local ECHO repository ${repoName}`);

  return {
    schemaVersion: "echo.codex.context-index.v1",
    generatedAt: snapshotTime(repos),
    sourceConfig: "docs/codex/context-sources.json",
    repoRoot,
    centralRepoId: config.centralRepoId,
    releaseIndexRoot,
    repos,
    discoveredRepos,
    warnings,
  };
}

function docList(items) {
  const present = items.filter((item) => item.exists).map((item) => `\`${item.path}\``);
  return present.length ? present.join(", ") : "none found";
}

function dirtySummary(repo) {
  if (!repo.exists) return "missing";
  if (!repo.git.available) return "no git";
  if (!repo.git.dirty) return "clean";
  return `dirty (${repo.git.dirtyFiles.length})`;
}

function renderPlatformContext(index) {
  const lines = [];
  lines.push("# ECHO Platform Context");
  lines.push("");
  lines.push("Generated by `node scripts/generate-codex-context.mjs --write`. Do not hand-edit this file.");
  lines.push("");
  lines.push(`- Source root: \`${index.repoRoot}\``);
  lines.push(`- Release Index: \`${index.releaseIndexRoot}\``);
  lines.push(`- Source snapshot time: ${index.generatedAt}`);
  lines.push(`- Repositories configured: ${index.repos.length}`);
  lines.push("");
  lines.push("## How Codex Should Use This");
  lines.push("");
  lines.push("- Use this file for orientation and routing before broad ECHO platform work.");
  lines.push("- Read the owning repo's `AGENTS.md`, `README.md`, and listed canonical docs before editing.");
  lines.push("- Inspect task-relevant source files directly; this packet reduces repeated discovery, not verification.");
  lines.push("- If this file is missing or stale, run `node scripts/generate-codex-context.mjs --write` from `ECHO-Release-Index`.");
  lines.push("");
  lines.push("## Platform Boundaries");
  lines.push("");
  lines.push("- `ECHO-Release-Index` owns catalog records, trust policy, channel routing, and this context system.");
  lines.push("- Source repos own their binaries, source code, runtime contracts, release assets, and implementation details.");
  lines.push("- `ECHO-Modules` owns the first-party module graph, Foundation architecture, and platform roadmap.");
  lines.push("- Experience modules consume Foundation contracts and do not depend on other experience modules.");
  lines.push("");
  lines.push("## Repo Map");
  lines.push("");
  lines.push("| Repo | Role | Git | Read first |");
  lines.push("| --- | --- | --- | --- |");
  for (const repo of index.repos) {
    const git = repo.git.available ? `${repo.git.branch || "(detached)"} @ ${repo.git.commit || "unknown"}, ${dirtySummary(repo)}` : dirtySummary(repo);
    lines.push(`| \`${repo.name}\` | ${escapeTable(repo.role)} | ${escapeTable(git)} | ${escapeTable(docList([...repo.agentDocs, ...repo.canonicalDocs].slice(0, 4)))} |`);
  }
  lines.push("");
  lines.push("## Repo Details");
  lines.push("");
  for (const repo of index.repos) {
    lines.push(`### ${repo.name}`);
    lines.push("");
    lines.push(`- GitHub: ${repo.github}`);
    lines.push(`- Local path: \`${repo.localPath}\``);
    lines.push(`- Role: ${repo.role}`);
    lines.push(`- Git state: ${repo.git.available ? `${repo.git.branch || "(detached)"} @ ${repo.git.commit || "unknown"}; ${dirtySummary(repo)}` : dirtySummary(repo)}`);
    lines.push(`- Agent docs: ${docList(repo.agentDocs)}`);
    lines.push(`- Canonical docs: ${docList(repo.canonicalDocs)}`);
    if (repo.metadata.some((item) => item.exists)) lines.push(`- Metadata: ${docList(repo.metadata)}`);
    const docSignals = [...repo.agentDocs, ...repo.canonicalDocs]
      .filter((item) => item.exists)
      .slice(0, 5);
    if (docSignals.length) {
      lines.push("");
      lines.push("Doc signals:");
      for (const doc of docSignals) lines.push(`- \`${doc.path}\`: ${doc.heading} - ${doc.excerpt}`);
    }
    const metadataSignals = repo.metadata.filter((item) => item.exists).slice(0, 4);
    if (metadataSignals.length) {
      lines.push("");
      lines.push("Metadata signals:");
      for (const item of metadataSignals) lines.push(`- \`${item.path}\`: ${item.summary}`);
    }
    if (repo.warnings.length) {
      lines.push("");
      lines.push("Warnings:");
      for (const warning of repo.warnings) lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  if (index.discoveredRepos.length) {
    lines.push("## Unconfigured Local ECHO Repos");
    lines.push("");
    for (const repoName of index.discoveredRepos) lines.push(`- \`${repoName}\``);
    lines.push("");
  }

  if (index.warnings.length) {
    lines.push("## Context Warnings");
    lines.push("");
    for (const warning of index.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderPromptPreamble(index) {
  const releaseIndex = index.repos.find((repo) => repo.id === index.centralRepoId);
  const lines = [];
  lines.push("# ECHO Prompt Preamble");
  lines.push("");
  lines.push("Use this before an ECHO task when you want to manually front-load platform context.");
  lines.push("");
  lines.push("```text");
  lines.push("You are working on the ECHO platform.");
  lines.push(`Start from the local ECHO repo root: ${index.repoRoot}`);
  lines.push(`Use ECHO-Release-Index as the canonical cross-repo context hub: ${releaseIndex?.localPath || index.releaseIndexRoot}`);
  lines.push("Before broad cross-platform work, read ECHO-Release-Index/docs/codex/generated/ECHO_PLATFORM_CONTEXT.md.");
  lines.push("Use ECHO-Release-Index/docs/codex/repo-routing.md to choose the owning repo.");
  lines.push("Then inspect only the task-relevant AGENTS.md, README.md, canonical docs, source files, schemas, and tests.");
  lines.push("Do not assume this context replaces direct file inspection for edits, tests, reviews, or release work.");
  lines.push("Keep AGENTS.md files small; put durable platform knowledge in ECHO-Release-Index/docs/codex and regenerate the context packet when sources change.");
  lines.push("```");
  lines.push("");
  lines.push("## Configured Repositories");
  lines.push("");
  for (const repo of index.repos) {
    lines.push(`- \`${repo.name}\`: ${repo.role}`);
  }
  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function expectedOutputs(index) {
  return new Map([
    [generatedFiles.platformContext, renderPlatformContext(index)],
    [generatedFiles.promptPreamble, renderPromptPreamble(index)],
    [generatedFiles.contextIndex, `${JSON.stringify(index, null, 2)}\n`],
  ]);
}

function writeChanged(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (exists(filePath) && fs.readFileSync(filePath, "utf8") === content) return false;
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function checkOutputs(outputs) {
  const stale = [];
  for (const [filePath, content] of outputs) {
    if (!exists(filePath)) {
      stale.push(`${relToReleaseIndex(filePath)} is missing`);
      continue;
    }
    const actual = fs.readFileSync(filePath, "utf8");
    if (actual !== content) stale.push(`${relToReleaseIndex(filePath)} is stale`);
  }
  return stale;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readJson(defaultConfigPath);
  const repoRoot = args.repoRoot || path.resolve(config.repoRoot);
  const configuredNames = new Set(config.repos.map((repo) => repo.name));
  const repos = config.repos.map((source) => inspectRepo(repoRoot, source));
  const discoveredRepos = discoverUnconfiguredRepos(repoRoot, configuredNames);
  const index = buildIndex(config, repoRoot, repos, discoveredRepos);
  const outputs = expectedOutputs(index);

  if (args.mode === "check") {
    const stale = checkOutputs(outputs);
    if (stale.length) {
      console.error(stale.join("\n"));
      console.error("Run `node scripts/generate-codex-context.mjs --write`.");
      process.exit(1);
    }
    console.log("Codex context is current.");
    return;
  }

  const changed = [];
  for (const [filePath, content] of outputs) {
    if (writeChanged(filePath, content)) changed.push(relToReleaseIndex(filePath));
  }
  if (changed.length) console.log(`Updated ${changed.join(", ")}`);
  else console.log("Codex context already current.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
