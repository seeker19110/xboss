import "./setup"; // phải đứng đầu: trỏ DB sang :memory: trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { toISO } from "@/lib/import";

test("toISO: serial Excel → ISO date", () => {
  // 45292 = 2024-01-01 (epoch Excel 1900)
  assert.equal(toISO(45292), "2024-01-01");
});

test("toISO: Date object và chuỗi ngày", () => {
  assert.equal(toISO(new Date(Date.UTC(2026, 5, 10))), "2026-06-10");
  assert.equal(toISO("2026-06-10"), "2026-06-10");
});

test("toISO: giá trị rỗng/không hợp lệ → null", () => {
  assert.equal(toISO(null), null);
  assert.equal(toISO(""), null);
  assert.equal(toISO("không phải ngày"), null);
});
