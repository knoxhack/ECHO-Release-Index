import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

export const DEFAULT_MANIFEST = 'channels/alpha/release-manifest.json'
export const DEFAULT_ASSET_ROOT = 'tmp/public-alpha-assets'
export const DEFAULT_WORKSPACE_ROOT = path.resolve(process.cwd(), '..')
export const GITHUB_API_BASE_URL = process.env.GITHUB_API_BASE_URL || 'https://api.github.com'
export const PUBLIC_ALPHA_USER_AGENT = 'ECHO-Public-Alpha-Tooling'

export function parseCommonArgs(argv, defaults = {}) {
  const args = {
    root: process.cwd(),
    manifest: DEFAULT_MANIFEST,
    assetRoot: DEFAULT_ASSET_ROOT,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
    owner: null,
    dryRun: Boolean(defaults.dryRun),
    strictAssets: false,
    out: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--manifest') args.manifest = next()
    else if (arg === '--asset-root') args.assetRoot = next()
    else if (arg === '--workspace-root') args.workspaceRoot = path.resolve(next())
    else if (arg === '--owner') args.owner = next()
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--strict-assets') args.strictAssets = true
    else if (arg === '--out') args.out = next()
    else if (arg === '--help' || arg === '-h') args.help = true
    else if (defaults.extraArgs?.has(arg)) defaults.extraArgs.get(arg)(args, next)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  args.manifestPath = path.resolve(args.root, args.manifest)
  args.assetRootPath = path.resolve(args.root, args.assetRoot)
  return args
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function githubApiUrl(route) {
  return new URL(route.replace(/^\/+/, ''), `${GITHUB_API_BASE_URL.replace(/\/+$/, '')}/`).toString()
}

export function githubHeaders(token, extra = {}) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': PUBLIC_ALPHA_USER_AGENT,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

export function releaseTagForRepository(manifest, repository) {
  return repository.releaseTag || repository.release?.tagName || parseReleaseTag(repository.release?.htmlUrl) || manifest.releaseTag
}

export function parseReleaseTag(value) {
  if (!value) return ''
  const match = String(value).match(/\/releases\/tag\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export function expectedAssetNames(repository) {
  return (repository.assets || []).map((asset) => asset.name).filter(Boolean)
}

export async function fileSha256(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(filePath))
  return hash.digest('hex')
}

export async function assetRecord(filePath, repoName, tag) {
  const stats = await fs.stat(filePath)
  const name = path.basename(filePath)
  return {
    name,
    size: stats.size,
    sha256: await fileSha256(filePath),
    browserDownloadUrl: `https://github.com/knoxhack/${repoName}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`.replace(/%2F/gi, '/'),
  }
}

export async function existingFile(filePath) {
  try {
    const stats = await fs.stat(filePath)
    return stats.isFile()
  } catch {
    return false
  }
}

export async function listFiles(root) {
  const out = []
  try {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name)
      if (entry.isDirectory()) out.push(...await listFiles(full))
      else if (entry.isFile()) out.push(full)
    }
  } catch {
    return []
  }
  return out
}

export function repoPath(workspaceRoot, repoName) {
  return path.join(workspaceRoot, repoName)
}

export function releaseBody(repository, tag) {
  const unsignedNote = ['launcher', 'studio'].includes(repository.releaseKind)
    ? '\n\nWindows binaries in this public alpha may be unsigned until release signing is provisioned.'
    : ''
  return [
    `${repository.product || repository.repoName} public alpha release.`,
    '',
    `Tag: ${tag}`,
    `Role: ${repository.publicRole || repository.releaseKind || 'public alpha component'}`,
    '',
    'This release is published for public alpha testing. It remains a prerelease and should not be treated as a stable production channel.',
    unsignedNote.trim(),
  ].filter(Boolean).join('\n')
}

