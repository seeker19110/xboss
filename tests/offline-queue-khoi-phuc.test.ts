// M131 §3 phía client — gắn lại thao tác của THIẾT BỊ CŨ (mất proof) sang thiết bị mới sau khi
// máy chủ hoàn tất khôi phục. Chạy trên QueueDb THẬT (MemoryTxDb), VaultSession THẬT (WebCrypto
// thật) và máy chủ giả /api/offline/* (helpers/offline-may-chu-gia.ts) — route + Postgres thật của
// luồng khôi phục nằm ở offline-recovery-route.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OfflineQueueManager } from "@/app/components/offlineQueue";
import { MemoryTxDb, QueueDb, STORE_OPS } from "@/app/components/offlineQueue/store";
import { VaultSession } from "@/app/components/offlineQueue/vault";
import type { QueueRecord, YeuCauGui } from "@/app/components/offlineQueue/logic";
import { taoMayChuGia } from "./helpers/offline-may-chu-gia";

Object.defineProperty(globalThis.navigator, "onLine", {
  value: true,
  configurable: true,
  writable: true,
});
const datOnline = (v: boolean) => {
  (globalThis.navigator as { onLine: boolean }).onLine = v;
};

const A = { id: 17, orgId: 1, role: "engineer" };
const TASK = 61;
const DIM = [701, 702];

function moiTruong(db: MemoryTxDb, may: ReturnType<typeof taoMayChuGia>) {
  const gui: YeuCauGui[] = [];
  const store = new QueueDb(db);
  const vault = new VaultSession(may.fetch);
  const q = new OfflineQueueManager({
    store,
    vault,
    send: async (req) => {
      gui.push(req);
      return { status: 200, receiptOperationId: req.headers["Idempotency-Key"] };
    },
  });
  return {
    store,
    vault,
    q,
    gui,
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

async function denLuc(dk: () => boolean, ms = 2000) {
  const het = Date.now() + ms;
  while (!dk()) {
    if (Date.now() > het) throw new Error("hết thời gian chờ");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Thiết bị cũ xếp 2 thao tác khi mất mạng, rồi mất proof → tab mới trên thiết bị mới. */
async function chuanBi() {
  const may = taoMayChuGia();
  const db = new MemoryTxDb();
  may.dangNhap(A);
  const cu = moiTruong(db, may);
  await cu.moTracking();
  datOnline(false);
  try {
    assert.equal(await cu.q.enqueueTick(DIM[0], true), true);
    assert.equal(await cu.q.enqueueTick(DIM[1], false), true);
  } finally {
    datOnline(true);
  }
  const opsCu = cu.ops();
  const tbCu = may.doiThietBi(A.id) as string;
  assert.equal(opsCu[0].deviceId, tbCu);
  const moi = moiTruong(db, may);
  await moi.moTracking();
  assert.equal(moi.vault.trangThai, "active");
  return { may, db, opsCu, tbCu, moi };
}

test("thiết bị cũ còn thao tác: liệt kê đúng thiết bị + số op; trước khôi phục không gửi được", async () => {
  const { opsCu, tbCu, moi } = await chuanBi();
  assert.deepEqual(await moi.q.thietBiCuConThaoTac(), [{ deviceId: tbCu, soThaoTac: 2 }]);
  await moi.q.flush();
  assert.equal(moi.gui.length, 0, "khoá của thiết bị cũ không có trên thiết bị mới");
  assert.deepEqual(moi.ops(), opsCu, "không đụng ciphertext của thiết bị cũ");
});

test("hoàn tất khôi phục: gắn lại op sang thiết bị mới (mã hoá lại, giữ operationId/sequence) rồi gửi được", async () => {
  const { may, opsCu, tbCu, moi } = await chuanBi();
  const mapping = may.khoiPhuc(A.id, tbCu);
  assert.ok(mapping.length >= 1);
  const kq = await moi.q.ganLaiTheoKhoiPhuc(mapping);
  assert.deepEqual(kq, { daGan: 2, conLai: 0 });

  const sau = moi.ops();
  const moiIds = new Set(mapping.map((m) => m.newKeyId));
  assert.equal(sau.length, 2);
  for (const [i, r] of sau.entries()) {
    assert.equal(r.operationId, opsCu[i].operationId);
    assert.equal(r.sequence, opsCu[i].sequence);
    assert.notEqual(r.deviceId, tbCu);
    assert.equal(r.owner, `${A.id}|${A.orgId}|${r.deviceId}`);
    assert.ok(moiIds.has(r.vaultKeyId), "op gắn với khoá khôi phục mới");
    assert.notEqual(r.ciphertext, opsCu[i].ciphertext, "mã hoá lại với AAD mới");
    assert.ok(await moi.vault.giaiMa(r), "thiết bị mới giải mã được");
  }
  assert.deepEqual(await moi.q.thietBiCuConThaoTac(), []);
  assert.deepEqual(await moi.store.docBanDoKhoiPhuc({ ownerUserId: A.id, orgId: A.orgId }), []);

  // ganLaiTheoKhoiPhuc tự kích gửi nền — chờ xong (flush gọi tay trùng lúc sẽ nhường lượt).
  await denLuc(() => moi.ops().length === 0);
  assert.deepEqual(
    moi.gui.map((g) => g.headers["Idempotency-Key"]),
    opsCu.map((o) => o.operationId),
    "gửi lại đúng operationId cũ (dedup receipt), đúng thứ tự",
  );
  assert.deepEqual(moi.ops(), [], "đã lên máy chủ");
});

test("bản đồ sai version cũ (AAD lệch) → không gắn, op giữ nguyên, bản đồ giữ để thử lại", async () => {
  const { may, opsCu, tbCu, moi } = await chuanBi();
  const sai = may.khoiPhuc(A.id, tbCu).map((m) => ({ ...m, oldKeyVersion: m.oldKeyVersion + 7 }));
  const kq = await moi.q.ganLaiTheoKhoiPhuc(sai);
  assert.deepEqual(kq, { daGan: 0, conLai: 2 });
  assert.deepEqual(moi.ops(), opsCu, "không ghi gì khi giải mã thất bại");
  assert.equal(
    (await moi.store.docBanDoKhoiPhuc({ ownerUserId: A.id, orgId: A.orgId })).length,
    sai.length,
  );
});

test("gắn lại không đè op đã đổi trong lúc mã hoá (tab khác đã xử lý) — so owner/khoá/iv trong transaction", async () => {
  const { opsCu, moi } = await chuanBi();
  const doi = { ...opsCu[0], iv: "AAAAAAAAAAAAAAAA" };
  const n = await moi.store.ganLaiThietBi([{ cu: doi, moi: { ...opsCu[0], deviceId: "x" } }]);
  assert.equal(n, 0);
  assert.deepEqual(moi.ops(), opsCu);
});
