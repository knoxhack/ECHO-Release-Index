#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  DEFAULT_ASSET_ROOT,
  DEFAULT_MANIFEST,
  fileSha256,
  readJson,
  releaseTagForRepository,
  writeJson,
} from './public-alpha-common.mjs'

const REQUIRED_ASSETS = [
  'checksums.txt',
  'echo-release.json',
  'ashfall-native-edition-alpha-0.1.0.pack.json',
  'ashfall-native-edition-0.1.0.zip',
]
const ASHFALL_NATIVE_VERSION = '0.1.0'
const PLACEHOLDER_PATTERN = /echo-native-product|existing-layout|placeholder|^manifest\.json$/iu
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu
const DEFAULT_MODPACK = 'modpacks/ashfall-native.json'
const DEFAULT_PACK = 'packs/ashfall-native-edition.json'
const DEFAULT_RC_SMOKE = 'release-readiness/ashfall-rc-smoke.json'

function usage() {
  return `Usage: node scripts/promote-ashfall-native-catalog.mjs [options]

Promotes Ashfall Native Release Index and Launcher pack metadata from warning
to approved after release-ready assets are published and RC smoke evidence is
green. Dry run is the default; use --write to edit catalog files.

Options:
  --root <dir>              Release Index repository root. Default: current directory.
  --manifest <path>         Public alpha release manifest. Default: ${DEFAULT_MANIFEST}.
  --asset-root <path>       Local staged asset root for SHA/size cross-checks. Default: ${DEFAULT_ASSET_ROOT}.
  --modpack <path>          Modpack catalog path. Default: ${DEFAULT_MODPACK}.
  --pack <path>             Launcher pack metadata path. Default: ${DEFAULT_PACK}.
  --rc-smoke <path>         RC smoke evidence path. Default: ${DEFAULT_RC_SMOKE}.
  --write                   Write approved catalog metadata.
  --skip-rc-smoke           Only for fixtures/debugging; do not use for release promotion.
  --help                    Print this help text.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    manifest: DEFAULT_MANIFEST,
    assetRoot: DEFAULT_ASSET_ROOT,
    modpack: DEFAULT_MODPACK,
    pack: DEFAULT_PACK,
    rcSmoke: DEFAULT_RC_SMOKE,
    write: false,
    skipRcSmoke: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = argv[++index]
    else if (arg === '--manifest') args.manifest = argv[++index]
    else if (arg === '--asset-root') args.assetRoot = argv[++index]
    else if (arg === '--modpack') args.modpack = argv[++index]
    else if (arg === '--pack') args.pack = argv[++index]
    else if (arg === '--rc-smoke') args.rcSmoke = argv[++index]
    else if (arg === '--write') args.write = true
    else if (arg === '--skip-rc-smoke') args.skipRcSmoke = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  args.root = path.resolve(args.root)
  for (const key of ['manifest', 'assetRoot', 'modpack', 'pack', 'rcSmoke']) {
    args[key] = path.isAbsolute(args[key]) ? args[key] : path.join(args.root, args[key])
  }
  return args
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function assetByName(repository) {
  return new Map((repository.assets ?? []).map((asset) => [asset.name, asset]))
}

function assetRecord(asset) {
  return {
    file: asset.name,
    url: asset.browserDownloadUrl,
    sha256: asset.sha256,
    size: asset.size,
  }
}

async function validateStageAsset(args, asset, findings) {
  const filePath = path.join(args.assetRoot, 'ECHO-Ashfall-Native-Edition', asset.name)
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      findings.push(`staged asset is not a file: ${rel(args.root, filePath)}`)
      return
    }
    if (stat.size !== asset.size) findings.push(`${asset.name} staged size ${stat.size} does not match release manifest size ${asset.size}`)
    const sha = await fileSha256(filePath)
    if (sha !== asset.sha256) findings.push(`${asset.name} staged SHA-256 ${sha} does not match release manifest SHA-256 ${asset.sha256}`)
  } catch (error) {
    if (error.code === 'ENOENT') findings.push(`staged asset is missing: ${rel(args.root, filePath)}`)
    else throw error
  }
}

async function validatePromotionInputs(args, manifest) {
  const findings = []
  const repository = (manifest.repositories ?? []).find((candidate) => candidate.repoName === 'ECHO-Ashfall-Native-Edition')
  if (!repository) {
    findings.push('channels/alpha/release-manifest.json is missing ECHO-Ashfall-Native-Edition.')
    return { findings, repository: null }
  }

  const tag = releaseTagForRepository(manifest, repository)
  if (tag !== 'v0.1.0-ashfall-native-edition') findings.push(`Ashfall Native release tag is ${tag || '(missing)'}, expected v0.1.0-ashfall-native-edition.`)
  if (repository.release?.draft !== false) findings.push('Ashfall Native release must be promoted out of draft before catalog approval.')
  if (repository.release?.prerelease !== true) findings.push('Ashfall Native release should remain a prerelease/public-alpha release.')

  const byName = assetByName(repository)
  for (const name of REQUIRED_ASSETS) {
    const asset = byName.get(name)
    if (!asset) {
      findings.push(`Ashfall Native release manifest is missing ${name}.`)
      continue
    }
    if (!asset.browserDownloadUrl || !/^https:\/\/github\.com\/knoxhack\/ECHO-Ashfall-Native-Edition\/releases\/download\//iu.test(asset.browserDownloadUrl)) {
      findings.push(`${name} must use an ECHO-Ashfall-Native-Edition GitHub release download URL.`)
    }
    if (!SHA256_PATTERN.test(String(asset.sha256 ?? ''))) findings.push(`${name} has invalid SHA-256 in release manifest.`)
    if (!(Number(asset.size) > 0)) findings.push(`${name} must have a nonzero size in release manifest.`)
    await validateStageAsset(args, asset, findings)
  }

  for (const asset of repository.assets ?? []) {
    if (PLACEHOLDER_PATTERN.test(String(asset.name ?? ''))) {
      findings.push(`Ashfall Native release manifest still contains placeholder/generic asset ${asset.name}.`)
    }
  }

  if (!args.skipRcSmoke) {
    const smoke = await readJson(args.rcSmoke).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!smoke) {
      findings.push(`RC smoke evidence is missing: ${rel(args.root, args.rcSmoke)}`)
    } else {
      if (smoke.schemaVersion !== 'echo.ashfall.rc-smoke.v1') findings.push(`RC smoke schemaVersion must be echo.ashfall.rc-smoke.v1, found ${smoke.schemaVersion ?? '(missing)'}.`)
      if (smoke.status !== 'PASS') findings.push(`RC smoke status must be PASS for catalog approval, found ${smoke.status ?? '(missing)'}.`)
      if (!smoke.generatedAt || smoke.generatedAt === '1970-01-01T00:00:00Z') findings.push('RC smoke generatedAt must be a current non-placeholder timestamp.')
      for (const [key, expected] of Object.entries({
        localStagedArtifactSmoke: true,
        draftReleaseDownloaded: true,
        installedFromDownloadedArtifacts: true,
        launcherInstallSmoke: true,
        updateSmoke: true,
        rollbackPlanVerified: true,
        promotedAfterGreen: true,
      })) {
        if (smoke.data?.[key] !== expected) findings.push(`RC smoke data.${key} must be ${expected}.`)
      }
      if (smoke.data?.artifactSource !== 'github-draft-release-download') findings.push(`RC smoke data.artifactSource must be github-draft-release-download, found ${smoke.data?.artifactSource ?? '(missing)'}.`)
      if (typeof smoke.data?.draftDownloadEvidence?.path !== 'string' || smoke.data.draftDownloadEvidence.path.trim() === '') findings.push('RC smoke must link draftDownloadEvidence.path from the draft download gate.')
    }
  }

  return { findings, repository }
}

function promotedModpack(modpack, repository) {
  const byName = assetByName(repository)
  const next = structuredClone(modpack)
  next.version = ASHFALL_NATIVE_VERSION
  next.artifacts = {
    checksums: assetRecord(byName.get('checksums.txt')),
    releaseManifest: assetRecord(byName.get('echo-release.json')),
    manifest: assetRecord(byName.get('ashfall-native-edition-alpha-0.1.0.pack.json')),
    pack: assetRecord(byName.get('ashfall-native-edition-0.1.0.zip')),
  }
  next.releaseTag = releaseTagForRepository({ releaseTag: next.releaseTag }, repository)
  next.validation = 'approved'
  next.validationReason = 'Ashfall Native catalog points at exporter-built release-ready pack assets with matching release manifest, pack manifest, archive, and checksums.'
  return next
}

function promotedPack(pack, repository) {
  const next = structuredClone(pack)
  next.releaseReadiness = {
    status: 'approved',
    blockers: [],
    evidence: [
      'release-readiness/ashfall-native-public-alpha.json',
      'release-readiness/ashfall-rc-smoke.json',
    ],
  }
  next.assets = [...(repository.assets ?? [])]
    .filter((asset) => REQUIRED_ASSETS.includes(asset.name))
    .sort((left, right) => REQUIRED_ASSETS.indexOf(left.name) - REQUIRED_ASSETS.indexOf(right.name))
  return next
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  const manifest = await readJson(args.manifest)
  const { findings, repository } = await validatePromotionInputs(args, manifest)
  if (findings.length) {
    process.stderr.write(`Ashfall Native catalog promotion refused with ${findings.length} blocker(s):\n`)
    for (const finding of findings) process.stderr.write(`- ${finding}\n`)
    process.exitCode = 1
    return
  }

  const modpack = await readJson(args.modpack)
  const pack = await readJson(args.pack)
  const nextModpack = promotedModpack(modpack, repository)
  const nextPack = promotedPack(pack, repository)

  if (args.write) {
    await writeJson(args.modpack, nextModpack)
    await writeJson(args.pack, nextPack)
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    write: args.write,
    modpack: rel(args.root, args.modpack),
    pack: rel(args.root, args.pack),
    assets: REQUIRED_ASSETS,
  }, null, 2)}\n`)
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exit(1)
})
