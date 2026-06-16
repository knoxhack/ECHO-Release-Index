#!/usr/bin/env node
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const verifier = path.join(repoRoot, 'scripts', 'verify-public-alpha-live-channel.mjs')

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function artifact(baseUrl, name, body, sha256 = digest(body)) {
  return {
    file: name,
    url: `${baseUrl}/assets/${name}`,
    sha256,
    size: Buffer.byteLength(body),
  }
}

async function withFixtureServer(buildRoutes, fn) {
  let routes = new Map()
  const server = http.createServer((request, response) => {
    const route = routes.get(request.url)
    if (!route) {
      response.writeHead(404, { 'content-type': 'text/plain' })
      response.end('not found')
      return
    }
    const body = Buffer.isBuffer(route.body) ? route.body : Buffer.from(route.body)
    response.writeHead(200, {
      'content-type': route.type ?? 'application/octet-stream',
      'content-length': body.byteLength,
    })
    response.end(body)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address()
    const baseUrl = `http://127.0.0.1:${port}`
    routes = buildRoutes(baseUrl)
    await fn(baseUrl)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function runVerifier(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [verifier, ...args], {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

function buildRoutes(baseUrl, badSha) {
  const packBody = 'pack bytes'
  const manifestBody = '{"pack":true}'
  const moduleBody = 'module bytes'
  const graphBody = '{"graph":true}'
  const evidenceBody = '{"schemaVersion":"echo.content_graph.evidence.v1"}'
  const checksumBody = 'checksums'
  const releaseBody = '{"release":true}'

  const pack = artifact(baseUrl, 'pack.zip', packBody)
  const manifest = artifact(baseUrl, 'pack.json', manifestBody)
  const checksums = artifact(baseUrl, 'checksums.txt', checksumBody)
  const releaseManifest = artifact(baseUrl, 'echo-release.json', releaseBody)
  const module = artifact(baseUrl, 'module.echo-addon', moduleBody, badSha ? '0'.repeat(64) : digest(moduleBody))
  const contentGraph = artifact(baseUrl, 'module-content-graph.json', graphBody)
  const contentGraphEvidence = {
    ...artifact(baseUrl, 'content-graph-evidence.json', evidenceBody),
    artifactRole: 'content-graph-evidence',
    schemaVersion: 'echo.content_graph.evidence.v1',
  }

  return new Map([
    ['/channel.json', {
      type: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
        channel: 'alpha',
        releaseManifestUrl: `${baseUrl}/release-manifest.json`,
        catalogUrls: {
          products: [],
          modpacks: [`${baseUrl}/modpacks/pack.json`],
          modules: [`${baseUrl}/modules/module.json`],
          addons: [],
        },
      }),
    }],
    ['/release-manifest.json', {
      type: 'application/json',
      body: JSON.stringify({
        repositories: [{
          repoName: 'ECHO-Pack',
          releaseTag: 'v1',
          assets: [
            { name: pack.file, browserDownloadUrl: pack.url, sha256: pack.sha256, size: pack.size },
            { name: manifest.file, browserDownloadUrl: manifest.url, sha256: manifest.sha256, size: manifest.size },
          ],
        }],
      }),
    }],
    ['/modpacks/pack.json', {
      type: 'application/json',
      body: JSON.stringify({
        id: 'fixture-pack',
        kind: 'modpack',
        releaseTag: 'v1',
        artifacts: {
          pack,
          manifest,
          checksums,
          releaseManifest,
        },
      }),
    }],
    ['/modules/module.json', {
      type: 'application/json',
      body: JSON.stringify({
        id: 'fixture-module',
        kind: 'module',
        releaseTag: 'modules-full',
        artifacts: {
          native: module,
          'content-graph': contentGraph,
          'content-graph-evidence': contentGraphEvidence,
        },
      }),
    }],
    ['/assets/pack.zip', { body: packBody }],
    ['/assets/pack.json', { body: manifestBody }],
    ['/assets/checksums.txt', { body: checksumBody }],
    ['/assets/echo-release.json', { body: releaseBody }],
    ['/assets/module.echo-addon', { body: moduleBody }],
    ['/assets/module-content-graph.json', { body: graphBody }],
    ['/assets/content-graph-evidence.json', { body: evidenceBody }],
  ])
}

async function runFixture(name, badSha = false) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `echo-live-channel-${name}-`))
  try {
    await withFixtureServer((baseUrl) => buildRoutes(baseUrl, badSha), async (baseUrl) => {
      const out = path.join(tempRoot, 'report.json')
      const result = await runVerifier(['--channel-url', `${baseUrl}/channel.json`, '--out', out])
      if (badSha) {
        if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes('sha256 expected')) {
          throw new Error(`bad sha fixture should fail: ${result.stdout}\n${result.stderr}`)
        }
        return
      }
      if (result.status !== 0) throw new Error(`live proof fixture failed: ${result.stdout}\n${result.stderr}`)
      const report = JSON.parse(await fs.readFile(out, 'utf8'))
      if (report.status !== 'pass' || report.artifactCount !== 7) {
        throw new Error(`unexpected report summary: ${JSON.stringify(report)}`)
      }
    })
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

await runFixture('pass', false)
await runFixture('fail', true)

console.log('Public alpha live channel proof fixtures passed.')
