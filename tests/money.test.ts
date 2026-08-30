import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoney, addMoney, mulRate, moneyToNumber, formatVnd } from "@/lib/nen/money";

test("parseMoney: chuỗi có/không phần thập phân", () => {
  assert.equal(parseMoney("1234.56"), 123456n);
  assert.equal(parseMoney("1000"), 100000n);
  assert.equal(parseMoney("0"), 0n);
  assert.equal(parseMoney("0.1"), 10n);
  assert.equal(parseMoney("0.01"), 1n);
});

test("parseMoney: làm tròn half-up ở chữ số thập phân thứ 3", () => {
  assert.equal(parseMoney("1.005"), 101n); // 100 + làm tròn lên
  assert.equal(parseMoney("1.004"), 100n);
  assert.equal(parseMoney("2.999"), 300n);
});

test("parseMoney: số âm", () => {
  assert.equal(parseMoney("-1234.56"), -123456n);
  assert.equal(parseMoney(-50.5), -5050n);
});

test("parseMoney: nhận number JS", () => {
  assert.equal(parseMoney(1234.56), 123456n);
  assert.equal(parseMoney(100), 10000n);
});

test("parseMoney: chuỗi không hợp lệ throw", () => {
  assert.throws(() => parseMoney("abc"));
  assert.throws(() => parseMoney("1,234"));
});

test("addMoney: cộng chính xác không lệch float", () => {
  // 0.1 + 0.2 trên float = 0.30000000000000004; ở minor units luôn đúng.
  assert.equal(addMoney(parseMoney("0.1"), parseMoney("0.2")), 30n);
  assert.equal(addMoney(123456n, 100000n, -23456n), 200000n);
  assert.equal(addMoney(), 0n);
});

test("mulRate: nhân tỷ lệ half-up", () => {
  assert.equal(mulRate(123456n, 0.1), 12346n); // 12345.6 → 12346
  assert.equal(mulRate(100000n, 0.1), 10000n); // 10% của 1000đ = 100đ
  assert.equal(mulRate(100000n, 0.05), 5000n);
  assert.equal(mulRate(123456n, 0), 0n);
});

test("moneyToNumber: về đồng 2 chữ số thập phân", () => {
  assert.equal(moneyToNumber(123456n), 1234.56);
  assert.equal(moneyToNumber(100000n), 1000);
});

test("formatVnd: bigint đơn vị nhỏ → đồng nguyên", () => {
  assert.equal(formatVnd(123456789n), "1.234.568 ₫"); // 1234567.89 → 1234568
  assert.equal(formatVnd(100000n), "1.000 ₫");
  assert.equal(formatVnd(0n), "0 ₫");
  assert.equal(formatVnd(-100000n), "-1.000 ₫");
});

test("formatVnd: number/chuỗi VND (từ cột NUMERIC)", () => {
  assert.equal(formatVnd(1234567), "1.234.567 ₫");
  assert.equal(formatVnd("1234567.00"), "1.234.567 ₫");
  assert.equal(formatVnd(999), "999 ₫");
});

// ===== Giá trị biên của các hằng số trong lib/money.ts =====
// Hằng số: 100 (đơn vị nhỏ = đồng×100) và ngưỡng '5' ở chữ số thập phân thứ 3.

test("parseMoney: ngay dưới / đúng bằng / ngay trên ngưỡng làm tròn thứ 3", () => {
  assert.equal(parseMoney("0.494"), 49n);
  assert.equal(parseMoney("0.495"), 50n); // đúng ngưỡng → lên
  assert.equal(parseMoney("0.496"), 50n);
  assert.equal(parseMoney("-0.495"), -50n); // half-up theo ĐỘ LỚN, đối xứng âm/dương
  assert.equal(parseMoney("0.4949999"), 49n); // chữ số thứ 4 trở đi không kéo lên được
});

test("parseMoney: biên rỗng/dị dạng đều throw, không trả 0 âm thầm", () => {
  assert.throws(() => parseMoney(""));
  assert.throws(() => parseMoney(" "));
  assert.throws(() => parseMoney("."));
  assert.throws(() => parseMoney("1e3"));
  assert.throws(() => parseMoney("+1"));
  assert.throws(() => parseMoney(NaN));
  assert.throws(() => parseMoney(Infinity));
});

test("parseMoney: biên độ lớn — trần NUMERIC(15,2) của mọi cột tiền", () => {
  // Cột tiền trong schema là NUMERIC(15,2) → giá trị lớn nhất 9999999999999.99.
  assert.equal(parseMoney("9999999999999.99"), 999999999999999n);
  assert.equal(parseMoney("-9999999999999.99"), -999999999999999n);
  assert.equal(parseMoney("0.00"), 0n);
  assert.equal(parseMoney("-0.00"), 0n);
});

test("addMoney/mulRate: biên 0 và hệ số 1 giữ nguyên giá trị", () => {
  assert.equal(mulRate(999999999999999n, 1), 999999999999999n);
  assert.equal(mulRate(0n, 0.1), 0n);
  assert.equal(mulRate(-100000n, 0.1), -10000n);
  assert.throws(() => mulRate(100n, NaN));
  assert.throws(() => mulRate(100n, Infinity));
});

test("formatVnd: biên làm tròn quanh nửa đồng và số 0 âm", () => {
  assert.equal(formatVnd(49n), "0 ₫"); // 0.49 đồng
  assert.equal(formatVnd(50n), "1 ₫"); // đúng nửa đồng → lên
  assert.equal(formatVnd(-50n), "-1 ₫");
  assert.equal(formatVnd(-49n), "0 ₫");
  assert.equal(formatVnd(999n), "10 ₫");
});
