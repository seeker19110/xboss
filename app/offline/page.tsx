"use client";
import { WifiOff, RefreshCw } from "lucide-react";

// Shell vô danh: không phục vụ HTML/dữ liệu của phiên cũ khi mất mạng.
export default function OfflinePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <WifiOff className="w-12 h-12 text-zinc-400" strokeWidth={1.5} aria-hidden="true" />
      <h1 className="text-lg font-semibold">Mất kết nối mạng</h1>
      <p className="text-sm text-zinc-400 max-w-sm">
        Kết nối lại mạng để xác minh quyền truy cập và tải dữ liệu mới nhất, rồi thử lại.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-on-accent text-sm font-medium hover:bg-emerald-800 transition min-h-10"
      >
        <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        Thử lại
      </button>
    </main>
  );
}
