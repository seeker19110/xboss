import "./setup";
// Công tắc dừng khẩn cấp OFFLINE_QUEUE_QUARANTINED (rollback S07: "dừng sender, giữ vault") —
// chạy source THẬT của index.ts trong VM, chỉ giả lập biên React/Toast/IndexedDB/vault. Bật công
// tắc thì manager KHÔNG đọc/ghi/xoá storage, KHÔNG mở vault, KHÔNG gửi; enqueue báo thất bại rõ.
// Mặc định từ S07 công tắc TẮT (queue v2 hoạt động) — test thứ hai canh điều đó.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as logic from "@/app/components/offlineQueue/logic";
import { OFFLINE_QUEUE_QUARANTINED } from "@/app/components/offlineQueue";

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

type Manager = {
  start(): void;
  flush(): Promise<void>;
  enqueueTick(dimId: number, installed: boolean): Promise<boolean>;
  enqueueTickBatch(dimIds: number[], installed: boolean): Promise<boolean>;
  enqueuePhoto(input: { taskId: number; blob: Blob }): Promise<{ ok: boolean; error?: string }>;
  enqueueDiaryNote(input: { date: string }, etag: string | null): Promise<{ ok: boolean }>;
  chuanBiTracking(tasks: { id: number }[]): Promise<void>;
  chuanBiNhatKy(date: string): Promise<void>;
  dangKyLuoi(tasks: { id: number; cells: Record<string, { id: number }> }[]): void;
  getSnapshot(): { quarantined: boolean };
};

test("công tắc dừng khẩn cấp bật: không đụng storage/vault/mạng, enqueue thất bại rõ", async () => {
  const dem = { store: 0, vault: 0, send: 0 };
  const storeProxy = new Proxy(
    {},
    {
      get: () => () => {
        dem.store++;
        return Promise.resolve({ rev: 0, lastSeq: 0, ops: [] });
      },
    },
  );
  class VaultGia {
    trangThai = "unknown";
    onDoi() {
      return () => {};
    }
    chu() {
      dem.vault++;
      return { ownerUserId: 1, orgId: 1, projectId: 1, deviceId: "x" };
    }
    conHieuLuc() {
      dem.vault++;
      return true;
    }
    moKhoa() {
      dem.vault++;
      return Promise.resolve(true);
    }
    timKhoa() {
      dem.vault++;
      return "key";
    }
    damBaoKhoa() {
      dem.vault++;
      return Promise.resolve(true);
    }
    coKhoa() {
      return true;
    }
    khoa() {}
  }
  const src = load<{
    OfflineQueueManager: new (d: unknown) => Manager;
    OFFLINE_QUEUE_QUARANTINED: boolean;
  }>(
    "app/components/offlineQueue/index.ts",
    {
      react: { useCallback: (f: unknown) => f, useEffect() {}, useSyncExternalStore: () => ({}) },
      "./store": { IdbTxDb: class {}, QueueDb: class {}, LoiHanMucAnh: class extends Error {} },
      "./image": { compressImage: async (blob: Blob) => ({ blob, mime: "image/jpeg" }) },
      "./vault": { VaultSession: VaultGia },
      "@/app/components/Toast": { showToast() {} },
      "@/app/lib/contextEpoch": { ngheDoiNguCanh: () => () => {} },
      "./logic": logic,
    },
    { navigator: { onLine: true }, crypto: globalThis.crypto, Date },
  );
  src.OFFLINE_QUEUE_QUARANTINED = true; // mô phỏng rollback bằng công tắc
  const q = new src.OfflineQueueManager({
    store: storeProxy,
    vault: new VaultGia(),
    send: async () => {
      dem.send++;
      return { status: 200 };
    },
  });
  q.dangKyLuoi([{ id: 1, cells: { a: { id: 7 } } }]);
  await q.chuanBiTracking([{ id: 1 }]);
  await q.chuanBiNhatKy("2026-10-05");
  await q.flush();
  assert.equal(await q.enqueueTick(7, true), false);
  assert.equal(await q.enqueueTickBatch([7], true), false);
  assert.equal((await q.enqueuePhoto({ taskId: 1, blob: new Blob(["x"]) })).ok, false);
  assert.equal((await q.enqueueDiaryNote({ date: "2026-10-05" }, null)).ok, false);
  assert.deepEqual(dem, { store: 0, vault: 0, send: 0 }, "không storage, không vault, không gửi");
});

test("mặc định từ S07: hàng đợi v2 hoạt động (công tắc dừng khẩn cấp TẮT)", () => {
  assert.equal(OFFLINE_QUEUE_QUARANTINED, false);
});
