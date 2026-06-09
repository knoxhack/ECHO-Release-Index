#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  DEFAULT_ASSET_ROOT,
  DEFAULT_MANIFEST,
  expectedAssetNames,
  githubApiUrl,
  githubHeaders,
  parseCommonArgs,
  readJson,
  releaseBody,
  releaseTagForRepository,
  writeJson,
} from './public-alpha-common.mjs'

const extraArgs = new Map([
  ['--publish', (args) => { args.dryRun = false; args.publish = true }],
  ['--make-public', (args) => { args.makePublic = true }],
  ['--write-manifest', (args) => { args.writeManifest = true }],
  ['--token-env', (args, next) => { args.tokenEnv = next() }],
])

function usage() {
  return `Usage: node scripts/publish-public-alpha.mjs [options]

Publishes the public alpha manifest to GitHub Releases. Dry run is the default.

Options:
  --manifest <path>        Manifest to publish. Defaults to ${DEFAULT_MANIFEST}.
  --asset-root <path>      Asset staging root. Defaults to ${DEFAULT_ASSET_ROOT}.
  --publish                Perform GitHub writes. Without this, no writes occur.
  --make-public            Patch manifest repositories to private:false.
  --strict-assets          Fail if any manifest asset is missing from staging or live release.
  --write-manifest         Rewrite manifest release IDs/assets from live GitHub state after publish.
  --token-env <name>       Read token from a specific env var.
`
}

function token(args) {
  if (args.tokenEnv) return process.env[args.tokenEnv]
  return process.env.ECHO_PUBLIC_ALPHA_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
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

async function githubUpload(uploadUrl, filePath, name, options) {
  const base = uploadUrl.replace(/\{.*$/, '')
  const url = `${base}${base.includes('?') ? '&' : '?'}name=${encodeURIComponent(name)}`
  const bytes = await fs.readFile(filePath)
  const response = await fetch(url, {
    method: 'POST',
    headers: githubHeaders(options.token, {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
    }),
    body: bytes,
  })
  if (!response.ok) throw new Error(`GitHub upload ${name} failed ${response.status}: ${await response.text()}`)
  return response.json()
}

async function stagedAssets(assetRoot, repository) {
  const stage = path.join(assetRoot, repository.repoName)
  const out = []
  for (const name of expectedAssetNames(repository)) {
    const filePath = path.join(stage, name)
    try {
      const stats = await fs.stat(filePath)
      if (stats.isFile()) out.push({ name, path: filePath, size: stats.size })
    } catch {
      // Missing assets are handled by the caller.
    }
  }
  return out
}

async function ensureRepository(owner, repository, args, authToken, result) {
  const route = `/repos/${owner}/${repository.repoName}`
  let repo = await githubJson(route, { token: authToken, allow404: true })
  if (!repo) {
    result.actions.push({ action: 'repo-check', status: 'missing-or-inaccessible' })
    return null
  }
  result.visibilityBefore = repo.private ? 'private' : 'public'
  if (args.makePublic && repo.private) {
    if (args.dryRun) {
      result.actions.push({ action: 'make-public', dryRun: true })
    } else {
      repo = await githubJson(route, { method: 'PATCH', token: authToken, body: { private: false } })
      result.actions.push({ action: 'make-public', status: repo.private ? 'still-private' : 'public' })
    }
  }
  result.visibilityAfter = repo.private ? 'private' : 'public'
  return repo
}

async function ensureRelease(owner, repository, tag, repo, args, authToken, result) {
  const releaseRoute = `/repos/${owner}/${repository.repoName}/releases/tags/${encodeURIComponent(tag)}`
  let release = await githubJson(releaseRoute, { token: authToken, allow404: true })
  const body = {
    tag_name: tag,
    target_commitish: repo?.default_branch || 'main',
    name: `${repository.product || repository.repoName} ${tag}`,
    body: releaseBody(repository, tag),
    draft: false,
    prerelease: true,
    make_latest: 'false',
  }
  if (!release) {
    if (args.dryRun) {
      result.actions.push({ action: 'create-release', tag, dryRun: true })
      return {
        id: null,
        tag_name: tag,
        html_url: `https://github.com/${owner}/${repository.repoName}/releases/tag/${encodeURIComponent(tag)}`,
        upload_url: `https://uploads.github.com/repos/${owner}/${repository.repoName}/releases/dry-run/assets{?name,label}`,
        draft: false,
        prerelease: true,
        assets: [],
      }
    }
    release = await githubJson(`/repos/${owner}/${repository.repoName}/releases`, { method: 'POST', token: authToken, body })
    result.actions.push({ action: 'create-release', id: release.id, tag })
  } else {
    if (args.dryRun) {
      result.actions.push({ action: 'update-release', id: release.id, dryRun: true })
    } else {
      release = await githubJson(`/repos/${owner}/${repository.repoName}/releases/${release.id}`, { method: 'PATCH', token: authToken, body })
      result.actions.push({ action: 'update-release', id: release.id })
    }
  }
  return release
}

async function listAssets(owner, repoName, release, authToken) {
  if (release.assets && Array.isArray(release.assets)) return release.assets
  if (!release.assets_url) return []
  const assets = []
  for (let page = 1; page <= 20; page += 1) {
    const separator = release.assets_url.includes('?') ? '&' : '?'
    const response = await fetch(`${release.assets_url}${separator}per_page=100&page=${page}`, {
      headers: githubHeaders(authToken),
    })
    if (!response.ok) throw new Error(`GitHub assets ${owner}/${repoName} failed ${response.status}: ${await response.text()}`)
    const pageAssets = await response.json()
    assets.push(...pageAssets)
    if (!Array.isArray(pageAssets) || pageAssets.length < 100) break
  }
  return assets
}

async function uploadAssets(owner, repository, release, args, authToken, result) {
  const staged = await stagedAssets(args.assetRootPath, repository)
  const stagedByName = new Map(staged.map((asset) => [asset.name, asset]))
  const missing = expectedAssetNames(repository).filter((name) => !stagedByName.has(name))
  result.missingStagedAssets = missing

  const liveAssets = await listAssets(owner, repository.repoName, release, authToken)
  const liveByName = new Map(liveAssets.map((asset) => [asset.name, asset]))
  for (const asset of staged) {
    if (args.dryRun) {
      result.actions.push({ action: 'upload-asset', name: asset.name, dryRun: true })
      continue
    }
    const existing = liveByName.get(asset.name)
    if (existing) {
      await githubJson(`/repos/${owner}/${repository.repoName}/releases/assets/${existing.id}`, { method: 'DELETE', token: authToken })
      result.actions.push({ action: 'delete-existing-asset', name: asset.name, id: existing.id })
    }
    const uploaded = await githubUpload(release.upload_url, asset.path, asset.name, { token: authToken })
    result.actions.push({ action: 'upload-asset', name: asset.name, id: uploaded.id })
  }
  return missing
}

function releaseToManifestRecord(release) {
  return {
    id: release.id ?? null,
    htmlUrl: release.html_url,
    uploadUrl: release.upload_url,
    draft: Boolean(release.draft),
    prerelease: Boolean(release.prerelease),
  }
}

function assetToManifestRecord(asset) {
  return {
    name: asset.name,
    size: asset.size ?? 0,
    sha256: asset.digest?.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : asset.sha256 ?? '',
    browserDownloadUrl: asset.browser_download_url,
  }
}

async function main() {
  const args = parseCommonArgs(process.argv.slice(2), { dryRun: true, extraArgs })
  if (args.help) {
    console.log(usage())
    return
  }
  const authToken = token(args)
  if (!authToken && !args.dryRun) throw new Error('Publishing requires ECHO_PUBLIC_ALPHA_TOKEN, GITHUB_TOKEN, or GH_TOKEN.')

  const manifest = await readJson(args.manifestPath)
  const owner = args.owner || manifest.owner || 'knoxhack'
  const results = []
  const missing = []
  for (const repository of manifest.repositories) {
    const tag = releaseTagForRepository(manifest, repository)
    const result = { repoName: repository.repoName, tag, actions: [] }
    const repo = await ensureRepository(owner, repository, args, authToken, result)
    if (!repo) {
      missing.push(`${repository.repoName}: repository missing or inaccessible`)
      results.push(result)
      continue
    }
    const release = await ensureRelease(owner, repository, tag, repo, args, authToken, result)
    const missingAssets = await uploadAssets(owner, repository, release, args, authToken, result)
    missing.push(...missingAssets.map((asset) => `${repository.repoName}/${asset}`))

    if (args.writeManifest && !args.dryRun) {
      const freshRelease = await githubJson(`/repos/${owner}/${repository.repoName}/releases/tags/${encodeURIComponent(tag)}`, { token: authToken })
      const freshAssets = await listAssets(owner, repository.repoName, freshRelease, authToken)
      repository.release = releaseToManifestRecord(freshRelease)
      repository.assets = freshAssets.map(assetToManifestRecord)
    }
    results.push(result)
  }

  if (args.writeManifest && !args.dryRun) {
    manifest.generatedAt = new Date().toISOString()
    manifest.private = false
    await writeJson(args.manifestPath, manifest)
  }

  const summary = {
    ok: missing.length === 0 || !args.strictAssets,
    dryRun: args.dryRun,
    makePublic: Boolean(args.makePublic),
    strictAssets: Boolean(args.strictAssets),
    missing,
    results,
  }
  if (args.out) await writeJson(path.resolve(args.root, args.out), summary)
  console.log(JSON.stringify(summary, null, 2))
  if (missing.length > 0 && args.strictAssets) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})

