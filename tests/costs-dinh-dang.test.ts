import { test } from "node:test";
import assert from "node:assert/strict";
import {
  doRongThanh,
  phanTram,
  tienDayDu,
  tienRutGon,
} from "../app/costs/_components/dinhDangChiPhi";

// Hiển thị trang /costs (S11): số đầy đủ và % tính bằng bigint từ chuỗi exact; rút gọn chỉ trình bày.

test("tienDayDu: làm tròn tới đồng bằng bigint, giữ chữ số lớn (A3-AC01)", () => {
  assert.equal(tienDayDu("1234567.50"), "1.234.568 đ");
  assert.equal(tienDayDu("-0.50"), "-1 đ");
  assert.equal(tienDayDu("90071992547409.92"), "90.071.992.547.410 đ");
  assert.equal(tienDayDu("0.00"), "0 đ");
});

test("tienRutGon: 0 hiện gạch; ≥ 1 tỷ/1 triệu rút gọn; nhỏ hơn hiện đầy đủ exact", () => {
  assert.equal(tienRutGon("0.00"), "—");
  assert.equal(tienRutGon("2500000000.00"), "2.50 tỷ");
  assert.equal(tienRutGon("1500000.00"), "1.5 tr");
  assert.equal(tienRutGon("999.49"), "999 đ");
});

test("phanTram: tỷ lệ exact, mẫu ≤ 0 trả null (không Infinity/NaN)", () => {
  assert.equal(phanTram("90.00", "100.00"), 90);
  assert.equal(phanTram("2.69", "3.00"), 90); // 89.67 → 90 (ties xa 0 ở hàng đơn vị)
  assert.equal(phanTram("1.00", "0.00"), null);
  assert.equal(phanTram("0.00", "0.00"), null);
});

test("doRongThanh: kẹp 0–100, mẫu 0 → 0", () => {
  assert.equal(doRongThanh("50.00", "100.00"), 50);
  assert.equal(doRongThanh("500.00", "100.00"), 100);
  assert.equal(doRongThanh("5.00", "0.00"), 0);
});
