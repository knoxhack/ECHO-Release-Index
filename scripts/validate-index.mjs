import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const args = { root: process.cwd(), strict: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') args.root = path.resolve(argv[++index])
    else if (arg === '--strict') args.strict = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const root = args.root
const strict = args.strict
const sha256Pattern = /^[a-f0-9]{64}$/i
const commitPattern = /^[a-f0-9]{7,40}$/i
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const entryDirs = ['products', 'modpacks', 'modules', 'addons']
const auxiliaryDirs = ['publishers', 'channels', 'trust', 'blocks']
const rawIndexPrefix = 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/'
const validKinds = new Set(['product', 'modpack', 'module', 'addon', 'runtime', 'studio', 'website'])
const validValidationStates = new Set(['approved', 'warning', 'rejected', 'blocked'])
const attestedTrustTiers = new Set(['official', 'reproducible-build', 'echo-workflow-built', 'provenance-attested'])
const requiredSchemas = [
  'block.schema.json',
  'channel.schema.json',
  'echo-addon-package.schema.json',
  'echo-pack.schema.json',
  'module-release-manifest.schema.json',
  'product-update-entry.schema.json',
  'publisher.schema.json',
  'release-index-entry.schema.json',
  'trust.schema.json',
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

const schemaCache = new Map()

function loadSchema(name) {
  if (!schemaCache.has(name)) {
    schemaCache.set(name, readJson(path.join(root, 'schemas', name)))
  }
  return schemaCache.get(name)
}

function valueType(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  if (Number.isInteger(value)) return 'integer'
  return typeof value
}

function schemaTypeMatches(expected, value) {
  const types = Array.isArray(expected) ? expected : [expected]
  const actual = valueType(value)
  return types.some((type) => type === actual || (type === 'number' && actual === 'integer'))
}

function validateSchemaValue(errors, filePath, schema, value, pointer = '$') {
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${rel(filePath)} ${pointer} must equal ${JSON.stringify(schema.const)}`)
    return
  }
  if (schema.enum && !schema.enum.some((item) => item === value)) {
    errors.push(`${rel(filePath)} ${pointer} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`)
    return
  }
  if (schema.type && !schemaTypeMatches(schema.type, value)) {
    errors.push(`${rel(filePath)} ${pointer} must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type}`)
    return
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${rel(filePath)} ${pointer} must not be empty`)
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      errors.push(`${rel(filePath)} ${pointer} does not match ${schema.pattern}`)
    }
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      errors.push(`${rel(filePath)} ${pointer} must be a date-time`)
    }
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${rel(filePath)} ${pointer} must be >= ${schema.minimum}`)
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${rel(filePath)} ${pointer} must contain at least ${schema.minItems} item(s)`)
    }
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${rel(filePath)} ${pointer} must contain unique items`)
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchemaValue(errors, filePath, schema.items, item, `${pointer}[${index}]`))
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const field of schema.required ?? []) {
      if (value[field] === undefined) errors.push(`${rel(filePath)} ${pointer}.${field} is required`)
    }
    for (const [field, childSchema] of Object.entries(schema.properties ?? {})) {
      if (value[field] !== undefined) validateSchemaValue(errors, filePath, childSchema, value[field], `${pointer}.${field}`)
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}))
      for (const field of Object.keys(value)) {
        if (!allowed.has(field)) errors.push(`${rel(filePath)} ${pointer}.${field} is not allowed`)
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const known = new Set(Object.keys(schema.properties ?? {}))
      for (const [field, childValue] of Object.entries(value)) {
        if (!known.has(field)) validateSchemaValue(errors, filePath, schema.additionalProperties, childValue, `${pointer}.${field}`)
      }
    }
  }
}

function validateAgainstSchema(errors, filePath, schemaName, value) {
  validateSchemaValue(errors, filePath, loadSchema(schemaName), value)
}

function jsonFiles(dir) {
  const absolute = path.join(root, dir)
  if (!fs.existsSync(absolute)) return []
  const out = []
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const entryPath = path.join(absolute, entry.name)
    if (entry.isDirectory()) {
      out.push(...jsonFiles(path.relative(root, entryPath)))
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.schema.json')) {
      out.push(entryPath)
    }
  }
  return out
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function requireField(errors, filePath, object, field) {
  if (object[field] === undefined || object[field] === null || object[field] === '') {
    errors.push(`${rel(filePath)} missing ${field}`)
  }
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

function validateArtifacts(errors, warnings, filePath, entry) {
  const artifacts = entry.artifacts
  const hasArtifacts = Array.isArray(artifacts) ? artifacts.length > 0 : artifacts && Object.keys(artifacts).length > 0
  if (!hasArtifacts) {
    const message = `${rel(filePath)} has no indexed artifacts`
    if (entry.validation === 'approved') errors.push(message)
    else warnings.push(message)
    return
  }
  walk(artifacts, (node) => {
    if (node.sha256 !== undefined && !sha256Pattern.test(String(node.sha256))) {
      errors.push(`${rel(filePath)} artifact ${node.file ?? node.name ?? '(unknown)'} has invalid sha256`)
    }
    if (node.url !== undefined && !/^https:\/\/github\.com\/|^https:\/\/raw\.githubusercontent\.com\//.test(String(node.url))) {
      errors.push(`${rel(filePath)} artifact ${node.file ?? node.name ?? '(unknown)'} must use a GitHub HTTPS URL`)
    }
    if (node.file !== undefined && /(^[a-z]:|^\/|^\\|\.\.)/i.test(String(node.file))) {
      errors.push(`${rel(filePath)} artifact file is not a safe relative filename: ${node.file}`)
    }
  })
}

function artifactRoleRecords(artifacts) {
  const records = []
  function visit(node, role = 'asset') {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, role))
      return
    }
    if (!node || typeof node !== 'object') return
    if (node.file || node.name || node.filename || node.url || node.sha256 || node.downloadUrl) {
      records.push({
        role,
        name: String(node.file ?? node.name ?? node.filename ?? role),
        url: node.url ?? node.downloadUrl,
        sha256: node.sha256,
      })
    }
    Object.entries(node).forEach(([key, value]) => visit(value, key))
  }
  visit(artifacts)
  return records
}

function hasExactArtifactRole(entry, role) {
  return artifactRoleRecords(entry.artifacts).some((artifact) =>
    artifact.role === role &&
    artifact.url &&
    /^https:\/\/github\.com\/|^https:\/\/raw\.githubusercontent\.com\//.test(String(artifact.url)) &&
    sha256Pattern.test(String(artifact.sha256 ?? ''))
  )
}

function requiredArtifactRolesForEntry(entry) {
  if (entry.kind === 'modpack') return ['manifest']
  if (entry.kind === 'runtime') return ['archive']
  if (['product', 'studio'].includes(entry.kind) && Array.isArray(entry.compatibility) && entry.compatibility.includes('windows-x64')) {
    return ['latestYml', 'windowsSetup']
  }
  return []
}

function validateRequiredArtifactRoles(errors, warnings, filePath, entry) {
  for (const role of requiredArtifactRolesForEntry(entry)) {
    if (hasExactArtifactRole(entry, role)) continue
    const message = `${rel(filePath)} ${entry.kind} entry ${entry.id ?? '(unknown)'} has no exact indexed artifact for role ${role}`
    if (entry.validation === 'approved') errors.push(message)
    else warnings.push(message)
  }
}

function validateAttestedProvenance(errors, filePath, entry) {
  if (entry.validation !== 'approved' || !attestedTrustTiers.has(entry.trust)) return
  const provenance = entry.provenance
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    errors.push(`${rel(filePath)} approved ${entry.trust} entry missing provenance metadata`)
    return
  }
  const attestation = provenance.attestation
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    errors.push(`${rel(filePath)} approved ${entry.trust} entry missing provenance.attestation metadata`)
    return
  }
  const provenanceCommit = String(provenance.commitSha ?? '').trim()
  if (!commitPattern.test(provenanceCommit) || /^0{7,40}$/.test(provenanceCommit)) {
    errors.push(`${rel(filePath)} approved ${entry.trust} entry provenance.commitSha must be a real 7-40 hex commit`)
  }
  if (entry.commitSha && provenanceCommit && entry.commitSha !== provenanceCommit) {
    errors.push(`${rel(filePath)} approved ${entry.trust} entry provenance.commitSha must match commitSha`)
  }
  const action = String(attestation.action ?? '').trim()
  if (!['actions/attest@v4', 'gh attestation verify'].includes(action)) {
    errors.push(`${rel(filePath)} approved ${entry.trust} entry provenance.attestation.action must be actions/attest@v4 or gh attestation verify`)
  }
  if (!attestation.subjectChecksums && !attestation.sourceDigest) {
    errors.push(`${rel(filePath)} approved ${entry.trust} entry provenance.attestation must include subjectChecksums or sourceDigest`)
  }
  if (!provenance.workflow && !provenance.workflowRef && !attestation.signerWorkflow) {
    errors.push(`${rel(filePath)} approved ${entry.trust} entry provenance must include workflow, workflowRef, or attestation.signerWorkflow`)
  }
}

function loadChannels(errors) {
  const channels = new Set()
  for (const filePath of jsonFiles('channels')) {
    if (rel(filePath).startsWith('channels/alpha/')) continue
    const payload = readJson(filePath)
    validateAgainstSchema(errors, filePath, 'channel.schema.json', payload)
    if (!payload.id) errors.push(`${rel(filePath)} missing id`)
    else channels.add(String(payload.id))
  }
  return channels
}

function loadTrust(errors) {
  const trust = new Map()
  for (const filePath of jsonFiles('trust')) {
    const payload = readJson(filePath)
    const rows = Array.isArray(payload) ? payload : [payload]
    for (const row of rows) {
      validateAgainstSchema(errors, filePath, 'trust.schema.json', row)
      if (!row.id) errors.push(`${rel(filePath)} trust row missing id`)
      else trust.set(String(row.id), row)
      if (!Number.isInteger(row.rank)) errors.push(`${rel(filePath)} ${row.id ?? '(unknown)'} missing integer rank`)
      if (typeof row.playable !== 'boolean') errors.push(`${rel(filePath)} ${row.id ?? '(unknown)'} missing playable boolean`)
    }
  }
  return trust
}

function loadPublishers(errors) {
  const publishers = new Set()
  for (const filePath of jsonFiles('publishers')) {
    const payload = readJson(filePath)
    validateAgainstSchema(errors, filePath, 'publisher.schema.json', payload)
    for (const field of ['id', 'name', 'githubOwner', 'trust']) requireField(errors, filePath, payload, field)
    if (payload.id) publishers.add(String(payload.id))
  }
  return publishers
}

function loadBlocks(errors) {
  const blocked = new Set()
  for (const filePath of jsonFiles('blocks')) {
    const payload = readJson(filePath)
    const rows = Array.isArray(payload) ? payload : [payload]
    for (const row of rows) {
      validateAgainstSchema(errors, filePath, 'block.schema.json', row)
      for (const field of ['id', 'scope', 'reason', 'createdAt']) requireField(errors, filePath, row, field)
      if (row.target) blocked.add(String(row.target))
    }
  }
  return blocked
}

function validateSchemaInventory(errors) {
  const schemasDir = path.join(root, 'schemas')
  if (!fs.existsSync(schemasDir)) {
    errors.push('Missing catalog directory schemas')
    return
  }
  for (const schemaName of requiredSchemas) {
    const schemaPath = path.join(schemasDir, schemaName)
    if (!fs.existsSync(schemaPath)) {
      errors.push(`Missing required schema schemas/${schemaName}`)
      continue
    }
    try {
      const schema = readJson(schemaPath)
      if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
        errors.push(`schemas/${schemaName} must use JSON Schema draft 2020-12`)
      }
      const expectedId = `https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/schemas/${schemaName}`
      if (schema.$id !== expectedId) {
        errors.push(`schemas/${schemaName} has unexpected $id ${schema.$id ?? '(missing)'}`)
      }
    } catch (error) {
      errors.push(`schemas/${schemaName} is invalid JSON: ${error.message}`)
    }
  }
}

function validateEntry(errors, warnings, filePath, entry, context) {
  validateAgainstSchema(errors, filePath, 'release-index-entry.schema.json', entry)
  if (['product', 'runtime', 'studio', 'website'].includes(entry.kind)) {
    validateAgainstSchema(errors, filePath, 'product-update-entry.schema.json', entry)
  }
  for (const field of ['id', 'kind', 'version', 'channel', 'publisher', 'sourceRepo', 'releaseTag', 'commitSha', 'artifacts', 'dependencies', 'compatibility', 'trust', 'validation']) {
    requireField(errors, filePath, entry, field)
  }
  if (entry.kind && !validKinds.has(entry.kind)) errors.push(`${rel(filePath)} has invalid kind ${entry.kind}`)
  if (entry.channel && !context.channels.has(entry.channel)) errors.push(`${rel(filePath)} references unknown channel ${entry.channel}`)
  if (entry.publisher && !context.publishers.has(entry.publisher)) errors.push(`${rel(filePath)} references unknown publisher ${entry.publisher}`)
  if (entry.trust && !context.trust.has(entry.trust)) errors.push(`${rel(filePath)} references unknown trust tier ${entry.trust}`)
  if (entry.validation && !validValidationStates.has(entry.validation)) errors.push(`${rel(filePath)} has invalid validation state ${entry.validation}`)
  const trustTier = context.trust.get(entry.trust)
  if (entry.validation === 'approved' && trustTier && trustTier.playable !== true) {
    errors.push(`${rel(filePath)} approved entry uses non-playable trust tier ${entry.trust}`)
  }
  if (entry.validation === 'blocked' && entry.trust !== 'blocked') {
    errors.push(`${rel(filePath)} blocked entry must use blocked trust tier`)
  }
  if (entry.trust === 'blocked' && entry.validation !== 'blocked') {
    errors.push(`${rel(filePath)} blocked trust tier requires blocked validation state`)
  }
  if (entry.sourceRepo && !repoPattern.test(entry.sourceRepo)) errors.push(`${rel(filePath)} sourceRepo must be owner/name`)
  if (entry.commitSha && !commitPattern.test(entry.commitSha)) errors.push(`${rel(filePath)} commitSha must be 7-40 hex characters`)
  if (entry.commitSha && /^0{7,40}$/.test(entry.commitSha)) errors.push(`${rel(filePath)} commitSha must not be an all-zero placeholder`)
  if (!Array.isArray(entry.dependencies)) errors.push(`${rel(filePath)} dependencies must be an array`)
  if (!Array.isArray(entry.compatibility)) errors.push(`${rel(filePath)} compatibility must be an array`)
  validateArtifacts(errors, warnings, filePath, entry)
  validateRequiredArtifactRoles(errors, warnings, filePath, entry)
  validateAttestedProvenance(errors, filePath, entry)
}

function rawIndexUrlToPath(url) {
  const value = String(url ?? '').trim()
  if (!value.startsWith(rawIndexPrefix)) return null
  const relPath = decodeURIComponent(value.slice(rawIndexPrefix.length))
  if (!relPath || relPath.includes('\0') || relPath.includes('\\') || relPath.split('/').some((part) => !part || part === '.' || part === '..')) {
    return null
  }
  return relPath
}

function validateLauncherChannel(errors, entryFiles) {
  const launcherChannelPath = path.join(root, 'channels', 'alpha', 'launcher-channel.json')
  if (!fs.existsSync(launcherChannelPath)) return
  let channel
  try {
    channel = readJson(launcherChannelPath)
  } catch (error) {
    errors.push(`channels/alpha/launcher-channel.json is invalid JSON: ${error.message}`)
    return
  }
  if (channel.schemaVersion !== 1) errors.push('channels/alpha/launcher-channel.json schemaVersion must be 1')
  if (channel.channel !== 'alpha') errors.push('channels/alpha/launcher-channel.json channel must be alpha')

  const catalogUrls = channel.catalogUrls
  if (!catalogUrls || typeof catalogUrls !== 'object' || Array.isArray(catalogUrls)) {
    errors.push('channels/alpha/launcher-channel.json catalogUrls must be an object')
    return
  }

  const referenced = new Set()
  const seenUrls = new Set()
  for (const dir of entryDirs) {
    const urls = catalogUrls[dir]
    if (!Array.isArray(urls)) {
      errors.push(`channels/alpha/launcher-channel.json catalogUrls.${dir} must be an array`)
      continue
    }
    for (const url of urls) {
      const value = String(url ?? '').trim()
      if (seenUrls.has(value)) errors.push(`channels/alpha/launcher-channel.json has duplicate catalog URL ${value}`)
      seenUrls.add(value)
      const relPath = rawIndexUrlToPath(value)
      if (!relPath) {
        errors.push(`channels/alpha/launcher-channel.json catalog URL must use canonical raw index URL: ${value}`)
        continue
      }
      if (!relPath.startsWith(`${dir}/`)) {
        errors.push(`channels/alpha/launcher-channel.json catalogUrls.${dir} points outside ${dir}: ${relPath}`)
      }
      if (!entryFiles.has(relPath)) {
        errors.push(`channels/alpha/launcher-channel.json references missing catalog entry ${relPath}`)
      }
      referenced.add(relPath)
    }
  }

  for (const entryFile of [...entryFiles].sort()) {
    if (!referenced.has(entryFile)) {
      errors.push(`channels/alpha/launcher-channel.json does not include catalog entry ${entryFile}`)
    }
  }
}

function main() {
  const errors = []
  const warnings = []
  for (const dir of [...entryDirs, ...auxiliaryDirs]) {
    if (!fs.existsSync(path.join(root, dir))) errors.push(`Missing catalog directory ${dir}`)
  }
  validateSchemaInventory(errors)

  const context = {
    channels: loadChannels(errors),
    trust: loadTrust(errors),
    publishers: loadPublishers(errors),
    blocked: loadBlocks(errors),
  }
  const entries = []
  const entryFiles = new Set()
  const ids = new Map()
  for (const dir of entryDirs) {
    for (const filePath of jsonFiles(dir)) {
      let payload
      try {
        payload = readJson(filePath)
      } catch (error) {
        errors.push(`${rel(filePath)} is invalid JSON: ${error.message}`)
        continue
      }
      if (dir === 'modules' && payload.$schema) continue
      const rows = Array.isArray(payload) ? payload : [payload]
      for (const row of rows) {
        validateEntry(errors, warnings, filePath, row, context)
        entryFiles.add(rel(filePath))
        if (row.id) {
          if (ids.has(row.id)) errors.push(`Duplicate release index id ${row.id}: ${ids.get(row.id)} and ${rel(filePath)}`)
          ids.set(row.id, rel(filePath))
          entries.push(row)
        }
      }
    }
  }
  validateLauncherChannel(errors, entryFiles)

  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  const knownIds = new Set(entries.map((entry) => entry.id))
  for (const entry of entries) {
    for (const dependency of entry.dependencies ?? []) {
      if (dependency?.id && !knownIds.has(dependency.id)) {
        errors.push(`${entry.id} depends on unknown index entry ${dependency.id}`)
        continue
      }
      const dependencyEntry = entryById.get(dependency?.id)
      if (dependency?.kind && dependencyEntry?.kind && dependency.kind !== dependencyEntry.kind) {
        errors.push(`${entry.id} dependency ${dependency.id} declares kind ${dependency.kind} but indexed entry is ${dependencyEntry.kind}`)
      }
      if (entry.validation === 'approved' && dependencyEntry?.validation !== 'approved') {
        errors.push(`${entry.id} approved entry depends on ${dependencyEntry?.validation ?? 'missing'} dependency ${dependency.id}`)
      }
      if (entry.validation === 'approved' && context.blocked.has(dependency?.id)) {
        errors.push(`${entry.id} approved entry depends on blocked index entry ${dependency.id}`)
      }
    }
    if (context.blocked.has(entry.id) && entry.validation !== 'blocked') {
      errors.push(`${entry.id} is blocked but validation is ${entry.validation}`)
    }
  }

  for (const warning of warnings) console.warn(`warning: ${warning}`)
  if (errors.length) {
    console.error(`ECHO Release Index validation failed with ${errors.length} error(s):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`ECHO Release Index validation passed for ${entries.length} indexed entries.`)
  if (strict && warnings.length) {
    console.warn(`Strict mode completed with ${warnings.length} warning(s).`)
  }
}

main()
