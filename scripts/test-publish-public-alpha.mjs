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
  const assets = []
  let baseUrl = ''
  const release = () => ({
    id: 10,
    html_url: `https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/tag/${tag}`,
    upload_url: `${baseUrl}/uploads/repos/knoxhack/ECHO-Standalone-Runtime/releases/10/assets{?name,label}`,
    draft: false,
    prerelease: true,
    assets,
  })
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/repos/knoxhack/ECHO-Standalone-Runtime') {
      jsonResponse(response, { private: false, default_branch: 'main' })
      return
    }
    if (request.method === 'GET' && url.pathname === `/repos/knoxhack/ECHO-Standalone-Runtime/releases/tags/${tag}`) {
      jsonResponse(response, release())
      return
    }
    if (request.method === 'PATCH' && url.pathname === '/repos/knoxhack/ECHO-Standalone-Runtime/releases/10') {
      jsonResponse(response, release())
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

  const result = await run(root, apiBaseUrl)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.ok, true)
  assert.deepEqual(payload.missing, [])
  const plannedUploads = payload.results[0].actions
    .filter((action) => action.action === 'upload-asset')
    .map((action) => action.name)
  assert.deepEqual(plannedUploads, [
    'alpha-readiness-gate.json',
    'echo-standalone-runtime-0.1.0-alpha.zip',
  ])

  const publish = await run(root, apiBaseUrl, ['--publish', '--write-manifest'])
  assert.equal(publish.status, 0, `${publish.stdout}\n${publish.stderr}`)
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'channels', 'alpha', 'release-manifest.json'), 'utf8'))
  const runtime = manifest.repositories[0]
  assert.equal(runtime.release.id, 10)
  assert.deepEqual(runtime.assets.map((asset) => asset.name), [
    'alpha-readiness-gate.json',
    'echo-standalone-runtime-0.1.0-alpha.zip',
  ])
  assert.equal(runtime.assets[1].sha256, sha256(Buffer.from('fixture zip bytes')))
  assert.equal(runtime.assets[1].browserDownloadUrl, `https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/download/${tag}/echo-standalone-runtime-0.1.0-alpha.zip`)
} finally {
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(root, { recursive: true, force: true })
}

console.log('Public alpha publish fixtures passed.')
