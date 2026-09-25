// S09: test thuần trên source thật; không chạm DB hay đổi quy tắc chứng từ đang chạy.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMoney,
  parseMoney,
  parseMoneyExact,
  moneyToDecimal,
  mulRatio,
  formatVndExact,
  moneyToNumberSafe,
} from "@/lib/nen/money";

test("exact: lượng lớn vượt biên number không mất đơn vị nhỏ", () => {
  assert.equal(
    moneyToDecimal(addMoney(parseMoneyExact("90071992547409.91"), 1n)),
    "90071992547409.92",
  );
  const large = "90071992547409931234567890.91";
  assert.equal(moneyToDecimal(parseMoneyExact(large)), large);
  assert.equal(mulRatio(parseMoneyExact(large), 1n, 1n), parseMoneyExact(large));
});

test("exact: ties-away-from-zero và carry qua phần nguyên", () => {
  for (const [input, expected] of [
    ["0.005", 1n],
    ["-0.005", -1n],
    ["1.004999", 100n],
    ["-1.004999", -100n],
    ["2.999", 300n],
    ["-2.999", -300n],
    ["-0.00", 0n],
  ] as const) {
    assert.equal(parseMoneyExact(input), expected);
  }
});

test("exact: từ chối chuỗi sai, không lộ đầu vào trong lỗi", () => {
  for (const value of ["", " ", "1 ", "1\n", "+1", "1,00", "1e3", ".1", "1.", "NaN"]) {
    assert.throws(() => parseMoneyExact(value), {
      name: "TypeError",
      message: "parseMoneyExact: cần chuỗi thập phân hợp lệ",
    });
  }
  assert.throws(() => parseMoneyExact(1 as unknown as string), TypeError);
});

test("exact: chuỗi canonical đủ hai số lẻ, không có âm không", () => {
  assert.equal(moneyToDecimal(0n), "0.00");
  assert.equal(moneyToDecimal(1n), "0.01");
  assert.equal(moneyToDecimal(-1n), "-0.01");
  assert.equal(moneyToDecimal(100n), "1.00");
  assert.equal(moneyToDecimal(parseMoneyExact("-0.001")), "0.00");
});

test("exact: tỷ lệ dương/âm, mẫu âm và lỗi chia không", () => {
  assert.equal(mulRatio(-1n, 1n, 2n), -1n);
  assert.equal(mulRatio(1n, -1n, 2n), -1n);
  assert.equal(mulRatio(1n, 1n, -2n), -1n);
  assert.equal(mulRatio(-1n, -1n, 2n), 1n);
  assert.equal(mulRatio(0n, 999n, 1n), 0n);
  assert.equal(mulRatio(100000n, 1025n, 10000n), 10250n);
  assert.throws(() => mulRatio(0n, 0n, 0n), RangeError);
});

test("exact: formatter không double-round chuỗi nhiều số lẻ", () => {
  assert.equal(formatVndExact("1.499"), "1 ₫");
  assert.equal(formatVndExact("-1.499"), "-1 ₫");
  assert.equal(formatVndExact("1.500"), "2 ₫");
  assert.equal(formatVndExact("-1.500"), "-2 ₫");
  assert.equal(formatVndExact("-0.49"), "0 ₫");
  assert.equal(formatVndExact(150n), "2 ₫");
  assert.equal(formatVndExact("9007199254740993.50"), "9.007.199.254.740.994 ₫");
  assert.throws(() => formatVndExact("Infinity"), TypeError);
  assert.throws(() => formatVndExact(1 as unknown as bigint), TypeError);
});

test("exact: adapter number chỉ nhận giá trị round-trip đúng", () => {
  for (const minor of [0n, 1n, -1n, 123456n, -123456n, 999999999999999n]) {
    assert.equal(parseMoneyExact(String(moneyToNumberSafe(minor))), minor);
  }
  assert.throws(() => moneyToNumberSafe(9007199254740991n), /money_precision_unsupported/);
  assert.throws(() => moneyToNumberSafe(9007199254740992n), /money_precision_unsupported/);
  assert.throws(() => moneyToNumberSafe(-9007199254740992n), /money_precision_unsupported/);
});

test("exact: tổng 10.000 dòng và các nhóm không đổi kết quả", () => {
  const rows = Array.from({ length: 10000 }, () => parseMoneyExact("0.01"));
  const groups = Array.from({ length: 100 }, (_, i) =>
    addMoney(...rows.slice(i * 100, i * 100 + 100)),
  );
  assert.equal(moneyToDecimal(addMoney(...rows)), "100.00");
  assert.equal(addMoney(...groups), addMoney(...rows));
});

test("exact: 2.000 mẫu xác định trước giữ round-trip, triệt tiêu và tỷ lệ đồng nhất", () => {
  let seed = 20260925n;
  for (let i = 0; i < 2000; i++) {
    seed = (seed * 48271n) % 2147483647n;
    const a = (seed - 1000000000n) * 100000000000000n + BigInt(i);
    const b = seed * 13n;
    assert.equal(parseMoneyExact(moneyToDecimal(a)), a);
    assert.equal(addMoney(a, -a), 0n);
    assert.equal(addMoney(a, b), addMoney(b, a));
    assert.equal(mulRatio(a, 13n, 13n), a);
    assert.equal(mulRatio(-a, 1n, 3n), -mulRatio(a, 1n, 3n));
  }
});

test("exact: minh họa IPC sum-round không bị thay thành round từng dòng", () => {
  // 0.005 + 0.005 = 0.010 tính trong SQL numeric; chỉ parse sau SUM.
  assert.equal(parseMoneyExact("0.010"), 1n);
  assert.equal(addMoney(parseMoneyExact("0.005"), parseMoneyExact("0.005")), 2n);
  assert.equal(parseMoney("1.005"), 101n); // contract legacy chuỗi vẫn giữ nguyên
});
