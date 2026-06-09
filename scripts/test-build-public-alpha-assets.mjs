#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const repoRoot = process.cwd()
const builder = path.join(repoRoot, 'scripts', 'build-public-alpha-assets.mjs')

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath))
}

async function writeFixtureRuntime(workspaceRoot) {
  const publicAlpha = path.join(workspaceRoot, 'ECHO-Standalone-Runtime', 'build', 'public-alpha')
  await fs.mkdir(publicAlpha, { recursive: true })
  await fs.writeFile(path.join(publicAlpha, 'alpha-readiness-gate.json'), '{"status":"PASS_WITH_WARNINGS"}\n')
  await fs.writeFile(path.join(publicAlpha, 'ashfall-parity-matrix.json'), '{"compatibility":["ashfall-standalone-edition"]}\n')
  await fs.writeFile(path.join(publicAlpha, 'beta-readiness-gate.json'), '{"status":"PENDING"}\n')
  await fs.writeFile(path.join(publicAlpha, 'checksums.txt'), 'fixture  checksums.txt\n')
}

function runBuilder(workspaceRoot, assetRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      builder,
      '--only',
      'ECHO-Standalone-Runtime',
      '--skip-build',
      '--workspace-root',
      workspaceRoot,
      '--asset-root',
      assetRoot,
      '--strict-assets',
    ], {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`builder exited ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function readZipEntryNames(buffer) {
  let eocd = -1
  const minimum = Math.max(0, buffer.length - 65557)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  assert.ok(eocd >= 0, 'ZIP end-of-central-directory record not found')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  let cursor = buffer.readUInt32LE(eocd + 16)
  const names = []
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, 'invalid ZIP central directory entry')
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    names.push(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'))
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return names
}

async function buildOnce(root, workspaceRoot, label) {
  const assetRoot = path.join(root, label)
  await runBuilder(workspaceRoot, assetRoot)
  const stage = path.join(assetRoot, 'ECHO-Standalone-Runtime')
  const archive = path.join(stage, 'echo-standalone-runtime-0.1.0-alpha.zip')
  const archiveDigest = await sha256File(archive)
  const checksums = await fs.readFile(path.join(stage, 'checksums.txt'), 'utf8')
  assert.match(checksums, new RegExp(`${archiveDigest}\\s+echo-standalone-runtime-0\\.1\\.0-alpha\\.zip`))
  const zipEntries = readZipEntryNames(await fs.readFile(archive))
  assert.deepEqual(zipEntries, [
    'alpha-readiness-gate.json',
    'ashfall-parity-matrix.json',
    'beta-readiness-gate.json',
  ])
  return archiveDigest
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-public-alpha-build-test-'))
try {
  const workspaceRoot = path.join(root, 'workspace')
  await writeFixtureRuntime(workspaceRoot)
  const first = await buildOnce(root, workspaceRoot, 'assets-a')
  const second = await buildOnce(root, workspaceRoot, 'assets-b')
  assert.equal(second, first, 'standalone runtime archive must be deterministic')
  console.log('Public alpha asset builder fixtures passed.')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
