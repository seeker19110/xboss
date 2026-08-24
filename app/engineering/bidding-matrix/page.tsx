"use client";

import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { Skeleton } from "@/app/components/Skeleton";
import {
  FileSpreadsheet,
  Award,
  TrendingDown,
  AlertOctagon,
  ShieldCheck,
  CheckCircle2,
  Users,
  Plus,
  Play,
  RefreshCw,
  DollarSign,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface BiddingPackage {
  id: string;
  packageCode: string;
  title: string;
  discipline: string;
  targetBudgetVnd: number;
  status: string;
  rfqSpecs: Record<string, any>;
  awardedVendor: string | null;
  createdAt: string;
}

interface VendorQuote {
  id: string;
  vendorName: string;
  vendorType: string;
  totalAmountVnd: number;
  lineItems: any[];
  capacityScore: number;
  safetyScore: number;
  technicalComplianceScore: number;
  status: string;
}

interface AnalysisResult {
  rankings: Array<{
    vendorName: string;
    totalAmountVnd: number;
    priceScore: number;
    capacityScore: number;
    safetyScore: number;
    technicalScore: number;
    compositeScore: number;
    rank: number;
    riskLevel: string;
    recommendation: string;
  }>;
  skewReports: Array<{
    vendorName: string;
    earlyStageVariancePct: number;
    lateStageVariancePct: number;
    skewRatio: number;
    isFrontLoadingRisk: boolean;
    unbalancedItemsCount: number;
    anomalies: string[];
  }>;
  provenanceToken: string;
}

function formatVnd(val: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);
}

export default function BiddingMatrixPage() {
  const [packages, setPackages] = useState<BiddingPackage[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [quotes, setQuotes] = useState<VendorQuote[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Form State tạo Gói thầu mới
  const [showCreatePkg, setShowCreatePkg] = useState(false);
  const [pkgForm, setPkgForm] = useState({
    packageCode: "PKG-MEP-FL08-01",
    title: "Gói Thầu Cung Cấp & Lắp Đặt Ống Gió HVAC Tầng 8",
    discipline: "HVAC",
    targetBudgetVnd: 450000000,
  });

  const fetchPackages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/engineering/bidding/packages");
      if (res.ok) {
        const d = await res.json();
        setPackages(d.data || []);
        if (d.data?.length > 0 && !selectedPkgId) {
          setSelectedPkgId(d.data[0].id);
        }
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [selectedPkgId]);

  const fetchQuotes = useCallback(async (pkgId: string) => {
    if (!pkgId) return;
    try {
      const res = await fetch(`/api/engineering/bidding/quotes?packageId=${pkgId}`);
      if (res.ok) {
        const d = await res.json();
        setQuotes(d.data || []);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  useEffect(() => {
    if (selectedPkgId) {
      fetchQuotes(selectedPkgId);
      setAnalysis(null);
    }
  }, [selectedPkgId, fetchQuotes]);

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sampleLineItems = [
        {
          itemCode: "DUCT-600X400",
          description: "Ống gió tole tráng kẽm 600x400 d=0.8mm",
          unit: "m2",
          quantity: 250,
          targetUnitRateVnd: 380000,
          stage: "early",
          isCritical: true,
        },
        {
          itemCode: "DIFFUSER-300X300",
          description: "Cửa gió khuếch tán 300x300 nhôm sơn tĩnh điện",
          unit: "cái",
          quantity: 45,
          targetUnitRateVnd: 280000,
          stage: "middle",
          isCritical: false,
        },
        {
          itemCode: "VAV-BOX-400",
          description: "Hộp điều áp biến lưu lượng VAV Box DN400",
          unit: "bộ",
          quantity: 12,
          targetUnitRateVnd: 8500000,
          stage: "late",
          isCritical: true,
        },
      ];

      const res = await fetch("/api/engineering/bidding/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pkgForm,
          rfqSpecs: { lineItems: sampleLineItems },
        }),
      });

      if (res.ok) {
        setShowCreatePkg(false);
        await fetchPackages();
      }
    } catch {
      // Ignore
    }
  };

  const handleAddSampleQuotes = async () => {
    if (!selectedPkgId) return;

    const sampleVendors = [
      {
        vendorName: "Công ty Cơ Điện Hoàng Gia (Vendor A)",
        vendorType: "subcontractor",
        totalAmountVnd: 412000000,
        capacityScore: 88,
        safetyScore: 92,
        technicalComplianceScore: 90,
        lineItems: [
          { itemCode: "DUCT-600X400", quotedUnitRateVnd: 360000, quantity: 250, stage: "early" },
          {
            itemCode: "DIFFUSER-300X300",
            quotedUnitRateVnd: 260000,
            quantity: 45,
            stage: "middle",
          },
          { itemCode: "VAV-BOX-400", quotedUnitRateVnd: 8200000, quantity: 12, stage: "late" },
        ],
      },
      {
        vendorName: "Nhà Thầu Cơ Điện MEP Tân Phát (Vendor B - Front-loaded)",
        vendorType: "subcontractor",
        totalAmountVnd: 438000000,
        capacityScore: 82,
        safetyScore: 80,
        technicalComplianceScore: 85,
        lineItems: [
          { itemCode: "DUCT-600X400", quotedUnitRateVnd: 480000, quantity: 250, stage: "early" }, // Front-loaded (+26%)
          {
            itemCode: "DIFFUSER-300X300",
            quotedUnitRateVnd: 250000,
            quantity: 45,
            stage: "middle",
          },
          { itemCode: "VAV-BOX-400", quotedUnitRateVnd: 7400000, quantity: 12, stage: "late" },
        ],
      },
      {
        vendorName: "Công ty Cổ Phần Thiết Bị Khí Nam Á (Vendor C)",
        vendorType: "material_supplier",
        totalAmountVnd: 475000000,
        capacityScore: 95,
        safetyScore: 90,
        technicalComplianceScore: 95,
        lineItems: [
          { itemCode: "DUCT-600X400", quotedUnitRateVnd: 400000, quantity: 250, stage: "early" },
          {
            itemCode: "DIFFUSER-300X300",
            quotedUnitRateVnd: 300000,
            quantity: 45,
            stage: "middle",
          },
          { itemCode: "VAV-BOX-400", quotedUnitRateVnd: 9000000, quantity: 12, stage: "late" },
        ],
      },
    ];

    for (const v of sampleVendors) {
      await fetch("/api/engineering/bidding/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, packageId: selectedPkgId }),
      });
    }

    await fetchQuotes(selectedPkgId);
  };

  const handleRunAnalysis = async () => {
    if (!selectedPkgId) return;
    try {
      setAnalyzing(true);
      const res = await fetch("/api/engineering/bidding/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: selectedPkgId }),
      });
      if (res.ok) {
        const d = await res.json();
        setAnalysis(d.data);
      }
    } catch {
      // Ignore
    } finally {
      setAnalyzing(false);
    }
  };

  const selectedPkg = packages.find((p) => p.id === selectedPkgId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <EngineeringNav />

        {/* Tiêu đề */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Smart Bidding & Subcon Procurement Matrix (M75)
            </h1>
            <p className="text-xs text-zinc-400">
              Chuẩn hóa hồ sơ chào thầu, phát hiện đơn giá bất thường (Price Skewing /
              Front-loading) & Tối ưu phân bổ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreatePkg(true)}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-500"
            >
              <Plus size={14} /> Tạo Gói Thầu Mới
            </button>
          </div>
        </div>

        {/* Gói Thầu Selector & Thông tin Target */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-300">Gói thầu:</span>
              <select
                value={selectedPkgId}
                onChange={(e) => setSelectedPkgId(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 focus:outline-none"
              >
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    [{pkg.packageCode}] {pkg.title} ({pkg.discipline})
                  </option>
                ))}
              </select>
            </div>

            {selectedPkg && (
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-zinc-500">Ngân sách Target:</span>{" "}
                  <span className="font-bold text-emerald-400">
                    {formatVnd(selectedPkg.targetBudgetVnd)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Hồ sơ chào thầu:</span>{" "}
                  <span className="font-bold text-violet-400">{quotes.length} nhà thầu</span>
                </div>
                <div className="flex gap-2">
                  {quotes.length === 0 && (
                    <button
                      onClick={handleAddSampleQuotes}
                      className="rounded bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                    >
                      + Nạp 3 Báo Giá Mẫu
                    </button>
                  )}
                  <button
                    onClick={handleRunAnalysis}
                    disabled={analyzing || quotes.length === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-on-accent hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Play size={12} /> Chạy Phân Tích Ma Trận
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Tạo Gói Thầu */}
        {showCreatePkg && (
          <form
            onSubmit={handleCreatePackage}
            className="mb-6 rounded-xl border border-violet-700/50 bg-zinc-900 p-4 shadow-xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-violet-300">
                Tạo Gói Thầu Mời Báo Giá (RFQ)
              </h3>
              <button
                type="button"
                onClick={() => setShowCreatePkg(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Đóng
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="text-[11px] text-zinc-400">Mã gói thầu</label>
                <input
                  type="text"
                  required
                  value={pkgForm.packageCode}
                  onChange={(e) => setPkgForm((p) => ({ ...p, packageCode: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] text-zinc-400">Tên gói thầu</label>
                <input
                  type="text"
                  required
                  value={pkgForm.title}
                  onChange={(e) => setPkgForm((p) => ({ ...p, title: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400">Ngân sách Target (VND)</label>
                <input
                  type="number"
                  required
                  value={pkgForm.targetBudgetVnd}
                  onChange={(e) =>
                    setPkgForm((p) => ({ ...p, targetBudgetVnd: Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
              >
                Lưu Gói Thầu
              </button>
            </div>
          </form>
        )}

        {/* Ma Trận So Sánh Đơn Giá (Bid Leveling Matrix) */}
        <div className="mb-6 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h3 className="mb-3 text-xs font-semibold text-zinc-200">
              Bảng Đối Soát Giá Tổng Thể & Tiêu Chí Năng Lực ({quotes.length} nhà thầu)
            </h3>

            {quotes.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-500">
                Chưa có báo giá nào cho gói thầu này. Hãy nhấn &quot;+ Nạp 3 Báo Giá Mẫu&quot; để
                thử nghiệm.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="p-2.5">Nhà Thầu / NCC</th>
                      <th className="p-2.5">Loại hình</th>
                      <th className="p-2.5">Tổng Giá Chào</th>
                      <th className="p-2.5">Lệch Target</th>
                      <th className="p-2.5">Năng lực</th>
                      <th className="p-2.5">An toàn HSE</th>
                      <th className="p-2.5">Kỹ thuật</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-medium">
                    {quotes.map((q) => {
                      const diffPct = selectedPkg?.targetBudgetVnd
                        ? ((q.totalAmountVnd - selectedPkg.targetBudgetVnd) /
                            selectedPkg.targetBudgetVnd) *
                          100
                        : 0;

                      return (
                        <tr key={q.id} className="hover:bg-zinc-800/30">
                          <td className="p-2.5 font-semibold text-zinc-100">{q.vendorName}</td>
                          <td className="p-2.5 text-zinc-400">{q.vendorType}</td>
                          <td className="p-2.5 font-mono text-emerald-400">
                            {formatVnd(q.totalAmountVnd)}
                          </td>
                          <td className="p-2.5 font-mono">
                            <span
                              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${
                                diffPct < 0
                                  ? "bg-emerald-950/40 text-emerald-400"
                                  : "bg-rose-950/40 text-rose-400"
                              }`}
                            >
                              {diffPct < 0 ? (
                                <ArrowDownRight size={11} />
                              ) : (
                                <ArrowUpRight size={11} />
                              )}
                              {diffPct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-2.5 text-zinc-300">{q.capacityScore} / 100</td>
                          <td className="p-2.5 text-zinc-300">{q.safetyScore} / 100</td>
                          <td className="p-2.5 text-zinc-300">
                            {q.technicalComplianceScore} / 100
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Kết Quả Phân Tích Bất Thường Giá & Đề Xuất Chọn Thầu (AI Recommender) */}
        {analysis && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Cảnh báo Price Skewing */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-1 space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertOctagon size={16} />
                <h3 className="text-xs font-semibold">Phát Hiện Bất Thường Đơn Giá</h3>
              </div>

              {analysis.skewReports.map((sr) => (
                <div
                  key={sr.vendorName}
                  className={`rounded-lg border p-3 text-xs ${
                    sr.isFrontLoadingRisk
                      ? "border-rose-700/60 bg-rose-950/20"
                      : "border-zinc-800 bg-zinc-900/80"
                  }`}
                >
                  <p className="font-semibold text-zinc-200">{sr.vendorName}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                    <div>
                      Giai đoạn đầu:{" "}
                      <span
                        className={
                          sr.earlyStageVariancePct > 15
                            ? "font-bold text-rose-400"
                            : "text-zinc-300"
                        }
                      >
                        +{sr.earlyStageVariancePct}%
                      </span>
                    </div>
                    <div>
                      Giai đoạn cuối:{" "}
                      <span className="text-zinc-300">
                        {sr.lateStageVariancePct > 0
                          ? `+${sr.lateStageVariancePct}%`
                          : `${sr.lateStageVariancePct}%`}
                      </span>
                    </div>
                  </div>

                  {sr.isFrontLoadingRisk && (
                    <span className="mt-2 inline-block rounded bg-rose-900/60 px-2 py-0.5 text-[10px] font-bold text-rose-200 border border-rose-700">
                      CẢNH BÁO: Rủi ro Front-Loading (Ứng tiền sớm)
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Bảng Xếp Hạng & Khuyến Nghị Chọn Thầu */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Award size={16} />
                  <h3 className="text-xs font-semibold">Bảng Xếp Hạng Đa Tiêu Chí & Khuyến Nghị</h3>
                </div>
                <span className="font-mono text-[10px] text-zinc-500">
                  Token: {analysis.provenanceToken}
                </span>
              </div>

              <div className="space-y-3">
                {analysis.rankings.map((r) => (
                  <div
                    key={r.vendorName}
                    className={`rounded-lg border p-3 ${
                      r.rank === 1
                        ? "border-emerald-600/60 bg-emerald-950/20"
                        : "border-zinc-800 bg-zinc-900/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                              r.rank === 1
                                ? "bg-emerald-500 text-black"
                                : "bg-zinc-700 text-zinc-300"
                            }`}
                          >
                            #{r.rank}
                          </span>
                          <p className="text-xs font-bold text-zinc-100">{r.vendorName}</p>
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-emerald-300">
                          {r.recommendation}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-base font-bold text-zinc-100">
                          {r.compositeScore}
                        </span>
                        <span className="text-[10px] text-zinc-500"> / 100 điểm</span>
                      </div>
                    </div>

                    {/* Score Breakdown Bars */}
                    <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] text-zinc-400">
                      <div>
                        Giá (50%): <span className="font-bold text-zinc-200">{r.priceScore}</span>
                      </div>
                      <div>
                        Năng lực (25%):{" "}
                        <span className="font-bold text-zinc-200">{r.capacityScore}</span>
                      </div>
                      <div>
                        An toàn (15%):{" "}
                        <span className="font-bold text-zinc-200">{r.safetyScore}</span>
                      </div>
                      <div>
                        Kỹ thuật (10%):{" "}
                        <span className="font-bold text-zinc-200">{r.technicalScore}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
