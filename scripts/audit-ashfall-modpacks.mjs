#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const editions = [
  {
    label: 'Ashfall Native Edition',
    repoName: 'ECHO-Ashfall-Native-Edition',
    modpackPath: 'modpacks/ashfall-native.json',
    packPath: 'packs/ashfall-native-edition.json',
  },
  {
    label: 'Ashfall NeoForge Edition',
    repoName: 'ECHO-Ashfall-NeoForge-Edition',
    modpackPath: 'modpacks/ashfall-neoforge.json',
    packPath: 'packs/ashfall-neoforge-edition.json',
  },
  {
    label: 'Ashfall Standalone Edition',
    repoName: 'ECHO-Ashfall-Standalone-Edition',
    modpackPath: 'modpacks/ashfall-standalone.json',
    packPath: 'packs/ashfall-standalone-edition.json',
  },
]

const requiredRoles = ['pack', 'manifest', 'checksums', 'releaseManifest']

function parseArgs(argv) {
  const args = { root: process.cwd(), owner: 'knoxhack', liveGithub: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--owner') args.owner = argv[++index]
    else if (arg === '--live-github') args.liveGithub = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function usage() {
  return `Usage: node scripts/audit-ashfall-modpacks.mjs [options]

Audits all Ashfall modpack catalog entries so install approval cannot drift away
from published artifact metadata or release-readiness evidence.

Options:
  --root <dir>      Release Index root. Defaults to cwd.
  --owner <owner>   GitHub owner. Defaults to knoxhack.
  --live-github     Verify live GitHub release assets and small JSON/checksum payloads.
  --help            Print this help text.
`
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function artifactForRole(modpack, role) {
  const artifact = modpack.artifacts?.[role]
  if (!artifact) return null
  return {
    role,
    file: artifact.file,
    url: artifact.url,
    sha256: artifact.sha256,
    size: artifact.size,
  }
}

function packAssetByName(pack, fileName) {
  return (pack.assets ?? []).find((asset) => asset.name === fileName)
}

function releaseAssetByName(release, fileName) {
  return (release.assets ?? []).find((asset) => asset.name === fileName)
}

function issue(out, message) {
  out.push(message)
}

function warn(out, message) {
  out.push(message)
}

function compareArtifactPair(errors, label, leftName, left, rightName, right) {
  if (!right) {
    issue(errors, `${label} ${rightName} is missing ${left.file}.`)
    return
  }
  const rightUrl = right.browserDownloadUrl ?? right.url
  const rightFile = right.name ?? right.file
  for (const field of ['sha256', 'size']) {
    if (left[field] !== undefined && right[field] !== undefined && left[field] !== right[field]) {
      issue(errors, `${label} ${leftName}.${field} for ${left.file} does not match ${rightName}.${field}.`)
    }
  }
  if (left.url && rightUrl && left.url !== rightUrl) {
    issue(errors, `${label} ${leftName}.url for ${left.file} does not match ${rightName}.url.`)
  }
  if (left.file && rightFile && left.file !== rightFile) {
    issue(errors, `${label} ${leftName}.file ${left.file} does not match ${rightName}.name ${rightFile}.`)
  }
}

function githubHeaders() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.ECHO_PUBLIC_ALPHA_TOKEN
  return {
    accept: 'application/vnd.github+json',
    'user-agent': 'echo-release-index-ashfall-audit',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

async function githubJson(route) {
  const response = await fetch(`https://api.github.com${route}`, { headers: githubHeaders() })
  if (!response.ok) throw new Error(`GitHub GET ${route} failed ${response.status}: ${await response.text()}`)
  return response.json()
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'echo-release-index-ashfall-audit' } })
  if (!response.ok) throw new Error(`GET ${url} failed ${response.status}: ${await response.text()}`)
  return Buffer.from(await response.arrayBuffer())
}

function verifyDownloadedArtifact(errors, label, artifact, buffer) {
  const actualSha = sha256(buffer)
  if (artifact.sha256 && actualSha !== artifact.sha256) {
    issue(errors, `${label} ${artifact.file} downloaded SHA-256 ${actualSha} does not match catalog ${artifact.sha256}.`)
  }
  if (Number.isInteger(artifact.size) && buffer.length !== artifact.size) {
    issue(errors, `${label} ${artifact.file} downloaded size ${buffer.length} does not match catalog ${artifact.size}.`)
  }
}

function checksumRows(text) {
  const rows = new Map()
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/iu)
    if (match) rows.set(match[2].trim(), match[1].toLowerCase())
  }
  return rows
}

function verifyChecksums(errors, label, checksumsText, artifacts) {
  const rows = checksumRows(checksumsText)
  for (const artifact of artifacts) {
    if (artifact.role === 'checksums') continue
    const checksum = rows.get(artifact.file)
    if (!checksum) {
      issue(errors, `${label} checksums.txt does not list ${artifact.file}.`)
      continue
    }
    if (checksum !== artifact.sha256) {
      issue(errors, `${label} checksums.txt hash for ${artifact.file} does not match catalog metadata.`)
    }
  }
}

function verifyPackManifest(errors, warnings, label, modpack, artifact, payload, packArtifact) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    issue(errors, `${label} ${artifact.file} is not a JSON object.`)
    return
  }
  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    issue(errors, `${label} ${artifact.file} has no files array.`)
  }
  if (!Array.isArray(payload.moduleRequirements) || payload.moduleRequirements.length === 0) {
    const message = `${label} ${artifact.file} has no moduleRequirements.`
    if (modpack.validation === 'approved') issue(errors, message)
    else warn(warnings, message)
  }
  const comparisons = [
    ['artifactName', packArtifact.file],
    ['artifactSha256', packArtifact.sha256],
    ['artifactSize', packArtifact.size],
  ]
  for (const [field, expected] of comparisons) {
    if (payload[field] !== expected) {
      issue(errors, `${label} ${artifact.file}.${field} expected ${JSON.stringify(expected)} but found ${JSON.stringify(payload[field])}.`)
    }
  }
}

function verifyReleaseManifest(errors, label, artifact, payload, artifacts) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    issue(errors, `${label} ${artifact.file} is not a JSON object.`)
    return
  }
  const releaseAssets = Array.isArray(payload.assets) ? payload.assets : []
  if (releaseAssets.length === 0) {
    issue(errors, `${label} ${artifact.file} has no assets array.`)
    return
  }
  for (const expected of artifacts.filter((entry) => ['pack', 'manifest'].includes(entry.role))) {
    const actual = releaseAssets.find((asset) => asset.name === expected.file)
    if (!actual) {
      issue(errors, `${label} ${artifact.file} does not list ${expected.file}.`)
      continue
    }
    if (actual.sha256 && actual.sha256 !== expected.sha256) {
      issue(errors, `${label} ${artifact.file} hash for ${expected.file} does not match catalog metadata.`)
    }
    if (actual.size && actual.size !== expected.size) {
      issue(errors, `${label} ${artifact.file} size for ${expected.file} does not match catalog metadata.`)
    }
  }
}

function readinessGateFailed(root) {
  const result = spawnSync(process.execPath, ['scripts/verify-ashfall-release-readiness.mjs', '--require-release-ready'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result.status !== 0
}

async function auditEdition(args, edition, errors, warnings) {
  const modpack = await readJson(path.join(args.root, edition.modpackPath))
  const pack = await readJson(path.join(args.root, edition.packPath))

  if (modpack.id !== pack.id) issue(errors, `${edition.label} modpack id ${modpack.id} does not match pack id ${pack.id}.`)
  if (modpack.sourceRepo !== `${args.owner}/${edition.repoName}`) {
    issue(errors, `${edition.label} sourceRepo ${modpack.sourceRepo} does not match ${args.owner}/${edition.repoName}.`)
  }

  const artifacts = requiredRoles.map((role) => artifactForRole(modpack, role))
  for (const [index, artifact] of artifacts.entries()) {
    const role = requiredRoles[index]
    if (!artifact) {
      issue(errors, `${edition.label} is missing ${role} artifact metadata.`)
      continue
    }
    for (const field of ['file', 'url', 'sha256', 'size']) {
      if (artifact[field] === undefined || artifact[field] === null || artifact[field] === '') {
        issue(errors, `${edition.label} ${role} artifact is missing ${field}.`)
      }
    }
    compareArtifactPair(errors, edition.label, `modpacks.${role}`, artifact, 'packs.assets', packAssetByName(pack, artifact.file))
  }

  const validArtifacts = artifacts.filter(Boolean)
  if (modpack.validation === 'approved' && pack.releaseReadiness?.status !== 'approved') {
    issue(errors, `${edition.label} modpack is approved while pack releaseReadiness is ${pack.releaseReadiness?.status ?? 'missing'}.`)
  }

  if (args.liveGithub) {
    const release = await githubJson(`/repos/${args.owner}/${edition.repoName}/releases/tags/${encodeURIComponent(modpack.releaseTag)}`)
    if (release.draft) issue(errors, `${edition.label} release ${modpack.releaseTag} is still draft.`)
    if (!release.prerelease) warn(warnings, `${edition.label} release ${modpack.releaseTag} is not marked prerelease.`)
    for (const artifact of validArtifacts) {
      const asset = releaseAssetByName(release, artifact.file)
      if (!asset) {
        issue(errors, `${edition.label} GitHub release is missing ${artifact.file}.`)
        continue
      }
      if (asset.size !== artifact.size) issue(errors, `${edition.label} GitHub size for ${artifact.file} does not match catalog metadata.`)
      const digest = String(asset.digest ?? '').replace(/^sha256:/iu, '').toLowerCase()
      if (digest && digest !== artifact.sha256) issue(errors, `${edition.label} GitHub digest for ${artifact.file} does not match catalog metadata.`)
    }

    for (const role of ['manifest', 'checksums', 'releaseManifest']) {
      const artifact = artifactForRole(modpack, role)
      if (!artifact) continue
      const bytes = await fetchBytes(artifact.url)
      verifyDownloadedArtifact(errors, edition.label, artifact, bytes)
      if (role === 'checksums') verifyChecksums(errors, edition.label, bytes.toString('utf8'), validArtifacts)
      if (role === 'manifest') verifyPackManifest(errors, warnings, edition.label, modpack, artifact, JSON.parse(bytes.toString('utf8')), artifactForRole(modpack, 'pack'))
      if (role === 'releaseManifest') verifyReleaseManifest(errors, edition.label, artifact, JSON.parse(bytes.toString('utf8')), validArtifacts)
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const errors = []
  const warnings = []
  const gateFailed = readinessGateFailed(args.root)

  for (const edition of editions) {
    await auditEdition(args, edition, errors, warnings)
  }

  if (gateFailed) {
    for (const edition of editions) {
      const modpack = await readJson(path.join(args.root, edition.modpackPath))
      const pack = await readJson(path.join(args.root, edition.packPath))
      if (modpack.validation === 'approved') {
        issue(errors, `${edition.label} is approved while the Ashfall release-readiness gate fails.`)
      }
      if (pack.releaseReadiness?.status === 'approved') {
        issue(errors, `${edition.label} pack releaseReadiness is approved while the Ashfall release-readiness gate fails.`)
      }
    }
    warn(warnings, 'Ashfall release-readiness gate is still red; modpack install entries must remain warning-gated.')
  }

  for (const warning of warnings) console.warn(`warning: ${warning}`)
  if (errors.length) {
    console.error(`Ashfall modpack audit failed with ${errors.length} error(s):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exit(1)
  }
  console.log(args.liveGithub
    ? 'Ashfall modpack audit passed against local metadata and live GitHub release assets.'
    : 'Ashfall modpack audit passed against local metadata.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
