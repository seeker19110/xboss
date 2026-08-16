import { test } from "node:test";
import assert from "node:assert/strict";
import { DELAY_REASONS, DELAY_REASON_LABEL, isDelayReason } from "@/lib/delay";

test("DELAY_REASONS: đúng 6 giá trị theo đúng thứ tự", () => {
  assert.deepEqual(DELAY_REASONS, [
    "thieu_vat_tu",
    "thieu_nhan_luc",
    "cho_mat_bang",
    "doi_thiet_ke",
    "thoi_tiet",
    "khac",
  ]);
});

test("DELAY_REASON_LABEL: đúng 6 khoá khớp DELAY_REASONS, nhãn tiếng Việt không rỗng", () => {
  const keys = Object.keys(DELAY_REASON_LABEL);
  assert.equal(keys.length, DELAY_REASONS.length);
  for (const reason of DELAY_REASONS) {
    assert.ok(keys.includes(reason), `thiếu khoá ${reason}`);
    const label = DELAY_REASON_LABEL[reason];
    assert.equal(typeof label, "string");
    assert.ok(label.trim().length > 0, `nhãn của ${reason} không được rỗng`);
  }
});

test("isDelayReason: true cho mọi giá trị hợp lệ trong DELAY_REASONS", () => {
  for (const reason of DELAY_REASONS) {
    assert.equal(isDelayReason(reason), true);
  }
});

test("isDelayReason: false cho chuỗi không hợp lệ và các kiểu dữ liệu khác", () => {
  assert.equal(isDelayReason("khong_ton_tai"), false);
  assert.equal(isDelayReason(null), false);
  assert.equal(isDelayReason(undefined), false);
  assert.equal(isDelayReason(1), false);
  assert.equal(isDelayReason({}), false);
});
