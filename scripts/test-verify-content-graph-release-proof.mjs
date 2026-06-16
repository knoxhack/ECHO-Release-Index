import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const verifier = path.join(repoRoot, 'scripts', 'verify-content-graph-release-proof.mjs')
const sha = 'a'.repeat(64)
const evidenceSha = 'b'.repeat(64)
const releaseTag = 'modules-fixture'
const releaseBase = `https://github.com/knoxhack/ECHO-Modules/releases/download/${releaseTag}`

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function asset(name, sha256 = sha, size = 10) {
  return {
    name,
    size,
    sha256,
    browserDownloadUrl: `${releaseBase}/${name}`,
  }
}

function moduleRow(id) {
  const graphFile = `${id}-1.0.0-content-graph.json`
  return {
    id,
    kind: 'module',
    sourceRepo: 'knoxhack/ECHO-Modules',
    releaseTag,
    artifacts: {
      'content-graph': {
        file: graphFile,
        sha256: sha,
        size: 10,
        url: `${releaseBase}/${graphFile}`,
      },
      'content-graph-evidence': {
        file: 'content-graph-evidence.json',
        sha256: evidenceSha,
        size: 20,
        url: `${releaseBase}/content-graph-evidence.json`,
        artifactRole: 'content-graph-evidence',
        schemaVersion: 'echo.content_graph.evidence.v1',
      },
    },
  }
}

async function baseFixture(root) {
  const moduleIds = ['echocore', 'echoarmory']
  await writeJson(root, 'channels/alpha/release-manifest.json', {
    repositories: [
      {
        repoName: 'ECHO-Modules',
        release: {
          htmlUrl: `https://github.com/knoxhack/ECHO-Modules/releases/tag/${releaseTag}`,
        },
        assets: [
          asset('checksums.sha256'),
          asset('content-graph-evidence.json', evidenceSha, 20),
          asset('echo-module-release.tar.gz'),
          asset('echo-module-release.tar.gz.sha256'),
          asset('echo-release.json'),
          ...moduleIds.map((id) => asset(`${id}-1.0.0-content-graph.json`)),
        ],
      },
    ],
  })
  for (const id of moduleIds) {
    await writeJson(root, `modules/${id}.json`, moduleRow(id))
  }
}

async function runFixture(name, mutate, expectedStatus, expectedText) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `echo-content-graph-proof-${name}-`))
  await baseFixture(root)
  if (mutate) await mutate(root)
  const result = spawnSync(process.execPath, [
    verifier,
    '--root',
    root,
    '--expected-module-count',
    '2',
  ], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const output = `${result.stdout}\n${result.stderr}`
  const passed = result.status === expectedStatus && output.includes(expectedText)
  if (!passed) {
    console.error(`Fixture ${name} failed.`)
    console.error(`Expected status ${expectedStatus} and text ${expectedText}.`)
    console.error(output)
    process.exitCode = 1
  }
  await fs.rm(root, { recursive: true, force: true })
}

await runFixture('pass', null, 0, 'Content graph release proof passed for 2 module row')

await runFixture('missing-evidence-role', async (root) => {
  const row = moduleRow('echoarmory')
  delete row.artifacts['content-graph-evidence'].artifactRole
  await writeJson(root, 'modules/echoarmory.json', row)
}, 1, 'content-graph-evidence artifactRole expected content-graph-evidence')

console.log('Content graph release proof fixtures passed.')
