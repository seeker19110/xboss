"use client";
// Khung hàng đợi offline tổng quát (M58 PR2) — lưu thao tác mất mạng trong IndexedDB,
// tự gửi lại khi có mạng. Tổng quát hoá từ khung tick cũ (localStorage) sang 3 loại
// `tick` | `photo` | `diary_note`, GIỮ NGUYÊN hành vi tick (dedup mỗi dimension, 4xx bỏ,
// clearOfflineQueue khi logout). Logic thuần tách ở logic.ts, truy cập IndexedDB ở store.ts.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { IdbQueueStore, migrateFromLocalStorage, OLD_LS_KEY } from "./store";
import { compressImage } from "./image";
import {
  computeStats,
  flushQueue,
  opEndpoint,
  tickDedupeIds,
  wouldExceedPhotoQuota,
  FLUSH_INTERVAL_MS,
  PHOTO_QUOTA_BYTES,
  type QueuedOp,
  type QueueStats,
  type SendOutcome,
} from "./logic";

const SYNC_TAG = "xboss-flush";

// Dựng request gửi theo loại thao tác. Trả outcome {status} hoặc {networkError} để
// logic.shouldRetry quyết định giữ/bỏ. Endpoint `tick`/`photo` là thật; `diary_note`
// gửi tạm workDone qua PUT /api/diaries/:date — PR3 sẽ chốt lại đường ghi nhật ký.
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
    } else {
      res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workDone: op.payload.text }),
      });
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

export type QueueSnapshot = QueueStats & { online: boolean; sending: boolean };

// Quản lý hàng đợi dạng singleton — 1 vòng flush duy nhất cho toàn app (badge AppHeader
// và hook tracking cùng subscribe), tránh nhiều vòng gửi song song.
class OfflineQueueManager {
  private store = new IdbQueueStore();
  private snap: QueueSnapshot = { total: 0, pending: 0, failed: 0, online: true, sending: false };
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
      next.sending === this.snap.sending
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
    this.setSnap({ online: navigator.onLine });

    window.addEventListener("online", () => {
      this.setSnap({ online: true });
      this.flush();
    });
    window.addEventListener("offline", () => this.setSnap({ online: false }));
    // Một số WebView không bắn sự kiện 'online' — thử gửi định kỳ khi còn mạng.
    setInterval(() => {
      if (navigator.onLine) this.flush();
    }, FLUSH_INTERVAL_MS);
    // SW đánh thức (Background Sync) → flush.
    navigator.serviceWorker?.addEventListener?.("message", (e) => {
      if ((e as MessageEvent).data?.type === "FLUSH_QUEUE") this.flush();
    });
    // Cảnh báo đóng tab khi còn thao tác chưa gửi (tránh mất dữ liệu công trường).
    window.addEventListener("beforeunload", (e) => {
      if (this.snap.total > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    // Đợi di trú dữ liệu cũ từ localStorage xong rồi mới flush lần đầu, tránh bỏ lỡ
    // tick vừa di trú vào IndexedDB.
    migrateFromLocalStorage(this.store)
      .then(() => this.refreshStats())
      .catch(() => {})
      .finally(() => this.flush());
  }

  async flush() {
    if (this.flushing || typeof navigator === "undefined" || !navigator.onLine) return;
    const before = await this.store.getAll();
    if (!before.length) return;
    this.flushing = true;
    this.hadItems = true;
    this.setSnap({ sending: true });
    try {
      await flushQueue(this.store, sendOp);
    } finally {
      this.flushing = false;
      await this.refreshStats({ sending: false });
      if (this.snap.total === 0 && this.hadItems) {
        this.hadItems = false;
        for (const l of this.flushedListeners) l();
      }
    }
  }

  // Xếp tick — mỗi dimension chỉ giữ thao tác mới nhất (dedup, hành vi cũ giữ nguyên).
  async enqueueTick(dimId: number, installed: boolean): Promise<void> {
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
  }

  // Xếp ảnh (PR3 nối UI): nén client trước, chặn nếu vượt hạn mức 50MB.
  async enqueuePhoto(input: {
    taskId: number;
    blob: Blob;
    caption?: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
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

  // Xếp ghi chú nhật ký text (PR3 nối UI).
  async enqueueDiaryNote(input: {
    date: string;
    text: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    await this.store.add({
      kind: "diary_note",
      payload: { date: input.date, text: input.text },
      queuedAt: Date.now(),
      tries: 0,
    });
    await this.refreshStats();
    this.afterEnqueue();
    return { ok: true };
  }

  private afterEnqueue() {
    if (typeof navigator !== "undefined" && navigator.onLine) this.flush();
    else void requestBackgroundSync();
  }

  // Xoá sạch hàng đợi (logout) — cả IndexedDB lẫn key localStorage cũ còn sót.
  async clear(): Promise<void> {
    try {
      localStorage.removeItem(OLD_LS_KEY);
    } catch {
      /* localStorage bị chặn */
    }
    await this.store.clear();
    this.hadItems = false;
    this.setSnap({ total: 0, pending: 0, failed: 0 });
  }
}

export const offlineQueue = new OfflineQueueManager();

// ── API enqueue công khai (PR3 nối vào) ──────────────────────────────────────────
export function enqueuePhoto(input: { taskId: number; blob: Blob; caption?: string }) {
  return offlineQueue.enqueuePhoto(input);
}
export function enqueueDiaryNote(input: { date: string; text: string }) {
  return offlineQueue.enqueueDiaryNote(input);
}

/** Xoá hàng đợi offline (IndexedDB + localStorage cũ) — gọi khi đăng xuất/hết phiên để
 * thao tác dở dang của người trước không bị gửi "chui" dưới tên người đăng nhập sau trên
 * thiết bị dùng chung. Bất biến bảo mật — phủ CẢ IndexedDB mới lẫn key localStorage cũ. */
export function clearOfflineQueue(): Promise<void> {
  // Xoá key localStorage cũ ngay (đồng bộ) để chắc chắn sạch kể cả khi IndexedDB lỗi.
  try {
    localStorage.removeItem(OLD_LS_KEY);
  } catch {
    /* localStorage bị chặn */
  }
  return offlineQueue.clear().catch(() => {});
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
    void offlineQueue.enqueueTick(dimId, installed);
  }, []);
  return { pending: snap.total, online: snap.online, enqueue };
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
