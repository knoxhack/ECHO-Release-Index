#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  githubApiUrl,
  githubHeaders,
  parseCommonArgs,
  writeJson,
} from './public-alpha-common.mjs'

const DEFAULT_DOWNLOAD_ROOT = 'tmp/galactic-survey-draft-download'
const DEFAULT_OUT = 'release-readiness/galactic-survey-draft-download.json'
const PLACEHOLDER_PATTERN = /existing-layout|placeholder|^manifest\.json$/iu

const EDITIONS = [
  {
    key: 'native',
    repoName: 'ECHO-Galactic-Survey-Native-Edition',
    packId: 'galactic-survey-native-edition',
    releaseTag: 'galactic-survey-native-0.1.0-alpha',
    packManifest: 'galactic-survey-native-edition-alpha-0.1.0.pack.json',
    packZip: 'galactic-survey-native-edition-0.1.0.zip',
  },
  {
    key: 'neoforge',
    repoName: 'ECHO-Galactic-Survey-NeoForge-Edition',
    packId: 'galactic-survey-neoforge-edition',
    releaseTag: 'galactic-survey-neoforge-0.1.0-alpha',
    packManifest: 'galactic-survey-neoforge-edition-alpha-0.1.0.pack.json',
    packZip: 'galactic-survey-neoforge-edition-0.1.0.zip',
  },
  {
    key: 'standalone',
    repoName: 'ECHO-Galactic-Survey-Standalone-Edition',
    packId: 'galactic-survey-standalone-edition',
    releaseTag: 'galactic-survey-standalone-0.1.0-alpha',
    packManifest: 'galactic-survey-standalone-edition-alpha-0.1.0.pack.json',
    packZip: 'galactic-survey-standalone-edition-0.1.0.zip',
  },
].map((edition) => ({
  ...edition,
  requiredAssets: [
    'checksums.txt',
    'echo-release.json',
    edition.packManifest,
    edition.packZip,
    'galactic-survey-pack-build-report.json',
  ],
}))

const extraArgs = new Map([
  ['--download-root', (args, next) => { args.downloadRoot = next() }],
  ['--token-env', (args, next) => { args.tokenEnv = next() }],
  ['--only', (args, next) => {
    args.only ??= new Set()
    next().split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).forEach((item) => args.only.add(item))
  }],
  ['--clean', (args) => { args.clean = true }],
])

function usage() {
  return `Usage: node scripts/download-galactic-survey-draft-releases.mjs [options]

Downloads the Galactic Survey Native, NeoForge, and Standalone draft GitHub
release assets, verifies exact asset names, GitHub size/digest metadata, and
top-level checksums, then writes release-readiness evidence.

Options:
  --root <dir>             Release Index repository root. Default: current directory.
  --download-root <path>   Directory for downloaded assets. Default: ${DEFAULT_DOWNLOAD_ROOT}.
  --owner <owner>          GitHub owner. Defaults to knoxhack.
  --token-env <name>       Read token from a specific env var.
  --only <edition[,repo]>  Limit to native, neoforge, standalone, or repo names.
  --out <path>             Evidence JSON path. Default: ${DEFAULT_OUT}.
  --clean                  Remove the download root before writing. Only allowed under repo tmp/.
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

function parseChecksums(text) {
  const checksums = new Map()
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([a-f0-9]{64})\s+\*?(.+)$/iu)
    if (!match) throw new Error(`Invalid checksum line: ${line}`)
    checksums.set(match[2].trim().replace(/\\/g, '/'), match[1].toLowerCase())
  }
  return checksums
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
  const response = await fetch(asset.url || githubApiUrl(`/repos/${asset.owner}/${asset.repo}/releases/assets/${asset.id}`), {
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

async function findRelease(owner, edition, authToken) {
  const byTag = await githubJson(`/repos/${owner}/${edition.repoName}/releases/tags/${encodeURIComponent(edition.releaseTag)}`, {
    token: authToken,
    allow404: true,
  })
  if (byTag) return byTag

  for (let page = 1; page <= 20; page += 1) {
    const releases = await githubJson(`/repos/${owner}/${edition.repoName}/releases?per_page=100&page=${page}`, { token: authToken })
    const found = releases.find((release) => release.tag_name === edition.releaseTag)
    if (found) return found
    if (!Array.isArray(releases) || releases.length < 100) break
  }
  throw new Error(`Release ${edition.repoName}@${edition.releaseTag} was not found.`)
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

function validateAssetSet(edition, assets) {
  const findings = []
  const names = assets.map((asset) => asset.name).filter(Boolean)
  const byName = new Map()
  for (const name of names) {
    if (byName.has(name)) findings.push(`${edition.repoName} release contains duplicate asset ${name}.`)
    byName.set(name, true)
  }
  for (const name of edition.requiredAssets) {
    if (!byName.has(name)) findings.push(`${edition.repoName} release is missing required asset ${name}.`)
  }
  for (const name of names) {
    if (!edition.requiredAssets.includes(name)) findings.push(`${edition.repoName} release contains unlisted asset ${name}.`)
    if (PLACEHOLDER_PATTERN.test(name)) findings.push(`${edition.repoName} release still contains placeholder/generic asset ${name}.`)
  }
  return findings
}

async function downloadEdition({ args, edition, authToken, owner }) {
  const release = await findRelease(owner, edition, authToken)
  requireTrue(release.tag_name === edition.releaseTag, `${edition.repoName} release tag expected ${edition.releaseTag}, found ${release.tag_name ?? '(missing)'}.`)
  requireTrue(release.draft === true, `${edition.repoName}@${edition.releaseTag} must be a GitHub draft before draft-download smoke; found draft=${Boolean(release.draft)}.`)
  requireTrue(release.prerelease === true, `${edition.repoName}@${edition.releaseTag} must remain a prerelease.`)

  const assets = await listAssets(release, authToken)
  const findings = validateAssetSet(edition, assets)
  if (findings.length > 0) throw new Error(findings.join(' '))

  const editionDir = path.join(args.downloadRootPath, edition.repoName)
  await fs.mkdir(editionDir, { recursive: true })
  const byName = new Map(assets.map((asset) => [asset.name, asset]))
  const downloadedAssets = []
  const bytesByName = new Map()

  for (const name of edition.requiredAssets) {
    const asset = byName.get(name)
    const bytes = await githubBytes(asset, authToken)
    const actualSha = sha256(bytes)
    const expectedDigest = digestSha256(asset)
    if (expectedDigest && expectedDigest !== actualSha) {
      throw new Error(`${edition.repoName} ${name} SHA-256 mismatch against GitHub digest: expected ${expectedDigest}, found ${actualSha}.`)
    }
    if (Number.isInteger(asset.size) && asset.size !== bytes.length) {
      throw new Error(`${edition.repoName} ${name} size mismatch against GitHub metadata: expected ${asset.size}, found ${bytes.length}.`)
    }
    const target = path.join(editionDir, name)
    await fs.writeFile(target, bytes)
    bytesByName.set(name, bytes)
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

  const checksums = parseChecksums(bytesByName.get('checksums.txt').toString('utf8'))
  for (const name of edition.requiredAssets.filter((assetName) => assetName !== 'checksums.txt')) {
    const expected = checksums.get(name)
    requireTrue(expected, `${edition.repoName} checksums.txt is missing ${name}.`)
    const actual = sha256(bytesByName.get(name))
    if (actual !== expected) throw new Error(`${edition.repoName} checksums.txt mismatch for ${name}: expected ${expected}, found ${actual}.`)
  }

  const releaseManifest = JSON.parse(bytesByName.get('echo-release.json').toString('utf8'))
  requireTrue(releaseManifest.pack === edition.packId, `${edition.repoName} echo-release.json pack expected ${edition.packId}.`)
  requireTrue(releaseManifest.manifestAsset === edition.packManifest, `${edition.repoName} echo-release.json manifestAsset mismatch.`)
  requireTrue(releaseManifest.artifactAsset === edition.packZip, `${edition.repoName} echo-release.json artifactAsset mismatch.`)
  requireTrue(releaseManifest.artifactSha256 === sha256(bytesByName.get(edition.packZip)), `${edition.repoName} echo-release.json artifactSha256 mismatch.`)
  requireTrue(releaseManifest.artifactSize === bytesByName.get(edition.packZip).length, `${edition.repoName} echo-release.json artifactSize mismatch.`)

  return {
    repoName: edition.repoName,
    packId: edition.packId,
    releaseTag: edition.releaseTag,
    release: {
      owner,
      repoName: edition.repoName,
      id: release.id ?? null,
      tagName: release.tag_name,
      htmlUrl: release.html_url ?? null,
      draft: Boolean(release.draft),
      prerelease: Boolean(release.prerelease),
    },
    downloadDir: rel(args.root, editionDir),
    requiredAssets: edition.requiredAssets,
    downloadedAssets,
    verifiedTopLevelChecksums: [...checksums.keys()],
  }
}

async function download(args) {
  const authToken = token(args)
  requireTrue(authToken, 'Downloading Galactic Survey GitHub draft releases requires ECHO_PUBLIC_ALPHA_TOKEN, GITHUB_TOKEN, GH_TOKEN, or --token-env.')

  const owner = args.owner || 'knoxhack'
  const selected = EDITIONS.filter((edition) => !args.only || args.only.has(edition.key) || args.only.has(edition.repoName.toLowerCase()))
  requireTrue(selected.length > 0, 'No Galactic Survey editions selected.')

  if (args.clean) {
    assertSafeClean(args.root, args.downloadRootPath)
    await fs.rm(args.downloadRootPath, { recursive: true, force: true })
  }
  await fs.mkdir(args.downloadRootPath, { recursive: true })

  const editions = []
  for (const edition of selected) editions.push(await downloadEdition({ args, edition, authToken, owner }))
  const downloadedAssetCount = editions.reduce((sum, edition) => sum + edition.downloadedAssets.length, 0)
  const totalBytes = editions.reduce((sum, edition) => sum + edition.downloadedAssets.reduce((assetSum, asset) => assetSum + asset.size, 0), 0)

  return {
    schemaVersion: 'echo.galactic_survey.draft-download.v1',
    generatedAt: new Date().toISOString(),
    status: 'PASS',
    summary: {
      downloadedFromGitHubRelease: true,
      draftReleasesDownloaded: true,
      downloadedEditionCount: editions.length,
      downloadedAssetCount,
      totalBytes,
    },
    data: {
      downloadRoot: rel(args.root, args.downloadRootPath),
      editions,
    },
  }
}

function failedReport(args, message) {
  return {
    schemaVersion: 'echo.galactic_survey.draft-download.v1',
    generatedAt: new Date().toISOString(),
    status: 'FAILED',
    summary: {
      downloadedFromGitHubRelease: false,
      draftReleasesDownloaded: false,
      blockingDiagnostics: 1,
      errors: [message],
    },
    data: {
      downloadRoot: rel(args.root, args.downloadRootPath),
      editions: [],
    },
  }
}

async function main() {
  const args = parseCommonArgs(process.argv.slice(2), { extraArgs })
  if (args.help) {
    process.stdout.write(usage())
    return
  }
  args.downloadRoot ??= DEFAULT_DOWNLOAD_ROOT
  args.out ??= DEFAULT_OUT
  args.downloadRootPath = path.isAbsolute(args.downloadRoot) ? args.downloadRoot : path.join(args.root, args.downloadRoot)
  args.outPath = path.isAbsolute(args.out) ? args.out : path.join(args.root, args.out)

  try {
    const report = await download(args)
    await writeJson(args.outPath, report)
    process.stdout.write(`${JSON.stringify({
      ok: true,
      status: report.status,
      out: rel(args.root, args.outPath),
      downloadRoot: report.data.downloadRoot,
      downloadedEditionCount: report.summary.downloadedEditionCount,
      downloadedAssetCount: report.summary.downloadedAssetCount,
      totalBytes: report.summary.totalBytes,
    }, null, 2)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeJson(args.outPath, failedReport(args, message)).catch(() => undefined)
    process.stderr.write(`Galactic Survey draft release download failed: ${message}\n`)
    process.exitCode = 1
  }
}

await main()
