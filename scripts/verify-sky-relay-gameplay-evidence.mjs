#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_ROUTE_REPORT = 'release-readiness/sky-relay-gameplay-route-smoke.json'
const DEFAULT_MANUAL_EVIDENCE = 'fixtures/sky-relay/gameplay-qa/manual-evidence.json'
const DEFAULT_OUT = 'release-readiness/sky-relay-gameplay-evidence.json'
const TEMPLATE_MARKER = 'ECHO_SKY_RELAY_TEMPLATE_ONLY'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const ZIP_CENTRAL_DIRECTORY_HEADER = Buffer.from([0x50, 0x4b, 0x01, 0x02])
const ZIP_END_OF_CENTRAL_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06])

const EVIDENCE_SOURCE_REPOS = {
  native: {
    source: 'sky-relay-native',
    repository: 'knoxhack/ECHO-Sky-Relay-Native-Edition',
    workspaceDir: 'ECHO-Sky-Relay-Native-Edition',
    releaseTag: 'sky-relay-native-0.1.0-alpha',
  },
  neoforge: {
    source: 'sky-relay-neoforge',
    repository: 'knoxhack/ECHO-Sky-Relay-NeoForge-Edition',
    workspaceDir: 'ECHO-Sky-Relay-NeoForge-Edition',
    releaseTag: 'sky-relay-neoforge-0.1.0-alpha',
  },
  standalone: {
    source: 'sky-relay-standalone',
    repository: 'knoxhack/ECHO-Sky-Relay-Standalone-Edition',
    workspaceDir: 'ECHO-Sky-Relay-Standalone-Edition',
    releaseTag: 'sky-relay-standalone-0.1.0-alpha',
  },
}

const REQUIRED_CAPTURE_KIT_FILES = [
  'scripts/init-manual-gameplay-evidence.mjs',
  'scripts/verify-manual-gameplay-evidence.mjs',
  'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json',
  'fixtures/sky-relay/gameplay-qa/evidence/CAPTURE_CHECKLIST.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/fresh-world-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-30-minutes-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-2-hours-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/signal-crown-verification.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/no-crash-review.template.md',
]

const REQUIRED_CLAIMS = [
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'realSignalCrownPlaythrough',
  'freshWorldCreated',
  'saveReloadVerified',
  'noCrashEvidence',
]

const REQUIRED_SUPPORTING_PATTERNS = [
  /(^|\/)fresh[-_]?world[^/]*\.md$/iu,
  /(^|\/)first[-_]?30[-_]?minutes[^/]*\.md$/iu,
  /(^|\/)first[-_]?2[-_]?hours[^/]*\.md$/iu,
  /(^|\/)signal[-_]?crown[^/]*\.md$/iu,
  /(^|\/)no[-_]?crash[^/]*\.md$/iu,
]

const REQUIRED_SCREENSHOT_PATTERNS = [
  /(^|\/)fresh[-_]?world[^/]*\.png$/iu,
  /(^|\/)first[-_]?30[-_]?minutes[^/]*\.png$/iu,
  /(^|\/)first[-_]?2[-_]?hours[^/]*\.png$/iu,
  /(^|\/)signal[-_]?crown[^/]*\.png$/iu,
]

const REQUIRED_LOG_PATTERNS = [
  /(^|\/)client[^/]*\.log$/iu,
  /(^|\/)(launcher|pack)[-_]?install[^/]*\.log$/iu,
]

const REQUIRED_SAVE_PATTERNS = [
  /(^|\/)first[-_]?30[-_]?minutes[^/]*\.zip$/iu,
  /(^|\/)first[-_]?2[-_]?hours[^/]*\.zip$/iu,
  /(^|\/)signal[-_]?crown[^/]*\.zip$/iu,
]

const NOTE_SECTION_REQUIREMENTS = [
  {
    pattern: /(^|\/)fresh[-_]?world[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Fresh World Checks', '## Evidence Links', '## Notes'],
  },
  {
    pattern: /(^|\/)first[-_]?30[-_]?minutes[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Route Checks', '## Evidence Links', '## Notes'],
  },
  {
    pattern: /(^|\/)first[-_]?2[-_]?hours[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Route Checks', '## Evidence Links', '## Notes'],
  },
  {
    pattern: /(^|\/)signal[-_]?crown[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Completion Checks', '## Evidence Links', '## Notes'],
  },
  {
    pattern: /(^|\/)no[-_]?crash[^/]*\.md$/iu,
    sections: ['## Reviewed Files', '## Required Checks', '## Reviewer Notes'],
  },
]

const BLANK_NOTE_FIELD = /^-\s+[^:\n]+:\s*$/gmu

const REQUIRED_SESSIONS = [
  {
    id: 'fresh_world_creation',
    claim: 'freshWorldCreated',
    minDurationMinutes: 1,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[0] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[0] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] },
      launcherLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[1] },
    },
  },
  {
    id: 'first_30_minutes',
    claim: 'realFirst30Playthrough',
    minDurationMinutes: 30,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[1] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[1] },
      saveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[0] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] },
    },
  },
  {
    id: 'first_2_hours',
    claim: 'realFirst2HourPlaythrough',
    minDurationMinutes: 120,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[2] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[2] },
      saveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[1] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] },
    },
  },
  {
    id: 'signal_crown_completion',
    claim: 'realSignalCrownPlaythrough',
    minDurationMinutes: 1,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[3] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[3] },
      saveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[2] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] },
    },
  },
  {
    id: 'save_reload_verification',
    claim: 'saveReloadVerified',
    minDurationMinutes: 1,
    evidence: {
      first30SaveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[0] },
      first2HourSaveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[1] },
      signalCrownSaveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[2] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] },
    },
  },
  {
    id: 'no_crash_review',
    claim: 'noCrashEvidence',
    minDurationMinutes: 1,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[4] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] },
      launcherLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[1] },
    },
  },
]

function usage() {
  return `Usage: node scripts/verify-sky-relay-gameplay-evidence.mjs [options]

Verifies real Sky Relay gameplay evidence for the first 30 minutes, first 2
hours, and Signal Crown completion. Missing evidence is reported as blocked by
default; use --require-release-ready to fail the process while blocked.

Options:
  --root <dir>                 Release Index repository root. Default: current directory.
  --workspace-root <dir>       Workspace containing sibling ECHO repos. Default: parent of --root.
  --route-report <path>        Route contract report. Default: ${DEFAULT_ROUTE_REPORT}
  --manual-evidence <path>     Manual evidence JSON path inside each edition repo.
                               Default: ${DEFAULT_MANUAL_EVIDENCE}
  --out <path>                 Readiness report path. Default: ${DEFAULT_OUT}
  --write                      Write the computed readiness report.
  --require-release-ready      Exit non-zero when gameplay evidence is blocked.
  --help                       Print this help text.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    workspaceRoot: null,
    routeReport: DEFAULT_ROUTE_REPORT,
    manualEvidence: DEFAULT_MANUAL_EVIDENCE,
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
    else if (arg === '--route-report') args.routeReport = next()
    else if (arg === '--manual-evidence') args.manualEvidence = next()
    else if (arg === '--out') args.out = next()
    else if (arg === '--write') args.write = true
    else if (arg === '--require-release-ready') args.requireReleaseReady = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.workspaceRoot) args.workspaceRoot = path.resolve(args.root, '..')
  return args
}

function resolveInside(root, relPath) {
  if (typeof relPath !== 'string' || relPath.trim() === '' || path.isAbsolute(relPath)) {
    return { error: 'relative-path-required' }
  }
  const base = path.resolve(root)
  const target = path.resolve(base, relPath)
  const relative = path.relative(base, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { error: 'outside-root', base, target }
  return { base, target }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

async function fileSize(filePath) {
  return (await fs.stat(filePath)).size
}

async function sha256File(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
}

async function fileStartsWith(filePath, signatures) {
  const longest = Math.max(...signatures.map((signature) => signature.length))
  const handle = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(longest)
    const result = await handle.read(buffer, 0, longest, 0)
    return signatures.some((signature) => result.bytesRead >= signature.length && buffer.subarray(0, signature.length).equals(signature))
  } finally {
    await handle.close()
  }
}

async function pngDimensions(filePath) {
  const handle = await fs.open(filePath, 'r')
  try {
    const header = Buffer.alloc(24)
    const result = await handle.read(header, 0, header.length, 0)
    if (result.bytesRead < header.length || !header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null
    if (header.subarray(12, 16).toString('ascii') !== 'IHDR') return null
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    }
  } finally {
    await handle.close()
  }
}

async function zipArchiveInfo(filePath) {
  const bytes = await fs.readFile(filePath)
  const eocdIndex = bytes.lastIndexOf(ZIP_END_OF_CENTRAL_DIRECTORY)
  if (eocdIndex < 0 || eocdIndex + 22 > bytes.length) return null
  const commentLength = bytes.readUInt16LE(eocdIndex + 20)
  if (eocdIndex + 22 + commentLength > bytes.length) return null
  const entryCount = bytes.readUInt16LE(eocdIndex + 10)
  const centralDirectorySize = bytes.readUInt32LE(eocdIndex + 12)
  const centralDirectoryOffset = bytes.readUInt32LE(eocdIndex + 16)
  if (entryCount < 1) return null
  if (centralDirectoryOffset + centralDirectorySize > eocdIndex) return null
  if (!bytes.subarray(0, ZIP_LOCAL_FILE_HEADER.length).equals(ZIP_LOCAL_FILE_HEADER)) return null
  if (!bytes.subarray(centralDirectoryOffset, centralDirectoryOffset + ZIP_CENTRAL_DIRECTORY_HEADER.length).equals(ZIP_CENTRAL_DIRECTORY_HEADER)) return null
  return { entries: entryCount, centralDirectorySize }
}

function uniqueStrings(values) {
  return new Set(values).size === values.length
}

function matchesAny(values, pattern) {
  return values.some((value) => pattern.test(String(value)))
}

function normalizeRel(value) {
  return String(value).replace(/\\/g, '/')
}

function hasPath(values, relPath) {
  return Array.isArray(values) && values.some((value) => normalizeRel(value) === normalizeRel(relPath))
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isTemplateTimestamp(value) {
  return typeof value === 'string' && value.startsWith('1970-01-01T')
}

function isPlaceholderText(value) {
  if (typeof value !== 'string') return true
  const normalized = value.trim().toLowerCase()
  return normalized === '' || ['tbd', 'todo', 'pending', 'template'].includes(normalized)
}

function valueAt(value, pointer) {
  return String(pointer).split('.').reduce((current, part) => current?.[part], value)
}

function validateMarkdownNote({ text, relPath, label, index, blockers }) {
  if (text.includes(TEMPLATE_MARKER)) {
    blockers.push(`${label}[${index}] target still contains template marker ${TEMPLATE_MARKER}: ${relPath}`)
  }
  const requirement = NOTE_SECTION_REQUIREMENTS.find((item) => item.pattern.test(String(relPath).replace(/\\/g, '/')))
  if (!requirement) return
  for (const section of requirement.sections) {
    if (!text.includes(section)) {
      blockers.push(`${label}[${index}] target is missing section ${section}: ${relPath}`)
    }
  }
  if (BLANK_NOTE_FIELD.test(text)) {
    blockers.push(`${label}[${index}] target still contains blank worksheet fields: ${relPath}`)
  }
  BLANK_NOTE_FIELD.lastIndex = 0
}

function validateRunIdentity({ evidence, edition, blockers }) {
  const source = EVIDENCE_SOURCE_REPOS[edition]
  if (!evidence.run || typeof evidence.run !== 'object' || Array.isArray(evidence.run)) {
    blockers.push(`${edition} manual evidence run must be an object.`)
    return
  }
  if (evidence.run.releaseTag !== source.releaseTag) {
    blockers.push(`${edition} manual evidence run.releaseTag must be ${source.releaseTag}.`)
  }
  if (evidence.run.launcherChannel !== 'alpha') {
    blockers.push(`${edition} manual evidence run.launcherChannel must be alpha.`)
  }
  if (!isIsoTimestamp(evidence.run.startedAt)) {
    blockers.push(`${edition} manual evidence run.startedAt must be an ISO timestamp.`)
  } else if (isTemplateTimestamp(evidence.run.startedAt)) {
    blockers.push(`${edition} manual evidence run.startedAt must not use the template timestamp.`)
  }
  for (const field of ['tester', 'worldOrProfile', 'installedFrom']) {
    if (isPlaceholderText(evidence.run[field])) {
      blockers.push(`${edition} manual evidence run.${field} must be filled with real capture information.`)
    }
  }
}

function validateSessionEvidencePath({ root, evidence, edition, sessionId, field, rule, relPath, blockers }) {
  const label = `${edition}.sessions.${sessionId}.evidence.${field}`
  const resolved = resolveInside(root, relPath)
  if (resolved.error === 'relative-path-required') {
    blockers.push(`${label} must be a relative file path.`)
    return
  }
  if (resolved.error === 'outside-root') {
    blockers.push(`${label} points outside the evidence root: ${relPath}`)
    return
  }
  if (!rule.pattern.test(normalizeRel(relPath))) {
    blockers.push(`${label} must match ${rule.pattern}.`)
  }
  if (!hasPath(evidence[rule.list], relPath)) {
    blockers.push(`${label} must also be listed in ${edition}.${rule.list}.`)
  }
}

function validateSessions({ root, evidence, edition, blockers }) {
  if (!Array.isArray(evidence.sessions)) {
    blockers.push(`${edition} manual evidence sessions must be an array.`)
    return
  }
  const ids = evidence.sessions.map((session) => session?.id).filter(Boolean)
  if (new Set(ids).size !== ids.length) blockers.push(`${edition} manual evidence sessions must not contain duplicate ids.`)
  for (const requirement of REQUIRED_SESSIONS) {
    const session = evidence.sessions.find((entry) => entry?.id === requirement.id)
    if (!session) {
      blockers.push(`${edition} manual evidence sessions must include ${requirement.id}.`)
      continue
    }
    if (session.claim !== requirement.claim) {
      blockers.push(`${edition} manual evidence sessions.${requirement.id}.claim must be ${requirement.claim}.`)
    }
    if (!isIsoTimestamp(session.startedAt)) {
      blockers.push(`${edition} manual evidence sessions.${requirement.id}.startedAt must be an ISO timestamp.`)
    }
    if (!isIsoTimestamp(session.endedAt)) {
      blockers.push(`${edition} manual evidence sessions.${requirement.id}.endedAt must be an ISO timestamp.`)
    }
    const start = Date.parse(session.startedAt)
    const end = Date.parse(session.endedAt)
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      if (end <= start) blockers.push(`${edition} manual evidence sessions.${requirement.id}.endedAt must be after startedAt.`)
      const elapsedMinutes = (end - start) / 60000
      if (elapsedMinutes < requirement.minDurationMinutes) {
        blockers.push(`${edition} manual evidence sessions.${requirement.id} elapsed minutes must be at least ${requirement.minDurationMinutes}.`)
      }
    }
    if (typeof session.durationMinutes !== 'number' || !Number.isFinite(session.durationMinutes)) {
      blockers.push(`${edition} manual evidence sessions.${requirement.id}.durationMinutes must be a number.`)
    } else if (session.durationMinutes < requirement.minDurationMinutes) {
      blockers.push(`${edition} manual evidence sessions.${requirement.id}.durationMinutes must be at least ${requirement.minDurationMinutes}.`)
    }
    if (isTemplateTimestamp(session.startedAt) || isTemplateTimestamp(session.endedAt)) {
      blockers.push(`${edition} manual evidence sessions.${requirement.id} must not use template timestamps.`)
    }
    if (!session.evidence || typeof session.evidence !== 'object' || Array.isArray(session.evidence)) {
      blockers.push(`${edition} manual evidence sessions.${requirement.id}.evidence must be an object.`)
      continue
    }
    for (const [field, rule] of Object.entries(requirement.evidence)) {
      const relPath = session.evidence[field]
      if (typeof relPath !== 'string' || relPath.trim() === '') {
        blockers.push(`${edition} manual evidence sessions.${requirement.id}.evidence.${field} must be a relative file path.`)
        continue
      }
      validateSessionEvidencePath({ root, evidence, edition, sessionId: requirement.id, field, rule, relPath, blockers })
    }
  }
}

function validateRouteReport(routeReport, blockers) {
  if (routeReport.schemaVersion !== 'echo.skyrelay.gameplay-route-smoke.v1') {
    blockers.push('Route report schemaVersion must be echo.skyrelay.gameplay-route-smoke.v1.')
  }
  if (routeReport.ok !== true) blockers.push('Route contract smoke must be ok=true.')
  for (const gate of ['first30RouteContract', 'first2HourRouteContract', 'signalCrownContract']) {
    if (valueAt(routeReport, `gates.${gate}`) !== 'passed') {
      blockers.push(`Route contract gate ${gate} must be passed.`)
    }
  }
}

function evidenceRoot(args, edition) {
  return path.join(args.workspaceRoot, EVIDENCE_SOURCE_REPOS[edition].workspaceDir)
}

async function validateFileList({ root, label, values, minItems, requiredPatterns, blockers, fileValidator }) {
  if (!Array.isArray(values)) {
    blockers.push(`${label} must be an array.`)
    return []
  }
  if (values.length < minItems) blockers.push(`${label} must contain at least ${minItems} item(s).`)
  if (!uniqueStrings(values)) blockers.push(`${label} must not contain duplicate paths.`)
  for (const pattern of requiredPatterns) {
    if (!matchesAny(values, pattern)) blockers.push(`${label} must include a path matching ${pattern}.`)
  }

  const checked = []
  for (const [index, relPath] of values.entries()) {
    const resolved = resolveInside(root, relPath)
    if (resolved.error === 'relative-path-required') {
      blockers.push(`${label}[${index}] must be a relative file path.`)
      continue
    }
    if (resolved.error === 'outside-root') {
      blockers.push(`${label}[${index}] points outside the evidence root: ${relPath}`)
      continue
    }
    if (!(await fileExists(resolved.target))) {
      blockers.push(`${label}[${index}] target does not exist: ${relPath}`)
      continue
    }
    const size = await fileSize(resolved.target)
    if (size < 1) {
      blockers.push(`${label}[${index}] target must be at least 1 byte: ${relPath}`)
      continue
    }
    const record = {
      path: relPath,
      size,
      sha256: await sha256File(resolved.target),
    }
    if (fileValidator) {
      const metadata = await fileValidator({ filePath: resolved.target, relPath, blockers, label, index })
      if (metadata) Object.assign(record, metadata)
    }
    checked.push(record)
  }
  return checked
}

async function validateManualEvidence(args, edition, blockers) {
  const source = EVIDENCE_SOURCE_REPOS[edition]
  const root = evidenceRoot(args, edition)
  const resolvedManual = resolveInside(root, args.manualEvidence)
  const result = {
    edition,
    source: source.source,
    repository: source.repository,
    manualEvidence: args.manualEvidence,
    found: false,
    claims: {},
    run: null,
    sessions: [],
    checked: {
      supportingFiles: [],
      screenshots: [],
      logs: [],
      saveSnapshots: [],
    },
  }

  if (resolvedManual.error) {
    blockers.push(`${edition} manual evidence path must stay inside ${source.workspaceDir}.`)
    return result
  }
  if (!(await fileExists(resolvedManual.target))) {
    blockers.push(`${edition} manual evidence is missing: ${source.workspaceDir}/${args.manualEvidence}`)
    return result
  }

  let evidence
  try {
    evidence = await readJson(resolvedManual.target)
  } catch (error) {
    blockers.push(`${edition} manual evidence is not valid JSON: ${error.message}`)
    return result
  }

  result.found = true
  if (evidence.schemaVersion !== 'echo.skyrelay.gameplay-qa.manual.v1') {
    blockers.push(`${edition} manual evidence schemaVersion must be echo.skyrelay.gameplay-qa.manual.v1.`)
  }
  if (evidence.packId !== `sky-relay-${edition}-edition`) {
    blockers.push(`${edition} manual evidence packId must be sky-relay-${edition}-edition.`)
  }
  if (typeof evidence.generatedAt !== 'string' || Number.isNaN(Date.parse(evidence.generatedAt))) {
    blockers.push(`${edition} manual evidence generatedAt must be an ISO timestamp.`)
  }
  validateRunIdentity({ evidence, edition, blockers })
  validateSessions({ root, evidence, edition, blockers })
  result.run = evidence.run ?? null
  result.sessions = Array.isArray(evidence.sessions) ? evidence.sessions : []

  const claims = evidence.claims ?? {}
  result.claims = Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, claims[claim] === true]))
  for (const claim of REQUIRED_CLAIMS) {
    if (claims[claim] !== true) blockers.push(`${edition} manual evidence claim ${claim} must be true.`)
  }

  result.checked.supportingFiles = await validateFileList({
    root,
    label: `${edition}.supportingFiles`,
    values: evidence.supportingFiles,
    minItems: 5,
    requiredPatterns: REQUIRED_SUPPORTING_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      const text = await fs.readFile(filePath, 'utf8')
      validateMarkdownNote({ text, relPath, label, index, blockers: fileBlockers })
    },
  })
  result.checked.screenshots = await validateFileList({
    root,
    label: `${edition}.screenshots`,
    values: evidence.screenshots,
    minItems: 4,
    requiredPatterns: REQUIRED_SCREENSHOT_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      if (!(await fileStartsWith(filePath, [PNG_SIGNATURE]))) {
        fileBlockers.push(`${label}[${index}] target is not a PNG file: ${relPath}`)
        return
      }
      const dimensions = await pngDimensions(filePath)
      if (!dimensions || dimensions.width < 640 || dimensions.height < 360) {
        fileBlockers.push(`${label}[${index}] PNG dimensions must be at least 640x360: ${relPath}`)
        return null
      }
      return { dimensions }
    },
  })
  result.checked.logs = await validateFileList({
    root,
    label: `${edition}.logs`,
    values: evidence.logs,
    minItems: 2,
    requiredPatterns: REQUIRED_LOG_PATTERNS,
    blockers,
  })
  result.checked.saveSnapshots = await validateFileList({
    root,
    label: `${edition}.saveSnapshots`,
    values: evidence.saveSnapshots,
    minItems: 3,
    requiredPatterns: REQUIRED_SAVE_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      const zipInfo = await zipArchiveInfo(filePath)
      if (!zipInfo) {
        fileBlockers.push(`${label}[${index}] target is not a ZIP archive with entries: ${relPath}`)
        return null
      }
      return zipInfo
    },
  })

  return result
}

async function validateCaptureKit(args, edition, blockers) {
  const source = EVIDENCE_SOURCE_REPOS[edition]
  const root = evidenceRoot(args, edition)
  const result = {
    edition,
    source: source.source,
    repository: source.repository,
    workspaceDir: source.workspaceDir,
    status: 'passed',
    requiredFiles: REQUIRED_CAPTURE_KIT_FILES,
    presentFiles: [],
    missingFiles: [],
  }

  for (const relPath of REQUIRED_CAPTURE_KIT_FILES) {
    const resolved = resolveInside(root, relPath)
    if (resolved.error) {
      result.missingFiles.push(relPath)
      blockers.push(`${edition} capture kit path must stay inside ${source.workspaceDir}: ${relPath}`)
      continue
    }
    if (await fileExists(resolved.target)) result.presentFiles.push(relPath)
    else {
      result.missingFiles.push(relPath)
      blockers.push(`${edition} capture kit is missing: ${source.workspaceDir}/${relPath}`)
    }
  }

  if (result.missingFiles.length) result.status = 'blocked'
  return result
}

async function buildReport(args) {
  const blockers = []
  const routeReportPath = path.resolve(args.root, args.routeReport)
  let routeReport = null
  try {
    routeReport = await readJson(routeReportPath)
    validateRouteReport(routeReport, blockers)
  } catch (error) {
    blockers.push(`Route contract report is missing or invalid: ${args.routeReport}: ${error.message}`)
  }

  const captureKits = []
  const editions = []
  for (const edition of Object.keys(EVIDENCE_SOURCE_REPOS)) {
    captureKits.push(await validateCaptureKit(args, edition, blockers))
    editions.push(await validateManualEvidence(args, edition, blockers))
  }

  const gates = {
    routeContractReport: blockers.some((blocker) => blocker.startsWith('Route')) ? 'blocked' : 'passed',
    captureKitReady: captureKits.every((captureKit) => captureKit.status === 'passed') ? 'passed' : 'blocked',
    freshWorldCreated: editions.every((edition) => edition.claims.freshWorldCreated) ? 'passed' : 'blocked',
    realFirst30Playthrough: editions.every((edition) => edition.claims.realFirst30Playthrough) ? 'passed' : 'blocked',
    realFirst2HourPlaythrough: editions.every((edition) => edition.claims.realFirst2HourPlaythrough) ? 'passed' : 'blocked',
    realSignalCrownPlaythrough: editions.every((edition) => edition.claims.realSignalCrownPlaythrough) ? 'passed' : 'blocked',
    saveReloadVerified: editions.every((edition) => edition.claims.saveReloadVerified) ? 'passed' : 'blocked',
    noCrashEvidence: editions.every((edition) => edition.claims.noCrashEvidence) ? 'passed' : 'blocked',
  }

  return {
    schemaVersion: 'echo.skyrelay.gameplay-evidence.v1',
    status: blockers.length ? 'BLOCKED' : 'PASS',
    generatedAt: new Date().toISOString(),
    moduleId: 'echoskyrelayprotocol',
    routeContractReport: args.routeReport,
    manualEvidencePath: args.manualEvidence,
    requiredEvidence: {
      editions: Object.values(EVIDENCE_SOURCE_REPOS).map(({ source, repository, workspaceDir }) => ({ source, repository, workspaceDir })),
      claims: REQUIRED_CLAIMS,
      sessions: REQUIRED_SESSIONS.map((session) => ({
        id: session.id,
        claim: session.claim,
        minDurationMinutes: session.minDurationMinutes,
        evidence: Object.fromEntries(Object.entries(session.evidence).map(([field, rule]) => [field, String(rule.pattern)])),
      })),
      supportingFiles: REQUIRED_SUPPORTING_PATTERNS.map(String),
      screenshots: REQUIRED_SCREENSHOT_PATTERNS.map(String),
      logs: REQUIRED_LOG_PATTERNS.map(String),
      saveSnapshots: REQUIRED_SAVE_PATTERNS.map(String),
      captureKitFiles: REQUIRED_CAPTURE_KIT_FILES,
    },
    gates,
    captureKits,
    editions,
    blockers,
    note: 'This verifier requires real manual playthrough evidence files in each Sky Relay edition repo before Release Index promotion can remove warning validation.',
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const report = await buildReport(args)
  if (args.write) await writeJson(path.resolve(args.root, args.out), report)

  console.log(JSON.stringify(report, null, 2))
  if (args.requireReleaseReady && report.status !== 'PASS') {
    process.exitCode = 1
  }
}

await main()
