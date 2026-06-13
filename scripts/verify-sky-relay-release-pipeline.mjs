#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OUT = 'release-readiness/sky-relay-release-pipeline.json'
const EDITIONS = [
  {
    key: 'native',
    workspaceDir: 'ECHO-Sky-Relay-Native-Edition',
  },
  {
    key: 'neoforge',
    workspaceDir: 'ECHO-Sky-Relay-NeoForge-Edition',
  },
  {
    key: 'standalone',
    workspaceDir: 'ECHO-Sky-Relay-Standalone-Edition',
  },
]

function usage() {
  return `Usage: node scripts/verify-sky-relay-release-pipeline.mjs [options]

Runs the last-mile Sky Relay release verification pipeline across the three
edition repos and the Release Index. Blocked steps are reported by default; use
--require-release-ready to fail while blocked.

Options:
  --root <dir>             Release Index repository root. Default: current directory.
  --workspace-root <dir>   Workspace containing sibling ECHO repos. Default: parent of --root.
  --out <path>             Pipeline report path. Default: ${DEFAULT_OUT}
  --write                  Write the pipeline report.
  --require-release-ready  Exit non-zero unless every pipeline step passes.
  --help                   Print this help text.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    workspaceRoot: null,
    out: DEFAULT_OUT,
    write: false,
    requireReleaseReady: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--workspace-root') args.workspaceRoot = path.resolve(next())
    else if (arg === '--out') args.out = next()
    else if (arg === '--write') args.write = true
    else if (arg === '--require-release-ready') args.requireReleaseReady = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.workspaceRoot) args.workspaceRoot = path.resolve(args.root, '..')
  return args
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function outputTail(value, maxLength = 4000) {
  const text = String(value ?? '').trim()
  if (text.length <= maxLength) return text
  return text.slice(text.length - maxLength)
}

function runStep({ id, label, cwd, command, args, required = true }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  const status = result.status === 0 ? 'passed' : 'blocked'
  return {
    id,
    label,
    cwd,
    command: [command, ...args].join(' '),
    required,
    exitCode: result.status,
    status,
    stdoutTail: outputTail(result.stdout),
    stderrTail: outputTail(result.stderr),
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function buildReport(args) {
  const root = path.resolve(args.root)
  const steps = []
  for (const edition of EDITIONS) {
    const cwd = path.join(args.workspaceRoot, edition.workspaceDir)
    steps.push(runStep({
      id: `${edition.key}.validate`,
      label: `${edition.key} edition manifest validator`,
      cwd,
      command: process.execPath,
      args: ['scripts/validate-sky-relay-edition.mjs'],
    }))
    steps.push(runStep({
      id: `${edition.key}.manualEvidence`,
      label: `${edition.key} manual gameplay evidence verifier`,
      cwd,
      command: process.execPath,
      args: ['scripts/verify-manual-gameplay-evidence.mjs', '--require-release-ready'],
    }))
  }

  steps.push(runStep({
    id: 'releaseIndex.gameplayEvidence',
    label: 'central Sky Relay gameplay evidence verifier',
    cwd: root,
    command: process.execPath,
    args: ['scripts/verify-sky-relay-gameplay-evidence.mjs', '--require-release-ready'],
  }))
  steps.push(runStep({
    id: 'releaseIndex.publicAlphaReadiness',
    label: 'Sky Relay public alpha readiness verifier',
    cwd: root,
    command: process.execPath,
    args: ['scripts/verify-sky-relay-public-alpha-readiness.mjs', '--require-release-ready'],
  }))
  steps.push(runStep({
    id: 'releaseIndex.workOrder',
    label: 'Sky Relay manual gameplay work-order refresh',
    cwd: root,
    command: process.execPath,
    args: ['scripts/generate-sky-relay-manual-gameplay-work-order.mjs', '--write'],
  }))
  steps.push(runStep({
    id: 'releaseIndex.promotionDryRun',
    label: 'Sky Relay public alpha promotion dry-run',
    cwd: root,
    command: process.execPath,
    args: ['scripts/promote-sky-relay-public-alpha.mjs'],
  }))
  steps.push(runStep({
    id: 'releaseIndex.validateIndex',
    label: 'strict Release Index validation',
    cwd: root,
    command: process.execPath,
    args: ['scripts/validate-index.mjs', '--strict'],
  }))
  steps.push(runStep({
    id: 'releaseIndex.publicAlphaSync',
    label: 'public alpha index sync check',
    cwd: root,
    command: process.execPath,
    args: ['scripts/sync-public-alpha-index.mjs', '--check'],
  }))

  const blockers = steps
    .filter((step) => step.required && step.status !== 'passed')
    .map((step) => `${step.id} failed with exit code ${step.exitCode}`)

  return {
    schemaVersion: 'echo.skyrelay.release-pipeline.v1',
    status: blockers.length ? 'BLOCKED' : 'PASS',
    generatedAt: new Date().toISOString(),
    root,
    workspaceRoot: args.workspaceRoot,
    steps,
    gates: Object.fromEntries(steps.map((step) => [step.id, step.status])),
    blockers,
    notes: [
      'This pipeline verifies the release flow; it does not replace real manual gameplay evidence.',
      'Promotion remains blocked until the manual gameplay evidence steps and central readiness steps pass.',
    ],
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  const report = await buildReport(args)
  if (args.write) {
    const out = path.isAbsolute(args.out) ? args.out : path.join(args.root, args.out)
    await writeJson(out, report)
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (args.requireReleaseReady && report.status !== 'PASS') process.exitCode = 1
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exit(1)
})
