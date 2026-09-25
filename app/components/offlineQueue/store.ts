// Lớp truy cập IndexedDB cho hàng đợi offline + di trú êm từ localStorage cũ.
// Chỉ chạy phía trình duyệt (mọi hàm tự guard `indexedDB`/`localStorage`).
import type { QueueStore, QueuedOp, QueuedOpInput } from "./logic";

const DB_NAME = "xboss-offline";
const DB_VERSION = 1;
const STORE = "ops";
// Key localStorage của khung tick cũ — đọc 1 lần để di trú rồi xoá.
export const OLD_LS_KEY = "xboss-offline-ticks";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath `id` autoIncrement → id tăng dần = thứ tự FIFO tự nhiên khi getAll.
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onblocked = () => {
      blocked = true;
      reject(new Error("Hàng đợi đang được tab khác sử dụng. Đóng tab cũ rồi thử lại."));
    };
    req.onsuccess = () => {
      // open() không hủy được sau blocked: đóng handle đến muộn để không rò connection.
      if (blocked) req.result.close();
      else resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error("Không mở được hàng đợi ngoại tuyến"));
  });
}

/**
 * Request success chưa phải COMMIT. Chỉ resolve khi transaction complete; nếu abort sau
 * request success thì caller vẫn nhận lỗi, không báo dữ liệu đã lưu/xóa thành công.
 */
function committedRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result: T;
    let hasResult = false;
    let requestError: DOMException | null = null;
    tx.oncomplete = () => {
      if (hasResult) resolve(result);
      else reject(new Error("Giao dịch hàng đợi hoàn tất nhưng không có kết quả"));
    };
    tx.onabort = () => {
      reject(tx.error ?? requestError ?? new Error("Giao dịch hàng đợi đã bị hủy"));
    };
    // Không preventDefault: lỗi request phải được IndexedDB abort/rollback như bình thường.
    tx.onerror = () => {
      requestError = tx.error ?? requestError;
    };
    try {
      const req = createRequest(tx.objectStore(STORE));
      req.onsuccess = () => {
        result = req.result;
        hasResult = true;
      };
      req.onerror = () => {
        requestError = req.error;
      };
    } catch (error) {
      // Lỗi đồng bộ như DataCloneError cũng không được để transaction ghi tiếp.
      try {
        tx.abort();
      } catch {
        /* giao dịch đã kết thúc */
      }
      reject(error);
    }
  });
}

export class IdbQueueStore implements QueueStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      const opening = openDB()
        .then((db) => {
          const forgetConnection = () => {
            if (this.dbPromise === opening) this.dbPromise = null;
          };
          db.onversionchange = () => {
            db.close();
            forgetConnection();
          };
          db.onclose = forgetConnection;
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

  async getAll(): Promise<QueuedOp[]> {
    const db = await this.getDb();
    const all = await committedRequest(db, "readonly", (store) => {
      return store.getAll() as IDBRequest<QueuedOp[]>;
    });
    return all.sort((a, b) => a.id - b.id);
  }
  async add(op: QueuedOpInput): Promise<number> {
    const db = await this.getDb();
    const key = await committedRequest(db, "readwrite", (store) => store.add(op));
    return Number(key);
  }
  async update(op: QueuedOp): Promise<void> {
    const db = await this.getDb();
    await committedRequest(db, "readwrite", (store) => store.put(op));
  }
  async remove(id: number): Promise<void> {
    const db = await this.getDb();
    await committedRequest(db, "readwrite", (store) => store.delete(id));
  }
  async clear(): Promise<void> {
    const db = await this.getDb();
    await committedRequest(db, "readwrite", (store) => store.clear());
  }
}

// Di trú êm: đọc key tick cũ trong localStorage 1 lần, đẩy từng phần tử thành bản ghi
// `kind: "tick"` vào IndexedDB, rồi xoá key cũ. Vì đã xoá key, lần load sau `raw` rỗng
// → không lặp lại di trú.
export async function migrateFromLocalStorage(store: QueueStore): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(OLD_LS_KEY);
  } catch {
    return; // localStorage bị chặn — coi như không có gì để di trú
  }
  if (!raw) return;

  let arr: { dimId?: number; installed?: boolean; queuedAt?: number }[] = [];
  try {
    arr = JSON.parse(raw);
  } catch {
    arr = [];
  }
  if (Array.isArray(arr)) {
    for (const t of arr) {
      if (typeof t?.dimId === "number" && typeof t?.installed === "boolean") {
        await store.add({
          kind: "tick",
          payload: { dimId: t.dimId, installed: t.installed },
          queuedAt: typeof t.queuedAt === "number" ? t.queuedAt : Date.now(),
          tries: 0,
        });
      }
    }
  }
  try {
    localStorage.removeItem(OLD_LS_KEY);
  } catch {
    /* không xoá được (trường hợp cực hiếm) — di trú có thể lặp lần sau, chấp nhận được */
  }
}
