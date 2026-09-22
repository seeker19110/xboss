"use client";
import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import DelayedGroupsTable from "@/app/components/DelayedGroupsTable";
import EditableText from "@/app/components/EditableText";
import { Card, Section, Select } from "@/app/components/ui";
import { trackingUrl } from "@/app/lib/trackingUrl";
import { sortFloorsDesc } from "@/lib/nen/floors";
import { STATUS_LABEL, type StatusSlug } from "@/lib/tien-do/status";
import type { DelayedTask, KPI } from "@/app/components/home/useDieuHanhData";

// Khối "Danh sách hạng mục trễ" của trang chủ chế độ Điều hành. Ba bộ lọc sheet/tầng/trạng
// thái là việc riêng của bảng nên giữ state tại đây; lọc theo NGUYÊN NHÂN (`reasonFilter`)
// do Pareto ở cột phải điều khiển nên nhận từ trang cha.

export default function DelayedSection({
  tasks,
  kpi,
  sheetLabel,
  reasonFilter,
  delayReasons,
  groupProgress,
  canEditReason,
  onSetReason,
  canImport,
}: {
  /** Toàn bộ công tác trễ (chưa lọc). */
  tasks: DelayedTask[];
  kpi: KPI[];
  sheetLabel: (code: string) => string;
  /** "" = không lọc, "__none" = chưa gán lý do (do Pareto đặt). */
  reasonFilter: string;
  delayReasons: { code: string; label: string }[];
  groupProgress: Map<string, number>;
  canEditReason: boolean;
  onSetReason: (taskId: number, reason: string) => void;
  canImport: boolean;
}) {
  const [sheetFilter, setSheetFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const floors = useMemo(
    () => [...new Set(tasks.map((t) => t.floorLabel).filter(Boolean))].sort(sortFloorsDesc),
    [tasks],
  );
  const statuses = useMemo(() => [...new Set(tasks.map((t) => t.status).filter(Boolean))], [tasks]);
  const delayed = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!sheetFilter || t.sheetType === sheetFilter) &&
          (!floorFilter || t.floorLabel === floorFilter) &&
          (!statusFilter || t.status === statusFilter) &&
          (!reasonFilter ||
            (reasonFilter === "__none" ? !t.delayReason : t.delayReason === reasonFilter)),
      ),
    [tasks, sheetFilter, floorFilter, statusFilter, reasonFilter],
  );
  // Số hạng mục trễ = số cặp (sheet, tầng) trong danh sách đã lọc — khớp cách đếm ở KPI.
  const delayedGroupCount = useMemo(
    () => new Set(delayed.map((t) => `${t.sheetType}::${t.floorLabel ?? ""}`)).size,
    [delayed],
  );

  const boLoc = [
    {
      value: sheetFilter,
      onChange: setSheetFilter,
      placeholder: "Tất cả sheet",
      options: kpi.map((k) => ({ v: k.sheetType, l: k.sheetType })),
    },
    {
      value: floorFilter,
      onChange: setFloorFilter,
      placeholder: "Tất cả tầng",
      options: floors.map((f) => ({ v: f, l: f })),
    },
    {
      value: statusFilter,
      onChange: setStatusFilter,
      placeholder: "Tất cả trạng thái",
      options: statuses.map((s) => ({ v: s, l: STATUS_LABEL[s as StatusSlug] ?? s })),
    },
  ];

  return (
    <Section
      id="delayed-table"
      icon={Clock}
      title={<EditableText tkey="dashboard.delayed.title">Danh sách hạng mục trễ</EditableText>}
      description={`${delayedGroupCount} hạng mục · ${delayed.length} công tác`}
      actions={
        <div className="flex flex-wrap gap-2">
          {boLoc.map((sel, i) => (
            <Select
              key={i}
              value={sel.value}
              onChange={sel.onChange}
              aria-label={sel.placeholder}
              placeholder={sel.placeholder}
              options={sel.options}
              className="min-w-0"
            />
          ))}
        </div>
      }
    >
      {/* Danh sách hạng mục trễ (cặp sheet + tầng) — bấm 1 hạng mục để mở ra các công tác
          trễ bên trong. Cuộn ngang trên mobile. */}
      <Card pad="none" className="overflow-hidden">
        <DelayedGroupsTable
          tasks={delayed}
          sheetLabel={sheetLabel}
          taskHref={(t) => trackingUrl(t.sheetSlug, t.sheetType, t.floorLabel)}
          editReason={{ canEdit: canEditReason, onChange: onSetReason }}
          delayReasons={delayReasons}
          groupProgress={groupProgress}
          emptyMessage={
            <>
              Không có công việc trễ.{" "}
              {canImport && (
                <a href="/import" className="text-emerald-400 hover:underline">
                  Import file Excel
                </a>
              )}
              {!canImport && "Hãy liên hệ Admin/PM để cập nhật dữ liệu."}
            </>
          }
        />
      </Card>
    </Section>
  );
}
