import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { once } from 'node:events'
import {
  buildIngestArgs,
  createServer,
  payloadReleaseSummary,
} from './ingest-webhook-service.mjs'

function samplePayload() {
  return Buffer.from(JSON.stringify({
    action: 'published',
    repository: {
      name: 'ECHO-Modules',
      owner: { login: 'knoxhack' },
    },
    release: {
      tag_name: 'modules-v1.0.0',
    },
  }))
}

const summary = payloadReleaseSummary(samplePayload())
assert.equal(summary.owner, 'knoxhack')
assert.equal(summary.repo, 'ECHO-Modules')
assert.equal(summary.tag, 'modules-v1.0.0')

const args = buildIngestArgs({
  payloadPath: 'payload.json',
  outputPath: 'result.json',
  signature: 'sha256=abc',
  config: {
    secret: 'top-secret',
    writeIndexEntry: true,
    requireAttestation: true,
    entryKind: 'module',
    channel: 'alpha',
    publisher: 'knoxhack',
    trust: 'provenance-attested',
    attestationCommit: 'a'.repeat(40),
    attestationWorkflow: '.github/workflows/release-modules.yml',
  },
})
assert(args.includes('scripts\\ingest-release.mjs') || args.includes('scripts/ingest-release.mjs'))
assert(args.includes('--payload'))
assert(args.includes('--secret'))
assert(args.includes('--signature'))
assert(args.includes('--write-index-entry'))
assert(args.includes('--require-attestation'))
assert(args.includes('--attestation-workflow'))

const server = createServer({
  writeIndexEntry: false,
  requireAttestation: false,
  maxPayloadBytes: 1024,
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const address = server.address()
const baseUrl = `http://127.0.0.1:${address.port}`

try {
  const health = await fetch(`${baseUrl}/healthz`).then((response) => response.json())
  assert.equal(health.ok, true)

  const ignored = await fetch(`${baseUrl}/github/releases`, {
    method: 'POST',
    headers: { 'x-github-event': 'push' },
    body: '{}',
  }).then((response) => response.json())
  assert.equal(ignored.ignored, true)

  const oversized = await fetch(`${baseUrl}/github/releases`, {
    method: 'POST',
    headers: {
      'x-github-event': 'release',
      'x-hub-signature-256': `sha256=${crypto.createHash('sha256').update('too-large').digest('hex')}`,
    },
    body: 'x'.repeat(2048),
  })
  assert.equal(oversized.status, 413)
} finally {
  server.close()
}

console.log('Ingestion webhook service tests passed.')
