import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Test cho app/api/engineering/cad/dashboard/route.ts (M99 PR6 + M100 PR2) — CHƯA có test nào
// trước file này. Route chỉ gọi getCurrentUser() (next/headers) nên KHÔNG gọi handler trực tiếp
// ngoài request scope thật (xem quy ước ở tests/cad-block-proposal-withdraw.test.ts và
// tests/permissions.test.ts) — phủ ở 2 lớp:
// (1) Route-source: force-dynamic, 401/403 đúng thứ tự trước khi đọc dữ liệu, projectId null
//     → lichSu=[] (không throw khi user chưa chọn dự án), choPhatHanh = isAdminOrPm.
// (2) Integration (TEST_DATABASE_URL, tự skip): layLichSuPluginUpload + layTomTatBlockLib dựng
//     đúng dữ liệu mà route sẽ trả — tái hiện đúng phép hợp (composition) của GET.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const S = { skip: !HAS_TEST_DB };

function nguon(): string {
  return readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "dashboard", "route.ts"),
    "utf8",
  );
}

// ===== (1) Route-source =====

test("route dashboard: force-dynamic, 401 trước 403, CAN.viewEngineeringGraph", () => {
  const src = nguon();
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.viewEngineeringGraph\(user\.role\)/);
  assert.match(src, /status: 403/);

  const iUser = src.indexOf("const user = await getCurrentUser()");
  const i401 = src.indexOf("status: 401");
  const i403 = src.indexOf("status: 403");
  const iProjectId = src.indexOf("getCurrentProjectId(user)");
  assert.ok(iUser >= 0 && i401 >= 0 && i403 >= 0 && iProjectId >= 0);
  assert.ok(
    iUser < i401 && i401 < i403 && i403 < iProjectId,
    "phải xác thực rồi kiểm quyền TRƯỚC khi đọc bất kỳ dữ liệu dự án nào",
  );
});

test("route dashboard: chưa chọn dự án → lịch sử rỗng (không throw), blockLib.choPhatHanh theo isAdminOrPm", () => {
  const src = nguon();
  assert.match(src, /projectId == null \? \[\] : await layLichSuPluginUpload\(projectId\)/);
  assert.match(src, /choPhatHanh: isAdminOrPm\(user\.role\)/);
  // Thư viện block là tài nguyên TOÀN CỤC — không lọc theo projectId như lịch sử upload.
  assert.match(src, /await layTomTatBlockLib\(\)/);
  assert.match(src, /const pluginUrl = process\.env\.XBOSS_PLUGIN_URL \|\| null/);
});

// ===== (2) Integration =====

let U = 0;
let DU_AN = 0;
let DRAWING = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  const { query, insertId, run } = await import("@/lib/db");
  const rows = await query<{ id: number }>(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ('CadDashboardTest','cad-dashboard-route-test@x.vn','engineer','x')
     ON CONFLICT (email) DO UPDATE SET role = 'engineer' RETURNING id`,
  );
  U = rows[0].id;

  DU_AN = await insertId(
    `INSERT INTO projects (name, code) VALUES ('Dự án test dashboard CAD', 'CDR-TEST-DA')`,
  );
  await run(`DELETE FROM drawings WHERE code = 'CDR-TEST-001'`);
  DRAWING = await insertId(
    `INSERT INTO drawings (code, name, kind, project_id, created_by)
     VALUES ('CDR-TEST-001','Bản vẽ test dashboard route','shop',?,?)`,
    DU_AN,
    U,
  );
});

after(async () => {
  if (!HAS_TEST_DB || !U) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM drawing_revisions WHERE drawing_id = ?`, DRAWING);
  await run(`DELETE FROM drawings WHERE id = ?`, DRAWING);
  await run(`DELETE FROM projects WHERE id = ?`, DU_AN);
  await run(`DELETE FROM users WHERE id = ?`, U);
});

test(
  "layLichSuPluginUpload: chỉ lấy revision source_tool='plugin' của ĐÚNG dự án, kèm kiểm định + KL bóc",
  S,
  async () => {
    const { run, insertId } = await import("@/lib/db");
    // Revision KHÔNG phải từ plugin (upload thường) — phải bị loại khỏi lịch sử plugin.
    await insertId(
      `INSERT INTO drawing_revisions
         (drawing_id, rev, file_name, mime_type, status, uploaded_by, source_tool, created_at)
       VALUES (?, 'WEB', 'x.dxf', 'application/dxf', 'submitted', ?, 'web', NOW())`,
      DRAWING,
      U,
    );
    // Revision từ plugin, kèm báo cáo kiểm định + takeoff.
    const report = {
      serverValidation: { ok: true, errors: [], warnings: ["Thiếu ghi chú"] },
      takeoff: {
        lines: [{ group: "HVAC", vung: "Tầng 2", donVi: "m", khoiLuong: 8 }],
      },
    };
    await insertId(
      `INSERT INTO drawing_revisions
         (drawing_id, rev, file_name, mime_type, status, uploaded_by, source_tool, standardize_report, created_at)
       VALUES (?, 'A', 'y.dxf', 'application/dxf', 'submitted', ?, 'plugin', ?::jsonb, NOW())`,
      DRAWING,
      U,
      JSON.stringify(report),
    );

    const { layLichSuPluginUpload } = await import("@/lib/ky-thuat/cad/dashboard");
    const ds = await layLichSuPluginUpload(DU_AN);
    assert.equal(ds.length, 1, "chỉ đúng 1 dòng nguồn plugin, bỏ qua nguồn web");
    assert.equal(ds[0].rev, "A");
    assert.equal(ds[0].drawingCode, "CDR-TEST-001");
    assert.equal(ds[0].kiemDinh?.ok, true);
    assert.equal(ds[0].kiemDinh?.soCanhBao, 1);
    assert.equal(ds[0].klBoc?.tongDong, 1);
    assert.deepEqual(ds[0].klBoc?.theoHe, [{ nhan: "HVAC (m)", khoiLuong: 8 }]);

    // Dự án khác không có gì → mảng rỗng.
    const dsKhac = await layLichSuPluginUpload(DU_AN + 1_000_000);
    assert.deepEqual(dsKhac, []);
    await run(`DELETE FROM drawing_revisions WHERE drawing_id = ?`, DRAWING);
  },
);

test(
  "layTomTatBlockLib: bản hiện hành = bản mới nhất (append-only), thư viện trống → null",
  S,
  async () => {
    const { layTomTatBlockLib } = await import("@/lib/ky-thuat/cad/dashboard");
    const truoc = await layTomTatBlockLib(1000);
    // Trường hợp thư viện đã có bản phát hành từ test khác chạy trước — chỉ kiểm bất biến cấu trúc,
    // không giả định trạng thái tuyệt đối của bảng dùng chung.
    if (truoc.hienHanh) {
      assert.equal(
        truoc.hienHanh,
        truoc.lichSu[0],
        "bản hiện hành phải là phần tử đầu của lịch sử",
      );
    } else {
      assert.deepEqual(truoc.lichSu, []);
    }
  },
);
