import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { NextRequest } from "next/server";
import { goi, jreq, P, uniq } from "./helpers/chuoi-nghiep-vu";

// S16 / D01 (A1-AC05) — tái kiểm quyền lúc ghi cho route miền VẬT TƯ / KỸ THUẬT
// (docs/nang-cap/AUDIT-S16-QUYEN-LUC-GHI.md §2.y). Mỗi file route đã áp có 1 ca "allow → deny
// giữa chừng": route thật xác thực + nạp snapshot quyền (còn quyền) rồi kẹt ở khoá advisory chia sẻ
// `role_permissions:<org>` mà kiemQuyenTaiLucGhi lấy NGAY TRƯỚC lần ghi; trong lúc đó một kết nối
// riêng (đang giữ khoá độc quyền y như setPermissionOverride) siết quyền ở phạm vi dự án của ca rồi
// COMMIT. Route phải đọc lại dữ liệu có hiệu lực ⇒ 403 với thông điệp cũ, DB không đổi, file vừa lưu
// bị dọn. Trên code cũ route không chờ khoá nào ⇒ ghi bằng snapshot stale (2xx) ⇒ ca đỏ.
// Kèm vài ca đối chứng (không thu hồi ⇒ ghi bình thường). Không mock module nào.

const S = { skip: !HAS_TEST_DB };

test.after(() => dangXuat());

type KetQua = { status: number; body: Record<string, unknown> | null };
type Nguoi = { id: number; passwordHash: string; orgId: number; role: string };

const PDF = Buffer.from("%PDF-1.4\n%%EOF");

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `S16VT ${uniq(ten)}`);
}

async function taoNguoi(role: string, ten: string): Promise<Nguoi> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES (?, ?, 'hash-test-s16vt', ?, 1)`,
    `S16VT ${ten}`,
    `s16vt-${uniq(ten)}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-test-s16vt", orgId: 1, role };
}

/** Gọi handler trong ngữ cảnh request riêng (snapshot quyền riêng của lời gọi). */
const rq = (fn: () => Promise<Response> | Response) => goi(requestRieng(fn));

const formReq = (url: string, form: FormData) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", body: form });

function pdfForm(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("file", new File([PDF], "a.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return form;
}

async function fileUpload(): Promise<Set<string>> {
  const { UPLOAD_DIR } = await import("@/lib/nen/photos");
  try {
    return new Set(readdirSync(UPLOAD_DIR));
  } catch {
    return new Set();
  }
}

/**
 * Chạy `r1` trong lúc một kết nối riêng giữ khoá độc quyền `role_permissions:1`; chờ R1 kẹt ở
 * khoá đó (tối đa ~2s — code cũ không kẹt), siết (role, permKey) ở dự án `projectId` ngay trên
 * kết nối giữ khoá, COMMIT rồi trả kết quả R1 + cờ R1 có kẹt hay không.
 */
async function thuHoiGiuaChung(
  projectId: number,
  role: string,
  permKey: string,
  r1: () => Promise<KetQua>,
): Promise<{ kq: KetQua; ket: boolean }> {
  const { getPool } = await import("@/lib/db");
  const c = await getPool().connect();
  let daNha = false;
  const nha = async (lenh: "COMMIT" | "ROLLBACK") => {
    if (daNha) return;
    daNha = true;
    await c.query(lenh).catch(() => {});
    c.release();
  };
  try {
    await c.query("BEGIN");
    const pid = (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, ["role_permissions:1"]);
    let xong = false;
    const dangBay = r1().finally(() => {
      xong = true;
    });
    let ket = false;
    for (let i = 0; i < 80 && !ket && !xong; i++) {
      const r = await getPool().query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`,
        [pid],
      );
      ket = r.rows[0].n > 0;
      if (!ket) await new Promise((ok) => setTimeout(ok, 25));
    }
    await c.query(
      `INSERT INTO role_permissions (role, perm_key, allowed, project_id, updated_by, org_id, updated_at)
       VALUES ($1, $2, false, $3, NULL, 1, now())
       ON CONFLICT (org_id, role, perm_key, COALESCE(project_id, 0))
       DO UPDATE SET allowed = false, updated_at = now()`,
      [role, permKey, projectId],
    );
    await nha("COMMIT");
    return { kq: await dangBay, ket };
  } finally {
    await nha("ROLLBACK");
  }
}

type Ca = {
  ten: string;
  perm: string;
  role?: string;
  /** Dựng dữ liệu (đã đăng nhập sẵn) — trả lời gọi R1 + hàm chụp trạng thái DB cần giữ nguyên. */
  dung: (
    projectId: number,
    u: Nguoi,
  ) => Promise<{ goi: () => Promise<KetQua>; chup: () => Promise<unknown>; file?: string }>;
};

async function chayCaThuHoi(ca: Ca): Promise<void> {
  const projectId = await taoDuAn(ca.ten);
  const u = await taoNguoi(ca.role ?? "pm", ca.ten);
  await dangNhapDuAn(u, projectId);
  const { goi: r1, chup, file } = await ca.dung(projectId, u);
  const truoc = await chup();
  // `file` = tiền tố tên file của chính ca này — không đếm nhầm file của test khác chạy song song.
  const fileTruoc = file ? await fileUpload() : null;
  await dangNhapDuAn(u, projectId);
  const { kq, ket } = await thuHoiGiuaChung(projectId, u.role, ca.perm, r1);
  assert.equal(kq.status, 403, `R1 ghi bằng snapshot quyền stale: ${JSON.stringify(kq.body)}`);
  assert.ok(ket, "R1 phải chờ khoá tái kiểm quyền lúc ghi");
  assert.deepEqual(await chup(), truoc, "DB phải giữ nguyên khi bị thu hồi quyền giữa chừng");
  if (fileTruoc) {
    const moi = [...(await fileUpload())].filter((f) => f.startsWith(file!) && !fileTruoc.has(f));
    assert.deepEqual(moi, [], "file vừa lưu phải được dọn khi bị từ chối");
  }
}

async function q1<T>(sql: string, ...args: unknown[]): Promise<T | undefined> {
  const { queryOne } = await import("@/lib/db");
  return queryOne<T>(sql, ...args);
}
async function dem(bang: string, projectId: number): Promise<number> {
  const r = await q1<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ${bang} WHERE project_id = ?`,
    projectId,
  );
  return r?.n ?? 0;
}

// ── Dựng dữ liệu qua route thật (chạy TRƯỚC khi thu hồi, người dùng còn quyền) ─────────────

async function taoThietBi(): Promise<number> {
  const { POST } = await import("@/app/api/equipment/route");
  const r = await rq(() =>
    POST(jreq("/api/equipment", { code: uniq("TB-"), name: "Máy khoan", kind: "khoan" })),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

async function taoBanVe(): Promise<number> {
  const { POST } = await import("@/app/api/drawings/route");
  const r = await rq(() =>
    POST(jreq("/api/drawings", { code: uniq("BV-"), name: "Mặt bằng", kind: "design" })),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

async function taoRevision(drawingId: number): Promise<number> {
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const r = await rq(() =>
    POST(formReq(`/api/drawings/${drawingId}/revisions`, pdfForm({ rev: "A" })), P(drawingId)),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

async function taoDc(): Promise<number> {
  const { POST } = await import("@/app/api/design-changes/route");
  const r = await rq(() =>
    POST(jreq("/api/design-changes", { title: "Đổi tuyến ống", reason: "Vướng dầm" })),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

async function taoChecklist(): Promise<number> {
  const { POST } = await import("@/app/api/qc/checklists/route");
  const r = await rq(() =>
    POST(
      jreq("/api/qc/checklists", {
        name: uniq("CL "),
        items: [{ label: "Kiểm mối hàn", type: "pass_fail" }],
      }),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

async function taoTask(projectId: number, progress = 0): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp S16VT')`,
    projectId,
  );
  const ma = uniq("S16VT");
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet S16VT', ?)`,
    towerId,
    ma,
    ma.toLowerCase(),
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES (?, ?, 'Nhóm', 1)`,
    sheetId,
    uniq("PK"),
  );
  return insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
     VALUES (?, ?, 'Task S16VT', 1, ?, ?)`,
    pkgId,
    uniq("TK"),
    progress,
    progress >= 1 ? "hoan_thanh" : "chuan_bi",
  );
}

async function taoWorkflow(): Promise<string> {
  const { POST } = await import("@/app/api/engineering/workflows/route");
  const r = await rq(() =>
    POST(jreq("/x", { title: uniq("Workflow S16VT "), riskInputs: { reversible: true } })),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as string;
}

async function taoGoiThau(): Promise<number> {
  const { POST } = await import("@/app/api/engineering/bidding/packages/route");
  const r = await rq(() =>
    POST(
      jreq("/x", {
        packageCode: uniq("PKG-"),
        title: "Gói HVAC",
        discipline: "hvac",
        targetBudgetVnd: 1_000_000_000,
      }),
    ),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body!.data as { id: number }).id;
}

const wf = async (id: string) =>
  q1(
    `SELECT state, (SELECT COUNT(*)::int FROM engineering_workflow_events e WHERE e.workflow_id = w.id) AS ev,
            (SELECT json_agg(g.decision ORDER BY g.seq) FROM engineering_workflow_gates g WHERE g.workflow_id = w.id) AS gates
       FROM engineering_workflows w WHERE w.id = ?`,
    id,
  );

// ── Ca thu hồi giữa chừng — 1 ca cho mỗi file route đã áp ─────────────────────────────────

const CAC_CA: Ca[] = [
  // equipment
  {
    ten: "eq-post",
    perm: "manageEquipment",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/equipment/route");
      const code = uniq("TB-");
      return {
        goi: () => rq(() => POST(jreq("/api/equipment", { code, name: "Máy", kind: "khoan" }))),
        chup: () => dem("equipment", pid),
      };
    },
  },
  {
    ten: "eq-patch",
    perm: "manageEquipment",
    dung: async () => {
      const id = await taoThietBi();
      const { PATCH } = await import("@/app/api/equipment/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { name: "Tên mới" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT name FROM equipment WHERE id = ?`, id),
      };
    },
  },
  {
    ten: "eq-cert",
    perm: "manageEquipment",
    dung: async () => {
      const id = await taoThietBi();
      const { POST } = await import("@/app/api/equipment/[id]/cert/route");
      return {
        goi: () => rq(() => POST(formReq(`/x`, pdfForm()), P(id))),
        chup: () => q1(`SELECT cert_file_name FROM equipment WHERE id = ?`, id),
        file: `eq${id}-cert-`,
      };
    },
  },
  {
    ten: "eq-logs",
    perm: "manageEquipment",
    dung: async () => {
      const id = await taoThietBi();
      const { POST } = await import("@/app/api/equipment/[id]/logs/route");
      return {
        goi: () => rq(() => POST(jreq(`/x`, { action: "issue", toCrew: "Tổ A" }), P(id))),
        chup: () =>
          q1(
            `SELECT current_crew, (SELECT COUNT(*)::int FROM equipment_logs WHERE equipment_id = ?) AS n
               FROM equipment WHERE id = ?`,
            id,
            id,
          ),
      };
    },
  },
  // drawings
  {
    ten: "dw-post",
    perm: "manageDrawings",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/drawings/route");
      const code = uniq("BV-");
      return {
        goi: () => rq(() => POST(jreq("/api/drawings", { code, name: "MB", kind: "design" }))),
        chup: () => dem("drawings", pid),
      };
    },
  },
  {
    ten: "dw-patch",
    perm: "manageDrawings",
    dung: async () => {
      const id = await taoBanVe();
      const { PATCH } = await import("@/app/api/drawings/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { name: "Tên mới" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT name FROM drawings WHERE id = ?`, id),
      };
    },
  },
  {
    ten: "dw-rev",
    perm: "manageDrawings",
    dung: async () => {
      const id = await taoBanVe();
      const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
      return {
        goi: () => rq(() => POST(formReq(`/x`, pdfForm({ rev: "B" })), P(id))),
        chup: () => q1(`SELECT COUNT(*)::int AS n FROM drawing_revisions WHERE drawing_id = ?`, id),
        file: `dr${id}-b-`,
      };
    },
  },
  {
    ten: "dw-decide",
    perm: "decideDrawingRevision",
    dung: async () => {
      const revId = await taoRevision(await taoBanVe());
      const { PATCH } = await import("@/app/api/drawings/revisions/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { status: "approved" }, "PATCH"), P(revId))),
        chup: () => q1(`SELECT status FROM drawing_revisions WHERE id = ?`, revId),
      };
    },
  },
  {
    ten: "dw-withdraw",
    perm: "manageDrawings",
    dung: async () => {
      const revId = await taoRevision(await taoBanVe());
      const { POST } = await import("@/app/api/drawings/revisions/[id]/withdraw/route");
      return {
        goi: () => rq(() => POST(jreq(`/x`, undefined), P(revId))),
        chup: () => q1(`SELECT status FROM drawing_revisions WHERE id = ?`, revId),
      };
    },
  },
  // design-changes
  {
    ten: "dc-post",
    perm: "manageDesignChanges",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/design-changes/route");
      return {
        goi: () => rq(() => POST(jreq("/x", { title: "Đổi tuyến", reason: "Vướng dầm" }))),
        chup: () => dem("design_changes", pid),
      };
    },
  },
  {
    ten: "dc-patch",
    perm: "manageDesignChanges",
    dung: async () => {
      const id = await taoDc();
      const { PATCH } = await import("@/app/api/design-changes/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { title: "Tiêu đề mới" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT title FROM design_changes WHERE id = ?`, id),
      };
    },
  },
  {
    ten: "dc-decide",
    perm: "approve",
    dung: async () => {
      const id = await taoDc();
      const { POST } = await import("@/app/api/design-changes/[id]/decide/route");
      return {
        goi: () => rq(() => POST(jreq(`/x`, { decision: "rejected" }), P(id))),
        chup: () => q1(`SELECT status, decided_by FROM design_changes WHERE id = ?`, id),
      };
    },
  },
  // qc
  {
    ten: "qc-post",
    perm: "editStructure",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/qc/checklists/route");
      return {
        goi: () =>
          rq(() =>
            POST(jreq("/x", { name: "CL", items: [{ label: "Mối hàn", type: "pass_fail" }] })),
          ),
        chup: () => dem("qc_checklists", pid),
      };
    },
  },
  {
    ten: "qc-patch",
    perm: "editStructure",
    dung: async () => {
      const id = await taoChecklist();
      const { PATCH } = await import("@/app/api/qc/checklists/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { name: "Tên mới" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT name FROM qc_checklists WHERE id = ?`, id),
      };
    },
  },
  {
    ten: "qc-insp",
    perm: "approve",
    dung: async (pid, u) => {
      const checklistId = await taoChecklist();
      const taskId = await taoTask(pid);
      const { insertId } = await import("@/lib/db");
      const id = await insertId(
        `INSERT INTO qc_inspections (checklist_id, task_id, results, status, inspected_by)
         VALUES (?, ?, '[]'::jsonb, 'submitted', ?)`,
        checklistId,
        taskId,
        u.id,
      );
      const { PATCH } = await import("@/app/api/qc/inspections/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { status: "passed" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT status, approved_by FROM qc_inspections WHERE id = ?`, id),
      };
    },
  },
  // ncrs
  {
    ten: "ncr-close",
    perm: "approve",
    dung: async () => {
      const { POST } = await import("@/app/api/ncrs/route");
      const tao = await rq(() => POST(jreq("/x", { description: "Rò rỉ mối nối" })));
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { PATCH } = await import("@/app/api/ncrs/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { status: "closed" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT status, closed_at FROM ncrs WHERE id = ?`, id),
      };
    },
  },
  // inspection-requests
  {
    ten: "ycnt-post",
    perm: "createInspectionRequest",
    dung: async (pid) => {
      const taskId = await taoTask(pid, 1);
      const { POST } = await import("@/app/api/inspection-requests/route");
      return {
        goi: () =>
          rq(() => POST(jreq("/x", { scheduledAt: "2026-10-20T08:00:00Z", taskIds: [taskId] }))),
        chup: () =>
          q1(`SELECT COUNT(*)::int AS n FROM inspection_request_tasks WHERE task_id = ?`, taskId),
      };
    },
  },
  {
    ten: "ycnt-patch",
    perm: "approve",
    dung: async (pid) => {
      const taskId = await taoTask(pid, 1);
      const { POST } = await import("@/app/api/inspection-requests/route");
      const tao = await rq(() =>
        POST(jreq("/x", { scheduledAt: "2026-10-20T08:00:00Z", taskIds: [taskId] })),
      );
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { PATCH } = await import("@/app/api/inspection-requests/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { status: "confirmed" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT status FROM inspection_requests WHERE id = ?`, id),
      };
    },
  },
  // tech-links
  {
    ten: "tl-post",
    perm: "manageTech",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/tech-links/route");
      return {
        goi: () =>
          rq(() => POST(jreq("/x", { category: "bim", title: "BIM", url: "https://a.com" }))),
        chup: () => dem("tech_links", pid),
      };
    },
  },
  {
    ten: "tl-patch",
    perm: "manageTech",
    dung: async () => {
      const { POST } = await import("@/app/api/tech-links/route");
      const tao = await rq(() =>
        POST(jreq("/x", { category: "bim", title: "BIM", url: "https://a.com" })),
      );
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { PATCH } = await import("@/app/api/tech-links/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { title: "Tiêu đề mới" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT title FROM tech_links WHERE id = ?`, id),
      };
    },
  },
  // om-documents
  {
    ten: "om-post",
    perm: "manageWarranty",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/om-documents/route");
      return {
        goi: () => rq(() => POST(formReq("/x", pdfForm({ title: "HDSD" })))),
        chup: () => dem("om_documents", pid),
        file: `om${pid}-`,
      };
    },
  },
  {
    ten: "om-delete",
    perm: "manageWarranty",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/om-documents/route");
      const tao = await rq(() => POST(formReq("/x", pdfForm({ title: "HDSD" }))));
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { DELETE } = await import("@/app/api/om-documents/[id]/route");
      return {
        goi: () => rq(() => DELETE(jreq(`/x`, undefined, "DELETE"), P(id))),
        chup: () => dem("om_documents", pid),
      };
    },
  },
  // commissioning
  {
    ten: "comm-post",
    perm: "manageHandover",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/commissioning/route");
      return {
        goi: () => rq(() => POST(jreq("/x", { systemName: "Điện" }))),
        chup: () => dem("commissioning", pid),
      };
    },
  },
  {
    ten: "comm-patch",
    perm: "approve",
    dung: async () => {
      const { POST } = await import("@/app/api/commissioning/route");
      const tao = await rq(() => POST(jreq("/x", { systemName: "Điện" })));
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { PATCH } = await import("@/app/api/commissioning/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { result: "passed" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT result FROM commissioning WHERE id = ?`, id),
      };
    },
  },
  // certifications
  {
    ten: "cert-post",
    perm: "manageHr",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/certifications/route");
      return {
        goi: () => rq(() => POST(jreq("/x", { kind: "An toàn điện" }))),
        chup: () => dem("certifications", pid),
      };
    },
  },
  {
    ten: "cert-patch-file",
    perm: "manageHr",
    dung: async () => {
      const { POST } = await import("@/app/api/certifications/route");
      const tao = await rq(() => POST(jreq("/x", { kind: "An toàn điện" })));
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { PATCH } = await import("@/app/api/certifications/[id]/route");
      return {
        goi: () =>
          rq(() =>
            PATCH(
              new NextRequest(`http://localhost/x`, {
                method: "PATCH",
                body: pdfForm({ kind: "Hàn áp lực" }),
              }),
              P(id),
            ),
          ),
        chup: () => q1(`SELECT kind, file_name FROM certifications WHERE id = ?`, id),
        file: `cert${id}-`,
      };
    },
  },
  // monitoring-points
  {
    ten: "mp-post",
    perm: "manageMonitoring",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/monitoring-points/route");
      return {
        goi: () => rq(() => POST(jreq("/x", { code: uniq("M-"), kind: "lun" }))),
        chup: () => dem("monitoring_points", pid),
      };
    },
  },
  {
    ten: "mp-patch",
    perm: "manageMonitoring",
    dung: async () => {
      const { POST } = await import("@/app/api/monitoring-points/route");
      const tao = await rq(() => POST(jreq("/x", { code: uniq("M-"), kind: "lun" })));
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { PATCH } = await import("@/app/api/monitoring-points/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { location: "Trục 5" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT location FROM monitoring_points WHERE id = ?`, id),
      };
    },
  },
  {
    ten: "mp-reading",
    perm: "manageMonitoring",
    dung: async () => {
      const { POST } = await import("@/app/api/monitoring-points/route");
      const tao = await rq(() => POST(jreq("/x", { code: uniq("M-"), kind: "lun" })));
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { POST: DOC } = await import("@/app/api/monitoring-points/[id]/readings/route");
      return {
        goi: () => rq(() => DOC(jreq(`/x`, { measuredAt: "2026-10-01", value: 3 }), P(id))),
        chup: () => q1(`SELECT COUNT(*)::int AS n FROM monitoring_readings WHERE point_id = ?`, id),
      };
    },
  },
  // env-monitoring
  {
    ten: "envm-post",
    perm: "manageEnv",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/env-monitoring/route");
      return {
        goi: () =>
          rq(() =>
            POST(jreq("/x", { measuredAt: "2026-09-01", category: "nuoc_thai", indicator: "pH" })),
          ),
        chup: () => dem("env_monitoring", pid),
      };
    },
  },
  {
    ten: "envm-patch",
    perm: "manageEnv",
    dung: async () => {
      const { POST } = await import("@/app/api/env-monitoring/route");
      const tao = await rq(() =>
        POST(jreq("/x", { measuredAt: "2026-09-01", category: "nuoc_thai", indicator: "pH" })),
      );
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { PATCH } = await import("@/app/api/env-monitoring/[id]/route");
      return {
        goi: () => rq(() => PATCH(jreq(`/x`, { note: "Ghi chú mới" }, "PATCH"), P(id))),
        chup: () => q1(`SELECT note FROM env_monitoring WHERE id = ?`, id),
      };
    },
  },
  // env-permits
  {
    ten: "envp-post",
    perm: "manageEnv",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/env-permits/route");
      return {
        goi: () => rq(() => POST(jreq("/x", { kind: "dtm", title: "ĐTM" }))),
        chup: () => dem("env_permits", pid),
      };
    },
  },
  {
    ten: "envp-patch-file",
    perm: "manageEnv",
    dung: async () => {
      const { POST } = await import("@/app/api/env-permits/route");
      const tao = await rq(() => POST(jreq("/x", { kind: "dtm", title: "ĐTM" })));
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const id = tao.body!.id as number;
      const { PATCH } = await import("@/app/api/env-permits/[id]/route");
      return {
        goi: () =>
          rq(() =>
            PATCH(
              new NextRequest(`http://localhost/x`, {
                method: "PATCH",
                body: pdfForm({ title: "ĐTM mới" }),
              }),
              P(id),
            ),
          ),
        chup: () => q1(`SELECT title, file_name FROM env_permits WHERE id = ?`, id),
        file: `ep${id}-`,
      };
    },
  },
  // engineering
  {
    ten: "eng-conflict",
    perm: "resolveEngineeringConflicts",
    dung: async (pid) => {
      const { openAgentSession } = await import("@/lib/ky-thuat/engineering-agents");
      const claim = (agentName: string, c: string) => ({
        agentRole: "specialist" as const,
        agentName,
        topic: "duong-kinh-ong-dung",
        claim: c,
        payload: {},
        assumptions: ["theo bản vẽ"],
        confidenceSignals: {},
        sourceAuthority: "derived" as const,
      });
      const { sessionId } = await openAgentSession(pid, null, {
        intent: uniq("Kiểm tra ống "),
        maxRounds: 5,
        conflictBudget: 10,
        claims: [claim("hvac-v1", "DN100"), claim("hvac-v2", "DN150")],
      } as never);
      const c = await q1<{ id: string }>(
        `SELECT id FROM engineering_conflicts WHERE session_id = ? LIMIT 1`,
        sessionId,
      );
      const { POST } =
        await import("@/app/api/engineering/agent-sessions/[id]/conflicts/[conflictId]/resolve/route");
      return {
        goi: () =>
          rq(() =>
            POST(jreq("/x", { resolution: "Chọn DN150", method: "evidence_comparison" }), {
              params: Promise.resolve({ id: sessionId, conflictId: c!.id }),
            }),
          ),
        chup: () => q1(`SELECT stage, resolved_by FROM engineering_conflicts WHERE id = ?`, c!.id),
      };
    },
  },
  {
    ten: "eng-analyze",
    perm: "manageEngineeringGraph",
    dung: async (pid) => {
      const packageId = await taoGoiThau();
      const { POST: QUOTE } = await import("@/app/api/engineering/bidding/quotes/route");
      const qt = await rq(() =>
        QUOTE(jreq("/x", { packageId, vendorName: "NCC", totalAmountVnd: 9e8, lineItems: [] })),
      );
      assert.equal(qt.status, 200, JSON.stringify(qt.body));
      const { POST } = await import("@/app/api/engineering/bidding/analyze/route");
      return {
        goi: () => rq(() => POST(jreq("/x", { packageId }))),
        chup: () => dem("engineering_bidding_analysis_runs", pid),
      };
    },
  },
  {
    ten: "eng-pkg",
    perm: "manageEngineeringGraph",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/bidding/packages/route");
      return {
        goi: () =>
          rq(() =>
            POST(
              jreq("/x", {
                packageCode: uniq("PKG-"),
                title: "Gói",
                discipline: "hvac",
                targetBudgetVnd: 1e9,
              }),
            ),
          ),
        chup: () => dem("engineering_bidding_packages", pid),
      };
    },
  },
  {
    ten: "eng-quote",
    perm: "manageEngineeringGraph",
    dung: async (pid) => {
      const packageId = await taoGoiThau();
      const { POST } = await import("@/app/api/engineering/bidding/quotes/route");
      return {
        goi: () =>
          rq(() =>
            POST(jreq("/x", { packageId, vendorName: "NCC", totalAmountVnd: 9e8, lineItems: [] })),
          ),
        chup: () => dem("engineering_bidding_vendor_quotes", pid),
      };
    },
  },
  {
    ten: "eng-cashflow",
    perm: "manageEngineeringGraph",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/cashflow/simulate/route");
      return {
        goi: () => rq(() => POST(jreq("/x", { runName: "Kịch bản", totalContractValue: 1e9 }))),
        chup: () => dem("engineering_cashflow_forecast_runs", pid),
      };
    },
  },
  {
    ten: "eng-dq",
    perm: "manageEngineeringDataQuality",
    dung: async (pid) => {
      const row = await q1<{ id: string }>(
        `INSERT INTO engineering_data_quality_issues (project_id, entity_type, entity_id, issue_rule, severity, description)
         VALUES (?, 'object', 'e1', 'orphan_object', 'medium', 'x') RETURNING id`,
        pid,
      );
      const { POST } = await import("@/app/api/engineering/data-quality/[id]/resolve/route");
      return {
        goi: () =>
          rq(() =>
            POST(jreq("/x", { note: "đã xử lý" }), { params: Promise.resolve({ id: row!.id }) }),
          ),
        chup: () => q1(`SELECT status FROM engineering_data_quality_issues WHERE id = ?`, row!.id),
      };
    },
  },
  {
    ten: "eng-envelope",
    perm: "manageEngineeringGraph",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/esign/envelopes/route");
      return {
        goi: () =>
          rq(() =>
            POST(
              jreq("/x", {
                title: uniq("BBNT "),
                documentType: "BBNT",
                documentPayload: { note: "x" },
                signatories: [{ signerName: "KS", signerRole: "CONTRACTOR_ENGINEER" }],
              }),
            ),
          ),
        chup: () => dem("engineering_esign_envelopes", pid),
      };
    },
  },
  {
    ten: "eng-sign",
    perm: "signEngineeringEsign",
    dung: async (pid, u) => {
      const { POST: TAO } = await import("@/app/api/engineering/esign/envelopes/route");
      const tao = await rq(() =>
        TAO(
          jreq("/x", {
            title: uniq("BBNT "),
            documentType: "BBNT",
            documentPayload: { note: "x" },
            signatories: [{ signerName: "KS", signerRole: "CONTRACTOR_ENGINEER" }],
          }),
        ),
      );
      assert.equal(tao.status, 200, JSON.stringify(tao.body));
      const envelopeId = (tao.body!.data as { id: string }).id;
      const { run } = await import("@/lib/db");
      await run(
        `UPDATE engineering_esign_signatories SET user_id = ?, otp_code = NULL, status = 'ready'
          WHERE envelope_id = ?`,
        u.id,
        envelopeId,
      );
      const s = await q1<{ id: string }>(
        `SELECT id FROM engineering_esign_signatories WHERE envelope_id = ?`,
        envelopeId,
      );
      const { POST } = await import("@/app/api/engineering/esign/sign/route");
      return {
        goi: () =>
          rq(() =>
            POST(jreq("/x", { envelopeId, signatoryId: s!.id, signatureData: "data:chu-ky" })),
          ),
        chup: () =>
          q1(
            `SELECT s.status, e.status AS env FROM engineering_esign_signatories s
               JOIN engineering_esign_envelopes e ON e.id = s.envelope_id WHERE s.id = ? AND e.project_id = ?`,
            s!.id,
            pid,
          ),
      };
    },
  },
  {
    ten: "eng-merkle",
    perm: "manageEngineeringTwin",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/ledger/merkle/route");
      return {
        goi: () => rq(() => POST(jreq("/x", {}))),
        chup: () => dem("engineering_merkle_roots", pid),
      };
    },
  },
  {
    ten: "eng-scan",
    perm: "manageEngineeringGraph",
    dung: async (pid) => {
      const { generateMaterialQrCode } = await import("@/lib/ky-thuat/engineering-qr-logistics");
      const qrCode = generateMaterialQrCode({
        projectId: pid,
        itemCode: uniq("PIPE-"),
        batchNo: "B01",
        quantity: 5,
      });
      const { POST } = await import("@/app/api/engineering/logistics/scan-receive/route");
      return {
        goi: () => rq(() => POST(jreq("/x", { qrCode }))),
        chup: () => dem("engineering_material_qr_tags", pid),
      };
    },
  },
  {
    ten: "eng-ship",
    perm: "manageEngineeringGraph",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/logistics/shipments/route");
      return {
        goi: () =>
          rq(() =>
            POST(
              jreq("/x", {
                shipmentCode: uniq("SHP-"),
                doNumber: "DO-1",
                poNumber: "PO-1",
                supplierName: "NCC",
                manifest: [],
              }),
            ),
          ),
        chup: () => dem("engineering_material_shipments", pid),
      };
    },
  },
  {
    ten: "eng-hydr",
    perm: "manageDrawings",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/mepf-hydraulic/route");
      return {
        goi: () => rq(() => POST(jreq("/x", {}))),
        chup: () => dem("engineering_mepf_hydraulic_calculations", pid),
      };
    },
  },
  {
    ten: "eng-nest",
    perm: "manageDrawings",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/mepf-nesting/route");
      return {
        goi: () => rq(() => POST(jreq("/x", {}))),
        chup: () => dem("engineering_mepf_nesting_plans", pid),
      };
    },
  },
  {
    ten: "eng-takeoff",
    perm: "manageDrawings",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/mepf-takeoff/route");
      return {
        goi: () => rq(() => POST(jreq("/x", {}))),
        chup: () => dem("engineering_mepf_takeoff_runs", pid),
      };
    },
  },
  {
    ten: "eng-tc",
    perm: "manageEngineeringTwin",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/mepf-tc/route");
      return {
        goi: () => rq(() => POST(jreq("/x", { action: "create_matrix" }))),
        chup: () => dem("engineering_mepf_tc_matrices", pid),
      };
    },
  },
  {
    ten: "eng-review",
    perm: "reviewEngineeringObjects",
    dung: async (pid, u) => {
      const { createEngineeringObject } = await import("@/lib/ky-thuat/engineering-kernel");
      const obj = (await createEngineeringObject(
        {
          projectId: pid,
          objectType: "pipe_segment",
          discipline: "mepf",
          externalKey: uniq("obj"),
          name: "Đối tượng",
          properties: {},
          geometryRef: {},
        } as never,
        u.id,
      )) as { id: string };
      const { POST } = await import("@/app/api/engineering/objects/[id]/review/route");
      return {
        goi: () =>
          rq(() =>
            POST(jreq("/x", { decision: "approved" }), {
              params: Promise.resolve({ id: obj.id }),
            }),
          ),
        chup: () =>
          q1(
            `SELECT COUNT(*)::int AS n FROM engineering_object_revisions WHERE object_id = ?`,
            obj.id,
          ),
      };
    },
  },
  {
    ten: "eng-gate",
    perm: "approveEngineeringGate",
    role: "engineer",
    dung: async (pid, u) => {
      // Người tạo/trình là PM khác (SoD); người ký gate 1 là engineer của ca.
      const pm = await taoNguoi("pm", "eng-gate-pm");
      await dangNhapDuAn(pm, pid);
      const id = await taoWorkflow();
      const { POST: SUBMIT } = await import("@/app/api/engineering/workflows/[id]/submit/route");
      const sm = await rq(() => SUBMIT(jreq("/x", undefined), { params: Promise.resolve({ id }) }));
      assert.equal(sm.status, 200, JSON.stringify(sm.body));
      await dangNhapDuAn(u, pid);
      const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
      return {
        goi: () =>
          rq(() =>
            POST(jreq("/x", { decision: "approved" }), {
              params: Promise.resolve({ id, seq: "1" }),
            }),
          ),
        chup: () => wf(id),
      };
    },
  },
  {
    ten: "eng-submit",
    perm: "createEngineeringWorkflow",
    dung: async () => {
      const id = await taoWorkflow();
      const { POST } = await import("@/app/api/engineering/workflows/[id]/submit/route");
      return {
        goi: () => rq(() => POST(jreq("/x", undefined), { params: Promise.resolve({ id }) })),
        chup: () => wf(id),
      };
    },
  },
  {
    ten: "eng-transition",
    perm: "createEngineeringWorkflow",
    dung: async () => {
      const id = await taoWorkflow();
      const { POST } = await import("@/app/api/engineering/workflows/[id]/transition/route");
      return {
        goi: () =>
          rq(() => POST(jreq("/x", { to: "cancelled" }), { params: Promise.resolve({ id }) })),
        chup: () => wf(id),
      };
    },
  },
  {
    ten: "eng-wf-post",
    perm: "createEngineeringWorkflow",
    dung: async (pid) => {
      const { POST } = await import("@/app/api/engineering/workflows/route");
      return {
        goi: () =>
          rq(() => POST(jreq("/x", { title: "Workflow", riskInputs: { reversible: true } }))),
        chup: () => dem("engineering_workflows", pid),
      };
    },
  },
];

for (const ca of CAC_CA) {
  test(
    `S16/D01 vật tư-kỹ thuật [${ca.ten}]: siết ${ca.perm} khi route đã qua kiểm quyền ⇒ 403, DB không đổi`,
    S,
    () => chayCaThuHoi(ca),
  );
}

// ── Đối chứng: không thu hồi ⇒ ghi bình thường (tái kiểm không chặn nhầm) ────────────────

async function vaoMoi(ten: string, role = "pm"): Promise<{ pid: number; u: Nguoi }> {
  const pid = await taoDuAn(ten);
  const u = await taoNguoi(role, ten);
  await dangNhapDuAn(u, pid);
  return { pid, u };
}

test(
  "S16/D01 đối chứng: tạo thiết bị, bản vẽ, checklist, workflow khi còn quyền ⇒ 2xx",
  S,
  async () => {
    const { pid } = await vaoMoi("dc-tao");
    await taoThietBi();
    await taoBanVe();
    await taoChecklist();
    await taoWorkflow();
    assert.equal(await dem("equipment", pid), 1);
    assert.equal(await dem("drawings", pid), 1);
    assert.equal(await dem("qc_checklists", pid), 1);
    assert.equal(await dem("engineering_workflows", pid), 1);
  },
);

test("S16/D01 đối chứng: PM đóng NCR, engineer sửa NCR (không qua cổng CAN) ⇒ 200", S, async () => {
  const { pid } = await vaoMoi("dc-ncr");
  const { POST } = await import("@/app/api/ncrs/route");
  const tao = await rq(() => POST(jreq("/x", { description: "Rò rỉ" })));
  const id = tao.body!.id as number;
  const { PATCH } = await import("@/app/api/ncrs/[id]/route");
  const eng = await taoNguoi("engineer", "dc-ncr-eng");
  await dangNhapDuAn(eng, pid);
  const sua = await rq(() => PATCH(jreq(`/x`, { status: "fixing" }, "PATCH"), P(id)));
  assert.equal(sua.status, 200, JSON.stringify(sua.body));
  const pm = await taoNguoi("pm", "dc-ncr-pm");
  await dangNhapDuAn(pm, pid);
  const dong = await rq(() => PATCH(jreq(`/x`, { status: "closed" }, "PATCH"), P(id)));
  assert.equal(dong.status, 200, JSON.stringify(dong.body));
  assert.equal(
    (await q1<{ status: string }>(`SELECT status FROM ncrs WHERE id = ?`, id))?.status,
    "closed",
  );
});

test(
  "S16/D01 đối chứng: duyệt QC + chạy thử Đạt trong transaction có khoá dòng ⇒ 200",
  S,
  async () => {
    const { pid, u } = await vaoMoi("dc-qc");
    const checklistId = await taoChecklist();
    const taskId = await taoTask(pid);
    const { insertId } = await import("@/lib/db");
    const inspId = await insertId(
      `INSERT INTO qc_inspections (checklist_id, task_id, results, status, inspected_by)
     VALUES (?, ?, '[]'::jsonb, 'submitted', ?)`,
      checklistId,
      taskId,
      u.id,
    );
    const { PATCH } = await import("@/app/api/qc/inspections/[id]/route");
    const r = await rq(() => PATCH(jreq(`/x`, { status: "passed" }, "PATCH"), P(inspId)));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { POST } = await import("@/app/api/commissioning/route");
    const tao = await rq(() => POST(jreq("/x", { systemName: "Điện" })));
    const { PATCH: SUA } = await import("@/app/api/commissioning/[id]/route");
    const id = tao.body!.id as number;
    const s = await rq(() => SUA(jreq(`/x`, { result: "passed" }, "PATCH"), P(id)));
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(
      (await q1<{ result: string }>(`SELECT result FROM commissioning WHERE id = ?`, id))?.result,
      "passed",
    );
  },
);

test(
  "S16/D01 đối chứng: thay file chứng chỉ — file mới được ghi, file cũ chỉ xoá SAU khi commit",
  S,
  async () => {
    await vaoMoi("dc-cert");
    const { POST } = await import("@/app/api/certifications/route");
    const tao = await rq(() => POST(jreq("/x", { kind: "An toàn điện" })));
    const id = tao.body!.id as number;
    const { PATCH } = await import("@/app/api/certifications/[id]/route");
    const lan = () =>
      rq(() =>
        PATCH(new NextRequest(`http://localhost/x`, { method: "PATCH", body: pdfForm() }), P(id)),
      );
    assert.equal((await lan()).status, 200);
    const cu = (await q1<{ file_name: string }>(
      `SELECT file_name FROM certifications WHERE id = ?`,
      id,
    ))!.file_name;
    assert.equal((await lan()).status, 200);
    const moi = (await q1<{ file_name: string }>(
      `SELECT file_name FROM certifications WHERE id = ?`,
      id,
    ))!.file_name;
    assert.notEqual(moi, cu);
    const tep = await fileUpload();
    assert.ok(tep.has(moi), "file mới phải tồn tại");
    assert.ok(!tep.has(cu), "file cũ phải được xoá sau khi ghi DB");
  },
);

test("S16/D01 đối chứng: subcon trả thiết bị mình giữ (nhánh không qua CAN) ⇒ 201", S, async () => {
  const { pid } = await vaoMoi("dc-eq-sub");
  const id = await taoThietBi();
  const sub = await taoNguoi("subcon", "dc-eq-sub");
  const { run } = await import("@/lib/db");
  await run(`UPDATE equipment SET current_crew = 'S16VT dc-eq-sub' WHERE id = ?`, id);
  await dangNhapDuAn(sub, pid);
  const { POST } = await import("@/app/api/equipment/[id]/logs/route");
  const r = await rq(() => POST(jreq(`/x`, { action: "return" }), P(id)));
  assert.equal(r.status, 201, JSON.stringify(r.body));
});
