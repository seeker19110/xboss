import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cardClass } from "@/app/components/ui/Card";

// Ô số liệu dùng chung (KPI/tiến độ/đếm). Gom về một chỗ cách trình bày "nhãn nhỏ ở trên,
// số to tabular-nums ở giữa, chú thích/thanh tiến độ ở dưới" đang bị chép tay ở Dashboard,
// HubShell và nhiều trang hub.
export type StatTone = "neutral" | "success" | "warning" | "danger" | "info";

const VALUE_TONE: Record<StatTone, string> = {
  neutral: "text-zinc-100",
  success: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-red-300",
  info: "text-sky-300",
};

const BAR_TONE: Record<StatTone, string> = {
  neutral: "bg-zinc-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
};

export default function StatCard({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
  icon: Icon,
  progress,
  badge,
  href,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  /** Đơn vị đi kèm số (%, việc, ngày…) — chữ nhỏ, không đọc to như số. */
  unit?: string;
  hint?: ReactNode;
  tone?: StatTone;
  icon?: LucideIcon;
  /** 0..1 — hiện thanh tiến độ dưới đáy thẻ. */
  progress?: number;
  /** Chip nhỏ góc phải (vd số việc trễ). */
  badge?: ReactNode;
  href?: string;
  className?: string;
}) {
  const pct = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress * 100)));
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400 min-w-0">
          {Icon && <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />}
          <span className="truncate">{label}</span>
        </span>
        {badge}
      </div>
      <div className="mt-3">
        <p className={`text-2xl font-bold font-mono tabular-nums leading-none ${VALUE_TONE[tone]}`}>
          {value}
          {unit && <span className="ml-1 text-sm font-medium text-zinc-400">{unit}</span>}
        </p>
        {hint && <p className="mt-1.5 text-[11px] text-zinc-400 truncate">{hint}</p>}
      </div>
      {pct != null && (
        <div className="mt-3 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${BAR_TONE[tone]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </>
  );
  const cls = cardClass({
    tone: "sunken",
    pad: "md",
    interactive: !!href,
    className: `flex flex-col justify-between ${className}`,
  });
  return href ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
