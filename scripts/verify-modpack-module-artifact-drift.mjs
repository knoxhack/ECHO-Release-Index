#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_OWNER = 'knoxhack'

function parseArgs(argv) {
  const args = { root: process.cwd(), owner: DEFAULT_OWNER, strict: false, live: false, write: false, out: null, only: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--owner') args.owner = next()
    else if (arg === '--strict') args.strict = true
    else if (arg === '--live') args.live = true
    else if (arg === '--write') args.write = true
    else if (arg === '--out') args.out = next()
    else if (arg === '--only') {
      args.only ??= new Set()
      next().split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => args.only.add(item))
    }
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function usage() {
  return `Usage: node scripts/verify-modpack-module-artifact-drift.mjs [--strict] [--live] [--write] [--only <id[,id]>] [--out <path>]

Verifies official pack manifests are pinned to the current Release Index module
artifact URLs, sizes, and SHA-256 hashes.
`
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function loadModules(root) {
  const modules = new Map()
  for (const fileName of await fs.readdir(path.join(root, 'modules'))) {
    if (!fileName.endsWith('.json')) continue
    const entry = await readJson(path.join(root, 'modules', fileName))
    if (entry?.kind === 'module' && entry.id) modules.set(entry.id, entry)
  }
  return modules
}

async function loadModpackRows(root, owner) {
  const rows = []
  for (const fileName of (await fs.readdir(path.join(root, 'modpacks'))).sort()) {
    if (!fileName.endsWith('.json')) continue
    const modpackPath = path.join(root, 'modpacks', fileName)
    const modpack = await readJson(modpackPath)
    if (modpack.kind !== 'modpack' || !String(modpack.sourceRepo ?? '').startsWith(`${owner}/ECHO-`)) continue
    rows.push({ modpack, modpackPath, catalogPath: path.relative(root, modpackPath).replace(/\\/gu, '/') })
  }
  return rows
}

function artifactKeyForFamily(family, loader) {
  if (family === 'echo-addon' || family === 'native' || loader === 'echo-native-loader') return 'native'
  if (family === 'neoforge' || loader === 'neoforge') return 'neoforge'
  if (family === 'standalone' || loader === 'echo-standalone-runtime') return 'standalone'
  return null
}

function localReleaseDir(root, row) {
  const repoName = row.modpack.sourceRepo.split('/').at(-1)
  return path.resolve(root, '..', repoName, 'release-assets', row.modpack.releaseTag)
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'echo-release-index-modpack-drift' } })
  if (!response.ok) throw new Error(`GET ${url} failed ${response.status}: ${await response.text()}`)
  return response.json()
}

async function loadManifest(args, row) {
  const artifact = row.modpack.artifacts?.manifest
  if (!artifact?.file) throw new Error(`${row.catalogPath} is missing manifest artifact.`)
  if (args.live) return fetchJson(artifact.url)
  const localPath = path.join(localReleaseDir(args.root, row), artifact.file)
  if (!await exists(localPath)) throw new Error(`${row.catalogPath} local manifest is missing: ${localPath}`)
  return readJson(localPath)
}

function compareField(blockers, moduleId, container, actual, expected, field) {
  if (actual?.[field] !== expected?.[field]) {
    blockers.push(`${moduleId} ${container}.${field} expected ${JSON.stringify(expected?.[field])} but found ${JSON.stringify(actual?.[field])}`)
  }
}

function expectedRecord(moduleEntry, artifactKey, current = {}) {
  const artifact = moduleEntry.artifacts?.[artifactKey]
  if (!artifact) return null
  const prefix = String(current.path ?? '').includes('/') ? String(current.path).split('/').slice(0, -1).join('/') : artifactKey === 'native' ? 'addons' : 'mods'
  const family = artifactKey === 'native' ? 'echo-addon' : artifactKey
  return {
    id: moduleEntry.id,
    moduleId: moduleEntry.id,
    version: moduleEntry.version,
    artifactFamily: family,
    assetName: artifact.file,
    artifactName: artifact.file,
    path: `${prefix}/${artifact.file}`,
    sha256: artifact.sha256,
    size: artifact.size,
    url: artifact.url,
  }
}

function moduleCompatibilityExcludesPack(moduleEntry, packId) {
  const compatibility = Array.isArray(moduleEntry.compatibility)
    ? moduleEntry.compatibility.map(String).filter(Boolean)
    : []
  return compatibility.length > 0 && !compatibility.includes(packId)
}

async function auditRow(args, row, modules) {
  const blockers = []
  const warnings = []
  const skipped = []
  const manifest = await loadManifest(args, row)
  const requirements = manifest.moduleRequirements ?? []
  const files = manifest.files ?? []
  const artifactKey = artifactKeyForFamily(manifest.moduleArtifactFamily, manifest.loader)
  if (!artifactKey) blockers.push(`${row.modpack.id} has unsupported module artifact family ${manifest.moduleArtifactFamily ?? '(missing)'}.`)
  if (!requirements.length) blockers.push(`${row.modpack.id} has no moduleRequirements.`)
  if (!files.length) blockers.push(`${row.modpack.id} has no files.`)

  const filesByModule = new Map(files.map((file) => [file.moduleId ?? file.id, file]))
  const checked = []
  for (const requirement of requirements) {
    const moduleId = requirement.moduleId ?? requirement.id
    const moduleEntry = modules.get(moduleId)
    if (!moduleEntry) {
      blockers.push(`${row.modpack.id} requires unknown module ${moduleId}.`)
      continue
    }
    if (moduleCompatibilityExcludesPack(moduleEntry, row.modpack.id)) {
      skipped.push(moduleId)
      warnings.push(`${moduleId} current module catalog row is scoped to ${moduleEntry.compatibility.join(', ')}; ${row.modpack.id} remains pinned to its pack release artifact.`)
      continue
    }
    const expected = expectedRecord(moduleEntry, artifactKey, requirement)
    if (!expected) {
      blockers.push(`${moduleId} is missing ${artifactKey} artifact metadata.`)
      continue
    }
    for (const field of ['id', 'moduleId', 'version', 'artifactFamily', 'assetName', 'artifactName', 'path', 'sha256', 'size', 'url']) {
      compareField(blockers, moduleId, 'moduleRequirements', requirement, expected, field)
    }
    const file = filesByModule.get(moduleId)
    if (!file) {
      blockers.push(`${moduleId} is missing from files.`)
    } else {
      for (const field of ['id', 'moduleId', 'version', 'artifactFamily', 'assetName', 'artifactName', 'path', 'sha256', 'size', 'url']) {
        compareField(blockers, moduleId, 'files', file, expected, field)
      }
    }
    checked.push(moduleId)
  }

  if (manifest.artifactName && row.modpack.artifacts?.pack?.file && manifest.artifactName !== row.modpack.artifacts.pack.file) {
    blockers.push(`${row.modpack.id} manifest artifactName ${manifest.artifactName} does not match catalog pack file ${row.modpack.artifacts.pack.file}.`)
  }
  if (manifest.artifactSha256 && row.modpack.artifacts?.pack?.sha256 && manifest.artifactSha256 !== row.modpack.artifacts.pack.sha256) {
    blockers.push(`${row.modpack.id} manifest artifactSha256 does not match catalog pack sha256.`)
  }
  if (manifest.artifactSize && row.modpack.artifacts?.pack?.size && manifest.artifactSize !== row.modpack.artifacts.pack.size) {
    blockers.push(`${row.modpack.id} manifest artifactSize does not match catalog pack size.`)
  }

  return {
    id: row.modpack.id,
    catalogPath: row.catalogPath,
    releaseTag: row.modpack.releaseTag,
    manifestSource: args.live ? 'live-github' : 'local-release-assets',
    moduleArtifactFamily: manifest.moduleArtifactFamily,
    moduleCount: checked.length,
    skippedModuleCount: skipped.length,
    status: blockers.length ? 'fail' : warnings.length ? 'warning' : 'pass',
    blockers,
    warnings,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const modules = await loadModules(args.root)
  const rows = (await loadModpackRows(args.root, args.owner)).filter((row) => {
    if (!args.only) return true
    const repoName = row.modpack.sourceRepo.split('/').at(-1)
    return args.only.has(row.modpack.id) || args.only.has(repoName)
  })
  if (args.only && rows.length === 0) {
    throw new Error(`No official modpacks matched --only ${[...args.only].join(', ')}.`)
  }
  const reports = []
  for (const row of rows) reports.push(await auditRow(args, row, modules))
  const blockers = reports.flatMap((report) => report.blockers.map((blocker) => `${report.id}: ${blocker}`))
  const report = {
    schemaVersion: 'echo.modpack_module_artifact_drift.v1',
    generatedAt: new Date().toISOString(),
    source: args.live ? 'live-github' : 'local-release-assets',
    status: blockers.length ? 'fail' : 'pass',
    moduleCatalogCount: modules.size,
    modpackCount: reports.length,
    failingModpackCount: reports.filter((entry) => entry.status === 'fail').length,
    warningModpackCount: reports.filter((entry) => entry.status === 'warning').length,
    skippedModuleComparisonCount: reports.reduce((total, entry) => total + (entry.skippedModuleCount ?? 0), 0),
    blockers,
    modpacks: reports,
  }

  if (args.write || args.out) {
    const output = args.out
      ? (path.isAbsolute(args.out) ? args.out : path.join(args.root, args.out))
      : path.join(args.root, 'release-readiness', 'modpack-module-artifact-drift.json')
    await writeJson(output, report)
  }
  if (blockers.length) {
    console.error(`Modpack module artifact drift failed with ${blockers.length} blocker(s):`)
    for (const blocker of blockers) console.error(`- ${blocker}`)
    if (args.strict) process.exit(1)
  } else {
    console.log(`Modpack module artifact drift passed for ${reports.length} official pack manifest(s).`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
