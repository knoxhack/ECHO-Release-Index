#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const DEFAULT_DOWNLOAD_EVIDENCE = 'release-readiness/galactic-survey-draft-download.json'
const SCHEMA_VERSION = 'echo.galactic_survey.first-launch-capture-prep.v1'
const TEMPLATE_MARKER = 'ECHO_GALACTIC_SURVEY_FIRST_LAUNCH_TEMPLATE_ONLY'
const REQUIRED_CAPTURE_FILES = [
  'launcher-handoff-notes.md',
  'official-launcher-open-notes.md',
  'first-open-play-notes.md',
  'no-crash-review.md',
  'screenshots/echo-managed-profile.png',
  'screenshots/minecraft-launcher-open.png',
  'screenshots/pack-profile-selected.png',
  'screenshots/world-or-title-loaded.png',
  'logs/echo-launcher-latest.log',
  'logs/minecraft-client.log',
  'support-bundles/echo-launcher-support.zip'
]

function usage() {
  return `Usage: node scripts/prepare-galactic-survey-first-launch-capture.mjs [options]

Creates a fail-closed capture folder for Galactic Survey first-launch/open-play
evidence. This command does not produce release evidence by itself.

Options:
  --root <path>               Release Index root. Default: current directory.
  --download-evidence <path>  GitHub download-back report. Default: ${DEFAULT_DOWNLOAD_EVIDENCE}
  --pack-id <id>              Pack id. Default: galactic-survey-native-edition
  --artifact <path>           Downloaded pack ZIP. Default: matching localPath from download evidence.
  --capture-root <path>       Output capture folder. Default: tmp/galactic-survey-first-launch-open-play/<timestamp>
  --minecraft-root <path>     Minecraft data root to inspect. Default: platform user .minecraft.
  --tester <name>             Tester/device/run identifier.
  --world-or-profile <name>   World or launcher profile intended for the run.
  --started-at <iso>          Intended or real run start timestamp.
  --open-launcher             Open the official Minecraft Launcher via minecraft:// after writing the kit.
  --force                     Allow writing into an existing capture folder.
  --help                      Print this help text.
`
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    downloadEvidence: DEFAULT_DOWNLOAD_EVIDENCE,
    packId: 'galactic-survey-native-edition',
    artifact: '',
    captureRoot: '',
    minecraftRoot: '',
    tester: '',
    worldOrProfile: '',
    startedAt: '',
    openLauncher: false,
    force: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--download-evidence') args.downloadEvidence = next()
    else if (arg === '--pack-id') args.packId = next()
    else if (arg === '--artifact') args.artifact = path.resolve(next())
    else if (arg === '--capture-root') args.captureRoot = path.resolve(next())
    else if (arg === '--minecraft-root') args.minecraftRoot = path.resolve(next())
    else if (arg === '--tester') args.tester = next()
    else if (arg === '--world-or-profile') args.worldOrProfile = next()
    else if (arg === '--started-at') args.startedAt = next()
    else if (arg === '--open-launcher') args.openLauncher = true
    else if (arg === '--force') args.force = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function timestampSlug(value = new Date()) {
  return value.toISOString().replace(/[:.]/gu, '-')
}

function resolveInside(root, relPath) {
  const target = path.resolve(root, relPath)
  const relative = path.relative(path.resolve(root), target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { error: 'outside-root', target }
  return { target }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
}

async function fileDigest(filePath) {
  const bytes = await fs.readFile(filePath)
  const stat = await fs.stat(filePath)
  return {
    size: stat.size,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function findExpectedDownloadedAsset(downloadEvidence, packId) {
  if (downloadEvidence?.status !== 'PASS') return null
  if (downloadEvidence?.summary?.downloadedFromGitHubRelease !== true) return null
  const edition = downloadEvidence?.data?.editions?.find((entry) => entry?.packId === packId)
  if (!edition) return null
  return edition.downloadedAssets?.find((asset) => String(asset?.name ?? '').endsWith('.zip')) ?? null
}

function defaultMinecraftRoot() {
  if (process.platform === 'win32' && process.env.APPDATA) return path.join(process.env.APPDATA, '.minecraft')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft')
  return path.join(os.homedir(), '.minecraft')
}

async function readMinecraftStatus(packId, minecraftRootOverride = '') {
  const minecraftRoot = minecraftRootOverride || defaultMinecraftRoot()
  const profilesPath = path.join(minecraftRoot, 'launcher_profiles.json')
  const versionMetadataPath = path.join(minecraftRoot, 'versions', 'echo-native-loader-1.0.0', 'echo-native-loader-1.0.0.json')
  const profiles = await readJson(profilesPath).catch(() => null)
  const expectedProfileId = `echo-${packId}-native-loader`
  const echoProfiles = Object.entries(profiles?.profiles ?? {})
    .filter(([, profile]) => profile?.echoManaged === true || /echo|galactic|ashfall/iu.test(`${profile?.name ?? ''} ${profile?.lastVersionId ?? ''}`))
    .map(([id, profile]) => ({
      id,
      name: profile?.name ?? '',
      gameDir: profile?.gameDir ?? '',
      lastVersionId: profile?.lastVersionId ?? '',
      echoManaged: profile?.echoManaged === true,
      echoProfileId: profile?.echoLauncher?.profileId ?? null
    }))
  const expectedProfile = echoProfiles.find((profile) =>
    profile.id === expectedProfileId ||
    profile.echoProfileId === packId ||
    /galactic survey native edition/iu.test(profile.name)
  ) ?? null
  return {
    minecraftRoot,
    launcherProfilesPath: profilesPath,
    launcherProfilesExists: Boolean(profiles),
    nativeLoaderVersionPath: versionMetadataPath,
    nativeLoaderVersionExists: await exists(versionMetadataPath),
    expectedProfileId,
    expectedProfilePresent: Boolean(expectedProfile),
    expectedProfile,
    echoProfiles
  }
}

function openMinecraftLauncher() {
  if (process.platform === 'win32') {
    const result = spawnSync('cmd.exe', ['/c', 'start', '', 'minecraft://'], {
      encoding: 'utf8',
      windowsHide: true
    })
    return {
      attempted: true,
      command: 'cmd.exe /c start "" minecraft://',
      status: result.status,
      opened: result.status === 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? ''
    }
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
  const result = spawnSync(command, ['minecraft://'], {
    encoding: 'utf8',
    windowsHide: true
  })
  return {
    attempted: true,
    command: `${command} minecraft://`,
    status: result.status,
    opened: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

function noteTemplate(title, body) {
  return `# ${title}

${TEMPLATE_MARKER}

${body}

Replace this template with real notes from the capture run. The importer rejects
this file while the template marker, TODO text, or placeholder language remains.
`
}

async function writeCaptureScaffold(captureRoot, report, importerCommand) {
  const noteFiles = new Map([
    ['launcher-handoff-notes.md', noteTemplate('Launcher Handoff Notes', 'Record the ECHO Launcher install path, the ECHO-managed Minecraft profile id, the Native Loader version id, and the visible result before opening Minecraft Launcher.')],
    ['official-launcher-open-notes.md', noteTemplate('Official Minecraft Launcher Open Notes', 'Record how the official launcher was opened, which account/profile was visible, and whether the Galactic Survey profile appeared without manual JSON edits.')],
    ['first-open-play-notes.md', noteTemplate('First Open Play Notes', 'Record the profile selected, Play action, loading result, and whether a title screen or world loaded from the published pack artifact.')],
    ['no-crash-review.md', noteTemplate('No Crash Review', 'Record the launcher/client log review, crash-report folder review, and any warnings that do not block the run.')]
  ])

  for (const [relPath, text] of noteFiles) {
    await writeText(path.join(captureRoot, relPath), text)
  }
  for (const relPath of ['screenshots', 'logs', 'support-bundles']) {
    await fs.mkdir(path.join(captureRoot, relPath), { recursive: true })
  }

  const readme = `# Galactic Survey First-Launch/Open-Play Capture

This folder is a capture kit, not release evidence yet.

Required files:

${REQUIRED_CAPTURE_FILES.map((file) => `- ${file}`).join('\n')}

Importer command:

\`\`\`powershell
${importerCommand}
\`\`\`

Do not remove the template markers from note files until they are replaced with
real observations from the run. Add real PNG screenshots, launcher/client logs,
and an ECHO support ZIP before importing.
`
  await writeText(path.join(captureRoot, 'README.md'), readme)
  await writeJson(path.join(captureRoot, 'capture-manifest.json'), report)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  const root = path.resolve(args.root)
  const blockers = []
  if (!args.packId.startsWith('galactic-survey-')) blockers.push(`pack id must be a Galactic Survey pack id: ${args.packId}`)
  if (!String(args.tester).trim()) blockers.push('--tester is required.')
  if (!String(args.worldOrProfile).trim()) blockers.push('--world-or-profile is required.')
  if (!Number.isFinite(Date.parse(args.startedAt))) blockers.push('--started-at must be an ISO timestamp.')

  const downloadEvidencePath = resolveInside(root, args.downloadEvidence)
  if (downloadEvidencePath.error) blockers.push(`Download evidence path must stay inside the Release Index: ${args.downloadEvidence}`)
  const downloadEvidence = downloadEvidencePath.error ? null : await readJson(downloadEvidencePath.target).catch(() => null)
  const expectedDownloadedAsset = findExpectedDownloadedAsset(downloadEvidence, args.packId)
  if (!expectedDownloadedAsset) blockers.push(`${args.downloadEvidence} does not contain a PASS GitHub download-back ZIP asset for ${args.packId}.`)

  const artifactPath = args.artifact
    || (expectedDownloadedAsset?.localPath ? path.resolve(root, expectedDownloadedAsset.localPath) : '')
  const artifact = artifactPath ? await fileDigest(artifactPath).catch(() => null) : null
  const artifactMatchesDownloadedRelease = Boolean(
    artifact &&
    expectedDownloadedAsset &&
    artifact.size === expectedDownloadedAsset.size &&
    artifact.sha256 === expectedDownloadedAsset.sha256
  )
  if (!artifact) blockers.push(`artifact does not exist or cannot be read: ${artifactPath || '<missing>'}`)
  else if (!artifactMatchesDownloadedRelease) blockers.push(`artifact ${path.basename(artifactPath)} does not match downloaded GitHub asset ${expectedDownloadedAsset?.name ?? '<missing>'}.`)

  const captureRoot = args.captureRoot || path.resolve(root, 'tmp', 'galactic-survey-first-launch-open-play', timestampSlug())
  if ((await exists(captureRoot)) && !args.force) blockers.push(`capture root already exists; pass --force to write into it: ${captureRoot}`)

  const minecraft = await readMinecraftStatus(args.packId, args.minecraftRoot)
  const openLauncherPrereqsMet = blockers.length === 0 && minecraft.expectedProfilePresent
  const openedLauncher = args.openLauncher && openLauncherPrereqsMet
    ? openMinecraftLauncher()
    : {
        attempted: args.openLauncher,
        opened: false,
        skipped: args.openLauncher && !openLauncherPrereqsMet,
        skipReason: args.openLauncher && !openLauncherPrereqsMet
          ? 'Artifact checks must pass and a real .minecraft Galactic Survey profile must exist before opening the official launcher.'
          : undefined
      }
  const importerCommand = [
    'node scripts\\import-galactic-survey-first-launch-evidence.mjs',
    `--capture-root ${JSON.stringify(captureRoot)}`,
    `--artifact ${JSON.stringify(artifactPath)}`,
    `--tester ${JSON.stringify(args.tester)}`,
    `--world-or-profile ${JSON.stringify(args.worldOrProfile)}`,
    `--started-at ${JSON.stringify(args.startedAt)}`,
    '--force'
  ].join(' ')

  const report = {
    schemaVersion: SCHEMA_VERSION,
    status: blockers.length === 0 ? 'READY_FOR_CAPTURE' : 'BLOCKED',
    generatedAt: new Date().toISOString(),
    packId: args.packId,
    captureRoot,
    releaseDownloadEvidence: args.downloadEvidence,
    run: {
      tester: args.tester,
      worldOrProfile: args.worldOrProfile,
      startedAt: args.startedAt
    },
    artifact: artifact
      ? {
          path: artifactPath,
          name: path.basename(artifactPath),
          size: artifact.size,
          sha256: artifact.sha256,
          expectedDownloadedAsset: expectedDownloadedAsset
            ? {
                name: expectedDownloadedAsset.name,
                size: expectedDownloadedAsset.size,
                sha256: expectedDownloadedAsset.sha256,
                browserDownloadUrl: expectedDownloadedAsset.browserDownloadUrl ?? null
              }
            : null,
          matchesDownloadedRelease: artifactMatchesDownloadedRelease
        }
      : null,
    minecraft,
    openLauncher: openedLauncher,
    requiredCaptureFiles: REQUIRED_CAPTURE_FILES,
    importerCommand,
    warnings: [
      'This capture kit is not release evidence.',
      'The first-launch importer must still reject this folder until template notes are replaced and real PNG screenshots, logs, and support bundle files are attached.',
      'Use the official Minecraft Launcher and the ECHO-managed Galactic Survey profile for the open/play run.',
      ...(!minecraft.expectedProfilePresent ? [`No real .minecraft Galactic Survey profile was detected yet. Run ECHO Launcher handoff for ${args.packId} before capturing profile-selected/open-play screenshots.`] : [])
    ],
    blockers
  }

  if (blockers.length === 0) {
    await writeCaptureScaffold(captureRoot, report, importerCommand)
  }

  console.log(JSON.stringify(report, null, 2))
  if (blockers.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
