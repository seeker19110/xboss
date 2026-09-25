// Kiểm đúng source store.ts bằng sự kiện IndexedDB điều khiển được; không giả là browser E2E.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";

type RequestStub = {
  result?: unknown;
  error?: Error;
  onsuccess?: () => void;
  onerror?: () => void;
  onblocked?: () => void;
};
type TransactionStub = {
  request: RequestStub;
  error?: Error;
  oncomplete?: () => void;
  onabort?: () => void;
  onerror?: () => void;
  abort: () => void;
  objectStore: () => Record<string, () => RequestStub>;
};
type Store = {
  add: (value: unknown) => Promise<number>;
  update: (value: unknown) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clear: () => Promise<void>;
  getAll: () => Promise<{ id: number }[]>;
};

function fixture() {
  const opens: RequestStub[] = [];
  const transactions: TransactionStub[] = [];
  let closes = 0;
  let syncError: Error | undefined;
  const db: {
    close: () => void;
    transaction: () => TransactionStub;
    onversionchange?: () => void;
    onclose?: () => void;
  } = {
    close: () => closes++,
    transaction: () => {
      const request: RequestStub = {};
      const tx: TransactionStub = {
        request,
        abort: () => tx.onabort?.(),
        objectStore: () => {
          const issue = () => {
            if (syncError) throw syncError;
            return request;
          };
          return { add: issue, put: issue, delete: issue, clear: issue, getAll: issue };
        },
      };
      transactions.push(tx);
      return tx;
    },
  };
  const evaluatedModule = { exports: {} };
  const source = readFileSync("app/components/offlineQueue/store.ts", "utf8");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports: evaluatedModule.exports,
      module: evaluatedModule,
      indexedDB: {
        open: () => {
          const req: RequestStub = { result: db };
          opens.push(req);
          return req;
        },
      },
    },
  );
  const { IdbQueueStore } = evaluatedModule.exports as { IdbQueueStore: new () => Store };
  return {
    store: new IdbQueueStore(),
    opens,
    transactions,
    db,
    closes: () => closes,
    throwOnRequest: (error: Error) => {
      syncError = error;
    },
  };
}

for (const operation of ["add", "update", "remove", "clear"] as const) {
  for (const abort of [false, true]) {
    test(`IDB ${operation}: chờ ${abort ? "abort" : "commit"}`, async () => {
      const f = fixture();
      let settled = false;
      const promise =
        operation === "add"
          ? f.store.add({})
          : operation === "update"
            ? f.store.update({})
            : operation === "remove"
              ? f.store.remove(42)
              : f.store.clear();
      const observed = promise.then(
        (value) => {
          settled = true;
          return { ok: true, value };
        },
        (error: unknown) => {
          settled = true;
          return { ok: false, error };
        },
      );
      f.opens[0].onsuccess?.();
      await setImmediate();
      const tx = f.transactions[0];
      tx.request.result = operation === "add" ? 42 : undefined;
      tx.request.onsuccess?.();
      await setImmediate();
      assert.equal(settled, false);
      if (abort) {
        tx.error = new Error("quota hoặc abort sau request success");
        tx.onabort?.();
      } else tx.oncomplete?.();
      const result = await observed;
      assert.equal(result.ok, !abort);
      if (result.ok && "value" in result) {
        assert.equal(result.value, operation === "add" ? 42 : undefined);
      }
    });
  }
}

test("IDB: lỗi mở không cache promise bị reject, lần sau mở lại được", async () => {
  const f = fixture();
  const first = assert.rejects(f.store.getAll(), /open failed/);
  f.opens[0].error = new Error("open failed");
  f.opens[0].onerror?.();
  await first;
  const second = f.store.getAll();
  assert.equal(f.opens.length, 2);
  f.opens[1].onsuccess?.();
  await setImmediate();
  const tx = f.transactions[0];
  tx.request.result = [{ id: 2 }, { id: 1 }];
  tx.request.onsuccess?.();
  tx.oncomplete?.();
  assert.deepEqual(await second, [{ id: 1 }, { id: 2 }]);
});

test("IDB: versionchange đóng connection và thao tác kế tiếp mở lại", async () => {
  const f = fixture();
  const first = f.store.clear();
  f.opens[0].onsuccess?.();
  await setImmediate();
  f.transactions[0].request.onsuccess?.();
  f.transactions[0].oncomplete?.();
  await first;
  f.db.onversionchange?.();
  assert.equal(f.closes(), 1);
  const second = f.store.clear();
  assert.equal(f.opens.length, 2);
  f.opens[1].onsuccess?.();
  await setImmediate();
  f.transactions[1].request.onsuccess?.();
  f.transactions[1].oncomplete?.();
  await second;
});

test("IDB: open bị blocked trả lỗi và đóng connection đến muộn", async () => {
  const f = fixture();
  const rejected = assert.rejects(f.store.clear(), /tab khác/);
  f.opens[0].onblocked?.();
  await rejected;
  f.opens[0].onsuccess?.();
  assert.equal(f.closes(), 1);
});

test("IDB: lỗi request được giữ qua transaction abort", async () => {
  const f = fixture();
  const rejected = assert.rejects(f.store.add({}), /quota/);
  f.opens[0].onsuccess?.();
  await setImmediate();
  const tx = f.transactions[0];
  tx.request.error = new Error("quota");
  tx.request.onerror?.();
  tx.onabort?.();
  await rejected;
});

test("IDB: lỗi DataCloneError đồng bộ không báo đã lưu", async () => {
  const f = fixture();
  f.throwOnRequest(new Error("không clone được"));
  const rejected = assert.rejects(f.store.add({}));
  f.opens[0].onsuccess?.();
  await rejected;
});
