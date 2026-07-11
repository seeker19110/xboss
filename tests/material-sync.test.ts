import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideMerge,
  normalizeFields,
  sheetRowToFieldsChecked,
  type MaterialFields,
} from "@/lib/material-sync";

// Tạo bộ trường vật tư đã chuẩn hoá từ giá trị một phần (mặc định khác nhau theo tên).
const F = (over: Partial<MaterialFields> = {}): MaterialFields =>
  normalizeFields({
    boqCode: "AV1",
    name: "Ống gió",
    unit: "m",
    qtyBoq: "100",
    qtyPlanned: "120",
    status: "dat_hang",
    note: "",
    ...over,
  });

test("decideMerge: không đổi gì → noop", () => {
  const base = F();
  assert.equal(decideMerge(base, base, base).decision, "noop");
});

test("decideMerge: chỉ DB đổi → push (DB → Sheet)", () => {
  const snap = F();
  const db = F({ name: "Ống gió mới" });
  const sheet = F();
  const r = decideMerge(db, sheet, snap);
  assert.equal(r.decision, "push");
  assert.equal(r.winner.name, "Ống gió mới");
});

test("decideMerge: chỉ Sheet đổi → pull (Sheet → DB)", () => {
  const snap = F();
  const db = F();
  const sheet = F({ qtyPlanned: "150" });
  const r = decideMerge(db, sheet, snap);
  assert.equal(r.decision, "pull");
  assert.equal(r.winner.qtyPlanned, "150");
});

test("decideMerge: cả hai đổi khác nhau → conflict, DB thắng (CONFLICT_POLICY=db)", () => {
  const snap = F();
  const db = F({ note: "DB sửa" });
  const sheet = F({ note: "Sheet sửa" });
  const r = decideMerge(db, sheet, snap);
  assert.equal(r.decision, "conflict");
  assert.equal(r.winner.note, "DB sửa");
});

test("decideMerge: cả hai đổi nhưng trùng giá trị → noop (đã hội tụ)", () => {
  const snap = F();
  const db = F({ unit: "kg" });
  const sheet = F({ unit: "kg" });
  assert.equal(decideMerge(db, sheet, snap).decision, "noop");
});

test("decideMerge: chưa có snapshot mà hai phía khác nhau → conflict, DB thắng", () => {
  const db = F({ name: "Phía DB" });
  const sheet = F({ name: "Phía Sheet" });
  const r = decideMerge(db, sheet, null);
  assert.equal(r.decision, "conflict");
  assert.equal(r.winner.name, "Phía DB");
});

test("normalizeFields: số so theo giá trị số (100 == 100.0), status lạ → dat_hang", () => {
  assert.ok(decideMerge(F({ qtyBoq: "100" }), F({ qtyBoq: "100.0" }), F()).decision === "noop");
  assert.equal(normalizeFields({ status: "linh tinh" }).status, "dat_hang");
  assert.equal(normalizeFields({ qtyPlanned: "1,200" }).qtyPlanned, "1200");
});

// Dòng Sheet: cột B=boqCode, C=name, D=unit, E=qtyBoq, F=qtyPlanned, ..., J=status, K=note.
const sheetRow = (over: Record<number, string> = {}): string[] => {
  const row = ["1", "AV1", "Ống gió", "m", "100", "120", "", "", "", "dat_hang", "", "ogtd"];
  for (const [i, v] of Object.entries(over)) row[Number(i)] = v;
  return row;
};

test("sheetRowToFieldsChecked: Sheet nhập lỗi (qtyBoq/status rác) → giữ nguyên fallback, đánh dấu invalid — không coerce về 0/dat_hang rồi báo 'đã đổi'", () => {
  const fallback = F({ qtyBoq: "999", status: "ve_kho" });
  // Cột E (qtyBoq) gõ nhầm chữ, cột J (status) gõ giá trị lạ không thuộc enum.
  const { fields, invalid } = sheetRowToFieldsChecked(
    sheetRow({ 4: "abc", 9: "linh tinh" }),
    fallback,
  );
  assert.deepEqual(invalid.sort(), ["qtyBoq", "status"]);
  assert.equal(fields.qtyBoq, "999"); // giữ giá trị DB cũ, KHÔNG bị coi là "đổi thành 0"
  assert.equal(fields.status, "ve_kho");
  // Field khác (qtyPlanned) vẫn đọc đúng giá trị Sheet hợp lệ như bình thường.
  assert.equal(fields.qtyPlanned, "120");

  // Vì field lỗi = fallback (thường là giá trị DB), decideMerge coi như "không đổi"
  // ở field đó thay vì "Sheet đổi thành 0" → không bị pull giá trị rác vào DB.
  const dbF = fallback;
  const r = decideMerge(dbF, fields, dbF);
  assert.notEqual(r.winner.qtyBoq, "0");
  assert.equal(r.winner.qtyBoq, "999");
});

test("sheetRowToFieldsChecked: Sheet để trống (không phải rác) vẫn coi là hợp lệ = mặc định", () => {
  const fallback = F({ qtyBoq: "999" });
  const { fields, invalid } = sheetRowToFieldsChecked(sheetRow({ 4: "", 9: "" }), fallback);
  assert.deepEqual(invalid, []);
  assert.equal(fields.qtyBoq, "0");
  assert.equal(fields.status, "dat_hang");
});
