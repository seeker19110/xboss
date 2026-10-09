import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { NextRequest } from "next/server";
import { SoFixture, jreq, P, goi, uniq, type NguoiTest } from "./helpers/chuoi-nghiep-vu";

// A1-AC05 / Q-AC01 (APPROVAL D01) — tái kiểm quyền lúc ghi cho route miền HIỆN TRƯỜNG / HỒ SƠ
// (docs/nang-cap/AUDIT-S16-QUYEN-LUC-GHI.md §2.z). Mỗi file route đã áp có ÍT NHẤT một ca
// "admin siết quyền CAN của PM trong lúc request R1 đã qua kiểm quyền đầu handler nhưng CHƯA ghi"
// ⇒ R1 phải 403 và DB không đổi. Không mock module nào; override đổi qua route thật
// PATCH /api/admin/role-permissions, THEO DỰ ÁN của ca (không ảnh hưởng file test khác).
//
// Hai điểm chèn (đều nằm SAU kiểm CAN đầu handler, TRƯỚC câu ghi):
//   - Body treo: request POST/PATCH mang body dạng stream chỉ trả dữ liệu khi test "mở cổng";
//     handler kẹt ở `req.json()`/`req.formData()` — lúc đó admin đổi override.
//   - Khoá bảng: route DELETE đọc dòng đích (loadExisting…) trước khi xoá; một kết nối riêng giữ
//     `LOCK TABLE … ACCESS EXCLUSIVE` làm R1 kẹt ở câu đọc đó (khuôn s16-quyen-ghi-mo-rong).

const S = { skip: !HAS_TEST_DB };

test.after(() => dangXuat());

type KetQua = { status: number; body: Record<string, unknown> | null };
type Handler = (req: NextRequest) => Promise<Response> | Response;

const rq = <T>(fn: () => Promise<T>) => requestRieng(fn);

/** Admin cùng org ghi override (role, permKey) qua route thật, trong ngữ cảnh request riêng. */
async function datOverride(
  f: SoFixture,
  admin: NguoiTest,
  projectId: number,
  permKey: string,
  allowed: boolean | null,
): Promise<void> {
  const { PATCH } = await import("@/app/api/admin/role-permissions/route");
  await f.vao(admin, projectId);
  const r = await goi(
    rq(() =>
      PATCH(
        jreq(`/api/admin/role-permissions`, { role: "pm", permKey, allowed, projectId }, "PATCH"),
      ),
    ),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

/** Request có body stream "treo": handler chỉ nhận dữ liệu sau khi gọi `mo()`. */
async function reqTreo(url: string, method: string, body: unknown) {
  let bytes: Uint8Array;
  const headers: Record<string, string> = {};
  if (body instanceof FormData) {
    const tam = new Request("http://localhost/tam", { method: "POST", body });
    headers["content-type"] = tam.headers.get("content-type")!;
    bytes = new Uint8Array(await tam.arrayBuffer());
  } else {
    headers["content-type"] = "application/json";
    bytes = new TextEncoder().encode(JSON.stringify(body));
  }
  let baoDaDoc!: () => void;
  const daDoc = new Promise<void>((ok) => (baoDaDoc = ok));
  let mo!: () => void;
  const cong = new Promise<void>((ok) => (mo = ok));
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(c) {
        baoDaDoc();
        await cong;
        c.enqueue(bytes);
        c.close();
      },
    },
    { highWaterMark: 0 },
  );
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    body: stream,
    duplex: "half",
  } as ConstructorParameters<typeof NextRequest>[1]);
  return { req, daDoc, mo };
}

type Ca = {
  f: SoFixture;
  pm: NguoiTest;
  admin: NguoiTest;
  projectId: number;
};

async function dungCa(ten: string): Promise<Ca> {
  const f = new SoFixture();
  const projectId = await f.duAn(ten);
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  return { f, pm, admin, projectId };
}

/** R1 kẹt ở đọc body (sau kiểm CAN) → admin siết `perm` của PM → mở cổng. */
async function thuHoiQuaBody(
  c: Ca,
  perm: string,
  url: string,
  method: string,
  body: unknown,
  handler: Handler,
): Promise<KetQua> {
  await c.f.vao(c.pm, c.projectId);
  const t = await reqTreo(url, method, body);
  const dangBay = goi(rq(async () => handler(t.req)));
  const ket = await Promise.race([
    t.daDoc.then(() => true),
    dangBay.then(() => false),
    new Promise<boolean>((ok) => setTimeout(() => ok(false), 5000)),
  ]);
  if (!ket) {
    t.mo();
    assert.fail(`R1 không kẹt ở đọc body: ${JSON.stringify(await dangBay)}`);
  }
  await datOverride(c.f, c.admin, c.projectId, perm, false);
  await c.f.vao(c.pm, c.projectId);
  t.mo();
  return dangBay;
}

/** R1 kẹt ở câu đọc bảng bị khoá (sau kiểm CAN) → admin siết `perm` của PM (nếu có) → nhả khoá. */
async function chenGiuaKhoa(
  c: Ca,
  bang: string,
  perm: string | null,
  handler: Handler,
  req: NextRequest,
): Promise<KetQua> {
  const { getPool } = await import("@/lib/db");
  await c.f.vao(c.pm, c.projectId);
  const conn = await getPool().connect();
  let daNha = false;
  const nha = async () => {
    if (daNha) return;
    daNha = true;
    await conn.query("COMMIT").catch(() => {});
    conn.release();
  };
  try {
    await conn.query("BEGIN");
    const pid = (await conn.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await conn.query(`LOCK TABLE ${bang} IN ACCESS EXCLUSIVE MODE`);
    const dangBay = goi(rq(async () => handler(req)));
    let ket = false;
    for (let i = 0; i < 200 && !ket; i++) {
      const r = await getPool().query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`,
        [pid],
      );
      ket = r.rows[0].n > 0;
      if (!ket) await new Promise((ok) => setTimeout(ok, 25));
    }
    if (!ket) {
      await nha();
      await dangBay.catch(() => {});
      assert.fail("R1 không kẹt ở khoá như kỳ vọng — điểm chèn không còn đúng");
    }
    if (perm) await datOverride(c.f, c.admin, c.projectId, perm, false);
    await c.f.vao(c.pm, c.projectId);
    await nha();
    return await dangBay;
  } finally {
    await nha();
  }
}

// ── Dữ liệu đầu vào tối thiểu (SQL) + dọn ──────────────────────────────────────────────────

async function chen(sql: string, ...thamSo: unknown[]): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(sql, ...thamSo);
}

async function anh(sql: string, ...thamSo: unknown[]): Promise<unknown[]> {
  const { query } = await import("@/lib/db");
  return query(sql, ...thamSo);
}

const supplierCuaCa = new Map<number, number[]>();

async function don(c: Ca): Promise<void> {
  const { run } = await import("@/lib/db");
  const pid = c.projectId;
  await run(
    `DELETE FROM meeting_actions WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id = ?)`,
    pid,
  );
  await run(`DELETE FROM meetings WHERE project_id = ?`, pid);
  await run(
    `DELETE FROM correspondence_files
      WHERE correspondence_id IN (SELECT id FROM correspondences WHERE project_id = ?)`,
    pid,
  );
  await run(
    `UPDATE correspondences SET reply_to_id = NULL WHERE project_id = ? AND reply_to_id IS NOT NULL`,
    pid,
  ).catch(() => {});
  await run(`DELETE FROM correspondences WHERE project_id = ?`, pid);
  await run(
    `DELETE FROM hse_photos WHERE record_id IN (SELECT id FROM hse_records WHERE project_id = ?)`,
    pid,
  );
  await run(`DELETE FROM hse_records WHERE project_id = ?`, pid);
  await run(`DELETE FROM attendance WHERE project_id = ?`, pid);
  await run(
    `DELETE FROM crew_members WHERE crew_id IN (SELECT id FROM crews WHERE project_id = ?)`,
    pid,
  );
  await run(`DELETE FROM crews WHERE project_id = ?`, pid);
  await run(`DELETE FROM personnel WHERE project_id = ?`, pid);
  for (const t of [
    "risks",
    "mobilization_items",
    "demob_items",
    "waste_logs",
    "community_cases",
    "warranty_claims",
    "warranty_items",
    "lessons_learned",
    "punch_list",
    "handover_items",
    "legal_documents",
    "project_documents",
  ])
    await run(`DELETE FROM ${t} WHERE project_id = ?`, pid);
  for (const s of supplierCuaCa.get(pid) ?? []) {
    await run(`DELETE FROM subcon_documents WHERE supplier_id = ?`, s);
    await run(`DELETE FROM suppliers WHERE id = ?`, s);
  }
  await c.f.don();
}

async function voiCa(ten: string, than: (c: Ca) => Promise<void>): Promise<void> {
  const c = await dungCa(ten);
  try {
    await than(c);
  } finally {
    await don(c);
  }
}

const dem = async (bang: string, projectId: number) =>
  (
    (await anh(`SELECT COUNT(*)::int AS n FROM ${bang} WHERE project_id = ?`, projectId))[0] as {
      n: number;
    }
  ).n;

const conDong = async (bang: string, id: number) =>
  (await anh(`SELECT id FROM ${bang} WHERE id = ?`, id)).length === 1;

const HOM_NAY = "2026-10-09";

// ── 1. POST tạo mới (body treo) — DB không có dòng mới ─────────────────────────────────────

type CaPost = {
  ten: string;
  perm: string;
  url: string;
  bang: string;
  body: (c: Ca) => Promise<unknown>;
  route: () => Promise<{ POST: Handler }>;
};

const CA_POST: CaPost[] = [
  {
    ten: "crews",
    perm: "manageHr",
    url: "/api/crews",
    bang: "crews",
    body: async () => ({ name: uniq("Tổ ") }),
    route: () => import("@/app/api/crews/route"),
  },
  {
    ten: "personnel",
    perm: "manageHr",
    url: "/api/personnel",
    bang: "personnel",
    body: async () => ({ fullName: "Nhân sự S16" }),
    route: () => import("@/app/api/personnel/route"),
  },
  {
    ten: "attendance",
    perm: "recordAttendance",
    url: "/api/attendance",
    bang: "attendance",
    body: async (c) => ({
      workDate: HOM_NAY,
      crewId: await chen(
        `INSERT INTO crews (project_id, name) VALUES (?, ?)`,
        c.projectId,
        uniq("Tổ CC "),
      ),
      headcount: 5,
    }),
    route: () => import("@/app/api/attendance/route"),
  },
  {
    ten: "mobilization",
    perm: "manageKickoff",
    url: "/api/mobilization",
    bang: "mobilization_items",
    body: async () => ({ category: "mat_bang", title: "Bàn giao mặt bằng" }),
    route: () => import("@/app/api/mobilization/route"),
  },
  {
    ten: "demob",
    perm: "manageHandover",
    url: "/api/demob",
    bang: "demob_items",
    body: async () => ({ title: "Tháo dỡ lán trại" }),
    route: () => import("@/app/api/demob/route"),
  },
  {
    ten: "waste-logs",
    perm: "manageEnv",
    url: "/api/waste-logs",
    bang: "waste_logs",
    body: async () => ({ logDate: HOM_NAY, wasteType: "ran_xd" }),
    route: () => import("@/app/api/waste-logs/route"),
  },
  {
    ten: "community-cases",
    perm: "manageMonitoring",
    url: "/api/community-cases",
    bang: "community_cases",
    body: async () => ({ title: "Khiếu nại tiếng ồn" }),
    route: () => import("@/app/api/community-cases/route"),
  },
  {
    ten: "warranty-claims",
    perm: "manageWarranty",
    url: "/api/warranty-claims",
    bang: "warranty_claims",
    body: async () => ({ description: "Rò rỉ ống" }),
    route: () => import("@/app/api/warranty-claims/route"),
  },
  {
    ten: "warranty-items",
    perm: "manageWarranty",
    url: "/api/warranty-items",
    bang: "warranty_items",
    body: async () => ({ title: "Bảo hành hệ ống" }),
    route: () => import("@/app/api/warranty-items/route"),
  },
  {
    ten: "lessons-learned",
    perm: "manageHandover",
    url: "/api/lessons-learned",
    bang: "lessons_learned",
    body: async () => ({ title: "Bài học S16" }),
    route: () => import("@/app/api/lessons-learned/route"),
  },
  {
    ten: "punch-list",
    perm: "manageHandover",
    url: "/api/punch-list",
    bang: "punch_list",
    body: async () => ({ description: "Tồn tại S16" }),
    route: () => import("@/app/api/punch-list/route"),
  },
  {
    ten: "handover-items",
    perm: "manageHandover",
    url: "/api/handover-items",
    bang: "handover_items",
    body: async () => ({ title: "Hạng mục bàn giao S16" }),
    route: () => import("@/app/api/handover-items/route"),
  },
  {
    ten: "legal-documents",
    perm: "manageKickoff",
    url: "/api/legal-documents",
    bang: "legal_documents",
    body: async () => ({ kind: "khac", title: "Giấy phép S16" }),
    route: () => import("@/app/api/legal-documents/route"),
  },
  {
    ten: "meetings",
    perm: "manageMeetings",
    url: "/api/meetings",
    bang: "meetings",
    body: async () => ({ meetingDate: HOM_NAY, kind: "weekly", title: "Giao ban S16" }),
    route: () => import("@/app/api/meetings/route"),
  },
  {
    ten: "correspondences",
    perm: "manageCorrespondence",
    url: "/api/correspondences",
    bang: "correspondences",
    body: async () => ({ code: uniq("CV-S16-"), counterparty: "TVGS", subject: "Trích yếu" }),
    route: () => import("@/app/api/correspondences/route"),
  },
  {
    ten: "risks",
    perm: "manageRisks",
    url: "/api/risks",
    bang: "risks",
    body: async () => ({ title: "Rủi ro S16", category: "cost", probability: 2, impact: 3 }),
    route: () => import("@/app/api/risks/route"),
  },
];

for (const ca of CA_POST) {
  test(
    `D01 hiện trường: POST /api/${ca.ten} — admin siết ${ca.perm} khi R1 kẹt đọc body ⇒ 403, không dòng mới`,
    S,
    () =>
      voiCa(`S16HT-${ca.ten}`, async (c) => {
        const { POST } = await ca.route();
        const body = await ca.body(c);
        const truoc = await dem(ca.bang, c.projectId);
        const r1 = await thuHoiQuaBody(c, ca.perm, ca.url, "POST", body, POST);
        assert.equal(r1.status, 403, `R1 ghi bằng snapshot stale: ${JSON.stringify(r1.body)}`);
        assert.equal(await dem(ca.bang, c.projectId), truoc);
      }),
  );
}

test(
  "D01 hiện trường (đối chứng): POST /api/crews qua cùng điểm chèn body, không đổi quyền ⇒ 201 + đúng 1 dòng",
  S,
  () =>
    voiCa("S16HT-crews-ok", async (c) => {
      const { POST } = await import("@/app/api/crews/route");
      await c.f.vao(c.pm, c.projectId);
      const t = await reqTreo("/api/crews", "POST", { name: uniq("Tổ OK ") });
      const dangBay = goi(rq(async () => POST(t.req)));
      await t.daDoc;
      t.mo();
      const r = await dangBay;
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(await dem("crews", c.projectId), 1);
    }),
);

test("D01 hiện trường (thành công): POST /api/meetings + /api/risks bình thường ⇒ 201", S, () =>
  voiCa("S16HT-ok-post", async (c) => {
    const { POST: taoHop } = await import("@/app/api/meetings/route");
    const { POST: taoRuiRo } = await import("@/app/api/risks/route");
    await c.f.vao(c.pm, c.projectId);
    const a = await goi(
      rq(() =>
        taoHop(jreq("/api/meetings", { meetingDate: HOM_NAY, kind: "weekly", title: "Họp" })),
      ),
    );
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const b = await goi(
      rq(() =>
        taoRuiRo(
          jreq("/api/risks", { title: "RR", category: "safety", probability: 1, impact: 1 }),
        ),
      ),
    );
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.match(String(b.body!.code), /^R-/);
    assert.equal(await dem("meetings", c.projectId), 1);
    assert.equal(await dem("risks", c.projectId), 1);
  }),
);

// ── 2. POST con của một bản ghi (body treo) ────────────────────────────────────────────────

test(
  "D01 hiện trường: POST /api/meetings/:id/actions — siết manageMeetings giữa chừng ⇒ 403, không action",
  S,
  () =>
    voiCa("S16HT-mact", async (c) => {
      const mid = await chen(
        `INSERT INTO meetings (meeting_date, kind, title, created_by, project_id) VALUES (?, 'weekly', 'Họp', ?, ?)`,
        HOM_NAY,
        c.pm.id,
        c.projectId,
      );
      const { POST } = await import("@/app/api/meetings/[id]/actions/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageMeetings",
        `/api/meetings/${mid}/actions`,
        "POST",
        { content: "Việc S16" },
        (req) => POST(req, P(mid)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.equal(
        (await anh(`SELECT id FROM meeting_actions WHERE meeting_id = ?`, mid)).length,
        0,
      );
    }),
);

test(
  "D01 hiện trường: POST /api/crews/:id/members — siết manageHr giữa chừng ⇒ 403, không thành viên",
  S,
  () =>
    voiCa("S16HT-cmem", async (c) => {
      const crewId = await chen(
        `INSERT INTO crews (project_id, name) VALUES (?, ?)`,
        c.projectId,
        uniq("Tổ "),
      );
      const personnelId = await chen(
        `INSERT INTO personnel (project_id, full_name) VALUES (?, 'NS S16')`,
        c.projectId,
      );
      const { POST } = await import("@/app/api/crews/[id]/members/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageHr",
        `/api/crews/${crewId}/members`,
        "POST",
        { personnelId },
        (req) => POST(req, P(crewId)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.equal((await anh(`SELECT 1 FROM crew_members WHERE crew_id = ?`, crewId)).length, 0);
    }),
);

async function taoCongVan(c: Ca): Promise<number> {
  return chen(
    `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, status, created_by, project_id)
     VALUES (?, 'in', 'letter', 'TVGS', 'Gốc', ?, 'awaiting', ?, ?)`,
    uniq("CV-G-"),
    HOM_NAY,
    c.pm.id,
    c.projectId,
  );
}

test(
  "D01 hiện trường: POST /api/correspondences/:id/reply — siết manageCorrespondence giữa chừng ⇒ 403, không văn bản trả lời",
  S,
  () =>
    voiCa("S16HT-reply", async (c) => {
      const goc = await taoCongVan(c);
      const { POST } = await import("@/app/api/correspondences/[id]/reply/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageCorrespondence",
        `/api/correspondences/${goc}/reply`,
        "POST",
        { code: uniq("CV-TL-"), direction: "out", counterparty: "TVGS", subject: "Trả lời" },
        (req) => POST(req, P(goc)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.equal(await dem("correspondences", c.projectId), 1);
    }),
);

const PDF = Buffer.from("%PDF-1.4\n%S16 test\n%%EOF\n");

async function fileMoi(prefix: string): Promise<string[]> {
  const { UPLOAD_DIR } = await import("@/lib/nen/photos");
  try {
    return readdirSync(UPLOAD_DIR).filter((n) => n.startsWith(prefix));
  } catch {
    return [];
  }
}

test(
  "D01 hiện trường: POST /api/correspondences/:id/files — siết giữa chừng ⇒ 403, không dòng DB, file vừa lưu bị dọn",
  S,
  () =>
    voiCa("S16HT-cvfile", async (c) => {
      const cv = await taoCongVan(c);
      const fd = new FormData();
      fd.set("file", new File([PDF], "cv.pdf", { type: "application/pdf" }));
      const { POST } = await import("@/app/api/correspondences/[id]/files/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageCorrespondence",
        `/api/correspondences/${cv}/files`,
        "POST",
        fd,
        (req) => POST(req, P(cv)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.equal(
        (await anh(`SELECT id FROM correspondence_files WHERE correspondence_id = ?`, cv)).length,
        0,
      );
      assert.deepEqual(
        await fileMoi(`cv${cv}-`),
        [],
        "file đã lưu lên storage phải bị dọn khi 403",
      );
    }),
);

test(
  "D01 hiện trường: POST /api/project-documents — siết editStructure giữa chừng ⇒ 403, không dòng DB",
  S,
  () =>
    voiCa("S16HT-pdoc", async (c) => {
      const fd = new FormData();
      fd.set("title", "Hồ sơ S16");
      fd.set("file", new File([PDF], "hs.pdf", { type: "application/pdf" }));
      const { POST } = await import("@/app/api/project-documents/route");
      const r1 = await thuHoiQuaBody(
        c,
        "editStructure",
        "/api/project-documents",
        "POST",
        fd,
        POST,
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.equal(await dem("project_documents", c.projectId), 0);
    }),
);

// ── 3. PATCH (body treo) — dòng giữ nguyên ─────────────────────────────────────────────────

test(
  "D01 hiện trường: PATCH /api/hse/:id — siết manageHse giữa chừng ⇒ 403, mô tả không đổi",
  S,
  () =>
    voiCa("S16HT-hse", async (c) => {
      const id = await chen(
        `INSERT INTO hse_records (kind, record_date, description, action_required, action_status, created_by, project_id)
         VALUES ('toolbox', ?, 'Gốc', false, 'none', ?, ?)`,
        HOM_NAY,
        c.pm.id,
        c.projectId,
      );
      const { PATCH } = await import("@/app/api/hse/[id]/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageHse",
        `/api/hse/${id}`,
        "PATCH",
        { description: "Sửa stale" },
        (req) => PATCH(req, P(id)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.deepEqual(await anh(`SELECT description FROM hse_records WHERE id = ?`, id), [
        { description: "Gốc" },
      ]);
    }),
);

test("D01 hiện trường (thành công): PATCH /api/hse/:id bình thường ⇒ 200, mô tả đổi", S, () =>
  voiCa("S16HT-hse-ok", async (c) => {
    const id = await chen(
      `INSERT INTO hse_records (kind, record_date, description, action_required, action_status, created_by, project_id)
       VALUES ('toolbox', ?, 'Gốc', false, 'none', ?, ?)`,
      HOM_NAY,
      c.pm.id,
      c.projectId,
    );
    const { PATCH } = await import("@/app/api/hse/[id]/route");
    await c.f.vao(c.pm, c.projectId);
    const r = await goi(
      rq(() => PATCH(jreq(`/api/hse/${id}`, { description: "Mới" }, "PATCH"), P(id))),
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await anh(`SELECT description FROM hse_records WHERE id = ?`, id), [
      { description: "Mới" },
    ]);
  }),
);

async function taoRuiRo(c: Ca): Promise<number> {
  return chen(
    `INSERT INTO risks (code, title, category, probability, impact, created_by, project_id)
     VALUES (?, 'RR gốc', 'cost', 2, 2, ?, ?)`,
    uniq("RS16-"),
    c.pm.id,
    c.projectId,
  );
}

test(
  "D01 hiện trường: PATCH /api/risks/:id (đổi trạng thái) — siết manageRisks giữa chừng ⇒ 403, trạng thái giữ",
  S,
  () =>
    voiCa("S16HT-risk", async (c) => {
      const id = await taoRuiRo(c);
      const truoc = await anh(`SELECT status, closed_at FROM risks WHERE id = ?`, id);
      const { PATCH } = await import("@/app/api/risks/[id]/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageRisks",
        `/api/risks/${id}`,
        "PATCH",
        { status: "closed" },
        (req) => PATCH(req, P(id)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.deepEqual(await anh(`SELECT status, closed_at FROM risks WHERE id = ?`, id), truoc);
    }),
);

test("D01 hiện trường (thành công): PATCH /api/risks/:id đóng rủi ro ⇒ 200", S, () =>
  voiCa("S16HT-risk-ok", async (c) => {
    const id = await taoRuiRo(c);
    const { PATCH } = await import("@/app/api/risks/[id]/route");
    await c.f.vao(c.pm, c.projectId);
    const r = await goi(
      rq(() => PATCH(jreq(`/api/risks/${id}`, { status: "closed" }, "PATCH"), P(id))),
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await anh(`SELECT status FROM risks WHERE id = ?`, id), [
      { status: "closed" },
    ]);
  }),
);

async function taoHop(c: Ca): Promise<number> {
  return chen(
    `INSERT INTO meetings (meeting_date, kind, title, created_by, project_id) VALUES (?, 'weekly', 'Họp gốc', ?, ?)`,
    HOM_NAY,
    c.pm.id,
    c.projectId,
  );
}

test(
  "D01 hiện trường: PATCH /api/meetings/:id — siết manageMeetings giữa chừng ⇒ 403, tiêu đề giữ",
  S,
  () =>
    voiCa("S16HT-meet", async (c) => {
      const id = await taoHop(c);
      const { PATCH } = await import("@/app/api/meetings/[id]/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageMeetings",
        `/api/meetings/${id}`,
        "PATCH",
        { meetingDate: HOM_NAY, kind: "weekly", title: "Sửa stale" },
        (req) => PATCH(req, P(id)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.deepEqual(await anh(`SELECT title FROM meetings WHERE id = ?`, id), [
        { title: "Họp gốc" },
      ]);
    }),
);

test(
  "D01 hiện trường: PATCH /api/meetings/:id/actions/:aid (sửa nội dung) — siết giữa chừng ⇒ 403",
  S,
  () =>
    voiCa("S16HT-maid", async (c) => {
      const mid = await taoHop(c);
      const aid = await chen(
        `INSERT INTO meeting_actions (meeting_id, content) VALUES (?, 'Gốc')`,
        mid,
      );
      const { PATCH } = await import("@/app/api/meetings/[id]/actions/[aid]/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageMeetings",
        `/api/meetings/${mid}/actions/${aid}`,
        "PATCH",
        { content: "Sửa stale" },
        (req) => PATCH(req, { params: Promise.resolve({ id: String(mid), aid: String(aid) }) }),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.deepEqual(await anh(`SELECT content FROM meeting_actions WHERE id = ?`, aid), [
        { content: "Gốc" },
      ]);
    }),
);

test(
  "D01 hiện trường: PATCH /api/correspondences/:id — siết manageCorrespondence giữa chừng ⇒ 403",
  S,
  () =>
    voiCa("S16HT-cvp", async (c) => {
      const id = await taoCongVan(c);
      const { PATCH } = await import("@/app/api/correspondences/[id]/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageCorrespondence",
        `/api/correspondences/${id}`,
        "PATCH",
        { subject: "Sửa stale" },
        (req) => PATCH(req, P(id)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.deepEqual(await anh(`SELECT subject FROM correspondences WHERE id = ?`, id), [
        { subject: "Gốc" },
      ]);
    }),
);

async function taoBanGiao(c: Ca): Promise<number> {
  return chen(
    `INSERT INTO handover_items (project_id, title, status, created_by) VALUES (?, 'BG gốc', 'pending', ?)`,
    c.projectId,
    c.pm.id,
  );
}

test(
  "D01 hiện trường: PATCH /api/handover-items/:id — siết manageHandover khi R1 kẹt ⇒ 403 (kiemQuyenTaiLucGhi sau FOR UPDATE)",
  S,
  () =>
    voiCa("S16HT-hov", async (c) => {
      const id = await taoBanGiao(c);
      const { PATCH } = await import("@/app/api/handover-items/[id]/route");
      const r1 = await thuHoiQuaBody(
        c,
        "manageHandover",
        `/api/handover-items/${id}`,
        "PATCH",
        { title: "Sửa stale" },
        (req) => PATCH(req, P(id)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.deepEqual(await anh(`SELECT title FROM handover_items WHERE id = ?`, id), [
        { title: "BG gốc" },
      ]);
    }),
);

test(
  "D01 hiện trường: PATCH /api/handover-items/:id status=accepted — siết approve giữa chừng ⇒ 403 thông điệp nghiệm thu",
  S,
  () =>
    voiCa("S16HT-hov-acc", async (c) => {
      const id = await taoBanGiao(c);
      const { PATCH } = await import("@/app/api/handover-items/[id]/route");
      const r1 = await thuHoiQuaBody(
        c,
        "approve",
        `/api/handover-items/${id}`,
        "PATCH",
        { status: "accepted" },
        (req) => PATCH(req, P(id)),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.equal(r1.body?.error, "Chỉ Admin/PM được đặt trạng thái Đã nghiệm thu");
      assert.deepEqual(await anh(`SELECT status FROM handover_items WHERE id = ?`, id), [
        { status: "pending" },
      ]);
    }),
);

test(
  "D01 hiện trường (đối chứng): PATCH /api/handover-items/:id qua cùng điểm chèn, không đổi quyền ⇒ 200",
  S,
  () =>
    voiCa("S16HT-hov-ok", async (c) => {
      const id = await taoBanGiao(c);
      const { PATCH } = await import("@/app/api/handover-items/[id]/route");
      await c.f.vao(c.pm, c.projectId);
      const t = await reqTreo(`/api/handover-items/${id}`, "PATCH", { title: "Mới" });
      const dangBay = goi(rq(async () => PATCH(t.req, P(id))));
      await t.daDoc;
      t.mo();
      const r = await dangBay;
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(await anh(`SELECT title FROM handover_items WHERE id = ?`, id), [
        { title: "Mới" },
      ]);
    }),
);

// ── 4. DELETE (khoá bảng) — dòng còn nguyên ────────────────────────────────────────────────

type CaXoa = {
  ten: string;
  perm: string;
  bang: string;
  tao: (c: Ca) => Promise<number>;
  route: () => Promise<{
    DELETE: (req: NextRequest, p: ReturnType<typeof P>) => Promise<Response>;
  }>;
};

const CA_XOA: CaXoa[] = [
  {
    ten: "crews",
    perm: "manageHr",
    bang: "crews",
    tao: (c) =>
      chen(`INSERT INTO crews (project_id, name) VALUES (?, ?)`, c.projectId, uniq("Tổ X ")),
    route: () => import("@/app/api/crews/[id]/route"),
  },
  {
    ten: "personnel",
    perm: "manageHr",
    bang: "personnel",
    tao: (c) =>
      chen(`INSERT INTO personnel (project_id, full_name) VALUES (?, 'NS X')`, c.projectId),
    route: () => import("@/app/api/personnel/[id]/route"),
  },
  {
    ten: "attendance",
    perm: "recordAttendance",
    bang: "attendance",
    tao: async (c) => {
      const crewId = await chen(
        `INSERT INTO crews (project_id, name) VALUES (?, ?)`,
        c.projectId,
        uniq("Tổ CC "),
      );
      return chen(
        `INSERT INTO attendance (project_id, work_date, crew_id, headcount) VALUES (?, ?, ?, 3)`,
        c.projectId,
        HOM_NAY,
        crewId,
      );
    },
    route: () => import("@/app/api/attendance/[id]/route"),
  },
  {
    ten: "mobilization",
    perm: "manageKickoff",
    bang: "mobilization_items",
    tao: (c) =>
      chen(
        `INSERT INTO mobilization_items (project_id, category, title, status) VALUES (?, 'khac', 'HM X', 'pending')`,
        c.projectId,
      ),
    route: () => import("@/app/api/mobilization/[id]/route"),
  },
  {
    ten: "demob",
    perm: "manageHandover",
    bang: "demob_items",
    tao: (c) =>
      chen(
        `INSERT INTO demob_items (project_id, title, status) VALUES (?, 'Tháo X', 'pending')`,
        c.projectId,
      ),
    route: () => import("@/app/api/demob/[id]/route"),
  },
  {
    ten: "waste-logs",
    perm: "manageEnv",
    bang: "waste_logs",
    tao: (c) =>
      chen(
        `INSERT INTO waste_logs (project_id, log_date, waste_type) VALUES (?, ?, 'khac')`,
        c.projectId,
        HOM_NAY,
      ),
    route: () => import("@/app/api/waste-logs/[id]/route"),
  },
  {
    ten: "community-cases",
    perm: "manageMonitoring",
    bang: "community_cases",
    tao: (c) =>
      chen(
        `INSERT INTO community_cases (project_id, title, status) VALUES (?, 'KN X', 'open')`,
        c.projectId,
      ),
    route: () => import("@/app/api/community-cases/[id]/route"),
  },
  {
    ten: "warranty-claims",
    perm: "manageWarranty",
    bang: "warranty_claims",
    tao: (c) =>
      chen(
        `INSERT INTO warranty_claims (project_id, description, status) VALUES (?, 'Lỗi X', 'open')`,
        c.projectId,
      ),
    route: () => import("@/app/api/warranty-claims/[id]/route"),
  },
  {
    ten: "warranty-items",
    perm: "manageWarranty",
    bang: "warranty_items",
    tao: (c) =>
      chen(
        `INSERT INTO warranty_items (project_id, title, status) VALUES (?, 'BH X', 'active')`,
        c.projectId,
      ),
    route: () => import("@/app/api/warranty-items/[id]/route"),
  },
  {
    ten: "lessons-learned",
    perm: "manageHandover",
    bang: "lessons_learned",
    tao: (c) =>
      chen(`INSERT INTO lessons_learned (project_id, title) VALUES (?, 'BH X')`, c.projectId),
    route: () => import("@/app/api/lessons-learned/[id]/route"),
  },
  {
    ten: "punch-list",
    perm: "manageHandover",
    bang: "punch_list",
    tao: (c) =>
      chen(
        `INSERT INTO punch_list (project_id, description, status) VALUES (?, 'TT X', 'open')`,
        c.projectId,
      ),
    route: () => import("@/app/api/punch-list/[id]/route"),
  },
  {
    ten: "legal-documents",
    perm: "manageKickoff",
    bang: "legal_documents",
    tao: (c) =>
      chen(
        `INSERT INTO legal_documents (project_id, kind, title, status) VALUES (?, 'khac', 'PL X', 'valid')`,
        c.projectId,
      ),
    route: () => import("@/app/api/legal-documents/[id]/route"),
  },
  {
    ten: "handover-items",
    perm: "manageHandover",
    bang: "handover_items",
    tao: (c) => taoBanGiao(c),
    route: () => import("@/app/api/handover-items/[id]/route"),
  },
  {
    // Ảnh do người khác upload ⇒ PM chỉ xoá được nhờ CAN.manageHse (nhánh có override).
    ten: "hse-photos",
    perm: "manageHse",
    bang: "hse_photos",
    tao: async (c) => {
      const rid = await chen(
        `INSERT INTO hse_records (kind, record_date, description, action_required, action_status, created_by, project_id)
         VALUES ('toolbox', ?, 'Có ảnh', false, 'none', ?, ?)`,
        HOM_NAY,
        c.admin.id,
        c.projectId,
      );
      return chen(
        `INSERT INTO hse_photos (record_id, file_path, mime, uploaded_by) VALUES (?, ?, 'image/jpeg', ?)`,
        rid,
        `${uniq("s16-hse-")}.jpg`,
        c.admin.id,
      );
    },
    route: () => import("@/app/api/hse-photos/[id]/route"),
  },
  {
    ten: "correspondence-files",
    perm: "manageCorrespondence",
    bang: "correspondence_files",
    tao: async (c) =>
      chen(
        `INSERT INTO correspondence_files (correspondence_id, file_name, mime_type, uploaded_by)
         VALUES (?, ?, 'application/pdf', ?)`,
        await taoCongVan(c),
        `${uniq("s16-cvf-")}.pdf`,
        c.admin.id,
      ),
    route: () => import("@/app/api/correspondence-files/[id]/route"),
  },
  {
    ten: "project-documents",
    perm: "editStructure",
    bang: "project_documents",
    tao: (c) =>
      chen(
        `INSERT INTO project_documents (title, file_name, mime_type, uploaded_by, project_id)
         VALUES ('HS X', ?, 'application/pdf', ?, ?)`,
        `${uniq("s16-pd-")}.pdf`,
        c.admin.id,
        c.projectId,
      ),
    route: () => import("@/app/api/project-documents/[id]/route"),
  },
  {
    // Theo tổ chức (không theo dự án) — override vẫn đặt theo dự án đang chọn của PM.
    ten: "subcon-documents",
    perm: "manageSuppliers",
    bang: "subcon_documents",
    tao: async (c) => {
      const sid = await chen(
        `INSERT INTO suppliers (name, org_id) VALUES (?, 1)`,
        uniq("NTP S16 "),
      );
      supplierCuaCa.set(c.projectId, [sid]);
      return chen(
        `INSERT INTO subcon_documents (supplier_id, title, file_name, mime_type, uploaded_by)
         VALUES (?, 'HSNL X', ?, 'application/pdf', ?)`,
        sid,
        `${uniq("s16-sd-")}.pdf`,
        c.admin.id,
      );
    },
    route: () => import("@/app/api/subcon-documents/[id]/route"),
  },
];

for (const ca of CA_XOA) {
  test(
    `D01 hiện trường: DELETE /api/${ca.ten}/:id — admin siết ${ca.perm} khi R1 kẹt khoá bảng ⇒ 403, dòng còn`,
    S,
    () =>
      voiCa(`S16HT-x-${ca.ten}`, async (c) => {
        const id = await ca.tao(c);
        const { DELETE } = await ca.route();
        const r1 = await chenGiuaKhoa(
          c,
          ca.bang,
          ca.perm,
          (req) => DELETE(req, P(id)),
          jreq(`/api/${ca.ten}/${id}`, undefined, "DELETE"),
        );
        assert.equal(r1.status, 403, `R1 ghi bằng snapshot stale: ${JSON.stringify(r1.body)}`);
        assert.equal(await conDong(ca.bang, id), true);
      }),
  );
}

test(
  "D01 hiện trường (đối chứng): DELETE /api/legal-documents/:id qua cùng điểm chèn khoá, không đổi quyền ⇒ 200, dòng mất",
  S,
  () =>
    voiCa("S16HT-x-ok", async (c) => {
      const id = await chen(
        `INSERT INTO legal_documents (project_id, kind, title, status) VALUES (?, 'khac', 'PL OK', 'valid')`,
        c.projectId,
      );
      const { DELETE } = await import("@/app/api/legal-documents/[id]/route");
      const r = await chenGiuaKhoa(
        c,
        "legal_documents",
        null,
        (req) => DELETE(req, P(id)),
        jreq(`/api/legal-documents/${id}`, undefined, "DELETE"),
      );
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await conDong("legal_documents", id), false);
    }),
);

test("D01 hiện trường (thành công): DELETE /api/crews/:id + /api/punch-list/:id ⇒ 200", S, () =>
  voiCa("S16HT-x-ok2", async (c) => {
    const crewId = await chen(
      `INSERT INTO crews (project_id, name) VALUES (?, ?)`,
      c.projectId,
      uniq("Tổ Xoá "),
    );
    const punchId = await chen(
      `INSERT INTO punch_list (project_id, description, status) VALUES (?, 'TT', 'open')`,
      c.projectId,
    );
    const { DELETE: xoaTo } = await import("@/app/api/crews/[id]/route");
    const { DELETE: xoaTt } = await import("@/app/api/punch-list/[id]/route");
    await c.f.vao(c.pm, c.projectId);
    const a = await goi(rq(() => xoaTo(jreq(`/x`, undefined, "DELETE"), P(crewId))));
    assert.equal(a.status, 200, JSON.stringify(a.body));
    const b = await goi(rq(() => xoaTt(jreq(`/x`, undefined, "DELETE"), P(punchId))));
    assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.equal(await conDong("crews", crewId), false);
    assert.equal(await conDong("punch_list", punchId), false);
  }),
);
