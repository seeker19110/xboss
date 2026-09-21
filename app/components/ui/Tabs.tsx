import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Hàng tab dùng chung (M125) — gom nhiều khối cùng chủ đề vào MỘT thẻ thay vì xếp dọc
// hết ra trang (trang chủ trước đây phải cuộn ~6 màn hình mới tới bảng trễ). Màu nhấn
// theo ADR-0009: emerald = đang chọn; tab không chọn dùng `text-zinc-400`.
//
// Điều hướng bàn phím theo khuôn WAI-ARIA "tabs, automatic activation": ←/→ (kèm Home/End)
// đổi luôn tab đang chọn và dời focus; chỉ tab đang chọn nằm trong luồng Tab (roving
// tabindex), phần còn lại `tabIndex=-1`.

export type TabItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Số/nhãn nhỏ cạnh tên tab (vd số việc trễ). */
  badge?: ReactNode;
};

/** Id của nút tab — dùng chung giữa `Tabs` và `TabPanel` để nối `aria-labelledby`. */
export function tabButtonId(group: string, id: string) {
  return `${group}-tab-${id}`;
}

/** Id của vùng nội dung tab — nối `aria-controls` từ nút tab. */
export function tabPanelId(group: string, id: string) {
  return `${group}-panel-${id}`;
}

export default function Tabs({
  group,
  items,
  value,
  onChange,
  label,
  className = "",
}: {
  /** Tiền tố id, duy nhất trong trang — nối nút tab với vùng nội dung. */
  group: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Nhãn của cả hàng tab cho trình đọc màn hình. */
  label: string;
  className?: string;
}) {
  function moveTo(index: number) {
    const next = items[(index + items.length) % items.length];
    if (!next) return;
    onChange(next.id);
    document.getElementById(tabButtonId(group, next.id))?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = items.findIndex((t) => t.id === value);
    if (i < 0) return;
    if (e.key === "ArrowRight") moveTo(i + 1);
    else if (e.key === "ArrowLeft") moveTo(i - 1);
    else if (e.key === "Home") moveTo(0);
    else if (e.key === "End") moveTo(items.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`flex gap-0.5 border-b border-zinc-800 overflow-x-auto scrollbar-none ${className}`}
    >
      {items.map((t) => {
        const selected = t.id === value;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            id={tabButtonId(group, t.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tabPanelId(group, t.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-1.5 min-h-10 px-3 text-sm font-medium whitespace-nowrap border-b-2 transition interactive-press ${
              selected
                ? "text-emerald-300 border-emerald-500"
                : "text-zinc-400 border-transparent hover:text-zinc-100"
            }`}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />}
            {t.label}
            {t.badge != null && (
              <span className="text-[11px] font-semibold tabular-nums text-zinc-400">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Vùng nội dung của tab đang chọn — chỉ render tab đang mở (tab khác không mount). */
export function TabPanel({
  group,
  value,
  className = "",
  children,
}: {
  group: string;
  value: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(group, value)}
      aria-labelledby={tabButtonId(group, value)}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
