#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  fileSha256,
  githubApiUrl,
  githubHeaders,
  parseCommonArgs,
  writeJson,
} from './public-alpha-common.mjs'

const DEFAULT_ASSET_ROOT = 'tmp/galactic-survey-edition-assets'
const DEFAULT_OUT = 'release-readiness/galactic-survey-draft-publish.json'
const PLACEHOLDER_PATTERN = /existing-layout|placeholder|^manifest\.json$/iu

const EDITIONS = [
  {
    key: 'native',
    repoName: 'ECHO-Galactic-Survey-Native-Edition',
    product: 'ECHO Galactic Survey Native Edition',
    packId: 'galactic-survey-native-edition',
    releaseTag: 'galactic-survey-native-0.1.0-alpha',
    packManifest: 'galactic-survey-native-edition-alpha-0.1.0.pack.json',
    packZip: 'galactic-survey-native-edition-0.1.0.zip',
  },
  {
    key: 'neoforge',
    repoName: 'ECHO-Galactic-Survey-NeoForge-Edition',
    product: 'ECHO Galactic Survey NeoForge Edition',
    packId: 'galactic-survey-neoforge-edition',
    releaseTag: 'galactic-survey-neoforge-0.1.0-alpha',
    packManifest: 'galactic-survey-neoforge-edition-alpha-0.1.0.pack.json',
    packZip: 'galactic-survey-neoforge-edition-0.1.0.zip',
  },
  {
    key: 'standalone',
    repoName: 'ECHO-Galactic-Survey-Standalone-Edition',
    product: 'ECHO Galactic Survey Standalone Edition',
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
  ['--publish', (args) => { args.dryRun = false; args.publish = true }],
  ['--asset-root', (args, next) => { args.assetRoot = next() }],
  ['--token-env', (args, next) => { args.tokenEnv = next() }],
  ['--prune-unlisted', (args) => { args.pruneUnlisted = true }],
  ['--only', (args, next) => {
    args.only ??= new Set()
    next().split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).forEach((item) => args.only.add(item))
  }],
])

function usage() {
  return `Usage: node scripts/publish-galactic-survey-draft-releases.mjs [options]

Creates or updates the Galactic Survey Native, NeoForge, and Standalone GitHub
draft prereleases from locally staged edition pack assets. Dry run is default.

Options:
  --root <dir>             Release Index repository root. Default: current directory.
  --asset-root <path>      Staged assets root. Default: ${DEFAULT_ASSET_ROOT}.
  --owner <owner>          GitHub owner. Defaults to knoxhack.
  --token-env <name>       Read token from a specific env var.
  --only <edition[,repo]>  Limit to native, neoforge, standalone, or repo names.
  --out <path>             Evidence JSON path. Default: ${DEFAULT_OUT}.
  --publish                Perform GitHub writes. Without this, no writes occur.
  --prune-unlisted         Delete draft release assets not in the required set.
  --help                   Print this help text.
`
}

function token(args) {
  if (args.tokenEnv) return process.env[args.tokenEnv]
  return process.env.ECHO_PUBLIC_ALPHA_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
}

function rel(root, filePath) {
  const relative = path.relative(root, filePath).replace(/\\/g, '/')
  return relative && !relative.startsWith('../') && relative !== '..' ? relative : filePath.replace(/\\/g, '/')
}

function digestSha256(asset) {
  const digest = String(asset?.digest ?? '')
  return digest.startsWith('sha256:') ? digest.slice('sha256:'.length).toLowerCase() : ''
}

function assetDownloadUrl(asset) {
  return asset.browser_download_url ?? asset.browserDownloadUrl ?? ''
}

function releaseBody(edition) {
  return [
    `${edition.product} draft release candidate.`,
    '',
    `Pack: ${edition.packId}`,
    `Tag: ${edition.releaseTag}`,
    '',
    'This release must remain draft-only until downloaded-back assets, launcher lifecycle evidence, and real gameplay evidence all pass.',
  ].join('\n')
}

function requireTrue(condition, message) {
  if (!condition) throw new Error(message)
}

async function githubJson(route, options = {}) {
  const response = await fetch(githubApiUrl(route), {
    method: options.method || 'GET',
    headers: githubHeaders(options.token, options.headers),
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (response.status === 404 && options.allow404) return null
  if (!response.ok) throw new Error(`GitHub ${options.method || 'GET'} ${route} failed ${response.status}: ${await response.text()}`)
  if (response.status === 204) return null
  return response.json()
}

async function githubUpload(uploadUrl, filePath, name, authToken) {
  const base = uploadUrl.replace(/\{.*$/u, '')
  const url = `${base}${base.includes('?') ? '&' : '?'}name=${encodeURIComponent(name)}`
  const bytes = await fs.readFile(filePath)
  const response = await fetch(url, {
    method: 'POST',
    headers: githubHeaders(authToken, {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
    }),
    body: bytes,
  })
  if (!response.ok) throw new Error(`GitHub upload ${name} failed ${response.status}: ${await response.text()}`)
  return response.json()
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
  return null
}

async function readStagedAssets(args, edition) {
  const stage = path.join(args.assetRootPath, edition.repoName)
  const entries = await fs.readdir(stage, { withFileTypes: true }).catch(() => [])
  const stagedFiles = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort()
  const findings = []
  for (const name of stagedFiles) {
    if (!edition.requiredAssets.includes(name)) findings.push(`${edition.repoName} has unlisted staged asset ${name}.`)
    if (PLACEHOLDER_PATTERN.test(name)) findings.push(`${edition.repoName} has placeholder/generic staged asset ${name}.`)
  }
  for (const name of edition.requiredAssets) {
    if (!stagedFiles.includes(name)) findings.push(`${edition.repoName} is missing staged asset ${name}.`)
  }
  if (findings.length) throw new Error(findings.join(' '))

  const assets = []
  for (const name of edition.requiredAssets) {
    const filePath = path.join(stage, name)
    const stat = await fs.stat(filePath)
    assets.push({
      name,
      path: filePath,
      localPath: rel(args.root, filePath),
      size: stat.size,
      sha256: await fileSha256(filePath),
    })
  }
  return { stage: rel(args.root, stage), assets }
}

async function ensureRelease({ args, edition, owner, authToken, result }) {
  const repo = await githubJson(`/repos/${owner}/${edition.repoName}`, { token: authToken, allow404: true })
  if (!repo) throw new Error(`${edition.repoName} repository is missing or inaccessible.`)

  let release = await findRelease(owner, edition, authToken)
  const body = {
    tag_name: edition.releaseTag,
    target_commitish: repo.default_branch || 'main',
    name: `${edition.product} ${edition.releaseTag}`,
    body: releaseBody(edition),
    draft: true,
    prerelease: true,
    make_latest: 'false',
  }
  if (!release) {
    if (args.dryRun) {
      result.actions.push({ action: 'create-draft-release', tag: edition.releaseTag, dryRun: true })
      return {
        id: null,
        tag_name: edition.releaseTag,
        html_url: `https://github.com/${owner}/${edition.repoName}/releases/tag/${encodeURIComponent(edition.releaseTag)}`,
        upload_url: `https://uploads.github.com/repos/${owner}/${edition.repoName}/releases/dry-run/assets{?name,label}`,
        draft: true,
        prerelease: true,
        assets: [],
      }
    }
    release = await githubJson(`/repos/${owner}/${edition.repoName}/releases`, { method: 'POST', token: authToken, body })
    result.actions.push({ action: 'create-draft-release', id: release.id, tag: edition.releaseTag })
  } else {
    if (release.draft !== true) throw new Error(`${edition.repoName}@${edition.releaseTag} is already public; refusing to modify it as a draft gate.`)
    if (args.dryRun) {
      result.actions.push({ action: 'update-draft-release', id: release.id, dryRun: true })
    } else {
      release = await githubJson(`/repos/${owner}/${edition.repoName}/releases/${release.id}`, { method: 'PATCH', token: authToken, body })
      result.actions.push({ action: 'update-draft-release', id: release.id })
    }
  }
  requireTrue(release.draft === true, `${edition.repoName}@${edition.releaseTag} must be draft=true.`)
  requireTrue(release.prerelease === true, `${edition.repoName}@${edition.releaseTag} must be prerelease=true.`)
  return release
}

async function publishEdition({ args, edition, owner, authToken }) {
  const result = {
    repoName: edition.repoName,
    packId: edition.packId,
    releaseTag: edition.releaseTag,
    actions: [],
  }
  const staged = await readStagedAssets(args, edition)
  const release = await ensureRelease({ args, edition, owner, authToken, result })
  const liveAssets = await listAssets(release, authToken)
  const liveByName = new Map(liveAssets.map((asset) => [asset.name, asset]))
  const requiredNames = new Set(edition.requiredAssets)

  const unlistedLiveAssets = liveAssets.filter((asset) => !requiredNames.has(asset.name))
  if (unlistedLiveAssets.length && !args.pruneUnlisted) {
    throw new Error(`${edition.repoName} draft release contains unlisted assets: ${unlistedLiveAssets.map((asset) => asset.name).join(', ')}. Re-run with --prune-unlisted after confirming these are stale.`)
  }
  for (const asset of unlistedLiveAssets) {
    if (PLACEHOLDER_PATTERN.test(asset.name)) result.actions.push({ action: 'detected-placeholder-live-asset', name: asset.name })
    if (args.dryRun) {
      result.actions.push({ action: 'delete-unlisted-asset', name: asset.name, id: asset.id, dryRun: true })
      continue
    }
    await githubJson(`/repos/${owner}/${edition.repoName}/releases/assets/${asset.id}`, {
      method: 'DELETE',
      token: authToken,
      allow404: true,
    })
    result.actions.push({ action: 'delete-unlisted-asset', name: asset.name, id: asset.id })
    liveByName.delete(asset.name)
  }

  for (const asset of staged.assets) {
    const existing = liveByName.get(asset.name)
    if (existing) {
      const existingSha = digestSha256(existing)
      if (existing.size === asset.size && existingSha === asset.sha256) {
        result.actions.push({ action: 'skip-matching-asset', name: asset.name, id: existing.id })
        continue
      }
      if (args.dryRun) {
        result.actions.push({ action: 'replace-asset', name: asset.name, id: existing.id, dryRun: true })
        continue
      }
      await githubJson(`/repos/${owner}/${edition.repoName}/releases/assets/${existing.id}`, {
        method: 'DELETE',
        token: authToken,
        allow404: true,
      })
      result.actions.push({ action: 'delete-existing-asset', name: asset.name, id: existing.id })
    }
    if (args.dryRun) {
      result.actions.push({ action: 'upload-asset', name: asset.name, dryRun: true })
      continue
    }
    const uploaded = await githubUpload(release.upload_url, asset.path, asset.name, authToken)
    result.actions.push({ action: 'upload-asset', name: asset.name, id: uploaded.id })
  }

  const freshRelease = args.dryRun
    ? release
    : await githubJson(`/repos/${owner}/${edition.repoName}/releases/${release.id}`, { token: authToken })
  const freshAssets = args.dryRun ? staged.assets.map((asset) => ({
    name: asset.name,
    size: asset.size,
    sha256: asset.sha256,
    browserDownloadUrl: `https://github.com/${owner}/${edition.repoName}/releases/download/${encodeURIComponent(edition.releaseTag)}/${encodeURIComponent(asset.name)}`,
  })) : await listAssets(freshRelease, authToken)

  const freshByName = new Map(freshAssets.map((asset) => [asset.name, asset]))
  const findings = []
  for (const name of edition.requiredAssets) {
    const stagedAsset = staged.assets.find((asset) => asset.name === name)
    const liveAsset = freshByName.get(name)
    if (!liveAsset) {
      findings.push(`${edition.repoName} release is missing ${name} after publish.`)
      continue
    }
    const liveSha = digestSha256(liveAsset) || liveAsset.sha256
    if (Number(liveAsset.size) !== stagedAsset.size) findings.push(`${edition.repoName} ${name} live size mismatch.`)
    if (liveSha && liveSha !== stagedAsset.sha256) findings.push(`${edition.repoName} ${name} live SHA-256 mismatch.`)
  }
  for (const asset of freshAssets) {
    if (!requiredNames.has(asset.name)) findings.push(`${edition.repoName} release contains unlisted asset ${asset.name} after publish.`)
    if (PLACEHOLDER_PATTERN.test(asset.name)) findings.push(`${edition.repoName} release contains placeholder/generic asset ${asset.name} after publish.`)
  }
  if (findings.length) throw new Error(findings.join(' '))

  return {
    ...result,
    stage: staged.stage,
    release: {
      owner,
      repoName: edition.repoName,
      id: freshRelease.id ?? null,
      tagName: freshRelease.tag_name ?? edition.releaseTag,
      htmlUrl: freshRelease.html_url ?? null,
      draft: Boolean(freshRelease.draft),
      prerelease: Boolean(freshRelease.prerelease),
    },
    requiredAssets: edition.requiredAssets,
    assets: staged.assets.map(({ path: _path, ...asset }) => {
      const live = freshByName.get(asset.name)
      return {
        ...asset,
        githubAssetId: live?.id ?? null,
        browserDownloadUrl: assetDownloadUrl(live) || `https://github.com/${owner}/${edition.repoName}/releases/download/${encodeURIComponent(edition.releaseTag)}/${encodeURIComponent(asset.name)}`,
      }
    }),
  }
}

async function publish(args) {
  const authToken = token(args)
  requireTrue(authToken, 'Publishing Galactic Survey draft releases requires ECHO_PUBLIC_ALPHA_TOKEN, GITHUB_TOKEN, GH_TOKEN, or --token-env.')

  const owner = args.owner || 'knoxhack'
  const selected = EDITIONS.filter((edition) => !args.only || args.only.has(edition.key) || args.only.has(edition.repoName.toLowerCase()))
  requireTrue(selected.length > 0, 'No Galactic Survey editions selected.')

  const editions = []
  for (const edition of selected) editions.push(await publishEdition({ args, edition, owner, authToken }))
  const actionCounts = editions.flatMap((edition) => edition.actions).reduce((counts, action) => {
    counts[action.action] = (counts[action.action] ?? 0) + 1
    return counts
  }, {})
  const publishedAssetCount = editions.reduce((sum, edition) => sum + edition.assets.length, 0)

  return {
    schemaVersion: 'echo.galactic_survey.draft-publish.v1',
    generatedAt: new Date().toISOString(),
    status: args.dryRun ? 'DRY_RUN' : 'PASS',
    summary: {
      dryRun: Boolean(args.dryRun),
      draftReleasesPublished: !args.dryRun,
      publishedEditionCount: editions.length,
      publishedAssetCount,
      actionCounts,
      pruneUnlisted: Boolean(args.pruneUnlisted),
    },
    data: {
      assetRoot: rel(args.root, args.assetRootPath),
      editions,
    },
  }
}

function failedReport(args, message) {
  return {
    schemaVersion: 'echo.galactic_survey.draft-publish.v1',
    generatedAt: new Date().toISOString(),
    status: 'FAILED',
    summary: {
      dryRun: Boolean(args.dryRun),
      draftReleasesPublished: false,
      blockingDiagnostics: 1,
      errors: [message],
    },
    data: {
      assetRoot: rel(args.root, args.assetRootPath),
      editions: [],
    },
  }
}

async function main() {
  const args = parseCommonArgs(process.argv.slice(2), { dryRun: true, extraArgs })
  if (args.help) {
    process.stdout.write(usage())
    return
  }
  if (args.assetRoot === 'tmp/public-alpha-assets') args.assetRoot = DEFAULT_ASSET_ROOT
  args.out ??= DEFAULT_OUT
  args.assetRootPath = path.isAbsolute(args.assetRoot) ? args.assetRoot : path.join(args.root, args.assetRoot)
  args.outPath = path.isAbsolute(args.out) ? args.out : path.join(args.root, args.out)

  try {
    const report = await publish(args)
    await writeJson(args.outPath, report)
    process.stdout.write(`${JSON.stringify({
      ok: report.status !== 'FAILED',
      status: report.status,
      out: rel(args.root, args.outPath),
      dryRun: report.summary.dryRun,
      publishedEditionCount: report.summary.publishedEditionCount,
      publishedAssetCount: report.summary.publishedAssetCount,
      actionCounts: report.summary.actionCounts,
    }, null, 2)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeJson(args.outPath, failedReport(args, message)).catch(() => undefined)
    process.stderr.write(`Galactic Survey draft release publish failed: ${message}\n`)
    process.exitCode = 1
  }
}

await main()
