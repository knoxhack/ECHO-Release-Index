import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = process.cwd()

function envFlag(name, fallback = false) {
  const value = process.env[name]
  if (value === undefined) return fallback
  return /^(1|true|yes|on)$/i.test(value)
}

function envValue(name) {
  const value = process.env[name]?.trim()
  return value || undefined
}

function serviceConfigFromEnv() {
  return {
    host: envValue('ECHO_INGEST_HOST') || '127.0.0.1',
    port: Number(envValue('ECHO_INGEST_PORT') || '8788'),
    secret: envValue('ECHO_WEBHOOK_SECRET'),
    writeIndexEntry: envFlag('ECHO_INGEST_WRITE_INDEX_ENTRY', false),
    requireAttestation: envFlag('ECHO_INGEST_REQUIRE_ATTESTATION', false),
    entryKind: envValue('ECHO_INGEST_ENTRY_KIND'),
    entryId: envValue('ECHO_INGEST_ENTRY_ID'),
    channel: envValue('ECHO_INGEST_CHANNEL'),
    publisher: envValue('ECHO_INGEST_PUBLISHER'),
    trust: envValue('ECHO_INGEST_TRUST'),
    attestationCommit: envValue('ECHO_INGEST_ATTESTATION_COMMIT'),
    attestationWorkflow: envValue('ECHO_INGEST_ATTESTATION_WORKFLOW'),
    maxPayloadBytes: Number(envValue('ECHO_INGEST_MAX_PAYLOAD_BYTES') || 1024 * 1024),
  }
}

function jsonResponse(response, statusCode, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function readRequestBody(request, maxBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > maxBytes) throw Object.assign(new Error('Webhook payload is too large.'), { statusCode: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function payloadReleaseSummary(rawPayload) {
  const payload = JSON.parse(rawPayload.toString('utf8'))
  return {
    event: payload.action ? 'release' : undefined,
    action: payload.action,
    owner: payload.repository?.owner?.login,
    repo: payload.repository?.name,
    tag: payload.release?.tag_name,
  }
}

function appendOption(args, name, value) {
  if (value !== undefined) args.push(name, value)
}

function buildIngestArgs({ payloadPath, outputPath, signature, config }) {
  const args = [
    path.join('scripts', 'ingest-release.mjs'),
    '--payload',
    payloadPath,
    '--out',
    outputPath,
  ]
  appendOption(args, '--secret', config.secret)
  appendOption(args, '--signature', signature)
  appendOption(args, '--entry-kind', config.entryKind)
  appendOption(args, '--entry-id', config.entryId)
  appendOption(args, '--channel', config.channel)
  appendOption(args, '--publisher', config.publisher)
  appendOption(args, '--trust', config.trust)
  appendOption(args, '--attestation-commit', config.attestationCommit)
  appendOption(args, '--attestation-workflow', config.attestationWorkflow)
  if (config.writeIndexEntry) args.push('--write-index-entry')
  if (config.requireAttestation) args.push('--require-attestation')
  return args
}

function runNodeScript(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

async function ingestWebhook(rawPayload, signature, config = serviceConfigFromEnv()) {
  const summary = payloadReleaseSummary(rawPayload)
  if (!summary.owner || !summary.repo || !summary.tag) {
    return {
      statusCode: 400,
      body: {
        ok: false,
        error: 'Release webhook payload must include repository owner/name and release tag.',
      },
    }
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-release-webhook-'))
  try {
    const payloadPath = path.join(tempDir, 'payload.json')
    const outputPath = path.join(tempDir, 'ingestion-result.json')
    await fs.writeFile(payloadPath, rawPayload)
    const child = await runNodeScript(buildIngestArgs({ payloadPath, outputPath, signature, config }))
    const result = await fs.readFile(outputPath, 'utf8')
      .then((text) => JSON.parse(text))
      .catch(() => null)
    return {
      statusCode: child.code === 0 ? 202 : 422,
      body: {
        ok: child.code === 0,
        summary,
        result,
        stdout: child.stdout.trim(),
        stderr: child.stderr.trim(),
      },
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

function createServer(config = serviceConfigFromEnv()) {
  return http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/healthz') {
        jsonResponse(response, 200, {
          ok: true,
          writeIndexEntry: config.writeIndexEntry,
          requireAttestation: config.requireAttestation,
        })
        return
      }
      if (request.method !== 'POST' || request.url !== '/github/releases') {
        jsonResponse(response, 404, { ok: false, error: 'Not found.' })
        return
      }
      const event = request.headers['x-github-event']
      if (event && event !== 'release') {
        jsonResponse(response, 202, { ok: true, ignored: true, event })
        return
      }
      const rawPayload = await readRequestBody(request, config.maxPayloadBytes)
      const signature = Array.isArray(request.headers['x-hub-signature-256'])
        ? request.headers['x-hub-signature-256'][0]
        : request.headers['x-hub-signature-256']
      const result = await ingestWebhook(rawPayload, signature, config)
      jsonResponse(response, result.statusCode, result.body)
    } catch (error) {
      jsonResponse(response, error.statusCode || 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}

function main() {
  const config = serviceConfigFromEnv()
  if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
    throw new Error('ECHO_INGEST_PORT must be a valid TCP port.')
  }
  createServer(config).listen(config.port, config.host, () => {
    console.log(`ECHO Release Index ingestion service listening on http://${config.host}:${config.port}`)
  })
}

export {
  buildIngestArgs,
  createServer,
  ingestWebhook,
  payloadReleaseSummary,
  serviceConfigFromEnv,
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
