import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import type { Role } from "@/lib/nen/roles";

// QUALITY-FINAL-1 S05 — thiết bị/context/khoá vault qua ROUTE THẬT với phiên ký thật.
//
// Route chạy bằng role ứng dụng `xboss_app` (NOBYPASSRLS) như production: DATABASE_URL của tiến
// trình test này được đổi sang role đó TRƯỚC khi lib/db mở pool, nên mọi policy/grant của 0163
// được thực thi thật trên đường route (superuser sẽ bỏ qua RLS → xanh giả, ADR-0005). Fixture và
// dọn dẹp dùng pool owner riêng (TEST_DATABASE_URL).
//
// Map AC: Q-AC02 (owner đúng mới mở, B cùng proof không mở A, sửa manifest/AAD fail, thu hồi 1 task
// khoá manifest, đăng xuất giữ ciphertext, xoay KEK/đổi mật khẩu không mất), Q-AC03 (không tự nâng
// field-personal, Admin cùng org + 2FA mới duyệt, lease 15m/8h, thiết bị bị thu hồi, A→B→A),
// A2-AC09 (online bị thu hồi → không trả khoá), A2-FR03 (context lệch → 409).

const S = { skip: !HAS_TEST_DB };

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}
if (HAS_TEST_DB) process.env.DATABASE_URL = appConnString();

const KEK_V1 = `v1:${"k".repeat(40)}`;
const KEK_V2 = `v2:${"m".repeat(40)}`;
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
  /** Trạng thái tích luỹ qua các ca (cùng "trình duyệt"). */
  proof?: string;
  deviceId?: string;
  k1?: string;
  dek1?: string;
};
const F = {
  org2: 0,
  p1: 0,
  p2: 0,
  p3: 0,
  t1: 0,
  t2: 0,
  t3: 0,
  users: [] as number[],
  orgs: [] as number[],
  projects: [] as number[],
  u: {} as Record<string, U>,
};

async function taoUser(ten: string, role: Role, orgId: number, totp = false): Promise<U> {
  const hash = `hash-s05-${ten}-${RUN}`;
  const r = await own.query<{ id: number }>(
    `INSERT INTO users (name, email, password_hash, role, org_id, totp_enabled_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [`S05 ${ten}`, `s05-${ten}-${RUN}@test.local`, hash, role, orgId, totp ? new Date() : null],
  );
  F.users.push(r.rows[0].id);
  return { id: r.rows[0].id, passwordHash: hash, orgId, role, sessionVersion: 0 };
}

async function taoDuAn(ten: string, orgId: number): Promise<number> {
  const r = await own.query<{ id: number }>(
    `INSERT INTO projects (name, org_id) VALUES ($1, $2) RETURNING id`,
    [`S05 ${ten} ${RUN}`, orgId],
  );
  F.projects.push(r.rows[0].id);
  return r.rows[0].id;
}

async function taoTask(projectId: number, ma: string, assignedTo: number | null): Promise<number> {
  const tw = await own.query<{ id: number }>(
    `INSERT INTO towers (project_id, name) VALUES ($1, 'Tháp S05') RETURNING id`,
    [projectId],
  );
  const code = `S05${ma}${RUN}`;
  const st = await own.query<{ id: number }>(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES ($1, $2, 'Sheet S05', $3) RETURNING id`,
    [tw.rows[0].id, code, code.toLowerCase()],
  );
  const wp = await own.query<{ id: number }>(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES ($1, $2, 'Nhóm', 1) RETURNING id`,
    [st.rows[0].id, `PK${code}`],
  );
  const t = await own.query<{ id: number }>(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status, assigned_to)
     VALUES ($1, $2, 'Task S05', 1, 0, 'chuan_bi', $3) RETURNING id`,
    [wp.rows[0].id, `TK${code}`, assignedTo],
  );
  return t.rows[0].id;
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const o = await own.query<{ id: number }>(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
    [`S05 Org2 ${RUN}`],
  );
  F.org2 = o.rows[0].id;
  F.orgs.push(F.org2);
  F.u.admin = await taoUser("admin", "admin", 1, true);
  F.u.admin2fa0 = await taoUser("admin-no2fa", "admin", 1, false);
  F.u.a = await taoUser("eng-a", "engineer", 1);
  F.u.b = await taoUser("eng-b", "engineer", 1);
  F.u.sub = await taoUser("sub", "subcon", 1);
  F.u.pm = await taoUser("pm", "pm", 1);
  F.u.x = await taoUser("admin-org2", "admin", F.org2, true);
  F.u.rl = await taoUser("rate", "engineer", 1);
  F.p1 = await taoDuAn("P1", 1);
  F.p2 = await taoDuAn("P2", 1);
  F.p3 = await taoDuAn("P3", F.org2);
  F.t1 = await taoTask(F.p1, "T1", F.u.sub.id);
  F.t2 = await taoTask(F.p1, "T2", F.u.sub.id);
  F.t3 = await taoTask(F.p2, "T3", null);
});

after(async () => {
  dangXuat();
  if (!HAS_TEST_DB) return;
  const ids = F.users;
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
  device: () => import("@/app/api/offline/devices/[id]/route"),
  context: () => import("@/app/api/offline/context/route"),
  keys: () => import("@/app/api/offline/vault/keys/route"),
  unlock: () => import("@/app/api/offline/vault/unlock/route"),
};

async function vao(u: U, projectId: number | null) {
  await dangNhapDuAn(u, projectId);
}

/** Đăng ký trình duyệt; trả proof (mới do server đặt, hoặc proof truyền vào) + thiết bị. */
async function dangKy(u: U, projectId: number, proof?: string) {
  await vao(u, projectId);
  const res = await (await r.devices()).POST(req("POST", "/api/offline/devices", { proof }));
  const j = await res.json();
  const c = res.cookies.get("xboss_offline_proof");
  return { res, j, proof: c?.value ?? proof ?? "", cookie: c };
}

async function layContext(u: U, projectId: number, proof: string) {
  await vao(u, projectId);
  const res = await (await r.context()).POST(req("POST", "/api/offline/context", { proof }));
  return { res, j: await res.json() };
}

async function capKhoa(proof: string, ctx: string, manifest: unknown) {
  const res = await (
    await r.keys()
  ).POST(req("POST", "/api/offline/vault/keys", { proof, ctx, body: { manifest } }));
  return { res, j: await res.json() };
}

async function moKhoa(proof: string, ctx: string, keyIds?: string[]) {
  const res = await (
    await r.unlock()
  ).POST(
    req("POST", "/api/offline/vault/unlock", {
      proof,
      ctx,
      body: keyIds ? { keyIds } : {},
    }),
  );
  return { res, j: await res.json() };
}

function batKek(v = KEK_V1) {
  process.env.XBOSS_OFFLINE_KEK = v;
}

// ── Tính năng tắt / fail-closed ───────────────────────────────────────────────────────────

test(
  "thiếu XBOSS_OFFLINE_KEK → 503 offline_vault_disabled (fail-closed); sai → misconfigured",
  S,
  async () => {
    delete process.env.XBOSS_OFFLINE_KEK;
    await vao(F.u.a, F.p1);
    for (const [fn, url] of [
      [async (q: NextRequest) => (await r.devices()).POST(q), "/api/offline/devices"],
      [async (q: NextRequest) => (await r.context()).POST(q), "/api/offline/context"],
      [async (q: NextRequest) => (await r.keys()).POST(q), "/api/offline/vault/keys"],
      [async (q: NextRequest) => (await r.unlock()).POST(q), "/api/offline/vault/unlock"],
    ] as const) {
      const res = await fn(req("POST", url, { body: {} }));
      assert.equal(res.status, 503, url);
      assert.equal((await res.json()).code, "offline_vault_disabled");
      assert.equal(res.headers.get("cache-control"), "private, no-store");
    }
    // Xem danh sách vẫn được (không cấp quyền gì).
    assert.equal((await (await r.devices()).GET(req("GET", "/api/offline/devices"))).status, 200);

    batKek("v1:ngan");
    const sai = await (await r.devices()).POST(req("POST", "/api/offline/devices"));
    assert.equal(sai.status, 503);
    assert.equal((await sai.json()).code, "offline_vault_misconfigured");

    // KEK trùng XBOSS_SECRET → từ chối dùng (không được lấy secret phiên làm KEK).
    const cu = process.env.XBOSS_SECRET;
    process.env.XBOSS_SECRET = "z".repeat(40);
    try {
      await vao(F.u.a, F.p1); // ký lại cookie bằng secret mới
      batKek(`v1:${"z".repeat(40)}`);
      const trung = await (await r.devices()).POST(req("POST", "/api/offline/devices"));
      assert.equal(trung.status, 503);
      assert.equal((await trung.json()).code, "offline_vault_misconfigured");
    } finally {
      if (cu === undefined) delete process.env.XBOSS_SECRET;
      else process.env.XBOSS_SECRET = cu;
    }
    const { rows } = await own.query(`SELECT 1 FROM offline_devices WHERE user_id = $1`, [
      F.u.a.id,
    ]);
    assert.equal(rows.length, 0, "tắt tính năng thì không tạo bản ghi nào");
  },
);

test("401 khi chưa đăng nhập; 403 khi thiếu/khác Origin", S, async () => {
  batKek();
  dangXuat();
  for (const res of [
    await (await r.devices()).POST(req("POST", "/api/offline/devices")),
    await (await r.devices()).GET(req("GET", "/api/offline/devices")),
    await (await r.context()).POST(req("POST", "/api/offline/context")),
    await (await r.keys()).POST(req("POST", "/api/offline/vault/keys")),
    await (await r.unlock()).POST(req("POST", "/api/offline/vault/unlock")),
    await (await r.device()).PATCH(req("PATCH", "/api/offline/devices/x"), PID("x")),
  ])
    assert.equal(res.status, 401);
  await vao(F.u.a, F.p1);
  for (const origin of [null, "https://evil.example"]) {
    const res = await (await r.devices()).POST(req("POST", "/api/offline/devices", { origin }));
    assert.equal(res.status, 403, String(origin));
    assert.equal((await res.json()).code, "origin_rejected");
  }
});

// ── Đăng ký + proof ───────────────────────────────────────────────────────────────────────

test(
  "đăng ký: cookie proof HttpOnly/Lax chỉ cho /api/offline, DB chỉ lưu SHA-256, idempotent, luôn shared-safe",
  S,
  async () => {
    batKek();
    const d1 = await dangKy(F.u.a, F.p1);
    assert.equal(d1.res.status, 201);
    assert.ok(d1.cookie, "server phải đặt cookie proof");
    assert.equal(d1.cookie.httpOnly, true);
    assert.equal(d1.cookie.sameSite, "lax");
    assert.equal(d1.cookie.path, "/api/offline");
    assert.match(d1.proof, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(d1.j.device.profile, "shared-safe");
    assert.ok(!JSON.stringify(d1.j).includes(d1.proof), "phản hồi không chứa proof");

    const { rows } = await own.query<{ proof_hash: Buffer }>(
      `SELECT proof_hash FROM offline_devices WHERE id = $1`,
      [d1.j.device.id],
    );
    const proofBytes = Buffer.from(d1.proof, "base64url");
    assert.deepEqual(rows[0].proof_hash, createHash("sha256").update(proofBytes).digest());
    assert.ok(!rows[0].proof_hash.equals(proofBytes));

    // Gửi lại cùng proof → cùng bản ghi, không đặt cookie mới; body cố nâng profile bị bỏ qua.
    await vao(F.u.a, F.p1);
    const d2 = await (
      await r.devices()
    ).POST(
      req("POST", "/api/offline/devices", { proof: d1.proof, body: { profile: "field-personal" } }),
    );
    const j2 = await d2.json();
    assert.equal(d2.status, 200);
    assert.equal(j2.device.id, d1.j.device.id);
    assert.equal(j2.device.profile, "shared-safe");
    assert.equal(d2.cookies.get("xboss_offline_proof"), undefined);
    F.u.a = { ...F.u.a, proof: d1.proof, deviceId: d1.j.device.id } as U;
  },
);

test(
  "Q-AC03 A→B→A cùng trình duyệt: B có bản ghi riêng cùng proof, không ghi đè/không thấy của A",
  S,
  async () => {
    batKek();
    const pa = (F.u.a as U & { proof: string }).proof;
    const db = await dangKy(F.u.b, F.p1, pa);
    assert.equal(db.res.status, 201);
    assert.equal(db.cookie, undefined, "proof có sẵn được dùng lại, không ghi đè");
    assert.notEqual(db.j.device.id, (F.u.a as U & { deviceId: string }).deviceId);
    // B chỉ thấy thiết bị của mình.
    const ds = await (await r.devices()).GET(req("GET", "/api/offline/devices", { proof: pa }));
    const lb = (await ds.json()).devices as { id: string; userId: number; thisBrowser: boolean }[];
    assert.deepEqual(
      lb.map((d) => d.userId),
      [F.u.b.id],
    );
    assert.equal(lb[0].thisBrowser, true);
    // A quay lại: vẫn đúng bản ghi cũ.
    const da = await dangKy(F.u.a, F.p1, pa);
    assert.equal(da.res.status, 200);
    assert.equal(da.j.device.id, (F.u.a as U & { deviceId: string }).deviceId);
  },
);

// ── Context ───────────────────────────────────────────────────────────────────────────────

test(
  "context: lease 15 phút shared-safe, generation tăng, no-store; dự án lệch → 409; thiết bị chưa đăng ký → 403",
  S,
  async () => {
    batKek();
    const pa = (F.u.a as U & { proof: string }).proof;
    const c1 = await layContext(F.u.a, F.p1, pa);
    assert.equal(c1.res.status, 200);
    assert.equal(c1.res.headers.get("cache-control"), "private, no-store");
    const ctx = c1.j.context;
    assert.equal(ctx.projectId, F.p1);
    assert.equal(ctx.profile, "shared-safe");
    assert.equal(ctx.cacheSchemaVersion, 1);
    assert.equal(Date.parse(ctx.expiresAt) - Date.parse(ctx.issuedAt), 15 * 60_000);
    const c2 = await layContext(F.u.a, F.p1, pa);
    assert.ok(c2.j.context.generation > ctx.generation, "generation do server cấp tăng đơn điệu");

    await vao(F.u.a, F.p1);
    const lech = await (
      await r.context()
    ).POST(req("POST", "/api/offline/context", { proof: pa, body: { expectedProjectId: F.p2 } }));
    assert.equal(lech.status, 409);
    assert.equal((await lech.json()).code, "context_changed");

    await vao(F.u.pm, F.p1);
    const chua = await (await r.context()).POST(req("POST", "/api/offline/context", { proof: pa }));
    assert.equal(chua.status, 403);
    assert.equal((await chua.json()).code, "device_unregistered");
  },
);

// ── Khoá vault ────────────────────────────────────────────────────────────────────────────

test(
  "khoá: cấp/mở đúng chủ; DB chỉ có DEK đã bọc; idempotent theo manifest; manifest ngoài dự án → 403",
  S,
  async () => {
    batKek();
    const pa = (F.u.a as U & { proof: string }).proof;
    const { j: cj } = await layContext(F.u.a, F.p1, pa);
    const ctx = cj.context.contextId as string;

    const k1 = await capKhoa(pa, ctx, { tasks: [F.t1], taskActions: ["tick", "photo"] });
    assert.equal(k1.res.status, 201, JSON.stringify(k1.j));
    assert.equal(k1.res.headers.get("cache-control"), "private, no-store");
    const dek = Buffer.from(k1.j.key.dek, "base64url");
    assert.equal(dek.length, 32);
    assert.deepEqual(k1.j.key.manifest.tasks, [F.t1]);

    const { rows } = await own.query<{ wrapped_key: Buffer; kek_version: string; pf: string }>(
      `SELECT wrapped_key, kek_version, permission_fingerprint AS pf FROM offline_vault_keys WHERE id = $1`,
      [k1.j.key.keyId],
    );
    assert.equal(rows[0].wrapped_key.length, 61);
    assert.ok(!rows[0].wrapped_key.includes(dek), "DB không được chứa DEK thô");
    assert.equal(rows[0].kek_version, "v1");
    assert.match(rows[0].pf, /^[0-9a-f]{64}$/);

    const k1b = await capKhoa(pa, ctx, { taskActions: ["photo", "tick"], tasks: [String(F.t1)] });
    assert.equal(k1b.res.status, 200);
    assert.equal(k1b.j.key.keyId, k1.j.key.keyId, "cùng manifest → cùng khoá");
    assert.equal(k1b.j.key.dek, k1.j.key.dek);

    const ngoai = await capKhoa(pa, ctx, { tasks: [F.t3], taskActions: ["tick"] });
    assert.equal(ngoai.res.status, 403);
    assert.equal(ngoai.j.code, "manifest_forbidden");
    assert.ok(!JSON.stringify(ngoai.j).includes(String(F.t3)), "lỗi không nêu tài nguyên bị cấm");
    const sai = await capKhoa(pa, ctx, { tasks: [F.t1] });
    assert.equal(sai.res.status, 422);

    const mo = await moKhoa(pa, ctx);
    assert.equal(mo.res.status, 200);
    assert.deepEqual(
      mo.j.keys.map((k: { keyId: string; dek: string }) => [k.keyId, k.dek]),
      [[k1.j.key.keyId, k1.j.key.dek]],
    );
    F.u.a = { ...F.u.a, k1: k1.j.key.keyId, dek1: k1.j.key.dek } as U;
  },
);

test(
  "context bắt buộc + phải khớp: thiếu/sửa chữ ký/dự án khác/thiết bị khác → 409",
  S,
  async () => {
    batKek();
    const a = F.u.a as U & { proof: string; k1: string };
    const { j } = await layContext(a, F.p1, a.proof);
    const ctx = j.context.contextId as string;
    const thieu = await moKhoa(a.proof, "");
    assert.equal(thieu.res.status, 409);
    assert.equal(thieu.j.code, "context_invalid");
    const [b64, mac] = ctx.split(".");
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    const gia = Buffer.from(JSON.stringify({ ...payload, x: payload.x + 86_400_000 })).toString(
      "base64url",
    );
    const sua = await moKhoa(a.proof, `${gia}.${mac}`);
    assert.equal(sua.j.code, "context_invalid", "sửa payload → chữ ký sai");
    // Tab cũ giữ context P1 nhưng cookie dự án dùng chung đã sang P2.
    await vao(a, F.p2);
    const doiDuAn = await moKhoa(a.proof, ctx);
    assert.equal(doiDuAn.res.status, 409);
    assert.equal(doiDuAn.j.code, "context_changed");
    // B (cùng proof, thiết bị riêng) dùng context của A → lệch actor/thiết bị.
    await vao(F.u.b, F.p1);
    const cuaB = await moKhoa(a.proof, ctx);
    assert.equal(cuaB.res.status, 409);
    assert.equal(cuaB.j.code, "context_changed");
  },
);

test(
  "Q-AC02: B cùng trình duyệt không mở được khoá của A, kể cả gửi đúng keyId; org khác không thấy",
  S,
  async () => {
    batKek();
    const a = F.u.a as U & { proof: string; k1: string; dek1: string };
    const { j } = await layContext(F.u.b, F.p1, a.proof);
    const mo = await moKhoa(a.proof, j.context.contextId, [a.k1]);
    assert.equal(mo.res.status, 200);
    assert.deepEqual(mo.j.keys, []);
    assert.deepEqual(mo.j.locked, [{ keyId: a.k1 }]);
    assert.ok(!JSON.stringify(mo.j).includes(a.dek1));
    // Admin org2: cùng proof, không có dự án org1 → không lấy được context P1.
    const dx = await dangKy(F.u.x, F.p3, a.proof);
    assert.equal(dx.res.status, 201);
    await vao(F.u.x, F.p1);
    const cx = await (
      await r.context()
    ).POST(req("POST", "/api/offline/context", { proof: a.proof }));
    assert.equal(cx.status, 404);
  },
);

test(
  "Q-AC02/A2-AC09: thu hồi 1 task trong manifest → khoá manifest đó locked, manifest độc lập vẫn mở; gán lại → mở lại",
  S,
  async () => {
    batKek();
    const s = await dangKy(F.u.sub, F.p1);
    const { j } = await layContext(F.u.sub, F.p1, s.proof);
    const ctx = j.context.contextId as string;
    const kT1 = await capKhoa(s.proof, ctx, { tasks: [F.t1], taskActions: ["tick"] });
    const kT12 = await capKhoa(s.proof, ctx, { tasks: [F.t1, F.t2], taskActions: ["tick"] });
    const kT2 = await capKhoa(s.proof, ctx, { tasks: [F.t2], taskActions: ["photo"] });
    assert.deepEqual([kT1.res.status, kT12.res.status, kT2.res.status], [201, 201, 201]);
    assert.deepEqual(
      [kT1.j.key.keyVersion, kT12.j.key.keyVersion, kT2.j.key.keyVersion],
      [1, 2, 3],
    );
    // Thầu phụ không được cấp khoá cho task không giao cho mình.
    const khongGiao = await capKhoa(s.proof, ctx, {
      tasks: [F.t1],
      taskActions: ["tick"],
      diary: { from: "2026-03-01", to: "2026-03-01" },
    });
    assert.equal(khongGiao.res.status, 403, "subcon không có năng lực nhật ký");

    await own.query(`UPDATE tasks SET assigned_to = $1 WHERE id = $2`, [F.u.b.id, F.t1]);
    try {
      await vao(F.u.sub, F.p1);
      const mo = await moKhoa(s.proof, ctx);
      assert.equal(mo.res.status, 200);
      assert.deepEqual(
        mo.j.keys.map((k: { keyId: string }) => k.keyId),
        [kT2.j.key.keyId],
      );
      assert.deepEqual(
        mo.j.locked.map((k: { keyId: string }) => k.keyId).sort(),
        [kT1.j.key.keyId, kT12.j.key.keyId].sort(),
      );
      // Không tự xoá ciphertext/khoá khi quyền bị thu hồi.
      const { rows } = await own.query(`SELECT 1 FROM offline_vault_keys WHERE user_id = $1`, [
        F.u.sub.id,
      ]);
      assert.equal(rows.length, 3);
    } finally {
      await own.query(`UPDATE tasks SET assigned_to = $1 WHERE id = $2`, [F.u.sub.id, F.t1]);
    }
    await vao(F.u.sub, F.p1);
    const lai = await moKhoa(s.proof, ctx);
    assert.equal(lai.j.keys.length, 3, "quyền trở lại → chính chủ mở lại được");
  },
);

test(
  "manifest/khoá bị sửa trong DB (mở rộng task, đổi hash, hỏng wrapped_key) → locked, không fallback",
  S,
  async () => {
    batKek();
    const a = F.u.a as U & { proof: string };
    const { j } = await layContext(a, F.p1, a.proof);
    const ctx = j.context.contextId as string;
    const k = await capKhoa(a.proof, ctx, { tasks: [F.t2], taskActions: ["tick"] });
    const id = k.j.key.keyId as string;
    const goc = await own.query<{ m: unknown; h: string; w: Buffer }>(
      `SELECT resource_manifest AS m, manifest_hash AS h, wrapped_key AS w FROM offline_vault_keys WHERE id = $1`,
      [id],
    );
    const g = goc.rows[0];
    const thu = async (sql: string, params: unknown[]) => {
      await own.query(sql, params);
      await vao(a, F.p1);
      const mo = await moKhoa(a.proof, ctx, [id]);
      assert.deepEqual(mo.j.locked, [{ keyId: id }], sql);
      await own.query(
        `UPDATE offline_vault_keys SET resource_manifest = $2, manifest_hash = $3, wrapped_key = $4 WHERE id = $1`,
        [id, g.m, g.h, g.w],
      );
    };
    await thu(
      `UPDATE offline_vault_keys SET resource_manifest = jsonb_set(resource_manifest, '{tasks}', $2::jsonb) WHERE id = $1`,
      [id, JSON.stringify([F.t1, F.t2])],
    );
    await thu(`UPDATE offline_vault_keys SET manifest_hash = $2 WHERE id = $1`, [
      id,
      "0".repeat(64),
    ]);
    const hong = Buffer.from(g.w);
    hong[30] ^= 0xff;
    await thu(`UPDATE offline_vault_keys SET wrapped_key = $2 WHERE id = $1`, [id, hong]);
    await vao(a, F.p1);
    assert.equal((await moKhoa(a.proof, ctx, [id])).j.keys.length, 1, "khôi phục đúng → mở lại");
  },
);

test(
  "đổi quyền → context_changed; quyền mất thì khoá locked; trả quyền thì mở lại (không mất nháp)",
  S,
  async () => {
    batKek();
    const a = F.u.a as U & { proof: string; k1: string };
    const { j } = await layContext(a, F.p1, a.proof);
    await own.query(`UPDATE users SET role = 'viewer' WHERE id = $1`, [a.id]);
    try {
      await vao(a, F.p1);
      const cu = await moKhoa(a.proof, j.context.contextId);
      assert.equal(cu.j.code, "context_changed", "vân tay quyền đổi → context cũ hết hiệu lực");
      const { j: j2 } = await layContext(a, F.p1, a.proof);
      const mo = await moKhoa(a.proof, j2.context.contextId, [a.k1]);
      assert.deepEqual(mo.j.locked, [{ keyId: a.k1 }]);
    } finally {
      await own.query(`UPDATE users SET role = 'engineer' WHERE id = $1`, [a.id]);
    }
    const { j: j3 } = await layContext(a, F.p1, a.proof);
    assert.equal((await moKhoa(a.proof, j3.context.contextId, [a.k1])).j.keys.length, 1);
  },
);

test(
  "Q-AC02: xoay KEK (v2 mới, giữ v1) không mất khoá cũ; gỡ v1 → locked nhưng giữ dữ liệu; gắn lại → mở",
  S,
  async () => {
    const a = F.u.a as U & { proof: string; k1: string; dek1: string };
    batKek(`${KEK_V2},${KEK_V1}`);
    const { j } = await layContext(a, F.p1, a.proof);
    const ctx = j.context.contextId as string;
    const cu = await moKhoa(a.proof, ctx, [a.k1]);
    assert.equal(cu.j.keys[0]?.dek, a.dek1, "khoá bọc bằng v1 vẫn mở sau khi v2 thành bản chính");
    const moi = await capKhoa(a.proof, ctx, { diary: { from: "2026-03-01", to: "2026-03-07" } });
    assert.equal(moi.res.status, 201);
    const { rows } = await own.query<{ v: string }>(
      `SELECT kek_version AS v FROM offline_vault_keys WHERE id = $1`,
      [moi.j.key.keyId],
    );
    assert.equal(rows[0].v, "v2");

    batKek(KEK_V2);
    await vao(a, F.p1);
    const goV1 = await moKhoa(a.proof, ctx, [a.k1, moi.j.key.keyId]);
    assert.deepEqual(goV1.j.locked, [{ keyId: a.k1 }]);
    assert.equal(goV1.j.keys[0].keyId, moi.j.key.keyId);
    batKek(`${KEK_V2},${KEK_V1}`);
    await vao(a, F.p1);
    assert.equal((await moKhoa(a.proof, ctx, [a.k1])).j.keys[0]?.dek, a.dek1);
    batKek();
  },
);

test(
  "Q-AC02: đăng xuất/đổi mật khẩu/thu hồi phiên không làm mất khoá — chính chủ đăng nhập lại mở được",
  S,
  async () => {
    batKek();
    const a = F.u.a as U & { proof: string; k1: string; dek1: string };
    const { j } = await layContext(a, F.p1, a.proof);
    // Đăng xuất: chỉ xoá cookie phiên; cookie proof (path /api/offline) không bị đụng.
    const { POST: logout } = await import("@/app/api/auth/logout/route");
    const lo = await logout();
    assert.equal(lo.cookies.get("xboss_offline_proof"), undefined);
    dangXuat();
    assert.equal((await moKhoa(a.proof, j.context.contextId)).res.status, 401);

    // Đổi mật khẩu + thu hồi phiên → token cũ chết; context cũ hết hiệu lực (sessionVersion).
    const hashMoi = `moi-${a.passwordHash}`;
    await own.query(
      `UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1`,
      [a.id, hashMoi],
    );
    try {
      const a2 = { ...a, passwordHash: hashMoi, sessionVersion: 1 };
      await vao(a2, F.p1);
      const cu = await moKhoa(a.proof, j.context.contextId);
      assert.equal(cu.j.code, "context_changed");
      const { j: j2 } = await layContext(a2, F.p1, a.proof);
      const mo = await moKhoa(a.proof, j2.context.contextId, [a.k1]);
      assert.equal(mo.j.keys[0]?.dek, a.dek1);
    } finally {
      await own.query(`UPDATE users SET password_hash = $2, session_version = 0 WHERE id = $1`, [
        a.id,
        a.passwordHash,
      ]);
    }
  },
);

// ── Admin: duyệt / thu hồi ────────────────────────────────────────────────────────────────

test(
  "Q-AC03: chỉ Admin cùng org + 2FA duyệt; trình duyệt dùng chung không được field-personal; lease 8h; hạ cấp → context_changed",
  S,
  async () => {
    batKek();
    // Thiết bị riêng của PM (proof mới, không ai dùng chung).
    const p = await dangKy(F.u.pm, F.p1);
    const id = p.j.device.id as string;
    const patch = async (u: U, devId: string, body: unknown) => {
      await vao(u, F.p1);
      const res = await (
        await r.device()
      ).PATCH(req("PATCH", `/api/offline/devices/${devId}`, { body }), PID(devId));
      return { res, j: await res.json() };
    };
    assert.equal((await patch(F.u.pm, id, { profile: "field-personal" })).res.status, 403);
    const no2fa = await patch(F.u.admin2fa0, id, { profile: "field-personal" });
    assert.equal(no2fa.j.code, "two_factor_required");
    await vao(F.u.x, F.p3);
    const khacOrg = await (
      await r.device()
    ).PATCH(
      req("PATCH", `/api/offline/devices/${id}`, { body: { profile: "field-personal" } }),
      PID(id),
    );
    assert.equal(khacOrg.status, 404, "Admin org khác không thấy thiết bị");
    assert.equal((await patch(F.u.admin, id, { profile: "x" })).res.status, 422);
    assert.equal(
      (await patch(F.u.admin, id, { profile: "field-personal", revoke: true })).res.status,
      422,
    );

    // Proof của A đang có bản ghi của B (cùng trình duyệt) → không phải "một chủ".
    const dungChung = await patch(F.u.admin, (F.u.a as U & { deviceId: string }).deviceId, {
      profile: "field-personal",
    });
    assert.equal(dungChung.res.status, 409);
    assert.equal(dungChung.j.code, "shared_browser");

    const ok = await patch(F.u.admin, id, { profile: "field-personal" });
    assert.equal(ok.res.status, 200);
    assert.equal(ok.j.device.profile, "field-personal");
    assert.equal(ok.j.device.approvedBy, F.u.admin.id);
    const { j } = await layContext(F.u.pm, F.p1, p.proof);
    assert.equal(j.context.profile, "field-personal");
    assert.equal(Date.parse(j.context.expiresAt) - Date.parse(j.context.issuedAt), 8 * 3_600_000);
    const audit = await own.query(
      `SELECT 1 FROM audit_log WHERE entity_type = 'offline_devices' AND entity_key = $1`,
      [id],
    );
    assert.ok(audit.rows.length >= 1, "duyệt thiết bị có audit");

    await patch(F.u.admin, id, { profile: "shared-safe" });
    await vao(F.u.pm, F.p1);
    const sau = await moKhoa(p.proof, j.context.contextId);
    assert.equal(sau.j.code, "context_changed", "hạ profile → context 8h cũ hết hiệu lực");
    F.u.pm = { ...F.u.pm, proof: p.proof, deviceId: id } as U;
  },
);

test(
  "thu hồi thiết bị: context/khoá → 403 device_revoked, không mở lại, không xoá khoá",
  S,
  async () => {
    batKek();
    const pm = F.u.pm as U & { proof: string; deviceId: string };
    const { j } = await layContext(pm, F.p1, pm.proof);
    const k = await capKhoa(pm.proof, j.context.contextId, {
      tasks: [F.t2],
      taskActions: ["tick"],
    });
    assert.equal(k.res.status, 201);
    await vao(F.u.admin, F.p1);
    const tu = await (
      await r.device()
    ).PATCH(
      req("PATCH", `/api/offline/devices/${pm.deviceId}`, { body: { revoke: true } }),
      PID(pm.deviceId),
    );
    assert.equal(tu.status, 200);
    assert.ok((await tu.json()).device.revokedAt);
    await vao(F.u.admin, F.p1);
    const lai = await (
      await r.device()
    ).PATCH(
      req("PATCH", `/api/offline/devices/${pm.deviceId}`, { body: { profile: "shared-safe" } }),
      PID(pm.deviceId),
    );
    assert.equal(lai.status, 409);

    const c = await layContext(pm, F.p1, pm.proof);
    assert.equal(c.res.status, 403);
    assert.equal(c.j.code, "device_revoked");
    await vao(pm, F.p1);
    const mo = await moKhoa(pm.proof, j.context.contextId);
    assert.equal(mo.j.code, "device_revoked");
    const dk = await dangKy(pm, F.p1, pm.proof);
    assert.equal(dk.res.status, 403, "đăng ký lại cùng proof không mở lại thiết bị đã thu hồi");
    const { rows } = await own.query(`SELECT 1 FROM offline_vault_keys WHERE id = $1`, [
      k.j.key.keyId,
    ]);
    assert.equal(rows.length, 1);
    // Admin xem danh sách cả org — không có proof/khoá trong phản hồi.
    await vao(F.u.admin, F.p1);
    const ds = await (await r.devices()).GET(req("GET", "/api/offline/devices"));
    const txt = JSON.stringify(await ds.json());
    assert.ok(txt.includes(pm.deviceId));
    assert.ok(!/proof|wrapped|dek|manifest/i.test(txt));
  },
);

test("rate limit mở khoá: quá 30 lần/15 phút → 429 + Retry-After", S, async () => {
  batKek();
  const d = await dangKy(F.u.rl, F.p1);
  const { j } = await layContext(F.u.rl, F.p1, d.proof);
  let cuoi: Response | null = null;
  for (let i = 0; i < 31; i++) cuoi = (await moKhoa(d.proof, j.context.contextId)).res;
  assert.equal(cuoi?.status, 429);
  assert.equal(cuoi?.headers.get("retry-after"), "900");
});

test(
  "/api/auth/me trả binding mờ: ổn định theo phiên, khác giữa tài khoản, đổi khi thu hồi phiên",
  S,
  async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const lay = async (u: U) => {
      await vao(u, F.p1);
      return (await (await GET()).json()).binding as string;
    };
    const a1 = await lay(F.u.a);
    assert.match(a1, /^[0-9a-f]{32}$/);
    assert.equal(await lay(F.u.a), a1);
    assert.notEqual(await lay(F.u.b), a1);
    await own.query(`UPDATE users SET session_version = 5 WHERE id = $1`, [F.u.b.id]);
    try {
      const b5 = await lay({ ...F.u.b, sessionVersion: 5 });
      assert.notEqual(b5, await lay(F.u.a));
    } finally {
      await own.query(`UPDATE users SET session_version = 0 WHERE id = $1`, [F.u.b.id]);
    }
  },
);

// ── RLS + quyền bảng bằng xboss_app trực tiếp ─────────────────────────────────────────────

test(
  "RLS 0163 (xboss_app): đọc theo actor/org/dự án, không chèn hộ/không tự nâng profile, không UPDATE khoá, không DELETE",
  S,
  async () => {
    const app = new Pool({ connectionString: appConnString(), max: 2 });
    const a = F.u.a as U & { deviceId: string };
    const voiGuc = async <T>(
      guc: { user: number; org: number; role: string; project?: number },
      fn: (c: import("pg").PoolClient) => Promise<T>,
    ): Promise<T> => {
      const c = await app.connect();
      try {
        await c.query("BEGIN");
        await c.query(
          `SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true),
                set_config('app.role', $3, true), set_config('app.project_id', $4, true)`,
          [String(guc.user), String(guc.org), guc.role, guc.project ? String(guc.project) : ""],
        );
        return await fn(c);
      } finally {
        await c.query("ROLLBACK").catch(() => {});
        c.release();
      }
    };
    const loiQuyen = (e: unknown) =>
      e instanceof Error && /permission denied|row-level security/i.test(e.message);
    try {
      // Không GUC → không thấy gì (không nhánh "GUC rỗng → cho qua").
      const c0 = await app.connect();
      try {
        assert.equal((await c0.query(`SELECT 1 FROM offline_devices`)).rowCount, 0);
        assert.equal((await c0.query(`SELECT 1 FROM offline_vault_keys`)).rowCount, 0);
      } finally {
        c0.release();
      }
      await voiGuc({ user: a.id, org: 1, role: "engineer", project: F.p1 }, async (c) => {
        const ds = await c.query<{ user_id: number }>(`SELECT user_id FROM offline_devices`);
        assert.ok(ds.rows.length > 0 && ds.rows.every((x) => x.user_id === a.id));
        const ks = await c.query<{ user_id: number; project_id: number }>(
          `SELECT user_id, project_id FROM offline_vault_keys`,
        );
        assert.ok(
          ks.rows.length > 0 && ks.rows.every((x) => x.user_id === a.id && x.project_id === F.p1),
        );
        const upd = await c.query(`UPDATE offline_devices SET revoked_at = now()`);
        assert.equal(upd.rowCount, 0, "không phải admin → không UPDATE được dòng nào");
      });
      await voiGuc({ user: a.id, org: 1, role: "engineer", project: F.p2 }, async (c) => {
        assert.equal((await c.query(`SELECT 1 FROM offline_vault_keys`)).rowCount, 0);
      });
      await voiGuc({ user: F.u.admin.id, org: 1, role: "admin" }, async (c) => {
        const ds = await c.query<{ org_id: number }>(`SELECT org_id FROM offline_devices`);
        assert.ok(ds.rows.length >= 3 && ds.rows.every((x) => x.org_id === 1));
        await assert.rejects(
          c.query(`UPDATE offline_devices SET user_id = $1 WHERE id = $2`, [
            F.u.admin.id,
            a.deviceId,
          ]),
          loiQuyen,
        );
      });
      await voiGuc({ user: F.u.admin.id, org: 1, role: "admin" }, async (c) => {
        await assert.rejects(
          c.query(`UPDATE offline_devices SET proof_hash = $1 WHERE id = $2`, [
            Buffer.alloc(32),
            a.deviceId,
          ]),
          loiQuyen,
        );
      });
      await voiGuc({ user: F.u.x.id, org: F.org2, role: "admin" }, async (c) => {
        const ds = await c.query<{ org_id: number }>(`SELECT org_id FROM offline_devices`);
        assert.ok(ds.rows.every((x) => x.org_id === F.org2));
      });
      // Chèn hộ người khác / tự nâng field-personal bị WITH CHECK chặn.
      for (const [userId, profile] of [
        [F.u.b.id, "shared-safe"],
        [a.id, "field-personal"],
      ] as const) {
        await voiGuc({ user: a.id, org: 1, role: "engineer" }, async (c) => {
          await assert.rejects(
            c.query(
              `INSERT INTO offline_devices (id, user_id, org_id, proof_hash, profile, approved_by, approved_at)
             VALUES (gen_random_uuid(), $1, 1, $2, $3, $4, $5)`,
              [
                userId,
                Buffer.alloc(32, 7),
                profile,
                profile === "field-personal" ? a.id : null,
                profile === "field-personal" ? new Date() : null,
              ],
            ),
            loiQuyen,
          );
        });
      }
      await voiGuc({ user: a.id, org: 1, role: "engineer", project: F.p1 }, async (c) => {
        await assert.rejects(
          c.query(`UPDATE offline_vault_keys SET wrapped_key = '\\x00'`),
          loiQuyen,
        );
      });
      await voiGuc({ user: a.id, org: 1, role: "engineer", project: F.p1 }, async (c) => {
        await assert.rejects(c.query(`DELETE FROM offline_vault_keys`), loiQuyen);
      });
      await voiGuc({ user: F.u.admin.id, org: 1, role: "admin" }, async (c) => {
        await assert.rejects(c.query(`DELETE FROM offline_devices`), loiQuyen);
      });
      await voiGuc({ user: a.id, org: 1, role: "engineer" }, async (c) => {
        const g = await c.query(`SELECT nextval('offline_context_generation_seq') AS g`);
        assert.ok(Number(g.rows[0].g) > 0);
      });
    } finally {
      await app.end();
    }
  },
);
