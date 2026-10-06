import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deploy = readFileSync("deploy.sh", "utf8");
const ecosystem = readFileSync("ecosystem.config.js", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const staging = readFileSync("docs/ops/staging.md", "utf8");
const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

test("deploy chỉ cấp credential migration cho command migrate", () => {
  const migrationPreflight = deploy.lastIndexOf("\nlay_migration_url\n");
  const runtimeEnvCheck = deploy.indexOf("kiem_tra_runtime_env\n", migrationPreflight);
  const gitFetch = deploy.indexOf("git fetch origin");
  const migrationCommand = deploy.indexOf(
    'MIGRATE_DATABASE_URL="$MIGRATION_URL" npm run db:migrate',
  );
  assert.ok(migrationPreflight >= 0 && migrationPreflight < gitFetch);
  const runtimeEnvRecheck = deploy.indexOf("kiem_tra_runtime_env\n", gitFetch);
  assert.ok(runtimeEnvCheck > migrationPreflight && runtimeEnvCheck < gitFetch);
  assert.ok(runtimeEnvRecheck > gitFetch && runtimeEnvRecheck < migrationCommand);
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

test("bootstrap staging từ chối URL cũ trước khi source và gỡ biến trước PM2", () => {
  const rejectOldCredential = staging.indexOf("if grep -Eq '^[[:space:]]*MIGRATE_DATABASE_URL");
  const sourceRuntimeEnv = staging.indexOf(". ./.env.staging");
  const unsetBeforeSource = staging.indexOf("unset MIGRATE_DATABASE_URL");
  const unsetBeforePm2 = staging.indexOf("unset MIGRATE_DATABASE_URL", sourceRuntimeEnv);
  const startPm2 = staging.indexOf("pm2 start npm --name xboss-staging", sourceRuntimeEnv);
  assert.ok(rejectOldCredential >= 0 && rejectOldCredential < sourceRuntimeEnv);
  assert.ok(unsetBeforeSource > rejectOldCredential && unsetBeforeSource < sourceRuntimeEnv);
  assert.ok(unsetBeforePm2 > sourceRuntimeEnv && unsetBeforePm2 < startPm2);
});

test("workflow đọc script đúng SHA nhưng để preflight quyết định trước reset", () => {
  assert.match(workflow, /DEPLOY_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /\[\[ ! "\$DEPLOY_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  const fetchCommit = workflow.indexOf("git fetch origin '$DEPLOY_SHA'");
  const readScript = workflow.indexOf("git show '$DEPLOY_SHA:deploy.sh'");
  const runScript = workflow.indexOf("EXPECTED_DEPLOY_SHA='$DEPLOY_SHA' bash", fetchCommit);
  assert.ok(fetchCommit >= 0 && fetchCommit < readScript && readScript < runScript);
  assert.doesNotMatch(workflow, /git reset --hard '\$DEPLOY_SHA'/);
  assert.match(workflow, /mktemp \/tmp\/xboss-deploy\.XXXXXX/);
  assert.match(workflow, /trap 'rm -f/);
  assert.match(readFileSync("deploy.sh", "utf8"), /CI_SHA.*HEAD_SHA|CI_SHA=\$\(grep/);
});

test("deploy ghim commit CI và dừng trước migration nếu main đã đổi", () => {
  const fetch = deploy.indexOf("git fetch origin");
  const compare = deploy.indexOf('git rev-parse "origin/$BRANCH"', fetch);
  const mismatch = deploy.indexOf("main đã thay đổi so với commit CI", compare);
  const reset = deploy.indexOf('git reset --hard "$TARGET_SHA"', mismatch);
  const migrate = deploy.indexOf('MIGRATE_DATABASE_URL="$MIGRATION_URL" npm run db:migrate', reset);
  assert.ok(fetch >= 0 && fetch < compare && compare < mismatch && mismatch < reset);
  assert.ok(reset < migrate);
});
