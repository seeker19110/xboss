"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import ThuNghiemBanner from "@/app/components/ThuNghiemBanner";
import EngineeringNav from "@/app/components/EngineeringNav";
import { ComponentErrorBoundary } from "@/app/components/ComponentErrorBoundary";
import {
  Users,
  Award,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Zap,
  ArrowRight,
  RefreshCw,
  Building2,
  Cpu,
} from "lucide-react";

interface SubconScoreItem {
  id: string;
  companyName: string;
  taxCode?: string;
  primaryDiscipline: string;
  specialties: string[];
  workforceCapacity: number;
  onTimeRate: number;
  bbntPassRate: number;
  ncrCount: number;
  hseScore: number;
  costVarianceRate: number;
  trustScore: number;
  tierGrade: string;
  summary?: string;
  evaluatedAt?: string;
}

interface ShortlistCandidate {
  profileId: string;
  companyName: string;
  matchScore: number;
  trustScore: number;
  tierGrade: string;
  riskFactors: string[];
  strengths: string[];
}

export default function SubconAiPage() {
  const [subcons, setSubcons] = useState<SubconScoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Matchmaker AI State
  const [packageName, setPackageName] = useState(
    "Gói thầu Thi công Hệ thống PCCC & Khí FM200 Tháp A",
  );
  const [pkgDiscipline, setPkgDiscipline] = useState("FIRE_FIGHTING");
  const [estimatedBudget, setEstimatedBudget] = useState("3500000000");
  const [requiredCapacity, setRequiredCapacity] = useState("20");
  const [specialtyInput, setSpecialtyInput] = useState("FM200, Sprinkler");
  const [recommending, setRecommending] = useState(false);
  const [shortlist, setShortlist] = useState<ShortlistCandidate[] | null>(null);

  const fetchScores = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/engineering/subcon-ai/scores");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSubcons(json.data);
      }
    } catch (e) {
      console.error("Lỗi tải bảng điểm thầu phụ:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScores();
  }, []);

  const handleRunMatchmaker = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecommending(true);
    try {
      const specialties = specialtyInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/engineering/subcon-ai/recommend-shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageName,
          discipline: pkgDiscipline,
          estimatedBudget: Number(estimatedBudget),
          requiredCapacity: Number(requiredCapacity),
          requiredSpecialties: specialties,
        }),
      });

      const json = await res.json();
      if (json.success && json.data?.candidates) {
        setShortlist(json.data.candidates);
      }
    } catch (err) {
      console.error("Lỗi chạy Matchmaker AI:", err);
    } finally {
      setRecommending(false);
    }
  };

  const filteredSubcons = subcons.filter((s) => {
    const matchDisc = selectedDiscipline === "ALL" || s.primaryDiscipline === selectedDiscipline;
    const matchSearch =
      s.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.taxCode && s.taxCode.includes(searchQuery));
    return matchDisc && matchSearch;
  });

  const countTierA = subcons.filter((s) => s.tierGrade === "TIER_A").length;
  const countTierB = subcons.filter((s) => s.tierGrade === "TIER_B").length;
  const countTierC = subcons.filter((s) => s.tierGrade === "TIER_C").length;
  const countTierD = subcons.filter((s) => s.tierGrade === "TIER_D").length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader />
      <EngineeringNav />

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 flex flex-col gap-6">
        <ThuNghiemBanner />
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-zinc-100">
                  AI Subcontractor Trust & Auto-Bidding (M82)
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-violet-950/80 text-violet-400 border border-violet-800/80 rounded-full">
                  AI Autonomous
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Chấm điểm tín nhiệm nhà thầu phụ đa chiều (WBS, NCR, BBNT, HSE) & tự động đề xuất
                danh sách mời thầu tối ưu
              </p>
            </div>
          </div>

          <button
            onClick={fetchScores}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-violet-400" : ""}`} />
            Làm mới
          </button>
        </div>

        {/* Tier KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-emerald-500/20 flex flex-col gap-1">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
              <span>Hạng A (Chiến lược)</span>
              <Award className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-zinc-100">{countTierA}</div>
            <span className="text-[11px] text-zinc-400">Điểm tín nhiệm ≥ 85</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/90 border border-sky-500/20 flex flex-col gap-1">
            <div className="flex items-center justify-between text-sky-400 text-xs font-semibold">
              <span>Hạng B (Đạt chuẩn)</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-zinc-100">{countTierB}</div>
            <span className="text-[11px] text-zinc-400">Điểm tín nhiệm 70 - 84</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/20 flex flex-col gap-1">
            <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
              <span>Hạng C (Cần giám sát)</span>
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-zinc-100">{countTierC}</div>
            <span className="text-[11px] text-zinc-400">Điểm tín nhiệm 50 - 69</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/90 border border-rose-500/20 flex flex-col gap-1">
            <div className="flex items-center justify-between text-rose-400 text-xs font-semibold">
              <span>Hạng D (Rủi ro cao)</span>
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-zinc-100">{countTierD}</div>
            <span className="text-[11px] text-zinc-400">Hạn chế mời thầu (&lt; 50)</span>
          </div>
        </div>

        {/* Section 1: AI Matchmaker Studio */}
        <ComponentErrorBoundary name="AI Matchmaker Studio">
          <div className="p-5 rounded-xl bg-gradient-to-br from-violet-950/20 via-zinc-900/90 to-zinc-900/90 border border-violet-800/30 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm">
              <Sparkles className="w-4 h-4" />
              <span>AI Matchmaker: Gợi Ý Danh Sách Mời Thầu Tối Ưu (Auto-Bidding Shortlist)</span>
            </div>

            <form
              onSubmit={handleRunMatchmaker}
              className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs"
            >
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-zinc-400 font-medium">Tên gói thầu cần mời thầu</label>
                <input
                  type="text"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-violet-500"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-zinc-400 font-medium">Chuyên ngành chính</label>
                <select
                  value={pkgDiscipline}
                  onChange={(e) => setPkgDiscipline(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-violet-500"
                >
                  <option value="HVAC">HVAC (Thông gió & ĐHKK)</option>
                  <option value="ELECTRICAL">ELECTRICAL (Điện & Trạm)</option>
                  <option value="FIRE_FIGHTING">FIRE FIGHTING (PCCC)</option>
                  <option value="PLUMBING">PLUMBING (Cấp thoát nước)</option>
                  <option value="EXTRA_LOW_VOLTAGE">ELV (Điện nhẹ & BMS)</option>
                  <option value="GENERAL_MEPF">GENERAL MEPF (Tổng hợp)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-zinc-400 font-medium">Ngân sách dự toán (VND)</label>
                <input
                  type="number"
                  value={estimatedBudget}
                  onChange={(e) => setEstimatedBudget(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-zinc-400 font-medium">Yêu cầu nhân sự tối thiểu</label>
                <input
                  type="number"
                  value={requiredCapacity}
                  onChange={(e) => setRequiredCapacity(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-zinc-400 font-medium">
                  Chuyên môn sâu yêu cầu (phân cách bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  value={specialtyInput}
                  onChange={(e) => setSpecialtyInput(e.target.value)}
                  placeholder="Ví dụ: Chiller, FM200, VRV, Trạm 22kV"
                  className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={recommending}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 font-semibold text-white transition shadow-lg shadow-violet-900/30"
                >
                  <Cpu className={`w-4 h-4 ${recommending ? "animate-spin" : ""}`} />
                  {recommending ? "AI Đang Quét..." : "AI Đề Xuất Shortlist"}
                </button>
              </div>
            </form>

            {/* Shortlist Results */}
            {shortlist && (
              <div className="mt-2 flex flex-col gap-2.5 pt-3 border-t border-zinc-800/80">
                <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Top Nhà Thầu Phù Hợp Nhất (Theo Điểm Tương Thích & Lịch Sử Thi Công):</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {shortlist.slice(0, 3).map((cand, idx) => (
                    <div
                      key={cand.profileId}
                      className="p-3.5 rounded-lg bg-zinc-950/90 border border-zinc-800 hover:border-violet-500/50 transition flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-violet-400">
                            #TOP {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-emerald-400">
                            {cand.matchScore}% Match
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-zinc-100 mt-1 line-clamp-1">
                          {cand.companyName}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
                          <span>
                            Trust Score:{" "}
                            <strong className="text-zinc-200">{cand.trustScore}</strong>
                          </span>
                          <span>•</span>
                          <span className="text-sky-400 font-medium">{cand.tierGrade}</span>
                        </div>
                      </div>

                      {/* Strengths & Risks */}
                      <div className="text-[10px] flex flex-col gap-1 pt-2 border-t border-zinc-800">
                        {cand.strengths.length > 0 && (
                          <div className="text-emerald-400 flex items-start gap-1">
                            <span>✔</span>
                            <span>{cand.strengths[0]}</span>
                          </div>
                        )}
                        {cand.riskFactors.length > 0 ? (
                          <div className="text-rose-400 flex items-start gap-1">
                            <span>⚠</span>
                            <span>{cand.riskFactors[0]}</span>
                          </div>
                        ) : (
                          <div className="text-zinc-400">Không có rủi ro đáng kể</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ComponentErrorBoundary>

        {/* Section 2: Subcontractor Directory & Trust Scores */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-400" />
              <span>Hồ Sơ Năng Lực & Ma Trận Điểm Tín Nhiệm Nhà Thầu Phụ</span>
            </h2>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Tìm nhà thầu, MST..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={selectedDiscipline}
                onChange={(e) => setSelectedDiscipline(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="ALL">Tất cả hệ thống</option>
                <option value="HVAC">HVAC</option>
                <option value="ELECTRICAL">Điện</option>
                <option value="FIRE_FIGHTING">PCCC</option>
                <option value="PLUMBING">Cấp thoát nước</option>
              </select>
            </div>
          </div>

          {/* Table Directory */}
          <ComponentErrorBoundary name="Bảng Điểm Thầu Phụ">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/90 text-zinc-400 font-semibold">
                    <th className="p-3">Doanh nghiệp / MST</th>
                    <th className="p-3">Chuyên ngành</th>
                    <th className="p-3 text-center">Nhân lực</th>
                    <th className="p-3 text-center">Tiến độ WBS</th>
                    <th className="p-3 text-center">BBNT Đạt</th>
                    <th className="p-3 text-center">Lỗi NCR</th>
                    <th className="p-3 text-center">An toàn HSE</th>
                    <th className="p-3 text-center">Trust Score</th>
                    <th className="p-3 text-center">Phân Hạng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-zinc-500">
                        Đang tải danh sách nhà thầu phụ...
                      </td>
                    </tr>
                  ) : filteredSubcons.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-zinc-500">
                        Không tìm thấy nhà thầu nào phù hợp bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredSubcons.map((s) => (
                      <tr key={s.id} className="hover:bg-zinc-800/40 transition">
                        <td className="p-3">
                          <div className="font-semibold text-zinc-100">{s.companyName}</div>
                          <div className="text-[11px] text-zinc-500">MST: {s.taxCode || "N/A"}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-zinc-800 text-[11px] text-zinc-300 font-medium">
                            {s.primaryDiscipline}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono">{s.workforceCapacity} người</td>
                        <td className="p-3 text-center">
                          <span
                            className={
                              s.onTimeRate >= 90
                                ? "text-emerald-400 font-semibold"
                                : "text-amber-400 font-semibold"
                            }
                          >
                            {s.onTimeRate}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={
                              s.bbntPassRate >= 90
                                ? "text-emerald-400 font-semibold"
                                : "text-zinc-300"
                            }
                          >
                            {s.bbntPassRate}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={
                              s.ncrCount === 0 ? "text-zinc-400" : "text-rose-400 font-bold"
                            }
                          >
                            {s.ncrCount} vụ
                          </span>
                        </td>
                        <td className="p-3 text-center text-sky-400 font-medium">
                          {s.hseScore}/100
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-sm font-bold text-zinc-100 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                            {s.trustScore}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-[11px] font-bold ${
                              s.tierGrade === "TIER_A"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : s.tierGrade === "TIER_B"
                                  ? "bg-sky-950 text-sky-400 border border-sky-800"
                                  : s.tierGrade === "TIER_C"
                                    ? "bg-amber-950 text-amber-400 border border-amber-800"
                                    : "bg-rose-950 text-rose-400 border border-rose-800"
                            }`}
                          >
                            {s.tierGrade}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ComponentErrorBoundary>
        </div>
      </main>
    </div>
  );
}
