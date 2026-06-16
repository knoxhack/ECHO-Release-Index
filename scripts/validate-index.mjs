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
const nativeLoaderDirectArtifactFile = 'echo-native-loader-1.0.5.jar'
const nativeLoaderDirectDescriptorFile = 'native-loader-direct-install.json'
const nativeLoaderLibraryRole = 'native-loader-library'
const nativeLoaderDescriptorRole = 'native-loader-direct-install-descriptor'
const requiredSchemas = [
  'block.schema.json',
  'channel.schema.json',
  'content-graph.schema.json',
  'content-graph-node.schema.json',
  'content-graph-edge.schema.json',
  'content-graph-export-plan.schema.json',
  'content-graph-evidence.schema.json',
  'content-feature-list.schema.json',
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
        file: node.file,
        url: node.url ?? node.downloadUrl,
        sha256: node.sha256,
        artifactRole: node.artifactRole,
        manualInstall: node.manualInstall,
        developerDirectDownload: node.developerDirectDownload,
        launcherFacing: node.launcherFacing,
        moduleArtifact: node.moduleArtifact,
        packContent: node.packContent,
        runtimeTarget: node.runtimeTarget,
        buildMode: node.buildMode,
        schemaVersion: node.schemaVersion,
      })
    }
    Object.entries(node).forEach(([key, value]) => visit(value, key))
  }
  visit(artifacts)
  return records
}

function validateNativeLoaderDirectArtifactBoundaries(errors, filePath, entry) {
  const records = artifactRoleRecords(entry.artifacts)
  const isNativePlatformProduct = entry.id === 'echo-native-platform' && entry.kind === 'runtime'
  const packContentKinds = new Set(['modpack', 'module', 'addon'])

  for (const artifact of records) {
    const name = String(artifact.name ?? '')
    const basename = name.split(/[\\/]/u).pop()
    const artifactRole = String(artifact.artifactRole ?? '')
    const isDirectLoaderJar = basename === nativeLoaderDirectArtifactFile
    const isDirectDescriptor = basename === nativeLoaderDirectDescriptorFile
    const isDirectLoaderRole = artifactRole === nativeLoaderLibraryRole || artifactRole === nativeLoaderDescriptorRole

    if (!isDirectLoaderJar && !isDirectDescriptor && !isDirectLoaderRole) continue

    if (!isNativePlatformProduct) {
      errors.push(`${rel(filePath)} must not publish ${basename || artifactRole} as pack, module, addon, or non-Native-Platform content`)
    }
    if (packContentKinds.has(entry.kind)) {
      errors.push(`${rel(filePath)} ${entry.kind} entry must not contain Native Loader direct-install artifact ${basename || artifactRole}`)
    }
    if (isDirectLoaderJar || artifactRole === nativeLoaderLibraryRole) {
      if (artifact.manualInstall !== true) errors.push(`${rel(filePath)} Native Loader library artifact must set manualInstall=true`)
      if (artifact.developerDirectDownload !== true) errors.push(`${rel(filePath)} Native Loader library artifact must set developerDirectDownload=true`)
      if (artifact.moduleArtifact !== false) errors.push(`${rel(filePath)} Native Loader library artifact must set moduleArtifact=false`)
      if (artifact.packContent !== false) errors.push(`${rel(filePath)} Native Loader library artifact must set packContent=false`)
    }
    if (isDirectDescriptor || artifactRole === nativeLoaderDescriptorRole) {
      if (artifact.manualInstall !== true) errors.push(`${rel(filePath)} Native Loader direct-install descriptor must set manualInstall=true`)
      if (artifact.developerDirectDownload !== true) errors.push(`${rel(filePath)} Native Loader direct-install descriptor must set developerDirectDownload=true`)
      if (artifact.moduleArtifact !== false) errors.push(`${rel(filePath)} Native Loader direct-install descriptor must set moduleArtifact=false`)
      if (artifact.packContent !== false) errors.push(`${rel(filePath)} Native Loader direct-install descriptor must set packContent=false`)
    }
  }

  if (!isNativePlatformProduct) {
    for (const dependency of entry.dependencies ?? []) {
      const encoded = JSON.stringify(dependency).toLowerCase()
      if (encoded.includes(nativeLoaderDirectArtifactFile)) {
        errors.push(`${rel(filePath)} dependency list must not reference ${nativeLoaderDirectArtifactFile}`)
      }
    }
    return
  }

  const artifacts = entry.artifacts ?? {}
  const loader = artifacts.nativeLoaderLibrary
  const descriptor = artifacts.nativeLoaderDirectInstall
  const directDistribution = entry.directDistribution
  if (!loader) errors.push(`${rel(filePath)} echo-native-platform must index artifacts.nativeLoaderLibrary`)
  if (!descriptor) errors.push(`${rel(filePath)} echo-native-platform must index artifacts.nativeLoaderDirectInstall`)
  if (!directDistribution || typeof directDistribution !== 'object' || Array.isArray(directDistribution)) {
    errors.push(`${rel(filePath)} echo-native-platform must define directDistribution metadata`)
    return
  }

  if (loader) {
    if (loader.file !== nativeLoaderDirectArtifactFile) errors.push(`${rel(filePath)} nativeLoaderLibrary.file must be ${nativeLoaderDirectArtifactFile}`)
    if (loader.artifactRole !== nativeLoaderLibraryRole) errors.push(`${rel(filePath)} nativeLoaderLibrary.artifactRole must be ${nativeLoaderLibraryRole}`)
  }
  if (descriptor) {
    if (descriptor.file !== nativeLoaderDirectDescriptorFile) errors.push(`${rel(filePath)} nativeLoaderDirectInstall.file must be ${nativeLoaderDirectDescriptorFile}`)
    if (descriptor.artifactRole !== nativeLoaderDescriptorRole) errors.push(`${rel(filePath)} nativeLoaderDirectInstall.artifactRole must be ${nativeLoaderDescriptorRole}`)
  }
  if (directDistribution.artifactRole !== nativeLoaderLibraryRole) errors.push(`${rel(filePath)} directDistribution.artifactRole must be ${nativeLoaderLibraryRole}`)
  if (directDistribution.descriptor !== nativeLoaderDirectDescriptorFile) errors.push(`${rel(filePath)} directDistribution.descriptor must be ${nativeLoaderDirectDescriptorFile}`)
  if (directDistribution.file !== nativeLoaderDirectArtifactFile) errors.push(`${rel(filePath)} directDistribution.file must be ${nativeLoaderDirectArtifactFile}`)
  if (directDistribution.manualInstall !== true) errors.push(`${rel(filePath)} directDistribution.manualInstall must be true`)
  if (directDistribution.developerDirectDownload !== true) errors.push(`${rel(filePath)} directDistribution.developerDirectDownload must be true`)
  if (directDistribution.moduleArtifact !== false) errors.push(`${rel(filePath)} directDistribution.moduleArtifact must be false`)
  if (directDistribution.packContent !== false) errors.push(`${rel(filePath)} directDistribution.packContent must be false`)
}

function hasExactArtifactRole(entry, role) {
  return artifactRoleRecords(entry.artifacts).some((artifact) =>
    (artifact.role === role || artifact.artifactRole === role) &&
    artifact.url &&
    /^https:\/\/github\.com\/|^https:\/\/raw\.githubusercontent\.com\//.test(String(artifact.url)) &&
    sha256Pattern.test(String(artifact.sha256 ?? ''))
  )
}

function requiredArtifactRolesForEntry(entry) {
  if (entry.kind === 'modpack') return ['manifest']
  if (entry.kind === 'runtime') return ['archive']
  if (['module', 'addon'].includes(entry.kind)) return ['content-graph']
  if (['product', 'studio'].includes(entry.kind) && Array.isArray(entry.compatibility) && entry.compatibility.includes('windows-x64')) {
    return ['latestYml', 'windowsSetup']
  }
  return []
}

function validateRequiredArtifactRoles(errors, warnings, filePath, entry) {
  for (const role of requiredArtifactRolesForEntry(entry)) {
    if (hasExactArtifactRole(entry, role)) continue
    if (role === 'content-graph' && entry.contentGraphArtifactPolicy === 'legacy-metadata-only') continue
    const message = `${rel(filePath)} ${entry.kind} entry ${entry.id ?? '(unknown)'} has no exact indexed artifact for role ${role}`
    if (entry.validation === 'approved') errors.push(message)
    else warnings.push(message)
  }
}

function validateContentGraphArtifactPolicy(errors, filePath, entry) {
  if (entry.contentGraphArtifactPolicy === undefined) return
  if (!['module', 'addon'].includes(entry.kind)) {
    errors.push(`${rel(filePath)} contentGraphArtifactPolicy can only be used on module or addon entries`)
  }
  if (entry.contentGraphArtifactPolicy !== 'legacy-metadata-only') {
    errors.push(`${rel(filePath)} contentGraphArtifactPolicy must be legacy-metadata-only when present`)
  }
  if (entry.validation === 'approved') {
    errors.push(`${rel(filePath)} contentGraphArtifactPolicy legacy-metadata-only cannot be used on approved entries`)
  }
  if (hasExactArtifactRole(entry, 'content-graph')) {
    errors.push(`${rel(filePath)} contentGraphArtifactPolicy legacy-metadata-only cannot be used when a live content-graph artifact URL is indexed`)
  }
}

function validateContentGraphEvidenceRole(errors, warnings, filePath, entry) {
  if (!['module', 'addon'].includes(entry.kind)) return
  if (entry.contentGraphEvidencePolicy !== undefined && entry.contentGraphEvidencePolicy !== 'legacy-fallback-only') {
    errors.push(`${rel(filePath)} contentGraphEvidencePolicy must be legacy-fallback-only when present`)
  }
  const records = artifactRoleRecords(entry.artifacts)
  const evidenceRecords = records.filter((artifact) =>
    artifact.role === 'content-graph-evidence' ||
    artifact.artifactRole === 'content-graph-evidence' ||
    artifact.file === 'content-graph-evidence.json' ||
    artifact.name === 'content-graph-evidence.json'
  )
  if (!evidenceRecords.length) {
    if (entry.contentGraphEvidencePolicy === 'legacy-fallback-only') return
    warnings.push(`${rel(filePath)} ${entry.kind} entry ${entry.id ?? '(unknown)'} has no release-level content-graph-evidence artifact; consumers must fall back to per-module content-graph sidecars`)
    return
  }
  if (entry.contentGraphEvidencePolicy === 'legacy-fallback-only') {
    errors.push(`${rel(filePath)} contentGraphEvidencePolicy legacy-fallback-only cannot be used with a content-graph-evidence artifact`)
  }
  for (const artifact of evidenceRecords) {
    const name = String(artifact.file ?? artifact.name ?? '')
    if (artifact.role !== 'content-graph-evidence' && artifact.artifactRole !== 'content-graph-evidence') {
      errors.push(`${rel(filePath)} content graph evidence artifact must use role content-graph-evidence`)
    }
    if (name !== 'content-graph-evidence.json') {
      errors.push(`${rel(filePath)} content graph evidence artifact file must be content-graph-evidence.json`)
    }
    if (!artifact.url || !/^https:\/\/github\.com\/|^https:\/\/raw\.githubusercontent\.com\//.test(String(artifact.url))) {
      errors.push(`${rel(filePath)} content graph evidence artifact must use a GitHub HTTPS URL`)
    }
    if (!sha256Pattern.test(String(artifact.sha256 ?? ''))) {
      errors.push(`${rel(filePath)} content graph evidence artifact must include a valid sha256`)
    }
    if (artifact.runtimeTarget !== undefined && artifact.runtimeTarget !== 'content-graph') {
      errors.push(`${rel(filePath)} content graph evidence runtimeTarget must be content-graph`)
    }
    if (artifact.buildMode !== undefined && artifact.buildMode !== 'generated') {
      errors.push(`${rel(filePath)} content graph evidence buildMode must be generated`)
    }
    if (artifact.schemaVersion !== undefined && artifact.schemaVersion !== 'echo.content_graph.evidence.v1') {
      errors.push(`${rel(filePath)} content graph evidence schemaVersion must be echo.content_graph.evidence.v1`)
    }
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
    if (/^channels\/[^/]+\//.test(rel(filePath))) continue
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
      // Content-graph schemas are canonical in ECHO-SDK; mirrored copies keep the SDK $id.
      const sdkId = `https://raw.githubusercontent.com/knoxhack/ECHO-SDK/main/schemas/${schemaName}`
      if (schema.$id !== expectedId && schema.$id !== sdkId) {
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
  validateNativeLoaderDirectArtifactBoundaries(errors, filePath, entry)
  validateContentGraphArtifactPolicy(errors, filePath, entry)
  validateRequiredArtifactRoles(errors, warnings, filePath, entry)
  validateContentGraphEvidenceRole(errors, warnings, filePath, entry)
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

function validateLauncherChannel(errors, entryFiles, entriesByFile, channelName) {
  const launcherChannelPath = path.join(root, 'channels', channelName, 'launcher-channel.json')
  if (!fs.existsSync(launcherChannelPath)) return
  let channel
  try {
    channel = readJson(launcherChannelPath)
  } catch (error) {
    errors.push(`channels/${channelName}/launcher-channel.json is invalid JSON: ${error.message}`)
    return
  }
  if (channel.schemaVersion !== 1) errors.push(`channels/${channelName}/launcher-channel.json schemaVersion must be 1`)
  if (channel.channel !== channelName) errors.push(`channels/${channelName}/launcher-channel.json channel must be ${channelName}`)

  const catalogUrls = channel.catalogUrls
  if (!catalogUrls || typeof catalogUrls !== 'object' || Array.isArray(catalogUrls)) {
    errors.push(`channels/${channelName}/launcher-channel.json catalogUrls must be an object`)
    return
  }

  const referenced = new Set()
  const seenUrls = new Set()
  for (const dir of entryDirs) {
    const urls = catalogUrls[dir]
    if (!Array.isArray(urls)) {
      errors.push(`channels/${channelName}/launcher-channel.json catalogUrls.${dir} must be an array`)
      continue
    }
    for (const url of urls) {
      const value = String(url ?? '').trim()
      if (seenUrls.has(value)) errors.push(`channels/${channelName}/launcher-channel.json has duplicate catalog URL ${value}`)
      seenUrls.add(value)
      const relPath = rawIndexUrlToPath(value)
      if (!relPath) {
        errors.push(`channels/${channelName}/launcher-channel.json catalog URL must use canonical raw index URL: ${value}`)
        continue
      }
      if (!relPath.startsWith(`${dir}/`)) {
        errors.push(`channels/${channelName}/launcher-channel.json catalogUrls.${dir} points outside ${dir}: ${relPath}`)
      }
      if (!entryFiles.has(relPath)) {
        errors.push(`channels/${channelName}/launcher-channel.json references missing catalog entry ${relPath}`)
      }
      referenced.add(relPath)
    }
  }

  for (const entryFile of [...entryFiles].sort()) {
    if (!referenced.has(entryFile)) {
      errors.push(`channels/${channelName}/launcher-channel.json does not include catalog entry ${entryFile}`)
    }
  }

  const packs = Array.isArray(channel.packs) ? channel.packs : []
  for (const pack of packs) {
    const packId = String(pack?.id ?? '').trim()
    const catalogStatus = String(pack?.catalogStatus ?? '').trim().toLowerCase()
    if (!packId || catalogStatus !== 'approved') continue
    const catalogEntryUrl = String(pack?.catalogEntryUrl ?? '').trim()
    if (!catalogEntryUrl) {
      errors.push(`channels/${channelName}/launcher-channel.json marks ${packId} approved without catalogEntryUrl`)
      continue
    }
    const relPath = rawIndexUrlToPath(catalogEntryUrl)
    if (!relPath) {
      errors.push(`channels/${channelName}/launcher-channel.json approved pack ${packId} has non-canonical catalogEntryUrl: ${catalogEntryUrl}`)
      continue
    }
    const rows = entriesByFile.get(relPath) ?? []
    const modpack = rows.find((entry) => entry.kind === 'modpack' && entry.id === packId)
    if (!modpack) {
      errors.push(`channels/${channelName}/launcher-channel.json marks ${packId} approved, but ${relPath} does not define that modpack`)
      continue
    }
    if (modpack.validation !== 'approved') {
      errors.push(`channels/${channelName}/launcher-channel.json marks ${packId} approved, but ${relPath} validation is ${modpack.validation}`)
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
  const entriesByFile = new Map()
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
        const entryFile = rel(filePath)
        entryFiles.add(entryFile)
        entriesByFile.set(entryFile, [...(entriesByFile.get(entryFile) ?? []), row])
        if (row.id) {
          if (ids.has(row.id)) errors.push(`Duplicate release index id ${row.id}: ${ids.get(row.id)} and ${rel(filePath)}`)
          ids.set(row.id, rel(filePath))
          entries.push(row)
        }
      }
    }
  }
  validateLauncherChannel(errors, entryFiles, entriesByFile, 'alpha')
  validateLauncherChannel(errors, entryFiles, entriesByFile, 'beta')

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
