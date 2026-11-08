// Pilot staging cô lập: kiểm gói, cây đã cài và bản trả lời qua HTTP.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  createReadStream,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";

const buildDir = ".next-ci";
const cacheDir = `${buildDir}/cache`;
const manifestFile = ".next-ci.pilot.json";
const markerFile = "public/__xboss-pilot-build.json";
const sourceShaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const buildIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const staticAssetPattern = /^\.next-ci\/static\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.js$/;
const dependencyLinkPattern =
  /^\.next-ci\/node_modules\/(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const dependencyTargetPattern = /^node_modules\/(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

class PilotError extends Error {
  constructor(code, status = "failed") {
    super(code);
    this.status = status;
  }
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileDigest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

// Next tạo liên kết đến dependency từ lockfile. Kiểm chính đích ghi trong liên kết,
// kể cả trước khi npm ci có thư mục đích. Dạng chuẩn loại các đường vòng qua thư mục khác.
function dependencyLink(file, path) {
  const target = readlinkSync(file);
  const directory = posix.dirname(path);
  const dependency = posix.normalize(posix.join(directory, target));
  if (
    !dependencyLinkPattern.test(path) ||
    !dependencyTargetPattern.test(dependency) ||
    target !== posix.relative(directory, dependency)
  ) {
    throw new PilotError("unsupported_artifact_entry");
  }
  return { path, link_target: target };
}

// Cùng thứ tự ở lúc đóng gói và kiểm. Cache do Next ghi lúc chạy nằm ngoài gói.
async function fileHashes(root, path) {
  const directory = join(root, path);
  if (!lstatSync(directory).isDirectory()) throw new PilotError("invalid_tree_directory");

  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const relative = `${path}/${name}`;
    const file = join(root, relative);
    const stat = lstatSync(file);
    if (relative === cacheDir && stat.isDirectory()) continue;
    if (stat.isDirectory()) files.push(...(await fileHashes(root, relative)));
    else if (stat.isFile()) files.push({ path: relative, sha256: await fileDigest(file) });
    else if (stat.isSymbolicLink()) files.push(dependencyLink(file, relative));
    else throw new PilotError("unsupported_artifact_entry");
  }
  return files;
}

function tar(args) {
  try {
    execFileSync("tar", args, { stdio: "ignore", env: { ...process.env, TAR_OPTIONS: "" } });
  } catch {
    throw new PilotError("archive_operation_failed");
  }
}

function parseJson(bytes, errorCode) {
  try {
    return JSON.parse(bytes);
  } catch {
    throw new PilotError(errorCode);
  }
}

async function pack(project, sourceSha, archive, metadataPath) {
  if (!sourceShaPattern.test(sourceSha)) throw new PilotError("invalid_source_sha");

  const buildId = readFileSync(join(project, buildDir, "BUILD_ID"), "utf8").trim();
  if (!buildIdPattern.test(buildId)) throw new PilotError("invalid_build_id");
  const buildFiles = await fileHashes(project, buildDir);
  const staticAssets = buildFiles.filter(({ path }) => staticAssetPattern.test(path));
  const staticAsset =
    staticAssets.find(({ path }) => path === `${buildDir}/static/${buildId}/_buildManifest.js`) ??
    staticAssets[0];
  if (!staticAsset) throw new PilotError("missing_next_static_asset");

  // Marker chỉ được sinh trong gói pilot. public/ của checkout vẫn là đầu vào chỉ đọc.
  const scratch = mkdtempSync(join(tmpdir(), "xboss-artifact-pilot-"));
  try {
    cpSync(join(project, "public"), join(scratch, "public"), {
      recursive: true,
      verbatimSymlinks: true,
    });
    const marker = {
      schema: 1,
      source_sha: sourceSha,
      build_id: buildId,
      build_manifest_sha256: digest(JSON.stringify(buildFiles)),
    };
    writeFileSync(join(scratch, markerFile), JSON.stringify(marker) + "\n", { flag: "wx" });

    const manifest = {
      schema: 1,
      source_sha: sourceSha,
      build_id: buildId,
      static_asset: staticAsset.path,
      files: [...buildFiles, ...(await fileHashes(scratch, "public"))],
    };
    const manifestBytes = JSON.stringify(manifest) + "\n";
    writeFileSync(join(scratch, manifestFile), manifestBytes);

    tar([
      "--create",
      "--gzip",
      "--file",
      resolve(archive),
      `--exclude=${cacheDir}`,
      "-C",
      resolve(project),
      buildDir,
      "-C",
      scratch,
      "public",
      manifestFile,
    ]);
    const metadata = {
      schema: 1,
      source_sha: sourceSha,
      build_id: buildId,
      archive_sha256: await fileDigest(archive),
      manifest_sha256: digest(manifestBytes),
    };
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", { flag: "wx" });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function readMetadata(path) {
  const metadata = parseJson(readFileSync(path, "utf8"), "invalid_artifact_metadata");
  if (
    metadata?.schema !== 1 ||
    typeof metadata.source_sha !== "string" ||
    !sourceShaPattern.test(metadata.source_sha) ||
    typeof metadata.build_id !== "string" ||
    !buildIdPattern.test(metadata.build_id) ||
    typeof metadata.archive_sha256 !== "string" ||
    !digestPattern.test(metadata.archive_sha256) ||
    typeof metadata.manifest_sha256 !== "string" ||
    !digestPattern.test(metadata.manifest_sha256)
  ) {
    throw new PilotError("invalid_artifact_metadata");
  }
  const expectedSource = process.env.XT_PILOT_SOURCE_SHA ?? process.env.GITHUB_SHA;
  if (!expectedSource || metadata.source_sha !== expectedSource) {
    throw new PilotError("source_sha_mismatch");
  }
  return metadata;
}

async function verifyArchive(archive, metadata) {
  const actual = await fileDigest(archive);
  if (actual !== metadata.archive_sha256) throw new PilotError("archive_digest_mismatch");
  return actual;
}

async function verifyInstalled(releaseDir, metadata) {
  const manifestBytes = readFileSync(join(releaseDir, manifestFile));
  const actualDigest = digest(manifestBytes);
  if (actualDigest !== metadata.manifest_sha256) throw new PilotError("manifest_digest_mismatch");
  const manifest = parseJson(manifestBytes, "invalid_artifact_manifest");
  if (
    manifest?.schema !== 1 ||
    manifest.source_sha !== metadata.source_sha ||
    manifest.build_id !== metadata.build_id ||
    typeof manifest.static_asset !== "string" ||
    !staticAssetPattern.test(manifest.static_asset) ||
    !Array.isArray(manifest.files)
  ) {
    throw new PilotError("invalid_artifact_manifest");
  }

  const actualFiles = [
    ...(await fileHashes(releaseDir, buildDir)),
    ...(await fileHashes(releaseDir, "public")),
  ];
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
    throw new PilotError("installed_tree_mismatch");
  }
  const marker = actualFiles.find(({ path }) => path === markerFile);
  const asset = actualFiles.find(({ path }) => path === manifest.static_asset);
  if (!marker || !asset) throw new PilotError("missing_runtime_probe_files");

  return { manifestDigest: actualDigest, marker, asset };
}

async function install(archive, metadataPath, releaseDir) {
  const metadata = readMetadata(metadataPath);
  await verifyArchive(archive, metadata);
  if (!lstatSync(releaseDir).isDirectory() || readdirSync(releaseDir).length !== 0) {
    throw new PilotError("release_directory_must_be_empty");
  }

  tar([
    "--extract",
    "--gzip",
    "--file",
    resolve(archive),
    "--no-same-owner",
    "--no-same-permissions",
    "-C",
    resolve(releaseDir),
  ]);
  await verifyInstalled(releaseDir, metadata);
}

function receiptContext() {
  const context = {
    repository: process.env.GITHUB_REPOSITORY,
    environment: process.env.XT_PILOT_ENVIRONMENT,
    run_id: process.env.GITHUB_RUN_ID,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT,
    deployment_id: process.env.XT_PILOT_DEPLOYMENT_ID,
  };
  if (
    !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(context.repository ?? "") ||
    !/^staging(?:-[a-z0-9-]+)?$/.test(context.environment ?? "") ||
    !/^[1-9][0-9]*$/.test(context.run_id ?? "") ||
    !/^[1-9][0-9]*$/.test(context.run_attempt ?? "") ||
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(context.deployment_id ?? "")
  ) {
    throw new PilotError("invalid_staging_context");
  }
  return context;
}

function loopbackOrigin(base) {
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new PilotError("invalid_loopback_origin");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new PilotError("invalid_loopback_origin");
  }
  return url.origin;
}

async function probe(receipt, origin, name, path, check) {
  const result = { name };
  receipt.probes.push(result);
  const url = new URL(path, origin);
  // Buộc quan sát bản trả lời tại thời điểm kiểm, không dùng response cache từ lượt trước.
  url.searchParams.set("xt_probe", randomUUID());
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "Cache-Control": "no-cache, no-store" },
    });
    result.http_status = response.status;
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new PilotError("unexpected_http_status");
    }
    check(Buffer.from(await response.arrayBuffer()), result);
    result.status = "passed";
  } catch (error) {
    const outcome =
      error instanceof PilotError ? error : new PilotError("probe_unavailable", "inconclusive");
    result.status = outcome.status;
    result.error = outcome.message;
    throw outcome;
  }
}

async function verify(archive, metadataPath, releaseDir, baseUrl, receiptPath) {
  const receipt = {
    schema: 1,
    status: "inconclusive",
    source_sha: null,
    expected_artifact_sha256: null,
    verified_archive_sha256: null,
    installed_manifest_sha256: null,
    observed_build_id: null,
    probes: [],
  };
  try {
    Object.assign(receipt, receiptContext());
    const origin = loopbackOrigin(baseUrl);
    const metadata = readMetadata(metadataPath);
    receipt.source_sha = metadata.source_sha;
    receipt.expected_artifact_sha256 = metadata.archive_sha256;
    receipt.verified_archive_sha256 = await verifyArchive(archive, metadata);

    const installed = await verifyInstalled(releaseDir, metadata);
    receipt.installed_manifest_sha256 = installed.manifestDigest;
    await probe(receipt, origin, "build_marker", "/__xboss-pilot-build.json", (bytes, result) => {
      const marker = parseJson(bytes, "invalid_runtime_marker");
      if (typeof marker?.build_id === "string" && buildIdPattern.test(marker.build_id)) {
        receipt.observed_build_id = marker.build_id;
      }
      result.observed_sha256 = digest(bytes);
      if (
        receipt.observed_build_id !== metadata.build_id ||
        result.observed_sha256 !== installed.marker.sha256
      ) {
        throw new PilotError("runtime_marker_mismatch");
      }
    });
    const assetPath = installed.asset.path.slice(buildDir.length);
    await probe(receipt, origin, "static_asset", `/_next${assetPath}`, (bytes, result) => {
      result.observed_sha256 = digest(bytes);
      if (result.observed_sha256 !== installed.asset.sha256) {
        throw new PilotError("runtime_static_asset_mismatch");
      }
    });
    await probe(receipt, origin, "health", "/api/health", (bytes) => {
      const health = parseJson(bytes, "invalid_health_response");
      if (health?.status !== "ok" || health.db !== true) throw new PilotError("health_failed");
    });
    await probe(receipt, origin, "readiness", "/api/ready", (bytes) => {
      const readiness = parseJson(bytes, "invalid_readiness_response");
      if (readiness?.ready !== true || readiness.schema !== "ok") {
        throw new PilotError("readiness_failed");
      }
    });
    receipt.status = "verified";
  } catch (error) {
    const outcome =
      error instanceof PilotError ? error : new PilotError("evidence_unavailable", "inconclusive");
    receipt.status = outcome.status;
    receipt.error = outcome.message;
    throw outcome;
  } finally {
    receipt.observed_at = new Date().toISOString();
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  }
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "pack" && args.length === 4) await pack(...args);
  else if (command === "install" && args.length === 3) await install(...args);
  else if (command === "verify" && args.length === 5) await verify(...args);
  else throw new PilotError("invalid_artifact_pilot_arguments");
} catch (error) {
  console.error(error instanceof PilotError ? error.message : "artifact_pilot_io_failed");
  process.exitCode = 1;
}
