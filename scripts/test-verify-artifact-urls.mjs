import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const verifier = path.join(repoRoot, 'scripts', 'verify-artifact-urls.mjs')
const sha = 'a'.repeat(64)

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function entry(id, validation, url) {
  return {
    id,
    kind: 'addon',
    version: '1.0.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Fixture',
    releaseTag: 'v1.0.0',
    commitSha: 'abc1234',
    artifacts: {
      native: {
        file: `${id}-1.0.0.echo-addon`,
        sha256: sha,
        url,
      },
    },
    dependencies: [],
    compatibility: ['ashfall-native-edition'],
    trust: 'source-linked',
    validation,
  }
}

function run(root, args = []) {
  return spawnSync(process.execPath, [verifier, '--root', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

async function withFixture(name, setup, assertions) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `echo-url-fixture-${name}-`))
  try {
    await setup(root)
    await assertions(root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

await withFixture('approved-non-github-url', async (root) => {
  await writeJson(root, 'addons/bad-approved.json', entry('bad-approved', 'approved', 'https://example.com/bad.echo-addon'))
}, async (root) => {
  const result = run(root)
  if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes('has non-GitHub URL')) {
    throw new Error(`approved non-GitHub URL should fail: ${result.stdout}\n${result.stderr}`)
  }
})

await withFixture('warning-skipped-by-default', async (root) => {
  await writeJson(root, 'addons/warning-addon.json', entry('warning-addon', 'warning', 'https://example.com/warning.echo-addon'))
}, async (root) => {
  const result = run(root)
  if (result.status !== 0 || !result.stdout.includes('0 approved artifact URL')) {
    throw new Error(`warning entries should be skipped by default: ${result.stdout}\n${result.stderr}`)
  }
})

await withFixture('all-includes-warning', async (root) => {
  await writeJson(root, 'addons/warning-addon.json', entry('warning-addon', 'warning', 'https://example.com/warning.echo-addon'))
}, async (root) => {
  const result = run(root, ['--all'])
  if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes('warning-addon')) {
    throw new Error(`--all should include warning entries: ${result.stdout}\n${result.stderr}`)
  }
})

console.log('Release Index artifact URL verifier fixtures passed.')
