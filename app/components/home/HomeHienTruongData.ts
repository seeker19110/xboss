"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { redirectToLogin } from "@/app/lib/me";
import { taiJson } from "@/app/lib/taiDuLieu";

export type MyTask = {
  id: number;
  code: string;
  name: string;
  status: string;
  endDate: string | null;
  progressPercent: number;
  floorLabel: string | null;
  sheetType: string;
  sheetSlug?: string | null;
};
type Summary = {
  total: number;
  delayed: number;
  done: number;
  dueSoon: number;
  dueSoonDays: number;
};
type Notif = {
  id: number;
  taskId: number | null;
  message: string;
  isRead: number;
  sheetSlug: string | null;
  floorLabel: string | null;
  projectId: number | null;
};
type SheetNav = { id: number; code: string; name: string; slug: string };
export type FieldSource = "notifications" | "sheets" | "project";
const SOURCES: readonly FieldSource[] = ["notifications", "sheets", "project"];
const PENDING: Record<FieldSource, boolean> = { notifications: true, sheets: true, project: true };
type Cycle = {
  primary: AbortController;
  secondary: Partial<Record<FieldSource, AbortController>>;
  pending: Set<FieldSource>;
};

function abortCycle(cycle: Cycle | null) {
  cycle?.primary.abort();
  Object.values(cycle?.secondary ?? {}).forEach((request) => request.abort());
}

// Chỉ my-tasks quyết định trạng thái chính. Ba nguồn phụ nạp song song, có thể thử lại
// riêng; mỗi lượt tải có controller và danh tính riêng để bỏ kết quả cũ sau refresh/unmount.
export function useHomeHienTruongData() {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState<number | null>(null);
  const [sheets, setSheets] = useState<SheetNav[] | null>(null);
  const [tenDuAn, setTenDuAn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [moduleTat, setModuleTat] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(PENDING);
  const [secondaryErrors, setSecondaryErrors] = useState<Partial<Record<FieldSource, string>>>({});
  const cycleRef = useRef<Cycle | null>(null);

  const taiPhu = useCallback(async (cycle: Cycle, sources = SOURCES) => {
    const load = async <T>(source: FieldSource, url: string, apply: (data: T) => void) => {
      cycle.secondary[source]?.abort();
      const request = new AbortController();
      cycle.secondary[source] = request;
      cycle.pending.add(source);
      setSecondaryLoading((current) => ({ ...current, [source]: true }));
      const result = await taiJson<T>(url, { signal: request.signal });
      if (cycle.secondary[source] === request) cycle.pending.delete(source);
      if (
        cycleRef.current !== cycle ||
        cycle.primary.signal.aborted ||
        request.signal.aborted ||
        cycle.secondary[source] !== request
      )
        return;
      if (result.ok) {
        apply(result.data);
        setSecondaryErrors((current) => {
          const next = { ...current };
          delete next[source];
          return next;
        });
      } else {
        setSecondaryErrors((current) => ({ ...current, [source]: result.loi }));
      }
      setSecondaryLoading((current) => ({ ...current, [source]: false }));
    };
    await Promise.all(
      sources.map((source) => {
        if (source === "notifications")
          return load<{ notifications: Notif[]; unread: number }>(
            source,
            "/api/notifications?limit=20",
            (data) => {
              setNotifs(data.notifications ?? []);
              setUnread(data.unread ?? null);
            },
          );
        if (source === "sheets")
          return load<{ sheets: SheetNav[] }>(source, "/api/sheets", (data) =>
            setSheets(data.sheets ?? []),
          );
        return load<{ name: string | null }>(source, "/api/project", (data) =>
          setTenDuAn(data.name ?? null),
        );
      }),
    );
  }, []);

  const tai = useCallback(async () => {
    abortCycle(cycleRef.current);
    const cycle: Cycle = { primary: new AbortController(), secondary: {}, pending: new Set() };
    cycleRef.current = cycle;
    const isCurrent = () => cycleRef.current === cycle && !cycle.primary.signal.aborted;
    setLoading(true);
    setLoi(null);
    setModuleTat(false);
    setNotifs([]);
    setUnread(null);
    setSheets(null);
    setTenDuAn(null);
    setSecondaryLoading(PENDING);
    setSecondaryErrors({});
    const primary = fetch("/api/my-tasks", { signal: cycle.primary.signal }).catch(() => null);
    void taiPhu(cycle);
    const response = await primary;
    if (!isCurrent()) return;
    try {
      if (!response) {
        setLoi("Mất kết nối — kiểm tra mạng rồi thử lại");
      } else if (response.status === 401) {
        abortCycle(cycle);
        await redirectToLogin();
      } else if (response.status === 404) {
        setModuleTat(true);
      } else if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (isCurrent())
          setLoi(data?.error ?? `Không tải được việc của tôi (lỗi ${response.status})`);
      } else {
        const data = (await response.json()) as { tasks: MyTask[]; summary: Summary };
        if (!isCurrent()) return;
        setTasks(data.tasks ?? []);
        setSummary(data.summary ?? null);
      }
    } catch {
      if (isCurrent()) setLoi("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [taiPhu]);

  useEffect(() => {
    void tai();
    return () => {
      abortCycle(cycleRef.current);
      cycleRef.current = null;
    };
  }, [tai]);

  const retrySecondary = useCallback(
    (source: FieldSource) => {
      const cycle = cycleRef.current;
      if (cycle && !cycle.primary.signal.aborted && !cycle.pending.has(source))
        void taiPhu(cycle, [source]);
    },
    [taiPhu],
  );

  return {
    tasks,
    summary,
    notifs,
    unread,
    sheets,
    tenDuAn,
    loading,
    loi,
    moduleTat,
    secondaryLoading,
    secondaryErrors,
    retrySecondary,
    tai,
  };
}
