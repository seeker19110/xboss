// Adapter IndexedDB THẬT của hàng đợi offline v2 (app/components/offlineQueue/store.ts) chạy với
// sự kiện IDB điều khiển được — không giả là browser E2E. Kiểm: chỉ resolve khi transaction
// complete; request success rồi abort (quota) → reject; nâng cấp v1→v2 chỉ THÊM store (legacy `ops`
// giữ nguyên), catalog sai → huỷ nâng cấp/không mở; blocked/versionchange/VersionError → lỗi rõ.
// Map AC: A2-AC05, A2-AC07.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import {
  DB_NAME,
  DB_VERSION,
  IdbTxDb,
  LEGACY_STORE,
  moCsdl,
  STORE_META,
  STORE_OPS,
} from "@/app/components/offlineQueue/store";

type Req = {
  result?: unknown;
  error?: Error | null;
  transaction?: FakeTx | null;
  onsuccess?: () => void;
  onerror?: () => void;
  onblocked?: () => void;
  onupgradeneeded?: () => void;
};
type FakeStore = {
  keyPath: string;
  indexNames: Set<string>;
  createIndex: (name: string) => void;
};
type FakeTx = {
  error: Error | null;
  oncomplete?: () => void;
  onabort?: () => void;
  aborted: boolean;
  requests: Req[];
  abort: () => void;
  objectStore: (name: string) => unknown;
};

const names = (s: Set<string>) => ({
  contains: (n: string) => s.has(n),
  [Symbol.iterator]: () => s.values(),
});

function fakeDb(stores: Record<string, FakeStore>) {
  const txs: FakeTx[] = [];
  let closes = 0;
  const storeSet = new Set(Object.keys(stores));
  let syncError: Error | null = null;
  const db = {
    get objectStoreNames() {
      return names(storeSet);
    },
    onversionchange: undefined as undefined | (() => void),
    onclose: undefined as undefined | (() => void),
    close: () => closes++,
    createObjectStore: (n: string, o: { keyPath: string }) => {
      storeSet.add(n);
      const s: FakeStore = {
        keyPath: o.keyPath,
        indexNames: new Set(),
        createIndex: (i: string) => s.indexNames.add(i),
      };
      stores[n] = s;
      return s;
    },
    transaction: () => {
      const tx: FakeTx = {
        error: null,
        aborted: false,
        requests: [],
        abort: () => {
          tx.aborted = true;
          tx.onabort?.();
        },
        objectStore: () => {
          const issue = (result?: unknown) => {
            if (syncError) throw syncError;
            const r: Req = { result };
            tx.requests.push(r);
            return r;
          };
          return {
            get: () => issue(undefined),
            put: () => issue("k"),
            delete: () => issue(undefined),
            count: () => issue(0),
            index: () => ({ getAll: () => issue([]), count: () => issue(0) }),
          };
        },
      };
      txs.push(tx);
      return tx;
    },
  };
  return {
    db,
    txs,
    stores,
    closes: () => closes,
    throwSync: (e: Error) => {
      syncError = e;
    },
  };
}

async function chayTx(abort: boolean) {
  const f = fakeDb({});
  const idb = new IdbTxDb(async () => f.db as unknown as IDBDatabase);
  let xong = false;
  const p = idb
    .tx([STORE_OPS], "readwrite", async (t) => {
      await t.put(STORE_OPS, { operationId: "a" });
      return "đã ghi";
    })
    .then(
      (v) => ((xong = true), { ok: true as const, v }),
      (e: unknown) => ((xong = true), { ok: false as const, e }),
    );
  await setImmediate();
  const tx = f.txs[0];
  tx.requests[0].onsuccess?.();
  await setImmediate();
  assert.equal(xong, false, "request success chưa phải COMMIT");
  if (abort) {
    tx.error = new Error("QuotaExceededError");
    tx.onabort?.();
  } else tx.oncomplete?.();
  return p;
}

test("IDB tx: chỉ resolve khi complete", async () => {
  const kq = await chayTx(false);
  assert.deepEqual(kq, { ok: true, v: "đã ghi" });
});

test("IDB tx: request success rồi abort (quota) → reject, KHÔNG báo đã lưu (A2-AC05)", async () => {
  const kq = await chayTx(true);
  assert.equal(kq.ok, false);
  assert.match(String((kq as { e: Error }).e.message), /Quota/);
});

test("IDB tx: callback ném lỗi → abort transaction + reject đúng lỗi đó", async () => {
  const f = fakeDb({});
  const idb = new IdbTxDb(async () => f.db as unknown as IDBDatabase);
  const p = idb.tx([STORE_OPS], "readwrite", async () => {
    throw new Error("vượt hạn mức ảnh");
  });
  await assert.rejects(p, /hạn mức/);
  assert.equal(f.txs[0].aborted, true);
});

test("IDB tx: lỗi đồng bộ khi tạo request (DataCloneError) → reject, không ghi tiếp", async () => {
  const f = fakeDb({});
  f.throwSync(new Error("DataCloneError"));
  const idb = new IdbTxDb(async () => f.db as unknown as IDBDatabase);
  await assert.rejects(
    idb.tx([STORE_OPS], "readwrite", async (t) => {
      await t.put(STORE_OPS, {});
      return 1;
    }),
    /DataCloneError/,
  );
  assert.equal(f.txs[0].aborted, true);
});

test("IDB: versionchange đóng connection, thao tác kế tiếp mở lại", async () => {
  const f = fakeDb({});
  let mo = 0;
  const idb = new IdbTxDb(async () => (mo++, f.db as unknown as IDBDatabase));
  await idb.storeNames();
  f.db.onversionchange?.();
  assert.equal(f.closes(), 1);
  await idb.storeNames();
  assert.equal(mo, 2);
});

function fakeFactory(dbFake: ReturnType<typeof fakeDb>) {
  const opens: Req[] = [];
  const calls: [string, number][] = [];
  return {
    opens,
    calls,
    factory: {
      open: (name: string, v: number) => {
        calls.push([name, v]);
        const req: Req = { result: dbFake.db, transaction: null };
        opens.push(req);
        return req;
      },
    } as unknown as IDBFactory,
  };
}

test("nâng cấp v1→v2 chỉ THÊM ops2/meta, store legacy `ops` giữ nguyên (không drop) (A2-AC07)", async () => {
  const legacy: FakeStore = { keyPath: "id", indexNames: new Set(), createIndex: () => {} };
  const f = fakeDb({ [LEGACY_STORE]: legacy });
  const ff = fakeFactory(f);
  const p = moCsdl(ff.factory);
  assert.deepEqual(ff.calls, [[DB_NAME, DB_VERSION]]);
  const upTx = f.db.transaction() as FakeTx;
  ff.opens[0].transaction = upTx;
  ff.opens[0].onupgradeneeded?.();
  ff.opens[0].onsuccess?.();
  await p;
  assert.ok(f.stores[LEGACY_STORE] === legacy, "store legacy còn nguyên");
  assert.equal(f.stores[STORE_OPS].keyPath, "operationId");
  assert.deepEqual([...f.stores[STORE_OPS].indexNames].sort(), ["owner", "ownerUserId"]);
  assert.equal(f.stores[STORE_META].keyPath, "k");
  assert.equal(upTx.aborted, false);
});

test("catalog local sai (ops2 có keyPath khác) → huỷ nâng cấp, không sửa/xoá gì", async () => {
  const sai: FakeStore = { keyPath: "id", indexNames: new Set(["owner"]), createIndex: () => {} };
  const f = fakeDb({ [STORE_OPS]: sai });
  const ff = fakeFactory(f);
  const p = moCsdl(ff.factory);
  const upTx: FakeTx = {
    ...(f.db.transaction() as FakeTx),
    objectStore: (n: string) => f.stores[n],
  };
  upTx.abort = () => {
    upTx.aborted = true;
  };
  ff.opens[0].transaction = upTx;
  ff.opens[0].onupgradeneeded?.();
  assert.equal(upTx.aborted, true);
  ff.opens[0].error = new Error("AbortError");
  ff.opens[0].onerror?.();
  await assert.rejects(p, /AbortError/);
  assert.equal(f.stores[STORE_OPS], sai);
});

test("mở thành công nhưng thiếu store v2 → reject + đóng connection (không dùng catalog lạ)", async () => {
  const f = fakeDb({
    [LEGACY_STORE]: { keyPath: "id", indexNames: new Set(), createIndex: () => {} },
  });
  const ff = fakeFactory(f);
  const p = moCsdl(ff.factory);
  ff.opens[0].onsuccess?.();
  await assert.rejects(p, /Catalog/);
  assert.equal(f.closes(), 1);
});

/** Promise phải xong trong `ms` — code cũ treo thì đỏ bằng assert rõ, không bị huỷ lây cả file. */
function trongHan<T>(p: Promise<T>, ms = 500): Promise<T> {
  let hen: ReturnType<typeof setTimeout> | undefined;
  const treo = new Promise<never>((_, j) => {
    hen = setTimeout(() => j(new Error(`treo quá ${ms}ms`)), ms);
  });
  return Promise.race([p, treo]).finally(() => clearTimeout(hen));
}

test("upgrade bị tab cũ chặn → lỗi rõ (không lưu); handle đến muộn có catalog lạ bị đóng", async () => {
  const f = fakeDb({});
  const ff = fakeFactory(f);
  const p = moCsdl(ff.factory);
  ff.opens[0].onblocked?.();
  await assert.rejects(p, /tab cũ/);
  ff.opens[0].onsuccess?.();
  assert.equal(f.closes(), 1);
});

test("handle hợp lệ đến muộn được để dành cho lần mở kế tiếp; tab khác nâng cấp trong lúc chờ → đóng, bỏ", async () => {
  const f = fakeDb({});
  const ff = fakeFactory(f);
  const p = moCsdl(ff.factory, 20);
  ff.opens[0].onblocked?.();
  await assert.rejects(p, /tab cũ/);
  ff.opens[0].onupgradeneeded?.();
  ff.opens[0].onsuccess?.();
  assert.equal(f.closes(), 0);
  assert.equal(await trongHan(moCsdl(ff.factory, 20)), f.db);
  assert.equal(ff.opens.length, 1, "dùng lại handle đến muộn, không open mới");

  // Lần bỏ thứ hai: handle để dành nhận versionchange (tab khác nâng cấp/xoá) → đóng, lần sau open mới.
  const p2 = moCsdl(ff.factory, 20);
  ff.opens[1].onblocked?.();
  await assert.rejects(p2, /tab cũ/);
  ff.opens[1].onsuccess?.();
  f.db.onversionchange?.();
  assert.equal(f.closes(), 1);
  const p3 = moCsdl(ff.factory, 20);
  assert.equal(ff.opens.length, 3);
  ff.opens[2].onsuccess?.();
  await p3;

  // Handle để dành bị trình duyệt đóng cưỡng bức (xoá dữ liệu site) → bỏ, không giao handle chết.
  const p4 = moCsdl(ff.factory, 20);
  ff.opens[3].onblocked?.();
  await assert.rejects(p4, /tab cũ/);
  ff.opens[3].onsuccess?.();
  f.db.onclose?.();
  const p5 = moCsdl(ff.factory, 20);
  assert.equal(ff.opens.length, 5, "handle đã đóng không được giao lại");
  ff.opens[4].onsuccess?.();
  await p5;
});

test("open còn bị chặn → lần mở sau reject ngay, KHÔNG xếp open mới sau nó (trình duyệt treo open đó tới khi tab cũ đóng)", async () => {
  const f = fakeDb({});
  const ff = fakeFactory(f);
  const p1 = moCsdl(ff.factory);
  ff.opens[0].onblocked?.();
  await assert.rejects(p1, /tab cũ/);
  await assert.rejects(moCsdl(ff.factory), /tab cũ/);
  assert.equal(ff.opens.length, 1);

  // Tab cũ đóng → open bị chặn hoàn tất (handle để dành) → lần sau dùng được ngay.
  ff.opens[0].onupgradeneeded?.();
  ff.opens[0].onsuccess?.();
  assert.equal(await trongHan(moCsdl(ff.factory)), f.db);
  assert.equal(ff.opens.length, 1);
});

test("open bị chặn rồi lỗi (huỷ nâng cấp) → cờ chặn được gỡ, lần sau mở lại được", async () => {
  const f = fakeDb({});
  const ff = fakeFactory(f);
  const p1 = moCsdl(ff.factory);
  ff.opens[0].onblocked?.();
  await assert.rejects(p1, /tab cũ/);
  ff.opens[0].onerror?.();
  void moCsdl(ff.factory, 20).catch(() => undefined);
  assert.equal(ff.opens.length, 2);
});

test("open không nhận sự kiện nào (tab khác đang bị chặn trước nó) → hết hạn chờ thì báo lỗi, không treo", async () => {
  const f = fakeDb({});
  const ff = fakeFactory(f);
  await assert.rejects(trongHan(moCsdl(ff.factory, 20)), /tab cũ/);
  // Open treo vẫn trong hàng: lần sau báo lỗi ngay, không xếp thêm open.
  await assert.rejects(trongHan(moCsdl(ff.factory, 20)), /tab cũ/);
  assert.equal(ff.opens.length, 1);
  // Hết chặn (hoặc máy chậm) → open treo hoàn tất → handle để dành cho lần sau, không open lại.
  ff.opens[0].onupgradeneeded?.();
  ff.opens[0].onsuccess?.();
  assert.equal(f.closes(), 0);
  assert.equal(await trongHan(moCsdl(ff.factory, 20)), f.db);
  assert.equal(ff.opens.length, 1);
});

test("open xong (success/lỗi) trước hạn chờ → hạn chờ huỷ, không đặt cờ chặn về sau", async () => {
  const f = fakeDb({});
  const ff = fakeFactory(f);
  const p0 = moCsdl(ff.factory, 20);
  ff.opens[0].onupgradeneeded?.();
  ff.opens[0].onsuccess?.();
  await p0;
  // CSDL đã đủ catalog: open chỉ nhận success (không có upgradeneeded huỷ hạn chờ hộ).
  const p = moCsdl(ff.factory, 20);
  ff.opens[1].onsuccess?.();
  await p;
  const pLoi = moCsdl(ff.factory, 20);
  ff.opens[2].error = new Error("UnknownError");
  ff.opens[2].onerror?.();
  await assert.rejects(pLoi, /UnknownError/);
  await new Promise((ok) => setTimeout(ok, 60));
  const p3 = moCsdl(ff.factory, 20);
  assert.equal(ff.opens.length, 4, "không bị cờ chặn sót từ hạn chờ cũ");
  ff.opens[3].onsuccess?.();
  await trongHan(p3);
});

test("open có sự kiện trước hạn chờ (nâng cấp chậm) → không bị coi là treo", async () => {
  const f = fakeDb({});
  const ff = fakeFactory(f);
  const p = moCsdl(ff.factory, 20);
  ff.opens[0].onupgradeneeded?.();
  await new Promise((ok) => setTimeout(ok, 40));
  ff.opens[0].onsuccess?.();
  await p;
  assert.equal(f.closes(), 0);
});

test("CSDL đã ở version cao hơn (VersionError) → reject, không hạ cấp/xoá", async () => {
  const f = fakeDb({});
  const ff = fakeFactory(f);
  const p = moCsdl(ff.factory);
  ff.opens[0].error = Object.assign(new Error("VersionError"), { name: "VersionError" });
  ff.opens[0].onerror?.();
  await assert.rejects(p, /VersionError/);
});

test("IdbTxDb: mở lỗi không cache promise bị reject, lần sau mở lại được", async () => {
  const f = fakeDb({});
  let lan = 0;
  const idb = new IdbTxDb(async () => {
    if (++lan === 1) throw new Error("open failed");
    return f.db as unknown as IDBDatabase;
  });
  await assert.rejects(idb.storeNames(), /open failed/);
  assert.deepEqual(await idb.storeNames(), []);
});
