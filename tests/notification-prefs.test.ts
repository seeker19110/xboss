import { test } from "node:test";
import assert from "node:assert/strict";
import { PREF_KEYS, type PrefKey, type Prefs } from "@/lib/van-hanh/notification-prefs";

// PREF_KEYS là hợp đồng giữa UI chuông thông báo, bảng notification_prefs và lib/dich-vu/thong-bao.
// Đổi/xoá một khoá ở đây là làm mồ côi tuỳ chọn người dùng đã lưu trong DB, nên khoá lại danh sách.

test("PREF_KEYS: đúng 8 khoá, không trùng, không rỗng", () => {
  assert.equal(PREF_KEYS.length, 8);
  assert.equal(new Set(PREF_KEYS).size, PREF_KEYS.length, "không được có khoá trùng");
  for (const k of PREF_KEYS) assert.ok(k.length > 0);
});

test("PREF_KEYS: khoá đúng như hợp đồng với DB và UI", () => {
  assert.deepEqual(
    [...PREF_KEYS],
    [
      "delayed",
      "due_soon",
      "upcoming_start",
      "activity_progress",
      "activity_photo",
      "activity_document",
      "activity_comment",
      "material_over",
    ],
  );
});

test("Prefs: kiểu cho phép bật/tắt từng phần, khoá lạ bị TypeScript chặn", () => {
  const p: Prefs = { delayed: true, due_soon: false };
  assert.equal(p.delayed, true);
  assert.equal(p.due_soon, false);
  assert.equal(p.material_over, undefined, "khoá chưa đặt là undefined, không phải false");

  // PrefKey chỉ nhận giá trị trong PREF_KEYS — dòng dưới sẽ không biên dịch nếu sai:
  const k: PrefKey = "activity_comment";
  assert.ok(PREF_KEYS.includes(k));
});
