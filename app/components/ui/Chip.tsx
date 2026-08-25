import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Chip/nhãn nhỏ dùng chung. Công thức màu tuân đúng ghi chú trong globals.css: nền MỜ dùng
// shade -500 (không bị html.light đảo) ghép chữ -300 (tự đảo) → đủ tương phản AA ở cả hai
// theme. Không dùng nền đặc -950 + chữ -200 vì công thức đó chỉ đúng khi nền đặc.
export type ChipTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-zinc-800/80 border-zinc-700 text-zinc-300",
  success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  warning: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  danger: "bg-red-500/10 border-red-500/30 text-red-300",
  info: "bg-sky-500/10 border-sky-500/30 text-sky-300",
  accent: "bg-violet-500/10 border-violet-500/30 text-violet-300",
};

export default function Chip({
  tone = "neutral",
  icon: Icon,
  className = "",
  children,
}: {
  tone?: ChipTone;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium leading-5 ${TONE[tone]} ${className}`}
    >
      {Icon && <Icon className="w-3 h-3 shrink-0" strokeWidth={2} aria-hidden="true" />}
      {children}
    </span>
  );
}
