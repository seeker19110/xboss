import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// AUDIT-S16 — đóng các nợ còn lại ghi ở docs/nang-cap/AUDIT-S16-NULL-SCOPE.md §"Nợ" (2, 3, 5, 6, 8)
// + unique index trường tuỳ biến. Mỗi ca đỏ trên code trước bản vá:
//   (2) PATCH /api/nav-settings bật mục toàn cục → thông báo mọi PM toàn hệ (cả org khác).
//   (3) /api/admin/audit-log hiện bản ghi toàn cục (project_id NULL) do người org khác tạo.
//   (5) ux_flow_active / custom_field_defs_scope_key_uidx toàn hệ → org B chặn org A tạo cùng loại.
//   (6) allocationOverNorm quét định mức mọi dự án → vật tư vượt ở dự án khác bật cảnh báo.
//   (8) system-uploads: bản ghi legacy NULL của org khác đọc được; khác dự án → 403 lộ id.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const HASH = `hash-s16ncl-${RUN}`;

type U = { id: number; passwordHash: string; orgId: number };
const ids = { orgA: 0, orgB: 0, a1: 0, a2: 0, b1: 0 };
let adminA: U;
let pmA: U;
let pmB: U;
let userB: U;
const donDep: Array<() => Promise<unknown>> = [];

async function taoUser(role: string, orgId: number, ten: string): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, ?, ?, ?)`,
    `${ten} ${RUN}`,
    `s16ncl-${ten}-${RUN}@test.local`,
    HASH,
    role,
    orgId,
  );
  return { id, passwordHash: HASH, orgId };
}

function req(path: string, body?: unknown, method = "GET"): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  ids.orgA = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `S16NCL A ${RUN}`);
  ids.orgB = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `S16NCL B ${RUN}`);
  const duAn = (ten: string, org: number) =>
    insertId(
      `INSERT INTO projects (name, code, org_id) VALUES (?, ?, ?)`,
      `S16NCL ${ten} ${RUN}`,
      `NCL${ten}${RUN}`,
      org,
    );
  ids.a1 = await duAn("A1", ids.orgA);
  ids.a2 = await duAn("A2", ids.orgA);
  ids.b1 = await duAn("B1", ids.orgB);
  adminA = await taoUser("admin", ids.orgA, "adminA");
  pmA = await taoUser("pm", ids.orgA, "pmA");
  pmB = await taoUser("pm", ids.orgB, "pmB");
  userB = await taoUser("engineer", ids.orgB, "userB");
});

after(async () => {
  if (!HAS_TEST_DB) return;
  dangXuat();
  for (const f of donDep.reverse()) await f().catch(() => {});
});

test("(2) PATCH /api/nav-settings bật mục toàn cục: chỉ thông báo PM cùng tổ chức", S, async () => {
  const { query } = await import("@/lib/db");
  const { PATCH } = await import("@/app/api/nav-settings/route");
  const NODE = "dash.dashboard";
  await dangNhapDuAn(adminA, ids.a1);
  // Tắt rồi bật lại — chỉ chuyển tắt → bật mới phát thông báo; cuối ca trả về trạng thái bật.
  assert.equal((await PATCH(req("/x", { nodeKey: NODE, enabled: false }, "PATCH"))).status, 200);
  assert.equal((await PATCH(req("/x", { nodeKey: NODE, enabled: true }, "PATCH"))).status, 200);

  const nhan = await query<{ userId: number }>(
    `SELECT user_id AS "userId" FROM notifications
      WHERE type = 'nav_enabled' AND nav_node_key = ? AND user_id IN (?, ?)`,
    NODE,
    pmA.id,
    pmB.id,
  );
  const nguoiNhan = nhan.map((r) => r.userId);
  assert.ok(nguoiNhan.includes(pmA.id), "PM cùng tổ chức phải nhận thông báo");
  assert.ok(!nguoiNhan.includes(pmB.id), "PM tổ chức khác không được nhận thông báo");
});

test("(3) audit-log: bản ghi toàn cục chỉ hiện khi người thao tác cùng tổ chức", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { GET } = await import("@/app/api/admin/audit-log/route");
  const ENTITY = `ncl_${RUN}`;
  const ghi = (actorId: number, marker: string) =>
    insertId(
      `INSERT INTO audit_log (entity_type, entity_id, action, changes, project_id, actor_id)
       VALUES (?, 0, 'UPDATE', ?::jsonb, NULL, ?)`,
      ENTITY,
      JSON.stringify({ marker }),
      actorId,
    );
  const cuaA = await ghi(pmA.id, "cua-A");
  const cuaB = await ghi(userB.id, "BI MAT ORG B");
  donDep.push(() => run(`DELETE FROM audit_log WHERE entity_type = ?`, ENTITY));

  await dangNhapDuAn(adminA, ids.a1);
  const res = await GET(req(`/api/admin/audit-log?entity=${ENTITY}`));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { rows: Array<{ id: number }>; total: number };
  const thay = body.rows.map((r) => r.id);
  assert.ok(thay.includes(cuaA), "bản ghi toàn cục của người cùng tổ chức vẫn hiện");
  assert.ok(!thay.includes(cuaB), "bản ghi toàn cục của tổ chức khác không được hiện");
  assert.equal(body.total, 1);

  const ex = await import("@/app/api/admin/audit-log/export/route");
  const exRes = await ex.GET(req(`/api/admin/audit-log/export?entity=${ENTITY}`));
  assert.equal(exRes.status, 200);
  assert.doesNotMatch(Buffer.from(await exRes.arrayBuffer()).toString("latin1"), /BI MAT ORG B/);
});

test("(5) flow duyệt toàn cục active: mỗi tổ chức có flow riêng cùng loại", S, async () => {
  const { run } = await import("@/lib/db");
  const { createApprovalFlow } = await import("@/lib/tien-do/approvals");
  const tao = (orgId: number) =>
    createApprovalFlow({
      projectId: null,
      entityType: "variation",
      name: `Flow toàn cục ${orgId} ${RUN}`,
      steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: 3 }],
      orgId,
    });
  const b = await tao(ids.orgB);
  assert.equal(typeof b, "object", `org B tạo flow: ${String(b)}`);
  donDep.push(() => run(`DELETE FROM approval_flows WHERE id = ?`, (b as { id: number }).id));
  const a = await tao(ids.orgA);
  assert.equal(typeof a, "object", `org A bị flow của org B chặn: ${String(a)}`);
  donDep.push(() => run(`DELETE FROM approval_flows WHERE id = ?`, (a as { id: number }).id));
  // Trong cùng tổ chức vẫn tối đa 1 flow active mỗi (loại, phạm vi).
  const trung = await tao(ids.orgA);
  assert.equal(typeof trung, "string");
});

test(
  "(5) trường tuỳ biến toàn cục: cùng key được ở 2 tổ chức, trùng trong 1 tổ chức bị chặn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const KEY = `ncl_${RUN}`;
    const tao = (orgId: number) =>
      insertId(
        `INSERT INTO custom_field_defs (project_id, entity_type, key, label, type, required, sort, active, org_id)
       VALUES (NULL, 'task', ?, 'Trường thử', 'text', FALSE, 0, TRUE, ?)`,
        KEY,
        orgId,
      );
    donDep.push(() => run(`DELETE FROM custom_field_defs WHERE key = ?`, KEY));
    await tao(ids.orgB);
    await tao(ids.orgA);
    await assert.rejects(tao(ids.orgA), (e: { code?: string }) => e.code === "23505");
  },
);

test("(6) allocationOverNorm chỉ xét định mức thuộc dự án của đề xuất", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { allocationOverNorm } = await import("@/lib/tai-chinh/proposals");
  const materialId = await insertId(
    `INSERT INTO materials (name, unit, project_id) VALUES (?, 'kg', ?)`,
    `VT ncl ${RUN}`,
    ids.a1,
  );
  // Định mức vượt nằm ở dự án A2 (cùng vật tư): KL thực hiện 10 × 1 kg = 10, xuất 13 → vượt 30%.
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, project_id) VALUES (?, 'BOQ ncl', 'm', 10, ?)`,
    `NCL-BOQ-${RUN}`,
    ids.a2,
  );
  const wpId = await insertId(
    `INSERT INTO work_packages (code, name) VALUES (?, 'Nhóm ncl')`,
    `NCL-WP-${RUN}`,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (code, name, package_id, progress_percent) VALUES (?, 'Task ncl', ?, 1)`,
    `NCL-T-${RUN}`,
    wpId,
  );
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    boqId,
    taskId,
  );
  const normId = await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, material_id, qty_per_unit, unit_label)
     VALUES (?, 'material', ?, 1, 'kg')`,
    boqId,
    materialId,
  );
  await run(
    `INSERT INTO material_transactions (material_id, delta, qty_after, type)
     VALUES (?, -13, 13, 'xuat_cong_truong')`,
    materialId,
  );
  const deXuat = (projectId: number, ma: string) =>
    insertId(
      `INSERT INTO proposals (code, kind, title, amount, status, requested_by, project_id, material_id)
       VALUES (?, 'allocation', 'Cấp phát ncl', 0, 'submitted', ?, ?, ?)`,
      `${ma}-${RUN}`,
      pmA.id,
      projectId,
      materialId,
    );
  const dxA1 = await deXuat(ids.a1, "DX-NCL-A1");
  const dxA2 = await deXuat(ids.a2, "DX-NCL-A2");

  assert.equal(await allocationOverNorm(dxA1), null, "định mức vượt ở dự án khác không cảnh báo");
  const tren = await allocationOverNorm(dxA2);
  assert.equal(tren?.normId, normId, "định mức vượt đúng dự án vẫn cảnh báo");
});

test("(8) system-uploads: legacy NULL theo tổ chức người upload, khác dự án → 404", S, async () => {
  const { insertId, queryOne, run } = await import("@/lib/db");
  const { storagePut, storageDelete } = await import("@/lib/nen/storage");
  const { GET } = await import("@/app/api/system-uploads/[id]/file/route");
  const { GET: LICH_SU } = await import("@/app/api/systems/[code]/uploads/route");
  const sys = await queryOne<{ id: number; code: string }>(
    `SELECT id, code FROM systems ORDER BY id LIMIT 1`,
  );
  assert.ok(sys);
  const tao = (projectId: number | null, uploader: number, file: string) =>
    insertId(
      `INSERT INTO system_uploads (system_id, project_id, kind, file_name, uploaded_by)
       VALUES (?, ?, 'ke_hoach', ?, ?)`,
      sys.id,
      projectId,
      file,
      uploader,
    );
  const fileA = `ncl-a-${RUN}.xlsx`;
  const nullA = await tao(null, pmA.id, fileA);
  const nullB = await tao(null, userB.id, `ncl-b-${RUN}.xlsx`);
  const duAnA2 = await tao(ids.a2, pmA.id, `ncl-a2-${RUN}.xlsx`);
  await storagePut(ids.orgA, fileA, Buffer.from("xlsx"));
  donDep.push(() => storageDelete(ids.orgA, fileA));
  donDep.push(() => run(`DELETE FROM system_uploads WHERE id IN (?, ?, ?)`, nullA, nullB, duAnA2));

  await dangNhapDuAn(adminA, ids.a1);
  const goi = (id: number) => GET(req(`/x`), { params: Promise.resolve({ id: String(id) }) });
  assert.equal((await goi(nullA)).status, 200, "legacy của người cùng tổ chức vẫn tải được");
  for (const id of [nullB, duAnA2]) {
    const res = await goi(id);
    assert.equal(res.status, 404);
    assert.equal(
      ((await res.json()) as { error: string }).error,
      "Không tìm thấy phiên bản upload này",
    );
  }

  const ls = await LICH_SU(req(`/x?kind=ke_hoach`), {
    params: Promise.resolve({ code: sys.code }),
  });
  assert.equal(ls.status, 200);
  const thay = ((await ls.json()) as Array<{ id: number }>).map((r) => r.id);
  assert.ok(thay.includes(nullA), "lịch sử hiện upload legacy cùng tổ chức");
  assert.ok(!thay.includes(nullB), "lịch sử không hiện upload legacy tổ chức khác");
});
