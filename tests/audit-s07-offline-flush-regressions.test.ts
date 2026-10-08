import "./setup"; // Không cho test đọc cấu hình DB production.
// Regression của manager hàng đợi offline v2 (app/components/offlineQueue/index.ts) — khoá trong
// tab trước await đầu tiên, lỗi lưu trữ không kẹt cờ "đang gửi", mất mạng/SSR không đọc storage,
// enqueue khi online kích gửi ngay, lỗi ghi không kích gửi/không báo lưu. Chạy manager THẬT với
// QueueDb trên MemoryTxDb + VaultSession thật + máy chủ giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OfflineQueueManager } from "@/app/components/offlineQueue";
import { MemoryTxDb, QueueDb, STORE_OPS } from "@/app/components/offlineQueue/store";
import { VaultSession } from "@/app/components/offlineQueue/vault";
import type { SendOutcome, YeuCauGui } from "@/app/components/offlineQueue/logic";
import { taoMayChuGia } from "./helpers/offline-may-chu-gia";

Object.defineProperty(globalThis.navigator, "onLine", {
  value: true,
  configurable: true,
  writable: true,
});
const datOnline = (v: boolean) => {
  (globalThis.navigator as { onLine: boolean }).onLine = v;
};

class StoreDem extends QueueDb {
  doc = 0;
  hongDoc = 0;
  async docChu(owner: string) {
    this.doc++;
    if (this.hongDoc > 0) {
      this.hongDoc--;
      throw new Error("read failed");
    }
    return super.docChu(owner);
  }
}

async function fixture(opts: { send?: (r: YeuCauGui) => Promise<SendOutcome> } = {}) {
  const may = taoMayChuGia();
  may.dangNhap({ id: 5, orgId: 1, role: "engineer" });
  const db = new MemoryTxDb();
  const store = new StoreDem(db);
  const gui: YeuCauGui[] = [];
  const q = new OfflineQueueManager({
    store,
    vault: new VaultSession(may.fetch),
    send: async (r) => {
      gui.push(r);
      return opts.send
        ? opts.send(r)
        : { status: 200, receiptOperationId: r.headers["Idempotency-Key"] };
    },
  });
  q.dangKyLuoi([{ id: 3, cells: { a: { id: 30 }, b: { id: 31 } } }]);
  await q.chuanBiTracking([{ id: 3 }]);
  const soOp = () => db.data.get(STORE_OPS)!.size;
  return { q, store, gui, soOp, may };
}

const cho = () => new Promise<void>((r) => setImmediate(r));

test("khoá trong tab có trước await đầu tiên: 2 lần flush đồng thời chỉ gửi mỗi op 1 lần", async () => {
  let mo!: () => void;
  const cong = new Promise<void>((r) => (mo = r));
  const f = await fixture({
    send: async (r) => {
      await cong;
      return { status: 200, receiptOperationId: r.headers["Idempotency-Key"] };
    },
  });
  datOnline(false);
  await f.q.enqueueTick(30, true);
  datOnline(true);
  const a = f.q.flush();
  const b = f.q.flush();
  await cho();
  mo();
  await Promise.all([a, b]);
  assert.equal(f.gui.length, 1);
  assert.equal(f.soOp(), 0);
  assert.equal(f.q.getSnapshot().sending, false);
});

test("đọc storage lỗi không giữ cờ khoá vĩnh viễn; lần sau gửi được", async () => {
  const f = await fixture();
  datOnline(false);
  await f.q.enqueueTick(30, true);
  datOnline(true);
  f.store.hongDoc = 1;
  await assert.rejects(f.q.flush(), /read failed/);
  assert.equal(f.q.getSnapshot().sending, false);
  await f.q.flush();
  assert.equal(f.gui.length, 1);
  assert.equal(f.soOp(), 0);
});

test("lỗi sender (throw) = không rõ server đã nhận: giữ op, không báo đã gửi, lần sau gửi lại CÙNG key", async () => {
  let lan = 0;
  const f = await fixture({
    send: async (r) => {
      if (++lan === 1) throw new Error("send failed");
      return { status: 200, receiptOperationId: r.headers["Idempotency-Key"] };
    },
  });
  let xong = 0;
  f.q.onFlushed(() => xong++);
  datOnline(false);
  await f.q.enqueueTick(30, true);
  datOnline(true);
  await f.q.flush();
  assert.equal(f.q.getSnapshot().sending, false);
  assert.equal(xong, 0);
  assert.equal(f.soOp(), 1);
  assert.equal(f.q.getSnapshot().failed, 1);
  const db = (f.store as unknown as { db: MemoryTxDb }).db;
  for (const [k, v] of db.data.get(STORE_OPS)!)
    db.data.get(STORE_OPS)!.set(k, { ...(v as object), nextAttemptAt: 0 });
  await f.q.flush();
  assert.equal(f.soOp(), 0);
  assert.equal(xong, 1);
  assert.equal(f.gui[0].headers["Idempotency-Key"], f.gui[1].headers["Idempotency-Key"]);
});

test("op kẹt `sending` (tab chết giữa chừng) được đưa về pending ở kỳ lease mới của CHÍNH tab", async () => {
  const f = await fixture();
  datOnline(false);
  await f.q.enqueueTick(30, true);
  datOnline(true);
  const chu = f.q.vault.chu()!;
  const l = await f.store.xinLease(chu, "tab-chet", Date.now());
  const id = [
    ...(f.store as unknown as { db: MemoryTxDb }).db.data.get(STORE_OPS)!.values(),
  ][0] as {
    operationId: string;
  };
  await f.store.batDauGui(chu, id.operationId, "tab-chet", l!.token, Date.now());
  await f.store.traLease(chu, "tab-chet", l!.token);
  await f.q.flush();
  assert.equal(f.soOp(), 0, "gửi lại cùng operationId — server dedup bằng receipt");
});

test("mất mạng: flush không đọc storage, không gửi", async () => {
  const f = await fixture();
  datOnline(false);
  await f.q.enqueueTick(30, true);
  const truoc = f.store.doc;
  await f.q.flush();
  datOnline(true);
  assert.equal(f.store.doc, truoc);
  assert.equal(f.gui.length, 0);
});

test("enqueue khi online kích gửi ngay; gửi xong phát callback một lần", async () => {
  const f = await fixture();
  let xong = 0;
  f.q.onFlushed(() => xong++);
  assert.equal(await f.q.enqueueTickBatch([30, 31], true), true);
  // WebCrypto chạy trên threadpool — chờ theo hạn thời gian, không theo số vòng setImmediate.
  for (const het = Date.now() + 5000; xong === 0 && Date.now() < het;)
    await new Promise((r) => setTimeout(r, 5));
  assert.equal(f.gui.length, 1);
  assert.equal(f.gui[0].url, "/api/dimensions/batch");
  assert.equal(xong, 1);
});

test("lô rỗng không ghi/không kích gửi; ô chưa thuộc lưới đã đăng ký → không lưu", async () => {
  const f = await fixture();
  assert.equal(await f.q.enqueueTickBatch([], true), true);
  assert.equal(await f.q.enqueueTick(999, true), false);
  assert.equal(await f.q.enqueueTickBatch([30, 999], true), false);
  assert.equal(f.soOp(), 0);
  assert.equal(f.gui.length, 0);
});
