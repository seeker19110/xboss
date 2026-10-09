// Logic THUẦN của hàng đợi offline v2 (QUALITY-FINAL-1 S07 — A2-FR05..FR12, DATA-CONTRACTS §3–§5,
// DATA-MIGRATIONS §2/§5, APPROVAL D03/D04). KHÔNG phụ thuộc IndexedDB/DOM để unit-test được:
// lớp lưu trữ (store.ts) hiện thực `QueueStore`, lớp khoá vault (vault.ts) hiện thực `VaultMoKhoa`,
// lớp React (index.ts) chỉ nối dây.
//
// Bất biến chính:
// - Payload nghiệp vụ (tài nguyên/ngày/chú thích/ảnh/baseVersion) CHỈ nằm trong ciphertext
//   AES-256-GCM; bản ghi IDB chỉ mang metadata định tuyến tối thiểu (owner/org/dự án/thiết bị,
//   loại, sequence, trạng thái). Không lưu bản rõ để tiện dedup.
// - Mỗi op có operationId (= Idempotency-Key) cố định từ lúc enqueue; payload dưới operationId
//   không bao giờ bị sửa. Dedup chỉ xoá op CHƯA từng được gửi (pending, tries = 0).
// - Thứ tự FIFO theo tài nguyên: op đang conflict/paused_auth/đang gửi/chờ retry chặn op sau CÙNG
//   tài nguyên, không chặn tài nguyên độc lập.
// - Kết quả server → trạng thái bền vững (A2-FR10): 2xx đúng operationId mới xoá; 401 paused_auth;
//   409/412/428 conflict; 403/404/422 (và 4xx khác) rejected; 429 theo Retry-After; mạng/408/5xx
//   backoff luỹ thừa + jitter, trần 5 phút. Không còn nhánh "4xx → xoá".
import type { OfflineOpKind } from "@/lib/nen/offline-crypto";

export type QueueKind = OfflineOpKind;

// ── Payload nghiệp vụ (bản rõ — chỉ tồn tại trong bộ nhớ khi vault đang mở) ─────────────────

export type TickPayload = { dimId: number; installed: boolean };
// Tick theo lô (M121): cả vùng chọn / cả hàng đi trong MỘT op → `PATCH /api/dimensions/batch`.
export type TickBatchPayload = { dimIds: number[]; installed: boolean };
export type PhotoPayload = {
  taskId: number;
  caption: string;
  blob: Blob;
  size: number;
  mime: string;
};
// Nhật ký ngày: PUT /api/diaries/:date là FULL-REPLACE — payload là TOÀN BỘ body PUT + `date`.
export type DiaryManpowerInput = { crew: string; headcount: number; note?: string | null };
export type DiaryNotePayload = {
  date: string;
  weatherAm: string | null;
  weatherPm: string | null;
  workDone: string | null;
  obstacles: string | null;
  safetyNote: string | null;
  manpower: DiaryManpowerInput[];
  photoIds: number[];
};

/**
 * Thân op (đi vào ciphertext). `baseVersion` của nhật ký = etag server lúc enqueue → gửi
 * `If-Match`; null = chưa biết bản server → `If-None-Match: *` (server 412 nếu đã có, không đè).
 */
export type OpBody =
  | { kind: "tick"; payload: TickPayload }
  | { kind: "tick_batch"; payload: TickBatchPayload }
  | { kind: "photo"; payload: PhotoPayload }
  | { kind: "diary_note"; payload: DiaryNotePayload; baseVersion: string | null };

// ── Bản ghi bền trong IndexedDB (envelope schemaVersion 2 — A2-FR05) ─────────────────────────

export type QueueState = "pending" | "sending" | "paused_auth" | "conflict" | "rejected";

/** Kết quả server gần nhất (chỉ mã máy đọc — thông điệp có thể nêu tài nguyên nên không lưu). */
export type KetQuaGanNhat = { status: number; code?: string; at: number };

export type QueueRecord = {
  schemaVersion: 2;
  operationId: string;
  vaultKeyId: string;
  ownerUserId: number;
  orgId: number;
  projectId: number;
  deviceId: string;
  sequence: number;
  queuedAt: number;
  tries: number;
  nextAttemptAt: number;
  state: QueueState;
  iv: string;
  ciphertext: string;
  // Metadata định tuyến tối thiểu ngoài kiểu đích của A2 (giải thích ở AUDIT-S07):
  /** `${ownerUserId}|${orgId}|${deviceId}` — khoá index, không mang tài nguyên. */
  owner: string;
  /** Loại op — bắt buộc để dựng AAD khi giải mã (AAD gắn kind). */
  kind: QueueKind;
  /** Số byte ciphertext thật (hạn mức tính trên ciphertext — DATA-MIGRATIONS §5). */
  bytes: number;
  /** Fencing token của lease lúc chuyển sang `sending`. */
  sendingToken?: number;
  lastResult?: KetQuaGanNhat;
};

export type ChuSoHuu = {
  ownerUserId: number;
  orgId: number;
  projectId: number;
  deviceId: string;
};

export const khoaChu = (c: Pick<ChuSoHuu, "ownerUserId" | "orgId" | "deviceId">): string =>
  `${c.ownerUserId}|${c.orgId}|${c.deviceId}`;
/** Khoá lease: một người flush cho mỗi (owner, org, dự án, thiết bị). */
export const khoaPhamVi = (c: ChuSoHuu): string => `${khoaChu(c)}|${c.projectId}`;

export function cungChu(r: QueueRecord, c: ChuSoHuu): boolean {
  return (
    r.ownerUserId === c.ownerUserId &&
    r.orgId === c.orgId &&
    r.projectId === c.projectId &&
    r.deviceId === c.deviceId
  );
}

// ── Hằng số ────────────────────────────────────────────────────────────────────────────────

/** Hạn mức ảnh chờ gửi (ciphertext, toàn vault trên thiết bị — không xoá dữ liệu người khác). */
export const PHOTO_QUOTA_BYTES = 50 * 1024 * 1024;
/** Lease flush liên tab (A2-FR12, D04): 30 giây, gia hạn mỗi 10 giây. */
export const LEASE_TTL_MS = 30_000;
export const LEASE_RENEW_MS = 10_000;
/** Poll nền khi app đang mở (không dựa Background Sync/Web Locks). */
export const FLUSH_INTERVAL_MS = 30_000;
const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

// ── Mã hoá thân op thành byte (trước khi mã hoá AES-GCM) ────────────────────────────────────
// Định dạng: [u32 BE độ dài header][header JSON UTF-8][byte ảnh nếu là photo]. Header có `v`
// để đổi định dạng sau này không phải đoán.

const BODY_FORMAT = 1;

export async function dongGoiThanOp(body: OpBody): Promise<Uint8Array<ArrayBuffer>> {
  let header: unknown;
  let nhiPhan = new Uint8Array(0);
  if (body.kind === "photo") {
    const { blob, ...meta } = body.payload;
    nhiPhan = new Uint8Array(await blob.arrayBuffer());
    header = { v: BODY_FORMAT, kind: body.kind, payload: { ...meta, size: nhiPhan.length } };
  } else if (body.kind === "diary_note") {
    header = {
      v: BODY_FORMAT,
      kind: body.kind,
      payload: body.payload,
      baseVersion: body.baseVersion,
    };
  } else {
    header = { v: BODY_FORMAT, kind: body.kind, payload: body.payload };
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(4 + json.length + nhiPhan.length);
  new DataView(out.buffer).setUint32(0, json.length);
  out.set(json, 4);
  out.set(nhiPhan, 4 + json.length);
  return out;
}

const soNguyenDuong = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const chuoiHoacNull = (v: unknown) => v === null || typeof v === "string";

/** Giải gói + kiểm hình dạng chặt (dữ liệu sau giải mã vẫn không tin mù). Sai → throw. */
export function moGoiThanOp(kind: QueueKind, bytes: Uint8Array): OpBody {
  if (bytes.length < 4) throw new Error("Thân op hỏng");
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (4 + len > bytes.length) throw new Error("Thân op hỏng");
  const h = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + len))) as {
    v?: unknown;
    kind?: unknown;
    payload?: Record<string, unknown>;
    baseVersion?: unknown;
  };
  if (h.v !== BODY_FORMAT || h.kind !== kind || !h.payload || typeof h.payload !== "object")
    throw new Error("Thân op hỏng");
  const p = h.payload;
  switch (kind) {
    case "tick":
      if (!soNguyenDuong(p.dimId) || typeof p.installed !== "boolean") break;
      return { kind, payload: { dimId: p.dimId, installed: p.installed } };
    case "tick_batch": {
      const ids = p.dimIds;
      if (!Array.isArray(ids) || !ids.length || !ids.every(soNguyenDuong)) break;
      if (typeof p.installed !== "boolean") break;
      return { kind, payload: { dimIds: ids as number[], installed: p.installed } };
    }
    case "photo": {
      if (!soNguyenDuong(p.taskId) || typeof p.caption !== "string" || typeof p.mime !== "string")
        break;
      const anh = bytes.slice(4 + len);
      if (p.size !== anh.length) break;
      return {
        kind,
        payload: {
          taskId: p.taskId,
          caption: p.caption,
          mime: p.mime,
          size: anh.length,
          blob: new Blob([anh], { type: p.mime }),
        },
      };
    }
    case "diary_note": {
      if (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) break;
      if (!chuoiHoacNull(h.baseVersion)) break;
      if (!Array.isArray(p.manpower) || !Array.isArray(p.photoIds)) break;
      return {
        kind,
        payload: p as unknown as DiaryNotePayload,
        baseVersion: (h.baseVersion as string | null) ?? null,
      };
    }
  }
  throw new Error("Thân op hỏng");
}

// ── Tài nguyên, dedup, FIFO ─────────────────────────────────────────────────────────────────

/**
 * Tài nguyên một op chạm tới — dùng cho dedup và FIFO. Ảnh là thao tác THÊM độc lập (mỗi op một
 * tài nguyên riêng theo operationId, không cần giải mã để biết).
 */
export function taiNguyenCuaOp(operationId: string, body: OpBody): string[] {
  switch (body.kind) {
    case "tick":
      return [`dim:${body.payload.dimId}`];
    case "tick_batch":
      return body.payload.dimIds.map((id) => `dim:${id}`);
    case "photo":
      return [`photo:${operationId}`];
    case "diary_note":
      return [`diary:${body.payload.date}`];
  }
}

/** Op còn có thể bị thay bởi thao tác mới hơn: CHƯA từng rời khỏi máy (pending, tries = 0). */
export function chuaTungGui(r: Pick<QueueRecord, "state" | "tries">): boolean {
  return r.state === "pending" && r.tries === 0;
}

export type OpDaGiai = { rec: QueueRecord; body: OpBody };

/**
 * Op nào cần xoá trước khi thêm `moi` (cùng owner/org/dự án/thiết bị — caller đã lọc). "Thao tác
 * sau thắng" nhưng CHỈ trên op chưa từng gửi; op đã gửi/không rõ ACK/conflict được giữ, op mới
 * xếp sau và bị FIFO chặn sau nó.
 * - tick ô d: xoá tick ô d, lô CHỈ gồm đúng ô d.
 * - lô S: xoá mọi tick có ô ∈ S, lô trùng HOÀN TOÀN S. Lô trùng một phần được GIỮ (xoá đi sẽ mất
 *   các ô ngoài phần giao) — FIFO bảo đảm lô mới áp sau.
 * - nhật ký ngày D: xoá bản nháp chưa gửi cùng ngày (PUT full-replace, bản mới chứa trọn trạng thái).
 * - ảnh: không dedup.
 */
export function chonOpThay(moi: OpBody, hienCo: OpDaGiai[]): string[] {
  const ung = hienCo.filter((o) => chuaTungGui(o.rec));
  if (moi.kind === "tick") {
    const d = moi.payload.dimId;
    return ung
      .filter(
        ({ body: b }) =>
          (b.kind === "tick" && b.payload.dimId === d) ||
          (b.kind === "tick_batch" && b.payload.dimIds.length === 1 && b.payload.dimIds[0] === d),
      )
      .map((o) => o.rec.operationId);
  }
  if (moi.kind === "tick_batch") {
    const lo = new Set(moi.payload.dimIds);
    return ung
      .filter(({ body: b }) => {
        if (b.kind === "tick") return lo.has(b.payload.dimId);
        if (b.kind === "tick_batch")
          return b.payload.dimIds.length === lo.size && b.payload.dimIds.every((id) => lo.has(id));
        return false;
      })
      .map((o) => o.rec.operationId);
  }
  if (moi.kind === "diary_note") {
    const ngay = moi.payload.date;
    return ung
      .filter(({ body: b }) => b.kind === "diary_note" && b.payload.date === ngay)
      .map((o) => o.rec.operationId);
  }
  return [];
}

/**
 * Chọn op kế tiếp được gửi (theo sequence tăng dần). `taiNguyen` null = op bị khoá (không có khoá
 * vault/giải mã lỗi) → không gửi, không chặn (không thể gửi được thì giữ cả hàng đợi sau nó chỉ
 * gây kẹt; xem Cần quyết trong AUDIT-S07). Op `rejected` là kết thúc phía server → không chặn.
 */
export function chonOpGuiDuoc(
  ops: { rec: QueueRecord; taiNguyen: string[] | null }[],
  now: number,
): QueueRecord | null {
  const biChan = new Set<string>();
  const sapXep = [...ops].sort((a, b) => a.rec.sequence - b.rec.sequence);
  for (const { rec, taiNguyen } of sapXep) {
    if (!taiNguyen || rec.state === "rejected") continue;
    const dungSau = taiNguyen.some((t) => biChan.has(t));
    if (rec.state === "pending" && !dungSau && rec.nextAttemptAt <= now) return rec;
    for (const t of taiNguyen) biChan.add(t);
  }
  return null;
}

// ── Gửi: điểm đến + header cố định ──────────────────────────────────────────────────────────

export function opEndpoint(body: OpBody): { url: string; method: string } {
  switch (body.kind) {
    case "tick":
      return { url: `/api/dimensions/${body.payload.dimId}`, method: "PATCH" };
    case "tick_batch":
      return { url: `/api/dimensions/batch`, method: "PATCH" };
    case "photo":
      return { url: `/api/tasks/${body.payload.taskId}/photos`, method: "POST" };
    case "diary_note":
      return { url: `/api/diaries/${body.payload.date}`, method: "PUT" };
  }
}

export type YeuCauGui = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: BodyInit;
};

/**
 * Dựng request cho một op. Header bất biến qua mọi lần thử: `Idempotency-Key` = operationId lúc
 * enqueue; precondition nhật ký lấy từ baseVersion LÚC ENQUEUE (không đọc lại etag mới — điều kiện
 * chặn S06). `X-XBoss-Context` là context server cấp gần nhất (chứng minh actor/dự án hiện hành).
 * Tên file ảnh cố định theo task để hash receipt (gồm tên gốc) không đổi giữa các lần thử.
 */
export function dungYeuCau(rec: QueueRecord, body: OpBody, contextId: string): YeuCauGui {
  const { url, method } = opEndpoint(body);
  const headers: Record<string, string> = {
    "Idempotency-Key": rec.operationId,
    "X-XBoss-Context": contextId,
  };
  if (body.kind === "photo") {
    const fd = new FormData();
    fd.append("file", body.payload.blob, `offline-${body.payload.taskId}.jpg`);
    if (body.payload.caption) fd.append("caption", body.payload.caption);
    return { url, method, headers, body: fd };
  }
  headers["Content-Type"] = "application/json";
  if (body.kind === "tick")
    return { url, method, headers, body: JSON.stringify({ installed: body.payload.installed }) };
  if (body.kind === "tick_batch")
    return {
      url,
      method,
      headers,
      body: JSON.stringify({ ids: body.payload.dimIds, installed: body.payload.installed }),
    };
  if (body.baseVersion) headers["If-Match"] = body.baseVersion;
  else headers["If-None-Match"] = "*";
  const { date: _d, ...put } = body.payload;
  void _d;
  return { url, method, headers, body: JSON.stringify(put) };
}

// ── Phân loại kết quả (A2-FR10) ─────────────────────────────────────────────────────────────

export type SendOutcome = {
  networkError?: boolean;
  status?: number;
  code?: string;
  error?: string;
  /** Header Retry-After (giây hoặc HTTP-date) khi 429/503. */
  retryAfter?: string | null;
  /** `receipt.operationId` trong body 2xx (S06). */
  receiptOperationId?: string | null;
};

export type PhanLoai =
  | { loai: "xong" }
  | { loai: "retry"; nextAttemptAt: number }
  | { loai: "context"; nextAttemptAt: number }
  | { loai: "paused_auth" }
  | { loai: "conflict" }
  | { loai: "rejected" };

/**
 * Backoff luỹ thừa có jitter theo số lần đã thử: trễ danh định 2s·2^(tries-1), trần 5 phút; lấy
 * ngẫu nhiên trong [½, 1] của trễ danh định (`rand` ∈ [0,1)) để nhiều thiết bị không dồn cùng lúc.
 */
export function backoffMs(tries: number, rand: number): number {
  if (tries <= 0) return 0;
  const danhDinh = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(tries - 1, 30));
  return Math.round(danhDinh / 2 + (danhDinh / 2) * Math.min(Math.max(rand, 0), 1));
}

/** Retry-After: số giây nguyên ≥ 0 hoặc HTTP-date → mốc thử lại (ms). Sai định dạng → null. */
export function docRetryAfter(v: string | null | undefined, now: number): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (/^\d+$/.test(s)) return now + Number(s) * 1000;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.max(now, t);
}

/** Server trả 2xx với đúng receipt của op này mới được coi là đã lưu trên máy chủ. */
export function phanLoaiKetQua(
  rec: Pick<QueueRecord, "operationId" | "tries">,
  kq: SendOutcome,
  now: number,
  rand: number,
): PhanLoai {
  const retry = (): PhanLoai => ({
    loai: "retry",
    nextAttemptAt: now + backoffMs(rec.tries, rand),
  });
  if (kq.networkError || kq.status == null) return retry();
  const s = kq.status;
  if (s >= 200 && s < 300)
    // 2xx không kèm receipt đúng op (server cũ/proxy lạ) → KHÔNG xoá: giữ conflict để đối soát.
    return kq.receiptOperationId === rec.operationId ? { loai: "xong" } : { loai: "conflict" };
  if (s === 401) return { loai: "paused_auth" };
  if (s === 409 && kq.code?.startsWith("context_"))
    // Context hết hạn/đổi giữa chừng: xác minh lại online rồi thử lại — không phải xung đột op.
    return { loai: "context", nextAttemptAt: now + backoffMs(rec.tries, rand) };
  if (s === 409 || s === 412 || s === 428) return { loai: "conflict" };
  if (s === 429 || s === 503) {
    const moc = docRetryAfter(kq.retryAfter, now);
    if (moc != null) return { loai: "retry", nextAttemptAt: moc };
    return retry();
  }
  if (s === 408 || s >= 500) return retry();
  // 403/404/422 và mọi 4xx khác: từ chối bền vững, giữ trên máy để người dùng xem lại (D04).
  return { loai: "rejected" };
}

// ── Thống kê cho badge / API trạng thái ─────────────────────────────────────────────────────

export type QueueStats = {
  total: number;
  pending: number;
  /** Cần chú ý: đã thử mà chưa lên + conflict + rejected + paused_auth. */
  failed: number;
  conflict: number;
  rejected: number;
  pausedAuth: number;
  /** Op của chính chủ nhưng chưa mở được (khác dự án đang chọn hoặc khoá vault chưa mở). */
  locked: number;
};

export const THONG_KE_RONG: QueueStats = {
  total: 0,
  pending: 0,
  failed: 0,
  conflict: 0,
  rejected: 0,
  pausedAuth: 0,
  locked: 0,
};

export function computeStats(
  ops: QueueRecord[],
  chu: ChuSoHuu,
  coKhoa: (keyId: string) => boolean,
): QueueStats {
  const st = { ...THONG_KE_RONG };
  for (const r of ops) {
    if (r.owner !== khoaChu(chu)) continue;
    st.total++;
    if (r.projectId !== chu.projectId || !coKhoa(r.vaultKeyId)) {
      st.locked++;
      continue;
    }
    if (r.state === "conflict") st.conflict++;
    else if (r.state === "rejected") st.rejected++;
    else if (r.state === "paused_auth") st.pausedAuth++;
    else if (r.tries > 0) st.failed++;
    else st.pending++;
  }
  st.failed += st.conflict + st.rejected + st.pausedAuth;
  return st;
}

// ── Cổng lưu trữ (store.ts hiện thực) ───────────────────────────────────────────────────────

export type Lease = { token: number };

export type ThayDoiSauGui =
  { xoa: true } | { state: QueueState; nextAttemptAt?: number; lastResult?: KetQuaGanNhat };

/** Điều kiện xoá theo yêu cầu: op phải thuộc đúng dự án và đang ở một trong các trạng thái này. */
export type DieuKienXoa = { projectId: number; states: readonly QueueState[] };

/**
 * Mọi phương thức chỉ resolve khi transaction IndexedDB đã COMMIT (complete); abort/quota/
 * blocked → reject. `themNguyenTu` trả "stale" khi hàng đợi đã đổi kể từ lúc đọc (OCC theo rev).
 */
export interface QueueStore {
  docChu(owner: string): Promise<{ rev: number; lastSeq: number; ops: QueueRecord[] }>;
  themNguyenTu(input: {
    expectRev: number;
    record: QueueRecord;
    xoa: string[];
  }): Promise<"ok" | "stale">;
  xinLease(phamVi: ChuSoHuu, holder: string, now: number): Promise<Lease | null>;
  giaHanLease(phamVi: ChuSoHuu, holder: string, token: number, now: number): Promise<boolean>;
  traLease(phamVi: ChuSoHuu, holder: string, token: number): Promise<void>;
  batDauGui(
    phamVi: ChuSoHuu,
    operationId: string,
    holder: string,
    token: number,
    now: number,
  ): Promise<QueueRecord | null>;
  apKetQua(
    phamVi: ChuSoHuu,
    operationId: string,
    holder: string,
    token: number,
    thayDoi: ThayDoiSauGui,
  ): Promise<boolean>;
  /**
   * Người dùng đã lưu trực tiếp nội dung này (hoặc xác nhận bỏ) — xoá đúng các op chỉ định.
   * `dieuKien` kiểm TRONG transaction xoá (dự án + trạng thái tại thời điểm commit, không phải
   * snapshot đọc trước đó). Trả số op đã xoá; 0 → không đổi gì (không tăng rev).
   */
  xoaTheoYeuCau(owner: string, ids: string[], dieuKien?: DieuKienXoa): Promise<number>;
  /** Phiên đã xác thực lại (unlock thành công): paused_auth → pending. */
  moLaiPausedAuth(phamVi: ChuSoHuu, now: number): Promise<number>;
}

/** Vault đang mở (vault.ts hiện thực). Giải mã/mã hoá CHỈ cho đúng chủ sở hữu hiện hành. */
export interface VaultMoKhoa {
  chu(): ChuSoHuu | null;
  coKhoa(keyId: string): boolean;
  maHoa(
    meta: Pick<QueueRecord, "vaultKeyId" | "operationId" | "kind" | "sequence">,
    banRo: Uint8Array<ArrayBuffer>,
  ): Promise<{ iv: string; ciphertext: string }>;
  giaiMa(rec: QueueRecord): Promise<Uint8Array>;
  /** Context còn hạn cho request (làm mới online khi gần hết hạn). Throw khi không xác minh được. */
  contextGui(): Promise<string>;
}

// ── Enqueue nguyên tử (dedup + cấp sequence + ghi trong MỘT transaction có kiểm OCC) ─────────

export class LoiHangDoiBan extends Error {
  constructor() {
    super("Hàng đợi ngoại tuyến đang bận ở tab khác — thử lại");
    this.name = "LoiHangDoiBan";
  }
}

/** Điều kiện của người gọi `themOp` không còn đúng trên snapshot sẽ commit — không ghi/xoá gì. */
export class LoiDieuKienThem extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoiDieuKienThem";
  }
}

/** Một op trong snapshot đang xét (body = null: ảnh, hoặc không giải mã được). */
export type OpTrongBanChup = { rec: QueueRecord; body: OpBody | null };

const MAX_THU_OCC = 6;

/** Cache giải mã theo operationId (ciphertext bất biến theo operationId). */
export type BoNhoGiaiMa = Map<string, OpBody>;

/** Giải mã một op (dùng cache nếu có); không giải được (khoá thiếu/sai chủ/hỏng) → null. */
export async function giaiMaCo(
  vault: VaultMoKhoa,
  rec: QueueRecord,
  cache?: BoNhoGiaiMa,
): Promise<OpBody | null> {
  const daCo = cache?.get(rec.operationId);
  if (daCo) return daCo;
  try {
    const body = moGoiThanOp(rec.kind, await vault.giaiMa(rec));
    // Ảnh lớn: không giữ blob trong cache dài hạn.
    if (cache && body.kind !== "photo") cache.set(rec.operationId, body);
    return body;
  } catch {
    return null;
  }
}

/**
 * Thêm op: đọc hàng đợi của chủ → giải mã ứng viên dedup trong bộ nhớ → mã hoá op mới với
 * sequence = lastSeq + 1 → MỘT transaction kiểm rev chưa đổi rồi xoá dedup + ghi op + tăng
 * sequence. Rev đổi (tab khác ghi/flush xen giữa) → làm lại từ đầu. Chỉ resolve khi COMMIT.
 *
 * `dieuKien` chạy ở MỖI vòng trên đúng snapshot vòng đó đọc; vòng commit được chỉ khi rev chưa
 * đổi, nên điều kiện đúng trên chính trạng thái được ghi (không TOCTOU giữa kiểm và ghi). Trả
 * thông điệp → throw LoiDieuKienThem, không ghi/xoá gì. `thayOpCu: false` = chỉ THÊM, không dedup.
 */
export async function themOp(d: {
  store: QueueStore;
  vault: VaultMoKhoa;
  keyId: string;
  body: OpBody;
  now: () => number;
  uuid: () => string;
  cache?: BoNhoGiaiMa;
  dieuKien?: (banChup: OpTrongBanChup[]) => string | null;
  thayOpCu?: boolean;
}): Promise<{ operationId: string }> {
  const chu = d.vault.chu();
  if (!chu) throw new Error("Vault chưa mở");
  const banRo = await dongGoiThanOp(d.body);
  const thay = d.thayOpCu !== false && d.body.kind !== "photo";
  for (let lan = 0; lan < MAX_THU_OCC; lan++) {
    const { rev, lastSeq, ops } = await d.store.docChu(khoaChu(chu));
    const ungVien: OpDaGiai[] = [];
    const banChup: OpTrongBanChup[] = [];
    for (const rec of ops) {
      if (!cungChu(rec, chu)) continue;
      const choDedup = thay && chuaTungGui(rec) && rec.kind !== "photo";
      const choDieuKien = !!d.dieuKien && rec.kind !== "photo";
      const body = choDedup || choDieuKien ? await giaiMaCo(d.vault, rec, d.cache) : null;
      if (choDedup && body) ungVien.push({ rec, body });
      if (d.dieuKien) banChup.push({ rec, body });
    }
    const loi = d.dieuKien?.(banChup) ?? null;
    if (loi) throw new LoiDieuKienThem(loi);
    const xoa = thay ? chonOpThay(d.body, ungVien) : [];
    const meta = {
      vaultKeyId: d.keyId,
      operationId: d.uuid(),
      kind: d.body.kind,
      sequence: lastSeq + 1,
    };
    const { iv, ciphertext } = await d.vault.maHoa(meta, banRo);
    const queuedAt = d.now();
    const record: QueueRecord = {
      schemaVersion: 2,
      ...meta,
      ownerUserId: chu.ownerUserId,
      orgId: chu.orgId,
      projectId: chu.projectId,
      deviceId: chu.deviceId,
      queuedAt,
      tries: 0,
      nextAttemptAt: queuedAt,
      state: "pending",
      iv,
      ciphertext,
      owner: khoaChu(chu),
      bytes: ciphertext.length,
    };
    if ((await d.store.themNguyenTu({ expectRev: rev, record, xoa })) === "ok") {
      for (const id of xoa) d.cache?.delete(id);
      return { operationId: meta.operationId };
    }
  }
  throw new LoiHangDoiBan();
}

/** Đọc và giải mã các op của chủ hiện hành ở dự án hiện hành (op khoá được bỏ qua). */
export async function docOpDaGiai(
  store: QueueStore,
  vault: VaultMoKhoa,
  cache?: BoNhoGiaiMa,
): Promise<OpDaGiai[]> {
  const chu = vault.chu();
  if (!chu) return [];
  const { ops } = await store.docChu(khoaChu(chu));
  const out: OpDaGiai[] = [];
  for (const rec of ops.sort((a, b) => a.sequence - b.sequence)) {
    if (!cungChu(rec, chu) || !vault.coKhoa(rec.vaultKeyId)) continue;
    const body = await giaiMaCo(vault, rec, cache);
    if (body) out.push({ rec, body });
  }
  return out;
}

// ── Vòng gửi (một tab giữ lease + fencing token) ───────────────────────────────────────────

export type OpKetThuc = { operationId: string; kind: QueueKind; status: number; error?: string };

export type KetQuaFlush = {
  /** Không giành được lease (tab khác đang gửi) hoặc vault chưa mở. */
  boQua: boolean;
  daGui: number;
  conflict: OpKetThuc[];
  rejected: OpKetThuc[];
  pausedAuth: boolean;
  /** Không lấy/làm mới được context (offline, hết hạn, bị đổi) — dừng vòng, giữ op. */
  loiContext: boolean;
  /** Mất lease giữa chừng (tab khác chiếm sau khi hết hạn) — dừng, không áp kết quả cũ. */
  matLease: boolean;
};

export type GuiFn = (req: YeuCauGui) => Promise<SendOutcome>;

export async function flushQueue(d: {
  store: QueueStore;
  vault: VaultMoKhoa;
  holder: string;
  send: GuiFn;
  now?: () => number;
  rand?: () => number;
  cache?: BoNhoGiaiMa;
  /** Trần số op mỗi vòng (chống vòng lặp vô hạn nếu store lỗi). */
  maxOps?: number;
  /** Nhịp gia hạn lease trong lúc chờ mạng (mặc định LEASE_RENEW_MS; test rút ngắn). */
  nhipGiaHanMs?: number;
}): Promise<KetQuaFlush> {
  const now = d.now ?? Date.now;
  const rand = d.rand ?? Math.random;
  const kq: KetQuaFlush = {
    boQua: false,
    daGui: 0,
    conflict: [],
    rejected: [],
    pausedAuth: false,
    loiContext: false,
    matLease: false,
  };
  const chu = d.vault.chu();
  if (!chu) return { ...kq, boQua: true };
  const lease = await d.store.xinLease(chu, d.holder, now());
  if (!lease) return { ...kq, boQua: true };
  let giaHanLuc = now();
  try {
    for (let i = 0; i < (d.maxOps ?? 500); i++) {
      if (now() - giaHanLuc >= LEASE_RENEW_MS) {
        if (!(await d.store.giaHanLease(chu, d.holder, lease.token, now()))) {
          kq.matLease = true;
          break;
        }
        giaHanLuc = now();
      }
      const { ops } = await d.store.docChu(khoaChu(chu));
      const items: { rec: QueueRecord; taiNguyen: string[] | null }[] = [];
      const thanTheoId = new Map<string, OpBody>();
      for (const rec of ops) {
        if (!cungChu(rec, chu)) continue;
        if (!d.vault.coKhoa(rec.vaultKeyId)) {
          items.push({ rec, taiNguyen: null });
          continue;
        }
        if (rec.kind === "photo") {
          items.push({ rec, taiNguyen: [`photo:${rec.operationId}`] });
          continue;
        }
        const body = await giaiMaCo(d.vault, rec, d.cache);
        if (body) thanTheoId.set(rec.operationId, body);
        items.push({ rec, taiNguyen: body ? taiNguyenCuaOp(rec.operationId, body) : null });
      }
      const chon = chonOpGuiDuoc(items, now());
      if (!chon) break;
      const body = thanTheoId.get(chon.operationId) ?? (await giaiMaCo(d.vault, chon));
      if (!body) break; // không giải mã được nữa (khoá vừa bị bỏ) — dừng, giữ nguyên
      let contextId: string;
      try {
        contextId = await d.vault.contextGui();
      } catch {
        kq.loiContext = true;
        break;
      }
      // Fencing TRƯỚC mạng: chỉ người giữ lease với đúng token mới chuyển op sang sending.
      const dangGui = await d.store.batDauGui(chu, chon.operationId, d.holder, lease.token, now());
      if (!dangGui) {
        kq.matLease = !(await d.store.giaHanLease(chu, d.holder, lease.token, now()));
        if (kq.matLease) break;
        continue; // op vừa đổi trạng thái ở tab khác (xoá/dedup) — chọn lại
      }
      // Giữ lease trong lúc chờ mạng: ảnh lớn trên 3G có thể lâu hơn TTL — không gia hạn thì tab
      // khác giành lease và gửi lại song song cùng key (A2-AC04). Gia hạn hỏng → fencing ở
      // apKetQua bắt, không áp kết quả.
      const nhip = setInterval(() => {
        d.store.giaHanLease(chu, d.holder, lease.token, now()).catch(() => false);
      }, d.nhipGiaHanMs ?? LEASE_RENEW_MS);
      // Lỗi bất ngờ của lớp gửi = không biết server đã nhận chưa → như lỗi mạng (giữ, thử lại).
      const outcome = await d
        .send(dungYeuCau(dangGui, body, contextId))
        .catch((): SendOutcome => ({ networkError: true }))
        .finally(() => clearInterval(nhip));
      const pl = phanLoaiKetQua(dangGui, outcome, now(), rand());
      const lastResult: KetQuaGanNhat | undefined = outcome.status
        ? { status: outcome.status, code: outcome.code, at: now() }
        : undefined;
      const thayDoi: ThayDoiSauGui =
        pl.loai === "xong"
          ? { xoa: true }
          : pl.loai === "retry" || pl.loai === "context"
            ? { state: "pending", nextAttemptAt: pl.nextAttemptAt, lastResult }
            : { state: pl.loai, lastResult };
      // Fencing SAU mạng: mất lease/token đổi → không áp kết quả (tab giữ lease mới sẽ gửi lại,
      // receipt server bảo đảm không nhân đôi hiệu ứng).
      if (!(await d.store.apKetQua(chu, chon.operationId, d.holder, lease.token, thayDoi))) {
        kq.matLease = true;
        break;
      }
      const ketThuc: OpKetThuc = {
        operationId: chon.operationId,
        kind: chon.kind,
        status: outcome.status ?? 0,
        error: outcome.error,
      };
      if (pl.loai === "xong") {
        kq.daGui++;
        d.cache?.delete(chon.operationId);
      } else if (pl.loai === "conflict") kq.conflict.push(ketThuc);
      else if (pl.loai === "rejected") kq.rejected.push(ketThuc);
      else if (pl.loai === "paused_auth") {
        kq.pausedAuth = true;
        break;
      } else if (pl.loai === "context") {
        kq.loiContext = true;
        break;
      }
    }
  } finally {
    await d.store.traLease(chu, d.holder, lease.token).catch(() => undefined);
  }
  return kq;
}
