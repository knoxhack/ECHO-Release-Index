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
const script = path.join(repoRoot, 'scripts', 'download-galactic-survey-draft-releases.mjs')

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

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function bytesForEdition(edition, extraAssetNames = []) {
  const packZip = Buffer.from(`downloaded ${edition.packZip}\n`, 'utf8')
  const packManifest = jsonBytes({
    pack: edition.packId,
    artifactName: edition.packZip,
    artifactSha256: sha256(packZip),
    artifactSize: packZip.length,
  })
  const buildReport = jsonBytes({
    schemaVersion: 'echo.galactic_survey.pack-build-report.v1',
    packId: edition.packId,
    ok: true,
  })
  const releaseManifest = jsonBytes({
    formatVersion: 2,
    pack: edition.packId,
    manifestAsset: edition.packManifest,
    artifactAsset: edition.packZip,
    artifactSha256: sha256(packZip),
    artifactSize: packZip.length,
  })
  const nonChecksumAssets = new Map([
    ['echo-release.json', releaseManifest],
    [edition.packManifest, packManifest],
    [edition.packZip, packZip],
    ['galactic-survey-pack-build-report.json', buildReport],
  ])
  const checksumText = [...nonChecksumAssets.entries()]
    .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
    .sort()
    .join('\n')
  return new Map([
    ['checksums.txt', Buffer.from(`${checksumText}\n`, 'utf8')],
    ...nonChecksumAssets.entries(),
    ...extraAssetNames.map((name) => [name, Buffer.from(`stale ${name}\n`, 'utf8')]),
  ])
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
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`)
    const base = `http://${request.headers.host}/api`
    const edition = editions.find((candidate) => url.pathname.includes(`/repos/knoxhack/${candidate.repoName}/`))
    if (!edition) {
      response.writeHead(404, { 'Content-Type': 'text/plain' })
      response.end(`not found: ${url.pathname}`)
      return
    }

    const bytesByName = bytesForEdition(edition, state.extraAssetNamesByRepo.get(edition.repoName) ?? [])
    const assets = [...bytesByName.entries()].map(([name, bytes], index) => ({
      id: `${editions.indexOf(edition) + 1}${index + 1}`,
      name,
      size: bytes.length,
      digest: `sha256:${sha256(bytes)}`,
      browser_download_url: `https://github.com/knoxhack/${edition.repoName}/releases/download/${edition.releaseTag}/${encodeURIComponent(name)}`,
      url: `${base}/repos/knoxhack/${edition.repoName}/releases/assets/${editions.indexOf(edition) + 1}${index + 1}`,
      state: 'uploaded',
    }))
    const assetById = new Map(assets.map((asset) => [String(asset.id), asset]))

    if (url.pathname === `/api/repos/knoxhack/${edition.repoName}/releases/tags/${edition.releaseTag}`) {
      sendJson(response, {
        id: 1000 + editions.indexOf(edition),
        tag_name: edition.releaseTag,
        html_url: `https://github.com/knoxhack/${edition.repoName}/releases/tag/${edition.releaseTag}`,
        draft: state.draftByRepo.get(edition.repoName) ?? true,
        prerelease: true,
        assets_url: `${base}/repos/knoxhack/${edition.repoName}/releases/${1000 + editions.indexOf(edition)}/assets`,
      })
      return
    }
    if (url.pathname === `/api/repos/knoxhack/${edition.repoName}/releases/${1000 + editions.indexOf(edition)}/assets`) {
      sendJson(response, assets)
      return
    }
    const assetMatch = url.pathname.match(new RegExp(`/api/repos/knoxhack/${edition.repoName}/releases/assets/(\\d+)$`, 'u'))
    if (assetMatch) {
      const asset = assetById.get(assetMatch[1])
      const bytes = bytesByName.get(asset?.name)
      if (!asset || !bytes) {
        response.writeHead(404, { 'Content-Type': 'text/plain' })
        response.end(`asset not found: ${url.pathname}`)
        return
      }
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

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-galactic-survey-draft-download-test-'))
const state = {
  draftByRepo: new Map(),
  extraAssetNamesByRepo: new Map(),
}
const api = await startFixtureApi(state)
try {
  const passRoot = path.join(tmp, 'pass')
  await fs.mkdir(passRoot, { recursive: true })
  const pass = await run(passRoot, api.baseUrl)
  assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`)
  const passReport = JSON.parse(await fs.readFile(path.join(passRoot, 'release-readiness/galactic-survey-draft-download.json'), 'utf8'))
  assert.equal(passReport.schemaVersion, 'echo.galactic_survey.draft-download.v1')
  assert.equal(passReport.status, 'PASS')
  assert.equal(passReport.summary.downloadedFromGitHubRelease, true)
  assert.equal(passReport.summary.draftReleasesDownloaded, true)
  assert.equal(passReport.summary.downloadedEditionCount, 3)
  assert.equal(passReport.summary.downloadedAssetCount, 15)
  assert.equal(passReport.data.editions.length, 3)
  for (const edition of editions) {
    const downloaded = passReport.data.editions.find((entry) => entry.repoName === edition.repoName)
    assert.equal(downloaded.release.draft, true)
    assert.equal(downloaded.release.prerelease, true)
    assert.equal(downloaded.downloadedAssets.length, 5)
    for (const name of edition.requiredAssets) {
      assert.equal(await fs.readFile(path.join(passRoot, 'tmp/galactic-survey-draft-download', edition.repoName, name), 'utf8').then(() => true), true)
    }
  }

  state.draftByRepo.set('ECHO-Galactic-Survey-NeoForge-Edition', false)
  const nonDraftRoot = path.join(tmp, 'non-draft')
  await fs.mkdir(nonDraftRoot, { recursive: true })
  const nonDraft = await run(nonDraftRoot, api.baseUrl)
  assert.equal(nonDraft.status, 1)
  assert.match(`${nonDraft.stdout}\n${nonDraft.stderr}`, /must be a GitHub draft/u)
  const nonDraftReport = JSON.parse(await fs.readFile(path.join(nonDraftRoot, 'release-readiness/galactic-survey-draft-download.json'), 'utf8'))
  assert.equal(nonDraftReport.status, 'FAILED')

  state.draftByRepo.set('ECHO-Galactic-Survey-NeoForge-Edition', true)
  state.extraAssetNamesByRepo.set('ECHO-Galactic-Survey-Standalone-Edition', ['manifest.json'])
  const staleRoot = path.join(tmp, 'stale')
  await fs.mkdir(staleRoot, { recursive: true })
  const stale = await run(staleRoot, api.baseUrl)
  assert.equal(stale.status, 1)
  assert.match(`${stale.stdout}\n${stale.stderr}`, /unlisted asset manifest\.json|placeholder\/generic asset manifest\.json/u)
} finally {
  await api.close()
  await fs.rm(tmp, { recursive: true, force: true })
}

console.log('Galactic Survey draft release downloader fixtures passed.')
