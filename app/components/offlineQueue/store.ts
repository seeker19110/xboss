// Lớp lưu trữ hàng đợi offline v2 (QUALITY-FINAL-1 S07 — A2-FR05/FR07/FR08/FR12, D03).
//
// Thiết kế:
// - CSDL `xboss-offline` version 2. Nâng cấp CHỈ THÊM store `ops2` (envelope mã hoá, keyPath
//   operationId, index `owner`) và `meta` (rev/lastSeq/photoBytes + lease). Store `ops` của queue
//   v1 (không chủ sở hữu) được GIỮ NGUYÊN — quarantine: không đọc nội dung, không gửi, không gán
//   chủ, không xoá. Không bao giờ deleteDatabase/drop.
// - Mọi thao tác chạy qua `TxDb.tx`: chỉ resolve khi transaction `complete`; abort/quota/lỗi
//   request → reject (không báo "đã lưu"). Callback transaction CHỈ được await request IDB của
//   chính nó (không await WebCrypto/mạng bên trong — transaction sẽ tự commit).
// - OCC: `meta.rev` tăng ở MỌI thay đổi. Enqueue đọc rev → mã hoá ngoài transaction → transaction
//   ghi chỉ COMMIT khi rev chưa đổi (dedup + cấp sequence + ghi nguyên tử).
// - Lease liên tab trong `meta` (khoá `lease|<phạm vi>`): TTL 30s, fencing token tăng đơn điệu
//   mỗi lần đổi người giữ; chuyển `sending` và áp kết quả đều kiểm token trong transaction.
import {
  khoaChu,
  khoaPhamVi,
  LEASE_TTL_MS,
  PHOTO_QUOTA_BYTES,
  type ChuSoHuu,
  type Lease,
  type QueueRecord,
  type QueueStore,
  type ThayDoiSauGui,
} from "./logic";

export const DB_NAME = "xboss-offline";
export const DB_VERSION = 2;
/** Store của queue v1 (legacy, không chủ) — chỉ đếm, không đọc nội dung. */
export const LEGACY_STORE = "ops";
export const STORE_OPS = "ops2";
export const STORE_META = "meta";
// Key localStorage của khung tick cũ (trước IndexedDB) — legacy, chỉ kiểm có/không.
export const OLD_LS_KEY = "xboss-offline-ticks";

// ── Trừu tượng transaction ──────────────────────────────────────────────────────────────────

export interface TxApi {
  get<T>(store: string, key: IDBValidKey): Promise<T | undefined>;
  getAllByIndex<T>(store: string, index: string, key: IDBValidKey): Promise<T[]>;
  put(store: string, value: unknown): Promise<void>;
  delete(store: string, key: IDBValidKey): Promise<void>;
  /** Đếm bản ghi (theo index nếu có) — không nạp nội dung. */
  count(store: string, index?: { name: string; key: IDBValidKey }): Promise<number>;
}

export interface TxDb {
  tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: TxApi) => Promise<T>): Promise<T>;
  /** Tên store đang có trong catalog thật (sau khi mở). */
  storeNames(): Promise<string[]>;
}

export class LoiHanMucAnh extends Error {
  constructor() {
    super(
      `Hàng đợi ảnh trên thiết bị đã đầy (tối đa ${PHOTO_QUOTA_BYTES / 1024 / 1024}MB). Hãy kết nối mạng để gửi bớt ảnh đang chờ rồi thử lại.`,
    );
    this.name = "LoiHanMucAnh";
  }
}

// ── IndexedDB thật ──────────────────────────────────────────────────────────────────────────

function yeuCau<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("Yêu cầu IndexedDB lỗi"));
  });
}

/**
 * Mở CSDL v2. Nâng cấp chỉ thêm store còn thiếu sau khi KIỂM catalog thật (store đã có mà sai
 * keyPath/index → huỷ nâng cấp, báo lỗi, không sửa/xoá). Bị tab cũ chặn → lỗi (không lưu).
 * CSDL đã ở version cao hơn (code mới hơn) → VersionError → lỗi, không hạ cấp/xoá.
 */
export function moCsdl(idb: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    let blocked = false;
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;
      if (!db.objectStoreNames.contains(STORE_OPS)) {
        const s = db.createObjectStore(STORE_OPS, { keyPath: "operationId" });
        s.createIndex("owner", "owner");
        s.createIndex("ownerUserId", "ownerUserId");
      } else if (tx) {
        const s = tx.objectStore(STORE_OPS);
        if (
          s.keyPath !== "operationId" ||
          !s.indexNames.contains("owner") ||
          !s.indexNames.contains("ownerUserId")
        )
          tx.abort();
      }
      if (!db.objectStoreNames.contains(STORE_META))
        db.createObjectStore(STORE_META, { keyPath: "k" });
      else if (tx && tx.objectStore(STORE_META).keyPath !== "k") tx.abort();
    };
    req.onblocked = () => {
      blocked = true;
      reject(new Error("Hàng đợi đang được tab cũ sử dụng. Đóng các tab XBoss khác rồi thử lại."));
    };
    req.onsuccess = () => {
      const db = req.result;
      // open() không huỷ được sau blocked: đóng handle đến muộn để không rò connection.
      if (blocked) {
        db.close();
        return;
      }
      if (!db.objectStoreNames.contains(STORE_OPS) || !db.objectStoreNames.contains(STORE_META)) {
        db.close();
        reject(new Error("Catalog hàng đợi ngoại tuyến không đúng phiên bản"));
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("Không mở được hàng đợi ngoại tuyến"));
  });
}

export class IdbTxDb implements TxDb {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly mo: () => Promise<IDBDatabase> = () => moCsdl()) {}

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      const opening = this.mo()
        .then((db) => {
          const quen = () => {
            if (this.dbPromise === opening) this.dbPromise = null;
          };
          // Tab khác nâng cấp: đóng ngay để không chặn; thao tác kế tiếp mở lại.
          db.onversionchange = () => {
            db.close();
            quen();
          };
          db.onclose = quen;
          return db;
        })
        .catch((error: unknown) => {
          if (this.dbPromise === opening) this.dbPromise = null;
          throw error;
        });
      this.dbPromise = opening;
    }
    return this.dbPromise;
  }

  async storeNames(): Promise<string[]> {
    return Array.from((await this.getDb()).objectStoreNames);
  }

  async tx<T>(
    stores: string[],
    mode: IDBTransactionMode,
    fn: (t: TxApi) => Promise<T>,
  ): Promise<T> {
    const db = await this.getDb();
    return new Promise<T>((resolve, reject) => {
      let t: IDBTransaction;
      try {
        t = db.transaction(stores, mode);
      } catch (e) {
        reject(e);
        return;
      }
      let ketQua: { v: T } | null = null;
      let loiFn: unknown = null;
      t.oncomplete = () => {
        if (loiFn) reject(loiFn);
        else if (ketQua) resolve(ketQua.v);
        else reject(new Error("Giao dịch hàng đợi hoàn tất nhưng không có kết quả"));
      };
      // Abort sau khi request đã success (quota, lỗi đĩa…) vẫn là THẤT BẠI.
      t.onabort = () => reject(loiFn ?? t.error ?? new Error("Giao dịch hàng đợi đã bị huỷ"));
      const goi = <R>(f: () => IDBRequest<R>): Promise<R> => {
        try {
          return yeuCau(f());
        } catch (e) {
          return Promise.reject(e);
        }
      };
      const api: TxApi = {
        get: <R>(s: string, k: IDBValidKey) =>
          goi(() => t.objectStore(s).get(k) as IDBRequest<R | undefined>),
        getAllByIndex: <R>(s: string, i: string, k: IDBValidKey) =>
          goi(() => t.objectStore(s).index(i).getAll(k) as IDBRequest<R[]>),
        put: (s, v) => goi(() => t.objectStore(s).put(v)).then(() => undefined),
        delete: (s, k) => goi(() => t.objectStore(s).delete(k)).then(() => undefined),
        count: (s, i) =>
          goi(() => (i ? t.objectStore(s).index(i.name).count(i.key) : t.objectStore(s).count())),
      };
      fn(api).then(
        (v) => {
          ketQua = { v };
        },
        (e: unknown) => {
          loiFn = e ?? new Error("Giao dịch hàng đợi lỗi");
          try {
            t.abort();
          } catch {
            /* giao dịch đã kết thúc — oncomplete/onabort sẽ reject */
          }
        },
      );
    });
  }
}

// ── Bộ nhớ (unit test + môi trường không có IndexedDB) ─────────────────────────────────────

/**
 * TxDb trong bộ nhớ: transaction tuần tự (giống readwrite IDB trên cùng store), chạy trên bản
 * sao và chỉ áp khi commit. `hongKhiCommit` giả lập abort SAU khi mọi request đã success
 * (quota/lỗi đĩa) để kiểm "không báo đã lưu".
 */
export class MemoryTxDb implements TxDb {
  data = new Map<string, Map<string, unknown>>();
  hongKhiCommit: ((stores: string[], mode: IDBTransactionMode) => Error | null) | null = null;
  private hang: Promise<unknown> = Promise.resolve();

  constructor(stores: string[] = [STORE_OPS, STORE_META]) {
    for (const s of stores) this.data.set(s, new Map());
  }

  async storeNames(): Promise<string[]> {
    return [...this.data.keys()];
  }

  tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: TxApi) => Promise<T>): Promise<T> {
    const chay = async (): Promise<T> => {
      const ban = new Map<string, Map<string, unknown>>();
      for (const s of stores) {
        const goc = this.data.get(s);
        if (!goc) throw new Error(`NotFoundError: ${s}`);
        ban.set(s, new Map([...goc].map(([k, v]) => [k, structuredClone(v)])));
      }
      const khoa = (k: IDBValidKey) => JSON.stringify(k);
      const kho = (s: string) => {
        const m = ban.get(s);
        if (!m) throw new Error(`NotFoundError: ${s}`);
        return m;
      };
      const keyPath = (s: string) => (s === STORE_META ? "k" : "operationId");
      const api: TxApi = {
        get: async <R>(s: string, k: IDBValidKey) =>
          structuredClone(kho(s).get(khoa(k))) as R | undefined,
        getAllByIndex: async <R>(s: string, i: string, k: IDBValidKey) =>
          [...kho(s).values()]
            .filter((v) => (v as Record<string, unknown>)[i] === k)
            .map((v) => structuredClone(v) as R),
        put: async (s, v) => {
          if (mode !== "readwrite") throw new Error("ReadOnlyError");
          const k = (v as Record<string, IDBValidKey>)[keyPath(s)];
          kho(s).set(khoa(k), structuredClone(v));
        },
        delete: async (s, k) => {
          if (mode !== "readwrite") throw new Error("ReadOnlyError");
          kho(s).delete(khoa(k));
        },
        count: async (s, i) =>
          i
            ? [...kho(s).values()].filter((v) => (v as Record<string, unknown>)[i.name] === i.key)
                .length
            : kho(s).size,
      };
      const v = await fn(api);
      const loi = this.hongKhiCommit?.(stores, mode);
      if (loi) throw loi;
      if (mode === "readwrite") for (const [s, m] of ban) this.data.set(s, m);
      return v;
    };
    const p = this.hang.then(chay, chay);
    this.hang = p.catch(() => undefined);
    return p;
  }
}

// ── Thao tác hàng đợi trên TxDb ────────────────────────────────────────────────────────────

type MetaHangDoi = { k: "queue"; rev: number; lastSeq: number; photoBytes: number };
type MetaLease = { k: string; holder: string; token: number; expiresAt: number };

const META_KEY = "queue";
const khoaLease = (c: ChuSoHuu) => `lease|${khoaPhamVi(c)}`;

async function docMeta(t: TxApi): Promise<MetaHangDoi> {
  return (
    (await t.get<MetaHangDoi>(STORE_META, META_KEY)) ?? {
      k: META_KEY,
      rev: 0,
      lastSeq: 0,
      photoBytes: 0,
    }
  );
}

const cungPhamVi = (r: QueueRecord, c: ChuSoHuu) =>
  r.owner === khoaChu(c) && r.projectId === c.projectId;

export class QueueDb implements QueueStore {
  constructor(private readonly db: TxDb) {}

  async docChu(owner: string) {
    return this.db.tx([STORE_OPS, STORE_META], "readonly", async (t) => {
      const meta = await docMeta(t);
      const ops = await t.getAllByIndex<QueueRecord>(STORE_OPS, "owner", owner);
      return { rev: meta.rev, lastSeq: meta.lastSeq, ops };
    });
  }

  async themNguyenTu(input: { expectRev: number; record: QueueRecord; xoa: string[] }) {
    const { record } = input;
    return this.db.tx([STORE_OPS, STORE_META], "readwrite", async (t) => {
      const meta = await docMeta(t);
      if (meta.rev !== input.expectRev || record.sequence !== meta.lastSeq + 1)
        return "stale" as const;
      let photoBytes = meta.photoBytes;
      for (const id of input.xoa) {
        const cu = await t.get<QueueRecord>(STORE_OPS, id);
        // Rev chưa đổi thì op còn nguyên; kiểm lại cho chắc — không xoá op đã từng gửi.
        if (!cu || cu.state !== "pending" || cu.tries !== 0 || cu.owner !== record.owner)
          return "stale" as const;
        if (cu.kind === "photo") photoBytes -= cu.bytes;
        await t.delete(STORE_OPS, id);
      }
      if (record.kind === "photo") {
        // Hạn mức tính trên ciphertext đang tồn của MỌI chủ trên thiết bị: không xoá dữ liệu
        // người khác để lấy chỗ, chỉ từ chối thao tác mới.
        if (photoBytes + record.bytes > PHOTO_QUOTA_BYTES) throw new LoiHanMucAnh();
        photoBytes += record.bytes;
      }
      await t.put(STORE_OPS, record);
      await t.put(STORE_META, {
        ...meta,
        rev: meta.rev + 1,
        lastSeq: record.sequence,
        photoBytes,
      });
      return "ok" as const;
    });
  }

  async xinLease(phamVi: ChuSoHuu, holder: string, now: number): Promise<Lease | null> {
    return this.db.tx([STORE_OPS, STORE_META], "readwrite", async (t) => {
      const cu = await t.get<MetaLease>(STORE_META, khoaLease(phamVi));
      if (cu && cu.holder !== holder && cu.expiresAt > now) return null;
      // Kỳ lease MỚI (người khác, hoặc chính mình sau khi đã trả/hết hạn) → token mới.
      const doiNguoi = !cu || cu.holder !== holder || cu.expiresAt <= now;
      const token = doiNguoi ? (cu?.token ?? 0) + 1 : cu.token;
      await t.put(STORE_META, {
        k: khoaLease(phamVi),
        holder,
        token,
        expiresAt: now + LEASE_TTL_MS,
      } satisfies MetaLease);
      if (doiNguoi) {
        // Op đang `sending` của người giữ cũ (tab chết/lease hết/mất ACK) → pending với CÙNG
        // operationId: gửi lại an toàn vì server dedup theo receipt.
        const ops = await t.getAllByIndex<QueueRecord>(STORE_OPS, "owner", khoaChu(phamVi));
        let doi = false;
        for (const r of ops) {
          if (!cungPhamVi(r, phamVi) || r.state !== "sending" || r.sendingToken === token) continue;
          await t.put(STORE_OPS, {
            ...r,
            state: "pending",
            sendingToken: undefined,
            nextAttemptAt: now,
          });
          doi = true;
        }
        if (doi) {
          const meta = await docMeta(t);
          await t.put(STORE_META, { ...meta, rev: meta.rev + 1 });
        }
      }
      return { token };
    });
  }

  async giaHanLease(phamVi: ChuSoHuu, holder: string, token: number, now: number) {
    return this.db.tx([STORE_META], "readwrite", async (t) => {
      const cu = await t.get<MetaLease>(STORE_META, khoaLease(phamVi));
      if (!cu || cu.holder !== holder || cu.token !== token) return false;
      await t.put(STORE_META, { ...cu, expiresAt: now + LEASE_TTL_MS });
      return true;
    });
  }

  async traLease(phamVi: ChuSoHuu, holder: string, token: number) {
    await this.db.tx([STORE_META], "readwrite", async (t) => {
      const cu = await t.get<MetaLease>(STORE_META, khoaLease(phamVi));
      // Giữ bản ghi (token phải tiếp tục tăng đơn điệu), chỉ cho hết hạn ngay.
      if (cu && cu.holder === holder && cu.token === token)
        await t.put(STORE_META, { ...cu, expiresAt: 0 });
    });
  }

  async batDauGui(phamVi: ChuSoHuu, id: string, holder: string, token: number, now: number) {
    return this.db.tx([STORE_OPS, STORE_META], "readwrite", async (t) => {
      const l = await t.get<MetaLease>(STORE_META, khoaLease(phamVi));
      if (!l || l.holder !== holder || l.token !== token || l.expiresAt <= now) return null;
      const r = await t.get<QueueRecord>(STORE_OPS, id);
      if (!r || !cungPhamVi(r, phamVi) || r.state !== "pending") return null;
      const moi: QueueRecord = { ...r, state: "sending", tries: r.tries + 1, sendingToken: token };
      await t.put(STORE_OPS, moi);
      const meta = await docMeta(t);
      await t.put(STORE_META, { ...meta, rev: meta.rev + 1 });
      return moi;
    });
  }

  async apKetQua(
    phamVi: ChuSoHuu,
    id: string,
    holder: string,
    token: number,
    thayDoi: ThayDoiSauGui,
  ) {
    return this.db.tx([STORE_OPS, STORE_META], "readwrite", async (t) => {
      const l = await t.get<MetaLease>(STORE_META, khoaLease(phamVi));
      // Token phải còn là của mình (kể cả khi đã quá hạn mà chưa ai chiếm).
      if (!l || l.holder !== holder || l.token !== token) return false;
      const r = await t.get<QueueRecord>(STORE_OPS, id);
      const meta = await docMeta(t);
      if (!r || r.state !== "sending" || r.sendingToken !== token) {
        // Op đã bị người dùng xử lý (vd lưu trực tiếp nhật ký) trong lúc đang gửi — bỏ kết quả.
        return true;
      }
      if ("xoa" in thayDoi) {
        await t.delete(STORE_OPS, id);
        const photoBytes = r.kind === "photo" ? meta.photoBytes - r.bytes : meta.photoBytes;
        await t.put(STORE_META, { ...meta, rev: meta.rev + 1, photoBytes });
        return true;
      }
      await t.put(STORE_OPS, {
        ...r,
        state: thayDoi.state,
        sendingToken: undefined,
        nextAttemptAt: thayDoi.nextAttemptAt ?? r.nextAttemptAt,
        lastResult: thayDoi.lastResult ?? r.lastResult,
      } satisfies QueueRecord);
      await t.put(STORE_META, { ...meta, rev: meta.rev + 1 });
      return true;
    });
  }

  async xoaTheoYeuCau(owner: string, ids: string[]) {
    if (!ids.length) return;
    await this.db.tx([STORE_OPS, STORE_META], "readwrite", async (t) => {
      const meta = await docMeta(t);
      let photoBytes = meta.photoBytes;
      for (const id of ids) {
        const r = await t.get<QueueRecord>(STORE_OPS, id);
        if (!r || r.owner !== owner) continue; // không bao giờ xoá op của chủ khác
        if (r.kind === "photo") photoBytes -= r.bytes;
        await t.delete(STORE_OPS, id);
      }
      await t.put(STORE_META, { ...meta, rev: meta.rev + 1, photoBytes });
    });
  }

  async moLaiPausedAuth(phamVi: ChuSoHuu, now: number) {
    return this.db.tx([STORE_OPS, STORE_META], "readwrite", async (t) => {
      const ops = await t.getAllByIndex<QueueRecord>(STORE_OPS, "owner", khoaChu(phamVi));
      let n = 0;
      for (const r of ops) {
        if (!cungPhamVi(r, phamVi) || r.state !== "paused_auth") continue;
        await t.put(STORE_OPS, { ...r, state: "pending", nextAttemptAt: now });
        n++;
      }
      if (n) {
        const meta = await docMeta(t);
        await t.put(STORE_META, { ...meta, rev: meta.rev + 1 });
      }
      return n;
    });
  }

  /**
   * "Gửi lại ngay" (người dùng bấm, S08): op `pending` đang chờ backoff được đưa về hạn gửi ngay.
   * GIỮ hạn của op vừa nhận 429/503 — Retry-After là yêu cầu của máy chủ, không retry mù (D04).
   */
  async datLaiHanGui(phamVi: ChuSoHuu, now: number) {
    return this.db.tx([STORE_OPS, STORE_META], "readwrite", async (t) => {
      const ops = await t.getAllByIndex<QueueRecord>(STORE_OPS, "owner", khoaChu(phamVi));
      let n = 0;
      for (const r of ops) {
        if (!cungPhamVi(r, phamVi) || r.state !== "pending" || r.nextAttemptAt <= now) continue;
        const s = r.lastResult?.status;
        if (s === 429 || s === 503) continue;
        await t.put(STORE_OPS, { ...r, nextAttemptAt: now });
        n++;
      }
      if (n) {
        const meta = await docMeta(t);
        await t.put(STORE_META, { ...meta, rev: meta.rev + 1 });
      }
      return n;
    });
  }

  /** Tổng số op v2 trên thiết bị (mọi chủ) — chỉ đếm. */
  async demOp(): Promise<number> {
    return this.db.tx([STORE_OPS], "readonly", (t) => t.count(STORE_OPS));
  }

  /** Số op v2 của user này trên thiết bị (đếm qua index, không giải mã — dùng khi vault khoá). */
  async demOpCuaUser(userId: number): Promise<number> {
    return this.db.tx([STORE_OPS], "readonly", (t) =>
      t.count(STORE_OPS, { name: "ownerUserId", key: userId }),
    );
  }

  /** Có op v2 nào của owner này trên thiết bị không (quyết định có cần mở vault để gửi). */
  async coOpCuaUser(userId: number): Promise<boolean> {
    return this.db.tx(
      [STORE_OPS],
      "readonly",
      async (t) => (await t.count(STORE_OPS, { name: "ownerUserId", key: userId })) > 0,
    );
  }

  /**
   * Queue v1 không chủ còn tồn trên thiết bị? CHỈ đếm (không đọc nội dung, không xoá) — để báo
   * blocker đối soát legacy (D03), không bao giờ tự nhận chủ.
   */
  async coLegacy(): Promise<boolean> {
    return (await this.demLegacy()) > 0;
  }

  /** Số bản ghi queue v1 không chủ (CHỈ đếm — màn phục hồi S08 giải thích, không hiện nội dung). */
  async demLegacy(): Promise<number> {
    const names = await this.db.storeNames();
    if (!names.includes(LEGACY_STORE)) return 0;
    return this.db.tx([LEGACY_STORE], "readonly", (t) => t.count(LEGACY_STORE));
  }
}

// Queue cũ (localStorage, rồi IndexedDB v1) không có owner/org/project nên không thể gán an toàn
// cho actor hiện tại. Giữ nguyên byte, không chép/đọc/xoá — chỉ đối soát thủ công (D03).
export async function migrateFromLocalStorage(_store: unknown): Promise<void> {
  // cố ý giữ nguyên legacy data chưa rõ chủ
}
