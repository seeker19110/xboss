"use client";

import { useState, useEffect } from "react";
import { Scale } from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { formatDateVN } from "@/lib/nen/date";

export default function ClaimsTab() {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/claims")
      .then((r) => (r.ok ? r.json() : { claims: [] }))
      .then((data) => setClaims(data.claims || []))
      .catch(() => showToast("Không tải được sổ khiếu nại Claims", "error"))
      .finally(() => setLoading(false));
  }, []);

  function fmtVND(n: number) {
    if (!n) return "0 đ";
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
    return Math.round(n).toLocaleString("vi-VN") + " đ";
  }

  return (
    <div className="space-y-6">
      {/* Claims List Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-400" />
            Sổ Khiếu Nại & Tranh Chấp Hợp Đồng (Claims Registry)
          </h3>
          <span className="text-xs text-zinc-400 font-mono">{claims.length} Vụ khiếu nại</span>
        </div>

        {loading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : claims.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">
            Chưa có vụ việc khiếu nại nào được ghi nhận.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                  <th className="py-2.5 px-3">Mã Claim</th>
                  <th className="py-2.5 px-3">Tiêu Đề / Nguyên Nhân</th>
                  <th className="py-2.5 px-3">Loại</th>
                  <th className="py-2.5 px-3 text-right">Đòi Hỏi (Tiền/Ngày)</th>
                  <th className="py-2.5 px-3 text-right">Đã Chốt</th>
                  <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {claims.map((cl) => (
                  <tr key={cl.id} className="hover:bg-zinc-900/40 transition">
                    <td className="py-3 px-3 font-mono font-bold text-zinc-200">{cl.code}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-zinc-200">{cl.title}</div>
                      <div className="text-[11px] text-zinc-500">
                        {cl.cause || "Sự kiện chậm trễ"} • Ngày TB:{" "}
                        {cl.noticeDate ? formatDateVN(cl.noticeDate) : "—"}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      {cl.kind === "cost" ? "Bồi thường Chi Phí" : "Gia hạn EOT"}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-amber-400">
                      {cl.kind === "cost"
                        ? fmtVND(cl.amountRequested)
                        : `${cl.daysRequested || 0} ngày`}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                      {cl.kind === "cost"
                        ? fmtVND(cl.amountSettled)
                        : `${cl.daysSettled || 0} ngày`}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          cl.status === "settled"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : cl.status === "negotiating"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {cl.status === "settled"
                          ? "Đã chốt"
                          : cl.status === "negotiating"
                            ? "Đàm phán"
                            : "Thông báo"}
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
