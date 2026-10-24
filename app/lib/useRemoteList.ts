"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { redirectToLogin } from "./me";

// Cache chỉ trong vòng đời trang. Danh mục đóng/mở lại không cần GET mới;
// refresh danh sách luôn bỏ cache. Response đã hủy không được sửa snapshot/lỗi.
export function useRemoteList<T>(
  url: string,
  field: string,
  label: string,
  enabled = true,
  cache = false,
) {
  const [snapshot, setSnapshot] = useState<{ url: string; items: T[] } | null>(null);
  const saved = useRef(snapshot);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const active = useRef({ url, enabled });
  active.current = { url, enabled };
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(
    async (force = true): Promise<T[] | null> => {
      if (!enabled || active.current.url !== url || !active.current.enabled) return null;
      if (!force && cache && saved.current?.url === url) {
        setLoading(false);
        setError("");
        return saved.current.items;
      }
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const current = () =>
        !controller.signal.aborted &&
        request.current === controller &&
        active.current.url === url &&
        active.current.enabled;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!current()) return null;
        if (response.status === 401) {
          void redirectToLogin();
          return null;
        }
        const body = await response.json().catch(() => null);
        if (!current()) return null;
        if (!response.ok || !Array.isArray(body?.[field]))
          throw new Error(
            typeof body?.error === "string" ? body.error : `Không tải được ${label}. Hãy thử lại.`,
          );
        const next = { url, items: body[field] as T[] };
        saved.current = next;
        setSnapshot(next);
        return next.items;
      } catch (err) {
        if (current())
          setError(
            err instanceof Error && err.name !== "TypeError"
              ? err.message
              : `Mất kết nối — không tải được ${label}. Hãy thử lại.`,
          );
      } finally {
        if (current()) setLoading(false);
      }
      return null;
    },
    [url, field, label, enabled, cache],
  );
  useEffect(() => {
    if (enabled) void reload(false);
    else setLoading(false);
    return () => request.current?.abort();
  }, [enabled, reload]);
  const ready = enabled && snapshot?.url === url && !loading && !error;
  return { snapshot, loading: enabled && loading, error, ready, reload };
}
