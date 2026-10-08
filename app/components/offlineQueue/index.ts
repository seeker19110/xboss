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
import { IdbTxDb, LoiHanMucAnh, QueueDb } from "./store";
import { compressImage } from "./image";
import { VaultSession, type VaultTrangThai } from "./vault";
import { showToast } from "@/app/components/Toast";
import { ngheDoiNguCanh } from "@/app/lib/contextEpoch";
import {
  computeStats,
  docOpDaGiai,
  flushQueue,
  FLUSH_INTERVAL_MS,
  khoaChu,
  themOp,
  THONG_KE_RONG,
  type BoNhoGiaiMa,
  type DiaryNotePayload,
  type OpBody,
  type QueueKind,
  type QueueState,
  type QueueStats,
  type SendOutcome,
  type YeuCauGui,
} from "./logic";

const SYNC_TAG = "xboss-flush";
export const OFFLINE_QUEUE_QUARANTINED = false;
/** Thông điệp khi KHÔNG lưu được trên thiết bị — form/ô giữ nguyên để người dùng xử lý. */
export const OFFLINE_SAVE_ERROR = "Chưa lưu được trên thiết bị. Hãy kết nối mạng rồi thử lại.";
/** Trần số task mỗi khoá vault (khớp MAX_MANIFEST_TASKS phía server). */
const TASK_MOI_KHOA = 500;

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
};

type ManagerDeps = {
  store?: QueueDb;
  vault?: VaultSession;
  send?: (req: YeuCauGui) => Promise<SendOutcome>;
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

  constructor(deps: ManagerDeps = {}) {
    this.storeLazy = deps.store ?? null;
    this.vault = deps.vault ?? new VaultSession();
    this.send = deps.send ?? guiYeuCau;
    this.vault.onDoi(() => this.setSnap({ vault: this.vault.trangThai }));
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

  private async refreshStats(extra: Partial<QueueSnapshot> = {}) {
    const chu = this.vault.chu();
    if (!chu) {
      // Vault khoá (hết lease/401/đổi ngữ cảnh) nhưng op vẫn nằm trên thiết bị: báo `locked` để
      // badge/banner không hiện "0 chờ" (người dùng tưởng đã đồng bộ xong) và poll vẫn kích mở lại.
      const n =
        this.userCuoi === null ? 0 : await this.store.demOpCuaUser(this.userCuoi).catch(() => 0);
      this.setSnap({ ...THONG_KE_RONG, total: n, locked: n, ...extra });
      return;
    }
    this.userCuoi = chu.ownerUserId;
    const { ops } = await this.store.docChu(khoaChu(chu));
    this.setSnap({ ...computeStats(ops, chu, (k) => this.vault.coKhoa(k)), ...extra });
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
    ngheDoiNguCanh(() => {
      this.tamDungNguCanh = true;
      this.cache.clear();
      this.vault.khoa();
      void this.refreshStats();
    });
    // Poll foreground: không phụ thuộc Background Sync/Web Locks (D02, A2-FR12).
    setInterval(() => {
      if (this.snap.total > 0) this.kichFlush();
    }, FLUSH_INTERVAL_MS);
    void this.khoiDong();
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
    return ops
      .filter((r) => r.projectId === chu.projectId)
      .sort((a, b) => a.sequence - b.sequence)
      .map((r) => ({
        operationId: r.operationId,
        kind: r.kind,
        state: r.state,
        queuedAt: r.queuedAt,
        tries: r.tries,
        nextAttemptAt: r.nextAttemptAt,
        lastResult: r.lastResult,
      }));
  }

  /** Không bao giờ xoá hàng loạt (legacy lẫn vault): chỉ xoá theo quyết định rõ từng thao tác. */
  async clear(): Promise<void> {}
}

export const offlineQueue = new OfflineQueueManager();

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
