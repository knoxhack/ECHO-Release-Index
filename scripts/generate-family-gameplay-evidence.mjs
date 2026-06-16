#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OUT_DIR = path.join('release-readiness')
const REQUIRED_LANES = ['native', 'neoforge', 'standalone']
const REQUIRED_CLAIMS = [
  'freshWorldCreated',
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'primaryObjectiveCompleted',
  'saveReloadVerified',
  'noCrashEvidence',
]
const FAMILIES = {
  openlands: {
    family: 'Openlands',
    moduleId: 'echoopenlandsprotocol',
    output: 'openlands-gameplay-evidence.json',
    evidenceRoot: 'fixtures/openlands/gameplay-qa',
    packPrefix: 'openlands',
    primaryObjective: 'primary Openlands route or systems objective reached and recorded',
    repos: {
      native: 'knoxhack/ECHO-Openlands-Native-Edition',
      neoforge: 'knoxhack/ECHO-Openlands-NeoForge-Edition',
      standalone: 'knoxhack/ECHO-Openlands-Standalone-Edition',
    },
  },
  'arcana-division': {
    family: 'Arcana Division',
    moduleId: 'echoarcanadivisionprotocol',
    output: 'arcana-division-gameplay-evidence.json',
    evidenceRoot: 'fixtures/arcana-division/gameplay-qa',
    packPrefix: 'arcana-division',
    primaryObjective: 'primary Arcana Division route or systems objective reached and recorded',
    repos: {
      native: 'knoxhack/ECHO-Arcana-Division-Native-Edition',
      neoforge: 'knoxhack/ECHO-Arcana-Division-NeoForge-Edition',
      standalone: 'knoxhack/ECHO-Arcana-Division-Standalone-Edition',
    },
  },
}

function usage() {
  return `Usage:
  node scripts/generate-family-gameplay-evidence.mjs [--family all|openlands|arcana-division]
  node scripts/generate-family-gameplay-evidence.mjs --no-write --json

Writes fail-closed family gameplay source reports for families that do not yet
have dedicated real gameplay evidence importers. These reports are blockers,
not proof.`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    outDir: null,
    family: 'all',
    write: true,
    json: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--out-dir') args.outDir = path.resolve(next())
    else if (arg === '--family') args.family = next()
    else if (arg === '--no-write') args.write = false
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.outDir) args.outDir = path.join(args.root, DEFAULT_OUT_DIR)
  if (args.family !== 'all' && !FAMILIES[args.family]) {
    throw new Error(`Unknown family: ${args.family}`)
  }
  return args
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function falseClaims() {
  return Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, false]))
}

function laneReport(config, lane) {
  const packId = `${config.packPrefix}-${lane}-edition`
  const evidencePath = `${config.evidenceRoot}/${lane}/manual-evidence.json`
  const blockers = [
    'Missing real gameplay evidence JSON.',
    'Missing fresh install and fresh world/profile proof.',
    'Missing first 30-minute playthrough proof.',
    'Missing first 2-hour playthrough proof.',
    `Missing ${config.primaryObjective}.`,
    'Missing save/reload verification proof.',
    'Missing no-crash review proof.',
  ]
  return {
    lane,
    packId,
    sourceRepo: config.repos[lane],
    workspaceDir: config.repos[lane].split('/').pop(),
    status: 'blocked',
    releaseReady: false,
    evidencePath,
    evidencePresent: false,
    claims: falseClaims(),
    logSummary: null,
    crashSummary: null,
    crashReport: null,
    blockerCount: blockers.length,
    blockers,
  }
}

function familyReport(config) {
  const lanes = REQUIRED_LANES.map((lane) => laneReport(config, lane))
  const blockers = lanes.flatMap((lane) => lane.blockers.map((blocker) => `${lane.packId}: ${blocker}`))
  return {
    schemaVersion: 'echo.release_index.family_gameplay_evidence.v1',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    family: config.family,
    moduleId: config.moduleId,
    scope: 'fail-closed-real-gameplay-evidence-source',
    requiredLanes: REQUIRED_LANES,
    requiredClaims: REQUIRED_CLAIMS,
    lanes,
    blockers,
    summary: {
      laneCount: lanes.length,
      passedLaneCount: 0,
      blockedLaneCount: lanes.length,
      blockerCount: blockers.length,
      conclusion: `${config.family} remains blocked until real lane gameplay captures are imported.`,
    },
    notes: [
      'This report is an explicit fail-closed source report, not gameplay proof.',
      'Launcher install, handoff, content graph load, and Hytale export-planning evidence must not be used as substitutes for real gameplay captures.',
    ],
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const keys = args.family === 'all' ? Object.keys(FAMILIES) : [args.family]
  const reports = []
  for (const key of keys) {
    const config = FAMILIES[key]
    const report = familyReport(config)
    const outputPath = path.join(args.outDir, config.output)
    reports.push({ path: outputPath, report })
    if (args.write) await writeJson(outputPath, report)
  }

  if (args.json) {
    console.log(JSON.stringify(reports.map((entry) => ({
      path: path.relative(args.root, entry.path).replace(/\\/gu, '/'),
      report: entry.report,
    })), null, 2))
  } else {
    for (const entry of reports) {
      console.log(`Wrote ${path.relative(args.root, entry.path).replace(/\\/gu, '/')}: ${entry.report.status}`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
