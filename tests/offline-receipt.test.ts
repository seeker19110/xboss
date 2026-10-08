import "./setup"; // đứng đầu: module dưới đây import lib/db (không chạm DB trong file này)
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { bamYeuCau, docThaoTacHangDoi, type DauVaoHash } from "@/lib/bao-mat/offline-receipt";
import {
  baseVersionNhatKy,
  dieuKienThoa,
  docDieuKienNhatKy,
  etagNhatKy,
} from "@/lib/hien-truong/diary";

// QUALITY-FINAL-1 S06 — phần THUẦN của receipt/precondition (hành vi route thật ở
// tests/offline-receipt-route.test.ts).

const goc: DauVaoHash = {
  kind: "diary_note",
  orgId: 1,
  projectId: 2,
  userId: 3,
  target: { date: "2026-06-10" },
  payload: { workDone: "A", manpower: [{ crew: "Tổ 1", headcount: 3, note: null }] },
  baseVersion: '"5-2"',
};

test("bamYeuCau: không phụ thuộc thứ tự khoá object; đổi bất kỳ thành phần nào → hash khác", () => {
  const h = bamYeuCau(goc);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(
    bamYeuCau({
      ...goc,
      payload: { manpower: [{ note: null, headcount: 3, crew: "Tổ 1" }], workDone: "A" },
    }),
    h,
  );
  for (const doi of [
    { kind: "tick" as const },
    { orgId: 9 },
    { projectId: 9 },
    { userId: 9 },
    { target: { date: "2026-06-11" } },
    { payload: { workDone: "B", manpower: [] } },
    { baseVersion: "*" },
    { baseVersion: null },
  ])
    assert.notEqual(bamYeuCau({ ...goc, ...doi }), h, JSON.stringify(doi));
  // Thứ tự phần tử MẢNG là dữ liệu (thứ tự tổ đội), không được coi như nhau.
  assert.notEqual(
    bamYeuCau({ ...goc, payload: { ids: [1, 2] } }),
    bamYeuCau({ ...goc, payload: { ids: [2, 1] } }),
  );
  assert.throws(() => bamYeuCau({ ...goc, payload: { n: Number.NaN } }));
});

test("docThaoTacHangDoi: không header → đường online; thiếu/sai key → 400; key chuẩn hoá chữ thường", () => {
  assert.equal(docThaoTacHangDoi(new Headers()), null);
  const k = randomUUID().toUpperCase();
  assert.deepEqual(docThaoTacHangDoi(new Headers({ "idempotency-key": k })), {
    operationId: k.toLowerCase(),
    context: null,
  });
  assert.throws(
    () => docThaoTacHangDoi(new Headers({ "x-xboss-context": "abc" })),
    (e: { status?: number; code?: string }) =>
      e.status === 400 && e.code === "idempotency_key_required",
  );
  assert.throws(
    () => docThaoTacHangDoi(new Headers({ "idempotency-key": "123" })),
    (e: { status?: number; code?: string }) =>
      e.status === 400 && e.code === "idempotency_key_invalid",
  );
});

test("precondition nhật ký: 428 khi thiếu/If-Match *, 400 khi mơ hồ, so sánh MẠNH", () => {
  const thieu = docDieuKienNhatKy(null, null);
  assert.equal(thieu.ok, false);
  assert.equal(!thieu.ok && thieu.status, 428);
  const sao = docDieuKienNhatKy("*", null);
  assert.equal(!sao.ok && sao.status, 428);
  const ca2 = docDieuKienNhatKy('"1-1"', "*");
  assert.equal(!ca2.ok && ca2.status, 400);
  const inmSai = docDieuKienNhatKy(null, '"1-1"');
  assert.equal(!inmSai.ok && inmSai.status, 400);

  const hienTai = { id: 7, version: 3 };
  const e = etagNhatKy(hienTai);
  assert.equal(e, '"7-3"');
  const tao = docDieuKienNhatKy(null, " * ");
  assert.ok(tao.ok);
  assert.equal(dieuKienThoa(tao.dieuKien, undefined), true);
  assert.equal(dieuKienThoa(tao.dieuKien, hienTai), false, "đã có thì không tạo đè");
  const khop = docDieuKienNhatKy(`"7-2", ${e}`, null);
  assert.ok(khop.ok);
  assert.equal(dieuKienThoa(khop.dieuKien, hienTai), true);
  assert.equal(dieuKienThoa(khop.dieuKien, undefined), false, "If-Match mà nhật ký đã mất → 412");
  const cu = docDieuKienNhatKy('"7-2"', null);
  assert.ok(cu.ok);
  assert.equal(dieuKienThoa(cu.dieuKien, hienTai), false);
  const yeu = docDieuKienNhatKy(`W/${e}`, null);
  assert.ok(yeu.ok);
  assert.equal(dieuKienThoa(yeu.dieuKien, hienTai), false, "ETag yếu không bao giờ khớp");
  assert.equal(baseVersionNhatKy(tao.dieuKien), "*");
  assert.equal(baseVersionNhatKy(khop.dieuKien), `"7-2",${e}`);
});
