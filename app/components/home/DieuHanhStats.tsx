"use client";
import {
  CalendarCheck,
  Gauge,
  ListChecks,
  Plus,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button, Chip, Section, StatCard } from "@/app/components/ui";
import type { ApprovalsBlock } from "@/app/components/DashboardExtCards";

// Dải số liệu đầu trang chủ chế độ Điều hành (M127 FR4) — 5 thẻ: Tiến độ tổng (kèm Δ so
// với tuần trước) · Hạng mục trễ · Đến hạn ≤N ngày · Chờ duyệt · Công tác theo dõi.
// "Chờ duyệt" chỉ có với vai trò được duyệt → lưới rút còn 4 cột.

// Chip "Δ tuần": `weekDelta` là phần trăm dạng 0..1 do /api/dashboard tính (chênh lệch với
// 7 ngày trước). Dấu + icon mang thông tin song song với màu (không truyền tải chỉ bằng màu).
function ChipTuan({ delta }: { delta: number }) {
  const pct = delta * 100;
  const chuoi = Math.abs(pct).toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (pct > 0)
    return (
      <Chip tone="success" icon={TrendingUp}>
        +{chuoi}% / tuần
      </Chip>
    );
  if (pct < 0)
    return (
      <Chip tone="danger" icon={TrendingDown}>
        −{chuoi}% / tuần
      </Chip>
    );
  return <Chip tone="neutral">0,0% / tuần</Chip>;
}

export default function DieuHanhStats({
  canImport,
  onAddSheet,
  pct,
  totalTasks,
  delayedGroups,
  delayedTasks,
  sheetCount,
  approvals,
  dueSoon,
  weekDelta,
}: {
  canImport: boolean;
  onAddSheet: () => void;
  /** % tiến độ tổng có trọng số (0..100, đã làm tròn). */
  pct: number;
  totalTasks: number;
  /** Số hạng mục (cặp sheet · tầng) đang trễ. */
  delayedGroups: number;
  /** Số công tác trễ — dùng cho dòng chú thích của thẻ "Hạng mục trễ". */
  delayedTasks: number;
  sheetCount: number;
  approvals: ApprovalsBlock | null;
  dueSoon: { days: number; count: number } | null;
  weekDelta: number | null;
}) {
  return (
    <Section
      title="Tổng quan dự án"
      description="Số liệu tổng hợp toàn bộ trang tracking đang theo dõi"
      actions={
        canImport && (
          // Desktop có nút "Thêm trang" trong thanh công cụ; nút này dành cho màn hẹp.
          <Button size="sm" icon={Plus} onClick={onAddSheet} className="md:hidden">
            Thêm trang
          </Button>
        )
      }
    >
      <div
        className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${
          approvals ? "lg:grid-cols-5" : "lg:grid-cols-4"
        }`}
      >
        <StatCard
          label="Tiến độ tổng"
          value={pct}
          unit="%"
          progress={pct / 100}
          tone={pct >= 80 ? "success" : pct >= 50 ? "info" : "warning"}
          hint="Bình quân có trọng số theo số công việc"
          icon={Gauge}
          badge={weekDelta != null ? <ChipTuan delta={weekDelta} /> : undefined}
        />
        <StatCard
          label="Hạng mục trễ"
          value={delayedGroups}
          tone={delayedGroups > 0 ? "danger" : "success"}
          hint={
            delayedGroups > 0
              ? `${delayedTasks} công tác · bấm để xem danh sách`
              : "Toàn bộ đúng hạn"
          }
          icon={TrendingDown}
          href={delayedGroups > 0 ? "#delayed-table" : undefined}
        />
        {dueSoon && (
          <StatCard
            label={`Đến hạn ≤${dueSoon.days} ngày`}
            value={dueSoon.count}
            tone={dueSoon.count > 0 ? "warning" : "success"}
            hint={`Ngưỡng cảnh báo ${dueSoon.days} ngày · mở Lookahead`}
            icon={Timer}
            href="/lookahead?days=7"
          />
        )}
        {approvals && (
          <StatCard
            label="Chờ duyệt"
            value={approvals.pendingProposals + approvals.pendingPurchaseRequests}
            tone="neutral"
            hint={`${approvals.pendingProposals} đề xuất · ${approvals.pendingPurchaseRequests} yêu cầu mua`}
            icon={CalendarCheck}
            href="/approvals"
          />
        )}
        <StatCard
          label="Công tác theo dõi"
          value={totalTasks.toLocaleString("vi-VN")}
          tone="neutral"
          hint={`${sheetCount} trang tracking`}
          icon={ListChecks}
        />
      </div>
    </Section>
  );
}
