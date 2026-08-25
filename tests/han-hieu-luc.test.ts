// tests/han-hieu-luc.test.ts — hạn hiệu lực hồ sơ (lib/nen/han-hieu-luc.ts).
// Logic này trước đây nằm rải trong 4 trang `.tsx` nên KHÔNG có test nào; gom về lib
// mới test được. Ca quan trọng nhất: mốc cảnh báo phải cùng múi giờ VN với todayISO().
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayISO, daysFromTodayISO } from "@/lib/nen/date";
import {
  EXPIRY_WARN_DAYS,
  trangThaiHanTheoNgay,
  isExpired,
  isExpiringSoon,
} from "@/lib/nen/han-hieu-luc";

test("trangThaiHanTheoNgay: không hạn / quá hạn / sắp hết / còn hạn", () => {
  assert.equal(trangThaiHanTheoNgay(null), "khong_han");
  assert.equal(trangThaiHanTheoNgay(undefined), "khong_han");
  assert.equal(trangThaiHanTheoNgay(daysFromTodayISO(-1)), "qua_han");
  assert.equal(trangThaiHanTheoNgay(daysFromTodayISO(1)), "sap_het_han");
  assert.equal(trangThaiHanTheoNgay(daysFromTodayISO(EXPIRY_WARN_DAYS + 1)), "con_han");
});

test("trangThaiHanTheoNgay: hôm nay CHƯA quá hạn (biên dưới)", () => {
  // Hết hạn đúng hôm nay vẫn còn hiệu lực trong ngày — chỉ 'sắp hết hạn'.
  assert.equal(trangThaiHanTheoNgay(todayISO()), "sap_het_han");
});

test("BIÊN: hết hạn đúng ngày thứ N vẫn phải được cảnh báo — mốc cùng múi giờ VN", () => {
  // Bản cũ chép trong 4 trang tính mốc bằng `new Date(Date.now() + N*86400_000)` (UTC
  // thuần) rồi so với todayISO() (UTC+7) → khoảng 0h–7h sáng giờ VN mốc lùi 1 ngày và ca
  // này TRƯỢT. Đi qua daysFromTodayISO thì hai đầu cùng múi giờ nên đúng ở mọi giờ.
  const dungHan = daysFromTodayISO(EXPIRY_WARN_DAYS);
  assert.equal(trangThaiHanTheoNgay(dungHan), "sap_het_han");
  assert.equal(isExpiringSoon({ status: "valid", expiryDate: dungHan }), true);

  // Ngoài ngưỡng 1 ngày thì không cảnh báo — chứng minh biên đúng ở cả hai phía.
  assert.equal(trangThaiHanTheoNgay(daysFromTodayISO(EXPIRY_WARN_DAYS + 1)), "con_han");
});

test("isExpired/isExpiringSoon chỉ xét hồ sơ đang hiệu lực", () => {
  const quaHan = daysFromTodayISO(-5);
  const sapHet = daysFromTodayISO(3);

  assert.equal(isExpired({ status: "valid", expiryDate: quaHan }), true);
  assert.equal(isExpiringSoon({ status: "valid", expiryDate: sapHet }), true);

  // Đã thay thế / đã đánh dấu hết hạn → không cảnh báo lại.
  for (const status of ["superseded", "expired", "draft"]) {
    assert.equal(isExpired({ status, expiryDate: quaHan }), false, status);
    assert.equal(isExpiringSoon({ status, expiryDate: sapHet }), false, status);
  }

  // Không có ngày hết hạn → không bao giờ cảnh báo.
  assert.equal(isExpired({ status: "valid", expiryDate: null }), false);
  assert.equal(isExpiringSoon({ status: "valid", expiryDate: null }), false);
});

test("isExpiringSoon nhận ngưỡng tuỳ biến", () => {
  const sau10Ngay = daysFromTodayISO(10);
  assert.equal(isExpiringSoon({ status: "valid", expiryDate: sau10Ngay }, 7), false);
  assert.equal(isExpiringSoon({ status: "valid", expiryDate: sau10Ngay }, 14), true);
});
