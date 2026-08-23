"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ShieldCheck,
  Banknote,
  Landmark,
  Receipt,
  Plus,
  ArrowUpRight,
  Sparkles,
  Layers,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { formatDateVN } from "@/lib/nen/date";

export default function FinanceCashflowTab() {
  const [summary, setSummary] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/finance/summary").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/finance/invoices").then((r) => (r.ok ? r.json() : { invoices: [] })),
    ])
      .then(([sumData, invData]) => {
        setSummary(sumData);
        setInvoices(invData.invoices || []);
      })
      .catch(() => showToast("Không tải được dữ liệu kế toán/tài chính", "error"))
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
      {/* 2 Big Intelligence Cards: Cashflow & e-Sign */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Mô Phỏng Dòng Tiền Vốn Lưu Động (Dynamic Cashflow M85)
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              S-Curve Cash
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Mô phỏng dòng tiền Thu/Chi ($Cash-In$ vs $Cash-Out$) theo phân phối chuẩn tích lũy, cảnh
            báo trước các điểm uốn thâm hụt vốn khi có độ trễ giải ngân IPC.
          </p>
          <div className="pt-2">
            <Link
              href="/engineering/cashflow"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition inline-flex items-center gap-1.5 shadow"
            >
              <TrendingUp className="w-3.5 h-3.5" /> Mở Dynamic Cashflow Cockpit{" "}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Ký Số Điện Tử 3 Bên & Niêm Phong BBNT (Smart e-Sign M84)
            </h3>
            <span className="text-[10px] font-mono text-zinc-400">SHA-256 PKI</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Luồng ký số tuần tự 3 bên (Kỹ sư Nhà thầu ➔ TVGS ➔ Chủ đầu tư) theo Nghị định
            06/2021/NĐ-CP, cấp chứng thư điện tử bất biến.
          </p>
          <div className="pt-2">
            <Link
              href="/engineering/esign"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold text-xs transition inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Mở Studio Ký Số e-Sign{" "}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Accounting Invoices Summary Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-400" />
              Sổ Kế Toán & Hóa Đơn Điện Tử Dự Án
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Theo dõi hóa đơn đầu vào (In) và hóa đơn đầu ra (Out) đối soát thanh toán
            </p>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">
            Chưa có hóa đơn hoặc giao dịch kế toán nào.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                  <th className="py-2.5 px-3">Số Hóa Đơn</th>
                  <th className="py-2.5 px-3">Đối Tác</th>
                  <th className="py-2.5 px-3">Chiều</th>
                  <th className="py-2.5 px-3 text-right">Tiền Trước Thuế</th>
                  <th className="py-2.5 px-3 text-right">Tiền VAT</th>
                  <th className="py-2.5 px-3">Ngày HĐ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {invoices.slice(0, 15).map((inv) => (
                  <tr key={inv.id} className="hover:bg-zinc-900/40 transition">
                    <td className="py-3 px-3 font-mono font-bold text-zinc-200">
                      {inv.invoiceNo || `INV-${inv.id}`}
                    </td>
                    <td className="py-3 px-3 font-semibold text-zinc-300">
                      {inv.counterparty || "Đối tác"}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          inv.direction === "in"
                            ? "bg-sky-500/10 text-sky-400"
                            : "bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        {inv.direction === "in" ? "Đầu vào" : "Đầu ra"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-200">
                      {fmtVND(inv.netAmount)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-400">
                      {fmtVND(inv.vatAmount)}
                    </td>
                    <td className="py-3 px-3 font-mono text-zinc-400">
                      {inv.invoiceDate ? formatDateVN(inv.invoiceDate) : "—"}
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
