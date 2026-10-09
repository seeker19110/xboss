import { HAS_TEST_DB } from "./setup"; // đầu tiên: không kết nối DB production
// Tạm tính tiền IPC phía client (CertDocument/page /payment-certs) phải khớp TỪNG ĐỒNG với số
// server ghi: KL người dùng gõ → `Number(raw) || 0` → PG làm tròn vào qty_period NUMERIC(15,3);
// tổng = round(Σ qty × đơn giá, 2) (ipc-sum-v1); thành tiền dòng tròn tới đồng như PDF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "@/lib/db";
import { decimalTuSoJs, moneyToDecimal, thanhTienDongExact } from "@/lib/nen/money";
import { mThanhTienDong, mTongTichTien } from "@/app/lib/masked";
import {
  fmtVNDDong,
  fmtVNDMinor,
  khoiLuongNhapScale3,
} from "@/app/payment-certs/_components/chiTietDot";

test("decimalTuSoJs: làm tròn chữ số thập phân của String(n), ties xa 0 (như PG)", () => {
  const ca: [number, number, string][] = [
    [0, 3, "0.000"],
    [-0, 3, "0.000"],
    [123, 3, "123.000"],
    [1.0005, 3, "1.001"], // toFixed(3) cho "1.000" — sai so với PG
    [-1.0005, 3, "-1.001"],
    [1.2345, 3, "1.235"],
    [1.2344, 3, "1.234"],
    [2.675, 2, "2.68"], // toFixed(2) cho "2.67"
    [1e-7, 3, "0.000"],
    [5e-4, 3, "0.001"],
    [1.5e21, 0, "1500000000000000000000"],
    [123456789012.345, 3, "123456789012.345"],
  ];
  for (const [n, scale, ky] of ca) assert.equal(decimalTuSoJs(n, scale), ky, `${n} @${scale}`);
  assert.throws(() => decimalTuSoJs(Number.POSITIVE_INFINITY, 3), TypeError);
  assert.throws(() => decimalTuSoJs(Number.NaN, 3), TypeError);
  assert.throws(() => decimalTuSoJs(1, 19), RangeError);
});

test("khoiLuongNhapScale3: ô trống/không hợp lệ/vô hạn → 0 như số client gửi", () => {
  assert.equal(khoiLuongNhapScale3(""), "0.000");
  assert.equal(khoiLuongNhapScale3("abc"), "0.000");
  assert.equal(khoiLuongNhapScale3("1e400"), "0.000");
  assert.equal(khoiLuongNhapScale3("1.0005"), "1.001");
  assert.equal(khoiLuongNhapScale3("12.5"), "12.500");
});

test("mTongTichTien / mThanhTienDong: exact, round tổng một lần, đơn giá che → null", () => {
  // 3 dòng 0,0005 × 1,00 → mỗi dòng 0,0005 đ; round từng dòng (=0,00) sẽ ra 0, đúng là 0,0015 → 0,00.
  // Ca phân biệt round-tổng vs round-dòng: 3 × (0,003 × 1,50 = 0,0045) = 0,0135 → 0,01;
  // round từng dòng (0,00) cộng lại = 0,00.
  const dong = Array.from({ length: 3 }, () => ({ quantity: "0.003", unitPrice: "1.50" }));
  assert.equal(mTongTichTien(dong), 1n);
  assert.equal(mTongTichTien([]), 0n);
  assert.equal(mTongTichTien([...dong, { quantity: "1.000", unitPrice: null }]), null);
  // Float: 1,005 × 100 = 100,49999… → 100 đ; exact = 100,5 → 101 đ (khớp certLineDong của PDF).
  assert.equal(mThanhTienDong({ quantity: "1.005", unitPrice: "100.00" }), 101n);
  assert.equal(mThanhTienDong({ quantity: "1.005", unitPrice: undefined }), null);
  assert.equal(fmtVNDMinor(0n), "—");
  assert.equal(fmtVNDMinor(10050n), `${(101).toLocaleString("vi-VN")} đ`);
  assert.equal(fmtVNDDong(1234567n), `${(1234567).toLocaleString("vi-VN")} đ`);
});

test(
  "Tạm tính client khớp số PostgreSQL ghi + tính (qty_period NUMERIC(15,3), ipc-sum-v1)",
  { skip: !HAS_TEST_DB },
  async () => {
    // KL thô người dùng gõ (chuỗi ô input) × đơn giá canonical — gồm ca float lệch nếu nhân JS.
    const bo: { raw: string; unitPrice: string }[][] = [
      [{ raw: "1.0005", unitPrice: "100.00" }],
      [
        { raw: "0.1", unitPrice: "0.10" },
        { raw: "0.2", unitPrice: "0.10" },
        { raw: "0.3", unitPrice: "0.10" },
      ],
      [
        { raw: "1.005", unitPrice: "100.00" },
        { raw: "2.675", unitPrice: "33333.33" },
        { raw: "", unitPrice: "5.00" },
        { raw: "abc", unitPrice: "7.00" },
      ],
      [{ raw: "999999999.9995", unitPrice: "9999999.99" }],
      Array.from({ length: 150 }, (_, i) => ({
        raw: `${i}.${String((i * 37) % 10000).padStart(4, "0")}`,
        unitPrice: `${(i * 7919) % 1_000_000}.${String((i * 13) % 100).padStart(2, "0")}`,
      })),
    ];
    for (const lines of bo) {
      // Client gửi `Number(raw) || 0`; node-postgres đưa tham số số dưới dạng String(n).
      const guiLen = lines.map((l) => ({ q: String(Number(l.raw) || 0), p: l.unitPrice }));
      const rows = await query<{ tong: string; dong: string }>(
        `WITH r AS (
           SELECT x.ord, (x.e->>'q')::numeric(15,3) AS q, (x.e->>'p')::numeric(15,2) AS p
             FROM jsonb_array_elements(?::jsonb) WITH ORDINALITY AS x(e, ord)
         )
         SELECT (SELECT round(COALESCE(SUM(q * p), 0), 2)::text FROM r) AS tong,
                round(q * p, 0)::text AS dong
           FROM r ORDER BY ord`,
        JSON.stringify(guiLen),
      );
      const client = lines.map((l) => ({
        quantity: khoiLuongNhapScale3(l.raw),
        unitPrice: l.unitPrice,
      }));
      const tong = mTongTichTien(client);
      assert.ok(tong != null);
      assert.equal(moneyToDecimal(tong), rows[0].tong);
      client.forEach((c, i) => {
        assert.equal(String(mThanhTienDong(c)), rows[i].dong, `dòng ${i}`);
        assert.equal(mThanhTienDong(c), thanhTienDongExact(c.quantity, c.unitPrice, 3));
      });
    }
  },
);
