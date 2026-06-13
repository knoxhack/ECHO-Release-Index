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
const script = path.join(repoRoot, 'scripts', 'publish-galactic-survey-draft-releases.mjs')

const editions = [
  {
    repoName: 'ECHO-Galactic-Survey-Native-Edition',
    packId: 'galactic-survey-native-edition',
    releaseTag: 'galactic-survey-native-0.1.0-alpha',
    packManifest: 'galactic-survey-native-edition-alpha-0.1.0.pack.json',
    packZip: 'galactic-survey-native-edition-0.1.0.zip',
  },
  {
    repoName: 'ECHO-Galactic-Survey-NeoForge-Edition',
    packId: 'galactic-survey-neoforge-edition',
    releaseTag: 'galactic-survey-neoforge-0.1.0-alpha',
    packManifest: 'galactic-survey-neoforge-edition-alpha-0.1.0.pack.json',
    packZip: 'galactic-survey-neoforge-edition-0.1.0.zip',
  },
  {
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

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function writeStagedAssets(root, options = {}) {
  const assetRoot = path.join(root, 'tmp', 'galactic-survey-edition-assets')
  for (const edition of editions) {
    const editionRoot = path.join(assetRoot, edition.repoName)
    await fs.mkdir(editionRoot, { recursive: true })
    const bytesByName = new Map()
    for (const name of edition.requiredAssets.filter((asset) => asset !== 'checksums.txt')) {
      const body = name === 'echo-release.json'
        ? JSON.stringify({
            pack: edition.packId,
            manifestAsset: edition.packManifest,
            artifactAsset: edition.packZip,
            artifactSha256: 'fixture-sha',
            artifactSize: 123,
          }, null, 2)
        : `fixture ${edition.repoName} ${name}\n`
      bytesByName.set(name, Buffer.from(`${body}\n`, 'utf8'))
    }
    const checksums = [...bytesByName.entries()]
      .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
      .sort()
      .join('\n')
    bytesByName.set('checksums.txt', Buffer.from(`${checksums}\n`, 'utf8'))
    for (const [name, bytes] of bytesByName.entries()) {
      if (options.missing?.repoName === edition.repoName && options.missing?.name === name) continue
      await fs.writeFile(path.join(editionRoot, name), bytes)
    }
  }
  return assetRoot
}

function sendJson(response, status, value) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8')
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': body.length,
  })
  response.end(body)
}

function notFound(response, message = 'not found') {
  sendJson(response, 404, { message })
}

async function startFixtureApi(state) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`)
      const apiBase = `http://${request.headers.host}/api`
      const uploadBase = `http://${request.headers.host}/uploads`
      const edition = editions.find((candidate) => url.pathname.includes(`/repos/knoxhack/${candidate.repoName}`))
      if (!edition) {
        notFound(response)
        return
      }
      const repoState = state.repos.get(edition.repoName)
      if (!repoState) {
        notFound(response, 'repo missing')
        return
      }

      if (url.pathname === `/api/repos/knoxhack/${edition.repoName}`) {
        sendJson(response, 200, {
          name: edition.repoName,
          full_name: `knoxhack/${edition.repoName}`,
          default_branch: 'main',
          private: false,
        })
        return
      }

      if (url.pathname === `/api/repos/knoxhack/${edition.repoName}/releases/tags/${edition.releaseTag}`) {
        if (!repoState.release) {
          notFound(response, 'release missing')
          return
        }
        sendJson(response, 200, releasePayload({ apiBase, uploadBase, edition, repoState }))
        return
      }

      if (url.pathname === `/api/repos/knoxhack/${edition.repoName}/releases` && request.method === 'GET') {
        sendJson(response, 200, repoState.release ? [releasePayload({ apiBase, uploadBase, edition, repoState })] : [])
        return
      }

      if (url.pathname === `/api/repos/knoxhack/${edition.repoName}/releases` && request.method === 'POST') {
        const body = await readRequestJson(request)
        repoState.release = {
          id: 1000 + editions.indexOf(edition),
          tagName: body.tag_name,
          draft: Boolean(body.draft),
          prerelease: Boolean(body.prerelease),
        }
        sendJson(response, 201, releasePayload({ apiBase, uploadBase, edition, repoState }))
        return
      }

      const releasePatch = url.pathname.match(new RegExp(`/api/repos/knoxhack/${edition.repoName}/releases/(\\d+)$`, 'u'))
      if (releasePatch && request.method === 'GET') {
        sendJson(response, 200, releasePayload({ apiBase, uploadBase, edition, repoState }))
        return
      }

      if (releasePatch && request.method === 'PATCH') {
        const body = await readRequestJson(request)
        repoState.release.draft = Boolean(body.draft)
        repoState.release.prerelease = Boolean(body.prerelease)
        sendJson(response, 200, releasePayload({ apiBase, uploadBase, edition, repoState }))
        return
      }

      if (url.pathname === `/api/repos/knoxhack/${edition.repoName}/releases/${repoState.release?.id}/assets`) {
        sendJson(response, 200, [...repoState.assets.values()].map((asset) => assetPayload({ apiBase, uploadBase, edition, asset })))
        return
      }

      const deleteMatch = url.pathname.match(new RegExp(`/api/repos/knoxhack/${edition.repoName}/releases/assets/(\\d+)$`, 'u'))
      if (deleteMatch && request.method === 'DELETE') {
        repoState.assets.delete(Number(deleteMatch[1]))
        response.writeHead(204)
        response.end()
        return
      }

      const uploadMatch = url.pathname.match(new RegExp(`/uploads/repos/knoxhack/${edition.repoName}/releases/(\\d+)/assets$`, 'u'))
      if (uploadMatch && request.method === 'POST') {
        const name = url.searchParams.get('name')
        const bytes = await readRequestBytes(request)
        const id = state.nextAssetId++
        const asset = { id, name, bytes }
        repoState.assets.set(id, asset)
        sendJson(response, 201, assetPayload({ apiBase, uploadBase, edition, asset }))
        return
      }

      notFound(response, `not found: ${url.pathname}`)
    } catch (error) {
      sendJson(response, 500, { message: error instanceof Error ? error.message : String(error) })
    }
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return {
    baseUrl: `http://127.0.0.1:${port}/api/`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

function releasePayload({ apiBase, uploadBase, edition, repoState }) {
  return {
    id: repoState.release.id,
    tag_name: repoState.release.tagName,
    html_url: `https://github.com/knoxhack/${edition.repoName}/releases/tag/${edition.releaseTag}`,
    upload_url: `${uploadBase}/repos/knoxhack/${edition.repoName}/releases/${repoState.release.id}/assets{?name,label}`,
    assets_url: `${apiBase}/repos/knoxhack/${edition.repoName}/releases/${repoState.release.id}/assets`,
    draft: repoState.release.draft,
    prerelease: repoState.release.prerelease,
  }
}

function assetPayload({ apiBase, edition, asset }) {
  return {
    id: asset.id,
    name: asset.name,
    size: asset.bytes.length,
    digest: `sha256:${sha256(asset.bytes)}`,
    browser_download_url: `https://github.com/knoxhack/${edition.repoName}/releases/download/${edition.releaseTag}/${encodeURIComponent(asset.name)}`,
    url: `${apiBase}/repos/knoxhack/${edition.repoName}/releases/assets/${asset.id}`,
    state: 'uploaded',
  }
}

function readRequestBytes(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('error', reject)
    request.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

async function readRequestJson(request) {
  const bytes = await readRequestBytes(request)
  return JSON.parse(bytes.toString('utf8') || '{}')
}

function run(root, apiBaseUrl, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--root', root, '--publish', '--prune-unlisted', ...extraArgs], {
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
    }, 20000)
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

function initialState() {
  return {
    nextAssetId: 2000,
    repos: new Map(editions.map((edition) => [edition.repoName, { release: null, assets: new Map() }])),
  }
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-galactic-survey-draft-publish-test-'))
try {
  {
    const root = path.join(tmp, 'pass')
    await writeStagedAssets(root)
    const state = initialState()
    const api = await startFixtureApi(state)
    try {
      const result = await run(root, api.baseUrl)
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      const report = JSON.parse(await fs.readFile(path.join(root, 'release-readiness/galactic-survey-draft-publish.json'), 'utf8'))
      assert.equal(report.schemaVersion, 'echo.galactic_survey.draft-publish.v1')
      assert.equal(report.status, 'PASS')
      assert.equal(report.summary.draftReleasesPublished, true)
      assert.equal(report.summary.publishedEditionCount, 3)
      assert.equal(report.summary.publishedAssetCount, 15)
      assert.equal(report.data.editions.length, 3)
      for (const edition of report.data.editions) {
        assert.equal(edition.release.draft, true)
        assert.equal(edition.release.prerelease, true)
        assert.equal(edition.assets.length, 5)
      }
    } finally {
      await api.close()
    }
  }

  {
    const root = path.join(tmp, 'public-release')
    await writeStagedAssets(root)
    const state = initialState()
    state.repos.get('ECHO-Galactic-Survey-Native-Edition').release = {
      id: 4001,
      tagName: 'galactic-survey-native-0.1.0-alpha',
      draft: false,
      prerelease: true,
    }
    const api = await startFixtureApi(state)
    try {
      const result = await run(root, api.baseUrl)
      assert.equal(result.status, 1)
      assert.match(`${result.stdout}\n${result.stderr}`, /already public; refusing/u)
      const report = JSON.parse(await fs.readFile(path.join(root, 'release-readiness/galactic-survey-draft-publish.json'), 'utf8'))
      assert.equal(report.status, 'FAILED')
    } finally {
      await api.close()
    }
  }

  {
    const root = path.join(tmp, 'missing-stage')
    await writeStagedAssets(root, {
      missing: {
        repoName: 'ECHO-Galactic-Survey-Standalone-Edition',
        name: 'galactic-survey-standalone-edition-0.1.0.zip',
      },
    })
    const state = initialState()
    const api = await startFixtureApi(state)
    try {
      const result = await run(root, api.baseUrl)
      assert.equal(result.status, 1)
      assert.match(`${result.stdout}\n${result.stderr}`, /missing staged asset galactic-survey-standalone-edition-0\.1\.0\.zip/u)
    } finally {
      await api.close()
    }
  }
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}

console.log('Galactic Survey draft release publisher fixtures passed.')
