import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== M54 GĐ1 PR1: mã BOQ duy nhất TRONG mỗi org (không còn toàn cục) =====
// Cần Postgres riêng qua TEST_DATABASE_URL (chạy migration 0078). Không có thì tự skip
// theo đúng pattern các test tích hợp khác (xem tests/boq.test.ts, tests/rls.test.ts).

// Dựng chuỗi WBS tối thiểu (project → tower → sheet_type → work_package) trong 1 org, trả
// về id package để gắn task. Project nhận org_id tường minh để trigger suy đúng org.
async function seedPackage(
  insertId: (sql: string, ...p: unknown[]) => Promise<number>,
  orgId: number,
  tag: string,
): Promise<{ projectId: number; towerId: number; stId: number; pkgId: number }> {
  const projectId = await insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
    `DA org ${tag}`,
    orgId,
  );
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
    projectId,
  );
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet test')`,
    towerId,
    `ST${tag}`,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, 'Nhóm test')`,
    stId,
    `P${tag}`,
  );
  return { projectId, towerId, stId, pkgId };
}

test(
  "boq_codes: 2 org khác nhau tạo CÙNG mã BOQ trên 2 task → cả hai thành công (cô lập tenant)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, query, insertId } = await import("@/lib/db");
    const { boqTakenBy } = await import("@/lib/boq");

    // org 1 = tổ chức mặc định (migration tạo). Tạo thêm org 2.
    const suffix = Date.now().toString(36);
    const org2 = await insertId(
      `INSERT INTO organizations (name, slug) VALUES ('Org 2 test', ?)`,
      `org2-${suffix}`,
    );
    const a = await seedPackage(insertId, 1, `A${suffix}`);
    const b = await seedPackage(insertId, org2, `B${suffix}`);

    const dupCode = `DUP-${suffix}`;
    let taskA: number | null = null;
    let taskB: number | null = null;
    try {
      // Task org 1 giành mã.
      taskA = await insertId(
        `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'TA,01', 'Task A', ?)`,
        a.pkgId,
        dupCode,
      );
      // Task org 2 giành CÙNG mã → phải thành công (khác org, không xung đột PK (org_id, code)).
      taskB = await insertId(
        `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'TB,01', 'Task B', ?)`,
        b.pkgId,
        dupCode,
      );

      // boq_codes có đúng 2 dòng cho mã này: (1, code) và (org2, code).
      const codes = await query<{ org_id: number }>(
        `SELECT org_id FROM boq_codes WHERE code = ? ORDER BY org_id`,
        dupCode,
      );
      assert.equal(codes.length, 2, "phải có 2 đăng ký mã (mỗi org 1 dòng)");
      assert.deepEqual(
        codes.map((c) => c.org_id).sort((x, y) => x - y),
        [1, org2].sort((x, y) => x - y),
      );

      // boqTakenBy lọc theo org: mỗi org chỉ thấy task của chính mình.
      assert.match((await boqTakenBy(dupCode, 1)) ?? "", /Task A/);
      assert.match((await boqTakenBy(dupCode, org2)) ?? "", /Task B/);
      // Không loại trừ đúng org → task của org kia không lộ sang.
      assert.doesNotMatch((await boqTakenBy(dupCode, 1)) ?? "", /Task B/);
    } finally {
      // Dọn theo đúng thứ tự FK (task trước work_package) — không để finally che lỗi assert.
      if (taskA) await run(`DELETE FROM tasks WHERE id = ?`, taskA);
      if (taskB) await run(`DELETE FROM tasks WHERE id = ?`, taskB);
      await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, a.pkgId, b.pkgId);
      await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, a.stId, b.stId);
      await run(`DELETE FROM towers WHERE id IN (?, ?)`, a.towerId, b.towerId);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, a.projectId, b.projectId);
      await run(`DELETE FROM organizations WHERE id = ?`, org2);
    }
  },
);

test(
  "boq_codes: cùng org, cùng mã trên 2 bảng khác nhau → vẫn bị chặn (trigger raise)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    const suffix = Date.now().toString(36);
    const a = await seedPackage(insertId, 1, `C${suffix}`);
    const sameCode = `SAME-${suffix}`;
    let pkgWithCode: number | null = null;
    try {
      // work_package (org 1) giành mã.
      pkgWithCode = await insertId(
        `INSERT INTO work_packages (sheet_type_id, code, name, boq_code) VALUES (?, 'PC,01', 'Nhóm giữ mã', ?)`,
        a.stId,
        sameCode,
      );
      // material CÙNG org 1 (qua project_id của org 1) giành CÙNG mã ở bảng khác → trigger raise.
      await assert.rejects(
        () =>
          insertId(
            `INSERT INTO materials (name, boq_code, project_id) VALUES ('VT trùng mã', ?, ?)`,
            sameCode,
            a.projectId,
          ),
        /đã được dùng ở bảng khác/,
        "cùng org + cùng mã ở bảng khác phải bị trigger boq_codes_sync chặn",
      );
    } finally {
      if (pkgWithCode) await run(`DELETE FROM work_packages WHERE id = ?`, pkgWithCode);
      await run(`DELETE FROM work_packages WHERE id = ?`, a.pkgId);
      await run(`DELETE FROM sheet_types WHERE id = ?`, a.stId);
      await run(`DELETE FROM towers WHERE id = ?`, a.towerId);
      await run(`DELETE FROM projects WHERE id = ?`, a.projectId);
    }
  },
);

test(
  "org_axis: org mặc định id=1 tồn tại; project omit org_id → nhận DEFAULT 1; org_id NOT NULL",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, query, queryOne, insertId } = await import("@/lib/db");

    // Migration 0078 phải đảm bảo có org mặc định id=1 (backfill dữ liệu cũ về org này).
    const org1 = await queryOne<{ id: number; slug: string; status: string }>(
      `SELECT id, slug, status FROM organizations WHERE id = 1`,
    );
    assert.ok(org1, "phải có tổ chức mặc định id=1");
    assert.equal(org1!.status, "active");

    // INSERT project không truyền org_id → DEFAULT 1 (cầu tương thích giai đoạn 1-org).
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('DA default org')`);
    try {
      const row = await queryOne<{ org_id: number }>(
        `SELECT org_id FROM projects WHERE id = ?`,
        projectId,
      );
      assert.equal(row!.org_id, 1, "project omit org_id phải nhận DEFAULT 1");

      // org_id là NOT NULL: ép NULL tường minh phải bị chặn.
      await assert.rejects(
        () => run(`INSERT INTO projects (name, org_id) VALUES ('DA null org', NULL)`),
        /null value|not-null|violates/i,
        "org_id NOT NULL phải chặn INSERT org_id = NULL",
      );
    } finally {
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }

    // Không còn dòng nào org_id NULL sau backfill (mọi dòng cũ = 1).
    const nullRows = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM projects WHERE org_id IS NULL`,
    );
    assert.equal(nullRows[0].n, 0, "sau migration không dòng projects nào còn org_id NULL");
  },
);
