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
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath `id` autoIncrement → id tăng dần = thứ tự FIFO tự nhiên khi getAll.
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Bọc 1 request IDB thành Promise.
function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IdbQueueStore implements QueueStore {
  // Cache 1 connection duy nhất cho cả instance thay vì mở mới mỗi thao tác — tránh tích
  // luỹ handle IDB trong phiên dài, mở cùng DB/store/version như trước.
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDB();
    return this.dbPromise;
  }

  async getAll(): Promise<QueuedOp[]> {
    const db = await this.getDb();
    const tx = db.transaction(STORE, "readonly");
    const all = await promisify(tx.objectStore(STORE).getAll() as IDBRequest<QueuedOp[]>);
    return all.sort((a, b) => a.id - b.id);
  }
  async add(op: QueuedOpInput): Promise<number> {
    const db = await this.getDb();
    const tx = db.transaction(STORE, "readwrite");
    // add() với autoIncrement trả về key (id) vừa cấp.
    const key = await promisify(tx.objectStore(STORE).add(op) as IDBRequest<IDBValidKey>);
    return Number(key);
  }
  async update(op: QueuedOp): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(STORE, "readwrite");
    await promisify(tx.objectStore(STORE).put(op) as IDBRequest<IDBValidKey>);
  }
  async remove(id: number): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(STORE, "readwrite");
    await promisify(tx.objectStore(STORE).delete(id));
  }
  async clear(): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(STORE, "readwrite");
    await promisify(tx.objectStore(STORE).clear());
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
