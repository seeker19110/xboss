import { useCallback, useEffect, useRef, useState } from "react";
import { useOfflineTickQueue } from "@/app/components/offlineQueue";
import type { Data } from "./types";

const SYNC_POLL_MS = 10_000;

// Fetch dữ liệu sheet tracking + đồng bộ đa người dùng (SSE/poll) + hàng đợi tick offline.
// Logic giữ nguyên 100% từ app/tracking/[sheet]/page.tsx trước khi tách (M52 PR5).
export function useTrackingData(sheet: string) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncToast, setSyncToast] = useState(false);
  const versionRef = useRef<string | null>(null);
  // M14 — tầng chưa bàn giao mặt bằng (work_fronts.status='pending') của sheet này,
  // chỉ để hiện badge cảnh báo trực quan (không chặn tick — xem docs/nang-cap/M14-mat-bang.md).
  const [pendingFronts, setPendingFronts] = useState<Set<string>>(new Set());
  // M3 (QA&QC) — nhóm đang bị hold-point chuyển bước (packageId → lý do), chỉ để hiện icon
  // cảnh báo trên hàng nhóm (chặn ghi thật đã nằm ở các route dùng handoverBlocked).
  const [qcBlocked, setQcBlocked] = useState<Map<number, string>>(new Map());

  const load = useCallback(() => {
    fetch(`/api/tasks?sheet=${sheet}`)
      .then((r) => r.json())
      .then((d: Data) => {
        setData(d);
        if (d?.version) versionRef.current = d.version;
      })
      .catch(() => {
        /* mất mạng — giữ dữ liệu đang hiển thị */
      })
      .finally(() => setLoading(false));
  }, [sheet]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sheetTypeId = data?.sheet.id;
    if (!sheetTypeId) return;
    fetch(`/api/work-fronts?sheetTypeId=${sheetTypeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { workFronts?: { floorLabel: string; status: string }[] } | null) => {
        setPendingFronts(
          new Set(
            (j?.workFronts ?? []).filter((w) => w.status === "pending").map((w) => w.floorLabel),
          ),
        );
      })
      .catch(() => {
        /* mất mạng — bỏ qua badge, không ảnh hưởng thao tác chính */
      });
  }, [data?.sheet.id]);

  useEffect(() => {
    const sheetTypeId = data?.sheet.id;
    if (!sheetTypeId) return;
    fetch(`/api/workpackages/qc-status?sheetTypeId=${sheetTypeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { blocked?: { packageId: number; reason: string }[] } | null) => {
        setQcBlocked(new Map((j?.blocked ?? []).map((b) => [b.packageId, b.reason])));
      })
      .catch(() => {
        /* mất mạng — bỏ qua badge, không ảnh hưởng thao tác chính */
      });
  }, [data?.sheet.id]);

  // Hàng đợi offline: tick khi mất mạng được gửi lại tự động lúc có mạng.
  const { pending: offlinePending, online, enqueue } = useOfflineTickQueue(load);

  // Đồng bộ đa người dùng: SSE (/api/events, độ trễ ~3s) — lỗi/timeout thì
  // fallback về poll watermark 10s như trước. Người khác sửa → tự reload + toast.
  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const applyVersion = (v: string) => {
      if (document.hidden) return;
      if (versionRef.current && v !== versionRef.current) {
        versionRef.current = v;
        load();
        setRefreshKey((k) => k + 1);
        setSyncToast(true);
        setTimeout(() => setSyncToast(false), 3500);
      } else {
        versionRef.current = v;
      }
    };

    const startPolling = () => {
      if (pollTimer || stopped) return;
      pollTimer = setInterval(async () => {
        if (document.hidden) return;
        try {
          const r = await fetch(`/api/tasks/version?sheet=${sheet}`);
          if (!r.ok) return;
          applyVersion((await r.json()).v);
        } catch {
          /* mạng chập chờn — thử lại lần poll sau */
        }
      }, SYNC_POLL_MS);
    };

    if (typeof EventSource !== "undefined") {
      es = new EventSource(`/api/events?sheet=${sheet}`);
      es.addEventListener("version", (e) => {
        try {
          applyVersion(JSON.parse((e as MessageEvent).data).v);
        } catch {
          /* payload lạ — bỏ qua */
        }
      });
      es.onerror = () => {
        es?.close();
        es = null;
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      stopped = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [sheet, load]);

  return {
    data,
    loading,
    load,
    refreshKey,
    syncToast,
    pendingFronts,
    qcBlocked,
    offlinePending,
    online,
    enqueue,
  };
}
