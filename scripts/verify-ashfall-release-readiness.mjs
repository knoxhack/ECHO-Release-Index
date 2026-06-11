#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_MANIFEST = 'release-readiness/ashfall-native-public-alpha.json'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
]
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    workspaceRoot: null,
    manifest: DEFAULT_MANIFEST,
    requireReleaseReady: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--workspace-root') args.workspaceRoot = path.resolve(argv[++index])
    else if (arg === '--manifest') args.manifest = argv[++index]
    else if (arg === '--require-release-ready') args.requireReleaseReady = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.workspaceRoot) args.workspaceRoot = path.resolve(args.root, '..')
  return args
}

function usage() {
  return `Usage: node scripts/verify-ashfall-release-readiness.mjs [options]

Checks the full Ashfall Native release evidence gate across Release Index metadata,
Native Platform beta/gameplay reports, Native Edition polish assets, and RC smoke evidence.

Options:
  --root <dir>                 Release Index repository root. Default: current directory.
  --workspace-root <dir>       Workspace containing sibling ECHO repos. Default: parent of --root.
  --manifest <path>            Readiness manifest path relative to --root, or absolute path.
  --require-release-ready      Fail on any missing or incomplete release evidence.
  --help                       Print this help text.
`
}

async function fileStatus(filePath) {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() ? 'file' : 'not-file'
  } catch {
    return 'missing'
  }
}

async function requireFile({ failures, label, target, value }) {
  const status = await fileStatus(target)
  if (status === 'file') return true
  const printableValue = value ?? target
  failures.push(status === 'missing'
    ? `${label} target does not exist: ${printableValue}`
    : `${label} target is not a file: ${printableValue}`)
  return false
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function sourceRoot(args, source) {
  if (source === 'release-index') return args.root
  if (source === 'modules') return path.join(args.workspaceRoot, 'ECHO-Modules')
  if (source === 'native-platform') return path.join(args.workspaceRoot, 'ECHO-Native-Platform')
  if (source === 'ashfall-native') return path.join(args.workspaceRoot, 'ECHO-Ashfall-Native-Edition')
  throw new Error(`Unsupported readiness source: ${source}`)
}

function checkPath(root, check) {
  return path.resolve(sourceRoot(root.args, check.source), check.path)
}

function getPath(value, pointer) {
  if (!pointer) return value
  return String(pointer).split('.').reduce((current, part) => {
    if (current === undefined || current === null) return undefined
    if (/^\d+$/u.test(part) && Array.isArray(current)) return current[Number(part)]
    return current[part]
  }, value)
}

function printable(value) {
  return value === undefined ? '(missing)' : JSON.stringify(value)
}

function missingPathValue(value) {
  return value == null || value === ''
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function matchesPattern(value, pattern) {
  return new RegExp(pattern, 'u').test(String(value ?? ''))
}

function urlBasename(value) {
  try {
    const parsed = new URL(String(value))
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length === 0) return null
    return decodeURIComponent(parts.at(-1))
  } catch {
    return null
  }
}

function pathBasename(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  return path.posix.basename(value.replace(/\\/g, '/'))
}

function parseIsoTimestamp(value) {
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value)) return null
  const millis = Date.parse(value)
  return Number.isFinite(millis) ? millis : null
}

function matchesItemWhere(item, expectation) {
  if (expectation.whereItemPath === undefined) return true
  const value = getPath(item, expectation.whereItemPath)
  if (expectation.whereItemEquals !== undefined && value !== expectation.whereItemEquals) return false
  if (expectation.whereItemMatches !== undefined && !matchesPattern(value, expectation.whereItemMatches)) return false
  return true
}

function resolveSourceRelativePath(args, check, value) {
  if (typeof value !== 'string' || value.trim() === '' || path.isAbsolute(value)) {
    return { error: 'relative-file-path' }
  }

  const sourceBase = path.resolve(sourceRoot(args, check.source))
  const target = path.resolve(sourceBase, value)
  const relative = path.relative(sourceBase, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { error: 'outside-source', sourceBase, target }
  }

  return { sourceBase, target }
}

async function shouldSkipWhenFileMissing({ args, check, payload, expectation }) {
  if (!expectation.skipWhenFileMissing) return false
  const value = getPath(payload, expectation.skipWhenFileMissing)
  if (missingPathValue(value)) return true
  const resolved = resolveSourceRelativePath(args, check, value)
  if (resolved.error) return false
  return (await fileStatus(resolved.target)) !== 'file'
}

async function isPngFile(filePath) {
  const handle = await fs.open(filePath, 'r')
  try {
    const signature = Buffer.alloc(PNG_SIGNATURE.length)
    const result = await handle.read(signature, 0, signature.length, 0)
    return result.bytesRead === PNG_SIGNATURE.length && signature.equals(PNG_SIGNATURE)
  } finally {
    await handle.close()
  }
}

async function isZipFile(filePath) {
  const handle = await fs.open(filePath, 'r')
  try {
    const signature = Buffer.alloc(4)
    const result = await handle.read(signature, 0, signature.length, 0)
    return result.bytesRead === signature.length && ZIP_SIGNATURES.some((expected) => signature.equals(expected))
  } finally {
    await handle.close()
  }
}

async function pngDimensions(filePath) {
  const handle = await fs.open(filePath, 'r')
  try {
    const header = Buffer.alloc(24)
    const result = await handle.read(header, 0, header.length, 0)
    if (result.bytesRead < header.length || !header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null
    if (header.subarray(12, 16).toString('ascii') !== 'IHDR') return null
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    }
  } finally {
    await handle.close()
  }
}

async function sha256File(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
}

async function fileSize(filePath) {
  return (await fs.stat(filePath)).size
}

function expectationLabel(expectation) {
  return expectation.label ?? expectation.path ?? expectation.arrayPath ?? '(expectation)'
}

async function readJsonFileExpectation({ args, check, expectation, failures }) {
  const label = expectationLabel(expectation)
  const resolved = resolveSourceRelativePath(args, check, expectation.jsonFilePath)
  if (resolved.error === 'relative-file-path') {
    failures.push(`${label} jsonFilePath must be a relative file path`)
    return null
  }
  if (resolved.error === 'outside-source') {
    failures.push(`${label} jsonFilePath points outside ${check.source}: ${expectation.jsonFilePath}`)
    return null
  }
  if (!(await requireFile({
    failures,
    label: `${label} jsonFilePath`,
    target: resolved.target,
    value: expectation.jsonFilePath,
  }))) {
    return null
  }
  try {
    return await readJson(resolved.target)
  } catch (error) {
    failures.push(`${label} jsonFilePath target is not valid JSON: ${expectation.jsonFilePath}: ${error.message}`)
    return null
  }
}

async function readJsonValueFileExpectation({ args, check, expectation, failures, value }) {
  const label = expectationLabel(expectation)
  const resolved = resolveSourceRelativePath(args, check, value)
  if (resolved.error === 'relative-file-path') {
    failures.push(`${label} must be a relative file path`)
    return null
  }
  if (resolved.error === 'outside-source') {
    failures.push(`${label} points outside ${check.source}: ${value}`)
    return null
  }
  if (!(await requireFile({
    failures,
    label,
    target: resolved.target,
    value,
  }))) {
    return null
  }
  try {
    return await readJson(resolved.target)
  } catch (error) {
    failures.push(`${label} target is not valid JSON: ${value}: ${error.message}`)
    return null
  }
}

async function validateExpectation({ args, check, sourceFile, payload, expectation }) {
  const failures = []
  const value = expectation.path ? getPath(payload, expectation.path) : undefined

  if (expectation.skipWhenPathMissing && missingPathValue(getPath(payload, expectation.skipWhenPathMissing))) return failures
  if (await shouldSkipWhenFileMissing({ args, check, payload, expectation })) return failures
  if (expectation.skipUnlessPath && expectation.skipUnlessOneOf && !expectation.skipUnlessOneOf.includes(getPath(payload, expectation.skipUnlessPath))) return failures

  if (expectation.exists === true && value === undefined) {
    failures.push(`${expectation.path} is missing`)
  }
  if (expectation.equals !== undefined && value !== expectation.equals) {
    failures.push(`${expectation.path} expected ${printable(expectation.equals)} but found ${printable(value)}`)
  }
  if (expectation.notEquals !== undefined && value === expectation.notEquals) {
    failures.push(`${expectation.path} must not equal ${printable(expectation.notEquals)}`)
  }
  if (expectation.oneOf && !expectation.oneOf.includes(value)) {
    failures.push(`${expectation.path} expected one of ${expectation.oneOf.map(printable).join(', ')} but found ${printable(value)}`)
  }
  if (expectation.matches && !matchesPattern(value, expectation.matches)) {
    failures.push(`${expectation.path} expected to match /${expectation.matches}/ but found ${printable(value)}`)
  }
  if (expectation.notMatches && matchesPattern(value, expectation.notMatches)) {
    failures.push(`${expectation.path} must not match /${expectation.notMatches}/ but found ${printable(value)}`)
  }
  if (expectation.isoTimestamp === true && parseIsoTimestamp(value) === null) {
    failures.push(`${expectation.path} must be an ISO-8601 UTC timestamp but found ${printable(value)}`)
  }
  if (expectation.timestampOnOrAfter !== undefined) {
    const valueMillis = parseIsoTimestamp(value)
    const expectedMillis = parseIsoTimestamp(expectation.timestampOnOrAfter)
    if (expectedMillis === null) {
      failures.push(`${expectation.path} has invalid timestampOnOrAfter expectation ${printable(expectation.timestampOnOrAfter)}`)
    } else if (valueMillis === null || valueMillis < expectedMillis) {
      failures.push(`${expectation.path} expected on or after ${expectation.timestampOnOrAfter} but found ${printable(value)}`)
    }
  }
  if (expectation.equalsJsonArrayItemValue === true) {
    const jsonPayload = await readJsonFileExpectation({ args, check, expectation, failures })
    if (jsonPayload) {
      const items = getPath(jsonPayload, expectation.jsonArrayPath)
      if (!Array.isArray(items)) {
        if (expectation.skipWhenArrayMissing !== true) {
          failures.push(`${expectation.path} ${expectation.jsonFilePath}:${expectation.jsonArrayPath} must be an array`)
        }
      } else {
        const matchValue = expectation.jsonArrayMatchValuePath
          ? getPath(payload, expectation.jsonArrayMatchValuePath)
          : expectation.jsonArrayMatchValue
        const matched = items.find((item) => getPath(item, expectation.jsonArrayMatchPath) === matchValue)
        if (!matched) {
          failures.push(`${expectation.path} could not find ${expectation.jsonFilePath}:${expectation.jsonArrayPath} item where ${expectation.jsonArrayMatchPath} is ${printable(matchValue)}`)
        } else {
          const expectedValue = getPath(matched, expectation.jsonArrayValuePath)
          if (value !== expectedValue) {
            failures.push(`${expectation.path} expected to match ${expectation.jsonFilePath}:${expectation.jsonArrayPath}.${expectation.jsonArrayValuePath} for ${printable(matchValue)}: expected ${printable(expectedValue)} but found ${printable(value)}`)
          }
        }
      }
    }
  }
  if (expectation.equalsJsonValue === true) {
    const jsonPayload = await readJsonFileExpectation({ args, check, expectation, failures })
    if (jsonPayload) {
      const expectedValue = getPath(jsonPayload, expectation.jsonValuePath)
      if (value !== expectedValue) {
        failures.push(`${expectation.path} expected to match ${expectation.jsonFilePath}:${expectation.jsonValuePath}: expected ${printable(expectedValue)} but found ${printable(value)}`)
      }
    }
  }
  if (expectation.equalsJsonValues === true) {
    const jsonPayload = await readJsonFileExpectation({ args, check, expectation, failures })
    if (jsonPayload) {
      for (const mapping of expectation.jsonValueMappings ?? []) {
        const actualValue = getPath(payload, mapping.path)
        const expectedValue = getPath(jsonPayload, mapping.jsonValuePath)
        if (!sameJsonValue(actualValue, expectedValue)) {
          failures.push(`${mapping.path} expected to match ${expectation.jsonFilePath}:${mapping.jsonValuePath}: expected ${printable(expectedValue)} but found ${printable(actualValue)}`)
        }
      }
    }
  }
  if (expectation.atLeast !== undefined && !(Number(value) >= expectation.atLeast)) {
    failures.push(`${expectation.path} expected >= ${expectation.atLeast} but found ${printable(value)}`)
  }
  if (expectation.minItems !== undefined && !(Array.isArray(value) && value.length >= expectation.minItems)) {
    failures.push(`${expectation.path} expected at least ${expectation.minItems} item(s) but found ${Array.isArray(value) ? value.length : printable(value)}`)
  }
  if (expectation.maxItems !== undefined && !(Array.isArray(value) && value.length <= expectation.maxItems)) {
    failures.push(`${expectation.path} expected at most ${expectation.maxItems} item(s) but found ${Array.isArray(value) ? value.length : printable(value)}`)
  }
  if (expectation.equalsArrayLength === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) {
        failures.push(`${expectation.path} ${expectation.arrayPath} must be an array`)
      }
    } else if (value !== items.length) {
      failures.push(`${expectation.path} expected to match ${expectation.arrayPath}.length: expected ${items.length} but found ${printable(value)}`)
    }
  }
  if (expectation.equalsArrayItemSum === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.path} ${expectation.arrayPath} must be an array`)
    } else {
      let valid = true
      let sum = 0
      items.forEach((item, index) => {
        const itemValue = Number(getPath(item, expectation.itemPath))
        if (!Number.isFinite(itemValue)) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath} must be a finite number but found ${printable(getPath(item, expectation.itemPath))}`)
          valid = false
          return
        }
        sum += itemValue
      })
      if (valid && value !== sum) {
        failures.push(`${expectation.path} expected to match sum of ${expectation.arrayPath}.${expectation.itemPath}: expected ${sum} but found ${printable(value)}`)
      }
    }
  }
  if (expectation.arrayPath && expectation.assetNameMatches) {
    const assets = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(assets)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else if (!assets.some((asset) => matchesPattern(asset?.name ?? asset?.file ?? asset?.filename, expectation.assetNameMatches))) {
      failures.push(`${expectation.arrayPath} has no asset name matching /${expectation.assetNameMatches}/`)
    }
  }
  if (expectation.arrayPath && expectation.contains !== undefined) {
    const items = getPath(payload, expectation.arrayPath)
    const values = Array.isArray(items)
      ? items.map((item) => expectation.itemPath ? getPath(item, expectation.itemPath) : item)
      : []
    if (!values.includes(expectation.contains)) {
      failures.push(`${expectation.arrayPath} does not contain ${printable(expectation.contains)} at ${expectation.itemPath ?? '(item)'}`)
    }
  }
  if (expectation.arrayPath && expectation.valuesEqualArrayPath) {
    const items = getPath(payload, expectation.arrayPath)
    const expectedItems = getPath(payload, expectation.valuesEqualArrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else if (!Array.isArray(expectedItems)) {
      failures.push(`${expectation.valuesEqualArrayPath} must be an array`)
    } else {
      const values = items.map((item) => expectation.itemPath ? getPath(item, expectation.itemPath) : item)
      const expectedValues = expectedItems.map((item) => expectation.valueItemPath ? getPath(item, expectation.valueItemPath) : item)
      const actualCounts = new Map()
      const expectedCounts = new Map()
      for (const item of values) {
        const key = JSON.stringify(item)
        actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1)
      }
      for (const item of expectedValues) {
        const key = JSON.stringify(item)
        expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1)
      }
      const missing = []
      const extra = []
      for (const [key, expectedCount] of expectedCounts) {
        const actualCount = actualCounts.get(key) ?? 0
        if (actualCount < expectedCount) missing.push(`${key}${expectedCount - actualCount > 1 ? ` x${expectedCount - actualCount}` : ''}`)
      }
      for (const [key, actualCount] of actualCounts) {
        const expectedCount = expectedCounts.get(key) ?? 0
        if (actualCount > expectedCount) extra.push(`${key}${actualCount - expectedCount > 1 ? ` x${actualCount - expectedCount}` : ''}`)
      }
      if (missing.length > 0 || extra.length > 0) {
        const details = [
          missing.length > 0 ? `missing ${missing.join(', ')}` : null,
          extra.length > 0 ? `extra ${extra.join(', ')}` : null,
        ].filter(Boolean).join('; ')
        failures.push(`${expectation.arrayPath}.${expectation.itemPath ?? '(item)'} expected to match set ${expectation.valuesEqualArrayPath}: ${details}`)
      }
    }
  }
  if (expectation.arrayPath && expectation.itemMatches) {
    const items = getPath(payload, expectation.arrayPath)
    const values = Array.isArray(items)
      ? items.map((item) => expectation.itemPath ? getPath(item, expectation.itemPath) : item)
      : []
    if (!values.some((item) => matchesPattern(item, expectation.itemMatches))) {
      failures.push(`${expectation.arrayPath} has no item matching /${expectation.itemMatches}/ at ${expectation.itemPath ?? '(item)'}`)
    }
  }
  if (expectation.arrayPath && expectation.forbidItemMatches) {
    const items = getPath(payload, expectation.arrayPath)
    const values = Array.isArray(items)
      ? items.map((item) => expectation.itemPath ? getPath(item, expectation.itemPath) : item)
      : []
    const forbidden = values.filter((item) => matchesPattern(item, expectation.forbidItemMatches))
    if (forbidden.length > 0) {
      failures.push(`${expectation.arrayPath} contains ${forbidden.length} forbidden item(s) matching /${expectation.forbidItemMatches}/`)
    }
  }
  if (expectation.arrayPath && expectation.uniqueItemPath) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) {
        failures.push(`${expectation.arrayPath} must be an array`)
      }
    } else {
      const seen = new Set()
      for (const [index, item] of items.entries()) {
        const itemValue = getPath(item, expectation.uniqueItemPath)
        const key = JSON.stringify(itemValue)
        if (seen.has(key)) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.uniqueItemPath} duplicates ${printable(itemValue)}`)
        }
        seen.add(key)
      }
    }
  }
  if (expectation.arrayPath && expectation.uniqueItems === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) {
        failures.push(`${expectation.arrayPath} must be an array`)
      }
    } else {
      const seen = new Set()
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const key = JSON.stringify(itemValue)
        if (seen.has(key)) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} duplicates ${printable(itemValue)}`)
        }
        seen.add(key)
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemMatches) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        if (!matchesPattern(itemValue, expectation.everyItemMatches)) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} expected to match /${expectation.everyItemMatches}/ but found ${printable(itemValue)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemUrlBasenameEqualsPath) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const expectedValue = getPath(item, expectation.everyItemUrlBasenameEqualsPath)
        const actualBasename = urlBasename(itemValue)
        if (actualBasename === null) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} must be a valid URL with a path filename but found ${printable(itemValue)}`)
        } else if (actualBasename !== expectedValue) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} URL filename expected ${printable(expectedValue)} but found ${printable(actualBasename)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemPathBasenameEqualsPath) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const expectedValue = getPath(item, expectation.everyItemPathBasenameEqualsPath)
        const actualBasename = pathBasename(itemValue)
        if (actualBasename === null) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} must be a non-empty file path but found ${printable(itemValue)}`)
        } else if (actualBasename !== expectedValue) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} path filename expected ${printable(expectedValue)} but found ${printable(actualBasename)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemNotMatches) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        if (matchesPattern(itemValue, expectation.everyItemNotMatches)) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} must not match /${expectation.everyItemNotMatches}/ but found ${printable(itemValue)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemIsoTimestamp === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        if (parseIsoTimestamp(itemValue) === null) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} must be an ISO-8601 UTC timestamp but found ${printable(itemValue)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemTimestampOnOrAfter !== undefined) {
    const items = getPath(payload, expectation.arrayPath)
    const expectedMillis = parseIsoTimestamp(expectation.everyItemTimestampOnOrAfter)
    if (expectedMillis === null) {
      failures.push(`${expectation.arrayPath} has invalid everyItemTimestampOnOrAfter expectation ${printable(expectation.everyItemTimestampOnOrAfter)}`)
    } else if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const itemMillis = parseIsoTimestamp(itemValue)
        if (itemMillis === null || itemMillis < expectedMillis) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} expected on or after ${expectation.everyItemTimestampOnOrAfter} but found ${printable(itemValue)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemTimestampOnOrAfterPath !== undefined) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const baselineValue = getPath(item, expectation.everyItemTimestampOnOrAfterPath)
        const itemMillis = parseIsoTimestamp(itemValue)
        const baselineMillis = parseIsoTimestamp(baselineValue)
        if (itemMillis === null || baselineMillis === null || itemMillis < baselineMillis) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} expected on or after ${expectation.everyItemTimestampOnOrAfterPath} (${printable(baselineValue)}) but found ${printable(itemValue)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemEquals !== undefined) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        if (itemValue !== expectation.everyItemEquals) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} expected ${printable(expectation.everyItemEquals)} but found ${printable(itemValue)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemEqualsPath !== undefined) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const expectedValue = getPath(item, expectation.everyItemEqualsPath)
        if (!sameJsonValue(itemValue, expectedValue)) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} expected to match ${expectation.everyItemEqualsPath}: expected ${printable(expectedValue)} but found ${printable(itemValue)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemEqualsJsonValue === true) {
    const jsonPayload = await readJsonFileExpectation({ args, check, expectation, failures })
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else if (jsonPayload) {
      const expectedValue = getPath(jsonPayload, expectation.jsonValuePath)
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        if (itemValue !== expectedValue) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} expected to match ${expectation.jsonFilePath}:${expectation.jsonValuePath}: expected ${printable(expectedValue)} but found ${printable(itemValue)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemNotEquals !== undefined) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        if (itemValue === expectation.everyItemNotEquals) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} must not equal ${printable(expectation.everyItemNotEquals)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemAtLeast !== undefined) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const itemValue = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        if (!(Number(itemValue) >= expectation.everyItemAtLeast)) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} expected >= ${expectation.everyItemAtLeast} but found ${printable(itemValue)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyItemFileExists === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      for (const [index, item] of items.entries()) {
        const value = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const resolved = resolveSourceRelativePath(args, check, value)
        if (resolved.error === 'relative-file-path') {
          failures.push(`${expectation.arrayPath}[${index}] must be a relative file path`)
          continue
        }
        if (resolved.error === 'outside-source') {
          failures.push(`${expectation.arrayPath}[${index}] points outside ${check.source}: ${value}`)
        } else {
          await requireFile({
            failures,
            label: `${expectation.arrayPath}[${index}]`,
            target: resolved.target,
            value,
          })
        }
      }
    }
  }
  if (expectation.arrayPath && expectation.everyItemFileMinBytes !== undefined) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      for (const [index, item] of items.entries()) {
        const value = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const resolved = resolveSourceRelativePath(args, check, value)
        if (resolved.error === 'relative-file-path') {
          failures.push(`${expectation.arrayPath}[${index}] must be a relative file path`)
          continue
        }
        if (resolved.error === 'outside-source') {
          failures.push(`${expectation.arrayPath}[${index}] points outside ${check.source}: ${value}`)
        } else if (!(await requireFile({
          failures,
          label: `${expectation.arrayPath}[${index}]`,
          target: resolved.target,
          value,
        }))) {
          continue
        } else {
          const size = await fileSize(resolved.target)
          if (size < expectation.everyItemFileMinBytes) {
            failures.push(`${expectation.arrayPath}[${index}] target size expected >= ${expectation.everyItemFileMinBytes} byte(s) but found ${size}: ${value}`)
          }
        }
      }
    }
  }
  if (expectation.arrayPath && expectation.everyItemPngSignature === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      for (const [index, item] of items.entries()) {
        const value = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const resolved = resolveSourceRelativePath(args, check, value)
        if (resolved.error === 'relative-file-path') {
          failures.push(`${expectation.arrayPath}[${index}] must be a relative file path`)
          continue
        }
        if (resolved.error === 'outside-source') {
          failures.push(`${expectation.arrayPath}[${index}] points outside ${check.source}: ${value}`)
          continue
        }
        if (!(await requireFile({
          failures,
          label: `${expectation.arrayPath}[${index}]`,
          target: resolved.target,
          value,
        }))) {
          continue
        }
        if (!(await isPngFile(resolved.target))) {
          failures.push(`${expectation.arrayPath}[${index}] target is not a PNG file: ${value}`)
        }
      }
    }
  }
  if (expectation.arrayPath && expectation.everyItemZipSignature === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      for (const [index, item] of items.entries()) {
        if (!matchesItemWhere(item, expectation)) continue
        const value = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const resolved = resolveSourceRelativePath(args, check, value)
        if (resolved.error === 'relative-file-path') {
          failures.push(`${expectation.arrayPath}[${index}] must be a relative file path`)
          continue
        }
        if (resolved.error === 'outside-source') {
          failures.push(`${expectation.arrayPath}[${index}] points outside ${check.source}: ${value}`)
          continue
        }
        if (!(await requireFile({
          failures,
          label: `${expectation.arrayPath}[${index}]`,
          target: resolved.target,
          value,
        }))) {
          continue
        }
        if (!(await isZipFile(resolved.target))) {
          failures.push(`${expectation.arrayPath}[${index}] target is not a ZIP file: ${value}`)
        }
      }
    }
  }
  if (expectation.arrayPath && expectation.everyItemJsonValid === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      for (const [index, item] of items.entries()) {
        if (!matchesItemWhere(item, expectation)) continue
        const value = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const resolved = resolveSourceRelativePath(args, check, value)
        if (resolved.error === 'relative-file-path') {
          failures.push(`${expectation.arrayPath}[${index}] must be a relative file path`)
          continue
        }
        if (resolved.error === 'outside-source') {
          failures.push(`${expectation.arrayPath}[${index}] points outside ${check.source}: ${value}`)
          continue
        }
        if (!(await requireFile({
          failures,
          label: `${expectation.arrayPath}[${index}]`,
          target: resolved.target,
          value,
        }))) {
          continue
        }
        try {
          await readJson(resolved.target)
        } catch (error) {
          failures.push(`${expectation.arrayPath}[${index}] target is not valid JSON: ${value}: ${error.message}`)
        }
      }
    }
  }
  if (expectation.arrayPath && (expectation.everyItemPngMinWidth !== undefined || expectation.everyItemPngMinHeight !== undefined)) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      for (const [index, item] of items.entries()) {
        const value = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const resolved = resolveSourceRelativePath(args, check, value)
        if (resolved.error === 'relative-file-path') {
          failures.push(`${expectation.arrayPath}[${index}] must be a relative file path`)
          continue
        }
        if (resolved.error === 'outside-source') {
          failures.push(`${expectation.arrayPath}[${index}] points outside ${check.source}: ${value}`)
          continue
        }
        if (!(await requireFile({
          failures,
          label: `${expectation.arrayPath}[${index}]`,
          target: resolved.target,
          value,
        }))) {
          continue
        }
        const dimensions = await pngDimensions(resolved.target)
        if (!dimensions) {
          failures.push(`${expectation.arrayPath}[${index}] target is not a PNG file with IHDR dimensions: ${value}`)
          continue
        }
        if (expectation.everyItemPngMinWidth !== undefined && dimensions.width < expectation.everyItemPngMinWidth) {
          failures.push(`${expectation.arrayPath}[${index}] PNG width expected >= ${expectation.everyItemPngMinWidth} but found ${dimensions.width}: ${value}`)
        }
        if (expectation.everyItemPngMinHeight !== undefined && dimensions.height < expectation.everyItemPngMinHeight) {
          failures.push(`${expectation.arrayPath}[${index}] PNG height expected >= ${expectation.everyItemPngMinHeight} but found ${dimensions.height}: ${value}`)
        }
      }
    }
  }
  if (expectation.arrayPath && expectation.everyItemFileSha256Matches === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      for (const [index, item] of items.entries()) {
        const value = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const expectedSha = getPath(item, expectation.sha256Path ?? 'sha256')
        const resolved = resolveSourceRelativePath(args, check, value)
        if (resolved.error === 'relative-file-path') {
          failures.push(`${expectation.arrayPath}[${index}] must be a relative file path`)
          continue
        }
        if (resolved.error === 'outside-source') {
          failures.push(`${expectation.arrayPath}[${index}] points outside ${check.source}: ${value}`)
          continue
        }
        if (!(await requireFile({
          failures,
          label: `${expectation.arrayPath}[${index}]`,
          target: resolved.target,
          value,
        }))) {
          continue
        }
        if (!SHA256_PATTERN.test(String(expectedSha ?? ''))) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.sha256Path ?? 'sha256'} must be a SHA-256 digest`)
          continue
        }
        const actualSha = await sha256File(resolved.target)
        if (actualSha !== String(expectedSha).toLowerCase()) {
          failures.push(`${expectation.arrayPath}[${index}] SHA-256 mismatch for ${value}: expected ${expectedSha}, found ${actualSha}`)
        }
      }
    }
  }
  if (expectation.arrayPath && expectation.everyItemFileSizeMatches === true) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      if (expectation.skipWhenArrayMissing !== true) failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      for (const [index, item] of items.entries()) {
        const value = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        const expectedSize = Number(getPath(item, expectation.sizePath ?? 'size'))
        const resolved = resolveSourceRelativePath(args, check, value)
        if (resolved.error === 'relative-file-path') {
          failures.push(`${expectation.arrayPath}[${index}] must be a relative file path`)
          continue
        }
        if (resolved.error === 'outside-source') {
          failures.push(`${expectation.arrayPath}[${index}] points outside ${check.source}: ${value}`)
          continue
        }
        if (!(await requireFile({
          failures,
          label: `${expectation.arrayPath}[${index}]`,
          target: resolved.target,
          value,
        }))) {
          continue
        }
        if (!Number.isFinite(expectedSize) || expectedSize < 0) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.sizePath ?? 'size'} must be a non-negative file size`)
          continue
        }
        const actualSize = await fileSize(resolved.target)
        if (actualSize !== expectedSize) {
          failures.push(`${expectation.arrayPath}[${index}] size mismatch for ${value}: expected ${expectedSize}, found ${actualSize}`)
        }
      }
    }
  }
  if (expectation.arrayPath && expectation.everyArrayMinItems !== undefined) {
    const items = getPath(payload, expectation.arrayPath)
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, index) => {
        const nested = expectation.itemPath ? getPath(item, expectation.itemPath) : item
        if (!Array.isArray(nested) || nested.length < expectation.everyArrayMinItems) {
          failures.push(`${expectation.arrayPath}[${index}].${expectation.itemPath ?? '(item)'} expected at least ${expectation.everyArrayMinItems} item(s) but found ${Array.isArray(nested) ? nested.length : printable(nested)}`)
        }
      })
    }
  }
  if (expectation.arrayPath && expectation.everyNestedPathEquals) {
    const items = getPath(payload, expectation.arrayPath)
    const rule = expectation.everyNestedPathEquals
    if (!Array.isArray(items)) {
      failures.push(`${expectation.arrayPath} must be an array`)
    } else {
      items.forEach((item, itemIndex) => {
        const nested = rule.itemPath ? getPath(item, rule.itemPath) : expectation.itemPath ? getPath(item, expectation.itemPath) : item
        if (!Array.isArray(nested)) {
          failures.push(`${expectation.arrayPath}[${itemIndex}].${rule.itemPath ?? expectation.itemPath ?? '(item)'} must be an array`)
          return
        }
        nested.forEach((nestedItem, nestedIndex) => {
          if (rule.where) {
            const whereValue = getPath(nestedItem, rule.where.path)
            if (rule.where.equals !== undefined && whereValue !== rule.where.equals) return
            if (rule.where.notEquals !== undefined && whereValue === rule.where.notEquals) return
          }
          const nestedValue = getPath(nestedItem, rule.path)
          if (nestedValue !== rule.value) {
            failures.push(`${expectation.arrayPath}[${itemIndex}].${expectation.itemPath ?? '(item)'}[${nestedIndex}].${rule.path} expected ${printable(rule.value)} but found ${printable(nestedValue)}`)
          }
        })
      })
    }
  }
  if (expectation.fileExists === true) {
    const resolved = resolveSourceRelativePath(args, check, value)
    if (resolved.error === 'relative-file-path') {
      failures.push(`${expectation.path} must be a relative file path`)
    } else if (resolved.error === 'outside-source') {
      failures.push(`${expectation.path} points outside ${check.source}: ${value}`)
    } else {
      await requireFile({
        failures,
        label: expectation.path,
        target: resolved.target,
        value,
      })
    }
  }
  if (expectation.filePngSignature === true) {
    const resolved = resolveSourceRelativePath(args, check, value)
    if (resolved.error === 'relative-file-path') {
      failures.push(`${expectation.path} must be a relative file path`)
    } else if (resolved.error === 'outside-source') {
      failures.push(`${expectation.path} points outside ${check.source}: ${value}`)
    } else if (await requireFile({
      failures,
      label: expectation.path,
      target: resolved.target,
      value,
    })) {
      if (!(await isPngFile(resolved.target))) {
        failures.push(`${expectation.path} target is not a PNG file: ${value}`)
      }
    }
  }
  if (expectation.fileZipSignature === true) {
    const resolved = resolveSourceRelativePath(args, check, value)
    if (resolved.error === 'relative-file-path') {
      failures.push(`${expectation.path} must be a relative file path`)
    } else if (resolved.error === 'outside-source') {
      failures.push(`${expectation.path} points outside ${check.source}: ${value}`)
    } else if (await requireFile({
      failures,
      label: expectation.path,
      target: resolved.target,
      value,
    })) {
      if (!(await isZipFile(resolved.target))) {
        failures.push(`${expectation.path} target is not a ZIP file: ${value}`)
      }
    }
  }
  if (expectation.fileMinBytes !== undefined) {
    const resolved = resolveSourceRelativePath(args, check, value)
    if (resolved.error === 'relative-file-path') {
      failures.push(`${expectation.path} must be a relative file path`)
    } else if (resolved.error === 'outside-source') {
      failures.push(`${expectation.path} points outside ${check.source}: ${value}`)
    } else if (await requireFile({
      failures,
      label: expectation.path,
      target: resolved.target,
      value,
    })) {
      const size = await fileSize(resolved.target)
      if (size < expectation.fileMinBytes) {
        failures.push(`${expectation.path} target size expected >= ${expectation.fileMinBytes} byte(s) but found ${size}: ${value}`)
      }
    }
  }
  if (expectation.fileJsonValid === true) {
    const resolved = resolveSourceRelativePath(args, check, value)
    if (resolved.error === 'relative-file-path') {
      failures.push(`${expectation.path} must be a relative file path`)
    } else if (resolved.error === 'outside-source') {
      failures.push(`${expectation.path} points outside ${check.source}: ${value}`)
    } else if (await requireFile({
      failures,
      label: expectation.path,
      target: resolved.target,
      value,
    })) {
      try {
        await readJson(resolved.target)
      } catch (error) {
        failures.push(`${expectation.path} target is not valid JSON: ${value}: ${error.message}`)
      }
    }
  }
  if (expectation.fileJsonPathOneOf) {
    const jsonPayload = await readJsonValueFileExpectation({ args, check, expectation, failures, value })
    if (jsonPayload) {
      const actualValue = getPath(jsonPayload, expectation.fileJsonPath)
      if (!expectation.fileJsonPathOneOf.includes(actualValue)) {
        failures.push(`${expectation.path} target ${expectation.fileJsonPath} expected one of ${expectation.fileJsonPathOneOf.map(printable).join(', ')} but found ${printable(actualValue)}: ${value}`)
      }
    }
  }
  if (expectation.fileJsonPathEquals !== undefined) {
    const jsonPayload = await readJsonValueFileExpectation({ args, check, expectation, failures, value })
    if (jsonPayload) {
      const actualValue = getPath(jsonPayload, expectation.fileJsonPath)
      if (!sameJsonValue(actualValue, expectation.fileJsonPathEquals)) {
        failures.push(`${expectation.path} target ${expectation.fileJsonPath} expected ${printable(expectation.fileJsonPathEquals)} but found ${printable(actualValue)}: ${value}`)
      }
    }
  }
  if (expectation.fileJsonPathEqualsPath) {
    const jsonPayload = await readJsonValueFileExpectation({ args, check, expectation, failures, value })
    if (jsonPayload) {
      const actualValue = getPath(jsonPayload, expectation.fileJsonPath)
      const expectedValue = getPath(payload, expectation.fileJsonPathEqualsPath)
      if (!sameJsonValue(actualValue, expectedValue)) {
        failures.push(`${expectation.path} target ${expectation.fileJsonPath} expected to match ${expectation.fileJsonPathEqualsPath}: expected ${printable(expectedValue)} but found ${printable(actualValue)}: ${value}`)
      }
    }
  }
  if (expectation.filePngMinWidth !== undefined || expectation.filePngMinHeight !== undefined) {
    const resolved = resolveSourceRelativePath(args, check, value)
    if (resolved.error === 'relative-file-path') {
      failures.push(`${expectation.path} must be a relative file path`)
    } else if (resolved.error === 'outside-source') {
      failures.push(`${expectation.path} points outside ${check.source}: ${value}`)
    } else if (await requireFile({
      failures,
      label: expectation.path,
      target: resolved.target,
      value,
    })) {
      const dimensions = await pngDimensions(resolved.target)
      if (!dimensions) {
        failures.push(`${expectation.path} target is not a PNG file with IHDR dimensions: ${value}`)
      } else {
        if (expectation.filePngMinWidth !== undefined && dimensions.width < expectation.filePngMinWidth) {
          failures.push(`${expectation.path} PNG width expected >= ${expectation.filePngMinWidth} but found ${dimensions.width}: ${value}`)
        }
        if (expectation.filePngMinHeight !== undefined && dimensions.height < expectation.filePngMinHeight) {
          failures.push(`${expectation.path} PNG height expected >= ${expectation.filePngMinHeight} but found ${dimensions.height}: ${value}`)
        }
      }
    }
  }
  return failures
}

async function verify(args) {
  const manifestPath = path.isAbsolute(args.manifest) ? args.manifest : path.join(args.root, args.manifest)
  const manifest = await readJson(manifestPath)
  const findings = []

  if (manifest.schemaVersion !== 'echo.ashfall.release-readiness.v1') {
    findings.push({
      phase: 'manifest',
      id: 'schema',
      file: rel(args.root, manifestPath),
      message: `manifest schemaVersion must be echo.ashfall.release-readiness.v1, found ${printable(manifest.schemaVersion)}`,
    })
  }
  if (!Array.isArray(manifest.checks) || manifest.checks.length === 0) {
    findings.push({
      phase: 'manifest',
      id: 'checks',
      file: rel(args.root, manifestPath),
      message: 'manifest must include at least one readiness check',
    })
    return findings
  }

  for (const check of manifest.checks) {
    const sourceFile = checkPath({ args }, check)
    const sourceFileStatus = await fileStatus(sourceFile)
    if (sourceFileStatus !== 'file') {
      findings.push({
        phase: check.phase,
        id: check.id,
        title: check.title,
        file: rel(sourceRoot(args, check.source), sourceFile),
        message: sourceFileStatus === 'missing'
          ? `${check.source} evidence file is missing`
          : `${check.source} evidence path is not a file`,
      })
      continue
    }

    let payload
    try {
      payload = await readJson(sourceFile)
    } catch (error) {
      findings.push({
        phase: check.phase,
        id: check.id,
        title: check.title,
        file: rel(sourceRoot(args, check.source), sourceFile),
        message: `evidence file is not valid JSON: ${error.message}`,
      })
      continue
    }

    for (const expectation of check.expect ?? []) {
      const failures = await validateExpectation({ args, check, sourceFile, payload, expectation })
      for (const failure of failures) {
        findings.push({
          phase: check.phase,
          id: check.id,
          title: check.title,
          file: rel(sourceRoot(args, check.source), sourceFile),
          message: failure,
        })
      }
    }
  }
  return findings
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  const findings = await verify(args)
  if (findings.length > 0) {
    const level = args.requireReleaseReady ? 'failed' : 'passed with'
    const label = args.requireReleaseReady ? 'error' : 'warning'
    const stream = args.requireReleaseReady ? process.stderr : process.stdout
    stream.write(`Ashfall release readiness verification ${level} ${findings.length} ${label}(s):\n`)
    for (const finding of findings) {
      stream.write(`- phase ${finding.phase} ${finding.id} (${finding.file}): ${finding.message}\n`)
    }
    if (args.requireReleaseReady) process.exitCode = 1
    return
  }

  console.log('Ashfall release readiness verification passed.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
