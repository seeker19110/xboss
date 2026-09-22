"use client";
import { useCallback, useEffect, useState } from "react";
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

export function useDieuHanhData() {
  const [data, setData] = useState<DashData | null>(null);
  const [kpiOrder, setKpiOrder] = useState<KPI[]>([]);
  const [sheets, setSheets] = useState<SheetNav[]>([]);
  const [systems, setSystems] = useState<SystemCard[]>([]);
  // Danh mục nguyên nhân trễ đọc từ code_lists (thay hằng DELAY_REASON_LABEL tĩnh).
  const [delayReasons, setDelayReasons] = useState<{ code: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [loiPhu, setLoiPhu] = useState(false);
  const [fetchedAt, setFetchedAt] = useState("");

  const tai = useCallback(async () => {
    setLoading(true);
    setLoi(null);
    setLoiPhu(false);
    const [dash, sh, sys, cl] = await Promise.all([
      taiJson<DashData>("/api/dashboard"),
      taiJson<{ sheets: SheetNav[] }>("/api/sheets"),
      taiJson<{ systems: SystemCard[] }>("/api/systems"),
      taiJson<{ items: { code: string; label: string }[] }>("/api/code-lists?domain=delay_reason"),
    ]);
    if (!dash.ok) {
      setLoi(dash.loi);
      setLoading(false);
      return;
    }
    setData(dash.data);
    setKpiOrder(dash.data.kpi ?? []);
    setSheets(sh.ok ? (sh.data.sheets ?? []) : []);
    setSystems(sys.ok ? (sys.data.systems ?? []).filter((d) => d.sheetCount > 0) : []);
    setDelayReasons(
      cl.ok ? (cl.data.items ?? []).map((i) => ({ code: i.code, label: i.label })) : [],
    );
    setLoiPhu(!sh.ok || !sys.ok || !cl.ok);
    setFetchedAt(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
    setLoading(false);
  }, []);

  useEffect(() => {
    void tai();
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
    loiPhu,
    fetchedAt,
    tai,
  };
}
