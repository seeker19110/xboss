import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import type { Role } from "@/lib/nen/roles";
import { OfflineQueueManager } from "@/app/components/offlineQueue";
import { MemoryTxDb, QueueDb, STORE_OPS } from "@/app/components/offlineQueue/store";
import type { QueueRecord, SendOutcome, YeuCauGui } from "@/app/components/offlineQueue/logic";

// QUALITY-FINAL-1 S07 — hàng đợi offline v2 (client THẬT: manager + QueueDb + VaultSession)
// nói chuyện với route THẬT của S05/S06 (/api/auth/me, /api/offline/*, 4 endpoint nghiệp vụ) chạy
// bằng role `xboss_app` trên Postgres. "Trình duyệt" chỉ là bộ chuyển fetch → handler + hũ cookie
// proof; IndexedDB thay bằng MemoryTxDb (cùng ngữ nghĩa commit). Bằng chứng: khoá do server cấp
// mã hoá được payload, header Idempotency-Key/X-XBoss-Context/If-Match được server chấp nhận, mất
// ACK → replay receipt một hiệu ứng, 412 nhật ký → conflict bền không đè, đổi dự án → không gửi
// nhầm dự án mới. Map AC: A2-AC02, A2-AC04, A2-AC06, A2-AC10.

const S = { skip: !HAS_TEST_DB };

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}
if (HAS_TEST_DB) process.env.DATABASE_URL = appConnString();
process.env.XBOSS_OFFLINE_KEK = `v1:${"q".repeat(40)}`;

Object.defineProperty(globalThis.navigator, "onLine", {
  value: true,
  configurable: true,
  writable: true,
});
const datOnline = (v: boolean) => {
  (globalThis.navigator as { onLine: boolean }).onLine = v;
};

const RUN = Date.now().toString(36);
const own = HAS_TEST_DB
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 })
  : (null as unknown as Pool);

type U = { id: number; passwordHash: string; orgId: number; role: Role; sessionVersion: number };
const F = {
  p1: 0,
  p2: 0,
  t1: 0,
  d: [] as number[],
  users: [] as number[],
  projects: [] as number[],
  eng: null as unknown as U,
};

async function taoUser(ten: string, role: Role): Promise<U> {
  const hash = `hash-s07-${ten}-${RUN}`;
  const r = await own.query<{ id: number }>(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ($1, $2, $3, $4, 1) RETURNING id`,
    [`S07 ${ten}`, `s07-${ten}-${RUN}@test.local`, hash, role],
  );
  F.users.push(r.rows[0].id);
  return { id: r.rows[0].id, passwordHash: hash, orgId: 1, role, sessionVersion: 0 };
}

async function taoDuAn(ten: string): Promise<number> {
  const r = await own.query<{ id: number }>(
    `INSERT INTO projects (name, org_id) VALUES ($1, 1) RETURNING id`,
    [`S07 ${ten} ${RUN}`],
  );
  F.projects.push(r.rows[0].id);
  return r.rows[0].id;
}

async function taoTask(projectId: number, soO: number) {
  const tw = await own.query<{ id: number }>(
    `INSERT INTO towers (project_id, name) VALUES ($1, 'Tháp S07') RETURNING id`,
    [projectId],
  );
  const code = `S07${RUN}${projectId}`;
  const st = await own.query<{ id: number }>(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES ($1, $2, 'Sheet S07', $3) RETURNING id`,
    [tw.rows[0].id, code, code.toLowerCase()],
  );
  const wp = await own.query<{ id: number }>(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES ($1, $2, 'Nhóm', 1) RETURNING id`,
    [st.rows[0].id, `PK${code}`],
  );
  const t = await own.query<{ id: number }>(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
     VALUES ($1, $2, 'Task S07', 1, 0, 'chuan_bi') RETURNING id`,
    [wp.rows[0].id, `TK${code}`],
  );
  for (let i = 0; i < soO; i++) {
    const d = await own.query<{ id: number }>(
      `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES ($1, $2, 0) RETURNING id`,
      [t.rows[0].id, `Ô${i}`],
    );
    F.d.push(d.rows[0].id);
  }
  return t.rows[0].id;
}

before(async () => {
  if (!HAS_TEST_DB) return;
  F.eng = await taoUser("eng", "engineer");
  F.p1 = await taoDuAn("P1");
  F.p2 = await taoDuAn("P2");
  F.t1 = await taoTask(F.p1, 3);
});

after(async () => {
  dangXuat();
  if (!HAS_TEST_DB) return;
  const ids = F.users;
  await own.query(`DELETE FROM audit_operation_receipts WHERE user_id = ANY($1::int[])`, [ids]);
  await own.query(`DELETE FROM site_diaries WHERE project_id = ANY($1::int[])`, [F.projects]);
  await own.query(`DELETE FROM task_history WHERE task_id = $1`, [F.t1]);
  await own.query(`DELETE FROM progress_dimensions WHERE task_id = $1`, [F.t1]);
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

// ── "Trình duyệt": fetch → route handler thật + hũ cookie proof ─────────────────────────────

let proof: string | null = null;

const route = {
  me: () => import("@/app/api/auth/me/route"),
  devices: () => import("@/app/api/offline/devices/route"),
  context: () => import("@/app/api/offline/context/route"),
  unlock: () => import("@/app/api/offline/vault/unlock/route"),
  keys: () => import("@/app/api/offline/vault/keys/route"),
  dim: () => import("@/app/api/dimensions/[id]/route"),
  batch: () => import("@/app/api/dimensions/batch/route"),
  diary: () => import("@/app/api/diaries/[date]/route"),
};

async function trinhDuyetFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const method = init.method ?? "GET";
  const h: Record<string, string> = { host: "localhost", origin: "http://localhost" };
  for (const [k, v] of Object.entries((init.headers as Record<string, string>) ?? {}))
    h[k.toLowerCase()] = v;
  if (proof && url.startsWith("/api/offline/")) h.cookie = `xboss_offline_proof=${proof}`;
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: h,
    body: init.body as BodyInit | undefined,
  });
  const goi = async (): Promise<Response> => {
    if (url === "/api/auth/me") return (await route.me()).GET();
    if (url === "/api/offline/devices") {
      const res = await (await route.devices()).POST(req);
      proof = res.cookies.get("xboss_offline_proof")?.value ?? proof;
      return res;
    }
    if (url === "/api/offline/context") return (await route.context()).POST(req);
    if (url === "/api/offline/vault/unlock") return (await route.unlock()).POST(req);
    if (url === "/api/offline/vault/keys") return (await route.keys()).POST(req);
    if (url === "/api/dimensions/batch") return (await route.batch()).PATCH(req);
    let m = /^\/api\/dimensions\/(\d+)$/.exec(url);
    if (m) return (await route.dim()).PATCH(req, { params: Promise.resolve({ id: m[1] }) });
    m = /^\/api\/diaries\/(\d{4}-\d{2}-\d{2})$/.exec(url);
    if (m) {
      const mod = await route.diary();
      const p = { params: Promise.resolve({ date: m[1] }) };
      return method === "PUT" ? mod.PUT(req, p) : mod.GET(req, p);
    }
    throw new Error(`route chưa nối: ${method} ${url}`);
  };
  return requestRieng(goi);
}

/** Gửi y như guiYeuCau của manager (fetch toàn cục) nhưng cho test chèn "mất ACK". */
async function guiThat(req: YeuCauGui): Promise<SendOutcome> {
  const res = await trinhDuyetFetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  const body = (await res.json().catch(() => null)) as {
    code?: string;
    error?: string;
    receipt?: { operationId?: string };
  } | null;
  return {
    status: res.status,
    code: body?.code,
    error: body?.error,
    retryAfter: res.headers.get("Retry-After"),
    receiptOperationId: body?.receipt?.operationId ?? null,
  };
}

function taoManager(send: (req: YeuCauGui) => Promise<SendOutcome>, db = new MemoryTxDb()) {
  const q = new OfflineQueueManager({ store: new QueueDb(db), send });
  return { q, db, ops: () => [...db.data.get(STORE_OPS)!.values()] as QueueRecord[] };
}

const fetchGoc = globalThis.fetch;
before(() => {
  globalThis.fetch = trinhDuyetFetch as typeof fetch;
});
after(() => {
  globalThis.fetch = fetchGoc;
});

const daLap = async (dimId: number) =>
  (
    await own.query<{ installed: number }>(
      `SELECT installed FROM progress_dimensions WHERE id = $1`,
      [dimId],
    )
  ).rows[0].installed;
const demReceipt = async (op: string) =>
  Number(
    (
      await own.query<{ n: string }>(
        `SELECT count(*) AS n FROM audit_operation_receipts WHERE operation_id = $1::uuid`,
        [op],
      )
    ).rows[0].n,
  );

test(
  "tick offline → online: khoá từ server mã hoá op, route thật nhận Idempotency-Key + context; mất ACK → replay một hiệu ứng (A2-AC04)",
  S,
  async () => {
    await dangNhapDuAn(F.eng, F.p1);
    proof = null;
    const ackMat = new Set<number>();
    let lan = 0;
    const gui: YeuCauGui[] = [];
    const m = taoManager(async (req) => {
      gui.push(req);
      const kq = await guiThat(req);
      // Lần gửi đầu: server đã COMMIT nhưng client mất ACK.
      if (++lan === 1) {
        ackMat.add(lan);
        return { networkError: true };
      }
      return kq;
    });
    m.q.dangKyLuoi([{ id: F.t1, cells: { a: { id: F.d[0] }, b: { id: F.d[1] } } }]);
    await m.q.chuanBiTracking([{ id: F.t1 }]);
    assert.equal(m.q.vault.trangThai, "active", "unlock/keys qua route thật");
    datOnline(false);
    try {
      assert.equal(await m.q.enqueueTick(F.d[0], true), true);
    } finally {
      datOnline(true);
    }
    await m.q.flush();
    assert.equal(await daLap(F.d[0]), 1, "server đã áp thao tác dù client mất ACK");
    assert.equal(m.ops().length, 1, "mất ACK → giữ op");
    const op = m.ops()[0];
    assert.equal(op.tries, 1);
    // Người dùng (online, trực tiếp) bỏ tick sau đó — replay KHÔNG được hồi sinh ô.
    await own.query(`UPDATE progress_dimensions SET installed = 0 WHERE id = $1`, [F.d[0]]);
    await own.query(`UPDATE progress_dimensions SET installed = 0 WHERE id = $1`, [F.d[0]]);
    // Bỏ qua backoff (mốc trong store) rồi gửi lại.
    m.db.data.get(STORE_OPS)!.set(JSON.stringify(op.operationId), { ...op, nextAttemptAt: 0 });
    await m.q.flush();
    assert.equal(m.ops().length, 0, "replay receipt → xoá op");
    assert.equal(await daLap(F.d[0]), 0, "replay không chạy lại mutation");
    assert.equal(await demReceipt(op.operationId), 1);
    assert.equal(gui.length, 2);
    assert.equal(gui[0].headers["Idempotency-Key"], gui[1].headers["Idempotency-Key"]);
    assert.equal(gui[0].headers["Idempotency-Key"], op.operationId);
    assert.ok(gui.every((g) => g.headers["X-XBoss-Context"]?.includes(".")));
  },
);

test("lô tick + FIFO: lô gửi một request tới route batch thật, receipt đúng op", S, async () => {
  await dangNhapDuAn(F.eng, F.p1);
  const m = taoManager(guiThat);
  m.q.dangKyLuoi([{ id: F.t1, cells: { a: { id: F.d[1] }, b: { id: F.d[2] } } }]);
  await m.q.chuanBiTracking([{ id: F.t1 }]);
  datOnline(false);
  try {
    assert.equal(await m.q.enqueueTickBatch([F.d[1], F.d[2]], true), true);
    assert.equal(await m.q.enqueueTick(F.d[1], false), true);
  } finally {
    datOnline(true);
  }
  assert.equal(
    m.ops().length,
    2,
    "lô 2 ô + tick lẻ sau: lô không bị nuốt (tick lẻ chỉ thay lô 1 ô)",
  );
  await m.q.flush();
  assert.equal(m.ops().length, 0);
  assert.equal(await daLap(F.d[1]), 0, "FIFO: tick lẻ (sau) thắng lô (trước)");
  assert.equal(await daLap(F.d[2]), 1);
});

test(
  "nhật ký: If-Match từ etag LÚC ENQUEUE; người khác lưu trước → 412 → conflict bền, bản server không bị đè (A2-AC10)",
  S,
  async () => {
    await dangNhapDuAn(F.eng, F.p1);
    const ngay = "2026-10-07";
    const diary = await route.diary();
    const put = async (body: unknown, headers: Record<string, string>) =>
      requestRieng(async () =>
        diary.PUT(
          new NextRequest(`http://localhost/api/diaries/${ngay}`, {
            method: "PUT",
            headers: {
              host: "localhost",
              origin: "http://localhost",
              "content-type": "application/json",
              ...headers,
            },
            body: JSON.stringify(body),
          }),
          { params: Promise.resolve({ date: ngay }) },
        ),
      );
    const base = {
      weatherAm: null,
      weatherPm: null,
      obstacles: null,
      safetyNote: null,
      manpower: [],
      photoIds: [],
    };
    const tao = await put({ ...base, workDone: "bản gốc" }, { "If-None-Match": "*" });
    assert.equal(tao.status, 200);
    const etag = (await tao.json()).etag as string;

    const gui: YeuCauGui[] = [];
    const m = taoManager(async (req) => (gui.push(req), guiThat(req)));
    await m.q.chuanBiTracking([{ id: F.t1 }]);
    await m.q.chuanBiNhatKy(ngay);
    datOnline(false);
    try {
      const r = await m.q.enqueueDiaryNote({ date: ngay, ...base, workDone: "bản offline" }, etag);
      assert.deepEqual(r, { ok: true });
    } finally {
      datOnline(true);
    }
    // Người khác lưu trực tiếp trước khi thiết bị có mạng lại.
    const khac = await put({ ...base, workDone: "bản người khác" }, { "If-Match": etag });
    assert.equal(khac.status, 200);
    await m.q.flush();
    assert.equal(gui.length, 1);
    assert.equal(gui[0].headers["If-Match"], etag, "precondition cố định từ lúc enqueue");
    assert.equal(m.ops().length, 1);
    assert.equal(m.ops()[0].state, "conflict");
    assert.equal(m.ops()[0].lastResult?.status, 412);
    const hienTai = await own.query<{ work_done: string }>(
      `SELECT work_done FROM site_diaries WHERE project_id = $1 AND diary_date = $2`,
      [F.p1, ngay],
    );
    assert.equal(hienTai.rows[0].work_done, "bản người khác");
    // Bản nháp vẫn đọc lại được để người dùng so sánh/tự quyết (S08 dựng UI).
    assert.equal((await m.q.getQueuedDiaryNote(ngay))?.payload.workDone, "bản offline");
    await m.q.flush();
    assert.equal(gui.length, 1, "conflict không retry mù");
  },
);

test(
  "đổi dự án (cookie chung) trước khi có mạng → không gửi op dự án cũ sang dự án mới (A2-AC02)",
  S,
  async () => {
    await dangNhapDuAn(F.eng, F.p1);
    proof = null;
    const gui: YeuCauGui[] = [];
    const m = taoManager(async (req) => (gui.push(req), guiThat(req)));
    m.q.dangKyLuoi([{ id: F.t1, cells: { a: { id: F.d[2] } } }]);
    await m.q.chuanBiTracking([{ id: F.t1 }]);
    datOnline(false);
    try {
      assert.equal(await m.q.enqueueTick(F.d[2], false), true);
    } finally {
      datOnline(true);
    }
    await dangNhapDuAn(F.eng, F.p2); // tab khác đổi dự án
    // Ép làm mới context (giả lập gần hết hạn): server thấy dự án đã đổi → 409 → khoá, không gửi.
    (m.q.vault as unknown as { nguCanh: { hanDonDieu: number } }).nguCanh.hanDonDieu = 0;
    await m.q.flush();
    assert.equal(gui.length, 0);
    assert.equal(m.ops().length, 1, "op giữ nguyên chờ chính chủ quay lại dự án cũ");
    assert.equal(await daLap(F.d[2]), 1, "dữ liệu dự án mới/cũ không bị ghi nhầm");
    // Tải lại trang ở dự án mới: op dự án cũ bị khoá (locked), không gửi.
    const m2 = taoManager(async (req) => (gui.push(req), guiThat(req)), m.db);
    await m2.q.flush();
    assert.equal(gui.length, 0);
    assert.equal(m2.q.getSnapshot().locked, 1);
    // Quay lại dự án cũ: mở vault đúng dự án → gửi được.
    await dangNhapDuAn(F.eng, F.p1);
    const m3 = taoManager(guiThat, m.db);
    await m3.q.flush();
    assert.equal(m3.ops().length, 0);
    assert.equal(await daLap(F.d[2]), 0);
  },
);

// ── S15: A2-AC03 (nhật ký độc lập theo dự án/chủ) + A2-AC06 (403/404/422 → rejected bền) ─────

const NOI_DUNG_NHAT_KY = {
  weatherAm: null,
  weatherPm: null,
  obstacles: null,
  safetyNote: null,
  manpower: [],
  photoIds: [],
};

const docNhatKy = async (projectId: number, ngay: string) =>
  (
    await own.query<{ work_done: string }>(
      `SELECT work_done FROM site_diaries WHERE project_id = $1 AND diary_date = $2`,
      [projectId, ngay],
    )
  ).rows[0]?.work_done;

const layEtag = async (ngay: string) =>
  (await (await trinhDuyetFetch(`/api/diaries/${ngay}`)).json()).etag as string;

test(
  "A2-AC03: nhật ký CÙNG ngày ở 2 dự án khác nhau (2 chủ khác nhau) độc lập — route thật, không ghi đè lẫn nhau",
  S,
  async () => {
    const ngay = "2026-10-08";
    const eng2 = await taoUser("eng2", "engineer");
    const t2 = await taoTask(F.p2, 0);
    const gui: YeuCauGui[] = [];

    const xepHang = async (u: U, projectId: number, taskId: number, noiDung: string) => {
      await dangNhapDuAn(u, projectId);
      proof = null;
      const m = taoManager(async (req) => (gui.push(req), guiThat(req)));
      await m.q.chuanBiTracking([{ id: taskId }]);
      await m.q.chuanBiNhatKy(ngay);
      datOnline(false);
      try {
        const r = await m.q.enqueueDiaryNote(
          { date: ngay, ...NOI_DUNG_NHAT_KY, workDone: noiDung },
          null,
        );
        assert.deepEqual(r, { ok: true });
      } finally {
        datOnline(true);
      }
      return m;
    };

    // Hai thiết bị (2 chủ, 2 dự án) cùng xếp hàng nhật ký ngày `ngay` khi mất mạng.
    const m1 = await xepHang(F.eng, F.p1, F.t1, "nhật ký dự án 1");
    const m2 = await xepHang(eng2, F.p2, t2, "nhật ký dự án 2");
    assert.equal(m1.ops().length, 1);
    assert.equal(m2.ops().length, 1);
    assert.notEqual(m1.ops()[0].operationId, m2.ops()[0].operationId);

    // Có mạng: mỗi chủ gửi dưới phiên + dự án của mình.
    await dangNhapDuAn(F.eng, F.p1);
    await m1.q.flush();
    await dangNhapDuAn(eng2, F.p2);
    await m2.q.flush();

    assert.equal(m1.ops().length, 0, "op dự án 1 đã giao");
    assert.equal(m2.ops().length, 0, "op dự án 2 đã giao");
    assert.equal(await docNhatKy(F.p1, ngay), "nhật ký dự án 1");
    assert.equal(await docNhatKy(F.p2, ngay), "nhật ký dự án 2", "không bị dự án 1 ghi đè");
    assert.equal(gui.length, 2, "mỗi op đúng 1 request");

    // Etag của dự án 1 không dùng được để ghi vào nhật ký dự án 2 (không lẫn bản ghi).
    await dangNhapDuAn(F.eng, F.p1);
    const etagP1 = await layEtag(ngay);
    await dangNhapDuAn(eng2, F.p2);
    assert.notEqual(etagP1, await layEtag(ngay), "etag mỗi dự án khác nhau");
    const cheo = await trinhDuyetFetch(`/api/diaries/${ngay}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "If-Match": etagP1 },
      body: JSON.stringify({ ...NOI_DUNG_NHAT_KY, workDone: "ghi chéo" }),
    });
    assert.equal(cheo.status, 412);
    assert.equal(await docNhatKy(F.p2, ngay), "nhật ký dự án 2");
    assert.equal(await docNhatKy(F.p1, ngay), "nhật ký dự án 1");
  },
);

test(
  "A2-AC03: hai chủ khác nhau cùng dự án + cùng ngày — người đến sau (If-None-Match) bị conflict, bản người trước KHÔNG bị đè",
  S,
  async () => {
    const ngay = "2026-10-09";
    const eng3 = await taoUser("eng3", "engineer");
    // Người 1 lưu trực tiếp trước.
    await dangNhapDuAn(F.eng, F.p1);
    const tao = await trinhDuyetFetch(`/api/diaries/${ngay}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "If-None-Match": "*" },
      body: JSON.stringify({ ...NOI_DUNG_NHAT_KY, workDone: "chủ 1 lưu trước" }),
    });
    assert.equal(tao.status, 200);

    // Người 2 (thiết bị khác) lập offline cùng ngày, chưa biết có bản của người 1.
    await dangNhapDuAn(eng3, F.p1);
    proof = null;
    const m = taoManager(guiThat);
    await m.q.chuanBiTracking([{ id: F.t1 }]);
    await m.q.chuanBiNhatKy(ngay);
    datOnline(false);
    try {
      assert.deepEqual(
        await m.q.enqueueDiaryNote(
          { date: ngay, ...NOI_DUNG_NHAT_KY, workDone: "chủ 2 offline" },
          null,
        ),
        { ok: true },
      );
    } finally {
      datOnline(true);
    }
    await m.q.flush();
    assert.equal(m.ops().length, 1);
    assert.equal(m.ops()[0].state, "conflict");
    assert.equal(m.ops()[0].lastResult?.status, 412);
    assert.equal(await docNhatKy(F.p1, ngay), "chủ 1 lưu trước", "không ghi đè bản đã có");
  },
);

test(
  "A2-AC06 (H): op offline nhận 404/422/403 từ route THẬT → rejected bền vững, không retry",
  S,
  async () => {
    const ngay = "2026-10-10";
    const eng4 = await taoUser("eng4", "engineer");
    await dangNhapDuAn(eng4, F.p1);
    proof = null;
    const gui: YeuCauGui[] = [];
    const m = taoManager(async (req) => (gui.push(req), guiThat(req)));

    // Ô riêng cho ca 404 — sẽ bị xoá trước khi flush.
    const dim404 = (
      await own.query<{ id: number }>(
        `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES ($1, 'Ô404', 0) RETURNING id`,
        [F.t1],
      )
    ).rows[0].id;
    m.q.dangKyLuoi([{ id: F.t1, cells: { a: { id: dim404 } } }]);
    await m.q.chuanBiTracking([{ id: F.t1 }]);
    await m.q.chuanBiNhatKy(ngay);

    datOnline(false);
    try {
      // 404: tick ô sẽ bị xoá.
      assert.equal(await m.q.enqueueTick(dim404, true), true);
      // 422: nhật ký có tổ đội lặp tên (route trả 422 "bị lặp lại").
      assert.deepEqual(
        await m.q.enqueueDiaryNote(
          {
            date: ngay,
            ...NOI_DUNG_NHAT_KY,
            workDone: "sẽ bị từ chối",
            manpower: [
              { crew: "Tổ A", headcount: 1 },
              { crew: "Tổ A", headcount: 2 },
            ],
          },
          null,
        ),
        { ok: true },
      );
    } finally {
      datOnline(true);
    }
    await own.query(`DELETE FROM progress_dimensions WHERE id = $1`, [dim404]);

    await m.q.flush();
    const dump = JSON.stringify(m.ops().map((o) => [o.state, o.lastResult]));
    const trangThai = Object.fromEntries(m.ops().map((o) => [o.lastResult?.status, o.state]));
    assert.equal(trangThai[404], "rejected", dump);
    assert.equal(trangThai[422], "rejected", dump);
    assert.equal(m.ops().length, 2, "op bị từ chối được giữ lại cho người dùng xem");
    const soGui = gui.length;
    await m.q.flush();
    assert.equal(gui.length, soGui, "rejected không bị retry");
    assert.equal(await docNhatKy(F.p1, ngay), undefined, "nhật ký bị 422 không được ghi");

    // 403: vai trò mất quyền sửa tiến độ (chỉ-xem) trước khi flush.
    const dimMoi = (
      await own.query<{ id: number }>(
        `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES ($1, 'Ô403', 0) RETURNING id`,
        [F.t1],
      )
    ).rows[0].id;
    const m403 = taoManager(async (req) => (gui.push(req), guiThat(req)));
    m403.q.dangKyLuoi([{ id: F.t1, cells: { a: { id: dimMoi } } }]);
    await m403.q.chuanBiTracking([{ id: F.t1 }]);
    datOnline(false);
    try {
      assert.equal(await m403.q.enqueueTick(dimMoi, true), true);
    } finally {
      datOnline(true);
    }
    await own.query(`UPDATE users SET role = 'viewer' WHERE id = $1`, [eng4.id]);
    await m403.q.flush();
    const op403 = m403.ops()[0];
    assert.equal(op403.lastResult?.status, 403, JSON.stringify(op403));
    assert.equal(op403.state, "rejected");
    const lap = await own.query<{ installed: number }>(
      `SELECT installed FROM progress_dimensions WHERE id = $1`,
      [dimMoi],
    );
    assert.equal(lap.rows[0].installed, 0, "403 không ghi gì");
    await own.query(`DELETE FROM progress_dimensions WHERE id = $1`, [dimMoi]);
  },
);
