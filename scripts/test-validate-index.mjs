import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const validator = path.join(repoRoot, 'scripts', 'validate-index.mjs')
const importer = path.join(repoRoot, 'scripts', 'import-module-release.mjs')
const sha = 'a'.repeat(64)
const moduleReleaseProvenance = {
  sourceRepo: 'https://github.com/knoxhack/ECHO-Modules',
  commitSha: 'abc1234',
  workflow: 'Release Modules',
  workflowRef: 'knoxhack/ECHO-Modules/.github/workflows/release-modules.yml@refs/tags/modules-fixture',
  runId: '12345',
  runAttempt: '1',
  refName: 'modules-fixture',
  eventName: 'workflow_dispatch',
  generatedBy: 'scripts/generate-module-release.mjs',
  attestation: {
    action: 'actions/attest@v4',
    subjectChecksums: 'checksums.sha256',
  },
}

async function writeJson(root, relPath, value) {
  const filePath = path.join(root, relPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function baseCatalog(root) {
  for (const dir of ['products', 'modpacks', 'modules', 'addons', 'publishers', 'channels', 'trust', 'blocks']) {
    await fs.mkdir(path.join(root, dir), { recursive: true })
  }
  await fs.cp(path.join(repoRoot, 'schemas'), path.join(root, 'schemas'), { recursive: true })
  await writeJson(root, 'channels/alpha.json', { id: 'alpha', name: 'Alpha', stability: 'alpha', priority: 10 })
  await writeJson(root, 'publishers/knoxhack.json', {
    id: 'knoxhack',
    name: 'Knoxhack',
    githubOwner: 'knoxhack',
    trust: 'source-linked',
  })
  await writeJson(root, 'trust/tiers.json', [
    { id: 'official', rank: 100, description: 'Official fixture trust.', playable: true },
    { id: 'provenance-attested', rank: 70, description: 'Attested fixture trust.', playable: true },
    { id: 'source-linked', rank: 60, description: 'Source-linked fixture trust.', playable: true },
    { id: 'community', rank: 40, description: 'Community fixture trust.', playable: true },
    { id: 'unverified', rank: 20, description: 'Unverified fixture trust.', playable: false },
    { id: 'blocked', rank: 0, description: 'Blocked fixture trust.', playable: false },
  ])
}

function approvedEntry(overrides = {}) {
  return {
    id: 'fixture-addon',
    kind: 'addon',
    version: '1.0.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Fixture',
    releaseTag: 'v1.0.0',
    commitSha: 'abc1234',
    artifacts: {
      native: {
        file: 'fixture-addon-1.0.0.echo-addon',
        sha256: sha,
        url: 'https://github.com/knoxhack/ECHO-Fixture/releases/download/v1.0.0/fixture-addon-1.0.0.echo-addon',
      },
    },
    dependencies: [],
    compatibility: ['ashfall-native-edition'],
    trust: 'source-linked',
    validation: 'approved',
    ...overrides,
  }
}

async function writeLauncherChannel(root, catalogUrls) {
  await writeJson(root, 'channels/alpha/launcher-channel.json', {
    schemaVersion: 1,
    channel: 'alpha',
    generatedAt: '2026-06-09T00:00:00Z',
    releaseManifestUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/channels/alpha/release-manifest.json',
    repositoryCatalogUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/channels/alpha/repositories.json',
    catalogUrls: {
      products: [],
      modpacks: [],
      modules: [],
      addons: [],
      ...catalogUrls,
    },
  })
}

async function runFixture(name, setup, expectedStatus, expectedText) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `echo-index-${name}-`))
  await baseCatalog(root)
  await setup(root)
  const result = spawnSync(process.execPath, [validator, '--root', root, '--strict'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const output = `${result.stdout}\n${result.stderr}`
  const passed = result.status === expectedStatus && (!expectedText || output.includes(expectedText))
  if (!passed) {
    console.error(`Fixture ${name} failed.`)
    console.error(`Expected status ${expectedStatus}${expectedText ? ` and text ${expectedText}` : ''}.`)
    console.error(output)
    process.exitCode = 1
  }
  await fs.rm(root, { recursive: true, force: true })
}

await runFixture('approved', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry())
}, 0, 'validation passed')

await runFixture('launcher-channel-covers-catalog', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry())
  await writeLauncherChannel(root, {
    addons: ['https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/addons/fixture-addon.json'],
  })
}, 0, 'validation passed')

await runFixture('launcher-channel-missing-entry', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry())
  await writeLauncherChannel(root, {
    addons: [
      'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/addons/fixture-addon.json',
      'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/addons/missing-addon.json',
    ],
  })
}, 1, 'references missing catalog entry addons/missing-addon.json')

await runFixture('launcher-channel-omits-entry', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry())
  await writeLauncherChannel(root, { addons: [] })
}, 1, 'does not include catalog entry addons/fixture-addon.json')

await runFixture('warning', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    artifacts: {},
    validation: 'warning',
    trust: 'community',
  }))
}, 0, 'has no indexed artifacts')

await runFixture('rejected', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    artifacts: {
      native: {
        file: '../unsafe.echo-addon',
        sha256: 'not-a-sha',
        url: 'http://example.com/unsafe.echo-addon',
      },
    },
    validation: 'rejected',
  }))
}, 1, 'invalid sha256')

await runFixture('blocked', async (root) => {
  await writeJson(root, 'blocks/fixture-addon.json', [{
    id: 'block-fixture-addon',
    scope: 'addon',
    target: 'fixture-addon',
    reason: 'Fixture block',
    createdAt: '2026-06-09T00:00:00Z',
  }])
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    trust: 'blocked',
    validation: 'blocked',
  }))
}, 0, 'validation passed')

await runFixture('blocked-override', async (root) => {
  await writeJson(root, 'blocks/fixture-addon.json', [{
    id: 'block-fixture-addon',
    scope: 'addon',
    target: 'fixture-addon',
    reason: 'Fixture block',
    createdAt: '2026-06-09T00:00:00Z',
  }])
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry())
}, 1, 'is blocked but validation is approved')

await runFixture('approved-non-playable-trust', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    trust: 'unverified',
  }))
}, 1, 'approved entry uses non-playable trust tier unverified')

await runFixture('approved-attested-missing-provenance', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    trust: 'provenance-attested',
  }))
}, 1, 'approved provenance-attested entry missing provenance metadata')

await runFixture('approved-official-missing-provenance', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    trust: 'official',
  }))
}, 1, 'approved official entry missing provenance metadata')

await runFixture('placeholder-commit-sha', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    commitSha: '0000000',
  }))
}, 1, 'commitSha must not be an all-zero placeholder')

await runFixture('blocked-trust-without-blocked-validation', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    trust: 'blocked',
    validation: 'approved',
  }))
}, 1, 'blocked trust tier requires blocked validation state')

await runFixture('approved-depends-on-warning', async (root) => {
  await writeJson(root, 'modules/fixture-core.json', approvedEntry({
    id: 'fixture-core',
    kind: 'module',
    validation: 'warning',
    trust: 'community',
    artifacts: {},
  }))
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    dependencies: [{ id: 'fixture-core', kind: 'module', version: '*' }],
  }))
}, 1, 'fixture-addon approved entry depends on warning dependency fixture-core')

await runFixture('dependency-kind-mismatch', async (root) => {
  await writeJson(root, 'modules/fixture-core.json', approvedEntry({
    id: 'fixture-core',
    kind: 'module',
  }))
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    dependencies: [{ id: 'fixture-core', kind: 'runtime', version: '*' }],
  }))
}, 1, 'fixture-addon dependency fixture-core declares kind runtime but indexed entry is module')

await runFixture('approved-depends-on-blocked', async (root) => {
  await writeJson(root, 'blocks/fixture-core.json', [{
    id: 'block-fixture-core',
    scope: 'module',
    target: 'fixture-core',
    reason: 'Fixture dependency block',
    createdAt: '2026-06-09T00:00:00Z',
  }])
  await writeJson(root, 'modules/fixture-core.json', approvedEntry({
    id: 'fixture-core',
    kind: 'module',
    validation: 'blocked',
    trust: 'blocked',
  }))
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    dependencies: [{ id: 'fixture-core', kind: 'module', version: '*' }],
  }))
}, 1, 'fixture-addon approved entry depends on blocked index entry fixture-core')

await runFixture('module-import', async (root) => {
  const manifestPath = path.join(root, 'fixture-module-release.json')
  await writeJson(root, 'fixture-module-release.json', {
    schemaVersion: 'echo.module.release.v1',
    releaseId: 'modules-fixture',
    generatedAt: '2026-06-09T00:00:00Z',
    sourceRepo: 'https://github.com/knoxhack/ECHO-Modules',
    provenance: moduleReleaseProvenance,
    modules: [
      {
        moduleId: 'echocore',
        version: '1.0.0',
        descriptor: { path: 'META-INF/echo.mod.json', sha256: sha },
        requires: [],
        optional: [],
        artifacts: [
          { kind: 'echo-addon', filename: 'echocore-1.0.0.echo-addon', sha256: sha, size: 10, runtimeTarget: 'echo-native', buildMode: 'compiled-runtime' },
        ],
      },
      {
        moduleId: 'echoarmory',
        version: '1.0.0',
        descriptor: { path: 'META-INF/echo.mod.json', sha256: sha },
        requires: ['echocore'],
        optional: [],
        artifacts: [
          { kind: 'neoforge', filename: 'echoarmory-1.0.0-neoforge.jar', sha256: sha, size: 10, runtimeTarget: 'neoforge', buildMode: 'source-packaged' },
          { kind: 'sources', filename: 'echoarmory-1.0.0-sources.jar', sha256: sha, size: 10, runtimeTarget: 'sources' },
        ],
      },
    ],
  })
  const result = spawnSync(process.execPath, [importer, '--root', root, '--manifest', manifestPath, '--release-tag', 'modules-fixture', '--commit-sha', 'abc1234', '--approved'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`module import failed: ${result.stdout}\n${result.stderr}`)
  }
  const imported = JSON.parse(await fs.readFile(path.join(root, 'modules', 'echoarmory.json'), 'utf8'))
  if (imported.validation !== 'warning' || imported.trust !== 'unverified') {
    throw new Error('source-packaged module import must be warning/unverified')
  }
}, 0, 'validation passed')

await runFixture('module-import-approved', async (root) => {
  const manifestPath = path.join(root, 'fixture-compiled-module-release.json')
  await writeJson(root, 'fixture-compiled-module-release.json', {
    schemaVersion: 'echo.module.release.v1',
    releaseId: 'modules-compiled-fixture',
    generatedAt: '2026-06-09T00:00:00Z',
    sourceRepo: 'https://github.com/knoxhack/ECHO-Modules',
    provenance: moduleReleaseProvenance,
    modules: [
      {
        moduleId: 'echocore',
        version: '1.0.0',
        descriptor: { path: 'META-INF/echo.mod.json', sha256: sha },
        requires: [],
        optional: [],
        artifacts: [
          { kind: 'echo-addon', filename: 'echocore-1.0.0.echo-addon', sha256: sha, size: 10, runtimeTarget: 'echo-native', buildMode: 'compiled-runtime' },
          { kind: 'neoforge', filename: 'echocore-1.0.0-neoforge.jar', sha256: sha, size: 10, runtimeTarget: 'neoforge', buildMode: 'compiled-runtime' },
          { kind: 'standalone', filename: 'echocore-1.0.0-standalone.jar', sha256: sha, size: 10, runtimeTarget: 'standalone', buildMode: 'compiled-runtime' },
          { kind: 'sources', filename: 'echocore-1.0.0-sources.jar', sha256: sha, size: 10, runtimeTarget: 'sources' },
        ],
      },
    ],
  })
  const result = spawnSync(process.execPath, [importer, '--root', root, '--manifest', manifestPath, '--release-tag', 'modules-compiled-fixture', '--commit-sha', 'abc1234', '--approved'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`compiled module import failed: ${result.stdout}\n${result.stderr}`)
  }
  const imported = JSON.parse(await fs.readFile(path.join(root, 'modules', 'echocore.json'), 'utf8'))
  if (imported.validation !== 'approved' || imported.trust !== 'provenance-attested') {
    throw new Error('compiled approved module import must be approved/provenance-attested')
  }
  if (imported.provenance?.attestation?.action !== 'actions/attest@v4') {
    throw new Error('compiled approved module import must preserve attestation provenance')
  }
}, 0, 'validation passed')

await runFixture('module-import-approved-missing-provenance', async (root) => {
  const manifestPath = path.join(root, 'fixture-missing-provenance-module-release.json')
  await writeJson(root, 'fixture-missing-provenance-module-release.json', {
    schemaVersion: 'echo.module.release.v1',
    releaseId: 'modules-missing-provenance-fixture',
    generatedAt: '2026-06-09T00:00:00Z',
    sourceRepo: 'https://github.com/knoxhack/ECHO-Modules',
    modules: [
      {
        moduleId: 'echocore',
        version: '1.0.0',
        descriptor: { path: 'META-INF/echo.mod.json', sha256: sha },
        requires: [],
        optional: [],
        artifacts: [
          { kind: 'echo-addon', filename: 'echocore-1.0.0.echo-addon', sha256: sha, size: 10, runtimeTarget: 'echo-native', buildMode: 'compiled-runtime' },
        ],
      },
    ],
  })
  const result = spawnSync(process.execPath, [importer, '--root', root, '--manifest', manifestPath, '--release-tag', 'modules-missing-provenance-fixture', '--approved'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes('Approved module imports require generated release provenance')) {
    throw new Error(`approved import without provenance should fail: ${result.stdout}\n${result.stderr}`)
  }
}, 0, 'validation passed')

if (!process.exitCode) console.log('Release Index validator fixtures passed.')
