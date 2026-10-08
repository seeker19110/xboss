import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtDongGonMinor,
  fmtDongMinor,
  minorTuWire,
  moneyFieldsToWire,
  moneyOrNullToWire,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";
import { isMoneyPrecisionError } from "@/lib/nen/money";
import { docTongHopTaiChinh, kpiTaiChinh } from "@/app/finance/_components/tongHopTien";

// QUALITY-FINAL-1 / S10c — adapter DTO tiền dùng chung (lib/nen/money-dto) + đọc tổng hợp tài
// chính phía client: không qua float, null ≠ 0, legacy ngoài biên báo lỗi precision.

const LON = 9999999999999993n; // 99.999.999.999.999,93 đồng — vượt 2^53 xu

test("moneyFieldsToWire: chỉ đổi trường tiền, giữ ID/đếm/tỷ lệ; null giữ null", () => {
  const obj = { id: 7, spi: 0.95, a: 12345n, b: null as bigint | null, ten: "x" };
  assert.deepEqual(moneyFieldsToWire(obj, ["a", "b"], "decimal-string-v1"), {
    id: 7,
    spi: 0.95,
    a: "123.45",
    b: null,
    ten: "x",
  });
  assert.deepEqual(moneyFieldsToWire(obj, ["a", "b"], "legacy-number"), {
    id: 7,
    spi: 0.95,
    a: 123.45,
    b: null,
    ten: "x",
  });
  assert.throws(
    () => moneyFieldsToWire({ a: 1.5 as unknown as bigint }, ["a"], "decimal-string-v1"),
    TypeError,
  );
});

test("legacy ngoài biên round-trip → RangeError money_precision_unsupported (không xấp xỉ)", () => {
  assert.equal(moneyOrNullToWire(LON, "decimal-string-v1"), "99999999999999.93");
  assert.throws(
    () => moneyOrNullToWire(LON, "legacy-number"),
    (e) => isMoneyPrecisionError(e),
  );
  assert.equal(moneyOrNullToWire(null, "legacy-number"), null);
  assert.deepEqual(nhanDinhDangTien("decimal-string-v1"), { moneyFormat: "decimal-string-v1" });
  assert.deepEqual(nhanDinhDangTien("legacy-number"), {});
});

test("minorTuWire chỉ nhận chuỗi canonical 2 số lẻ", () => {
  assert.equal(minorTuWire("99999999999999.93"), LON);
  assert.equal(minorTuWire("-0.05"), -5n);
  for (const sai of ["1.5", "1e3", "01.00", "-0.00", "1,00", ""])
    assert.throws(() => minorTuWire(sai), TypeError, sai);
});

test("fmtDongMinor / fmtDongGonMinor: làm tròn bằng bigint, ties xa 0", () => {
  assert.equal(fmtDongMinor(LON), "100.000.000.000.000 đ"); // ,93 → làm tròn lên đồng
  assert.equal(fmtDongMinor(150n), "2 đ");
  assert.equal(fmtDongMinor(-150n), "-2 đ");
  assert.equal(fmtDongMinor(0n), "0 đ");
  assert.equal(fmtDongGonMinor(123_456_789_000n), "1,23 tỷ");
  assert.equal(fmtDongGonMinor(560_000_000n), "5,6 tr");
  assert.equal(fmtDongGonMinor(-100_000_000_000n), "-1 tỷ");
  assert.equal(fmtDongGonMinor(123_45n), "123");
  assert.equal(fmtDongGonMinor(LON), "100.000 tỷ");
  assert.equal(fmtDongGonMinor(123_456_789_012_345_67n), "123.456,79 tỷ");
});

test("docTongHopTaiChinh + kpiTaiChinh: bigint exact, response không phải v1 → null", () => {
  const body = {
    period: "2026-10",
    moneyFormat: "decimal-string-v1",
    cashflow: [
      { month: "2026-09", in: "99999999999999.93", out: "0.01" },
      { month: "2026-10", in: "0.00", out: "0.02" },
    ],
    receivables: "99999999999999.93",
    payables: "0.03",
    advanceOutstanding: "1.00",
    vat: { vatIn: "0.01", vatOut: "0.02", netVat: "0.01" },
  };
  const s = docTongHopTaiChinh(body)!;
  assert.equal(s.receivables, LON);
  const kpi = kpiTaiChinh(s);
  assert.equal(kpi.fundBalance, LON - 3n); // 99.999.999.999.999,90 — float cũ cho ,89/,91
  assert.equal(kpi.netDebt, LON - 3n);
  assert.equal(kpi.advanceOutstanding, 100n);
  assert.equal(docTongHopTaiChinh({ ...body, moneyFormat: undefined }), null);
  assert.equal(docTongHopTaiChinh({ ...body, payables: 0.03 }), null);
  assert.deepEqual(kpiTaiChinh(null), { fundBalance: 0n, netDebt: 0n, advanceOutstanding: 0n });
});
