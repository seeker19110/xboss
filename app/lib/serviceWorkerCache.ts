const CACHE_CLEAR_TIMEOUT_MS = 3_000;
const OWNED_CACHE = /^xboss-(?:public-)?v\d+$/;

export type CacheClearController = Pick<ServiceWorker, "postMessage">;

export class ServiceWorkerCacheClearError extends Error {
  constructor(
    readonly code:
      | "controller_missing"
      | "message_channel_unavailable"
      | "request_failed"
      | "timeout"
      | "message_error"
      | "response_malformed"
      | "request_id_mismatch"
      | "clear_failed",
  ) {
    super(code);
    this.name = "ServiceWorkerCacheClearError";
  }
}

type ClearRegistration = { active: CacheClearController | null };

export type CacheClearEnvironment = {
  controller: CacheClearController | null;
  getRegistration: () => Promise<ClearRegistration | undefined>;
  ready: Promise<ClearRegistration>;
  cacheStorage?: Pick<CacheStorage, "keys" | "delete">;
  serviceWorkerAvailable: boolean;
  production: boolean;
  timeoutMs?: number;
  createChannel?: () => MessageChannel;
};

export class AuthenticationPreflightError extends Error {
  constructor(readonly cause: unknown) {
    super("authentication_preflight_failed");
    this.name = "AuthenticationPreflightError";
  }
}

/** Runs authentication only after private-cache cleanup has completed. */
export async function authenticateAfterCacheClear<T>(
  clear: () => Promise<void>,
  authenticate: () => Promise<T>,
): Promise<T> {
  try {
    await clear();
  } catch (error) {
    throw new AuthenticationPreflightError(error);
  }
  return authenticate();
}

/** Chờ ACK purge của đúng request; không coi việc postMessage đã trả về là đã dọn xong. */
export function requestServiceWorkerCacheClear(
  controller: CacheClearController | null | undefined,
  timeoutMs = CACHE_CLEAR_TIMEOUT_MS,
  createChannel: () => MessageChannel = () => new MessageChannel(),
): Promise<void> {
  if (!controller) {
    return Promise.reject(new ServiceWorkerCacheClearError("controller_missing"));
  }

  let channel: MessageChannel;
  try {
    channel = createChannel();
  } catch {
    return Promise.reject(new ServiceWorkerCacheClearError("message_channel_unavailable"));
  }

  const requestId = globalThis.crypto?.randomUUID?.();
  if (!requestId) {
    channel.port1.close();
    channel.port2.close();
    return Promise.reject(new ServiceWorkerCacheClearError("message_channel_unavailable"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish("timeout"), timeoutMs);

    function finish(errorCode?: ConstructorParameters<typeof ServiceWorkerCacheClearError>[0]) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.port1.onmessage = null;
      channel.port1.onmessageerror = null;
      channel.port1.close();
      channel.port2.close();
      if (errorCode) reject(new ServiceWorkerCacheClearError(errorCode));
      else resolve();
    }

    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const response: unknown = event.data;
      if (
        typeof response !== "object" ||
        response === null ||
        !("type" in response) ||
        !("requestId" in response) ||
        typeof response.type !== "string" ||
        typeof response.requestId !== "string"
      ) {
        finish("response_malformed");
        return;
      }
      if (response.requestId !== requestId) {
        finish("request_id_mismatch");
        return;
      }
      if (response.type === "CACHE_CLEARED") {
        finish();
        return;
      }
      if (response.type === "CACHE_CLEAR_FAILED") {
        finish("clear_failed");
        return;
      }
      finish("response_malformed");
    };
    channel.port1.onmessageerror = () => finish("message_error");
    channel.port1.start();

    try {
      controller.postMessage({ type: "CLEAR_CACHE", requestId }, [channel.port2]);
    } catch {
      finish("request_failed");
    }
  });
}

function browserEnvironment(): CacheClearEnvironment {
  const hasNavigator = typeof navigator !== "undefined";
  const hasServiceWorker = hasNavigator && "serviceWorker" in navigator;
  return {
    controller: hasServiceWorker ? navigator.serviceWorker.controller : null,
    getRegistration: hasServiceWorker
      ? () => navigator.serviceWorker.getRegistration()
      : async () => undefined,
    ready: hasServiceWorker ? navigator.serviceWorker.ready : Promise.resolve(undefined as never),
    cacheStorage: typeof caches === "undefined" ? undefined : caches,
    serviceWorkerAvailable: hasServiceWorker,
    production: process.env.NODE_ENV === "production",
  };
}

async function purgeOwnedCachesWithoutWorker(
  cacheStorage?: Pick<CacheStorage, "keys" | "delete">,
): Promise<void> {
  if (!cacheStorage) return;
  try {
    const names = await cacheStorage.keys();
    await Promise.all(
      names.filter((name) => OWNED_CACHE.test(name)).map((name) => cacheStorage.delete(name)),
    );
  } catch {
    throw new ServiceWorkerCacheClearError("clear_failed");
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ServiceWorkerCacheClearError("timeout")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        reject(new ServiceWorkerCacheClearError("request_failed"));
      },
    );
  });
}

/**
 * If this document is not controlled yet, use its active registration. If no registration
 * exists, clear only XBoss-owned CacheStorage entries; unrelated applications' caches are
 * never touched.
 */
export async function clearServiceWorkerCacheWith(
  environment: CacheClearEnvironment,
): Promise<void> {
  const timeoutMs = environment.timeoutMs ?? CACHE_CLEAR_TIMEOUT_MS;
  if (environment.controller) {
    return requestServiceWorkerCacheClear(
      environment.controller,
      timeoutMs,
      environment.createChannel,
    );
  }

  if (!environment.serviceWorkerAvailable) {
    return purgeOwnedCachesWithoutWorker(environment.cacheStorage);
  }

  let registration = await withTimeout(environment.getRegistration(), timeoutMs);

  if (!registration) {
    // No registration means there is no active worker to acknowledge. This also covers
    // first visits in production and browsers where PwaRegister has not run yet.
    return purgeOwnedCachesWithoutWorker(environment.cacheStorage);
  }

  if (!registration?.active) {
    const ready = await withTimeout(environment.ready, timeoutMs);
    registration = ready;
  }

  const remainingMs = timeoutMs;
  return requestServiceWorkerCacheClear(
    registration.active,
    remainingMs,
    environment.createChannel,
  );
}

export function clearServiceWorkerCache(): Promise<void> {
  return clearServiceWorkerCacheWith(browserEnvironment());
}
