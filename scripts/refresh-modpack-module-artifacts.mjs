#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execFileSync, spawnSync } from 'node:child_process'

const DEFAULT_OWNER = 'knoxhack'
const DEFAULT_MODULE_RELEASE = 'release-index-current-module-artifacts-20260616'
const DEFAULT_MODULE_SOURCE_REVISION = 'ECHO-Release-Index modules/*.json current artifacts, 2026-06-16'
const REQUIRED_ROLES = ['pack', 'manifest', 'checksums', 'releaseManifest']
const OPTIONAL_ROLES = ['releaseAudit']

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    workspaceRoot: path.resolve(process.cwd(), '..'),
    owner: DEFAULT_OWNER,
    write: false,
    rebuildAssets: false,
    moduleDist: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--workspace-root') args.workspaceRoot = path.resolve(next())
    else if (arg === '--owner') args.owner = next()
    else if (arg === '--module-dist') args.moduleDist = path.resolve(next())
    else if (arg === '--write') args.write = true
    else if (arg === '--rebuild-assets') args.rebuildAssets = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  args.moduleDist ??= path.join(args.workspaceRoot, 'ECHO-Modules', 'dist', 'adaptercore-receipt-spine-release')
  return args
}

function usage() {
  return `Usage: node scripts/refresh-modpack-module-artifacts.mjs [--write] [--rebuild-assets]

Refreshes official modpack catalog metadata from each owning pack repo's
release-assets/<tag> directory. With --rebuild-assets it first rewrites pack
manifests, pack zips, echo-release.json, checksums.txt, and release-audit.json
from the current Release Index module catalog.
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

async function sha256File(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
}

async function assetStats(filePath) {
  const stats = await fs.stat(filePath)
  return { sha256: await sha256File(filePath), size: stats.size }
}

function githubDownloadUrl(owner, repoName, tag, fileName) {
  return `https://github.com/${owner}/${repoName}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(fileName)}`.replace(/%2F/giu, '/')
}

function posixJoin(...parts) {
  return parts.filter(Boolean).join('/').replace(/\\/gu, '/').replace(/\/+/gu, '/')
}

function dirnamePosix(filePath) {
  const normalized = String(filePath ?? '').replace(/\\/gu, '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? '' : normalized.slice(0, index)
}

function artifactKeyForFamily(family) {
  if (family === 'echo-addon' || family === 'native') return 'native'
  if (family === 'neoforge') return 'neoforge'
  if (family === 'standalone') return 'standalone'
  throw new Error(`Unsupported module artifact family: ${family}`)
}

function defaultInstallPrefix(family) {
  return family === 'echo-addon' || family === 'native' ? 'addons' : 'mods'
}

function gitShortSha(repoRoot) {
  return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
}

async function loadModules(root) {
  const modulesRoot = path.join(root, 'modules')
  const modules = new Map()
  for (const name of await fs.readdir(modulesRoot)) {
    if (!name.endsWith('.json')) continue
    const entry = await readJson(path.join(modulesRoot, name))
    if (entry?.kind === 'module' && entry.id) modules.set(entry.id, entry)
  }
  return modules
}

async function loadOfficialModpacks(root) {
  const modpacksRoot = path.join(root, 'modpacks')
  const rows = []
  for (const name of (await fs.readdir(modpacksRoot)).sort()) {
    if (!name.endsWith('.json')) continue
    const modpackPath = path.join('modpacks', name)
    const modpack = await readJson(path.join(root, modpackPath))
    if (modpack.kind !== 'modpack' || !String(modpack.sourceRepo ?? '').startsWith(`${DEFAULT_OWNER}/ECHO-`)) continue
    const packPath = path.join('packs', `${modpack.id}.json`)
    if (!await exists(path.join(root, packPath))) throw new Error(`Missing pack catalog row for ${modpack.id}: ${packPath}`)
    rows.push({ modpackPath, packPath, modpack })
  }
  return rows
}

function releaseDirFor(args, row) {
  const repoName = row.modpack.sourceRepo.split('/').at(-1)
  return path.join(args.workspaceRoot, repoName, 'release-assets', row.modpack.releaseTag)
}

function repoRootFor(args, row) {
  return path.join(args.workspaceRoot, row.modpack.sourceRepo.split('/').at(-1))
}

function findSingle(files, predicate, label, releaseDir) {
  const matches = files.filter(predicate)
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} in ${releaseDir}; found ${matches.length}.`)
  }
  return matches[0]
}

async function releaseAssetNames(releaseDir) {
  return (await fs.readdir(releaseDir)).filter((name) => !name.endsWith('/')).sort()
}

async function findModuleArtifact(args, moduleId, artifact) {
  const modulesRoot = path.join(args.workspaceRoot, 'ECHO-Modules')
  const candidates = [
    path.join(args.moduleDist, moduleId, artifact.file),
    path.join(modulesRoot, 'dist', 'adaptercore-receipt-spine-upload', artifact.file),
    path.join(modulesRoot, 'tmp', 'adaptercore-receipt-spine-download', artifact.file),
    path.join(modulesRoot, 'dist', 'echo-module-release', moduleId, artifact.file),
  ]
  for (const candidate of candidates) {
    if (!await exists(candidate)) continue
    const actual = await assetStats(candidate)
    if (actual.sha256 === artifact.sha256 && actual.size === artifact.size) return candidate
  }

  const downloadDir = path.join(args.root, 'tmp', 'official-modpack-module-downloads')
  await fs.mkdir(downloadDir, { recursive: true })
  const downloadPath = path.join(downloadDir, artifact.file)
  if (await exists(downloadPath)) {
    const cached = await assetStats(downloadPath)
    if (cached.sha256 === artifact.sha256 && cached.size === artifact.size) return downloadPath
    await fs.rm(downloadPath, { force: true })
  }
  if (!await exists(downloadPath)) {
    const response = await fetch(artifact.url, { headers: { 'user-agent': 'echo-release-index-modpack-refresh' } })
    if (!response.ok) throw new Error(`Failed to download ${artifact.url}: ${response.status} ${await response.text()}`)
    await fs.writeFile(downloadPath, Buffer.from(await response.arrayBuffer()))
  }
  const actual = await assetStats(downloadPath)
  if (actual.sha256 !== artifact.sha256 || actual.size !== artifact.size) {
    throw new Error(`Downloaded ${artifact.file} does not match catalog SHA/size.`)
  }
  return downloadPath
}

function updateRequirement(requirement, modules, family) {
  const moduleId = requirement.moduleId ?? requirement.id
  const moduleEntry = modules.get(moduleId)
  if (!moduleEntry) throw new Error(`Pack requires unknown module ${moduleId}.`)
  const artifact = moduleEntry.artifacts?.[artifactKeyForFamily(family)]
  if (!artifact) throw new Error(`${moduleId} is missing ${family} artifact metadata.`)
  const prefix = dirnamePosix(requirement.path) || defaultInstallPrefix(family)
  return {
    ...requirement,
    id: moduleEntry.id,
    moduleId: moduleEntry.id,
    version: moduleEntry.version,
    artifactFamily: family,
    assetName: artifact.file,
    artifactName: artifact.file,
    path: posixJoin(prefix, artifact.file),
    required: requirement.required ?? true,
    side: requirement.side ?? 'both',
    sha256: artifact.sha256,
    size: artifact.size,
    url: artifact.url,
  }
}

async function writeChecksums(filePath, rows) {
  const lines = rows
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((row) => `${row.sha256}  ${row.path}`)
  await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8')
}

async function stagePack(args, row, manifest, requirements, modules) {
  const repoRoot = repoRootFor(args, row)
  const stageRoot = path.join(repoRoot, 'tmp', 'rebuild-official-modpack-assets', manifest.id ?? manifest.pack)
  await fs.rm(stageRoot, { recursive: true, force: true })
  await fs.mkdir(path.join(stageRoot, '.echo'), { recursive: true })

  const embeddedManifest = { ...manifest }
  delete embeddedManifest.artifactSha256
  delete embeddedManifest.artifactSize
  await writeJson(path.join(stageRoot, '.echo', 'pack-manifest.json'), embeddedManifest)

  const exportReport = {
    schemaVersion: 'echo.official_modpack.export_report.v1',
    status: 'rebuilt',
    pack: manifest.id ?? manifest.pack,
    name: manifest.name,
    channel: manifest.channel,
    version: manifest.version,
    runtimeTarget: manifest.runtimeTarget ?? manifest.loader ?? manifest.moduleArtifactFamily,
    moduleArtifactFamily: manifest.moduleArtifactFamily,
    moduleRelease: manifest.moduleRelease,
    moduleCount: requirements.length,
    generatedAt: new Date().toISOString(),
    sourceRepo: row.modpack.sourceRepo,
    releaseTag: row.modpack.releaseTag,
  }
  await writeJson(path.join(stageRoot, '.echo', 'export-report.json'), exportReport)

  for (const requirement of requirements) {
    const moduleEntry = modules.get(requirement.id)
    const source = await findModuleArtifact(args, requirement.id, moduleEntry.artifacts[artifactKeyForFamily(manifest.moduleArtifactFamily)])
    const destination = path.join(stageRoot, ...requirement.path.split('/'))
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(source, destination)
    const actual = await assetStats(destination)
    if (actual.sha256 !== requirement.sha256 || actual.size !== requirement.size) {
      throw new Error(`${requirement.path} copied bytes do not match catalog metadata.`)
    }
  }

  const checksumRows = []
  for (const relativePath of [
    '.echo/pack-manifest.json',
    '.echo/export-report.json',
    ...requirements.map((requirement) => requirement.path),
  ]) {
    checksumRows.push({ path: relativePath, ...(await assetStats(path.join(stageRoot, ...relativePath.split('/')))) })
  }
  await writeChecksums(path.join(stageRoot, '.echo', 'checksums.sha256'), checksumRows)

  return {
    stageRoot,
    zipEntries: [
      '.echo/checksums.sha256',
      '.echo/export-report.json',
      '.echo/pack-manifest.json',
      ...requirements.map((requirement) => requirement.path),
    ],
  }
}

async function createZip(zipPath, stage) {
  await fs.rm(zipPath, { force: true })
  const result = spawnSync('tar', ['-a', '-cf', zipPath, '-C', stage.stageRoot, ...stage.zipEntries], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`tar failed creating ${zipPath}:\n${result.stdout}\n${result.stderr}`)
  }
}

async function rebuildPackAssets(args, row, modules) {
  const repoRoot = repoRootFor(args, row)
  const releaseDir = releaseDirFor(args, row)
  const templatePath = path.join(repoRoot, 'release-manifest.template.json')
  const template = await readJson(templatePath)
  const family = template.moduleArtifactFamily
  if (!family) throw new Error(`${templatePath} is missing moduleArtifactFamily.`)

  const requirements = (template.moduleRequirements ?? []).map((requirement) => updateRequirement(requirement, modules, family))
  const manifest = {
    ...template,
    id: template.id ?? row.modpack.id,
    artifactUrl: githubDownloadUrl(args.owner, row.modpack.sourceRepo.split('/').at(-1), row.modpack.releaseTag, template.artifactName),
    updatedAt: new Date().toISOString(),
    generatedBy: 'scripts/rebuild-official-modpack-assets',
    validation: row.modpack.validation,
    manifestAsset: template.manifestAsset,
    moduleRelease: DEFAULT_MODULE_RELEASE,
    moduleSourceRevision: DEFAULT_MODULE_SOURCE_REVISION,
    moduleRequirements: requirements,
    files: requirements.map((requirement) => ({ ...requirement })),
    modules: requirements.map((requirement) => requirement.id),
  }

  const stage = await stagePack(args, row, manifest, requirements, modules)
  const packZipPath = path.join(releaseDir, manifest.artifactName)
  await createZip(packZipPath, stage)
  const packStats = await assetStats(packZipPath)
  manifest.artifactSha256 = packStats.sha256
  manifest.artifactSize = packStats.size

  const manifestPath = path.join(releaseDir, manifest.manifestAsset)
  await writeJson(manifestPath, manifest)
  await writeJson(templatePath, manifest)
  const manifestStats = await assetStats(manifestPath)

  const releaseAuditPath = path.join(releaseDir, 'release-audit.json')
  const releaseAudit = {
    schemaVersion: 'echo.official_modpack.release_audit.v1',
    status: 'rebuilt-from-current-module-catalog',
    pack: manifest.id,
    name: manifest.name,
    version: manifest.version,
    channel: manifest.channel,
    moduleRelease: manifest.moduleRelease,
    moduleSourceRevision: manifest.moduleSourceRevision,
    releaseTag: row.modpack.releaseTag,
    sourceRepo: row.modpack.sourceRepo,
    moduleCount: requirements.length,
    artifact: { name: manifest.artifactName, ...packStats },
    manifest: { name: manifest.manifestAsset, ...manifestStats },
    generatedAt: new Date().toISOString(),
  }
  await writeJson(releaseAuditPath, releaseAudit)
  const releaseAuditStats = await assetStats(releaseAuditPath)

  const releaseManifestPath = path.join(releaseDir, 'echo-release.json')
  const releaseManifest = {
    formatVersion: 2,
    pack: manifest.pack ?? manifest.id,
    name: manifest.name,
    version: manifest.version,
    channel: manifest.channel,
    releasedAt: new Date().toISOString(),
    manifestAsset: manifest.manifestAsset,
    manifestSha256: manifestStats.sha256,
    manifestSize: manifestStats.size,
    artifactMode: 'zip',
    artifactAsset: manifest.artifactName,
    artifactSha256: packStats.sha256,
    artifactSize: packStats.size,
    moduleRelease: manifest.moduleRelease,
    packs: [
      {
        pack: manifest.pack ?? manifest.id,
        name: manifest.name,
        version: manifest.version,
        channel: manifest.channel,
        manifestAsset: manifest.manifestAsset,
        artifactAsset: manifest.artifactName,
      },
    ],
    assets: [
      { name: manifest.manifestAsset, role: 'pack-manifest', ...manifestStats },
      { name: manifest.artifactName, role: 'pack-artifact', ...packStats },
      ...requirements.map((requirement) => ({
        name: requirement.assetName,
        role: 'pack-file',
        path: requirement.path,
        sha256: requirement.sha256,
        size: requirement.size,
      })),
    ],
    notes: [
      `${manifest.name} refreshed against the current Release Index module catalog.`,
      'Pack module files, sidecar metadata, and archive checksums are pinned to current GitHub module artifacts.',
    ],
    moduleSourceRevision: manifest.moduleSourceRevision,
  }
  await writeJson(releaseManifestPath, releaseManifest)
  const releaseManifestStats = await assetStats(releaseManifestPath)

  await writeChecksums(path.join(releaseDir, 'checksums.txt'), [
    { path: manifest.artifactName, ...packStats },
    { path: manifest.manifestAsset, ...manifestStats },
    { path: 'echo-release.json', ...releaseManifestStats },
    { path: 'release-audit.json', ...releaseAuditStats },
  ])

  return {
    pack: { file: manifest.artifactName, ...packStats },
    manifest: { file: manifest.manifestAsset, ...manifestStats },
    releaseManifest: { file: 'echo-release.json', ...releaseManifestStats },
    releaseAudit: { file: 'release-audit.json', ...releaseAuditStats },
  }
}

async function refreshCatalogRow(args, row) {
  const repoRoot = repoRootFor(args, row)
  const repoName = row.modpack.sourceRepo.split('/').at(-1)
  const releaseDir = releaseDirFor(args, row)
  const files = await releaseAssetNames(releaseDir)
  const roleFiles = {
    pack: findSingle(files, (name) => name.endsWith('.zip'), 'pack zip', releaseDir),
    manifest: findSingle(files, (name) => name.endsWith('.pack.json'), 'pack manifest', releaseDir),
    checksums: 'checksums.txt',
    releaseManifest: 'echo-release.json',
  }
  if (files.includes('release-audit.json')) roleFiles.releaseAudit = 'release-audit.json'

  const modpack = await readJson(path.join(args.root, row.modpackPath))
  const pack = await readJson(path.join(args.root, row.packPath))
  const assetsByName = new Map((pack.assets ?? []).map((asset) => [asset.name, asset]))
  modpack.commitSha = gitShortSha(repoRoot)
  pack.commitSha = modpack.commitSha
  pack.releaseTag = modpack.releaseTag

  for (const role of [...REQUIRED_ROLES, ...OPTIONAL_ROLES]) {
    const fileName = roleFiles[role]
    if (!fileName) continue
    const filePath = path.join(releaseDir, fileName)
    const stats = await assetStats(filePath)
    const url = githubDownloadUrl(args.owner, repoName, modpack.releaseTag, fileName)
    modpack.artifacts ??= {}
    modpack.artifacts[role] = { file: fileName, url, sha256: stats.sha256, size: stats.size }
    assetsByName.set(fileName, { name: fileName, size: stats.size, sha256: stats.sha256, browserDownloadUrl: url })

    if (role === 'pack') {
      pack.artifactUrl = url
      pack.artifactSha256 = stats.sha256
      pack.artifactSize = stats.size
    }
    if (role === 'manifest') pack.manifestAsset = fileName
  }

  const manifest = await readJson(path.join(releaseDir, roleFiles.manifest))
  pack.moduleRequirements = manifest.moduleRequirements ?? pack.moduleRequirements
  pack.moduleRelease = manifest.moduleRelease ?? pack.moduleRelease
  pack.moduleSourceRevision = manifest.moduleSourceRevision ?? pack.moduleSourceRevision
  modpack.moduleRelease = manifest.moduleRelease ?? modpack.moduleRelease
  modpack.moduleSourceRevision = manifest.moduleSourceRevision ?? modpack.moduleSourceRevision

  pack.assets = Array.from(assetsByName.values()).sort((a, b) => a.name.localeCompare(b.name))
  await writeJson(path.join(args.root, row.modpackPath), modpack)
  await writeJson(path.join(args.root, row.packPath), pack)

  return { id: modpack.id, repoName, releaseTag: modpack.releaseTag, artifacts: modpack.artifacts, commitSha: modpack.commitSha }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (!args.write) throw new Error('This script edits release metadata; rerun with --write.')

  const rows = await loadOfficialModpacks(args.root)
  const modules = await loadModules(args.root)
  const results = []
  for (const row of rows) {
    if (args.rebuildAssets) await rebuildPackAssets(args, row, modules)
    results.push(await refreshCatalogRow(args, row))
  }

  console.log(`Refreshed ${results.length} official modpack catalog row(s).`)
  for (const result of results) {
    const pack = result.artifacts.pack
    const manifest = result.artifacts.manifest
    console.log(`- ${result.id}: ${result.commitSha} pack=${pack.sha256.slice(0, 12)} size=${pack.size} manifest=${manifest.sha256.slice(0, 12)} size=${manifest.size}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
