"use client";

import React, { useState, useEffect } from "react";
import EngineeringNav from "@/app/components/EngineeringNav";
import {
  DollarSign,
  TrendingUp,
  AlertOctagon,
  BarChart3,
  RefreshCw,
  Calculator,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface ForecastRun {
  id: string;
  runName: string;
  totalContractValue: string;
  advancePercent: string;
  retentionPercent: string;
  paymentDelayDays: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dipPeriod: string;
  maxDeficitAmount: string;
  mitigationRecommendation: string;
  createdAt: string;
}

export default function CashflowCockpitPage() {
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  // Tham số mô phỏng
  const [runName, setRunName] = useState("Kịch bản Cơ sở - Tiến độ Thi công 12 Tháng");
  const [contractValue, setContractValue] = useState(50000000000); // 50 tỷ VND
  const [advancePercent, setAdvancePercent] = useState(15);
  const [retentionPercent, setRetentionPercent] = useState(5);
  const [delayDays, setDelayDays] = useState(30);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  const fetchForecasts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/engineering/cashflow/forecasts");
      const json = await res.json();
      if (json.success) {
        setForecasts(json.data);
      }
    } catch (err) {
      console.error("Lỗi tải forecasts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecasts();
  }, []);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSimulating(true);
      const res = await fetch("/api/engineering/cashflow/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runName,
          totalContractValue: contractValue,
          advancePercent,
          retentionPercent,
          paymentDelayDays: delayDays,
          durationPeriods: 12,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSimulationResult(json.data);
        fetchForecasts();
      } else {
        alert("Lỗi: " + json.error);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
              <TrendingUp className="text-amber-400" />
              Dynamic Cashflow & Working Capital Simulation Cockpit (M85)
            </h1>
            <p className="text-sm text-zinc-400">
              Mô phỏng dòng tiền Thu/Chi ($Cash-In$ vs $Cash-Out$) và dự báo sớm nguy cơ thâm hụt
              vốn lưu động theo S-Curve tiến độ
            </p>
          </div>
          <span className="rounded-full bg-amber-950/80 border border-amber-700/50 px-3 py-1 text-xs font-semibold text-amber-400">
            S-Curve Cash Engine Active
          </span>
        </div>

        <EngineeringNav />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cột trái: Form điều khiển thông số mô phỏng */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-sm space-y-4">
            <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
              <Calculator size={18} className="text-emerald-400" />
              Thông Số Mô Phỏng Dòng Tiền
            </h2>
            <form onSubmit={handleSimulate} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Tên kịch bản</label>
                <input
                  type="text"
                  value={runName}
                  onChange={(e) => setRunName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Giá trị hợp đồng (VND)</label>
                <input
                  type="number"
                  value={contractValue}
                  onChange={(e) => setContractValue(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Tạm ứng (%)</label>
                  <input
                    type="number"
                    value={advancePercent}
                    onChange={(e) => setAdvancePercent(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Giữ lại BH (%)</label>
                  <input
                    type="number"
                    value={retentionPercent}
                    onChange={(e) => setRetentionPercent(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Thời gian duyệt IPC & thanh toán (Ngày)
                </label>
                <input
                  type="number"
                  value={delayDays}
                  onChange={(e) => setDelayDays(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={simulating}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-amber-500 disabled:opacity-50"
              >
                {simulating ? (
                  <RefreshCw className="animate-spin" size={16} />
                ) : (
                  <BarChart3 size={16} />
                )}
                Chạy Mô Phỏng Dòng Tiền (12 Kỳ)
              </button>
            </form>
          </div>

          {/* Cột phải: Kết quả mô phỏng & Bảng dòng tiền */}
          <div className="space-y-6 lg:col-span-2">
            {simulationResult && (
              <div className="space-y-4">
                {/* Thẻ cảnh báo rủi ro vốn */}
                <div
                  className={`rounded-xl border p-5 ${
                    simulationResult.risk.riskLevel === "CRITICAL"
                      ? "border-rose-700 bg-rose-950/30"
                      : simulationResult.risk.riskLevel === "HIGH"
                        ? "border-amber-700 bg-amber-950/30"
                        : "border-emerald-700 bg-emerald-950/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <AlertOctagon
                        size={20}
                        className={
                          simulationResult.risk.riskLevel === "CRITICAL"
                            ? "text-rose-400"
                            : simulationResult.risk.riskLevel === "HIGH"
                              ? "text-amber-400"
                              : "text-emerald-400"
                        }
                      />
                      Đánh Giá Rủi Ro Vốn Lưu Động: {simulationResult.risk.riskLevel}
                    </h3>
                    <span className="text-xs font-mono text-zinc-300">
                      Điểm uốn thâm hụt:{" "}
                      <strong className="text-amber-300">{simulationResult.risk.dipPeriod}</strong>
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-300 leading-relaxed">
                    {simulationResult.risk.mitigationRecommendation}
                  </p>
                  <div className="mt-3 flex items-center gap-6 text-xs font-mono">
                    <div>
                      Thâm hụt đỉnh điểm:{" "}
                      <span className="font-bold text-rose-400">
                        {simulationResult.risk.maxDeficitAmount.toLocaleString("vi-VN")} VND
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bảng chi tiết 12 kỳ dòng tiền */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 overflow-x-auto">
                  <h3 className="mb-3 text-sm font-semibold text-zinc-200">
                    Bảng Phân Bổ Dòng Tiền Tích Lũy (Cashflow Breakdown)
                  </h3>
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400">
                        <th className="pb-2">Kỳ</th>
                        <th className="pb-2 text-right">Sản lượng EV</th>
                        <th className="pb-2 text-right text-emerald-400">Cash-In (+)</th>
                        <th className="pb-2 text-right text-rose-400">Cash-Out (-)</th>
                        <th className="pb-2 text-right">Net Flow</th>
                        <th className="pb-2 text-right">Dòng tiền Lũy kế</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {simulationResult.projections.map((p: any) => (
                        <tr key={p.periodIndex} className="hover:bg-zinc-800/40">
                          <td className="py-2 text-zinc-300">{p.periodLabel}</td>
                          <td className="py-2 text-right text-zinc-300">
                            {(p.projectedEarnedValue / 1e6).toFixed(1)}M
                          </td>
                          <td className="py-2 text-right text-emerald-400 font-semibold">
                            +{(p.projectedCashIn / 1e6).toFixed(1)}M
                          </td>
                          <td className="py-2 text-right text-rose-400">
                            -{(p.projectedCashOut / 1e6).toFixed(1)}M
                          </td>
                          <td
                            className={`py-2 text-right ${p.netCashFlow >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                          >
                            {(p.netCashFlow / 1e6).toFixed(1)}M
                          </td>
                          <td
                            className={`py-2 text-right font-bold ${
                              p.cumulativeCashFlow >= 0 ? "text-emerald-300" : "text-rose-400"
                            }`}
                          >
                            {(p.cumulativeCashFlow / 1e6).toFixed(1)}M
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lịch sử các đợt mô phỏng */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h3 className="mb-4 text-base font-semibold text-zinc-200">
                Lịch Sử Các Kịch Bản Đã Lưu
              </h3>
              {loading ? (
                <div className="text-center py-6 text-sm text-zinc-500">Đang tải lịch sử...</div>
              ) : forecasts.length === 0 ? (
                <div className="text-center py-6 text-sm text-zinc-500">
                  Chưa có kịch bản dòng tiền nào được lưu.
                </div>
              ) : (
                <div className="space-y-3">
                  {forecasts.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-200 text-sm">{f.runName}</span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            f.riskLevel === "CRITICAL"
                              ? "bg-rose-950 text-rose-400"
                              : f.riskLevel === "HIGH"
                                ? "bg-amber-950 text-amber-400"
                                : "bg-emerald-950 text-emerald-400"
                          }`}
                        >
                          Rủi ro: {f.riskLevel}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-400 font-mono">
                        <div>Hợp đồng: {(Number(f.totalContractValue) / 1e9).toFixed(1)} Tỷ</div>
                        <div>Tạm ứng: {f.advancePercent}%</div>
                        <div>
                          Thâm hụt đỉnh: {(Number(f.maxDeficitAmount) / 1e6).toFixed(0)} Triệu
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-zinc-400 italic">
                        {f.mitigationRecommendation}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
