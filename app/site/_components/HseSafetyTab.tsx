"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  Camera,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { formatDateVN } from "@/lib/nen/date";

export default function HseSafetyTab() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/hse").then((r) => (r.ok ? r.json() : { incidents: [] })),
      fetch("/api/risks").then((r) => (r.ok ? r.json() : { risks: [] })),
    ])
      .then(([hseData, rskData]) => {
        setIncidents(hseData.incidents || hseData.items || []);
        setRisks(rskData.risks || rskData.items || []);
      })
      .catch(() => showToast("Không tải được dữ liệu an toàn HSE", "error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* HSE AI Computer Vision Banner Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              HSE AI Computer Vision Sentinel (QCVN 18:2021/BXD)
            </h3>
            <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
              AI Vision M87
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Camera AI tự động quét ảnh chụp hiện trường phát hiện không đội mũ bảo hộ, thiếu áo phản
            quang, không đeo dây an toàn khi làm việc trên cao và mép sàn thiếu lan can chắn.
          </p>
          <div className="pt-2">
            <Link
              href="/engineering/hse-vision"
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition inline-flex items-center gap-1.5 shadow"
            >
              <Camera className="w-3.5 h-3.5" /> Mở HSE AI Vision Cockpit (M87){" "}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Chỉ Số An Toàn Lao Động Toàn Công Trường
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-400">96 / 100 Điểm</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Số ngày an toàn không xảy ra tai nạn mất ngày công (LTI - Lost Time Injury):{" "}
            <strong>142 Ngày</strong> liên tục.
          </p>
          <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
            <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-500">Vi Phạm Nhẹ</div>
              <div className="font-bold text-amber-400 text-xs">2 Vụ</div>
            </div>
            <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-500">Nghiêm Trọng</div>
              <div className="font-bold text-emerald-400 text-xs">0 Vụ</div>
            </div>
            <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-500">Hộp Cứu Hỏa</div>
              <div className="font-bold text-zinc-200 text-xs">100% OK</div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Register Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Ma Trận Rủi Ro & Biện Pháp Giảm Thiểu (Risk Register)
          </h3>
          <span className="text-xs text-zinc-400 font-mono">{risks.length} Rủi ro theo dõi</span>
        </div>

        {loading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : risks.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">
            Không có rủi ro nghiêm trọng nào đang tồn đọng.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                  <th className="py-2.5 px-3">Mã Rủi Ro</th>
                  <th className="py-2.5 px-3">Mô Tả Rủi Ro</th>
                  <th className="py-2.5 px-3">Mức Độ</th>
                  <th className="py-2.5 px-3">Biện Pháp Giảm Thiểu</th>
                  <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {risks.map((rsk) => (
                  <tr key={rsk.id} className="hover:bg-zinc-900/40 transition">
                    <td className="py-3 px-3 font-mono font-bold text-zinc-200">
                      {rsk.code || `RSK-${rsk.id}`}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-zinc-200">{rsk.title || rsk.name}</div>
                      <div className="text-[11px] text-zinc-500">
                        {rsk.category || "Thi công cơ điện"}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          rsk.level === "high"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {rsk.level === "high" ? "Cao" : "Trung bình"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-zinc-400 max-w-sm truncate">
                      {rsk.mitigation || "Lắp đặt rào chắn và kiểm tra hằng ngày"}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                        {rsk.status || "Đang kiểm soát"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
