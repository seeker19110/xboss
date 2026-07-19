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
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center min-h-[60vh]">
      <WifiOff className="w-12 h-12 text-zinc-400" strokeWidth={1.5} aria-hidden="true" />
      <h1 className="text-lg font-semibold">Đã xảy ra lỗi</h1>
      <p className="text-sm text-zinc-400 max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-on-accent text-sm font-medium hover:bg-emerald-600 transition min-h-10"
        >
          <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          Thử lại
        </button>
      )}
    </div>
  );
}
