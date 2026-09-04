import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Phạm vi dự án của mảng mặt trận (tầng × công tác). Hai lỗ hổng được vá cùng đợt:
//  - /api/floor-stage-fronts/:id/documents (GET+POST) chỉ tra `WHERE id = ?`;
//  - /api/floor-stage-front-documents/:id (GET+DELETE) cũng vậy.
// Nhãn tầng là chuỗi tự do nên id ô của dự án khác hoàn toàn đoán được — biết id là đọc,
// ghi đè và xoá được biên bản bàn giao của dự án khác.
//
// Test đi thẳng vào câu truy vấn lọc (cùng mệnh đề mà route dùng) thay vì dựng phiên HTTP:
// bất biến cần khoá là "tài liệu chỉ thấy được trong đúng dự án của nó".

test(
  "Tài liệu mặt trận: chỉ truy được trong đúng dự án chứa ô mặt trận",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, withProjectScope } = await import("@/lib/db");

    // Hai dự án, mỗi dự án một ô mặt trận CÙNG nhãn tầng "T5" (đúng ca mà M123 tách ra).
    const stageId = await insertId(
      `INSERT INTO construction_stages (name, sort_order, duration_days) VALUES ('Công tác test phạm vi', 999, 3)`,
    );
    const mk = async (ten: string) => {
      const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, ten);
      const frontId = await insertId(
        `INSERT INTO floor_stage_fronts (project_id, floor_label, stage_id) VALUES (?, 'T5', ?)`,
        projectId,
        stageId,
      );
      const docId = await insertId(
        `INSERT INTO floor_stage_front_documents (floor_stage_front_id, file_path, file_name, mime, doc_kind)
         VALUES (?, ?, ?, 'application/pdf', 'handover')`,
        frontId,
        `uploads/bien-ban-${ten}.pdf`,
        `bien-ban-${ten}.pdf`,
      );
      return { projectId, frontId, docId };
    };
    const a = await mk("Dự án A phạm vi mặt trận");
    const b = await mk("Dự án B phạm vi mặt trận");

    // Mệnh đề lọc của route documents: ô mặt trận phải thuộc dự án đang chọn.
    const front = (frontId: number, projectId: number) =>
      withProjectScope(projectId, () =>
        queryOne<{ id: number }>(
          `SELECT id FROM floor_stage_fronts WHERE id = ? AND project_id = ?`,
          frontId,
          projectId,
        ),
      );
    assert.ok(await front(a.frontId, a.projectId), "ô của chính dự án phải thấy được");
    assert.equal(
      await front(b.frontId, a.projectId),
      undefined,
      "ô của dự án B không được lộ cho dự án A",
    );

    // Mệnh đề lọc của route tải/xoá tài liệu: JOIN ngược qua floor_stage_fronts.
    const doc = (docId: number, projectId: number) =>
      withProjectScope(projectId, () =>
        queryOne<{ id: number }>(
          `SELECT d.id
             FROM floor_stage_front_documents d
             JOIN floor_stage_fronts f ON f.id = d.floor_stage_front_id
            WHERE d.id = ? AND f.project_id = ?`,
          docId,
          projectId,
        ),
      );
    assert.ok(await doc(a.docId, a.projectId), "tài liệu của chính dự án phải tải được");
    assert.equal(
      await doc(b.docId, a.projectId),
      undefined,
      "tài liệu của dự án B không được tải/xoá từ dự án A",
    );
  },
);

test(
  "Mặt trận: hai dự án cùng nhãn tầng 'T5' là hai bộ ô độc lập, đọc trong ngữ cảnh dự án",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId } = await import("@/lib/db");
    const { listFloorStageFronts, ensureFloorStageFronts } =
      await import("@/lib/tien-do/constructionStages");

    const pA = await insertId(`INSERT INTO projects (name) VALUES ('Dự án A ô độc lập')`);
    const pB = await insertId(`INSERT INTO projects (name) VALUES ('Dự án B ô độc lập')`);

    // ensureFloorStageFronts và listFloorStageFronts nay tự đặt GUC app.project_id: gọi
    // được ngoài mọi transaction mà RLS (0149) vẫn áp đúng phạm vi.
    await ensureFloorStageFronts(pA, ["T5"]);
    await ensureFloorStageFronts(pB, ["T5"]);

    const aFronts = await listFloorStageFronts(pA);
    const bFronts = await listFloorStageFronts(pB);
    assert.ok(aFronts.length > 0);
    assert.ok(bFronts.length > 0);
    assert.equal(
      aFronts.filter((f) => bFronts.some((g) => g.id === f.id)).length,
      0,
      "hai dự án cùng nhãn tầng không được dùng chung ô nào",
    );
  },
);
