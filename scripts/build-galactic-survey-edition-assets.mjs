#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_VERSION = '0.1.0'
const DEFAULT_CHANNEL = 'alpha'
const DEFAULT_MINECRAFT_VERSION = '26.1.2'
const DEFAULT_NEOFORGE_VERSION = '26.1.2.29-beta'
const DEFAULT_NATIVE_LOADER_VERSION = '1.0.0'

const EDITIONS = [
  {
    key: 'native',
    repoName: 'ECHO-Galactic-Survey-Native-Edition',
    family: 'echo-addon',
    artifactFolder: 'addons',
    releaseTag: 'galactic-survey-native-0.1.0-alpha',
  },
  {
    key: 'neoforge',
    repoName: 'ECHO-Galactic-Survey-NeoForge-Edition',
    family: 'neoforge',
    artifactFolder: 'mods',
    releaseTag: 'galactic-survey-neoforge-0.1.0-alpha',
  },
  {
    key: 'standalone',
    repoName: 'ECHO-Galactic-Survey-Standalone-Edition',
    family: 'standalone',
    artifactFolder: 'mods',
    releaseTag: 'galactic-survey-standalone-0.1.0-alpha',
  },
]

const REQUIRED_MODULE_IDS = [
  'echocore',
  'echoplatformcore',
  'echoschemacore',
  'echovalidationcore',
  'echocontentcore',
  'echorecipecore',
  'echoaddonapi',
  'echoadaptercore',
  'echonetcore',
  'echoruntimeguard',
  'echoterminal',
  'echoindex',
  'echolens',
  'echoholomap',
  'echomissioncore',
  'echopowergrid',
  'echologisticsnetwork',
  'echoprogressioncore',
  'echosoundcore',
  'echogalacticcore',
  'echoorbitalremnants',
  'echovehiclecore',
  'echogalacticsurveyprotocol',
]

const crcTable = new Uint32Array(256)
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  crcTable[index] = value >>> 0
}

function usage() {
  return `Usage: node scripts/build-galactic-survey-edition-assets.mjs [options]

Builds local Galactic Survey Native, NeoForge, and Standalone pack assets from
a compiled ECHO-Modules release stage. This creates local release-candidate
bytes only; it does not publish GitHub Releases or mark public alpha ready.

Options:
  --workspace-root <path>      Parent folder containing ECHO-* repos. Default: ..
  --module-release-dir <path>  Module release stage with echo-release.json.
                               Default: ../ECHO-Modules/dist/echo-module-release
  --out-root <path>            Output root. Default: tmp/galactic-survey-edition-assets
  --report <path>              Evidence report. Default: release-readiness/galactic-survey-edition-pack-assets.json
  --version <version>          Pack version. Default: ${DEFAULT_VERSION}
  --channel <channel>          Pack channel. Default: ${DEFAULT_CHANNEL}
  --only <edition[,edition]>   Limit to native, neoforge, standalone, or repo names.
  --clean                      Remove the output root before building.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    root,
    workspaceRoot: path.resolve(root, '..'),
    moduleReleaseDir: null,
    outRoot: path.resolve(root, 'tmp', 'galactic-survey-edition-assets'),
    report: path.resolve(root, 'release-readiness', 'galactic-survey-edition-pack-assets.json'),
    version: DEFAULT_VERSION,
    channel: DEFAULT_CHANNEL,
    only: null,
    clean: false,
    help: false,
  }
  args.moduleReleaseDir = path.resolve(args.workspaceRoot, 'ECHO-Modules', 'dist', 'echo-module-release')

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--workspace-root') args.workspaceRoot = path.resolve(next())
    else if (arg === '--module-release-dir') args.moduleReleaseDir = path.resolve(next())
    else if (arg === '--out-root') args.outRoot = path.resolve(next())
    else if (arg === '--report') args.report = path.resolve(next())
    else if (arg === '--version') args.version = next()
    else if (arg === '--channel') args.channel = next()
    else if (arg === '--only') args.only = new Set(next().split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))
    else if (arg === '--clean') args.clean = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
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

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function storedZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8')
    const checksum = crc32(data)
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
    ])
    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
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

async function fileRecord(filePath) {
  const stat = await fs.stat(filePath)
  return {
    name: path.basename(filePath),
    path: filePath,
    size: stat.size,
    sha256: await sha256File(filePath),
  }
}

function nativeLoaderManifest(minecraftVersion) {
  const version = process.env.ECHO_NATIVE_LOADER_VERSION || DEFAULT_NATIVE_LOADER_VERSION
  const versionId = process.env.ECHO_NATIVE_LOADER_VERSION_ID || `echo-native-loader-${version}`
  return {
    version,
    minecraftLauncherVersionId: versionId,
    versionJson: {
      id: versionId,
      inheritsFrom: minecraftVersion,
      mainClass: process.env.ECHO_NATIVE_LOADER_MAIN_CLASS || 'com.echo.NativeLoaderClient',
      arguments: { game: [], jvm: [] },
      libraries: [{ name: process.env.ECHO_NATIVE_LOADER_LIBRARY || `com.echo:native-loader:${version}` }],
    },
  }
}

function neoforgeLoaderManifest(minecraftVersion) {
  const version = process.env.ECHO_NEOFORGE_VERSION || DEFAULT_NEOFORGE_VERSION
  const versionId = process.env.ECHO_NEOFORGE_VERSION_ID || `neoforge-${version}`
  return {
    type: 'neoforge',
    version,
    minecraftLauncherVersionId: versionId,
    versionJson: {
      id: versionId,
      inheritsFrom: minecraftVersion,
      mainClass: process.env.ECHO_NEOFORGE_MAIN_CLASS || 'net.neoforged.neoforge.client.ClientMain',
      arguments: { game: [], jvm: [] },
      libraries: [{ name: `net.neoforged:neoforge:${version}` }],
    },
    libraries: [{ name: `net.neoforged:neoforge:${version}` }],
  }
}

function releaseArtifactForFamily(moduleRecord, family) {
  const artifacts = moduleRecord.artifacts ?? []
  if (family === 'echo-addon') return artifacts.find((artifact) => artifact.kind === 'echo-addon' || String(artifact.filename).endsWith('.echo-addon'))
  if (family === 'neoforge') return artifacts.find((artifact) => artifact.kind === 'neoforge' || String(artifact.filename).endsWith('-neoforge.jar'))
  return artifacts.find((artifact) => artifact.kind === 'standalone' || String(artifact.filename).endsWith('-standalone.jar'))
}

async function resolveModuleRequirements(moduleReleaseDir, moduleRelease, edition) {
  const byId = new Map((moduleRelease.modules ?? []).map((moduleRecord) => [String(moduleRecord.moduleId).toLowerCase(), moduleRecord]))
  const requirements = []
  for (const moduleId of REQUIRED_MODULE_IDS) {
    const moduleRecord = byId.get(moduleId)
    if (!moduleRecord) throw new Error(`Module release is missing ${moduleId}.`)
    const artifact = releaseArtifactForFamily(moduleRecord, edition.family)
    if (!artifact?.filename) throw new Error(`${moduleId} is missing ${edition.family} artifact.`)
    const sourcePath = path.join(moduleReleaseDir, moduleId, artifact.filename)
    if (!(await fileExists(sourcePath))) throw new Error(`Module artifact missing on disk: ${sourcePath}`)
    const record = await fileRecord(sourcePath)
    if (record.sha256 !== String(artifact.sha256).toLowerCase()) throw new Error(`${artifact.filename} SHA-256 differs from echo-release.json.`)
    if (record.size !== Number(artifact.size)) throw new Error(`${artifact.filename} size differs from echo-release.json.`)
    requirements.push({
      id: moduleId,
      moduleId,
      version: String(moduleRecord.version),
      artifactFamily: edition.family,
      assetName: artifact.filename,
      artifactName: artifact.filename,
      path: `${edition.artifactFolder}/${artifact.filename}`,
      sha256: record.sha256,
      size: record.size,
      required: true,
      side: 'both',
      sourcePath,
    })
  }
  return requirements
}

function packManifestBase({ template, edition, requirements, version, channel, zipName }) {
  const minecraftVersion = process.env.ECHO_GALACTIC_SURVEY_MINECRAFT_VERSION || DEFAULT_MINECRAFT_VERSION
  const files = requirements.map(({ sourcePath, ...requirement }) => ({
    path: requirement.path,
    assetName: requirement.assetName,
    sha256: requirement.sha256,
    size: requirement.size,
    required: true,
    moduleId: requirement.moduleId,
    side: requirement.side,
  }))
  const moduleRequirements = requirements.map(({ sourcePath, ...requirement }) => requirement)
  const manifest = {
    pack: template.packId,
    name: template.displayName,
    version,
    channel,
    minecraft: edition.key === 'standalone' ? 'Standalone' : minecraftVersion,
    minecraftVersion: edition.key === 'standalone' ? undefined : minecraftVersion,
    artifactMode: 'zip',
    artifactName: zipName,
    moduleArtifactFamily: edition.family,
    moduleRequirements,
    modules: requirements.map((requirement) => requirement.moduleId),
    files,
    runtime: {
      requiredJava: '25+',
      minecraftVersion: edition.key === 'standalone' ? undefined : minecraftVersion,
      assetIndex: edition.key === 'standalone' ? undefined : minecraftVersion,
    },
    launch: {
      mainClass: edition.key === 'standalone'
        ? 'com.echo.galacticsurvey.standalone.GalacticSurveyStandaloneMain'
        : edition.key === 'native'
          ? process.env.ECHO_NATIVE_LOADER_MAIN_CLASS || 'com.echo.NativeLoaderClient'
          : process.env.ECHO_NEOFORGE_MAIN_CLASS || 'net.neoforged.neoforge.client.ClientMain',
      gameArgs: [],
      jvmArgs: [],
    },
    changelog: [
      `${template.displayName} local release-candidate pack assembled from compiled ECHO modules.`,
      'Includes the Galactic Survey protocol plus the survey spine modules for probes, HoloMap, vehicles, salvage, logistics, progression, and survey UI.',
      'This local stage remains gated on GitHub Release publish/download evidence and real gameplay evidence.',
    ],
    worldgenWarning: false,
    ramMb: 7168,
  }
  if (edition.key === 'native') manifest.nativeLoader = nativeLoaderManifest(minecraftVersion)
  if (edition.key === 'neoforge') manifest.loader = neoforgeLoaderManifest(minecraftVersion)
  return JSON.parse(JSON.stringify(manifest))
}

async function writeTopLevelChecksums(stage) {
  const entries = []
  for (const entry of await fs.readdir(stage, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'checksums.txt') continue
    const target = path.join(stage, entry.name)
    entries.push(`${await sha256File(target)}  ${entry.name}`)
  }
  entries.sort()
  await fs.writeFile(path.join(stage, 'checksums.txt'), `${entries.join('\n')}\n`, 'utf8')
}

async function buildEdition({ args, edition, moduleRelease }) {
  const repoRoot = path.join(args.workspaceRoot, edition.repoName)
  const template = await readJson(path.join(repoRoot, 'release-manifest.template.json'))
  if (template.packId !== `galactic-survey-${edition.key}-edition`) {
    throw new Error(`${edition.repoName} template packId mismatch: ${template.packId}`)
  }
  if (template.moduleArtifactFamily !== edition.family) {
    throw new Error(`${edition.repoName} template family mismatch: ${template.moduleArtifactFamily}`)
  }

  const stage = path.join(args.outRoot, edition.repoName)
  await fs.rm(stage, { recursive: true, force: true })
  await fs.mkdir(stage, { recursive: true })

  const requirements = await resolveModuleRequirements(args.moduleReleaseDir, moduleRelease, edition)
  const zipName = `${template.packId}-${args.version}.zip`
  const packManifestName = `${template.packId}-${args.channel}-${args.version}.pack.json`
  const baseManifest = packManifestBase({ template, edition, requirements, version: args.version, channel: args.channel, zipName })
  const embeddedManifestBytes = jsonBytes(baseManifest)
  const exportReport = {
    ok: true,
    schemaVersion: 'echo.galactic_survey.pack-export-report.v1',
    generatedAt: new Date().toISOString(),
    pack: template.packId,
    name: template.displayName,
    version: args.version,
    channel: args.channel,
    moduleCount: requirements.length,
    artifactFamily: edition.family,
  }
  const exportReportBytes = jsonBytes(exportReport)
  const zipEntries = []
  const checksumLines = []
  for (const requirement of requirements) {
    const data = await fs.readFile(requirement.sourcePath)
    zipEntries.push({ name: requirement.path, data })
    checksumLines.push(`${requirement.sha256}  ${requirement.path}`)
  }
  zipEntries.push({ name: '.echo/pack-manifest.json', data: embeddedManifestBytes })
  zipEntries.push({ name: '.echo/export-report.json', data: exportReportBytes })
  checksumLines.push(`${sha256Bytes(embeddedManifestBytes)}  .echo/pack-manifest.json`)
  checksumLines.push(`${sha256Bytes(exportReportBytes)}  .echo/export-report.json`)
  zipEntries.push({ name: '.echo/checksums.sha256', data: Buffer.from(`${checksumLines.sort().join('\n')}\n`, 'utf8') })

  const zipPath = path.join(stage, zipName)
  await fs.writeFile(zipPath, storedZip(zipEntries))
  const zipRecord = await fileRecord(zipPath)

  const finalManifest = { ...baseManifest, artifactSha256: zipRecord.sha256, artifactSize: zipRecord.size }
  const packManifestPath = path.join(stage, packManifestName)
  await writeJson(packManifestPath, finalManifest)
  const packManifestRecord = await fileRecord(packManifestPath)

  const releaseManifest = {
    formatVersion: 2,
    pack: template.packId,
    name: template.displayName,
    version: args.version,
    channel: args.channel,
    releasedAt: new Date().toISOString(),
    manifestAsset: packManifestName,
    manifestSha256: packManifestRecord.sha256,
    artifactMode: 'zip',
    artifactAsset: zipName,
    artifactSha256: zipRecord.sha256,
    artifactSize: zipRecord.size,
    localReleaseCandidate: true,
    packs: [{ pack: template.packId, name: template.displayName, version: args.version, channel: args.channel, manifestAsset: packManifestName, artifactAsset: zipName }],
    assets: [
      { name: packManifestName, role: 'pack-manifest', sha256: packManifestRecord.sha256, size: packManifestRecord.size },
      { name: zipName, role: 'pack-artifact', sha256: zipRecord.sha256, size: zipRecord.size },
      ...finalManifest.files.map((file) => ({ name: file.assetName, role: 'pack-file', path: file.path, sha256: file.sha256, size: file.size })),
    ],
    notes: [
      `${template.displayName} local release candidate assembled from compiled ECHO modules.`,
      'Fresh installs use the verified full pack archive; module file checksums are pinned in the pack manifest.',
      'This local release candidate must be replaced by downloaded GitHub Release assets before public alpha approval.',
    ],
  }
  const releaseManifestPath = path.join(stage, 'echo-release.json')
  await writeJson(releaseManifestPath, releaseManifest)
  const buildReportPath = path.join(stage, 'galactic-survey-pack-build-report.json')
  await writeJson(buildReportPath, {
    schemaVersion: 'echo.galactic_survey.pack-build-report.v1',
    generatedAt: new Date().toISOString(),
    repoName: edition.repoName,
    packId: template.packId,
    releaseTag: edition.releaseTag,
    stage,
    moduleReleaseDir: args.moduleReleaseDir,
    moduleReleaseId: moduleRelease.releaseId,
    modules: requirements.map(({ sourcePath, ...requirement }) => requirement),
    promotionBlockers: [
      'GitHub Release assets must be published, downloaded back, and checksum verified before catalog approval.',
      'Real first 30 minutes, first 2 hours, Survey Array completion, save/reload, and no-crash gameplay evidence is still required.',
    ],
  })
  await writeTopLevelChecksums(stage)

  return {
    repoName: edition.repoName,
    packId: template.packId,
    releaseTag: edition.releaseTag,
    stage,
    assets: [
      await fileRecord(path.join(stage, 'checksums.txt')),
      await fileRecord(releaseManifestPath),
      packManifestRecord,
      zipRecord,
      await fileRecord(buildReportPath),
    ].map(({ path: _path, ...record }) => record),
    modules: requirements.map(({ sourcePath, ...requirement }) => requirement),
    zip: {
      name: zipRecord.name,
      manifestFiles: finalManifest.files.length,
      validated: true,
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (args.clean) await fs.rm(args.outRoot, { recursive: true, force: true })
  await fs.mkdir(args.outRoot, { recursive: true })

  const moduleRelease = await readJson(path.join(args.moduleReleaseDir, 'echo-release.json'))
  if (moduleRelease.schemaVersion !== 'echo.module.release.v1') {
    throw new Error(`Module release schema mismatch: ${moduleRelease.schemaVersion}`)
  }

  const selected = EDITIONS.filter((edition) => !args.only || args.only.has(edition.key) || args.only.has(edition.repoName.toLowerCase()))
  const editions = []
  for (const edition of selected) editions.push(await buildEdition({ args, edition, moduleRelease }))

  const report = {
    schemaVersion: 'echo.galactic_survey.edition-pack-assets.v1',
    generatedAt: new Date().toISOString(),
    project: { name: 'ECHO: Galactic Survey', version: args.version, channel: args.channel },
    builder: {
      script: 'scripts/build-galactic-survey-edition-assets.mjs',
      command: 'node scripts/build-galactic-survey-edition-assets.mjs --clean',
      moduleReleaseDir: path.relative(args.root, args.moduleReleaseDir).replace(/\\/g, '/'),
      moduleReleaseId: moduleRelease.releaseId,
      stagingRoot: path.relative(args.root, args.outRoot).replace(/\\/g, '/'),
    },
    packagedModules: REQUIRED_MODULE_IDS,
    localStage: { editions },
    gates: {
      editionPackAssetsBuilt: 'passed',
      localStageChecksums: 'passed',
      zipMatchesPackManifest: 'passed',
      editionDraftAssetsUploaded: 'not_started',
      editionDraftDownloadBack: 'not_started',
      stableTaggedArtifactUrls: 'not_started',
      releaseIndexApproval: 'blocked',
    },
    relatedEvidence: {
      moduleRelease: path.relative(args.root, path.join(args.moduleReleaseDir, 'echo-release.json')).replace(/\\/g, '/'),
      packSmoke: 'release-readiness/galactic-survey-edition-pack-smoke.json',
      gameplayEvidence: 'release-readiness/galactic-survey-public-alpha-readiness.json',
    },
    promotionBlockers: [
      'Local pack assets exist, but GitHub Release upload/download-back evidence is still required.',
      'Launcher lifecycle smoke must pass against these local assets and later against downloaded release assets.',
      'Real gameplay evidence remains required before public alpha promotion.',
    ],
  }
  await writeJson(args.report, report)
  await writeJson(path.join(args.outRoot, 'galactic-survey-edition-assets-build-report.json'), report)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
