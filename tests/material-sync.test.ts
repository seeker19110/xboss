import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideMerge, normalizeFields, type MaterialFields } from "@/lib/material-sync";

// Tạo bộ trường vật tư đã chuẩn hoá từ giá trị một phần (mặc định khác nhau theo tên).
const F = (over: Partial<MaterialFields> = {}): MaterialFields =>
  normalizeFields({
    boqCode: "AV1", name: "Ống gió", unit: "m", qtyBoq: "100", qtyPlanned: "120",
    status: "dat_hang", note: "", ...over,
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
