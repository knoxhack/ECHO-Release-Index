import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_MANIFEST = 'channels/alpha/release-manifest.json'
const DEFAULT_EXPECTED_MODULE_COUNT = 133
const REQUIRED_RELEASE_ASSETS = [
  'checksums.sha256',
  'content-graph-evidence.json',
  'echo-module-release.tar.gz',
  'echo-module-release.tar.gz.sha256',
  'echo-release.json',
]
const REQUIRED_EVIDENCE_SCHEMA = 'echo.content_graph.evidence.v1'

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    manifest: DEFAULT_MANIFEST,
    releaseTag: null,
    expectedModuleCount: DEFAULT_EXPECTED_MODULE_COUNT,
    json: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--manifest') args.manifest = next()
    else if (arg === '--release-tag') args.releaseTag = next()
    else if (arg === '--expected-module-count') args.expectedModuleCount = Number(next())
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!Number.isInteger(args.expectedModuleCount) || args.expectedModuleCount < 1) {
    throw new Error('--expected-module-count must be a positive integer.')
  }
  args.manifestPath = path.resolve(args.root, args.manifest)
  return args
}

function printHelp() {
  console.log(`Usage:
  node scripts/verify-content-graph-release-proof.mjs [--root <path>] [--manifest channels/alpha/release-manifest.json]
  node scripts/verify-content-graph-release-proof.mjs --release-tag modules-content-graph-evidence-proof-20260615 --expected-module-count 133`)
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function parseReleaseTag(value) {
  if (!value) return ''
  const match = String(value).match(/\/releases\/tag\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function releaseTagForRepository(repository) {
  return repository.releaseTag || repository.release?.tagName || parseReleaseTag(repository.release?.htmlUrl)
}

async function jsonFiles(dir) {
  const out = []
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...await jsonFiles(full))
      else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.schema.json')) out.push(full)
    }
  } catch {
    return []
  }
  return out
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function sameOptionalNumber(left, right) {
  return left === undefined || right === undefined || Number(left) === Number(right)
}

function verifyEqual(errors, label, actual, expected) {
  if (actual !== expected) errors.push(`${label} expected ${expected}, found ${actual}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const errors = []
  const manifest = await readJson(args.manifestPath)
  const modulesRepo = (manifest.repositories ?? []).find((repository) => repository.repoName === 'ECHO-Modules')
  if (!modulesRepo) {
    errors.push('channels/alpha/release-manifest.json has no ECHO-Modules repository row')
    return finish(args, errors)
  }
  const releaseTag = args.releaseTag ?? releaseTagForRepository(modulesRepo)
  if (!releaseTag) errors.push('Unable to determine ECHO-Modules release tag from manifest')

  const assets = Array.isArray(modulesRepo.assets) ? modulesRepo.assets : []
  const assetsByName = new Map(assets.map((asset) => [asset.name, asset]))
  for (const required of REQUIRED_RELEASE_ASSETS) {
    if (!assetsByName.has(required)) errors.push(`ECHO-Modules release manifest is missing required asset ${required}`)
  }
  const evidenceAsset = assetsByName.get('content-graph-evidence.json')
  if (evidenceAsset && (!evidenceAsset.browserDownloadUrl || !evidenceAsset.sha256 || !evidenceAsset.size)) {
    errors.push('content-graph-evidence.json asset must include browserDownloadUrl, sha256, and size')
  }

  const modulesDir = path.join(args.root, 'modules')
  const moduleRows = []
  for (const filePath of await jsonFiles(modulesDir)) {
    const payload = await readJson(filePath)
    for (const row of Array.isArray(payload) ? payload : [payload]) {
      if (row?.sourceRepo === 'knoxhack/ECHO-Modules' && row?.releaseTag === releaseTag) {
        moduleRows.push({ row, filePath })
      }
    }
  }
  if (moduleRows.length !== args.expectedModuleCount) {
    errors.push(`Expected ${args.expectedModuleCount} module rows for ${releaseTag}, found ${moduleRows.length}`)
  }

  for (const { row, filePath } of moduleRows) {
    const prefix = `${rel(args.root, filePath)} ${row.id ?? '(unknown)'}`
    const graph = row.artifacts?.['content-graph']
    const evidence = row.artifacts?.['content-graph-evidence']
    if (!graph) {
      errors.push(`${prefix} missing artifacts["content-graph"]`)
    } else {
      const graphAsset = assetsByName.get(graph.file)
      if (!graphAsset) errors.push(`${prefix} content-graph artifact ${graph.file ?? '(missing file)'} is absent from release manifest assets`)
      else {
        verifyEqual(errors, `${prefix} content-graph url`, graph.url, graphAsset.browserDownloadUrl)
        verifyEqual(errors, `${prefix} content-graph sha256`, graph.sha256, graphAsset.sha256)
        if (!sameOptionalNumber(graph.size, graphAsset.size)) errors.push(`${prefix} content-graph size expected ${graphAsset.size}, found ${graph.size}`)
      }
    }
    if (!evidence) {
      errors.push(`${prefix} missing artifacts["content-graph-evidence"]`)
    } else if (evidenceAsset) {
      verifyEqual(errors, `${prefix} content-graph-evidence file`, evidence.file, 'content-graph-evidence.json')
      verifyEqual(errors, `${prefix} content-graph-evidence artifactRole`, evidence.artifactRole, 'content-graph-evidence')
      verifyEqual(errors, `${prefix} content-graph-evidence schemaVersion`, evidence.schemaVersion, REQUIRED_EVIDENCE_SCHEMA)
      verifyEqual(errors, `${prefix} content-graph-evidence url`, evidence.url, evidenceAsset.browserDownloadUrl)
      verifyEqual(errors, `${prefix} content-graph-evidence sha256`, evidence.sha256, evidenceAsset.sha256)
      if (!sameOptionalNumber(evidence.size, evidenceAsset.size)) errors.push(`${prefix} content-graph-evidence size expected ${evidenceAsset.size}, found ${evidence.size}`)
    }
  }

  return finish(args, errors, {
    schemaVersion: 'echo.release_index.content_graph_release_proof.v1',
    status: 'PASS',
    releaseTag,
    moduleRows: moduleRows.length,
    releaseAssetCount: assets.length,
    requiredReleaseAssets: REQUIRED_RELEASE_ASSETS,
    evidenceArtifact: evidenceAsset ? {
      file: evidenceAsset.name,
      url: evidenceAsset.browserDownloadUrl,
      sha256: evidenceAsset.sha256,
      size: evidenceAsset.size,
      schemaVersion: REQUIRED_EVIDENCE_SCHEMA,
    } : null,
  })
}

function finish(args, errors, summary = null) {
  if (errors.length) {
    const failure = {
      schemaVersion: 'echo.release_index.content_graph_release_proof.v1',
      status: 'FAIL',
      errors,
    }
    if (args.json) console.log(JSON.stringify(failure, null, 2))
    else {
      console.error(`Content graph release proof failed with ${errors.length} error(s):`)
      for (const error of errors) console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }
  if (args.json) console.log(JSON.stringify(summary, null, 2))
  else console.log(`Content graph release proof passed for ${summary.moduleRows} module row(s) from ${summary.releaseTag}.`)
}

await main()
