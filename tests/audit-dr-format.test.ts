import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";

test("DR: source khớp formatter và cấu hình thật của repository", async () => {
  const filepath = resolve("scripts/lib/dr-readonly.ts");
  const source = readFileSync(filepath, "utf8");
  const config = await resolveConfig(filepath);
  const expected = await format(source, { ...config, filepath });
  const actualLines = source.split("\n");
  const expectedLines = expected.split("\n");
  const first = expectedLines.findIndex((line, index) => line !== actualLines[index]);
  const details = JSON.stringify({
    line: first + 1,
    actual: actualLines.slice(Math.max(0, first - 1), first + 4),
    expected: expectedLines.slice(Math.max(0, first - 1), first + 4),
  });
  assert.equal(source === expected, true, `DR_FORMAT_DIFF ${details}`);
});
