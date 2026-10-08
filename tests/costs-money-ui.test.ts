import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtTienDayDu, fmtTienRutGon, phanTramSuDung } from "@/app/costs/_components/chiPhi";
import { reachesPct, usagePct, costAmountsToWire } from "@/lib/tai-chinh/cost";
import { isMoneyPrecisionError } from "@/lib/nen/money";

// QUALITY-FINAL-1 / S10 chi phí — hàm thuần hiển thị/so ngưỡng (A3-FR06, A4-FR07): không float.

test("fmtTienRutGon/fmtTienDayDu: bigint, không mất xu ở số lớn, 0 → —", () => {
  assert.equal(fmtTienRutGon("0.00"), "—");
  assert.equal(fmtTienRutGon("123456.00"), "123.456 đ");
  assert.equal(fmtTienRutGon("4550000.00"), "4.6 tr"); // 4,55 tr → ties xa 0
  assert.equal(fmtTienRutGon("1234567890.00"), "1.23 tỷ");
  assert.equal(fmtTienRutGon("-1234567890.00"), "-1.23 tỷ");
  assert.equal(fmtTienDayDu("9007199254740990.01"), "9.007.199.254.740.990,01 đ");
  assert.equal(fmtTienDayDu("1000.00"), "1.000 đ");
  assert.equal(fmtTienDayDu("-0.50"), "-0,50 đ");
});

test("phanTramSuDung/usagePct: ngân sách 0 → null (không Infinity), số lớn chia bigint", () => {
  assert.equal(phanTramSuDung("5.00", "0.00"), null);
  assert.equal(phanTramSuDung("1.00", "3.00"), 33.33);
  assert.equal(phanTramSuDung("9007199254740990.01", "9007199254740990.01"), 100);
  assert.equal(usagePct(500n, 0n), null);
  assert.equal(usagePct(9500n, 10000n), 95);
});

test("reachesPct: so chéo exact — 89,99% < 90%, đúng 90% đạt, ngân sách 0 không cảnh báo", () => {
  assert.equal(reachesPct(8999n, 10000n, 90), false);
  assert.equal(reachesPct(9000n, 10000n, 90), true);
  // 90,1%: 0,1 không biểu diễn đúng nhị phân — vẫn so bằng số nguyên.
  assert.equal(reachesPct(9010n, 10000n, 90.1), true);
  assert.equal(reachesPct(9009n, 10000n, 90.1), false);
  assert.equal(reachesPct(1n, 0n, 0.01), false);
  // Số lớn hơn 2^53: chênh 1 xu vẫn phân biệt được.
  const b = 10n ** 18n;
  assert.equal(reachesPct((b * 9n) / 10n - 1n, b, 90), false);
  assert.equal(reachesPct((b * 9n) / 10n, b, 90), true);
});

test("costAmountsToWire: v1 chuỗi canonical, legacy ngoài biên throw lỗi precision", () => {
  const a = { budget: 9007199254740990_01n, committed: 0n, actual: -5n };
  assert.deepEqual(costAmountsToWire(a, "decimal-string-v1"), {
    budget: "9007199254740990.01",
    committed: "0.00",
    actual: "-0.05",
  });
  assert.throws(
    () => costAmountsToWire(a, "legacy-number"),
    (e: unknown) => isMoneyPrecisionError(e),
  );
  assert.deepEqual(
    costAmountsToWire({ budget: 12345n, committed: 0n, actual: 1n }, "legacy-number"),
    {
      budget: 123.45,
      committed: 0,
      actual: 0.01,
    },
  );
});
