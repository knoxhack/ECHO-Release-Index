import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  DEFAULT_MANIFEST,
  expectedAssetNames,
  githubApiUrl,
  githubHeaders,
  parseReleaseTag,
  readJson,
  releaseTagForRepository,
} from './public-alpha-common.mjs'

function parseArgs(argv) {
  const args = { root: process.cwd(), manifest: DEFAULT_MANIFEST, liveGithub: false, strictAssets: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--manifest') args.manifest = argv[++index]
    else if (arg === '--live-github') args.liveGithub = true
    else if (arg === '--strict-assets') args.strictAssets = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  args.manifestPath = path.resolve(args.root, args.manifest)
  return args
}

const args = parseArgs(process.argv.slice(2))
const root = args.root
const scanDirs = ['channels/alpha', 'products', 'packs', 'modpacks', 'modules']
const releaseUrlPattern = /^https:\/\/github\.com\/knoxhack\/[A-Za-z0-9_.-]+\/releases\/(?:tag|download)\/[^/\s]+(?:\/[^\s]+)?$/
const errors = []

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function jsonFiles(dir) {
  const absolute = path.join(root, dir)
  if (!fs.existsSync(absolute)) return []
  const out = []
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const full = path.join(absolute, entry.name)
    if (entry.isDirectory()) out.push(...jsonFiles(path.relative(root, full)))
    else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.schema.json')) out.push(full)
  }
  return out
}

function walk(value, visitor, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...pathParts, String(index)]))
    return
  }
  if (!value || typeof value !== 'object') return
  visitor(value, pathParts)
  for (const [key, item] of Object.entries(value)) {
    walk(item, visitor, [...pathParts, key])
  }
}

function validateString(filePath, value, jsonPath) {
  if (/untagged-[a-f0-9]+/i.test(value)) {
    errors.push(`${rel(filePath)} ${jsonPath} contains raw untagged release metadata`)
  }
  if (value.includes('/releases/tag/') || value.includes('/releases/download/')) {
    if (!releaseUrlPattern.test(value)) {
      errors.push(`${rel(filePath)} ${jsonPath} must use a GitHub HTTPS release URL`)
    }
  }
}

function validateStaticMetadata() {
  for (const filePath of scanDirs.flatMap(jsonFiles)) {
    let payload
    try {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
      errors.push(`${rel(filePath)} is invalid JSON: ${error.message}`)
      continue
    }

    walk(payload, (node, pathParts) => {
      for (const [key, value] of Object.entries(node)) {
        const jsonPath = [...pathParts, key].join('.') || key
        if (key === 'private' && value === true) errors.push(`${rel(filePath)} ${jsonPath} must be false for public alpha`)
        if (key === 'draft' && value === true) errors.push(`${rel(filePath)} ${jsonPath} must be false for public alpha`)
        if (typeof value === 'string') validateString(filePath, value, jsonPath)
      }
    })
  }
}

async function githubJson(route, token, allow404 = false) {
  const response = await fetch(githubApiUrl(route), { headers: githubHeaders(token) })
  if (response.status === 404 && allow404) return null
  if (!response.ok) throw new Error(`GitHub GET ${route} failed ${response.status}: ${await response.text()}`)
  return response.json()
}

async function githubAssets(release, token) {
  const assets = []
  const assetsUrl = release.assets_url || ''
  for (let page = 1; page <= 20; page += 1) {
    const separator = assetsUrl.includes('?') ? '&' : '?'
    const response = await fetch(`${assetsUrl}${separator}per_page=100&page=${page}`, { headers: githubHeaders(token) })
    if (!response.ok) throw new Error(`GitHub release assets failed ${response.status}: ${await response.text()}`)
    const pageAssets = await response.json()
    if (!Array.isArray(pageAssets)) break
    assets.push(...pageAssets)
    if (pageAssets.length < 100) break
  }
  return assets
}

async function validateLiveGithub() {
  const manifest = await readJson(args.manifestPath)
  const owner = manifest.owner || 'knoxhack'
  const token = process.env.ECHO_PUBLIC_ALPHA_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  for (const repository of manifest.repositories || []) {
    const repoName = repository.repoName
    const repo = await githubJson(`/repos/${owner}/${repoName}`, token, true)
    if (!repo) {
      errors.push(`${repoName} is missing or inaccessible from GitHub API`)
      continue
    }
    if (repo.private) errors.push(`${repoName} must be public for public alpha`)

    const tag = releaseTagForRepository(manifest, repository) || parseReleaseTag(repository.release?.htmlUrl)
    const release = await githubJson(`/repos/${owner}/${repoName}/releases/tags/${encodeURIComponent(tag)}`, token, true)
    if (!release) {
      errors.push(`${repoName} release ${tag} is missing or inaccessible`)
      continue
    }
    if (release.draft) errors.push(`${repoName} release ${tag} must not be draft`)
    if (!release.prerelease) errors.push(`${repoName} release ${tag} must remain prerelease for alpha`)

    if (args.strictAssets) {
      const expected = expectedAssetNames(repository)
      const assets = await githubAssets(release, token)
      const actual = new Set(assets.map((asset) => asset.name))
      for (const name of expected) {
        if (!actual.has(name)) errors.push(`${repoName} release ${tag} missing asset ${name}`)
      }
    }
  }
}

validateStaticMetadata()
if (args.liveGithub) await validateLiveGithub()

if (errors.length > 0) {
  console.error(`Public alpha validation failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(args.liveGithub ? 'Public alpha metadata and live GitHub validation passed.' : 'Public alpha metadata validation passed.')

