import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { DEFAULT_MANIFEST, readJson, releaseTagForRepository, writeJson } from './public-alpha-common.mjs'

function parseArgs(argv) {
  const args = { root: process.cwd(), manifest: DEFAULT_MANIFEST, check: false, write: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--manifest') args.manifest = argv[++index]
    else if (arg === '--check') args.check = true
    else if (arg === '--write') args.write = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (args.check && args.write) throw new Error('Use either --check or --write, not both.')
  if (!args.check && !args.write) args.check = true
  args.manifestPath = path.resolve(args.root, args.manifest)
  return args
}

const args = parseArgs(process.argv.slice(2))
const syncDirs = ['products', 'modpacks']
const publicAlphaSyncChannels = new Set(['alpha', 'experimental'])

function rel(filePath) {
  return path.relative(args.root, filePath).replace(/\\/g, '/')
}

async function jsonFiles(dir) {
  const absolute = path.join(args.root, dir)
  const out = []
  try {
    for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
      const full = path.join(absolute, entry.name)
      if (entry.isDirectory()) out.push(...await jsonFiles(path.relative(args.root, full)))
      else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.schema.json')) out.push(full)
    }
  } catch {
    return []
  }
  return out
}

function camelCase(parts) {
  const words = parts
    .flatMap((part) => String(part).split(/[^A-Za-z0-9]+/u))
    .filter(Boolean)
  if (!words.length) return 'asset'
  return words
    .map((word, index) => {
      const lower = word.toLowerCase()
      return index === 0 ? lower : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
    })
    .join('')
}

function keyForProductAsset(asset) {
  const name = asset.name ?? ''
  if (/^latest\.ya?ml$/i.test(name)) return 'latestYml'
  if (/setup.*\.exe\.blockmap$/i.test(name)) return 'windowsSetupBlockmap'
  if (/setup.*\.exe$/i.test(name)) return 'windowsSetup'
  if (/portable.*\.exe$/i.test(name)) return 'windowsPortable'
  if (/win[-_.]?x64.*\.zip$/i.test(name)) return 'windowsArchive'
  if (/\.zip$/i.test(name)) return 'archive'
  if (/\.exe$/i.test(name) && /^elevate\.exe$/i.test(name)) return 'helperElevate'
  if (/\.exe$/i.test(name)) return 'windowsExecutable'
  return camelCase([name.replace(/\.[^.]+$/u, '')])
}

function keyForModpackAsset(asset) {
  const name = asset.name ?? ''
  if (/\.pack\.json$/i.test(name)) return 'manifest'
  if (/\.zip$/i.test(name)) return 'pack'
  if (/^checksums\.(txt|sha256)$/i.test(name)) return 'checksums'
  if (/^echo-release\.json$/i.test(name)) return 'releaseManifest'
  return camelCase([name.replace(/\.[^.]+$/u, '')])
}

function uniqueKey(out, preferred) {
  if (!Object.hasOwn(out, preferred)) return preferred
  let suffix = 2
  while (Object.hasOwn(out, `${preferred}${suffix}`)) suffix += 1
  return `${preferred}${suffix}`
}

function assetRecord(asset) {
  return {
    file: asset.name,
    url: asset.browserDownloadUrl,
    sha256: asset.sha256,
    size: asset.size,
  }
}

function artifactMapFor(entry, manifestRepository) {
  const assets = Array.isArray(manifestRepository.assets) ? manifestRepository.assets : []
  const out = {}
  for (const asset of assets) {
    if (!asset?.name || !asset?.browserDownloadUrl || !asset?.sha256) continue
    const preferred = entry.kind === 'modpack' ? keyForModpackAsset(asset) : keyForProductAsset(asset)
    out[uniqueKey(out, preferred)] = assetRecord(asset)
  }
  return out
}

function stableJson(value) {
  return JSON.stringify(value, null, 2)
}

function repoNameFromSourceRepo(sourceRepo) {
  const parts = String(sourceRepo ?? '').split('/')
  return parts.length === 2 ? parts[1] : ''
}

function shouldSyncEntry(entry) {
  return !entry.channel || publicAlphaSyncChannels.has(entry.channel)
}

async function main() {
  const manifest = await readJson(args.manifestPath)
  const manifestByRepo = new Map((manifest.repositories ?? []).map((repository) => [repository.repoName, repository]))
  const errors = []
  const updates = []

  for (const filePath of (await Promise.all(syncDirs.map(jsonFiles))).flat()) {
    const payload = await readJson(filePath)
    const rows = Array.isArray(payload) ? payload : [payload]
    let changed = false

    for (const entry of rows) {
      if (!shouldSyncEntry(entry)) continue
      const repository = manifestByRepo.get(repoNameFromSourceRepo(entry.sourceRepo))
      if (!repository) continue
      const manifestTag = releaseTagForRepository(manifest, repository)
      if (manifestTag && entry.releaseTag !== manifestTag) {
        errors.push(`${rel(filePath)} releaseTag ${entry.releaseTag} does not match public alpha manifest ${manifestTag}`)
      }
      const expected = artifactMapFor(entry, repository)
      if (!Object.keys(expected).length) continue
      if (stableJson(entry.artifacts ?? {}) !== stableJson(expected)) {
        updates.push(`${rel(filePath)} artifacts differ from channels/alpha/release-manifest.json`)
        if (args.write) {
          entry.artifacts = expected
          changed = true
        }
      }
    }

    if (changed) await writeJson(filePath, Array.isArray(payload) ? rows : rows[0])
  }

  if (errors.length) {
    console.error(`Public alpha index sync failed with ${errors.length} error(s):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  if (updates.length && args.check) {
    console.error(`Public alpha index sync check failed with ${updates.length} drift(s):`)
    for (const update of updates) console.error(`- ${update}`)
    process.exitCode = 1
    return
  }
  if (args.write && updates.length) {
    console.log(`Public alpha index sync wrote ${updates.length} catalog artifact update(s).`)
    return
  }
  console.log('Public alpha index sync passed.')
}

await main()
