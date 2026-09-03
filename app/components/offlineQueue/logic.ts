// Logic THUẦN của hàng đợi offline — KHÔNG phụ thuộc IndexedDB/DOM để unit-test được
// (mock `QueueStore` + `SendFn`). Mọi quyết định nghiệp vụ (dedup tick, backoff theo
// `tries`, phân loại 4xx bỏ / 5xx-mạng giữ, hạn mức ảnh) nằm ở đây; lớp truy cập
// IndexedDB (store.ts) và lớp React (index.ts) chỉ nối dây.

// 3 loại thao tác offline đợt M58 PR2. `tick` di trú nguyên hành vi từ khung cũ;
// `photo`/`diary_note` để PR3 nối UI thật vào (API enqueue phải ổn định từ giờ).
export type QueueKind = "tick" | "photo" | "diary_note" | "tick_batch";

export type TickPayload = { dimId: number; installed: boolean };
// Tick theo lô (M121): cả vùng chọn / cả hàng đi trong MỘT op, gửi lên
// `PATCH /api/dimensions/batch`. Không tách thành N op `tick` vì như vậy khi có mạng lại sẽ
// bắn N request — đúng cái M121 đang bỏ đi — và mất tính nguyên tử của lô.
export type TickBatchPayload = { dimIds: number[]; installed: boolean };
export type PhotoPayload = {
  taskId: number;
  caption: string;
  blob: Blob;
  size: number; // = blob.size — tách ra để tính hạn mức không cần chạm Blob (test node)
  mime: string;
};
// Nhật ký ngày (M58 PR3): PUT /api/diaries/:date là FULL-REPLACE — payload phải là
// TOÀN BỘ body PUT (thiếu trường nào ghi NULL). Chứa đủ thời tiết/nhân lực/ảnh để không
// xoá sạch dữ liệu đã có của ngày khi gửi lại.
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

// Discriminated union theo `kind` — payload gắn đúng kiểu, tránh `any`.
type OpBody =
  | { kind: "tick"; payload: TickPayload }
  | { kind: "tick_batch"; payload: TickBatchPayload }
  | { kind: "photo"; payload: PhotoPayload }
  | { kind: "diary_note"; payload: DiaryNotePayload };

// Bản ghi đã nằm trong hàng đợi (có `id` do store cấp).
export type QueuedOp = OpBody & {
  id: number;
  queuedAt: number;
  tries: number; // số lần đã thử gửi và thất bại (giữ lại), 0 = chưa thử
  lastTriedAt?: number; // mốc thử gần nhất — dùng cho backoff
};
// Bản ghi trước khi thêm vào store (chưa có `id`).
export type QueuedOpInput = OpBody & {
  queuedAt: number;
  tries: number;
  lastTriedAt?: number;
};

// Lớp truy cập hàng đợi — interface để mock trong unit test (MemoryQueueStore) hoặc
// hiện thực bằng IndexedDB (store.ts). `getAll()` luôn trả theo thứ tự FIFO (id tăng dần).
export interface QueueStore {
  getAll(): Promise<QueuedOp[]>;
  add(op: QueuedOpInput): Promise<number>;
  update(op: QueuedOp): Promise<void>;
  remove(id: number): Promise<void>;
  clear(): Promise<void>;
}

// Tổng dung lượng ảnh chờ tối đa trong hàng đợi (server giới hạn 10MB/ảnh — lib/photos.ts).
export const PHOTO_QUOTA_BYTES = 50 * 1024 * 1024;
export const FLUSH_INTERVAL_MS = 30_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 5 * 60_000;

// Backoff luỹ thừa theo số lần thất bại: 0→0 (thử ngay lần đầu), 1→2s, 2→4s, 3→8s…,
// chặn trần 5 phút. Đơn điệu không giảm để "backoff tăng dần theo tries".
export function backoffMs(tries: number): number {
  if (tries <= 0) return 0;
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (tries - 1));
}

// Có nên thử gửi bản ghi này ở thời điểm `now` chưa (đã qua khoảng backoff kể từ lần
// thử gần nhất)? Bản ghi mới (chưa thử) luôn được gửi ngay.
export function shouldAttempt(op: { tries: number; lastTriedAt?: number }, now: number): boolean {
  if (!op.lastTriedAt) return true;
  return now - op.lastTriedAt >= backoffMs(op.tries);
}

// Giữ lại hàng đợi để thử tiếp chỉ khi mất mạng hoặc lỗi server 5xx. 4xx (mất quyền,
// task/dimension bị xoá, dữ liệu không hợp lệ) → BỎ, không kẹt hàng đợi retry vô hạn.
export function shouldRetry(outcome: { networkError?: boolean; status?: number }): boolean {
  if (outcome.networkError) return true;
  return (outcome.status ?? 0) >= 500;
}

// Mỗi dimension chỉ giữ thao tác tick MỚI NHẤT — trả về id các tick cũ cùng dimId cần
// xoá trước khi thêm tick mới (giữ đúng hành vi dedup của khung cũ).
export function tickDedupeIds(ops: QueuedOp[], dimId: number): number[] {
  return ops
    .filter(
      (o) =>
        (o.kind === "tick" && o.payload.dimId === dimId) ||
        // Lô cũ chứa đúng ô này cũng phải nhường: thao tác sau thắng. Chỉ xoá khi lô CHỈ có ô
        // đó — lô nhiều ô mà xoá cả thì mất luôn các ô khác người dùng đã tick.
        (o.kind === "tick_batch" && o.payload.dimIds.length === 1 && o.payload.dimIds[0] === dimId),
    )
    .map((o) => o.id);
}

// Op nào cần xoá trước khi thêm một lô tick mới (M121 FR7). Cùng luật "thao tác sau thắng":
// mọi op `tick` đơn lẻ có ô nằm trong lô mới đều thừa (lô mới đã quyết định trạng thái ô đó),
// và lô cũ trùng HOÀN TOÀN tập ô cũng thừa.
//
// Lô cũ chỉ TRÙNG MỘT PHẦN thì GIỮ LẠI: xoá đi sẽ mất các ô ngoài phần giao mà người dùng đã
// tick; giữ lại thì ô giao bị ghi 2 lần theo đúng thứ tự FIFO, lần sau thắng — đúng ý người dùng.
export function tickBatchDedupeIds(ops: QueuedOp[], dimIds: number[]): number[] {
  const trongLo = new Set(dimIds);
  return ops
    .filter((o) => {
      if (o.kind === "tick") return trongLo.has(o.payload.dimId);
      if (o.kind === "tick_batch")
        return (
          o.payload.dimIds.length === trongLo.size &&
          o.payload.dimIds.every((id) => trongLo.has(id))
        );
      return false;
    })
    .map((o) => o.id);
}

// Mỗi ngày chỉ giữ 1 bản nhật ký offline MỚI NHẤT — PUT /api/diaries/:date là full-replace
// nên bản sau đã chứa trọn trạng thái, các bản cũ cùng ngày thừa (trả id cần xoá trước khi thêm).
export function diaryDedupeIds(ops: QueuedOp[], date: string): number[] {
  return ops.filter((o) => o.kind === "diary_note" && o.payload.date === date).map((o) => o.id);
}

// Tổng byte ảnh đang chờ trong hàng đợi.
export function photoQueueBytes(ops: QueuedOp[]): number {
  return ops.reduce((sum, o) => (o.kind === "photo" ? sum + o.payload.size : sum), 0);
}

// Thêm ảnh `newSize` byte có vượt hạn mức không (để từ chối enqueue kèm thông điệp rõ).
export function wouldExceedPhotoQuota(
  ops: QueuedOp[],
  newSize: number,
  max: number = PHOTO_QUOTA_BYTES,
): boolean {
  return photoQueueBytes(ops) + newSize > max;
}

// Điểm gửi (URL + method) theo loại — thuần để test ánh xạ; body do lớp gửi tự dựng.
export function opEndpoint(op: QueuedOp): { url: string; method: string } {
  switch (op.kind) {
    case "tick":
      return { url: `/api/dimensions/${op.payload.dimId}`, method: "PATCH" };
    case "tick_batch":
      return { url: `/api/dimensions/batch`, method: "PATCH" };
    case "photo":
      return { url: `/api/tasks/${op.payload.taskId}/photos`, method: "POST" };
    case "diary_note":
      return { url: `/api/diaries/${op.payload.date}`, method: "PUT" };
  }
}

export type QueueStats = { total: number; pending: number; failed: number };

// Thống kê để hiện badge: pending = chưa từng lỗi, failed = đã thử ≥1 lần mà chưa gửi được.
export function computeStats(ops: QueuedOp[]): QueueStats {
  const failed = ops.filter((o) => o.tries > 0).length;
  return { total: ops.length, pending: ops.length - failed, failed };
}

// `error`: thông điệp server trả kèm khi từ chối (4xx) — dùng để nói cho người dùng biết vì
// sao thao tác offline của họ không vào được, thay vì xoá im lặng (M121 FR8).
export type SendOutcome = { networkError?: boolean; status?: number; error?: string };
export type SendFn = (op: QueuedOp) => Promise<SendOutcome>;

// Vòng gửi hàng đợi — THUẦN (chỉ phụ thuộc store + hàm gửi + đồng hồ). Duyệt FIFO,
// gửi từng bản ghi đến hạn thử: thành công/4xx → xoá; mất mạng/5xx → tăng `tries`,
// ghi mốc thử, giữ lại. Thứ tự bảo toàn vì retry KHÔNG xoá bản ghi.
export async function flushQueue(
  store: QueueStore,
  send: SendFn,
  now: () => number = Date.now,
): Promise<{ removed: number; retried: number; remaining: number; tuChoi: OpTuChoi[] }> {
  const ops = await store.getAll();
  let removed = 0;
  let retried = 0;
  // Op bị server TỪ CHỐI (4xx) — trước đây bị xoá im lặng, người dùng chỉ thấy badge về 0 mà
  // không biết mình vừa mất thao tác nào (M121 FR8). Vẫn xoá khỏi hàng đợi để không kẹt retry
  // vô hạn, nhưng trả lý do lên để lớp UI báo cho người dùng biết mà làm lại.
  const tuChoi: OpTuChoi[] = [];
  for (const op of ops) {
    if (!shouldAttempt(op, now())) continue;
    const outcome = await send(op);
    if (shouldRetry(outcome)) {
      await store.update({ ...op, tries: op.tries + 1, lastTriedAt: now() });
      retried++;
    } else {
      if (biTuChoi(outcome)) tuChoi.push({ kind: op.kind, soO: soOCuaOp(op), lyDo: outcome.error });
      await store.remove(op.id);
      removed++;
    }
  }
  const remaining = (await store.getAll()).length;
  return { removed, retried, remaining, tuChoi };
}

export type OpTuChoi = { kind: QueueKind; soO: number; lyDo?: string };

// Gửi xong mà server trả 4xx = bị từ chối (mất quyền, hold-point chưa mở, ô đã bị xoá…).
// Khác với thành công (2xx) và khác với lỗi tạm (5xx/mất mạng — đã giữ lại để thử tiếp).
export function biTuChoi(outcome: SendOutcome): boolean {
  const s = outcome.status ?? 0;
  return s >= 400 && s < 500;
}

// Số ô một op đại diện — để thông điệp nói "3 thao tác bị từ chối" thay vì "1 op".
function soOCuaOp(op: QueuedOp): number {
  if (op.kind === "tick") return 1;
  if (op.kind === "tick_batch") return op.payload.dimIds.length;
  return 1;
}

// Hiện thực trong bộ nhớ cho unit test — cùng interface với IndexedDB store.
export class MemoryQueueStore implements QueueStore {
  private ops: QueuedOp[] = [];
  private seq = 0;

  async getAll(): Promise<QueuedOp[]> {
    return this.ops.slice().sort((a, b) => a.id - b.id);
  }
  async add(op: QueuedOpInput): Promise<number> {
    const id = ++this.seq;
    this.ops.push({ ...op, id } as QueuedOp);
    return id;
  }
  async update(op: QueuedOp): Promise<void> {
    const i = this.ops.findIndex((o) => o.id === op.id);
    if (i >= 0) this.ops[i] = op;
  }
  async remove(id: number): Promise<void> {
    this.ops = this.ops.filter((o) => o.id !== id);
  }
  async clear(): Promise<void> {
    this.ops = [];
  }
}
