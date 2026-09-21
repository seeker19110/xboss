import type { ReactNode } from "react";

// Chip phím tắt (M124) — gợi ý phím đi kèm nhãn nút/hành động.
// `hidden md:inline`: điện thoại công trường không có bàn phím vật lý, hiện chip chỉ
// làm chật nút; desktop mới thấy. Trên nền nút primary (emerald đặc) dùng biến thể
// `onAccent` để viền/chữ vẫn đọc được mà không phá công thức màu của Button.
export default function Kbd({
  onAccent = false,
  className = "",
  children,
}: {
  /** Đặt trên nền accent đặc (nút primary) — viền/chữ sáng thay vì zinc. */
  onAccent?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <kbd
      className={`hidden md:inline rounded border px-1 text-[10px] font-sans leading-4 ${
        onAccent ? "border-white/40 text-white/80" : "border-zinc-700 text-zinc-400"
      } ${className}`}
    >
      {children}
    </kbd>
  );
}
