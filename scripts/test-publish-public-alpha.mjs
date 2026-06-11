#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'publish-public-alpha.mjs')
const sha = 'c'.repeat(64)
const tag = 'v0.1.0-standalone-runtime-alpha'
const ashfallTag = 'v0.1.0-ashfall-native-edition'

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeFile(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value)
}

function jsonResponse(response, value) {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

async function startGithubFixture() {
  const assets = [{
    id: 99,
    name: 'stale-placeholder.zip',
    size: 5,
    digest: `sha256:${sha256(Buffer.from('stale'))}`,
    browser_download_url: `https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/download/${tag}/stale-placeholder.zip`,
  }]
  const ashfallAssets = [
    {
      id: 50,
      name: 'echo-native-product-1.0.0-existing-layout-rc.zip',
      size: 11,
      digest: `sha256:${sha256(Buffer.from('placeholder'))}`,
      browser_download_url: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/${ashfallTag}/echo-native-product-1.0.0-existing-layout-rc.zip`,
    },
    {
      id: 51,
      name: 'manifest.json',
      size: 8,
      digest: `sha256:${sha256(Buffer.from('manifest'))}`,
      browser_download_url: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/${ashfallTag}/manifest.json`,
    },
  ]
  let baseUrl = ''
  let releaseDraft = true
  let ashfallReleaseDraft = true
  const release = () => ({
    id: 10,
    html_url: `https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/tag/${tag}`,
    upload_url: `${baseUrl}/uploads/repos/knoxhack/ECHO-Standalone-Runtime/releases/10/assets{?name,label}`,
    draft: releaseDraft,
    prerelease: true,
    assets,
  })
  const ashfallRelease = () => ({
    id: 20,
    html_url: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/tag/${ashfallTag}`,
    upload_url: `${baseUrl}/uploads/repos/knoxhack/ECHO-Ashfall-Native-Edition/releases/20/assets{?name,label}`,
    draft: ashfallReleaseDraft,
    prerelease: true,
    assets: ashfallAssets,
  })
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/repos/knoxhack/ECHO-Standalone-Runtime') {
      jsonResponse(response, { private: false, default_branch: 'main' })
      return
    }
    if (request.method === 'GET' && url.pathname === '/repos/knoxhack/ECHO-Ashfall-Native-Edition') {
      jsonResponse(response, { private: false, default_branch: 'main' })
      return
    }
    if (request.method === 'GET' && url.pathname === `/repos/knoxhack/ECHO-Standalone-Runtime/releases/tags/${tag}`) {
      jsonResponse(response, release())
      return
    }
    if (request.method === 'GET' && url.pathname === `/repos/knoxhack/ECHO-Ashfall-Native-Edition/releases/tags/${ashfallTag}`) {
      jsonResponse(response, ashfallRelease())
      return
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/repos/knoxhack/ECHO-Standalone-Runtime/releases/assets/')) {
      const id = Number(path.basename(url.pathname))
      const index = assets.findIndex((asset) => asset.id === id)
      if (index >= 0) assets.splice(index, 1)
      response.writeHead(204)
      response.end()
      return
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/repos/knoxhack/ECHO-Ashfall-Native-Edition/releases/assets/')) {
      const id = Number(path.basename(url.pathname))
      const index = ashfallAssets.findIndex((asset) => asset.id === id)
      if (index >= 0) ashfallAssets.splice(index, 1)
      response.writeHead(204)
      response.end()
      return
    }
    if (request.method === 'PATCH' && url.pathname === '/repos/knoxhack/ECHO-Standalone-Runtime/releases/10') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      releaseDraft = Boolean(body.draft)
      jsonResponse(response, release())
      return
    }
    if (request.method === 'PATCH' && url.pathname === '/repos/knoxhack/ECHO-Ashfall-Native-Edition/releases/20') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      ashfallReleaseDraft = Boolean(body.draft)
      jsonResponse(response, ashfallRelease())
      return
    }
    if (request.method === 'POST' && url.pathname === '/uploads/repos/knoxhack/ECHO-Standalone-Runtime/releases/10/assets') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const bytes = Buffer.concat(chunks)
      const name = url.searchParams.get('name')
      const asset = {
        id: assets.length + 1,
        name,
        size: bytes.length,
        digest: `sha256:${sha256(bytes)}`,
        browser_download_url: `https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/download/${tag}/${encodeURIComponent(name)}`,
      }
      assets.push(asset)
      jsonResponse(response, asset)
      return
    }
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ message: `Unhandled fixture route: ${request.method} ${url.pathname}` }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
  server.setReleaseDraft = (value) => { releaseDraft = Boolean(value) }
  server.setAshfallReleaseDraft = (value) => { ashfallReleaseDraft = Boolean(value) }
  return server
}

function run(root, apiBaseUrl, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      script,
      '--root',
      root,
      '--asset-root',
      'tmp/public-alpha-assets',
      '--strict-assets',
      ...args,
    ], {
      env: {
        ...process.env,
        GITHUB_API_BASE_URL: apiBaseUrl,
        GH_TOKEN: 'fixture-token',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-public-alpha-publish-'))
const server = await startGithubFixture()
try {
  const apiBaseUrl = `http://127.0.0.1:${server.address().port}`
  await writeJson(root, 'channels/alpha/release-manifest.json', {
    owner: 'knoxhack',
    releaseTag: 'v0.1.0-alpha',
    repositories: [
      {
        repoName: 'ECHO-Release-Index',
        product: 'ECHO Release Index',
        releaseKind: 'index',
        release: {
          htmlUrl: 'https://github.com/knoxhack/ECHO-Release-Index/releases/tag/v0.1.0-alpha',
        },
        assets: [
          {
            name: 'index-fixture.json',
            size: 10,
            sha256: sha,
            browserDownloadUrl: 'https://github.com/knoxhack/ECHO-Release-Index/releases/download/v0.1.0-alpha/index-fixture.json',
          },
        ],
      },
      {
        repoName: 'ECHO-Standalone-Runtime',
        product: 'ECHO Standalone Runtime',
        releaseKind: 'runtime',
        release: {
          htmlUrl: `https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/tag/${tag}`,
        },
        assets: [
          {
            name: 'alpha-readiness-gate.json',
            size: 100,
            sha256: sha,
            browserDownloadUrl: `https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/download/${tag}/alpha-readiness-gate.json`,
          },
        ],
      },
    ],
  })
  await writeFile(root, 'tmp/public-alpha-assets/ECHO-Standalone-Runtime/alpha-readiness-gate.json', '{"status":"PASS_WITH_WARNINGS"}\n')
  await writeFile(root, 'tmp/public-alpha-assets/ECHO-Standalone-Runtime/echo-standalone-runtime-0.1.0-alpha.zip', Buffer.from('fixture zip bytes'))

  const result = await run(root, apiBaseUrl, ['--only', 'ECHO-Standalone-Runtime', '--draft', '--prune-unlisted'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.ok, true)
  assert.equal(payload.draft, true)
  assert.equal(payload.pruneUnlisted, true)
  assert.equal(payload.convertExistingPublicReleaseToDraft, false)
  assert.deepEqual(payload.only, ['ECHO-Standalone-Runtime'])
  assert.deepEqual(payload.results.map((item) => item.repoName), ['ECHO-Standalone-Runtime'])
  assert.deepEqual(payload.missing, [])
  assert(payload.results[0].actions.some((action) => action.action === 'delete-unlisted-asset' && action.name === 'stale-placeholder.zip'))
  const plannedUploads = payload.results[0].actions
    .filter((action) => action.action === 'upload-asset')
    .map((action) => action.name)
  assert.deepEqual(plannedUploads, [
    'alpha-readiness-gate.json',
    'echo-standalone-runtime-0.1.0-alpha.zip',
  ])

  server.setReleaseDraft(false)
  const refusedPublicToDraft = await run(root, apiBaseUrl, ['--only', 'ECHO-Standalone-Runtime', '--draft', '--prune-unlisted'])
  assert.equal(refusedPublicToDraft.status, 1, `${refusedPublicToDraft.stdout}\n${refusedPublicToDraft.stderr}`)
  assert.match(`${refusedPublicToDraft.stdout}\n${refusedPublicToDraft.stderr}`, /Refusing to convert it back to draft/u)
  const explicitPublicToDraft = await run(root, apiBaseUrl, [
    '--only',
    'ECHO-Standalone-Runtime',
    '--draft',
    '--convert-existing-public-release-to-draft',
    '--prune-unlisted',
  ])
  assert.equal(explicitPublicToDraft.status, 0, `${explicitPublicToDraft.stdout}\n${explicitPublicToDraft.stderr}`)
  assert.equal(JSON.parse(explicitPublicToDraft.stdout).convertExistingPublicReleaseToDraft, true)
  server.setReleaseDraft(true)

  const publish = await run(root, apiBaseUrl, ['--only', 'ECHO-Standalone-Runtime', '--draft', '--prune-unlisted', '--publish', '--write-manifest'])
  assert.equal(publish.status, 0, `${publish.stdout}\n${publish.stderr}`)
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'channels', 'alpha', 'release-manifest.json'), 'utf8'))
  const runtime = manifest.repositories.find((repository) => repository.repoName === 'ECHO-Standalone-Runtime')
  assert.equal(runtime.release.id, 10)
  assert.equal(runtime.release.draft, true)
  assert.deepEqual(runtime.assets.map((asset) => asset.name), [
    'alpha-readiness-gate.json',
    'echo-standalone-runtime-0.1.0-alpha.zip',
  ])
  assert.equal(runtime.assets[1].sha256, sha256(Buffer.from('fixture zip bytes')))
  assert.equal(runtime.assets[1].browserDownloadUrl, `https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/download/${tag}/echo-standalone-runtime-0.1.0-alpha.zip`)

  const ashfallRoot = path.join(root, 'ashfall-filter')
  await writeJson(ashfallRoot, 'channels/alpha/release-manifest.json', {
    owner: 'knoxhack',
    repositories: [
      {
        repoName: 'ECHO-Ashfall-Native-Edition',
        product: 'Ashfall Native Edition',
        releaseKind: 'modpack',
        releaseTag: ashfallTag,
        release: {
          htmlUrl: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/tag/${ashfallTag}`,
        },
        assets: [
          {
            name: 'checksums.txt',
            size: 1,
            sha256: sha,
            browserDownloadUrl: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/${ashfallTag}/checksums.txt`,
          },
          {
            name: 'manifest.json',
            size: 1,
            sha256: sha,
            browserDownloadUrl: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/${ashfallTag}/manifest.json`,
          },
          {
            name: 'echo-native-product-1.0.0-existing-layout-rc.zip',
            size: 1,
            sha256: sha,
            browserDownloadUrl: `https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/${ashfallTag}/echo-native-product-1.0.0-existing-layout-rc.zip`,
          },
        ],
      },
    ],
  })
  for (const name of [
    'checksums.txt',
    'echo-release.json',
    'ashfall-native-edition-alpha-0.1.0.pack.json',
    'ashfall-native-edition-0.1.0.zip',
    'manifest.json',
  ]) {
    await writeFile(ashfallRoot, `tmp/public-alpha-assets/ECHO-Ashfall-Native-Edition/${name}`, `${name}\n`)
  }
  const ashfall = await run(ashfallRoot, apiBaseUrl, ['--only', 'ECHO-Ashfall-Native-Edition', '--draft', '--prune-unlisted'])
  assert.equal(ashfall.status, 0, `${ashfall.stdout}\n${ashfall.stderr}`)
  const ashfallPayload = JSON.parse(ashfall.stdout)
  assert.deepEqual(ashfallPayload.results[0].skippedStagedAssets, ['manifest.json'])
  assert.deepEqual(
    ashfallPayload.results[0].actions.filter((action) => action.action === 'delete-unlisted-asset').map((action) => action.name).sort(),
    ['echo-native-product-1.0.0-existing-layout-rc.zip', 'manifest.json'],
  )
  assert.deepEqual(
    ashfallPayload.results[0].actions.filter((action) => action.action === 'upload-asset').map((action) => action.name),
    [
      'ashfall-native-edition-0.1.0.zip',
      'ashfall-native-edition-alpha-0.1.0.pack.json',
      'checksums.txt',
      'echo-release.json',
    ],
  )
} finally {
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(root, { recursive: true, force: true })
}

console.log('Public alpha publish fixtures passed.')
