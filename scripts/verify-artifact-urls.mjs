import https from 'node:https'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const args = { root: process.cwd(), all: false, timeoutMs: 15000 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--all') args.all = true
    else if (arg === '--timeout-ms') args.timeoutMs = Number.parseInt(argv[++index], 10)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs <= 0) throw new Error('--timeout-ms must be a positive integer')
  return args
}

const args = parseArgs(process.argv.slice(2))
const entryDirs = ['products', 'modpacks', 'modules', 'addons']

function rel(filePath) {
  return path.relative(args.root, filePath).replace(/\\/g, '/')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function jsonFiles(dir) {
  const absolute = path.join(args.root, dir)
  const out = []
  try {
    for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
      const full = path.join(absolute, entry.name)
      if (entry.isDirectory()) out.push(...await jsonFiles(path.relative(args.root, full)))
      else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.schema.json')) out.push(full)
    }
  } catch {
    return []
  }
  return out
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit))
    return
  }
  if (!value || typeof value !== 'object') return
  visit(value)
  Object.values(value).forEach((item) => walk(item, visit))
}

function artifactRecords(entry, filePath) {
  const records = []
  walk(entry.artifacts, (node) => {
    if (!node.url) return
    records.push({
      entryId: entry.id,
      validation: entry.validation,
      filePath,
      name: String(node.file ?? node.name ?? node.filename ?? '(unnamed)'),
      url: String(node.url),
    })
  })
  return records
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const request = https.request(url, { method: 'HEAD', headers: { 'user-agent': 'echo-release-index' } }, (response) => {
      const statusCode = response.statusCode ?? 0
      response.resume()
      resolve({
        ok: statusCode >= 200 && statusCode < 400,
        statusCode,
      })
    })
    request.setTimeout(args.timeoutMs, () => {
      request.destroy()
      resolve({ ok: false, statusCode: 0, error: 'timeout' })
    })
    request.on('error', (error) => resolve({ ok: false, statusCode: 0, error: error.message }))
    request.end()
  })
}

const records = []
for (const dir of entryDirs) {
  for (const filePath of await jsonFiles(dir)) {
    const payload = await readJson(filePath)
    const rows = Array.isArray(payload) ? payload : [payload]
    for (const entry of rows) {
      if (!args.all && entry.validation !== 'approved') continue
      records.push(...artifactRecords(entry, filePath))
    }
  }
}

const errors = []
for (const record of records) {
  if (!/^https:\/\/(github\.com|raw\.githubusercontent\.com)\//.test(record.url)) {
    errors.push(`${rel(record.filePath)} ${record.entryId} ${record.name} has non-GitHub URL ${record.url}`)
    continue
  }
  const result = await checkUrl(record.url)
  if (!result.ok) {
    errors.push(`${rel(record.filePath)} ${record.entryId} ${record.name} URL returned ${result.statusCode || result.error}: ${record.url}`)
  }
}

if (errors.length) {
  console.error(`Release Index artifact URL verification failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Release Index artifact URL verification passed for ${records.length} ${args.all ? 'indexed' : 'approved'} artifact URL(s).`)
