/** Poll khi tab đang hiện; mỗi lượt hoàn tất mới đặt lịch lượt tiếp theo. */
export function createVisiblePoll<T>({
  visibility,
  everyMs,
  load,
  onData,
  onError,
}: {
  visibility: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
  everyMs: number;
  load: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => void;
  onError?: (error: unknown) => void;
}) {
  let disposed = false;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshPending = false;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const refresh = () => {
    if (disposed || visibility.hidden) return;
    clearTimer();
    if (controller) {
      // Gộp các lần đánh dấu đọc/hiện lại tab trong lúc request trước chưa kết thúc.
      refreshPending = true;
      return;
    }
    const request = new AbortController();
    controller = request;
    refreshPending = false;
    void (async () => {
      try {
        const data = await load(request.signal);
        if (!disposed && !visibility.hidden && !request.signal.aborted) onData(data);
      } catch (error) {
        if (!disposed && !visibility.hidden && !request.signal.aborted) onError?.(error);
      } finally {
        controller = null;
        if (!disposed && !visibility.hidden) {
          if (refreshPending) refresh();
          else timer = setTimeout(refresh, everyMs);
        }
      }
    })();
  };

  const visibilityChanged = () => {
    if (visibility.hidden) {
      clearTimer();
      controller?.abort();
    } else refresh();
  };

  visibility.addEventListener("visibilitychange", visibilityChanged);
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      refreshPending = false;
      clearTimer();
      controller?.abort();
      visibility.removeEventListener("visibilitychange", visibilityChanged);
    },
  };
}
