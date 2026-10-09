import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Client } from "pg";
import ExcelJS from "exceljs";

// AUDIT-S16 (docs/nang-cap/AUDIT-S16-NULL-SCOPE.md) — route coi `projectId == null` là "không lọc".
// Gọi route handler THẬT với cookie phiên ký thật. Bối cảnh tái hiện: bảng `user_projects` đã có
// dòng (của pmA) nên PM org A KHÔNG có membership (pm0) nhận `getCurrentProjectId = null`; admin
// của org C không có dự án nào cũng null. Mọi ca: không trả dữ liệu org B ("BI MAT ORG B"), route
// ghi không đổi DB org B; ca đối chứng pmA (gán dự án A1) vẫn thấy dữ liệu của mình.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const HASH = `hash-s16ns-${RUN}`;
const BI_MAT = "BI MAT ORG B";
const FLOOR_B = `BIMAT-${RUN}`;
const BOQ_B = `BIMAT-BOQ-${RUN}`;
const BOQ_A = `CUAA-BOQ-${RUN}`;

type U = { id: number; passwordHash: string; orgId: number };
const ids = {
  orgA: 0,
  orgB: 0,
  orgC: 0,
  a1: 0,
  b1: 0,
  systemId: 0,
  systemCode: "",
  towerA: 0,
  sheetA: 0,
  wpA: 0,
  taskA: 0,
  towerB: 0,
  sheetB: 0,
  wpB: 0,
  wpB2: 0,
  taskB: 0,
  depB: 0,
  dcA: 0,
  dcB: [] as number[],
  drawingB: 0,
  docA: 0,
  docB: 0,
  flowB: 0,
  flowBGlobal: 0,
  auditB: 0,
  stageFrontB: 0,
  boqB: 0,
  wpNormB: 0,
  taskNormB: 0,
  materialB: 0,
  normB: 0,
  equipmentB: 0,
  punchB: 0,
  pointB: 0,
  envB: 0,
  uploadB: 0,
  // Dữ liệu legacy KHÔNG gắn dự án (project_id NULL) — null === null không được coi là "cùng dự án".
  towerN: 0,
  sheetN: 0,
  wpN: 0,
  taskN: 0,
  drawingN: 0,
  revN: 0,
  meetingN: 0,
  actionN: 0,
};
let pm0: U; // PM org A, 0 membership → dự án đang chọn = null
let pmA: U; // PM org A, gán A1 (đối chứng)
let adminC: U; // admin org C (org không có dự án) → null
let engB: U; // kỹ sư org B, được giao task B

async function taoUser(role: string, orgId: number, ten: string): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, ?, ?, ?)`,
    `${ten} ${RUN}`,
    `s16ns-${ten}-${RUN}@test.local`,
    HASH,
    role,
    orgId,
  );
  return { id, passwordHash: HASH, orgId };
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, queryOne, run, daysFromTodayISO } = await import("@/lib/db");
  const ngay = (n: number) => daysFromTodayISO(n);

  ids.orgA = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `S16NS A ${RUN}`);
  ids.orgB = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `S16NS B ${RUN}`);
  ids.orgC = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `S16NS C ${RUN}`);
  ids.a1 = await insertId(
    `INSERT INTO projects (name, code, org_id) VALUES (?, ?, ?)`,
    `S16NS A1 ${RUN}`,
    `S16NSA1${RUN}`,
    ids.orgA,
  );
  ids.b1 = await insertId(
    `INSERT INTO projects (name, code, org_id) VALUES (?, ?, ?)`,
    `${BI_MAT} du an ${RUN}`,
    `BIMATB1${RUN}`,
    ids.orgB,
  );
  pm0 = await taoUser("pm", ids.orgA, "pm0");
  pmA = await taoUser("pm", ids.orgA, "pmA");
  adminC = await taoUser("admin", ids.orgC, "adminC");
  engB = await taoUser("engineer", ids.orgB, "engB");
  // Bảng user_projects có dòng → pm0 (không được gán) KHÔNG rơi vào nhánh legacy "thấy cả org".
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pmA.id, ids.a1);

  const sys = await queryOne<{ id: number; code: string }>(
    `SELECT id, code FROM systems ORDER BY id LIMIT 1`,
  );
  assert.ok(sys, "cần ít nhất 1 hệ (systems) từ migration seed");
  ids.systemId = sys.id;
  ids.systemCode = sys.code;

  // ── Dự án A1 (đối chứng) ──
  ids.towerA = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Thap A')`, ids.a1);
  ids.sheetA = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, ?, 'Sheet A', ?, ?)`,
    ids.towerA,
    `S16NSA${RUN}`,
    `s16nsa-${RUN}`,
    ids.systemId,
  );
  ids.wpA = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date, end_date)
     VALUES (?, 'WPA', 'Nhom A', 'TA', ?, ?)`,
    ids.sheetA,
    ngay(-10),
    ngay(10),
  );
  ids.taskA = await insertId(
    `INSERT INTO tasks (package_id, code, name, boq_code, start_date, end_date, progress_percent, status)
     VALUES (?, 'TA1', ?, ?, ?, ?, 0, 'tre')`,
    ids.wpA,
    `CUA A task ${RUN}`,
    BOQ_A,
    ngay(-5),
    ngay(-1),
  );
  ids.dcA = await insertId(
    `INSERT INTO design_changes (project_id, code, title, reason) VALUES (?, ?, ?, 'ly do')`,
    ids.a1,
    `DCA-${RUN}`,
    `CUA A dc ${RUN}`,
  );
  ids.docA = await insertId(
    `INSERT INTO project_documents (title, file_name, project_id) VALUES (?, 'a.pdf', ?)`,
    `CUA A doc ${RUN}`,
    ids.a1,
  );

  // ── Dự án B1 (org B — bí mật) ──
  ids.towerB = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Thap B')`, ids.b1);
  ids.sheetB = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, ?, ?, ?, ?)`,
    ids.towerB,
    `S16NSB${RUN}`,
    `${BI_MAT} sheet`,
    `s16nsb-${RUN}`,
    ids.systemId,
  );
  ids.wpB = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ids.sheetB,
    `WPB-${RUN}`,
    `${BI_MAT} nhom`,
    FLOOR_B,
    ngay(-10),
    ngay(10),
  );
  ids.wpB2 = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ids.sheetB,
    `WPB2-${RUN}`,
    `${BI_MAT} nhom 2`,
    FLOOR_B,
    ngay(11),
    ngay(20),
  );
  ids.depB = await insertId(
    `INSERT INTO package_dependencies (predecessor_id, successor_id) VALUES (?, ?)`,
    ids.wpB,
    ids.wpB2,
  );
  ids.taskB = await insertId(
    `INSERT INTO tasks (package_id, code, name, boq_code, start_date, end_date, progress_percent,
                        status, assigned_to)
     VALUES (?, 'TB1', ?, ?, ?, ?, 0, 'tre', ?)`,
    ids.wpB,
    `${BI_MAT} task ${RUN}`,
    BOQ_B,
    ngay(-5),
    ngay(-1),
    engB.id,
  );
  await run(
    `INSERT INTO task_history (task_id, old_progress, new_progress, changed_by) VALUES (?, 0, 0.5, ?)`,
    ids.taskB,
    `${BI_MAT} nguoi sua ${RUN}`,
  );
  for (let i = 0; i < 4; i++)
    ids.dcB.push(
      await insertId(
        `INSERT INTO design_changes (project_id, code, title, reason) VALUES (?, ?, ?, 'ly do B')`,
        ids.b1,
        `DCB${i}-${RUN}`,
        `${BI_MAT} dc ${i} ${RUN}`,
      ),
    );
  ids.drawingB = await insertId(
    `INSERT INTO drawings (code, name, project_id) VALUES (?, ?, ?)`,
    `DWB-${RUN}`,
    `${BI_MAT} ban ve`,
    ids.b1,
  );
  ids.docB = await insertId(
    `INSERT INTO project_documents (title, file_name, project_id) VALUES (?, 'b.pdf', ?)`,
    `${BI_MAT} doc ${RUN}`,
    ids.b1,
  );
  ids.flowB = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name, active, org_id)
     VALUES (?, 'variation', ?, TRUE, ?)`,
    ids.b1,
    `${BI_MAT} flow ${RUN}`,
    ids.orgB,
  );
  // Flow toàn cục (project_id NULL) của org B — để inactive, tránh unique ux_flow_active toàn hệ.
  ids.flowBGlobal = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name, active, org_id)
     VALUES (NULL, 'variation', ?, FALSE, ?)`,
    `${BI_MAT} flow global ${RUN}`,
    ids.orgB,
  );
  ids.auditB = await insertId(
    `INSERT INTO audit_log (entity_type, entity_id, action, changes, project_id)
     VALUES ('contracts', 0, 'UPDATE', ?::jsonb, ?)`,
    JSON.stringify({ marker: [BI_MAT, RUN] }),
    ids.b1,
  );
  const stage = await queryOne<{ id: number }>(
    `SELECT id FROM construction_stages WHERE active = TRUE ORDER BY sort_order DESC, id LIMIT 1`,
  );
  if (stage)
    ids.stageFrontB = await insertId(
      `INSERT INTO floor_stage_fronts (floor_label, stage_id, project_id) VALUES (?, ?, ?)`,
      FLOOR_B,
      stage.id,
      ids.b1,
    );
  // Định mức vượt (cùng công thức tests/norms.test.ts: executed 10, expected 10, actual 13).
  ids.boqB = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, project_id) VALUES (?, ?, 'm', 10, ?)`,
    `BIMAT-NORM-${RUN}`,
    `${BI_MAT} boq`,
    ids.b1,
  );
  ids.wpNormB = await insertId(
    `INSERT INTO work_packages (code, name) VALUES (?, 'Nhom norm B')`,
    `WPNB-${RUN}`,
  );
  ids.taskNormB = await insertId(
    `INSERT INTO tasks (code, name, package_id, progress_percent) VALUES (?, 'Task norm B', ?, 1)`,
    `TNB-${RUN}`,
    ids.wpNormB,
  );
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    ids.boqB,
    ids.taskNormB,
  );
  ids.materialB = await insertId(
    `INSERT INTO materials (name, unit, project_id) VALUES (?, 'kg', ?)`,
    `${BI_MAT} vat tu ${RUN}`,
    ids.b1,
  );
  ids.normB = await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, material_id, qty_per_unit, unit_label)
     VALUES (?, 'material', ?, 1, 'kg')`,
    ids.boqB,
    ids.materialB,
  );
  await run(
    `INSERT INTO material_transactions (material_id, delta, qty_after, type)
     VALUES (?, -13, 13, 'xuat_cong_truong')`,
    ids.materialB,
  );
  ids.equipmentB = await insertId(
    `INSERT INTO equipment (code, name, kind, project_id) VALUES (?, ?, 'khac', ?)`,
    `EQB-${RUN}`,
    `${BI_MAT} thiet bi`,
    ids.b1,
  );
  await run(
    `INSERT INTO equipment_logs (equipment_id, action) VALUES (?, 'issue')`,
    ids.equipmentB,
  );
  ids.punchB = await insertId(
    `INSERT INTO punch_list (project_id, description, status, due_date) VALUES (?, ?, 'open', ?)`,
    ids.b1,
    `${BI_MAT} punch ${RUN}`,
    ngay(-3),
  );
  ids.pointB = await insertId(
    `INSERT INTO monitoring_points (project_id, code, kind, status) VALUES (?, ?, 'lun', 'active')`,
    ids.b1,
    `BIMAT-MP-${RUN}`,
  );
  await run(
    `INSERT INTO monitoring_readings (point_id, measured_at, value, level) VALUES (?, ?, 99, 'alarm')`,
    ids.pointB,
    ngay(-1),
  );
  ids.envB = await insertId(
    `INSERT INTO env_monitoring (project_id, measured_at, category, indicator, value, threshold, passed)
     VALUES (?, ?, 'khi_bui', ?, 99, 1, FALSE)`,
    ids.b1,
    ngay(-1),
    `BIMAT-IND-${RUN}`,
  );
  ids.uploadB = await insertId(
    `INSERT INTO system_uploads (system_id, project_id, kind, file_name) VALUES (?, ?, 'ke_hoach', ?)`,
    ids.systemId,
    ids.b1,
    `bimat-${RUN}.xlsx`,
  );

  // ── Dữ liệu legacy không gắn dự án (project_id NULL) ──
  ids.towerN = await insertId(`INSERT INTO towers (project_id, name) VALUES (NULL, ?)`, `N ${RUN}`);
  ids.sheetN = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet N', ?)`,
    ids.towerN,
    `S16NSN${RUN}`,
    `s16nsn-${RUN}`,
  );
  ids.wpN = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'WPN', 'Nhom N', ?)`,
    ids.sheetN,
    `NULLFLOOR-${RUN}`,
  );
  ids.taskN = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, status)
     VALUES (?, 'TN1', 'Task N', 1, 'hoan_thanh')`,
    ids.wpN,
  );
  ids.drawingN = await insertId(
    `INSERT INTO drawings (code, name, project_id) VALUES (?, 'Ban ve N', NULL)`,
    `DWN-${RUN}`,
  );
  ids.revN = await insertId(
    `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type, uploaded_by)
     VALUES (?, 'A', ?, 'application/pdf', ?)`,
    ids.drawingN,
    `n-${RUN}.pdf`,
    pm0.id,
  );
  ids.meetingN = await insertId(
    `INSERT INTO meetings (meeting_date, title, project_id) VALUES (?, 'Hop N', NULL)`,
    ngay(0),
  );
  ids.actionN = await insertId(
    `INSERT INTO meeting_actions (meeting_id, content) VALUES (?, 'Viec N')`,
    ids.meetingN,
  );
});

after(async () => {
  dangXuat();
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  const users = [pm0, pmA, adminC, engB].filter(Boolean).map((u) => u.id);
  const xoa = async (sql: string, ...p: unknown[]) => {
    try {
      await run(sql, ...p);
    } catch {
      /* dọn dẹp best-effort — không che kết quả test */
    }
  };
  const tasks = [ids.taskA, ids.taskB, ids.taskN, ids.taskNormB].filter(Boolean);
  await xoa(`DELETE FROM notifications WHERE user_id = ANY(?)`, users);
  await xoa(`DELETE FROM system_uploads WHERE id = ? OR uploaded_by = ANY(?)`, ids.uploadB, users);
  await xoa(`DELETE FROM meeting_actions WHERE id = ?`, ids.actionN);
  await xoa(`DELETE FROM meetings WHERE id = ?`, ids.meetingN);
  await xoa(`DELETE FROM drawing_revisions WHERE drawing_id = ANY(?)`, [
    ids.drawingN,
    ids.drawingB,
  ]);
  await xoa(`DELETE FROM drawings WHERE id = ANY(?)`, [ids.drawingN, ids.drawingB]);
  await xoa(
    `DELETE FROM design_changes WHERE id = ANY(?) OR created_by = ANY(?)`,
    [ids.dcA, ...ids.dcB],
    users,
  );
  await xoa(`DELETE FROM project_documents WHERE id = ANY(?)`, [ids.docA, ids.docB]);
  await xoa(`DELETE FROM approval_flows WHERE id = ANY(?)`, [ids.flowB, ids.flowBGlobal]);
  await xoa(`DELETE FROM audit_log WHERE id = ?`, ids.auditB);
  await xoa(`DELETE FROM floor_stage_fronts WHERE id = ?`, ids.stageFrontB);
  await xoa(`DELETE FROM material_transactions WHERE material_id = ?`, ids.materialB);
  await xoa(`DELETE FROM boq_norms WHERE id = ?`, ids.normB);
  await xoa(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, ids.boqB);
  await xoa(`DELETE FROM materials WHERE id = ?`, ids.materialB);
  await xoa(`DELETE FROM boq_items WHERE id = ?`, ids.boqB);
  await xoa(`DELETE FROM equipment_logs WHERE equipment_id = ?`, ids.equipmentB);
  await xoa(`DELETE FROM equipment WHERE id = ?`, ids.equipmentB);
  await xoa(`DELETE FROM punch_list WHERE id = ?`, ids.punchB);
  await xoa(`DELETE FROM monitoring_readings WHERE point_id = ?`, ids.pointB);
  await xoa(`DELETE FROM monitoring_points WHERE id = ?`, ids.pointB);
  await xoa(`DELETE FROM env_monitoring WHERE id = ?`, ids.envB);
  await xoa(`DELETE FROM package_dependencies WHERE id = ?`, ids.depB);
  await xoa(`DELETE FROM floor_approvals WHERE sheet_type_id = ?`, ids.sheetN);
  await xoa(`DELETE FROM task_history WHERE task_id = ANY(?)`, tasks);
  await xoa(`DELETE FROM tasks WHERE id = ANY(?)`, tasks);
  await xoa(`DELETE FROM work_packages WHERE id = ANY(?)`, [
    ids.wpA,
    ids.wpB,
    ids.wpB2,
    ids.wpN,
    ids.wpNormB,
  ]);
  await xoa(`DELETE FROM sheet_types WHERE id = ANY(?)`, [ids.sheetA, ids.sheetB, ids.sheetN]);
  await xoa(`DELETE FROM towers WHERE id = ANY(?)`, [ids.towerA, ids.towerB, ids.towerN]);
  await xoa(`DELETE FROM user_projects WHERE user_id = ANY(?)`, users);
  await xoa(`DELETE FROM users WHERE id = ANY(?)`, users);
  await xoa(`DELETE FROM projects WHERE id = ANY(?)`, [ids.a1, ids.b1]);
  await xoa(`DELETE FROM organizations WHERE id = ANY(?)`, [ids.orgA, ids.orgB, ids.orgC]);
});

beforeEach(() => dangXuat());

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost${url}`, init);
const jsonReq = (url: string, method: string, body: unknown) =>
  req(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const p = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });

/** Không còn chuỗi bí mật org B nào trong phản hồi. */
function khongLoBiMat(body: unknown, nhan: string) {
  const s = JSON.stringify(body);
  assert.ok(
    !s.includes(BI_MAT) && !s.includes(BOQ_B) && !s.includes(FLOOR_B),
    `${nhan}: lộ dữ liệu org B — ${s.slice(0, 400)}`,
  );
}

async function chupDc(id: number) {
  const { queryOne } = await import("@/lib/db");
  return queryOne(
    `SELECT title, status, decision_note, decided_by FROM design_changes WHERE id = ?`,
    id,
  );
}

test(
  "A1-AC03: GET /api/design-changes — PM 0 dự án nhận danh sách rỗng, không thấy bản ghi org B",
  S,
  async () => {
    const { GET } = await import("@/app/api/design-changes/route");
    dangNhap(pm0);
    const res = await GET(req("/api/design-changes"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: { id: number }[] };
    khongLoBiMat(body, "design-changes");
    assert.deepEqual(body.items, []);

    // Đối chứng: PM được gán A1 thấy DC của A1, không thấy org B.
    await dangNhapDuAn(pmA, ids.a1);
    const ok = (await (await GET(req("/api/design-changes"))).json()) as {
      items: { id: number }[];
    };
    assert.ok(ok.items.some((d) => d.id === ids.dcA));
    khongLoBiMat(ok, "design-changes đối chứng");
  },
);

test(
  "A1-AC03: /api/design-changes/[id] GET/PATCH/DELETE + decide — 404, DB org B không đổi",
  S,
  async () => {
    const route = await import("@/app/api/design-changes/[id]/route");
    const decide = await import("@/app/api/design-changes/[id]/decide/route");
    const [dGet, dPatch, dDecide, dDel] = ids.dcB;
    const truoc = await Promise.all(ids.dcB.map(chupDc));
    dangNhap(pm0);

    const g = await route.GET(req(`/api/design-changes/${dGet}`), p({ id: String(dGet) }));
    assert.equal(g.status, 404, "GET chi tiết");
    khongLoBiMat(await g.json(), "GET chi tiết");

    const pt = await route.PATCH(
      jsonReq(`/api/design-changes/${dPatch}`, "PATCH", { title: "ghi de", status: "assessing" }),
      p({ id: String(dPatch) }),
    );
    assert.equal(pt.status, 404, "PATCH");

    const dc = await decide.POST(
      jsonReq(`/api/design-changes/${dDecide}/decide`, "POST", { decision: "approved" }),
      p({ id: String(dDecide) }),
    );
    assert.equal(dc.status, 404, "decide");

    const dl = await route.DELETE(
      req(`/api/design-changes/${dDel}`, { method: "DELETE" }),
      p({ id: String(dDel) }),
    );
    assert.equal(dl.status, 404, "DELETE");

    assert.deepEqual(await Promise.all(ids.dcB.map(chupDc)), truoc, "DB org B phải giữ nguyên");
  },
);

test(
  "A1-AC03: POST /api/design-changes — không dự án thì 422, không tạo bản ghi mồ côi; drawingId org B → 422",
  S,
  async () => {
    const { POST } = await import("@/app/api/design-changes/route");
    const { queryOne } = await import("@/lib/db");
    dangNhap(pm0);
    const r = await POST(jsonReq("/api/design-changes", "POST", { title: "mo coi", reason: "x" }));
    assert.equal(r.status, 422);
    const n = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM design_changes WHERE created_by = ?`,
      pm0.id,
    );
    assert.equal(n?.n, 0, "không được tạo design_change project_id NULL");

    // child-ID: bản vẽ thuộc org B không gắn được vào DC của A1.
    await dangNhapDuAn(pmA, ids.a1);
    const r2 = await POST(
      jsonReq("/api/design-changes", "POST", {
        title: "gan ban ve B",
        reason: "x",
        drawingId: ids.drawingB,
      }),
    );
    assert.equal(r2.status, 422);
    const n2 = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM design_changes WHERE drawing_id = ?`,
      ids.drawingB,
    );
    assert.equal(n2?.n, 0);
  },
);

test(
  "A1-AC03: GET /api/gantt — không dự án → rỗng; đối chứng không kèm cạnh phụ thuộc org B",
  S,
  async () => {
    const { GET } = await import("@/app/api/gantt/route");
    dangNhap(pm0);
    const res = await GET(req("/api/gantt"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { bars: unknown[]; deps: { id: number }[] };
    khongLoBiMat(body, "gantt");
    assert.deepEqual(body.bars, []);
    assert.deepEqual(body.deps, []);

    await dangNhapDuAn(pmA, ids.a1);
    const ok = (await (await GET(req("/api/gantt"))).json()) as {
      bars: { id: number }[];
      deps: { id: number }[];
    };
    assert.ok(ok.bars.some((b) => b.id === ids.wpA));
    assert.ok(!ok.deps.some((d) => d.id === ids.depB), "cạnh phụ thuộc của org B không được trả");
    khongLoBiMat(ok, "gantt đối chứng");
  },
);

test("A1-AC03: GET /api/schedule-control — không dự án → rỗng đúng shape", S, async () => {
  const { GET } = await import("@/app/api/schedule-control/route");
  dangNhap(pm0);
  const res = await GET(req("/api/schedule-control"));
  assert.equal(res.status, 200);
  const body = await res.json();
  khongLoBiMat(body, "schedule-control");
  assert.deepEqual(body, { critical: [], delayed: [], delayPareto: [], groupProgress: {} });

  await dangNhapDuAn(pmA, ids.a1);
  const ok = (await (await GET(req("/api/schedule-control"))).json()) as {
    delayed: { id: number }[];
  };
  assert.ok(ok.delayed.some((t) => t.id === ids.taskA));
  khongLoBiMat(ok, "schedule-control đối chứng");
});

test(
  "A1-AC03: GET /api/resources — không dự án → rỗng; thiết bị chỉ tính dự án đang chọn",
  S,
  async () => {
    const { GET } = await import("@/app/api/resources/route");
    dangNhap(pm0);
    for (const view of ["", "equipment", "conflicts"]) {
      const res = await GET(req(`/api/resources?minTasks=2${view ? `&view=${view}` : ""}`));
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      khongLoBiMat(body, `resources ${view}`);
      assert.deepEqual(body.workload, [], `workload (${view})`);
      assert.deepEqual(body.manpower, [], `manpower (${view})`);
      if (view === "equipment") assert.deepEqual(body.equipmentUsage, []);
      if (view === "conflicts") assert.deepEqual(body.conflicts, []);
    }
    // Đối chứng: A1 không có thiết bị → không được đếm nhật ký thiết bị của org B.
    await dangNhapDuAn(pmA, ids.a1);
    const ok = (await (await GET(req("/api/resources?view=equipment"))).json()) as {
      equipmentUsage: unknown[];
    };
    assert.deepEqual(ok.equipmentUsage, []);
  },
);

test("A1-AC03: GET /api/documents-hub — không dự án → rỗng", S, async () => {
  const { GET } = await import("@/app/api/documents-hub/route");
  dangNhap(pm0);
  const res = await GET(req("/api/documents-hub"));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { documents: unknown[] };
  khongLoBiMat(body, "documents-hub");
  assert.deepEqual(body.documents, []);

  await dangNhapDuAn(pmA, ids.a1);
  const ok = (await (await GET(req("/api/documents-hub"))).json()) as {
    documents: { id: number; source: string }[];
  };
  assert.ok(ok.documents.some((d) => d.source === "project" && d.id === ids.docA));
  khongLoBiMat(ok, "documents-hub đối chứng");
});

async function docXlsx(res: Response): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
  const cells: string[] = [];
  wb.eachSheet((ws) =>
    ws.eachRow((row) => row.eachCell((c) => void cells.push(String(c.value ?? "")))),
  );
  return cells.join("|");
}

test(
  "A1-AC03: GET /api/systems/[code]/upload-template — không dự án → 404, không xuất task org B",
  S,
  async () => {
    const { GET } = await import("@/app/api/systems/[code]/upload-template/route");
    dangNhap(pm0);
    for (const kind of ["ke_hoach", "tracking"]) {
      const res = await GET(
        req(`/api/systems/${ids.systemCode}/upload-template?kind=${kind}`),
        p({ code: ids.systemCode }),
      );
      assert.equal(res.status, 404, `kind=${kind}`);
    }
    await dangNhapDuAn(pmA, ids.a1);
    const ok = await GET(
      req(`/api/systems/${ids.systemCode}/upload-template?kind=ke_hoach`),
      p({ code: ids.systemCode }),
    );
    assert.equal(ok.status, 200);
    const text = await docXlsx(ok);
    assert.ok(text.includes(BOQ_A), "đối chứng thấy task A1");
    assert.ok(!text.includes(BOQ_B), "không lộ task org B");
  },
);

test(
  "A1-AC03: POST /api/systems/[code]/upload — admin org không có dự án → 404, task org B không đổi",
  S,
  async () => {
    const { POST } = await import("@/app/api/systems/[code]/upload/route");
    const { queryOne } = await import("@/lib/db");
    const chup = () =>
      queryOne(`SELECT start_date, end_date, progress_percent FROM tasks WHERE id = ?`, ids.taskB);
    const truoc = await chup();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Kế hoạch");
    ws.addRow([
      "BOQCODE",
      "Sheet",
      "Nhóm",
      "Mã",
      "Tên công việc",
      "Ngày bắt đầu KH",
      "Ngày kết thúc KH",
    ]);
    ws.addRow([BOQ_B, "x", "x", "TB1", "x", "2020-01-01", "2020-01-02"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const fd = new FormData();
    fd.append(
      "file",
      new File([buf], "ke-hoach.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    dangNhap(adminC);
    const res = await POST(
      req(`/api/systems/${ids.systemCode}/upload?kind=ke_hoach`, { method: "POST", body: fd }),
      p({ code: ids.systemCode }),
    );
    assert.equal(res.status, 404);
    assert.deepEqual(await chup(), truoc, "ngày/tiến độ task org B phải giữ nguyên");
    const n = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM system_uploads WHERE uploaded_by = ?`,
      adminC.id,
    );
    assert.equal(n?.n, 0, "không ghi lịch sử upload");
  },
);

test(
  "A1-AC03: GET /api/admin/approval-flows — không dự án → rỗng; đối chứng không thấy flow org B",
  S,
  async () => {
    const { GET } = await import("@/app/api/admin/approval-flows/route");
    dangNhap(pm0);
    const res = await GET();
    assert.equal(res.status, 200);
    const body = (await res.json()) as { flows: unknown[] };
    khongLoBiMat(body, "approval-flows");
    assert.deepEqual(body.flows, []);

    await dangNhapDuAn(pmA, ids.a1);
    const ok = await (await GET()).json();
    khongLoBiMat(ok, "approval-flows đối chứng (kể cả flow toàn cục của org B)");
  },
);

test(
  "A1-AC03: GET /api/admin/audit-log (+export) — admin org không có dự án → rỗng/404, không toàn hệ",
  S,
  async () => {
    const { GET } = await import("@/app/api/admin/audit-log/route");
    const ex = await import("@/app/api/admin/audit-log/export/route");
    dangNhap(adminC);
    const res = await GET(req("/api/admin/audit-log"));
    assert.equal(res.status, 200);
    const body = await res.json();
    khongLoBiMat(body, "audit-log");
    assert.deepEqual(body, { rows: [], total: 0 });

    const exRes = await ex.GET(req("/api/admin/audit-log/export"));
    assert.equal(exRes.status, 404);
  },
);

test(
  "A1-AC03: GET /api/claims/eot-suggestion — không dự án → 0, không cộng số ngày chờ toàn hệ",
  S,
  async () => {
    const { GET } = await import("@/app/api/claims/eot-suggestion/route");
    dangNhap(pm0);
    const res = await GET();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { suggestedDays: 0, waitingFloors: 0 });
  },
);

test("A1-AC03: GET /api/norms/over — không dự án → rỗng", S, async () => {
  const { GET } = await import("@/app/api/norms/over/route");
  dangNhap(pm0);
  const res = await GET(req("/api/norms/over"));
  assert.equal(res.status, 200);
  const body = await res.json();
  khongLoBiMat(body, "norms/over");
  assert.deepEqual(body, { items: [] });
});

test(
  "A1-AC03: GET /api/diaries/[date] — không dự án → prefill rỗng, không gộp hoạt động org B",
  S,
  async () => {
    const { GET } = await import("@/app/api/diaries/[date]/route");
    const { queryOne } = await import("@/lib/db");
    const homNay = await queryOne<{ d: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS d`,
    );
    dangNhap(pm0);
    const res = await GET(req(`/api/diaries/${homNay!.d}`), p({ date: homNay!.d }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { prefill: unknown; diary: unknown };
    khongLoBiMat(body, "diaries prefill");
    assert.equal(body.diary, null);
    assert.deepEqual(body.prefill, { workDone: "", updatedBy: [], photos: [] });
  },
);

test(
  "A1-AC03: GET /api/notifications (đối chứng có dự án) — không sinh cảnh báo từ dữ liệu org B",
  S,
  async () => {
    const { GET } = await import("@/app/api/notifications/route");
    await dangNhapDuAn(pmA, ids.a1);
    const res = await GET(new Request("http://localhost/api/notifications?limit=1000"));
    assert.equal(res.status, 200);
    const body = await res.json();
    const s = JSON.stringify(body);
    assert.ok(
      !s.includes(BI_MAT) && !s.includes(`BIMAT-MP-${RUN}`) && !s.includes(`BIMAT-IND-${RUN}`),
      s.slice(0, 600),
    );
  },
);

test("A1-AC03: GET /api/system-uploads/[id]/file — không dự án → 404", S, async () => {
  const { GET } = await import("@/app/api/system-uploads/[id]/file/route");
  dangNhap(pm0);
  const res = await GET(new Request("http://localhost"), p({ id: String(ids.uploadB) }));
  assert.equal(res.status, 404);
});

test(
  "A1-AC03: dữ liệu legacy project_id NULL — null === null không mở quyền (revision, việc sau họp, nghiệm thu tầng)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const rev = await import("@/app/api/drawings/revisions/[id]/route");
    const revFile = await import("@/app/api/drawings/revisions/[id]/file/route");
    const withdraw = await import("@/app/api/drawings/revisions/[id]/withdraw/route");
    const action = await import("@/app/api/meetings/[id]/actions/[aid]/route");
    const approvals = await import("@/app/api/approvals/route");
    const chup = async () => ({
      rev: await queryOne(`SELECT status FROM drawing_revisions WHERE id = ?`, ids.revN),
      action: await queryOne(
        `SELECT status, content FROM meeting_actions WHERE id = ?`,
        ids.actionN,
      ),
      task: await queryOne(`SELECT status FROM tasks WHERE id = ?`, ids.taskN),
      fa: await queryOne(
        `SELECT COUNT(*)::int AS n FROM floor_approvals WHERE sheet_type_id = ?`,
        ids.sheetN,
      ),
    });
    const truoc = await chup();
    dangNhap(pm0);

    const r1 = await rev.PATCH(
      jsonReq(`/api/drawings/revisions/${ids.revN}`, "PATCH", { status: "approved" }),
      p({ id: String(ids.revN) }),
    );
    assert.equal(r1.status, 404, "PATCH revision");
    const r2 = await revFile.GET(
      req(`/api/drawings/revisions/${ids.revN}/file`),
      p({ id: String(ids.revN) }),
    );
    assert.equal(r2.status, 404, "GET file revision");
    assert.deepEqual(await r2.json(), { error: "Không tìm thấy revision" });
    const r3 = await withdraw.POST(
      req(`/api/drawings/revisions/${ids.revN}/withdraw`, { method: "POST" }),
      p({ id: String(ids.revN) }),
    );
    assert.equal(r3.status, 404, "withdraw revision");
    const r4 = await action.PATCH(
      jsonReq(`/api/meetings/${ids.meetingN}/actions/${ids.actionN}`, "PATCH", { status: "done" }),
      p({ id: String(ids.meetingN), aid: String(ids.actionN) }),
    );
    assert.equal(r4.status, 404, "PATCH việc sau họp");
    const r5 = await action.DELETE(
      req(`/api/meetings/${ids.meetingN}/actions/${ids.actionN}`, { method: "DELETE" }),
      p({ id: String(ids.meetingN), aid: String(ids.actionN) }),
    );
    assert.equal(r5.status, 404, "DELETE việc sau họp");
    const r6 = await approvals.POST(
      jsonReq("/api/approvals", "POST", {
        sheetTypeId: ids.sheetN,
        floorLabel: `NULLFLOOR-${RUN}`,
      }),
    );
    assert.equal(r6.status, 404, "nghiệm thu tầng");

    assert.deepEqual(await chup(), truoc, "DB legacy phải giữ nguyên");
  },
);

/** Ghi lại mọi câu SQL gửi tới Postgres trong lúc chạy `fn`. */
async function ghiSql<T>(fn: () => Promise<T>): Promise<{ ket: T; sql: string[] }> {
  const proto = Client.prototype as unknown as { query: (...a: unknown[]) => unknown };
  const goc = proto.query;
  const sql: string[] = [];
  proto.query = function (this: unknown, ...a: unknown[]) {
    const q = a[0];
    sql.push(typeof q === "string" ? q : String((q as { text?: string })?.text ?? ""));
    return goc.apply(this, a);
  };
  try {
    return { ket: await fn(), sql };
  } finally {
    proto.query = goc;
  }
}

test(
  "A1-AC03: export Excel + báo cáo mặt bằng lấy tên/mã ĐÚNG dự án đang chọn, không 'dự án đầu tiên của DB'",
  S,
  async () => {
    const excel = await import("@/app/api/export/excel/route");
    const report = await import("@/app/api/work-fronts/report/route");
    await dangNhapDuAn(pmA, ids.a1);
    const { ket, sql } = await ghiSql(async () => {
      const x = await excel.GET(req("/api/export/excel"));
      const r = await report.GET();
      return { x, r };
    });
    assert.equal(ket.x.status, 200);
    assert.equal(ket.r.status, 200);
    assert.ok(
      (ket.x.headers.get("content-disposition") ?? "").includes(`S16NSA1${RUN}`),
      "tên file theo mã dự án đang chọn",
    );
    assert.deepEqual(
      sql.filter((q) => /FROM projects ORDER BY id LIMIT 1/.test(q)),
      [],
      "không đọc dự án đầu tiên của DB (có thể thuộc org khác)",
    );
  },
);
