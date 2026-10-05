import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requestServiceWorkerCacheClear,
  ServiceWorkerCacheClearError,
  type CacheClearController,
} from "../app/lib/serviceWorkerCache";

type FakePort = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onmessageerror: (() => void) | null;
  start: () => void;
  close: () => void;
};

function fixture(reply?: (request: { type: string; requestId: string }, port: FakePort) => void) {
  const port: FakePort = {
    onmessage: null,
    onmessageerror: null,
    start() {},
    close() {},
  };
  let sent: { type: string; requestId: string } | undefined;
  const controller = {
    postMessage(message: { type: string; requestId: string }) {
      sent = message;
      reply?.(message, port);
    },
  } as CacheClearController;
  const createChannel = () => ({ port1: port, port2: { close() {} } }) as unknown as MessageChannel;
  return { controller, createChannel, port, request: () => sent };
}

test("resolves only after matching CACHE_CLEARED ACK", async () => {
  const f = fixture((request, port) => {
    port.onmessage?.({ data: { type: "CACHE_CLEARED", requestId: request.requestId } } as MessageEvent);
  });
  await requestServiceWorkerCacheClear(f.controller, 100, f.createChannel);
  assert.deepEqual(f.request(), { type: "CLEAR_CACHE", requestId: f.request()?.requestId });
});

test("rejects when controller is missing", async () => {
  await assert.rejects(requestServiceWorkerCacheClear(null), (error: ServiceWorkerCacheClearError) =>
    error.code === "controller_missing",
  );
});

test("fails closed for malformed and mismatched ACKs", async (t) => {
  await t.test("malformed", async () => {
    const f = fixture((_request, port) => port.onmessage?.({ data: { type: "CACHE_CLEARED" } } as MessageEvent));
    await assert.rejects(requestServiceWorkerCacheClear(f.controller, 100, f.createChannel), (error: ServiceWorkerCacheClearError) =>
      error.code === "response_malformed",
    );
  });
  await t.test("mismatched request id", async () => {
    const f = fixture((_request, port) => port.onmessage?.({ data: { type: "CACHE_CLEARED", requestId: "other" } } as MessageEvent));
    await assert.rejects(requestServiceWorkerCacheClear(f.controller, 100, f.createChannel), (error: ServiceWorkerCacheClearError) =>
      error.code === "request_id_mismatch",
    );
  });
});

test("rejects CACHE_CLEAR_FAILED, messageerror, and timeout", async (t) => {
  await t.test("service worker failure", async () => {
    const f = fixture((request, port) => port.onmessage?.({ data: { type: "CACHE_CLEAR_FAILED", requestId: request.requestId } } as MessageEvent));
    await assert.rejects(requestServiceWorkerCacheClear(f.controller, 100, f.createChannel), (error: ServiceWorkerCacheClearError) =>
      error.code === "clear_failed",
    );
  });
  await t.test("messageerror", async () => {
    const f = fixture((_request, port) => port.onmessageerror?.());
    await assert.rejects(requestServiceWorkerCacheClear(f.controller, 100, f.createChannel), (error: ServiceWorkerCacheClearError) =>
      error.code === "message_error",
    );
  });
  await t.test("timeout", async () => {
    const f = fixture();
    await assert.rejects(requestServiceWorkerCacheClear(f.controller, 5, f.createChannel), (error: ServiceWorkerCacheClearError) =>
      error.code === "timeout",
    );
  });
});
