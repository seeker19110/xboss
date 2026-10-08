import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import type { Role } from "@/lib/nen/roles";

// QUALITY-FINAL-1 S06 — receipt + precondition ở 4 endpoint THẬT mà hàng đợi offline gửi tới
// (logic.opEndpoint): PATCH /api/dimensions/:id (tick), PATCH /api/dimensions/batch (tick_batch),
// POST /api/tasks/:id/photos (photo), PUT /api/diaries/:date (diary_note).
//
// Route chạy bằng role ứng dụng `xboss_app` (NOBYPASSRLS) như production — RLS/GRANT của 0164 được
// thực thi thật trên đường route (superuser sẽ bỏ qua RLS → xanh giả, ADR-0005). Fixture và dọn dẹp
// dùng pool owner riêng. Context offline lấy qua route S05 thật (đăng ký thiết bị → context).
//
// Map AC: A2-AC04 (mất ACK/20 request đồng thời cùng key → một hiệu ứng; đổi payload → 409),
// A2-AC06 (mã 409/412/428/403/400 đúng hợp đồng), A2-AC10 (If-Match/If-None-Match không đè bản mới;
// replay sau mất ACK không 412 giả; ảnh retry/mồ côi được đối soát), A2-AC02 (context dự án cũ → 409).

const S = { skip: !HAS_TEST_DB };

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}
if (HAS_TEST_DB) process.env.DATABASE_URL = appConnString();
process.env.XBOSS_OFFLINE_KEK = `v1:${"k".repeat(40)}`;

const RUN = Date.now().toString(36);
const UPLOAD_DIR = join(process.cwd(), "data", "uploads");

const own = HAS_TEST_DB
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 })
  : (null as unknown as Pool);

type U = { id: number; passwordHash: string; orgId: number; role: Role; sessionVersion: number };
const F = {
  p1: 0,
  p2: 0,
  t1: 0, // P1, giao cho subcon
  t2: 0, // P1
  t3: 0, // P2 — tài nguyên KHÁC dự án của context
  d: [] as number[], // d[0], d[1] thuộc t1; d[2..5] thuộc t2
  users: [] as number[],
  projects: [] as number[],
  u: {} as Record<string, U>,
};

async function taoUser(ten: string, role: Role): Promise<U> {
  const hash = `hash-s06-${ten}-${RUN}`;
  const r = await own.query<{ id: number }>(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ($1, $2, $3, $4, 1) RETURNING id`,
    [`S06 ${ten}`, `s06-${ten}-${RUN}@test.local`, hash, role],
  );
  F.users.push(r.rows[0].id);
  return { id: r.rows[0].id, passwordHash: hash, orgId: 1, role, sessionVersion: 0 };
}

async function taoDuAn(ten: string): Promise<number> {
  const r = await own.query<{ id: number }>(
    `INSERT INTO projects (name, org_id) VALUES ($1, 1) RETURNING id`,
    [`S06 ${ten} ${RUN}`],
  );
  F.projects.push(r.rows[0].id);
  return r.rows[0].id;
}

async function taoTask(projectId: number, ma: string, assignedTo: number | null, soO: number) {
  const tw = await own.query<{ id: number }>(
    `INSERT INTO towers (project_id, name) VALUES ($1, 'Tháp S06') RETURNING id`,
    [projectId],
  );
  const code = `S06${ma}${RUN}`;
  const st = await own.query<{ id: number }>(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES ($1, $2, 'Sheet S06', $3) RETURNING id`,
    [tw.rows[0].id, code, code.toLowerCase()],
  );
  const wp = await own.query<{ id: number }>(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES ($1, $2, 'Nhóm', 1) RETURNING id`,
    [st.rows[0].id, `PK${code}`],
  );
  const t = await own.query<{ id: number }>(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status, assigned_to)
     VALUES ($1, $2, 'Task S06', 1, 0, 'chuan_bi', $3) RETURNING id`,
    [wp.rows[0].id, `TK${code}`, assignedTo],
  );
  const taskId = t.rows[0].id;
  for (let i = 0; i < soO; i++) {
    const d = await own.query<{ id: number }>(
      `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES ($1, $2, 0) RETURNING id`,
      [taskId, `Ô${i}`],
    );
    F.d.push(d.rows[0].id);
  }
  return taskId;
}

before(async () => {
  if (!HAS_TEST_DB) return;
  F.u.eng = await taoUser("eng", "engineer");
  F.u.eng2 = await taoUser("eng2", "engineer");
  F.u.sub = await taoUser("sub", "subcon");
  F.p1 = await taoDuAn("P1");
  F.p2 = await taoDuAn("P2");
  F.t1 = await taoTask(F.p1, "T1", F.u.sub.id, 2);
  F.t2 = await taoTask(F.p1, "T2", null, 4);
  F.t3 = await taoTask(F.p2, "T3", null, 1); // F.d[6]
});

after(async () => {
  dangXuat();
  if (!HAS_TEST_DB) return;
  const ids = F.users;
  const tasks = [F.t1, F.t2, F.t3];
  await own.query(`DELETE FROM audit_operation_receipts WHERE user_id = ANY($1::int[])`, [ids]);
  await own.query(`DELETE FROM photo_upload_staging WHERE user_id = ANY($1::int[])`, [ids]);
  const anh = await own.query<{ file_name: string }>(
    `DELETE FROM task_photos WHERE task_id = ANY($1::int[]) RETURNING file_name`,
    [tasks],
  );
  for (const r of anh.rows) {
    const p = join(UPLOAD_DIR, r.file_name);
    if (existsSync(p)) unlinkSync(p);
  }
  await own.query(`DELETE FROM site_diaries WHERE project_id = ANY($1::int[])`, [F.projects]);
  await own.query(`DELETE FROM task_history WHERE task_id = ANY($1::int[])`, [tasks]);
  await own.query(`DELETE FROM progress_dimensions WHERE task_id = ANY($1::int[])`, [tasks]);
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
  await own.end();
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────────────────

type Opt = {
  body?: unknown;
  form?: FormData;
  proof?: string;
  ctx?: string;
  key?: string;
  headers?: Record<string, string>;
};
function req(method: string, url: string, o: Opt = {}): NextRequest {
  const h: Record<string, string> = { host: "localhost", origin: "http://localhost" };
  if (o.proof) h.cookie = `xboss_offline_proof=${o.proof}`;
  if (o.ctx) h["x-xboss-context"] = o.ctx;
  if (o.key) h["idempotency-key"] = o.key;
  if (o.body !== undefined) h["content-type"] = "application/json";
  Object.assign(h, o.headers);
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: h,
    body: o.form ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
  });
}

const r = {
  devices: () => import("@/app/api/offline/devices/route"),
  context: () => import("@/app/api/offline/context/route"),
  dim: () => import("@/app/api/dimensions/[id]/route"),
  batch: () => import("@/app/api/dimensions/batch/route"),
  photos: () => import("@/app/api/tasks/[id]/photos/route"),
  diary: () => import("@/app/api/diaries/[date]/route"),
  photo: () => import("@/app/api/photos/[id]/route"),
};

/** Đăng ký trình duyệt + lấy context offline cho (user, dự án) qua route S05 thật. */
async function layContext(u: U, projectId: number): Promise<string> {
  await dangNhapDuAn(u, projectId);
  const dk = await (await r.devices()).POST(req("POST", "/api/offline/devices"));
  assert.ok(dk.status === 201 || dk.status === 200, `đăng ký thiết bị: ${dk.status}`);
  const proof = dk.cookies.get("xboss_offline_proof")?.value as string;
  const res = await (await r.context()).POST(req("POST", "/api/offline/context", { proof }));
  assert.equal(res.status, 200);
  return (await res.json()).context.contextId as string;
}

async function tick(dimId: number, installed: boolean, ctx?: string, key?: string) {
  return (await r.dim()).PATCH(
    req("PATCH", `/api/dimensions/${dimId}`, { body: { installed }, ctx, key }),
    { params: Promise.resolve({ id: String(dimId) }) },
  );
}

async function batch(ids: number[], installed: boolean, ctx?: string, key?: string) {
  return (await r.batch()).PATCH(
    req("PATCH", "/api/dimensions/batch", { body: { ids, installed }, ctx, key }),
  );
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
/** PNG hợp lệ + đuôi ngẫu nhiên → mỗi ảnh một sha256 riêng (không dính chống trùng 24h). */
const anhMoi = () => Buffer.concat([PNG_1X1, randomBytes(8)]);

async function guiAnh(taskId: number, bytes: Buffer, caption: string, ctx?: string, key?: string) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "a.png", { type: "image/png" }));
  form.set("caption", caption);
  return (await r.photos()).POST(req("POST", `/api/tasks/${taskId}/photos`, { form, ctx, key }), {
    params: Promise.resolve({ id: String(taskId) }),
  });
}

async function putNhatKy(
  date: string,
  body: unknown,
  headers: Record<string, string>,
  o: Opt = {},
) {
  return (await r.diary()).PUT(req("PUT", `/api/diaries/${date}`, { ...o, body, headers }), {
    params: Promise.resolve({ date }),
  });
}

async function getNhatKy(date: string) {
  const res = await (
    await r.diary()
  ).GET(req("GET", `/api/diaries/${date}`), {
    params: Promise.resolve({ date }),
  });
  return res.json();
}

const demReceipt = async (op: string) =>
  Number(
    (
      await own.query<{ n: string }>(
        `SELECT count(*) AS n FROM audit_operation_receipts WHERE operation_id = $1::uuid`,
        [op],
      )
    ).rows[0].n,
  );
const daLap = async (dimId: number) =>
  (
    await own.query<{ installed: number }>(
      `SELECT installed FROM progress_dimensions WHERE id = $1`,
      [dimId],
    )
  ).rows[0].installed;

// ── tick ──────────────────────────────────────────────────────────────────────────────────

test(
  "tick: mất ACK rồi gửi lại cùng key → cùng receipt, KHÔNG hồi sinh ô đã bỏ tick sau đó",
  S,
  async () => {
    const ctx = await layContext(F.u.eng, F.p1);
    const d = F.d[2];
    const k1 = randomUUID();
    const a = await tick(d, true, ctx, k1);
    assert.equal(a.status, 200);
    const ja = await a.json();
    assert.equal(ja.installed, true, "phản hồi thành công giữ định dạng cũ");
    assert.deepEqual(
      { ...ja.receipt },
      {
        operationId: k1,
        kind: "tick",
        replayed: false,
        resourceType: "progress_dimension",
        resourceId: String(d),
        version: null,
      },
    );
    // Người dùng bỏ tick (thao tác sau) — rồi client mất ACK của k1 gửi lại k1.
    assert.equal((await tick(d, false, ctx, randomUUID())).status, 200);
    const lai = await tick(d, true, ctx, k1);
    assert.equal(lai.status, 200);
    const jl = await lai.json();
    assert.deepEqual(
      jl,
      { receipt: { ...ja.receipt, replayed: true } },
      "ACK replay không payload",
    );
    assert.equal(await daLap(d), 0, "replay không được chạy lại mutation (hồi sinh ô)");
    assert.equal(await demReceipt(k1), 1);
  },
);

test("tick: 20 request đồng thời cùng key → đúng một lần thực thi", S, async () => {
  const ctx = await layContext(F.u.eng, F.p1);
  const k = randomUUID();
  const d = F.d[3];
  const kq = await Promise.all(
    Array.from({ length: 20 }, () => requestRieng(() => tick(d, true, ctx, k))),
  );
  assert.deepEqual(
    kq.map((x) => x.status),
    Array(20).fill(200),
  );
  const js = await Promise.all(kq.map((x) => x.json()));
  assert.equal(js.filter((j) => j.receipt.replayed === false).length, 1, "chỉ 1 request thực thi");
  assert.equal(js.filter((j) => j.receipt.replayed === true).length, 19);
  assert.equal(await demReceipt(k), 1);
  assert.equal(await daLap(d), 1);
});

test(
  "tick: cùng key nhưng payload/loại khác → 409 idempotency_conflict, không ghi",
  S,
  async () => {
    const ctx = await layContext(F.u.eng, F.p1);
    const k = randomUUID();
    const d = F.d[4];
    assert.equal((await tick(d, true, ctx, k)).status, 200);
    const doi = await tick(d, false, ctx, k);
    assert.equal(doi.status, 409);
    assert.equal((await doi.json()).code, "idempotency_conflict");
    assert.equal(await daLap(d), 1, "payload khác không được áp");
    // Ghi chú có 3 trạng thái: vắng mặt (giữ nguyên) khác null (xoá) — cùng key phải 409.
    const xoaGhiChu = await (
      await r.dim()
    ).PATCH(
      req("PATCH", `/api/dimensions/${d}`, { body: { installed: true, note: null }, ctx, key: k }),
      { params: Promise.resolve({ id: String(d) }) },
    );
    assert.equal(xoaGhiChu.status, 409);
    const khacLoai = await batch([d], false, ctx, k);
    assert.equal(khacLoai.status, 409);
    assert.equal((await khacLoai.json()).code, "idempotency_conflict");
    assert.equal(await daLap(d), 1);
  },
);

// ── tick_batch ────────────────────────────────────────────────────────────────────────────

test(
  "tick_batch: replay cùng tập (thứ tự khác) → cùng receipt; tập khác cùng key → 409; 20 đồng thời → 1",
  S,
  async () => {
    const ctx = await layContext(F.u.eng, F.p1);
    const [x, y] = [F.d[2], F.d[5]];
    const k = randomUUID();
    const a = await batch([y, x], true, ctx, k);
    assert.equal(a.status, 200);
    const ja = await a.json();
    assert.equal(ja.updated, 2);
    assert.equal(ja.receipt.kind, "tick_batch");
    assert.equal(ja.receipt.resourceId, [x, y].sort((m, n) => m - n).join(","));
    await batch([x, y], false, ctx, randomUUID()); // thao tác sau: bỏ tick cả hai
    const lai = await batch([x, y, x], true, ctx, k);
    assert.equal(lai.status, 200);
    assert.equal((await lai.json()).receipt.replayed, true);
    assert.equal(await daLap(x), 0, "replay lô không chạy lại");
    const khac = await batch([x], true, ctx, k);
    assert.equal(khac.status, 409);

    const k2 = randomUUID();
    const kq = await Promise.all(
      Array.from({ length: 20 }, () => requestRieng(() => batch([x, y], true, ctx, k2))),
    );
    const js = await Promise.all(kq.map((q) => q.json()));
    assert.ok(kq.every((q) => q.status === 200));
    assert.equal(js.filter((j) => j.receipt.replayed === false).length, 1);
    assert.equal(await demReceipt(k2), 1);
  },
);

// ── quyền / context ──────────────────────────────────────────────────────────────────────

test(
  "quyền bị thu hồi giữa chừng: replay cùng key bị từ chối (403), receipt không phải giấy thông hành",
  S,
  async () => {
    const ctx = await layContext(F.u.sub, F.p1);
    const k = randomUUID();
    assert.equal((await tick(F.d[0], true, ctx, k)).status, 200);
    await own.query(`UPDATE tasks SET assigned_to = NULL WHERE id = $1`, [F.t1]);
    try {
      const lai = await tick(F.d[0], true, ctx, k);
      assert.equal(lai.status, 403, "mất phân công → từ chối kể cả khi đã có receipt");
      assert.equal((await lai.json()).receipt, undefined);
    } finally {
      await own.query(`UPDATE tasks SET assigned_to = $1 WHERE id = $2`, [F.u.sub.id, F.t1]);
    }

    // Hạ vai trò còn quyền xem → không còn editProgress → 403 cho cả ảnh/nhật ký/tick.
    const ctxE = await layContext(F.u.eng2, F.p1);
    const kE = randomUUID();
    assert.equal((await tick(F.d[5], true, ctxE, kE)).status, 200);
    await own.query(`UPDATE users SET role = 'viewer' WHERE id = $1`, [F.u.eng2.id]);
    try {
      assert.equal((await tick(F.d[5], true, ctxE, kE)).status, 403);
    } finally {
      await own.query(`UPDATE users SET role = 'engineer' WHERE id = $1`, [F.u.eng2.id]);
    }
  },
);

test(
  "context: thiếu → 409 context_invalid; dự án đã đổi → 409 context_changed (không 404, không ghi); header sai → 400",
  S,
  async () => {
    const ctx = await layContext(F.u.eng, F.p1);
    const d = F.d[4];
    await own.query(`UPDATE progress_dimensions SET installed = 0 WHERE id = $1`, [d]);

    const thieu = await tick(d, true, undefined, randomUUID());
    assert.equal(thieu.status, 409);
    assert.equal((await thieu.json()).code, "context_invalid");

    const khongKey = await tick(d, true, ctx, undefined);
    assert.equal(khongKey.status, 400);
    assert.equal((await khongKey.json()).code, "idempotency_key_required");
    const keySai = await tick(d, true, ctx, "khong-phai-uuid");
    assert.equal(keySai.status, 400);

    // Tài nguyên cha khác dự án của context (id đoán được) → 404 như cũ, KHÔNG để lại receipt.
    const kLa = randomUUID();
    const la = await tick(F.d[6], true, ctx, kLa);
    assert.equal(la.status, 404);
    const laAnh = await guiAnh(F.t3, anhMoi(), "x", ctx, kLa);
    assert.equal(laAnh.status, 404);
    assert.equal(await demReceipt(kLa), 0);
    assert.equal(await daLap(F.d[6]), 0);

    // Tab khác đổi dự án (cookie chung) → request cũ mang context P1 phải 409, không ghi vào đâu.
    await dangNhapDuAn(F.u.eng, F.p2);
    for (const res of [
      await tick(d, true, ctx, randomUUID()),
      await batch([d], true, ctx, randomUUID()),
      await guiAnh(F.t2, anhMoi(), "x", ctx, randomUUID()),
      await putNhatKy("2026-06-01", {}, { "if-none-match": "*" }, { ctx, key: randomUUID() }),
    ]) {
      assert.equal(res.status, 409);
      assert.equal((await res.json()).code, "context_changed");
    }
    assert.equal(await daLap(d), 0);
  },
);

// ── photo ─────────────────────────────────────────────────────────────────────────────────

async function demAnh(taskId: number) {
  return Number(
    (
      await own.query<{ n: string }>(`SELECT count(*) AS n FROM task_photos WHERE task_id = $1`, [
        taskId,
      ])
    ).rows[0].n,
  );
}
const fileCuaTask = (taskId: number) =>
  existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR).filter((f) => f.startsWith(`t${taskId}-`)) : [];
const demStaging = async (userId: number) =>
  Number(
    (
      await own.query<{ n: string }>(
        `SELECT count(*) AS n FROM photo_upload_staging WHERE user_id = $1`,
        [userId],
      )
    ).rows[0].n,
  );

test(
  "photo: mất ACK → cùng receipt, 1 dòng + 1 file; caption khác cùng key → 409; 20 đồng thời → 1 dòng, không file thừa",
  S,
  async () => {
    const ctx = await layContext(F.u.eng, F.p1);
    const truoc = await demAnh(F.t2);
    const fileTruoc = fileCuaTask(F.t2).length;
    const bytes = anhMoi();
    const k = randomUUID();
    const a = await guiAnh(F.t2, bytes, "Ống tầng 5", ctx, k);
    assert.equal(a.status, 201);
    const ja = await a.json();
    assert.equal(ja.caption, "Ống tầng 5");
    assert.equal(ja.receipt.resourceType, "task_photo");
    assert.equal(ja.receipt.resourceId, String(ja.id));

    const lai = await guiAnh(F.t2, bytes, "Ống tầng 5", ctx, k);
    assert.equal(lai.status, 200);
    assert.deepEqual(await lai.json(), { receipt: { ...ja.receipt, replayed: true } });
    const doi = await guiAnh(F.t2, bytes, "Chú thích khác", ctx, k);
    assert.equal(doi.status, 409);
    assert.equal((await doi.json()).code, "idempotency_conflict");
    assert.equal(await demAnh(F.t2), truoc + 1);
    assert.equal(fileCuaTask(F.t2).length, fileTruoc + 1);

    const k2 = randomUUID();
    const bytes2 = anhMoi();
    const kq = await Promise.all(
      Array.from({ length: 20 }, () =>
        requestRieng(() => guiAnh(F.t2, bytes2, "Đồng thời", ctx, k2)),
      ),
    );
    const js = await Promise.all(kq.map((q) => q.json()));
    assert.equal(kq.filter((q) => q.status === 201).length, 1, "đúng 1 lần tạo ảnh");
    assert.ok(kq.every((q) => q.status === 201 || q.status === 200));
    assert.ok(js.every((j) => j.receipt.resourceId === js.find((x) => x.id)?.receipt.resourceId));
    assert.equal(await demAnh(F.t2), truoc + 2);
    assert.equal(fileCuaTask(F.t2).length, fileTruoc + 2, "file của request thua đã được dọn");
    assert.equal(await demStaging(F.u.eng.id), 0, "không còn staging treo");
    assert.equal(await demReceipt(k2), 1);
  },
);

test("photo: ghi metadata lỗi → file vừa đặt được dọn, không để file mồ côi", S, async () => {
  const ctx = await layContext(F.u.eng, F.p1);
  // Lỗi DB thật SAU khi file đã nằm trên storage: trigger owner chặn đúng chú thích này.
  await own.query(`CREATE OR REPLACE FUNCTION s06_chan_anh() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.caption = 'S06-LOI-DB' THEN RAISE EXCEPTION 's06 lỗi ghi metadata'; END IF;
    RETURN NEW; END $$`);
  await own.query(`CREATE TRIGGER s06_chan_anh BEFORE INSERT ON task_photos
    FOR EACH ROW EXECUTE FUNCTION s06_chan_anh()`);
  const fileTruoc = fileCuaTask(F.t2).length;
  const truoc = await demAnh(F.t2);
  try {
    // Cả đường hàng đợi (có receipt) lẫn đường online cũ (không header) đều đi qua staging.
    for (const [c, key] of [
      [ctx, randomUUID()],
      [undefined, undefined],
    ] as const) {
      await assert.rejects(guiAnh(F.t2, anhMoi(), "S06-LOI-DB", c, key), /lỗi ghi metadata/);
      assert.equal(fileCuaTask(F.t2).length, fileTruoc, "file đã đặt phải bị xoá");
      assert.equal(await demStaging(F.u.eng.id), 0, "không còn dòng staging");
      assert.equal(await demAnh(F.t2), truoc);
    }
  } finally {
    await own.query(`DROP TRIGGER IF EXISTS s06_chan_anh ON task_photos`);
    await own.query(`DROP FUNCTION IF EXISTS s06_chan_anh()`);
  }
});

test(
  "photo: staging mồ côi (tiến trình chết sau khi đặt file) được đối soát ở lần upload sau",
  S,
  async () => {
    await dangNhapDuAn(F.u.eng, F.p1);
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const ten = `t${F.t2}-s06-mo-coi-${RUN}.png`;
    const tenMoi = `t${F.t2}-s06-dang-ghi-${RUN}.png`;
    writeFileSync(join(UPLOAD_DIR, ten), PNG_1X1);
    writeFileSync(join(UPLOAD_DIR, tenMoi), PNG_1X1);
    await own.query(
      `INSERT INTO photo_upload_staging (file_name, org_id, user_id, task_id, created_at)
       VALUES ($1, 1, $3, $4, now() - interval '2 hours'), ($2, 1, $3, $4, now())`,
      [ten, tenMoi, F.u.eng.id, F.t2],
    );
    try {
      const res = await guiAnh(F.t2, anhMoi(), "Sau sự cố");
      assert.equal(res.status, 201);
      assert.equal(existsSync(join(UPLOAD_DIR, ten)), false, "file mồ côi quá hạn đã bị xoá");
      assert.equal(existsSync(join(UPLOAD_DIR, tenMoi)), true, "staging còn mới không bị đụng");
      const con = await own.query(`SELECT file_name FROM photo_upload_staging WHERE user_id = $1`, [
        F.u.eng.id,
      ]);
      assert.deepEqual(
        con.rows.map((x) => x.file_name),
        [tenMoi],
      );
    } finally {
      await own.query(`DELETE FROM photo_upload_staging WHERE file_name = $1`, [tenMoi]);
      if (existsSync(join(UPLOAD_DIR, tenMoi))) unlinkSync(join(UPLOAD_DIR, tenMoi));
    }
  },
);

// ── diary_note ───────────────────────────────────────────────────────────────────────────

test(
  "diary: thiếu precondition → 428; tạo If-None-Match:*; If-Match cũ → 412 không đè; replay sau mất ACK không 412 giả",
  S,
  async () => {
    const date = "2026-06-10";
    const ctx = await layContext(F.u.eng, F.p1);
    const thieu = await putNhatKy(date, { workDone: "A" }, {});
    assert.equal(thieu.status, 428);
    assert.equal((await thieu.json()).code, "precondition_required");
    assert.equal((await putNhatKy(date, { workDone: "A" }, { "if-match": "*" })).status, 428);

    const k1 = randomUUID();
    const tao = await putNhatKy(
      date,
      { workDone: "Bản offline", manpower: [{ crew: "Tổ 1", headcount: 3 }] },
      { "if-none-match": "*" },
      { ctx, key: k1 },
    );
    assert.equal(tao.status, 200);
    const jt = await tao.json();
    assert.match(jt.etag, /^"\d+-\d+"$/);
    assert.equal(tao.headers.get("etag"), jt.etag);
    assert.equal(jt.receipt.version, jt.etag);

    // Người khác sửa bằng đúng phiên bản hiện hành (online, không receipt).
    await dangNhapDuAn(F.u.eng2, F.p1);
    const g = await getNhatKy(date);
    assert.equal(g.etag, jt.etag);
    const sua = await putNhatKy(date, { workDone: "Bản người khác" }, { "if-match": g.etag });
    assert.equal(sua.status, 200);
    const etag2 = (await sua.json()).etag;
    assert.notEqual(etag2, jt.etag);

    // Client offline mất ACK của k1 gửi lại: receipt trả TRƯỚC khi so If-None-Match → không 412.
    await dangNhapDuAn(F.u.eng, F.p1);
    const lai = await putNhatKy(
      date,
      { workDone: "Bản offline", manpower: [{ crew: "Tổ 1", headcount: 3 }] },
      { "if-none-match": "*" },
      { ctx, key: k1 },
    );
    assert.equal(lai.status, 200);
    assert.deepEqual(await lai.json(), { receipt: { ...jt.receipt, replayed: true } });
    // Cùng key mà đổi nội dung → 409.
    const doi = await putNhatKy(
      date,
      { workDone: "Sửa lén" },
      { "if-none-match": "*" },
      { ctx, key: k1 },
    );
    assert.equal(doi.status, 409);

    // Bản nháp dựa trên phiên bản cũ (key mới) → 412, nội dung server giữ nguyên.
    const cu = await putNhatKy(
      date,
      { workDone: "Đè bản cũ" },
      { "if-match": jt.etag },
      { ctx, key: randomUUID() },
    );
    assert.equal(cu.status, 412);
    assert.equal((await cu.json()).code, "version_mismatch");
    const taoLai = await putNhatKy(date, { workDone: "Tạo đè" }, { "if-none-match": "*" });
    assert.equal(taoLai.status, 412, "If-None-Match:* khi đã có nhật ký → 412");
    const sau = await getNhatKy(date);
    assert.equal(sau.diary.workDone, "Bản người khác");
    assert.equal(sau.etag, etag2);
  },
);

test("diary: hai request tạo mới đồng thời cùng ngày → 1 thành công, 1 nhận 412", S, async () => {
  const date = "2026-06-11";
  await dangNhapDuAn(F.u.eng, F.p1);
  const kq = await Promise.all(
    ["Tab 1", "Tab 2"].map((w) =>
      requestRieng(() => putNhatKy(date, { workDone: w }, { "if-none-match": "*" })),
    ),
  );
  assert.deepEqual(kq.map((q) => q.status).sort(), [200, 412]);
});

test(
  "diary: version tăng cả khi dòng con đổi (ảnh bị xoá cascade) — ETag là phiên bản mạnh",
  S,
  async () => {
    const date = "2026-06-12";
    await dangNhapDuAn(F.u.eng, F.p1);
    const anh = await (await guiAnh(F.t2, anhMoi(), "Cho nhật ký")).json();
    const tao = await putNhatKy(date, { photoIds: [anh.id] }, { "if-none-match": "*" });
    assert.equal(tao.status, 200);
    const e1 = (await tao.json()).etag;
    const xoa = await own.query<{ file_name: string }>(
      `DELETE FROM task_photos WHERE id = $1 RETURNING file_name`,
      [anh.id],
    );
    const p = join(UPLOAD_DIR, xoa.rows[0].file_name);
    if (existsSync(p)) unlinkSync(p);
    const g = await getNhatKy(date);
    assert.deepEqual(g.photoIds, []);
    assert.notEqual(g.etag, e1, "biểu diễn đổi (mất ảnh) thì phiên bản phải đổi");
    assert.equal((await putNhatKy(date, {}, { "if-match": e1 })).status, 412);
  },
);

test(
  "xoá ảnh đồng thời với PUT nhật ký gắn ảnh đó → cả hai hoàn tất, không deadlock/500",
  S,
  async () => {
    // Trigger version 0164: xoá task_photos cascade diary_photos → UPDATE site_diaries; PUT nhật ký
    // khoá site_diaries trước rồi mới xoá/chèn diary_photos. Ngược chiều = deadlock. Tái hiện CHẮC
    // CHẮN: phiên `chan` giữ khoá dòng nhân lực để PUT dừng SAU khi đã khoá nhật ký, rồi mới phát
    // lệnh xoá ảnh, chờ nó cũng kẹt khoá, rồi nhả `chan`.
    const date = "2026-06-13";
    await dangNhapDuAn(F.u.eng, F.p1);
    const anh = await (await guiAnh(F.t2, anhMoi(), "Xoá đồng thời")).json();
    const tao = await putNhatKy(
      date,
      { photoIds: [anh.id], manpower: [{ crew: "Tổ khoá", headcount: 1 }] },
      { "if-none-match": "*" },
    );
    assert.equal(tao.status, 200);
    const { id: diaryId, etag } = await tao.json();

    const choKhoa = async (n: number) => {
      for (let i = 0; i < 400; i++) {
        const c = await own.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        if (c.rows[0].n >= n) return;
        await new Promise((ok) => setTimeout(ok, 25));
      }
      assert.fail(`không thấy ${n} phiên đang chờ khoá`);
    };
    const ketQua = (p: Promise<Response>) =>
      p.then(
        (res) => ({ status: res.status }),
        (e: unknown) => ({ status: 0, loi: String((e as Error)?.message ?? e) }),
      );

    const chan = await own.connect();
    try {
      await chan.query("BEGIN");
      await chan.query(`SELECT id FROM diary_manpower WHERE diary_id = $1 FOR UPDATE`, [diaryId]);
      const put = ketQua(
        requestRieng(() =>
          putNhatKy(
            date,
            { photoIds: [anh.id], workDone: "Sửa", manpower: [{ crew: "Tổ khoá", headcount: 2 }] },
            { "if-match": etag },
          ),
        ),
      );
      await choKhoa(1);
      const xoa = ketQua(
        requestRieng(async () =>
          (await r.photo()).DELETE(req("DELETE", `/api/photos/${anh.id}`), {
            params: Promise.resolve({ id: String(anh.id) }),
          }),
        ),
      );
      await choKhoa(2);
      await chan.query("COMMIT");
      const [kp, kx] = await Promise.all([put, xoa]);
      assert.deepEqual(kp, { status: 200 }, "PUT nhật ký hoàn tất");
      assert.deepEqual(kx, { status: 200 }, "xoá ảnh hoàn tất");
    } finally {
      await chan.query("ROLLBACK").catch(() => {});
      chan.release();
    }
    const g = await getNhatKy(date);
    assert.deepEqual(g.photoIds, [], "ảnh đã xoá thì nhật ký không còn gắn");
    assert.match(g.diary.workDone, /Sửa/);
  },
);

test(
  "PUT nhật ký: photoIds trỏ tới ảnh của dự án khác → 422, không gắn ảnh xuyên dự án",
  S,
  async () => {
    await dangNhapDuAn(F.u.eng, F.p2);
    const anhP2 = await (await guiAnh(F.t3, anhMoi(), "Ảnh dự án P2")).json();
    assert.ok(anhP2.id);
    await dangNhapDuAn(F.u.eng, F.p1);
    const anhP1 = await (await guiAnh(F.t2, anhMoi(), "Ảnh dự án P1")).json();
    const date = "2026-06-14";
    const sai = await putNhatKy(date, { photoIds: [anhP1.id, anhP2.id] }, { "if-none-match": "*" });
    assert.equal(sai.status, 422);
    assert.match((await sai.json()).error, /không thuộc dự án/);
    assert.equal((await getNhatKy(date)).diary, null, "bị từ chối thì không tạo nhật ký");
    const dung = await putNhatKy(date, { photoIds: [anhP1.id] }, { "if-none-match": "*" });
    assert.equal(dung.status, 200);
    assert.deepEqual((await getNhatKy(date)).photoIds, [anhP1.id]);
  },
);

test(
  "user B cùng dự án dùng lại đúng Idempotency-Key của A → B thực thi bình thường, 2 receipt",
  S,
  async () => {
    const k = randomUUID();
    const ctxA = await layContext(F.u.eng, F.p1);
    const a = await tick(F.d[4], true, ctxA, k);
    assert.equal(a.status, 200);
    const ctxB = await layContext(F.u.eng2, F.p1);
    await own.query(`UPDATE progress_dimensions SET installed = 0 WHERE id = $1`, [F.d[5]]);
    const b = await tick(F.d[5], true, ctxB, k);
    assert.equal(b.status, 200, "khoá receipt theo (org, dự án, user, op) — không 409 chéo người");
    const jb = await b.json();
    assert.equal(jb.receipt.replayed, false, "không nhận ACK của A");
    assert.equal(jb.receipt.resourceId, String(F.d[5]));
    assert.equal(jb.installed, true);
    assert.equal(await daLap(F.d[5]), 1);
    assert.equal(await demReceipt(k), 2);
  },
);

// ── RLS / quyền DB của receipt ───────────────────────────────────────────────────────────

test(
  "RLS: receipt chỉ thấy đúng user/org/dự án; xboss_app không UPDATE/DELETE được",
  S,
  async () => {
    const app = new Pool({ connectionString: appConnString(), max: 1 });
    const c = await app.connect();
    try {
      const nguoi = async (u: number, p: number) => {
        await c.query(
          `SELECT set_config('app.user_id', $1, true), set_config('app.org_id', '1', true),
                set_config('app.project_id', $2, true)`,
          [String(u), String(p)],
        );
        return Number(
          (await c.query<{ n: string }>(`SELECT count(*) AS n FROM audit_operation_receipts`))
            .rows[0].n,
        );
      };
      await c.query("BEGIN");
      assert.ok((await nguoi(F.u.eng.id, F.p1)) > 0, "chủ thấy receipt của mình");
      assert.equal(await nguoi(F.u.eng.id, F.p2), 0, "dự án khác không thấy");
      assert.equal((await nguoi(F.u.sub.id, F.p1)) < (await nguoi(F.u.eng.id, F.p1)), true);
      await c.query("ROLLBACK");
      for (const sql of [
        `UPDATE audit_operation_receipts SET request_hash = request_hash`,
        `DELETE FROM audit_operation_receipts`,
      ]) {
        await assert.rejects(c.query(sql), /permission denied/);
      }
      await c.query("BEGIN");
      await c.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.org_id', '1', true),
              set_config('app.project_id', $2, true)`,
        [String(F.u.eng.id), String(F.p1)],
      );
      await assert.rejects(
        c.query(
          `INSERT INTO audit_operation_receipts (operation_id, user_id, org_id, project_id,
           operation_kind, request_hash, resource_type, resource_id)
         VALUES ($1, $2, 1, $3, 'tick', repeat('a', 64), 'x', '1')`,
          [randomUUID(), F.u.sub.id, F.p1],
        ),
        /row-level security/,
        "không ghi receipt hộ người khác",
      );
      await c.query("ROLLBACK");
    } finally {
      c.release();
      await app.end();
    }
  },
);
