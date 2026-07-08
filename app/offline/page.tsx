"use client";
import { WifiOff, RefreshCw } from "lucide-react";

// Trang dự phòng ngoại tuyến — service worker (public/sw.js) precache trang này lúc
// cài đặt và trả về khi điều hướng tới 1 trang HTML chưa từng tải (không có trong cache)
// mà đang mất mạng, thay vì để trình duyệt hiện lỗi mạng mặc định.
export default function OfflinePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <WifiOff className="w-12 h-12 text-zinc-400" strokeWidth={1.5} aria-hidden="true" />
      <h1 className="text-lg font-semibold">Mất kết nối mạng</h1>
      <p className="text-sm text-zinc-400 max-w-sm">
        Trang này chưa được tải trước đó nên chưa xem được khi ngoại tuyến. Kết nối lại mạng rồi thử
        lại.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-600 transition min-h-10"
      >
        <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        Thử lại
      </button>
    </main>
  );
}
