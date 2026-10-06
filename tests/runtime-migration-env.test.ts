import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const config = readFileSync("ecosystem.config.js", "utf8");
const secret = "fixture-only-migrator-not-connected";
const files = [".env", ".env.local", ".env.production", ".env.production.local", ".env.staging"];

function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "xboss-pm2-env-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "ecosystem.config.cjs"), config);
  return {
    write(name: string, value: string) {
      writeFileSync(join(dir, name), value, { mode: 0o600 });
    },
    run() {
      const result = spawnSync(
        process.execPath,
        [
          "-e",
          `
        const config = require('./ecosystem.config.cjs');
        if (Object.hasOwn(process.env, 'MIGRATE_DATABASE_URL')) process.exit(93);
        if (JSON.stringify(config).includes(${JSON.stringify(secret)})) process.exit(94);
        console.log('SAFE_PM2_ENV');
      `,
        ],
        {
          cwd: dir,
          env: { NODE_ENV: "test", MIGRATE_DATABASE_URL: secret },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.ok(!(result.stdout + result.stderr).includes(secret), "Không in giá trị secret");
      return result;
    },
  };
}

for (const name of files) {
  for (const [label, line] of [
    ["plain", `MIGRATE_DATABASE_URL='${secret}'`],
    ["export", `export MIGRATE_DATABASE_URL='${secret}'`],
    ["colon", `MIGRATE_DATABASE_URL: '${secret}'`],
  ]) {
    test(`PM2 từ chối ${label} trong ${name} mà không lộ giá trị`, (t) => {
      const f = fixture(t);
      f.write(name, `${line}\n`);
      const result = f.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /MIGRATE_DATABASE_URL phải nằm trong file/);
      assert.doesNotMatch(result.stdout, /SAFE_PM2_ENV/);
    });
  }
}

test("PM2 bỏ credential từ shell và không chặn comment/tên biến tương tự", (t) => {
  const f = fixture(t);
  f.write(
    ".env.production.local",
    "# MIGRATE_DATABASE_URL=comment\nMIGRATE_DATABASE_URL_EXTRA=khac\n",
  );
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SAFE_PM2_ENV/);
});
