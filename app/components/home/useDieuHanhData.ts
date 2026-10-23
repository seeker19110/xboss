"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { taiJson } from "@/app/lib/taiDuLieu";
import type {
  QualityBlock,
  VoBlock,
  WorkfrontBlock,
  SystemCrossRow,
  ApprovalsBlock,
} from "@/app/components/DashboardExtCards";

// Dữ liệu của chế độ "Điều hành" trên trang chủ (M127) — tách khỏi component để file view
// chỉ còn bố cục. Bốn nguồn nạp song song; chỉ /api/dashboard là dữ liệu CHÍNH (hỏng thì
// trang hiện ErrorState), ba nguồn còn lại hỏng thì trang vẫn dùng được nhưng phải báo
// (`loiPhu`) — nuốt lỗi sẽ khiến người xem tưởng dự án không có trang/hệ nào.

export type DelayedTask = {
  id: number;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  progressPercent: number;
  floorLabel: string;
  sheetType: string;
  sheetSlug: string | null;
  delayReason: string | null;
  delayNote: string | null;
};
export type KPI = {
  sheetId: number;
  sheetType: string;
  sheetSlug: string | null;
  total: number;
  avgProgress: number;
  delayed: number;
};
export type SheetNav = { id: number; code: string; name: string; slug: string };
export type SystemCard = {
  id: number;
  code: string;
  name: string;
  color: string | null;
  sheetCount: number;
  avgProgress: number;
  delayed: number;
};
export type DashData = {
  delayedTasks: DelayedTask[];
  groupProgress: Record<string, number>;
  kpi: KPI[];
  totalDelayed: number;
  quality: QualityBlock;
  vo: VoBlock | null;
  workfront: WorkfrontBlock | null;
  bySystem: SystemCrossRow[];
  approvals: ApprovalsBlock | null;
  // Khối "sắp đến hạn" + Δ tuần do server tính sẵn (M127 FR2, contract §10) — client
  // KHÔNG tự cộng lại để số trên thẻ luôn khớp ngưỡng `alert_rules` của dự án.
  dueSoon?: { days: number; count: number } | null;
  weekDelta?: number | null;
};

type SecondarySource = "sheets" | "systems" | "reasons";
const SECONDARY_SOURCES: SecondarySource[] = ["sheets", "systems", "reasons"];

export function useDieuHanhData() {
  const [data, setData] = useState<DashData | null>(null);
  const [kpiOrder, setKpiOrder] = useState<KPI[]>([]);
  const [sheets, setSheets] = useState<SheetNav[]>([]);
  const [systems, setSystems] = useState<SystemCard[]>([]);
  // Danh mục nguyên nhân trễ đọc từ code_lists (thay hằng DELAY_REASON_LABEL tĩnh).
  const [delayReasons, setDelayReasons] = useState<{ code: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [secondaryLoading, setSecondaryLoading] = useState<Record<SecondarySource, boolean>>({
    sheets: true,
    systems: true,
    reasons: true,
  });
  const [secondaryErrors, setSecondaryErrors] = useState<Partial<Record<SecondarySource, string>>>(
    {},
  );
  const [fetchedAt, setFetchedAt] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const secondaryRef = useRef<Partial<Record<SecondarySource, AbortController>>>({});

  const taiPhu = useCallback(async (parent: AbortController, sources = SECONDARY_SOURCES) => {
    const load = async <T>(source: SecondarySource, url: string, apply: (data: T) => void) => {
      secondaryRef.current[source]?.abort();
      const request = new AbortController();
      secondaryRef.current[source] = request;
      setSecondaryLoading((current) => ({ ...current, [source]: true }));
      setSecondaryErrors((current) => {
        const next = { ...current };
        delete next[source];
        return next;
      });
      const result = await taiJson<T>(url, { signal: request.signal });
      if (
        requestRef.current !== parent ||
        parent.signal.aborted ||
        request.signal.aborted ||
        secondaryRef.current[source] !== request
      )
        return;
      if (result.ok) apply(result.data);
      else setSecondaryErrors((current) => ({ ...current, [source]: result.loi }));
      setSecondaryLoading((current) => ({ ...current, [source]: false }));
    };
    await Promise.all(
      sources.map((source) => {
        if (source === "sheets")
          return load<{ sheets: SheetNav[] }>(source, "/api/sheets", (result) =>
            setSheets(result.sheets ?? []),
          );
        if (source === "systems")
          return load<{ systems: SystemCard[] }>(source, "/api/systems", (result) =>
            setSystems((result.systems ?? []).filter((system) => system.sheetCount > 0)),
          );
        return load<{ items: { code: string; label: string }[] }>(
          source,
          "/api/code-lists?domain=delay_reason",
          (result) =>
            setDelayReasons(
              (result.items ?? []).map((item) => ({ code: item.code, label: item.label })),
            ),
        );
      }),
    );
  }, []);

  const tai = useCallback(async () => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    const isCurrent = () => requestRef.current === request && !request.signal.aborted;
    setLoading(true);
    setLoi(null);
    const init = { signal: request.signal };
    const primary = taiJson<DashData>("/api/dashboard", init);
    void taiPhu(request);
    const dash = await primary;
    if (!isCurrent()) return;
    if (!dash.ok) {
      setLoi(dash.loi);
      setLoading(false);
      return;
    }
    setData(dash.data);
    setKpiOrder(dash.data.kpi ?? []);
    setFetchedAt(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
    setLoading(false);
  }, [taiPhu]);

  useEffect(() => {
    const secondaryRequests = secondaryRef.current;
    void tai();
    return () => {
      requestRef.current?.abort();
      Object.values(secondaryRequests).forEach((request) => request.abort());
    };
  }, [tai]);

  return {
    data,
    setData,
    kpiOrder,
    setKpiOrder,
    sheets,
    systems,
    delayReasons,
    loading,
    loi,
    loiPhu: Object.keys(secondaryErrors).length > 0,
    secondaryLoading,
    secondaryErrors,
    retrySecondary: () => {
      const parent = requestRef.current;
      if (parent && !parent.signal.aborted)
        void taiPhu(parent, Object.keys(secondaryErrors) as SecondarySource[]);
    },
    fetchedAt,
    tai,
  };
}
