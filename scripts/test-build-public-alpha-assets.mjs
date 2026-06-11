#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const repoRoot = process.cwd()
const builder = path.join(repoRoot, 'scripts', 'build-public-alpha-assets.mjs')

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath))
}

async function writeFixtureRuntime(workspaceRoot) {
  const publicAlpha = path.join(workspaceRoot, 'ECHO-Standalone-Runtime', 'build', 'public-alpha')
  await fs.mkdir(publicAlpha, { recursive: true })
  await fs.writeFile(path.join(publicAlpha, 'alpha-readiness-gate.json'), '{"status":"PASS_WITH_WARNINGS"}\n')
  await fs.writeFile(path.join(publicAlpha, 'ashfall-parity-matrix.json'), '{"compatibility":["ashfall-standalone-edition"]}\n')
  await fs.writeFile(path.join(publicAlpha, 'beta-readiness-gate.json'), '{"status":"PENDING"}\n')
  await fs.writeFile(path.join(publicAlpha, 'checksums.txt'), 'fixture  checksums.txt\n')
}

function runBuilder(workspaceRoot, assetRoot, options = {}) {
  return new Promise((resolve, reject) => {
    const childArgs = [
      builder,
      '--only',
      options.only ?? 'ECHO-Standalone-Runtime',
    ]
    if (options.skipBuild ?? true) childArgs.push('--skip-build')
    childArgs.push(
      '--workspace-root',
      workspaceRoot,
      '--asset-root',
      assetRoot,
      '--strict-assets',
      ...(options.extraArgs ?? []),
    )
    const child = spawn(process.execPath, childArgs, {
      cwd: repoRoot,
      windowsHide: true,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`builder exited ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function readZipEntryNames(buffer) {
  let eocd = -1
  const minimum = Math.max(0, buffer.length - 65557)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  assert.ok(eocd >= 0, 'ZIP end-of-central-directory record not found')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  let cursor = buffer.readUInt32LE(eocd + 16)
  const names = []
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, 'invalid ZIP central directory entry')
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    names.push(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'))
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return names
}

async function buildOnce(root, workspaceRoot, label) {
  const assetRoot = path.join(root, label)
  await runBuilder(workspaceRoot, assetRoot)
  const stage = path.join(assetRoot, 'ECHO-Standalone-Runtime')
  const archive = path.join(stage, 'echo-standalone-runtime-0.1.0-alpha.zip')
  const archiveDigest = await sha256File(archive)
  const checksums = await fs.readFile(path.join(stage, 'checksums.txt'), 'utf8')
  assert.match(checksums, new RegExp(`${archiveDigest}\\s+echo-standalone-runtime-0\\.1\\.0-alpha\\.zip`))
  const zipEntries = readZipEntryNames(await fs.readFile(archive))
  assert.deepEqual(zipEntries, [
    'alpha-readiness-gate.json',
    'ashfall-parity-matrix.json',
    'beta-readiness-gate.json',
  ])
  return archiveDigest
}

async function writeFixtureModuleGenerator(workspaceRoot) {
  const scriptsDir = path.join(workspaceRoot, 'ECHO-Modules', 'scripts')
  await fs.mkdir(scriptsDir, { recursive: true })
  await fs.writeFile(path.join(scriptsDir, 'generate-module-release.mjs'), `
import { promises as fs } from 'node:fs'
import path from 'node:path'

const modules = []
let out = 'dist/echo-module-release'
let releaseId = 'fixture'
let packageFromSource = false
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]
  if (arg === '--module') modules.push(process.argv[++index])
  else if (arg === '--out') out = process.argv[++index]
  else if (arg === '--release-id') releaseId = process.argv[++index]
  else if (arg === '--package-from-source') packageFromSource = true
}
if (!packageFromSource) {
  console.error('compiled runtime jars are required for fixture modules')
  process.exit(2)
}
await fs.rm(out, { recursive: true, force: true })
await fs.mkdir(out, { recursive: true })
const release = { schemaVersion: 'echo.module.release.v1', releaseId, modules: [] }
for (const moduleId of modules) {
  const version = '1.0.0'
  const moduleDir = path.join(out, moduleId)
  await fs.mkdir(moduleDir, { recursive: true })
  const filenames = [
    \`\${moduleId}-\${version}.echo-addon\`,
    \`\${moduleId}-\${version}-neoforge.jar\`,
    \`\${moduleId}-\${version}-standalone.jar\`,
    \`\${moduleId}-\${version}-sources.jar\`,
  ]
  for (const filename of filenames) {
    await fs.writeFile(path.join(moduleDir, filename), \`fixture artifact \${filename}\\n\`)
  }
  await fs.mkdir(path.join(moduleDir, 'META-INF'), { recursive: true })
  await fs.writeFile(path.join(moduleDir, 'META-INF', 'echo.mod.json'), JSON.stringify({ id: moduleId, version }))
  release.modules.push({
    moduleId,
    version,
    artifacts: filenames.map((filename) => ({ filename, buildMode: filename.endsWith('-sources.jar') ? undefined : 'source-packaged' })),
  })
}
await fs.writeFile(path.join(out, 'echo-release.json'), JSON.stringify(release, null, 2))
`, 'utf8')
}

async function verifyModuleBuilderSourcePackagingGuard(root) {
  const workspaceRoot = path.join(root, 'module-workspace')
  await writeFixtureModuleGenerator(workspaceRoot)
  await assert.rejects(
    () => runBuilder(workspaceRoot, path.join(root, 'module-assets-strict'), {
      only: 'ECHO-Modules',
      skipBuild: false,
    }),
    /builder exited 1|builder exited 2/u,
  )

  const assetRoot = path.join(root, 'module-assets-source')
  await runBuilder(workspaceRoot, assetRoot, {
    only: 'ECHO-Modules',
    skipBuild: false,
    extraArgs: ['--allow-source-packaged-modules'],
  })
  const stage = path.join(assetRoot, 'ECHO-Modules')
  const staged = await fs.readdir(stage)
  assert.ok(staged.includes('echo-release.json'), 'module release metadata must be staged')
  assert.ok(staged.includes('echocore-1.0.0.echo-addon'), 'expected manifest module artifact must be staged')
  assert.ok(staged.includes('echoashfallprotocol-1.0.0.echo-addon'), 'Ashfall protocol module artifact must be staged')
  assert.ok(staged.includes('echoplatformcore-1.0.0-neoforge.jar'), 'required dependency NeoForge artifact must be staged')
  assert.ok(staged.includes('echoruntimeguard-1.0.0.echo-addon'), 'runtime guard native artifact must be staged')
  assert.ok(staged.includes('echolens-1.0.0.echo-addon'), 'Lens native artifact must be staged')
  assert.ok(staged.includes('echopresencelink-1.0.0.echo-addon'), 'PresenceLink native artifact must be staged')
  assert.ok(staged.includes('echoterminal-1.0.0.echo-addon'), 'Terminal native artifact must be staged')
  assert.ok(!staged.includes('echo.mod.json'), 'module descriptor sidecars must not be flattened into release assets')
  const checksums = await fs.readFile(path.join(stage, 'checksums.txt'), 'utf8')
  assert.match(checksums, /echoashfallprotocol-1\.0\.0\.echo-addon/u)
  assert.doesNotMatch(checksums, /META-INF\/echo\.mod\.json/u)
}

async function writeFixtureNativeWorkspace(workspaceRoot) {
  await fs.mkdir(path.join(workspaceRoot, 'ECHO-Ashfall-Native-Edition'), { recursive: true })
}

async function verifyNativeBuilderUsesEchoAddons(root) {
  const workspaceRoot = path.join(root, 'native-workspace')
  await writeFixtureNativeWorkspace(workspaceRoot)
  await writeFixtureModuleGenerator(workspaceRoot)

  const assetRoot = path.join(root, 'native-assets')
  await runBuilder(workspaceRoot, assetRoot, {
    only: 'ECHO-Modules',
    skipBuild: false,
    extraArgs: ['--allow-source-packaged-modules'],
  })
  const nativePlatformStage = path.join(assetRoot, 'ECHO-Native-Platform')
  await fs.mkdir(nativePlatformStage, { recursive: true })
  const legacyZipName = 'echo-native-product-1.0.0-existing-layout-rc.zip'
  await fs.writeFile(path.join(nativePlatformStage, legacyZipName), 'platform placeholder zip')

  await runBuilder(workspaceRoot, assetRoot, {
    only: 'ECHO-Ashfall-Native-Edition',
    skipBuild: false,
  })

  const stage = path.join(assetRoot, 'ECHO-Ashfall-Native-Edition')
  const releaseZipName = 'ashfall-native-edition-0.1.0.zip'
  const zipEntries = readZipEntryNames(await fs.readFile(path.join(stage, releaseZipName)))
  assert.ok(zipEntries.includes('addons/echocore-1.0.0.echo-addon'), 'Native pack zip must include ECHO addon artifacts')
  assert.ok(zipEntries.includes('addons/echoashfallprotocol-1.0.0.echo-addon'), 'Native pack zip must include Ashfall protocol addon')
  assert.ok(!zipEntries.some((entry) => /^mods\//u.test(entry)), 'Native pack zip must not contain NeoForge mod jars')
  await assert.rejects(
    () => fs.access(path.join(stage, legacyZipName)),
    /ENOENT/u,
    'Native pack staging must not keep using the Native Platform placeholder zip name',
  )
  const packManifest = JSON.parse(await fs.readFile(path.join(stage, 'ashfall-native-edition-alpha-0.1.0.pack.json'), 'utf8'))
  assert.equal(packManifest.pack, 'ashfall-native-edition')
  assert.equal(packManifest.moduleArtifactFamily, 'echo-addon')
  assert.equal(packManifest.loader, undefined, 'Native pack manifest must not include NeoForge loader metadata')
  assert.ok(packManifest.files.every((file) => /^addons\/.+\.echo-addon$/u.test(file.path)), 'Native manifest files must be ECHO addons')
  assert.ok(packManifest.moduleRequirements.every((requirement) => requirement.artifactFamily === 'echo-addon'), 'Native module requirements must pin .echo-addon artifacts')
  const manifest = JSON.parse(await fs.readFile(path.join(stage, 'manifest.json'), 'utf8'))
  assert.ok(manifest.assets.length >= 3, 'Native public-alpha manifest must list generated assets')
  assert.ok(manifest.assets.some((asset) => asset.name === releaseZipName), 'Native manifest must include the pack zip')
  assert.ok(manifest.assets.some((asset) => asset.name === 'ashfall-native-edition-alpha-0.1.0.pack.json'), 'Native manifest must include the pack sidecar')
  assert.ok(manifest.assets.some((asset) => asset.name === 'echo-release.json'), 'Native manifest must include release metadata')
  const checksums = await fs.readFile(path.join(stage, 'checksums.txt'), 'utf8')
  assert.match(checksums, /ashfall-native-edition-0\.1\.0\.zip/u)
  assert.doesNotMatch(checksums, /echo-native-product/u)
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-public-alpha-build-test-'))
try {
  const workspaceRoot = path.join(root, 'workspace')
  await writeFixtureRuntime(workspaceRoot)
  const first = await buildOnce(root, workspaceRoot, 'assets-a')
  const second = await buildOnce(root, workspaceRoot, 'assets-b')
  assert.equal(second, first, 'standalone runtime archive must be deterministic')
  await verifyModuleBuilderSourcePackagingGuard(root)
  await verifyNativeBuilderUsesEchoAddons(root)
  console.log('Public alpha asset builder fixtures passed.')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
