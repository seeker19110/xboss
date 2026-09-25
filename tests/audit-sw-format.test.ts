// Dùng formatter/cấu hình thật của repo để báo diff chính xác, không nới cổng CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";

test("SW: source khớp formatter đã khóa của repo", async () => {
  const filepath = "public/sw.js";
  const source = readFileSync(filepath, "utf8");
  const options = await resolveConfig(filepath);
  const expected = await format(source, { ...options, filepath });
  assert.equal(source, expected, "Chênh lệch định dạng public/sw.js");
});
