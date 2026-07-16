import { test } from "node:test";
import assert from "node:assert/strict";
import { isContentTooLarge } from "@/lib/photos";

const MAX = 20 * 1024 * 1024; // 20MB, dùng mốc giống MAX_DOC_BYTES để test dễ đọc

test("isContentTooLarge: thiếu header Content-Length → false (để check file.size sau formData() làm lưới an toàn)", () => {
  assert.equal(isContentTooLarge(null, MAX), false);
});

test("isContentTooLarge: header dưới ngưỡng (kể cả cộng dung sai 64KB) → false", () => {
  assert.equal(isContentTooLarge(String(MAX), MAX), false);
  assert.equal(isContentTooLarge(String(MAX + 64 * 1024), MAX), false);
});

test("isContentTooLarge: header vượt ngưỡng + dung sai 64KB → true", () => {
  assert.equal(isContentTooLarge(String(MAX + 64 * 1024 + 1), MAX), true);
  assert.equal(isContentTooLarge(String(MAX * 5), MAX), true);
});

test("isContentTooLarge: header không parse được số → false", () => {
  assert.equal(isContentTooLarge("khong-phai-so", MAX), false);
  assert.equal(isContentTooLarge("", MAX), false);
  assert.equal(isContentTooLarge("NaN", MAX), false);
});
