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
    dryRun: false,
    requiredRuntimeHosts: [],
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
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--require-runtime-host') args.requiredRuntimeHosts.push(argv[++index])
    else if (arg === '--require-runtime-hosts') args.requiredRuntimeHosts.push(...String(argv[++index]).split(','))
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.manifest) throw new Error('--manifest is required')
  args.requiredRuntimeHosts = [...new Set(args.requiredRuntimeHosts.map((host) => String(host ?? '').trim()).filter(Boolean))]
  return args
}

const runtimeConformanceHosts = new Set(['echo_native', 'neoforge', 'echo_runtime_standalone', 'standalone_engine'])
const runtimeConformanceSchemaVersion = 'echo.runtime.conformance.v1'
const runtimeConformanceStatus = new Set(['pass', 'warning', 'fail'])

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

function artifactRow(args, filename, artifact) {
  const row = {
    file: filename,
    sha256: artifact.sha256,
    size: artifact.size ?? 0,
    runtimeTarget: artifact.runtimeTarget,
    buildMode: artifact.buildMode,
    contains: artifact.contains ?? [],
  }
  if (artifact.schemaVersion) row.schemaVersion = artifact.schemaVersion
  if (artifact.hostId) row.hostId = artifact.hostId
  if (artifact.summary?.status) row.summaryStatus = artifact.summary.status
  if (Number.isInteger(artifact.summary?.fallback)) row.fallbackSurfaceCount = artifact.summary.fallback
  if (Number.isInteger(artifact.summary?.blocked)) row.blockedSurfaceCount = artifact.summary.blocked
  const url = artifactUrl(args, filename, artifact)
  if (url) row.url = url
  return row
}

function runtimeConformanceArtifactKey(artifact, index) {
  return index === 0 ? 'runtime-conformance' : `runtime-conformance-${artifact.hostId ?? artifact.runtimeTarget ?? index}`
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
  if (attestation.subjectChecksums !== 'echo-module-release.tar.gz.sha256') errors.push('attestation.subjectChecksums')
  if (!/^[a-f0-9]{7,40}$/i.test(String(provenance.commitSha ?? ''))) errors.push('commitSha')
  if (!String(provenance.workflowRef ?? '').includes('.github/workflows/release-modules.yml@')) errors.push('workflowRef')
  if (errors.length) {
    throw new Error(`Approved module imports require generated release provenance: missing or invalid ${errors.join(', ')}.`)
  }
}

function validateRuntimeConformanceEvidence(manifest, args) {
  const evidence = manifest.runtimeConformanceEvidence
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error('Module release manifest must include runtimeConformanceEvidence[].')
  }

  const errors = []
  const coveredHosts = new Set()

  for (const [index, artifact] of evidence.entries()) {
    const label = `runtimeConformanceEvidence[${index}]`
    const hostId = String(artifact.hostId ?? '').trim()
    const runtimeTarget = String(artifact.runtimeTarget ?? '').trim()
    const summary = artifact.summary ?? {}

    if (artifact.kind !== 'runtime-conformance') errors.push(`${label}.kind must be runtime-conformance`)
    if (!String(artifact.filename ?? '').endsWith('-runtime-conformance.json')) {
      errors.push(`${label}.filename must end with -runtime-conformance.json`)
    }
    if (!/^[a-f0-9]{64}$/i.test(String(artifact.sha256 ?? ''))) errors.push(`${label}.sha256 must be a 64-character SHA-256`)
    if (!Number.isInteger(artifact.size) || artifact.size < 0) errors.push(`${label}.size must be a non-negative integer`)
    if (artifact.schemaVersion !== runtimeConformanceSchemaVersion) {
      errors.push(`${label}.schemaVersion must be ${runtimeConformanceSchemaVersion}`)
    }
    if (!runtimeConformanceHosts.has(hostId)) {
      errors.push(`${label}.hostId must be one of ${[...runtimeConformanceHosts].join(', ')}`)
    } else {
      coveredHosts.add(hostId)
    }
    if (!runtimeConformanceHosts.has(runtimeTarget)) {
      errors.push(`${label}.runtimeTarget must be one of ${[...runtimeConformanceHosts].join(', ')}`)
    }
    if (hostId && runtimeTarget && hostId !== runtimeTarget) {
      errors.push(`${label}.hostId must match runtimeTarget`)
    }
    if (!runtimeConformanceStatus.has(String(summary.status ?? ''))) {
      errors.push(`${label}.summary.status must be pass, warning, or fail`)
    }
    for (const field of ['supported', 'adapted', 'fallback', 'blocked']) {
      if (!Number.isInteger(summary[field]) || summary[field] < 0) {
        errors.push(`${label}.summary.${field} must be a non-negative integer`)
      }
    }
  }

  for (const host of args.requiredRuntimeHosts) {
    if (!runtimeConformanceHosts.has(host)) {
      errors.push(`required runtime host ${host} is not a recognized ECHO Native host`)
    } else if (!coveredHosts.has(host)) {
      errors.push(`runtimeConformanceEvidence is missing required host ${host}`)
    }
  }

  if (errors.length) {
    throw new Error(`Module release runtime conformance evidence is invalid:\n- ${errors.join('\n- ')}`)
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
    artifacts[artifactKey(artifact)] = artifactRow(args, filename, artifact)
  }
  if (manifest.contentGraphEvidence?.filename) {
    artifacts['content-graph-evidence'] = {
      ...artifactRow(args, manifest.contentGraphEvidence.filename, manifest.contentGraphEvidence),
      artifactRole: 'content-graph-evidence',
    }
  }
  for (const [index, artifact] of (manifest.runtimeConformanceEvidence ?? []).entries()) {
    if (!artifact.filename) continue
    artifacts[runtimeConformanceArtifactKey(artifact, index)] = {
      ...artifactRow(args, artifact.filename, artifact),
      artifactRole: 'runtime-conformance',
    }
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
  validateRuntimeConformanceEvidence(manifest, args)
  const written = []
  for (const moduleRecord of manifest.modules) {
    if (!moduleRecord.moduleId || !moduleRecord.version) {
      throw new Error('Each module record must include moduleId and version.')
    }
    const entry = moduleEntry(moduleRecord, manifest, args)
    const filePath = path.join(args.root, 'modules', `${entry.id}.json`)
    if (!args.dryRun) {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
    }
    written.push(path.relative(args.root, filePath).replace(/\\/g, '/'))
  }
  const verb = args.dryRun ? 'Validated' : 'Imported'
  const suffix = args.dryRun ? ' for import (dry run)' : ''
  console.log(`${verb} ${written.length} module release entr${written.length === 1 ? 'y' : 'ies'}${suffix}: ${written.join(', ')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
