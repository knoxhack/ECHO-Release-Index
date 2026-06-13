import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const entryDirs = ['products', 'modpacks', 'modules', 'addons']
const rawIndexPrefix = 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/'

function parseArgs(argv) {
  const args = { check: false, channels: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--check') args.check = true
    else if (arg === '--channel') args.channels.push(argv[++index])
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function listCatalogPaths(dir) {
  const dirPath = path.join(root, dir)
  const files = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => [])
  const catalogPaths = []
  for (const entry of files) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const filePath = path.join(dirPath, entry.name)
    const payload = await readJson(filePath)
    if (payload?.$schema) continue
    catalogPaths.push(`${dir}/${entry.name}`)
  }
  return catalogPaths.sort((a, b) => a.localeCompare(b))
}

function urlForCatalogPath(relPath) {
  return `${rawIndexPrefix}${relPath}`
}

function pathForCatalogUrl(url) {
  const value = String(url ?? '').trim()
  return value.startsWith(rawIndexPrefix) ? value.slice(rawIndexPrefix.length) : null
}

function syncUrlList(existingUrls = [], requiredPaths) {
  const required = new Set(requiredPaths)
  const used = new Set()
  const next = []

  for (const url of existingUrls) {
    const relPath = pathForCatalogUrl(url)
    if (!relPath || !required.has(relPath) || used.has(relPath)) continue
    used.add(relPath)
    next.push(urlForCatalogPath(relPath))
  }

  for (const relPath of requiredPaths) {
    if (used.has(relPath)) continue
    used.add(relPath)
    next.push(urlForCatalogPath(relPath))
  }

  return next
}

async function channelNames(args) {
  if (args.channels.length) return args.channels
  const channelDir = path.join(root, 'channels')
  const entries = await fs.readdir(channelDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

async function syncChannel(channelName, catalogPathsByDir, args) {
  const channelPath = path.join(root, 'channels', channelName, 'launcher-channel.json')
  const channel = await readJson(channelPath)
  const next = {
    ...channel,
    catalogUrls: {
      ...(channel.catalogUrls ?? {}),
    },
  }

  for (const dir of entryDirs) {
    next.catalogUrls[dir] = syncUrlList(channel.catalogUrls?.[dir] ?? [], catalogPathsByDir.get(dir) ?? [])
  }

  const currentCatalogUrls = `${JSON.stringify(channel.catalogUrls ?? {}, null, 2)}\n`
  const nextCatalogUrls = `${JSON.stringify(next.catalogUrls, null, 2)}\n`
  if (currentCatalogUrls === nextCatalogUrls) return null

  next.generatedAt = new Date().toISOString()
  if (!args.check) await writeJson(channelPath, next)
  return path.relative(root, channelPath).replace(/\\/g, '/')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const catalogPathsByDir = new Map()
  for (const dir of entryDirs) {
    catalogPathsByDir.set(dir, await listCatalogPaths(dir))
  }

  const changed = []
  for (const channelName of await channelNames(args)) {
    const result = await syncChannel(channelName, catalogPathsByDir, args)
    if (result) changed.push(result)
  }

  if (args.check && changed.length) {
    console.error(`Launcher channel catalog is stale: ${changed.join(', ')}`)
    process.exitCode = 1
    return
  }
  console.log(changed.length ? `Updated ${changed.join(', ')}` : 'Launcher channel catalog is up to date.')
}

await main()
