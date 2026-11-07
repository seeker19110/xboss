import { STATUS_LABEL, type StatusSlug } from "@/lib/tien-do/status";

// Chip trạng thái task dùng chung — gom bảng màu + nhãn về một chỗ (trước đây mỗi trang
// tự khai lại). Nền chip "-950" + chữ "-200" CỐ Ý không đảo theo theme (xem globals.css)
// để màu trạng thái giữ nguyên nghĩa ở mọi theme.
export const STATUS_CLS: Record<StatusSlug, string> = {
  chuan_bi: "bg-zinc-800/90 border-zinc-700/70 text-zinc-300",
  dang_thi_cong: "bg-blue-950/90 border-blue-800/60 text-blue-200",
  hoan_thanh: "bg-emerald-950/90 border-emerald-800/60 text-emerald-200",
  nghiem_thu: "bg-teal-950/90 border-teal-800/60 text-teal-200",
  tre: "bg-orange-950/90 border-orange-800/60 text-orange-200",
};

// Cùng một sắc độ cho mỗi trạng thái ở mọi nơi (AUD-XFEAT-001, audit 06/11/2026): trễ = cam
// (CLAUDE.md), đang thi công = xanh dương. Thanh Gantt dùng nền đặc, chữ dùng mức -400 (light
// theme tự làm đậm qua biến CSS). Thêm trạng thái mới → TypeScript bắt thiếu khoá ở cả 3 bảng.
export const STATUS_BAR: Record<StatusSlug, string> = {
  chuan_bi: "bg-zinc-600",
  dang_thi_cong: "bg-blue-600",
  hoan_thanh: "bg-emerald-600",
  nghiem_thu: "bg-teal-500",
  tre: "bg-orange-600",
};

export const STATUS_TEXT: Record<StatusSlug, string> = {
  chuan_bi: "text-zinc-400",
  dang_thi_cong: "text-blue-400",
  hoan_thanh: "text-emerald-400",
  nghiem_thu: "text-teal-400",
  tre: "text-orange-400",
};

// `className` để caller tuỳ biến kích thước/độ rộng theo bố cục (vd lưới tracking cần w-32).
export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const cls = STATUS_CLS[status as StatusSlug] ?? STATUS_CLS.chuan_bi;
  const label = STATUS_LABEL[status as StatusSlug] ?? status;
  return (
    <span
      className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-xs font-medium border shadow-xs ${cls} ${className}`}
    >
      {label}
    </span>
  );
}
