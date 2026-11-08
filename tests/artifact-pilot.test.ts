import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const sourceSha = "a".repeat(40);
const buildId = "build-pilot";
const marker = "public/__xboss-pilot-build.json";
const asset = `.next-ci/static/${buildId}/_buildManifest.js`;
const staticUrl = `/_next/static/${buildId}/_buildManifest.js`;
const pgLink = ".next-ci/node_modules/pg-next";
const sentryLink = ".next-ci/node_modules/@sentry/server-runtime-injection-next";
const env = {
  ...process.env,
  XT_PILOT_SOURCE_SHA: sourceSha,
  XT_PILOT_ENVIRONMENT: "staging-test",
  GITHUB_REPOSITORY: "fixture/xboss",
  GITHUB_RUN_ID: "15",
  GITHUB_RUN_ATTEMPT: "2",
  XT_PILOT_DEPLOYMENT_ID: "test-15-2",
};

async function cli(args: string[], overrides: Record<string, string> = {}) {
  try {
    const { stderr } = await run(process.execPath, ["scripts/ops/artifact-pilot.mjs", ...args], {
      env: { ...env, ...overrides },
      encoding: "utf8",
    });
    return { code: 0, stderr };
  } catch (error) {
    const failure = error as { code: number | string; stderr: string };
    if (typeof failure.code !== "number") throw error;
    return { code: failure.code, stderr: failure.stderr.trim() };
  }
}

async function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "xboss-artifact-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "project");
  const release = join(root, "release");
  const archive = join(root, ".next-ci.tar.gz");
  const metadata = join(root, "metadata.json");
  mkdirSync(join(project, ".next-ci", "static", buildId), { recursive: true });
  mkdirSync(join(project, ".next-ci", "cache"));
  mkdirSync(join(project, ".next-ci", "node_modules", "@sentry"), { recursive: true });
  mkdirSync(join(project, "public"));
  mkdirSync(release);
  writeFileSync(join(project, ".next-ci", "BUILD_ID"), buildId);
  writeFileSync(join(project, ".next-ci", "cache", "ignored"), "cache");
  writeFileSync(join(project, "public", "fixture.txt"), "public");
  writeFileSync(join(project, asset), "window.__fixture = true;");
  symlinkSync("../../node_modules/pg", join(project, pgLink));
  symlinkSync("../../../node_modules/@sentry/server-runtime-injection", join(project, sentryLink));
  assert.deepEqual(await cli(["pack", project, sourceSha, archive, metadata]), {
    code: 0,
    stderr: "",
  });
  return { project, release, archive, metadata, root };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Handler = (response: ServerResponse) => void;

async function serve(t: TestContext, f: Fixture, overrides: Record<string, Handler> = {}) {
  const visited: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url?.split("?")[0] ?? "";
    visited.push(path);
    if (overrides[path]) {
      overrides[path](response);
    } else if (path === "/__xboss-pilot-build.json") {
      response.end(readFileSync(join(f.release, marker)));
    } else if (path === staticUrl) {
      response.end(readFileSync(join(f.release, asset)));
    } else if (path === "/api/health") {
      response.end(JSON.stringify({ status: "ok", db: true }));
    } else if (path === "/api/ready") {
      response.end(JSON.stringify({ ready: true, schema: "ok" }));
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, visited };
}

async function verify(f: Fixture, base: string, name = "receipt", overrides = {}) {
  const path = join(f.root, `${name}.json`);
  const result = await cli(["verify", f.archive, f.metadata, f.release, base, path], overrides);
  return { ...result, receipt: JSON.parse(readFileSync(path, "utf8")) };
}

test("pilot xác minh đúng gói và bản đang trả lời qua HTTP", async (t) => {
  const f = await fixture(t);
  assert.equal(existsSync(join(f.project, marker)), false);
  assert.equal((await cli(["install", f.archive, f.metadata, f.release])).code, 0);
  assert.equal(existsSync(join(f.release, ".next-ci", "cache")), false);
  assert.equal(readlinkSync(join(f.release, pgLink)), "../../node_modules/pg");
  assert.equal(
    readlinkSync(join(f.release, sentryLink)),
    "../../../node_modules/@sentry/server-runtime-injection",
  );
  assert.equal(existsSync(join(f.release, "node_modules")), false);
  const { base, visited } = await serve(t, f);
  const { code, receipt } = await verify(f, base);
  const metadata = JSON.parse(readFileSync(f.metadata, "utf8"));
  assert.equal(code, 0);
  assert.equal(receipt.status, "verified");
  assert.equal(receipt.source_sha, sourceSha);
  assert.equal(receipt.expected_artifact_sha256, metadata.archive_sha256);
  assert.equal(receipt.verified_archive_sha256, metadata.archive_sha256);
  assert.equal(receipt.installed_manifest_sha256, metadata.manifest_sha256);
  assert.equal(receipt.observed_build_id, buildId);
  assert.equal(receipt.repository, env.GITHUB_REPOSITORY);
  assert.equal(receipt.environment, env.XT_PILOT_ENVIRONMENT);
  assert.equal(receipt.run_id, env.GITHUB_RUN_ID);
  assert.equal(receipt.run_attempt, env.GITHUB_RUN_ATTEMPT);
  assert.equal(receipt.deployment_id, env.XT_PILOT_DEPLOYMENT_ID);
  assert.deepEqual(visited, ["/__xboss-pilot-build.json", staticUrl, "/api/health", "/api/ready"]);
  assert.deepEqual(
    receipt.probes.map((item: { status: string }) => item.status),
    ["passed", "passed", "passed", "passed"],
  );
});

test("pilot từ chối archive bị đổi trước khi giải nén", async (t) => {
  const f = await fixture(t);
  appendFileSync(f.archive, "đổi bytes");
  assert.deepEqual(await cli(["install", f.archive, f.metadata, f.release]), {
    code: 1,
    stderr: "archive_digest_mismatch",
  });
  assert.deepEqual(readdirSync(f.release), []);
});

test("pilot chỉ nhận symlink dependency chuẩn của Next", async (t) => {
  const f = await fixture(t);
  const cases = [
    [pgLink, "/tmp/pg"],
    [pgLink, "../../../node_modules/pg"],
    [pgLink, "../../node_modules/ngoai/../pg"],
    ["public/pg", "../node_modules/pg"],
    [".next-ci/BUILD_ID", "/tmp/build-id"],
  ];
  for (const [path, target] of cases) {
    const link = join(f.project, path);
    rmSync(link, { force: true });
    symlinkSync(target, link);
    assert.deepEqual(await cli(["pack", f.project, sourceSha, f.archive, f.metadata]), {
      code: 1,
      stderr: "unsupported_artifact_entry",
    });
    rmSync(link);
  }
});

test("pilot từ chối thư mục public và manifest là symlink", async (t) => {
  const f = await fixture(t);
  const outside = join(f.root, "outside");
  mkdirSync(outside);
  const publicDir = join(f.project, "public");
  rmSync(publicDir, { recursive: true });
  symlinkSync(outside, publicDir);
  assert.deepEqual(await cli(["pack", f.project, sourceSha, f.archive, f.metadata]), {
    code: 1,
    stderr: "invalid_tree_directory",
  });
  assert.deepEqual(readdirSync(outside), []);

  assert.equal((await cli(["install", f.archive, f.metadata, f.release])).code, 0);
  const manifest = join(f.release, ".next-ci.pilot.json");
  const manifestCopy = join(outside, "manifest.json");
  renameSync(manifest, manifestCopy);
  symlinkSync(manifestCopy, manifest);
  const { base, visited } = await serve(t, f);
  const result = await verify(f, base);
  assert.equal(result.code, 1);
  assert.equal(result.receipt.error, "unsupported_artifact_entry");
  assert.deepEqual(visited, []);
});

test("pilot từ chối symlink đã cài bị đổi đích dù đích mới là dependency hợp lệ", async (t) => {
  const f = await fixture(t);
  assert.equal((await cli(["install", f.archive, f.metadata, f.release])).code, 0);
  const { base, visited } = await serve(t, f);
  const link = join(f.release, pgLink);
  rmSync(link);
  symlinkSync("../../node_modules/sharp", link);
  const result = await verify(f, base);
  assert.equal(result.code, 1);
  assert.equal(result.receipt.status, "failed");
  assert.equal(result.receipt.error, "installed_tree_mismatch");
  assert.deepEqual(visited, []);
});

test("pilot từ chối thay đổi cây đã cài và SHA của workflow sai", async (t) => {
  const f = await fixture(t);
  assert.equal((await cli(["install", f.archive, f.metadata, f.release])).code, 0);
  const { base, visited } = await serve(t, f);

  const wrongSha = await verify(f, base, "wrong-sha", { XT_PILOT_SOURCE_SHA: "b".repeat(40) });
  assert.equal(wrongSha.code, 1);
  assert.equal(wrongSha.receipt.error, "source_sha_mismatch");

  appendFileSync(join(f.release, asset), "// đổi JS");
  const tampered = await verify(f, base, "tampered");
  assert.equal(tampered.code, 1);
  assert.equal(tampered.receipt.status, "failed");
  assert.equal(tampered.receipt.error, "installed_tree_mismatch");
  assert.deepEqual(visited, []);
});

test("pilot phát hiện route còn phục vụ marker cũ hoặc static asset khác", async (t) => {
  const f = await fixture(t);
  assert.equal((await cli(["install", f.archive, f.metadata, f.release])).code, 0);

  const stale = await serve(t, f, {
    "/__xboss-pilot-build.json": (response) => response.end('{"build_id":"build-cu"}'),
  });
  const staleResult = await verify(f, stale.base, "stale");
  assert.equal(staleResult.code, 1);
  assert.equal(staleResult.receipt.observed_build_id, "build-cu");
  assert.equal(staleResult.receipt.error, "runtime_marker_mismatch");

  const mixed = await serve(t, f, { [staticUrl]: (response) => response.end("JS từ bản khác") });
  const mixedResult = await verify(f, mixed.base, "mixed");
  assert.equal(mixedResult.code, 1);
  assert.equal(mixedResult.receipt.error, "runtime_static_asset_mismatch");
});

test("pilot từ chối readiness lỗi, redirect và đích ngoài loopback", async (t) => {
  const f = await fixture(t);
  assert.equal((await cli(["install", f.archive, f.metadata, f.release])).code, 0);

  const notReady = await serve(t, f, {
    "/api/ready": (response) => response.end('{"ready":false}'),
  });
  const readinessResult = await verify(f, notReady.base, "not-ready");
  assert.equal(readinessResult.code, 1);
  assert.equal(readinessResult.receipt.probes.at(-1).error, "readiness_failed");

  const redirected = await serve(t, f, {
    "/__xboss-pilot-build.json": (response) =>
      response.writeHead(302, { Location: "/api/health" }).end(),
  });
  const redirectResult = await verify(f, redirected.base, "redirected");
  assert.equal(redirectResult.code, 1);
  assert.equal(redirectResult.receipt.probes[0].http_status, 302);
  assert.deepEqual(redirected.visited, ["/__xboss-pilot-build.json"]);

  const offHost = await verify(f, "http://192.0.2.1", "off-host");
  assert.equal(offHost.code, 1);
  assert.equal(offHost.receipt.error, "invalid_loopback_origin");
});

test("pilot ghi inconclusive khi probe hết giờ", { timeout: 18_000 }, async (t) => {
  const f = await fixture(t);
  assert.equal((await cli(["install", f.archive, f.metadata, f.release])).code, 0);
  const { base } = await serve(t, f, {
    // Chỉ gửi header để kiểm timeout áp dụng cho cả lúc đọc body.
    "/__xboss-pilot-build.json": (response) => response.writeHead(200).flushHeaders(),
  });
  const { code, receipt } = await verify(f, base, "timeout");
  assert.equal(code, 1);
  assert.equal(receipt.status, "inconclusive");
  assert.equal(receipt.probes[0].status, "inconclusive");
  assert.equal(receipt.error, "probe_unavailable");
});
