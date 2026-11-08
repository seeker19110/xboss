import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../scripts/ops/vps-artifact.mjs", import.meta.url));
const repo = "seeker19110/xboss";
const buildId = "fixture-build_24";
const manifest = 'self.__BUILD_MANIFEST={"test":true};\n';

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "xboss-vps-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" });
  git(["init", "--quiet"]);
  git([
    "-c",
    "user.name=Artifact fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "fixture",
  ]);
  const sha = git(["rev-parse", "HEAD"]).trim();
  const artifact = join(cwd, "artifact");
  const archivePath = join(artifact, "xboss-vps.tar.gz");
  const metadataPath = join(artifact, "metadata.json");
  const staticDir = join(cwd, ".next-ci", "static", buildId);
  mkdirSync(staticDir, { recursive: true });
  mkdirSync(join(cwd, ".next-ci", "cache"));
  writeFileSync(join(cwd, ".next-ci", "BUILD_ID"), buildId);
  writeFileSync(join(cwd, ".next-ci", "cache", "webpack.bin"), "mutable build cache");
  const manifestPath = join(staticDir, "_buildManifest.js");
  writeFileSync(manifestPath, manifest);
  const run = (mode, attempt = "2", sourceSha = sha) =>
    spawnSync(process.execPath, [cli, mode, artifact, repo, sourceSha, "123456", attempt], {
      cwd,
      encoding: "utf8",
    });
  const pack = () => {
    const result = run("pack");
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { cwd, sha, artifact, archivePath, metadataPath, manifestPath, run, pack };
}

test("đóng và kiểm cùng một gói VPS, bỏ cache build", (t) => {
  const { cwd, sha, archivePath, metadataPath, run, pack } = fixture(t);
  const meta = pack();
  assert.deepEqual(JSON.parse(readFileSync(metadataPath, "utf8")), meta);
  const archive = readFileSync(archivePath);
  assert.deepEqual(meta, {
    schema: 1,
    repository: repo,
    source_sha: sha,
    ci_run_id: "123456",
    ci_run_attempt: "2",
    node_major: 24,
    archive_sha256: sha256(archive),
    archive_bytes: archive.length,
    build_id: buildId,
    build_manifest_sha256: sha256(manifest),
  });
  const listing = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
  assert.match(listing, /\.next-ci\.info/);
  assert.doesNotMatch(listing, /\.next-ci\/cache/);
  assert.equal(existsSync(join(cwd, ".next-ci.info")), false);
  const verified = run("verify");
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout), meta);
});

test("từ chối lần chạy hoặc SHA nguồn khác", (t) => {
  const { run, pack } = fixture(t);
  pack();
  for (const result of [run("verify", "3"), run("verify", "2", "0".repeat(40))]) {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ci_artifact_metadata_mismatch/);
  }
});

test("từ chối byte gói bị sửa và Build ID metadata sai", (t) => {
  const { archivePath, metadataPath, run, pack } = fixture(t);
  const meta = pack();
  writeFileSync(metadataPath, JSON.stringify({ ...meta, build_id: "another-build" }));
  const identity = run("verify");
  assert.equal(identity.status, 1);
  assert.match(identity.stderr, /ci_artifact_build_identity_mismatch/);

  writeFileSync(metadataPath, JSON.stringify(meta));
  const modified = readFileSync(archivePath);
  modified[modified.length - 1] ^= 1;
  writeFileSync(archivePath, modified);
  const digest = run("verify");
  assert.equal(digest.status, 1);
  assert.match(digest.stderr, /ci_artifact_archive_digest_mismatch/);
});

test("từ chối thông tin SHA sai bên trong gói dù digest bên ngoài khớp", (t) => {
  const { cwd, archivePath, metadataPath, run, pack } = fixture(t);
  const meta = pack();
  writeFileSync(join(cwd, ".next-ci.info"), `sha=${"0".repeat(40)}\nnode=24\n`);
  execFileSync("tar", ["-czf", archivePath, ".next-ci", ".next-ci.info"], { cwd });
  const archive = readFileSync(archivePath);
  writeFileSync(
    metadataPath,
    JSON.stringify({ ...meta, archive_sha256: sha256(archive), archive_bytes: archive.length }),
  );
  const result = run("verify");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ci_artifact_source_metadata_mismatch/);
});

test("không ghi đè kết quả cũ khi đóng gói lại", (t) => {
  const { archivePath, metadataPath, run, pack } = fixture(t);
  const meta = pack();
  assert.equal(run("pack").status, 1);
  assert.deepEqual(JSON.parse(readFileSync(metadataPath, "utf8")), meta);
  assert.equal(sha256(readFileSync(archivePath)), meta.archive_sha256);
});

test("từ chối manifest là symlink và không xuất kết quả dở", (t) => {
  const { cwd, archivePath, metadataPath, manifestPath, run } = fixture(t);
  rmSync(manifestPath);
  symlinkSync(join(cwd, ".next-ci", "BUILD_ID"), manifestPath);
  const result = run("pack");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid_ci_artifact_members/);
  assert.equal(existsSync(archivePath), false);
  assert.equal(existsSync(metadataPath), false);
});
