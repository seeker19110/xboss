import { test } from "node:test";
import assert from "node:assert/strict";
import { toStatusSlug, parseProgress } from "@/lib/status";

test("toStatusSlug: map chuỗi tiếng Việt (có dấu, hoa thường) → slug", () => {
  assert.equal(toStatusSlug("Chuẩn bị"), "chuan_bi");
  assert.equal(toStatusSlug("Đang thi công"), "dang_thi_cong");
  assert.equal(toStatusSlug("Đã Hoàn Thành"), "hoan_thanh");
  assert.equal(toStatusSlug("Hoàn thành"), "hoan_thanh");
  assert.equal(toStatusSlug("Đã Nghiệm Thu"), "nghiem_thu");
  assert.equal(toStatusSlug("Đang Trễ"), "tre");
  assert.equal(toStatusSlug("  đang   thi  công  "), "dang_thi_cong");
});

test("toStatusSlug: giá trị lạ/null → mặc định chuan_bi", () => {
  assert.equal(toStatusSlug(null), "chuan_bi");
  assert.equal(toStatusSlug(undefined), "chuan_bi");
  assert.equal(toStatusSlug("???"), "chuan_bi");
  assert.equal(toStatusSlug(123), "chuan_bi");
});

test("parseProgress: số 0..1 giữ nguyên, clamp biên", () => {
  assert.equal(parseProgress(0), 0);
  assert.equal(parseProgress(0.5), 0.5);
  assert.equal(parseProgress(1), 1);
  assert.equal(parseProgress(-0.2), 0);
});

test("parseProgress: số > 1 hiểu là phần trăm (90 → 0.9)", () => {
  assert.equal(parseProgress(90), 0.9);
  assert.equal(parseProgress(150), 1);
});

test("parseProgress: chuỗi số và chuỗi status", () => {
  assert.equal(parseProgress("0.75"), 0.75);
  assert.equal(parseProgress("50"), 0.5);
  assert.equal(parseProgress("Chuẩn bị"), 0);
  assert.equal(parseProgress(""), 0);
  assert.equal(parseProgress(null), 0);
});
