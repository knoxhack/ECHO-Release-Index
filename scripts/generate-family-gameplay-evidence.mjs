#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'

import {
  FAMILIES,
  REQUIRED_CLAIMS,
  REQUIRED_LANES,
  falseClaims,
  familyConfig,
  laneConfig,
  validateManualEvidence,
  writeJson,
} from './family-gameplay-capture-lib.mjs'

const DEFAULT_OUT_DIR = path.join('release-readiness')

function usage() {
  return `Usage:
  node scripts/generate-family-gameplay-evidence.mjs [--family all|openlands|arcana-division]
  node scripts/generate-family-gameplay-evidence.mjs --no-write --json

Writes family gameplay source reports for Openlands and Arcana Division.
Reports remain fail-closed until a real lane capture has been imported into the
owning edition repository with non-empty local proof files.`
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
  if (args.family !== 'all') familyConfig(args.family)
  return args
}

function laneReportFromValidation(config, lane, validation) {
  const laneInfo = laneConfig(config, lane)
  const evidence = validation.evidence
  const blockers = validation.blockers
  const releaseReady = validation.ok
  return {
    lane,
    packId: laneInfo.packId,
    sourceRepo: laneInfo.sourceRepo,
    workspaceDir: laneInfo.workspaceDir,
    status: releaseReady ? 'pass' : 'blocked',
    releaseReady,
    evidencePath: laneInfo.evidencePath,
    evidencePresent: Boolean(evidence),
    evidenceFile: validation.evidenceFile,
    claims: releaseReady ? evidence.claims : (evidence?.claims ?? falseClaims()),
    artifact: evidence?.artifact ?? null,
    run: evidence?.run ?? null,
    logSummary: evidence?.logSummary ?? null,
    crashSummary: evidence?.crashSummary ?? null,
    crashReport: evidence?.crashReport ?? null,
    proofSummary: releaseReady
      ? {
          supportingFiles: evidence.supportingFiles?.length ?? 0,
          screenshots: evidence.screenshots?.length ?? 0,
          logs: evidence.logs?.length ?? 0,
          saveSnapshots: evidence.saveSnapshots?.length ?? 0,
        }
      : null,
    blockerCount: blockers.length,
    blockers,
  }
}

async function laneReport(root, config, lane) {
  const validation = await validateManualEvidence(root, config, lane)
  return laneReportFromValidation(config, lane, validation)
}

async function familyReport(root, config) {
  const lanes = []
  for (const lane of REQUIRED_LANES) lanes.push(await laneReport(root, config, lane))
  const blockers = lanes.flatMap((lane) => lane.blockers.map((blocker) => `${lane.packId}: ${blocker}`))
  const passedLaneCount = lanes.filter((lane) => lane.releaseReady).length
  const status = passedLaneCount === lanes.length && blockers.length === 0 ? 'PASS' : 'BLOCKED'
  return {
    schemaVersion: 'echo.release_index.family_gameplay_evidence.v1',
    generatedAt: new Date().toISOString(),
    status,
    family: config.family,
    moduleId: config.moduleId,
    scope: 'real-gameplay-evidence-source',
    requiredLanes: REQUIRED_LANES,
    requiredClaims: REQUIRED_CLAIMS,
    lanes,
    blockers,
    summary: {
      laneCount: lanes.length,
      passedLaneCount,
      blockedLaneCount: lanes.length - passedLaneCount,
      blockerCount: blockers.length,
      conclusion: status === 'PASS'
        ? `${config.family} has real release-ready lane gameplay captures.`
        : `${config.family} remains blocked until real lane gameplay captures are imported.`,
    },
    notes: [
      'This report only accepts imported local gameplay capture evidence with non-empty proof files.',
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
    const config = familyConfig(key)
    const report = await familyReport(args.root, config)
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
