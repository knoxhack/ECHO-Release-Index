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
const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
]

const EVIDENCE_SOURCE_REPOS = {
  native: {
    source: 'sky-relay-native',
    repository: 'knoxhack/ECHO-Sky-Relay-Native-Edition',
    workspaceDir: 'ECHO-Sky-Relay-Native-Edition',
  },
  neoforge: {
    source: 'sky-relay-neoforge',
    repository: 'knoxhack/ECHO-Sky-Relay-NeoForge-Edition',
    workspaceDir: 'ECHO-Sky-Relay-NeoForge-Edition',
  },
  standalone: {
    source: 'sky-relay-standalone',
    repository: 'knoxhack/ECHO-Sky-Relay-Standalone-Edition',
    workspaceDir: 'ECHO-Sky-Relay-Standalone-Edition',
  },
}

const REQUIRED_CAPTURE_KIT_FILES = [
  'scripts/init-manual-gameplay-evidence.mjs',
  'scripts/verify-manual-gameplay-evidence.mjs',
  'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json',
  'fixtures/sky-relay/gameplay-qa/evidence/CAPTURE_CHECKLIST.md',
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
  /(^|\/)first[-_]?30[-_]?minutes[^/]*\.md$/iu,
  /(^|\/)first[-_]?2[-_]?hours[^/]*\.md$/iu,
  /(^|\/)signal[-_]?crown[^/]*\.md$/iu,
  /(^|\/)no[-_]?crash[^/]*\.md$/iu,
]

const REQUIRED_SCREENSHOT_PATTERNS = [
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

function uniqueStrings(values) {
  return new Set(values).size === values.length
}

function matchesAny(values, pattern) {
  return values.some((value) => pattern.test(String(value)))
}

function valueAt(value, pointer) {
  return String(pointer).split('.').reduce((current, part) => current?.[part], value)
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

  const claims = evidence.claims ?? {}
  result.claims = Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, claims[claim] === true]))
  for (const claim of REQUIRED_CLAIMS) {
    if (claims[claim] !== true) blockers.push(`${edition} manual evidence claim ${claim} must be true.`)
  }

  result.checked.supportingFiles = await validateFileList({
    root,
    label: `${edition}.supportingFiles`,
    values: evidence.supportingFiles,
    minItems: 4,
    requiredPatterns: REQUIRED_SUPPORTING_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      const text = await fs.readFile(filePath, 'utf8')
      if (text.includes(TEMPLATE_MARKER)) {
        fileBlockers.push(`${label}[${index}] target still contains template marker ${TEMPLATE_MARKER}: ${relPath}`)
      }
    },
  })
  result.checked.screenshots = await validateFileList({
    root,
    label: `${edition}.screenshots`,
    values: evidence.screenshots,
    minItems: 3,
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
      if (!(await fileStartsWith(filePath, ZIP_SIGNATURES))) {
        fileBlockers.push(`${label}[${index}] target is not a ZIP file: ${relPath}`)
      }
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
