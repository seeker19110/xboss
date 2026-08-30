"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Receipt,
  Wallet,
  Inbox,
  Plus,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  Clock,
  FileCheck2,
  Banknote,
  Percent,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { formatDateVN } from "@/lib/nen/date";

type SubSection = "ipc" | "payments" | "proposals";

export default function IpcPaymentsTab() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<SubSection>("ipc");

  // Data states
  const [certs, setCerts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub === "payments" || sub === "proposals") {
      setActiveSection(sub);
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/payment-certs").then((r) => (r.ok ? r.json() : { certs: [] })),
      fetch("/api/payments").then((r) => (r.ok ? r.json() : { bills: [] })),
      fetch("/api/proposals").then((r) => (r.ok ? r.json() : { proposals: [] })),
    ])
      .then(([certData, payData, propData]) => {
        setCerts(certData.certs || []);
        setPayments(payData.bills || payData.rows || []);
        setProposals(propData.proposals || []);
      })
      .catch(() => showToast("Không tải được dữ liệu thanh toán/IPC", "error"))
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
      {/* Sub navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800/80">
          <button
            onClick={() => setActiveSection("ipc")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "ipc"
                ? "bg-emerald-700 text-on-accent shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Chứng Chỉ IPC ({certs.length})
          </button>
          <button
            onClick={() => setActiveSection("payments")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "payments"
                ? "bg-emerald-700 text-on-accent shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            Đề Nghị Thanh Toán
          </button>
          <button
            onClick={() => setActiveSection("proposals")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "proposals"
                ? "bg-emerald-700 text-on-accent shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            Phiếu Đề Xuất Duyệt Chi ({proposals.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span>Quy trình TT96/2021 & NĐ 70/2025</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : activeSection === "ipc" ? (
        <div className="space-y-4">
          {/* IPC Formula Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-emerald-400">
                Giá Trị Nghiệm Thu Kỳ
              </span>
              <div className="text-xs font-semibold text-zinc-200">
                Lũy kế khối lượng hoàn thành thực tế
              </div>
            </div>
            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-sky-400">
                Thu Hồi Tạm Ứng
              </span>
              <div className="text-xs font-semibold text-zinc-200">
                Khấu trừ theo tỷ lệ 20% - 80%
              </div>
            </div>
            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-amber-400">
                Tiền Giữ Lại Bảo Hành
              </span>
              <div className="text-xs font-semibold text-zinc-200">
                Trích giữ 5% - 10% giá trị kỳ
              </div>
            </div>
          </div>

          {/* IPC List Table */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                Sổ Chứng Chỉ Thanh Toán Nghiệm Thu Khối Lượng (IPC)
              </h3>
              <span className="text-xs text-zinc-400 font-mono">{certs.length} Đợt thanh toán</span>
            </div>

            {certs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                Chưa có chứng chỉ thanh toán IPC nào.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                      <th className="py-2.5 px-3">Mã IPC</th>
                      <th className="py-2.5 px-3">Hợp Đồng / Kỳ</th>
                      <th className="py-2.5 px-3 text-right">Giá Trị Kỳ</th>
                      <th className="py-2.5 px-3">Ngày Lập</th>
                      <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {certs.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-900/40 transition">
                        <td className="py-3 px-3 font-mono font-bold text-zinc-200">{c.code}</td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-zinc-200">
                            {c.contractCode || "Hợp đồng"}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            Đợt {c.periodNo}: {c.periodLabel || "Kỳ thanh toán"}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                          {fmtVND(
                            c.value ||
                              c.items?.reduce(
                                (a: number, i: any) => a + i.qtyPeriod * i.unitPrice,
                                0,
                              ),
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-zinc-400">
                          {c.submittedAt ? formatDateVN(c.submittedAt) : "—"}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              c.status === "approved"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : c.status === "submitted"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            {c.status === "approved"
                              ? "Đã duyệt"
                              : c.status === "submitted"
                                ? "Đang trình"
                                : "Nháp"}
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
      ) : activeSection === "payments" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  Sổ Đề Nghị Thanh Toán & Chi Trả Thực Tế
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Theo dõi các đợt tạm ứng, thanh toán khối lượng và quyết toán theo từng phân hệ
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                    <th className="py-2.5 px-3">Phân Mục / Đơn Vị</th>
                    <th className="py-2.5 px-3">Loại Chi Trả</th>
                    <th className="py-2.5 px-3 text-right">Số Tiền</th>
                    <th className="py-2.5 px-3">Ngày Chi</th>
                    <th className="py-2.5 px-3">Ghi Chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {payments.slice(0, 15).map((p, idx) => (
                    <tr key={p.id || idx} className="hover:bg-zinc-900/40 transition">
                      <td className="py-3 px-3 font-semibold text-zinc-200">
                        {p.responsible || p.sheetType || "Đơn vị thực hiện"}
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        {p.type === "advance" ? "Tạm ứng" : "Thanh toán kỳ"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                        {fmtVND(p.amount)}
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-400">
                        {p.paidDate ? formatDateVN(p.paidDate) : "—"}
                      </td>
                      <td className="py-3 px-3 text-zinc-500 truncate max-w-xs">
                        {p.description || p.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Inbox className="w-4 h-4 text-amber-400" />
                Phiếu Đề Xuất Mua Sắm & Duyệt Chi Đa Cấp
              </h3>
              <span className="text-xs text-zinc-400 font-mono">{proposals.length} Đề xuất</span>
            </div>

            {proposals.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                Chưa có phiếu đề xuất duyệt chi nào.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                      <th className="py-2.5 px-3">Mã Phiếu</th>
                      <th className="py-2.5 px-3">Nội Dung Đề Xuất</th>
                      <th className="py-2.5 px-3 text-right">Dự Toán Chi</th>
                      <th className="py-2.5 px-3">Người Đề Xuất</th>
                      <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {proposals.map((prop) => (
                      <tr key={prop.id} className="hover:bg-zinc-900/40 transition">
                        <td className="py-3 px-3 font-mono font-bold text-zinc-200">
                          {prop.code || `PROP-${prop.id}`}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-zinc-200">{prop.title}</div>
                          <div className="text-[11px] text-zinc-500">
                            {prop.category || "Chi phí hiện trường"}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-zinc-200">
                          {fmtVND(prop.amount || prop.estimatedCost)}
                        </td>
                        <td className="py-3 px-3 text-zinc-400">{prop.createdByName || "Kỹ sư"}</td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              prop.status === "approved"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : prop.status === "pending"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            {prop.status === "approved"
                              ? "Đã duyệt"
                              : prop.status === "pending"
                                ? "Chờ duyệt"
                                : prop.status}
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
