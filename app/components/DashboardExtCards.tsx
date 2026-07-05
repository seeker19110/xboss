"use client";
import { useState } from "react";
import { Wallet, Gauge, ShieldAlert, FilePlus2, ChevronDown, ChevronRight } from "lucide-react";
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import EditableText from "@/app/components/EditableText";

export type CashflowMonth = { month: string; in: number; out: number };
export type CpiBlock = {
  executedValue: number;
  actualCost: number;
  cpi: number;
  budgetUsedPct: number;
};
export type QualityBlock = {
  ncrOpen: number;
  ncrOverdue: number;
  ncrClosed30d: number;
  inspectionPassRate: number | null;
};
export type VoBlock = { draft: number; submitted: number; approved: number; rejected: number };
export type DisciplineCrossRow = {
  code: string;
  name: string;
  color: string | null;
  progressPct: number;
  delayedCount: number;
  ncrOpen: number;
  budgetUsedPct: number | null;
};

function fmtVND(n: number) {
  if (!n) return "0 đ";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}
function fmtMonth(m: string) {
  const [, mm] = m.split("-");
  return `Th${Number(mm)}`;
}

export default function DashboardExtCards({
  cashflow,
  cpi,
  quality,
  vo,
  byDiscipline,
  isEngineer,
}: {
  cashflow: CashflowMonth[] | null;
  cpi: CpiBlock | null;
  quality: QualityBlock;
  vo: VoBlock | null;
  byDiscipline: DisciplineCrossRow[];
  isEngineer: boolean;
}) {
  const [financeOpen, setFinanceOpen] = useState(!isEngineer);
  const canViewFinance = cpi != null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {canViewFinance && (
          <a
            href="/costs"
            className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition"
          >
            <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" /> CPI
            </p>
            <p
              className={`text-lg font-semibold mt-1 ${cpi!.cpi >= 1 ? "text-emerald-300" : "text-rose-300"}`}
            >
              {cpi!.cpi.toFixed(2)}
            </p>
          </a>
        )}
        {canViewFinance && (
          <a
            href="/costs"
            className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition"
          >
            <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> % Ngân sách đã dùng
            </p>
            <p className="text-lg font-semibold mt-1">{Math.round(cpi!.budgetUsedPct)}%</p>
          </a>
        )}
        <a
          href="/quality"
          className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition"
        >
          <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> NCR mở
          </p>
          <p className="text-lg font-semibold mt-1">
            {quality.ncrOpen}
            {quality.ncrOverdue > 0 && (
              <span className="ml-1.5 text-xs font-medium text-rose-300">
                ({quality.ncrOverdue} quá hạn)
              </span>
            )}
          </p>
        </a>
        {vo != null && (
          <a
            href="/variations"
            className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition"
          >
            <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
              <FilePlus2 className="w-3.5 h-3.5" /> VO chờ duyệt
            </p>
            <p className="text-lg font-semibold mt-1">{fmtVND(vo.submitted)}</p>
          </a>
        )}
      </div>

      {byDiscipline.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 pt-4 pb-1">
            <h2 className="text-sm font-semibold text-zinc-200">
              <EditableText tkey="dashboard.byDiscipline.title">So sánh chéo hệ</EditableText>
            </h2>
          </div>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Bảng so sánh chéo hệ"
          >
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">HỆ</th>
                  <th className="text-left p-3">% TIẾN ĐỘ</th>
                  <th className="text-right p-3">TRỄ</th>
                  <th className="text-right p-3">NCR MỞ</th>
                  {canViewFinance && <th className="text-right p-3">% NGÂN SÁCH</th>}
                </tr>
              </thead>
              <tbody>
                {byDiscipline.map((d) => (
                  <tr key={d.code} className="border-b border-zinc-800/60 last:border-0">
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full bg-${d.color ?? "zinc"}-400`} />
                        {d.name}
                      </span>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full bg-${d.color ?? "zinc"}-400`}
                          style={{ width: `${Math.min(100, Math.round(d.progressPct))}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">{Math.round(d.progressPct)}%</p>
                    </td>
                    <td
                      className={`p-3 text-right ${d.delayedCount > 0 ? "text-rose-300 font-medium" : "text-zinc-300"}`}
                    >
                      {d.delayedCount}
                    </td>
                    <td
                      className={`p-3 text-right ${d.ncrOpen > 0 ? "text-amber-300 font-medium" : "text-zinc-300"}`}
                    >
                      {d.ncrOpen}
                    </td>
                    {canViewFinance && (
                      <td className="p-3 text-right">{Math.round(d.budgetUsedPct ?? 0)}%</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canViewFinance && cashflow && cashflow.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setFinanceOpen((v) => !v)}
            aria-expanded={financeOpen}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800/40 transition"
          >
            {financeOpen ? (
              <ChevronDown className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0" />
            )}
            <EditableText tkey="dashboard.cashflow.title">
              Tài chính — Dòng tiền 12 tháng
            </EditableText>
          </button>
          {financeOpen && (
            <div className="px-4 pb-4" style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={cashflow} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <XAxis
                    dataKey="month"
                    stroke="var(--color-zinc-500)"
                    fontSize={10}
                    tickFormatter={fmtMonth}
                  />
                  <YAxis stroke="var(--color-zinc-500)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-zinc-900)",
                      border: "1px solid var(--color-zinc-700)",
                      color: "var(--foreground)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v, name) => [
                      fmtVND(Number(v)),
                      name === "in" ? "Thu (CĐT)" : "Chi (NCC/thầu phụ)",
                    ]}
                  />
                  <Legend
                    formatter={(v) => (v === "in" ? "Thu (CĐT)" : "Chi (NCC/thầu phụ)")}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="in" fill="var(--color-emerald-400)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="out" fill="var(--color-rose-400)" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
