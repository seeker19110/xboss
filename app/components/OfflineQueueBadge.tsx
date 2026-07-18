"use client";
// Badge trạng thái hàng đợi offline trên AppHeader (mọi trang) — đếm thao tác chờ/đang
// gửi/lỗi, tái dùng ngôn ngữ hình ảnh WifiOff/CloudUpload đã dùng ở trang tracking.
import { WifiOff, CloudUpload, AlertTriangle } from "lucide-react";
import { useOfflineQueueStatus } from "@/app/components/offlineQueue";

export default function OfflineQueueBadge() {
  const { total, failed, online, sending } = useOfflineQueueStatus();
  if (total === 0) return null;

  // 4 trạng thái, ưu tiên: mất mạng → có lỗi → đang gửi → đang chờ.
  let Icon = CloudUpload;
  let tone = "text-sky-400 border-sky-800 bg-sky-950/40";
  let label: string;
  let animate = "";

  if (!online) {
    Icon = WifiOff;
    tone = "text-amber-400 border-amber-800 bg-amber-950/40";
    label = `Mất mạng — ${total} thao tác chờ gửi khi có mạng`;
  } else if (failed > 0) {
    Icon = AlertTriangle;
    tone = "text-amber-400 border-amber-800 bg-amber-950/40";
    label = `${failed} thao tác gửi lỗi, sẽ tự thử lại (tổng ${total} đang chờ)`;
  } else if (sending) {
    tone = "text-sky-400 border-sky-800 bg-sky-950/40";
    label = `Đang gửi ${total} thao tác đã lưu offline`;
    animate = "animate-pulse";
  } else {
    tone = "text-sky-400 border-sky-800 bg-sky-950/40";
    label = `${total} thao tác chờ gửi lại`;
  }

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 px-1.5 min-h-[44px] sm:min-h-0 sm:py-1 rounded-lg border text-xs font-medium ${tone}`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${animate}`} strokeWidth={1.75} aria-hidden="true" />
      <span className="tabular-nums">{total}</span>
    </span>
  );
}
