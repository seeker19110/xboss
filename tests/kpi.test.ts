import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test tích hợp cho lib/kpi.ts (sheetProgressKpi/taskStatusCounts) và lib/group-progress.ts —
// 3 hàm SQL dùng chung giữa dashboard nội bộ, /api/v1/dashboard/kpi và các bảng hạng mục trễ,
// trước PR này chưa có test nào chạm tới. Điểm dễ vỡ là các nhánh SQL ghép chuỗi theo
// projectId/systemId (JOIN towers có/không, WHERE có/không) — thứ tự tham số sai sẽ lọt
// typecheck nhưng hỏng khi chạy, đúng lớp lỗi đã xảy ra thật ở M64 (xem PROGRESS.md).
//
// Tự seed dữ liệu riêng (không phụ thuộc dữ liệu có sẵn) rồi dọn sạch trong finally.

type Seed = {
  projectId: number;
  otherProjectId: number;
  towerId: number;
  otherTowerId: number;
  systemId: number;
  sheetA: number;
  sheetB: number;
  sheetOther: number;
  pkgA: number;
  pkgB: number;
  pkgOther: number;
};

async function seed(): Promise<Seed> {
  const { insertId, run } = await import("@/lib/db");
  const systemId = await insertId(
    `INSERT INTO systems (code, name) VALUES ('KPI-SYS', 'Hệ test KPI') RETURNING id`,
  );
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('KPI test A')`);
  const otherProjectId = await insertId(`INSERT INTO projects (name) VALUES ('KPI test B')`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp KPI A')`,
    projectId,
  );
  const otherTowerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp KPI B')`,
    otherProjectId,
  );
  // sheetA gắn hệ KPI-SYS, sheetB không gắn hệ → kiểm được nhánh lọc systemId.
  const sheetA = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, system_id, sort_order)
     VALUES (?, 'KPI-A', 'Sheet KPI A', 'kpi-a', ?, 1)`,
    towerId,
    systemId,
  );
  const sheetB = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, sort_order)
     VALUES (?, 'KPI-B', 'Sheet KPI B', 'kpi-b', 2)`,
    towerId,
  );
  const sheetOther = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, sort_order)
     VALUES (?, 'KPI-C', 'Sheet dự án khác', 'kpi-c', 3)`,
    otherTowerId,
  );
  const pkgA = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'KA', 'Nhóm A', '16')`,
    sheetA,
  );
  const pkgB = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'KB', 'Nhóm B', '17')`,
    sheetB,
  );
  const pkgOther = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'KC', 'Nhóm C', '18')`,
    sheetOther,
  );
  // sheetA: 0.2 + 0.8 → TB 0.5 (2 task) | sheetB: 1.0 (1 task) | dự án khác: 0.0 (1 task)
  const mk = (pkg: number, code: string, pct: number, status: string) =>
    run(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, ?, ?, ?, ?)`,
      pkg,
      code,
      `Task ${code}`,
      pct,
      status,
    );
  await mk(pkgA, "KA,01", 0.2, "dang_thi_cong");
  await mk(pkgA, "KA,02", 0.8, "dang_thi_cong");
  await mk(pkgB, "KB,01", 1, "hoan_thanh");
  await mk(pkgOther, "KC,01", 0, "chuan_bi");
  return {
    projectId,
    otherProjectId,
    towerId,
    otherTowerId,
    systemId,
    sheetA,
    sheetB,
    sheetOther,
    pkgA,
    pkgB,
    pkgOther,
  };
}

async function cleanup(s: Seed) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM tasks WHERE package_id IN (?, ?, ?)`, s.pkgA, s.pkgB, s.pkgOther);
  await run(`DELETE FROM work_packages WHERE id IN (?, ?, ?)`, s.pkgA, s.pkgB, s.pkgOther);
  await run(`DELETE FROM sheet_types WHERE id IN (?, ?, ?)`, s.sheetA, s.sheetB, s.sheetOther);
  await run(`DELETE FROM towers WHERE id IN (?, ?)`, s.towerId, s.otherTowerId);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, s.projectId, s.otherProjectId);
  await run(`DELETE FROM systems WHERE id = ?`, s.systemId);
}

test(
  "sheetProgressKpi: lọc đúng dự án, % TB = trung bình task của sheet",
  { skip: !HAS_TEST_DB },
  async () => {
    const { sheetProgressKpi } = await import("@/lib/kpi");
    const s = await seed();
    try {
      const rows = await sheetProgressKpi({ projectId: s.projectId });
      const byCode = new Map(rows.map((r) => [r.sheetType, r]));
      // Sheet của dự án khác KHÔNG được lọt vào.
      assert.equal(byCode.has("KPI-C"), false);
      assert.equal(Number(byCode.get("KPI-A")?.total), 2);
      assert.ok(Math.abs(Number(byCode.get("KPI-A")?.avgProgress) - 0.5) < 1e-9);
      assert.equal(Number(byCode.get("KPI-B")?.total), 1);
      assert.ok(Math.abs(Number(byCode.get("KPI-B")?.avgProgress) - 1) < 1e-9);
      assert.equal(byCode.get("KPI-A")?.sheetSlug, "kpi-a");
    } finally {
      await cleanup(s);
    }
  },
);

test(
  "sheetProgressKpi: lọc theo systemId chỉ giữ sheet gắn hệ đó",
  { skip: !HAS_TEST_DB },
  async () => {
    const { sheetProgressKpi } = await import("@/lib/kpi");
    const s = await seed();
    try {
      const rows = await sheetProgressKpi({ projectId: s.projectId, systemId: s.systemId });
      const codes = rows.map((r) => r.sheetType);
      assert.deepEqual(codes, ["KPI-A"]);
    } finally {
      await cleanup(s);
    }
  },
);

test("taskStatusCounts: đếm theo trạng thái trong đúng dự án", { skip: !HAS_TEST_DB }, async () => {
  const { taskStatusCounts } = await import("@/lib/kpi");
  const s = await seed();
  try {
    const rows = await taskStatusCounts(s.projectId);
    const by = new Map(rows.map((r) => [r.status, Number(r.count)]));
    assert.equal(by.get("dang_thi_cong"), 2);
    assert.equal(by.get("hoan_thanh"), 1);
    // task 'chuan_bi' thuộc dự án khác → không được đếm.
    assert.equal(by.get("chuan_bi"), undefined);
  } finally {
    await cleanup(s);
  }
});

test(
  "getGroupProgressMap: khoá theo (sheet, tầng), % TB toàn hạng mục",
  { skip: !HAS_TEST_DB },
  async () => {
    const { getGroupProgressMap } = await import("@/lib/group-progress");
    const { delayedGroupKey } = await import("@/lib/delayed-groups");
    const s = await seed();
    try {
      const map = await getGroupProgressMap({ projectId: s.projectId });
      assert.ok(Math.abs((map.get(delayedGroupKey("KPI-A", "16")) ?? -1) - 0.5) < 1e-9);
      assert.ok(Math.abs((map.get(delayedGroupKey("KPI-B", "17")) ?? -1) - 1) < 1e-9);
      // Hạng mục của dự án khác không lọt vào map khi đã lọc theo dự án.
      assert.equal(map.has(delayedGroupKey("KPI-C", "18")), false);
    } finally {
      await cleanup(s);
    }
  },
);

test(
  "getGroupProgressMap: lọc systemId chỉ giữ hạng mục thuộc hệ đó",
  { skip: !HAS_TEST_DB },
  async () => {
    const { getGroupProgressMap } = await import("@/lib/group-progress");
    const { delayedGroupKey } = await import("@/lib/delayed-groups");
    const s = await seed();
    try {
      const map = await getGroupProgressMap({ projectId: s.projectId, systemId: s.systemId });
      assert.equal(map.has(delayedGroupKey("KPI-A", "16")), true);
      assert.equal(map.has(delayedGroupKey("KPI-B", "17")), false);
    } finally {
      await cleanup(s);
    }
  },
);
