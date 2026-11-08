import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../scripts/ops/vps-production-receipt.mjs", import.meta.url));
const origin = "https://xboss.donghanhcungban.org";
const manifest = 'self.__BUILD_MANIFEST={"__rewrites":{}};';
const hash = (body) => createHash("sha256").update(body).digest("hex");
const expected = {
  schema: 1,
  repository: "seeker19110/xboss",
  source_sha: "a".repeat(40),
  ci_run_id: "104",
  ci_run_attempt: "2",
  node_major: 24,
  archive_sha256: "b".repeat(64),
  archive_bytes: 456,
  build_id: "build-moi_1",
  build_manifest_sha256: hash(manifest),
};
const manifestPath = `/_next/static/${expected.build_id}/_buildManifest.js`;

function login(buildId) {
  const row = `0:${JSON.stringify({ b: buildId })}\n`;
  return [
    '<html><head><meta name="b" content="build-gia"></head>',
    `<script>self.__next_f.push(${JSON.stringify([1, 'a:{"b":"bo-qua"}\n' + row.slice(0, 10)])})</script>`,
    `<script>self.__next_f.push(${JSON.stringify([1, row.slice(10)])})</script></html>`,
  ].join("");
}

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "xboss-vps-receipt-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const metadataFile = join(dir, "metadata.json");
  const receiptFile = join(dir, "receipt.json");
  const logFile = join(dir, "requests.log");
  if (options.metadata !== null) {
    writeFileSync(metadataFile, JSON.stringify({ ...expected, ...options.metadata }));
  }
  writeFileSync(logFile, "");
  writeFileSync(
    join(dir, "curl"),
    `#!${process.execPath}\n${String.raw`
const assert = require("node:assert/strict");
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
assert.equal(args[0], "--disable");
assert.equal(args[args.indexOf("--proto") + 1], "=https");
assert.equal(args[args.indexOf("--max-redirs") + 1], "0");
assert.ok(!args.includes("--location"));
assert.ok(args.includes("Cache-Control: no-cache, no-store"));
const url = new URL(args[args.indexOf("--url") + 1]);
assert.equal(url.origin, "https://xboss.donghanhcungban.org");
assert.match(url.searchParams.get("xt_probe"), /^[a-f0-9-]{36}$/);
appendFileSync(process.env.FAKE_CURL_LOG, JSON.stringify([url.pathname, url.search]) + "\n");
const config = JSON.parse(process.env.FAKE_CURL_CONFIG);
if (url.pathname === "/login") {
  process.stdout.write(config.login + "\n" + config.status);
} else {
  assert.equal(url.pathname, config.manifestPath);
  process.stdout.write(config.manifest + "\n200");
}
`}`,
    { mode: 0o700 },
  );
  const env = {
    PATH: dir,
    FAKE_CURL_LOG: logFile,
    FAKE_CURL_CONFIG: JSON.stringify({
      login: login(options.buildId ?? expected.build_id),
      status: options.httpStatus ?? 200,
      manifest: options.manifest ?? manifest,
      manifestPath,
    }),
    GITHUB_REPOSITORY: expected.repository,
    GITHUB_RUN_ID: "201",
    GITHUB_RUN_ATTEMPT: "1",
    SOURCE_SHA: expected.source_sha,
    CI_RUN_ID: expected.ci_run_id,
    CI_RUN_ATTEMPT: expected.ci_run_attempt,
    CI_ARTIFACT_ID: "302",
    CI_ARTIFACT_DIGEST: `sha256:${"c".repeat(64)}`,
    RESOLVE_OUTCOME: "success",
    DOWNLOAD_OUTCOME: "success",
    VERIFY_OUTCOME: "success",
    TRANSFER_OUTCOME: "success",
    DEPLOY_OUTCOME: "success",
    ...options.env,
  };
  let exit = 0;
  try {
    await run(process.execPath, [cli, metadataFile, receiptFile], { env, timeout: 15_000 });
  } catch (error) {
    exit = error.code;
  }
  const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
  const requests = readFileSync(logFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { exit, receipt, requests };
}

test("xác minh Build ID từ Flight và SHA-256 manifest đúng của tuyến HTTPS", async (t) => {
  const { exit, receipt, requests } = await fixture(t);
  assert.equal(exit, 0);
  assert.equal(receipt.status, "verified");
  assert.equal(receipt.endpoint, origin);
  assert.equal(receipt.deployment_activated, true);
  assert.equal(receipt.failed_phase, null);
  assert.equal(receipt.observed_build_id, expected.build_id);
  assert.equal(receipt.observed_build_manifest_sha256, expected.build_manifest_sha256);
  assert.deepEqual(receipt.probes, { login: "passed", build_manifest: "passed" });
  assert.deepEqual(
    requests.map(([path]) => path),
    ["/login", manifestPath],
  );
});

test(
  "từ chối tuyến cũ, manifest sai và redirect công khai sau khi đã kích hoạt",
  { concurrency: true },
  async (t) => {
    await Promise.all([
      t.test("Build ID cũ", async (sub) => {
        const { exit, receipt, requests } = await fixture(sub, { buildId: "build-cu" });
        assert.equal(exit, 1);
        assert.equal(receipt.status, "failed");
        assert.equal(receipt.deployment_activated, true);
        assert.equal(receipt.failed_phase, "public_probe");
        assert.equal(receipt.observed_build_id, "build-cu");
        assert.equal(receipt.error, "runtime_build_id_mismatch");
        assert.deepEqual(
          requests.map(([path]) => path),
          ["/login", "/login", "/login"],
        );
        assert.equal(new Set(requests.map(([, query]) => query)).size, 3);
      }),
      t.test("manifest khác", async (sub) => {
        const { exit, receipt } = await fixture(sub, { manifest: "nội dung khác" });
        assert.equal(exit, 1);
        assert.equal(receipt.error, "runtime_manifest_mismatch");
        assert.equal(receipt.observed_build_manifest_sha256, hash("nội dung khác"));
        assert.deepEqual(receipt.probes, { login: "passed", build_manifest: "failed" });
      }),
      t.test("HTTP redirect", async (sub) => {
        const { exit, receipt, requests } = await fixture(sub, { httpStatus: 302 });
        assert.equal(exit, 1);
        assert.equal(receipt.error, "unexpected_public_redirect");
        assert.equal(receipt.observed_build_id, null);
        assert.equal(requests.length, 3);
      }),
    ]);
  },
);

test("ghi bước lỗi đầu tiên và không gọi HTTPS khi bàn giao thất bại", async (t) => {
  const { exit, receipt, requests } = await fixture(t, {
    metadata: null,
    env: {
      DOWNLOAD_OUTCOME: "failure",
      VERIFY_OUTCOME: "skipped",
      TRANSFER_OUTCOME: "skipped",
      DEPLOY_OUTCOME: "skipped",
    },
  });
  assert.equal(exit, 1);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.failed_phase, "download");
  assert.equal(receipt.deployment_activated, false);
  assert.deepEqual(requests, []);
});

test("từ chối metadata sai nguồn, không gọi HTTPS", async (t) => {
  const { exit, receipt, requests } = await fixture(t, { metadata: { ci_run_attempt: "3" } });
  assert.equal(exit, 1);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.failed_phase, "verify");
  assert.equal(receipt.error, "verified_metadata_mismatch");
  assert.deepEqual(requests, []);
});
