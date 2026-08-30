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
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-6 px-4" : "py-14 px-6"
      }`}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-3 shadow-inner">
          <Icon className="h-6 w-6 text-zinc-400" strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
      {title && <p className="text-sm font-semibold text-zinc-200 mb-1">{title}</p>}
      <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
