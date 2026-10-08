import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, type NguoiDungTest } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

// S02 (NOT_MAPPED đợt 2) — cô lập tổ chức cho nhóm route quản trị/cron/import mà inventory S00
// đánh NOT_MAPPED. A1-AC01: hai org cùng vai trò admin KHÔNG đọc/ghi/export chéo. Mỗi ca chéo
// org gọi ROUTE THẬT bằng admin org B trên dữ liệu org A: phải 404/không thấy, DB không đổi.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (t: string) => `${t}${RUN}${++seq}`;

type U = NguoiDungTest & { orgId: number };

async function taoToChuc(): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org ${uniq("s02nm2")}`);
}
async function taoDuAn(orgId: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
    `S02NM2 ${uniq("p")}`,
    orgId,
  );
}
async function taoUser(role: string, orgId: number): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-s02nm2', ?, ?)`,
    `S02NM2 ${role}`,
    `s02nm2-${uniq(role)}@test.local`,
    role,
    orgId,
  );
  return { id, passwordHash: "hash-s02nm2", orgId };
}

/** Hai tổ chức, mỗi bên 1 dự án + 1 admin. */
async function haiToChuc() {
  const orgA = await taoToChuc();
  const orgB = await taoToChuc();
  const pA = await taoDuAn(orgA);
  const pB = await taoDuAn(orgB);
  const adminA = await taoUser("admin", orgA);
  const adminB = await taoUser("admin", orgB);
  return { orgA, orgB, pA, pB, adminA, adminB };
}

const jreq = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const idp = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

// ---------------------------------------------------------------- alert-rules
test("alert-rules POST: dự án org khác → 404, không tạo rule", S, async () => {
  const { pA, pB, adminB } = await haiToChuc();
  const { query } = await import("@/lib/db");
  await dangNhapDuAn(adminB, pB);
  const { POST } = await import("@/app/api/admin/alert-rules/route");
  const res = await POST(
    jreq("/api/admin/alert-rules", "POST", { projectId: pA, metric: "spi_below", threshold: 0.8 }),
  );
  assert.equal(res.status, 404);
  assert.equal((await query(`SELECT 1 FROM alert_rules WHERE project_id = ?`, pA)).length, 0);

  // Ca đúng: dự án của chính mình → 201.
  const ok = await POST(
    jreq("/api/admin/alert-rules", "POST", { projectId: pB, metric: "spi_below", threshold: 0.8 }),
  );
  assert.equal(ok.status, 201);
});

test("alert-rules POST: rule toàn cục org B không ghi đè rule toàn cục org A", S, async () => {
  const { orgA, pB, adminB } = await haiToChuc();
  const { insertId, queryOne, run } = await import("@/lib/db");
  await run(`DELETE FROM alert_rules WHERE metric = 'cpi_below' AND project_id IS NULL`);
  const idA = await insertId(
    `INSERT INTO alert_rules (project_id, metric, operator, threshold, active, org_id)
     VALUES (NULL, 'cpi_below', 'lt', 0.9, TRUE, ?)`,
    orgA,
  );
  try {
    await dangNhapDuAn(adminB, pB);
    const { POST } = await import("@/app/api/admin/alert-rules/route");
    // Unique index toàn hệ (metric, project NULL) có thể từ chối — điều cần giữ là KHÔNG sửa org A.
    await POST(
      jreq("/api/admin/alert-rules", "POST", { metric: "cpi_below", threshold: 0.1 }),
    ).catch(() => null);
    const r = await queryOne<{ threshold: number }>(
      `SELECT threshold FROM alert_rules WHERE id = ?`,
      idA,
    );
    assert.equal(Number(r?.threshold), 0.9);
  } finally {
    await run(`DELETE FROM alert_rules WHERE id = ?`, idA);
  }
});

test("alert-rules DELETE: rule org khác → 404, rule còn nguyên", S, async () => {
  const { orgA, pA, pB, adminB } = await haiToChuc();
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO alert_rules (project_id, metric, operator, threshold, active, org_id)
     VALUES (?, 'spi_below', 'lt', 0.9, TRUE, ?)`,
    pA,
    orgA,
  );
  await dangNhapDuAn(adminB, pB);
  const { DELETE } = await import("@/app/api/admin/alert-rules/[id]/route");
  const res = await DELETE(jreq("/x", "DELETE"), idp(id));
  assert.equal(res.status, 404);
  assert.ok(await queryOne(`SELECT 1 FROM alert_rules WHERE id = ?`, id));
});

// ---------------------------------------------------------------- approval-flows
test("approval-flows: POST dự án org khác → 404; PATCH/DELETE flow org khác → 404", S, async () => {
  const { orgA, pA, pB, adminB } = await haiToChuc();
  const { insertId, queryOne, query } = await import("@/lib/db");
  await dangNhapDuAn(adminB, pB);
  const { POST } = await import("@/app/api/admin/approval-flows/route");
  const steps = [{ seq: 1, role: "pm" }];
  const res = await POST(
    jreq("/api/admin/approval-flows", "POST", {
      entityType: "variation",
      name: "x",
      projectId: pA,
      steps,
    }),
  );
  assert.equal(res.status, 404);
  assert.equal((await query(`SELECT 1 FROM approval_flows WHERE project_id = ?`, pA)).length, 0);

  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name, org_id) VALUES (?, 'variation', ?, ?)`,
    pA,
    `Flow A ${RUN}`,
    orgA,
  );
  const r2 = await import("@/app/api/admin/approval-flows/[id]/route");
  const p = await r2.PATCH(jreq("/x", "PATCH", { name: "Bị đổi", active: false }), idp(flowId));
  assert.equal(p.status, 404);
  const d = await r2.DELETE(jreq("/x", "DELETE"), idp(flowId));
  assert.equal(d.status, 404);
  const row = await queryOne<{ name: string; active: boolean }>(
    `SELECT name, active FROM approval_flows WHERE id = ?`,
    flowId,
  );
  assert.deepEqual(row, { name: `Flow A ${RUN}`, active: true });
});

// ---------------------------------------------------------------- audit
test("admin/audit GET: không thấy log phân công của dự án org khác", S, async () => {
  const { orgA, pA, pB, adminA, adminB } = await haiToChuc();
  const { insertId } = await import("@/lib/db");
  const tw = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'T')`, pA);
  const st = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'S', ?)`,
    tw,
    uniq("C"),
    uniq("s02nm2-"),
  );
  const nhan = `S02NM2-LOG-${RUN}`;
  await insertId(
    `INSERT INTO assignment_log (level, target_id, target_label, changed_by) VALUES ('sheet', ?, ?, ?)`,
    st,
    nhan,
    adminA.id,
  );
  void orgA;
  const { GET } = await import("@/app/api/admin/audit/route");
  await dangNhapDuAn(adminB, pB);
  const resB = await (await GET(jreq("/api/admin/audit?limit=200"))).json();
  assert.ok(!resB.rows.some((r: { targetLabel: string }) => r.targetLabel === nhan));
  await dangNhapDuAn(adminA, pA);
  const resA = await (await GET(jreq("/api/admin/audit?limit=200"))).json();
  assert.ok(resA.rows.some((r: { targetLabel: string }) => r.targetLabel === nhan));
});

// ---------------------------------------------------------------- code-lists
test("admin/code-lists: GET không thấy, PATCH/DELETE mục org khác → 404", S, async () => {
  const { orgA, pB, adminB } = await haiToChuc();
  const { insertId, queryOne } = await import("@/lib/db");
  const domain = `s02nm2_${RUN}`;
  const id = await insertId(
    `INSERT INTO code_lists (domain, code, label, org_id) VALUES (?, ?, 'Nhãn A', ?)`,
    domain,
    uniq("c"),
    orgA,
  );
  await dangNhapDuAn(adminB, pB);
  const { GET, PATCH, DELETE } = await import("@/app/api/admin/code-lists/route");
  const g = await (await GET(jreq(`/api/admin/code-lists?domain=${domain}`))).json();
  assert.equal(g.items.length, 0);
  const p = await PATCH(jreq("/api/admin/code-lists", "PATCH", { id, label: "Bị đổi" }));
  assert.equal(p.status, 404);
  const d = await DELETE(jreq(`/api/admin/code-lists?id=${id}`, "DELETE"));
  assert.equal(d.status, 404);
  const row = await queryOne<{ label: string }>(`SELECT label FROM code_lists WHERE id = ?`, id);
  assert.equal(row?.label, "Nhãn A");
});

// ---------------------------------------------------------------- custom-fields
test("admin/custom-fields POST: dự án org khác → 404, không tạo định nghĩa", S, async () => {
  const { pA, pB, adminB } = await haiToChuc();
  const { query } = await import("@/lib/db");
  await dangNhapDuAn(adminB, pB);
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  const res = await POST(
    jreq("/api/admin/custom-fields", "POST", {
      entityType: "task",
      type: "text",
      key: "s02nm2_key",
      label: "Nhãn",
      projectId: pA,
    }),
  );
  assert.equal(res.status, 404);
  assert.equal((await query(`SELECT 1 FROM custom_field_defs WHERE project_id = ?`, pA)).length, 0);
});

// ---------------------------------------------------------------- feature-flags
test("admin/feature-flags PATCH: dự án org khác → 404, không ghi cờ", S, async () => {
  const { pA, pB, adminB } = await haiToChuc();
  const { query } = await import("@/lib/db");
  const { MODULES } = await import("@/lib/nen/modules");
  await dangNhapDuAn(adminB, pB);
  const { PATCH } = await import("@/app/api/admin/feature-flags/route");
  const res = await PATCH(
    jreq("/api/admin/feature-flags", "PATCH", {
      moduleKey: MODULES[0].key,
      projectId: pA,
      enabled: false,
    }),
  );
  assert.equal(res.status, 404);
  assert.equal((await query(`SELECT 1 FROM feature_flags WHERE project_id = ?`, pA)).length, 0);
  const ok = await PATCH(
    jreq("/api/admin/feature-flags", "PATCH", {
      moduleKey: MODULES[0].key,
      projectId: pB,
      enabled: false,
    }),
  );
  assert.equal(ok.status, 200);
});

// ---------------------------------------------------------------- integrations
test(
  "admin/integrations POST: dự án org khác → 404, cấu hình org A không bị ghi đè",
  S,
  async () => {
    const { orgA, pA, pB, adminB } = await haiToChuc();
    const { insertId, queryOne } = await import("@/lib/db");
    const { registerAdapter } = await import("@/lib/ha-tang/integrations/core");
    // Adapter giả chỉ để route chấp nhận provider (registry rỗng mặc định).
    const provider = `s02nm2-post-${RUN}`;
    registerAdapter({
      provider,
      pushEntities: [],
      fetchRows: async () => [],
      push: async () => [],
    });
    const id = await insertId(
      `INSERT INTO integrations (provider, project_id, config, active, org_id) VALUES (?, ?, '{"a":1}', TRUE, ?)`,
      provider,
      pA,
      orgA,
    );
    await dangNhapDuAn(adminB, pB);
    const { POST } = await import("@/app/api/admin/integrations/route");
    const res = await POST(
      jreq("/api/admin/integrations", "POST", {
        provider,
        projectId: pA,
        config: { b: 2 },
        active: false,
      }),
    );
    assert.equal(res.status, 404);
    const row = await queryOne<{ config: unknown; active: boolean; orgId: number }>(
      `SELECT config, active, org_id AS "orgId" FROM integrations WHERE id = ?`,
      id,
    );
    assert.deepEqual(row, { config: { a: 1 }, active: true, orgId: orgA });
  },
);

// ---------------------------------------------------------------- sod-report
test("admin/sod-report GET: không thấy vi phạm SoD của org khác", S, async () => {
  const { orgA, pA, pB, adminA, adminB } = await haiToChuc();
  const { insertId } = await import("@/lib/db");
  const violator = await taoUser("pm", orgA);
  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name, org_id) VALUES (?, 'variation', ?, ?)`,
    pA,
    `SoD ${RUN}`,
    orgA,
  );
  const reqId = await insertId(
    `INSERT INTO approval_requests (flow_id, entity_type, entity_id, project_id, created_by)
     VALUES (?, 'variation', ?, ?, ?)`,
    flowId,
    Number(Date.now() % 1_000_000_000),
    pA,
    violator.id,
  );
  await insertId(
    `INSERT INTO approval_actions (request_id, step_seq, actor_id, decision) VALUES (?, 1, ?, 'approve')`,
    reqId,
    violator.id,
  );
  const { GET } = await import("@/app/api/admin/sod-report/route");
  const ids = async () => {
    const body = (await (await GET(jreq("/api/admin/sod-report?days=30"))).json()) as {
      rule: string;
      violations: { userId: number }[];
    }[];
    return body.find((r) => r.rule === "create_and_approve")!.violations.map((v) => v.userId);
  };
  await dangNhapDuAn(adminB, pB);
  assert.ok(!(await ids()).includes(violator.id));
  await dangNhapDuAn(adminA, pA);
  assert.ok((await ids()).includes(violator.id));
});

// ---------------------------------------------------------------- saved-reports
test("saved-reports/:id PATCH/DELETE: admin org khác → 404, báo cáo không đổi", S, async () => {
  const { orgA, pA, pB, adminA, adminB } = await haiToChuc();
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO saved_reports (project_id, owner_id, name, source, org_id) VALUES (?, ?, 'BC A', 'late_tasks', ?)`,
    pA,
    adminA.id,
    orgA,
  );
  await dangNhapDuAn(adminB, pB);
  const { PATCH, DELETE } = await import("@/app/api/saved-reports/[id]/route");
  assert.equal((await PATCH(jreq("/x", "PATCH", { name: "Bị đổi" }), idp(id))).status, 404);
  assert.equal((await DELETE(jreq("/x", "DELETE"), idp(id))).status, 404);
  const row = await queryOne<{ name: string }>(`SELECT name FROM saved_reports WHERE id = ?`, id);
  assert.equal(row?.name, "BC A");
  // Ca đúng: chủ sở hữu cùng org sửa được.
  await dangNhapDuAn(adminA, pA);
  assert.equal((await PATCH(jreq("/x", "PATCH", { name: "BC A2" }), idp(id))).status, 200);
});

// ---------------------------------------------------------------- user-projects
test("user-projects GET: không thấy gán dự án của org khác", S, async () => {
  const { orgA, pA, pB, adminA, adminB } = await haiToChuc();
  const { run } = await import("@/lib/db");
  const kySu = await taoUser("engineer", orgA);
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, kySu.id, pA);
  const { GET } = await import("@/app/api/user-projects/route");
  const co = (rows: { userId: number; projectId: number }[]) =>
    rows.some((r) => r.userId === kySu.id && r.projectId === pA);
  await dangNhapDuAn(adminB, pB);
  assert.ok(!co((await (await GET()).json()).assignments));
  await dangNhapDuAn(adminA, pA);
  assert.ok(co((await (await GET()).json()).assignments));
});

// ---------------------------------------------------------------- cron/sync-integrations
test("cron/sync-integrations gọi bằng phiên: không chạy tích hợp của org khác", S, async () => {
  const { orgA, pA, pB, adminB } = await haiToChuc();
  const { insertId, run } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO integrations (provider, project_id, config, active, org_id)
     VALUES (?, ?, '{}', TRUE, ?)`,
    `s02nm2-${RUN}`,
    pA,
    orgA,
  );
  try {
    await dangNhapDuAn(adminB, pB);
    const { GET } = await import("@/app/api/cron/sync-integrations/route");
    const body = await (await GET(jreq("/api/cron/sync-integrations"))).json();
    assert.ok(!body.results.some((r: { projectId: number }) => r.projectId === pA));
  } finally {
    await run(`DELETE FROM integrations WHERE id = ?`, id);
  }
});

// ---------------------------------------------------------------- import/excel
test(
  "import/excel POST: ghi vào dự án đang chọn của org người gọi, không vào dự án org khác",
  S,
  async () => {
    const { pB, adminB } = await haiToChuc();
    const { queryOne } = await import("@/lib/db");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[`s02nm2 ${RUN}`]]), "Khac");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array(buf)], `s02nm2-${RUN}.xlsx`));
    await dangNhapDuAn(adminB, pB);
    const { POST } = await import("@/app/api/import/excel/route");
    const res = await POST(
      new NextRequest("http://localhost/api/import/excel", { method: "POST", body: fd }),
    );
    assert.equal(res.status, 200);
    const batch = await queryOne<{ projectId: number }>(
      `SELECT project_id AS "projectId" FROM import_batches WHERE source_name = ? ORDER BY id DESC LIMIT 1`,
      `s02nm2-${RUN}.xlsx`,
    );
    assert.equal(batch?.projectId, pB);
  },
);
