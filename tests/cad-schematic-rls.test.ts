import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M117 PR1 — RLS của bảng `cad_schematic_graphs` (migration 0146).
// Test tích hợp (TEST_DATABASE_URL, tự skip): policy 2 nhánh nghiêm ngặt phải cách ly dự án ngay
// từ khi bảng ra đời, TRƯỚC khi PR2 mở đường ghi qua API — bảng có RLS mà chưa ai kiểm bằng role
// thật là đúng loại lỗi "tưởng đã bảo vệ" mà ADR-0005 cảnh báo.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";

const S = { skip: !HAS_TEST_DB };

let duAnA = 0;
let duAnB = 0;
let nguoiId = 0;

const GRAPH_MAU = JSON.stringify({ version: 1, nodes: [], edges: [] });

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  duAnA = await insertId(`INSERT INTO projects (name) VALUES ('Schematic RLS A')`);
  duAnB = await insertId(`INSERT INTO projects (name) VALUES ('Schematic RLS B')`);
  nguoiId = await insertId(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ('Schematic RLS', ?, 'pm', 'x')`,
    `schematic-rls-${Date.now()}@x.vn`,
  );
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM cad_schematic_graphs WHERE project_id IN (?, ?)`, duAnA, duAnB);
  await run(`DELETE FROM users WHERE id = ?`, nguoiId);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, duAnA, duAnB);
});

test("RLS cad_schematic_graphs: role ứng dụng chỉ thấy/ghi được dự án trong GUC", S, async () => {
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO cad_schematic_graphs (project_id, system_id, file_path, graph, created_by)
     VALUES (?, 'CHW', 'a.dxf', ?::jsonb, ?)`,
    duAnA,
    GRAPH_MAU,
    nguoiId,
  );
  await run(
    `INSERT INTO cad_schematic_graphs (project_id, system_id, file_path, graph, created_by)
     VALUES (?, 'CHW', 'b.dxf', ?::jsonb, ?)`,
    duAnB,
    GRAPH_MAU,
    nguoiId,
  );

  // TEST_DATABASE_URL trỏ role owner/superuser (chạy migration) — superuser BỎ QUA RLS, nên phải
  // mở pool riêng bằng `xboss_app` (0069 tạo, NOBYPASSRLS) mới kiểm được RLS thật.
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  const pool = new Pool({ connectionString: u.toString(), max: 2 });
  try {
    const chay = async <T>(guc: string, fn: (c: import("pg").PoolClient) => Promise<T>) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT set_config('app.project_id', $1, true)", [guc]);
        return await fn(c);
      } finally {
        await c.query("ROLLBACK").catch(() => {});
        c.release();
      }
    };

    const thayA = await chay(String(duAnA), (c) =>
      c.query(`SELECT project_id, file_path FROM cad_schematic_graphs`),
    );
    assert.equal(thayA.rowCount, 1, "GUC dự án A chỉ thấy graph của A");
    assert.equal(thayA.rows[0].file_path, "a.dxf");

    // GUC RỖNG (đường đọc quên bọc withProjectScope) → policy nghiêm ngặt trả RỖNG, không lộ.
    const thayRong = await chay("", (c) => c.query(`SELECT 1 FROM cad_schematic_graphs`));
    assert.equal(thayRong.rowCount, 0, "thiếu GUC phải trả rỗng, không phải trả hết");

    // WITH CHECK: đang ở ngữ cảnh dự án A mà ghi dòng dự án B → bị chặn.
    await assert.rejects(
      () =>
        chay(String(duAnA), (c) =>
          c.query(
            `INSERT INTO cad_schematic_graphs (project_id, system_id, file_path, graph, created_by)
             VALUES ($1, 'CHW', 'lau.dxf', $2::jsonb, $3)`,
            [duAnB, GRAPH_MAU, nguoiId],
          ),
        ),
      /row-level security/i,
    );
  } finally {
    await pool.end();
  }
});
