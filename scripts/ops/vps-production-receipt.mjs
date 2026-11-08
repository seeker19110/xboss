// Đối chiếu tuyến HTTPS production với metadata của gói CI đã kiểm trước khi chuyển lên VPS.
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const repository = "seeker19110/xboss";
const origin = "https://xboss.donghanhcungban.org";
const maxResponseBytes = 2 * 1024 * 1024;
const maxAttempts = 3;
const idPattern = /^[1-9][0-9]{0,19}$/;
const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const buildIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const allowedOutcomes = new Set(["success", "failure", "cancelled", "skipped"]);

class ReceiptError extends Error {
  constructor(code, status = "failed") {
    super(code);
    this.status = status;
  }
}

function matched(pattern, value) {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function stepOutcome(value) {
  return allowedOutcomes.has(value) ? value : "unknown";
}

function initReceipt(env) {
  const outcomes = {
    resolve: stepOutcome(env.RESOLVE_OUTCOME),
    download: stepOutcome(env.DOWNLOAD_OUTCOME),
    verify: stepOutcome(env.VERIFY_OUTCOME),
    transfer: stepOutcome(env.TRANSFER_OUTCOME),
    deploy: stepOutcome(env.DEPLOY_OUTCOME),
  };
  const artifactDigest = matched(digestPattern, env.CI_ARTIFACT_DIGEST?.replace(/^sha256:/, ""));
  let deploymentActivated = null;
  if (outcomes.deploy === "success") deploymentActivated = true;
  if (outcomes.deploy === "skipped") deploymentActivated = false;
  return {
    schema: 1,
    status: "inconclusive",
    failed_phase: null,
    deployment_activated: deploymentActivated,
    repository: env.GITHUB_REPOSITORY === repository ? repository : null,
    environment: "Production",
    endpoint: origin,
    source_sha: matched(shaPattern, env.SOURCE_SHA),
    deploy_run_id: matched(idPattern, env.GITHUB_RUN_ID),
    deploy_run_attempt: matched(idPattern, env.GITHUB_RUN_ATTEMPT),
    ci_run_id: matched(idPattern, env.CI_RUN_ID),
    ci_run_attempt: matched(idPattern, env.CI_RUN_ATTEMPT),
    ci_artifact_id: matched(idPattern, env.CI_ARTIFACT_ID),
    ci_artifact_digest: artifactDigest ? `sha256:${artifactDigest}` : null,
    archive_sha256: null,
    archive_bytes: null,
    expected_build_id: null,
    observed_build_id: null,
    expected_build_manifest_sha256: null,
    observed_build_manifest_sha256: null,
    outcomes,
    attempts: 0,
    probes: {},
  };
}

function loadMetadata(path, receipt) {
  if (
    !receipt.repository ||
    !receipt.source_sha ||
    !receipt.deploy_run_id ||
    !receipt.deploy_run_attempt ||
    !receipt.ci_run_id ||
    !receipt.ci_run_attempt ||
    !receipt.ci_artifact_id ||
    !receipt.ci_artifact_digest
  ) {
    throw new ReceiptError("missing_deployment_identity", "inconclusive");
  }
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ReceiptError("verified_metadata_unavailable", "inconclusive");
  }
  if (
    metadata?.schema !== 1 ||
    metadata.repository !== receipt.repository ||
    metadata.source_sha !== receipt.source_sha ||
    metadata.ci_run_id !== receipt.ci_run_id ||
    metadata.ci_run_attempt !== receipt.ci_run_attempt ||
    metadata.node_major !== 24 ||
    !matched(digestPattern, metadata.archive_sha256) ||
    !Number.isSafeInteger(metadata.archive_bytes) ||
    metadata.archive_bytes < 1 ||
    !matched(buildIdPattern, metadata.build_id) ||
    !matched(digestPattern, metadata.build_manifest_sha256)
  ) {
    throw new ReceiptError("verified_metadata_mismatch");
  }
  receipt.archive_sha256 = metadata.archive_sha256;
  receipt.archive_bytes = metadata.archive_bytes;
  receipt.expected_build_id = metadata.build_id;
  receipt.expected_build_manifest_sha256 = metadata.build_manifest_sha256;
  return metadata;
}

function flightBuildId(bytes) {
  const chunks = [];
  const scripts = bytes.toString("utf8").matchAll(/self\.__next_f\.push\((.*?)\)<\/script>/gs);
  for (const script of scripts) {
    let data;
    try {
      data = JSON.parse(script[1]);
    } catch {
      continue;
    }
    if (Array.isArray(data) && data[0] === 1 && typeof data[1] === "string") chunks.push(data[1]);
  }
  const rootRows = chunks
    .join("")
    .split("\n")
    .filter((row) => row.startsWith("0:"));
  if (rootRows.length !== 1) return null;
  try {
    return matched(buildIdPattern, JSON.parse(rootRows[0].slice(2))?.b);
  } catch {
    return null;
  }
}

async function request(path) {
  let stdout;
  try {
    ({ stdout } = await run(
      "curl",
      [
        "--disable",
        "--silent",
        "--show-error",
        "--proto",
        "=https",
        "--max-redirs",
        "0",
        "--connect-timeout",
        "4",
        "--max-time",
        "8",
        "--max-filesize",
        String(maxResponseBytes),
        "--header",
        "Cache-Control: no-cache, no-store",
        "--header",
        "Accept-Encoding: identity",
        "--write-out",
        "\n%{http_code}",
        "--url",
        `${origin}${path}?xt_probe=${randomUUID()}`,
      ],
      {
        encoding: "buffer",
        maxBuffer: maxResponseBytes + 4,
        timeout: 9_000,
        killSignal: "SIGKILL",
      },
    ));
  } catch {
    throw new ReceiptError("public_probe_unavailable", "inconclusive");
  }
  const suffix = stdout.subarray(-4).toString("ascii");
  if (suffix === "\n200") return stdout.subarray(0, -4);
  if (/^\n3[0-9]{2}$/.test(suffix)) throw new ReceiptError("unexpected_public_redirect");
  throw new ReceiptError("unexpected_public_http_status");
}

async function probeRelease(receipt, metadata) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    receipt.attempts = attempt;
    receipt.probes = { login: "inconclusive", build_manifest: "skipped" };
    receipt.observed_build_id = null;
    receipt.observed_build_manifest_sha256 = null;
    let phase = "login";
    try {
      const login = await request("/login");
      const observed = flightBuildId(login);
      if (!observed) throw new ReceiptError("missing_live_build_id", "inconclusive");
      receipt.observed_build_id = observed;
      if (observed !== metadata.build_id) throw new ReceiptError("runtime_build_id_mismatch");
      receipt.probes.login = "passed";
      phase = "build_manifest";
      const manifest = await request(`/_next/static/${metadata.build_id}/_buildManifest.js`);
      const digest = createHash("sha256").update(manifest).digest("hex");
      receipt.observed_build_manifest_sha256 = digest;
      if (digest !== metadata.build_manifest_sha256)
        throw new ReceiptError("runtime_manifest_mismatch");
      receipt.probes.build_manifest = "passed";
      receipt.status = "verified";
      receipt.failed_phase = null;
      delete receipt.error;
      return;
    } catch (error) {
      if (!(error instanceof ReceiptError)) throw error;
      receipt.probes[phase] = error.status;
      receipt.status = error.status;
      receipt.error = error.message;
    }
    if (attempt < maxAttempts) await sleep(attempt * 1_000);
  }
}

async function record(metadataPath, receiptPath) {
  const receipt = initReceipt(process.env);
  try {
    const failed = Object.entries(receipt.outcomes).find(([, outcome]) => outcome !== "success");
    if (failed) {
      const [phase, outcome] = failed;
      receipt.failed_phase = phase;
      receipt.status = outcome === "failure" ? "failed" : "inconclusive";
      receipt.error = "deploy_phase_not_successful";
      if (receipt.outcomes.verify === "success") loadMetadata(metadataPath, receipt);
      return false;
    }
    receipt.failed_phase = "verify";
    const metadata = loadMetadata(metadataPath, receipt);
    receipt.failed_phase = "public_probe";
    await probeRelease(receipt, metadata);
    return receipt.status === "verified";
  } catch (error) {
    if (!receipt.error) {
      receipt.status = error instanceof ReceiptError ? error.status : "inconclusive";
      receipt.error =
        error instanceof ReceiptError ? error.message : "receipt_evidence_unavailable";
    }
    return false;
  } finally {
    receipt.observed_at = new Date().toISOString();
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    if (receipt.error) console.error(receipt.error);
  }
}

try {
  const [metadataPath, receiptPath, ...rest] = process.argv.slice(2);
  if (!metadataPath || !receiptPath || rest.length)
    throw new ReceiptError("invalid_receipt_arguments");
  if (!(await record(metadataPath, receiptPath))) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof ReceiptError ? error.message : "receipt_write_failed");
  process.exitCode = 1;
}
