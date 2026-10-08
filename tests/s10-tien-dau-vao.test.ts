import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MoneyInputError,
  moneyInputErrorBody,
  parseMoneyInput,
  parseOptionalMoneyInput,
} from "@/lib/nen/money";
import { chuanHoaTienNhap } from "@/lib/nen/money-dto";
import { tienNhapSangMinor } from "@/app/payments/_components/tienThanhToan";

// QUALITY-FINAL-1 / S10 — parser ĐẦU VÀO tiền phía server (A3-FR01/FR02) + chuẩn hoá ô nhập vi-VN
// phía client (A3 §4). Thuần, không chạm DB.

function maLoi(fn: () => unknown): { code: string; status: number } {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof MoneyInputError, `phải là MoneyInputError, nhận ${String(err)}`);
    return { code: err.code, status: err.status };
  }
  assert.fail("phải ném MoneyInputError");
}

test("parseMoneyInput: chuỗi canonical đọc exact, không qua float", () => {
  assert.deepEqual(parseMoneyInput("1234567.5"), { unscaled: 123456750n, text: "1234567.50" });
  assert.deepEqual(parseMoneyInput("  1234567 "), { unscaled: 123456700n, text: "1234567.00" });
  assert.deepEqual(parseMoneyInput("9999999999999.99"), {
    unscaled: 999999999999999n,
    text: "9999999999999.99",
  });
  assert.deepEqual(parseMoneyInput("-1500.25"), { unscaled: -150025n, text: "-1500.25" });
  assert.deepEqual(parseMoneyInput("-0"), { unscaled: 0n, text: "0.00" });
  assert.deepEqual(parseMoneyInput("0.1"), { unscaled: 10n, text: "0.10" });
  // Số lẻ thừa toàn 0 được bỏ; khác 0 thì từ chối (không lén làm tròn).
  assert.equal(parseMoneyInput("12.5000").text, "12.50");
  assert.deepEqual(
    maLoi(() => parseMoneyInput("12.5051")),
    { code: "amount_scale", status: 400 },
  );
  // Đúng 3 số lẻ trùng dạng nhóm nghìn vi-VN → mơ hồ, báo lỗi định dạng thay vì đoán.
  assert.equal(maLoi(() => parseMoneyInput("12.505")).code, "amount_locale_format");
});

test("parseMoneyInput: định dạng vi-VN bị từ chối 400 amount_locale_format, không đọc nhầm", () => {
  for (const v of ["1.234.567", "1.234", "1.500", "-2.000", "1234,5", "1.234.567,89", "12,00"]) {
    assert.deepEqual(
      maLoi(() => parseMoneyInput(v)),
      {
        code: "amount_locale_format",
        status: 400,
      },
    );
  }
  // Với scale ≥ 3 (khối lượng) "1.500" là thập phân hợp lệ, nhưng nhiều dấu chấm vẫn sai.
  assert.equal(parseMoneyInput("1.500", { scale: 3 }).text, "1.500");
  assert.equal(
    maLoi(() => parseMoneyInput("1.234.567", { scale: 3 })).code,
    "amount_locale_format",
  );
  // JSON number 1.234 không phải chuỗi vi-VN: chỉ là quá 2 số lẻ.
  assert.equal(maLoi(() => parseMoneyInput(1.234)).code, "amount_scale");
});

test("parseMoneyInput: tràn NUMERIC(15,2) → 422 amount_overflow; biên đúng bằng 10^13", () => {
  assert.deepEqual(
    maLoi(() => parseMoneyInput("10000000000000")),
    {
      code: "amount_overflow",
      status: 422,
    },
  );
  assert.equal(maLoi(() => parseMoneyInput("-10000000000000.00")).code, "amount_overflow");
  assert.equal(maLoi(() => parseMoneyInput(1e13)).code, "amount_overflow");
  assert.equal(maLoi(() => parseMoneyInput(1e21)).code, "amount_overflow"); // String = "1e+21"
  assert.equal(parseMoneyInput(9999999999999.99).text, "9999999999999.99");
  // Precision/scale theo cột: NUMERIC(5,4) nhận tối đa 9.9999.
  assert.equal(parseMoneyInput("9.9999", { precision: 5, scale: 4 }).text, "9.9999");
  assert.equal(
    maLoi(() => parseMoneyInput("10", { precision: 5, scale: 4 })).code,
    "amount_overflow",
  );
});

test("parseMoneyInput: NaN/Infinity/số mũ/kiểu lạ → 400; number > 15 chữ số có nghĩa → 422", () => {
  for (const v of [
    NaN,
    Infinity,
    -Infinity,
    "NaN",
    "Infinity",
    "1e5",
    "1E5",
    "+5",
    ".5",
    "5.",
    "",
  ]) {
    assert.equal(maLoi(() => parseMoneyInput(v)).code, "amount_invalid", `giá trị ${String(v)}`);
  }
  for (const v of [null, undefined, true, {}, [], 10n]) {
    assert.equal(maLoi(() => parseMoneyInput(v)).code, "amount_invalid");
  }
  assert.equal(maLoi(() => parseMoneyInput(1e-7)).code, "amount_scale"); // String = "1e-7"
  assert.equal(maLoi(() => parseMoneyInput("1 234")).code, "amount_invalid");
  assert.equal(maLoi(() => parseMoneyInput("1234đ")).code, "amount_invalid");
  // Cột precision lớn hơn 15: chuỗi exact được, number 16 chữ số có nghĩa thì không đảm bảo.
  assert.equal(
    parseMoneyInput("1234567890123456.78", { precision: 18 }).text,
    "1234567890123456.78",
  );
  assert.equal(
    maLoi(() => parseMoneyInput(1234567890123456, { precision: 18 })).code,
    "amount_precision_unsupported",
  );
  assert.equal(parseMoneyInput(1e15, { precision: 18 }).text, "1000000000000000.00");
});

test("parseMoneyInput: thông điệp tiếng Việt có nhãn, không lộ giá trị nhập; body cho route", () => {
  try {
    parseMoneyInput("7.654.321", { label: "Giá trị hợp đồng" });
    assert.fail("phải ném");
  } catch (err) {
    const body = moneyInputErrorBody(err);
    assert.ok(body);
    assert.equal(body.status, 400);
    assert.equal(body.body.code, "amount_locale_format");
    assert.match(body.body.error, /^Giá trị hợp đồng /);
    assert.doesNotMatch(body.body.error, /7\.654\.321/);
  }
  assert.equal(moneyInputErrorBody(new Error("khác")), null);
  assert.throws(() => parseMoneyInput("1", { scale: 3, precision: 2 }), RangeError);
});

test("parseOptionalMoneyInput: rỗng → null, còn lại như parseMoneyInput", () => {
  assert.equal(parseOptionalMoneyInput(undefined), null);
  assert.equal(parseOptionalMoneyInput(null), null);
  assert.equal(parseOptionalMoneyInput("  "), null);
  assert.equal(parseOptionalMoneyInput(0)?.text, "0.00");
  assert.equal(maLoi(() => parseOptionalMoneyInput("1.500")).code, "amount_locale_format");
});

test("chuanHoaTienNhap: ô nhập vi-VN → chuỗi canonical gửi server", () => {
  const ca: [string, string | null][] = [
    ["1.234.567", "1234567.00"],
    ["1.500", "1500.00"],
    ["1.234.567,5", "1234567.50"],
    ["1234,5", "1234.50"],
    ["1234567.5", "1234567.50"], // dạng soTienNhapThuan điền sẵn
    ["1.5", "1.50"],
    ["1234.500", "1234.50"],
    [" 2 500 000 đ", "2500000.00"],
    ["1.000.000₫", "1000000.00"],
    ["-1.500", "-1500.00"],
    ["9.999.999.999.999,99", "9999999999999.99"],
    ["", null],
    ["abc", null],
    ["1.23.456", null], // nhóm nghìn sai
    ["1,234,567", null], // kiểu Anh — không đoán
    ["1234,567", null], // quá 2 số lẻ
    ["10.000.000.000.000", null], // vượt NUMERIC(15,2)
  ];
  for (const [vao, ra] of ca) assert.equal(chuanHoaTienNhap(vao), ra, `ô nhập "${vao}"`);
});

test("tienNhapSangMinor (trang /payments): cùng quy tắc vi-VN với số gửi server", () => {
  assert.equal(tienNhapSangMinor("1.234.567"), 123456700n); // bản cũ: 123n (1,23 đ)
  assert.equal(tienNhapSangMinor("1234567.5"), 123456750n);
  assert.equal(tienNhapSangMinor("1.234,5"), 123450n);
  assert.equal(tienNhapSangMinor(""), 0n);
  assert.equal(tienNhapSangMinor("sai"), 0n);
});
