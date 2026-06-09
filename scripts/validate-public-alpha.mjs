import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const args = { root: process.cwd() }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const root = args.root
const scanDirs = ['channels/alpha', 'products', 'packs', 'modpacks', 'modules']
const releaseUrlPattern = /^https:\/\/github\.com\/knoxhack\/[A-Za-z0-9_.-]+\/releases\/(?:tag|download)\/[^/\s]+(?:\/[^\s]+)?$/
const errors = []

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function jsonFiles(dir) {
  const absolute = path.join(root, dir)
  if (!fs.existsSync(absolute)) return []
  const out = []
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const full = path.join(absolute, entry.name)
    if (entry.isDirectory()) out.push(...jsonFiles(path.relative(root, full)))
    else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.schema.json')) out.push(full)
  }
  return out
}

function walk(value, visitor, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...pathParts, String(index)]))
    return
  }
  if (!value || typeof value !== 'object') return
  visitor(value, pathParts)
  for (const [key, item] of Object.entries(value)) {
    walk(item, visitor, [...pathParts, key])
  }
}

function validateString(filePath, value, jsonPath) {
  if (/untagged-[a-f0-9]+/i.test(value)) {
    errors.push(`${rel(filePath)} ${jsonPath} contains raw untagged release metadata`)
  }
  if (value.includes('/releases/tag/') || value.includes('/releases/download/')) {
    if (!releaseUrlPattern.test(value)) {
      errors.push(`${rel(filePath)} ${jsonPath} must use a GitHub HTTPS release URL`)
    }
  }
}

for (const filePath of scanDirs.flatMap(jsonFiles)) {
  let payload
  try {
    payload = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    errors.push(`${rel(filePath)} is invalid JSON: ${error.message}`)
    continue
  }

  walk(payload, (node, pathParts) => {
    for (const [key, value] of Object.entries(node)) {
      const jsonPath = [...pathParts, key].join('.') || key
      if (key === 'private' && value === true) errors.push(`${rel(filePath)} ${jsonPath} must be false for public alpha`)
      if (key === 'draft' && value === true) errors.push(`${rel(filePath)} ${jsonPath} must be false for public alpha`)
      if (typeof value === 'string') validateString(filePath, value, jsonPath)
    }
  })
}

if (errors.length > 0) {
  console.error(`Public alpha validation failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Public alpha metadata validation passed.')
