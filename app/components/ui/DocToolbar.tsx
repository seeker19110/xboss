import type { ReactNode } from "react";

// Thanh công cụ trên của màn hình chứng từ (M124) — bộ nút hành động của chứng từ đang
// mở, dính khi cuộn để người nhập KL nhiều dòng không phải cuộn ngược lên bấm Lưu.
//
// `hidden md:flex`: dưới md thanh hành động ĐÁY (bottomActions của AppHeader) mới là chỗ
// thao tác chính (ngón tay ở đáy màn hình, xem ADR-0009 mục "Màn hình chứng từ — M124").
export default function DocToolbar({
  children,
  trailing,
  className = "",
}: {
  children?: ReactNode;
  /** Canh phải — thường là điều hướng trước/sau + vị trí "n / N". */
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`hidden md:flex items-center gap-2 sticky top-0 z-20 rounded-xl px-3 py-2 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 overflow-x-auto scrollbar-none ${className}`}
    >
      {children}
      {trailing && <div className="ml-auto flex items-center gap-2 shrink-0">{trailing}</div>}
    </div>
  );
}

/** Vạch ngăn nhóm nút trong thanh công cụ. */
function Sep() {
  return <span className="w-px h-6 bg-zinc-800 shrink-0" aria-hidden="true" />;
}

DocToolbar.Sep = Sep;
