#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'generate-ashfall-rc-smoke.mjs')
const packName = 'ashfall-native-edition-alpha-0.1.0.pack.json'
const zipName = 'ashfall-native-edition-0.1.0.zip'
const requiredModules = [
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

const crcTable = new Uint32Array(256)
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  crcTable[index] = value >>> 0
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
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

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, jsonBytes(value))
}

function run(root, extraArgs = []) {
  return spawnSync(process.execPath, [
    script,
    '--root',
    root,
    ...extraArgs,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
}

async function writeModuleReleaseFixture(root) {
  await writeJson(root, 'tmp/public-alpha-assets/ECHO-Modules/echo-release.json', {
    schemaVersion: 'echo.module.release.v1',
    modules: requiredModules.map((moduleId) => ({
      moduleId,
      version: '1.0.0',
      artifacts: [
        { kind: 'echo-addon', filename: `${moduleId}-1.0.0.echo-addon`, buildMode: 'compiled-runtime' },
        { kind: 'neoforge', filename: `${moduleId}-1.0.0-neoforge.jar`, buildMode: 'compiled-runtime' },
        { kind: 'standalone', filename: `${moduleId}-1.0.0-standalone.jar`, buildMode: 'compiled-runtime' },
        { kind: 'sources', filename: `${moduleId}-1.0.0-sources.jar` },
      ],
    })),
  })
}

async function writeNativeStageFixture(root) {
  const nativeStage = path.join(root, 'tmp/public-alpha-assets/ECHO-Ashfall-Native-Edition')
  await fs.mkdir(nativeStage, { recursive: true })
  const packFiles = requiredModules.map((moduleId) => {
    const assetName = `${moduleId}-1.0.0.echo-addon`
    const data = Buffer.from(`fixture addon ${moduleId}\n`, 'utf8')
    return {
      path: `addons/${assetName}`,
      assetName,
      sha256: sha256(data),
      size: data.length,
      required: true,
      moduleId,
      side: 'both',
      data,
    }
  }).map((file) => ({
    path: file.path,
    assetName: file.assetName,
    sha256: sha256(file.data),
    size: file.data.length,
    required: true,
    moduleId: file.moduleId,
    side: 'both',
    data: file.data,
  }))
  const embeddedPackManifest = {
    pack: 'ashfall-native-edition',
    version: '0.1.0',
    files: packFiles.map(({ data, ...file }) => file),
  }
  const embeddedChecksums = `${packFiles.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`
  const zipBytes = storedZip([
    ...packFiles.map((file) => ({ name: file.path, data: file.data })),
    { name: '.echo/pack-manifest.json', data: jsonBytes(embeddedPackManifest) },
    { name: '.echo/export-report.json', data: jsonBytes({ ok: true, pack: 'ashfall-native-edition' }) },
    { name: '.echo/checksums.sha256', data: Buffer.from(embeddedChecksums, 'utf8') },
  ])
  const zipSha = sha256(zipBytes)
  await fs.writeFile(path.join(nativeStage, zipName), zipBytes)

  const packManifest = {
    pack: 'ashfall-native-edition',
    name: 'Ashfall Native Edition',
    version: '0.1.0',
    channel: 'alpha',
    minecraft: '26.1.2',
    minecraftVersion: '26.1.2',
    artifactMode: 'zip',
    artifactName: zipName,
    artifactSha256: zipSha,
    artifactSize: zipBytes.length,
    moduleArtifactFamily: 'echo-addon',
    moduleRequirements: packFiles.map(({ data, ...file }) => ({
      id: file.moduleId,
      moduleId: file.moduleId,
      version: '1.0.0',
      artifactFamily: 'echo-addon',
      assetName: file.assetName,
      artifactName: file.assetName,
      path: file.path,
      sha256: file.sha256,
      size: file.size,
      required: true,
      side: 'both',
    })),
    nativeLoader: {
      version: '1.0.0',
      minecraftLauncherVersionId: 'echo-native-loader-1.0.0',
      versionJson: {
        id: 'echo-native-loader-1.0.0',
        inheritsFrom: '26.1.2',
        mainClass: 'com.echo.NativeLoaderClient',
        arguments: { game: [], jvm: [] },
        libraries: [{ name: 'com.echo:native-loader:1.0.0' }],
      },
    },
    launch: {
      mainClass: 'com.echo.NativeLoaderClient',
      gameArgs: [],
      jvmArgs: [],
    },
    files: packFiles.map(({ data, ...file }) => file),
  }
  const packBytes = jsonBytes(packManifest)
  const packSha = sha256(packBytes)
  await fs.writeFile(path.join(nativeStage, packName), packBytes)

  const releaseManifest = {
    formatVersion: 2,
    pack: 'ashfall-native-edition',
    name: 'Ashfall Native Edition',
    version: '0.1.0',
    channel: 'alpha',
    manifestAsset: packName,
    manifestSha256: packSha,
    artifactMode: 'zip',
    artifactAsset: zipName,
    artifactSha256: zipSha,
    artifactSize: zipBytes.length,
    assets: [
      { name: packName, role: 'pack-manifest', sha256: packSha, size: packBytes.length },
      { name: zipName, role: 'pack-artifact', sha256: zipSha, size: zipBytes.length },
    ],
  }
  const releaseBytes = jsonBytes(releaseManifest)
  const releaseSha = sha256(releaseBytes)
  await fs.writeFile(path.join(nativeStage, 'echo-release.json'), releaseBytes)
  await fs.writeFile(path.join(nativeStage, 'checksums.txt'), [
    `${zipSha}  ${zipName}`,
    `${packSha}  ${packName}`,
    `${releaseSha}  echo-release.json`,
    '',
  ].join('\n'), 'utf8')
  return nativeStage
}

async function writeFixture(root) {
  await writeModuleReleaseFixture(root)
  return writeNativeStageFixture(root)
}

async function writeDraftDownloadEvidence(root, nativeStage) {
  const assetNames = ['checksums.txt', 'echo-release.json', packName, zipName]
  const downloadedAssets = []
  for (const name of assetNames) {
    const filePath = path.join(nativeStage, name)
    const bytes = await fs.readFile(filePath)
    const assetSha256 = sha256(bytes)
    downloadedAssets.push({
      name,
      size: bytes.length,
      sha256: assetSha256,
      githubDigestSha256: assetSha256,
      browserDownloadUrl: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0-ashfall-native-edition/${name}`,
      apiUrl: `https://api.github.com/repos/knoxhack/ECHO-Ashfall-Native-Edition/releases/assets/${downloadedAssets.length + 1}`,
      state: 'uploaded',
      localPath: path.relative(root, filePath).replace(/\\/g, '/'),
    })
  }
  await writeJson(root, 'release-readiness/ashfall-draft-download.json', {
    schemaVersion: 'echo.ashfall.draft-download.v1',
    generatedAt: '2026-06-11T00:00:00Z',
    status: 'PASS',
    summary: {
      blockingDiagnostics: 0,
      downloadedAssetCount: downloadedAssets.length,
      totalBytes: downloadedAssets.reduce((sum, asset) => sum + asset.size, 0),
      unlistedAssetCount: 0,
      placeholderAssetCount: 0,
    },
    data: {
      downloadedFromGitHubRelease: true,
      draftReleaseDownloaded: true,
      downloadDir: path.relative(root, nativeStage).replace(/\\/g, '/'),
      release: {
        owner: 'knoxhack',
        repoName: 'ECHO-Ashfall-Native-Edition',
        id: 123,
        tagName: 'v0.1.0-ashfall-native-edition',
        draft: true,
        prerelease: true,
      },
      downloadedAssets,
    },
  })
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-rc-smoke-test-'))
try {
  const passRoot = path.join(tmp, 'pass')
  await writeFixture(passRoot)
  const pass = run(passRoot)
  assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`)
  const passReport = JSON.parse(await fs.readFile(path.join(passRoot, 'release-readiness/ashfall-rc-smoke.json'), 'utf8'))
  assert.equal(passReport.status, 'PASS_WITH_WARNINGS')
  assert.equal(passReport.data.installedFromDownloadedArtifacts, false)
  assert.equal(passReport.data.launcherInstallSmoke, true)
  assert.equal(passReport.data.updateSmoke, true)
  assert.equal(passReport.data.rollbackPlanVerified, true)
  assert.equal(passReport.data.draftReleaseDownloaded, false)
  assert.equal(passReport.data.promotedAfterGreen, false)
  assert.equal(passReport.data.moduleRelease.moduleCount, 10)

  const downloadedRoot = path.join(tmp, 'downloaded')
  const downloadedStage = await writeFixture(downloadedRoot)
  await writeDraftDownloadEvidence(downloadedRoot, downloadedStage)
  const downloaded = run(downloadedRoot, ['--draft-download-evidence'])
  assert.equal(downloaded.status, 0, `${downloaded.stdout}\n${downloaded.stderr}`)
  const downloadedReport = JSON.parse(await fs.readFile(path.join(downloadedRoot, 'release-readiness/ashfall-rc-smoke.json'), 'utf8'))
  assert.equal(downloadedReport.status, 'PASS_WITH_WARNINGS')
  assert.equal(downloadedReport.summary.warningCount, 1)
  assert.equal(downloadedReport.data.draftReleaseDownloaded, true)
  assert.equal(downloadedReport.data.installedFromDownloadedArtifacts, true)
  assert.equal(downloadedReport.data.artifactSource, 'github-draft-release-download')
  assert.equal(downloadedReport.data.draftDownloadEvidence.path, 'release-readiness/ashfall-draft-download.json')
  const downloadedEvidence = JSON.parse(await fs.readFile(path.join(downloadedRoot, 'release-readiness/ashfall-draft-download.json'), 'utf8'))
  assert.equal(downloadedReport.data.draftDownloadEvidence.totalBytes, downloadedEvidence.summary.totalBytes)

  const badTotalRoot = path.join(tmp, 'bad-total')
  const badTotalStage = await writeFixture(badTotalRoot)
  await writeDraftDownloadEvidence(badTotalRoot, badTotalStage)
  const badTotalEvidencePath = path.join(badTotalRoot, 'release-readiness/ashfall-draft-download.json')
  const badTotalEvidence = JSON.parse(await fs.readFile(badTotalEvidencePath, 'utf8'))
  badTotalEvidence.summary.totalBytes += 1
  await writeJson(badTotalRoot, 'release-readiness/ashfall-draft-download.json', badTotalEvidence)
  const badTotal = run(badTotalRoot, ['--draft-download-evidence'])
  assert.equal(badTotal.status, 1)
  assert.match(`${badTotal.stdout}\n${badTotal.stderr}`, /Draft download evidence totalBytes expected/u)

  const warningEvidenceRoot = path.join(tmp, 'warning-evidence')
  const warningEvidenceStage = await writeFixture(warningEvidenceRoot)
  await writeDraftDownloadEvidence(warningEvidenceRoot, warningEvidenceStage)
  const warningEvidencePath = path.join(warningEvidenceRoot, 'release-readiness/ashfall-draft-download.json')
  const warningEvidence = JSON.parse(await fs.readFile(warningEvidencePath, 'utf8'))
  warningEvidence.status = 'PASS_WITH_WARNINGS'
  await writeJson(warningEvidenceRoot, 'release-readiness/ashfall-draft-download.json', warningEvidence)
  const warningEvidenceRun = run(warningEvidenceRoot, ['--draft-download-evidence'])
  assert.equal(warningEvidenceRun.status, 1)
  assert.match(`${warningEvidenceRun.stdout}\n${warningEvidenceRun.stderr}`, /Draft download evidence status must be PASS/u)

  const dirtySummaryRoot = path.join(tmp, 'dirty-summary')
  const dirtySummaryStage = await writeFixture(dirtySummaryRoot)
  await writeDraftDownloadEvidence(dirtySummaryRoot, dirtySummaryStage)
  const dirtySummaryPath = path.join(dirtySummaryRoot, 'release-readiness/ashfall-draft-download.json')
  const dirtySummary = JSON.parse(await fs.readFile(dirtySummaryPath, 'utf8'))
  dirtySummary.summary.unlistedAssetCount = 1
  await writeJson(dirtySummaryRoot, 'release-readiness/ashfall-draft-download.json', dirtySummary)
  const dirtySummaryRun = run(dirtySummaryRoot, ['--draft-download-evidence'])
  assert.equal(dirtySummaryRun.status, 1)
  assert.match(`${dirtySummaryRun.stdout}\n${dirtySummaryRun.stderr}`, /Draft download evidence unlistedAssetCount expected 0/u)

  const deprecated = run(passRoot, ['--draft-release-downloaded'])
  assert.equal(deprecated.status, 1)
  assert.match(`${deprecated.stdout}\n${deprecated.stderr}`, /deprecated/u)

  const placeholderRoot = path.join(tmp, 'placeholder')
  const placeholderStage = await writeFixture(placeholderRoot)
  await fs.writeFile(path.join(placeholderStage, 'echo-native-product-1.0.0-existing-layout-rc.zip'), 'placeholder\n', 'utf8')
  const placeholder = run(placeholderRoot)
  assert.equal(placeholder.status, 1)
  assert.match(`${placeholder.stdout}\n${placeholder.stderr}`, /placeholder\/source-style asset/u)

  const checksumRoot = path.join(tmp, 'checksum')
  const checksumStage = await writeFixture(checksumRoot)
  await fs.writeFile(path.join(checksumStage, 'checksums.txt'), `${'0'.repeat(64)}  ${zipName}\n`, 'utf8')
  const checksum = run(checksumRoot)
  assert.equal(checksum.status, 1)
  assert.match(`${checksum.stdout}\n${checksum.stderr}`, /SHA-256 mismatch|missing echo-release/u)
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}

console.log('Ashfall RC smoke generator fixtures passed.')
