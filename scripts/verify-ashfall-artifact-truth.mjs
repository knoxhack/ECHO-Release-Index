#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_NATIVE_MODPACK = 'modpacks/ashfall-native.json'
const DEFAULT_NATIVE_PACK = 'packs/ashfall-native-edition.json'
const PLACEHOLDER_PACK_NAME = /(?:echo-native-product|existing-layout|native-product)/iu

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    downloadLive: false,
    requireReleaseReady: false,
    tmp: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--download-live') args.downloadLive = true
    else if (arg === '--require-release-ready') args.requireReleaseReady = true
    else if (arg === '--tmp') args.tmp = path.resolve(argv[++index])
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function usage() {
  return `Usage: node scripts/verify-ashfall-artifact-truth.mjs [options]

Checks that Ashfall Native catalog metadata cannot be marked release-ready while it points at placeholder/source-style artifacts.

Options:
  --root <path>             Release Index root. Defaults to cwd.
  --download-live           Download indexed live GitHub artifacts and inspect manifest/zip contents.
  --require-release-ready   Fail on warning-level or incomplete Ashfall Native artifact evidence.
  --tmp <path>              Temp directory for live downloads. Defaults to OS temp.
`
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function issue(out, severity, message) {
  out.push({ severity, message })
}

function severityFor(entry, args) {
  return args.requireReleaseReady || entry?.validation === 'approved' ? 'error' : 'warning'
}

function artifactByName(packManifest, pattern) {
  return (packManifest.assets ?? []).find((asset) => pattern.test(String(asset.name ?? '')))
}

function normalizeArtifact(artifact, role) {
  if (!artifact) return null
  return {
    role,
    file: artifact.file ?? artifact.name,
    url: artifact.url ?? artifact.browserDownloadUrl,
    sha256: artifact.sha256,
    size: artifact.size,
  }
}

function nativeArtifacts(modpackEntry, packManifest) {
  const artifacts = modpackEntry.artifacts ?? {}
  return {
    pack: normalizeArtifact(artifacts.pack, 'pack') ?? normalizeArtifact(artifactByName(packManifest, /\.zip$/iu), 'pack'),
    manifest: normalizeArtifact(artifacts.manifest, 'manifest') ?? normalizeArtifact(artifactByName(packManifest, /\.pack\.json$|^manifest\.json$/iu), 'manifest'),
    checksums: normalizeArtifact(artifacts.checksums, 'checksums') ?? normalizeArtifact(artifactByName(packManifest, /^checksums\.(?:txt|sha256)$/iu), 'checksums'),
    releaseManifest: normalizeArtifact(artifacts.releaseManifest, 'releaseManifest') ?? normalizeArtifact(artifactByName(packManifest, /^echo-release\.json$/iu), 'releaseManifest'),
  }
}

function validateLocalMetadata(args, modpackEntry, packManifest, findings) {
  const level = severityFor(modpackEntry, args)
  const artifacts = nativeArtifacts(modpackEntry, packManifest)
  const packName = String(artifacts.pack?.file ?? '')
  const manifestName = String(artifacts.manifest?.file ?? '')

  if (modpackEntry.validation !== 'approved') {
    issue(findings, 'warning', `Ashfall Native catalog validation is ${modpackEntry.validation}; release-ready promotion requires approved validation after real artifacts are published.`)
  }
  if (!artifacts.pack) issue(findings, level, 'Ashfall Native is missing a pack zip artifact.')
  if (!artifacts.manifest) issue(findings, level, 'Ashfall Native is missing a pack manifest artifact.')
  if (!artifacts.checksums) issue(findings, level, 'Ashfall Native is missing checksums.')
  if (!artifacts.releaseManifest) issue(findings, level, 'Ashfall Native is missing echo-release.json release metadata.')
  if (PLACEHOLDER_PACK_NAME.test(packName)) {
    issue(findings, level, `Ashfall Native pack artifact uses a Native Platform placeholder filename: ${packName}`)
  }
  if (manifestName === 'manifest.json') {
    issue(findings, level, 'Ashfall Native manifest artifact is generic manifest.json; release-ready packs must publish the exporter .pack.json sidecar.')
  }

  const packAssets = Array.isArray(packManifest.assets) ? packManifest.assets : []
  if (!packAssets.some((asset) => /\.zip$/iu.test(String(asset.name ?? '')))) {
    issue(findings, level, 'Launcher pack metadata does not list a Native pack zip asset.')
  }
  if (!packAssets.some((asset) => /\.pack\.json$/iu.test(String(asset.name ?? '')))) {
    issue(findings, level, 'Launcher pack metadata does not list an exporter .pack.json asset.')
  }
  if (!packAssets.some((asset) => /^echo-release\.json$/iu.test(String(asset.name ?? '')))) {
    issue(findings, level, 'Launcher pack metadata does not list echo-release.json.')
  }
  return artifacts
}

async function downloadArtifact(artifact, tmpRoot) {
  if (!artifact?.url) throw new Error(`Artifact ${artifact?.role ?? '(unknown)'} has no URL`)
  const response = await fetch(artifact.url)
  if (!response.ok) throw new Error(`GET ${artifact.url} failed ${response.status}: ${await response.text()}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const fileName = String(artifact.file ?? artifact.role ?? 'artifact').replace(/[^a-z0-9._-]+/giu, '-')
  await fs.mkdir(tmpRoot, { recursive: true })
  await fs.writeFile(path.join(tmpRoot, fileName), buffer)
  return buffer
}

function validateDownloadedBytes(args, modpackEntry, artifact, buffer, findings) {
  const level = severityFor(modpackEntry, args)
  if (artifact.sha256 && sha256(buffer) !== String(artifact.sha256).toLowerCase()) {
    issue(findings, level, `${artifact.role} ${artifact.file} SHA-256 does not match catalog metadata.`)
  }
  if (Number.isInteger(artifact.size) && buffer.length !== artifact.size) {
    issue(findings, level, `${artifact.role} ${artifact.file} size does not match catalog metadata.`)
  }
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
  if (eocd < 0) throw new Error('ZIP end-of-central-directory record not found.')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  let cursor = buffer.readUInt32LE(eocd + 16)
  const names = []
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory entry.')
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    names.push(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'))
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return names
}

function validateManifestPayload(args, modpackEntry, artifact, buffer, findings) {
  const level = severityFor(modpackEntry, args)
  let payload
  try {
    payload = JSON.parse(buffer.toString('utf8'))
  } catch (error) {
    issue(findings, level, `${artifact.file} is not valid JSON: ${error.message}`)
    return
  }
  if (artifact.file?.endsWith('.pack.json')) {
    if (!Array.isArray(payload.files) || payload.files.length === 0) {
      issue(findings, level, `${artifact.file} has no pack files.`)
    }
    if (!payload.artifactName || !payload.artifactSha256 || !payload.artifactSize) {
      issue(findings, level, `${artifact.file} is missing artifact name, SHA-256, or size metadata.`)
    }
    return
  }
  if (Array.isArray(payload.assets) && payload.assets.length === 0) {
    issue(findings, level, `${artifact.file} has an empty assets array.`)
  }
  issue(findings, level, `${artifact.file} is not an exporter .pack.json manifest.`)
}

function validateZipPayload(args, modpackEntry, artifact, buffer, findings) {
  const level = severityFor(modpackEntry, args)
  let names
  try {
    names = readZipEntryNames(buffer)
  } catch (error) {
    issue(findings, level, `${artifact.file} is not an inspectable ZIP: ${error.message}`)
    return
  }
  if (!names.some((name) => name === '.echo/pack-manifest.json')) {
    issue(findings, level, `${artifact.file} is missing embedded .echo/pack-manifest.json.`)
  }
  if (!names.some((name) => /^(mods|config|defaultconfigs|datapacks|resourcepacks|shaderpacks)\//iu.test(name))) {
    issue(findings, level, `${artifact.file} does not contain playable pack folders.`)
  }
  const topLevels = new Set(names.map((name) => name.split('/')[0]).filter(Boolean))
  if (topLevels.size === 1 && topLevels.has('echocore')) {
    issue(findings, level, `${artifact.file} contains only the echocore source tree.`)
  }
}

async function validateLiveDownloads(args, modpackEntry, artifacts, findings) {
  const tmpRoot = args.tmp ?? await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-artifact-truth-'))
  for (const role of ['manifest', 'pack']) {
    const artifact = artifacts[role]
    if (!artifact) continue
    const buffer = await downloadArtifact(artifact, tmpRoot)
    validateDownloadedBytes(args, modpackEntry, artifact, buffer, findings)
    if (role === 'manifest') validateManifestPayload(args, modpackEntry, artifact, buffer, findings)
    else validateZipPayload(args, modpackEntry, artifact, buffer, findings)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  const modpackPath = path.join(args.root, DEFAULT_NATIVE_MODPACK)
  const packPath = path.join(args.root, DEFAULT_NATIVE_PACK)
  const modpackEntry = await readJson(modpackPath)
  const packManifest = await readJson(packPath)
  const findings = []
  const artifacts = validateLocalMetadata(args, modpackEntry, packManifest, findings)
  if (args.downloadLive) await validateLiveDownloads(args, modpackEntry, artifacts, findings)

  const errors = findings.filter((finding) => finding.severity === 'error')
  const warnings = findings.filter((finding) => finding.severity === 'warning')
  for (const warning of warnings) console.warn(`warning: ${warning.message}`)
  if (errors.length > 0) {
    console.error(`Ashfall artifact truth verification failed with ${errors.length} error(s):`)
    for (const error of errors) console.error(`- ${error.message}`)
    process.exitCode = 1
    return
  }
  console.log(warnings.length > 0
    ? `Ashfall artifact truth verification passed with ${warnings.length} warning(s).`
    : 'Ashfall artifact truth verification passed.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
