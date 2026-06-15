#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    manifest: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--manifest') args.manifest = path.resolve(argv[++index])
    else if (arg === '--root') args.root = path.resolve(argv[++index])
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.manifest) throw new Error('--manifest is required')
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function artifactBaseUrl(templateUrl, filename) {
  if (!templateUrl) return undefined
  const base = String(templateUrl)
  const lastSlash = base.lastIndexOf('/')
  if (lastSlash < 0) return undefined
  return `${base.slice(0, lastSlash + 1)}${encodeURIComponent(filename)}`
}

async function patchEntry(entryPath, moduleRecord, graphArtifact) {
  const entry = await readJson(entryPath)
  const templateArtifact = Object.values(entry.artifacts ?? {}).find((a) => a.url)
  const url = artifactBaseUrl(templateArtifact?.url, graphArtifact.filename)

  entry.artifacts = entry.artifacts ?? {}
  entry.artifacts['content-graph'] = {
    file: graphArtifact.filename,
    sha256: graphArtifact.sha256,
    size: graphArtifact.size,
    url,
    runtimeTarget: 'content-graph',
    buildMode: 'generated',
    contains: graphArtifact.contains ?? ['.echo/content-graph/content-graph.json'],
  }

  await fs.writeFile(entryPath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  return entry.id ?? moduleRecord.moduleId
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifest = await readJson(args.manifest)
  const modulesDir = path.join(args.root, 'modules')
  const addonsDir = path.join(args.root, 'addons')
  const written = []
  const skipped = []

  for (const moduleRecord of manifest.modules ?? []) {
    const graphArtifact = (moduleRecord.artifacts ?? []).find((a) => a.kind === 'content-graph')
    if (!graphArtifact) {
      skipped.push(moduleRecord.moduleId)
      continue
    }

    const moduleEntryPath = path.join(modulesDir, `${moduleRecord.moduleId}.json`)
    try {
      written.push(await patchEntry(moduleEntryPath, moduleRecord, graphArtifact))
    } catch {
      skipped.push(moduleRecord.moduleId)
    }

    const addonEntryPath = path.join(addonsDir, `${moduleRecord.moduleId}.json`)
    try {
      written.push(await patchEntry(addonEntryPath, moduleRecord, graphArtifact))
    } catch {
      // addon entry is optional
    }
  }

  console.log(`Patched ${written.length} entr${written.length === 1 ? 'y' : 'ies'} with content-graph artifact.`)
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} module(s): ${skipped.join(', ')}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
