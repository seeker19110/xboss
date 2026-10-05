import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Chạy source thật; chỉ giả lập biên React và storage để kiểm queue v1 bị cách ly.
function load<T>(path: string, mocks: Record<string, unknown>, globals = {}): T {
  const filename = resolve(path);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const evaluatedModule = { exports: {} };
  runInNewContext(
    outputText,
    {
      module: evaluatedModule,
      exports: evaluatedModule.exports,
      Buffer,
      require: (name: string) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        throw new Error(`Dependency chưa được giả lập: ${name}`);
      },
      ...globals,
    },
    { filename, timeout: 1000 },
  );
  return evaluatedModule.exports as T;
}

type Op = { id: number; kind: string; payload: unknown; queuedAt: number; tries: number };
type Queue = {
  start(): void;
  flush(): Promise<void>;
  enqueueTick(dimId: number, installed: boolean): Promise<boolean>;
  enqueueTickBatch(dimIds: number[], installed: boolean): Promise<boolean>;
  enqueuePhoto(input: { taskId: number; blob: Blob }): Promise<{ ok: boolean; error?: string }>;
  enqueueDiaryNote(input: { date: string }): Promise<{ ok: boolean; error?: string }>;
  getQueuedPhotos(taskId: number): Promise<unknown[]>;
  getQueuedPhotoBlob(id: number): Promise<Blob | undefined>;
  getQueuedDiaryNote(date: string): Promise<unknown>;
  discardDiaryDraft(date: string): Promise<void>;
  clear(): Promise<void>;
  getSnapshot(): { total: number; sending: boolean; quarantined: boolean };
};

function fixture() {
  const privatePhoto = new Blob(["owner A photo payload"]);
  const legacy: Op[] = [
    {
      id: 41,
      kind: "photo",
      payload: { taskId: 7, caption: "private A caption", blob: privatePhoto },
      queuedAt: 11,
      tries: 2,
    },
    {
      id: 42,
      kind: "diary_note",
      payload: { date: "2026-10-05", workDone: "private A diary" },
      queuedAt: 12,
      tries: 0,
    },
  ];
  const state = { reads: 0, writes: 0, removes: 0, clears: 0, sends: 0, syncs: 0 };
  const listeners = new Map<string, (() => void)[]>();
  const serviceWorkerListeners: ((event: unknown) => void)[] = [];
  const storage = new Map<string, string>([["xboss-offline-ticks", '[{"dimId":7}]']]);
  let intervals = 0;

  class Store {
    async getAll() {
      state.reads++;
      return legacy.slice();
    }
    async add() {
      state.writes++;
      return 100;
    }
    async remove() {
      state.removes++;
    }
    async clear() {
      state.clears++;
    }
  }
  const react = {
    useCallback: (fn: unknown) => fn,
    useEffect() {},
    useSyncExternalStore: () => ({ total: 0, pending: 0, failed: 0 }),
  };
  const source = load<{
    offlineQueue: Queue;
    clearOfflineQueue: () => Promise<void>;
    OFFLINE_QUEUE_QUARANTINED: boolean;
    OFFLINE_QUEUE_QUARANTINE_ERROR: string;
  }>(
    "app/components/offlineQueue/index.ts",
    {
      react,
      "./store": { IdbQueueStore: Store },
      "./image": { compressImage: async (blob: Blob) => ({ blob, mime: "image/jpeg" }) },
      "@/app/components/Toast": { showToast() {} },
      "./logic": {
        computeStats: () => ({ total: 0, pending: 0, failed: 0 }),
        flushQueue: async () => {
          state.sends++;
          return { tuChoi: [] };
        },
        opEndpoint: () => ({ url: "/api/example", method: "POST" }),
        tickDedupeIds: () => [],
        tickBatchDedupeIds: () => [],
        diaryDedupeIds: () => [],
        wouldExceedPhotoQuota: () => false,
        PHOTO_QUOTA_BYTES: 100,
        type: {},
      },
    },
    {
      window: {
        addEventListener(name: string, listener: () => void) {
          listeners.set(name, [...(listeners.get(name) ?? []), listener]);
        },
      },
      navigator: {
        onLine: true,
        serviceWorker: {
          addEventListener(_name: string, listener: (event: unknown) => void) {
            serviceWorkerListeners.push(listener);
          },
          ready: Promise.resolve({ sync: { register: async () => state.syncs++ } }),
        },
      },
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        removeItem(key: string) {
          storage.delete(key);
        },
      },
      setInterval: () => ++intervals,
    },
  );
  return {
    ...source,
    state,
    legacy,
    storage,
    listeners,
    serviceWorkerListeners,
    intervals: () => intervals,
  };
}

test("queue v1 stays byte-for-byte quarantined across login/logout and 401 cleanup", async () => {
  const f = fixture();
  const before = structuredClone(f.legacy);
  const localStorageBefore = [...f.storage.entries()];

  f.offlineQueue.start();
  await f.offlineQueue.flush();
  await f.clearOfflineQueue();
  await f.offlineQueue.clear();
  await f.offlineQueue.discardDiaryDraft("2026-10-05");

  assert.deepEqual(f.legacy, before);
  assert.deepEqual([...f.storage.entries()], localStorageBefore);
  assert.equal(f.state.reads, 0);
  assert.equal(f.state.writes, 0);
  assert.equal(f.state.removes, 0);
  assert.equal(f.state.clears, 0);
  assert.equal(f.state.sends, 0);
  assert.equal(f.offlineQueue.getSnapshot().quarantined, true);
});

test("online, Background Sync, and an account switch cannot send or expose unknown-owner ops", async () => {
  const f = fixture();
  f.offlineQueue.start();
  for (const listener of f.listeners.get("online") ?? []) listener();
  for (const listener of f.serviceWorkerListeners) listener({ data: { type: "FLUSH_QUEUE" } });
  await f.offlineQueue.flush();

  assert.equal((await f.offlineQueue.getQueuedPhotos(7)).length, 0);
  assert.equal(await f.offlineQueue.getQueuedPhotoBlob(41), undefined);
  assert.equal(await f.offlineQueue.getQueuedDiaryNote("2026-10-05"), undefined);
  assert.equal(f.state.reads, 0);
  assert.equal(f.state.sends, 0);
  assert.equal(f.state.syncs, 0);
  assert.equal(f.intervals(), 0);
});

test("new offline writes fail clearly instead of joining unknown-owner queue", async () => {
  const f = fixture();
  assert.equal(await f.offlineQueue.enqueueTick(7, true), false);
  assert.equal(await f.offlineQueue.enqueueTickBatch([7, 8], true), false);
  const photo = await f.offlineQueue.enqueuePhoto({ taskId: 7, blob: new Blob(["new photo"]) });
  const diary = await f.offlineQueue.enqueueDiaryNote({ date: "2026-10-05" });

  assert.equal(photo.ok, false);
  assert.equal(photo.error, f.OFFLINE_QUEUE_QUARANTINE_ERROR);
  assert.equal(diary.ok, false);
  assert.equal(diary.error, f.OFFLINE_QUEUE_QUARANTINE_ERROR);
  assert.equal(f.state.reads, 0);
  assert.equal(f.state.writes, 0);
  assert.equal(f.state.sends, 0);
});
