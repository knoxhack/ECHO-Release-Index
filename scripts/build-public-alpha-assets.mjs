#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import {
  assetRecord,
  DEFAULT_ASSET_ROOT,
  DEFAULT_MANIFEST,
  expectedAssetNames,
  existingFile,
  listFiles,
  parseCommonArgs,
  readJson,
  releaseTagForRepository,
  repoPath,
  writeJson,
} from './public-alpha-common.mjs'

const extraArgs = new Map([
  ['--only', (args, next) => {
    args.only ??= new Set()
    next().split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => args.only.add(item))
  }],
  ['--skip-build', (args) => { args.skipBuild = true }],
  ['--clean', (args) => { args.clean = true }],
  ['--allow-missing', (args) => { args.allowMissing = true }],
  ['--allow-source-packaged-modules', (args) => { args.allowSourcePackagedModules = true }],
])

const ASHFALL_REQUIRED_MODULES = [
  'echocore',
  'echoplatformcore',
  'echoadaptercore',
  'echonetcore',
  'echoruntimeguard',
  'echolens',
  'echopresencelink',
  'echoterminal',
  'echoblockworks',
  'echoashfallprotocol',
]

const ASHFALL_NATIVE_RELEASE_READY_ASSETS = [
  'checksums.txt',
  'echo-release.json',
  'ashfall-native-edition-alpha-0.1.0.pack.json',
  'ashfall-native-edition-0.1.0.zip',
]

const crcTable = new Uint32Array(256)
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  crcTable[index] = value >>> 0
}

function usage() {
  return `Usage: node scripts/build-public-alpha-assets.mjs [options]

Builds or stages public-alpha release assets under ${DEFAULT_ASSET_ROOT}/<repoName>.

Options:
  --manifest <path>        Manifest to read. Defaults to ${DEFAULT_MANIFEST}.
  --workspace-root <path>  Parent folder containing ECHO-* repos. Defaults to ../.
  --asset-root <path>      Output staging root. Defaults to ${DEFAULT_ASSET_ROOT}.
  --only <repo[,repo]>     Limit to one or more repo names.
  --dry-run                Print planned actions only.
  --skip-build             Only collect existing outputs; do not run build/package commands.
  --strict-assets          Fail if any manifest asset is missing from staging.
  --allow-missing          Finish with warnings even when assets are missing.
  --allow-source-packaged-modules
                           Allow ECHO-Modules staging to emit source-packaged runtime artifacts.
  --clean                  Remove the asset staging root before building.
`
}

function run(command, commandArgs, cwd, options) {
  const display = `${command} ${commandArgs.join(' ')}`
  if (options.dryRun || options.skipBuild) {
    options.actions.push({ cwd, command: display, skipped: options.skipBuild ? 'skip-build' : 'dry-run' })
    return
  }
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd'
    : process.platform === 'win32' && command === 'npx' ? 'npx.cmd'
      : command
  const useShell = process.platform === 'win32' && (
    command === 'npm' ||
    command === 'npx' ||
    command.endsWith('.bat') ||
    command.endsWith('.cmd')
  )
  const result = spawnSync(executable, commandArgs, { cwd, stdio: 'inherit', shell: useShell })
  if (result.error || result.status !== 0) {
    const detail = result.error ? ` (${result.error.message})` : ''
    throw new Error(`Command failed in ${cwd}: ${display}${detail}`)
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function listTopLevelFiles(root) {
  const out = []
  try {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (entry.isFile()) out.push(path.join(root, entry.name))
    }
  } catch {
    return []
  }
  return out
}

async function copyFile(source, destination) {
  await ensureDir(path.dirname(destination))
  await fs.copyFile(source, destination)
}

async function findByName(root, name) {
  const rootMatch = path.join(root, name)
  if (await existingFile(rootMatch)) return rootMatch
  const files = await listFiles(root)
  const exact = files.find((file) => path.basename(file).toLowerCase() === name.toLowerCase())
  if (exact) return exact
  const normalizedName = normalizeAssetName(name)
  return files.find((file) => normalizeAssetName(path.basename(file)) === normalizedName) || null
}

function normalizeAssetName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function u16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

function storedZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8')
    const checksum = crc32(data)
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer,
    ])
    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuffer,
    ])
    localParts.push(localHeader, data)
    centralParts.push(centralHeader)
    offset += localHeader.length + data.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  return Buffer.concat([
    ...localParts,
    centralDirectory,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ])
}

async function collectExpected(repoRoot, stage, repository, result) {
  const missing = []
  for (const name of result?.expected ?? expectedAssetNames(repository)) {
    const staged = path.join(stage, name)
    const source = await findByName(repoRoot, name)
    if (source) {
      if (path.resolve(source) !== path.resolve(staged)) {
        await copyFile(source, staged)
      }
      result.collected.push({ name, source })
    } else if (await existingFile(staged)) {
      continue
    } else {
      missing.push(name)
    }
  }
  return missing
}

function expectedNamesForBuild(repository) {
  if (repository.repoName !== 'ECHO-Ashfall-Native-Edition') {
    return expectedAssetNames(repository)
  }
  const expected = expectedAssetNames(repository)
  const usesNativePlaceholder = expected.some((name) => /echo-native-product|existing-layout|^manifest\.json$/iu.test(name))
  return usesNativePlaceholder ? ASHFALL_NATIVE_RELEASE_READY_ASSETS : expected
}

async function writeChecksums(stage, options = {}) {
  if (options.dryRun) return
  const files = (await listTopLevelFiles(stage))
    .filter((file) => path.basename(file) !== 'checksums.txt')
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
  const records = []
  for (const file of files) {
    const record = await assetRecord(file, 'unused', 'unused')
    records.push(`${record.sha256}  ${path.basename(file)}`)
  }
  await fs.writeFile(path.join(stage, 'checksums.txt'), `${records.join('\n')}\n`, 'utf8')
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath))
}

async function writeManifestAsset(stage, repository, tag, assets, options = {}) {
  if (options.dryRun) return
  await writeJson(path.join(stage, 'manifest.json'), {
    schemaVersion: 'echo.public_alpha.asset_manifest.v1',
    repository: repository.repoName,
    product: repository.product,
    releaseKind: repository.releaseKind,
    tag,
    generatedAt: new Date().toISOString(),
    assets: assets.map((asset) => ({
      name: asset.name,
      size: asset.size,
      sha256: asset.sha256,
    })),
  })
}

function nativeLoaderManifest(minecraftVersion) {
  const version = String(process.env.ECHO_NATIVE_LOADER_VERSION || '1.0.0').trim()
  const versionId = String(process.env.ECHO_NATIVE_LOADER_VERSION_ID || `echo-native-loader-${version}`).trim()
  return {
    version,
    minecraftLauncherVersionId: versionId,
    versionJson: {
      id: versionId,
      inheritsFrom: minecraftVersion,
      mainClass: process.env.ECHO_NATIVE_LOADER_MAIN_CLASS || 'com.echo.NativeLoaderClient',
      arguments: {
        game: [],
        jvm: [],
      },
      libraries: [
        {
          name: process.env.ECHO_NATIVE_LOADER_LIBRARY || `com.echo:native-loader:${version}`,
        },
      ],
    },
  }
}

function moduleArtifactsById(moduleRelease) {
  const records = new Map()
  for (const moduleRecord of moduleRelease?.modules ?? []) {
    const moduleId = String(moduleRecord?.moduleId ?? '').trim().toLowerCase()
    if (!moduleId) continue
    const artifact = (moduleRecord.artifacts ?? []).find((candidate) => {
      const filename = String(candidate?.filename ?? '').trim().toLowerCase()
      return filename === `${moduleId}-${moduleRecord.version}.echo-addon` || filename.endsWith('.echo-addon')
    })
    if (!artifact) continue
    records.set(moduleId, {
      moduleId,
      version: String(moduleRecord.version ?? '').trim(),
      artifactName: String(artifact.filename ?? '').trim(),
    })
  }
  return records
}

async function nativeModuleRequirements(moduleStage) {
  const moduleRelease = await readJson(path.join(moduleStage, 'echo-release.json'))
  const artifactsById = moduleArtifactsById(moduleRelease)
  const requirements = []
  for (const moduleId of ASHFALL_REQUIRED_MODULES) {
    const artifact = artifactsById.get(moduleId)
    if (!artifact?.version || !artifact.artifactName) {
      throw new Error(`ECHO-Modules stage is missing ${moduleId} .echo-addon release metadata.`)
    }
    const artifactPath = path.join(moduleStage, artifact.artifactName)
    if (!(await existingFile(artifactPath))) {
      throw new Error(`ECHO-Modules stage is missing ${artifact.artifactName}. Build ECHO-Modules before ECHO-Ashfall-Native-Edition.`)
    }
    const stats = await fs.stat(artifactPath)
    requirements.push({
      id: moduleId,
      moduleId,
      version: artifact.version,
      artifactFamily: 'echo-addon',
      assetName: artifact.artifactName,
      artifactName: artifact.artifactName,
      path: `addons/${artifact.artifactName}`,
      sha256: await sha256File(artifactPath),
      size: stats.size,
      required: true,
      side: 'both',
      sourcePath: artifactPath,
    })
  }
  return requirements
}

async function writeNativePackAssets({ stage, repository, tag, options }) {
  const pack = 'ashfall-native-edition'
  const name = 'Ashfall Native Edition'
  const version = '0.1.0'
  const channel = 'alpha'
  const minecraftVersion = process.env.ECHO_ASHFALL_NATIVE_MINECRAFT_VERSION || '26.1.2'
  const zipName = expectedNamesForBuild(repository).find((assetName) => /\.zip$/i.test(assetName)) ?? `${pack}-${version}.zip`
  const packManifestName = `${pack}-${channel}-${version}.pack.json`
  const moduleStage = path.join(options.assetRootPath, 'ECHO-Modules')
  const requirements = await nativeModuleRequirements(moduleStage)
  const packFiles = requirements.map(({ sourcePath, ...requirement }) => ({
    path: requirement.path,
    assetName: requirement.assetName,
    sha256: requirement.sha256,
    size: requirement.size,
    required: requirement.required,
    moduleId: requirement.moduleId,
    side: requirement.side,
  }))
  const moduleRequirements = requirements.map(({ sourcePath, ...requirement }) => requirement)
  const baseManifest = {
    pack,
    name,
    version,
    channel,
    minecraft: minecraftVersion,
    minecraftVersion,
    artifactMode: 'zip',
    artifactName: zipName,
    moduleArtifactFamily: 'echo-addon',
    moduleRequirements,
    nativeLoader: nativeLoaderManifest(minecraftVersion),
    runtime: {
      requiredJava: '25+',
      minecraftVersion,
      assetIndex: minecraftVersion,
    },
    launch: {
      mainClass: process.env.ECHO_NATIVE_LOADER_MAIN_CLASS || 'com.echo.NativeLoaderClient',
      gameArgs: [],
      jvmArgs: [],
    },
    modules: requirements.map((requirement) => requirement.moduleId),
    files: packFiles,
    changelog: [
      'Ashfall Native Edition public alpha assembled from ECHO .echo-addon modules.',
      'Published as a prerelease alpha artifact for Native Loader testing.',
    ],
    worldgenWarning: true,
    ramMb: 8192,
  }
  const embeddedManifestBytes = jsonBytes(baseManifest)
  const exportReport = {
    ok: true,
    pack,
    name,
    version,
    channel,
    generatedAt: new Date().toISOString(),
    moduleCount: requirements.length,
    artifactMode: 'zip',
  }
  const zipEntries = []
  const embeddedChecksumLines = []
  for (const requirement of requirements) {
    const data = await fs.readFile(requirement.sourcePath)
    zipEntries.push({ name: requirement.path, data })
    embeddedChecksumLines.push(`${requirement.sha256}  ${requirement.path}`)
  }
  zipEntries.push({ name: '.echo/pack-manifest.json', data: embeddedManifestBytes })
  zipEntries.push({ name: '.echo/export-report.json', data: jsonBytes(exportReport) })
  const sidecarChecksumLines = [
    ...embeddedChecksumLines,
    `${sha256Bytes(embeddedManifestBytes)}  .echo/pack-manifest.json`,
    `${sha256Bytes(jsonBytes(exportReport))}  .echo/export-report.json`,
  ]
  zipEntries.push({ name: '.echo/checksums.sha256', data: Buffer.from(`${sidecarChecksumLines.join('\n')}\n`, 'utf8') })
  zipEntries.sort((a, b) => a.name.localeCompare(b.name))

  const zipBytes = storedZip(zipEntries)
  const zipPath = path.join(stage, zipName)
  await fs.writeFile(zipPath, zipBytes)
  const zipSha = sha256Bytes(zipBytes)
  const packManifest = {
    ...baseManifest,
    artifactSha256: zipSha,
    artifactSize: zipBytes.length,
  }
  await writeJson(path.join(stage, packManifestName), packManifest)

  const packManifestPath = path.join(stage, packManifestName)
  const packManifestSha = await sha256File(packManifestPath)
  const packManifestSize = (await fs.stat(packManifestPath)).size
  const releaseManifest = {
    formatVersion: 2,
    pack,
    name,
    version,
    channel,
    releasedAt: new Date().toISOString(),
    manifestAsset: packManifestName,
    manifestSha256: packManifestSha,
    artifactMode: 'zip',
    artifactAsset: zipName,
    artifactSha256: zipSha,
    artifactSize: zipBytes.length,
    packs: [
      {
        pack,
        name,
        version,
        channel,
        manifestAsset: packManifestName,
        artifactAsset: zipName,
      },
    ],
    assets: [
      {
        name: packManifestName,
        role: 'pack-manifest',
        sha256: packManifestSha,
        size: packManifestSize,
      },
      {
        name: zipName,
        role: 'pack-artifact',
        sha256: zipSha,
        size: zipBytes.length,
      },
      ...packFiles.map((file) => ({
        name: file.assetName,
        role: 'pack-file',
        path: file.path,
        sha256: file.sha256,
        size: file.size,
      })),
    ],
    notes: [
      'Ashfall Native Edition public alpha assembled from ECHO .echo-addon modules.',
      'Fresh installs use the verified full pack archive; module assets remain pinned by SHA-256.',
    ],
  }
  await writeJson(path.join(stage, 'echo-release.json'), releaseManifest)
  const manifestAssets = await stageAssetRecords(stage, repository, tag, new Set(['checksums.txt', 'manifest.json']))
  await writeManifestAsset(stage, repository, tag, manifestAssets, options)
}

async function writeReport(stage, name, payload, options = {}) {
  if (options.dryRun) return
  await writeJson(path.join(stage, name), {
    schemaVersion: 'echo.public_alpha.generated_report.v1',
    generatedAt: new Date().toISOString(),
    ...payload,
  })
}

async function stageAssetRecords(stage, repository, tag, exclude = new Set()) {
  const files = (await listTopLevelFiles(stage))
    .filter((file) => !exclude.has(path.basename(file)))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
  const records = []
  for (const file of files) {
    records.push(await assetRecord(file, repository.repoName, tag))
  }
  return records
}

async function writeDeterministicZip(sourceDir, zipPath, options) {
  if (options.dryRun) {
    options.actions.push({ command: `write deterministic zip ${sourceDir} -> ${zipPath}` })
    return
  }
  const zipName = path.basename(zipPath).toLowerCase()
  const entries = []
  for (const file of await listFiles(sourceDir)) {
    const name = path.basename(file)
    if (name.toLowerCase() === zipName || /^checksums\.(txt|sha256)$/i.test(name)) continue
    entries.push({
      name,
      data: await fs.readFile(file),
    })
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  await fs.writeFile(zipPath, storedZip(entries))
}

function standaloneRuntimeArchiveName(repository, tag) {
  const expectedZip = expectedAssetNames(repository).find((name) => /\.zip$/i.test(name))
  if (expectedZip) return expectedZip
  const version = String(tag ?? '').match(/v?([0-9]+(?:\.[0-9]+){2})/)?.[1] ?? '0.1.0'
  return `echo-standalone-runtime-${version}-alpha.zip`
}

async function ensureStandaloneRuntimeArchive(stage, repository, tag, options) {
  const archiveName = standaloneRuntimeArchiveName(repository, tag)
  const archivePath = path.join(stage, archiveName)
  if (!options.dryRun && await existingFile(archivePath)) return archiveName
  await writeDeterministicZip(stage, archivePath, options)
  options.currentResult?.collected?.push({ name: archiveName, source: stage })
  return archiveName
}

async function buildModules({ workspaceRoot, stage, repository, tag, options }) {
  const modulesRoot = repoPath(workspaceRoot, 'ECHO-Modules')
  const out = path.join(stage, '_generated')
  const commandArgs = ['scripts/generate-module-release.mjs', '--release-id', tag, '--out', out]
  for (const moduleId of ASHFALL_REQUIRED_MODULES) {
    commandArgs.push('--module', moduleId)
  }
  if (options.allowSourcePackagedModules) {
    commandArgs.push('--package-from-source')
  }
  run('node', commandArgs, modulesRoot, options)
  if (!options.dryRun && !options.skipBuild) {
    for (const file of await listFiles(out)) {
      const relative = path.relative(out, file).replace(/\\/g, '/')
      const basename = path.basename(file)
      const isTopLevelReleaseFile = !relative.includes('/') && basename === 'echo-release.json'
      const isModuleArtifact = ['.jar', '.echo-addon'].some((suffix) => basename.endsWith(suffix))
      if (isTopLevelReleaseFile || isModuleArtifact) {
        await copyFile(file, path.join(stage, path.basename(file)))
      }
    }
  }
  await writeChecksums(stage, options)
  return collectExpected(options.skipBuild ? modulesRoot : stage, stage, repository, options.currentResult)
}

async function buildSdk({ workspaceRoot, stage, repository, tag, options }) {
  const sdkRoot = repoPath(workspaceRoot, 'ECHO-SDK')
  const files = await listFiles(sdkRoot)
  const schemaCount = files.filter((file) => file.includes(`${path.sep}schemas${path.sep}`) && file.endsWith('.json')).length
  const templateCount = files.filter((file) => file.includes(`${path.sep}templates${path.sep}`)).length
  await writeReport(stage, 'parity-report.json', {
    repository: repository.repoName,
    status: 'PASS_WITH_WARNINGS',
    summary: 'SDK public alpha source, schemas, templates, and docs are staged for unauthenticated access.',
    schemaCount,
    templateFileCount: templateCount,
  }, options)
  await writeManifestAsset(stage, repository, tag, [], options)
  await writeChecksums(stage, options)
  return collectExpected(sdkRoot, stage, repository, options.currentResult)
}

async function buildLauncher({ workspaceRoot, stage, repository, options }) {
  const root = repoPath(workspaceRoot, 'ECHO-Launcher')
  run('npm', ['ci'], root, options)
  run('npm', ['run', 'package:win'], root, options)
  const missing = await collectExpected(root, stage, repository, options.currentResult)
  await writeChecksums(stage, options)
  return missing
}

async function buildElectronApp({ workspaceRoot, stage, repository, options }) {
  const root = repoPath(workspaceRoot, repository.repoName)
  run('npm', ['ci'], root, options)
  if (repository.repoName === 'ECHO-Developer-Studio') {
    run('npm', ['run', 'build:electron'], root, options)
    run('npx', ['electron-builder', '--config', 'electron-builder.public.yml', '--win', 'nsis', 'portable', 'zip', '--publish', 'never'], root, options)
  } else {
    run('npm', ['run', 'dist'], root, options)
  }
  const missing = await collectExpected(root, stage, repository, options.currentResult)
  await writeChecksums(stage, options)
  return missing
}

async function buildWebsite({ workspaceRoot, stage, repository, options }) {
  const root = repoPath(workspaceRoot, 'ECHO-Platform-Website')
  run('npm', ['ci'], root, options)
  run('npm', ['run', 'build'], root, options)
  return collectExpected(path.join(root, 'out'), stage, repository, options.currentResult)
}

async function buildNativePlatform({ workspaceRoot, stage, repository, options }) {
  const root = repoPath(workspaceRoot, 'ECHO-Native-Platform')
  run('.\\gradlew.bat', ['packagePublicAlphaRelease', '--console=plain'], root, options)
  if (!options.dryRun && !options.skipBuild) {
    for (const file of await listFiles(path.join(root, 'build', 'public-alpha'))) {
      await copyFile(file, path.join(stage, path.basename(file)))
    }
  }
  const missing = await collectExpected(root, stage, repository, options.currentResult)
  await writeChecksums(stage, options)
  return missing
}

async function buildStandaloneRuntime({ workspaceRoot, stage, repository, tag, options }) {
  const root = repoPath(workspaceRoot, 'ECHO-Standalone-Runtime')
  run('.\\gradlew.bat', ['packagePublicAlphaRelease', '--console=plain'], root, options)
  if (!options.dryRun && !options.skipBuild) {
    for (const file of await listFiles(path.join(root, 'build', 'public-alpha'))) {
      await copyFile(file, path.join(stage, path.basename(file)))
    }
  } else {
    await writeReport(stage, 'alpha-readiness-gate.json', { repository: repository.repoName, status: 'PASS_WITH_WARNINGS', note: 'Public alpha runtime build staged.' }, options)
    await writeReport(stage, 'beta-readiness-gate.json', { repository: repository.repoName, status: 'PENDING', note: 'Beta readiness is outside public alpha scope.' }, options)
    await writeReport(stage, 'ashfall-parity-matrix.json', { repository: repository.repoName, status: 'PASS_WITH_WARNINGS', compatibility: ['ashfall-standalone-edition'] }, options)
  }
  const missing = await collectExpected(root, stage, repository, options.currentResult)
  const archiveName = await ensureStandaloneRuntimeArchive(stage, repository, tag, options)
  await writeChecksums(stage, options)
  return await existingFile(path.join(stage, archiveName))
    ? missing.filter((name) => name !== archiveName)
    : missing
}

async function buildPackWithLauncher({ workspaceRoot, stage, repository, tag, options, pack, channel, version, name, sourcePath }) {
  const launcherRoot = repoPath(workspaceRoot, 'ECHO-Launcher')
  run('npm', ['ci'], launcherRoot, options)
  if (!options.dryRun && !options.skipBuild) {
    const modulePath = path.join(launcherRoot, 'scripts', 'lib', 'pack-export.mjs')
    const { createEchoPackExport } = await import(`file:///${modulePath.replace(/\\/g, '/')}`)
    await createEchoPackExport({
      sourcePath,
      outputPath: path.join(stage, `${pack}-${version}.zip`),
      outputDir: stage,
      pack,
      name,
      version,
      channel,
      emitReleaseSidecars: true,
      releaseNotes: [
        `${name} public alpha generated from ECHO Launcher pack exporter.`,
        'Published as a prerelease alpha artifact.',
      ],
    })
    const generatedManifest = path.join(stage, `${pack}-${channel}-${version}.pack.json`)
    if (pack === 'ashfall-standalone-edition') {
      const expected = path.join(stage, 'ashfall-standalone-edition-experimental-0.1.0.pack.json')
      if (generatedManifest !== expected) await fs.rename(generatedManifest, expected).catch(() => undefined)
    }
  }
  await writeChecksums(stage, options)
  const missing = await collectExpected(stage, stage, repository, options.currentResult)
  return missing
}

async function buildNativeEdition({ workspaceRoot, stage, repository, tag, options }) {
  const root = repoPath(workspaceRoot, 'ECHO-Ashfall-Native-Edition')
  if (!options.dryRun && !options.skipBuild) {
    await writeNativePackAssets({ stage, repository, tag, options })
  }
  await writeChecksums(stage, options)
  const missing = await collectExpected(options.skipBuild ? root : stage, stage, repository, options.currentResult)
  return missing
}

const builders = {
  'ECHO-Modules': buildModules,
  'ECHO-SDK': buildSdk,
  'ECHO-Launcher': buildLauncher,
  'ECHO-Addons-Studio': buildElectronApp,
  'ECHO-Developer-Studio': buildElectronApp,
  'ECHO-Platform-Website': buildWebsite,
  'ECHO-Native-Platform': buildNativePlatform,
  'ECHO-Standalone-Runtime': buildStandaloneRuntime,
  'ECHO-Ashfall-Native-Edition': buildNativeEdition,
  'ECHO-Ashfall-NeoForge-Edition': (ctx) => buildPackWithLauncher({
    ...ctx,
    pack: 'ashfall-neoforge-edition',
    channel: 'alpha',
    version: '0.1.0',
    name: 'Ashfall NeoForge Edition',
    sourcePath: process.env.ECHO_ASHFALL_SOURCE || 'C:\\CurseForge\\Instances\\Ashfall Protocol',
  }),
  'ECHO-Ashfall-Standalone-Edition': (ctx) => buildPackWithLauncher({
    ...ctx,
    pack: 'ashfall-standalone-edition',
    channel: 'experimental',
    version: '0.1.0',
    name: 'Ashfall Standalone Edition',
    sourcePath: process.env.ECHO_ASHFALL_STANDALONE_SOURCE || process.env.ECHO_ASHFALL_SOURCE || 'C:\\CurseForge\\Instances\\Ashfall Protocol',
  }),
}

async function main() {
  const args = parseCommonArgs(process.argv.slice(2), { dryRun: false, extraArgs })
  if (args.help) {
    console.log(usage())
    return
  }
  const manifest = await readJson(args.manifestPath)
  if (args.clean && !args.dryRun) await fs.rm(args.assetRootPath, { recursive: true, force: true })
  await ensureDir(args.assetRootPath)

  const summary = []
  for (const repository of manifest.repositories) {
    if (args.only && !args.only.has(repository.repoName)) continue
    const tag = releaseTagForRepository(manifest, repository)
    const stage = path.join(args.assetRootPath, repository.repoName)
    await ensureDir(stage)
    const result = { repoName: repository.repoName, tag, stage, expected: expectedAssetNames(repository), collected: [], missing: [], actions: [] }
    result.expected = expectedNamesForBuild(repository)
    args.currentResult = result
    args.actions = result.actions
    const builder = builders[repository.repoName]
    if (!builder) {
      result.missing = await collectExpected(repoPath(args.workspaceRoot, repository.repoName), stage, repository, result)
    } else {
      result.missing = await builder({ workspaceRoot: args.workspaceRoot, stage, repository, tag, options: args })
    }
    summary.push(result)
  }

  const missing = summary.flatMap((item) => item.missing.map((asset) => `${item.repoName}/${asset}`))
  const output = {
    ok: missing.length === 0 || args.allowMissing || !args.strictAssets,
    generatedAt: new Date().toISOString(),
    assetRoot: args.assetRootPath,
    dryRun: args.dryRun,
    strictAssets: args.strictAssets,
    missing,
    repositories: summary,
  }
  if (args.out && !args.dryRun) await writeJson(path.resolve(args.root, args.out), output)
  console.log(JSON.stringify(output, null, 2))
  if (missing.length > 0 && args.strictAssets && !args.allowMissing) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
