import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    channel: 'alpha',
    publisher: 'knoxhack',
    commitSha: null,
    approved: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--manifest') args.manifest = argv[++index]
    else if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--channel') args.channel = argv[++index]
    else if (arg === '--publisher') args.publisher = argv[++index]
    else if (arg === '--release-tag') args.releaseTag = argv[++index]
    else if (arg === '--commit-sha') args.commitSha = argv[++index]
    else if (arg === '--asset-base-url') args.assetBaseUrl = argv[++index]
    else if (arg === '--approved') args.approved = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.manifest) throw new Error('--manifest is required')
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function sourceRepoFromManifest(manifest) {
  const raw = String(manifest.sourceRepo ?? 'knoxhack/ECHO-Modules')
  const match = raw.match(/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/i)
  return match?.[1] ?? raw.replace(/^https?:\/\//, '').replace(/^github\.com\//, '')
}

function artifactKey(artifact) {
  if (artifact.kind === 'echo-addon') return 'native'
  return artifact.kind
}

function artifactUrl(args, filename, artifact) {
  if (artifact.downloadUrl) return artifact.downloadUrl
  if (!args.assetBaseUrl) return undefined
  return `${args.assetBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(filename)}`
}

function compatibilityFromArtifacts(artifacts) {
  const compatibility = new Set()
  for (const artifact of artifacts) {
    if (artifact.kind === 'echo-addon') compatibility.add('ashfall-native-edition')
    if (artifact.kind === 'neoforge') compatibility.add('ashfall-neoforge-edition')
    if (artifact.kind === 'standalone') compatibility.add('ashfall-standalone-edition')
  }
  return [...compatibility]
}

function commitShaFromManifest(manifest, args) {
  return args.commitSha ?? manifest.provenance?.commitSha ?? '0000000'
}

function validateProvenanceForApproval(manifest) {
  const provenance = manifest.provenance ?? {}
  const attestation = provenance.attestation ?? {}
  const errors = []
  if (provenance.generatedBy !== 'scripts/generate-module-release.mjs') errors.push('generatedBy')
  if (attestation.action !== 'actions/attest@v4') errors.push('attestation.action')
  if (attestation.subjectChecksums !== 'checksums.sha256') errors.push('attestation.subjectChecksums')
  if (!/^[a-f0-9]{7,40}$/i.test(String(provenance.commitSha ?? ''))) errors.push('commitSha')
  if (!String(provenance.workflowRef ?? '').includes('.github/workflows/release-modules.yml@')) errors.push('workflowRef')
  if (errors.length) {
    throw new Error(`Approved module imports require generated release provenance: missing or invalid ${errors.join(', ')}.`)
  }
}

function moduleEntry(moduleRecord, manifest, args) {
  const hasSourcePackaged = (moduleRecord.artifacts ?? []).some((artifact) => artifact.buildMode === 'source-packaged')
  const validation = hasSourcePackaged ? 'warning' : args.approved ? 'approved' : 'warning'
  const trust = hasSourcePackaged ? 'unverified' : args.approved ? 'provenance-attested' : 'source-linked'
  const commitSha = commitShaFromManifest(manifest, args)
  const artifacts = {}
  for (const artifact of moduleRecord.artifacts ?? []) {
    const filename = artifact.filename ?? artifact.file ?? artifact.name
    if (!filename) continue
    const row = {
      file: filename,
      sha256: artifact.sha256,
      size: artifact.size ?? 0,
      runtimeTarget: artifact.runtimeTarget,
      buildMode: artifact.buildMode,
      contains: artifact.contains ?? [],
    }
    const url = artifactUrl(args, filename, artifact)
    if (url) row.url = url
    artifacts[artifactKey(artifact)] = row
  }
  return {
    id: moduleRecord.moduleId,
    kind: 'module',
    version: moduleRecord.version,
    channel: args.channel,
    publisher: args.publisher,
    sourceRepo: sourceRepoFromManifest(manifest),
    releaseTag: args.releaseTag ?? manifest.releaseId,
    commitSha,
    artifacts,
    dependencies: (moduleRecord.requires ?? []).map((id) => ({ id, kind: 'module', version: '*' })),
    compatibility: compatibilityFromArtifacts(moduleRecord.artifacts ?? []),
    ...(trust === 'provenance-attested' ? {
      provenance: {
        sourceRepo: sourceRepoFromManifest(manifest),
        commitSha,
        workflow: manifest.provenance?.workflow,
        workflowRef: manifest.provenance?.workflowRef,
        generatedBy: manifest.provenance?.generatedBy,
        attestation: manifest.provenance?.attestation,
      },
    } : {}),
    trust,
    validation,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifest = await readJson(path.resolve(args.manifest))
  if (manifest.schemaVersion !== 'echo.module.release.v1' || !Array.isArray(manifest.modules)) {
    throw new Error('Module release manifest must use schemaVersion echo.module.release.v1 and include modules[].')
  }
  if (args.approved) validateProvenanceForApproval(manifest)
  const written = []
  for (const moduleRecord of manifest.modules) {
    if (!moduleRecord.moduleId || !moduleRecord.version) {
      throw new Error('Each module record must include moduleId and version.')
    }
    const entry = moduleEntry(moduleRecord, manifest, args)
    const filePath = path.join(args.root, 'modules', `${entry.id}.json`)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
    written.push(path.relative(args.root, filePath).replace(/\\/g, '/'))
  }
  console.log(`Imported ${written.length} module release entr${written.length === 1 ? 'y' : 'ies'}: ${written.join(', ')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
