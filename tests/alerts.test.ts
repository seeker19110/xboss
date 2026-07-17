import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== M47 PR4 — Cảnh báo cấu hình được (alert_rules), lib/alerts.ts =====

test("ALERT_METRICS: đủ 5 khoá, mỗi khoá có label/operator/defaultThreshold hợp lệ", async () => {
  const { ALERT_METRICS } = await import("@/lib/alerts");
  const keys = Object.keys(ALERT_METRICS).sort();
  assert.deepEqual(keys, [
    "cpi_below",
    "due_soon_days",
    "due_soon_progress",
    "material_over_pct",
    "spi_below",
  ]);
  for (const k of keys) {
    const m = ALERT_METRICS[k as keyof typeof ALERT_METRICS];
    assert.ok(m.label.length > 0, `${k}: thiếu label`);
    assert.ok(m.operator === "lt" || m.operator === "gt", `${k}: operator sai`);
    assert.ok(Number.isFinite(m.defaultThreshold), `${k}: defaultThreshold không hữu hạn`);
  }
});

test("isAlertMetric: chỉ nhận metric trong whitelist", async () => {
  const { isAlertMetric } = await import("@/lib/alerts");
  assert.equal(isAlertMetric("due_soon_days"), true);
  assert.equal(isAlertMetric("khong_ton_tai"), false);
});

test(
  "getAlertThreshold: không có rule → default; rule dự án riêng → ưu tiên hơn rule NULL",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { getAlertThreshold, ALERT_METRICS, upsertAlertRule, deleteAlertRule } =
      await import("@/lib/alerts");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('M47 Alerts P1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('M47 Alerts P2')`);

    // 1. Không có rule nào → default cũ.
    assert.equal(
      await getAlertThreshold("due_soon_days", p1),
      ALERT_METRICS.due_soon_days.defaultThreshold,
    );

    // 2. Rule project_id NULL (áp mọi dự án) → áp dụng khi dự án cụ thể không có rule riêng.
    const globalRule = await upsertAlertRule({
      projectId: null,
      metric: "due_soon_days",
      threshold: 5,
    });
    assert.ok(typeof globalRule === "object");
    assert.equal(await getAlertThreshold("due_soon_days", p1), 5);
    assert.equal(await getAlertThreshold("due_soon_days", p2), 5);

    // 3. Rule riêng dự án p1 → ưu tiên hơn rule NULL, p2 vẫn dùng rule NULL.
    const ownRule = await upsertAlertRule({
      projectId: p1,
      metric: "due_soon_days",
      threshold: 2,
    });
    assert.ok(typeof ownRule === "object");
    assert.equal(await getAlertThreshold("due_soon_days", p1), 2);
    assert.equal(await getAlertThreshold("due_soon_days", p2), 5);

    // Dọn dẹp.
    if (typeof ownRule === "object") await deleteAlertRule(ownRule.id);
    if (typeof globalRule === "object") await deleteAlertRule(globalRule.id);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "listAlertRules(projectId): chỉ trả rule của dự án đó + rule toàn cục (project_id NULL); null → trả hết",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { listAlertRules, upsertAlertRule, deleteAlertRule } = await import("@/lib/alerts");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('M52 Alerts scope P1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('M52 Alerts scope P2')`);

    const rGlobal = await upsertAlertRule({ projectId: null, metric: "spi_below", threshold: 0.9 });
    const r1 = await upsertAlertRule({ projectId: p1, metric: "cpi_below", threshold: 0.8 });
    const r2 = await upsertAlertRule({ projectId: p2, metric: "cpi_below", threshold: 0.7 });
    assert.ok(typeof rGlobal === "object" && typeof r1 === "object" && typeof r2 === "object");
    const idG = (rGlobal as { id: number }).id;
    const id1 = (r1 as { id: number }).id;
    const id2 = (r2 as { id: number }).id;

    // Scope theo p1: thấy rule p1 + rule toàn cục, KHÔNG thấy rule p2.
    const forP1 = await listAlertRules(p1);
    const idsP1 = forP1.map((r) => r.id);
    assert.ok(idsP1.includes(id1), "phải thấy rule dự án p1");
    assert.ok(idsP1.includes(idG), "phải thấy rule toàn cục");
    assert.ok(!idsP1.includes(id2), "KHÔNG được thấy rule dự án p2");

    // null → không lọc, thấy cả 3.
    const all = await listAlertRules(null);
    const idsAll = all.map((r) => r.id);
    assert.ok(
      [idG, id1, id2].every((id) => idsAll.includes(id)),
      "null phải trả hết",
    );

    await deleteAlertRule(idG);
    await deleteAlertRule(id1);
    await deleteAlertRule(id2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "upsertAlertRule: update cùng (metric,project) không tạo trùng; xoá xong về lại default",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, queryOne } = await import("@/lib/db");
    const { getAlertThreshold, upsertAlertRule, deleteAlertRule } = await import("@/lib/alerts");

    const p = await insertId(`INSERT INTO projects (name) VALUES ('M47 Alerts P3')`);

    const r1 = await upsertAlertRule({ projectId: p, metric: "material_over_pct", threshold: 10 });
    assert.ok(typeof r1 === "object");
    const id1 = (r1 as { id: number }).id;

    // Update cùng (metric, project) → cùng 1 id, không tạo hàng mới.
    const r2 = await upsertAlertRule({ projectId: p, metric: "material_over_pct", threshold: 20 });
    assert.ok(typeof r2 === "object");
    assert.equal((r2 as { id: number }).id, id1);
    assert.equal(await getAlertThreshold("material_over_pct", p), 20);

    const count = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM alert_rules WHERE project_id = ? AND metric = 'material_over_pct'`,
      p,
    );
    assert.equal(count?.n, 1);

    // Xoá xong → quay lại default.
    await deleteAlertRule(id1);
    assert.equal(await getAlertThreshold("material_over_pct", p), 0);

    await run(`DELETE FROM projects WHERE id = ?`, p);
  },
);

test(
  "upsertAlertRule: validate metric ngoài whitelist + threshold âm bị chặn",
  { skip: !HAS_TEST_DB },
  async () => {
    const { upsertAlertRule } = await import("@/lib/alerts");
    const bad1 = await upsertAlertRule({
      projectId: null,
      metric: "khong_ton_tai",
      threshold: 1,
    });
    assert.equal(typeof bad1, "string");

    const bad2 = await upsertAlertRule({
      projectId: null,
      metric: "material_over_pct",
      threshold: -5,
    });
    assert.equal(typeof bad2, "string");

    const bad3 = await upsertAlertRule({
      projectId: null,
      metric: "due_soon_days",
      threshold: Number.NaN,
    });
    assert.equal(typeof bad3, "string");
  },
);

// ===== Bất biến quan trọng nhất của PR4: điều kiện vật tư vượt định mức với
// threshold=0 phải cho kết quả HỆT điều kiện cũ (qty_used > qty_planned). =====
test(
  "Điều kiện material_over mới (threshold=0) hệt điều kiện cũ trên dữ liệu thật",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, query, run } = await import("@/lib/db");

    const p = await insertId(`INSERT INTO projects (name) VALUES ('M47 Alerts Mat')`);
    const rows: { name: string; qtyPlanned: number; qtyUsed: number }[] = [
      { name: "Vượt rõ", qtyPlanned: 100, qtyUsed: 150 }, // vượt
      { name: "Vượt nhẹ", qtyPlanned: 100, qtyUsed: 100.01 }, // vượt biên
      { name: "Đúng bằng", qtyPlanned: 100, qtyUsed: 100 }, // không vượt (bằng, không >)
      { name: "Chưa đạt", qtyPlanned: 100, qtyUsed: 80 }, // không vượt
      { name: "Chưa có định mức", qtyPlanned: 0, qtyUsed: 50 }, // không vượt (qty_planned=0)
    ];
    const ids: number[] = [];
    for (const r of rows) {
      const id = await insertId(
        `INSERT INTO materials (project_id, name, qty_planned, qty_used) VALUES (?, ?, ?, ?)`,
        p,
        r.name,
        r.qtyPlanned,
        r.qtyUsed,
      );
      ids.push(id);
    }

    const oldCond = await query<{ id: number }>(
      `SELECT id FROM materials WHERE project_id = ? AND qty_planned > 0 AND qty_used > qty_planned`,
      p,
    );
    const newCondPct0 = await query<{ id: number }>(
      `SELECT id FROM materials WHERE project_id = ? AND qty_planned > 0 AND qty_used > qty_planned * (1 + ?::numeric / 100)`,
      p,
      0,
    );
    assert.deepEqual(
      new Set(oldCond.map((r) => r.id)),
      new Set(newCondPct0.map((r) => r.id)),
      "Điều kiện mới với threshold=0 phải cho đúng tập kết quả như điều kiện cũ",
    );
    // Đối chiếu cụ thể: đúng 2 dòng vượt (Vượt rõ + Vượt nhẹ).
    assert.equal(oldCond.length, 2);

    // Với threshold=20% — "Vượt nhẹ" (0.01% vượt) không còn bị coi là vượt, chỉ "Vượt rõ" (50%) còn.
    const newCondPct20 = await query<{ id: number }>(
      `SELECT id FROM materials WHERE project_id = ? AND qty_planned > 0 AND qty_used > qty_planned * (1 + ?::numeric / 100)`,
      p,
      20,
    );
    assert.equal(newCondPct20.length, 1);

    await run(`DELETE FROM materials WHERE id = ANY(?)`, ids);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  },
);
