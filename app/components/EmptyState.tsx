import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Trạng thái rỗng dùng chung — thay các đoạn `<div className="text-center py-…">`
// rải rác từng trang (vd EmptyState riêng trong ReportsTab.tsx trước đây).
export default function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title?: string;
  message: string;
  action?: ReactNode;
  /** Vùng chật (bảng nhỏ, panel) — giảm padding dọc. */
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? "py-6" : "py-12"}`}
    >
      {Icon && <Icon className="h-8 w-8 text-zinc-600" strokeWidth={1.5} aria-hidden="true" />}
      {title && <p className="text-sm font-medium text-zinc-300">{title}</p>}
      <p className="text-sm text-zinc-400">{message}</p>
      {action}
    </div>
  );
}
