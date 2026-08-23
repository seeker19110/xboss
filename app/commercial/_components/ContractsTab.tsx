"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileSignature,
  Coins,
  Umbrella,
  Plus,
  ShieldCheck,
  Building2,
  Receipt,
  FileText,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { formatDateVN } from "@/lib/nen/date";

type SubSection = "contracts" | "costs" | "insurance";

export default function ContractsTab() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<SubSection>("contracts");

  // Data states
  const [contracts, setContracts] = useState<any[]>([]);
  const [costsData, setCostsData] = useState<any | null>(null);
  const [insuranceData, setInsuranceData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub === "costs" || sub === "insurance") {
      setActiveSection(sub);
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/contracts").then((r) => (r.ok ? r.json() : { contracts: [] })),
      fetch("/api/costs?groupBy=system&includeVo=1").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/insurance-bonds").then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([cData, costData, insData]) => {
        setContracts(cData.contracts || []);
        setCostsData(costData);
        setInsuranceData(insData.items || []);
      })
      .catch(() => showToast("Không tải được dữ liệu hợp đồng/chi phí", "error"))
      .finally(() => setLoading(false));
  }, []);

  function fmtVND(n: number) {
    if (!n) return "0 đ";
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
    return Math.round(n).toLocaleString("vi-VN") + " đ";
  }

  const totalContractVal = contracts.reduce((acc, c) => acc + (Number(c.value) || 0), 0);
  const totalPaid = contracts.reduce((acc, c) => acc + (Number(c.paid) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Sub navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800/80">
          <button
            onClick={() => setActiveSection("contracts")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "contracts"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileSignature className="w-3.5 h-3.5" />
            Hợp Đồng ({contracts.length})
          </button>
          <button
            onClick={() => setActiveSection("costs")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "costs"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            Hạn Mức Chi Phí
          </button>
          <button
            onClick={() => setActiveSection("insurance")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "insurance"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Umbrella className="w-3.5 h-3.5" />
            Bảo Lãnh & Bảo Hiểm ({insuranceData.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-zinc-400">
            Tổng HĐ: <strong className="text-zinc-100">{fmtVND(totalContractVal)}</strong>
          </span>
          <span className="text-zinc-600">•</span>
          <span className="font-mono text-emerald-400">
            Đã thanh toán: <strong>{fmtVND(totalPaid)}</strong>
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : activeSection === "contracts" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-amber-400" />
                Danh Sách Hợp Đồng Nhận Thầu A-B & Giao Thầu B-B&apos;
              </h3>
              <span className="text-xs text-zinc-400 font-mono">
                {contracts.filter((c) => c.status === "active").length} HĐ Đang hiệu lực
              </span>
            </div>

            {contracts.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                Chưa có hợp đồng nào được tạo.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                      <th className="py-2.5 px-3">Mã HĐ</th>
                      <th className="py-2.5 px-3">Tiêu Đề / Đối Tác</th>
                      <th className="py-2.5 px-3">Loại</th>
                      <th className="py-2.5 px-3 text-right">Giá Trị Gốc</th>
                      <th className="py-2.5 px-3 text-right">Đã Chi</th>
                      <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {contracts.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-900/40 transition">
                        <td className="py-3 px-3 font-mono font-bold text-zinc-200">{c.code}</td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-zinc-200">{c.title}</div>
                          <div className="text-[11px] text-zinc-500">
                            {c.partySupplierName || c.partyName || "Chưa gán đối tác"} • Hệ:{" "}
                            {c.systemCode || "Chung"}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-zinc-400">
                          {c.kind === "nhan_thau"
                            ? "Nhận thầu A-B"
                            : c.kind === "giao_thau"
                              ? "Giao thầu B-B'"
                              : "Nhà cung cấp"}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-zinc-200">
                          {fmtVND(c.value)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                          {fmtVND(c.paid)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              c.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : c.status === "draft"
                                  ? "bg-zinc-800 text-zinc-300"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {c.status === "active"
                              ? "Hiệu lực"
                              : c.status === "draft"
                                ? "Nháp"
                                : c.status}
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
      ) : activeSection === "costs" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-400" />
                  Kiểm Soát Hạn Mức Chi Phí & Ngân Sách Dự Toán
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Đối chiếu Ngân sách (Budget) vs Cam kết chi (Committed) vs Thực tế giải ngân
                  (Actual)
                </p>
              </div>
            </div>

            {costsData?.rows?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                      <th className="py-2.5 px-3">Phân Mục / Hệ</th>
                      <th className="py-2.5 px-3 text-right">Dự Toán (Budget)</th>
                      <th className="py-2.5 px-3 text-right">Cam Kết Chi</th>
                      <th className="py-2.5 px-3 text-right">Thực Tế Chi</th>
                      <th className="py-2.5 px-3 text-right">% Sử Dụng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {costsData.rows.map((r: any) => {
                      const pct = r.budget > 0 ? Math.round((r.committed / r.budget) * 100) : 0;
                      return (
                        <tr key={r.key} className="hover:bg-zinc-900/40 transition">
                          <td className="py-3 px-3 font-semibold text-zinc-200">{r.label}</td>
                          <td className="py-3 px-3 text-right font-mono text-zinc-300">
                            {fmtVND(r.budget)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-amber-400 font-semibold">
                            {fmtVND(r.committed)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-emerald-400">
                            {fmtVND(r.actual)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                pct > 100
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  : "bg-zinc-800 text-zinc-300"
                              }`}
                            >
                              {pct}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-zinc-500 text-xs">
                Chưa có dữ liệu hạn mức chi phí.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Umbrella className="w-4 h-4 text-sky-400" />
                Hồ Sơ Bảo Hiểm Công Trình & Bảo Lãnh Ngân Hàng
              </h3>
              <span className="text-xs text-zinc-400 font-mono">
                {insuranceData.length} Bản ghi
              </span>
            </div>

            {insuranceData.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                Chưa có hồ sơ bảo hiểm hoặc bảo lãnh ngân hàng.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                      <th className="py-2.5 px-3">Loại Bảo Hiểm / Bảo Lãnh</th>
                      <th className="py-2.5 px-3">Hợp Đồng Liên Quan</th>
                      <th className="py-2.5 px-3 text-right">Giá Trị Bảo Lãnh</th>
                      <th className="py-2.5 px-3">Hạn Hiệu Lực</th>
                      <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {insuranceData.map((item: any) => (
                      <tr key={item.id} className="hover:bg-zinc-900/40 transition">
                        <td className="py-3 px-3 font-semibold text-zinc-200">
                          {item.kindLabel || item.kind}
                        </td>
                        <td className="py-3 px-3 font-mono text-zinc-400">
                          {item.contractCode || "Toàn dự án"}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-zinc-200">
                          {fmtVND(item.amount)}
                        </td>
                        <td className="py-3 px-3 font-mono text-zinc-400">
                          {item.validTo ? formatDateVN(item.validTo) : "—"}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {item.status || "Hiệu lực"}
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
      )}
    </div>
  );
}
