import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deploy = readFileSync("deploy.sh", "utf8");
const ecosystem = readFileSync("ecosystem.config.js", "utf8");
const envExample = readFileSync(".env.example", "utf8");

test("deploy chỉ cấp credential migration cho command migrate", () => {
  const migrationPreflight = deploy.lastIndexOf("\nlay_migration_url\n");
  const runtimeEnvCheck = deploy.indexOf("kiem_tra_runtime_env\n", migrationPreflight);
  const gitFetch = deploy.indexOf("git fetch origin");
  const migrationCommand = deploy.indexOf(
    'MIGRATE_DATABASE_URL="$MIGRATION_URL" npm run db:migrate',
  );
  assert.ok(migrationPreflight >= 0 && migrationPreflight < gitFetch);
  assert.ok(runtimeEnvCheck > gitFetch && runtimeEnvCheck < migrationCommand);
  assert.ok(migrationCommand > gitFetch);
  assert.match(deploy, /unset MIGRATE_DATABASE_URL/);
  assert.match(deploy, /\[ "\$mode" != "600" \]/);
  assert.match(deploy, /Xóa MIGRATE_DATABASE_URL khỏi \$file/);
  assert.match(deploy, /unset MIGRATION_URL MIGRATION_URL_FROM_ENV/);
});

test("PM2 từ chối migration URL trong env file và không kế thừa URL từ shell", () => {
  assert.match(ecosystem, /Object\.hasOwn\(envFile, "MIGRATE_DATABASE_URL"\)/);
  assert.match(ecosystem, /delete process\.env\.MIGRATE_DATABASE_URL/);
  assert.doesNotMatch(ecosystem, /MIGRATE_DATABASE_URL\s*:/);
  assert.doesNotMatch(envExample, /^MIGRATE_DATABASE_URL=/m);
});
