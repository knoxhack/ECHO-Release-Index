#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OUT = 'release-readiness/native-sdk-rc1-artifacts.json'
const DEFAULT_DOWNLOAD_SMOKE = 'release-readiness/native-sdk-rc1-download-smoke.json'
const RELEASE_LINE = '1.0.0-RC1'
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu
const GITHUB_RELEASE_URL_PATTERN = /^https:\/\/github\.com\/knoxhack\//u
const STABLE_TRUST_TIERS = new Set(['official', 'reproducible-build', 'echo-workflow-built', 'provenance-attested'])

const components = [
  {
    id: 'echo-native-contracts',
    artifactId: 'echo-native-contracts',
    ownerRepo: 'ECHO-Native-Platform',
    sourcePath: 'echo-native-contracts/build/libs'
  },
  {
    id: 'echoaddonapi',
    artifactId: 'echoaddonapi',
    ownerRepo: 'ECHO-Modules',
    sourcePath: 'addons/echoaddonapi/build/libs'
  },
  {
    id: 'echoadaptercore',
    artifactId: 'echoadaptercore',
    ownerRepo: 'ECHO-Modules',
    sourcePath: 'addons/echoadaptercore/build/libs'
  },
  {
    id: 'echo-native-testkit',
    artifactId: 'echo-native-testkit',
    ownerRepo: 'ECHO-Native-Platform',
    sourcePath: 'echo-native-testkit/build/libs'
  },
  {
    id: 'sdk-gradle-plugin',
    artifactId: 'echo-sdk-gradle-plugin',
    ownerRepo: 'ECHO-SDK',
    sourcePath: 'gradle-plugin/echo-addon-gradle-plugin/build/libs'
  }
]

const requiredClassifiers = [
  { classifier: 'main', suffix: '.jar' },
  { classifier: 'sources', suffix: '-sources.jar' },
  { classifier: 'javadoc', suffix: '-javadoc.jar' }
]

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    workspaceRoot: null,
    out: DEFAULT_OUT,
    downloadSmoke: DEFAULT_DOWNLOAD_SMOKE,
    write: false,
    requireReleaseReady: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--workspace-root') args.workspaceRoot = path.resolve(argv[++index])
    else if (arg === '--out') args.out = argv[++index]
    else if (arg === '--download-smoke') args.downloadSmoke = argv[++index]
    else if (arg === '--write') args.write = true
    else if (arg === '--require-release-ready') args.requireReleaseReady = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  args.root = path.resolve(args.root)
  args.workspaceRoot = args.workspaceRoot ?? path.resolve(args.root, '..')
  return args
}

function usage() {
  return `Usage: node scripts/verify-native-sdk-rc1-artifacts.mjs [options]

Verifies that the Native public SDK RC1 components have local main/source/Javadoc
jars and matching public catalog provenance before stable approval.

Options:
  --root <dir>                 Release Index repository root. Default: current directory.
  --workspace-root <dir>       Workspace containing sibling ECHO repos. Default: parent of --root.
  --out <path>                 Report path relative to --root. Default: ${DEFAULT_OUT}.
  --download-smoke <path>      Download smoke report relative to --root. Default: ${DEFAULT_DOWNLOAD_SMOKE}.
  --write                      Write the JSON report.
  --require-release-ready      Fail if local jars or public provenance are incomplete.
  --help                       Print this help text.
`
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function requiredFiles(component) {
  return requiredClassifiers.map((required) => ({
    classifier: required.classifier,
    fileName: `${component.artifactId}-${RELEASE_LINE}${required.suffix}`
  }))
}

async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function fileEvidence(filePath) {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) return { exists: false, reason: 'not-file' }
    const bytes = await fs.readFile(filePath)
    return {
      exists: true,
      size: stat.size,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, reason: 'missing' }
    throw error
  }
}

async function jsonFiles(root, relDir) {
  const dir = path.join(root, relDir)
  const out = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const childRel = rel(root, full)
      if (entry.isDirectory()) out.push(...await jsonFiles(root, childRel))
      else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.schema.json')) out.push(full)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return out
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
    return
  }
  if (!value || typeof value !== 'object') return
  visit(value)
  for (const item of Object.values(value)) walk(item, visit)
}

function artifactRecords(entry, filePath, root) {
  const records = []
  walk(entry?.artifacts, (node) => {
    const fileName = node?.file ?? node?.name ?? node?.filename
    if (!fileName) return
    records.push({
      entryId: entry.id,
      entryKind: entry.kind,
      entryValidation: entry.validation,
      entryTrust: entry.trust,
      entryReleaseTag: entry.releaseTag,
      entrySourceRepo: entry.sourceRepo,
      catalogPath: rel(root, filePath),
      fileName: String(fileName),
      url: typeof node.url === 'string' ? node.url : null,
      sha256: typeof node.sha256 === 'string' ? node.sha256.toLowerCase() : null,
      size: Number.isFinite(Number(node.size)) ? Number(node.size) : null
    })
  })
  return records
}

async function catalogArtifactRecords(root) {
  const records = []
  for (const dir of ['products', 'modules', 'addons']) {
    for (const filePath of await jsonFiles(root, dir)) {
      const payload = await readJsonOrNull(filePath)
      const rows = Array.isArray(payload) ? payload : [payload]
      for (const entry of rows.filter(Boolean)) {
        records.push(...artifactRecords(entry, filePath, root))
      }
    }
  }
  return records
}

function recordMatchesLocal(record, local) {
  if (!record.url || !GITHUB_RELEASE_URL_PATTERN.test(record.url)) return false
  if (!SHA256_PATTERN.test(String(record.sha256 ?? ''))) return false
  if (!Number.isFinite(record.size) || record.size <= 0) return false
  if (!local.exists) return true
  return record.sha256 === local.sha256 && record.size === local.size
}

function recordIsStableProvenance(record) {
  return record.entryValidation === 'approved' && STABLE_TRUST_TIERS.has(record.entryTrust)
}

function summarizeMatches(records, local) {
  return records.map((record) => ({
    ...record,
    matchesLocalBytes: recordMatchesLocal(record, local),
    stableProvenance: recordIsStableProvenance(record)
  }))
}

function downloadSmokeIsComplete(report) {
  if (report?.schemaVersion !== 'echo.native_sdk.rc1-download-smoke.v1') return false
  if (report.status !== 'PASS') return false
  if (report.release?.id !== 'echo-native-sdk') return false
  if (report.release?.version !== RELEASE_LINE) return false
  if (report.release?.releaseTag !== `v${RELEASE_LINE}`) return false
  if (report.summary?.artifactCount !== 15) return false
  if (report.summary?.downloadedCount !== 15) return false
  if (report.summary?.matchedCount !== 15) return false
  if (report.gates?.catalogEntry !== 'passed') return false
  if (report.gates?.artifactSetComplete !== 'passed') return false
  if (report.gates?.downloadBackArtifacts !== 'passed') return false
  if (report.gates?.checksumMatch !== 'passed') return false
  return true
}

function downloadSmokeBlockers(report, reportPath) {
  if (!report) return [`Native SDK RC1 download smoke report is missing at ${reportPath}`]
  const blockers = []
  if (report.schemaVersion !== 'echo.native_sdk.rc1-download-smoke.v1') blockers.push('Native SDK RC1 download smoke report has an unexpected schema')
  if (report.status !== 'PASS') blockers.push('Native SDK RC1 download smoke report is not PASS')
  if (report.release?.id !== 'echo-native-sdk') blockers.push('Native SDK RC1 download smoke report does not target echo-native-sdk')
  if (report.release?.version !== RELEASE_LINE) blockers.push(`Native SDK RC1 download smoke report version is not ${RELEASE_LINE}`)
  if (report.release?.releaseTag !== `v${RELEASE_LINE}`) blockers.push(`Native SDK RC1 download smoke report releaseTag is not v${RELEASE_LINE}`)
  if (report.summary?.artifactCount !== 15) blockers.push(`Native SDK RC1 download smoke must cover 15 artifacts, found ${report.summary?.artifactCount ?? 'unknown'}`)
  if (report.summary?.downloadedCount !== 15) blockers.push(`Native SDK RC1 download smoke must download 15 artifacts, found ${report.summary?.downloadedCount ?? 'unknown'}`)
  if (report.summary?.matchedCount !== 15) blockers.push(`Native SDK RC1 download smoke must checksum-match 15 artifacts, found ${report.summary?.matchedCount ?? 'unknown'}`)
  for (const [gate, value] of Object.entries(report.gates ?? {})) {
    if (value !== 'passed') blockers.push(`Native SDK RC1 download smoke gate ${gate} is ${value}`)
  }
  for (const blocker of report.blockers ?? []) blockers.push(`Native SDK RC1 download smoke: ${blocker}`)
  return blockers
}

async function verify(args) {
  const catalogRecords = await catalogArtifactRecords(args.root)
  const downloadSmokePath = path.isAbsolute(args.downloadSmoke) ? args.downloadSmoke : path.join(args.root, args.downloadSmoke)
  const downloadSmoke = await readJsonOrNull(downloadSmokePath)
  const downloadBackArtifactsComplete = downloadSmokeIsComplete(downloadSmoke)
  const blockers = []
  const componentReports = []

  for (const component of components) {
    const componentRoot = path.join(args.workspaceRoot, component.ownerRepo)
    const artifactDir = path.join(componentRoot, component.sourcePath)
    const fileReports = []

    for (const required of requiredFiles(component)) {
      const target = path.join(artifactDir, required.fileName)
      const local = await fileEvidence(target)
      const matches = summarizeMatches(
        catalogRecords.filter((record) => record.fileName === required.fileName),
        local
      )
      const hasMatchingPublicCatalog = matches.some((record) => record.matchesLocalBytes)
      const hasStablePublicProvenance = matches.some((record) => record.matchesLocalBytes && record.stableProvenance)

      fileReports.push({
        classifier: required.classifier,
        fileName: required.fileName,
        path: rel(componentRoot, target),
        absolutePath: target,
        exists: local.exists,
        size: local.size,
        sha256: local.sha256,
        missingReason: local.exists ? undefined : local.reason,
        publicCatalogMatches: matches,
        hasMatchingPublicCatalog,
        hasStablePublicProvenance
      })
    }

    const localStatus = fileReports.every((file) => file.exists && Number(file.size) > 0 && SHA256_PATTERN.test(file.sha256 ?? ''))
      ? 'PASS'
      : 'BLOCKED'
    const publicCatalogStatus = fileReports.every((file) => file.hasMatchingPublicCatalog) ? 'PASS' : 'BLOCKED'
    const stableProvenanceStatus = fileReports.every((file) => file.hasStablePublicProvenance) ? 'PASS' : 'BLOCKED'
    const componentBlockers = []

    for (const file of fileReports) {
      if (!file.exists) componentBlockers.push(`${component.id} missing ${file.classifier} jar ${file.fileName}`)
      else if (!file.hasMatchingPublicCatalog) componentBlockers.push(`${component.id} ${file.fileName} has no matching public catalog artifact with GitHub URL, size, and SHA-256`)
      else if (!file.hasStablePublicProvenance) componentBlockers.push(`${component.id} ${file.fileName} is not backed by approved non-source-linked catalog provenance`)
    }

    blockers.push(...componentBlockers)
    componentReports.push({
      ...component,
      sourceRoot: componentRoot,
      artifactDir: rel(componentRoot, artifactDir),
      localStatus,
      publicCatalogStatus,
      stableProvenanceStatus,
      files: fileReports,
      blockers: componentBlockers
    })
  }

  const totalRequiredFiles = componentReports.reduce((sum, component) => sum + component.files.length, 0)
  const localPresentFiles = componentReports.reduce((sum, component) => sum + component.files.filter((file) => file.exists).length, 0)
  const publicCatalogMatchedFiles = componentReports.reduce((sum, component) => sum + component.files.filter((file) => file.hasMatchingPublicCatalog).length, 0)
  const stableProvenanceFiles = componentReports.reduce((sum, component) => sum + component.files.filter((file) => file.hasStablePublicProvenance).length, 0)

  const smokeBlockers = downloadSmokeBlockers(downloadSmoke, rel(args.root, downloadSmokePath))
  if (!downloadBackArtifactsComplete) blockers.push(...smokeBlockers)

  const gates = {
    localMainSourceJavadocJars: localPresentFiles === totalRequiredFiles ? 'passed' : 'blocked',
    publicCatalogArtifacts: publicCatalogMatchedFiles === totalRequiredFiles ? 'passed' : 'blocked',
    downloadBackArtifacts: downloadBackArtifactsComplete ? 'passed' : 'blocked',
    stablePublicProvenance: stableProvenanceFiles === totalRequiredFiles ? 'passed' : 'blocked'
  }
  const status = Object.values(gates).every((gate) => gate === 'passed') ? 'PASS' : 'BLOCKED'

  return {
    schemaVersion: 'echo.native_sdk.rc1-artifacts.v1',
    status,
    generatedAt: new Date().toISOString(),
    releaseLine: RELEASE_LINE,
    scope: 'Native public SDK RC1 main/source/Javadoc artifact set',
    releaseIndexRoot: args.root,
    workspaceRoot: args.workspaceRoot,
    summary: {
      componentCount: componentReports.length,
      requiredFileCount: totalRequiredFiles,
      localPresentFileCount: localPresentFiles,
      publicCatalogMatchedFileCount: publicCatalogMatchedFiles,
      downloadBackMatchedFileCount: downloadBackArtifactsComplete ? totalRequiredFiles : 0,
      stableProvenanceFileCount: stableProvenanceFiles
    },
    gates,
    downloadSmoke: downloadSmoke
      ? {
          path: rel(args.root, downloadSmokePath),
          schemaVersion: downloadSmoke.schemaVersion,
          status: downloadSmoke.status,
          generatedAt: downloadSmoke.generatedAt,
          mode: downloadSmoke.mode,
          release: downloadSmoke.release,
          summary: downloadSmoke.summary,
          gates: downloadSmoke.gates,
          blockers: downloadSmoke.blockers ?? []
        }
      : {
          path: rel(args.root, downloadSmokePath),
          status: 'missing',
          blockers: smokeBlockers
        },
    components: componentReports,
    promotion: {
      localSdkArtifactSetComplete: gates.localMainSourceJavadocJars === 'passed',
      publicSdkArtifactDistributionComplete: gates.publicCatalogArtifacts === 'passed' && gates.downloadBackArtifacts === 'passed',
      stableSdkProvenanceComplete: gates.stablePublicProvenance === 'passed',
      stableReleaseCanUseSdkEvidence: status === 'PASS'
    },
    blockers,
    notes: [
      'Local Gradle outputs prove only that the SDK jars were built in this workspace.',
      'Download-back evidence proves the indexed SDK release URLs return bytes with exact size/SHA-256 matches.',
      'Stable release approval requires matching public catalog artifacts with GitHub URLs, exact size/SHA-256, validation approved, and a non-source-linked trust tier.',
      'Keep echo-native-loader out of this public SDK set; it is loader-internal and must not be an addon-facing dependency.'
    ]
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  const report = await verify(args)
  if (args.write) {
    const outPath = path.isAbsolute(args.out) ? args.out : path.join(args.root, args.out)
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  console.log(JSON.stringify(report, null, 2))

  if (args.requireReleaseReady && report.status !== 'PASS') {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
