#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { readJson, writeJson } from './public-alpha-common.mjs'

const DEFAULT_READINESS = 'release-readiness/sky-relay-public-alpha-readiness.json'
const DEFAULT_GAMEPLAY = 'release-readiness/sky-relay-gameplay-evidence.json'
const DEFAULT_WORK_ORDER = 'release-readiness/sky-relay-manual-gameplay-work-order.json'
const DEFAULT_ADDON = 'addons/echoskyrelayprotocol.json'
const EDITIONS = [
  {
    key: 'native',
    packId: 'sky-relay-native-edition',
    modpack: 'modpacks/sky-relay-native.json',
    pack: 'packs/sky-relay-native-edition.json',
  },
  {
    key: 'neoforge',
    packId: 'sky-relay-neoforge-edition',
    modpack: 'modpacks/sky-relay-neoforge.json',
    pack: 'packs/sky-relay-neoforge-edition.json',
  },
  {
    key: 'standalone',
    packId: 'sky-relay-standalone-edition',
    modpack: 'modpacks/sky-relay-standalone.json',
    pack: 'packs/sky-relay-standalone-edition.json',
  },
]
const PROMOTION_REASON = 'Sky Relay public alpha passed module, artifact, launcher, route, and real manual gameplay evidence gates for Native, NeoForge, and Standalone editions.'

function usage() {
  return `Usage: node scripts/promote-sky-relay-public-alpha.mjs [options]

Promotes Sky Relay Release Index catalog validation from warning to approved
only after the 10-phase public-alpha readiness report, gameplay evidence report,
and manual gameplay work order are fully green. Dry run is the default; use
--write to edit catalog files.

Options:
  --root <dir>        Release Index repository root. Default: current directory.
  --readiness <path>  Public alpha readiness report. Default: ${DEFAULT_READINESS}.
  --gameplay <path>   Gameplay evidence report. Default: ${DEFAULT_GAMEPLAY}.
  --work-order <path> Manual gameplay work order. Default: ${DEFAULT_WORK_ORDER}.
  --addon <path>      Sky Relay addon catalog path. Default: ${DEFAULT_ADDON}.
  --write             Write approved catalog metadata.
  --help              Print this help text.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    readiness: DEFAULT_READINESS,
    gameplay: DEFAULT_GAMEPLAY,
    workOrder: DEFAULT_WORK_ORDER,
    addon: DEFAULT_ADDON,
    write: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--readiness') args.readiness = next()
    else if (arg === '--gameplay') args.gameplay = next()
    else if (arg === '--work-order') args.workOrder = next()
    else if (arg === '--addon') args.addon = next()
    else if (arg === '--write') args.write = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  for (const key of ['readiness', 'gameplay', 'workOrder', 'addon']) {
    args[key] = path.isAbsolute(args[key]) ? args[key] : path.join(args.root, args[key])
  }
  args.editions = EDITIONS.map((edition) => ({
    ...edition,
    modpack: path.join(args.root, edition.modpack),
    pack: path.join(args.root, edition.pack),
  }))
  return args
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function isPassedGateMap(gates) {
  return gates && typeof gates === 'object' && Object.values(gates).every((value) => value === 'passed')
}

function requireNoBlockers(findings, label, value) {
  if (!Array.isArray(value)) findings.push(`${label} blockers must be an array.`)
  else if (value.length) findings.push(`${label} must have no blockers, found ${value.length}.`)
}

function validateReadiness(readiness, findings) {
  if (readiness.schemaVersion !== 'echo.skyrelay.public-alpha-readiness.v1') {
    findings.push(`readiness schemaVersion must be echo.skyrelay.public-alpha-readiness.v1, found ${readiness.schemaVersion ?? '(missing)'}.`)
  }
  if (readiness.status !== 'PASS') findings.push(`readiness status must be PASS, found ${readiness.status ?? '(missing)'}.`)
  if (!isPassedGateMap(readiness.gates)) findings.push('all public-alpha readiness gates must be passed.')
  if (!Array.isArray(readiness.phaseSummary) || readiness.phaseSummary.length !== 10) {
    findings.push('readiness phaseSummary must include 10 phases.')
  } else {
    const blocked = readiness.phaseSummary.filter((phase) => phase.status !== 'passed')
    if (blocked.length) findings.push(`all readiness phases must be passed, blocked: ${blocked.map((phase) => phase.id ?? phase.phase).join(', ')}.`)
  }
  if (readiness.promotion?.eligible !== true) findings.push('readiness promotion.eligible must be true.')
  if (readiness.promotion?.warningValidationCanBeRemoved !== true) findings.push('readiness promotion.warningValidationCanBeRemoved must be true.')
  if (readiness.promotion?.publicAlphaCanBeDeclaredReady !== true) findings.push('readiness promotion.publicAlphaCanBeDeclaredReady must be true.')
  requireNoBlockers(findings, 'readiness', readiness.blockers)
}

function validateGameplay(gameplay, findings) {
  if (gameplay.schemaVersion !== 'echo.skyrelay.gameplay-evidence.v1') {
    findings.push(`gameplay schemaVersion must be echo.skyrelay.gameplay-evidence.v1, found ${gameplay.schemaVersion ?? '(missing)'}.`)
  }
  if (gameplay.status !== 'PASS') findings.push(`gameplay status must be PASS, found ${gameplay.status ?? '(missing)'}.`)
  if (!isPassedGateMap(gameplay.gates)) findings.push('all gameplay evidence gates must be passed.')
  requireNoBlockers(findings, 'gameplay', gameplay.blockers)
  for (const edition of EDITIONS) {
    const report = (gameplay.editions ?? []).find((candidate) => candidate.edition === edition.key)
    if (!report) {
      findings.push(`gameplay report missing ${edition.key} edition summary.`)
      continue
    }
    for (const [claim, value] of Object.entries(report.claims ?? {})) {
      if (value !== true) findings.push(`${edition.key} gameplay claim ${claim} must be true.`)
    }
    for (const group of ['supportingFiles', 'screenshots', 'logs', 'saveSnapshots']) {
      if (!Array.isArray(report.checked?.[group]) || report.checked[group].length === 0) {
        findings.push(`${edition.key} gameplay checked.${group} must include accepted files.`)
      }
    }
  }
}

function validateWorkOrder(workOrder, findings) {
  if (workOrder.schemaVersion !== 'echo.skyrelay.manual-gameplay-work-order.v1') {
    findings.push(`work order schemaVersion must be echo.skyrelay.manual-gameplay-work-order.v1, found ${workOrder.schemaVersion ?? '(missing)'}.`)
  }
  if (workOrder.status !== 'COMPLETE') findings.push(`work order status must be COMPLETE, found ${workOrder.status ?? '(missing)'}.`)
  if (workOrder.totals?.openEditions !== 0) findings.push(`work order openEditions must be 0, found ${workOrder.totals?.openEditions ?? '(missing)'}.`)
  if (workOrder.totals?.openTasks !== 0) findings.push(`work order openTasks must be 0, found ${workOrder.totals?.openTasks ?? '(missing)'}.`)
  for (const edition of workOrder.editions ?? []) {
    if (edition.status !== 'complete') findings.push(`work order edition ${edition.edition ?? '(unknown)'} must be complete.`)
  }
}

function validateArtifactRecord(findings, label, artifact) {
  if (!artifact || typeof artifact !== 'object') {
    findings.push(`${label} artifact is missing.`)
    return
  }
  if (typeof artifact.file !== 'string' || artifact.file.trim() === '') findings.push(`${label} artifact file is missing.`)
  if (typeof artifact.url !== 'string' || !artifact.url.startsWith('https://github.com/')) findings.push(`${label} artifact URL must be a GitHub URL.`)
  if (!/^[a-f0-9]{64}$/iu.test(String(artifact.sha256 ?? ''))) findings.push(`${label} artifact SHA-256 is invalid.`)
  if (!(Number(artifact.size) > 0)) findings.push(`${label} artifact size must be positive.`)
}

function validateCatalogEntries({ addon, modpacks, packs }, gameplay, findings) {
  if (addon.id !== 'echoskyrelayprotocol') findings.push(`addon id must be echoskyrelayprotocol, found ${addon.id ?? '(missing)'}.`)
  if (!['warning', 'approved'].includes(addon.validation)) findings.push(`addon validation must be warning or approved before promotion, found ${addon.validation ?? '(missing)'}.`)
  for (const role of ['native', 'neoforge', 'standalone', 'sources', 'checksums', 'releaseManifest']) {
    validateArtifactRecord(findings, `addon ${role}`, addon.artifacts?.[role])
  }

  for (const edition of EDITIONS) {
    const modpack = modpacks.get(edition.key)
    const pack = packs.get(edition.key)
    const expectedArtifact = gameplay.requiredEvidence?.packArtifacts?.[edition.key]
    if (!modpack) {
      findings.push(`${edition.key} modpack catalog is missing.`)
      continue
    }
    if (!pack) findings.push(`${edition.key} launcher pack manifest is missing.`)
    if (modpack.id !== edition.packId) findings.push(`${edition.key} modpack id must be ${edition.packId}, found ${modpack.id ?? '(missing)'}.`)
    if (!['warning', 'approved'].includes(modpack.validation)) findings.push(`${edition.key} modpack validation must be warning or approved before promotion, found ${modpack.validation ?? '(missing)'}.`)
    for (const role of ['pack', 'manifest', 'checksums', 'releaseManifest']) {
      validateArtifactRecord(findings, `${edition.key} modpack ${role}`, modpack.artifacts?.[role])
    }
    if (expectedArtifact) {
      const packArtifact = modpack.artifacts?.pack
      if (packArtifact?.file !== expectedArtifact.artifactAsset) findings.push(`${edition.key} pack artifact file must match gameplay required artifact.`)
      if (packArtifact?.sha256 !== expectedArtifact.artifactSha256) findings.push(`${edition.key} pack artifact SHA-256 must match gameplay required artifact.`)
      if (Number(packArtifact?.size) !== Number(expectedArtifact.artifactSize)) findings.push(`${edition.key} pack artifact size must match gameplay required artifact.`)
    }
  }
}

function promotionEvidence(readiness, args) {
  return {
    status: 'approved',
    approvedAt: readiness.generatedAt,
    reports: [
      rel(args.root, args.readiness),
      rel(args.root, args.gameplay),
      rel(args.root, args.workOrder),
      'release-readiness/sky-relay-module-draft-release.json',
      'release-readiness/sky-relay-edition-draft-releases.json',
      'release-readiness/sky-relay-edition-pack-assets.json',
      'release-readiness/sky-relay-edition-pack-smoke.json',
      'release-readiness/sky-relay-launcher-lifecycle-smoke.json',
      'release-readiness/sky-relay-electron-ui-smoke.json',
      'release-readiness/sky-relay-gameplay-route-smoke.json',
    ],
  }
}

function promotedEntry(entry, readiness, args) {
  const next = structuredClone(entry)
  next.trust = 'source-linked'
  next.validation = 'approved'
  next.validationReason = PROMOTION_REASON
  next.promotionEvidence = promotionEvidence(readiness, args)
  return next
}

function assetFromArtifact(artifact) {
  return {
    name: artifact.file,
    size: artifact.size,
    sha256: artifact.sha256,
    browserDownloadUrl: artifact.url,
  }
}

function promotedPack(pack, modpack, readiness, args) {
  const next = structuredClone(pack)
  next.releaseReadiness = {
    ...promotionEvidence(readiness, args),
    blockers: [],
  }
  next.assets = Object.values(modpack.artifacts ?? {})
    .filter((artifact) => artifact?.file && artifact?.url && artifact?.sha256)
    .map(assetFromArtifact)
  return next
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  const readiness = await readJson(args.readiness)
  const gameplay = await readJson(args.gameplay)
  const workOrder = await readJson(args.workOrder)
  const addon = await readJson(args.addon)
  const modpacks = new Map()
  const packs = new Map()
  for (const edition of args.editions) {
    modpacks.set(edition.key, await readJson(edition.modpack))
    packs.set(edition.key, await readJson(edition.pack))
  }

  const findings = []
  validateReadiness(readiness, findings)
  validateGameplay(gameplay, findings)
  validateWorkOrder(workOrder, findings)
  validateCatalogEntries({ addon, modpacks, packs }, gameplay, findings)

  if (findings.length) {
    process.stderr.write(`Sky Relay public-alpha promotion refused with ${findings.length} blocker(s):\n`)
    for (const finding of findings) process.stderr.write(`- ${finding}\n`)
    process.exitCode = 1
    return
  }

  const nextAddon = promotedEntry(addon, readiness, args)
  const nextModpacks = new Map()
  const nextPacks = new Map()
  for (const edition of args.editions) {
    const nextModpack = promotedEntry(modpacks.get(edition.key), readiness, args)
    nextModpacks.set(edition.key, nextModpack)
    nextPacks.set(edition.key, promotedPack(packs.get(edition.key), nextModpack, readiness, args))
  }

  if (args.write) {
    await writeJson(args.addon, nextAddon)
    for (const edition of args.editions) {
      await writeJson(edition.modpack, nextModpacks.get(edition.key))
      await writeJson(edition.pack, nextPacks.get(edition.key))
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    write: args.write,
    addon: rel(args.root, args.addon),
    modpacks: args.editions.map((edition) => rel(args.root, edition.modpack)),
    packs: args.editions.map((edition) => rel(args.root, edition.pack)),
    validation: 'approved',
    trust: 'source-linked',
    evidence: promotionEvidence(readiness, args).reports,
  }, null, 2)}\n`)
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exit(1)
})
