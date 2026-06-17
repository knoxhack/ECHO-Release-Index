import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const REQUIRED_LANES = ['native', 'neoforge', 'standalone']
export const REQUIRED_CLAIMS = [
  'freshWorldCreated',
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'primaryObjectiveCompleted',
  'saveReloadVerified',
  'noCrashEvidence',
]
export const REQUIRED_PROOF_GROUPS = ['supportingFiles', 'screenshots', 'logs', 'saveSnapshots']
export const MANUAL_EVIDENCE_SCHEMA = 'echo.release_index.family_gameplay_manual_evidence.v1'

export const FAMILIES = {
  openlands: {
    key: 'openlands',
    family: 'Openlands',
    moduleId: 'echoopenlandsprotocol',
    output: 'openlands-gameplay-evidence.json',
    evidenceRoot: 'fixtures/openlands/gameplay-qa',
    packPrefix: 'openlands',
    primaryObjective: 'primary Openlands route or systems objective reached and recorded',
    primaryObjectiveLabel: 'Openlands primary route or systems objective',
    repos: {
      native: 'knoxhack/ECHO-Openlands-Native-Edition',
      neoforge: 'knoxhack/ECHO-Openlands-NeoForge-Edition',
      standalone: 'knoxhack/ECHO-Openlands-Standalone-Edition',
    },
  },
  'arcana-division': {
    key: 'arcana-division',
    family: 'Arcana Division',
    moduleId: 'echoarcanadivisionprotocol',
    output: 'arcana-division-gameplay-evidence.json',
    evidenceRoot: 'fixtures/arcana-division/gameplay-qa',
    packPrefix: 'arcana-division',
    primaryObjective: 'primary Arcana Division route or systems objective reached and recorded',
    primaryObjectiveLabel: 'Arcana Division primary route or systems objective',
    repos: {
      native: 'knoxhack/ECHO-Arcana-Division-Native-Edition',
      neoforge: 'knoxhack/ECHO-Arcana-Division-NeoForge-Edition',
      standalone: 'knoxhack/ECHO-Arcana-Division-Standalone-Edition',
    },
  },
}

const TEMPLATE_MARKERS = [
  'TBD',
  'TODO',
  'template',
  'placeholder',
  'REPLACE_WITH_REAL_CAPTURE',
  'This file is not evidence',
]

export function familyConfig(key) {
  const config = FAMILIES[key]
  if (!config) throw new Error(`Unknown family: ${key}`)
  return config
}

export function workspaceRoot(root) {
  return path.dirname(root)
}

export function workspaceDirFor(repoFullName) {
  return String(repoFullName ?? '').split('/').pop()
}

export function laneConfig(config, lane) {
  if (!REQUIRED_LANES.includes(lane)) throw new Error(`Unknown lane: ${lane}`)
  const sourceRepo = config.repos[lane]
  const workspaceDir = workspaceDirFor(sourceRepo)
  const packId = `${config.packPrefix}-${lane}-edition`
  return {
    lane,
    packId,
    sourceRepo,
    workspaceDir,
    evidencePath: `${config.evidenceRoot}/${lane}/manual-evidence.json`,
    evidenceRoot: `${config.evidenceRoot}/${lane}`,
    evidenceDir: `${config.evidenceRoot}/${lane}/evidence`,
  }
}

export function falseClaims() {
  return Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, false]))
}

export function requiredProofPaths(config, lane) {
  const laneInfo = laneConfig(config, lane)
  const base = laneInfo.evidenceDir
  return {
    supportingFiles: [
      `${base}/notes/fresh-world.md`,
      `${base}/notes/first-30-minutes.md`,
      `${base}/notes/first-2-hours.md`,
      `${base}/notes/primary-objective.md`,
      `${base}/notes/no-crash-review.md`,
    ],
    screenshots: [
      `${base}/screenshots/fresh-world.png`,
      `${base}/screenshots/first-30-minutes.png`,
      `${base}/screenshots/first-2-hours.png`,
      `${base}/screenshots/primary-objective.png`,
    ],
    logs: [
      `${base}/logs/client-playthrough.log`,
      `${base}/logs/launcher-install.log`,
    ],
    saveSnapshots: [
      `${base}/saves/first-30-minutes-save.zip`,
      `${base}/saves/first-2-hours-save.zip`,
      `${base}/saves/primary-objective-save.zip`,
    ],
  }
}

export function claimProofs(config, lane) {
  const paths = requiredProofPaths(config, lane)
  return {
    freshWorldCreated: [
      paths.supportingFiles[0],
      paths.screenshots[0],
      paths.logs[0],
      paths.logs[1],
    ],
    realFirst30Playthrough: [
      paths.supportingFiles[1],
      paths.screenshots[1],
      paths.logs[0],
      paths.saveSnapshots[0],
    ],
    realFirst2HourPlaythrough: [
      paths.supportingFiles[2],
      paths.screenshots[2],
      paths.logs[0],
      paths.saveSnapshots[1],
    ],
    primaryObjectiveCompleted: [
      paths.supportingFiles[3],
      paths.screenshots[3],
      paths.logs[0],
      paths.saveSnapshots[2],
    ],
    saveReloadVerified: [
      paths.logs[0],
      ...paths.saveSnapshots,
    ],
    noCrashEvidence: [
      paths.supportingFiles[4],
      paths.logs[0],
      paths.logs[1],
    ],
  }
}

export function sourceRepoRoot(root, laneInfo) {
  return path.join(workspaceRoot(root), laneInfo.workspaceDir)
}

export function sourcePath(root, laneInfo, relativePath) {
  return path.join(sourceRepoRoot(root, laneInfo), relativePath)
}

export async function readJson(filePath, { optional = false } = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null
    throw error
  }
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function copyFileEnsuringDir(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.copyFile(from, to)
}

export function hasTemplateMarker(text) {
  return TEMPLATE_MARKERS.some((marker) => text.toLowerCase().includes(marker.toLowerCase()))
}

export async function nonEmptyFile(filePath) {
  const stat = await fs.stat(filePath).catch(() => null)
  return stat?.isFile() && stat.size > 0 ? stat : null
}

export async function validateTextEvidence(filePath) {
  const stat = await nonEmptyFile(filePath)
  if (!stat) return { ok: false, reason: 'file is missing or empty' }
  const text = await fs.readFile(filePath, 'utf8').catch(() => '')
  if (!text.trim()) return { ok: false, reason: 'file contains no text' }
  if (hasTemplateMarker(text)) return { ok: false, reason: 'file still contains template markers' }
  return { ok: true, size: stat.size, mtime: stat.mtime.toISOString() }
}

export async function validateBinaryEvidence(filePath) {
  const stat = await nonEmptyFile(filePath)
  if (!stat) return { ok: false, reason: 'file is missing or empty' }
  return { ok: true, size: stat.size, mtime: stat.mtime.toISOString() }
}

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  const handle = await fs.open(filePath, 'r')
  try {
    for await (const chunk of handle.readableWebStream()) {
      hash.update(Buffer.from(chunk))
    }
  } finally {
    await handle.close()
  }
  return hash.digest('hex')
}

export async function artifactIdentity(artifactPath) {
  const stat = await nonEmptyFile(artifactPath)
  if (!stat) throw new Error(`Artifact is missing or empty: ${artifactPath}`)
  return {
    path: artifactPath,
    fileName: path.basename(artifactPath),
    sha256: await sha256File(artifactPath),
    size: stat.size,
  }
}

export function captureRelativePaths() {
  return {
    supportingFiles: [
      'evidence/notes/fresh-world.md',
      'evidence/notes/first-30-minutes.md',
      'evidence/notes/first-2-hours.md',
      'evidence/notes/primary-objective.md',
      'evidence/notes/no-crash-review.md',
    ],
    screenshots: [
      'evidence/screenshots/fresh-world.png',
      'evidence/screenshots/first-30-minutes.png',
      'evidence/screenshots/first-2-hours.png',
      'evidence/screenshots/primary-objective.png',
    ],
    logs: [
      'evidence/logs/client-playthrough.log',
      'evidence/logs/launcher-install.log',
    ],
    saveSnapshots: [
      'evidence/saves/first-30-minutes-save.zip',
      'evidence/saves/first-2-hours-save.zip',
      'evidence/saves/primary-objective-save.zip',
    ],
  }
}

export async function validateCaptureRoot(captureRoot) {
  const required = captureRelativePaths()
  const blockers = []
  for (const [group, paths] of Object.entries(required)) {
    for (const relativePath of paths) {
      const absolute = path.join(captureRoot, relativePath)
      const result = group === 'supportingFiles' || group === 'logs'
        ? await validateTextEvidence(absolute)
        : await validateBinaryEvidence(absolute)
      if (!result.ok) blockers.push(`${relativePath}: ${result.reason}`)
    }
  }
  return { ok: blockers.length === 0, blockers, required }
}

export async function validateManualEvidence(root, config, lane) {
  const laneInfo = laneConfig(config, lane)
  const evidenceFile = sourcePath(root, laneInfo, laneInfo.evidencePath)
  const evidence = await readJson(evidenceFile, { optional: true })
  const blockers = []
  if (!evidence) {
    return {
      ok: false,
      evidenceFile,
      blockers: [
        'Missing real gameplay evidence JSON.',
        'Missing fresh install and fresh world/profile proof.',
        'Missing first 30-minute playthrough proof.',
        'Missing first 2-hour playthrough proof.',
        `Missing ${config.primaryObjective}.`,
        'Missing save/reload verification proof.',
        'Missing no-crash review proof.',
      ],
      evidence: null,
    }
  }

  if (evidence.schemaVersion !== MANUAL_EVIDENCE_SCHEMA) blockers.push(`Evidence schemaVersion is ${evidence.schemaVersion ?? 'missing'}, expected ${MANUAL_EVIDENCE_SCHEMA}.`)
  if (evidence.family !== config.family) blockers.push(`Evidence family is ${evidence.family ?? 'missing'}, expected ${config.family}.`)
  if (evidence.lane !== lane) blockers.push(`Evidence lane is ${evidence.lane ?? 'missing'}, expected ${lane}.`)
  if (evidence.packId !== laneInfo.packId) blockers.push(`Evidence packId is ${evidence.packId ?? 'missing'}, expected ${laneInfo.packId}.`)

  for (const claim of REQUIRED_CLAIMS) {
    if (evidence.claims?.[claim] !== true) blockers.push(`Gameplay claim ${claim} must be true.`)
    const proofRefs = Array.isArray(evidence.proofs?.[claim]) ? evidence.proofs[claim] : []
    if (proofRefs.length === 0) blockers.push(`Gameplay claim ${claim} must cite local proof files.`)
  }

  for (const field of ['tester', 'worldOrProfile', 'startedAt']) {
    const value = evidence.run?.[field]
    if (!value || hasTemplateMarker(String(value))) blockers.push(`run.${field} must contain real capture data.`)
  }
  if (!/^[a-f0-9]{64}$/iu.test(String(evidence.artifact?.sha256 ?? ''))) blockers.push('artifact.sha256 must be a real SHA-256.')
  if (!(Number(evidence.artifact?.size) > 0)) blockers.push('artifact.size must be greater than zero.')

  const proofGroups = requiredProofPaths(config, lane)
  for (const [group, relativePaths] of Object.entries(proofGroups)) {
    const evidencePaths = Array.isArray(evidence[group]) ? evidence[group] : []
    if (evidencePaths.length === 0) blockers.push(`${group} must list local proof files.`)
    for (const relativePath of relativePaths) {
      if (!evidencePaths.includes(relativePath)) blockers.push(`${group} missing expected path ${relativePath}.`)
      const absolute = sourcePath(root, laneInfo, relativePath)
      const result = group === 'supportingFiles' || group === 'logs'
        ? await validateTextEvidence(absolute)
        : await validateBinaryEvidence(absolute)
      if (!result.ok) blockers.push(`${relativePath}: ${result.reason}`)
    }
  }

  return {
    ok: blockers.length === 0,
    evidenceFile,
    blockers,
    evidence,
  }
}
