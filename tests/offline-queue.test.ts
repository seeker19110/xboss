// Unit test logic THUẦN của hàng đợi offline (M58 PR2) — không chạm IndexedDB/DB thật,
// dùng MemoryQueueStore + hàm gửi giả để kiểm dedup tick, backoff, 4xx bị loại, hạn mức ảnh.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MemoryQueueStore,
  backoffMs,
  shouldAttempt,
  shouldRetry,
  tickDedupeIds,
  wouldExceedPhotoQuota,
  photoQueueBytes,
  computeStats,
  opEndpoint,
  flushQueue,
  PHOTO_QUOTA_BYTES,
  type QueuedOp,
  type SendOutcome,
} from "@/app/components/offlineQueue/logic";

// Nhái enqueueTick của manager: dedup theo dimId rồi thêm bản mới nhất.
async function enqueueTick(store: MemoryQueueStore, dimId: number, installed: boolean) {
  const ops = await store.getAll();
  for (const id of tickDedupeIds(ops, dimId)) await store.remove(id);
  await store.add({ kind: "tick", payload: { dimId, installed }, queuedAt: Date.now(), tries: 0 });
}

test("dedup tick: mỗi dimension chỉ giữ thao tác mới nhất", async () => {
  const store = new MemoryQueueStore();
  await enqueueTick(store, 5, true);
  await enqueueTick(store, 5, false); // ghi đè dim 5
  await enqueueTick(store, 6, true);
  const ops = await store.getAll();
  assert.equal(ops.length, 2);
  const dim5 = ops.find((o) => o.kind === "tick" && o.payload.dimId === 5);
  assert.ok(dim5 && dim5.kind === "tick");
  assert.equal(dim5.payload.installed, false); // giữ giá trị mới nhất
});

test("backoff tăng dần theo tries, chặn trần", () => {
  assert.equal(backoffMs(0), 0); // lần đầu gửi ngay
  assert.ok(backoffMs(1) < backoffMs(2));
  assert.ok(backoffMs(2) < backoffMs(3));
  assert.ok(backoffMs(3) < backoffMs(4));
  // đơn điệu không giảm + có trần
  for (let t = 1; t < 20; t++) assert.ok(backoffMs(t) <= backoffMs(t + 1));
  assert.equal(backoffMs(100), backoffMs(1000)); // đã đụng trần
});

test("shouldAttempt tôn trọng backoff", () => {
  assert.equal(shouldAttempt({ tries: 0 }, 1_000_000), true); // chưa thử → gửi ngay
  const op = { tries: 2, lastTriedAt: 1_000_000 };
  assert.equal(shouldAttempt(op, 1_000_000 + backoffMs(2) - 1), false);
  assert.equal(shouldAttempt(op, 1_000_000 + backoffMs(2)), true);
});

test("shouldRetry: 4xx bỏ, 5xx và mất mạng giữ", () => {
  assert.equal(shouldRetry({ status: 200 }), false);
  assert.equal(shouldRetry({ status: 201 }), false);
  assert.equal(shouldRetry({ status: 400 }), false);
  assert.equal(shouldRetry({ status: 403 }), false);
  assert.equal(shouldRetry({ status: 404 }), false);
  assert.equal(shouldRetry({ status: 500 }), true);
  assert.equal(shouldRetry({ status: 503 }), true);
  assert.equal(shouldRetry({ networkError: true }), true);
});

test("flushQueue: 4xx bị loại khỏi hàng đợi không retry, 5xx giữ + tăng tries", async () => {
  const store = new MemoryQueueStore();
  await store.add({ kind: "tick", payload: { dimId: 1, installed: true }, queuedAt: 1, tries: 0 });
  await store.add({ kind: "tick", payload: { dimId: 2, installed: true }, queuedAt: 2, tries: 0 });
  await store.add({ kind: "tick", payload: { dimId: 3, installed: true }, queuedAt: 3, tries: 0 });

  // dim1 → 403 (bỏ), dim2 → 500 (giữ), dim3 → 200 (gửi xong, bỏ)
  const send = async (op: QueuedOp): Promise<SendOutcome> => {
    if (op.kind !== "tick") return { status: 200 };
    if (op.payload.dimId === 1) return { status: 403 };
    if (op.payload.dimId === 2) return { status: 500 };
    return { status: 200 };
  };
  const r = await flushQueue(store, send, () => 1000);
  assert.equal(r.removed, 2); // dim1 (4xx) + dim3 (ok)
  assert.equal(r.retried, 1); // dim2 (5xx)
  const ops = await store.getAll();
  assert.equal(ops.length, 1);
  assert.equal(ops[0].kind === "tick" && ops[0].payload.dimId, 2);
  assert.equal(ops[0].tries, 1); // đã tăng tries
  assert.equal(ops[0].lastTriedAt, 1000);
});

test("flushQueue giữ thứ tự FIFO 3 loại thao tác", async () => {
  const store = new MemoryQueueStore();
  await store.add({ kind: "tick", payload: { dimId: 9, installed: true }, queuedAt: 1, tries: 0 });
  await store.add({
    kind: "photo",
    payload: { taskId: 7, caption: "", blob: new Blob([]), size: 10, mime: "image/jpeg" },
    queuedAt: 2,
    tries: 0,
  });
  await store.add({
    kind: "diary_note",
    payload: { date: "2026-07-18", text: "x" },
    queuedAt: 3,
    tries: 0,
  });

  const sent: string[] = [];
  const send = async (op: QueuedOp): Promise<SendOutcome> => {
    sent.push(op.kind);
    return { status: 200 };
  };
  const r = await flushQueue(store, send, () => 1000);
  assert.deepEqual(sent, ["tick", "photo", "diary_note"]); // đúng thứ tự nạp
  assert.equal(r.remaining, 0);
});

test("hạn mức ảnh 50MB chặn đúng", () => {
  const mb = 1024 * 1024;
  const mkPhoto = (size: number): QueuedOp => ({
    id: 1,
    kind: "photo",
    payload: { taskId: 1, caption: "", blob: new Blob([]), size, mime: "image/jpeg" },
    queuedAt: 0,
    tries: 0,
  });
  assert.equal(photoQueueBytes([mkPhoto(10 * mb), mkPhoto(20 * mb)]), 30 * mb);
  // 30MB đang chờ + 25MB mới = 55MB > 50MB → chặn
  assert.equal(wouldExceedPhotoQuota([mkPhoto(30 * mb)], 25 * mb), true);
  // 30MB + 15MB = 45MB ≤ 50MB → cho
  assert.equal(wouldExceedPhotoQuota([mkPhoto(30 * mb)], 15 * mb), false);
  // đúng hằng số
  assert.equal(PHOTO_QUOTA_BYTES, 50 * mb);
});

test("computeStats: pending vs failed theo tries", () => {
  const ops: QueuedOp[] = [
    { id: 1, kind: "tick", payload: { dimId: 1, installed: true }, queuedAt: 0, tries: 0 },
    { id: 2, kind: "tick", payload: { dimId: 2, installed: true }, queuedAt: 0, tries: 2 },
  ];
  assert.deepEqual(computeStats(ops), { total: 2, pending: 1, failed: 1 });
  assert.deepEqual(computeStats([]), { total: 0, pending: 0, failed: 0 });
});

test("opEndpoint ánh xạ URL đúng theo loại", () => {
  assert.deepEqual(
    opEndpoint({
      id: 1,
      kind: "tick",
      payload: { dimId: 42, installed: true },
      queuedAt: 0,
      tries: 0,
    }),
    { url: "/api/dimensions/42", method: "PATCH" },
  );
  assert.deepEqual(
    opEndpoint({
      id: 1,
      kind: "photo",
      payload: { taskId: 8, caption: "", blob: new Blob([]), size: 1, mime: "image/jpeg" },
      queuedAt: 0,
      tries: 0,
    }),
    { url: "/api/tasks/8/photos", method: "POST" },
  );
  assert.deepEqual(
    opEndpoint({
      id: 1,
      kind: "diary_note",
      payload: { date: "2026-07-18", text: "x" },
      queuedAt: 0,
      tries: 0,
    }),
    { url: "/api/diaries/2026-07-18", method: "PUT" },
  );
});

test("clear làm rỗng hàng đợi (bất biến bảo mật logout)", async () => {
  const store = new MemoryQueueStore();
  await store.add({ kind: "tick", payload: { dimId: 1, installed: true }, queuedAt: 0, tries: 0 });
  await store.add({
    kind: "diary_note",
    payload: { date: "2026-07-18", text: "y" },
    queuedAt: 0,
    tries: 0,
  });
  assert.equal((await store.getAll()).length, 2);
  await store.clear();
  assert.deepEqual(await store.getAll(), []);
});
