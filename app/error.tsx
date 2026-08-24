"use client";

import React, { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import {
  AlertTriangle,
  RotateCcw,
  Home,
  LayoutGrid,
  FileCheck,
  CheckCircle2,
  Package,
  DollarSign,
  Copy,
  Trash2,
  Check,
} from "lucide-react";

/**
 * Resilient Error Boundary cho Route Segment (M81)
 * Khắc phục hoàn toàn nợ kỹ thuật PROGRESS.md:2217 — Cung cấp Fallback Navigation Bar
 * để người dùng không bao giờ bị mất thanh điều hướng khi một trang gặp sự cố.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const copyErrorReport = () => {
    const report = `[XBoss Error Report]
Thời gian: ${new Date().toISOString()}
Lỗi: ${error.message || "Unknown error"}
Digest: ${error.digest || "N/A"}
URL: ${typeof window !== "undefined" ? window.location.href : "N/A"}
Stack: ${error.stack || "N/A"}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleHardClearCache = async () => {
    setClearingCache(true);
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      if ("caches" in window) {
        const cacheKeys = await caches.keys();
        for (const key of cacheKeys) {
          await caches.delete(key);
        }
      }
      localStorage.removeItem("xboss_offline_ticks");
      sessionStorage.clear();
      window.location.href = "/";
    } catch (e) {
      console.error("Lỗi xóa cache:", e);
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Resilient Fallback Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-bold text-lg text-amber-400 tracking-tight">XBOSS</span>
            <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-medium">
              Chế độ Phục hồi
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-xs font-medium text-on-accent transition"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Thử lại
          </button>
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition border border-zinc-700"
          >
            <Home className="w-3.5 h-3.5" /> Về Dashboard
          </Link>
        </div>
      </header>

      {/* Main Error Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-4 lg:p-8 flex flex-col items-center justify-center">
        <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-6 lg:p-8 shadow-2xl flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
            <div className="p-3.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-zinc-100">
                Phân hệ này đã gặp sự cố ngoài dự kiến
              </h1>
              <p className="mt-1.5 text-sm text-zinc-400">
                Sự cố hiển thị đã được ghi nhận tự động. Bạn vẫn có thể truy cập tất cả các phân hệ
                khác thông qua thanh điều hướng nhanh bên dưới.
              </p>
            </div>
          </div>

          {/* Quick Navigation Cards */}
          <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Điều hướng Khẩn cấp
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Link
                href="/tracking/ogtd"
                className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 hover:border-sky-500/50 hover:bg-sky-950/20 text-xs font-medium transition flex items-center gap-2 text-zinc-200"
              >
                <LayoutGrid className="w-4 h-4 text-sky-400" />
                <span>Lưới Tiến Độ</span>
              </Link>
              <Link
                href="/approvals"
                className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-950/20 text-xs font-medium transition flex items-center gap-2 text-zinc-200"
              >
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>Nghiệm Thu (BBNT)</span>
              </Link>
              <Link
                href="/procurement?tab=inventory"
                className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 hover:border-amber-500/50 hover:bg-amber-950/20 text-xs font-medium transition flex items-center gap-2 text-zinc-200"
              >
                <Package className="w-4 h-4 text-amber-400" />
                <span>Vật Tư & Thiết Bị</span>
              </Link>
              <Link
                href="/commercial?tab=cashflow-esign"
                className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 hover:border-violet-500/50 hover:bg-violet-950/20 text-xs font-medium transition flex items-center gap-2 text-zinc-200"
              >
                <DollarSign className="w-4 h-4 text-violet-400" />
                <span>Tài Chính & Hợp Đồng</span>
              </Link>
            </div>
          </div>

          {/* Technical Diagnostics Box */}
          <div className="bg-zinc-950/90 rounded-lg p-4 border border-zinc-800/80 text-xs flex flex-col gap-2 font-mono">
            <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800">
              <span className="font-semibold text-zinc-300">Thông Tin Chẩn Đoán Kỹ Thuật</span>
              {error.digest && (
                <span className="text-[11px] bg-zinc-800 px-2 py-0.5 rounded text-sky-400">
                  Digest: {error.digest}
                </span>
              )}
            </div>
            <div className="text-rose-400 break-words line-clamp-2">
              {error.message || "Lỗi giao diện không xác định"}
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={copyErrorReport}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? "Đã sao chép báo cáo lỗi" : "Sao chép mã lỗi gửi IT"}</span>
              </button>

              <button
                onClick={handleHardClearCache}
                disabled={clearingCache}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-rose-400 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearingCache ? "Đang xóa cache..." : "Xóa cache hỏng & Tải lại"}</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
