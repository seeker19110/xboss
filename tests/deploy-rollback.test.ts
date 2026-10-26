import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const deploy = readFileSync("deploy.sh", "utf8");

// Chạy script thật trong checkout tạm; mọi lệnh mạng, DB, build và PM2 đều là executable giả.
function runDeploy(
  t: TestContext,
  options: { staging?: boolean; reload?: string; health?: boolean; previous?: boolean } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "xboss-deploy-rollback-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(root, "deploy.sh"), deploy);
  writeFileSync(join(root, ".env.local"), "PORT=34567\n");
  writeFileSync(join(root, ".env.staging"), "PORT=34568\n");
  writeFileSync(join(root, ".next-ci.tar.gz"), "artifact-test");
  if (options.previous !== false) {
    mkdirSync(join(root, ".next"));
    writeFileSync(join(root, ".next/version"), "old-build");
  }
  const executable = (name: string, body: string) =>
    writeFileSync(join(bin, name), `#!/bin/bash\nset -eu\n${body}\n`, { mode: 0o755 });
  executable(
    "git",
    `case "$1" in
  fetch|reset|clean) : ;;
  rev-parse) printf '%s\\n' "$FAKE_SHA" ;;
  *) exit 98 ;;
esac`,
  );
  executable(
    "npm",
    `case "$*" in
  ci) [ -z "\${MIGRATE_DATABASE_URL:-}" ] || exit 98 ;;
  'run db:migrate') [ "\${MIGRATE_DATABASE_URL:-}" = "$FAKE_SECRET" ] || exit 98 ;;
  'run build') mkdir -p "$NEXT_DIST_DIR"; printf new-build > "$NEXT_DIST_DIR/version" ;;
  *) exit 98 ;;
esac`,
  );
  executable(
    "pm2",
    `[ "$1" = reload ] || exit 98
[ -z "\${MIGRATE_DATABASE_URL:-}" ] || exit 98
count=0
[ ! -f reload-count ] || count=$(cat reload-count)
count=$((count+1))
printf '%s' "$count" > reload-count
printf 'pm2 %s build=%s\\n' "$*" "$(cat .next/version)" >> "$FAKE_LOG"
if [ "$FAKE_RELOAD" = all ] || { [ "$FAKE_RELOAD" = first ] && [ "$count" = 1 ]; } || { [ "$FAKE_RELOAD" = second ] && [ "$count" = 2 ]; }; then exit 27; fi`,
  );
  executable(
    "curl",
    `printf 'curl %s\\n' "$*" >> "$FAKE_LOG"
[ "$FAKE_HEALTH" = success ]`,
  );
  executable("sleep", ":");
  const secret = "postgresql://fixture:fixture-only@127.0.0.1:1/not-connected";
  const log = join(root, "calls.log");
  const result = spawnSync(
    "/bin/bash",
    ["deploy.sh", options.staging ? "--staging" : "--build-local"],
    {
      cwd: root,
      env: {
        NODE_ENV: "test",
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: root,
        MIGRATE_DATABASE_URL: secret,
        EXPECTED_DEPLOY_SHA: "a".repeat(40),
        FAKE_SHA: "a".repeat(40),
        FAKE_SECRET: secret,
        FAKE_LOG: log,
        FAKE_RELOAD: options.reload ?? "success",
        FAKE_HEALTH: options.health === false ? "failure" : "success",
      },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const output = result.stdout + result.stderr;
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  assert.ok(!output.includes(secret) && !calls.join("\n").includes(secret));
  return {
    status: result.status,
    output,
    calls,
    current: existsSync(join(root, ".next/version"))
      ? readFileSync(join(root, ".next/version"), "utf8")
      : null,
    oldExists: existsSync(join(root, options.staging ? ".next-old-staging" : ".next-old")),
    artifactRetained: existsSync(join(root, ".next-ci.tar.gz")),
  };
}

for (const staging of [false, true]) {
  const label = staging ? "staging" : "production";
  const pm2Name = staging ? "xboss-staging" : "xboss";
  test(`deploy ${label}: reload lỗi khôi phục build cũ và giữ artifact`, (t) => {
    const r = runDeploy(t, { staging, reload: "first" });
    assert.equal(r.status, 1);
    assert.equal(r.current, "old-build");
    assert.equal(r.oldExists, false);
    assert.equal(r.artifactRetained, true);
    assert.deepEqual(r.calls, [
      `pm2 reload ${pm2Name} --update-env build=new-build`,
      `pm2 reload ${pm2Name} --update-env build=old-build`,
    ]);
    assert.doesNotMatch(r.output, /Deploy hoàn tất/);
  });

  test(`deploy ${label}: health lỗi vẫn khôi phục build cũ sau đúng 5 lần thử`, (t) => {
    const r = runDeploy(t, { staging, health: false });
    assert.equal(r.status, 1);
    assert.equal(r.current, "old-build");
    assert.equal(r.calls.filter((c) => c.startsWith("curl ")).length, 5);
    assert.equal(r.calls.at(-1), `pm2 reload ${pm2Name} --update-env build=old-build`);
    assert.equal(r.artifactRetained, true);
  });

  test(`deploy ${label}: reload và health đạt mới dọn build cũ/artifact`, (t) => {
    const r = runDeploy(t, { staging });
    assert.equal(r.status, 0);
    assert.equal(r.current, "new-build");
    assert.equal(r.oldExists, false);
    assert.equal(r.artifactRetained, false);
    assert.equal(r.calls.filter((c) => c.startsWith("pm2 ")).length, 1);
    assert.equal(r.calls.filter((c) => c.startsWith("curl ")).length, 1);
  });
}

for (const failure of [{ reload: "first" }, { health: false }]) {
  test(`deploy lần đầu lỗi ${failure.reload ? "reload" : "health"}: giữ build để điều tra khi không có bản cũ`, (t) => {
    const r = runDeploy(t, { previous: false, ...failure });
    assert.equal(r.status, 1);
    assert.equal(r.current, "new-build");
    assert.equal(r.artifactRetained, true);
    assert.equal(r.calls.filter((c) => c.startsWith("pm2 ")).length, 1);
    assert.match(r.output, /Không có bản build trước/);
    assert.doesNotMatch(r.output, /Deploy hoàn tất|Đã khôi phục/);
  });
}

test("deploy: reload lại cũng lỗi không được báo rollback thành công", (t) => {
  const r = runDeploy(t, { reload: "all" });
  assert.equal(r.status, 1);
  assert.equal(r.current, "old-build");
  assert.equal(r.artifactRetained, true);
  assert.equal(r.calls.filter((c) => c.startsWith("pm2 ")).length, 2);
  assert.match(r.output, /PM2 reload lại thất bại/);
  assert.doesNotMatch(r.output, /Deploy hoàn tất|Đã khôi phục/);
});
