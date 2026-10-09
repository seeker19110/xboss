import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import type { Role } from "@/lib/nen/roles";

// M131 §3 — khôi phục vault offline khi mất proof (admin duyệt) qua ROUTE THẬT, phiên ký thật.
//
// Route chạy bằng role ứng dụng `xboss_app` (NOBYPASSRLS) như production — policy/grant của 0163 +
// 0170 được thực thi thật (superuser bỏ qua RLS → xanh giả, ADR-0005). Fixture/dọn dẹp dùng pool
// owner riêng (TEST_DATABASE_URL). Khuôn harness: tests/offline-vault-route.test.ts.
//
// Map tiêu chí M131 §4 (Recovery): user khác/org khác/thiết bị không thuộc mình → 404/403; Admin
// tự duyệt yêu cầu của mình → 403; approve thu hồi thiết bị cũ; complete từ thiết bị khác thiết bị
// mới → 403; khoá mất quyền bị bỏ qua (mất membership dự án + task bị xoá); khoá mới mở được bằng
// vault/unlock từ thiết bị mới ra ĐÚNG DEK cũ; không phản hồi nào chứa vật liệu khoá; chuyển trạng
// thái chỉ đi pending → approved/rejected → completed.

const S = { skip: !HAS_TEST_DB };

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}
if (HAS_TEST_DB) process.env.DATABASE_URL = appConnString();

const KEK_V1 = `v1:${"r".repeat(40)}`;
const RUN = Date.now().toString(36);

const own = HAS_TEST_DB
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 })
  : (null as unknown as Pool);

type U = {
  id: number;
  passwordHash: string;
  orgId: number;
  role: Role;
  sessionVersion: number;
};
const F = {
  org2: 0,
  p1: 0,
  p2: 0,
  p3: 0,
  t1: 0,
  t2: 0,
  t3: 0,
  t4: 0,
  users: [] as number[],
  orgs: [] as number[],
  projects: [] as number[],
  u: {} as Record<string, U>,
};

/** Mọi body JSON phản hồi trong file — cuối file kiểm không chứa vật liệu khoá nào. */
const PHAN_HOI: string[] = [];
/** DEK (base64url) các khoá đã cấp — không được xuất hiện ngoài phản hồi cấp/mở khoá. */
const DEK_DA_CAP: string[] = [];

async function taoUser(ten: string, role: Role, orgId: number, totp = false): Promise<U> {
  const hash = `hash-m131-${ten}-${RUN}`;
  const r = await own.query<{ id: number }>(
    `INSERT INTO users (name, email, password_hash, role, org_id, totp_enabled_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [`M131 ${ten}`, `m131-${ten}-${RUN}@test.local`, hash, role, orgId, totp ? new Date() : null],
  );
  F.users.push(r.rows[0].id);
  return { id: r.rows[0].id, passwordHash: hash, orgId, role, sessionVersion: 0 };
}

async function taoDuAn(ten: string, orgId: number): Promise<number> {
  const r = await own.query<{ id: number }>(
    `INSERT INTO projects (name, org_id) VALUES ($1, $2) RETURNING id`,
    [`M131 ${ten} ${RUN}`, orgId],
  );
  F.projects.push(r.rows[0].id);
  return r.rows[0].id;
}

async function taoTask(projectId: number, ma: string): Promise<number> {
  const tw = await own.query<{ id: number }>(
    `INSERT INTO towers (project_id, name) VALUES ($1, 'Tháp M131') RETURNING id`,
    [projectId],
  );
  const code = `M131${ma}${RUN}`;
  const st = await own.query<{ id: number }>(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES ($1, $2, 'Sheet M131', $3) RETURNING id`,
    [tw.rows[0].id, code, code.toLowerCase()],
  );
  const wp = await own.query<{ id: number }>(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES ($1, $2, 'Nhóm', 1) RETURNING id`,
    [st.rows[0].id, `PK${code}`],
  );
  const t = await own.query<{ id: number }>(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
     VALUES ($1, $2, 'Task M131', 1, 0, 'chuan_bi') RETURNING id`,
    [wp.rows[0].id, `TK${code}`],
  );
  return t.rows[0].id;
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const o = await own.query<{ id: number }>(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
    [`M131 Org2 ${RUN}`],
  );
  F.org2 = o.rows[0].id;
  F.orgs.push(F.org2);
  F.u.admin = await taoUser("admin", "admin", 1, true);
  F.u.admin2 = await taoUser("admin2", "admin", 1, true);
  F.u.admin2fa0 = await taoUser("admin-no2fa", "admin", 1, false);
  F.u.a = await taoUser("eng-a", "engineer", 1);
  F.u.b = await taoUser("eng-b", "engineer", 1);
  F.u.x = await taoUser("admin-org2", "admin", F.org2, true);
  F.u.ex = await taoUser("eng-org2", "engineer", F.org2);
  F.u.rl = await taoUser("rate", "engineer", 1);
  F.p1 = await taoDuAn("P1", 1);
  F.p2 = await taoDuAn("P2", 1);
  F.p3 = await taoDuAn("P3", F.org2);
  F.t1 = await taoTask(F.p1, "T1");
  F.t2 = await taoTask(F.p1, "T2");
  F.t3 = await taoTask(F.p2, "T3");
  F.t4 = await taoTask(F.p1, "T4");
});

after(async () => {
  dangXuat();
  if (!HAS_TEST_DB) return;
  const ids = F.users;
  await own.query(`DELETE FROM offline_vault_recovery_requests WHERE user_id = ANY($1::int[])`, [
    ids,
  ]);
  await own.query(`DELETE FROM offline_vault_keys WHERE user_id = ANY($1::int[])`, [ids]);
  await own.query(`DELETE FROM offline_devices WHERE user_id = ANY($1::int[])`, [ids]);
  await own.query(
    `DELETE FROM login_rate_limits WHERE key ~ '^offline-' AND split_part(key, ':', 2) = ANY($1::text[])`,
    [ids.map(String)],
  );
  await own.query(`DELETE FROM user_projects WHERE user_id = ANY($1::int[])`, [ids]);
  for (const pid of F.projects) {
    await own.query(
      `DELETE FROM tasks WHERE package_id IN (SELECT wp.id FROM work_packages wp
         JOIN sheet_types st ON st.id = wp.sheet_type_id JOIN towers tw ON tw.id = st.tower_id
        WHERE tw.project_id = $1)`,
      [pid],
    );
    await own.query(
      `DELETE FROM work_packages WHERE sheet_type_id IN (SELECT st.id FROM sheet_types st
         JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = $1)`,
      [pid],
    );
    await own.query(
      `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = $1)`,
      [pid],
    );
    await own.query(`DELETE FROM towers WHERE project_id = $1`, [pid]);
    await own.query(`DELETE FROM projects WHERE id = $1`, [pid]);
  }
  await own.query(`DELETE FROM notifications WHERE user_id = ANY($1::int[])`, [ids]);
  await own.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids]);
  await own.query(`DELETE FROM organizations WHERE id = ANY($1::int[])`, [F.orgs]);
  await own.end();
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────────────────

type Opt = { body?: unknown; proof?: string | null; ctx?: string; origin?: string | null };
function req(method: string, url: string, o: Opt = {}): NextRequest {
  const h: Record<string, string> = { host: "localhost" };
  if (o.origin !== null) h.origin = o.origin ?? "http://localhost";
  if (o.proof) h.cookie = `xboss_offline_proof=${o.proof}`;
  if (o.ctx) h["x-xboss-context"] = o.ctx;
  if (o.body !== undefined) h["content-type"] = "application/json";
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: h,
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
}
const PID = (id: string) => ({ params: Promise.resolve({ id }) });

const r = {
  devices: () => import("@/app/api/offline/devices/route"),
  context: () => import("@/app/api/offline/context/route"),
  keys: () => import("@/app/api/offline/vault/keys/route"),
  unlock: () => import("@/app/api/offline/vault/unlock/route"),
  recovery: () => import("@/app/api/offline/recovery/route"),
  decide: () => import("@/app/api/offline/recovery/[id]/route"),
  complete: () => import("@/app/api/offline/recovery/[id]/complete/route"),
};

/** Đọc JSON + ghi lại phản hồi để kiểm "không lộ khoá" cuối file. */
async function doc(res: Response) {
  const text = await res.text();
  PHAN_HOI.push(text);
  return text ? JSON.parse(text) : null;
}

const vao = (u: U, projectId: number | null) => dangNhapDuAn(u, projectId);

async function dangKy(u: U, projectId: number, proof?: string) {
  await vao(u, projectId);
  const res = await (await r.devices()).POST(req("POST", "/api/offline/devices", { proof }));
  const j = await res.json();
  const c = res.cookies.get("xboss_offline_proof");
  return { res, j, proof: c?.value ?? proof ?? "", deviceId: j.device?.id as string };
}

async function layContext(u: U, projectId: number, proof: string) {
  await vao(u, projectId);
  const res = await (await r.context()).POST(req("POST", "/api/offline/context", { proof }));
  return (await res.json()).context?.contextId as string;
}

async function capKhoa(u: U, projectId: number, proof: string, manifest: unknown) {
  const ctx = await layContext(u, projectId, proof);
  const res = await (
    await r.keys()
  ).POST(req("POST", "/api/offline/vault/keys", { proof, ctx, body: { manifest } }));
  const j = await res.json();
  assert.equal(res.status, 201, JSON.stringify(j));
  DEK_DA_CAP.push(j.key.dek);
  return j.key as { keyId: string; keyVersion: number; dek: string };
}

async function guiYeuCau(u: U, proof: string | null, body: unknown, origin?: string | null) {
  await vao(u, F.p1);
  const res = await (
    await r.recovery()
  ).POST(req("POST", "/api/offline/recovery", { proof, body, origin }));
  return { res, j: await doc(res) };
}

async function xemYeuCau(u: U) {
  await vao(u, F.p1);
  const res = await (await r.recovery()).GET(req("GET", "/api/offline/recovery"));
  return { res, j: await doc(res) };
}

async function quyetDinh(u: U, id: string, body: unknown, origin?: string | null) {
  await vao(u, F.p1);
  const res = await (
    await r.decide()
  ).PATCH(req("PATCH", `/api/offline/recovery/${id}`, { body, origin }), PID(id));
  return { res, j: await doc(res) };
}

async function hoanTat(u: U, id: string, proof: string | null, origin?: string | null) {
  await vao(u, F.p1);
  const res = await (
    await r.complete()
  ).POST(req("POST", `/api/offline/recovery/${id}/complete`, { proof, origin }), PID(id));
  return { res, j: await doc(res) };
}

function batKek() {
  process.env.XBOSS_OFFLINE_KEK = KEK_V1;
}

const xoaRateLimit = (u: U) =>
  own.query(`DELETE FROM login_rate_limits WHERE key ~ $1`, [`^offline-recovery[^:]*:${u.id}$`]);

/** Duyệt thu hồi thiết bị cũ tăng session_version của chủ — đồng bộ lại phiên ký trong test. */
async function dongBoPhien(u: U) {
  const { rows } = await own.query<{ sv: number }>(
    `SELECT session_version AS sv FROM users WHERE id = $1`,
    [u.id],
  );
  u.sessionVersion = rows[0].sv;
}

// ── Trạng thái dùng chung giữa các ca (cùng "trình duyệt" của từng người) ────────────────────

const A = { proofCu: "", tbCu: "", proofMoi: "", tbMoi: "", yc: "", k1: "", dek1: "", k2: "" };

test("401 khi chưa đăng nhập; 403 origin_rejected khi khác Origin", S, async () => {
  batKek();
  dangXuat();
  const id = "00000000-0000-4000-8000-000000000000";
  for (const res of [
    await (await r.recovery()).GET(req("GET", "/api/offline/recovery")),
    await (await r.recovery()).POST(req("POST", "/api/offline/recovery", { body: {} })),
    await (await r.decide()).PATCH(req("PATCH", `/api/offline/recovery/${id}`), PID(id)),
    await (await r.complete()).POST(req("POST", `/api/offline/recovery/${id}/complete`), PID(id)),
  ]) {
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  }
  for (const origin of [null, "https://evil.example"]) {
    assert.equal((await guiYeuCau(F.u.a, null, {}, origin)).j.code, "origin_rejected");
    assert.equal((await quyetDinh(F.u.admin, id, {}, origin)).j.code, "origin_rejected");
    assert.equal((await hoanTat(F.u.a, id, null, origin)).j.code, "origin_rejected");
  }
});

test("KEK tắt: tạo/hoàn tất → 503 (fail-closed); xem danh sách vẫn được", S, async () => {
  delete process.env.XBOSS_OFFLINE_KEK;
  const id = "00000000-0000-4000-8000-000000000000";
  const tao = await guiYeuCau(F.u.a, null, { oldDeviceId: id });
  assert.equal(tao.res.status, 503);
  assert.equal(tao.j.code, "offline_vault_disabled");
  assert.equal((await hoanTat(F.u.a, id, null)).res.status, 503);
  assert.equal((await xemYeuCau(F.u.a)).res.status, 200);
  batKek();
});

test(
  "chuẩn bị: thiết bị cũ có khoá P1/P2, mất proof → đăng ký trình duyệt mới (thiết bị mới)",
  S,
  async () => {
    batKek();
    const cu = await dangKy(F.u.a, F.p1);
    assert.equal(cu.res.status, 201);
    A.proofCu = cu.proof;
    A.tbCu = cu.deviceId;
    const k1 = await capKhoa(F.u.a, F.p1, A.proofCu, { tasks: [F.t2], taskActions: ["tick"] });
    // Khoá của task sẽ bị xoá (mất quyền tài nguyên trong dự án còn thấy).
    await capKhoa(F.u.a, F.p1, A.proofCu, { tasks: [F.t4], taskActions: ["tick"] });
    const k2 = await capKhoa(F.u.a, F.p2, A.proofCu, { tasks: [F.t3], taskActions: ["tick"] });
    A.k1 = k1.keyId;
    A.dek1 = k1.dek;
    A.k2 = k2.keyId;

    // Mất cookie proof (xoá dữ liệu trình duyệt) → đăng ký lại = thiết bị mới.
    const moi = await dangKy(F.u.a, F.p1);
    assert.equal(moi.res.status, 201);
    assert.notEqual(moi.deviceId, A.tbCu);
    A.proofMoi = moi.proof;
    A.tbMoi = moi.deviceId;
    // Thiết bị mới đã có 1 khoá P1 → khoá khôi phục phải lấy key_version kế tiếp (2).
    await capKhoa(F.u.a, F.p1, A.proofMoi, { tasks: [F.t2], taskActions: ["photo"] });

    // Thiết bị mới không mở được khoá của thiết bị cũ (đúng fail-closed trước khôi phục).
    const ctx = await layContext(F.u.a, F.p1, A.proofMoi);
    const mo = await (
      await r.unlock()
    ).POST(
      req("POST", "/api/offline/vault/unlock", {
        proof: A.proofMoi,
        ctx,
        body: { keyIds: [A.k1] },
      }),
    );
    assert.deepEqual((await mo.json()).locked, [{ keyId: A.k1 }]);
  },
);

test(
  "tạo yêu cầu: chỉ thiết bị CŨ của chính mình; trùng → 409; báo Admin cùng org (trừ người yêu cầu)",
  S,
  async () => {
    batKek();
    // Chưa đăng ký trình duyệt này → 403 (thiết bị mới phải là proof hiện tại).
    const chuaDk = await guiYeuCau(F.u.a, null, { oldDeviceId: A.tbCu });
    assert.equal(chuaDk.res.status, 403);
    assert.equal(chuaDk.j.code, "device_unregistered");
    // Sai body.
    assert.equal((await guiYeuCau(F.u.a, A.proofMoi, {})).res.status, 422);
    assert.equal(
      (await guiYeuCau(F.u.a, A.proofMoi, { oldDeviceId: A.tbCu, reason: "x".repeat(501) })).res
        .status,
      422,
    );
    await xoaRateLimit(F.u.a);
    // Thiết bị cũ = chính trình duyệt đang dùng.
    const trung = await guiYeuCau(F.u.a, A.proofMoi, { oldDeviceId: A.tbMoi });
    assert.equal(trung.res.status, 422);
    assert.equal(trung.j.code, "same_device");
    // Thiết bị của người khác (cùng org) / org khác → 404, không lộ tồn tại.
    const tbB = await dangKy(F.u.b, F.p1);
    const tbX = await dangKy(F.u.ex, F.p3);
    for (const khac of [tbB.deviceId, tbX.deviceId, "khong-phai-uuid"]) {
      const kq = await guiYeuCau(F.u.a, A.proofMoi, { oldDeviceId: khac });
      assert.equal(kq.res.status, 404, khac);
      assert.equal(kq.j.code, "device_not_found");
    }
    await xoaRateLimit(F.u.a);

    const tao = await guiYeuCau(F.u.a, A.proofMoi, {
      oldDeviceId: A.tbCu,
      reason: "  Xoá dữ liệu trình duyệt, còn nháp chưa gửi  ",
    });
    assert.equal(tao.res.status, 201, JSON.stringify(tao.j));
    assert.equal(tao.res.headers.get("cache-control"), "private, no-store");
    const yc = tao.j.request;
    assert.equal(yc.status, "pending");
    assert.equal(yc.userId, F.u.a.id);
    assert.equal(yc.oldDeviceId, A.tbCu);
    assert.equal(yc.newDeviceId, A.tbMoi);
    assert.equal(yc.reason, "Xoá dữ liệu trình duyệt, còn nháp chưa gửi");
    A.yc = yc.id;

    const lai = await guiYeuCau(F.u.a, A.proofMoi, { oldDeviceId: A.tbCu });
    assert.equal(lai.res.status, 409);
    assert.equal(lai.j.code, "recovery_exists");

    const tb = await own.query<{ user_id: number }>(
      `SELECT user_id FROM notifications WHERE type = 'offline_recovery_pending'
        AND user_id = ANY($1::int[]) ORDER BY user_id`,
      [F.users],
    );
    assert.deepEqual(
      tb.rows.map((x) => x.user_id),
      [F.u.admin.id, F.u.admin2.id, F.u.admin2fa0.id].sort((x, y) => x - y),
      "chỉ Admin cùng org nhận thông báo, Admin org khác thì không",
    );
  },
);

test("rate limit tạo yêu cầu: 5 lần/ngày/người → lần 6 là 429", S, async () => {
  batKek();
  const d = await dangKy(F.u.rl, F.p1);
  const sai = "00000000-0000-4000-8000-000000000000";
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await guiYeuCau(F.u.rl, d.proof, { oldDeviceId: sai })).res.status,
      404,
      `lần ${i + 1}`,
    );
  const qua = await guiYeuCau(F.u.rl, d.proof, { oldDeviceId: sai });
  assert.equal(qua.res.status, 429);
  assert.equal(qua.res.headers.get("retry-after"), String(24 * 60 * 60));
});

test(
  "xem danh sách: chủ thấy của mình, Admin thấy cả org, người khác/org khác không",
  S,
  async () => {
    const cuaA = await xemYeuCau(F.u.a);
    assert.deepEqual(
      cuaA.j.requests.map((x: { id: string }) => x.id),
      [A.yc],
    );
    assert.deepEqual((await xemYeuCau(F.u.b)).j.requests, []);
    assert.ok((await xemYeuCau(F.u.admin)).j.requests.some((x: { id: string }) => x.id === A.yc));
    assert.deepEqual((await xemYeuCau(F.u.x)).j.requests, [], "Admin org khác không thấy");
  },
);

test("hoàn tất trước khi duyệt → 409; người khác hoàn tất → 404", S, async () => {
  batKek();
  const som = await hoanTat(F.u.a, A.yc, A.proofMoi);
  assert.equal(som.res.status, 409);
  assert.equal(som.j.code, "recovery_not_approved");
  const tbB = await dangKy(F.u.b, F.p1);
  const khac = await hoanTat(F.u.b, A.yc, tbB.proof);
  assert.equal(khac.res.status, 404);
  assert.equal(khac.j.code, "recovery_not_found");
});

test(
  "quyết định: không phải Admin/thiếu 2FA → 403; Admin org khác → 404; body sai → 422",
  S,
  async () => {
    const eng = await quyetDinh(F.u.b, A.yc, { decision: "approve" });
    assert.equal(eng.res.status, 403);
    assert.equal(eng.j.code, "forbidden");
    const no2fa = await quyetDinh(F.u.admin2fa0, A.yc, { decision: "approve" });
    assert.equal(no2fa.res.status, 403);
    assert.equal(no2fa.j.code, "two_factor_required");
    const org2 = await quyetDinh(F.u.x, A.yc, { decision: "approve" });
    assert.equal(org2.res.status, 404);
    assert.equal(org2.j.code, "recovery_not_found");
    assert.equal((await quyetDinh(F.u.admin, A.yc, { decision: "ok" })).res.status, 422);
    const { rows } = await own.query(
      `SELECT status FROM offline_vault_recovery_requests WHERE id = $1`,
      [A.yc],
    );
    assert.equal(rows[0].status, "pending");
  },
);

test(
  "SoD: Admin không tự duyệt/từ chối yêu cầu của chính mình (403); Admin khác từ chối → rejected, không thu hồi",
  S,
  async () => {
    batKek();
    const cu = await dangKy(F.u.admin, F.p1);
    const moi = await dangKy(F.u.admin, F.p1);
    const tao = await guiYeuCau(F.u.admin, moi.proof, { oldDeviceId: cu.deviceId });
    assert.equal(tao.res.status, 201);
    const id = tao.j.request.id as string;
    for (const decision of ["approve", "reject"]) {
      const tu = await quyetDinh(F.u.admin, id, { decision });
      assert.equal(tu.res.status, 403, decision);
      assert.equal(tu.j.code, "self_decision_forbidden");
    }
    const tuChoi = await quyetDinh(F.u.admin2, id, {
      decision: "reject",
      note: "Không xác minh được",
    });
    assert.equal(tuChoi.res.status, 200);
    assert.equal(tuChoi.j.request.status, "rejected");
    assert.equal(tuChoi.j.request.decidedBy, F.u.admin2.id);
    assert.equal(tuChoi.j.request.decideNote, "Không xác minh được");
    const tb = await own.query(`SELECT revoked_at FROM offline_devices WHERE id = $1`, [
      cu.deviceId,
    ]);
    assert.equal(tb.rows[0].revoked_at, null, "từ chối không thu hồi thiết bị cũ");
    const lai = await quyetDinh(F.u.admin2, id, { decision: "approve" });
    assert.equal(lai.res.status, 409);
    assert.equal(lai.j.code, "recovery_not_pending");
    // Bị từ chối → được gửi yêu cầu mới (không còn yêu cầu mở).
    await xoaRateLimit(F.u.admin);
    assert.equal(
      (await guiYeuCau(F.u.admin, moi.proof, { oldDeviceId: cu.deviceId })).res.status,
      201,
    );
    // Hoàn tất yêu cầu đã từ chối → 409.
    const ht = await hoanTat(F.u.admin, id, moi.proof);
    assert.equal(ht.res.status, 409);
  },
);

test(
  "duyệt: thu hồi thiết bị cũ CÙNG transaction (session_version tăng), phản hồi không có khoá",
  S,
  async () => {
    batKek();
    const sv = F.u.a.sessionVersion;
    const duyet = await quyetDinh(F.u.admin, A.yc, { decision: "approve" });
    assert.equal(duyet.res.status, 200, JSON.stringify(duyet.j));
    assert.equal(duyet.j.request.status, "approved");
    assert.equal(duyet.j.request.decidedBy, F.u.admin.id);
    assert.ok(duyet.j.request.decidedAt);
    const { rows } = await own.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM offline_devices WHERE id = $1`,
      [A.tbCu],
    );
    assert.ok(rows[0].revoked_at, "thiết bị cũ bị thu hồi");
    const moi = await own.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM offline_devices WHERE id = $1`,
      [A.tbMoi],
    );
    assert.equal(moi.rows[0].revoked_at, null, "thiết bị mới không bị đụng");
    await dongBoPhien(F.u.a);
    assert.equal(F.u.a.sessionVersion, sv + 1, "chủ thiết bị phải đăng nhập lại");
    // Duyệt lần nữa → 409.
    assert.equal((await quyetDinh(F.u.admin2, A.yc, { decision: "approve" })).res.status, 409);
  },
);

test(
  "hoàn tất: thiết bị cũ (đã thu hồi) / thiết bị thứ ba → 403; đúng thiết bị mới → khoá mới, mất quyền bị bỏ qua",
  S,
  async () => {
    batKek();
    // Mất quyền trước khi hoàn tất: rời dự án P2 (membership) + task T4 bị xoá.
    await own.query(`DELETE FROM user_projects WHERE user_id = $1 AND project_id = $2`, [
      F.u.a.id,
      F.p2,
    ]);
    await own.query(`DELETE FROM tasks WHERE id = $1`, [F.t4]);

    const cu = await hoanTat(F.u.a, A.yc, A.proofCu);
    assert.equal(cu.res.status, 403);
    assert.equal(cu.j.code, "device_revoked");
    const ba = await dangKy(F.u.a, F.p1);
    const thuBa = await hoanTat(F.u.a, A.yc, ba.proof);
    assert.equal(thuBa.res.status, 403);
    assert.equal(thuBa.j.code, "wrong_device");

    const xong = await hoanTat(F.u.a, A.yc, A.proofMoi);
    assert.equal(xong.res.status, 200, JSON.stringify(xong.j));
    assert.equal(xong.res.headers.get("cache-control"), "private, no-store");
    assert.equal(xong.j.skipped, 2, "khoá P2 (mất membership) + khoá task đã xoá");
    assert.equal(xong.j.mapping.length, 1);
    const map = xong.j.mapping[0] as { oldKeyId: string; newKeyId: string; oldKeyVersion: number };
    assert.equal(map.oldKeyId, A.k1);
    assert.equal(map.oldKeyVersion, 1);
    assert.notEqual(map.newKeyId, A.k1);
    assert.deepEqual(Object.keys(xong.j).sort(), ["mapping", "skipped"]);

    const { rows } = await own.query<{
      id: string;
      device_id: string;
      project_id: number;
      key_version: number;
      manifest_hash: string;
      permission_fingerprint: string;
      resource_manifest: unknown;
      wrapped_key: Buffer;
      kek_version: string;
      retired_at: Date | null;
    }>(`SELECT * FROM offline_vault_keys WHERE id = ANY($1::uuid[]) ORDER BY device_id = $2`, [
      [A.k1, map.newKeyId],
      A.tbMoi,
    ]);
    const [cuRow, moiRow] = rows;
    assert.equal(cuRow.id, A.k1);
    assert.equal(cuRow.retired_at, null, "khoá cũ giữ nguyên (không UPDATE/DELETE)");
    assert.equal(moiRow.device_id, A.tbMoi);
    assert.equal(moiRow.project_id, F.p1);
    assert.equal(moiRow.key_version, 2, "MAX+1 theo (thiết bị mới, dự án)");
    assert.equal(moiRow.manifest_hash, cuRow.manifest_hash);
    assert.equal(moiRow.permission_fingerprint, cuRow.permission_fingerprint);
    assert.deepEqual(moiRow.resource_manifest, cuRow.resource_manifest);
    assert.equal(moiRow.kek_version, "v1");
    assert.ok(!moiRow.wrapped_key.equals(cuRow.wrapped_key), "bọc lại với AAD mới");
    assert.ok(!moiRow.wrapped_key.includes(Buffer.from(A.dek1, "base64url")), "không lưu DEK thô");
    for (const w of [cuRow.wrapped_key, moiRow.wrapped_key])
      PHAN_HOI.forEach((p) => {
        assert.ok(!p.includes(w.toString("base64")), "phản hồi không chứa wrapped_key");
        assert.ok(!p.includes(w.toString("base64url")), "phản hồi không chứa wrapped_key");
        assert.ok(!p.includes(w.toString("hex")), "phản hồi không chứa wrapped_key");
      });

    const yc = await own.query(
      `SELECT status, completed_at, keys_recovered, keys_skipped
         FROM offline_vault_recovery_requests WHERE id = $1`,
      [A.yc],
    );
    assert.equal(yc.rows[0].status, "completed");
    assert.ok(yc.rows[0].completed_at);
    assert.equal(yc.rows[0].keys_recovered, 1);
    assert.equal(yc.rows[0].keys_skipped, 2);

    // Hoàn tất lại → 409 (completed là trạng thái cuối).
    const lai = await hoanTat(F.u.a, A.yc, A.proofMoi);
    assert.equal(lai.res.status, 409);
    assert.equal(lai.j.code, "recovery_not_approved");
    assert.equal((await quyetDinh(F.u.admin, A.yc, { decision: "reject" })).res.status, 409);
  },
);

test(
  "khoá khôi phục mở được qua vault/unlock THẬT từ thiết bị mới — ra đúng DEK của khoá cũ",
  S,
  async () => {
    batKek();
    const { rows } = await own.query<{ id: string }>(
      `SELECT id FROM offline_vault_keys WHERE device_id = $1 AND key_version = 2`,
      [A.tbMoi],
    );
    const moiId = rows[0].id;
    const ctx = await layContext(F.u.a, F.p1, A.proofMoi);
    const mo = await (
      await r.unlock()
    ).POST(
      req("POST", "/api/offline/vault/unlock", {
        proof: A.proofMoi,
        ctx,
        body: { keyIds: [moiId] },
      }),
    );
    const j = await mo.json();
    assert.equal(mo.status, 200);
    assert.equal(j.keys.length, 1);
    assert.equal(j.keys[0].keyId, moiId);
    assert.equal(j.keys[0].dek, A.dek1, "cùng DEK — bản nháp mã hoá bằng khoá cũ giải được");
    assert.equal(j.keys[0].retired, false);
    // Proof thiết bị cũ không mở được gì (đã thu hồi), kể cả khoá mới.
    await vao(F.u.a, F.p1);
    const cu = await (
      await r.unlock()
    ).POST(
      req("POST", "/api/offline/vault/unlock", {
        proof: A.proofCu,
        ctx,
        body: { keyIds: [moiId] },
      }),
    );
    assert.equal(cu.status, 403);
  },
);

test("không phản hồi khôi phục nào chứa DEK đã cấp", S, () => {
  assert.ok(PHAN_HOI.length > 20);
  for (const dek of DEK_DA_CAP)
    for (const p of PHAN_HOI) {
      assert.ok(!p.includes(dek), "phản hồi chứa DEK");
      assert.ok(!p.includes(Buffer.from(dek, "base64url").toString("base64")), "chứa DEK base64");
    }
  for (const p of PHAN_HOI) assert.ok(!/wrapped|"dek"/i.test(p), p);
});
