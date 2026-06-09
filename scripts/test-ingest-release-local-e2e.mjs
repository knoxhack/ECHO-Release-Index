import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { spawn } from 'node:child_process'

const repoRoot = process.cwd()
const ingestScript = path.join(repoRoot, 'scripts', 'ingest-release.mjs')
const validatorScript = path.join(repoRoot, 'scripts', 'validate-index.mjs')

function crc32Table() {
  const table = []
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const crcTable = crc32Table()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function dosTimeDate() {
  return { time: 0, date: 33 }
}

function uint16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function uint32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value)
  return buffer
}

function createZip(entries) {
  const fileRecords = []
  const centralRecords = []
  let offset = 0
  const { time, date } = dosTimeDate()
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(String(entry.content), 'utf8')
    const checksum = crc32(content)
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(time),
      uint16(date),
      uint32(checksum),
      uint32(content.length),
      uint32(content.length),
      uint16(name.length),
      uint16(0),
      name,
    ])
    fileRecords.push(localHeader, content)
    centralRecords.push(Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(time),
      uint16(date),
      uint32(checksum),
      uint32(content.length),
      uint32(content.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      name,
    ]))
    offset += localHeader.length + content.length
  }
  const centralDirectory = Buffer.concat(centralRecords)
  const end = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ])
  return Buffer.concat([...fileRecords, centralDirectory, end])
}

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeBaseIndex(root) {
  for (const dir of ['products', 'modpacks', 'modules', 'addons', 'publishers', 'channels', 'trust', 'blocks']) {
    await fs.mkdir(path.join(root, dir), { recursive: true })
  }
  await fs.cp(path.join(repoRoot, 'schemas'), path.join(root, 'schemas'), { recursive: true })
  await writeJson(root, 'channels/alpha.json', { id: 'alpha', name: 'Alpha', stability: 'alpha', priority: 10 })
  await writeJson(root, 'publishers/knoxhack.json', {
    id: 'knoxhack',
    name: 'Knoxhack',
    githubOwner: 'knoxhack',
    trust: 'official',
  })
  await writeJson(root, 'trust/tiers.json', [
    { id: 'official', rank: 100, description: 'Official fixture trust.', playable: true },
    { id: 'provenance-attested', rank: 70, description: 'Attested fixture trust.', playable: true },
    { id: 'community', rank: 40, description: 'Community fixture trust.', playable: true },
    { id: 'unverified', rank: 20, description: 'Unverified fixture trust.', playable: false },
    { id: 'blocked', rank: 0, description: 'Blocked fixture trust.', playable: false },
  ])
  await writeJson(root, 'products/fixture-runtime.json', {
    id: 'fixture-runtime',
    kind: 'runtime',
    version: '1.0.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Fixture-Runtime',
    releaseTag: 'v1.0.0',
    commitSha: 'abc1234',
    artifacts: {
      updater: {
        file: 'fixture-runtime-1.0.0.zip',
        sha256: 'b'.repeat(64),
        url: 'https://github.com/knoxhack/ECHO-Fixture-Runtime/releases/download/v1.0.0/fixture-runtime-1.0.0.zip',
      },
    },
    dependencies: [],
    compatibility: ['ashfall-native-edition'],
    trust: 'community',
    validation: 'approved',
  })
}

function jsonAssetResponse(response, payload) {
  const body = `${JSON.stringify(payload)}\n`
  response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  response.end(body)
}

function bytesResponse(response, bytes, contentType = 'application/octet-stream') {
  response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': bytes.length })
  response.end(bytes)
}

function runNode(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

async function writeFakeGh(binDir) {
  await fs.mkdir(binDir, { recursive: true })
  const windowsScript = `@echo off
setlocal enabledelayedexpansion
set "joined=%*"
echo %joined%>>"%FAKE_GH_LOG%"
echo %joined% | findstr /C:"--repo knoxhack/ECHO-Fixture" >nul || exit /b 11
if "%1 %2"=="release verify-asset" (
  echo {"kind":"release-asset","sha256":"%FAKE_ATTESTED_SHA%","repo":"knoxhack/ECHO-Fixture"}
  exit /b 0
)
if "%1 %2"=="attestation verify" (
  echo %joined% | findstr /C:"--source-digest %FAKE_ATTESTED_COMMIT%" >nul || exit /b 12
  echo %joined% | findstr /C:"--signer-workflow %FAKE_ATTESTED_WORKFLOW%" >nul || exit /b 13
  echo {"kind":"provenance","sha256":"%FAKE_ATTESTED_SHA%","sourceDigest":"%FAKE_ATTESTED_COMMIT%","workflow":"%FAKE_ATTESTED_WORKFLOW%","repo":"knoxhack/ECHO-Fixture"}
  exit /b 0
)
exit /b 14
`
  const posixScript = `#!/usr/bin/env sh
joined="$*"
printf '%s\\n' "$joined" >> "$FAKE_GH_LOG"
echo "$joined" | grep -F -- "--repo knoxhack/ECHO-Fixture" >/dev/null || exit 11
if [ "$1 $2" = "release verify-asset" ]; then
  printf '{"kind":"release-asset","sha256":"%s","repo":"knoxhack/ECHO-Fixture"}\\n' "$FAKE_ATTESTED_SHA"
  exit 0
fi
if [ "$1 $2" = "attestation verify" ]; then
  echo "$joined" | grep -F -- "--source-digest $FAKE_ATTESTED_COMMIT" >/dev/null || exit 12
  echo "$joined" | grep -F -- "--signer-workflow $FAKE_ATTESTED_WORKFLOW" >/dev/null || exit 13
  printf '{"kind":"provenance","sha256":"%s","sourceDigest":"%s","workflow":"%s","repo":"knoxhack/ECHO-Fixture"}\\n' "$FAKE_ATTESTED_SHA" "$FAKE_ATTESTED_COMMIT" "$FAKE_ATTESTED_WORKFLOW"
  exit 0
fi
exit 14
`
  await fs.writeFile(path.join(binDir, 'gh.cmd'), windowsScript, 'utf8')
  await fs.writeFile(path.join(binDir, 'gh'), posixScript, { encoding: 'utf8', mode: 0o755 })
}

async function runIngestionCase({
  name,
  baseUrl,
  setMetadataDependencies,
  addonSha,
  useGitHubAppToken = false,
  requireAttestation = false,
  attestationCommit,
  attestationWorkflow,
  setupIndex,
  expectedValidation = 'approved',
  expectedReason,
}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ingest-local-'))
  await writeBaseIndex(tempRoot)
  if (setupIndex) await setupIndex(tempRoot)
  try {
    setMetadataDependencies()
    const payload = Buffer.from(JSON.stringify({
      action: 'published',
      repository: { name: 'ECHO-Fixture', owner: { login: 'knoxhack' } },
      release: { tag_name: 'v1.0.0' },
    }))
    const payloadPath = path.join(tempRoot, 'payload.json')
    const resultPath = path.join(tempRoot, 'ingestion-result.json')
    await fs.writeFile(payloadPath, payload)
    const secret = 'fixture-secret'
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`
    const fakeGhBin = path.join(tempRoot, 'fake-gh-bin')
    const fakeGhLog = path.join(tempRoot, 'fake-gh.log')
    const args = [
      ingestScript,
      '--payload', payloadPath,
      '--secret', secret,
      '--signature', signature,
      '--write-index-entry',
      '--entry-kind', 'addon',
      '--out', resultPath,
    ]
    if (requireAttestation) {
      await writeFakeGh(fakeGhBin)
      args.push('--require-attestation')
      if (attestationCommit) args.push('--attestation-commit', attestationCommit)
      if (attestationWorkflow) args.push('--attestation-workflow', attestationWorkflow)
      args.push('--trust', 'provenance-attested')
    }
    const fakeGhExecutable = process.platform === 'win32' ? path.join(fakeGhBin, 'gh.cmd') : path.join(fakeGhBin, 'gh')
    const githubAppKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey
      .export({ type: 'pkcs8', format: 'pem' })

    const childEnv = {
      ...process.env,
      GITHUB_API_BASE_URL: baseUrl,
      ECHO_INGEST_DOWNLOAD_MIRROR_BASE_URL: `${baseUrl}/download/`,
      ...(useGitHubAppToken ? {
        GITHUB_APP_ID: '12345',
        GITHUB_APP_PRIVATE_KEY: githubAppKey,
        GITHUB_APP_INSTALLATION_ID: '67890',
      } : {}),
      ...(requireAttestation ? {
        FAKE_GH_LOG: fakeGhLog,
        ECHO_INGEST_GH_EXECUTABLE: fakeGhExecutable,
        FAKE_ATTESTED_SHA: addonSha,
        ...(attestationCommit ? { FAKE_ATTESTED_COMMIT: attestationCommit } : {}),
        ...(attestationWorkflow ? { FAKE_ATTESTED_WORKFLOW: attestationWorkflow } : {}),
      } : {}),
    }
    if (requireAttestation) {
      const pathKey = Object.keys(childEnv).find((key) => key.toLowerCase() === 'path') || 'PATH'
      for (const key of Object.keys(childEnv)) {
        if (key.toLowerCase() === 'path' && key !== pathKey) delete childEnv[key]
      }
      childEnv[pathKey] = `${fakeGhBin}${path.delimiter}${childEnv[pathKey] ?? ''}`
    }
    if (requireAttestation) {
      const smoke = await runNode(['-e', "const { spawnSync } = require('node:child_process'); const r = spawnSync(process.env.ECHO_INGEST_GH_EXECUTABLE, ['release', 'verify-asset', 'v1.0.0', 'fixture.echo-addon', '--repo', 'knoxhack/ECHO-Fixture', '--format', 'json'], { encoding: 'utf8', shell: process.platform === 'win32' }); process.stdout.write(JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error && r.error.message })); process.exit(r.status ?? 1)"], {
        cwd: tempRoot,
        env: childEnv,
      })
      assert.equal(smoke.status, 0, `${name} fake gh smoke failed\n${smoke.stdout}\n${smoke.stderr}`)
    }

    const ingest = await runNode(args, {
      cwd: tempRoot,
      env: childEnv,
    })
    const failureResult = await fs.readFile(resultPath, 'utf8').catch(() => '')
    const fakeGhFailureLog = await fs.readFile(fakeGhLog, 'utf8').catch(() => '')
    if (expectedValidation === 'approved') {
      assert.equal(ingest.status, 0, `${name}\n${ingest.stdout}\n${ingest.stderr}\n${failureResult}\nfake gh log:\n${fakeGhFailureLog}`)
    } else {
      assert.notEqual(ingest.status, 0, `${name} should have rejected\n${ingest.stdout}\n${ingest.stderr}`)
    }
    const result = JSON.parse(await fs.readFile(resultPath, 'utf8'))
    assert.equal(result.validation, expectedValidation)
    if (expectedReason) assert(result.reasons.some((reason) => reason.includes(expectedReason)), `${name} missing reason ${expectedReason}: ${JSON.stringify(result.reasons)}`)
    if (expectedValidation !== 'approved') return
    assert.deepEqual(result.writtenIndexEntries, ['addons/fixture-addon.json'])

    const entry = JSON.parse(await fs.readFile(path.join(tempRoot, 'addons', 'fixture-addon.json'), 'utf8'))
    assert.equal(entry.artifacts.native.sha256, addonSha)
    assert.equal(entry.artifacts.native.url, 'https://github.com/knoxhack/ECHO-Fixture/releases/download/v1.0.0/fixture-addon-1.0.0.echo-addon')
    assert.deepEqual(entry.dependencies, [{ id: 'fixture-runtime', kind: 'runtime' }])
    assert.deepEqual(entry.compatibility, ['ashfall-native-edition'])
    if (requireAttestation) {
      assert.equal(entry.trust, 'provenance-attested')
      const log = await fs.readFile(fakeGhLog, 'utf8')
      assert.match(log, /release verify-asset/)
      assert.match(log, /attestation verify/)
      assert.match(log, /--source-digest/)
      assert.match(log, /--signer-workflow/)
    }

    const validation = await runNode([validatorScript, '--root', tempRoot, '--strict'])
    assert.equal(validation.status, 0, `${name}\n${validation.stdout}\n${validation.stderr}`)
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

async function main() {

  const packageJson = Buffer.from(JSON.stringify({
    schemaVersion: 'echo.addon.package.v1',
    id: 'fixture-addon',
    version: '1.0.0',
    publisher: { githubOwner: 'knoxhack', githubRepo: 'ECHO-Fixture' },
    targets: ['native'],
    dependencies: [],
    artifacts: { native: 'fixture-addon-1.0.0.echo-addon' },
  }, null, 2))
  const moduleJson = Buffer.from(JSON.stringify({ id: 'fixture-addon', version: '1.0.0' }, null, 2))
  const internalChecksums = Buffer.from(`${sha256(packageJson)} echo-addon-package.json\n${sha256(moduleJson)} META-INF/echo.mod.json\n`)
  const addonBytes = createZip([
    { name: 'echo-addon-package.json', content: packageJson },
    { name: 'META-INF/echo.mod.json', content: moduleJson },
    { name: 'checksums.sha256', content: internalChecksums },
  ])
  const addonSha = sha256(addonBytes)
  const metadata = {
    id: 'fixture-addon',
    kind: 'addon',
    version: '1.0.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    trust: 'community',
    commitSha: 'abc1234',
    compatibility: ['ashfall-native-edition'],
    dependencies: [{ id: 'fixture-runtime', kind: 'runtime' }],
    assets: [{ name: 'fixture-addon-1.0.0.echo-addon', sha256: addonSha }],
  }
  const checksumsBytes = Buffer.from(`${addonSha} fixture-addon-1.0.0.echo-addon\n`)
  let assetsByName = new Map()
  let releaseTargetCommitish = 'abc1234'
  let requireGitHubAppToken = false
  let installationTokenRequests = 0
  let authenticatedApiRequests = 0
  const setMetadataDependencies = (dependencies = [{ id: 'fixture-runtime', kind: 'runtime' }], trust = 'community', options = {}) => {
    metadata.dependencies = dependencies
    metadata.trust = trust
    releaseTargetCommitish = options.releaseTargetCommitish ?? 'abc1234'
    if (Object.prototype.hasOwnProperty.call(options, 'commitSha')) {
      if (options.commitSha === null) delete metadata.commitSha
      else metadata.commitSha = options.commitSha
    } else {
      metadata.commitSha = 'abc1234'
    }
    const metadataBytes = Buffer.from(JSON.stringify(metadata, null, 2))
    assetsByName = new Map([
      ['echo-release.json', metadataBytes],
      ['checksums.sha256', checksumsBytes],
      ['fixture-addon-1.0.0.echo-addon', addonBytes],
    ])
  }
  setMetadataDependencies()

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/app/installations/67890/access_tokens') {
      installationTokenRequests += 1
      assert.equal(request.method, 'POST')
      const auth = request.headers.authorization ?? ''
      assert.match(Array.isArray(auth) ? auth[0] : auth, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      jsonAssetResponse(response, { token: 'fixture-installation-token' })
      return
    }
    if (requireGitHubAppToken) {
      const auth = request.headers.authorization ?? ''
      assert.equal(Array.isArray(auth) ? auth[0] : auth, 'Bearer fixture-installation-token')
      authenticatedApiRequests += 1
    }
    if (url.pathname === '/repos/knoxhack/ECHO-Fixture/releases/tags/v1.0.0') {
      jsonAssetResponse(response, {
        tag_name: 'v1.0.0',
        draft: false,
        target_commitish: releaseTargetCommitish,
        html_url: 'https://github.com/knoxhack/ECHO-Fixture/releases/tag/v1.0.0',
        assets_url: `${baseUrl}/repos/knoxhack/ECHO-Fixture/releases/1/assets`,
      })
      return
    }
    if (url.pathname === '/repos/knoxhack/ECHO-Fixture/releases/1/assets') {
      jsonAssetResponse(response, [...assetsByName].map(([name, bytes]) => ({
        name,
        size: bytes.length,
        browser_download_url: `https://github.com/knoxhack/ECHO-Fixture/releases/download/v1.0.0/${name}`,
        digest: `sha256:${sha256(bytes)}`,
      })))
      return
    }
    if (url.pathname.startsWith('/download/')) {
      const name = decodeURIComponent(path.basename(url.pathname))
      const bytes = assetsByName.get(name)
      if (bytes) {
        bytesResponse(response, bytes, name.endsWith('.json') ? 'application/json' : 'application/octet-stream')
        return
      }
    }
    response.writeHead(404)
    response.end('not found')
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    await runIngestionCase({
      name: 'approved-without-attestation',
      baseUrl,
      addonSha,
      setMetadataDependencies: () => setMetadataDependencies([{ id: 'fixture-runtime', kind: 'runtime' }]),
    })
    await runIngestionCase({
      name: 'approved-with-attestation',
      baseUrl,
      addonSha,
      setMetadataDependencies: () => setMetadataDependencies([{ id: 'fixture-runtime', kind: 'runtime' }]),
      requireAttestation: true,
      attestationCommit: 'abc1234',
      attestationWorkflow: '.github/workflows/release-fixture.yml',
    })
    await runIngestionCase({
      name: 'rejected-official-trust-without-attestation',
      baseUrl,
      addonSha,
      setMetadataDependencies: () => setMetadataDependencies([{ id: 'fixture-runtime', kind: 'runtime' }], 'official'),
      expectedValidation: 'rejected',
      expectedReason: 'official trust requires GitHub artifact attestation verification',
    })
    await runIngestionCase({
      name: 'rejected-verified-attestation-without-commit-workflow',
      baseUrl,
      addonSha,
      setMetadataDependencies: () => setMetadataDependencies([{ id: 'fixture-runtime', kind: 'runtime' }]),
      requireAttestation: true,
      expectedValidation: 'rejected',
      expectedReason: 'Attestation verification for verified trust requires --attestation-commit',
    })
    await runIngestionCase({
      name: 'rejected-missing-commit-sha',
      baseUrl,
      addonSha,
      setMetadataDependencies: () => setMetadataDependencies([{ id: 'fixture-runtime', kind: 'runtime' }], 'community', {
        commitSha: null,
        releaseTargetCommitish: 'main',
      }),
      expectedValidation: 'rejected',
      expectedReason: 'Release ingestion requires a real commitSha',
    })
    requireGitHubAppToken = true
    const tokenRequestsBefore = installationTokenRequests
    const authenticatedRequestsBefore = authenticatedApiRequests
    await runIngestionCase({
      name: 'approved-with-github-app-installation-token',
      baseUrl,
      addonSha,
      setMetadataDependencies: () => setMetadataDependencies([{ id: 'fixture-runtime', kind: 'runtime' }]),
      useGitHubAppToken: true,
    })
    assert.equal(installationTokenRequests, tokenRequestsBefore + 1)
    assert(authenticatedApiRequests > authenticatedRequestsBefore, 'GitHub App installation token was not used for authenticated requests.')
    requireGitHubAppToken = false
    await runIngestionCase({
      name: 'rejected-missing-dependency',
      baseUrl,
      addonSha,
      setMetadataDependencies: () => setMetadataDependencies([{ id: 'missing-runtime', kind: 'runtime' }]),
      expectedValidation: 'rejected',
      expectedReason: 'Unknown dependency: missing-runtime',
    })
    await runIngestionCase({
      name: 'rejected-blocked-dependency',
      baseUrl,
      addonSha,
      setMetadataDependencies: () => setMetadataDependencies([{ id: 'fixture-runtime', kind: 'runtime' }]),
      setupIndex: async (root) => {
        await writeJson(root, 'blocks/fixture-runtime.json', {
          id: 'block-fixture-runtime',
          scope: 'product',
          target: 'fixture-runtime',
          reason: 'Fixture dependency block',
          createdAt: '2026-06-09T00:00:00Z',
        })
      },
      expectedValidation: 'rejected',
      expectedReason: 'Blocked dependency: fixture-runtime',
    })
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }

  console.log('Local release ingestion E2E passed.')
}

await main()
