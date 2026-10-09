// QUALITY-FINAL-1 S08 — màn phục hồi hàng đợi ngoại tuyến: API manager dùng bởi UI phục hồi.
// Chạy trên QueueDb THẬT (MemoryTxDb thay IndexedDB), VaultSession THẬT (WebCrypto thật), máy
// chủ giả cho /api/auth/me + /api/offline/*. Map AC: A2-AC01 (logout/B không thấy op của A),
// A2-AC06/AC10 (conflict/rejected chỉ bỏ theo quyết định từng op), A2-FR11 (giải quyết xung đột
// nhật ký tạo op MỚI với etag máy chủ mới, op cũ chỉ bỏ sau khi op mới đã lưu).
import { test } from "node:test";
import assert from "node:assert/strict";
import { OfflineQueueManager } from "@/app/components/offlineQueue";
import {
  LEGACY_STORE,
  MemoryTxDb,
  QueueDb,
  STORE_META,
  STORE_OPS,
} from "@/app/components/offlineQueue/store";
import { VaultSession } from "@/app/components/offlineQueue/vault";
import type {
  DiaryNotePayload,
  QueueRecord,
  SendOutcome,
  YeuCauGui,
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
const NGAY = "2026-10-08";

type Phan = (req: YeuCauGui) => SendOutcome;
type ThongDiepSw = { type: string; tag: string | null; expiresAt: number };

function moiTruong(opts: { db?: MemoryTxDb; may?: ReturnType<typeof taoMayChuGia> } = {}) {
  const db = opts.db ?? new MemoryTxDb();
  const may = opts.may ?? taoMayChuGia();
  const gui: YeuCauGui[] = [];
  const sw: ThongDiepSw[] = [];
  let phan: Phan = (req) => ({ status: 200, receiptOperationId: req.headers["Idempotency-Key"] });
  const store = new QueueDb(db);
  const vault = new VaultSession(may.fetch);
  const q = new OfflineQueueManager({
    store,
    vault,
    send: async (req) => {
      gui.push(req);
      return phan(req);
    },
    baoSw: (m) => sw.push(m),
  });
  return {
    db,
    may,
    store,
    vault,
    q,
    gui,
    sw,
    datPhan: (p: Phan) => {
      phan = p;
    },
    async moTracking() {
      q.dangKyLuoi([
        { id: TASK, cells: Object.fromEntries(DIM.map((d, i) => [`c${i}`, { id: d }])) },
      ]);
      await q.chuanBiTracking([{ id: TASK }]);
    },
    ops: () =>
      ([...db.data.get(STORE_OPS)!.values()] as QueueRecord[]).sort(
        (x, y) => x.sequence - y.sequence,
      ),
  };
}

const nhatKy = (workDone: string): DiaryNotePayload => ({
  date: NGAY,
  weatherAm: "Nắng",
  weatherPm: null,
  workDone,
  obstacles: null,
  safetyNote: null,
  manpower: [{ crew: "Tổ ống", headcount: 4 }],
  photoIds: [],
});

async function denLuc(dk: () => boolean, ms = 2000) {
  const het = Date.now() + ms;
  while (!dk()) {
    if (Date.now() > het) throw new Error("hết thời gian chờ");
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function ngoaiTuyen<T>(fn: () => Promise<T>): Promise<T> {
  datOnline(false);
  try {
    return await fn();
  } finally {
    datOnline(true);
  }
}

/** A có 3 op: tick ô 0 → 409 conflict, tick ô 2 → 403 rejected, tick ô 1 → mạng lỗi (pending). */
async function baTrangThai(m: ReturnType<typeof moiTruong>) {
  m.may.dangNhap(A);
  await m.moTracking();
  m.datPhan((req) =>
    req.url === `/api/dimensions/${DIM[0]}`
      ? { status: 409, code: "hold_point" }
      : req.url === `/api/dimensions/${DIM[2]}`
        ? { status: 403 }
        : { networkError: true },
  );
  await ngoaiTuyen(async () => {
    assert.equal(await m.q.enqueueTick(DIM[0], true), true);
    assert.equal(await m.q.enqueueTick(DIM[2], true), true);
    assert.equal(await m.q.enqueueTick(DIM[1], true), true);
  });
  await m.q.flush();
  const [conflict, rejected, pending] = m.ops();
  assert.deepEqual(
    [conflict.state, rejected.state, pending.state],
    ["conflict", "rejected", "pending"],
  );
  return { conflict, rejected, pending };
}

test("boThaoTac: chỉ bỏ ĐÚNG op conflict/rejected được chọn của chính chủ; op chờ, op người khác, legacy giữ nguyên", async () => {
  const db = new MemoryTxDb([STORE_OPS, STORE_META, LEGACY_STORE]);
  db.data.set(LEGACY_STORE, new Map([["1", { id: 1, kind: "tick", payload: { dimId: 9 } }]]));
  const legacyTruoc = structuredClone([...db.data.get(LEGACY_STORE)!]);
  const may = taoMayChuGia();
  const m = moiTruong({ db, may });
  const { conflict, rejected, pending } = await baTrangThai(m);

  assert.equal(await m.q.boThaoTac(pending.operationId), false, "op đang chờ gửi không được bỏ");
  assert.equal(await m.q.boThaoTac("khong-ton-tai"), false);

  // B cùng trình duyệt đưa đúng id op của A → không xoá được (khác chủ).
  may.dangNhap(B);
  const b = moiTruong({ db, may });
  await b.moTracking();
  assert.equal(await b.q.boThaoTac(rejected.operationId), false);
  assert.equal(await b.q.boThaoTac(conflict.operationId), false);
  assert.equal(m.ops().length, 3, "op của A còn nguyên");

  may.dangNhap(A);
  assert.equal(await m.q.boThaoTac(conflict.operationId), true);
  assert.deepEqual(
    m.ops().map((o) => o.operationId),
    [rejected.operationId, pending.operationId],
    "chỉ đúng op conflict được chọn bị bỏ",
  );
  assert.equal(await m.q.boThaoTac(rejected.operationId), true);
  assert.deepEqual(
    m.ops().map((o) => o.operationId),
    [pending.operationId],
  );
  assert.deepEqual([...db.data.get(LEGACY_STORE)!], legacyTruoc, "legacy không bị đụng");
  assert.equal(await m.q.demLegacy(), 1);
  const st = m.q.getSnapshot();
  assert.equal(st.conflict + st.rejected, 0);
  assert.equal(st.total, 1);
});

test("danhSachThaoTac: trạng thái + lý do máy chủ + mô tả tối thiểu, không có payload", async () => {
  const m = moiTruong();
  const { conflict, rejected } = await baTrangThai(m);
  const ds = await m.q.danhSachThaoTac();
  assert.deepEqual(
    ds.map((o) => [o.state, o.lastResult?.status ?? null, o.moDuoc, o.soO]),
    [
      ["conflict", 409, true, 1],
      ["rejected", 403, true, 1],
      ["pending", null, true, 1],
    ],
  );
  assert.equal(ds[0].operationId, conflict.operationId);
  assert.equal(ds[1].operationId, rejected.operationId);
  const s = JSON.stringify(ds);
  assert.ok(!s.includes(String(DIM[0])) && !s.includes("installed"), "không lộ payload");
});

test("xung đột nhật ký → giữ bản thiết bị: op MỚI (operationId mới) với If-Match = etag máy chủ mới; op cũ chỉ bỏ SAU khi op mới đã lưu", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  await m.q.chuanBiNhatKy(NGAY);
  m.datPhan(() => ({ status: 412, code: "version_mismatch" }));
  await m.q.enqueueDiaryNote(nhatKy("bản thiết bị"), '"1-1"');
  await denLuc(() => m.ops()[0]?.state === "conflict");
  const [cu] = m.ops();
  assert.equal(cu.state, "conflict");
  const xem = await m.q.xemNhatKyXungDot(cu.operationId);
  assert.equal(xem?.payload.workDone, "bản thiết bị");
  assert.equal(xem?.coBanMoiHon, false);

  // Ghi nhận thời điểm bỏ op cũ: lúc đó op mới PHẢI đã commit trong store.
  const lucXoa: string[][] = [];
  const goc = m.store.xoaTheoYeuCau.bind(m.store);
  m.store.xoaTheoYeuCau = async (owner, ids, dieuKien) => {
    lucXoa.push(m.ops().map((o) => o.operationId));
    return goc(owner, ids, dieuKien);
  };
  m.datPhan((req) => ({ status: 200, receiptOperationId: req.headers["Idempotency-Key"] }));
  const kq = await ngoaiTuyen(() => m.q.giuBanNhatKyThietBi(cu.operationId, '"1-2"'));
  assert.deepEqual(kq, { ok: true });
  const [moi] = m.ops();
  assert.equal(m.ops().length, 1, "op xung đột cũ đã được bỏ");
  assert.notEqual(moi.operationId, cu.operationId, "operationId MỚI");
  assert.equal(moi.state, "pending");
  assert.equal(lucXoa.length, 1);
  assert.deepEqual(lucXoa[0].sort(), [cu.operationId, moi.operationId].sort());

  await m.q.flush();
  const req = m.gui.at(-1)!;
  assert.equal(req.method, "PUT");
  assert.equal(req.url, `/api/diaries/${NGAY}`);
  assert.equal(req.headers["If-Match"], '"1-2"', "precondition = etag máy chủ vừa xem");
  assert.equal(req.headers["Idempotency-Key"], moi.operationId);
  assert.equal(JSON.parse(String(req.body)).workDone, "bản thiết bị", "không tự gộp trường");
  assert.equal(m.ops().length, 0);
});

test("xung đột nhật ký: lưu op mới THẤT BẠI (abort/quota) → op xung đột cũ giữ nguyên", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  await m.q.chuanBiNhatKy(NGAY);
  m.datPhan(() => ({ status: 412, code: "version_mismatch" }));
  await m.q.enqueueDiaryNote(nhatKy("bản thiết bị"), '"1-1"');
  await denLuc(() => m.ops()[0]?.state === "conflict");
  const [cu] = m.ops();
  m.db.hongKhiCommit = (stores, mode) =>
    mode === "readwrite" && stores.includes(STORE_OPS) ? new Error("QuotaExceededError") : null;
  assert.equal(cu.state, "conflict");
  const kq = await ngoaiTuyen(() => m.q.giuBanNhatKyThietBi(cu.operationId, '"1-2"'));
  m.db.hongKhiCommit = null;
  assert.equal(kq.ok, false);
  assert.deepEqual(m.ops(), [cu], "không mất op cũ khi op mới chưa lưu được");
});

test("xung đột nhật ký: có bản nháp MỚI HƠN cùng ngày → không cho giữ bản cũ; dùng bản máy chủ = bỏ đúng op đó", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  await m.q.chuanBiNhatKy(NGAY);
  m.datPhan(() => ({ status: 412, code: "version_mismatch" }));
  await m.q.enqueueDiaryNote(nhatKy("bản 1"), '"1-1"');
  await denLuc(() => m.ops()[0]?.state === "conflict");
  await ngoaiTuyen(() => m.q.enqueueDiaryNote(nhatKy("bản 2"), '"1-1"'));
  const [cu, moiHon] = m.ops();
  assert.equal(cu.state, "conflict");
  assert.equal((await m.q.xemNhatKyXungDot(cu.operationId))?.coBanMoiHon, true);
  const kq = await m.q.giuBanNhatKyThietBi(cu.operationId, '"1-2"');
  assert.equal(kq.ok, false);
  assert.deepEqual(
    m.ops().map((o) => o.operationId),
    [cu.operationId, moiHon.operationId],
  );
  // "Dùng bản máy chủ" cho op xung đột = boThaoTac đúng op đó; bản mới hơn còn nguyên.
  assert.equal(await m.q.boThaoTac(cu.operationId), true);
  assert.deepEqual(
    m.ops().map((o) => o.operationId),
    [moiHon.operationId],
  );
  // op không phải conflict/diary → không có gì để "xem & giải quyết".
  assert.equal(await m.q.xemNhatKyXungDot(moiHon.operationId), null);
});

test("đăng xuất (A2-AC01): khoá vault + xoá cache giải mã, KHÔNG xoá ciphertext; B cùng trình duyệt không thấy op/nháp của A", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  const a = moiTruong({ db, may });
  may.dangNhap(A);
  await a.moTracking();
  await a.q.chuanBiNhatKy(NGAY);
  a.datPhan(() => ({ networkError: true }));
  await ngoaiTuyen(async () => {
    assert.equal(await a.q.enqueueTick(DIM[0], true), true);
    assert.deepEqual(await a.q.enqueueDiaryNote(nhatKy("nháp của A"), null), { ok: true });
  });
  assert.equal(a.q.getSnapshot().total, 2);
  const truoc = structuredClone(a.ops());
  const cache = (a.q as unknown as { cache: Map<string, unknown> }).cache;
  assert.ok(cache.size > 0, "đã có bản giải mã trong bộ nhớ trước khi đăng xuất");

  a.q.khoaPhien(true); // trang tài khoản gọi khi đăng xuất thành công
  await new Promise((r) => setImmediate(r));
  assert.equal(a.vault.trangThai, "locked");
  assert.equal(cache.size, 0, "không còn bản rõ đã giải mã trong bộ nhớ");
  assert.equal(a.q.getSnapshot().total, 0, "badge của tab sau đăng xuất không đếm op của A");
  assert.deepEqual(await a.q.danhSachThaoTac(), []);
  assert.equal(await a.q.getQueuedDiaryNote(NGAY), undefined);
  assert.equal(await a.q.enqueueTick(DIM[1], true), false, "không ghi thêm sau đăng xuất");
  assert.deepEqual(a.ops(), truoc, "ciphertext giữ nguyên cho chính chủ phục hồi (D03)");

  may.dangNhap(B);
  const b = moiTruong({ db, may });
  await b.moTracking();
  await b.q.chuanBiNhatKy(NGAY);
  assert.equal(b.vault.trangThai, "active");
  assert.equal(b.q.getSnapshot().total, 0);
  assert.deepEqual(await b.q.danhSachThaoTac(), []);
  assert.equal(await b.q.getQueuedDiaryNote(NGAY), undefined);
  await b.q.flush();
  assert.equal(b.gui.length, 0, "B không gửi op của A");

  // A đăng nhập lại (phiên mới) → phục hồi được đúng 2 op của mình.
  may.dangNhap(A);
  const a2 = moiTruong({ db, may });
  await a2.moTracking();
  await a2.q.chuanBiNhatKy(NGAY);
  assert.equal((await a2.q.danhSachThaoTac()).length, 2);
  assert.equal((await a2.q.getQueuedDiaryNote(NGAY))?.payload.workDone, "nháp của A");
});

test("đổi dự án (switch) vẫn đếm op bị khoá của chính chủ; đăng xuất/đổi tài khoản thì không", async () => {
  const may = taoMayChuGia();
  const m = moiTruong({ may });
  may.dangNhap(A);
  await m.moTracking();
  m.datPhan(() => ({ networkError: true }));
  await ngoaiTuyen(() => m.q.enqueueTick(DIM[0], true));
  m.q.khoaPhien(false);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(m.q.getSnapshot().locked, 1, "cùng người: không báo nhầm 0 chờ");
  m.q.khoaPhien(true);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(m.q.getSnapshot().total, 0);
});

test("SW: vault ACTIVE → báo nhãn phiên + hạn lease; khoá/đăng xuất → bỏ ngữ cảnh (không PII)", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  const dau = m.sw.find((x) => x.tag);
  assert.ok(dau, "đã báo ngữ cảnh cho SW");
  assert.match(dau!.tag!, /^[0-9a-f-]{36}$/);
  assert.ok(dau!.expiresAt > Date.now() && dau!.expiresAt <= Date.now() + 15 * 60_000 + 1000);
  assert.deepEqual(Object.keys(dau!).sort(), ["expiresAt", "tag", "type"]);
  m.q.khoaPhien(true);
  assert.deepEqual(m.sw.at(-1), { type: "OFFLINE_CONTEXT", tag: null, expiresAt: 0 });
});

test("gửi lại ngay: bỏ chờ backoff lỗi mạng nhưng GIỮ Retry-After của 429", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  m.datPhan((req) =>
    req.url === `/api/dimensions/${DIM[0]}`
      ? { networkError: true }
      : { status: 429, retryAfter: "3600" },
  );
  await ngoaiTuyen(async () => {
    await m.q.enqueueTick(DIM[0], true);
    await m.q.enqueueTick(DIM[1], true);
  });
  await m.q.flush();
  assert.equal(m.gui.length, 2);
  assert.ok(m.ops().every((o) => o.state === "pending" && o.nextAttemptAt > Date.now()));
  await m.q.flush();
  assert.equal(m.gui.length, 2, "flush thường tôn trọng backoff");
  m.datPhan((req) => ({ status: 200, receiptOperationId: req.headers["Idempotency-Key"] }));
  await m.q.guiLaiNgay();
  assert.deepEqual(
    m.gui.slice(2).map((r) => r.url),
    [`/api/dimensions/${DIM[0]}`],
    "chỉ op lỗi mạng gửi lại; op 429 chờ Retry-After",
  );
  assert.equal(m.ops().length, 1);
  assert.equal(m.ops()[0].lastResult?.status, 429);
});

// ── Sau audit 3 trụ (S08) ──────────────────────────────────────────────────────────────────

/** A có 1 nhật ký `conflict` (máy chủ trả 412) — điểm xuất phát của các ca giải quyết xung đột. */
async function nhatKyXungDot(m: ReturnType<typeof moiTruong>, noiDung = "bản cũ") {
  m.may.dangNhap(A);
  await m.moTracking();
  await m.q.chuanBiNhatKy(NGAY);
  m.datPhan(() => ({ status: 412, code: "version_mismatch" }));
  await m.q.enqueueDiaryNote(nhatKy(noiDung), '"1-1"');
  await denLuc(() => m.ops()[0]?.state === "conflict");
  return m.ops()[0];
}

const revHangDoi = (db: MemoryTxDb) =>
  (db.data.get(STORE_META)!.get(JSON.stringify("queue")) as { rev: number } | undefined)?.rev ?? 0;

test("H1: 'giữ bản thiết bị' KHÔNG xoá bản nháp MỚI HƠN cùng ngày mà tab khác xếp xen giữa (kiểm trong vòng OCC)", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  const a = moiTruong({ db, may });
  const cu = await nhatKyXungDot(a);
  // Tab B của CÙNG chủ A (cùng trình duyệt/thiết bị) đã mở kho nhật ký.
  const b = moiTruong({ db, may });
  await b.moTracking();
  await b.q.chuanBiNhatKy(NGAY);

  // Tab B xếp bản mới ngay SAU lần đọc thứ 2 của tab A (sau phép kiểm "có bản mới hơn" ban đầu,
  // trước khi op mới được ghi) — đúng cửa sổ TOCTOU.
  let lan = 0;
  const goc = a.store.docChu.bind(a.store);
  a.store.docChu = async (owner) => {
    const kq = await goc(owner);
    if (++lan === 2)
      assert.deepEqual(await b.q.enqueueDiaryNote(nhatKy("BẢN MỚI"), '"1-2"'), { ok: true });
    return kq;
  };
  let kq: Awaited<ReturnType<typeof a.q.giuBanNhatKyThietBi>>;
  try {
    kq = await ngoaiTuyen(() => a.q.giuBanNhatKyThietBi(cu.operationId, '"1-2"'));
  } finally {
    a.store.docChu = goc; // luôn gỡ hook (kể cả khi code bị phá ném lỗi) — không treo ca sau
  }

  assert.ok(lan >= 2, "hook đã chèn bản mới");
  assert.equal(kq.ok, false, "có bản mới hơn → không cho giữ bản cũ");
  assert.match(kq.ok ? "" : kq.error, /mới hơn/);
  const ops = a.ops();
  assert.equal(ops.length, 2, "không thêm op nào, không xoá op nào");
  assert.equal(ops[0].operationId, cu.operationId, "op xung đột cũ còn nguyên");
  assert.equal(ops[0].state, "conflict");
  assert.equal((await b.q.getQueuedDiaryNote(NGAY))?.payload.workDone, "BẢN MỚI");
});

test("boThaoTac: op conflict/rejected của CHÍNH chủ ở dự án KHÁC → false, không xoá, không tăng rev", async () => {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  const m = moiTruong({ db, may });
  const { conflict, rejected, pending } = await baTrangThai(m);
  const rev = revHangDoi(db);
  assert.equal(await m.q.boThaoTac(pending.operationId), false);
  assert.equal(revHangDoi(db), rev, "không xoá gì thì không tăng rev");

  may.datDuAn(2);
  const m2 = moiTruong({ db, may });
  await m2.moTracking();
  assert.equal(m2.vault.chu()?.projectId, 2);
  const rev2 = revHangDoi(db);
  assert.equal(await m2.q.boThaoTac(conflict.operationId), false);
  assert.equal(await m2.q.boThaoTac(rejected.operationId), false);
  assert.equal(m.ops().length, 3, "op của dự án 1 còn nguyên");
  assert.equal(revHangDoi(db), rev2);
});

test("refreshStats: đăng xuất xen giữa lúc đang đọc hàng đợi → không hiện lại số op của chủ cũ", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  m.datPhan(() => ({ networkError: true }));
  await ngoaiTuyen(async () => {
    assert.equal(await m.q.enqueueTick(DIM[0], true), true);
    assert.equal(await m.q.enqueueTick(DIM[1], true), true);
  });
  assert.equal(m.q.getSnapshot().total, 2);
  const goc = m.store.docChu.bind(m.store);
  m.store.docChu = async (owner) => {
    const kq = await goc(owner);
    m.q.khoaPhien(true); // trang tài khoản đăng xuất đúng lúc lần đọc này đang chạy
    return kq;
  };
  try {
    await (m.q as unknown as { refreshStats(): Promise<void> }).refreshStats();
  } finally {
    m.store.docChu = goc;
  }
  await new Promise((r) => setImmediate(r));
  assert.equal(m.q.getSnapshot().total, 0, "badge không đếm lại op của chủ cũ");
});

test("lỗi đọc IndexedDB KHÔNG bị coi là 0: snapshot bật docLoi, danh sách/legacy báo lỗi", async () => {
  const db = new MemoryTxDb([STORE_OPS, STORE_META, LEGACY_STORE]);
  const m = moiTruong({ db });
  m.may.dangNhap(A);
  await m.moTracking();
  m.datPhan(() => ({ networkError: true }));
  await ngoaiTuyen(() => m.q.enqueueTick(DIM[0], true));
  assert.equal(m.q.getSnapshot().total, 1);
  assert.equal(m.q.getSnapshot().docLoi, false);

  db.hongKhiCommit = () => new Error("UnknownError: IndexedDB hỏng");
  await m.q.lamMoi();
  assert.equal(m.q.getSnapshot().docLoi, true);
  assert.equal(m.q.getSnapshot().total, 1, "không hạ về 0 khi không đọc được");
  await assert.rejects(m.q.danhSachThaoTac());
  await assert.rejects(m.q.demLegacy());
  // Vault khoá (đổi dự án, cùng người) mà vẫn không đọc được → vẫn là lỗi, không phải "0 chờ".
  m.q.khoaPhien(false);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(m.q.getSnapshot().docLoi, true);
  assert.notEqual(m.q.getSnapshot().total, 0);

  db.hongKhiCommit = null;
  await m.q.lamMoi();
  assert.equal(m.q.getSnapshot().docLoi, false);
  assert.equal(m.q.getSnapshot().locked, 1);
});

test("gửi lại ngay: báo thất bại khi không gửi được (mất mạng / lỗi thiết bị), không luôn 'đã thử'", async () => {
  const m = moiTruong();
  m.may.dangNhap(A);
  await m.moTracking();
  m.datPhan(() => ({ networkError: true }));
  await ngoaiTuyen(() => m.q.enqueueTick(DIM[0], true));
  assert.equal(await ngoaiTuyen(() => m.q.guiLaiNgay()), false);
  m.db.hongKhiCommit = (_s, mode) =>
    mode === "readwrite" ? new Error("QuotaExceededError") : null;
  await assert.rejects(m.q.guiLaiNgay());
  m.db.hongKhiCommit = null;
  assert.equal(await m.q.guiLaiNgay(), true);
});

test("giữ bản thiết bị: op mới đã lưu nhưng bỏ op cũ lỗi → ok kèm cảnh báo riêng, không im lặng", async () => {
  const m = moiTruong();
  const cu = await nhatKyXungDot(m);
  m.store.xoaTheoYeuCau = async () => {
    throw new Error("AbortError");
  };
  const kq = await ngoaiTuyen(() => m.q.giuBanNhatKyThietBi(cu.operationId, '"1-2"'));
  assert.equal(kq.ok, true);
  assert.match((kq.ok && kq.canhBao) || "", /chưa bỏ được bản xung đột cũ/);
  assert.equal(m.ops().length, 2, "op cũ (conflict) vẫn chặn trước op mới — không mất gì");
});
