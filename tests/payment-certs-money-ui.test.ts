import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HEADER_DINH_DANG_TIEN,
  docChiTietDot,
  fmtVNDExact,
} from "@/app/payment-certs/_components/chiTietDot";
import { MONEY_FORMAT_DECIMAL_V1, MONEY_FORMAT_HEADER } from "@/lib/nen/money";

// QUALITY-FINAL-1 S10a (audit M2): chứng từ IPC phía client opt-in decimal-string-v1, hiển thị
// tổng exact và phân biệt LỖI tải (thông báo tiếng Việt) với giá trị BỊ CHE (null → "•••").

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("header client khớp đúng hằng opt-in của server", () => {
  assert.deepEqual(HEADER_DINH_DANG_TIEN, { [MONEY_FORMAT_HEADER]: MONEY_FORMAT_DECIMAL_V1 });
});

test("fmtVNDExact: làm tròn đồng bằng bigint, 0 → '—', khấu trừ có dấu −, số > 2^53 không mất chữ số", () => {
  assert.equal(fmtVNDExact("100.50"), "101 đ");
  assert.equal(fmtVNDExact("9.64", true), "−10 đ");
  assert.equal(fmtVNDExact("0.00"), "—");
  assert.equal(fmtVNDExact("0.00", true), "—");
  assert.equal(fmtVNDExact("90071992547409.93"), "90.071.992.547.410 đ");
  assert.throws(() => fmtVNDExact("1e3"), TypeError);
});

test("docChiTietDot: 200 → totals chuỗi + cảnh báo vượt KL, không lỗi", async () => {
  const totals = {
    periodValue: "94.00",
    cumulativeValue: "94.00",
    advanceDeduct: "9.64",
    retentionDeduct: "4.70",
    approvedValue: "79.66",
  };
  const vuot = [
    { boqItemId: 1, code: "B1", name: "Ống", unit: "m", qtyContract: 1, qtyCumulative: 2 },
  ];
  const warningVersion = "c".repeat(64); // S13c: phiên bản cảnh báo để xác nhận khi duyệt
  const ct = await docChiTietDot(
    json({
      totals,
      vuotHopDong: vuot,
      warningVersion,
      approvalStatus: null,
      moneyFormat: "decimal-string-v1",
    }),
  );
  assert.deepEqual(ct, {
    approvalStatus: null,
    vuotHopDong: vuot,
    warningVersion,
    totals,
    loi: null,
  });
});

test("docChiTietDot: 422 money_precision_unsupported → thông báo lỗi, KHÔNG thành totals null-bị-che im lặng", async () => {
  const ct = await docChiTietDot(
    json({ error: "Giá trị tiền vượt độ chính xác", code: "money_precision_unsupported" }, 422),
  );
  assert.equal(ct.totals, null);
  assert.match(ct.loi ?? "", /Không tải được tổng hợp giá trị đợt \(mã 422\): Giá trị tiền vượt/);
});

test("docChiTietDot: lỗi vẫn giữ vuotHopDong nếu server có trả; body hỏng vẫn có thông báo", async () => {
  const vuot = [
    { boqItemId: 2, code: "B2", name: "Van", unit: "cái", qtyContract: 1, qtyCumulative: 3 },
  ];
  assert.deepEqual(
    (await docChiTietDot(json({ error: "x", vuotHopDong: vuot }, 500))).vuotHopDong,
    vuot,
  );
  const hong = await docChiTietDot(new Response("<html>", { status: 502 }));
  assert.equal(hong.loi, "Không tải được tổng hợp giá trị đợt (mã 502)");
  assert.deepEqual(hong.vuotHopDong, []);
});
