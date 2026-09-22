"use client";
import { useRef } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  BarChart3,
  GripVertical,
  LineChart,
  List,
  Map as MapIcon,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { slugFromCode } from "@/lib/nen/sheets";
import ProgressRow from "@/app/components/ProgressRow";
import { Skeleton } from "@/app/components/Skeleton";
import { Button, Card, Chip, Tabs, TabPanel, type TabItem } from "@/app/components/ui";
import type { KPI } from "@/app/components/home/useDieuHanhData";

// Thẻ "Tiến độ" của trang chủ chế độ Điều hành — 5 cách nhìn cùng một dữ liệu gom vào tab
// (M125): mỗi lần chỉ MOUNT tab đang mở nên các panel nặng (bản đồ, S-curve, EVM) không tự
// fetch khi chưa ai xem. Tab đang mở ghi vào URL `?tab=` (do trang cha xử lý).

// Lazy-load các component nặng (recharts, nhiều fetch) — chỉ load khi đã render shell.
const ProgressMap = dynamic(() => import("@/app/components/ProgressMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-xl" />,
});
const SCurveChart = dynamic(() => import("@/app/components/SCurveChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-xl" />,
});
const DashboardBarChart = dynamic(() => import("@/app/components/DashboardBarChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-56 rounded-xl" />,
});
const EvmChart = dynamic(() => import("@/app/components/EvmChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-xl" />,
});

export const TABS: TabItem[] = [
  { id: "sheets", label: "Trang tracking", icon: List },
  { id: "map", label: "Bản đồ", icon: MapIcon },
  { id: "scurve", label: "S-curve", icon: TrendingUp },
  { id: "evm", label: "EVM", icon: LineChart },
  { id: "chart", label: "Biểu đồ", icon: BarChart3 },
];
// Tab mặc định là S-curve: đây là cách nhìn "tiến độ toàn dự án" duy nhất trả lời ngay
// câu hỏi "đang nhanh hay chậm so với kế hoạch", và cũng là panel e2e trang chủ dùng làm
// mốc "đã hydrate + nạp xong dữ liệu" (`e2e/authed/dashboard.spec.ts`).
export const DEFAULT_TAB = "scurve";

export default function DieuHanhTabs({
  canImport,
  tab,
  onTabChange,
  kpiOrder,
  onReorder,
  onDeleteSheet,
  chartData,
}: {
  canImport: boolean;
  tab: string;
  onTabChange: (id: string) => void;
  kpiOrder: KPI[];
  /** Thứ tự mới sau khi kéo thả (đã sắp xếp lại) — trang cha lưu về /api/sheets. */
  onReorder: (next: KPI[]) => void;
  onDeleteSheet: (sheetId: number, sheetName: string) => void;
  chartData: { name: string; value: number; delayed: number }[];
}) {
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  function onDragStart(i: number) {
    dragIdx.current = i;
  }
  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    dragOverIdx.current = i;
  }
  function onDrop() {
    const from = dragIdx.current;
    const to = dragOverIdx.current;
    if (from === null || to === null || from === to) return;
    const next = [...kpiOrder];
    next.splice(to, 0, next.splice(from, 1)[0]);
    dragIdx.current = null;
    dragOverIdx.current = null;
    onReorder(next);
  }

  return (
    <Card pad="none">
      <Tabs
        group="home-progress"
        label="Cách nhìn tiến độ"
        items={TABS}
        value={tab}
        onChange={onTabChange}
        className="px-2"
      />
      <TabPanel group="home-progress" value={tab} className="p-3">
        {tab === "sheets" && (
          <div className="space-y-0.5">
            {canImport && (
              <p className="px-2 pb-1 text-[11px] text-zinc-400">
                Kéo thả hàng để đổi thứ tự hiển thị
              </p>
            )}
            {kpiOrder.map((k, i) => {
              const slug = k.sheetSlug ?? slugFromCode(k.sheetType);
              return (
                <div
                  key={k.sheetId}
                  draggable={canImport}
                  onDragStart={() => onDragStart(i)}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDrop={onDrop}
                >
                  <ProgressRow
                    href={slug ? `/tracking/${slug}` : undefined}
                    label={k.sheetType}
                    hint={`${k.total} công việc`}
                    percent={(k.avgProgress ?? 0) * 100}
                    badge={
                      k.delayed > 0 ? (
                        <Chip tone="danger" icon={AlertTriangle}>
                          <span className="tabular-nums">{k.delayed}</span> trễ
                        </Chip>
                      ) : (
                        <Chip tone="success">Đúng tiến độ</Chip>
                      )
                    }
                    leading={
                      canImport ? (
                        <GripVertical
                          className="w-3.5 h-3.5 shrink-0 text-zinc-700 cursor-grab active:cursor-grabbing"
                          aria-hidden="true"
                        />
                      ) : undefined
                    }
                    trailing={
                      canImport ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          icon={Trash2}
                          title="Xoá trang tracking"
                          aria-label={`Xoá trang ${k.sheetType}`}
                          onClick={() => onDeleteSheet(k.sheetId, k.sheetType)}
                          className="shrink-0 hover:text-red-300"
                        />
                      ) : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
        {tab === "map" && <ProgressMap />}
        {tab === "scurve" && <SCurveChart />}
        {tab === "evm" && <EvmChart />}
        {tab === "chart" && <DashboardBarChart data={chartData} />}
      </TabPanel>
    </Card>
  );
}
