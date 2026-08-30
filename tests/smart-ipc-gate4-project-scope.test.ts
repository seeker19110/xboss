// tests/smart-ipc-gate4-project-scope.test.ts — Reviewer bắt lỗi V5 [Cao]: Gate 4 (đối soát
// BOQ/kho) đọc `boq_items` theo mã BOQ mà KHÔNG lọc `project_id` — nếu mã trùng ở dự án khác,
// cổng thẩm định giải ngân đối chiếu khối lượng claim với qty_contract của DỰ ÁN KHÁC. Test tích
// hợp: cần Postgres thật (mã BOQ unique toàn hệ thống theo `lower(code)` — xem lib/khoi-luong/
// boq.ts — nên phải né chạm bảng thật bằng DB test riêng). Tự skip khi thiếu TEST_DATABASE_URL.
import { HAS_TEST_DB } from "./setup"; // phải đứng đầu
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { insertId, run } from "@/lib/db";
import { fetchSmartIpcGatingContext } from "@/lib/ky-thuat/engineering-smart-ipc";

describe("Smart IPC Gate 4 — không đọc chéo dự án qua boq_items", { skip: !HAS_TEST_DB }, () => {
  it("chỉ lấy qty_contract của ĐÚNG dự án đang giải ngân, không lấy nhầm dự án khác dù mã BOQ trùng", async () => {
    const boqCode = `SMARTIPC-SCOPE-${Date.now()}`;

    const duAnA = await insertId(`INSERT INTO projects (name) VALUES ('Smart IPC scope A')`);
    const duAnB = await insertId(`INSERT INTO projects (name) VALUES ('Smart IPC scope B')`);

    // BOQCODE unique toàn hệ thống theo lower(code) (uniq_boq_items_code_lower) nên 2 dòng
    // dưới đây phải khác mã — nhưng đó chính là điều làm lộ bug: thiếu `AND project_id = ?`
    // nghĩa là bất kỳ user nào ở dự án A cũng đối soát được với BOQ CODE của dự án B (miễn
    // biết/đoán đúng mã), lấy nhầm số liệu tài chính của dự án khác cho cổng giải ngân của
    // mình. Test khoá đúng hành vi: mã BOQ thuộc dự án khác phải "khong_du_du_lieu" khi đối
    // soát cho dự án hiện tại, dù dòng đó tồn tại thật trong DB.
    const boqA = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, project_id) VALUES (?, ?, ?, ?, ?)`,
      `${boqCode}-A`,
      "Ống thép DN100",
      "m",
      100,
      duAnA,
    );
    const boqB = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, project_id) VALUES (?, ?, ?, ?, ?)`,
      `${boqCode}-B`,
      "Ống thép DN100 (dự án khác)",
      "m",
      9999, // số liệu khác hẳn — nếu gate4 lấy nhầm sẽ lộ ngay qua approvedBoqQty
      duAnB,
    );

    try {
      const ctxA = await fetchSmartIpcGatingContext(duAnA, {
        boqCode: `${boqCode}-A`,
        claimedQty: 50,
      });
      assert.equal(ctxA.gate4.available, true);
      assert.equal(ctxA.gate4.approvedBoqQty, 100, "phải lấy đúng qty_contract của dự án A");

      // Mã của dự án B không tồn tại trong dự án A → gate4 phải "khong_du_du_lieu", KHÔNG
      // được lấy nhầm dòng của dự án B (đây chính là hành vi lỗi cũ khi thiếu AND project_id).
      const ctxCheoDuAn = await fetchSmartIpcGatingContext(duAnA, {
        boqCode: `${boqCode}-B`,
        claimedQty: 50,
      });
      assert.equal(
        ctxCheoDuAn.gate4.available,
        false,
        "mã BOQ của dự án khác không được đối soát cho dự án A",
      );
      assert.equal(ctxCheoDuAn.gate4.approvedBoqQty, null);

      const ctxB = await fetchSmartIpcGatingContext(duAnB, {
        boqCode: `${boqCode}-B`,
        claimedQty: 50,
      });
      assert.equal(ctxB.gate4.approvedBoqQty, 9999, "dự án B vẫn đọc đúng dữ liệu của chính nó");
    } finally {
      await run(`DELETE FROM boq_items WHERE id IN (?, ?)`, boqA, boqB);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, duAnA, duAnB);
    }
  });
});
