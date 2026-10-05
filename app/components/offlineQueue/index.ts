"use client";
// Khung hàng đợi offline tổng quát (M58 PR2) — lưu thao tác mất mạng trong IndexedDB,
// tự gửi lại khi có mạng. Tổng quát hoá từ khung tick cũ (localStorage) sang 3 loại
// `tick` | `photo` | `diary_note`. Queue v1 thiếu owner/vault nên đang quarantine: không
// đọc, ghi, gửi, chuyển owner hay xóa. Chỉ mở lại sau S07 ownership/vault cutover. Logic
// thuần được giữ trong logic.ts để regression tests tiếp tục bảo vệ hành vi khi được bật lại.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { IdbQueueStore } from "./store";
import { compressImage } from "./image";
import { showToast } from "@/app/components/Toast";
import {
  computeStats,
  flushQueue,
  opEndpoint,
  tickDedupeIds,
  tickBatchDedupeIds,
  diaryDedupeIds,
  wouldExceedPhotoQuota,
  PHOTO_QUOTA_BYTES,
  type DiaryNotePayload,
  type QueuedOp,
  type QueueStats,
  type SendOutcome,
} from "./logic";

const SYNC_TAG = "xboss-flush";
export const OFFLINE_QUEUE_QUARANTINED = true;
export const OFFLINE_QUEUE_QUARANTINE_ERROR =
  "Lưu ngoại tuyến đang tạm khóa để bảo toàn dữ liệu cũ chưa xác định được chủ sở hữu. Kết nối mạng để lưu lên máy chủ.";

// Dựng request gửi theo loại thao tác. Trả outcome {status} hoặc {networkError} để
// logic.shouldRetry quyết định giữ/bỏ. `diary_note` gửi trọn body PUT /api/diaries/:date
// (full-replace) trừ `date` đã ở URL.
async function sendOp(op: QueuedOp): Promise<SendOutcome> {
  const { url, method } = opEndpoint(op);
  try {
    let res: Response;
    if (op.kind === "photo") {
      const fd = new FormData();
      fd.append("file", op.payload.blob, `offline-${op.payload.taskId}.jpg`);
      if (op.payload.caption) fd.append("caption", op.payload.caption);
      res = await fetch(url, { method, body: fd });
    } else if (op.kind === "tick") {
      res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installed: op.payload.installed }),
      });
    } else if (op.kind === "tick_batch") {
      res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: op.payload.dimIds, installed: op.payload.installed }),
      });
    } else {
      // Nhật ký: gửi TOÀN BỘ payload trừ `date` (đã nằm trên URL) — PUT full-replace.
      const { date: _d, ...body } = op.payload;
      void _d;
      res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    // Đọc kèm lý do khi server TỪ CHỐI (4xx) để báo lại cho người dùng (M121 FR8) — không
    // đọc body ở ca thành công/5xx: 2xx không có gì để nói, 5xx sẽ được thử lại.
    if (res.status >= 400 && res.status < 500) {
      const error = (await res.json().catch(() => null))?.error;
      return { status: res.status, error: typeof error === "string" ? error : undefined };
    }
    return { status: res.status };
  } catch {
    return { networkError: true };
  }
}

// Đăng ký Background Sync (feature-detect) để trình duyệt đánh thức gửi lại kể cả khi
// tab đóng — SW nhận `sync` rồi postMessage cho client flush (xem public/sw.js).
// iOS Safari không hỗ trợ → bỏ qua êm, đã có listener `online` + interval làm nền.
async function requestBackgroundSync(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync;
    if (sync) await sync.register(SYNC_TAG);
  } catch {
    /* không hỗ trợ / bị chặn — không sao, cơ chế online + interval vẫn chạy */
  }
}

export type QueueSnapshot = QueueStats & {
  online: boolean;
  sending: boolean;
  quarantined: boolean;
};

// Quản lý hàng đợi dạng singleton — 1 vòng flush duy nhất cho toàn app (badge AppHeader
// và hook tracking cùng subscribe), tránh nhiều vòng gửi song song.
class OfflineQueueManager {
  private store = new IdbQueueStore();
  private snap: QueueSnapshot = {
    total: 0,
    pending: 0,
    failed: 0,
    online: true,
    sending: false,
    quarantined: OFFLINE_QUEUE_QUARANTINED,
  };
  private listeners = new Set<() => void>();
  private flushedListeners = new Set<() => void>();
  private started = false;
  private flushing = false;
  private hadItems = false;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): QueueSnapshot => this.snap;

  // Đăng ký callback chạy khi hàng đợi vừa được gửi hết (tracking dùng để reload dữ liệu).
  onFlushed(fn: () => void): () => void {
    this.flushedListeners.add(fn);
    return () => {
      this.flushedListeners.delete(fn);
    };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private setSnap(patch: Partial<QueueSnapshot>) {
    const next = { ...this.snap, ...patch };
    if (
      next.total === this.snap.total &&
      next.pending === this.snap.pending &&
      next.failed === this.snap.failed &&
      next.online === this.snap.online &&
      next.sending === this.snap.sending &&
      next.quarantined === this.snap.quarantined
    )
      return; // không đổi → giữ nguyên tham chiếu để useSyncExternalStore không render thừa
    this.snap = next;
    this.emit();
  }

  private async refreshStats(extra: Partial<QueueSnapshot> = {}) {
    const ops = await this.store.getAll();
    this.setSnap({ ...computeStats(ops), ...extra });
  }

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.setSnap({ online: navigator.onLine, quarantined: OFFLINE_QUEUE_QUARANTINED });

    window.addEventListener("online", () => {
      this.setSnap({ online: true });
    });
    window.addEventListener("offline", () => this.setSnap({ online: false }));
  }

  async flush() {
    // Queue v1 không có ownership/vault context. Không đọc hay gửi nó theo session cookie
    // hiện tại; Background Sync và online events cũng đi qua cùng cổng này.
    if (OFFLINE_QUEUE_QUARANTINED) return;
    if (this.flushing || typeof navigator === "undefined" || !navigator.onLine) return;
    // Giữ khóa trước await đầu tiên, kể cả lúc đọc storage và cập nhật thống kê.
    // Chỉ bảo vệ trong tab hiện tại; không thay lease nhiều tab hoặc receipt server.
    this.flushing = true;
    try {
      const before = await this.store.getAll();
      if (!before.length) return;
      this.hadItems = true;
      this.setSnap({ sending: true });
      try {
        const { tuChoi } = await flushQueue(this.store, sendOp);
        // Giữ nguyên thông báo từ chối; chưa đổi state machine retry trong slice này.
        if (tuChoi.length) {
          const soO = tuChoi.reduce((s, t) => s + t.soO, 0);
          const lyDo = tuChoi.find((t) => t.lyDo)?.lyDo;
          showToast(`${soO} thao tác ngoại tuyến bị từ chối${lyDo ? `: ${lyDo}` : ""}`, "error");
        }
      } finally {
        await this.refreshStats({ sending: false });
        if (this.snap.total === 0 && this.hadItems) {
          this.hadItems = false;
          for (const l of this.flushedListeners) l();
        }
      }
    } finally {
      // Read/flush/refresh lỗi cũng không được kẹt cờ khóa hoặc badge "đang gửi".
      this.flushing = false;
      this.setSnap({ sending: false });
    }
  }

  // Xếp tick theo LÔ (M121) — cả vùng chọn / cả hàng đi trong 1 op, khi có mạng lại gửi
  // đúng 1 request `PATCH /api/dimensions/batch` thay vì N request.
  async enqueueTickBatch(dimIds: number[], installed: boolean): Promise<boolean> {
    if (OFFLINE_QUEUE_QUARANTINED) return false;
    if (!dimIds.length) return true;
    const ops = await this.store.getAll();
    for (const id of tickBatchDedupeIds(ops, dimIds)) await this.store.remove(id);
    await this.store.add({
      kind: "tick_batch",
      payload: { dimIds, installed },
      queuedAt: Date.now(),
      tries: 0,
    });
    await this.refreshStats();
    this.afterEnqueue();
    return true;
  }

  // Xếp tick — mỗi dimension chỉ giữ thao tác mới nhất (dedup, hành vi cũ giữ nguyên).
  async enqueueTick(dimId: number, installed: boolean): Promise<boolean> {
    if (OFFLINE_QUEUE_QUARANTINED) return false;
    const ops = await this.store.getAll();
    for (const id of tickDedupeIds(ops, dimId)) await this.store.remove(id);
    await this.store.add({
      kind: "tick",
      payload: { dimId, installed },
      queuedAt: Date.now(),
      tries: 0,
    });
    await this.refreshStats();
    this.afterEnqueue();
    return true;
  }

  // Xếp ảnh (PR3 nối UI): nén client trước, chặn nếu vượt hạn mức 50MB.
  async enqueuePhoto(input: {
    taskId: number;
    blob: Blob;
    caption?: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    if (OFFLINE_QUEUE_QUARANTINED) {
      return { ok: false, error: OFFLINE_QUEUE_QUARANTINE_ERROR };
    }
    const { blob, mime } = await compressImage(input.blob);
    const ops = await this.store.getAll();
    if (wouldExceedPhotoQuota(ops, blob.size)) {
      return {
        ok: false,
        error: `Hàng đợi ảnh offline đã đầy (tối đa ${PHOTO_QUOTA_BYTES / 1024 / 1024}MB). Hãy kết nối mạng để gửi bớt ảnh đang chờ rồi thử lại.`,
      };
    }
    await this.store.add({
      kind: "photo",
      payload: { taskId: input.taskId, caption: input.caption ?? "", blob, size: blob.size, mime },
      queuedAt: Date.now(),
      tries: 0,
    });
    await this.refreshStats();
    this.afterEnqueue();
    return { ok: true };
  }

  // Xếp nhật ký ngày — full-replace, mỗi ngày chỉ giữ bản mới nhất (dedup theo date).
  async enqueueDiaryNote(
    input: DiaryNotePayload,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (OFFLINE_QUEUE_QUARANTINED) {
      return { ok: false, error: OFFLINE_QUEUE_QUARANTINE_ERROR };
    }
    const ops = await this.store.getAll();
    for (const id of diaryDedupeIds(ops, input.date)) await this.store.remove(id);
    await this.store.add({
      kind: "diary_note",
      payload: input,
      queuedAt: Date.now(),
      tries: 0,
    });
    await this.refreshStats();
    this.afterEnqueue();
    return { ok: true };
  }

  // Ảnh đang chờ gửi của 1 task (PhotosModal hiện badge "Chờ gửi").
  async getQueuedPhotos(
    taskId: number,
  ): Promise<{ id: number; caption: string; size: number; queuedAt: number; tries: number }[]> {
    if (OFFLINE_QUEUE_QUARANTINED) return [];
    const ops = await this.store.getAll();
    return ops
      .filter((o) => o.kind === "photo" && o.payload.taskId === taskId)
      .map((o) => {
        const p = o as Extract<QueuedOp, { kind: "photo" }>;
        return {
          id: p.id,
          caption: p.payload.caption,
          size: p.payload.size,
          queuedAt: p.queuedAt,
          tries: p.tries,
        };
      });
  }

  // Blob ảnh đang chờ của 1 task (để preview trong PhotosModal).
  async getQueuedPhotoBlob(id: number): Promise<Blob | undefined> {
    if (OFFLINE_QUEUE_QUARANTINED) return undefined;
    const ops = await this.store.getAll();
    const op = ops.find((o) => o.id === id && o.kind === "photo");
    return op && op.kind === "photo" ? op.payload.blob : undefined;
  }

  // Bản nhật ký offline đang chờ của 1 ngày (nạp lại vào form khi mở modal).
  async getQueuedDiaryNote(date: string): Promise<QueuedOp | undefined> {
    if (OFFLINE_QUEUE_QUARANTINED) return undefined;
    const ops = await this.store.getAll();
    return ops.find((o) => o.kind === "diary_note" && o.payload.date === date);
  }

  // Xoá mọi nháp nhật ký offline của 1 ngày khỏi hàng đợi. Gọi khi đã lưu THÀNH CÔNG
  // trực tiếp qua PUT (có mạng) để nháp cũ không tự flush sau đó và đè (full-replace)
  // lên bản vừa lưu — chống mất dữ liệu âm thầm. Vô hại nếu không có nháp nào.
  async discardDiaryDraft(date: string): Promise<void> {
    if (OFFLINE_QUEUE_QUARANTINED) return;
    const ops = await this.store.getAll();
    const ids = diaryDedupeIds(ops, date);
    if (!ids.length) return;
    for (const id of ids) await this.store.remove(id);
    await this.refreshStats();
  }

  private afterEnqueue() {
    if (typeof navigator !== "undefined" && navigator.onLine) this.flush();
    else void requestBackgroundSync();
  }

  // Giữ lại queue v1 unknown-owner. S07 mới được thực hiện clear sau cutover an toàn.
  async clear(): Promise<void> {
    // Chỉ S07 sau ownership/vault cutover mới được chuyển hoặc xóa hàng đợi cách ly.
  }
}

export const offlineQueue = new OfflineQueueManager();

// ── API enqueue công khai (PR3 nối vào) ──────────────────────────────────────────
export function enqueuePhoto(input: { taskId: number; blob: Blob; caption?: string }) {
  return offlineQueue.enqueuePhoto(input);
}
export function enqueueDiaryNote(input: DiaryNotePayload) {
  return offlineQueue.enqueueDiaryNote(input);
}
export function getQueuedDiaryNote(date: string) {
  return offlineQueue.getQueuedDiaryNote(date);
}
export function discardDiaryDraft(date: string) {
  return offlineQueue.discardDiaryDraft(date);
}

/** Tương thích chữ ký cũ; queue unknown-owner được giữ nguyên qua login, logout và 401. */
export function clearOfflineQueue(): Promise<void> {
  return Promise.resolve();
}

// Hook tick cho trang tracking — GIỮ NGUYÊN chữ ký cũ { pending, online, enqueue }.
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
  // Xếp cả lô (M121) — 1 op cho cả vùng chọn/cả hàng, thay vì N op tick đơn lẻ.
  const enqueueBatch = useCallback((dimIds: number[], installed: boolean) => {
    return offlineQueue.enqueueTickBatch(dimIds, installed);
  }, []);
  return { pending: snap.total, online: snap.online, enqueue, enqueueBatch };
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
