#!/usr/bin/env node
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { performance } from 'node:perf_hooks'
import { inflateRawSync } from 'node:zlib'

const PACK_ID = 'ashfall-standalone-engine-edition'
const ENGINE_RUNTIME_ID = 'echo-standalone-engine'
const ENGINE_VERSION = '2.0.0-beta.2'

const DEFAULT_RUNTIME_TASKS = [
  {
    task: 'runStandaloneContentGraphLoadSmoke',
    report: 'reports/echo/standalone/content-graph-load.json',
    evidenceKind: 'contentGraph',
    extraArgs: ['-PechoModulesRepoRoot={modulesRoot}'],
  },
  {
    task: 'runStandalonePlayableVoxelSaveSmoke',
    report: 'reports/echo/standalone/playable-voxel-save.json',
    evidenceKind: 'saveLoad',
    extraArgs: [],
  },
]

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    out: path.resolve(process.cwd(), 'release-readiness', 'standalone-engine-runtime-comparison.json'),
    cacheRoot: path.resolve(process.cwd(), 'tmp', 'standalone-engine-runtime-comparison'),
    runtimeRoot: path.resolve(process.cwd(), '..', 'ECHO-Standalone-Runtime'),
    modulesRoot: path.resolve(process.cwd(), '..', 'ECHO-Modules'),
    java: 'java',
    engineRuns: 3,
    timeoutMs: 900_000,
    clean: false,
    skipEngine: false,
    skipRuntime: false,
    runtimeBlocker: null,
    runtimeTasks: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--cache-root') args.cacheRoot = path.resolve(next())
    else if (arg === '--runtime-root') args.runtimeRoot = path.resolve(next())
    else if (arg === '--modules-root') args.modulesRoot = path.resolve(next())
    else if (arg === '--java') args.java = next()
    else if (arg === '--engine-runs') args.engineRuns = positiveInteger(next(), arg)
    else if (arg === '--timeout-ms') args.timeoutMs = positiveInteger(next(), arg)
    else if (arg === '--runtime-task') args.runtimeTasks.push(parseRuntimeTask(next()))
    else if (arg === '--runtime-blocker') args.runtimeBlocker = next()
    else if (arg === '--clean') args.clean = true
    else if (arg === '--skip-engine') args.skipEngine = true
    else if (arg === '--skip-runtime') args.skipRuntime = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (args.runtimeTasks.length === 0) args.runtimeTasks = DEFAULT_RUNTIME_TASKS
  if (args.skipEngine && args.skipRuntime) throw new Error('At least one lane must run.')
  return args
}

function positiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`)
  return parsed
}

function parseRuntimeTask(value) {
  const [task, report = ''] = value.split('=')
  if (!task) throw new Error('--runtime-task requires a Gradle task name.')
  const known = DEFAULT_RUNTIME_TASKS.find((item) => item.task === task)
  return {
    task,
    report: report || known?.report || '',
    evidenceKind: known?.evidenceKind || 'custom',
    extraArgs: known?.extraArgs || [],
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function normalizedPath(value) {
  return String(value ?? '').replace(/\\/g, '/')
}

function assertGitHubUrl(url, label) {
  assert(/^https:\/\/github\.com\/knoxhack\//u.test(String(url ?? '')), `${label} must use a public GitHub URL, got ${url ?? '(missing)'}.`)
}

async function downloadArtifact(args, artifact, label) {
  assert(artifact?.file, `${label} is missing file.`)
  assert(artifact?.url, `${label} is missing URL.`)
  assertGitHubUrl(artifact.url, label)
  assert(/^[a-f0-9]{64}$/iu.test(String(artifact.sha256 ?? '')), `${label} has invalid sha256.`)
  assert(Number.isFinite(Number(artifact.size)) && Number(artifact.size) > 0, `${label} has invalid size.`)

  const target = path.join(args.cacheRoot, 'downloads', artifact.file)
  let bytes = null
  let reused = false
  if (await exists(target)) {
    const cached = await fs.readFile(target)
    if (cached.length === Number(artifact.size) && sha256Bytes(cached) === String(artifact.sha256).toLowerCase()) {
      bytes = cached
      reused = true
    }
  }
  if (!bytes) {
    const response = await fetch(artifact.url, {
      headers: { 'user-agent': 'echo-standalone-engine-runtime-comparison' },
    })
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}: ${artifact.url}`)
    bytes = Buffer.from(await response.arrayBuffer())
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, bytes)
  }

  const actualSha = sha256Bytes(bytes)
  assert(actualSha === String(artifact.sha256).toLowerCase(), `${label} SHA-256 mismatch: ${actualSha} != ${artifact.sha256}.`)
  assert(bytes.length === Number(artifact.size), `${label} size mismatch: ${bytes.length} != ${artifact.size}.`)
  return {
    role: label,
    file: artifact.file,
    url: artifact.url,
    sha256: actualSha,
    size: bytes.length,
    cachePath: target,
    reused,
  }
}

function readZipEntries(zipBytes) {
  const minEocdSize = 22
  const maxCommentSize = 0xffff
  const start = Math.max(0, zipBytes.length - minEocdSize - maxCommentSize)
  let eocd = -1
  for (let offset = zipBytes.length - minEocdSize; offset >= start; offset -= 1) {
    if (zipBytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  assert(eocd >= 0, 'Pack ZIP does not contain an end-of-central-directory record.')
  const entryCount = zipBytes.readUInt16LE(eocd + 10)
  let cursor = zipBytes.readUInt32LE(eocd + 16)
  const entries = new Map()
  for (let index = 0; index < entryCount; index += 1) {
    assert(zipBytes.readUInt32LE(cursor) === 0x02014b50, `Invalid central directory header at ${cursor}.`)
    const method = zipBytes.readUInt16LE(cursor + 10)
    const compressedSize = zipBytes.readUInt32LE(cursor + 20)
    const uncompressedSize = zipBytes.readUInt32LE(cursor + 24)
    const nameLength = zipBytes.readUInt16LE(cursor + 28)
    const extraLength = zipBytes.readUInt16LE(cursor + 30)
    const commentLength = zipBytes.readUInt16LE(cursor + 32)
    const localOffset = zipBytes.readUInt32LE(cursor + 42)
    const name = normalizedPath(zipBytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'))
    entries.set(name, {
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      directory: name.endsWith('/'),
    })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return { bytes: zipBytes, entries }
}

function zipEntryData(zip, name) {
  const entry = zip.entries.get(normalizedPath(name))
  assert(entry && !entry.directory, `Pack ZIP missing ${name}.`)
  const cursor = entry.localOffset
  assert(zip.bytes.readUInt32LE(cursor) === 0x04034b50, `Invalid local file header for ${name}.`)
  const nameLength = zip.bytes.readUInt16LE(cursor + 26)
  const extraLength = zip.bytes.readUInt16LE(cursor + 28)
  const dataStart = cursor + 30 + nameLength + extraLength
  const compressed = zip.bytes.subarray(dataStart, dataStart + entry.compressedSize)
  let data
  if (entry.method === 0) data = Buffer.from(compressed)
  else if (entry.method === 8) data = Buffer.from(inflateRawSync(compressed))
  else throw new Error(`${name} uses unsupported ZIP compression method ${entry.method}.`)
  assert(data.length === entry.uncompressedSize, `${name} uncompressed size mismatch in ZIP.`)
  return data
}

function detectZipRoot(zip, manifest) {
  const firstPath = normalizedPath(manifest.files?.[0]?.path)
  assert(firstPath, 'Pack manifest has no files.')
  if (zip.entries.has(firstPath)) return ''
  const suffix = `/${firstPath}`
  const entry = [...zip.entries.values()].find((item) => !item.directory && item.name.endsWith(suffix))
  assert(entry, `Could not locate ${firstPath} in pack ZIP.`)
  return entry.name.slice(0, -suffix.length)
}

function zipEntryBytes(zip, root, filePath) {
  const entryName = root ? `${root}/${normalizedPath(filePath)}` : normalizedPath(filePath)
  return zipEntryData(zip, entryName)
}

async function extractPackZip(args, zipPath, manifest) {
  const installRoot = path.join(args.cacheRoot, 'engine-install')
  await fs.rm(installRoot, { recursive: true, force: true })
  await fs.mkdir(installRoot, { recursive: true })

  const zip = readZipEntries(readFileSync(zipPath))
  const root = detectZipRoot(zip, manifest)
  for (const entry of zip.entries.values()) {
    if (entry.directory) continue
    const normalized = normalizedPath(entry.name)
    if (root && !normalized.startsWith(`${root}/`)) continue
    const relative = root ? normalized.slice(root.length + 1) : normalized
    if (!relative) continue
    const bytes = zipEntryData(zip, normalized)
    const target = path.join(installRoot, ...relative.split('/'))
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, bytes)
  }

  const verified = []
  for (const file of manifest.files ?? []) {
    const target = path.join(installRoot, ...normalizedPath(file.path).split('/'))
    const bytes = await fs.readFile(target)
    const actualSha = sha256Bytes(bytes)
    assert(actualSha === String(file.sha256).toLowerCase(), `${file.path} SHA-256 mismatch after extraction.`)
    assert(bytes.length === Number(file.size), `${file.path} size mismatch after extraction.`)
    verified.push(file.path)
  }
  const contentGraphEvidence = JSON.parse(
    zipEntryBytes(zip, root, 'content-graph-evidence.json').toString('utf8'),
  )
  assert(contentGraphEvidence.status === 'PASS', `content-graph-evidence.json status is ${contentGraphEvidence.status ?? '(missing)'}, expected PASS.`)
  return { installRoot, zipRoot: root, verifiedFiles: verified, contentGraphEvidence }
}

async function commandText(command, args, options = {}) {
  const result = await runMeasured({
    command,
    args,
    cwd: options.cwd || process.cwd(),
    timeoutMs: options.timeoutMs || 60_000,
    logPath: options.logPath || null,
    collectMemory: false,
  })
  const text = `${result.stdout}\n${result.stderr}`.trim()
  return { ...result, text }
}

async function readGitState(root) {
  const head = await commandText('git', ['rev-parse', 'HEAD'], { cwd: root }).catch((error) => ({ text: null, error: String(error.message ?? error) }))
  const status = await commandText('git', ['status', '--porcelain=v1'], { cwd: root }).catch((error) => ({ text: null, error: String(error.message ?? error) }))
  return {
    root,
    head: head.text || null,
    dirty: Boolean(status.text),
    dirtyFiles: status.text ? status.text.split(/\r?\n/u).filter(Boolean) : [],
    errors: [head.error, status.error].filter(Boolean),
  }
}

async function runMeasured({ command, args, cwd, timeoutMs, logPath, collectMemory = true }) {
  const startedAt = new Date().toISOString()
  const start = performance.now()
  let stdout = ''
  let stderr = ''
  let timedOut = false
  let peakWorkingSetBytes = null
  let memorySamples = 0
  let memoryCollectionError = null
  let sampling = false

  const child = spawn(command, args, {
    cwd,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const sample = async () => {
    if (!collectMemory || !child.pid) return
    if (sampling) return
    sampling = true
    try {
      const bytes = await workingSetBytes(child.pid)
      if (Number.isFinite(bytes) && bytes > 0) {
        memorySamples += 1
        peakWorkingSetBytes = Math.max(peakWorkingSetBytes ?? 0, bytes)
      }
    } catch (error) {
      memoryCollectionError ||= String(error.message ?? error)
    } finally {
      sampling = false
    }
  }

  await sample()
  const sampler = collectMemory ? setInterval(() => { void sample() }, 500) : null
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
  }, timeoutMs)

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8')
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })

  const exit = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal }))
  })
  clearTimeout(timeout)
  if (sampler) clearInterval(sampler)
  await sample()

  const durationMs = Math.round(performance.now() - start)
  const completedAt = new Date().toISOString()
  const result = {
    command: [command, ...args],
    cwd,
    startedAt,
    completedAt,
    durationMs,
    exitCode: typeof exit.code === 'number' ? exit.code : null,
    signal: exit.signal || null,
    timedOut,
    peakWorkingSetBytes,
    memorySamples,
    memoryCollectionError,
    stdout,
    stderr,
  }

  if (logPath) {
    await fs.mkdir(path.dirname(logPath), { recursive: true })
    await fs.writeFile(
      logPath,
      [
        `# command`,
        [command, ...args].join(' '),
        ``,
        `# cwd`,
        cwd,
        ``,
        `# exit`,
        JSON.stringify({ exitCode: result.exitCode, signal: result.signal, timedOut, durationMs }),
        ``,
        `# stdout`,
        stdout,
        ``,
        `# stderr`,
        stderr,
      ].join('\n'),
      'utf8',
    )
  }
  return result
}

async function workingSetBytes(pid) {
  if (process.platform === 'win32') {
    const script = `try { (Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet64 } catch { "" }`
    const result = await runTiny('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 2_000)
    const value = Number(result.trim())
    return Number.isFinite(value) ? value : null
  }

  const statusPath = `/proc/${pid}/status`
  const status = await fs.readFile(statusPath, 'utf8')
  const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/mu)
  return match ? Number(match[1]) * 1024 : null
}

async function runTiny(command, args, timeoutMs = 10_000) {
  let stdout = ''
  let stderr = ''
  const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
  }, timeoutMs)
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve(code))
  })
  clearTimeout(timeout)
  if (timedOut) throw new Error(`${command} timed out after ${timeoutMs}ms`)
  if (exitCode !== 0 && stderr.trim()) throw new Error(stderr.trim())
  return stdout
}

function tail(text, max = 4000) {
  const value = String(text ?? '')
  return value.length <= max ? value : value.slice(value.length - max)
}

async function runEngineLane(args, catalog) {
  const packArtifact = catalog.modpack.artifacts.pack
  const manifestArtifact = catalog.modpack.artifacts.manifest
  const packDownload = await downloadArtifact(args, packArtifact, 'engine-edition-pack')
  const manifestDownload = await downloadArtifact(args, manifestArtifact, 'engine-edition-manifest')
  const manifest = await readJson(manifestDownload.cachePath)
  assert((manifest.pack ?? manifest.id) === PACK_ID, `Manifest id is ${manifest.pack ?? manifest.id}, expected ${PACK_ID}.`)
  assert(manifest.loader === ENGINE_RUNTIME_ID, `Manifest loader is ${manifest.loader}, expected ${ENGINE_RUNTIME_ID}.`)
  assert(manifest.runtime?.requiredJava === '21+', `Manifest runtime.requiredJava is ${manifest.runtime?.requiredJava}, expected 21+.`)
  assert(manifest.artifactMode === 'zip', `Manifest artifactMode is ${manifest.artifactMode}, expected zip.`)
  assert(String(manifest.artifactSha256).toLowerCase() === packDownload.sha256, 'Manifest artifactSha256 does not match public pack ZIP.')
  assert(Number(manifest.artifactSize) === packDownload.size, 'Manifest artifactSize does not match public pack ZIP.')

  const extracted = await extractPackZip(args, packDownload.cachePath, manifest)
  const engineJarFile = catalog.product.artifacts.engineJar?.file
    || manifest.files.find((file) => /^echo-standalone-engine-.+\.jar$/u.test(file.path))?.path
  assert(engineJarFile, 'Could not determine Engine JAR file.')
  const engineJar = path.join(extracted.installRoot, engineJarFile)
  assert(await exists(engineJar), `Engine JAR missing after extraction: ${engineJar}`)

  const javaVersion = await commandText(args.java, ['-version'], {
    cwd: extracted.installRoot,
    timeoutMs: 30_000,
  })
  const runs = []
  for (let index = 1; index <= args.engineRuns; index += 1) {
    const runRoot = path.join(args.cacheRoot, 'engine-runs', `run-${index}`)
    const saveRoot = path.join(runRoot, 'saves')
    await fs.rm(runRoot, { recursive: true, force: true })
    await fs.mkdir(saveRoot, { recursive: true })
    const logPath = path.join(runRoot, 'engine-headless-smoke.log')
    const result = await runMeasured({
      command: args.java,
      args: [
        '-Dfile.encoding=UTF-8',
        '-jar',
        engineJar,
        '--pack-root',
        extracted.installRoot,
        '--manifest',
        'pack.json',
        '--save-root',
        saveRoot,
        '--headless-smoke',
      ],
      cwd: extracted.installRoot,
      timeoutMs: args.timeoutMs,
      logPath,
    })
    const smokeReportPath = path.join(saveRoot, 'headless-smoke', 'headless-smoke-report.json')
    const smokeReport = await readJsonIfExists(smokeReportPath)
    runs.push({
      iteration: index,
      status: smokeReport?.status || (result.exitCode === 0 ? 'UNKNOWN' : 'FAIL'),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      peakWorkingSetBytes: result.peakWorkingSetBytes,
      memorySamples: result.memorySamples,
      memoryCollectionError: result.memoryCollectionError,
      logPath,
      smokeReportPath,
      smokeReport: summarizeEngineSmoke(smokeReport),
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    })
  }

  return {
    id: ENGINE_RUNTIME_ID,
    packId: PACK_ID,
    version: ENGINE_VERSION,
    sourceRepo: catalog.product.sourceRepo,
    releaseTag: catalog.product.releaseTag,
    commitSha: catalog.product.commitSha,
    validation: catalog.product.validation,
    warningGated: catalog.product.validation === 'warning',
    downloads: [packDownload, manifestDownload].map(({ role, file, url, sha256, size, reused }) => ({ role, file, url, sha256, size, reused })),
    install: {
      root: extracted.installRoot,
      zipRoot: extracted.zipRoot,
      manifestFile: manifestDownload.file,
      verifiedFiles: extracted.verifiedFiles.length,
      moduleRequirements: manifest.moduleRequirements?.length ?? 0,
      engineJar,
      contentGraphEvidence: summarizeContentGraphEvidence(extracted.contentGraphEvidence),
    },
    java: {
      command: javaVersion.command,
      exitCode: javaVersion.exitCode,
      versionText: javaVersion.text,
    },
    runs,
    metrics: metricSummary(runs),
  }
}

function summarizeEngineSmoke(report) {
  if (!report) return null
  return {
    schema: report.schema,
    status: report.status,
    engineVersion: report.engineVersion,
    packId: report.packId,
    installedModules: report.installedModules,
    contentGraph: report.contentGraph ? {
      nodes: report.contentGraph.nodes,
      edges: report.contentGraph.edges,
      modules: report.contentGraph.modules,
      canonical: report.contentGraph.canonical,
      crossRuntimeParity: report.contentGraph.crossRuntimeParity,
      fingerprint: report.contentGraph.fingerprint,
    } : null,
    adapterCore: report.adapterCore ? {
      ready: report.adapterCore.ready,
      accepted: report.adapterCore.accepted,
      rejected: report.adapterCore.rejected,
      revoked: report.adapterCore.revoked,
      canonicalRuntimeBridge: report.adapterCore.canonicalRuntimeBridge,
    } : null,
    world: report.world ? {
      chunks: report.world.chunks,
      saveReload: report.world.saveReload,
      contentIdentityVerified: report.world.contentIdentityVerified,
      spawnedEntities: report.world.spawnedEntities,
    } : null,
  }
}

function summarizeContentGraphEvidence(evidence) {
  return {
    schemaVersion: evidence.schemaVersion,
    status: evidence.status,
    moduleCount: evidence.moduleCount,
    graphCount: evidence.graphCount,
    nodeCount: evidence.nodeCount,
    edgeCount: evidence.edgeCount,
    featureCount: evidence.featureCount,
    strictArtifacts: evidence.strictArtifacts,
    strictContentGraph: evidence.strictContentGraph,
    requireCrossRuntimeParity: evidence.requireCrossRuntimeParity,
  }
}

async function runRuntimeLane(args) {
  const gradle = path.join(args.runtimeRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
  assert(await exists(gradle), `Gradle wrapper not found at ${gradle}`)
  const git = await readGitState(args.runtimeRoot)
  const tasks = []

  for (const taskSpec of args.runtimeTasks) {
    const reportPath = taskSpec.report ? path.join(args.runtimeRoot, ...normalizedPath(taskSpec.report).split('/')) : null
    const beforeStat = reportPath ? await statIfExists(reportPath) : null
    const extraArgs = taskSpec.extraArgs.map((value) => value.replace('{modulesRoot}', args.modulesRoot))
    const commandArgs = ['--no-daemon', taskSpec.task, ...extraArgs]
    const spawned = gradleSpawn(gradle, commandArgs)
    const logPath = path.join(args.cacheRoot, 'runtime-runs', `${taskSpec.task}.log`)
    const result = await runMeasured({
      command: spawned.command,
      args: spawned.args,
      cwd: args.runtimeRoot,
      timeoutMs: args.timeoutMs,
      logPath,
    })
    const afterStat = reportPath ? await statIfExists(reportPath) : null
    const report = reportPath ? await readJsonIfExists(reportPath) : null
    tasks.push({
      task: taskSpec.task,
      evidenceKind: taskSpec.evidenceKind,
      gradleCommand: [gradle, ...commandArgs],
      command: result.command,
      cwd: result.cwd,
      status: report?.status || (result.exitCode === 0 ? 'UNKNOWN' : 'FAIL'),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      peakWorkingSetBytes: result.peakWorkingSetBytes,
      memorySamples: result.memorySamples,
      memoryCollectionError: result.memoryCollectionError,
      logPath,
      reportPath,
      reportFresh: Boolean(afterStat && (!beforeStat || afterStat.mtimeMs > beforeStat.mtimeMs)),
      reportModifiedAt: afterStat ? new Date(afterStat.mtimeMs).toISOString() : null,
      report: summarizeRuntimeReport(taskSpec.evidenceKind, report),
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    })
  }

  return {
    id: 'echo-standalone-runtime',
    sourceRepo: 'knoxhack/ECHO-Standalone-Runtime',
    git,
    root: args.runtimeRoot,
    modulesRoot: args.modulesRoot,
    tasks,
    metrics: metricSummary(tasks),
  }
}

async function blockedRuntimeLane(args, reason) {
  const git = await readGitState(args.runtimeRoot)
  return {
    id: 'echo-standalone-runtime',
    sourceRepo: 'knoxhack/ECHO-Standalone-Runtime',
    root: args.runtimeRoot,
    modulesRoot: args.modulesRoot,
    blocked: true,
    blocker: reason,
    git,
    tasks: args.runtimeTasks.map((taskSpec) => ({
      task: taskSpec.task,
      evidenceKind: taskSpec.evidenceKind,
      status: 'BLOCKED',
      reportPath: taskSpec.report ? path.join(args.runtimeRoot, ...normalizedPath(taskSpec.report).split('/')) : null,
      report: null,
      blocker: reason,
    })),
    metrics: {
      attempts: 0,
      passes: 0,
      failures: 0,
      durationMs: null,
      peakWorkingSetBytes: null,
      memorySamples: 0,
    },
  }
}

function gradleSpawn(gradle, args) {
  if (process.platform === 'win32' && /\.(bat|cmd)$/iu.test(gradle)) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `"${gradle}"`, ...args],
    }
  }
  return { command: gradle, args }
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath)
  } catch {
    return null
  }
}

function summarizeRuntimeReport(kind, report) {
  if (!report) return null
  if (kind === 'contentGraph') {
    return {
      schema: report.schema,
      evidenceSchemaVersion: report.evidenceSchemaVersion,
      status: report.status,
      graphs: report.graphs,
      moduleCount: report.moduleCount,
      nodes: report.nodes,
      edges: report.edges,
      features: report.features,
      exportPlans: report.exportPlans,
      diagnostics: report.diagnostics,
      checked: report.checked,
      failures: report.failures,
      canonicalEvidence: report.canonicalEvidence,
      canonicalEvidencePath: report.canonicalEvidencePath,
    }
  }
  if (kind === 'saveLoad') {
    return {
      schema: report.schema,
      status: report.status,
      filesWritten: report.filesWritten,
      worldEdits: report.worldEdits,
      player: report.player,
      hotbar: report.hotbar,
      mission: report.mission,
      midRouteSaveLoadReady: report.midRouteSaveLoadReady,
      restoredRenderChecksum: report.restoredRenderChecksum,
      contractBacked: report.contractBacked,
      contractVersioned: report.contractVersioned,
    }
  }
  return {
    schema: report.schema,
    status: report.status,
  }
}

function metricSummary(runs) {
  const durations = runs.map((run) => run.durationMs).filter((value) => Number.isFinite(value))
  const memory = runs.map((run) => run.peakWorkingSetBytes).filter((value) => Number.isFinite(value))
  return {
    attempts: runs.length,
    passes: runs.filter((run) => run.exitCode === 0 && (run.status === 'PASS' || run.status === 'UNKNOWN')).length,
    failures: runs.filter((run) => run.exitCode !== 0 || run.status === 'FAIL').length,
    durationMs: summarizeNumbers(durations),
    peakWorkingSetBytes: summarizeNumbers(memory),
    memorySamples: runs.reduce((sum, run) => sum + Number(run.memorySamples || 0), 0),
  }
}

function summarizeNumbers(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((total, value) => total + value, 0)
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(sum / sorted.length),
    median: sorted[Math.floor(sorted.length / 2)],
    samples: sorted.length,
  }
}

function buildComparison(engine, runtime) {
  const blockers = [
    'Engine Edition remains warning-gated and does not claim full Ashfall gameplay parity.',
    'Engine smoke is a public packaged headless run; legacy Runtime timings are Gradle task smoke timings and include Gradle/testkit startup overhead.',
    'Replacement requires broader gameplay evidence, repeated performance runs, and user-facing first-launch/open-play proof.',
  ]
  if (runtime?.git?.dirty) {
    blockers.push('Legacy Standalone Runtime worktree was dirty during this comparison; results are evidence for the current local state, not a pristine release commit.')
  }
  if (!engine) blockers.push('Engine lane was skipped.')
  if (!runtime) blockers.push('Legacy Standalone Runtime lane was skipped.')
  if (runtime?.blocked) blockers.push(`Legacy Standalone Runtime lane was blocked: ${runtime.blocker}`)

  return {
    comparisonStatus: 'not_directly_comparable',
    replacementDecision: 'BLOCKED',
    startupTime: {
      engineHeadlessSmokeProcessMs: engine?.metrics?.durationMs ?? null,
      legacyRuntimeGradleTaskMs: runtime?.metrics?.durationMs ?? null,
      note: 'These values are useful trend evidence but not an apples-to-apples process startup benchmark.',
    },
    memoryUse: {
      enginePeakWorkingSetBytes: engine?.metrics?.peakWorkingSetBytes ?? null,
      legacyRuntimeGradlePeakWorkingSetBytes: runtime?.metrics?.peakWorkingSetBytes ?? null,
      note: 'Memory samples track the primary launched process only. Gradle may spawn child JVMs that are not fully represented.',
    },
    contentGraphLoad: {
      engine: firstEngineContentGraph(engine),
      legacyRuntime: firstRuntimeReport(runtime, 'contentGraph'),
    },
    saveLoadBehavior: {
      engine: firstEngineSaveLoad(engine),
      legacyRuntime: firstRuntimeReport(runtime, 'saveLoad'),
    },
    launchFailureRate: {
      engine: failureRate(engine?.metrics),
      legacyRuntime: failureRate(runtime?.metrics),
    },
    blockers,
  }
}

function firstEngineContentGraph(engine) {
  const smoke = engine?.runs?.find((run) => run.smokeReport?.contentGraph)?.smokeReport?.contentGraph
  return smoke || engine?.install?.contentGraphEvidence || null
}

function firstEngineSaveLoad(engine) {
  const world = engine?.runs?.find((run) => run.smokeReport?.world)?.smokeReport?.world
  return world ? {
    saveReload: world.saveReload,
    contentIdentityVerified: world.contentIdentityVerified,
    chunks: world.chunks,
    spawnedEntities: world.spawnedEntities,
  } : null
}

function firstRuntimeReport(runtime, kind) {
  return runtime?.tasks?.find((task) => task.evidenceKind === kind)?.report || null
}

function failureRate(metrics) {
  if (!metrics || !metrics.attempts) return null
  return {
    failures: metrics.failures,
    attempts: metrics.attempts,
    rate: metrics.failures / metrics.attempts,
  }
}

function laneGate(lane) {
  if (!lane) return 'skipped'
  if (!lane.metrics?.attempts) return 'incomplete'
  return lane.metrics.failures === 0 ? 'passed' : 'failed'
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.clean) await fs.rm(args.cacheRoot, { recursive: true, force: true })
  await fs.mkdir(args.cacheRoot, { recursive: true })

  const product = await readJson(path.join(args.root, 'products', 'standalone-engine.json'))
  const modpack = await readJson(path.join(args.root, 'modpacks', 'ashfall-standalone-engine.json'))
  assert(product.id === ENGINE_RUNTIME_ID, `Runtime product id is ${product.id}, expected ${ENGINE_RUNTIME_ID}.`)
  assert(modpack.id === PACK_ID, `Modpack id is ${modpack.id}, expected ${PACK_ID}.`)
  assert(product.version === ENGINE_VERSION && modpack.version === ENGINE_VERSION, 'Engine product and modpack versions must stay aligned.')
  assert(product.validation === 'warning' && modpack.validation === 'warning', 'Engine comparison must remain warning-gated.')

  const releaseIndexGit = await readGitState(args.root)
  const engine = args.skipEngine ? null : await runEngineLane(args, { product, modpack })
  const runtime = args.skipRuntime
    ? null
    : args.runtimeBlocker
      ? await blockedRuntimeLane(args, args.runtimeBlocker)
      : await runRuntimeLane(args)
  const comparison = buildComparison(engine, runtime)
  const report = {
    schemaVersion: 'echo.standalone_engine.runtime_comparison.v1',
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/benchmark-standalone-engine-runtime-comparison.mjs',
    ok: Boolean(
      (engine ? engine.metrics.attempts > 0 && engine.metrics.failures === 0 : true)
      && (runtime ? !runtime.blocked && runtime.metrics.attempts > 0 && runtime.metrics.failures === 0 : true),
    ),
    environment: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      node: process.version,
    },
    releaseIndex: releaseIndexGit,
    inputs: {
      root: args.root,
      cacheRoot: args.cacheRoot,
      runtimeRoot: args.runtimeRoot,
      modulesRoot: args.modulesRoot,
      engineRuns: args.engineRuns,
      timeoutMs: args.timeoutMs,
      runtimeTasks: args.runtimeTasks.map(({ task, report, evidenceKind }) => ({ task, report, evidenceKind })),
    },
    lanes: {
      standaloneEngine: engine,
      legacyStandaloneRuntime: runtime,
    },
    comparison,
    gates: {
      publicEngineAssets: engine ? 'passed' : 'skipped',
      engineHeadlessSmoke: laneGate(engine),
      legacyRuntimeSmoke: runtime?.blocked ? 'blocked' : laneGate(runtime),
      contentGraphEvidence: engine?.install?.contentGraphEvidence?.status === 'PASS' && firstRuntimeReport(runtime, 'contentGraph')?.status === 'PASS'
        ? 'passed'
        : 'incomplete',
      saveLoadEvidence: firstEngineSaveLoad(engine)?.saveReload === true && firstRuntimeReport(runtime, 'saveLoad')?.status === 'PASS'
        ? 'passed'
        : 'incomplete',
      replacement: 'blocked',
    },
  }

  await writeJson(args.out, report)
  console.log(`Standalone Engine vs Runtime comparison written: ${args.out}`)
  if (!report.ok) {
    console.log('Comparison recorded lane failures; replacement remains blocked.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
