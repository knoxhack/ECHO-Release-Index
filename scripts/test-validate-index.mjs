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
    subjectChecksums: 'echo-module-release.tar.gz.sha256',
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
      'content-graph': {
        file: 'fixture-addon-1.0.0-content-graph.json',
        sha256: sha,
        url: 'https://github.com/knoxhack/ECHO-Fixture/releases/download/v1.0.0/fixture-addon-1.0.0-content-graph.json',
        runtimeTarget: 'content-graph',
        buildMode: 'generated',
      },
      'content-graph-evidence': {
        artifactRole: 'content-graph-evidence',
        file: 'content-graph-evidence.json',
        sha256: sha,
        url: 'https://github.com/knoxhack/ECHO-Fixture/releases/download/v1.0.0/content-graph-evidence.json',
        runtimeTarget: 'content-graph',
        buildMode: 'generated',
        schemaVersion: 'echo.content_graph.evidence.v1',
      },
    },
    dependencies: [],
    compatibility: ['fixture-native'],
    trust: 'source-linked',
    validation: 'approved',
    ...overrides,
  }
}

function approvedModpackEntry(overrides = {}) {
  return approvedEntry({
    id: 'fixture-pack',
    kind: 'modpack',
    artifacts: {
      pack: {
        file: 'fixture-pack.zip',
        sha256: sha,
        url: 'https://github.com/knoxhack/ECHO-Fixture-Pack/releases/download/v1.0.0/fixture-pack.zip',
      },
      manifest: {
        file: 'fixture-pack-alpha-1.0.0.pack.json',
        sha256: sha,
        url: 'https://github.com/knoxhack/ECHO-Fixture-Pack/releases/download/v1.0.0/fixture-pack-alpha-1.0.0.pack.json',
      },
    },
    compatibility: ['fixture-pack'],
    ...overrides,
  })
}

function runtimeConformanceArtifact(overrides = {}) {
  return {
    artifactRole: 'runtime-conformance',
    file: 'runtime-conformance.json',
    sha256: sha,
    url: 'https://github.com/knoxhack/ECHO-Fixture-Pack/releases/download/v1.0.0/runtime-conformance.json',
    runtimeTarget: 'echo_native',
    hostId: 'echo_native',
    schemaVersion: 'echo.runtime.conformance.v1',
    summaryStatus: 'pass',
    fallbackSurfaceCount: 0,
    blockedSurfaceCount: 0,
    ...overrides,
  }
}

function moduleReleaseRuntimeConformance(overrides = {}) {
  return {
    kind: 'runtime-conformance',
    filename: 'neoforge-runtime-conformance.json',
    sha256: sha,
    size: 200,
    downloadUrl: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-fixture/neoforge-runtime-conformance.json',
    runtimeTarget: 'neoforge',
    hostId: 'neoforge',
    buildMode: 'generated',
    schemaVersion: 'echo.runtime.conformance.v1',
    summary: {
      status: 'warning',
      supported: 0,
      adapted: 20,
      fallback: 27,
      blocked: 0,
    },
    ...overrides,
  }
}

async function writeLauncherChannel(root, catalogUrls, packs = []) {
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
    packs,
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

await runFixture('launcher-channel-approved-pack-backed-by-approved-modpack', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedModpackEntry())
  await writeLauncherChannel(root, {
    modpacks: ['https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/modpacks/fixture-pack.json'],
  }, [
    {
      id: 'fixture-pack',
      name: 'Fixture Pack',
      channel: 'alpha',
      catalogEntryUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/modpacks/fixture-pack.json',
      catalogStatus: 'approved',
    },
  ])
}, 0, 'validation passed')

await runFixture('launcher-channel-approved-pack-requires-approved-modpack', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedModpackEntry({
    artifacts: {},
    validation: 'warning',
    trust: 'community',
  }))
  await writeLauncherChannel(root, {
    modpacks: ['https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/modpacks/fixture-pack.json'],
  }, [
    {
      id: 'fixture-pack',
      name: 'Fixture Pack',
      channel: 'alpha',
      catalogEntryUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/modpacks/fixture-pack.json',
      catalogStatus: 'approved',
    },
  ])
}, 1, 'marks fixture-pack approved, but modpacks/fixture-pack.json validation is warning')

await runFixture('warning', async (root) => {
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    artifacts: {},
    validation: 'warning',
    trust: 'community',
  }))
}, 0, 'has no indexed artifacts')

await runFixture('legacy-content-graph-evidence-fallback-policy', async (root) => {
  const { 'content-graph-evidence': _evidence, ...artifacts } = approvedEntry().artifacts
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    artifacts,
    contentGraphEvidencePolicy: 'legacy-fallback-only',
  }))
}, 0, 'validation passed')

await runFixture('invalid-content-graph-evidence-fallback-policy', async (root) => {
  const { 'content-graph-evidence': _evidence, ...artifacts } = approvedEntry().artifacts
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    artifacts,
    contentGraphEvidencePolicy: 'sidecars-ok',
  }))
}, 1, 'contentGraphEvidencePolicy must be legacy-fallback-only')

await runFixture('legacy-content-graph-artifact-metadata-policy', async (root) => {
  const { 'content-graph-evidence': _evidence, ...artifacts } = approvedEntry().artifacts
  delete artifacts['content-graph'].url
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    artifacts,
    validation: 'warning',
    contentGraphArtifactPolicy: 'legacy-metadata-only',
    contentGraphEvidencePolicy: 'legacy-fallback-only',
  }))
}, 0, 'validation passed')

await runFixture('invalid-content-graph-artifact-metadata-policy', async (root) => {
  const { 'content-graph-evidence': _evidence, ...artifacts } = approvedEntry().artifacts
  delete artifacts['content-graph'].url
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    artifacts,
    validation: 'warning',
    contentGraphArtifactPolicy: 'metadata-only',
  }))
}, 1, 'contentGraphArtifactPolicy must be legacy-metadata-only')

await runFixture('approved-content-graph-artifact-metadata-policy', async (root) => {
  const { 'content-graph-evidence': _evidence, ...artifacts } = approvedEntry().artifacts
  delete artifacts['content-graph'].url
  await writeJson(root, 'addons/fixture-addon.json', approvedEntry({
    artifacts,
    contentGraphArtifactPolicy: 'legacy-metadata-only',
  }))
}, 1, 'contentGraphArtifactPolicy legacy-metadata-only cannot be used on approved entries')

await runFixture('approved-windows-product-missing-updater-role', async (root) => {
  await writeJson(root, 'products/fixture-product.json', approvedEntry({
    id: 'fixture-product',
    kind: 'product',
    artifacts: {
      windowsSetup: {
        file: 'fixture-product-setup.exe',
        sha256: sha,
        url: 'https://github.com/knoxhack/ECHO-Fixture/releases/download/v1.0.0/fixture-product-setup.exe',
      },
    },
    compatibility: ['windows-x64'],
  }))
}, 1, 'has no exact indexed artifact for role latestYml')

await runFixture('approved-windows-studio-missing-installer-role', async (root) => {
  await writeJson(root, 'products/fixture-studio.json', approvedEntry({
    id: 'fixture-studio',
    kind: 'studio',
    artifacts: {
      latestYml: {
        file: 'latest.yml',
        sha256: sha,
        url: 'https://github.com/knoxhack/ECHO-Fixture/releases/download/v1.0.0/latest.yml',
      },
    },
    compatibility: ['windows-x64'],
  }))
}, 1, 'has no exact indexed artifact for role windowsSetup')

await runFixture('approved-runtime-missing-archive-role', async (root) => {
  await writeJson(root, 'products/fixture-runtime.json', approvedEntry({
    id: 'fixture-runtime',
    kind: 'runtime',
    artifacts: {
      checksums: {
        file: 'checksums.txt',
        sha256: sha,
        url: 'https://github.com/knoxhack/ECHO-Fixture/releases/download/v1.0.0/checksums.txt',
      },
    },
  }))
}, 1, 'has no exact indexed artifact for role archive')

await runFixture('approved-modpack-missing-manifest-role', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedEntry({
    id: 'fixture-pack',
    kind: 'modpack',
    artifacts: {
      pack: {
        file: 'fixture-pack.zip',
        sha256: sha,
        url: 'https://github.com/knoxhack/ECHO-Fixture/releases/download/v1.0.0/fixture-pack.zip',
      },
    },
  }))
}, 1, 'has no exact indexed artifact for role manifest')

await runFixture('player-ready-requires-runtime-conformance', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedModpackEntry({
    playerReady: true,
    playerReadyStatus: 'player-ready',
    runtimeConformancePolicy: 'required',
    requiredRuntimeHosts: ['echo_native'],
  }))
}, 1, 'has no runtime-conformance artifact for ECHO Native player-ready evidence')

await runFixture('player-ready-requires-host-list', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedModpackEntry({
    artifacts: {
      ...approvedModpackEntry().artifacts,
      'runtime-conformance': runtimeConformanceArtifact(),
    },
    playerReady: true,
    playerReadyStatus: 'player-ready',
    runtimeConformancePolicy: 'required',
  }))
}, 1, 'player-ready entries must list requiredRuntimeHosts')

await runFixture('player-ready-runtime-conformance-pass', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedModpackEntry({
    artifacts: {
      ...approvedModpackEntry().artifacts,
      'runtime-conformance': runtimeConformanceArtifact(),
    },
    playerReady: true,
    playerReadyStatus: 'player-ready',
    runtimeConformancePolicy: 'required',
    requiredRuntimeHosts: ['echo_native'],
  }))
}, 0, 'validation passed')

await runFixture('player-ready-runtime-conformance-blocked', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedModpackEntry({
    artifacts: {
      ...approvedModpackEntry().artifacts,
      'runtime-conformance': runtimeConformanceArtifact({
        summaryStatus: 'fail',
        blockedSurfaceCount: 1,
      }),
    },
    playerReady: true,
    playerReadyStatus: 'player-ready',
    runtimeConformancePolicy: 'required',
    requiredRuntimeHosts: ['echo_native'],
  }))
}, 1, 'runtime conformance evidence reports blocked surfaces')

await runFixture('player-ready-runtime-conformance-fallback-only', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedModpackEntry({
    artifacts: {
      ...approvedModpackEntry().artifacts,
      'runtime-conformance': runtimeConformanceArtifact({
        summaryStatus: 'warning',
        fallbackSurfaceCount: 3,
        requiredFallbackOnly: true,
      }),
    },
    playerReady: true,
    playerReadyStatus: 'player-ready',
    runtimeConformancePolicy: 'required',
    requiredRuntimeHosts: ['echo_native'],
  }))
}, 1, 'full player-ready runtime conformance evidence must not be fallback-only')

await runFixture('warning-gated-runtime-conformance-allows-approved-fallback', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedModpackEntry({
    artifacts: {
      ...approvedModpackEntry().artifacts,
      'runtime-conformance': runtimeConformanceArtifact({
        summaryStatus: 'warning',
        fallbackSurfaceCount: 2,
      }),
    },
    playerReadyStatus: 'warning-gated',
    runtimeConformancePolicy: 'approved-fallback',
    requiredRuntimeHosts: ['echo_native'],
  }))
}, 0, 'validation passed')

await runFixture('metadata-only-cannot-be-player-ready', async (root) => {
  await writeJson(root, 'modpacks/fixture-pack.json', approvedModpackEntry({
    playerReady: true,
    playerReadyStatus: 'player-ready',
    runtimeConformancePolicy: 'legacy-metadata-only',
    requiredRuntimeHosts: ['echo_native'],
  }))
}, 1, 'runtimeConformancePolicy legacy-metadata-only cannot be used for player-ready entries')

await runFixture('warning-runtime-missing-archive-role', async (root) => {
  await writeJson(root, 'products/fixture-runtime.json', approvedEntry({
    id: 'fixture-runtime',
    kind: 'runtime',
    artifacts: {},
    validation: 'warning',
    trust: 'community',
  }))
}, 0, 'has no exact indexed artifact for role archive')

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
    contentGraphEvidence: {
      kind: 'content-graph-evidence',
      filename: 'content-graph-evidence.json',
      sha256: sha,
      size: 100,
      downloadUrl: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-fixture/content-graph-evidence.json',
      runtimeTarget: 'content-graph',
      buildMode: 'generated',
      schemaVersion: 'echo.content_graph.evidence.v1',
    },
    runtimeConformanceEvidence: [moduleReleaseRuntimeConformance()],
    modules: [
      {
        moduleId: 'echocore',
        version: '1.0.0',
        descriptor: { path: 'META-INF/echo.mod.json', sha256: sha },
        requires: [],
        optional: [],
        artifacts: [
          { kind: 'echo-addon', filename: 'echocore-1.0.0.echo-addon', sha256: sha, size: 10, runtimeTarget: 'echo-native', buildMode: 'compiled-runtime' },
          { kind: 'content-graph', filename: 'echocore-1.0.0-content-graph.json', sha256: sha, size: 10, runtimeTarget: 'content-graph', buildMode: 'generated' },
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
          { kind: 'content-graph', filename: 'echoarmory-1.0.0-content-graph.json', sha256: sha, size: 10, runtimeTarget: 'content-graph', buildMode: 'generated' },
        ],
      },
    ],
  })
  const result = spawnSync(process.execPath, [importer, '--root', root, '--manifest', manifestPath, '--release-tag', 'modules-fixture', '--commit-sha', 'abc1234', '--asset-base-url', 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-fixture', '--approved'], {
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
  if (imported.artifacts?.['runtime-conformance']?.artifactRole !== 'runtime-conformance') {
    throw new Error('source-packaged module import must expose runtime-conformance role')
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
    contentGraphEvidence: {
      kind: 'content-graph-evidence',
      filename: 'content-graph-evidence.json',
      sha256: sha,
      size: 100,
      downloadUrl: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-compiled-fixture/content-graph-evidence.json',
      runtimeTarget: 'content-graph',
      buildMode: 'generated',
      schemaVersion: 'echo.content_graph.evidence.v1',
    },
    runtimeConformanceEvidence: [moduleReleaseRuntimeConformance({
      downloadUrl: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-compiled-fixture/neoforge-runtime-conformance.json',
    })],
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
          { kind: 'content-graph', filename: 'echocore-1.0.0-content-graph.json', sha256: sha, size: 10, runtimeTarget: 'content-graph', buildMode: 'generated' },
        ],
      },
    ],
  })
  const result = spawnSync(process.execPath, [importer, '--root', root, '--manifest', manifestPath, '--release-tag', 'modules-compiled-fixture', '--commit-sha', 'abc1234', '--asset-base-url', 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-compiled-fixture', '--approved'], {
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
  if (imported.artifacts?.['content-graph-evidence']?.artifactRole !== 'content-graph-evidence') {
    throw new Error('compiled approved module import must expose content-graph-evidence role')
  }
  if (imported.artifacts?.['runtime-conformance']?.artifactRole !== 'runtime-conformance') {
    throw new Error('compiled approved module import must expose runtime-conformance role')
  }
  if (imported.artifacts?.['runtime-conformance']?.hostId !== 'neoforge') {
    throw new Error('compiled approved module import must preserve runtime-conformance host id')
  }
}, 0, 'validation passed')

await runFixture('module-import-dry-run-requires-runtime-host', async (root) => {
  const manifestPath = path.join(root, 'fixture-dry-run-module-release.json')
  await writeJson(root, 'fixture-dry-run-module-release.json', {
    schemaVersion: 'echo.module.release.v1',
    releaseId: 'modules-dry-run-fixture',
    generatedAt: '2026-06-09T00:00:00Z',
    sourceRepo: 'https://github.com/knoxhack/ECHO-Modules',
    provenance: moduleReleaseProvenance,
    contentGraphEvidence: {
      kind: 'content-graph-evidence',
      filename: 'content-graph-evidence.json',
      sha256: sha,
      size: 100,
      downloadUrl: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-dry-run-fixture/content-graph-evidence.json',
      runtimeTarget: 'content-graph',
      buildMode: 'generated',
      schemaVersion: 'echo.content_graph.evidence.v1',
    },
    runtimeConformanceEvidence: [moduleReleaseRuntimeConformance({
      downloadUrl: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-dry-run-fixture/neoforge-runtime-conformance.json',
    })],
    modules: [
      {
        moduleId: 'echocore',
        version: '1.0.0',
        descriptor: { path: 'META-INF/echo.mod.json', sha256: sha },
        requires: [],
        optional: [],
        artifacts: [
          { kind: 'echo-addon', filename: 'echocore-1.0.0.echo-addon', sha256: sha, size: 10, runtimeTarget: 'echo-native', buildMode: 'compiled-runtime' },
          { kind: 'content-graph', filename: 'echocore-1.0.0-content-graph.json', sha256: sha, size: 10, runtimeTarget: 'content-graph', buildMode: 'generated' },
        ],
      },
    ],
  })
  const result = spawnSync(process.execPath, [
    importer,
    '--root', root,
    '--manifest', manifestPath,
    '--release-tag', 'modules-dry-run-fixture',
    '--commit-sha', 'abc1234',
    '--asset-base-url', 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-dry-run-fixture',
    '--approved',
    '--dry-run',
    '--require-runtime-host', 'neoforge',
  ], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const output = `${result.stdout}\n${result.stderr}`
  if (result.status !== 0 || !output.includes('Validated 1 module release entry for import (dry run): modules/echocore.json')) {
    throw new Error(`dry-run module import should validate required host: ${output}`)
  }
  try {
    await fs.stat(path.join(root, 'modules', 'echocore.json'))
    throw new Error('dry-run module import must not write module catalog entries')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}, 0, 'validation passed')

await runFixture('module-import-dry-run-missing-required-runtime-host', async (root) => {
  const manifestPath = path.join(root, 'fixture-missing-runtime-host-module-release.json')
  await writeJson(root, 'fixture-missing-runtime-host-module-release.json', {
    schemaVersion: 'echo.module.release.v1',
    releaseId: 'modules-missing-runtime-host-fixture',
    generatedAt: '2026-06-09T00:00:00Z',
    sourceRepo: 'https://github.com/knoxhack/ECHO-Modules',
    provenance: moduleReleaseProvenance,
    contentGraphEvidence: {
      kind: 'content-graph-evidence',
      filename: 'content-graph-evidence.json',
      sha256: sha,
      size: 100,
      downloadUrl: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-missing-runtime-host-fixture/content-graph-evidence.json',
      runtimeTarget: 'content-graph',
      buildMode: 'generated',
      schemaVersion: 'echo.content_graph.evidence.v1',
    },
    runtimeConformanceEvidence: [moduleReleaseRuntimeConformance({
      downloadUrl: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-missing-runtime-host-fixture/neoforge-runtime-conformance.json',
    })],
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
  const result = spawnSync(process.execPath, [
    importer,
    '--root', root,
    '--manifest', manifestPath,
    '--release-tag', 'modules-missing-runtime-host-fixture',
    '--commit-sha', 'abc1234',
    '--approved',
    '--dry-run',
    '--require-runtime-host', 'standalone_engine',
  ], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const output = `${result.stdout}\n${result.stderr}`
  if (result.status === 0 || !output.includes('runtimeConformanceEvidence is missing required host standalone_engine')) {
    throw new Error(`dry-run module import should reject missing required runtime host: ${output}`)
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
