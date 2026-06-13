#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'verify-sky-relay-release-pipeline.mjs')
const editionDirs = [
  'ECHO-Sky-Relay-Native-Edition',
  'ECHO-Sky-Relay-NeoForge-Edition',
  'ECHO-Sky-Relay-Standalone-Edition',
]

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
}

async function writeFakeScript(root, relPath, { status = 0, body = null } = {}) {
  await writeText(path.join(root, relPath), body ?? `#!/usr/bin/env node
console.log(${JSON.stringify(`${relPath} ok`)})
process.exit(${status})
`)
}

async function writeFixture(root, options = {}) {
  const releaseIndex = path.join(root, 'ECHO-Release-Index')
  for (const dir of editionDirs) {
    const editionRoot = path.join(root, dir)
    await writeFakeScript(editionRoot, 'scripts/validate-sky-relay-edition.mjs')
    await writeFakeScript(editionRoot, 'scripts/verify-manual-gameplay-evidence.mjs', {
      status: options.manualBlocked ? 1 : 0,
      body: `#!/usr/bin/env node
console.log(${JSON.stringify(options.manualBlocked ? 'manual evidence blocked' : 'manual evidence pass')})
process.exit(${options.manualBlocked ? 1 : 0})
`,
    })
  }
  await writeFakeScript(releaseIndex, 'scripts/verify-sky-relay-gameplay-evidence.mjs', {
    status: options.centralBlocked ? 1 : 0,
  })
  await writeFakeScript(releaseIndex, 'scripts/verify-sky-relay-public-alpha-readiness.mjs', {
    status: options.centralBlocked ? 1 : 0,
  })
  await writeFakeScript(releaseIndex, 'scripts/generate-sky-relay-manual-gameplay-work-order.mjs')
  await writeFakeScript(releaseIndex, 'scripts/promote-sky-relay-public-alpha.mjs', {
    status: options.promotionBlocked ? 1 : 0,
  })
  await writeFakeScript(releaseIndex, 'scripts/validate-index.mjs')
  await writeFakeScript(releaseIndex, 'scripts/sync-public-alpha-index.mjs')
  return releaseIndex
}

function run(root, workspaceRoot, extraArgs = []) {
  return spawnSync(process.execPath, [
    script,
    '--root',
    root,
    '--workspace-root',
    workspaceRoot,
    '--write',
    ...extraArgs,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sky-relay-release-pipeline-'))
try {
  const passWorkspace = path.join(tmp, 'pass')
  const passRoot = await writeFixture(passWorkspace)
  const pass = run(passRoot, passWorkspace, ['--require-release-ready'])
  assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`)
  const passReport = JSON.parse(await fs.readFile(path.join(passRoot, 'release-readiness/sky-relay-release-pipeline.json'), 'utf8'))
  assert.equal(passReport.status, 'PASS')
  assert.equal(passReport.steps.length, 12)
  assert.equal(passReport.blockers.length, 0)

  const blockedWorkspace = path.join(tmp, 'blocked')
  const blockedRoot = await writeFixture(blockedWorkspace, {
    manualBlocked: true,
    centralBlocked: true,
    promotionBlocked: true,
  })
  const blocked = run(blockedRoot, blockedWorkspace, ['--require-release-ready'])
  assert.equal(blocked.status, 1)
  const blockedReport = JSON.parse(await fs.readFile(path.join(blockedRoot, 'release-readiness/sky-relay-release-pipeline.json'), 'utf8'))
  assert.equal(blockedReport.status, 'BLOCKED')
  assert.ok(blockedReport.blockers.some((blocker) => blocker.includes('native.manualEvidence')))
  assert.ok(blockedReport.blockers.some((blocker) => blocker.includes('releaseIndex.promotionDryRun')))

  console.log('Sky Relay release pipeline verifier fixtures passed.')
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}
