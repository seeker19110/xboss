"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckSquare,
  FileCheck2,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Camera,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { formatDateVN } from "@/lib/nen/date";

type SubSection = "approvals" | "ncr";

export default function ApprovalsQcTab() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<SubSection>("approvals");

  // Data states
  const [approvals, setApprovals] = useState<any[]>([]);
  const [ncrs, setNcrs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub === "ncr") {
      setActiveSection("ncr");
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/approvals").then((r) => (r.ok ? r.json() : { pending: [], approved: [] })),
      fetch("/api/quality/ncr").then((r) => (r.ok ? r.json() : { ncrs: [] })),
    ])
      .then(([appData, ncrData]) => {
        setApprovals([...(appData.pending || []), ...(appData.approved || [])]);
        setNcrs(ncrData.ncrs || ncrData.items || []);
      })
      .catch(() => showToast("Không tải được dữ liệu nghiệm thu/QAQC", "error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Sub navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800/80">
          <button
            onClick={() => setActiveSection("approvals")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "approvals"
                ? "bg-emerald-700 text-on-accent shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Phê Duyệt Nghiệm Thu ({approvals.length})
          </button>
          <button
            onClick={() => setActiveSection("ncr")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "ncr"
                ? "bg-emerald-700 text-on-accent shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Phiếu Không Phù Hợp NCR ({ncrs.length})
          </button>
        </div>

        <div className="text-xs text-zinc-400 font-mono">Nghị định 06/2021/NĐ-CP</div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : activeSection === "approvals" ? (
        <div className="space-y-4">
          {/* 3 Hold-Point Stages */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-amber-400">
                Giai Đoạn 1 — Lắp Đặt
              </span>
              <div className="text-xs font-semibold text-zinc-200">
                Kiểm Tra Kích Thước & Cao Độ
              </div>
              <div className="text-[11px] text-zinc-400">
                So khớp Shopdrawing & cao độ hành lang
              </div>
            </div>
            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-sky-400">
                Giai Đoạn 2 — Thử Áp / Đo Đạc
              </span>
              <div className="text-xs font-semibold text-zinc-200">
                Thử Áp Thủy Lực & Rò Rỉ Khói
              </div>
              <div className="text-[11px] text-zinc-400">Giữ áp 1.5x áp lực làm việc trong 24h</div>
            </div>
            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-emerald-400">
                Giai Đoạn 3 — Ký Số BBNT
              </span>
              <div className="text-xs font-semibold text-zinc-200">Nghiệm Thu Đưa Vào Sử Dụng</div>
              <div className="text-[11px] text-zinc-400">
                Ký số 3 bên theo Nghị định 06/2021/NĐ-CP
              </div>
            </div>
          </div>

          {/* Approvals List */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-400" />
                Danh Sách Hạng Mục Nghiệm Thu 2 Bước
              </h3>
              <span className="text-xs text-zinc-400 font-mono">
                {approvals.length} Yêu cầu nghiệm thu
              </span>
            </div>

            {approvals.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                Chưa có yêu cầu nghiệm thu nào đang chờ.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                      <th className="py-2.5 px-3">Mã Công Tác</th>
                      <th className="py-2.5 px-3">Tên Hạng Mục / Vị Trí</th>
                      <th className="py-2.5 px-3">Hệ Thống</th>
                      <th className="py-2.5 px-3 text-right">Tiến Độ</th>
                      <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {approvals.slice(0, 15).map((app) => (
                      <tr key={app.id} className="hover:bg-zinc-900/40 transition">
                        <td className="py-3 px-3 font-mono font-bold text-zinc-200">
                          {app.code || `TSK-${app.id}`}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-zinc-200">{app.name || app.title}</div>
                          <div className="text-[11px] text-zinc-500">
                            {app.floorLabel || "Tầng 8 Tháp A"}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-zinc-400">{app.sheetType || "ACMV"}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                          {app.progressPercent || 100}%
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Đã Nghiệm Thu
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
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Sổ Quản Lý Phiếu Không Phù Hợp (NCR Registry)
            </h3>
            <span className="text-xs text-zinc-400 font-mono">{ncrs.length} Phiếu NCR</span>
          </div>

          {ncrs.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              Không có phiếu NCR không phù hợp nào. Công trường đạt chuẩn QA/QC.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                    <th className="py-2.5 px-3">Mã NCR</th>
                    <th className="py-2.5 px-3">Nội Dung Lỗi / Vị Trí</th>
                    <th className="py-2.5 px-3">Mức Độ</th>
                    <th className="py-2.5 px-3">Hạn Khắc Phục</th>
                    <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {ncrs.map((ncr) => (
                    <tr key={ncr.id} className="hover:bg-zinc-900/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-zinc-200">
                        {ncr.code || `NCR-${ncr.id}`}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-zinc-200">
                          {ncr.title || ncr.description}
                        </div>
                        <div className="text-[11px] text-zinc-500">{ncr.location || "Tầng 12"}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          {ncr.severity || "Nghiêm trọng"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-400">
                        {ncr.dueDate ? formatDateVN(ncr.dueDate) : "24h"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400">
                          {ncr.status || "Chờ xử lý"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
