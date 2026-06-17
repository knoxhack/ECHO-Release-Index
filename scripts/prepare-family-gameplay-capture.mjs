#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import {
  FAMILIES,
  REQUIRED_CLAIMS,
  REQUIRED_LANES,
  captureRelativePaths,
  familyConfig,
  laneConfig,
  writeJson,
} from './family-gameplay-capture-lib.mjs'

function usage() {
  return `Usage:
  node scripts/prepare-family-gameplay-capture.mjs --family openlands|arcana-division --lane native|neoforge|standalone --tester <name> --world-or-profile <name> --started-at <iso>

Prepares a fail-closed manual gameplay capture folder for Openlands or Arcana
Division. The generated files are instructions/placeholders only; import will
reject them until they are replaced with real notes, screenshots, logs, and save
snapshots from gameplay.`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    family: '',
    lane: '',
    tester: '',
    worldOrProfile: '',
    startedAt: '',
    captureRoot: '',
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
    else if (arg === '--family') args.family = next()
    else if (arg === '--lane') args.lane = next()
    else if (arg === '--tester') args.tester = next()
    else if (arg === '--world-or-profile') args.worldOrProfile = next()
    else if (arg === '--started-at') args.startedAt = next()
    else if (arg === '--capture-root') args.captureRoot = path.resolve(next())
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (args.help) return args
  familyConfig(args.family)
  if (!REQUIRED_LANES.includes(args.lane)) throw new Error(`Unknown lane: ${args.lane}`)
  for (const field of ['tester', 'worldOrProfile', 'startedAt']) {
    if (!args[field]) throw new Error(`--${field === 'worldOrProfile' ? 'world-or-profile' : field} is required.`)
  }
  if (!Number.isFinite(Date.parse(args.startedAt))) throw new Error('--started-at must be an ISO timestamp.')
  return args
}

function timestampSlug(iso) {
  return new Date(iso).toISOString().replace(/[:.]/gu, '-')
}

function placeholderText(title) {
  return `# ${title}

REPLACE_WITH_REAL_CAPTURE_NOTES

This file is not evidence until a tester replaces this template marker with
observations from the requested gameplay run.
`
}

async function writePlaceholderFiles(captureRoot) {
  const paths = captureRelativePaths()
  for (const relativePath of paths.supportingFiles) {
    await fs.mkdir(path.dirname(path.join(captureRoot, relativePath)), { recursive: true })
    await fs.writeFile(path.join(captureRoot, relativePath), placeholderText(path.basename(relativePath, '.md')), 'utf8')
  }
  for (const group of ['screenshots', 'logs', 'saveSnapshots']) {
    for (const relativePath of paths[group]) {
      await fs.mkdir(path.dirname(path.join(captureRoot, relativePath)), { recursive: true })
    }
  }
}

function checklist(config, laneInfo, args) {
  const paths = captureRelativePaths()
  return `# ${config.family} ${laneInfo.lane} Gameplay Capture

This folder is a capture kit, not proof. Replace every placeholder note and add
real screenshots, logs, and save ZIPs before import.

## Run Identity
- Tester: ${args.tester}
- World/Profile: ${args.worldOrProfile}
- Started At: ${new Date(args.startedAt).toISOString()}
- Pack: ${laneInfo.packId}

## Required Capture Files
${Object.entries(paths).flatMap(([group, values]) => values.map((value) => `- ${group}: ${value}`)).join('\n')}

## Required Claims
${REQUIRED_CLAIMS.map((claim) => `- ${claim}`).join('\n')}

## Import Command
\`\`\`text
node scripts\\import-family-gameplay-capture.mjs --family ${config.key} --lane ${laneInfo.lane} --capture-root "${args.captureRoot}" --artifact <pack.zip> --tester "${args.tester}" --world-or-profile "${args.worldOrProfile}" --started-at "${new Date(args.startedAt).toISOString()}" --force
\`\`\`
`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const config = familyConfig(args.family)
  const laneInfo = laneConfig(config, args.lane)
  if (!args.captureRoot) {
    args.captureRoot = path.resolve(
      args.root,
      'tmp',
      `${config.key}-gameplay-capture`,
      laneInfo.packId,
      timestampSlug(args.startedAt),
    )
  }

  await fs.mkdir(args.captureRoot, { recursive: true })
  await writePlaceholderFiles(args.captureRoot)
  const manifest = {
    schemaVersion: 'echo.release_index.family_gameplay_capture_manifest.v1',
    generatedAt: new Date().toISOString(),
    family: config.family,
    familyKey: config.key,
    lane: laneInfo.lane,
    packId: laneInfo.packId,
    sourceRepo: laneInfo.sourceRepo,
    workspaceDir: laneInfo.workspaceDir,
    tester: args.tester,
    worldOrProfile: args.worldOrProfile,
    startedAt: new Date(args.startedAt).toISOString(),
    requiredClaims: REQUIRED_CLAIMS,
    requiredFiles: captureRelativePaths(),
    notes: [
      'This manifest prepares a manual capture. It is not proof that gameplay happened.',
      'Import rejects placeholder notes, empty files, and missing screenshots/logs/save snapshots.',
    ],
  }
  await writeJson(path.join(args.captureRoot, 'capture-manifest.json'), manifest)
  await fs.writeFile(path.join(args.captureRoot, 'CAPTURE_CHECKLIST.md'), checklist(config, laneInfo, args), 'utf8')
  console.log(`Prepared ${config.family} ${laneInfo.lane} capture kit: ${args.captureRoot}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
