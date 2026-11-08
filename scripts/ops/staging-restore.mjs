// Diễn tập restore logic trên hai dịch vụ PostgreSQL dùng một lần của staging CI.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  closeSync,
  constants,
  createReadStream,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const image = "postgres:16@sha256:9e2cf6287f25c3151f4c9421ccce2b17f3e60061c111a29165e0d2cdd9ff0a97";
const source = { database: "xboss_pilot", port: "5432" };
const target = { database: "xboss_pilot_restore", port: "5433" };
const appPort = "3004";
const rtoMs = 180_000;
const rpoMs = 60_000;
const sha256Pattern = /^[a-f0-9]{64}$/;
const shaPattern = /^[a-f0-9]{40}$/;
const pathEnv = { PATH: process.env.PATH };

class DrillError extends Error {}

function check(condition, code) {
  if (!condition) throw new DrillError(code);
}

function run(code, command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    ...options,
  });
  check(!result.error && result.status === 0, code);
  return result.stdout?.trim() ?? "";
}

function docker(code, args, options = {}) {
  return run(code, "docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env: pathEnv,
    ...options,
  });
}

function validateService(id, service) {
  const records = JSON.parse(
    docker("service_inspect_failed", ["inspect", "--type", "container", id]),
  );
  const container = records[0];
  const expectedEnv = [
    "POSTGRES_USER=ci",
    "POSTGRES_PASSWORD=ci",
    `POSTGRES_DB=${service.database}`,
  ];
  const bindings = container?.NetworkSettings?.Ports?.["5432/tcp"];
  check(
    records.length === 1 &&
      container.Id === id &&
      container.State?.Running === true &&
      container.Config?.Image === image &&
      expectedEnv.every((value) => container.Config.Env.includes(value)) &&
      bindings?.length > 0 &&
      bindings.every(
        ({ HostIp, HostPort }) => HostIp === "127.0.0.1" && HostPort === service.port,
      ) &&
      !container.Mounts.some(({ Type }) => Type === "bind"),
    "service_not_disposable_postgres",
  );
}

function psql(id, database, sql, timeout = 15_000) {
  return docker(
    "psql_check_failed",
    ["exec", "-i", id, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "ci", "-d", database],
    { input: sql, timeout },
  );
}

function migrationList(id, database, timeout) {
  return psql(
    id,
    database,
    'SELECT name FROM schema_migrations ORDER BY name COLLATE "C";',
    timeout,
  );
}

function validateContext() {
  const env = process.env;
  check(
    env.GITHUB_REPOSITORY === "seeker19110/xboss" &&
      env.XT_PILOT_ENVIRONMENT === "staging-isolated" &&
      /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? "") &&
      /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? "") &&
      env.XT_PILOT_DEPLOYMENT_ID === `ci-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}` &&
      shaPattern.test(env.XT_PILOT_SOURCE_SHA ?? "") &&
      Boolean(env.RUNNER_TEMP),
    "invalid_staging_context",
  );
  return {
    repository: env.GITHUB_REPOSITORY,
    environment: env.XT_PILOT_ENVIRONMENT,
    run_id: env.GITHUB_RUN_ID,
    run_attempt: env.GITHUB_RUN_ATTEMPT,
    deployment_id: `${env.XT_PILOT_DEPLOYMENT_ID}-restore`,
    source_sha: env.XT_PILOT_SOURCE_SHA,
  };
}

function sandboxDirectory(root, path) {
  const resolved = realpathSync(path);
  const inside = relative(root, resolved);
  check(
    !isAbsolute(inside) &&
      inside !== ".." &&
      !inside.startsWith("../") &&
      lstatSync(resolved).isDirectory(),
    "directory_outside_runner_temp",
  );
  return resolved;
}

function openRegularFile(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    check(fstatSync(fd).isFile(), "invalid_artifact_file");
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function readJson(file) {
  const fd = openRegularFile(file);
  try {
    return JSON.parse(readFileSync(fd, "utf8"));
  } finally {
    closeSync(fd);
  }
}

async function hashFile(file) {
  const fd = openRegularFile(file);
  try {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(null, { fd, autoClose: false })) hash.update(chunk);
    return hash.digest("hex");
  } finally {
    closeSync(fd);
  }
}

function makeDump(sourceId, path) {
  const fd = openSync(path, "wx", 0o600);
  try {
    docker(
      "backup_failed",
      [
        "exec",
        sourceId,
        "pg_dump",
        "-U",
        "ci",
        "-d",
        source.database,
        "-Fc",
        "--no-owner",
        "--no-privileges",
      ],
      { stdio: ["ignore", fd, "pipe"], timeout: 60_000 },
    );
  } finally {
    closeSync(fd);
  }
  check(lstatSync(path).size > 0, "empty_backup");
}

function restoreDump(targetId, path, timeout) {
  const fd = openRegularFile(path);
  try {
    docker(
      "restore_failed",
      [
        "exec",
        "-i",
        targetId,
        "pg_restore",
        "-U",
        "ci",
        "-d",
        target.database,
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
      ],
      { stdio: [fd, "ignore", "pipe"], timeout },
    );
  } finally {
    closeSync(fd);
  }
}

function budget(started) {
  const remaining = Math.floor(rtoMs - (performance.now() - started));
  check(remaining > 0, "rto_exceeded");
  return remaining;
}

async function proveApplication(
  release,
  archive,
  metadataPath,
  evidenceDir,
  receipt,
  password,
  expectedMigrations,
  started,
) {
  const origin = `http://127.0.0.1:${appPort}`;
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", appPort],
    {
      cwd: release,
      env: {
        ...pathEnv,
        PORT: appPort,
        APP_URL: origin,
        NEXT_DIST_DIR: ".next-ci",
        NEXT_TELEMETRY_DISABLED: "1",
        DATABASE_URL: `postgresql://pilot_restore_reader:${password}@127.0.0.1:${target.port}/${target.database}`,
        XBOSS_SECRET: randomBytes(32).toString("hex"),
      },
      stdio: "ignore",
    },
  );
  let startupError = false;
  child.on("error", () => {
    startupError = true;
  });
  const running = () => !startupError && child.exitCode === null && child.signalCode === null;
  try {
    let ready;
    while (!ready) {
      check(running(), "restored_app_exited");
      const timeout = Math.min(1_000, budget(started));
      try {
        const response = await fetch(`${origin}/api/ready`, {
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(timeout),
        });
        if (response.ok) ready = await response.json();
        else await response.body?.cancel();
      } catch {
        // App đang khởi động. Deadline RTO ở đầu vòng giới hạn mọi lần thử.
      }
      if (!ready) await delay(Math.min(250, budget(started)));
    }
    check(
      running() &&
        ready.ready === true &&
        ready.schema === "ok" &&
        ready.migrationsApplied === expectedMigrations.length &&
        ready.appliedHead === expectedMigrations.at(-1),
      "restored_app_readiness_mismatch",
    );
    const proofPath = join(evidenceDir, "restore-artifact.json");
    run(
      "restored_artifact_verification_failed",
      process.execPath,
      [
        resolve("scripts/ops/artifact-pilot.mjs"),
        "verify",
        archive,
        metadataPath,
        release,
        origin,
        proofPath,
      ],
      {
        timeout: budget(started),
        env: {
          ...pathEnv,
          GITHUB_REPOSITORY: receipt.repository,
          XT_PILOT_ENVIRONMENT: receipt.environment,
          GITHUB_RUN_ID: receipt.run_id,
          GITHUB_RUN_ATTEMPT: receipt.run_attempt,
          XT_PILOT_DEPLOYMENT_ID: receipt.deployment_id,
          XT_PILOT_SOURCE_SHA: receipt.source_sha,
        },
      },
    );
    const proof = readJson(proofPath);
    check(
      running() &&
        proof.status === "verified" &&
        proof.verified_archive_sha256 === receipt.artifact_sha256 &&
        proof.probes.length === 4 &&
        proof.probes.every(({ status }) => status === "passed"),
      "restored_artifact_proof_mismatch",
    );
    receipt.application = {
      readiness: "ok",
      build_id: proof.observed_build_id,
      probes: proof.probes,
    };
    const verifiedMs = performance.now() - started;
    check(verifiedMs <= rtoMs, "rto_exceeded");
    receipt.recovery.incident_to_verified_ms = Math.round(verifiedMs);
  } finally {
    if (running()) {
      const exited = once(child, "exit").catch(() => {});
      child.kill("SIGTERM");
      await Promise.race([exited, delay(2_000, undefined, { ref: false })]);
      if (running()) {
        child.kill("SIGKILL");
        await Promise.race([exited, delay(2_000, undefined, { ref: false })]);
      }
      check(!running(), "restored_app_cleanup_failed");
    }
  }
}

async function drill(args, receipt, evidenceDir, root) {
  const [sourceId, targetId, candidatePath, releasePath] = args;
  check(
    sha256Pattern.test(sourceId) && sha256Pattern.test(targetId) && sourceId !== targetId,
    "invalid_or_same_database_containers",
  );
  validateService(sourceId, source);
  validateService(targetId, target);
  const candidate = sandboxDirectory(root, candidatePath);
  const release = sandboxDirectory(root, releasePath);
  const archive = join(candidate, "xboss.tar.gz");
  const metadataPath = join(candidate, "metadata.json");
  const metadata = readJson(metadataPath);
  check(
    metadata.schema === 1 &&
      metadata.source_sha === receipt.source_sha &&
      sha256Pattern.test(metadata.archive_sha256) &&
      (await hashFile(archive)) === metadata.archive_sha256,
    "candidate_archive_mismatch",
  );
  receipt.artifact_sha256 = metadata.archive_sha256;

  const expected = readdirSync("migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort();
  check(
    expected.length > 0 && migrationList(sourceId, source.database) === expected.join("\n"),
    "source_migrations_mismatch",
  );
  check(
    psql(
      sourceId,
      source.database,
      `
    SELECT (SELECT count(*) FROM projects)::text || ':' || (SELECT count(*) FROM users)::text ||
      ':' || (SELECT count(*) FROM tasks)::text;
  `,
    ) === "0:0:0",
    "source_not_empty_synthetic",
  );
  check(
    psql(targetId, target.database, "SELECT count(*) FROM pg_tables WHERE schemaname='public';") ===
      "0",
    "target_not_empty",
  );

  const scratch = mkdtempSync(join(root, "xboss-restore-"));
  try {
    psql(
      sourceId,
      source.database,
      `
      BEGIN;
      INSERT INTO organizations (id, name, slug) VALUES
        (501, 'Synthetic tenant A', 'pilot-restore-a'), (502, 'Synthetic tenant B', 'pilot-restore-b');
      INSERT INTO projects (name, code, org_id) VALUES
        ('Synthetic before backup', 'PILOT-BEFORE', 501), ('Synthetic tenant B', 'PILOT-OTHER', 502);
      COMMIT;
    `,
    );
    const preAt = Date.now();
    const dump = join(scratch, "synthetic.dump");
    const backupStartedAt = Date.now();
    makeDump(sourceId, dump);
    const backupFinishedAt = Date.now();
    psql(
      sourceId,
      source.database,
      `
      INSERT INTO projects (name, code, org_id) VALUES ('Synthetic after backup', 'PILOT-AFTER', 501);
    `,
    );
    const postAt = Date.now();
    const started = performance.now();
    const incidentAt = Date.now();
    const lossMs = incidentAt - preAt;
    receipt.recovery = {
      incident_at: new Date(incidentAt).toISOString(),
      last_recovered_commit_observed_at: new Date(preAt).toISOString(),
      post_backup_commit_observed_at: new Date(postAt).toISOString(),
      synthetic_loss_window_ms: lossMs,
    };
    check(
      preAt <= backupStartedAt &&
        backupStartedAt <= backupFinishedAt &&
        backupFinishedAt <= postAt &&
        postAt <= incidentAt,
      "recovery_timestamps_out_of_order",
    );
    check(lossMs <= rpoMs, "rpo_exceeded");
    receipt.backup = {
      sha256: await hashFile(dump),
      bytes: lstatSync(dump).size,
      started_at: new Date(backupStartedAt).toISOString(),
      finished_at: new Date(backupFinishedAt).toISOString(),
    };

    // pg_dump không chứa role cấp cluster. Policy migration 0170 vẫn tham chiếu role này.
    psql(
      targetId,
      target.database,
      "CREATE ROLE xboss_vault_maint NOLOGIN NOSUPERUSER NOBYPASSRLS;",
      budget(started),
    );
    const restoreStarted = performance.now();
    restoreDump(targetId, dump, budget(started));
    receipt.recovery.pg_restore_ms = Math.round(performance.now() - restoreStarted);
    const password = randomBytes(24).toString("hex");
    psql(
      targetId,
      target.database,
      `
      CREATE ROLE pilot_restore_reader LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}';
      ALTER ROLE pilot_restore_reader SET default_transaction_read_only = on;
      GRANT USAGE ON SCHEMA public TO pilot_restore_reader;
      GRANT SELECT ON schema_migrations, projects TO pilot_restore_reader;
    `,
      budget(started),
    );
    check(
      migrationList(targetId, target.database, budget(started)) === expected.join("\n"),
      "restored_migrations_mismatch",
    );
    check(
      psql(
        sourceId,
        source.database,
        "SELECT count(*) FROM projects WHERE code='PILOT-AFTER' AND org_id=501;",
        budget(started),
      ) === "1",
      "missing_late_source_sentinel",
    );
    check(
      psql(
        targetId,
        target.database,
        `
      SELECT count(*) FILTER (WHERE code='PILOT-BEFORE' AND org_id=501)::text || ':' ||
        count(*) FILTER (WHERE code='PILOT-AFTER')::text || ':' ||
        count(*) FILTER (WHERE code='PILOT-OTHER' AND org_id=502)::text FROM projects;
    `,
        budget(started),
      ) === "1:0:1",
      "restored_sentinels_mismatch",
    );
    check(
      psql(
        targetId,
        target.database,
        `
      BEGIN;
      SET ROLE pilot_restore_reader;
      SELECT row_security_active('projects') AND
        NOT has_table_privilege('projects', 'INSERT,UPDATE,DELETE,TRUNCATE');
      SET LOCAL app.org_id = '501';
      SELECT string_agg(code, ',' ORDER BY code) FROM projects WHERE code LIKE 'PILOT-%';
      SET LOCAL app.org_id = '502';
      SELECT string_agg(code, ',' ORDER BY code) FROM projects WHERE code LIKE 'PILOT-%';
      ROLLBACK;
    `,
        budget(started),
      ) === "t\nPILOT-BEFORE\nPILOT-OTHER",
      "restored_rls_mismatch",
    );
    receipt.database_checks = {
      migrations_applied: expected.length,
      migration_head: expected.at(-1),
      pre_backup_rows_restored: 1,
      post_backup_rows_restored: 0,
      synthetic_rows_outside_recovery: 1,
      cross_tenant_rls: "verified",
    };
    await proveApplication(
      release,
      archive,
      metadataPath,
      evidenceDir,
      receipt,
      password,
      expected,
      started,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  receipt.status = "verified";
}

const args = process.argv.slice(2);
const receipt = {
  schema: 1,
  kind: "logical_restore_drill",
  status: "failed",
  bounds_ms: { rto: rtoMs, rpo: rpoMs },
  scope:
    "synthetic disposable PostgreSQL, pre-provisioned services; excludes PITR, uploads and production SLO",
};
let evidenceDir;
try {
  check(args.length === 5, "invalid_restore_drill_arguments");
  Object.assign(receipt, validateContext());
  const root = realpathSync(process.env.RUNNER_TEMP);
  const evidencePath = sandboxDirectory(root, args[4]);
  check(
    !readdirSync(evidencePath).some(
      (file) => file === "restore.json" || file === "restore-artifact.json",
    ),
    "restore_evidence_already_exists",
  );
  evidenceDir = evidencePath;
  await drill(args, receipt, evidenceDir, root);
} catch (error) {
  receipt.status = "failed";
  receipt.error = error instanceof DrillError ? error.message : "restore_drill_io_failed";
  process.exitCode = 1;
} finally {
  receipt.observed_at = new Date().toISOString();
  if (evidenceDir)
    writeFileSync(join(evidenceDir, "restore.json"), JSON.stringify(receipt, null, 2) + "\n", {
      flag: "wx",
    });
  console.log(
    JSON.stringify({ status: receipt.status, error: receipt.error, recovery: receipt.recovery }),
  );
}
