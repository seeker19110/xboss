import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Test cho app/api/engineering/cad/diff/route.ts và app/api/engineering/cad/blocks/route.ts
// (M65) — CHƯA có test nào trước file này. Cả hai route chỉ gọi getCurrentUser() (next/headers)
// nên KHÔNG gọi handler trực tiếp ngoài request scope thật (xem quy ước ở
// tests/cad-block-proposal-withdraw.test.ts) — phủ qua route-source + lib mà route uỷ quyền.
//
// (1) Route-source: force-dynamic, 401/403 đúng quyền (CAN.viewEngineeringGraph cho GET/POST
//     blocks + GET diff, CAN.manageEngineeringTwin cho POST diff), 422 khi thiếu entities, 400
//     khi chưa chọn dự án, lưu phiên diff KHÔNG được làm hỏng response khi DB lỗi (non-blocking).
// (2) Integration (TEST_DATABASE_URL, tự skip): listCadDiffSessions/saveCadDiffSession và
//     listCadBlockCatalogs — round-trip qua role superuser (đúng cách phần lớn test khác trong
//     repo chạy, xem tests/setup.ts).
// (3) RLS — PHÁT HIỆN NGHI VẤN LỖI SẢN PHẨM (báo cáo, KHÔNG sửa code sản phẩm ở đây):
//     `engineering_cad_diff_sessions` và `engineering_cad_block_catalogs` (migrations/0099) bật
//     FORCE ROW LEVEL SECURITY với policy KHÔNG có nhánh "GUC rỗng thì cho qua" (khác 11 bảng của
//     migrations/0069_rls.sql — xem chú thích PR2 "khoá cửa" ở đó). Nhưng `listCadDiffSessions`,
//     `saveCadDiffSession`, `listCadBlockCatalogs` (lib/ky-thuat/engineering-cad-skills.ts) gọi
//     `query`/`queryOne` TRỰC TIẾP, KHÔNG bọc `withProjectScope` như lib/ky-thuat/cad/boq-map.ts
//     đã làm đúng (xem comment "truy vấn ở đây bọc withProjectScope: thiếu GUC là policy chặn
//     sạch" tại đầu file đó). Trên production, DATABASE_URL trỏ role `xboss_app`
//     (NOBYPASSRLS, migrations/0069) — nghĩa là mọi lời gọi 3 hàm trên đều chạy NGOÀI transaction
//     có set `app.project_id`, nên `current_setting('app.project_id', true)` luôn rỗng → policy
//     luôn CHẶN: GET /diff và GET /blocks LUÔN trả mảng rỗng dù DB có dữ liệu, và INSERT của
//     saveCadDiffSession LUÔN thất bại (bị route POST /diff nuốt lỗi ở khối try/catch
//     "Non-blocking nếu DB save lỗi" nên không lộ ra ngoài — chỉ lặng lẽ không lưu). Test dưới
//     tái hiện đúng kịch bản (kết nối bằng role `xboss_app`, KHÔNG set GUC) để chứng minh —
//     test PASS vì đây là hành vi RLS THẬT của Postgres (không phải bug ở Postgres), nhưng
//     đúng là hệ quả của việc 2 hàm ghi/đọc kia thiếu withProjectScope.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const S = { skip: !HAS_TEST_DB };

function nguon(...phan: string[]): string {
  return readFileSync(join(process.cwd(), "app", "api", "engineering", "cad", ...phan, "route.ts"), "utf8");
}

// ===== (1) Route-source =====

test("route diff: GET force-dynamic + viewEngineeringGraph, POST manageEngineeringTwin + 422 khi thiếu entities", () => {
  const src = nguon("diff");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.viewEngineeringGraph\(user\.role\)/);
  assert.match(src, /CAN\.manageEngineeringTwin\(user\.role\)/);
  assert.match(src, /status: 403/);
  assert.match(src, /status: 422/);
  assert.match(src, /!baseEntities \|\| !compareEntities/);
  assert.match(src, /Chưa chọn dự án/);
  assert.match(src, /status: 400/);

  // Đúng thứ tự: auth → quyền → chọn dự án → tính diff, cho cả 2 hàm GET/POST.
  const iGetFn = src.indexOf("export async function GET");
  const iPostFn = src.indexOf("export async function POST");
  const doanGet = src.slice(iGetFn, iPostFn);
  const doanPost = src.slice(iPostFn);
  for (const doan of [doanGet, doanPost]) {
    const iUser = doan.indexOf("getCurrentUser()");
    const i401 = doan.indexOf("status: 401");
    const i403 = doan.indexOf("status: 403");
    const iProject = doan.indexOf("getCurrentProjectId(user)");
    assert.ok(iUser >= 0 && i401 >= 0 && i403 >= 0 && iProject >= 0);
    assert.ok(iUser < i401 && i401 < i403 && i403 < iProject);
  }

  // Lưu phiên diff KHÔNG được làm hỏng response chính khi DB lỗi (non-blocking theo comment
  // "B2 Fix" trong route) — try/catch bọc quanh saveCadDiffSession, không throw ra ngoài.
  const iSave = doanPost.indexOf("saveCadDiffSession(");
  const iCatchSau = doanPost.indexOf("catch {", iSave);
  assert.ok(iSave >= 0 && iCatchSau >= 0, "POST /diff phải nuốt lỗi lưu phiên, không để hỏng response");
});

test("route blocks: GET force-dynamic + viewEngineeringGraph + 400 chưa chọn dự án", () => {
  const src = nguon("blocks");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.viewEngineeringGraph\(user\.role\)/);
  assert.match(src, /status: 403/);
  assert.match(src, /Chưa chọn dự án/);
  assert.match(src, /status: 400/);
  assert.match(src, /listCadBlockCatalogs\(projectId\)/);

  const iUser = src.indexOf("getCurrentUser()");
  const i401 = src.indexOf("status: 401");
  const i403 = src.indexOf("status: 403");
  const iProject = src.indexOf("getCurrentProjectId(user)");
  const iListCall = src.indexOf("listCadBlockCatalogs(");
  assert.ok(iUser < i401 && i401 < i403 && i403 < iProject && iProject < iListCall);
});

// ===== (2) Integration (role superuser — như phần lớn test khác của repo) =====

let U = 0;
let DU_AN_A = 0;
let DU_AN_B = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  const { query, insertId, run } = await import("@/lib/db");
  const rows = await query<{ id: number }>(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ('CadDiffBlocksTest','cad-diff-blocks-route-test@x.vn','engineer','x')
     ON CONFLICT (email) DO UPDATE SET role = 'engineer' RETURNING id`,
  );
  U = rows[0].id;
  DU_AN_A = await insertId(
    `INSERT INTO projects (name, code) VALUES ('Dự án test diff/blocks A', 'CDB-TEST-DA1')`,
  );
  DU_AN_B = await insertId(
    `INSERT INTO projects (name, code) VALUES ('Dự án test diff/blocks B', 'CDB-TEST-DA2')`,
  );
  await run(
    `DELETE FROM engineering_cad_diff_sessions WHERE project_id IN (?, ?)`,
    DU_AN_A,
    DU_AN_B,
  );
  await run(
    `DELETE FROM engineering_cad_block_catalogs WHERE project_id IN (?, ?)`,
    DU_AN_A,
    DU_AN_B,
  );
});

after(async () => {
  if (!HAS_TEST_DB || !U) return;
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM engineering_cad_diff_sessions WHERE project_id IN (?, ?)`,
    DU_AN_A,
    DU_AN_B,
  );
  await run(
    `DELETE FROM engineering_cad_block_catalogs WHERE project_id IN (?, ?)`,
    DU_AN_A,
    DU_AN_B,
  );
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, DU_AN_A, DU_AN_B);
  await run(`DELETE FROM users WHERE id = ?`, U);
});

test(
  "computeCadVectorDiff → saveCadDiffSession → listCadDiffSessions: round-trip đúng dự án, mới nhất trước",
  S,
  async () => {
    const { computeCadVectorDiff, saveCadDiffSession, listCadDiffSessions } = await import(
      "@/lib/ky-thuat/engineering-cad-skills"
    );

    const base = [
      {
        id: "e1",
        type: "line" as const,
        layer: "01_ONG_GIO_CAP",
        coordinates: { start: [0, 0, 0] as [number, number, number] },
      },
    ];
    const compare = [
      {
        id: "e2",
        type: "line" as const,
        layer: "01_ONG_GIO_CAP",
        coordinates: { start: [500, 0, 0] as [number, number, number] },
      },
    ];
    const diff = computeCadVectorDiff(base, compare, 5);
    assert.ok(diff.summary.added >= 1 || diff.summary.modified >= 1);

    const saved1 = await saveCadDiffSession(DU_AN_A, null, null, diff, U);
    assert.ok(saved1.id);
    // Chờ 1 nhịp nhỏ để created_at của 2 dòng khác nhau, đảm bảo thứ tự ORDER BY ổn định.
    await new Promise((r) => setTimeout(r, 5));
    const saved2 = await saveCadDiffSession(DU_AN_A, null, null, diff, U);

    const dsA = await listCadDiffSessions(DU_AN_A);
    assert.ok(dsA.length >= 2);
    assert.equal((dsA[0] as { id: string }).id, saved2.id, "mới nhất phải đứng đầu (created_at DESC)");

    // Dự án khác không thấy phiên của dự án A.
    const dsB = await listCadDiffSessions(DU_AN_B);
    assert.ok(!dsB.some((d) => (d as { id: string }).id === saved1.id));
    assert.ok(!dsB.some((d) => (d as { id: string }).id === saved2.id));
  },
);

test("listCadBlockCatalogs: lọc đúng dự án, sắp theo block_name ASC", S, async () => {
  const { insertId } = await import("@/lib/db");
  await insertId(
    `INSERT INTO engineering_cad_block_catalogs
       (project_id, block_name, discipline, category)
     VALUES (?, 'Z-VALVE', 'plumbing', 'valve')`,
    DU_AN_A,
  );
  await insertId(
    `INSERT INTO engineering_cad_block_catalogs
       (project_id, block_name, discipline, category)
     VALUES (?, 'A-DUCT', 'hvac', 'duct')`,
    DU_AN_A,
  );
  await insertId(
    `INSERT INTO engineering_cad_block_catalogs
       (project_id, block_name, discipline, category)
     VALUES (?, 'B-KHAC-DU-AN', 'electrical', 'panel')`,
    DU_AN_B,
  );

  const { listCadBlockCatalogs } = await import("@/lib/ky-thuat/engineering-cad-skills");
  const ds = await listCadBlockCatalogs(DU_AN_A);
  assert.deepEqual(
    ds.map((d) => d.block_name),
    ["A-DUCT", "Z-VALVE"],
  );
  assert.ok(ds.every((d) => d.project_id === DU_AN_A));
});

// ===== (3) RLS — chứng minh nghi vấn thiếu withProjectScope (xem ghi chú đầu file) =====

test(
  "RLS engineering_cad_diff_sessions/engineering_cad_block_catalogs: role ứng dụng KHÔNG set " +
    "GUC app.project_id (đúng như cách listCadDiffSessions/saveCadDiffSession/listCadBlockCatalogs " +
    "hiện gọi) → SELECT trả rỗng và INSERT bị chặn, dù có dữ liệu thật trong bảng",
  S,
  async () => {
    const { run, insertId } = await import("@/lib/db");
    await run(`DELETE FROM engineering_cad_block_catalogs WHERE block_name = 'RLS-PROBE-BLOCK'`);
    await insertId(
      `INSERT INTO engineering_cad_block_catalogs (project_id, block_name, discipline, category)
       VALUES (?, 'RLS-PROBE-BLOCK', 'hvac', 'duct')`,
      DU_AN_A,
    );
    const { computeCadVectorDiff, saveCadDiffSession } = await import(
      "@/lib/ky-thuat/engineering-cad-skills"
    );
    const diffRong = computeCadVectorDiff([], [], 5);
    await saveCadDiffSession(DU_AN_A, null, null, diffRong, U); // ghi bằng superuser (bypass RLS)

    const u = new URL(process.env.TEST_DATABASE_URL as string);
    u.username = "xboss_app";
    u.password = "CHANGE_ME_ON_DEPLOY";
    const pool = new Pool({ connectionString: u.toString(), max: 2 });
    try {
      const client = await pool.connect();
      try {
        // KHÔNG set_config('app.project_id', ...) — đúng như listCadDiffSessions/
        // listCadBlockCatalogs gọi `query()` trực tiếp ngoài withProjectScope trong sản phẩm.
        const catalogRows = await client.query(
          `SELECT 1 FROM engineering_cad_block_catalogs WHERE block_name = 'RLS-PROBE-BLOCK'`,
        );
        assert.equal(
          catalogRows.rowCount,
          0,
          "policy KHÔNG có nhánh 'GUC rỗng thì cho qua' — SELECT thiếu GUC phải trả RỖNG dù có dữ liệu",
        );

        const diffRows = await client.query(
          `SELECT 1 FROM engineering_cad_diff_sessions WHERE project_id = $1`,
          [DU_AN_A],
        );
        assert.equal(diffRows.rowCount, 0, "GET /diff qua listCadDiffSessions sẽ trả mảng rỗng oan");

        await assert.rejects(
          () =>
            client.query(
              `INSERT INTO engineering_cad_block_catalogs (project_id, block_name, discipline, category)
               VALUES ($1, 'RLS-PROBE-INSERT-BI-CHAN', 'hvac', 'duct')`,
              [DU_AN_A],
            ),
          /row-level security/i,
          "INSERT thiếu GUC (đúng như saveCadDiffSession/listCadBlockCatalogs gọi) phải bị RLS chặn",
        );
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }

    await run(`DELETE FROM engineering_cad_block_catalogs WHERE block_name = 'RLS-PROBE-BLOCK'`);
  },
);
