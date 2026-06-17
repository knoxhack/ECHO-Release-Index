#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import {
  COMPUTER_USE_SESSION_SCHEMA,
  MANUAL_EVIDENCE_SCHEMA,
  REQUIRED_CLAIMS,
  REQUIRED_LANES,
  artifactIdentity,
  captureRelativePaths,
  claimProofs,
  copyFileEnsuringDir,
  familyConfig,
  laneConfig,
  readJson,
  requiredProofPaths,
  sourcePath,
  validateCaptureRoot,
  validateComputerUseSessionChecks,
  validateManualEvidence,
  writeJson,
} from './family-gameplay-capture-lib.mjs'

function usage() {
  return `Usage:
  node scripts/import-family-gameplay-capture.mjs --family openlands|arcana-division --lane native|neoforge|standalone --capture-root <path> --artifact <pack.zip> --tester <name> --world-or-profile <name> --started-at <iso> [--force]

Imports real gameplay capture files into the owning edition repository. The
capture root must come from prepare-family-gameplay-capture.mjs and must contain
non-empty local notes, screenshots, logs, and save ZIPs.`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    family: '',
    lane: '',
    captureRoot: '',
    artifact: '',
    tester: '',
    worldOrProfile: '',
    startedAt: '',
    force: false,
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
    else if (arg === '--capture-root') args.captureRoot = path.resolve(next())
    else if (arg === '--artifact') args.artifact = path.resolve(next())
    else if (arg === '--tester') args.tester = next()
    else if (arg === '--world-or-profile') args.worldOrProfile = next()
    else if (arg === '--started-at') args.startedAt = next()
    else if (arg === '--force') args.force = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (args.help) return args
  familyConfig(args.family)
  if (!REQUIRED_LANES.includes(args.lane)) throw new Error(`Unknown lane: ${args.lane}`)
  for (const field of ['captureRoot', 'artifact', 'tester', 'worldOrProfile', 'startedAt']) {
    if (!args[field]) throw new Error(`--${field === 'worldOrProfile' ? 'world-or-profile' : field === 'captureRoot' ? 'capture-root' : field} is required.`)
  }
  if (!Number.isFinite(Date.parse(args.startedAt))) throw new Error('--started-at must be an ISO timestamp.')
  return args
}

function flattenGroups(groups) {
  return Object.values(groups).flat()
}

async function ensureManifest(args, config, laneInfo) {
  const manifestPath = path.join(args.captureRoot, 'capture-manifest.json')
  const manifest = await readJson(manifestPath, { optional: true })
  if (!manifest) throw new Error(`capture-manifest.json is missing in ${args.captureRoot}. Run prepare-family-gameplay-capture.mjs first.`)
  const blockers = []
  if (manifest.schemaVersion !== 'echo.release_index.family_gameplay_capture_manifest.v1') blockers.push('capture-manifest schema mismatch.')
  if (manifest.familyKey !== config.key) blockers.push(`capture-manifest family is ${manifest.familyKey ?? 'missing'}, expected ${config.key}.`)
  if (manifest.lane !== laneInfo.lane) blockers.push(`capture-manifest lane is ${manifest.lane ?? 'missing'}, expected ${laneInfo.lane}.`)
  if (manifest.packId !== laneInfo.packId) blockers.push(`capture-manifest packId is ${manifest.packId ?? 'missing'}, expected ${laneInfo.packId}.`)
  if (blockers.length) throw new Error(`Capture manifest does not match import target:\n${blockers.join('\n')}`)
  return manifest
}

async function existingEvidenceGuard(args, laneInfo) {
  const outputPath = sourcePath(args.root, laneInfo, laneInfo.evidencePath)
  try {
    await fs.access(outputPath)
    if (!args.force) throw new Error(`${outputPath} already exists. Pass --force to replace it with a new capture import.`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function copyCaptureFiles(args, config, laneInfo) {
  const capturePaths = captureRelativePaths()
  const destinationPaths = requiredProofPaths(config, laneInfo.lane)
  for (const [group, relativePaths] of Object.entries(capturePaths).filter(([, values]) => Array.isArray(values))) {
    for (let index = 0; index < relativePaths.length; index += 1) {
      const source = path.join(args.captureRoot, relativePaths[index])
      const target = sourcePath(args.root, laneInfo, destinationPaths[group][index])
      await copyFileEnsuringDir(source, target)
    }
  }
}

async function importComputerUseSession(args, config, laneInfo) {
  const source = path.join(args.captureRoot, 'computer-use-session.json')
  const session = await readJson(source, { optional: true })
  if (!session) return null
  if (session.schemaVersion !== COMPUTER_USE_SESSION_SCHEMA) return null
  if (!Array.isArray(session.actions) || session.actions.length === 0) return null
  const destinationProofs = requiredProofPaths(config, laneInfo.lane)
  const captureProofs = captureRelativePaths()
  const proofRefMap = new Map()
  for (const group of ['supportingFiles', 'screenshots', 'logs', 'saveSnapshots']) {
    for (let index = 0; index < captureProofs[group].length; index += 1) {
      proofRefMap.set(captureProofs[group][index].replace(/\\/gu, '/'), destinationProofs[group][index])
    }
  }
  const normalizeEvidenceRef = (value) => {
    const reference = value ? String(value).trim().replace(/\\/gu, '/') : ''
    return proofRefMap.get(reference) ?? reference
  }
  const outputRelative = `${laneInfo.evidenceRoot}/computer-use-session.json`
  const normalizedChecks = Array.isArray(session.verificationChecks)
    ? session.verificationChecks.map((check) => ({
      id: String(check.id ?? '').trim(),
      label: String(check.label ?? '').trim(),
      status: String(check.status ?? '').trim().toLowerCase(),
      evidenceRef: check.evidenceRef ? normalizeEvidenceRef(check.evidenceRef) : null,
      note: check.note ? String(check.note).trim() : null,
    }))
    : undefined
  const outputSession = {
    ...session,
    ...(normalizedChecks ? {
      verificationChecks: normalizedChecks,
      verificationSummary: {
        checkCount: normalizedChecks.length,
        capturedCount: normalizedChecks.filter((check) => check.status === 'captured').length,
        blockedCount: normalizedChecks.filter((check) => check.status === 'blocked').length,
        notAttemptedCount: normalizedChecks.filter((check) => check.status === 'not-attempted').length,
      },
    } : {}),
    family: config.family,
    familyKey: config.key,
    lane: laneInfo.lane,
    packId: laneInfo.packId,
    importedAt: new Date().toISOString(),
  }
  const validationBlockers = validateComputerUseSessionChecks({
    session: outputSession,
    evidence: {
      claims: Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, true])),
      proofs: claimProofs(config, laneInfo.lane),
      supportingFiles: [...destinationProofs.supportingFiles, ...captureProofs.supportingFiles],
      screenshots: [...destinationProofs.screenshots, ...captureProofs.screenshots],
      logs: [...destinationProofs.logs, ...captureProofs.logs],
      saveSnapshots: [...destinationProofs.saveSnapshots, ...captureProofs.saveSnapshots],
    },
    config,
    lane: laneInfo.lane,
  })
  if (validationBlockers.length) {
    throw new Error(`Computer Use session is not importable:\n${validationBlockers.join('\n')}`)
  }
  const output = {
    ...outputSession,
  }
  await writeJson(sourcePath(args.root, laneInfo, outputRelative), output)
  return {
    path: outputRelative,
    verificationChecks: output.verificationChecks ?? [],
    verificationSummary: output.verificationSummary ?? null,
  }
}

function manualEvidence(config, laneInfo, args, artifact, manifest, computerUseSession) {
  const proofGroups = requiredProofPaths(config, laneInfo.lane)
  return {
    schemaVersion: MANUAL_EVIDENCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    family: config.family,
    familyKey: config.key,
    moduleId: config.moduleId,
    lane: laneInfo.lane,
    packId: laneInfo.packId,
    sourceRepo: laneInfo.sourceRepo,
    workspaceDir: laneInfo.workspaceDir,
    claims: Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, true])),
    proofs: claimProofs(config, laneInfo.lane),
    supportingFiles: proofGroups.supportingFiles,
    screenshots: proofGroups.screenshots,
    logs: proofGroups.logs,
    saveSnapshots: proofGroups.saveSnapshots,
    artifact: {
      fileName: artifact.fileName,
      sha256: artifact.sha256,
      size: artifact.size,
    },
    run: {
      tester: args.tester,
      worldOrProfile: args.worldOrProfile,
      startedAt: new Date(args.startedAt).toISOString(),
      importedAt: new Date().toISOString(),
      captureManifest: path.relative(process.cwd(), path.join(args.captureRoot, 'capture-manifest.json')).replace(/\\/gu, '/'),
    },
    capture: {
      manifestGeneratedAt: manifest.generatedAt ?? null,
      captureRoot: args.captureRoot,
      computerUseSession: computerUseSession?.path ?? null,
      computerUseVerificationSummary: computerUseSession?.verificationSummary ?? null,
    },
    notes: [
      'Imported from a real manual gameplay capture bundle.',
      'Do not edit claims by hand; rerun import-family-gameplay-capture.mjs after replacing capture files.',
    ],
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const config = familyConfig(args.family)
  const laneInfo = laneConfig(config, args.lane)
  const manifest = await ensureManifest(args, config, laneInfo)
  const captureValidation = await validateCaptureRoot(args.captureRoot)
  if (!captureValidation.ok) {
    throw new Error(`Capture root is not importable:\n${captureValidation.blockers.join('\n')}`)
  }
  await existingEvidenceGuard(args, laneInfo)
  const artifact = await artifactIdentity(args.artifact)
  await copyCaptureFiles(args, config, laneInfo)
  const computerUseSession = await importComputerUseSession(args, config, laneInfo)
  const output = manualEvidence(config, laneInfo, args, artifact, manifest, computerUseSession)
  await writeJson(sourcePath(args.root, laneInfo, laneInfo.evidencePath), output)
  const validation = await validateManualEvidence(args.root, config, laneInfo.lane)
  if (!validation.ok) {
    throw new Error(`Imported evidence did not validate:\n${validation.blockers.join('\n')}`)
  }
  const copiedCount = flattenGroups(captureRelativePaths()).length
  console.log(`Imported ${config.family} ${laneInfo.lane} gameplay capture: ${copiedCount} proof file(s), artifact ${artifact.sha256}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
