import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("e2e/global-setup.ts", "utf8");

test("E2E áp migration bằng database disposable trước khi seed", () => {
  assert.match(source, /DATABASE_URL: E2E_DB/);
  assert.match(source, /MIGRATE_DATABASE_URL: E2E_DB/);
  const migrate = source.indexOf('execSync("npx tsx scripts/migrate.ts"');
  const seed = source.indexOf('execSync("npx tsx scripts/seed-sample.ts"');
  assert.ok(migrate >= 0 && migrate < seed);
});
