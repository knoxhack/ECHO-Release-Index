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
const errors = []
const rawIndexPrefix = 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/'
const arcanaPackIds = [
  'arcana-division-native-edition',
  'arcana-division-neoforge-edition',
  'arcana-division-standalone-edition',
]
const arcanaModpackFiles = [
  'modpacks/arcana-division-native.json',
  'modpacks/arcana-division-neoforge.json',
  'modpacks/arcana-division-standalone.json',
]
const arcanaPackFiles = [
  'packs/arcana-division-native-edition.json',
  'packs/arcana-division-neoforge-edition.json',
  'packs/arcana-division-standalone-edition.json',
]
const expectedArcanaModuleRequirementCount = 39

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`Missing required beta file: ${relativePath}`)
}

for (const file of [
  'channels/beta.json',
  'channels/beta/launcher-channel.json',
  'channels/beta/release-manifest.json',
  'channels/beta/repositories.json',
  'addons/echoarcanadivisionprotocol.json',
  ...arcanaModpackFiles,
  ...arcanaPackFiles,
]) {
  requireFile(file)
}

if (!errors.length) {
  const beta = readJson('channels/beta.json')
  if (beta.id !== 'beta' || beta.stability !== 'beta') errors.push('channels/beta.json must define the beta channel')

  const launcherChannel = readJson('channels/beta/launcher-channel.json')
  if (launcherChannel.channel !== 'beta') errors.push('channels/beta/launcher-channel.json channel must be beta')

  const modpackUrls = new Set(launcherChannel.catalogUrls?.modpacks ?? [])
  const addonUrls = new Set(launcherChannel.catalogUrls?.addons ?? [])
  const packRows = launcherChannel.packs ?? []
  for (const file of arcanaModpackFiles) {
    const url = `${rawIndexPrefix}${file}`
    if (!modpackUrls.has(url)) errors.push(`beta launcher channel missing catalog URL ${url}`)
  }
  if (!addonUrls.has(`${rawIndexPrefix}addons/echoarcanadivisionprotocol.json`)) {
    errors.push('beta launcher channel missing Arcana protocol addon URL')
  }
  for (const packId of arcanaPackIds) {
    const pack = packRows.find((row) => row.id === packId)
    if (!pack) {
      errors.push(`beta launcher channel missing pack row ${packId}`)
      continue
    }
    if (pack.channel !== 'beta') errors.push(`${packId} pack row must use beta channel`)
    if (!String(pack.manifestUrl ?? '').startsWith(rawIndexPrefix)) errors.push(`${packId} manifestUrl must use canonical raw index URL`)
  }

  for (const file of arcanaModpackFiles) {
    const entry = readJson(file)
    if (entry.channel !== 'beta') errors.push(`${file} must use beta channel`)
    if (entry.validation !== 'approved') errors.push(`${file} must be approved after published artifact indexing`)
    if (!entry.artifacts?.manifest?.url || !/^[a-f0-9]{64}$/i.test(entry.artifacts.manifest.sha256 ?? '')) {
      errors.push(`${file} must include an exact manifest artifact`)
    }
    if (!entry.dependencies?.some((dependency) => dependency.id === 'echoarcanadivisionprotocol')) {
      errors.push(`${file} must depend on echoarcanadivisionprotocol`)
    }
  }

  for (const file of arcanaPackFiles) {
    const pack = readJson(file)
    if (pack.channel !== 'beta') errors.push(`${file} must use beta channel`)
    if ((pack.moduleRequirements ?? []).length !== expectedArcanaModuleRequirementCount) {
      errors.push(`${file} must pin ${expectedArcanaModuleRequirementCount} module requirements`)
    }
  }
}

if (errors.length) {
  console.error(`Public beta validation failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Public beta metadata validation passed.')
