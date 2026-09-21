import type { ReactNode } from "react";

// Hàng tiến độ gọn (M125 FR2) — kiểu hàng dùng chung cho danh sách trang tracking và
// danh sách hệ thi công trên trang chủ: [tên · chú thích] [thanh tiến độ] [%] [chip trạng
// thái]. Thay cho 2 lưới thẻ khác nhau trước đây (5 cột / 6 cột) vốn ngốn chiều dọc và
// bắt mắt đổi nhịp giữa hai khối cùng nội dung.
//
// `leading`/`trailing` nằm NGOÀI thẻ <a> để không lồng nút trong link (lỗi a11y): tay cầm
// kéo và nút xoá của trang tracking đi qua hai slot này.

type Tone = "success" | "info" | "warning";

// Cùng ngưỡng màu với StatCard trên trang chủ (≥80% tốt · ≥50% bình thường · dưới nữa là
// cảnh báo) để một con số không đổi màu khi nhìn ở hai khối khác nhau.
const TONE: Record<Tone, { bar: string; text: string }> = {
  success: { bar: "bg-emerald-500", text: "text-emerald-300" },
  info: { bar: "bg-sky-500", text: "text-sky-300" },
  warning: { bar: "bg-amber-500", text: "text-amber-300" },
};

export default function ProgressRow({
  href,
  label,
  hint,
  percent,
  badge,
  leading,
  trailing,
  className = "",
}: {
  href?: string;
  label: ReactNode;
  /** Chú thích một dòng dưới tên (vd "128 công việc"). */
  hint?: ReactNode;
  /** 0..100 */
  percent: number;
  /** Chip trạng thái canh phải (vd "3 trễ" / "Đúng tiến độ"). */
  badge?: ReactNode;
  /** Trước tên, ngoài link — tay cầm kéo, chấm màu hệ. */
  leading?: ReactNode;
  /** Sau chip, ngoài link — nút xoá. */
  trailing?: ReactNode;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const tone = TONE[pct >= 80 ? "success" : pct >= 50 ? "info" : "warning"];
  const inner = (
    <>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-zinc-100 truncate">{label}</span>
        {hint && <span className="block text-[11px] text-zinc-400 truncate">{hint}</span>}
      </span>
      <span className="hidden sm:block h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <span
          className={`block h-full rounded-full transition-all duration-500 ${tone.bar}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={`text-sm font-mono font-semibold tabular-nums text-right ${tone.text}`}>
        {pct}%
      </span>
      <span className="justify-self-end">{badge}</span>
    </>
  );
  // 4 cột từ sm trở lên; dưới sm bỏ cột thanh tiến độ (chỉ còn tên · % · chip) cho vừa
  // màn hẹp ngoài công trường.
  const cls =
    "flex-1 min-w-0 grid items-center gap-2 min-h-11 px-2 rounded-lg grid-cols-[minmax(0,1fr)_56px_auto] sm:grid-cols-[160px_minmax(0,1fr)_56px_auto] transition";
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {leading}
      {href ? (
        <a href={href} className={`${cls} hover:bg-zinc-800/60 interactive-press`}>
          {inner}
        </a>
      ) : (
        <div className={cls}>{inner}</div>
      )}
      {trailing}
    </div>
  );
}
