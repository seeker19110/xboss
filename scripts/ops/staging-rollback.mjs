// Diễn tập đổi tuyến nóng giữa hai bản Next chạy trên cùng staging cô lập.
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const verifier = fileURLToPath(new URL("./artifact-pilot.mjs", import.meta.url));
const run = promisify(execFile);
const host = "127.0.0.1";
const baselinePort = 3002;
const candidatePort = 3003;
const database = "postgres://ci:ci@127.0.0.1:5432/xboss_pilot";
const readinessPath = "/api/ready";
const rtoLimitMs = 60_000;
const expectedProbes = ["build_marker", "static_asset", "health", "readiness"];

class RollbackError extends Error {}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function stagingContext() {
  const { GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, XT_PILOT_SOURCE_SHA } = process.env;
  if (
    process.env.DATABASE_URL !== database ||
    process.env.XT_PILOT_ENVIRONMENT !== "staging-isolated" ||
    GITHUB_REPOSITORY !== "seeker19110/xboss" ||
    !/^[1-9][0-9]{0,19}$/.test(GITHUB_RUN_ID ?? "") ||
    !/^[1-9][0-9]{0,19}$/.test(GITHUB_RUN_ATTEMPT ?? "") ||
    !/^[a-f0-9]{40}$/.test(XT_PILOT_SOURCE_SHA ?? "")
  ) {
    throw new RollbackError("invalid_isolated_staging_context");
  }
  return {
    repository: GITHUB_REPOSITORY,
    environment: "staging-isolated",
    run_id: GITHUB_RUN_ID,
    run_attempt: GITHUB_RUN_ATTEMPT,
    source_sha: XT_PILOT_SOURCE_SHA,
  };
}

async function prepareRelease(artifact, release, runtime, env) {
  const archive = join(artifact, "xboss.tar.gz");
  const metadataPath = join(artifact, "metadata.json");
  mkdirSync(release);
  await run(process.execPath, [verifier, "install", archive, metadataPath, release], {
    env,
    timeout: rtoLimitMs,
    killSignal: "SIGKILL",
  });
  for (const name of ["package.json", "next.config.mjs", "migrations"]) {
    cpSync(join(runtime, name), join(release, name), { recursive: true });
  }
  symlinkSync(join(runtime, "node_modules"), join(release, "node_modules"), "dir");
  return { archive, metadataPath, release, metadata: readJson(metadataPath) };
}

function startApp(release, port, appUrl, secret, log) {
  const fd = openSync(log, "wx", 0o600);
  try {
    const child = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--hostname", host, "--port", String(port)],
      {
        cwd: release,
        stdio: ["ignore", fd, fd],
        env: {
          PATH: process.env.PATH,
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_DIST_DIR: ".next-ci",
          DATABASE_URL: database,
          PORT: String(port),
          APP_URL: appUrl,
          XBOSS_SECRET: secret,
        },
      },
    );
    const closed = new Promise((done) => child.once("close", () => done(true)));
    child.once("error", () => {});
    return { child, closed };
  } finally {
    closeSync(fd);
  }
}

function appRunning(app) {
  return app.child.pid && app.child.exitCode === null && app.child.signalCode === null;
}

async function stopApp(app) {
  if (!appRunning(app)) return;
  app.child.kill("SIGTERM");
  if (await Promise.race([app.closed, sleep(3_000, false, { ref: false })])) return;
  app.child.kill("SIGKILL");
  if (!(await Promise.race([app.closed, sleep(3_000, false, { ref: false })]))) {
    throw new RollbackError("app_stop_timeout");
  }
}

function origin(port) {
  return `http://${host}:${port}`;
}

async function readinessStatus(appOrigin) {
  try {
    const response = await fetch(appOrigin + readinessPath, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(2_500),
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return null;
  }
}

async function waitReady(app, port) {
  const deadline = performance.now() + rtoLimitMs;
  while (appRunning(app) && performance.now() < deadline) {
    if ((await readinessStatus(origin(port))) === 200 && appRunning(app)) return;
    await sleep(500);
  }
  throw new RollbackError("app_not_ready");
}

function forward(req, res, port) {
  if (req.method !== "GET" || !req.url?.startsWith("/") || req.url.startsWith("//")) {
    res.writeHead(400).end();
    return;
  }
  const upstream = request(
    {
      hostname: host,
      port,
      path: req.url,
      method: "GET",
      agent: false,
      signal: AbortSignal.timeout(2_000),
      headers: { "Cache-Control": "no-store" },
    },
    (response) => {
      res.writeHead(response.statusCode, {
        "Cache-Control": "no-store",
        "Content-Type": response.headers["content-type"] ?? "application/octet-stream",
      });
      response.once("error", () => res.destroy());
      response.pipe(res);
    },
  );
  upstream.once("error", () => {
    if (res.headersSent) res.destroy();
    else res.writeHead(502, { "Cache-Control": "no-store" }).end();
  });
  res.once("close", () => upstream.destroy());
  upstream.end();
}

async function verifyPhase(report, evidence, release, appOrigin, env, timeout = rtoLimitMs) {
  const receiptPath = join(evidence, `receipt-${report.phase}.json`);
  if (existsSync(receiptPath)) throw new RollbackError("rollback_evidence_exists");
  const deploymentId = `rollback-${report.run_id}-${report.run_attempt}-${report.phase}`;
  const args = [
    verifier,
    "verify",
    release.archive,
    release.metadataPath,
    release.release,
    appOrigin,
    receiptPath,
  ];
  try {
    await run(process.execPath, args, {
      env: { ...env, XT_PILOT_DEPLOYMENT_ID: deploymentId },
      timeout,
      killSignal: "SIGKILL",
    });
  } finally {
    try {
      report.verifications[report.phase] = readJson(receiptPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const receipt = report.verifications[report.phase];
  if (
    receipt?.schema !== 1 ||
    receipt.status !== "verified" ||
    receipt.repository !== report.repository ||
    receipt.environment !== report.environment ||
    receipt.source_sha !== report.source_sha ||
    receipt.run_id !== report.run_id ||
    receipt.run_attempt !== report.run_attempt ||
    receipt.deployment_id !== deploymentId ||
    receipt.expected_artifact_sha256 !== release.metadata.archive_sha256 ||
    receipt.verified_archive_sha256 !== release.metadata.archive_sha256 ||
    receipt.installed_manifest_sha256 !== release.metadata.manifest_sha256 ||
    receipt.observed_build_id !== release.metadata.build_id ||
    receipt.probes?.length !== expectedProbes.length ||
    !expectedProbes.every(
      (name, index) =>
        receipt.probes[index].name === name &&
        receipt.probes[index].http_status === 200 &&
        receipt.probes[index].status === "passed",
    )
  ) {
    throw new RollbackError("missing_verified_artifact_proof");
  }
  return receipt;
}

async function drill(baseline, candidate, runtime, evidence) {
  const report = {
    schema: 1,
    status: "failed",
    phase: "prepare",
    mechanism: "hot_loopback_route_switch",
    rto_limit_ms: rtoLimitMs,
    started_at: new Date().toISOString(),
    verifications: {},
  };
  let scratch;
  let appA;
  let appB;
  let router;
  let faultTime;
  try {
    const context = stagingContext();
    Object.assign(report, context);
    const env = {
      PATH: process.env.PATH,
      GITHUB_REPOSITORY: context.repository,
      GITHUB_RUN_ID: context.run_id,
      GITHUB_RUN_ATTEMPT: context.run_attempt,
      XT_PILOT_SOURCE_SHA: context.source_sha,
      XT_PILOT_ENVIRONMENT: context.environment,
    };
    scratch = mkdtempSync(join(tmpdir(), "xboss-staging-rollback-"));
    report.phase = "install_baseline";
    const releaseA = await prepareRelease(baseline, join(scratch, "a"), runtime, env);
    report.phase = "install_candidate";
    const releaseB = await prepareRelease(candidate, join(scratch, "b"), runtime, env);
    if (
      releaseA.metadata.archive_sha256 === releaseB.metadata.archive_sha256 ||
      releaseA.metadata.build_id === releaseB.metadata.build_id
    ) {
      throw new RollbackError("rollback_builds_not_distinct");
    }

    report.phase = "start_releases";
    let activePort = baselinePort;
    router = createServer((req, res) => forward(req, res, activePort));
    await once(router.listen(0, host), "listening");
    const appOrigin = origin(router.address().port);
    const secret = randomBytes(32).toString("hex");
    appA = startApp(
      releaseA.release,
      baselinePort,
      appOrigin,
      secret,
      join(evidence, "next-a.log"),
    );
    appB = startApp(
      releaseB.release,
      candidatePort,
      appOrigin,
      secret,
      join(evidence, "next-b.log"),
    );
    await waitReady(appA, baselinePort);
    await waitReady(appB, candidatePort);

    report.phase = "A_before";
    const before = await verifyPhase(report, evidence, releaseA, appOrigin, env);
    activePort = candidatePort;
    report.phase = "B_candidate";
    await verifyPhase(report, evidence, releaseB, appOrigin, env);
    if (!appRunning(appB) || !appRunning(appA)) throw new RollbackError("release_exited_early");

    report.phase = "inject_failure";
    report.failure_injection = { action: "stop_candidate_B", at: new Date().toISOString() };
    faultTime = performance.now();
    await stopApp(appB);
    if ((await readinessStatus(appOrigin)) !== 502) {
      throw new RollbackError("missing_candidate_outage");
    }
    report.failure_injection.routed_readiness_http_status = 502;

    report.phase = "recover_route";
    activePort = baselinePort;
    if ((await readinessStatus(appOrigin)) !== 200) {
      throw new RollbackError("baseline_route_not_ready");
    }
    report.routing_recovery = {
      readiness_http_status: 200,
      elapsed_ms: Math.ceil(performance.now() - faultTime),
    };
    const remainingMs = Math.floor(rtoLimitMs - (performance.now() - faultTime));
    if (remainingMs < 1) throw new RollbackError("rollback_rto_exceeded");

    report.phase = "A_after_rollback";
    const after = await verifyPhase(report, evidence, releaseA, appOrigin, env, remainingMs);
    report.rto_ms = Math.ceil(performance.now() - faultTime);
    if (report.rto_ms > rtoLimitMs) throw new RollbackError("rollback_rto_exceeded");
    if (
      after.verified_archive_sha256 !== before.verified_archive_sha256 ||
      after.installed_manifest_sha256 !== before.installed_manifest_sha256 ||
      after.observed_build_id !== before.observed_build_id
    ) {
      throw new RollbackError("baseline_identity_changed");
    }
    report.status = "verified";
    report.phase = "complete";
  } catch (error) {
    if (faultTime !== undefined)
      report.elapsed_after_failure_ms = Math.ceil(performance.now() - faultTime);
    report.error = error instanceof RollbackError ? error.message : "rollback_phase_failed";
  } finally {
    let routerStopped = true;
    if (router?.listening) {
      const closed = once(router, "close");
      router.close();
      router.closeAllConnections();
      try {
        await closed;
      } catch {
        routerStopped = false;
      }
    }
    const stops = await Promise.allSettled([appA && stopApp(appA), appB && stopApp(appB)]);
    report.cleanup = {
      router_stopped: routerStopped,
      app_processes_stopped: stops.every(({ status }) => status === "fulfilled"),
    };
    try {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
      report.cleanup.release_directories_removed = true;
    } catch {
      report.cleanup.release_directories_removed = false;
    }
    if (Object.values(report.cleanup).includes(false)) {
      report.status = "failed";
      report.error ??= "rollback_cleanup_failed";
    }
    report.finished_at = new Date().toISOString();
    writeFileSync(join(evidence, "rollback.json"), JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (report.status !== "verified") throw new RollbackError(report.error);
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args.some((arg) => !arg))
    throw new RollbackError("invalid_rollback_arguments");
  const [baseline, candidate, runtime, evidence] = args.map((arg) => resolve(arg));
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  if (existsSync(join(evidence, "rollback.json")))
    throw new RollbackError("rollback_evidence_exists");
  await drill(baseline, candidate, runtime, evidence);
} catch (error) {
  console.error(error instanceof RollbackError ? error.message : "rollback_evidence_unavailable");
  process.exitCode = 1;
}
