#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  DEFAULT_MANIFEST,
  githubApiUrl,
  githubHeaders,
  parseCommonArgs,
  readJson,
  releaseTagForRepository,
  writeJson,
} from './public-alpha-common.mjs'

const ASHFALL_REPO = 'ECHO-Ashfall-Native-Edition'
const DEFAULT_DOWNLOAD_DIR = `tmp/ashfall-draft-download/${ASHFALL_REPO}`
const DEFAULT_OUT = 'release-readiness/ashfall-draft-download.json'
const REQUIRED_ASSETS = [
  'checksums.txt',
  'echo-release.json',
  'ashfall-native-edition-alpha-0.1.0.pack.json',
  'ashfall-native-edition-0.1.0.zip',
]
const PLACEHOLDER_PATTERN = /echo-native-product|existing-layout|placeholder|^manifest\.json$/iu

const extraArgs = new Map([
  ['--download-dir', (args, next) => { args.downloadDir = next() }],
  ['--release-id', (args, next) => { args.releaseId = next() }],
  ['--tag', (args, next) => { args.tag = next() }],
  ['--token-env', (args, next) => { args.tokenEnv = next() }],
  ['--clean', (args) => { args.clean = true }],
])

function usage() {
  return `Usage: node scripts/download-ashfall-draft-release.mjs [options]

Downloads the Ashfall Native Edition GitHub draft release assets into a local
smoke-test directory and writes release-readiness/ashfall-draft-download.json.

Options:
  --root <dir>             Release Index repository root. Default: current directory.
  --manifest <path>        Public alpha manifest. Defaults to ${DEFAULT_MANIFEST}.
  --download-dir <path>    Directory for downloaded assets. Default: ${DEFAULT_DOWNLOAD_DIR}.
  --release-id <id>        Override the release ID from the manifest.
  --tag <tag>              Override the release tag from the manifest.
  --owner <owner>          GitHub owner. Defaults to manifest owner or knoxhack.
  --token-env <name>       Read token from a specific env var.
  --out <path>             Evidence JSON path. Default: ${DEFAULT_OUT}.
  --clean                  Remove the download directory before writing. Only allowed under repo tmp/.
  --help                   Print this help text.
`
}

function token(args) {
  if (args.tokenEnv) return process.env[args.tokenEnv]
  return process.env.ECHO_PUBLIC_ALPHA_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function digestSha256(asset) {
  const digest = String(asset?.digest ?? '')
  return digest.startsWith('sha256:') ? digest.slice('sha256:'.length).toLowerCase() : ''
}

function rel(root, filePath) {
  const relative = path.relative(root, filePath).replace(/\\/g, '/')
  return relative && !relative.startsWith('../') && relative !== '..' ? relative : filePath.replace(/\\/g, '/')
}

function assetDownloadUrl(asset) {
  return asset.browser_download_url ?? asset.browserDownloadUrl ?? ''
}

async function githubJson(route, options = {}) {
  const response = await fetch(githubApiUrl(route), {
    method: options.method || 'GET',
    headers: githubHeaders(options.token, options.headers),
  })
  if (response.status === 404 && options.allow404) return null
  if (!response.ok) throw new Error(`GitHub ${options.method || 'GET'} ${route} failed ${response.status}: ${await response.text()}`)
  return response.json()
}

async function githubBytes(asset, authToken) {
  const route = asset.url || `/repos/${asset.owner}/${asset.repo}/releases/assets/${asset.id}`
  const response = await fetch(route.startsWith('http') ? route : githubApiUrl(route), {
    headers: githubHeaders(authToken, { Accept: 'application/octet-stream' }),
  })
  if (!response.ok) throw new Error(`GitHub asset download ${asset.name} failed ${response.status}: ${await response.text()}`)
  return Buffer.from(await response.arrayBuffer())
}

async function listAssets(release, authToken) {
  if (!release.assets_url) return Array.isArray(release.assets) ? release.assets : []
  const assets = []
  for (let page = 1; page <= 20; page += 1) {
    const separator = release.assets_url.includes('?') ? '&' : '?'
    const response = await fetch(`${release.assets_url}${separator}per_page=100&page=${page}`, {
      headers: githubHeaders(authToken),
    })
    if (!response.ok) throw new Error(`GitHub release assets failed ${response.status}: ${await response.text()}`)
    const pageAssets = await response.json()
    assets.push(...pageAssets)
    if (!Array.isArray(pageAssets) || pageAssets.length < 100) break
  }
  return assets
}

async function findRelease(owner, repoName, releaseId, tag, authToken) {
  if (releaseId) {
    return githubJson(`/repos/${owner}/${repoName}/releases/${encodeURIComponent(releaseId)}`, { token: authToken })
  }
  const byTag = await githubJson(`/repos/${owner}/${repoName}/releases/tags/${encodeURIComponent(tag)}`, {
    token: authToken,
    allow404: true,
  })
  if (byTag) return byTag

  for (let page = 1; page <= 20; page += 1) {
    const releases = await githubJson(`/repos/${owner}/${repoName}/releases?per_page=100&page=${page}`, { token: authToken })
    const found = releases.find((release) => release.tag_name === tag)
    if (found) return found
    if (!Array.isArray(releases) || releases.length < 100) break
  }
  throw new Error(`Release ${repoName}@${tag} was not found.`)
}

function assertSafeClean(root, target) {
  const resolvedRoot = path.resolve(root)
  const resolvedTmp = path.join(resolvedRoot, 'tmp')
  const resolvedTarget = path.resolve(target)
  const back = path.relative(resolvedTmp, resolvedTarget)
  if (back === '' || back.startsWith('..') || path.isAbsolute(back)) {
    throw new Error(`--clean only removes directories under ${rel(root, resolvedTmp)}; refused ${target}`)
  }
}

function requireTrue(condition, message) {
  if (!condition) throw new Error(message)
}

function validateAssetSet(assets) {
  const findings = []
  const names = assets.map((asset) => asset.name).filter(Boolean)
  const byName = new Map()
  for (const name of names) {
    if (byName.has(name)) findings.push(`Release contains duplicate asset ${name}.`)
    byName.set(name, true)
  }
  for (const name of REQUIRED_ASSETS) {
    if (!byName.has(name)) findings.push(`Release is missing required asset ${name}.`)
  }
  for (const name of names) {
    if (!REQUIRED_ASSETS.includes(name)) findings.push(`Release contains unlisted asset ${name}.`)
    if (PLACEHOLDER_PATTERN.test(name)) findings.push(`Release still contains placeholder/generic asset ${name}.`)
  }
  return findings
}

async function download(args) {
  const authToken = token(args)
  requireTrue(authToken, 'Downloading a GitHub draft release requires ECHO_PUBLIC_ALPHA_TOKEN, GITHUB_TOKEN, GH_TOKEN, or --token-env.')

  const manifest = await readJson(args.manifestPath)
  const owner = args.owner || manifest.owner || 'knoxhack'
  const repository = manifest.repositories?.find((candidate) => candidate.repoName === ASHFALL_REPO)
  requireTrue(repository, `${ASHFALL_REPO} is missing from ${args.manifest}.`)
  const tag = args.tag || releaseTagForRepository(manifest, repository)
  const releaseId = args.releaseId || repository.release?.id
  args.expectedRelease = {
    owner,
    repoName: ASHFALL_REPO,
    id: releaseId ?? null,
    tagName: tag ?? null,
  }
  requireTrue(tag, `${ASHFALL_REPO} release tag is missing.`)

  const release = await findRelease(owner, ASHFALL_REPO, releaseId, tag, authToken)
  args.observedRelease = {
    owner,
    repoName: ASHFALL_REPO,
    id: release.id ?? null,
    tagName: release.tag_name ?? null,
    htmlUrl: release.html_url ?? null,
    draft: Boolean(release.draft),
    prerelease: Boolean(release.prerelease),
  }
  requireTrue(release.tag_name === tag, `Release tag expected ${tag}, found ${release.tag_name ?? '(missing)'}.`)
  requireTrue(release.draft === true, `Release ${tag} must be a GitHub draft before draft-download smoke; found draft=${Boolean(release.draft)}.`)
  requireTrue(release.prerelease === true, `Release ${tag} must remain a prerelease.`)

  const assets = await listAssets(release, authToken)
  const findings = validateAssetSet(assets)
  if (findings.length > 0) throw new Error(findings.join(' '))

  if (args.clean) {
    assertSafeClean(args.root, args.downloadDirPath)
    await fs.rm(args.downloadDirPath, { recursive: true, force: true })
  }
  await fs.mkdir(args.downloadDirPath, { recursive: true })

  const byName = new Map(assets.map((asset) => [asset.name, asset]))
  const downloadedAssets = []
  for (const name of REQUIRED_ASSETS) {
    const asset = byName.get(name)
    const bytes = await githubBytes(asset, authToken)
    const actualSha = sha256(bytes)
    const expectedDigest = digestSha256(asset)
    if (expectedDigest && expectedDigest !== actualSha) {
      throw new Error(`${name} SHA-256 mismatch against GitHub digest: expected ${expectedDigest}, found ${actualSha}.`)
    }
    if (Number.isInteger(asset.size) && asset.size !== bytes.length) {
      throw new Error(`${name} size mismatch against GitHub metadata: expected ${asset.size}, found ${bytes.length}.`)
    }
    const target = path.join(args.downloadDirPath, name)
    await fs.writeFile(target, bytes)
    downloadedAssets.push({
      name,
      size: bytes.length,
      sha256: actualSha,
      githubDigestSha256: expectedDigest || null,
      browserDownloadUrl: assetDownloadUrl(asset),
      apiUrl: asset.url ?? null,
      state: asset.state ?? null,
      localPath: rel(args.root, target),
    })
  }

  return {
    schemaVersion: 'echo.ashfall.draft-download.v1',
    generatedAt: new Date().toISOString(),
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
      downloadDir: rel(args.root, args.downloadDirPath),
      requiredAssets: REQUIRED_ASSETS,
      release: {
        owner,
        repoName: ASHFALL_REPO,
        id: release.id ?? null,
        tagName: release.tag_name,
        htmlUrl: release.html_url ?? null,
        draft: Boolean(release.draft),
        prerelease: Boolean(release.prerelease),
      },
      downloadedAssets,
    },
  }
}

function failedReport(args, message) {
  const release = args.observedRelease ?? args.expectedRelease ?? {
    owner: args.owner || 'knoxhack',
    repoName: ASHFALL_REPO,
    id: args.releaseId ?? null,
    tagName: args.tag ?? null,
    draft: null,
    prerelease: null,
  }
  return {
    schemaVersion: 'echo.ashfall.draft-download.v1',
    generatedAt: new Date().toISOString(),
    status: 'FAILED',
    summary: {
      blockingDiagnostics: 1,
      errors: [message],
    },
    data: {
      downloadedFromGitHubRelease: false,
      draftReleaseDownloaded: false,
      downloadDir: rel(args.root, args.downloadDirPath),
      requiredAssets: REQUIRED_ASSETS,
      release,
    },
  }
}

async function main() {
  const args = parseCommonArgs(process.argv.slice(2), { extraArgs })
  if (args.help) {
    process.stdout.write(usage())
    return
  }
  args.downloadDir ??= DEFAULT_DOWNLOAD_DIR
  args.out ??= DEFAULT_OUT
  args.downloadDirPath = path.isAbsolute(args.downloadDir) ? args.downloadDir : path.join(args.root, args.downloadDir)
  args.outPath = path.isAbsolute(args.out) ? args.out : path.join(args.root, args.out)

  try {
    const report = await download(args)
    await writeJson(args.outPath, report)
    process.stdout.write(`${JSON.stringify({
      ok: true,
      status: report.status,
      out: rel(args.root, args.outPath),
      downloadDir: report.data.downloadDir,
      downloadedAssetCount: report.summary.downloadedAssetCount,
      totalBytes: report.summary.totalBytes,
    }, null, 2)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeJson(args.outPath, failedReport(args, message)).catch(() => undefined)
    process.stderr.write(`Ashfall draft release download failed: ${message}\n`)
    process.exitCode = 1
  }
}

await main()
