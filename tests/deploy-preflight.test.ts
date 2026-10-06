import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const deploy = readFileSync("deploy.sh", "utf8");
const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const sha = "a".repeat(40);
const secret = "postgresql://fixture:fixture-only@127.0.0.1:1/not-connected";

// Thi hành nguyên bootstrap trong workflow; chỉ thay vận chuyển SSH bằng shell cục bộ.
// git/npm/pm2 bị chặn bằng executable giả; không dùng mạng, DB hay secret production.
const step = workflow.slice(workflow.indexOf("      - name: Chạy deploy trên VPS\n"));
const runStart = step.indexOf("        run: |\n") + "        run: |\n".length;
const sshStart = step.indexOf("          timeout 15m ssh", runStart);
assert.ok(runStart > 0 && sshStart > runStart, "Không tìm được bootstrap deploy cần kiểm");
const bootstrap = step
  .slice(runStart, sshStart)
  .split("\n")
  .map((line) => line.slice(10))
  .join("\n");

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "xboss-preflight-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, "checkout cu");
  const bin = join(root, "bin");
  const temp = join(root, "scripts-tam");
  for (const dir of [app, bin, temp]) mkdirSync(dir);
  const log = join(root, "calls.log");
  const credential = join(root, "migrate.env");
  const pinned = join(root, "pinned.sh");
  writeFileSync(log, "");
  writeFileSync(pinned, deploy);
  writeFileSync(
    join(app, "deploy.sh"),
    "#!/bin/bash\necho SCRIPT_CU_KHONG_DUOC_CHAY >&2\nexit 96\n",
  );
  const executable = (name: string, body: string) =>
    writeFileSync(join(bin, name), `#!/bin/bash\nset -eu\n${body}\n`, { mode: 0o755 });
  executable(
    "git",
    `printf 'git %s\\n' "$*" >> "$FAKE_LOG"
case "$1" in
  fetch) [ "$FAKE_FETCH_FAIL" != 1 ] || exit 17 ;;
  show)
    [ "$FAKE_SHOW_FAIL" != 1 ] || exit 18
    [ "$2" = "$FAKE_SHA:deploy.sh" ] || exit 98
    cat "$FAKE_PINNED" ;;
  rev-parse) printf '%s\\n' "$FAKE_MAIN_SHA" ;;
  reset|clean) : ;;
  *) exit 98 ;;
esac`,
  );
  executable(
    "npm",
    `printf 'npm %s\\n' "$*" >> "$FAKE_LOG"
case "$*" in
  ci) [ -z "\${MIGRATE_DATABASE_URL:-}" ] || exit 98 ;;
  'run db:migrate')
    [ "\${MIGRATE_DATABASE_URL:-}" = "$FAKE_SECRET" ] || exit 98
    exit 91 ;;
  *) exit 98 ;;
esac`,
  );
  executable("pm2", 'echo "pm2 KHONG_DUOC_CHAY" >> "$FAKE_LOG"; exit 98');
  executable(
    "mktemp",
    `[ "$1" = /tmp/xboss-deploy.XXXXXX ] || exit 98
/bin/mktemp "$FAKE_TMP/xboss-deploy.XXXXXX"`,
  );
  const env: NodeJS.ProcessEnv = {
    PATH: `${bin}:/usr/bin:/bin`,
    HOME: root,
    APP_DIR: app,
    DEPLOY_SHA: sha,
    MIGRATION_ENV_FILE: credential,
    FAKE_LOG: log,
    FAKE_PINNED: pinned,
    FAKE_TMP: temp,
    FAKE_SHA: sha,
    FAKE_MAIN_SHA: sha,
    FAKE_SECRET: secret,
    FAKE_FETCH_FAIL: "0",
    FAKE_SHOW_FAIL: "0",
  };
  function credentials(content = `MIGRATE_DATABASE_URL='${secret}'\n`, mode = 0o600) {
    writeFileSync(credential, content, { mode });
  }
  function run() {
    const result = spawnSync("/bin/bash", ["-c", `${bootstrap}\n/bin/bash -c "$REMOTE_COMMAND"`], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    const calls = readFileSync(log, "utf8");
    const output = result.stdout + result.stderr;
    assert.doesNotMatch(output, /SCRIPT_CU_KHONG_DUOC_CHAY/);
    assert.ok(!output.includes(secret) && !calls.includes(secret), "Không được lộ credential");
    assert.deepEqual(readdirSync(temp), [], "Script tạm phải được dọn cả khi deploy lỗi");
    return { ...result, calls, output };
  }
  function rejected(pattern: RegExp) {
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.output, pattern);
    assert.doesNotMatch(result.calls, /^git (reset|clean)|^npm |^pm2 /m);
    return result;
  }
  return { app, env, credentials, run, rejected };
}

test("bootstrap thiếu credential không reset checkout và không chạy script cũ", (t) => {
  fixture(t).rejected(/Thiếu file credential migration/);
});

test("bootstrap từ chối credential có mode khác 600 trước thay đổi checkout", (t) => {
  const f = fixture(t);
  f.credentials(`MIGRATE_DATABASE_URL='${secret}'\n`, 0o644);
  f.rejected(/phải có quyền 600/);
});

test("bootstrap từ chối URL migration trống trước thay đổi checkout", (t) => {
  const f = fixture(t);
  f.credentials("MIGRATE_DATABASE_URL=''\n");
  f.rejected(/Chưa cấu hình MIGRATE_DATABASE_URL/);
});

for (const filename of [".env", ".env.local", ".env.staging"]) {
  test(`bootstrap chặn credential migrator trong ${filename} trước reset/npm ci`, (t) => {
    const f = fixture(t);
    f.credentials();
    writeFileSync(join(f.app, filename), `MIGRATE_DATABASE_URL='${secret}'\n`, { mode: 0o600 });
    f.rejected(/Xóa MIGRATE_DATABASE_URL/);
  });
}

test("bootstrap từ chối main khác SHA CI trước reset và vẫn dọn script", (t) => {
  const f = fixture(t);
  f.credentials();
  f.env.FAKE_MAIN_SHA = "b".repeat(40);
  f.rejected(/main đã thay đổi so với commit CI/);
});

test("bootstrap từ chối SHA sai trước khi gọi git", (t) => {
  const f = fixture(t);
  f.env.DEPLOY_SHA = "khong-phai-sha";
  const result = f.rejected(/DEPLOY_SHA không hợp lệ/);
  assert.equal(result.calls, "");
});

test("bootstrap fetch lỗi không reset, không migrate", (t) => {
  const f = fixture(t);
  f.env.FAKE_FETCH_FAIL = "1";
  const result = f.run();
  assert.equal(result.status, 17);
  assert.equal(result.calls, `git fetch origin ${sha}\n`);
});

test("bootstrap không đọc được script đúng SHA vẫn dọn file tạm", (t) => {
  const f = fixture(t);
  f.env.FAKE_SHOW_FAIL = "1";
  const result = f.run();
  assert.equal(result.status, 18);
  assert.doesNotMatch(result.calls, /^git (reset|clean)|^npm |^pm2 /m);
});

for (const source of ["file", "env"]) {
  test(`preflight hợp lệ từ ${source}: đúng SHA và chỉ migrator nhận credential`, (t) => {
    const f = fixture(t);
    if (source === "file") f.credentials();
    else f.env.MIGRATE_DATABASE_URL = secret;
    const result = f.run();
    // npm giả dừng tại migration; đây không phải bằng chứng deploy/DB đã thành công.
    assert.equal(result.status, 91, result.output);
    const show = result.calls.indexOf(`git show ${sha}:deploy.sh\n`);
    const reset = result.calls.indexOf(`git reset --hard ${sha}\n`);
    const install = result.calls.indexOf("npm ci\n");
    const migrate = result.calls.indexOf("npm run db:migrate\n");
    assert.ok(show >= 0 && show < reset && reset < install && install < migrate);
    assert.doesNotMatch(result.calls, /^pm2 /m);
  });
}
