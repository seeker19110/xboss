import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load (constructionStages import lib/db)
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysISO } from "@/lib/nen/date";
import {
  computePlannedDates,
  type StageRow,
  type FloorStageFrontRow,
} from "@/lib/tien-do/constructionStages";

test("addDaysISO: cộng/trừ ngày thuần, không phụ thuộc hôm nay", () => {
  assert.equal(addDaysISO("2026-07-01", 5), "2026-07-06");
  assert.equal(addDaysISO("2026-07-01", 0), "2026-07-01");
  assert.equal(addDaysISO("2026-07-10", -5), "2026-07-05");
  // Qua tháng/năm.
  assert.equal(addDaysISO("2026-01-30", 3), "2026-02-02");
  assert.equal(addDaysISO("2025-12-30", 3), "2026-01-02");
});

function mkStage(id: number, sortOrder: number, durationDays: number): StageRow {
  return { id, name: `Stage ${id}`, sortOrder, active: true, durationDays };
}
function mkFront(
  id: number,
  floorLabel: string,
  stageId: number,
  plannedReceivedAt: string | null,
): FloorStageFrontRow {
  return {
    id,
    floorLabel,
    stageId,
    handedOverAt: null,
    receivedAt: null,
    plannedReceivedAt,
    note: null,
    outgoingSupplierId: null,
    incomingSupplierId: null,
    transitionStageId: null,
    outgoingRepName: null,
    incomingRepName: null,
    updatedAt: "",
  };
}

test("computePlannedDates: nối tiếp từ ngày bắt đầu kế hoạch của công tác đầu tiên", () => {
  const stages = [mkStage(1, 1, 2), mkStage(2, 2, 3), mkStage(3, 3, 5)];
  const fronts = [
    mkFront(101, "10F", 1, "2026-07-01"),
    mkFront(102, "10F", 2, null),
    mkFront(103, "10F", 3, null),
  ];

  const planned = computePlannedDates(stages, fronts, "10F");

  assert.deepEqual(planned.get(1), {
    plannedReceivedAt: "2026-07-01",
    plannedHandedOverAt: "2026-07-03",
  });
  assert.deepEqual(planned.get(2), {
    plannedReceivedAt: "2026-07-03",
    plannedHandedOverAt: "2026-07-06",
  });
  assert.deepEqual(planned.get(3), {
    plannedReceivedAt: "2026-07-06",
    plannedHandedOverAt: "2026-07-11",
  });
});

test("computePlannedDates: chưa đặt ngày bắt đầu kế hoạch → toàn bộ chuỗi null", () => {
  const stages = [mkStage(1, 1, 2), mkStage(2, 2, 3)];
  const fronts = [mkFront(101, "10F", 1, null), mkFront(102, "10F", 2, null)];

  const planned = computePlannedDates(stages, fronts, "10F");

  assert.deepEqual(planned.get(1), { plannedReceivedAt: null, plannedHandedOverAt: null });
  assert.deepEqual(planned.get(2), { plannedReceivedAt: null, plannedHandedOverAt: null });
});

test("computePlannedDates: chỉ tính cho tầng được yêu cầu, không lẫn dữ liệu tầng khác", () => {
  const stages = [mkStage(1, 1, 2)];
  const fronts = [mkFront(101, "10F", 1, "2026-07-01"), mkFront(102, "11F", 1, "2026-08-01")];

  const planned10F = computePlannedDates(stages, fronts, "10F");
  assert.equal(planned10F.get(1)?.plannedReceivedAt, "2026-07-01");

  const planned11F = computePlannedDates(stages, fronts, "11F");
  assert.equal(planned11F.get(1)?.plannedReceivedAt, "2026-08-01");
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) — M123 PR1 =====

// Dựng 2 dự án cùng nhãn tầng "T5" + 1 công tác riêng, trả kèm hàm dọn dẹp.
async function dungHaiDuAn(nhan: string) {
  const { run, insertId } = await import("@/lib/db");
  const orgId = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org ${nhan}`);
  const projectA = await insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
    `Dự án A ${nhan}`,
    orgId,
  );
  const projectB = await insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
    `Dự án B ${nhan}`,
    orgId,
  );
  const userId = await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, 'pm', 'x')`,
    `User ${nhan}`,
    `m123-${nhan}@x.vn`,
  );
  // ensureFloorStageFronts sinh ô cho MỌI công tác active (kể cả 7 công tác seed dùng
  // chung) nên mọi assert dưới đây lọc theo đúng stage của mình, còn dọn dẹp thì xoá
  // theo project_id để không sót dòng của các công tác khác.
  const stageId = await insertId(
    `INSERT INTO construction_stages (name, sort_order, duration_days) VALUES (?, 9998, 1)`,
    `Công tác ${nhan}`,
  );
  const donDep = async () => {
    await run(`DELETE FROM floor_stage_fronts WHERE project_id IN (?, ?)`, projectA, projectB);
    await run(`DELETE FROM construction_stages WHERE id = ?`, stageId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, projectA, projectB);
    await run(`DELETE FROM organizations WHERE id = ?`, orgId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  };
  return { projectA, projectB, stageId, userId, donDep };
}

test(
  "ensureFloorStageFronts: hai dự án cùng nhãn tầng 'T5' sinh 2 bộ ô độc lập + idempotent",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query } = await import("@/lib/db");
    const { ensureFloorStageFronts } = await import("@/lib/tien-do/constructionStages");
    const { projectA, projectB, stageId, donDep } = await dungHaiDuAn("ensure");

    try {
      await ensureFloorStageFronts(projectA, ["T5"]);
      await ensureFloorStageFronts(projectB, ["T5"]);
      // Gọi lại lần 2 cùng dự án: không được nhân đôi dòng.
      await ensureFloorStageFronts(projectA, ["T5"]);

      const rows = await query<{ projectId: number }>(
        `SELECT project_id AS "projectId" FROM floor_stage_fronts
          WHERE stage_id = ? AND floor_label = 'T5' ORDER BY project_id`,
        stageId,
      );
      assert.deepEqual(
        rows.map((r) => r.projectId),
        [projectA, projectB],
      );
    } finally {
      await donDep();
    }
  },
);

test(
  "upsertFloorStageFront: ghi ở dự án A không đổi dòng của dự án B (AC4)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query, queryOne } = await import("@/lib/db");
    const { ensureFloorStageFronts, upsertFloorStageFront } =
      await import("@/lib/tien-do/constructionStages");
    const { projectA, projectB, stageId, userId, donDep } = await dungHaiDuAn("upsert");

    try {
      await ensureFloorStageFronts(projectA, ["T5"]);
      await ensureFloorStageFronts(projectB, ["T5"]);

      const truoc = await queryOne<{ id: number }>(
        `SELECT id FROM floor_stage_fronts WHERE stage_id = ? AND floor_label = 'T5' AND project_id = ?`,
        stageId,
        projectB,
      );

      const id = await upsertFloorStageFront(
        projectA,
        "T5",
        stageId,
        {
          receivedAt: "2026-07-01",
          handedOverAt: null,
          plannedReceivedAt: null,
          note: "ghi chú A",
          outgoingSupplierId: null,
          incomingSupplierId: null,
          transitionStageId: null,
          outgoingRepName: null,
          incomingRepName: null,
        },
        userId,
      );

      // Vẫn đúng 2 dòng (upsert vào dòng sẵn có của A, không tạo dòng thứ 3).
      const rows = await query<{ id: number; projectId: number; note: string | null }>(
        `SELECT id, project_id AS "projectId", note FROM floor_stage_fronts
          WHERE stage_id = ? AND floor_label = 'T5' ORDER BY project_id`,
        stageId,
      );
      assert.equal(rows.length, 2);
      assert.equal(rows[0].projectId, projectA);
      assert.equal(rows[0].id, id);
      assert.equal(rows[0].note, "ghi chú A");
      // Dòng của B nguyên vẹn: cùng id cũ, không bị đè ghi chú/ngày nhận.
      assert.equal(rows[1].id, truoc!.id);
      assert.equal(rows[1].note, null);
    } finally {
      await donDep();
    }
  },
);

// ===== Test tích hợp M123 PR3 — lọc theo dự án đường ĐỌC =====

test(
  "listStages: trả công tác dùng chung + riêng dự án hiện tại, không trả của dự án khác (AC5)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listStages } = await import("@/lib/tien-do/constructionStages");
    const { projectA, projectB, stageId: stageChung, donDep } = await dungHaiDuAn("liststages");

    const stageA = await insertId(
      `INSERT INTO construction_stages (project_id, name, sort_order, duration_days)
       VALUES (?, 'Công tác riêng A', 9999, 1)`,
      projectA,
    );
    const stageB = await insertId(
      `INSERT INTO construction_stages (project_id, name, sort_order, duration_days)
       VALUES (?, 'Công tác riêng B', 9999, 1)`,
      projectB,
    );
    try {
      const idsA = (await listStages(projectA)).map((s) => s.id);
      assert.ok(idsA.includes(stageChung), "phải thấy công tác dùng chung (project_id NULL)");
      assert.ok(idsA.includes(stageA), "phải thấy công tác riêng của dự án A");
      assert.ok(!idsA.includes(stageB), "không được thấy công tác riêng của dự án B");

      const idsB = (await listStages(projectB)).map((s) => s.id);
      assert.ok(idsB.includes(stageChung));
      assert.ok(idsB.includes(stageB));
      assert.ok(!idsB.includes(stageA));
    } finally {
      await run(`DELETE FROM construction_stages WHERE id IN (?, ?)`, stageA, stageB);
      await donDep();
    }
  },
);

test(
  "listFloorStageFronts + allProjectFloors: không rò dữ liệu dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { ensureFloorStageFronts, listFloorStageFronts, allProjectFloors } =
      await import("@/lib/tien-do/constructionStages");
    const { projectA, projectB, stageId, donDep } = await dungHaiDuAn("doc");

    // Mỗi dự án 1 tháp × 1 sheet × 1 nhóm để allProjectFloors có nguồn nhãn tầng.
    const towerA = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp A')`,
      projectA,
    );
    const towerB = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp B')`,
      projectB,
    );
    const sheetA = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'M123A', 'Sheet A', 'm123-doc-a')`,
      towerA,
    );
    const sheetB = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'M123B', 'Sheet B', 'm123-doc-b')`,
      towerB,
    );
    await run(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'A1', 'Nhóm A', 'T5')`,
      sheetA,
    );
    await run(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'A1', 'Nhóm B', 'T9')`,
      sheetB,
    );

    try {
      await ensureFloorStageFronts(projectA, ["T5"]);
      await ensureFloorStageFronts(projectB, ["T5"]);

      // allProjectFloors: chỉ tầng của dự án mình.
      assert.deepEqual(await allProjectFloors(projectA), ["T5"]);
      assert.deepEqual(await allProjectFloors(projectB), ["T9"]);

      // listFloorStageFronts: ô của dự án A không lẫn ô của B (cùng nhãn tầng "T5").
      const frontsA = (await listFloorStageFronts(projectA)).filter((f) => f.stageId === stageId);
      const frontsB = (await listFloorStageFronts(projectB, "T5")).filter(
        (f) => f.stageId === stageId,
      );
      assert.equal(frontsA.length, 1);
      assert.equal(frontsB.length, 1);
      assert.notEqual(frontsA[0].id, frontsB[0].id);
    } finally {
      await run(`DELETE FROM work_packages WHERE sheet_type_id IN (?, ?)`, sheetA, sheetB);
      await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, sheetA, sheetB);
      await run(`DELETE FROM towers WHERE id IN (?, ?)`, towerA, towerB);
      await donDep();
    }
  },
);
