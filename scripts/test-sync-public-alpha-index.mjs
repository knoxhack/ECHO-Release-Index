import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'sync-public-alpha-index.mjs')
const sha = 'b'.repeat(64)

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function run(root, args) {
  return spawnSync(process.execPath, [script, '--root', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-public-alpha-sync-'))
try {
  await writeJson(root, 'channels/alpha/release-manifest.json', {
    owner: 'knoxhack',
    releaseTag: 'v0.1.0-alpha',
    repositories: [
      {
        repoName: 'ECHO-Fixture-Studio',
        release: {
          htmlUrl: 'https://github.com/knoxhack/ECHO-Fixture-Studio/releases/tag/v0.1.0-alpha',
        },
        assets: [
          {
            name: 'ECHO-Fixture-Studio-Setup-0.1.0.exe',
            size: 100,
            sha256: sha,
            browserDownloadUrl: 'https://github.com/knoxhack/ECHO-Fixture-Studio/releases/download/v0.1.0-alpha/ECHO-Fixture-Studio-Setup-0.1.0.exe',
          },
          {
            name: 'latest.yml',
            size: 10,
            sha256: sha,
            browserDownloadUrl: 'https://github.com/knoxhack/ECHO-Fixture-Studio/releases/download/v0.1.0-alpha/latest.yml',
          },
        ],
      },
      {
        repoName: 'ECHO-Fixture-Pack',
        release: {
          htmlUrl: 'https://github.com/knoxhack/ECHO-Fixture-Pack/releases/tag/v0.1.0-alpha',
        },
        assets: [
          {
            name: 'fixture-pack-0.1.0.zip',
            size: 200,
            sha256: sha,
            browserDownloadUrl: 'https://github.com/knoxhack/ECHO-Fixture-Pack/releases/download/v0.1.0-alpha/fixture-pack-0.1.0.zip',
          },
          {
            name: 'fixture-pack-alpha-0.1.0.pack.json',
            size: 20,
            sha256: sha,
            browserDownloadUrl: 'https://github.com/knoxhack/ECHO-Fixture-Pack/releases/download/v0.1.0-alpha/fixture-pack-alpha-0.1.0.pack.json',
          },
        ],
      },
      {
        repoName: 'ECHO-Standalone-Runtime',
        release: {
          htmlUrl: 'https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/tag/v0.1.0-standalone-runtime-alpha',
        },
        assets: [
          {
            name: 'alpha-readiness-gate.json',
            size: 30,
            sha256: sha,
            browserDownloadUrl: 'https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/download/v0.1.0-standalone-runtime-alpha/alpha-readiness-gate.json',
          },
          {
            name: 'echo-standalone-runtime-0.1.0-alpha.zip',
            size: 300,
            sha256: sha,
            browserDownloadUrl: 'https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/download/v0.1.0-standalone-runtime-alpha/echo-standalone-runtime-0.1.0-alpha.zip',
          },
        ],
      },
    ],
  })
  await writeJson(root, 'products/fixture-studio.json', {
    id: 'fixture-studio',
    kind: 'studio',
    version: '0.1.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Fixture-Studio',
    releaseTag: 'v0.1.0-alpha',
    commitSha: 'abc1234',
    artifacts: {},
    dependencies: [],
    compatibility: ['windows-x64'],
    trust: 'official',
    validation: 'warning',
  })
  await writeJson(root, 'modpacks/fixture-pack.json', {
    id: 'fixture-pack',
    kind: 'modpack',
    version: '0.1.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Fixture-Pack',
    releaseTag: 'v0.1.0-alpha',
    commitSha: 'abc1234',
    artifacts: {},
    dependencies: [],
    compatibility: ['native'],
    trust: 'official',
    validation: 'warning',
  })
  await writeJson(root, 'products/standalone-runtime.json', {
    id: 'echo-standalone-runtime',
    kind: 'runtime',
    version: '0.1.0',
    channel: 'experimental',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Standalone-Runtime',
    releaseTag: 'v0.1.0-standalone-runtime-alpha',
    commitSha: 'abc1234',
    artifacts: {},
    dependencies: [],
    compatibility: ['ashfall-standalone-edition'],
    trust: 'source-linked',
    validation: 'warning',
  })

  const drift = run(root, ['--check'])
  assert.equal(drift.status, 1)
  assert.match(`${drift.stdout}\n${drift.stderr}`, /3 drift/)

  const write = run(root, ['--write'])
  assert.equal(write.status, 0, `${write.stdout}\n${write.stderr}`)

  const product = JSON.parse(await fs.readFile(path.join(root, 'products', 'fixture-studio.json'), 'utf8'))
  assert.equal(product.validation, 'warning')
  assert.equal(product.artifacts.windowsSetup.file, 'ECHO-Fixture-Studio-Setup-0.1.0.exe')
  assert.equal(product.artifacts.latestYml.file, 'latest.yml')

  const modpack = JSON.parse(await fs.readFile(path.join(root, 'modpacks', 'fixture-pack.json'), 'utf8'))
  assert.equal(modpack.artifacts.pack.file, 'fixture-pack-0.1.0.zip')
  assert.equal(modpack.artifacts.manifest.file, 'fixture-pack-alpha-0.1.0.pack.json')

  const runtime = JSON.parse(await fs.readFile(path.join(root, 'products', 'standalone-runtime.json'), 'utf8'))
  assert.equal(runtime.artifacts.alphaReadinessGate.file, 'alpha-readiness-gate.json')
  assert.equal(runtime.artifacts.archive.file, 'echo-standalone-runtime-0.1.0-alpha.zip')
  assert.equal(runtime.artifacts.archive.url, 'https://github.com/knoxhack/ECHO-Standalone-Runtime/releases/download/v0.1.0-standalone-runtime-alpha/echo-standalone-runtime-0.1.0-alpha.zip')

  const clean = run(root, ['--check'])
  assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`)
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('Public alpha index sync fixtures passed.')
