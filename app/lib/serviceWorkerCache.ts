const CACHE_CLEAR_TIMEOUT_MS = 3_000;

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

export function clearServiceWorkerCache(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.reject(new ServiceWorkerCacheClearError("controller_missing"));
  }
  return requestServiceWorkerCacheClear(navigator.serviceWorker.controller);
}
