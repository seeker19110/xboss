// Bàn giao đúng gói Next đã build ở CI tới job VPS.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  createReadStream,
  fstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative } from "node:path";

const archiveName = "xboss-vps.tar.gz";
const metadataName = "metadata.json";
const buildDir = ".next-ci";
const infoName = ".next-ci.info";
const buildIdEntry = `${buildDir}/BUILD_ID`;
const nodeMajor = 24;
const maxArchiveBytes = 512 * 1024 * 1024;
const maxMetadataBytes = 8192;
const maxMemberBytes = 1024 * 1024;
const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[1-9][0-9]{0,19}$/;
const buildIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const repoPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

class ArtifactError extends Error {}

function check(condition, code) {
  if (!condition) throw new ArtifactError(code);
}

function context(repository, sourceSha, ciRunId, ciRunAttempt) {
  check(
    repoPattern.test(repository) &&
      shaPattern.test(sourceSha) &&
      idPattern.test(ciRunId) &&
      idPattern.test(ciRunAttempt),
    "invalid_ci_artifact_context",
  );
  return {
    schema: 1,
    repository,
    source_sha: sourceSha,
    ci_run_id: ciRunId,
    ci_run_attempt: ciRunAttempt,
    node_major: nodeMajor,
  };
}

function run(command, args, code, options = {}) {
  const result = spawnSync(command, args, {
    env: { PATH: process.env.PATH, LC_ALL: "C", TAR_OPTIONS: "" },
    timeout: 60_000,
    killSignal: "SIGKILL",
    maxBuffer: maxMemberBytes,
    ...options,
  });
  check(!result.error && result.status === 0, code);
  return result.stdout;
}

function openRegular(path, maxBytes, code) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = fstatSync(fd);
    check(info.isFile() && info.size > 0 && info.size <= maxBytes, code);
    return { fd, size: info.size };
  } catch {
    if (fd !== undefined) closeSync(fd);
    throw new ArtifactError(code);
  }
}

function readMetadata(path) {
  const { fd, size } = openRegular(path, maxMetadataBytes, "invalid_ci_artifact_metadata");
  try {
    const bytes = Buffer.alloc(size + 1);
    const length = readSync(fd, bytes);
    check(length === size, "invalid_ci_artifact_metadata");
    return JSON.parse(bytes.toString("utf8", 0, length));
  } catch {
    throw new ArtifactError("invalid_ci_artifact_metadata");
  } finally {
    closeSync(fd);
  }
}

async function archiveHash(fd) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(null, { fd, autoClose: false, start: 0 })) {
    bytes += chunk.length;
    check(bytes <= maxArchiveBytes, "invalid_ci_artifact_archive");
    hash.update(chunk);
  }
  return { archive_sha256: hash.digest("hex"), archive_bytes: bytes };
}

function expectedInfo(identity) {
  return `sha=${identity.source_sha}\nnode=${identity.node_major}\n`;
}

function tarRead(fd, operation, paths) {
  // /proc tham chiếu descriptor kế thừa, không mở lại tên gói sau khi đã băm.
  return run(
    "tar",
    [operation, "--no-recursion", "--gzip", "--file=/proc/self/fd/3", "--", ...paths],
    "invalid_ci_artifact_members",
    { stdio: ["ignore", "pipe", "pipe", fd] },
  );
}

function archiveMembers(fd, identity) {
  const buildId = tarRead(fd, "-xO", [buildIdEntry]).toString("utf8").trim();
  check(buildIdPattern.test(buildId), "invalid_ci_artifact_build_id");
  const buildStaticDir = `${buildDir}/static/${buildId}`;
  const manifestPath = `${buildStaticDir}/_buildManifest.js`;
  const directories = [buildDir, `${buildDir}/static`, buildStaticDir];
  const entries = [buildIdEntry, manifestPath, infoName];
  const listing = tarRead(fd, "-tv", [...directories, ...entries])
    .toString("utf8")
    .trimEnd()
    .split("\n");
  check(
    listing.length === directories.length + entries.length &&
      directories.every((directory) =>
        listing.some((line) => line.startsWith("d") && line.endsWith(` ${directory}/`)),
      ) &&
      entries.every((entry) =>
        listing.some((line) => line.startsWith("-") && line.endsWith(` ${entry}`)),
      ),
    "invalid_ci_artifact_members",
  );
  const info = tarRead(fd, "-xO", [infoName]);
  check(info.equals(Buffer.from(expectedInfo(identity))), "ci_artifact_source_metadata_mismatch");
  const manifest = tarRead(fd, "-xO", [manifestPath]);
  check(manifest.length > 0, "invalid_ci_artifact_build_manifest");
  return {
    build_id: buildId,
    build_manifest_sha256: createHash("sha256").update(manifest).digest("hex"),
  };
}

async function inspectArchive(path, identity, expected = null) {
  const { fd, size } = openRegular(path, maxArchiveBytes, "invalid_ci_artifact_archive");
  try {
    const before = fstatSync(fd, { bigint: true });
    const archive = await archiveHash(fd);
    check(archive.archive_bytes === size, "ci_artifact_archive_size_mismatch");
    if (expected) {
      check(
        archive.archive_bytes === expected.archive_bytes &&
          archive.archive_sha256 === expected.archive_sha256,
        "ci_artifact_archive_digest_mismatch",
      );
    }
    const members = archiveMembers(fd, identity);
    const after = fstatSync(fd, { bigint: true });
    check(
      before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs,
      "ci_artifact_archive_changed",
    );
    return { ...identity, ...archive, ...members };
  } finally {
    closeSync(fd);
  }
}

async function pack(directory, identity) {
  check(Number(process.versions.node.split(".")[0]) === nodeMajor, "invalid_ci_artifact_node");
  check(
    run("git", ["rev-parse", "--verify", "HEAD"], "ci_artifact_git_head_unavailable")
      .toString("utf8")
      .trim() === identity.source_sha,
    "ci_artifact_checkout_mismatch",
  );
  mkdirSync(directory, { recursive: true });
  const output = realpathSync(directory);
  const fromBuild = relative(realpathSync(buildDir), output);
  check(
    isAbsolute(fromBuild) || fromBuild === ".." || fromBuild.startsWith("../"),
    "invalid_ci_artifact_output_directory",
  );
  const scratch = mkdtempSync(join(output, ".vps-artifact-"));
  try {
    writeFileSync(join(scratch, infoName), expectedInfo(identity), { flag: "wx", mode: 0o600 });
    const archivePath = join(scratch, archiveName);
    const fd = openSync(archivePath, "wx", 0o600);
    try {
      run(
        "tar",
        [
          "--create",
          "--gzip",
          "--file=-",
          `--exclude=${buildDir}/cache`,
          "-C",
          process.cwd(),
          buildDir,
          "-C",
          scratch,
          infoName,
        ],
        "ci_artifact_pack_failed",
        { stdio: ["ignore", fd, "pipe"], timeout: 120_000 },
      );
    } finally {
      closeSync(fd);
    }
    const metadata = await inspectArchive(archivePath, identity);
    const metadataPath = join(scratch, metadataName);
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    const archiveOutput = join(output, archiveName);
    linkSync(archivePath, archiveOutput);
    try {
      linkSync(metadataPath, join(output, metadataName));
    } catch (error) {
      unlinkSync(archiveOutput);
      throw error;
    }
    return metadata;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function verify(directory, identity) {
  const expected = readMetadata(join(directory, metadataName));
  check(
    expected !== null &&
      typeof expected === "object" &&
      Object.keys(expected).length === 10 &&
      Object.entries(identity).every(([key, value]) => expected[key] === value) &&
      Number.isSafeInteger(expected.archive_bytes) &&
      expected.archive_bytes > 0 &&
      expected.archive_bytes <= maxArchiveBytes &&
      typeof expected.archive_sha256 === "string" &&
      digestPattern.test(expected.archive_sha256) &&
      typeof expected.build_id === "string" &&
      buildIdPattern.test(expected.build_id) &&
      typeof expected.build_manifest_sha256 === "string" &&
      digestPattern.test(expected.build_manifest_sha256),
    "ci_artifact_metadata_mismatch",
  );
  const actual = await inspectArchive(join(directory, archiveName), identity, expected);
  check(
    actual.build_id === expected.build_id &&
      actual.build_manifest_sha256 === expected.build_manifest_sha256,
    "ci_artifact_build_identity_mismatch",
  );
  return actual;
}

try {
  const [command, directory, ...identity] = process.argv.slice(2);
  check(
    (command === "pack" || command === "verify") && directory && identity.length === 4,
    "invalid_ci_artifact_arguments",
  );
  const operation = command === "pack" ? pack : verify;
  const result = await operation(directory, context(...identity));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof ArtifactError ? error.message : "ci_artifact_io_failed");
  process.exitCode = 1;
}
