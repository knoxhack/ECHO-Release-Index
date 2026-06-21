import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const productPath = path.join(process.cwd(), "products", "native-platform.json");
const downloadDir = "C:/Users/knox/AppData/Local/Temp/echo-native-1.0.7-download";
const version = "1.0.7";
const tag = "v1.0.7";
const commitSha = "7755f84ad40c5b4feea06a582c824a06b373a1c4";
const builtAt = "2026-06-21T05:31:30-04:00";
const artifactPath = "C:/Development/Github/ECHO-Native-Platform/build/public-alpha/echo-native-platform-1.0.7.zip";
const nativeLoaderPath = "C:/Development/Github/ECHO-Native-Platform/build/public-alpha/echo-native-loader-1.0.7.jar";
const nativeLoaderDirectInstallDescriptor = "C:/Development/Github/ECHO-Native-Platform/build/public-alpha/native-loader-direct-install.json";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function size(file) {
  return fs.statSync(file).size;
}

function url(file) {
  return `https://github.com/knoxhack/ECHO-Native-Platform/releases/download/${tag}/${file}`;
}

function artifact(file) {
  const p = path.join(downloadDir, file);
  return { file, url: url(file), sha256: sha256(p), size: size(p) };
}

const product = JSON.parse(fs.readFileSync(productPath, "utf8"));

product.version = version;
product.targetReleaseLine = version;
product.targetStableVersion = version;
product.releaseTag = tag;
product.commitSha = commitSha;
product.releaseUrl = `https://github.com/knoxhack/ECHO-Native-Platform/releases/tag/${tag}`;

product.artifacts.archive = {
  ...product.artifacts.archive,
  ...artifact(`echo-native-platform-${version}.zip`),
  status: "github-v1.0.7-published-download-smoked"
};
product.artifacts.checksums = { ...product.artifacts.checksums, ...artifact("checksums.txt") };
product.artifacts.echoReleaseMetadata = { ...product.artifacts.echoReleaseMetadata, ...artifact("echo-release.json") };
product.artifacts.nativeAddonSourceTruth = { ...product.artifacts.nativeAddonSourceTruth, ...artifact("native-addon-source-truth.md") };
product.artifacts.nativeLiveProofGate = { ...product.artifacts.nativeLiveProofGate, ...artifact("native-live-proof-gate.json") };
product.artifacts.nativeLoaderDirectInstall = { ...product.artifacts.nativeLoaderDirectInstall, ...artifact("native-loader-direct-install.json") };
product.artifacts.nativeModuleInventory = { ...product.artifacts.nativeModuleInventory, ...artifact("native-module-inventory.json") };
product.artifacts.plan3DependencyVulnerabilityScan = { ...product.artifacts.plan3DependencyVulnerabilityScan, ...artifact("plan3-dependency-vulnerability-scan.json") };
product.artifacts.plan3FinalQa = { ...product.artifacts.plan3FinalQa, ...artifact("plan3-final-qa.json") };
product.artifacts.plan3ReleasePrep = { ...product.artifacts.plan3ReleasePrep, ...artifact("plan3-release-prep.json") };
product.artifacts.nativeLoaderLibrary = {
  ...product.artifacts.nativeLoaderLibrary,
  ...artifact(`echo-native-loader-${version}.jar`),
  status: "github-v1.0.7-published-download-smoked"
};

product.provenance = {
  ...product.provenance,
  status: "github-v1.0.7-published-download-smoked",
  nativePlatformCommitSha: commitSha,
  commitSha,
  builtAt,
  buildCommand: ".\\gradlew.bat packageNativeLoaderClientLibrary packagePublicAlphaRelease --no-daemon --console=plain",
  artifactPath,
  githubReleaseUrl: `https://github.com/knoxhack/ECHO-Native-Platform/releases/tag/${tag}`,
  workflow: ".github/workflows/attest-release-assets.yml",
  workflowRef: "refs/heads/main",
  verifiedBy: "manual release asset checksum metadata and GitHub download smoke",
  attestation: {
    status: "pending-attestation",
    scope: "published-release-assets",
    reason: `v${version} assets are published and checksum/download-smoked; workflow attestation evidence is not attached yet.`
  },
  nativeLoaderPath,
  nativeLoaderDirectInstallDescriptor
};

product.validationReason = `Native Platform v${version} ships the runtime-only Native Loader client jar with checksum-pinned release assets, direct-install descriptor metadata, and passing native loader/runtime build gates while keeping pack content owned by pack/module releases.`;

product.directDistribution = {
  ...product.directDistribution,
  file: `echo-native-loader-${version}.jar`,
  minecraftLibrary: {
    name: `com.echo:native-loader:${version}`,
    path: `com/echo/native-loader/${version}/native-loader-${version}.jar`
  }
};

fs.writeFileSync(productPath, JSON.stringify(product, null, 2) + "\n");
console.log("Updated products/native-platform.json to " + version);
