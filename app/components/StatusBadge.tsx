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
