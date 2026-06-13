#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_CATALOG = 'products/native-sdk.json'
const DEFAULT_OUT = 'release-readiness/native-sdk-rc1-download-smoke.json'
const DEFAULT_DOWNLOAD_ROOT = 'tmp/native-sdk-rc1-download'
const MAX_REDIRECTS = 5

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    catalog: DEFAULT_CATALOG,
    out: DEFAULT_OUT,
    downloadRoot: DEFAULT_DOWNLOAD_ROOT,
    mirrorRoot: null,
    write: false,
    clean: false,
    requireReleaseReady: false,
    timeoutMs: 30000,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--catalog') args.catalog = argv[++index]
    else if (arg === '--out') args.out = argv[++index]
    else if (arg === '--download-root') args.downloadRoot = argv[++index]
    else if (arg === '--mirror-root') args.mirrorRoot = path.resolve(argv[++index])
    else if (arg === '--write') args.write = true
    else if (arg === '--clean') args.clean = true
    else if (arg === '--require-release-ready') args.requireReleaseReady = true
    else if (arg === '--timeout-ms') args.timeoutMs = Number.parseInt(argv[++index], 10)
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs <= 0) throw new Error('--timeout-ms must be a positive integer')
  args.root = path.resolve(args.root)
  return args
}

function usage() {
  return `Usage: node scripts/download-native-sdk-rc1-artifacts.mjs [options]

Downloads every artifact in products/native-sdk.json and verifies size/SHA-256.

Options:
  --root <dir>                 Release Index repository root. Default: current directory.
  --catalog <path>             Catalog entry path relative to --root. Default: ${DEFAULT_CATALOG}.
  --out <path>                 Report path relative to --root. Default: ${DEFAULT_OUT}.
  --download-root <path>       Download directory relative to --root. Default: ${DEFAULT_DOWNLOAD_ROOT}.
  --mirror-root <dir>          Read files from a local mirror by artifact file name instead of the network.
  --write                      Write the JSON report.
  --clean                      Delete download-root before downloading.
  --require-release-ready      Fail if any download/checksum gate is blocked.
  --timeout-ms <ms>            HTTP timeout. Default: 30000.
  --help                       Print this help text.
`
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function requestBytes(url, timeoutMs, redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const client = parsed.protocol === 'http:' ? http : https
    const request = client.get(parsed, { headers: { 'user-agent': 'echo-release-index' } }, (response) => {
      const statusCode = response.statusCode ?? 0
      const location = response.headers.location
      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume()
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error(`too many redirects for ${url}`))
          return
        }
        const nextUrl = new URL(location, parsed).toString()
        requestBytes(nextUrl, timeoutMs, redirects + 1).then(resolve, reject)
        return
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`HTTP ${statusCode}`))
        return
      }
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    })
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`))
    })
    request.on('error', reject)
  })
}

async function artifactBytes(args, artifact) {
  if (args.mirrorRoot) {
    return fs.readFile(path.join(args.mirrorRoot, artifact.file))
  }
  return requestBytes(artifact.url, args.timeoutMs)
}

function artifactRows(catalog) {
  return Object.entries(catalog.artifacts ?? {}).map(([key, artifact]) => ({
    key,
    file: artifact.file,
    url: artifact.url,
    expectedSha256: String(artifact.sha256 ?? '').toLowerCase(),
    expectedSize: artifact.size
  }))
}

async function verify(args) {
  const catalogPath = path.isAbsolute(args.catalog) ? args.catalog : path.join(args.root, args.catalog)
  const catalog = await readJson(catalogPath)
  const downloadRoot = path.isAbsolute(args.downloadRoot) ? args.downloadRoot : path.join(args.root, args.downloadRoot)
  if (args.clean) await fs.rm(downloadRoot, { recursive: true, force: true })
  await fs.mkdir(downloadRoot, { recursive: true })

  const blockers = []
  const artifacts = []
  const rows = artifactRows(catalog)

  if (catalog.id !== 'echo-native-sdk') blockers.push('catalog id must be echo-native-sdk')
  if (catalog.version !== '1.0.0-RC1') blockers.push('catalog version must be 1.0.0-RC1')
  if (catalog.releaseTag !== 'v1.0.0-RC1') blockers.push('catalog releaseTag must be v1.0.0-RC1')
  if (rows.length !== 15) blockers.push(`catalog must contain 15 SDK jar artifacts, found ${rows.length}`)

  for (const artifact of rows) {
    const artifactBlockers = []
    let size = 0
    let digest = null
    let downloaded = false
    const target = path.join(downloadRoot, artifact.file)
    try {
      if (!artifact.file || !artifact.url) throw new Error('missing file or url')
      const bytes = await artifactBytes(args, artifact)
      size = bytes.length
      digest = sha256(bytes)
      await fs.writeFile(target, bytes)
      downloaded = true
      if (size !== artifact.expectedSize) artifactBlockers.push(`size mismatch: expected ${artifact.expectedSize}, found ${size}`)
      if (digest !== artifact.expectedSha256) artifactBlockers.push(`sha256 mismatch: expected ${artifact.expectedSha256}, found ${digest}`)
    } catch (error) {
      artifactBlockers.push(error instanceof Error ? error.message : String(error))
    }
    blockers.push(...artifactBlockers.map((blocker) => `${artifact.file}: ${blocker}`))
    artifacts.push({
      key: artifact.key,
      file: artifact.file,
      url: artifact.url,
      downloaded,
      downloadPath: downloaded ? rel(args.root, target) : null,
      expectedSize: artifact.expectedSize,
      size,
      expectedSha256: artifact.expectedSha256,
      sha256: digest,
      matches: downloaded && artifactBlockers.length === 0,
      blockers: artifactBlockers
    })
  }

  const downloadedCount = artifacts.filter((artifact) => artifact.downloaded).length
  const matchedCount = artifacts.filter((artifact) => artifact.matches).length
  const gates = {
    catalogEntry: catalog.id === 'echo-native-sdk' && catalog.version === '1.0.0-RC1' && catalog.releaseTag === 'v1.0.0-RC1' ? 'passed' : 'blocked',
    artifactSetComplete: rows.length === 15 ? 'passed' : 'blocked',
    downloadBackArtifacts: downloadedCount === rows.length && rows.length === 15 ? 'passed' : 'blocked',
    checksumMatch: matchedCount === rows.length && rows.length === 15 ? 'passed' : 'blocked'
  }
  const status = blockers.length === 0 ? 'PASS' : 'BLOCKED'

  return {
    schemaVersion: 'echo.native_sdk.rc1-download-smoke.v1',
    status,
    generatedAt: new Date().toISOString(),
    catalog: rel(args.root, catalogPath),
    release: {
      id: catalog.id,
      version: catalog.version,
      sourceRepo: catalog.sourceRepo,
      releaseTag: catalog.releaseTag,
      releaseUrl: catalog.provenance?.releaseUrl
    },
    mode: args.mirrorRoot ? 'mirror' : 'live-download',
    downloadRoot: rel(args.root, downloadRoot),
    summary: {
      artifactCount: rows.length,
      downloadedCount,
      matchedCount
    },
    gates,
    artifacts,
    blockers,
    notes: [
      'This report proves public artifact bytes round-trip from the indexed SDK release URLs.',
      'It does not prove signing, attestation, or workflow-built provenance.'
    ]
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }
  const report = await verify(args)
  if (args.write) {
    const outPath = path.isAbsolute(args.out) ? args.out : path.join(args.root, args.out)
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  console.log(JSON.stringify(report, null, 2))
  if (args.requireReleaseReady && report.status !== 'PASS') process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
