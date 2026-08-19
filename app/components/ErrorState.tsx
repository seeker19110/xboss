"use client";
import { WifiOff, RefreshCw } from "lucide-react";

// Khối hiển thị lỗi tải dữ liệu (mất mạng/API lỗi) kèm nút "Thử lại" — dùng thay cho
// màn hình trắng khi fetch dữ liệu chính của trang thất bại (xem app/offline/page.tsx
// cho phong cách tương tự ở tầng route).
export function ErrorState({
  message = "Không tải được dữ liệu — kiểm tra kết nối mạng",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center min-h-[50vh]">
      <div className="w-14 h-14 rounded-2xl bg-red-950/30 border border-red-900/50 flex items-center justify-center text-red-400 mb-4 shadow-inner">
        <WifiOff className="w-7 h-7" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-zinc-100 mb-1">Đã xảy ra lỗi tải dữ liệu</h2>
      <p className="text-xs text-zinc-400 max-w-sm mb-5 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-medium transition min-h-[44px] min-w-[120px] shadow-sm focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
        >
          <RefreshCw className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>Thử lại</span>
        </button>
      )}
    </div>
  );
}
