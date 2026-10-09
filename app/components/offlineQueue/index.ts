"use client";
// Hàng đợi offline v2 (QUALITY-FINAL-1 S07): thao tác mất mạng được mã hoá trong vault IndexedDB
// theo chủ sở hữu (user/org/dự án/thiết bị), gửi lại khi có mạng với Idempotency-Key cố định,
// X-XBoss-Context và precondition nhật ký lúc enqueue. Logic thuần ở logic.ts, lưu trữ ở
// store.ts, khoá vault ở vault.ts — file này chỉ nối dây với trình duyệt/React.
//
// Queue v1 (không chủ) vẫn QUARANTINE trong store `ops` cũ: không đọc/gửi/gán chủ/xoá.
// `OFFLINE_QUEUE_QUARANTINED` là công tắc dừng khẩn cấp (rollback = bật lại → không ghi, không gửi,
// giữ nguyên vault) — mặc định TẮT từ S07.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { IdbTxDb, LoiHanMucAnh, QueueDb, type MucKhoiPhuc } from "./store";
import { compressImage } from "./image";
import { VaultSession, type VaultTrangThai } from "./vault";
import { showToast } from "@/app/components/Toast";
import { ngheDoiNguCanh } from "@/app/lib/contextEpoch";
import {
  computeStats,
  cungChu,
  docOpDaGiai,
  flushQueue,
  FLUSH_INTERVAL_MS,
  giaiMaCo,
  khoaChu,
  LoiDieuKienThem,
  themOp,
  THONG_KE_RONG,
  type BoNhoGiaiMa,
  type DiaryNotePayload,
  type OpBody,
  type QueueKind,
  type QueueRecord,
  type QueueState,
  type QueueStats,
  type SendOutcome,
  type YeuCauGui,
} from "./logic";

const SYNC_TAG = "xboss-flush";
export const OFFLINE_QUEUE_QUARANTINED = false;
/** Thông điệp khi KHÔNG lưu được trên thiết bị — form/ô giữ nguyên để người dùng xử lý. */
export const OFFLINE_SAVE_ERROR = "Chưa lưu được trên thiết bị. Hãy kết nối mạng rồi thử lại.";
/** Nhịp báo lại ngữ cảnh cho SW (< ~30s SW rảnh bị dừng) khi vault đang mở. */
const SW_NHIP_MS = 20_000;
/** Trần số task mỗi khoá vault (khớp MAX_MANIFEST_TASKS phía server). */
const TASK_MOI_KHOA = 500;
/** Chỉ op máy chủ đã trả lời dứt điểm mới được người dùng bỏ (A2-AC06/AC10). */
const TRANG_THAI_BO_DUOC: readonly QueueState[] = ["conflict", "rejected"];
const LOI_KHONG_CON_XUNG_DOT = "Thao tác này không còn ở trạng thái xung đột — tải lại danh sách.";
const LOI_CO_BAN_MOI_HON =
  "Đã có bản nháp mới hơn cho ngày này trên thiết bị — bản mới hơn sẽ được gửi thay, không giữ bản cũ.";

// Gửi một request hàng đợi. Chỉ đọc body để lấy receipt (2xx) hoặc mã lỗi (4xx/5xx).
async function guiYeuCau(req: YeuCauGui): Promise<SendOutcome> {
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    return { networkError: true };
  }
  const body = (await res.json().catch(() => null)) as {
    error?: unknown;
    code?: unknown;
    receipt?: { operationId?: unknown };
  } | null;
  return {
    status: res.status,
    error: typeof body?.error === "string" ? body.error : undefined,
    code: typeof body?.code === "string" ? body.code : undefined,
    retryAfter: res.headers.get("Retry-After"),
    receiptOperationId:
      typeof body?.receipt?.operationId === "string" ? body.receipt.operationId : null,
  };
}

// Đánh thức gửi lại qua Background Sync nếu trình duyệt có (best-effort; KHÔNG dựa vào nó —
// online/visibility/poll foreground mới là đường chính, Safari không có Background Sync).
async function requestBackgroundSync(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync;
    if (sync) await sync.register(SYNC_TAG);
  } catch {
    /* không hỗ trợ / bị chặn */
  }
}

export type QueueSnapshot = QueueStats & {
  online: boolean;
  sending: boolean;
  quarantined: boolean;
  /** Còn hàng đợi v1 không chủ trên thiết bị (cách ly, chờ đối soát thủ công — D03). */
  legacy: boolean;
  vault: VaultTrangThai;
  /**
   * Lần đọc hàng đợi gần nhất LỖI (IndexedDB bị chặn/hỏng/bận): các số đếm là của lần đọc được
   * trước đó, KHÔNG được hiểu là "0 chờ" hay "đã lên máy chủ".
   */
  docLoi: boolean;
};

/** Trạng thái một thao tác (đọc qua API, không mang payload) — S08 dựng UI phục hồi trên đây. */
export type ThaoTacHangDoi = {
  operationId: string;
  kind: QueueKind;
  state: QueueState;
  queuedAt: number;
  tries: number;
  nextAttemptAt: number;
  lastResult?: { status: number; code?: string; at: number };
  /** Khoá vault của op đang mở trong phiên này (false = bị khoá, chưa đọc/gửi được). */
  moDuoc: boolean;
  /** Ngày nhật ký (chỉ op diary_note đã giải mã được) — để người dùng nhận ra thao tác. */
  ngayNhatKy?: string;
  /** Số ô của thao tác tick (1 với tick lẻ). */
  soO?: number;
};

/** Bản nháp nhật ký đang xung đột (chỉ đọc từ vault của chính chủ) để so với bản máy chủ. */
export type NhatKyXungDot = {
  operationId: string;
  payload: DiaryNotePayload;
  /** Có thao tác nhật ký MỚI HƠN cùng ngày trên thiết bị → không cho "giữ bản này" (bản mới thắng). */
  coBanMoiHon: boolean;
};

/** Thông điệp gửi service worker: chỉ nhãn phiên ngẫu nhiên + hạn lease, không PII/khoá/context. */
type ThongDiepSw = { type: "OFFLINE_CONTEXT"; tag: string | null; expiresAt: number };

type ManagerDeps = {
  store?: QueueDb;
  vault?: VaultSession;
  send?: (req: YeuCauGui) => Promise<SendOutcome>;
  /** Kênh báo SW (test thay được); mặc định postMessage tới SW đang điều khiển trang. */
  baoSw?: (m: ThongDiepSw) => void;
};

const taoId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class OfflineQueueManager {
  private storeLazy: QueueDb | null;
  readonly vault: VaultSession;
  private send: (req: YeuCauGui) => Promise<SendOutcome>;
  private readonly holder = taoId();
  private cache: BoNhoGiaiMa = new Map();
  private snap: QueueSnapshot = {
    ...THONG_KE_RONG,
    online: true,
    sending: false,
    quarantined: OFFLINE_QUEUE_QUARANTINED,
    legacy: false,
    vault: "unknown",
    docLoi: false,
  };
  private listeners = new Set<() => void>();
  private flushedListeners = new Set<() => void>();
  private started = false;
  private flushing = false;
  // Tab khác đổi dự án/đăng xuất/đổi tài khoản → khoá vault tab này, dừng gửi (KHÔNG xoá).
  private tamDungNguCanh = false;
  /** User chủ lần cuối vault ACTIVE — khi vault khoá vẫn đếm được op của họ để không báo "0 chờ". */
  private userCuoi: number | null = null;
  /** dimId → taskId của lưới đang hiển thị (để kiểm manifest khi tick offline). */
  private oCuaTask = new Map<number, number>();
  private daChuanBi = new Set<string>();
  /** Nhãn phiên vault cho SW (đổi mỗi lần vault ACTIVE) — cache đọc chỉ hợp lệ trong đúng phiên. */
  private swTag: string | null = null;
  private baoSw: (m: ThongDiepSw) => void;

  constructor(deps: ManagerDeps = {}) {
    this.storeLazy = deps.store ?? null;
    this.vault = deps.vault ?? new VaultSession();
    this.send = deps.send ?? guiYeuCau;
    this.baoSw = deps.baoSw ?? guiChoSw;
    this.vault.onDoi(() => {
      this.setSnap({ vault: this.vault.trangThai });
      this.dongBoNguCanhSw();
    });
  }

  /**
   * S08 (A2-FR02/AC09): SW chỉ phục vụ cache đọc tracking cho tab có vault ACTIVE, trong hạn
   * lease; vault khoá (hết lease/đăng xuất/đổi ngữ cảnh) → báo SW bỏ ngữ cảnh của tab này.
   */
  private dongBoNguCanhSw(): void {
    const han = this.vault.hanLeaseTuong();
    if (han == null) {
      if (this.swTag === null) return;
      this.swTag = null;
      this.baoSw({ type: "OFFLINE_CONTEXT", tag: null, expiresAt: 0 });
      return;
    }
    this.swTag ??= taoId();
    this.baoSw({ type: "OFFLINE_CONTEXT", tag: this.swTag, expiresAt: han });
  }

  private get store(): QueueDb {
    if (!this.storeLazy) this.storeLazy = new QueueDb(new IdbTxDb());
    return this.storeLazy;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): QueueSnapshot => this.snap;

  /** Callback khi có thao tác vừa lên máy chủ (tracking dùng để tải lại dữ liệu). */
  onFlushed(fn: () => void): () => void {
    this.flushedListeners.add(fn);
    return () => {
      this.flushedListeners.delete(fn);
    };
  }

  private setSnap(patch: Partial<QueueSnapshot>) {
    const next = { ...this.snap, ...patch };
    const keys = Object.keys(next) as (keyof QueueSnapshot)[];
    if (keys.every((k) => next[k] === this.snap[k])) return;
    this.snap = next;
    for (const l of this.listeners) l();
  }

  /** Không bao giờ reject: lỗi đọc IndexedDB → `docLoi` (giữ số lần đọc trước, không hạ về 0). */
  private async refreshStats(extra: Partial<QueueSnapshot> = {}) {
    const chu = this.vault.chu();
    try {
      if (!chu) {
        // Vault khoá (hết lease/401/đổi ngữ cảnh) nhưng op vẫn nằm trên thiết bị: báo `locked` để
        // badge/banner không hiện "0 chờ" (người dùng tưởng đã đồng bộ xong) và poll vẫn kích mở lại.
        const user = this.userCuoi;
        const n = user === null ? 0 : await this.store.demOpCuaUser(user);
        // Đăng xuất/mở vault xen giữa lúc đếm → kết quả này đã cũ, lần refresh sau đã đặt đúng.
        if (this.userCuoi !== user || this.vault.chu()) return;
        this.setSnap({ ...THONG_KE_RONG, total: n, locked: n, docLoi: false, ...extra });
        return;
      }
      this.userCuoi = chu.ownerUserId;
      const { ops } = await this.store.docChu(khoaChu(chu));
      // Vault vừa khoá/đổi chủ trong lúc đọc (đăng xuất giữa chừng) → bỏ kết quả cũ, không hiện lại
      // số op của chủ trước (lần refresh của khoaPhien đã đặt trạng thái đúng).
      if (this.vault.chu() !== chu) return;
      const st = computeStats(ops, chu, (k) => this.vault.coKhoa(k));
      this.setSnap({ ...st, docLoi: false, ...extra });
    } catch {
      this.setSnap({ docLoi: true, ...extra });
    }
  }

  /** Đọc lại trạng thái hàng đợi (nút "Thử lại" của màn phục hồi sau lỗi đọc thiết bị). */
  lamMoi(): Promise<void> {
    return this.refreshStats();
  }

  /** Kích gửi nền — lỗi IDB/mạng đã được giữ nguyên trạng thái, chỉ chờ lần kích sau. */
  private kichFlush(): void {
    this.flush().catch(() => undefined);
  }

  private dangOnline(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine;
  }

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.setSnap({ online: navigator.onLine, quarantined: OFFLINE_QUEUE_QUARANTINED });
    if (OFFLINE_QUEUE_QUARANTINED) return;
    window.addEventListener("online", () => {
      this.setSnap({ online: true });
      this.kichFlush();
    });
    window.addEventListener("offline", () => this.setSnap({ online: false }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.kichFlush();
    });
    navigator.serviceWorker?.addEventListener?.("message", (e: MessageEvent) => {
      if ((e.data as { type?: unknown } | null)?.type === "FLUSH_QUEUE") this.kichFlush();
    });
    ngheDoiNguCanh((m) => {
      // Đăng xuất/đổi tài khoản ở tab khác: actor hiện tại KHÔNG còn là chủ cũ → không đếm op của
      // họ nữa (A2-AC01). Đổi dự án: vẫn đúng người, giữ số op bị khoá để không báo "0 chờ".
      this.khoaPhien(m.r !== "switch");
    });
    // Poll foreground: không phụ thuộc Background Sync/Web Locks (D02, A2-FR12).
    setInterval(() => {
      if (this.snap.total > 0) this.kichFlush();
    }, FLUSH_INTERVAL_MS);
    // S08: SW mới nhận quyền điều khiển trang, hoặc SW bị trình duyệt dừng khi rảnh rồi khởi động
    // lại (mất ngữ cảnh trong bộ nhớ) → báo lại ngữ cảnh của vault ĐANG mở (kiểm lease mỗi lần).
    // Vault khoá thì không gửi gì.
    navigator.serviceWorker?.addEventListener?.("controllerchange", () => this.dongBoNguCanhSw());
    setInterval(() => this.dongBoNguCanhSw(), SW_NHIP_MS);
    void this.khoiDong();
  }

  /**
   * Khoá phiên offline của tab (đăng xuất / ngữ cảnh đổi): khoá vault, xoá cache giải mã + bản đồ
   * ô/khoá đã chuẩn bị trong bộ nhớ, dừng gửi. Ciphertext trên thiết bị GIỮ NGUYÊN (D03) để chính
   * chủ đăng nhập lại online rồi phục hồi. Không khẳng định máy chủ đã thu hồi gì.
   */
  khoaPhien(quenChu: boolean): void {
    this.tamDungNguCanh = true;
    this.cache.clear();
    this.oCuaTask.clear();
    this.daChuanBi.clear();
    if (quenChu) this.userCuoi = null;
    this.vault.khoa();
    this.dongBoNguCanhSw();
    void this.refreshStats().catch(() => undefined);
  }

  /** Lần đầu: báo legacy; nếu chính user hiện tại còn op chờ trên thiết bị → mở vault rồi gửi. */
  private async khoiDong() {
    try {
      this.setSnap({ legacy: await this.store.coLegacy() });
    } catch {
      /* không mở được CSDL — các thao tác sau sẽ báo lỗi rõ */
    }
    if (!this.dangOnline()) return;
    try {
      if ((await this.store.demOp()) === 0) return;
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { user?: { id?: unknown } } | null;
      const id = j?.user?.id;
      if (!r.ok || typeof id !== "number") return;
      if (await this.store.coOpCuaUser(id)) this.kichFlush();
    } catch {
      /* mất mạng/lỗi DB — thử lại ở lần online/poll kế tiếp */
    }
  }

  /** Mở vault (online) nếu chưa mở; đúng chủ thì đưa op paused_auth về pending. */
  private async damBaoVault(): Promise<boolean> {
    if (this.tamDungNguCanh) return false;
    if (!this.vault.chu() || !this.vault.conHieuLuc()) {
      if (!this.dangOnline() || !(await this.vault.moKhoa())) return false;
    }
    // paused_auth chỉ sinh kèm khoá vault, nên vault ACTIVE = actor đã xác minh lại → đưa về
    // pending. Gọi ở MỌI lần (không chỉ lúc vừa mở) để lỗi IDB một lần không làm op kẹt mãi.
    const chu = this.vault.chu();
    if (chu) await this.store.moLaiPausedAuth(chu, Date.now()).catch(() => 0);
    return true;
  }

  // ── Chuẩn bị khoá (online, TRƯỚC khi mất mạng) ─────────────────────────────────────────

  /**
   * Trang tracking (người có quyền sửa) gọi sau khi tải dữ liệu: xin khoá vault cho manifest các
   * task đang hiển thị (chia khối ≤500 task, sắp xếp cố định → cùng tập task dùng lại khoá cũ).
   * Subcon chỉ xin cho task được giao chính mình (server kiểm lại toàn bộ manifest).
   */
  async chuanBiTracking(tasks: { id: number; assignedTo?: number | null }[]): Promise<void> {
    if (OFFLINE_QUEUE_QUARANTINED || !(await this.damBaoVault())) return;
    const chu = this.vault.chu();
    if (!chu) return;
    const ids = [
      ...new Set(
        tasks
          .filter((t) => this.vault.vaiTro() !== "subcon" || t.assignedTo === chu.ownerUserId)
          .map((t) => t.id),
      ),
    ].sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i += TASK_MOI_KHOA) {
      const khoi = ids.slice(i, i + TASK_MOI_KHOA);
      const dau = `t:${chu.projectId}:${khoi.join(",")}`;
      if (this.daChuanBi.has(dau)) continue;
      if (
        await this.vault
          .damBaoKhoa({ tasks: khoi, taskActions: ["photo", "tick"] })
          .catch(() => false)
      )
        this.daChuanBi.add(dau);
    }
    this.dongBoNguCanhSw();
    await this.refreshStats().catch(() => undefined);
  }

  /** Lưới một nhóm vừa tải: ghi nhận ô → task (không gọi mạng). */
  dangKyLuoi(tasks: { id: number; cells: Record<string, { id: number }> }[]): void {
    for (const t of tasks) for (const c of Object.values(t.cells)) this.oCuaTask.set(c.id, t.id);
  }

  /** Modal nhật ký (người lập nhật ký) mở khi có mạng: khoá cho tháng chứa ngày đó (≤31 ngày). */
  async chuanBiNhatKy(date: string): Promise<void> {
    if (OFFLINE_QUEUE_QUARANTINED || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (!(await this.damBaoVault())) return;
    const [y, m] = date.split("-").map(Number);
    const cuoi = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const thang = `${date.slice(0, 7)}`;
    await this.vault
      .damBaoKhoa({
        diary: { from: `${thang}-01`, to: `${thang}-${String(cuoi).padStart(2, "0")}` },
      })
      .catch(() => false);
  }

  // ── Gửi ────────────────────────────────────────────────────────────────────────────────

  async flush() {
    if (OFFLINE_QUEUE_QUARANTINED || this.tamDungNguCanh) return;
    if (this.flushing || !this.dangOnline()) return;
    // Khoá trong tab trước await đầu tiên; giữa các tab là lease IDB + fencing (logic.flushQueue).
    this.flushing = true;
    try {
      if (!(await this.damBaoVault())) return;
      this.setSnap({ sending: true });
      try {
        const kq = await flushQueue({
          store: this.store,
          vault: this.vault,
          holder: this.holder,
          send: this.send,
          cache: this.cache,
        });
        if (kq.loiContext) {
          // 409 context_*: quyền/thiết bị/dự án đã đổi — khoá vault để lần sau xác minh lại từ đầu
          // (/auth/me → context → unlock), không tiếp tục dùng context/DEK cũ tới hết lease.
          this.cache.clear();
          this.vault.khoa();
        }
        if (kq.pausedAuth) {
          this.cache.clear();
          this.vault.khoa();
          showToast(
            "Phiên đăng nhập đã hết hạn — thao tác ngoại tuyến vẫn giữ trên thiết bị, đăng nhập lại để gửi",
            "error",
          );
        }
        if (kq.conflict.length)
          showToast(
            `${kq.conflict.length} thao tác ngoại tuyến bị xung đột với dữ liệu trên máy chủ — vẫn giữ trên thiết bị, chưa ghi đè`,
            "error",
          );
        if (kq.rejected.length) {
          const lyDo = kq.rejected.find((r) => r.error)?.error;
          showToast(
            `${kq.rejected.length} thao tác ngoại tuyến bị máy chủ từ chối${lyDo ? `: ${lyDo}` : ""} — vẫn giữ trên thiết bị để xem lại`,
            "error",
          );
        }
        if (kq.daGui > 0) for (const l of this.flushedListeners) l();
      } finally {
        await this.refreshStats({ sending: false }).catch(() => this.setSnap({ sending: false }));
      }
    } finally {
      this.flushing = false;
      this.setSnap({ sending: false });
    }
  }

  private afterEnqueue() {
    if (this.dangOnline()) this.kichFlush();
    else void requestBackgroundSync();
  }

  // ── Enqueue (chỉ báo thành công sau khi transaction IDB COMMIT) ───────────────────────

  private async them(body: OpBody, keyId: string | null): Promise<boolean> {
    if (OFFLINE_QUEUE_QUARANTINED || this.tamDungNguCanh || !keyId) return false;
    await themOp({
      store: this.store,
      vault: this.vault,
      keyId,
      body,
      now: Date.now,
      uuid: taoId,
      cache: this.cache,
    });
    await this.refreshStats().catch(() => undefined);
    this.afterEnqueue();
    return true;
  }

  /** Tick một ô. false = KHÔNG lưu được (caller hoàn tác ô + báo lỗi). */
  async enqueueTick(dimId: number, installed: boolean): Promise<boolean> {
    if (OFFLINE_QUEUE_QUARANTINED) return false;
    const taskId = this.oCuaTask.get(dimId);
    if (taskId == null) return false;
    try {
      return await this.them(
        { kind: "tick", payload: { dimId, installed } },
        this.vault.timKhoa("tick", { taskIds: [taskId] }),
      );
    } catch {
      return false;
    }
  }

  /** Tick theo lô (M121) — 1 op cho cả vùng chọn; mọi ô phải thuộc cùng một khoá vault. */
  async enqueueTickBatch(dimIds: number[], installed: boolean): Promise<boolean> {
    if (OFFLINE_QUEUE_QUARANTINED) return false;
    if (!dimIds.length) return true;
    const taskIds = dimIds.map((id) => this.oCuaTask.get(id));
    if (taskIds.some((t) => t == null)) return false;
    try {
      return await this.them(
        { kind: "tick_batch", payload: { dimIds: [...dimIds], installed } },
        this.vault.timKhoa("tick", { taskIds: [...new Set(taskIds as number[])] }),
      );
    } catch {
      return false;
    }
  }

  async enqueuePhoto(input: {
    taskId: number;
    blob: Blob;
    caption?: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    if (OFFLINE_QUEUE_QUARANTINED) return { ok: false, error: OFFLINE_SAVE_ERROR };
    try {
      const { blob, mime } = await compressImage(input.blob);
      const ok = await this.them(
        {
          kind: "photo",
          payload: {
            taskId: input.taskId,
            caption: input.caption ?? "",
            blob,
            size: blob.size,
            mime,
          },
        },
        this.vault.timKhoa("photo", { taskIds: [input.taskId] }),
      );
      return ok ? { ok: true } : { ok: false, error: OFFLINE_SAVE_ERROR };
    } catch (e) {
      return { ok: false, error: e instanceof LoiHanMucAnh ? e.message : OFFLINE_SAVE_ERROR };
    }
  }

  /**
   * Nhật ký ngày (full-replace). `etag` = phiên bản server form đang dựa vào (null = chưa có bản
   * server/không tải được → gửi If-None-Match: *, server 412 nếu đã có — không đè).
   */
  async enqueueDiaryNote(
    input: DiaryNotePayload,
    etag: string | null,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (OFFLINE_QUEUE_QUARANTINED) return { ok: false, error: OFFLINE_SAVE_ERROR };
    try {
      const ok = await this.them(
        { kind: "diary_note", payload: input, baseVersion: etag },
        this.vault.timKhoa("diary_note", { date: input.date }),
      );
      return ok ? { ok: true } : { ok: false, error: OFFLINE_SAVE_ERROR };
    } catch {
      return { ok: false, error: OFFLINE_SAVE_ERROR };
    }
  }

  // ── Đọc (chỉ khi vault đang mở, chỉ op của chính chủ ở dự án hiện hành) ───────────────

  async getQueuedPhotos(
    taskId: number,
  ): Promise<{ id: string; caption: string; size: number; queuedAt: number; tries: number }[]> {
    if (!this.vault.chu()) return [];
    const ds = await docOpDaGiai(this.store, this.vault).catch(() => []);
    return ds.flatMap(({ rec, body }) =>
      body.kind === "photo" && body.payload.taskId === taskId
        ? [
            {
              id: rec.operationId,
              caption: body.payload.caption,
              size: body.payload.size,
              queuedAt: rec.queuedAt,
              tries: rec.tries,
            },
          ]
        : [],
    );
  }

  async getQueuedPhotoBlob(id: string): Promise<Blob | undefined> {
    if (!this.vault.chu()) return undefined;
    const ds = await docOpDaGiai(this.store, this.vault).catch(() => []);
    const op = ds.find((o) => o.rec.operationId === id);
    return op?.body.kind === "photo" ? op.body.payload.blob : undefined;
  }

  /** Bản nháp nhật ký MỚI NHẤT của ngày (mọi trạng thái — kể cả conflict) để nạp lại form. */
  async getQueuedDiaryNote(date: string): Promise<
    | {
        kind: "diary_note";
        payload: DiaryNotePayload;
        state: QueueState;
        /** Mọi bản nháp của ngày đã đọc lúc nạp — chỉ những id này được bỏ khi lưu online. */
        operationIds: string[];
      }
    | undefined
  > {
    if (!this.vault.chu()) return undefined;
    const ds = await docOpDaGiai(this.store, this.vault, this.cache).catch(() => []);
    const cungNgay = ds.filter((o) => o.body.kind === "diary_note" && o.body.payload.date === date);
    const cuoi = cungNgay.at(-1);
    if (!cuoi || cuoi.body.kind !== "diary_note") return undefined;
    return {
      kind: "diary_note",
      payload: cuoi.body.payload,
      state: cuoi.rec.state,
      operationIds: cungNgay.map((o) => o.rec.operationId),
    };
  }

  /**
   * Gọi SAU khi người dùng đã lưu trực tiếp thành công nhật ký ngày đó (nội dung form gồm bản nháp)
   * — xoá các bản nháp offline của ngày để chúng không gửi sau và bị 412/đè. Đây là quyết định rõ
   * của người dùng, không phải dọn âm thầm; op đang gửi ở tab khác vẫn bị precondition chặn.
   */
  async discardDiaryDraft(date: string, operationIds: readonly string[]): Promise<void> {
    const chu = this.vault.chu();
    if (!chu || operationIds.length === 0) return;
    // Chỉ xoá ĐÚNG các bản nháp form đã nạp (người dùng đã thấy, đã gộp vào bản vừa lưu). Bản nháp
    // của ngày mà form chưa từng nạp (vault mở muộn, tab khác vừa thêm) phải giữ để xem lại.
    const ds = await docOpDaGiai(this.store, this.vault, this.cache);
    const chon = new Set(operationIds);
    const ids = ds
      .filter(
        (o) =>
          chon.has(o.rec.operationId) &&
          o.body.kind === "diary_note" &&
          o.body.payload.date === date,
      )
      .map((o) => o.rec.operationId);
    await this.store.xoaTheoYeuCau(khoaChu(chu), ids);
    for (const id of ids) this.cache.delete(id);
    await this.refreshStats().catch(() => undefined);
  }

  /** Danh sách trạng thái thao tác của chủ hiện hành (không payload) — nền cho UI phục hồi S08. */
  async danhSachThaoTac(): Promise<ThaoTacHangDoi[]> {
    const chu = this.vault.chu();
    if (!chu) return [];
    const { ops } = await this.store.docChu(khoaChu(chu));
    const out: ThaoTacHangDoi[] = [];
    const cuaDuAn = ops.filter((o) => cungChu(o, chu)).sort((a, b) => a.sequence - b.sequence);
    for (const r of cuaDuAn) {
      const coKhoa = this.vault.coKhoa(r.vaultKeyId);
      // Ảnh không giải mã ở đây (byte lớn) — chỉ tick/nhật ký để người dùng nhận ra thao tác.
      const body = coKhoa && r.kind !== "photo" ? await giaiMaCo(this.vault, r, this.cache) : null;
      out.push({
        operationId: r.operationId,
        kind: r.kind,
        state: r.state,
        queuedAt: r.queuedAt,
        tries: r.tries,
        nextAttemptAt: r.nextAttemptAt,
        lastResult: r.lastResult,
        moDuoc: coKhoa && (r.kind === "photo" || body !== null),
        ...(body?.kind === "diary_note" ? { ngayNhatKy: body.payload.date } : {}),
        ...(body?.kind === "tick" ? { soO: 1 } : {}),
        ...(body?.kind === "tick_batch" ? { soO: body.payload.dimIds.length } : {}),
      });
    }
    return out;
  }

  /**
   * Số bản ghi queue v1 không chủ trên thiết bị — chỉ đếm, không đọc nội dung (D03). Lỗi đọc →
   * reject (KHÔNG coi là 0 — màn phục hồi báo lỗi thay vì khẳng định không còn dữ liệu cũ).
   */
  demLegacy(): Promise<number> {
    return this.store.demLegacy();
  }

  /**
   * Bỏ MỘT thao tác `conflict`/`rejected` của chủ hiện hành ở dự án hiện hành — chỉ gọi sau khi
   * người dùng xác nhận. Không xoá hàng loạt, không xoá op đang chờ/đang gửi, không đụng legacy
   * hay op của chủ khác. Chủ + dự án + trạng thái kiểm TRONG transaction xoá (op vừa đổi trạng
   * thái ở tab khác không bị xoá nhầm). Trả false khi op không còn/không đủ điều kiện.
   */
  async boThaoTac(operationId: string): Promise<boolean> {
    const chu = this.vault.chu();
    if (!chu) return false;
    const n = await this.store.xoaTheoYeuCau(khoaChu(chu), [operationId], {
      projectId: chu.projectId,
      states: TRANG_THAI_BO_DUOC,
    });
    if (n === 0) return false;
    this.cache.delete(operationId);
    await this.refreshStats();
    return true;
  }

  /** Đọc bản nháp nhật ký đang `conflict` của chính chủ (giải mã trong bộ nhớ) để so sánh. */
  async xemNhatKyXungDot(operationId: string): Promise<NhatKyXungDot | null> {
    const ds = await docOpDaGiai(this.store, this.vault, this.cache);
    const op = ds.find((o) => o.rec.operationId === operationId);
    if (!op || op.rec.state !== "conflict" || op.body.kind !== "diary_note") return null;
    const ngay = op.body.payload.date;
    const coBanMoiHon = ds.some(
      (o) =>
        o.rec.sequence > op.rec.sequence &&
        o.body.kind === "diary_note" &&
        o.body.payload.date === ngay,
    );
    return { operationId, payload: op.body.payload, coBanMoiHon };
  }

  /**
   * A2-FR11 — người dùng chọn "giữ bản trên thiết bị" sau khi đã XEM bản máy chủ (etag `etagMayChu`
   * do GET /api/diaries/:date trả, server đã kiểm quyền). Tạo thao tác MỚI (operationId mới) cùng
   * nội dung, precondition = etag máy chủ vừa xem; CHỈ sau khi op mới đã commit mới bỏ op xung đột
   * cũ. Không tự gộp trường, không dùng giờ máy làm phiên bản. Máy chủ đổi tiếp trong lúc chờ gửi
   * → op mới lại 412 → conflict (không đè).
   */
  async giuBanNhatKyThietBi(
    operationId: string,
    etagMayChu: string | null,
  ): Promise<{ ok: true; canhBao?: string } | { ok: false; error: string }> {
    const loi = (error: string) => ({ ok: false as const, error });
    if (OFFLINE_QUEUE_QUARANTINED || this.tamDungNguCanh) return loi(OFFLINE_SAVE_ERROR);
    const chu = this.vault.chu();
    if (!chu) return loi("Kho ngoại tuyến đang khoá — kết nối mạng rồi mở khoá trước.");
    let xem: NhatKyXungDot | null;
    let keyCu: string | undefined;
    try {
      // Kiểm sớm để báo ngay cho người dùng; kiểm QUYẾT ĐỊNH nằm trong vòng OCC của themOp.
      xem = await this.xemNhatKyXungDot(operationId);
      const { ops } = await this.store.docChu(khoaChu(chu));
      keyCu = ops.find((o) => o.operationId === operationId)?.vaultKeyId;
    } catch {
      return loi("Không đọc được dữ liệu ngoại tuyến trên thiết bị — thử lại.");
    }
    if (!xem) return loi(LOI_KHONG_CON_XUNG_DOT);
    if (xem.coBanMoiHon) return loi(LOI_CO_BAN_MOI_HON);
    const ngay = xem.payload.date;
    const keyId =
      this.vault.timKhoa("diary_note", { date: ngay }) ??
      (keyCu && this.vault.coKhoa(keyCu) ? keyCu : null);
    if (!keyId) return loi(OFFLINE_SAVE_ERROR);
    try {
      await themOp({
        store: this.store,
        vault: this.vault,
        keyId,
        body: { kind: "diary_note", payload: xem.payload, baseVersion: etagMayChu },
        now: Date.now,
        uuid: taoId,
        cache: this.cache,
        // Luồng này chỉ THÊM bản người dùng chọn giữ; không âm thầm thay bản nháp nào khác.
        thayOpCu: false,
        // Kiểm trên ĐÚNG snapshot sẽ commit: op cũ còn conflict và chưa có bản nháp mới hơn cùng
        // ngày (tab khác vừa xếp) — có thì bản mới thắng, không ghi gì.
        dieuKien: (banChup) => {
          const cu = banChup.find((o) => o.rec.operationId === operationId);
          if (!cu || cu.rec.state !== "conflict") return LOI_KHONG_CON_XUNG_DOT;
          const coBanMoiHon = banChup.some(
            (o) =>
              o.rec.sequence > cu.rec.sequence &&
              o.body?.kind === "diary_note" &&
              o.body.payload.date === ngay,
          );
          return coBanMoiHon ? LOI_CO_BAN_MOI_HON : null;
        },
      });
    } catch (e) {
      // Op mới CHƯA lưu → giữ nguyên op xung đột cũ, người dùng thử lại được.
      await this.refreshStats();
      return loi(e instanceof LoiDieuKienThem ? e.message : OFFLINE_SAVE_ERROR);
    }
    // Op mới đã commit: bỏ op xung đột cũ (chỉ khi vẫn còn conflict). Lỗi ở bước này không mất gì
    // — op cũ (conflict) vẫn chặn FIFO cùng ngày trước op mới — nhưng phải báo người dùng bỏ tay.
    let canhBao: string | undefined;
    try {
      await this.store.xoaTheoYeuCau(khoaChu(chu), [operationId], {
        projectId: chu.projectId,
        states: ["conflict"],
      });
      this.cache.delete(operationId);
    } catch {
      canhBao =
        'Đã xếp bản trên thiết bị để gửi, nhưng chưa bỏ được bản xung đột cũ — bản cũ vẫn chặn trước bản mới. Hãy bấm "Bỏ thao tác này" ở bản cũ.';
    }
    await this.refreshStats();
    this.afterEnqueue();
    return canhBao ? { ok: true, canhBao } : { ok: true };
  }

  // ── Khôi phục khi mất proof (M131 §3) ─────────────────────────────────────────────────

  /**
   * Thiết bị CŨ (proof đã mất) còn thao tác của chính chủ trên trình duyệt này — mỗi thiết bị kèm
   * số thao tác. Cần vault đang mở (biết thiết bị hiện tại); khoá → rỗng. Không giải mã gì.
   */
  async thietBiCuConThaoTac(): Promise<{ deviceId: string; soThaoTac: number }[]> {
    const chu = this.vault.chu();
    if (!chu) return [];
    const dem = new Map<string, number>();
    for (const r of await this.store.docOpThietBiKhac(chu))
      dem.set(r.deviceId, (dem.get(r.deviceId) ?? 0) + 1);
    return [...dem].map(([deviceId, soThaoTac]) => ({ deviceId, soThaoTac }));
  }

  /**
   * Gắn lại thao tác của thiết bị cũ sang thiết bị hiện tại sau khi máy chủ hoàn tất khôi phục.
   * `mapping` (từ POST /api/offline/recovery/:id/complete — chỉ id + version cũ) được lưu kèm hàng
   * đợi; mỗi lần gọi chỉ gắn được op của DỰ ÁN ĐANG MỞ (vault chỉ nạp khoá dự án hiện hành) — op dự
   * án khác ở lại chờ lần gọi sau (không mapping) khi người dùng mở đúng dự án. `conLai` = op thiết
   * bị cũ còn trong bản đồ nhưng chưa gắn được.
   */
  async ganLaiTheoKhoiPhuc(mapping?: MucKhoiPhuc[]): Promise<{ daGan: number; conLai: number }> {
    if (OFFLINE_QUEUE_QUARANTINED || this.tamDungNguCanh) return { daGan: 0, conLai: 0 };
    if (!(await this.damBaoVault())) return { daGan: 0, conLai: 0 };
    let chu = this.vault.chu();
    if (!chu) return { daGan: 0, conLai: 0 };
    if (mapping?.length) {
      const cu = await this.store.docBanDoKhoiPhuc(chu);
      const moi = new Map(cu.map((m) => [m.oldKeyId, m]));
      for (const m of mapping) moi.set(m.oldKeyId, m);
      await this.store.luuBanDoKhoiPhuc(chu, [...moi.values()]);
    }
    const banDo = new Map((await this.store.docBanDoKhoiPhuc(chu)).map((m) => [m.oldKeyId, m]));
    if (banDo.size === 0) return { daGan: 0, conLai: 0 };
    const docCanGan = async () =>
      (await this.store.docOpThietBiKhac(chu!)).filter((r) => banDo.has(r.vaultKeyId));
    const canGan = (await docCanGan()).filter((r) => r.projectId === chu!.projectId);
    // Vừa hoàn tất (có `mapping`) mà khoá bọc lại chưa nạp (vault mở trước khi hoàn tất) → mở lại
    // vault MỘT lần để unlock trả khoá mới. Lời gọi thụ động (không mapping) không mở lại: vault mở
    // sau khi hoàn tất đã có khoá mới; khoá vẫn thiếu = bị khoá (mất quyền) — mở lại chỉ lặp vô ích.
    if (
      mapping?.length &&
      canGan.some((r) => !this.vault.coKhoa(banDo.get(r.vaultKeyId)!.newKeyId))
    ) {
      this.vault.khoa();
      if (!(await this.damBaoVault())) return { daGan: 0, conLai: canGan.length };
      const lai = this.vault.chu();
      if (!lai || lai.ownerUserId !== chu.ownerUserId || lai.orgId !== chu.orgId)
        return { daGan: 0, conLai: canGan.length };
      chu = lai;
    }
    const doi: { cu: QueueRecord; moi: QueueRecord }[] = [];
    for (const r of canGan) {
      const m = banDo.get(r.vaultKeyId)!;
      const moi = await this.vault.maHoaLaiTuThietBiCu(r, m.newKeyId, m.oldKeyVersion);
      if (moi) doi.push({ cu: r, moi });
    }
    const daGan = await this.store.ganLaiThietBi(doi);
    for (const { cu } of doi) this.cache.delete(cu.operationId);
    // Dọn bản đồ: chỉ giữ mục còn op thiết bị cũ tham chiếu.
    const conLaiDs = await docCanGan();
    const conDung = new Set(conLaiDs.map((r) => r.vaultKeyId));
    await this.store.luuBanDoKhoiPhuc(
      chu,
      [...banDo.values()].filter((m) => conDung.has(m.oldKeyId)),
    );
    await this.refreshStats();
    if (daGan > 0) this.kichFlush();
    return { daGan, conLai: conLaiDs.length };
  }

  /**
   * "Gửi lại ngay": bỏ chờ backoff (giữ Retry-After của 429/503) rồi kích gửi. false = không gửi
   * được lúc này (mất mạng / kho khoá); lỗi đọc-ghi thiết bị → reject để UI báo lỗi thật.
   */
  async guiLaiNgay(): Promise<boolean> {
    const chu = this.vault.chu();
    if (!chu || !this.dangOnline()) return false;
    await this.store.datLaiHanGui(chu, Date.now());
    await this.flush();
    return true;
  }

  /**
   * "Mở khoá" từ màn phục hồi (cần mạng): xác minh lại online (auth/me → context → unlock). Tab đã
   * nhận tín hiệu đổi ngữ cảnh thì không mở — phải tải lại trang theo ngữ cảnh mới.
   */
  async moKhoa(): Promise<boolean> {
    if (OFFLINE_QUEUE_QUARANTINED || this.tamDungNguCanh || !this.dangOnline()) return false;
    const ok = await this.damBaoVault();
    await this.refreshStats().catch(() => undefined);
    if (ok) this.kichFlush();
    return ok;
  }

  /** Không bao giờ xoá hàng loạt (legacy lẫn vault): chỉ xoá theo quyết định rõ từng thao tác. */
  async clear(): Promise<void> {}
}

/** Gửi thông điệp cho SW đang điều khiển trang (không có SW → bỏ qua: SW không cache gì). */
function guiChoSw(m: ThongDiepSw): void {
  try {
    if (typeof navigator === "undefined") return;
    navigator.serviceWorker?.controller?.postMessage(m);
  } catch {
    /* SW không nhận — SW tự fail-closed (không có ngữ cảnh → không phục vụ cache) */
  }
}

export const offlineQueue = new OfflineQueueManager();

/** Đăng xuất (trang tài khoản): khoá vault + xoá bản giải mã trong bộ nhớ, GIỮ ciphertext (D03). */
export function khoaNgoaiTuyenKhiDangXuat(): void {
  offlineQueue.khoaPhien(true);
}

// ── API công khai ────────────────────────────────────────────────────────────────────────
export function enqueuePhoto(input: { taskId: number; blob: Blob; caption?: string }) {
  return offlineQueue.enqueuePhoto(input);
}
export function enqueueDiaryNote(input: DiaryNotePayload, etag: string | null) {
  return offlineQueue.enqueueDiaryNote(input, etag);
}
export function getQueuedDiaryNote(date: string) {
  return offlineQueue.getQueuedDiaryNote(date);
}
export function discardDiaryDraft(date: string, operationIds: readonly string[]) {
  return offlineQueue.discardDiaryDraft(date, operationIds);
}
export type { MucKhoiPhuc };
export function chuanBiOfflineNhatKy(date: string) {
  return offlineQueue.chuanBiNhatKy(date);
}

/** Tương thích chữ ký cũ: logout/401 KHÔNG xoá bản nháp (D03) — vault khoá theo bộ nhớ tab. */
export function clearOfflineQueue(): Promise<void> {
  return Promise.resolve();
}

// Hook tick cho trang tracking — giữ chữ ký { pending, online, enqueue, enqueueBatch } + `ready`.
export function useOfflineTickQueue(onFlushed?: () => void) {
  const snap = useSyncExternalStore(
    offlineQueue.subscribe,
    offlineQueue.getSnapshot,
    offlineQueue.getSnapshot,
  );
  useEffect(() => {
    offlineQueue.start();
  }, []);
  useEffect(() => {
    if (!onFlushed) return;
    return offlineQueue.onFlushed(onFlushed);
  }, [onFlushed]);
  const enqueue = useCallback((dimId: number, installed: boolean) => {
    return offlineQueue.enqueueTick(dimId, installed);
  }, []);
  const enqueueBatch = useCallback((dimIds: number[], installed: boolean) => {
    return offlineQueue.enqueueTickBatch(dimIds, installed);
  }, []);
  return {
    pending: snap.total,
    online: snap.online,
    ready: !OFFLINE_QUEUE_QUARANTINED && snap.vault === "active",
    enqueue,
    enqueueBatch,
  };
}

// Hook trạng thái hàng đợi cho badge AppHeader (mọi trang).
export function useOfflineQueueStatus(): QueueSnapshot {
  const snap = useSyncExternalStore(
    offlineQueue.subscribe,
    offlineQueue.getSnapshot,
    offlineQueue.getSnapshot,
  );
  useEffect(() => {
    offlineQueue.start();
  }, []);
  return snap;
}
