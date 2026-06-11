#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'download-ashfall-draft-release.mjs')
const tag = 'v0.1.0-ashfall-native-edition'
const repoName = 'ECHO-Ashfall-Native-Edition'
const requiredAssets = [
  'checksums.txt',
  'echo-release.json',
  'ashfall-native-edition-alpha-0.1.0.pack.json',
  'ashfall-native-edition-0.1.0.zip',
]

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeManifest(root) {
  await writeJson(root, 'channels/alpha/release-manifest.json', {
    owner: 'knoxhack',
    repositories: [
      {
        repoName,
        releaseTag: tag,
        release: { id: 123, draft: true, prerelease: true },
      },
    ],
  })
}

function sendJson(response, value) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8')
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': body.length,
  })
  response.end(body)
}

function sendBytes(response, bytes) {
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': bytes.length,
  })
  response.end(bytes)
}

async function startFixtureApi(state) {
  const bytesByName = new Map(requiredAssets.map((name) => [name, Buffer.from(`downloaded ${name}\n`, 'utf8')]))
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`)
    const base = `http://${request.headers.host}/api`
    const assets = [
      ...requiredAssets,
      ...state.extraAssetNames,
    ].map((name, index) => {
      const bytes = bytesByName.get(name) ?? Buffer.from(`stale ${name}\n`, 'utf8')
      return {
        id: index + 1,
        name,
        size: bytes.length,
        digest: `sha256:${sha256(bytes)}`,
        browser_download_url: `https://github.com/knoxhack/${repoName}/releases/download/${tag}/${encodeURIComponent(name)}`,
        url: `${base}/repos/knoxhack/${repoName}/releases/assets/${index + 1}`,
        state: 'uploaded',
      }
    })
    const assetById = new Map(assets.map((asset) => [String(asset.id), asset]))

    if (url.pathname === `/api/repos/knoxhack/${repoName}/releases/123`) {
      sendJson(response, {
        id: 123,
        tag_name: tag,
        html_url: `https://github.com/knoxhack/${repoName}/releases/tag/${tag}`,
        draft: state.draft,
        prerelease: true,
        assets_url: `${base}/repos/knoxhack/${repoName}/releases/123/assets`,
      })
      return
    }
    if (url.pathname === `/api/repos/knoxhack/${repoName}/releases/123/assets`) {
      sendJson(response, assets)
      return
    }
    const assetMatch = url.pathname.match(new RegExp(`/api/repos/knoxhack/${repoName}/releases/assets/(\\d+)$`, 'u'))
    if (assetMatch) {
      const asset = assetById.get(assetMatch[1])
      const bytes = bytesByName.get(asset?.name) ?? Buffer.from(`stale ${asset?.name}\n`, 'utf8')
      sendBytes(response, bytes)
      return
    }
    response.writeHead(404, { 'Content-Type': 'text/plain' })
    response.end(`not found: ${url.pathname}`)
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return {
    baseUrl: `http://127.0.0.1:${port}/api/`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

function run(root, apiBaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--root', root, '--clean'], {
      cwd: repoRoot,
      windowsHide: true,
      env: {
        ...process.env,
        GITHUB_API_BASE_URL: apiBaseUrl,
        GITHUB_TOKEN: 'fixture-token',
      },
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Timed out running ${script}`))
    }, 15000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      resolve({ status, signal, stdout, stderr })
    })
  })
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-draft-download-test-'))
const state = { draft: true, extraAssetNames: [] }
const api = await startFixtureApi(state)
try {
  const passRoot = path.join(tmp, 'pass')
  await writeManifest(passRoot)
  const pass = await run(passRoot, api.baseUrl)
  assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`)
  for (const name of requiredAssets) {
    assert.equal(await fs.readFile(path.join(passRoot, 'tmp/ashfall-draft-download/ECHO-Ashfall-Native-Edition', name), 'utf8'), `downloaded ${name}\n`)
  }
  const passReport = JSON.parse(await fs.readFile(path.join(passRoot, 'release-readiness/ashfall-draft-download.json'), 'utf8'))
  assert.equal(passReport.status, 'PASS')
  assert.equal(passReport.data.downloadedFromGitHubRelease, true)
  assert.equal(passReport.data.draftReleaseDownloaded, true)
  assert.equal(passReport.data.release.draft, true)
  assert.equal(passReport.data.downloadedAssets.length, 4)
  assert.equal(passReport.data.downloadedAssets.every((asset) => asset.state === 'uploaded'), true)
  assert.equal(passReport.summary.totalBytes, passReport.data.downloadedAssets.reduce((sum, asset) => sum + asset.size, 0))

  state.draft = false
  const nonDraftRoot = path.join(tmp, 'non-draft')
  await writeManifest(nonDraftRoot)
  const nonDraft = await run(nonDraftRoot, api.baseUrl)
  assert.equal(nonDraft.status, 1)
  assert.match(`${nonDraft.stdout}\n${nonDraft.stderr}`, /must be a GitHub draft/u)
  const nonDraftReport = JSON.parse(await fs.readFile(path.join(nonDraftRoot, 'release-readiness/ashfall-draft-download.json'), 'utf8'))
  assert.equal(nonDraftReport.status, 'FAILED')

  state.draft = true
  state.extraAssetNames = ['manifest.json']
  const staleRoot = path.join(tmp, 'stale')
  await writeManifest(staleRoot)
  const stale = await run(staleRoot, api.baseUrl)
  assert.equal(stale.status, 1)
  assert.match(`${stale.stdout}\n${stale.stderr}`, /unlisted asset manifest\.json|placeholder\/generic asset manifest\.json/u)
} finally {
  await api.close()
  await fs.rm(tmp, { recursive: true, force: true })
}

console.log('Ashfall draft release downloader fixtures passed.')
