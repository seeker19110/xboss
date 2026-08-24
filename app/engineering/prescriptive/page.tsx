"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Sliders,
  Play,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Plus,
  ShieldCheck,
  TrendingDown,
  Clock,
  Sparkles,
  Zap,
  Filter,
} from "lucide-react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ZAxis,
  Cell,
} from "recharts";
import AppHeader from "@/app/components/AppHeader";
import ThuNghiemBanner from "@/app/components/ThuNghiemBanner";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

interface PrescriptiveOption {
  optionIndex: number;
  title: string;
  strategyCategory: string;
  strategyDescription: string;
  scheduleCompressionDays: number;
  crashCostVnd: number;
  riskScore: number;
  clashMitigationCount: number;
  isParetoOptimal: boolean;
  tradeOffRatio: number;
  feasibilityScore: number;
  actionItems: string[];
}

interface PrescriptiveScenario {
  id: string;
  project_id: number;
  scenario_code: string;
  trigger_reason: string;
  target_metric: string;
  baseline_schedule_days: number;
  baseline_cost_vnd: number | string;
  status: "simulated" | "evaluating" | "approved" | "rejected" | "archived";
  simulated_options: PrescriptiveOption[];
  pareto_frontier: PrescriptiveOption[];
  recommended_option_index: number | null;
  approved_by: number | null;
  approved_at: string | null;
  created_at: string;
}

interface ComplianceRule {
  id: string;
  standard_code: string;
  standard_title: string;
  section_clause: string;
  domain: string;
  rule_expression: Record<string, unknown>;
  severity: "advisory" | "mandatory" | "legal_strict";
  description: string;
  is_active: boolean;
}

interface ComplianceAudit {
  id: string;
  project_id: number;
  object_id: string;
  rule_id: string;
  compliance_status: "compliant" | "non_compliant" | "exemption_granted" | "manual_review_required";
  finding_details: string | null;
  evidence_snapshot: Record<string, unknown>;
  audited_at: string;
  object_name?: string;
  object_code?: string;
  object_discipline?: string;
  standard_code?: string;
  standard_title?: string;
  section_clause?: string;
  rule_severity?: "advisory" | "mandatory" | "legal_strict";
  rule_domain?: string;
}

export default function PrescriptiveAndCompliancePage() {
  const [loading, setLoading] = useState(true);
  const [scenarios, setScenarios] = useState<PrescriptiveScenario[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [audits, setAudits] = useState<ComplianceAudit[]>([]);
  const [activeTab, setActiveTab] = useState<"whatif" | "compliance">("whatif");
  const [error, setError] = useState<string | null>(null);

  // Selected Scenario
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // Filter for Audits
  const [auditFilter, setAuditFilter] = useState<"all" | "non_compliant" | "compliant">("all");

  // Simulation Modal
  const [showSimModal, setShowSimModal] = useState(false);
  const [scenarioCode, setScenarioCode] = useState("");
  const [triggerReason, setTriggerReason] = useState(
    "Tiến độ tháp A trễ 18 ngày do xung đột MEPF và thiếu nhân lực",
  );
  const [baselineDays, setBaselineDays] = useState(120);
  const [baselineCost, setBaselineCost] = useState(15000000000); // 15 tỷ
  const [targetDaysSaved, setTargetDaysSaved] = useState(20);
  const [maxCrashBudget, setMaxCrashBudget] = useState(2500000000); // 2.5 tỷ
  const [simIterations, setSimIterations] = useState(25);
  const [simulating, setSimulating] = useState(false);

  // Batch scan loading
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  // Approve action loading
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resScenarios, resRules, resAudits] = await Promise.all([
        fetch("/api/engineering/prescriptive/scenarios"),
        fetch("/api/engineering/compliance/rules"),
        fetch("/api/engineering/compliance/audits"),
      ]);

      if (resScenarios.status === 401 || resRules.status === 401 || resAudits.status === 401) {
        redirectToLogin();
        return;
      }

      if (!resScenarios.ok || !resRules.ok || !resAudits.ok) {
        throw new Error("Không thể tải dữ liệu Prescriptive & Compliance");
      }

      const [dataScenarios, dataRules, dataAudits] = await Promise.all([
        resScenarios.json(),
        resRules.json(),
        resAudits.json(),
      ]);

      const scList = Array.isArray(dataScenarios) ? dataScenarios : [];
      setScenarios(scList);
      if (scList.length > 0) {
        setSelectedScenarioId((prev) => prev || scList[0].id);
      }
      setRules(Array.isArray(dataRules) ? dataRules : []);
      setAudits(Array.isArray(dataAudits) ? dataAudits : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scenarioCode || !triggerReason) return;
    setSimulating(true);

    try {
      const res = await fetch("/api/engineering/prescriptive/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioCode,
          triggerReason,
          targetMetric: "multi_objective_pareto",
          baselineScheduleDays: Number(baselineDays),
          baselineCostVnd: Number(baselineCost),
          targetDaysSaved: Number(targetDaysSaved),
          maxCrashBudgetVnd: Number(maxCrashBudget),
          simulationIterations: Number(simIterations),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Lỗi mô phỏng kịch bản");
      }

      const result = await res.json();
      setShowSimModal(false);
      setScenarioCode("");
      await fetchData();
      if (result.scenario?.id) {
        setSelectedScenarioId(result.scenario.id);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulating(false);
    }
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/engineering/prescriptive/scenarios/${id}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Lỗi phê duyệt kịch bản");
      }

      await fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovingId(null);
    }
  };

  const handleBatchScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/engineering/compliance/scan-all", {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Lỗi quét quy chuẩn");
      }

      const data = await res.json();
      setScanResult(
        `Quét hoàn tất ${data.totalObjects} đối tượng với ${data.totalRules} quy chuẩn: ` +
          `Hợp chuẩn: ${data.compliantCount} | Vi phạm NCR: ${data.nonCompliantCount}`,
      );
      await fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader />
        <main className="mx-auto max-w-7xl px-4 py-8">
          <ThuNghiemBanner />
          <EngineeringNav />
          <PageSkeleton />
        </main>
      </div>
    );
  }

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];
  const nonCompliantAudits = audits.filter((a) => a.compliance_status === "non_compliant");
  const filteredAudits = audits.filter((a) => {
    if (auditFilter === "non_compliant") return a.compliance_status === "non_compliant";
    if (auditFilter === "compliant") return a.compliance_status === "compliant";
    return true;
  });

  const scatterData = selectedScenario
    ? selectedScenario.simulated_options.map((opt) => ({
        days: opt.scheduleCompressionDays,
        costTriệu: Math.round(opt.crashCostVnd / 1000000),
        risk: opt.riskScore,
        name: opt.title,
        isPareto: opt.isParetoOptimal,
        isRecommended: opt.optionIndex === selectedScenario.recommended_option_index,
      }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <ThuNghiemBanner />
        <EngineeringNav />

        {/* Title and Action Bar */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
              <Sliders className="text-amber-400" size={28} />
              Prescriptive Pareto Solver & Tuân thủ Tiêu chuẩn (O3+)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Mô phỏng đa mục tiêu Monte Carlo đánh đổi Chi phí vs Rút ngắn tiến độ & Rà quét quy
              chuẩn TCVN / QCVN 06 / NFPA 13.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => fetchData()}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              <RefreshCw size={16} />
              Làm mới
            </button>
            <button
              onClick={() => setShowSimModal(true)}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-on-accent-dark hover:bg-amber-400"
            >
              <Plus size={16} />
              Mô phỏng Kịch bản What-If
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* KPI Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-sm font-medium">Kịch bản What-If đã giải</span>
              <Sliders size={18} className="text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-zinc-100">{scenarios.length}</div>
            <div className="mt-1 text-xs text-zinc-400">Monte Carlo & Đa mục tiêu</div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-sm font-medium">Phương án Pareto tối ưu</span>
              <Sparkles size={18} className="text-sky-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-sky-400">
              {selectedScenario?.pareto_frontier?.length ?? 0}
            </div>
            <div className="mt-1 text-xs text-zinc-400">Kịch bản đang chọn</div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-sm font-medium">Quy chuẩn đang áp dụng</span>
              <FileCheck size={18} className="text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-400">{rules.length}</div>
            <div className="mt-1 text-xs text-zinc-400">QCVN 06, NFPA 13, TCVN</div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-sm font-medium">Hồ sơ Vi phạm NCR mở</span>
              <AlertTriangle size={18} className="text-rose-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-400">{nonCompliantAudits.length}</div>
            <div className="mt-1 text-xs text-zinc-400">Yêu cầu xử lý kỹ thuật</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab("whatif")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "whatif"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sliders size={16} />
            Mô phỏng What-If & Pareto Frontier ({scenarios.length})
          </button>
          <button
            onClick={() => setActiveTab("compliance")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "compliance"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ShieldCheck size={16} />
            Quy chuẩn Kỹ thuật & Báo cáo NCR ({audits.length})
          </button>
        </div>

        {/* Tab 1: What-If & Pareto Frontier */}
        {activeTab === "whatif" && (
          <div className="space-y-6">
            {scenarios.length === 0 ? (
              <EmptyState
                icon={Sliders}
                title="Chưa có kịch bản mô phỏng Prescriptive"
                message="Bấm 'Mô phỏng Kịch bản What-If' để chạy thuật toán Monte Carlo tính toán Pareto Frontier tối ưu tiến độ - chi phí."
              />
            ) : (
              <>
                {/* Scenario Selector & Header */}
                <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Chọn kịch bản phân tích
                    </label>
                    <select
                      value={selectedScenario?.id || ""}
                      onChange={(e) => setSelectedScenarioId(e.target.value)}
                      className="mt-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      {scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.scenario_code} — {s.trigger_reason} ({s.status.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedScenario && (
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          selectedScenario.status === "approved"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                            : "bg-amber-950 text-amber-400 border border-amber-800/50"
                        }`}
                      >
                        {selectedScenario.status === "approved" ? "ĐÃ PHÊ DUYỆT" : "ĐANG KHẢO SÁT"}
                      </span>

                      {selectedScenario.status !== "approved" && (
                        <button
                          disabled={approvingId === selectedScenario.id}
                          onClick={() => handleApprove(selectedScenario.id)}
                          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-on-accent hover:bg-emerald-500"
                        >
                          <CheckCircle2 size={16} />
                          Phê duyệt phương án đề xuất
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {selectedScenario && (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    {/* Pareto Frontier Scatter Chart */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-7">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-zinc-100">
                            Biểu đồ Đa mục tiêu Pareto Frontier
                          </h3>
                          <p className="text-xs text-zinc-400">
                            Trục X: Số ngày rút ngắn • Trục Y: Chi phí bù (Triệu VND) • Màu vàng:
                            Điểm Knee Point tối ưu
                          </p>
                        </div>
                      </div>

                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <XAxis
                              type="number"
                              dataKey="days"
                              name="Ngày rút ngắn"
                              unit=" ngày"
                              stroke="#71717a"
                              fontSize={12}
                            />
                            <YAxis
                              type="number"
                              dataKey="costTriệu"
                              name="Chi phí bù"
                              unit=" tr"
                              stroke="#71717a"
                              fontSize={12}
                            />
                            <ZAxis type="number" dataKey="risk" range={[60, 200]} name="Rủi ro" />
                            <Tooltip
                              cursor={{ strokeDasharray: "3 3" }}
                              content={({ payload }) => {
                                if (payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl">
                                      <div className="font-semibold text-zinc-100">{data.name}</div>
                                      <div className="mt-1 text-emerald-400">
                                        Rút ngắn: {data.days} ngày
                                      </div>
                                      <div className="text-amber-400">
                                        Chi phí bù: {data.costTriệu.toLocaleString()} triệu VND
                                      </div>
                                      <div className="text-rose-400">
                                        Chỉ số rủi ro: {data.risk}/100
                                      </div>
                                      {data.isRecommended && (
                                        <div className="mt-1 font-bold text-amber-400">
                                          ★ Điểm uốn tối ưu Pareto
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Scatter name="Mô phỏng What-If" data={scatterData}>
                              {scatterData.map((entry, index) => {
                                let fill = "#52525b"; // zinc-600 (dominated)
                                if (entry.isRecommended)
                                  fill = "#f59e0b"; // amber-500 (recommended knee)
                                else if (entry.isPareto) fill = "#38bdf8"; // sky-400 (pareto frontier)
                                return <Cell key={`cell-${index}`} fill={fill} />;
                              })}
                            </Scatter>
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-zinc-400">
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-3 w-3 rounded-full bg-amber-500" /> Điểm
                          đề xuất (Knee Point)
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-3 w-3 rounded-full bg-sky-400" /> Bao
                          Pareto tối ưu
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-3 w-3 rounded-full bg-zinc-600" /> Phương
                          án chi phối khác
                        </span>
                      </div>
                    </div>

                    {/* Baseline vs Recommended Summary Card */}
                    <div className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-5">
                      <div>
                        <div className="flex items-center gap-2 text-amber-400">
                          <Sparkles size={18} />
                          <h3 className="font-bold">Phương án Tối ưu Đề xuất</h3>
                        </div>

                        {(() => {
                          const recOpt =
                            selectedScenario.simulated_options.find(
                              (o) => o.optionIndex === selectedScenario.recommended_option_index,
                            ) || selectedScenario.pareto_frontier[0];

                          if (!recOpt)
                            return <p className="mt-4 text-xs text-zinc-400">Chưa có phương án</p>;

                          return (
                            <div className="mt-4 space-y-3">
                              <div>
                                <div className="text-base font-semibold text-zinc-100">
                                  {recOpt.title}
                                </div>
                                <p className="mt-1 text-xs text-zinc-400">
                                  {recOpt.strategyDescription}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-3 rounded-lg bg-zinc-800/50 p-3">
                                <div>
                                  <div className="flex items-center gap-1 text-xs text-zinc-400">
                                    <Clock size={12} className="text-emerald-400" />
                                    <span>Rút ngắn tiến độ:</span>
                                  </div>
                                  <div className="text-lg font-bold text-emerald-400">
                                    {recOpt.scheduleCompressionDays} ngày
                                  </div>
                                </div>

                                <div>
                                  <div className="flex items-center gap-1 text-xs text-zinc-400">
                                    <TrendingDown size={12} className="text-amber-400" />
                                    <span>Chi phí gia tốc:</span>
                                  </div>
                                  <div className="text-lg font-bold text-amber-400">
                                    {(recOpt.crashCostVnd / 1000000).toLocaleString("vi-VN")} tr VND
                                  </div>
                                </div>
                              </div>

                              <div className="text-xs text-zinc-300">
                                <div className="font-semibold text-zinc-400">
                                  Hành động kích hoạt tức thì:
                                </div>
                                <ul className="mt-1 list-inside list-disc space-y-1 text-zinc-400">
                                  {recOpt.actionItems.map((act, i) => (
                                    <li key={i}>{act}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="mt-4 pt-3 border-t border-zinc-800 text-[11px] text-zinc-400">
                        Baseline: {selectedScenario.baseline_schedule_days} ngày •{" "}
                        {(Number(selectedScenario.baseline_cost_vnd) / 1000000000).toFixed(2)} tỷ
                        VND
                      </div>
                    </div>
                  </div>
                )}

                {/* Pareto Options Table */}
                {selectedScenario && (
                  <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
                    <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 font-semibold text-zinc-200">
                      Tập hợp Phương án Không bị chi phối (Pareto Frontier Options)
                    </div>
                    <table className="w-full text-left text-sm text-zinc-300">
                      <thead className="border-b border-zinc-800 bg-zinc-900/40 text-xs uppercase text-zinc-400">
                        <tr>
                          <th className="px-4 py-3">Phương án</th>
                          <th className="px-4 py-3">Chiến lược</th>
                          <th className="px-4 py-3 text-right">Rút ngắn</th>
                          <th className="px-4 py-3 text-right">Chi phí bù</th>
                          <th className="px-4 py-3 text-right">Đơn giá/ngày</th>
                          <th className="px-4 py-3 text-center">Chỉ số rủi ro</th>
                          <th className="px-4 py-3 text-center">Khả thi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {selectedScenario.pareto_frontier.map((opt) => {
                          const isRec =
                            opt.optionIndex === selectedScenario.recommended_option_index;
                          return (
                            <tr
                              key={opt.optionIndex}
                              className={`hover:bg-zinc-800/30 ${isRec ? "bg-amber-950/20" : ""}`}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {isRec && <Sparkles size={14} className="text-amber-400" />}
                                  <span
                                    className={`font-medium ${isRec ? "text-amber-300 font-semibold" : "text-zinc-200"}`}
                                  >
                                    {opt.title}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-zinc-400">
                                {opt.strategyCategory}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                                {opt.scheduleCompressionDays} ngày
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-amber-400">
                                {(opt.crashCostVnd / 1000000).toLocaleString("vi-VN")} tr
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-zinc-400">
                                {(opt.tradeOffRatio / 1000000).toFixed(1)} tr/ngày
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs ${
                                    opt.riskScore > 40
                                      ? "bg-rose-950 text-rose-400 border border-rose-800/40"
                                      : "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
                                  }`}
                                >
                                  {opt.riskScore}/100
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-xs font-semibold text-zinc-300">
                                {Math.round(opt.feasibilityScore * 100)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 2: Standards Compliance & NCRs */}
        {activeTab === "compliance" && (
          <div className="space-y-6">
            {/* Action Bar for Compliance */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  Rà soát Quy chuẩn TCVN / QCVN 06:2022 / NFPA 13
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Tự động kiểm tra đối soát thuộc tính hình học & an toàn kỹ thuật của toàn bộ đối
                  tượng trong dự án.
                </p>
                {scanResult && (
                  <div className="mt-2 text-xs font-medium text-emerald-400">{scanResult}</div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  disabled={scanning}
                  onClick={handleBatchScan}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-on-accent-dark hover:bg-amber-400"
                >
                  <Play size={16} />
                  {scanning ? "Đang quét..." : "Quét tuân thủ toàn dự án"}
                </button>
              </div>
            </div>

            {/* Active Rules Catalog */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {rules.map((r) => (
                <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex items-start justify-between">
                    <span className="font-bold text-amber-400">{r.standard_code}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs uppercase font-semibold ${
                        r.severity === "legal_strict"
                          ? "bg-rose-950 text-rose-400 border border-rose-800/40"
                          : "bg-amber-950 text-amber-400 border border-amber-800/40"
                      }`}
                    >
                      {r.severity}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-zinc-200">{r.section_clause}</div>
                  <p className="mt-1 text-xs text-zinc-400">{r.description}</p>
                </div>
              ))}
            </div>

            {/* Filter and NCRs Table */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <Filter size={16} />
                  <span>Bộ lọc kết quả:</span>
                  <div className="flex rounded-lg bg-zinc-900 p-1">
                    <button
                      onClick={() => setAuditFilter("all")}
                      className={`rounded px-3 py-1 text-xs ${
                        auditFilter === "all"
                          ? "bg-zinc-800 text-amber-400 font-semibold"
                          : "text-zinc-400"
                      }`}
                    >
                      Tất cả ({audits.length})
                    </button>
                    <button
                      onClick={() => setAuditFilter("non_compliant")}
                      className={`rounded px-3 py-1 text-xs ${
                        auditFilter === "non_compliant"
                          ? "bg-rose-950 text-rose-400 font-semibold"
                          : "text-zinc-400"
                      }`}
                    >
                      Không phù hợp - NCR ({nonCompliantAudits.length})
                    </button>
                    <button
                      onClick={() => setAuditFilter("compliant")}
                      className={`rounded px-3 py-1 text-xs ${
                        auditFilter === "compliant"
                          ? "bg-emerald-950 text-emerald-400 font-semibold"
                          : "text-zinc-400"
                      }`}
                    >
                      Đạt chuẩn ({audits.length - nonCompliantAudits.length})
                    </button>
                  </div>
                </div>
              </div>

              {filteredAudits.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="Không có bản ghi kiểm định"
                  message="Bấm 'Quét tuân thủ toàn dự án' để thực hiện đối soát tự động theo bộ quy chuẩn."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
                  <table className="w-full text-left text-sm text-zinc-300">
                    <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-400">
                      <tr>
                        <th className="px-4 py-3">Đối tượng kỹ thuật</th>
                        <th className="px-4 py-3">Tiêu chuẩn & Điều khoản</th>
                        <th className="px-4 py-3">Trạng thái</th>
                        <th className="px-4 py-3">Chi tiết vi phạm / Đánh giá</th>
                        <th className="px-4 py-3">Thời điểm kiểm định</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {filteredAudits.map((a) => (
                        <tr key={a.id} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3">
                            <div className="font-medium text-zinc-200">
                              {a.object_name || "Đối tượng"}
                            </div>
                            <div className="text-xs text-zinc-400">
                              {a.object_code || a.object_id} • {a.object_discipline}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-amber-400">{a.standard_code}</div>
                            <div className="text-xs text-zinc-400">{a.section_clause}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                a.compliance_status === "non_compliant"
                                  ? "bg-rose-950 text-rose-400 border border-rose-800/50"
                                  : "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                              }`}
                            >
                              {a.compliance_status === "non_compliant"
                                ? "VI PHẠM (NCR)"
                                : "ĐẠT CHUẨN"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div
                              className={
                                a.compliance_status === "non_compliant"
                                  ? "text-rose-300 font-medium"
                                  : "text-zinc-400"
                              }
                            >
                              {a.finding_details}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-400">
                            {new Date(a.audited_at).toLocaleString("vi-VN")}
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

        {/* Modal Chạy Mô phỏng What-If */}
        {showSimModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-zinc-100">
                Khởi chạy Mô phỏng What-If Monte Carlo
              </h2>
              <form onSubmit={handleSimulate} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400">Mã kịch bản</label>
                  <input
                    type="text"
                    required
                    value={scenarioCode}
                    onChange={(e) => setScenarioCode(e.target.value)}
                    placeholder="VD: SCENARIO-ACCEL-FL05-01"
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    Lý do kích hoạt / Bối cảnh
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={triggerReason}
                    onChange={(e) => setTriggerReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Thời gian cơ sở (Ngày)
                    </label>
                    <input
                      type="number"
                      required
                      value={baselineDays}
                      onChange={(e) => setBaselineDays(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Mục tiêu rút ngắn (Ngày)
                    </label>
                    <input
                      type="number"
                      required
                      value={targetDaysSaved}
                      onChange={(e) => setTargetDaysSaved(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Chi phí cơ sở (VND)
                    </label>
                    <input
                      type="number"
                      required
                      value={baselineCost}
                      onChange={(e) => setBaselineCost(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Ngân sách bù tối đa (VND)
                    </label>
                    <input
                      type="number"
                      required
                      value={maxCrashBudget}
                      onChange={(e) => setMaxCrashBudget(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    Số vòng lặp Monte Carlo
                  </label>
                  <input
                    type="number"
                    value={simIterations}
                    onChange={(e) => setSimIterations(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSimModal(false)}
                    className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={simulating}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-on-accent-dark hover:bg-amber-400"
                  >
                    {simulating ? "Đang giải..." : "Chạy mô phỏng Pareto"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
