// app/components/SystemUploadPanel.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CalendarCheck,
  ClipboardList,
  Download,
  Upload,
  Clock,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

type UploadHistoryItem = {
  id: number;
  originalName: string | null;
  uploadedBy: { id: number; name: string } | null;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  warnings: string[];
  createdAt: string;
};

type SectionProps = {
  systemCode: string;
  kind: "ke_hoach" | "tracking";
  title: string;
  icon: React.ReactNode;
  canUpload: boolean;
};

function SystemUploadSection({ systemCode, kind, title, icon, canUpload }: SectionProps) {
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{
    success?: boolean;
    message?: string;
    matched?: number;
    unmatched?: number;
    warnings?: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/systems/${systemCode}/uploads?kind=${kind}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.slice(0, 5)); // Lấy tối đa 5 bản ghi đầu
      }
    } catch (err) {
      console.error("Lỗi fetch lịch sử:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [systemCode, kind]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !fileInputRef.current ||
      !fileInputRef.current.files ||
      fileInputRef.current.files.length === 0
    ) {
      setStatus({ success: false, message: "Vui lòng chọn một file trước." });
      return;
    }

    const file = fileInputRef.current.files[0];
    setUploading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/systems/${systemCode}/upload?kind=${kind}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setStatus({
          success: true,
          message: `Upload thành công!`,
          matched: data.matched,
          unmatched: data.unmatched,
          warnings: data.warnings,
        });
        // Clear file input
        fileInputRef.current.value = "";
        // Refresh history list
        fetchHistory();
      } else {
        setStatus({
          success: false,
          message: data.error || "Có lỗi xảy ra khi upload file.",
        });
      }
    } catch (err) {
      setStatus({
        success: false,
        message: "Lỗi kết nối mạng, vui lòng thử lại.",
      });
    } finally {
      setUploading(false);
    }
  };

  const formatVNTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex flex-col space-y-4 bg-zinc-950 p-4 border border-zinc-800/80 rounded-lg">
      {/* Title */}
      <div className="flex items-center space-x-2 text-zinc-100 font-semibold text-sm">
        {icon}
        <span>{title}</span>
      </div>

      {/* Download template */}
      <div className="flex items-center">
        <a
          href={`/api/systems/${systemCode}/upload-template?kind=${kind}`}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-medium rounded-lg transition-colors border border-zinc-700/60"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Tải file mẫu Excel</span>
        </a>
      </div>

      {/* Upload area */}
      {canUpload && (
        <form
          onSubmit={handleUpload}
          className="flex flex-col space-y-2 border-t border-zinc-800/50 pt-3"
        >
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Upload cập nhật dữ liệu
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx"
              disabled={uploading}
              className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-zinc-750 file:text-xs file:font-medium file:bg-zinc-900 file:text-zinc-300 file:hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-emerald-800/50 text-white text-xs font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? "Đang gửi..." : "Gửi"}</span>
            </button>
          </div>
        </form>
      )}

      {/* Status banner */}
      {status && (
        <div
          className={`p-3 rounded-lg text-xs border ${
            status.success
              ? "bg-emerald-950/20 border-emerald-800/50 text-emerald-300"
              : "bg-rose-950/20 border-rose-800/50 text-rose-300"
          }`}
        >
          <div className="flex items-center space-x-1.5 font-semibold">
            {status.success ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-450" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-405" />
            )}
            <span>{status.message}</span>
          </div>

          {status.success && status.matched !== undefined && (
            <div className="mt-1.5 space-y-0.5 text-zinc-300">
              <p>
                ✓ Khớp & Cập nhật: <strong className="text-zinc-50">{status.matched}</strong> dòng.
              </p>
              <p>
                ⚠ Bỏ qua: <strong className="text-zinc-300">{status.unmatched}</strong> dòng.
              </p>
            </div>
          )}

          {status.warnings && status.warnings.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-800/40">
              <p className="font-semibold text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                Chi tiết cảnh báo ({status.warnings.length}):
              </p>
              <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto text-zinc-400 pr-1 select-text">
                {status.warnings.slice(0, 5).map((w, idx) => (
                  <li key={idx} className="truncate" title={w}>
                    {w}
                  </li>
                ))}
                {status.warnings.length > 5 && (
                  <li className="list-none text-zinc-500 italic mt-0.5">
                    ...và {status.warnings.length - 5} cảnh báo khác.
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Upload history */}
      <div className="flex flex-col space-y-1.5 border-t border-zinc-800/50 pt-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Lịch sử cập nhật
        </label>
        {loadingHistory ? (
          <div className="space-y-1">
            <div className="h-6 bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-6 bg-zinc-900 rounded-lg animate-pulse w-3/4" />
          </div>
        ) : history.length === 0 ? (
          <span className="text-xs text-zinc-500 italic">Chưa có lần upload nào.</span>
        ) : (
          <div className="divide-y divide-zinc-900 overflow-hidden rounded-lg border border-zinc-900 text-xs">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-2 bg-zinc-900/40 hover:bg-zinc-900/80 transition-colors"
              >
                <div className="flex flex-col space-y-0.5 min-w-0 pr-2">
                  <span className="text-zinc-300 font-medium truncate" title={h.originalName ?? ""}>
                    {h.originalName ?? "File_Excel_Chua_Ro"}
                  </span>
                  <span className="text-[10px] text-zinc-500 flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatVNTime(h.createdAt)}</span>
                    <span>·</span>
                    <span>Bởi: {h.uploadedBy?.name ?? "Unknown"}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                    {h.matchedCount} khớp
                  </span>
                  <a
                    href={`/api/system-uploads/${h.id}/file`}
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
                    title="Tải lại file này"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SystemUploadPanel({
  systemCode,
  canUpload,
}: {
  systemCode: string;
  canUpload: boolean;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Cập nhật tiến độ & kế hoạch
        </span>
        <h2 className="text-base font-semibold text-zinc-100 mt-0.5">
          Nhập dữ liệu Excel theo hệ thống
        </h2>
      </div>

      {/* Grid sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Kế hoạch */}
        <SystemUploadSection
          systemCode={systemCode}
          kind="ke_hoach"
          title="Kế hoạch (Ngày bắt đầu & kết thúc)"
          icon={<CalendarCheck className="w-4 h-4 text-sky-400" />}
          canUpload={canUpload}
        />

        {/* Tracking */}
        <SystemUploadSection
          systemCode={systemCode}
          kind="tracking"
          title="Thực tế (Lưới tracking kích thước thi công)"
          icon={<ClipboardList className="w-4 h-4 text-emerald-400" />}
          canUpload={canUpload}
        />
      </div>
    </div>
  );
}
