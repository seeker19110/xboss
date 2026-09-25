import "./setup"; // Không cho test đọc cấu hình DB production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { randomInt } from "node:crypto";
import ts from "typescript";

// Chạy source thật; chỉ giả lập biên framework/storage. Không thay test DB/browser.
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
type Result = { tuChoi: { soO: number; lyDo?: string }[] };
type Manager = {
  flush(): Promise<void>;
  enqueueTick(dimId: number, installed: boolean): Promise<void>;
  enqueueTickBatch(dimIds: number[], installed: boolean): Promise<void>;
  onFlushed(callback: () => void): () => void;
  getSnapshot(): { total: number; sending: boolean };
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((done) => setImmediate(done));
function fixture(
  opts: {
    online?: boolean;
    hasNavigator?: boolean;
    getAll?: (call: number, items: Op[]) => Promise<Op[]>;
    flush?: () => Promise<Result>;
    addFails?: boolean;
  } = {},
) {
  let items: Op[] = [];
  const state = { reads: 0, flushes: 0, adds: 0, syncs: 0 };
  const notices: string[] = [];
  const nav = {
    onLine: opts.online ?? true,
    serviceWorker: {
      ready: Promise.resolve({
        sync: {
          register: async (tag: string) => {
            assert.equal(tag, "xboss-flush");
            state.syncs++;
          },
        },
      }),
    },
  };
  class Store {
    async getAll() {
      state.reads++;
      return opts.getAll ? opts.getAll(state.reads, items) : [...items];
    }
    async add(input: Omit<Op, "id">) {
      if (opts.addFails) throw new Error("store add failed");
      state.adds++;
      const id = randomInt(100, 10000);
      items.push({ ...input, id });
      return id;
    }
    async remove(id: number) {
      items = items.filter((op) => op.id !== id);
    }
  }
  const source = load<{ offlineQueue: Manager }>(
    "app/components/offlineQueue/index.ts",
    {
      react: {},
      "./store": { IdbQueueStore: Store },
      "./image": {},
      "@/app/components/Toast": { showToast: (message: string) => notices.push(message) },
      "./logic": {
        computeStats: (ops: Op[]) => ({ total: ops.length, pending: ops.length, failed: 0 }),
        tickDedupeIds: () => [],
        tickBatchDedupeIds: () => [],
        flushQueue: async () => {
          state.flushes++;
          if (opts.flush) return opts.flush();
          items = [];
          return { tuChoi: [] };
        },
      },
    },
    opts.hasNavigator === false ? {} : { navigator: nav },
  );
  const queue = source.offlineQueue;
  const op: Op = { id: randomInt(100, 10000), kind: "tick", payload: {}, queuedAt: 0, tries: 0 };
  return {
    queue,
    state,
    nav,
    op,
    notices,
    seed: () => {
      items = [op];
    },
  };
}

test("queue: khóa phải có trước lần đọc storage đầu tiên", async () => {
  const gate = deferred<Op[]>();
  const f = fixture({ getAll: async (n, items) => (n === 1 ? gate.promise : [...items]) });
  f.seed();
  const first = f.queue.flush();
  await tick();
  const second = f.queue.flush();
  gate.resolve([f.op]);
  await Promise.all([first, second]);
  assert.equal(f.state.flushes, 1);
  assert.equal(f.queue.getSnapshot().sending, false);
});

test("queue: giữ khóa trong lúc refreshStats đang chờ", async () => {
  const cleanup = deferred<Op[]>();
  const entered = deferred<void>();
  const f = fixture({
    getAll: async (n, items) => {
      if (n === 2) {
        entered.resolve();
        return cleanup.promise;
      }
      return [...items];
    },
  });
  f.seed();
  const first = f.queue.flush();
  await entered.promise;
  const second = f.queue.flush();
  await tick();
  const readCountWhileLocked = f.state.reads;
  cleanup.resolve([]);
  await Promise.all([first, second]);
  assert.equal(readCountWhileLocked, 2);
});

test("queue: storage read lỗi không giữ cờ khóa vĩnh viễn", async () => {
  const f = fixture({
    getAll: async (n, items) => {
      if (n === 1) throw new Error("read failed");
      return [...items];
    },
  });
  f.seed();
  await assert.rejects(f.queue.flush(), /read failed/);
  assert.equal(f.queue.getSnapshot().sending, false);
  await f.queue.flush();
  assert.equal(f.state.flushes, 1);
});

test("queue: refreshStats lỗi vẫn tắt trạng thái sending và mở khóa", async () => {
  const f = fixture({
    getAll: async (n, items) => {
      if (n === 2) throw new Error("stats failed");
      return [...items];
    },
  });
  f.seed();
  await assert.rejects(f.queue.flush(), /stats failed/);
  assert.equal(f.queue.getSnapshot().sending, false);
  f.seed();
  await f.queue.flush();
  assert.equal(f.state.flushes, 2);
});

test("queue: lỗi sender giữ queue, không báo đã gửi hết", async () => {
  let attempts = 0;
  const f = fixture({
    flush: async () => {
      if (++attempts === 1) throw new Error("send failed");
      return { tuChoi: [] };
    },
  });
  let flushed = 0;
  f.queue.onFlushed(() => flushed++);
  f.seed();
  await assert.rejects(f.queue.flush(), /send failed/);
  assert.equal(f.queue.getSnapshot().sending, false);
  assert.equal(f.queue.getSnapshot().total, 1);
  assert.equal(flushed, 0);
  await f.queue.flush();
  assert.equal(attempts, 2);
});

test("queue: rỗng không gọi sender hoặc callback hoàn tất giả", async () => {
  const f = fixture();
  f.queue.onFlushed(() => assert.fail("Queue ban đầu rỗng"));
  await f.queue.flush();
  await f.queue.flush();
  assert.equal(f.state.flushes, 0);
  assert.equal(f.queue.getSnapshot().sending, false);
});

for (const hasNavigator of [false, true]) {
  test(`queue: offline/SSR không đọc storage, navigator=${hasNavigator}`, async () => {
    const f = fixture({ hasNavigator, online: false });
    f.seed();
    await f.queue.flush();
    assert.equal(f.state.reads, 0);
    assert.equal(f.state.flushes, 0);
  });
}

test("queue: hoàn tất chỉ phát callback một lần", async () => {
  const f = fixture();
  let completions = 0;
  f.queue.onFlushed(() => completions++);
  f.seed();
  await f.queue.flush();
  await f.queue.flush();
  assert.equal(completions, 1);
  assert.equal(f.queue.getSnapshot().total, 0);
});

test("queue: batch online gọi sender sau khi lưu, không đợi interval", async () => {
  const f = fixture();
  await f.queue.enqueueTickBatch([randomInt(100, 10000)], true);
  await tick();
  assert.equal(f.state.adds, 1);
  assert.equal(f.state.flushes, 1);
});

test("queue: batch offline đăng ký sync khi được hỗ trợ", async () => {
  const f = fixture({ online: false });
  await f.queue.enqueueTickBatch([randomInt(100, 10000)], true);
  await tick();
  assert.equal(f.state.syncs, 1);
  assert.equal(f.state.flushes, 0);
  assert.equal(f.queue.getSnapshot().total, 1);
});

test("queue: batch rỗng không ghi hoặc đánh thức sender", async () => {
  const f = fixture();
  await f.queue.enqueueTickBatch([], true);
  await tick();
  assert.equal(f.state.adds, 0);
  assert.equal(f.state.flushes, 0);
  assert.equal(f.state.syncs, 0);
});

test("queue: add batch thất bại không gửi hoặc báo đồng bộ", async () => {
  const f = fixture({ addFails: true });
  await assert.rejects(f.queue.enqueueTickBatch([randomInt(100, 10000)], true), /add failed/);
  assert.equal(f.state.flushes, 0);
  assert.equal(f.state.syncs, 0);
});

test("queue: tick đơn vẫn đánh thức sender như trước", async () => {
  const f = fixture();
  await f.queue.enqueueTick(randomInt(100, 10000), true);
  await tick();
  assert.equal(f.state.adds, 1);
  assert.equal(f.state.flushes, 1);
});
