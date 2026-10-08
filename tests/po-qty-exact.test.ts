import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { parseQuantityInput, QuantityInputError } from "@/lib/nen/money";
import { parsePoQuantity } from "@/lib/tai-chinh/procurement";

// QUALITY-FINAL-1 DATA-MIGRATIONS §6 — khối lượng PR/PO/phiếu nhận exact (migration 0163):
// parser canonical (≤18 nguyên/6 lẻ, không exponent, cắt đuôi 0), route thật ghi `*_exact` +
// provenance 'exact_input_v1', nhận hàng không đổi ordered_provenance, script backfill
// dry-run/legacy_float_text/idempotent/không đè exact_input_v1.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (s: string) => `${s}${RUN}${++seq}`;
const don: { projects: number[]; users: number[] } = { projects: [], users: [] };

const jreq = (body: unknown) =>
  new NextRequest("http://localhost/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const thamSo = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

// ===== Parser (thuần) =====

test("parsePoQuantity: canonical, cắt đuôi 0, 6 số lẻ", () => {
  assert.equal(parsePoQuantity("1.000001"), "1.000001");
  assert.equal(parsePoQuantity(" 2.500000 "), "2.5");
  assert.equal(parsePoQuantity("3.0"), "3");
  assert.equal(parsePoQuantity("0.1"), "0.1");
  assert.equal(parsePoQuantity(12), "12");
  assert.equal(parsePoQuantity("999999999999999999.999999"), "999999999999999999.999999");
  assert.equal(parsePoQuantity(""), null);
  assert.equal(parsePoQuantity(undefined), null);
});

test("parsePoQuantity: lỗi 400 quantity_* / 422 quantity_overflow", () => {
  const ma = (v: unknown) => {
    try {
      parsePoQuantity(v);
    } catch (e) {
      assert.ok(e instanceof QuantityInputError);
      return `${e.status}:${e.code}`;
    }
    return "ok";
  };
  assert.equal(ma("1e3"), "400:quantity_invalid");
  assert.equal(ma("-1"), "400:quantity_invalid");
  assert.equal(ma("1,5"), "400:quantity_locale_format");
  assert.equal(ma("1.0000001"), "400:quantity_scale");
  assert.equal(ma("1234567890123456789"), "422:quantity_overflow");
  assert.equal(ma(Number.NaN), "400:quantity_invalid");
});

test("parseQuantityInput mặc định giữ nguyên hành vi bill (3 lẻ, 12 nguyên, không cắt đuôi)", () => {
  assert.equal(parseQuantityInput("1.5"), "1.500");
  assert.throws(() => parseQuantityInput("1.0001"), /tối đa 3 chữ số/);
  assert.throws(
    () => parseQuantityInput("1000000000000"),
    (e: QuantityInputError) => e.status === 422,
  );
});

// ===== Route thật + backfill (Postgres) =====

async function dungDuAn() {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("POQ "));
  don.projects.push(projectId);
  const uid = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('POQ pm', ?, 'hash-poq', 'pm', 1)`,
    `poq-${uniq("pm")}@test.local`,
  );
  don.users.push(uid);
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    uid,
  );
  await dangNhapDuAn({ id: uid, passwordHash: u!.password_hash }, projectId);
  const matId = await insertId(
    `INSERT INTO materials (name, unit, boq_code, project_id) VALUES (?, 'm', ?, ?)`,
    uniq("Ống "),
    uniq("POQ-"),
    projectId,
  );
  return { projectId, matId, uid };
}

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const p of don.projects) {
    const po = `SELECT id FROM purchase_orders WHERE project_id = ?`;
    await run(
      `DELETE FROM material_transactions WHERE material_id IN (SELECT id FROM materials WHERE project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM receipt_items WHERE receipt_id IN (SELECT id FROM warehouse_receipts WHERE po_id IN (${po}))`,
      p,
    );
    await run(`DELETE FROM warehouse_receipts WHERE po_id IN (${po})`, p);
    await run(`DELETE FROM po_status_log WHERE po_id IN (${po})`, p).catch(() => undefined);
    await run(`DELETE FROM po_items WHERE po_id IN (${po})`, p);
    await run(`DELETE FROM purchase_orders WHERE project_id = ?`, p);
    await run(`DELETE FROM purchase_requests WHERE project_id = ?`, p);
    await run(`DELETE FROM materials WHERE project_id = ?`, p);
    await run(`DELETE FROM user_projects WHERE project_id = ?`, p);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  }
  for (const u of don.users) await run(`DELETE FROM users WHERE id = ?`, u);
});

test(
  "POST PR/PO/receive: qty '1.000001' lưu exact + exact_input_v1; nhận không đổi ordered_provenance",
  S,
  async () => {
    const { queryOne, run } = await import("@/lib/db");
    const { matId } = await dungDuAn();

    const { POST: taoPR } = await import("@/app/api/purchase-requests/route");
    const rPr = await taoPR(jreq({ materialId: matId, qtyRequested: "1.000001" }));
    assert.equal(rPr.status, 201);
    const prId = (await rPr.json()).id as number;
    const pr = await queryOne<{ e: string; p: string; f: number }>(
      `SELECT qty_requested_exact::text AS e, qty_requested_provenance AS p, qty_requested AS f
       FROM purchase_requests WHERE id = ?`,
      prId,
    );
    assert.deepEqual(pr, { e: "1.000001", p: "exact_input_v1", f: 1.000001 });

    const { POST: taoPO } = await import("@/app/api/purchase-orders/route");
    const rPo = await taoPO(jreq({ items: [{ materialId: matId, qtyOrdered: "2.000001" }] }));
    assert.equal(rPo.status, 201);
    const poId = (await rPo.json()).id as number;
    const item = await queryOne<{ id: number; oe: string; op: string; re: string; rp: string }>(
      `SELECT id, qty_ordered_exact::text AS oe, qty_ordered_provenance AS op,
            qty_received_exact::text AS re, qty_received_provenance AS rp
       FROM po_items WHERE po_id = ?`,
      poId,
    );
    assert.equal(item!.oe, "2.000001");
    assert.equal(item!.op, "exact_input_v1");
    assert.equal(item!.re, "0");
    assert.equal(item!.rp, "exact_input_v1");

    // Giả lập dòng cũ đã backfill: ordered là legacy — nhận hàng không được nâng thành exact.
    await run(
      `UPDATE po_items SET qty_ordered_provenance = 'legacy_float_text' WHERE id = ?`,
      item!.id,
    );
    await run(`UPDATE purchase_orders SET status = 'confirmed' WHERE id = ?`, poId);
    const { POST: nhan } = await import("@/app/api/purchase-orders/[id]/receive/route");
    const rNh = await nhan(
      jreq({ items: [{ poItemId: item!.id, qtyReceived: "1.000001" }] }),
      thamSo(poId),
    );
    assert.equal(rNh.status, 201);
    const sau = await queryOne<{ op: string; re: string; rp: string }>(
      `SELECT qty_ordered_provenance AS op, qty_received_exact::text AS re,
            qty_received_provenance AS rp FROM po_items WHERE id = ?`,
      item!.id,
    );
    assert.deepEqual(sau, { op: "legacy_float_text", re: "1.000001", rp: "exact_input_v1" });
    const ri = await queryOne<{ e: string; p: string }>(
      `SELECT qty_received_exact::text AS e, qty_received_provenance AS p
       FROM receipt_items WHERE po_item_id = ?`,
      item!.id,
    );
    assert.deepEqual(ri, { e: "1.000001", p: "exact_input_v1" });
  },
);

test("POST PR/PO/receive: qty sai dạng → 400, quá 18 chữ số nguyên → 422", S, async () => {
  const { matId } = await dungDuAn();
  const { POST: taoPR } = await import("@/app/api/purchase-requests/route");
  const { POST: taoPO } = await import("@/app/api/purchase-orders/route");
  for (const [v, st] of [
    ["1e3", 400],
    ["-1", 400],
    ["1,5", 400],
    ["1.0000001", 400],
    ["1234567890123456789", 422],
  ] as const) {
    assert.equal((await taoPR(jreq({ materialId: matId, qtyRequested: v }))).status, st, `PR ${v}`);
    assert.equal(
      (await taoPO(jreq({ items: [{ materialId: matId, qtyOrdered: v }] }))).status,
      st,
      `PO ${v}`,
    );
  }
  const rPo = await taoPO(jreq({ items: [{ materialId: matId, qtyOrdered: "5" }] }));
  const poId = (await rPo.json()).id as number;
  const { queryOne, run } = await import("@/lib/db");
  await run(`UPDATE purchase_orders SET status = 'confirmed' WHERE id = ?`, poId);
  const it = await queryOne<{ id: number }>(`SELECT id FROM po_items WHERE po_id = ?`, poId);
  const { POST: nhan } = await import("@/app/api/purchase-orders/[id]/receive/route");
  for (const [v, st] of [
    ["1e3", 400],
    ["-1", 400],
    ["1,5", 400],
    ["1.0000001", 400],
    ["1234567890123456789", 422],
  ] as const) {
    const r = await nhan(jreq({ items: [{ poItemId: it!.id, qtyReceived: v }] }), thamSo(poId));
    assert.equal(r.status, st, `nhận ${v}`);
  }
});

test(
  "backfill: dry-run không ghi; chạy thật legacy_float_text; chạy lại idempotent; không đè exact_input_v1",
  S,
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { projectId, matId, uid } = await dungDuAn();
    const { backfillPoQtyExact } = await import("../scripts/backfill-po-qty-exact");
    const prLegacy = await insertId(
      `INSERT INTO purchase_requests (pr_code, material_id, qty_requested, requested_by, project_id)
     VALUES (?, ?, 0.1, ?, ?)`,
      uniq("PRQ-"),
      matId,
      uid,
      projectId,
    );
    const prAm = await insertId(
      `INSERT INTO purchase_requests (pr_code, material_id, qty_requested, requested_by, project_id)
     VALUES (?, ?, -2, ?, ?)`,
      uniq("PRQ-"),
      matId,
      uid,
      projectId,
    );
    const prExact = await insertId(
      `INSERT INTO purchase_requests (pr_code, material_id, qty_requested, qty_requested_exact,
       qty_requested_provenance, requested_by, project_id)
     VALUES (?, ?, 1.000001, 1.000001, 'exact_input_v1', ?, ?)`,
      uniq("PRQ-"),
      matId,
      uid,
      projectId,
    );
    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, created_by, project_id) VALUES (?, ?, ?)`,
      uniq("POQ-"),
      uid,
      projectId,
    );
    const poItem = await insertId(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, qty_received) VALUES (?, ?, 3.3, NULL)`,
      poId,
      matId,
    );
    const doc = (id: number) =>
      queryOne<{ e: string | null; p: string | null }>(
        `SELECT qty_requested_exact::text AS e, qty_requested_provenance AS p
         FROM purchase_requests WHERE id = ?`,
        id,
      );

    const kho = await backfillPoQtyExact({ dryRun: true, batch: 2 });
    assert.deepEqual(await doc(prLegacy), { e: null, p: null });
    const prRep = kho.find((r) => r.table === "purchase_requests")!;
    assert.ok(prRep.reconciliation.some((x) => x.id === prAm && x.value === "-2"));

    await backfillPoQtyExact({ batch: 2 });
    assert.deepEqual(await doc(prLegacy), { e: "0.1", p: "legacy_float_text" });
    assert.deepEqual(await doc(prAm), { e: null, p: null }); // âm → đối soát, không ghi 0
    assert.deepEqual(await doc(prExact), { e: "1.000001", p: "exact_input_v1" });
    const it = await queryOne<{ oe: string; op: string; re: string | null; rp: string | null }>(
      `SELECT qty_ordered_exact::text AS oe, qty_ordered_provenance AS op,
            qty_received_exact::text AS re, qty_received_provenance AS rp FROM po_items WHERE id = ?`,
      poItem,
    );
    assert.deepEqual(it, { oe: "3.3", op: "legacy_float_text", re: null, rp: null });

    // Chạy lại: dòng đã có provenance không bị chạm; sửa tay exact để chứng minh không ghi đè.
    await run(`UPDATE purchase_requests SET qty_requested_exact = 0.1 WHERE id = ?`, prLegacy);
    const lai = await backfillPoQtyExact({ batch: 2, fromId: prLegacy - 1 });
    assert.deepEqual(await doc(prLegacy), { e: "0.1", p: "legacy_float_text" });
    assert.equal(lai.find((r) => r.table === "purchase_requests")!.changed, 0);
    assert.deepEqual(await doc(prExact), { e: "1.000001", p: "exact_input_v1" });
  },
);
