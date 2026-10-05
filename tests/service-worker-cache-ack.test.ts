import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authenticateAfterCacheClear,
  AuthenticationPreflightError,
  clearServiceWorkerCacheWith,
  requestServiceWorkerCacheClear,
  ServiceWorkerCacheClearError,
  type CacheClearController,
  type CacheClearEnvironment,
} from "@/app/lib/serviceWorkerCache";

type FakePort = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onmessageerror: (() => void) | null;
  start: () => void;
  close: () => void;
};

function channelFixture() {
  const port: FakePort = {
    onmessage: null,
    onmessageerror: null,
    start() {},
    close() {},
  };
  const createChannel = () => ({ port1: port, port2: { close() {} } }) as unknown as MessageChannel;
  const controller: CacheClearController = {
    postMessage(message: unknown) {
      const request = message as { requestId: string };
      port.onmessage?.({
        data: { type: "CACHE_CLEARED", requestId: request.requestId },
      } as MessageEvent);
    },
  };
  return { controller, createChannel };
}

function environment(overrides: Partial<CacheClearEnvironment> = {}): CacheClearEnvironment {
  return {
    controller: null,
    getRegistration: async () => undefined,
    ready: Promise.resolve({ active: null }),
    serviceWorkerAvailable: true,
    production: false,
    timeoutMs: 20,
    ...overrides,
  };
}

test("resolves only after matching CACHE_CLEARED ACK", async () => {
  const fixture = channelFixture();
  await requestServiceWorkerCacheClear(fixture.controller, 100, fixture.createChannel);
});

test("first visit without a registration purges only XBoss-owned caches in production", async () => {
  const deleted: string[] = [];
  const cacheStorage = {
    async keys() {
      return ["xboss-public-v20", "xboss-v19", "other-app-v4"];
    },
    async delete(name: string) {
      deleted.push(name);
      return true;
    },
  };
  await clearServiceWorkerCacheWith(
    environment({
      serviceWorkerAvailable: true,
      production: true,
      getRegistration: async () => undefined,
      ready: new Promise(() => {}),
      cacheStorage,
    }),
  );
  assert.deepEqual(deleted.sort(), ["xboss-public-v20", "xboss-v19"]);
});

test("production without a controller sends ACK to an active registered worker", async () => {
  const fixture = channelFixture();
  let getRegistrationCalled = false;
  await clearServiceWorkerCacheWith(
    environment({
      production: true,
      getRegistration: async () => {
        getRegistrationCalled = true;
        return { active: fixture.controller };
      },
      createChannel: fixture.createChannel,
    }),
  );
  assert.equal(getRegistrationCalled, true);
});

test("failed pre-authentication cache purge prevents issuing authentication", async (t) => {
  await t.test("clear failure never calls the authentication request", async () => {
    let authenticationCalled = false;
    await assert.rejects(
      authenticateAfterCacheClear(
        async () => {
          throw new Error("purge failed");
        },
        async () => {
          authenticationCalled = true;
        },
      ),
      AuthenticationPreflightError,
    );
    assert.equal(authenticationCalled, false);
  });

  await t.test("successful purge issues authentication afterward", async () => {
    const sequence: string[] = [];
    const result = await authenticateAfterCacheClear(
      async () => {
        sequence.push("purge");
      },
      async () => {
        sequence.push("authenticate");
        return "response";
      },
    );
    assert.deepEqual(sequence, ["purge", "authenticate"]);
    assert.equal(result, "response");
  });
});

test("production with no active worker stays fail-closed after readiness timeout", async () => {
  await assert.rejects(
    clearServiceWorkerCacheWith(
      environment({
        production: true,
        timeoutMs: 5,
        getRegistration: async () => ({ active: null }),
        ready: new Promise(() => {}),
      }),
    ),
    (error: ServiceWorkerCacheClearError) => error.code === "timeout",
  );
});

test("rejects when controller is missing", async () => {
  await assert.rejects(
    requestServiceWorkerCacheClear(null),
    (error: ServiceWorkerCacheClearError) => error.code === "controller_missing",
  );
});

test("fails closed for malformed and mismatched ACKs", async (t) => {
  await t.test("malformed", async () => {
    const port: FakePort = { onmessage: null, onmessageerror: null, start() {}, close() {} };
    const controller: CacheClearController = {
      postMessage() {
        port.onmessage?.({ data: { type: "CACHE_CLEARED" } } as MessageEvent);
      },
    };
    const createChannel = () =>
      ({ port1: port, port2: { close() {} } }) as unknown as MessageChannel;
    await assert.rejects(
      requestServiceWorkerCacheClear(controller, 100, createChannel),
      (error: ServiceWorkerCacheClearError) => error.code === "response_malformed",
    );
  });
  await t.test("mismatched request id", async () => {
    const port: FakePort = { onmessage: null, onmessageerror: null, start() {}, close() {} };
    const controller: CacheClearController = {
      postMessage() {
        port.onmessage?.({ data: { type: "CACHE_CLEARED", requestId: "other" } } as MessageEvent);
      },
    };
    const createChannel = () =>
      ({ port1: port, port2: { close() {} } }) as unknown as MessageChannel;
    await assert.rejects(
      requestServiceWorkerCacheClear(controller, 100, createChannel),
      (error: ServiceWorkerCacheClearError) => error.code === "request_id_mismatch",
    );
  });
});

test("rejects CACHE_CLEAR_FAILED, messageerror, and timeout", async (t) => {
  await t.test("service worker failure", async () => {
    const port: FakePort = { onmessage: null, onmessageerror: null, start() {}, close() {} };
    const controller: CacheClearController = {
      postMessage(message: unknown) {
        port.onmessage?.({
          data: {
            type: "CACHE_CLEAR_FAILED",
            requestId: (message as { requestId: string }).requestId,
          },
        } as MessageEvent);
      },
    };
    const createChannel = () =>
      ({ port1: port, port2: { close() {} } }) as unknown as MessageChannel;
    await assert.rejects(
      requestServiceWorkerCacheClear(controller, 100, createChannel),
      (error: ServiceWorkerCacheClearError) => error.code === "clear_failed",
    );
  });
  await t.test("messageerror", async () => {
    const port: FakePort = { onmessage: null, onmessageerror: null, start() {}, close() {} };
    const controller: CacheClearController = {
      postMessage() {
        port.onmessageerror?.();
      },
    };
    const createChannel = () =>
      ({ port1: port, port2: { close() {} } }) as unknown as MessageChannel;
    await assert.rejects(
      requestServiceWorkerCacheClear(controller, 100, createChannel),
      (error: ServiceWorkerCacheClearError) => error.code === "message_error",
    );
  });
  await t.test("timeout", async () => {
    const port: FakePort = { onmessage: null, onmessageerror: null, start() {}, close() {} };
    const controller: CacheClearController = { postMessage() {} };
    const createChannel = () =>
      ({ port1: port, port2: { close() {} } }) as unknown as MessageChannel;
    await assert.rejects(
      requestServiceWorkerCacheClear(controller, 5, createChannel),
      (error: ServiceWorkerCacheClearError) => error.code === "timeout",
    );
  });
});

test("401 lock hides and removes the prior page from interaction before cache cleanup", async () => {
  class FakeElement {
    attributes = new Map<string, string>();
    children: FakeElement[] = [];
    className = "";
    textContent = "";
    tabIndex = 0;
    inert = false;
    disabled = false;
    type = "";
    listener?: () => void;
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }
    append(...children: FakeElement[]) {
      this.children.push(...children);
    }
    addEventListener(_name: string, listener: () => void) {
      this.listener = listener;
    }
    focus() {}
  }

  const privateRoot = new FakeElement();
  const bodyChildren: FakeElement[] = [privateRoot];
  const fakeDocument = {
    createElement: () => new FakeElement(),
    body: {
      get children() {
        return bodyChildren;
      },
      append(element: FakeElement) {
        bodyChildren.push(element);
      },
    },
  };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: FakeElement });
  try {
    const { lockPrivatePageUntilCachePurged } = await import("@/app/lib/me");
    lockPrivatePageUntilCachePurged();
    assert.equal(privateRoot.inert, true);
    assert.equal(privateRoot.attributes.get("aria-hidden"), "true");
    assert.equal(bodyChildren.length, 2);
    assert.equal(bodyChildren[1]?.attributes.get("role"), "alert");
    assert.match(bodyChildren[1]?.children[0]?.textContent ?? "", /Phiên đăng nhập đã hết hạn/);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (previousHTMLElement) Object.defineProperty(globalThis, "HTMLElement", previousHTMLElement);
    else Reflect.deleteProperty(globalThis, "HTMLElement");
  }
});
