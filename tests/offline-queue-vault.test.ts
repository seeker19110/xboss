// Hàng đợi offline v2 (QUALITY-FINAL-1 S07) — mã hoá + chủ sở hữu + nguyên tử + lease/fencing +
// trạng thái bền, chạy trên lớp lưu trữ QueueDb THẬT (MemoryTxDb thay IndexedDB, cùng ngữ nghĩa
// "chỉ commit khi transaction hoàn tất"), VaultSession THẬT (WebCrypto thật) và máy chủ giả cho
// /api/offline/*. Bằng chứng với route THẬT + Postgres: offline-queue-route.test.ts.
// Map AC: A2-AC01/03/04/05/06/07, Q-AC02 (sai chủ/sửa AAD không giải được).
import { test } from "node:test";
import assert from "node:assert/strict";
import { OfflineQueueManager, OFFLINE_SAVE_ERROR } from "@/app/components/offlineQueue";
import {
  LEGACY_STORE,
  MemoryTxDb,
  QueueDb,
  STORE_META,
  STORE_OPS,
} from "@/app/components/offlineQueue/store";
import { VaultSession } from "@/app/components/offlineQueue/vault";
import {
  flushQueue,
  khoaChu,
  LEASE_TTL_MS,
  type QueueRecord,
  type SendOutcome,
  type YeuCauGui,
} from "@/app/components/offlineQueue/logic";
import { taoMayChuGia } from "./helpers/offline-may-chu-gia";

Object.defineProperty(globalThis.navigator, "onLine", {
  value: true,
  configurable: true,
  writable: true,
});
const datOnline = (v: boolean) => {
  (globalThis.navigator as { onLine: boolean }).onLine = v;
};

const A = { id: 7, orgId: 1, role: "engineer" };
const B = { id: 8, orgId: 1, role: "engineer" };
const TASK = 41;
const DIM = [501, 502, 503];

type Phan = (req: YeuCauGui, lan: number) => SendOutcome | Promise<SendOutcome>;

function moiTruong(opts: { db?: MemoryTxDb; may?: ReturnType<typeof taoMayChuGia> } = {}) {
  const db = opts.db ?? new MemoryTxDb();
  const may = opts.may ?? taoMayChuGia();
  const gui: YeuCauGui[] = [];
  let phan: Phan = (req) => ({ status: 200, receiptOperationId: req.headers["Idempotency-Key"] });
  const store = new QueueDb(db);
  const vault = new VaultSession(may.fetch);
  const q = new OfflineQueueManager({
    store,
    vault,
    send: async (req) => {
      gui.push(req);
      return phan(req, gui.length);
    },
  });
  return {
    db,
    may,
    store,
    vault,
    q,
    gui,
    datPhan: (p: Phan) => {
      phan = p;
    },
    async moTracking() {
      q.dangKyLuoi([
        { id: TASK, cells: Object.fromEntries(DIM.map((d, i) => [`c${i}`, { id: d }])) },
      ]);
      await q.chuanBiTracking([{ id: TASK }]);
    },
    ops: () => [...db.data.get(STORE_OPS)!.values()] as QueueRecord[],
  };
}

async function denLuc(dk: () => boolean, ms = 2000) {
  const het = Date.now() + ms;
  while (!dk()) {
    if (Date.now() > het) throw new Error("hết thời gian chờ");
    await new Promise((r) => setTimeout(r, 5));
  }
}

test("vault: chỉ ACTIVE sau xác minh online; payload trong IDB là ciphertext, không còn bản rõ", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  datOnline(false);
  try {
    await m.moTracking();
    assert.equal(m.vault.trangThai, "unknown", "mất mạng: không mở vault, không xin khoá");
    assert.equal(await m.q.enqueueTick(DIM[0], true), false, "không có khoá → không báo đã lưu");
  } finally {
    datOnline(true);
  }
  await m.moTracking();
  assert.equal(m.vault.trangThai, "active");
  m.datPhan(() => ({ networkError: true }));
  const ok = await m.q.enqueueDiaryNote(
    {
      date: "2026-10-08",
      weatherAm: "BÍ-MẬT-THỜI-TIẾT",
      weatherPm: null,
      workDone: "BÍ-MẬT-NỘI-DUNG",
      obstacles: null,
      safetyNote: null,
      manpower: [],
      photoIds: [],
    },
    '"77-3"',
  );
  assert.deepEqual(ok, { ok: false, error: OFFLINE_SAVE_ERROR }, "chưa có khoá nhật ký → từ chối");
  await m.q.chuanBiNhatKy("2026-10-08");
  const ok2 = await m.q.enqueueDiaryNote(
    {
      date: "2026-10-08",
      weatherAm: "BÍ-MẬT-THỜI-TIẾT",
      weatherPm: null,
      workDone: "BÍ-MẬT-NỘI-DUNG",
      obstacles: null,
      safetyNote: null,
      manpower: [],
      photoIds: [],
    },
    '"77-3"',
  );
  assert.deepEqual(ok2, { ok: true });
  await m.q.enqueueTick(DIM[1], true);
  const recs = [...m.db.data.get(STORE_OPS)!.values()] as Record<string, unknown>[];
  // Byte ciphertext/iv (base64url) và mốc thời gian ngẫu nhiên có thể tình cờ chứa chuỗi số ngắn →
  // kiểm bản rõ trên trường ĐỊNH TUYẾN (bỏ iv/ciphertext) với dấu phân cách JSON, và trên byte giải
  // base64 của ciphertext (không phải chuỗi base64) — tránh test chập chờn mà vẫn bắt rò bản rõ.
  const dinhTuyen = JSON.stringify(
    recs.map(({ iv: _iv, ciphertext: _ct, ...r }) => (void _iv, void _ct, r)),
  );
  const byteMa = recs
    .map((r) => Buffer.from(String(r.ciphertext), "base64url").toString("latin1"))
    .join("|");
  for (const bi of ["BÍ-MẬT", "2026-10-08", "installed"])
    assert.ok(!JSON.stringify(recs).includes(bi), `IDB không được chứa bản rõ "${bi}"`);
  for (const bi of ['"77-3', `:${DIM[1]},`, `:${DIM[1]}}`, `[${DIM[1]}`, `"${DIM[1]}"`])
    assert.ok(!dinhTuyen.includes(bi), `trường định tuyến không được chứa bản rõ ${bi}`);
  for (const bi of ["77-3", `"dimId":${DIM[1]}`, "workDone"])
    assert.ok(!byteMa.includes(bi), `ciphertext không được là bản rõ ${bi}`);
  assert.equal(m.ops().length, 2);
  assert.ok(m.ops().every((r) => r.schemaVersion === 2 && r.ownerUserId === A.id));
});

test("AAD/chủ sở hữu: B cùng trình duyệt không giải/đọc/gửi được op của A; sửa trường AAD → hỏng xác thực (Q-AC02, A2-AC01)", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  const a = moiTruong({ db, may });
  may.dangNhap(A);
  await a.moTracking();
  datOnline(false);
  try {
    assert.equal(await a.q.enqueueTick(DIM[0], true), true);
  } finally {
    datOnline(true);
  }
  const rA = a.ops()[0];
  assert.ok(await a.vault.giaiMa(rA));

  // Sửa bất kỳ trường nằm trong AAD → giải mã thất bại (không fallback).
  for (const sua of [
    { sequence: rA.sequence + 1 },
    { kind: "tick_batch" as const },
    { operationId: "99999999-9999-4999-8999-999999999999" },
  ]) {
    await assert.rejects(a.vault.giaiMa({ ...rA, ...sua }), /offline_crypto_auth/);
  }
  await assert.rejects(a.vault.giaiMa({ ...rA, projectId: 2 }), /offline_vault_owner/);
  await assert.rejects(
    a.vault.giaiMa({ ...rA, vaultKeyId: "99999999-9999-4999-8999-999999999999" }),
    /offline_vault_locked/,
  );

  // B đăng nhập trên cùng trình duyệt: phiên vault mới, op của A không lộ/không gửi/không xoá.
  may.dangNhap(B);
  const b = moiTruong({ db, may });
  await b.moTracking();
  assert.equal(b.vault.trangThai, "active");
  await assert.rejects(b.vault.giaiMa(rA), /offline_vault_owner/);
  // Dù giả mạo owner thành B, khoá của A không có trong phiên B.
  await assert.rejects(
    b.vault.giaiMa({ ...rA, ownerUserId: B.id, owner: rA.owner.replace(`${A.id}|`, `${B.id}|`) }),
    /offline_vault_(locked|owner)/,
  );
  assert.equal(await b.q.getQueuedDiaryNote("2026-10-08"), undefined);
  b.datPhan((req) => ({ status: 200, receiptOperationId: req.headers["Idempotency-Key"] }));
  await b.q.flush();
  assert.equal(b.gui.length, 0, "B không gửi op của A");
  assert.equal(b.q.getSnapshot().total, 0);
  assert.deepEqual(a.ops(), [rA], "ciphertext của A giữ nguyên cho chính chủ phục hồi");
});

test("enqueue nguyên tử: request success rồi transaction abort (quota) → KHÔNG báo đã lưu, không ghi gì (A2-AC05)", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  m.datPhan(() => ({ networkError: true }));
  assert.equal(await m.q.enqueueTick(DIM[0], true), true);
  const truoc = structuredClone([...m.db.data.get(STORE_OPS)!.values()]);
  const metaTruoc = structuredClone([...m.db.data.get(STORE_META)!.values()]);
  m.db.hongKhiCommit = (stores, mode) =>
    mode === "readwrite" && stores.includes(STORE_OPS) ? new Error("QuotaExceededError") : null;
  // tick cùng ô (sẽ dedup op cũ) + tick ô khác: cả hai phải thất bại, op cũ KHÔNG bị xoá.
  assert.equal(await m.q.enqueueTick(DIM[0], false), false);
  assert.equal(await m.q.enqueueTickBatch([DIM[1], DIM[2]], true), false);
  const anh = await m.q.enqueuePhoto({ taskId: TASK, blob: new Blob(["ảnh"]) });
  assert.equal(anh.ok, false);
  assert.deepEqual([...m.db.data.get(STORE_OPS)!.values()], truoc);
  assert.deepEqual([...m.db.data.get(STORE_META)!.values()], metaTruoc);
});

test("dedup + enqueue cùng một transaction: thao tác sau thắng op CHƯA gửi; op đã gửi/không rõ ACK giữ nguyên payload", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  m.datPhan(() => ({ networkError: true }));
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
    await m.q.enqueueTick(DIM[0], false);
    assert.equal(m.ops().length, 1, "op chưa gửi bị thay");
  } finally {
    datOnline(true);
  }
  const opCu = m.ops()[0];
  await m.q.flush(); // mất mạng giữa chừng → tries = 1 (có thể server đã nhận)
  assert.equal(m.ops()[0].tries, 1);
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
  } finally {
    datOnline(true);
  }
  const ds = m.ops().sort((x, y) => x.sequence - y.sequence);
  assert.equal(ds.length, 2, "op có thể đã gửi KHÔNG bị xoá/sửa — op mới xếp sau");
  assert.equal(ds[0].operationId, opCu.operationId);
  assert.equal(ds[0].ciphertext, opCu.ciphertext);
  assert.ok(ds[1].sequence > ds[0].sequence);
});

test("OCC: hàng đợi đổi giữa lúc đọc và lúc ghi (tab khác) → ghi lại từ đầu, không xoá op vừa chuyển sang gửi", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
  } finally {
    datOnline(true);
  }
  const { rev, lastSeq } = await m.store.docChu(m.ops()[0].owner);
  const chu = m.vault.chu()!;
  // Tab khác giành lease và chuyển op sang `sending` (rev tăng).
  const l = await m.store.xinLease(chu, "tab-khac", Date.now());
  assert.ok(l);
  assert.ok(await m.store.batDauGui(chu, m.ops()[0].operationId, "tab-khac", l.token, Date.now()));
  // Bản ghi dựng theo snapshot cũ (định xoá op kia) bị từ chối.
  const kq = await m.store.themNguyenTu({
    expectRev: rev,
    record: {
      ...m.ops()[0],
      operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sequence: lastSeq + 1,
    },
    xoa: [m.ops()[0].operationId],
  });
  assert.equal(kq, "stale");
  // Đường enqueue thật tự làm lại: op đang gửi giữ nguyên, op mới thêm sau.
  datOnline(false);
  try {
    assert.equal(await m.q.enqueueTick(DIM[0], false), true);
  } finally {
    datOnline(true);
  }
  const ds = m.ops().sort((x, y) => x.sequence - y.sequence);
  assert.deepEqual(
    ds.map((r) => r.state),
    ["sending", "pending"],
  );
});

test("hạn mức ảnh 50MiB tính trên ciphertext đang tồn của MỌI chủ; vượt → lỗi rõ, không xoá dữ liệu người khác", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  m.db.data.get(STORE_META)!.set(JSON.stringify("queue"), {
    k: "queue",
    rev: 5,
    lastSeq: 9,
    photoBytes: 50 * 1024 * 1024 - 10,
  });
  datOnline(false);
  try {
    const r = await m.q.enqueuePhoto({ taskId: TASK, blob: new Blob([new Uint8Array(64)]) });
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /đã đầy/);
    assert.equal(m.ops().length, 0);
  } finally {
    datOnline(true);
  }
});

test("lease + fencing: 2 tab flush đồng thời → mỗi op gửi đúng 1 lần, cùng Idempotency-Key (A2-AC04)", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  may.dangNhap(A);
  const t1 = moiTruong({ db, may });
  await t1.moTracking();
  datOnline(false);
  try {
    for (const d of DIM) await t1.q.enqueueTick(d, true);
  } finally {
    datOnline(true);
  }
  const t2 = moiTruong({ db, may });
  await t2.moTracking();
  let mo!: () => void;
  const cong = new Promise<void>((r) => (mo = r));
  const cham: Phan = async (req) => {
    await cong;
    return { status: 200, receiptOperationId: req.headers["Idempotency-Key"] };
  };
  t1.datPhan(cham);
  t2.datPhan(cham);
  const p1 = t1.q.flush();
  // Tab 2 flush khi tab 1 ĐANG gửi (op đã `sending`, chờ mạng) — lease tab 1 còn hạn nên tab 2
  // không được giành lease/đưa op về pending/gửi lại.
  await denLuc(() => t1.gui.length >= 1);
  const p2 = t2.q.flush();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(t2.gui.length, 0, "tab 2 không gửi khi tab 1 giữ lease");
  assert.equal(await t2.store.xinLease(t2.q.vault.chu()!, "tab-thu-3", Date.now()), null);
  mo();
  await Promise.all([p1, p2]);
  // tab bỏ qua do không giành được lease → flush lại cho chắc phần còn lại
  await t1.q.flush();
  await t2.q.flush();
  const keys = [...t1.gui, ...t2.gui].map((r) => r.headers["Idempotency-Key"]);
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3, "không op nào gửi 2 lần khi lease còn hạn");
  assert.equal(t1.ops().length, 0);
});

test("fencing: lease hết hạn giữa chừng → tab mới gửi lại CÙNG key, kết quả muộn của tab cũ bị bỏ (A2-FR12)", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  may.dangNhap(A);
  const m = moiTruong({ db, may });
  await m.moTracking();
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
  } finally {
    datOnline(true);
  }
  let gio = Date.now();
  const now = () => gio;
  const gui: { tab: string; key: string }[] = [];
  let thaTab1!: () => void;
  const choTab1 = new Promise<void>((r) => (thaTab1 = r));
  const p1 = flushQueue({
    store: m.store,
    vault: m.vault,
    holder: "tab-1",
    now,
    send: async (req) => {
      gui.push({ tab: "tab-1", key: req.headers["Idempotency-Key"] });
      await choTab1;
      return { status: 200, receiptOperationId: req.headers["Idempotency-Key"] };
    },
  });
  await denLuc(() => gui.length === 1);
  gio += LEASE_TTL_MS + 1; // tab-1 treo quá TTL, không gia hạn
  const k2 = await flushQueue({
    store: m.store,
    vault: m.vault,
    holder: "tab-2",
    now,
    send: async (req) => {
      gui.push({ tab: "tab-2", key: req.headers["Idempotency-Key"] });
      return { status: 200, receiptOperationId: req.headers["Idempotency-Key"] };
    },
  });
  assert.equal(k2.daGui, 1);
  thaTab1();
  const k1 = await p1;
  assert.equal(k1.matLease, true, "token cũ → không áp kết quả");
  assert.equal(gui[0].key, gui[1].key, "gửi lại đúng operationId (server dedup bằng receipt)");
  assert.equal(m.ops().length, 0);
});

test("FIFO theo tài nguyên + trạng thái bền: conflict chặn ô đó, ô khác vẫn gửi; rejected/conflict không bị xoá (A2-AC06)", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  m.datPhan((req) =>
    req.url === `/api/dimensions/${DIM[0]}`
      ? { status: 409, code: "hold_point", error: "Hold-point chưa mở" }
      : req.url === `/api/dimensions/${DIM[2]}`
        ? { status: 403, error: "Không có quyền" }
        : { status: 200, receiptOperationId: req.headers["Idempotency-Key"] },
  );
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true); // → 409 conflict
    await m.q.enqueueTick(DIM[2], true); // → 403 rejected
  } finally {
    datOnline(true);
  }
  await m.q.flush();
  assert.deepEqual(
    m.gui.map((r) => r.url),
    [`/api/dimensions/${DIM[0]}`, `/api/dimensions/${DIM[2]}`],
  );
  datOnline(false);
  try {
    // Lô chứa ô đang conflict: không nuốt op conflict, xếp SAU và bị chặn; ô độc lập vẫn đi.
    await m.q.enqueueTickBatch([DIM[0], DIM[1]], false);
  } finally {
    datOnline(true);
  }
  m.q.dangKyLuoi([{ id: TASK, cells: { z: { id: 777 } } }]);
  datOnline(false);
  try {
    assert.equal(await m.q.enqueueTick(777, true), true);
  } finally {
    datOnline(true);
  }
  await m.q.flush();
  assert.deepEqual(m.gui.map((r) => r.url).slice(2), ["/api/dimensions/777"]);
  const ds = m.ops().sort((x, y) => x.sequence - y.sequence);
  assert.deepEqual(
    ds.map((r) => r.state),
    ["conflict", "rejected", "pending"],
  );
  assert.deepEqual(ds[0].lastResult && { s: ds[0].lastResult.status, c: ds[0].lastResult.code }, {
    s: 409,
    c: "hold_point",
  });
  // Vòng sau: không gửi lại conflict/rejected (không retry mù lỗi nghiệp vụ), lô vẫn bị chặn.
  await m.q.flush();
  assert.equal(m.gui.length, 3);
  const st = m.q.getSnapshot();
  assert.equal(st.conflict, 1);
  assert.equal(st.rejected, 1);
  assert.equal(st.total, 3);
  const tt = await m.q.danhSachThaoTac();
  assert.deepEqual(
    tt.map((x) => x.state),
    ["conflict", "rejected", "pending"],
  );
});

test("401 → paused_auth, dừng vòng, khoá vault; xác thực lại → pending và gửi tiếp", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
    await m.q.enqueueTick(DIM[1], true);
  } finally {
    datOnline(true);
  }
  m.datPhan(() => ({ status: 401 }));
  await m.q.flush();
  assert.equal(m.gui.length, 1, "dừng ngay sau 401");
  assert.equal(m.vault.trangThai, "locked");
  assert.deepEqual(
    m
      .ops()
      .map((r) => r.state)
      .sort(),
    ["paused_auth", "pending"],
  );
  m.datPhan((req) => ({ status: 200, receiptOperationId: req.headers["Idempotency-Key"] }));
  await m.q.flush(); // mở lại vault (online) → paused_auth → pending → gửi
  assert.equal(m.ops().length, 0);
  assert.equal(m.gui[0].headers["Idempotency-Key"], m.gui[1].headers["Idempotency-Key"]);
});

test("thử lại giữ NGUYÊN Idempotency-Key + If-Match lúc enqueue dù etag server đã đổi; 429 tôn trọng Retry-After", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  await m.q.chuanBiNhatKy("2026-10-08");
  const body = {
    date: "2026-10-08",
    weatherAm: null,
    weatherPm: null,
    workDone: "x",
    obstacles: null,
    safetyNote: null,
    manpower: [],
    photoIds: [],
  };
  let lan = 0;
  m.datPhan((req) => {
    lan++;
    if (lan === 1) return { networkError: true };
    if (lan === 2) return { status: 503 };
    if (lan === 3) return { status: 429, retryAfter: "0" };
    return { status: 200, receiptOperationId: req.headers["Idempotency-Key"] };
  });
  assert.deepEqual(await m.q.enqueueDiaryNote(body, '"55-1"'), { ok: true });
  await denLuc(() => m.gui.length >= 1);
  for (let i = 0; i < 6 && m.ops().length; i++) {
    // Bỏ qua backoff để thử lại ngay (đổi mốc trong store — không đổi payload/khoá).
    for (const [k, v] of m.db.data.get(STORE_OPS)!)
      m.db.data.get(STORE_OPS)!.set(k, { ...(v as QueueRecord), nextAttemptAt: 0 });
    await m.q.flush();
  }
  assert.equal(m.ops().length, 0);
  assert.ok(m.gui.length >= 4);
  assert.equal(new Set(m.gui.map((r) => r.headers["Idempotency-Key"])).size, 1);
  assert.ok(m.gui.every((r) => r.headers["If-Match"] === '"55-1"' && !r.headers["If-None-Match"]));
  assert.ok(m.gui.every((r) => typeof r.headers["X-XBoss-Context"] === "string"));
});

test("2xx không có receipt đúng op → giữ (conflict), không xoá âm thầm", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  m.datPhan(() => ({ status: 200 }));
  assert.equal(await m.q.enqueueTick(DIM[0], true), true);
  await denLuc(() => m.gui.length === 1);
  await denLuc(() => m.ops()[0]?.state === "conflict");
});

test("hết lease context (shared-safe 15 phút) hoặc đồng hồ lùi → vault khoá, không tạo thao tác mới", async () => {
  const may = taoMayChuGia();
  let tuong = 1_000_000;
  let donDieu = 0;
  const vault = new VaultSession(may.fetch, { tuong: () => tuong, donDieu: () => donDieu });
  const q = new OfflineQueueManager({
    store: new QueueDb(new MemoryTxDb()),
    vault,
    send: async () => ({ networkError: true }),
  });
  may.dangNhap(A);
  q.dangKyLuoi([{ id: TASK, cells: { a: { id: DIM[0] } } }]);
  await q.chuanBiTracking([{ id: TASK }]);
  datOnline(false);
  try {
    assert.equal(await q.enqueueTick(DIM[0], true), true);
    donDieu += 15 * 60_000;
    tuong += 15 * 60_000;
    assert.equal(await q.enqueueTick(DIM[0], false), false, "lease hết khi offline → khoá");
    assert.equal(vault.trangThai, "locked");
  } finally {
    datOnline(true);
  }
  await q.chuanBiTracking([{ id: TASK }]);
  assert.equal(vault.trangThai, "active");
  tuong -= 60_000; // đồng hồ tường bị chỉnh lùi
  datOnline(false);
  try {
    assert.equal(await q.enqueueTick(DIM[0], false), false);
    assert.equal(vault.trangThai, "locked");
  } finally {
    datOnline(true);
  }
});

test("409 context_changed → khoá vault, op giữ pending; lần sau xác minh context lại từ đầu", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  datOnline(false);
  try {
    assert.equal(await m.q.enqueueTick(DIM[0], true), true);
  } finally {
    datOnline(true);
  }
  m.datPhan(() => ({ status: 409, code: "context_changed" }));
  await m.q.flush();
  assert.equal(m.gui.length, 1);
  assert.equal(m.vault.trangThai, "locked", "không dùng tiếp context/DEK cũ tới hết lease");
  assert.deepEqual(
    m.ops().map((r) => r.state),
    ["pending"],
  );
  const contextTruoc = m.may.goi.filter((g) => g.endsWith("/api/offline/context")).length;
  m.datPhan((req) => ({ status: 200, receiptOperationId: req.headers["Idempotency-Key"] }));
  for (const [k, v] of m.db.data.get(STORE_OPS)!)
    m.db.data.get(STORE_OPS)!.set(k, { ...(v as QueueRecord), nextAttemptAt: 0 });
  await m.q.flush();
  assert.ok(
    m.may.goi.filter((g) => g.endsWith("/api/offline/context")).length > contextTruoc,
    "phải xin context mới",
  );
  assert.equal(m.ops().length, 0);
  assert.equal(m.gui[0].headers["Idempotency-Key"], m.gui[1].headers["Idempotency-Key"]);
});

test("hết lease khi đang mất mạng → đường đọc (giải mã) cũng khoá, không chỉ đường ghi", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  let tuong = 1_000_000;
  let donDieu = 0;
  const vault = new VaultSession(may.fetch, { tuong: () => tuong, donDieu: () => donDieu });
  const q = new OfflineQueueManager({
    store: new QueueDb(db),
    vault,
    send: async () => ({ networkError: true }),
  });
  may.dangNhap(A);
  q.dangKyLuoi([{ id: TASK, cells: { a: { id: DIM[0] } } }]);
  await q.chuanBiTracking([{ id: TASK }]);
  datOnline(false);
  try {
    assert.equal(await q.enqueueTick(DIM[0], true), true);
    const rec = [...db.data.get(STORE_OPS)!.values()][0] as QueueRecord;
    assert.ok((await vault.giaiMa(rec)).byteLength > 0);
    donDieu += 15 * 60_000;
    tuong += 15 * 60_000;
    await assert.rejects(vault.giaiMa(rec), { loai: "locked" });
    assert.equal(vault.trangThai, "locked");
    assert.deepEqual(await q.getQueuedPhotos(TASK), []);
  } finally {
    datOnline(true);
  }
});

test("khoá vault bị thu hồi (manifest có tài nguyên mất quyền) → op giữ nguyên, bị khoá, không gửi/không xoá", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  may.dangNhap(A);
  const m = moiTruong({ db, may });
  await m.moTracking();
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
  } finally {
    datOnline(true);
  }
  may.thuHoi(m.ops()[0].vaultKeyId);
  const m2 = moiTruong({ db, may }); // tải lại trang
  await m2.q.flush();
  assert.equal(m2.gui.length, 0);
  assert.equal(m2.ops().length, 1);
  assert.equal(m2.q.getSnapshot().locked, 1);
});

test("legacy v1 không chủ: giữ nguyên byte, chỉ báo có; không đọc/gửi/gán chủ/xoá (A2-AC07, D03)", async () => {
  const db = new MemoryTxDb([STORE_OPS, STORE_META, LEGACY_STORE]);
  const legacy = new Map<string, unknown>([
    [
      "41",
      {
        id: 41,
        kind: "diary_note",
        payload: { date: "2026-10-05", workDone: "nháp A" },
        queuedAt: 1,
        tries: 0,
      },
    ],
    ["42", { id: 42, kind: "tick", payload: { dimId: 7, installed: true }, queuedAt: 2, tries: 2 }],
  ]);
  db.data.set(LEGACY_STORE, legacy);
  const truoc = structuredClone([...legacy]);
  const m = moiTruong({ db });
  m.may.dangNhap(B);
  assert.equal(await m.store.coLegacy(), true);
  await m.moTracking();
  await m.q.flush();
  await m.q.clear();
  await m.q.discardDiaryDraft("2026-10-05", ["41", "42"]);
  assert.equal(await m.q.getQueuedDiaryNote("2026-10-05"), undefined);
  assert.equal(m.gui.length, 0);
  assert.deepEqual([...db.data.get(LEGACY_STORE)!], truoc);
  assert.equal(m.q.getSnapshot().total, 0);
});

test("đổi ngữ cảnh từ tab khác → khoá vault + dừng gửi, KHÔNG xoá dữ liệu", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
  } finally {
    datOnline(true);
  }
  (m.q as unknown as { tamDungNguCanh: boolean }).tamDungNguCanh = true;
  m.vault.khoa();
  await m.q.flush();
  assert.equal(m.gui.length, 0);
  assert.equal(m.ops().length, 1);
  assert.equal(await m.q.enqueueTick(DIM[1], true), false);
});

test("nhật ký: bản nháp mới nhất nạp lại form (kể cả conflict); lưu trực tiếp thành công mới bỏ nháp của đúng chủ", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  may.dangNhap(A);
  const m = moiTruong({ db, may });
  await m.moTracking();
  await m.q.chuanBiNhatKy("2026-10-08");
  const body = (w: string) => ({
    date: "2026-10-08",
    weatherAm: null,
    weatherPm: null,
    workDone: w,
    obstacles: null,
    safetyNote: null,
    manpower: [],
    photoIds: [],
  });
  m.datPhan(() => ({ status: 412, code: "version_mismatch" }));
  await m.q.enqueueDiaryNote(body("bản 1"), '"1-1"');
  await denLuc(() => m.ops()[0]?.state === "conflict");
  datOnline(false);
  try {
    await m.q.enqueueDiaryNote(body("bản 2"), '"1-1"');
  } finally {
    datOnline(true);
  }
  assert.equal(m.ops().length, 2, "bản conflict không bị bản mới thay");
  const nap = await m.q.getQueuedDiaryNote("2026-10-08");
  assert.equal(nap?.payload.workDone, "bản 2");
  assert.equal(nap?.operationIds.length, 2);
  // B (chủ khác) bỏ nháp cùng ngày — kể cả đưa đúng id của A — không đụng nháp của A.
  may.dangNhap(B);
  const b = moiTruong({ db, may });
  await b.moTracking();
  await b.q.discardDiaryDraft("2026-10-08", nap!.operationIds);
  assert.equal(m.ops().length, 2);
  await m.q.discardDiaryDraft("2026-10-08", nap!.operationIds);
  assert.equal(m.ops().length, 0);
});

test("nhật ký: lưu online chỉ bỏ ĐÚNG bản nháp form đã nạp — bản form chưa từng thấy được giữ", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  await m.q.chuanBiNhatKy("2026-10-08");
  const body = (w: string) => ({
    date: "2026-10-08",
    weatherAm: null,
    weatherPm: null,
    workDone: w,
    obstacles: null,
    safetyNote: null,
    manpower: [],
    photoIds: [],
  });
  m.datPhan(() => ({ status: 412, code: "version_mismatch" }));
  await m.q.enqueueDiaryNote(body("đã thấy"), '"1-1"');
  await denLuc(() => m.ops()[0]?.state === "conflict");
  const nap = await m.q.getQueuedDiaryNote("2026-10-08");
  // Sau lúc form nạp: một bản nháp khác của cùng ngày xuất hiện (vault mở muộn / tab khác).
  datOnline(false);
  try {
    await m.q.enqueueDiaryNote(body("chưa thấy"), '"1-1"');
  } finally {
    datOnline(true);
  }
  assert.equal(m.ops().length, 2);
  await m.q.discardDiaryDraft("2026-10-08", nap!.operationIds);
  assert.equal(m.ops().length, 1, "không xoá bản nháp người dùng chưa từng thấy");
  assert.equal((await m.q.getQueuedDiaryNote("2026-10-08"))?.payload.workDone, "chưa thấy");
  // Form không nạp nháp nào → không xoá gì.
  await m.q.discardDiaryDraft("2026-10-08", []);
  assert.equal(m.ops().length, 1);
});

test("vault khoá (401) nhưng op còn trên thiết bị → thống kê báo locked, không báo 0 chờ", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
  } finally {
    datOnline(true);
  }
  m.datPhan(() => ({ status: 401 }));
  await m.q.flush();
  assert.equal(m.vault.trangThai, "locked");
  const snap = m.q.getSnapshot();
  assert.equal(snap.total, 1);
  assert.equal(snap.locked, 1);
});

test("lease được gia hạn trong lúc chờ mạng lâu → tab khác không giành lease, op gửi đúng 1 lần", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  may.dangNhap(A);
  const m = moiTruong({ db, may });
  await m.moTracking();
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
  } finally {
    datOnline(true);
  }
  let gio = Date.now();
  const now = () => gio;
  let dangCho!: () => void;
  const daVaoSend = new Promise<void>((r) => (dangCho = r));
  let tha!: () => void;
  const cho = new Promise<void>((r) => (tha = r));
  const p1 = flushQueue({
    store: m.store,
    vault: m.vault,
    holder: "tab-1",
    now,
    nhipGiaHanMs: 2,
    send: async (req) => {
      dangCho();
      await cho;
      return { status: 200, receiptOperationId: req.headers["Idempotency-Key"] };
    },
  });
  await daVaoSend;
  let laiLease: unknown;
  try {
    // Upload chậm: đồng hồ trôi quá TTL ban đầu, nhưng nhịp gia hạn chạy trong lúc chờ.
    for (let i = 0; i < 4; i++) {
      gio += LEASE_TTL_MS / 2;
      await new Promise((r) => setTimeout(r, 15));
    }
    laiLease = await m.store.xinLease(m.vault.chu()!, "tab-2", now());
  } finally {
    tha(); // luôn thả send — tránh treo tiến trình test khi assert đỏ
  }
  const k1 = await p1;
  assert.equal(laiLease, null, "tab khác không được giành lease đang gia hạn");
  assert.equal(k1.matLease, false);
  assert.equal(k1.daGui, 1);
  assert.equal(m.ops().length, 0);
});

test("khoá ownership: op ghi kèm owner/org/dự án/thiết bị của phiên; index owner khớp", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  datOnline(false);
  try {
    await m.q.enqueueTick(DIM[0], true);
  } finally {
    datOnline(true);
  }
  const r = m.ops()[0];
  const chu = m.vault.chu()!;
  assert.equal(r.owner, khoaChu(chu));
  assert.deepEqual(
    { u: r.ownerUserId, o: r.orgId, p: r.projectId, d: r.deviceId },
    { u: A.id, o: A.orgId, p: 1, d: chu.deviceId },
  );
});
