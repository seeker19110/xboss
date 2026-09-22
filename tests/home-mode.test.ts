import "./setup"; // quy ước: đứng đầu (dù test thuần, không chạm DB)
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHomeMode, HOME_MODE_KEY } from "@/app/lib/homeMode";

// ===== M127 FR1 — chọn chế độ trang chủ theo vai trò =====

test("resolveHomeMode: thầu phụ LUÔN ở chế độ Hiện trường (kể cả khi đã lưu lựa chọn khác)", () => {
  assert.equal(resolveHomeMode("subcon", null), "hien-truong");
  assert.equal(resolveHomeMode("subcon", "dieu-hanh"), "hien-truong");
  assert.equal(resolveHomeMode("subcon", "hien-truong"), "hien-truong");
});

test("resolveHomeMode: kỹ sư mặc định Hiện trường, theo lựa chọn đã lưu nếu có", () => {
  assert.equal(resolveHomeMode("engineer", null), "hien-truong");
  assert.equal(resolveHomeMode("engineer", "dieu-hanh"), "dieu-hanh");
  assert.equal(resolveHomeMode("engineer", "hien-truong"), "hien-truong");
});

test("resolveHomeMode: vai trò quản lý/chỉ-xem luôn ở chế độ Điều hành", () => {
  for (const role of ["admin", "pm", "bch", "cdt", "viewer"]) {
    assert.equal(resolveHomeMode(role, null), "dieu-hanh", role);
    // Lựa chọn lưu trong localStorage KHÔNG được đẩy họ sang chế độ Hiện trường (trống
    // với người không có task được giao) — vd kỹ sư đổi vai trò thành PM vẫn còn khoá cũ.
    assert.equal(resolveHomeMode(role, "hien-truong"), "dieu-hanh", role);
  }
});

test("resolveHomeMode: vai trò rỗng/không rõ → Điều hành (mặc định an toàn)", () => {
  assert.equal(resolveHomeMode(undefined, null), "dieu-hanh");
  assert.equal(resolveHomeMode(null, "hien-truong"), "dieu-hanh");
  assert.equal(resolveHomeMode("", null), "dieu-hanh");
});

test("HOME_MODE_KEY: khoá localStorage cố định (đổi = mất lựa chọn của người dùng cũ)", () => {
  assert.equal(HOME_MODE_KEY, "xboss_home_mode");
});
