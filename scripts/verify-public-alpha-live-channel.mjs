#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_CHANNEL_URL = 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/channels/alpha/launcher-channel.json'
const DEFAULT_OUT = 'release-readiness/public-alpha-live-channel-proof.json'
const USER_AGENT = 'echo-release-index-public-alpha-live-proof'

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    channelUrl: DEFAULT_CHANNEL_URL,
    out: null,
    write: false,
    timeoutMs: 60000,
    concurrency: 4,
    includeProducts: true,
    includeAddons: true,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--channel-url') args.channelUrl = next()
    else if (arg === '--out') args.out = next()
    else if (arg === '--write') args.write = true
    else if (arg === '--timeout-ms') args.timeoutMs = Number.parseInt(next(), 10)
    else if (arg === '--concurrency') args.concurrency = Number.parseInt(next(), 10)
    else if (arg === '--skip-products') args.includeProducts = false
    else if (arg === '--skip-addons') args.includeAddons = false
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs <= 0) throw new Error('--timeout-ms must be a positive integer.')
  if (!Number.isInteger(args.concurrency) || args.concurrency <= 0) throw new Error('--concurrency must be a positive integer.')
  return args
}

function usage() {
  return `Usage: node scripts/verify-public-alpha-live-channel.mjs [--write] [--out <path>]

Fetches the public launcher channel, follows the catalog URLs declared by that
channel, and SHA-256 verifies every indexed artifact that declares a hash.
`
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/gu, '/')
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function withTimeout(timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { controller, timer }
}

async function fetchResponse(url, timeoutMs) {
  const { controller, timer } = withTimeout(timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
    })
    if (!response.ok) throw new Error(`GET ${url} failed ${response.status}: ${await response.text()}`)
    return response
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, timeoutMs) {
  const response = await fetchResponse(url, timeoutMs)
  return response.json()
}

async function hashUrl(url, timeoutMs) {
  const response = await fetchResponse(url, timeoutMs)
  const hash = crypto.createHash('sha256')
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.byteLength
    hash.update(chunk)
  }
  return {
    sha256: hash.digest('hex'),
    size: bytes,
  }
}

function artifactKey(source, entry, trail) {
  return [
    source.kind,
    source.path,
    entry.id ?? entry.repoName ?? entry.name ?? '(unknown)',
    trail.join('.'),
  ].join('|')
}

function walkArtifacts(source, entry, value, trail, records) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkArtifacts(source, entry, item, [...trail, String(index)], records))
    return
  }
  if (!value || typeof value !== 'object') return
  if (value.url && value.sha256) {
    records.push({
      key: artifactKey(source, entry, trail),
      sourceKind: source.kind,
      sourcePath: source.path,
      entryId: entry.id ?? entry.repoName ?? entry.name ?? '(unknown)',
      entryKind: entry.kind ?? source.kind,
      artifactPath: trail.join('.'),
      file: value.file ?? value.name ?? value.filename ?? path.posix.basename(new URL(value.url).pathname),
      url: value.url,
      expectedSha256: value.sha256,
      expectedSize: Number.isFinite(Number(value.size)) ? Number(value.size) : null,
      releaseTag: entry.releaseTag ?? null,
    })
  }
  for (const [key, child] of Object.entries(value)) {
    walkArtifacts(source, entry, child, [...trail, key], records)
  }
}

function recordsFromCatalog(source, payload) {
  const rows = Array.isArray(payload) ? payload : [payload]
  const records = []
  for (const row of rows) walkArtifacts(source, row, row.artifacts, ['artifacts'], records)
  return records
}

function recordsFromReleaseManifest(source, manifest) {
  const records = []
  for (const repository of manifest.repositories ?? []) {
    for (const asset of repository.assets ?? []) {
      if (!asset.browserDownloadUrl || !asset.sha256) continue
      records.push({
        key: ['release-manifest', repository.repoName, asset.name].join('|'),
        sourceKind: 'release-manifest',
        sourcePath: source.path,
        entryId: repository.repoName,
        entryKind: 'repository-release',
        artifactPath: `repositories.${repository.repoName}.assets.${asset.name}`,
        file: asset.name,
        url: asset.browserDownloadUrl,
        expectedSha256: asset.sha256,
        expectedSize: Number.isFinite(Number(asset.size)) ? Number(asset.size) : null,
        releaseTag: repository.releaseTag ?? repository.release?.tagName ?? null,
      })
    }
  }
  return records
}

function uniqueRecords(records) {
  const byKey = new Map()
  for (const record of records) {
    const key = `${record.url}|${record.expectedSha256}|${record.expectedSize ?? ''}`
    if (!byKey.has(key)) byKey.set(key, record)
  }
  return [...byKey.values()]
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function categorizeModuleEvidence(records) {
  const moduleArtifacts = records.filter((record) => record.sourceKind === 'modules')
  const byReleaseTag = new Map()
  for (const record of moduleArtifacts) {
    const releaseTag = record.releaseTag ?? '(missing)'
    const bucket = byReleaseTag.get(releaseTag) ?? {
      releaseTag,
      artifactCount: 0,
      contentGraphArtifactCount: 0,
      contentGraphEvidenceArtifactCount: 0,
      moduleIds: new Set(),
    }
    bucket.artifactCount += 1
    bucket.moduleIds.add(record.entryId)
    if (record.artifactPath.includes('content-graph-evidence')) bucket.contentGraphEvidenceArtifactCount += 1
    if (record.artifactPath.includes('content-graph')) bucket.contentGraphArtifactCount += 1
    byReleaseTag.set(releaseTag, bucket)
  }
  return [...byReleaseTag.values()].map((bucket) => ({
    releaseTag: bucket.releaseTag,
    moduleCount: bucket.moduleIds.size,
    artifactCount: bucket.artifactCount,
    contentGraphArtifactCount: bucket.contentGraphArtifactCount,
    contentGraphEvidenceArtifactCount: bucket.contentGraphEvidenceArtifactCount,
  })).sort((left, right) => right.moduleCount - left.moduleCount || left.releaseTag.localeCompare(right.releaseTag))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const channel = await fetchJson(args.channelUrl, args.timeoutMs)
  const catalogUrls = channel.catalogUrls ?? {}
  const catalogKinds = ['modpacks', 'modules']
  if (args.includeProducts) catalogKinds.unshift('products')
  if (args.includeAddons) catalogKinds.push('addons')

  const catalogSources = []
  for (const kind of catalogKinds) {
    for (const url of catalogUrls[kind] ?? []) catalogSources.push({ kind, url, path: url })
  }
  const catalogPayloads = await mapConcurrent(catalogSources, args.concurrency, async (source) => ({
    source,
    payload: await fetchJson(source.url, args.timeoutMs),
  }))

  let records = []
  for (const { source, payload } of catalogPayloads) records.push(...recordsFromCatalog(source, payload))

  let releaseManifest = null
  if (channel.releaseManifestUrl) {
    releaseManifest = await fetchJson(channel.releaseManifestUrl, args.timeoutMs)
    records.push(...recordsFromReleaseManifest({ kind: 'release-manifest', path: channel.releaseManifestUrl }, releaseManifest))
  }
  records = uniqueRecords(records)

  const artifacts = await mapConcurrent(records, args.concurrency, async (record) => {
    try {
      const actual = await hashUrl(record.url, args.timeoutMs)
      const sizeMatches = record.expectedSize == null || actual.size === record.expectedSize
      const shaMatches = actual.sha256 === record.expectedSha256
      return {
        ...record,
        actualSha256: actual.sha256,
        actualSize: actual.size,
        status: sizeMatches && shaMatches ? 'pass' : 'fail',
        blockers: [
          ...shaMatches ? [] : [`sha256 expected ${record.expectedSha256}, found ${actual.sha256}`],
          ...sizeMatches ? [] : [`size expected ${record.expectedSize}, found ${actual.size}`],
        ],
      }
    } catch (error) {
      return {
        ...record,
        actualSha256: null,
        actualSize: null,
        status: 'fail',
        blockers: [error instanceof Error ? error.message : String(error)],
      }
    }
  })

  const blockers = artifacts.flatMap((artifact) => artifact.blockers.map((blocker) => `${artifact.entryId} ${artifact.file}: ${blocker}`))
  const byKind = {}
  for (const artifact of artifacts) {
    byKind[artifact.sourceKind] ??= { artifactCount: 0, failedArtifactCount: 0, totalBytes: 0 }
    byKind[artifact.sourceKind].artifactCount += 1
    if (artifact.status !== 'pass') byKind[artifact.sourceKind].failedArtifactCount += 1
    byKind[artifact.sourceKind].totalBytes += artifact.actualSize ?? 0
  }

  const report = {
    schemaVersion: 'echo.release_index.public_alpha_live_channel_proof.v1',
    generatedAt: new Date().toISOString(),
    status: blockers.length ? 'fail' : 'pass',
    channelUrl: args.channelUrl,
    channel: channel.channel ?? null,
    releaseManifestUrl: channel.releaseManifestUrl ?? null,
    catalogUrlCount: catalogSources.length,
    artifactCount: artifacts.length,
    failedArtifactCount: artifacts.filter((artifact) => artifact.status !== 'pass').length,
    totalVerifiedBytes: artifacts.reduce((total, artifact) => total + (artifact.actualSize ?? 0), 0),
    byKind,
    moduleEvidenceDistribution: categorizeModuleEvidence(artifacts),
    blockers,
    artifacts: artifacts.map((artifact) => ({
      sourceKind: artifact.sourceKind,
      entryId: artifact.entryId,
      entryKind: artifact.entryKind,
      artifactPath: artifact.artifactPath,
      file: artifact.file,
      url: artifact.url,
      expectedSha256: artifact.expectedSha256,
      actualSha256: artifact.actualSha256,
      expectedSize: artifact.expectedSize,
      actualSize: artifact.actualSize,
      releaseTag: artifact.releaseTag,
      status: artifact.status,
      blockers: artifact.blockers,
    })),
  }

  if (args.write || args.out) {
    const output = args.out
      ? (path.isAbsolute(args.out) ? args.out : path.join(args.root, args.out))
      : path.join(args.root, DEFAULT_OUT)
    await writeJson(output, report)
  }

  if (blockers.length) {
    console.error(`Public alpha live channel proof failed with ${blockers.length} blocker(s):`)
    for (const blocker of blockers.slice(0, 50)) console.error(`- ${blocker}`)
    if (blockers.length > 50) console.error(`- ... ${blockers.length - 50} more`)
    process.exit(1)
  }
  console.log(`Public alpha live channel proof passed for ${artifacts.length} artifact(s), ${report.totalVerifiedBytes} byte(s).`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
