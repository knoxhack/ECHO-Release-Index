#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    product: 'products/native-platform.json',
    out: 'release-readiness/native-platform-rc1-attestation.json',
    gh: process.env.ECHO_INGEST_GH_EXECUTABLE || 'gh',
    keepTmp: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--product') args.product = argv[++index]
    else if (arg === '--out') args.out = argv[++index]
    else if (arg === '--archive') args.archive = path.resolve(argv[++index])
    else if (arg === '--gh') args.gh = argv[++index]
    else if (arg === '--keep-tmp') args.keepTmp = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN

function githubHeaders(extra = {}) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ECHO-Native-Platform-RC1-Attestation',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

function parseJson(text, label) {
  const normalized = String(text ?? '').replace(/^\uFEFF/u, '').trim()
  if (!normalized) throw new Error(`${label} is empty`)
  return JSON.parse(normalized)
}

async function readJson(filePath) {
  return parseJson(await fs.readFile(filePath, 'utf8'), filePath)
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function githubJson(route) {
  const response = await fetch(`https://api.github.com${route}`, { headers: githubHeaders() })
  if (!response.ok) throw new Error(`GitHub ${route} failed ${response.status}: ${await response.text()}`)
  return response.json()
}

async function downloadBytes(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream, application/zip, */*',
      'User-Agent': 'ECHO-Native-Platform-RC1-Attestation',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function runGh(gh, ghArgs) {
  const result = spawnSync(gh, ghArgs, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  if (result.error) {
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: `${result.stderr ?? ''}${result.stderr ? '\n' : ''}${result.error.message}`,
    }
  }
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function firstLine(text) {
  return String(text ?? '').trim().split(/\r?\n/u).find(Boolean) ?? ''
}

function requireCondition(errors, condition, message) {
  if (!condition) errors.push(message)
}

function expectedSubjects(product) {
  const subjects = new Map()
  for (const artifact of Object.values(product.artifacts ?? {})) {
    if (artifact?.file && artifact?.sha256) subjects.set(artifact.file, String(artifact.sha256).toLowerCase())
  }
  return subjects
}

function subjectMap(statement) {
  const subjects = new Map()
  for (const subject of statement?.subject ?? []) {
    const name = String(subject?.name ?? '')
    const digest = String(subject?.digest?.sha256 ?? '').toLowerCase()
    if (name && digest) subjects.set(name, digest)
  }
  return subjects
}

function pickVerifiedRecord(records, archiveFile, archiveSha256) {
  for (const record of records) {
    const subjects = subjectMap(record?.verificationResult?.statement)
    if (subjects.get(archiveFile) === archiveSha256) return record
  }
  return records[0]
}

function parseRunId(runInvocationUri) {
  const match = String(runInvocationUri ?? '').match(/\/actions\/runs\/(\d+)\//u)
  return match ? Number(match[1]) : null
}

async function materializeArchive(product, archiveArtifact) {
  if (args.archive) return { path: args.archive, cleanupDir: null, source: 'local-argument' }
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-native-platform-rc1-attestation-'))
  const archivePath = path.join(tmpDir, archiveArtifact.file)
  const bytes = await downloadBytes(archiveArtifact.url)
  await fs.writeFile(archivePath, bytes)
  return { path: archivePath, cleanupDir: tmpDir, source: 'github-release-download' }
}

async function main() {
  const productPath = path.resolve(args.root, args.product)
  const product = await readJson(productPath)
  const [owner, repo] = String(product.sourceRepo).split('/')
  const repoFullName = `${owner}/${repo}`
  const archiveArtifact = product.artifacts?.archive
  if (!archiveArtifact?.file || !archiveArtifact?.url || !archiveArtifact?.sha256) {
    throw new Error('products/native-platform.json must include artifacts.archive file, url, and sha256')
  }

  const expectedAttestation = product.provenance?.attestation ?? {}
  const sourceDigest = expectedAttestation.sourceDigest
  const signerDigest = expectedAttestation.signerDigest ?? sourceDigest
  const sourceRef = expectedAttestation.sourceRef ?? 'refs/heads/main'
  const signerWorkflow = expectedAttestation.signerWorkflow ?? `${repoFullName}/.github/workflows/attest-release-assets.yml`
  const workflowPath = expectedAttestation.workflow ?? '.github/workflows/attest-release-assets.yml'
  const workflowTrigger = expectedAttestation.workflowTrigger ?? 'workflow_dispatch'
  const expectedRunId = expectedAttestation.workflowRunId ? Number(expectedAttestation.workflowRunId) : null
  const expectedSubjectSha256 = String(expectedAttestation.verifiedSubjectSha256 ?? archiveArtifact.sha256).toLowerCase()
  const expected = expectedSubjects(product)
  const errors = []

  const archive = await materializeArchive(product, archiveArtifact)
  try {
    const archiveBytes = await fs.readFile(archive.path)
    const archiveSha256 = sha256(archiveBytes)
    requireCondition(errors, archiveSha256 === String(archiveArtifact.sha256).toLowerCase(), 'archive SHA-256 does not match product metadata')
    if (archiveArtifact.size) requireCondition(errors, archiveBytes.length === Number(archiveArtifact.size), 'archive size does not match product metadata')

    const releaseAssetResult = runGh(args.gh, [
      'release',
      'verify-asset',
      product.releaseTag,
      archive.path,
      '--repo',
      repoFullName,
      '--format',
      'json',
    ])

    const attestArgs = [
      'attestation',
      'verify',
      archive.path,
      '--repo',
      repoFullName,
      '--signer-workflow',
      signerWorkflow,
      '--source-ref',
      sourceRef,
      '--deny-self-hosted-runners',
      '--format',
      'json',
    ]
    if (sourceDigest) attestArgs.push('--source-digest', sourceDigest)
    if (signerDigest) attestArgs.push('--signer-digest', signerDigest)

    const attestationResult = runGh(args.gh, attestArgs)
    if (attestationResult.status !== 0) {
      errors.push(firstLine(attestationResult.stderr || attestationResult.stdout || 'gh attestation verify failed'))
    }

    let verificationResult = null
    let verifiedSubjects = []
    let verifiedTimestamps = []
    let workflowRun = null
    if (attestationResult.status === 0) {
      try {
        const payload = parseJson(attestationResult.stdout, 'gh attestation verify output')
        const records = Array.isArray(payload) ? payload : [payload]
        requireCondition(errors, records.length > 0, 'gh attestation verify returned no verified records')
        const record = pickVerifiedRecord(records, archiveArtifact.file, archiveSha256)
        verificationResult = record?.verificationResult ?? null
        const statement = verificationResult?.statement ?? {}
        const subjects = subjectMap(statement)
        verifiedSubjects = [...subjects.entries()].map(([name, digest]) => ({ name, sha256: digest })).sort((a, b) => a.name.localeCompare(b.name))
        verifiedTimestamps = verificationResult?.verifiedTimestamps ?? []
        const cert = verificationResult?.signature?.certificate ?? {}
        const predicate = statement?.predicate ?? {}
        const workflow = predicate?.buildDefinition?.externalParameters?.workflow ?? {}
        const github = predicate?.buildDefinition?.internalParameters?.github ?? {}
        const runInvocationUri = cert.runInvocationURI ?? predicate?.runDetails?.metadata?.invocationId
        const actualRunId = parseRunId(runInvocationUri)

        requireCondition(errors, statement.predicateType === 'https://slsa.dev/provenance/v1', 'attestation predicateType must be SLSA provenance v1')
        requireCondition(errors, cert.githubWorkflowRepository === repoFullName, 'certificate GitHub workflow repository mismatch')
        requireCondition(errors, cert.githubWorkflowTrigger === workflowTrigger, 'certificate GitHub workflow trigger mismatch')
        requireCondition(errors, cert.githubWorkflowRef === sourceRef, 'certificate GitHub workflow ref mismatch')
        requireCondition(errors, cert.sourceRepositoryRef === sourceRef, 'certificate source repository ref mismatch')
        requireCondition(errors, cert.sourceRepositoryURI === `https://github.com/${repoFullName}`, 'certificate source repository URI mismatch')
        requireCondition(errors, cert.sourceRepositoryVisibilityAtSigning === 'public', 'certificate source repository must be public at signing')
        requireCondition(errors, cert.runnerEnvironment === 'github-hosted', 'attestation must be produced on a GitHub-hosted runner')
        requireCondition(errors, cert.buildTrigger === workflowTrigger, 'certificate build trigger mismatch')
        requireCondition(errors, cert.buildSignerURI === `https://github.com/${signerWorkflow}@${sourceRef}`, 'certificate signer workflow URI mismatch')
        requireCondition(errors, workflow.path === workflowPath, 'SLSA workflow path mismatch')
        requireCondition(errors, workflow.ref === sourceRef, 'SLSA workflow ref mismatch')
        requireCondition(errors, workflow.repository === `https://github.com/${repoFullName}`, 'SLSA workflow repository mismatch')
        requireCondition(errors, github.event_name === workflowTrigger, 'SLSA GitHub event name mismatch')
        if (sourceDigest) {
          requireCondition(errors, cert.githubWorkflowSHA === sourceDigest, 'certificate workflow SHA mismatch')
          requireCondition(errors, cert.sourceRepositoryDigest === sourceDigest, 'certificate source repository digest mismatch')
        }
        if (signerDigest) {
          requireCondition(errors, cert.buildSignerDigest === signerDigest, 'certificate signer digest mismatch')
        }
        if (expectedRunId) {
          requireCondition(errors, actualRunId === expectedRunId, 'attestation workflow run id mismatch')
        }
        requireCondition(errors, subjects.get(archiveArtifact.file) === expectedSubjectSha256, 'attestation subject digest for archive mismatch')
        requireCondition(errors, subjects.size === expected.size, 'attestation subject count does not match product artifact count')
        for (const [name, digest] of expected) {
          requireCondition(errors, subjects.get(name) === digest, `attestation subject mismatch for ${name}`)
        }
        requireCondition(errors, verifiedTimestamps.some((timestamp) => timestamp.type === 'Tlog'), 'attestation must include a transparency-log timestamp')

        if (actualRunId) {
          const run = await githubJson(`/repos/${owner}/${repo}/actions/runs/${actualRunId}`)
          workflowRun = {
            id: run.id,
            url: run.html_url,
            name: run.name,
            status: run.status,
            conclusion: run.conclusion,
            headSha: run.head_sha,
            event: run.event,
            runAttempt: run.run_attempt,
          }
          requireCondition(errors, run.conclusion === 'success', 'attestation workflow run must have conclusion success')
          requireCondition(errors, run.status === 'completed', 'attestation workflow run must be completed')
          requireCondition(errors, run.head_sha === sourceDigest, 'attestation workflow run head SHA mismatch')
          requireCondition(errors, run.event === workflowTrigger, 'attestation workflow run event mismatch')
        }
      } catch (error) {
        errors.push(`Unable to parse or validate attestation JSON: ${error.message}`)
      }
    }

    const cert = verificationResult?.signature?.certificate ?? {}
    const predicate = verificationResult?.statement?.predicate ?? {}
    const runInvocationUri = cert.runInvocationURI ?? predicate?.runDetails?.metadata?.invocationId ?? null
    const result = {
      schemaVersion: 'echo.native-platform.rc1-attestation.v1',
      status: errors.length === 0 ? 'passed' : 'failed',
      generatedAt: new Date().toISOString(),
      sourceRepo: repoFullName,
      releaseTag: product.releaseTag,
      releaseUrl: product.provenance?.githubReleaseUrl ?? `https://github.com/${repoFullName}/releases/tag/${product.releaseTag}`,
      productCommitSha: product.commitSha,
      archive: {
        file: archiveArtifact.file,
        url: archiveArtifact.url,
        source: archive.source,
        size: archiveArtifact.size,
        sha256: archiveSha256,
      },
      workflowRun,
      verification: {
        action: 'gh attestation verify',
        ghExecutable: args.gh,
        predicateType: verificationResult?.statement?.predicateType ?? null,
        signerWorkflow,
        workflowPath,
        sourceRef,
        sourceRepositoryDigest: cert.sourceRepositoryDigest ?? null,
        buildSignerDigest: cert.buildSignerDigest ?? null,
        workflowTrigger: cert.githubWorkflowTrigger ?? null,
        runnerEnvironment: cert.runnerEnvironment ?? null,
        sourceRepositoryVisibilityAtSigning: cert.sourceRepositoryVisibilityAtSigning ?? null,
        runInvocationUri,
        verifiedTimestamp: verifiedTimestamps[0]?.timestamp ?? null,
        subjectCount: verifiedSubjects.length,
        verifiedSubjectSha256: expectedSubjectSha256,
      },
      releaseAssetVerifier: {
        action: 'gh release verify-asset',
        status: releaseAssetResult.status === 0 ? 'passed' : 'not-available',
        exitCode: releaseAssetResult.status,
        reason: releaseAssetResult.status === 0
          ? 'gh release verify-asset verified this asset.'
          : firstLine(releaseAssetResult.stderr || releaseAssetResult.stdout || 'gh release verify-asset did not return a matching release asset attestation.'),
      },
      verifiedSubjects,
      remainingHardGates: [
        'launcher-install-first-launch-diagnostics-repair-rollback',
        'real-native-pack-gameplay-smoke',
        'stable-catalog-metadata-without-warning-blocked-alpha',
      ],
      errors,
    }

    const outPath = path.resolve(args.root, args.out)
    await writeJson(outPath, result)
    console.log(`${result.status}: wrote ${path.relative(args.root, outPath).replace(/\\/g, '/')}`)
    if (errors.length) process.exitCode = 1
  } finally {
    if (archive.cleanupDir && !args.keepTmp) await fs.rm(archive.cleanupDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
