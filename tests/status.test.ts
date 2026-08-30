import { test } from "node:test";
import assert from "node:assert/strict";
import { toStatusSlug, parseProgress } from "@/lib/tien-do/status";

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

// ===== Giá trị biên của hằng số trong parseProgress: ngưỡng 1 (phân biệt tỉ lệ vs phần trăm) =====

test("parseProgress: biên quanh ngưỡng 1", () => {
  assert.equal(parseProgress(0.99), 0.99); // ngay dưới
  assert.equal(parseProgress(1), 1); // đúng ngưỡng → giữ nguyên, KHÔNG chia 100
  assert.equal(parseProgress(1.5), 0.015); // ngay trên → hiểu là phần trăm
  assert.equal(parseProgress(100), 1);
  assert.equal(parseProgress(0), 0);
});

test("parseProgress: giá trị dị dạng/cực trị không làm vỡ khoảng [0,1]", () => {
  assert.equal(parseProgress(NaN), 0);
  assert.equal(parseProgress(Infinity), 1);
  assert.equal(parseProgress(-Infinity), 0);
  assert.equal(parseProgress(1e9), 1);
  assert.equal(parseProgress(-1e9), 0);
  assert.equal(parseProgress({}), 0);
  assert.equal(parseProgress([]), 0);
});

test("toStatusSlug: phủ hết chuỗi trạng thái có thật trong file tracking gốc", () => {
  // 5 biến thể duy nhất xuất hiện ở cột GHI CHÚ của cả 5 sheet trong file gốc.
  assert.equal(toStatusSlug("Chuẩn bị"), "chuan_bi");
  assert.equal(toStatusSlug("Đang thi công"), "dang_thi_cong");
  assert.equal(toStatusSlug("Đã Hoàn Thành"), "hoan_thanh");
  assert.equal(toStatusSlug("Đã Nghiệm Thu"), "nghiem_thu");
  assert.equal(toStatusSlug("Đang Trễ"), "tre");
});
