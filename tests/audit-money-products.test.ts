import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareMoneyExact,
  moneyToDecimal,
  mulRatio,
  parseFixedDecimalExact,
  sumMoneyProductsExact,
} from "@/lib/nen/money";

test("S09: quantity/rate giữ scale riêng, không mất chữ số thứ ba", () => {
  assert.equal(parseFixedDecimalExact("1.005", 3), 1005n);
  assert.equal(parseFixedDecimalExact("10.25", 2), 1025n);
  assert.equal(parseFixedDecimalExact("-1.005", 3), -1005n);
  assert.equal(parseFixedDecimalExact("0", 0), 0n);
  assert.equal(parseFixedDecimalExact("1.000000000000000001", 18), 1000000000000000001n);
});

for (const value of ["1", "1.0", "1.000", "01.00", "+1.00", "-0.00", " 1.00", "1e2", "NaN"]) {
  test(`S09: wire amount từ chối dạng không canonical ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseFixedDecimalExact(value, 2), /decimal_wire_invalid/);
  });
}

test("S09: không coerce null/number, chặn scale sai và chuỗi quá dài", () => {
  for (const value of [null, undefined, 1, [], {}]) {
    assert.throws(
      () => parseFixedDecimalExact(value as unknown as string, 2),
      /decimal_wire_invalid/,
    );
  }
  for (const scale of [-1, 19, 1.5, NaN, Infinity]) {
    assert.throws(() => parseFixedDecimalExact("0.00", scale), /decimal_scale_unsupported/);
    assert.throws(() => sumMoneyProductsExact([], scale), /decimal_scale_unsupported/);
  }
  assert.throws(() => parseFixedDecimalExact("1".repeat(1025), 0), /decimal_wire_invalid/);
});

test("S09: golden ipc-sum-v1 cộng trước, round tổng sau (khác round từng dòng)", () => {
  const lines = [
    { quantity: "0.001", unitPrice: "5.00" },
    { quantity: "0.001", unitPrice: "5.00" },
  ];
  assert.equal(sumMoneyProductsExact(lines), 1n);
  assert.equal(lines.reduce((sum, line) => sum + sumMoneyProductsExact([line]), 0n), 2n);
  assert.equal(sumMoneyProductsExact([{ quantity: "-0.001", unitPrice: "5.00" }]), -1n);
  assert.equal(sumMoneyProductsExact([{ quantity: "0.001", unitPrice: "4.99" }]), 0n);
});

test("S09: 10.000 dòng, hoán vị và triệt tiêu không đổi tổng exact", () => {
  const lines = Array.from({ length: 10_000 }, () => ({ quantity: "1.000", unitPrice: "0.01" }));
  assert.equal(moneyToDecimal(sumMoneyProductsExact(lines)), "100.00");
  assert.equal(sumMoneyProductsExact(lines.toReversed()), 10000n);
  assert.equal(
    sumMoneyProductsExact([
      { quantity: "123456.789", unitPrice: "999999.99" },
      { quantity: "-123456.789", unitPrice: "999999.99" },
    ]),
    0n,
  );
});

test("S09: aggregate vượt MAX_SAFE_INTEGER không mất cent, comparator không sort chuỗi", () => {
  assert.equal(
    moneyToDecimal(sumMoneyProductsExact([{ quantity: "1.000", unitPrice: "90071992547409.92" }])),
    "90071992547409.92",
  );
  const values = ["10.00", "2.00", "90071992547409.92", "90071992547409.91", "-1.00"];
  assert.deepEqual(values.sort(compareMoneyExact), [
    "-1.00",
    "2.00",
    "10.00",
    "90071992547409.91",
    "90071992547409.92",
  ]);
  assert.equal(compareMoneyExact(1n, "0.01"), 0);
  assert.throws(() => compareMoneyExact("1.001", "1.00"), /decimal_wire_invalid/);
});

test("S09: tỷ lệ IPC 10,25% và giữ lại dùng periodValue đã round", () => {
  const period = sumMoneyProductsExact([{ quantity: "1.005", unitPrice: "100.00" }]);
  const advance = mulRatio(period, parseFixedDecimalExact("10.25", 2), 10000n);
  const retention = mulRatio(period, parseFixedDecimalExact("5.00", 2), 10000n);
  assert.equal(moneyToDecimal(period), "100.50");
  assert.equal(moneyToDecimal(advance), "10.30");
  assert.equal(moneyToDecimal(retention), "5.03");
  assert.equal(moneyToDecimal(period - advance - retention), "85.17");
});

test("S09: mảng rỗng khác dữ liệu chưa có; lỗi không lộ amount", () => {
  assert.equal(sumMoneyProductsExact([]), 0n);
  assert.throws(() => sumMoneyProductsExact(null as never), /money_lines_invalid/);
  assert.throws(() => sumMoneyProductsExact([null as never]), /money_lines_invalid/);
  assert.throws(() => sumMoneyProductsExact([{ quantity: "1.00", unitPrice: "7.00" }]));
  assert.throws(() => parseFixedDecimalExact("private-amount-123", 2), (error: unknown) => {
    return error instanceof Error && !error.message.includes("private-amount-123");
  });
});
