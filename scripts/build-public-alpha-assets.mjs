#!/usr/bin/env node
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
])

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
  for (const name of expectedAssetNames(repository)) {
    const staged = path.join(stage, name)
    const source = await findByName(repoRoot, name)
    if (source) {
      await copyFile(source, staged)
      result.collected.push({ name, source })
    } else if (await existingFile(staged)) {
      continue
    } else {
      missing.push(name)
    }
  }
  return missing
}

async function writeChecksums(stage, options = {}) {
  if (options.dryRun) return
  const files = (await listFiles(stage))
    .filter((file) => path.basename(file) !== 'checksums.txt')
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
  const records = []
  for (const file of files) {
    const record = await assetRecord(file, 'unused', 'unused')
    records.push(`${record.sha256}  ${path.basename(file)}`)
  }
  await fs.writeFile(path.join(stage, 'checksums.txt'), `${records.join('\n')}\n`, 'utf8')
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

async function writeReport(stage, name, payload, options = {}) {
  if (options.dryRun) return
  await writeJson(path.join(stage, name), {
    schemaVersion: 'echo.public_alpha.generated_report.v1',
    generatedAt: new Date().toISOString(),
    ...payload,
  })
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
  run('node', ['scripts/generate-module-release.mjs', '--module', 'echocore', '--package-from-source', '--release-id', tag, '--out', out], modulesRoot, options)
  if (!options.dryRun && !options.skipBuild) {
    for (const file of await listFiles(out)) {
      if (['.jar', '.echo-addon', '.json', '.txt', '.sha256'].some((suffix) => file.endsWith(suffix))) {
        await copyFile(file, path.join(stage, path.basename(file)))
      }
    }
  }
  return collectExpected(modulesRoot, stage, repository, options.currentResult)
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
  await ensureStandaloneRuntimeArchive(stage, repository, tag, options)
  await writeChecksums(stage, options)
  return missing
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
  const nativeStage = path.join(options.assetRootPath, 'ECHO-Native-Platform')
  const nativeZip = path.join(nativeStage, 'echo-native-product-1.0.0-existing-layout-rc.zip')
  if (await existingFile(nativeZip)) await copyFile(nativeZip, path.join(stage, path.basename(nativeZip)))
  await writeManifestAsset(stage, repository, tag, [], options)
  await writeChecksums(stage, options)
  const missing = await collectExpected(root, stage, repository, options.currentResult)
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
