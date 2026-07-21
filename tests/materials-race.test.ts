import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Audit 2026-07-21: PATCH /api/materials/:id (đặt qtyUsed/qtyStock tuyệt đối) từng đọc
// snapshot cũ NGOÀI transaction rồi ghi đè — nếu có POST /transactions (cộng dồn delta,
// atomic UPDATE...RETURNING) chạy xen giữa, giao dịch đó "biến mất" khỏi tồn kho dù dòng
// audit vẫn còn (lost update). Route Next.js cần context request thật nên không gọi trực
// tiếp handler ở đây (cùng quy ước tests/task-photos-dedupe.test.ts) — test mirror đúng
// pattern SQL đã sửa: khoá dòng bằng SELECT ... FOR UPDATE trước khi tính delta.
const S = Date.now().toString(36);

test(
  "materials: PATCH qtyUsed tuyệt đối khoá dòng (FOR UPDATE) trước khi tính delta — không mất giao dịch xen giữa",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run, query, withTransaction } = await import("@/lib/db");

    const materialId = await insertId(
      `INSERT INTO materials (name, unit, qty_used) VALUES (?, 'm', 100)`,
      `VT race ${S}`,
    );

    // Mô phỏng PATCH tuyệt đối (client thấy qty_used=100, muốn đặt thành 110) — chạy
    // đúng pattern route: khoá dòng, đọc lại giá trị THẬT bên trong transaction rồi mới
    // tính delta để ghi audit, thay vì dùng snapshot đọc trước lúc mở transaction.
    async function patchAbsolute(newQty: number) {
      await withTransaction(async () => {
        const locked = await queryOne<{ qty_used: number }>(
          `SELECT qty_used FROM materials WHERE id = ? FOR UPDATE`,
          materialId,
        );
        if (!locked) return;
        await run(`UPDATE materials SET qty_used = ? WHERE id = ?`, newQty, materialId);
        const delta = newQty - locked.qty_used;
        if (delta !== 0) {
          await run(
            `INSERT INTO material_transactions (material_id, delta, qty_after, note)
             VALUES (?, ?, ?, 'test PATCH tuyệt đối')`,
            materialId,
            delta,
            newQty,
          );
        }
      });
    }

    // Giao dịch cộng dồn kiểu POST /transactions (atomic UPDATE...RETURNING) — xen giữa.
    async function postDelta(delta: number) {
      const updated = await queryOne<{ qty_used: number }>(
        `UPDATE materials SET qty_used = GREATEST(0, qty_used + ?) WHERE id = ? RETURNING qty_used`,
        delta,
        materialId,
      );
      await run(
        `INSERT INTO material_transactions (material_id, delta, qty_after, note)
         VALUES (?, ?, ?, 'test POST delta')`,
        materialId,
        delta,
        updated?.qty_used ?? 0,
      );
    }

    // postDelta chạy trước và commit ngay (qty_used 100 -> 105), sau đó patchAbsolute
    // mới bắt đầu — vì đọc lại giá trị trong transaction (FOR UPDATE) thay vì dùng
    // snapshot cũ, delta ghi audit phải tính trên 105 (giá trị thật), không phải 100.
    await postDelta(5);
    await patchAbsolute(110);

    const final = await queryOne<{ qty_used: number }>(
      `SELECT qty_used FROM materials WHERE id = ?`,
      materialId,
    );
    assert.equal(final?.qty_used, 110, "giá trị cuối phải đúng theo PATCH tuyệt đối");

    const txs = await query<{ delta: number; note: string }>(
      `SELECT delta, note FROM material_transactions WHERE material_id = ? ORDER BY id`,
      materialId,
    );
    assert.equal(txs.length, 2);
    assert.equal(txs[0].delta, 5, "giao dịch POST delta không bị mất");
    // Vì patchAbsolute khoá dòng và đọc lại 105 (không phải 100 stale), delta audit đúng = 5.
    assert.equal(
      txs[1].delta,
      5,
      "delta PATCH phải tính trên giá trị thật đã khoá (105→110), không phải snapshot cũ (100→110=10)",
    );

    await run(`DELETE FROM material_transactions WHERE material_id = ?`, materialId);
    await run(`DELETE FROM materials WHERE id = ?`, materialId);
  },
);
