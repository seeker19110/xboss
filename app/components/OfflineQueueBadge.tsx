"use client";
// Badge trạng thái hàng đợi offline trên AppHeader (mọi trang) — đếm thao tác chờ/đang
// gửi/lỗi, tái dùng ngôn ngữ hình ảnh WifiOff/CloudUpload đã dùng ở trang tracking.
// S08: bấm badge mở màn phục hồi (badge cũng là "host" của màn này cho chip lưới tracking).
import { WifiOff, CloudUpload, AlertTriangle } from "lucide-react";
import { useOfflineQueueStatus } from "@/app/components/offlineQueue";
import OfflineRecoveryPanel, {
  moManPhucHoiNgoaiTuyen,
  useManPhucHoiMo,
} from "@/app/components/OfflineRecoveryPanel";

export default function OfflineQueueBadge() {
  const { total, failed, online, sending, quarantined, legacy, locked } = useOfflineQueueStatus();
  const [mo, dong] = useManPhucHoiMo();
  const panel = mo ? <OfflineRecoveryPanel onClose={dong} /> : null;

  if (quarantined) {
    const label =
      "Lưu ngoại tuyến đang tạm khóa. Dữ liệu queue cũ được giữ nguyên và cách ly; hãy kết nối mạng để lưu trực tiếp.";
    return (
      <span
        role="status"
        aria-label={label}
        title={label}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-amber-800 bg-amber-950 px-2 text-xs font-medium text-amber-200"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden lg:inline">Lưu offline tạm khóa</span>
      </span>
    );
  }
  if (total === 0 && !legacy) return panel;

  // Ưu tiên: mất mạng → có lỗi/khoá/dữ liệu cũ → đang gửi → đang chờ.
  let Icon = CloudUpload;
  let tone = "text-sky-400 border-sky-800 bg-sky-950/40";
  let label: string;
  let animate = "";

  if (!online) {
    Icon = WifiOff;
    tone = "text-amber-400 border-amber-800 bg-amber-950/40";
    label = `Mất mạng — ${total} thao tác lưu trên thiết bị, chưa lên máy chủ`;
  } else if (failed > 0 || locked > 0) {
    Icon = AlertTriangle;
    tone = "text-amber-400 border-amber-800 bg-amber-950/40";
    label = `${total} thao tác lưu trên thiết bị cần xem lại (${failed} lỗi, ${locked} bị khoá)`;
  } else if (total === 0) {
    Icon = AlertTriangle;
    tone = "text-amber-400 border-amber-800 bg-amber-950/40";
    label = "Có dữ liệu ngoại tuyến cũ chưa rõ chủ cần đối soát";
  } else if (sending) {
    label = `Đang gửi ${total} thao tác đã lưu trên thiết bị`;
    animate = "animate-pulse";
  } else {
    label = `${total} thao tác lưu trên thiết bị, chờ gửi lên máy chủ`;
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${label} — mở màn thao tác ngoại tuyến`}
        aria-haspopup="dialog"
        title={label}
        onClick={moManPhucHoiNgoaiTuyen}
        className={`inline-flex items-center gap-1 px-1.5 min-h-10 rounded-lg border text-xs font-medium transition hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 ${tone}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${animate}`} strokeWidth={1.75} aria-hidden="true" />
        <span className="tabular-nums">{total}</span>
      </button>
      {panel}
    </>
  );
}
