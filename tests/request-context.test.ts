import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncResource } from "node:async_hooks";
import {
  runWithRequestContext,
  getRequestContext,
  patchRequestContext,
} from "@/lib/request-context";

// Chạy fn trong một async context mới hoàn toàn — để test nhánh enterWith (không store)
// mà không rò rỉ store sang test khác.
function inFreshContext<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    new AsyncResource("test-ctx").runInAsyncScope(() => {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    });
  });
}

test("getRequestContext: undefined khi ngoài mọi ngữ cảnh", async () => {
  await inFreshContext(() => {
    assert.equal(getRequestContext(), undefined);
  });
});

test("runWithRequestContext: get trả đúng ctx đã bọc", () => {
  runWithRequestContext({ userId: 1, role: "admin" }, () => {
    assert.deepEqual(getRequestContext(), { userId: 1, role: "admin" });
  });
});

test("patchRequestContext: gộp vào store hiện có", () => {
  runWithRequestContext({ userId: 1 }, () => {
    patchRequestContext({ role: "pm", projectId: 3 });
    assert.deepEqual(getRequestContext(), { userId: 1, role: "pm", projectId: 3 });
  });
});

test("patchRequestContext: enterWith thiết lập store khi chưa có", async () => {
  await inFreshContext(() => {
    patchRequestContext({ requestId: "abc" });
    assert.equal(getRequestContext()?.requestId, "abc");
  });
});

test("giữ ngữ cảnh qua await (async boundary)", async () => {
  await runWithRequestContext({ userId: 7 }, async () => {
    await new Promise((r) => setTimeout(r, 1));
    assert.equal(getRequestContext()?.userId, 7);
  });
});

test("ngữ cảnh không rò rỉ ra ngoài callback", async () => {
  runWithRequestContext({ userId: 42 }, () => {});
  await inFreshContext(() => {
    assert.equal(getRequestContext(), undefined);
  });
});
