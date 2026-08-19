"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  Layers,
  Sparkles,
  BookOpen,
  Search,
  Plus,
  RefreshCw,
  TrendingUp,
  ShieldCheck,
  Zap,
  ArrowRight,
  Database,
  Fingerprint,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";
import type {
  KnowledgePatternRecord,
  CrossProjectLessonRecord,
  LessonTransferResult,
  PatternType,
} from "@/lib/engineering-memory-bank";

export default function MemoryBankEngineeringPage() {
  const [patterns, setPatterns] = useState<KnowledgePatternRecord[]>([]);
  const [lessons, setLessons] = useState<CrossProjectLessonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"patterns" | "lessons" | "transfer">("patterns");
  const [transferQuery, setTransferQuery] = useState("hvac");
  const [transferResults, setTransferResults] = useState<LessonTransferResult[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resPat, resLes] = await Promise.all([
        fetch("/api/engineering/memory/patterns"),
        fetch("/api/engineering/memory/lessons"),
      ]);

      if (resPat.status === 401 || resLes.status === 401) {
        redirectToLogin();
        return;
      }

      if (resPat.ok) {
        const pData = await resPat.json();
        if (pData.length === 0) {
          const samplePatterns: KnowledgePatternRecord[] = [
            {
              id: "pat-1",
              pattern_type: "material_waste_rate",
              category: "HVAC Ống Gió & Phụ Kiện",
              fingerprint_hash: "8f4a2b9c1e7d3f0a9b8c7d6e5f4a3b2c",
              pattern_metrics: { standard_norm_waste: "5%", actual_observed_waste: "11.4%" },
              confidence_score: 0.94,
              sample_size_projects: 6,
              sample_size_observations: 1420,
              lesson_learned:
                "Độ hao hụt tôn gia công ống gió tại hiện trường thực tế tăng thêm 6.4% do nhiều phụ kiện chuyển tiết diện tại các nút giao cắt dầm không được mô hình hóa trước.",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: "pat-2",
              pattern_type: "labor_productivity_deviation",
              category: "PCCC Tuyến Ống Đứng Trục Kỹ Thuật",
              fingerprint_hash: "3b7e9a1c5d8f2e4a6b0c8d1e3f5a7b9c",
              pattern_metrics: { estimated_md_per_m: 0.45, actual_md_per_m: 0.68 },
              confidence_score: 0.88,
              sample_size_projects: 4,
              sample_size_observations: 860,
              lesson_learned:
                "Năng suất lắp đặt ống trục kỹ thuật giảm 34% khi thi công sau giai đoạn đóng giàn giáo chính. Khuyến nghị lắp đặt ống trục chính song song với tiến độ dựng cốt thép.",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: "pat-3",
              pattern_type: "subcontractor_reliability",
              category: "Kéo Rải Cáp Điện Động Lực",
              fingerprint_hash: "2a9f4c8e1b7d5a3f0e8c6b4d2a0e9f1c",
              pattern_metrics: { delay_rate_percent: 22.5, rework_rate_percent: 4.8 },
              confidence_score: 0.91,
              sample_size_projects: 5,
              sample_size_observations: 980,
              lesson_learned:
                "Thầu phụ thường kéo chậm cáp do phụ thuộc vào tiến độ mặt bằng phòng máy biến áp. Cần chốt mốc Workfront Handover sớm tối thiểu 10 ngày.",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
          setPatterns(samplePatterns);
        } else {
          setPatterns(pData);
        }
      }

      if (resLes.ok) {
        const lData = await resLes.json();
        if (lData.length === 0) {
          const sampleLessons: CrossProjectLessonRecord[] = [
            {
              id: "les-1",
              source_project_id: 1,
              pattern_id: "pat-1",
              work_package_code: "WP-HVAC-DUCT",
              observed_problem:
                "Tôn gia công ống gió bị hụt 450m2 so với dự toán ban đầu tại Tháp B.",
              root_cause:
                "Không phát hiện kịp 28 điểm xung đột dầm sàn dẫn đến phải cắt gọt chắp vá tại chỗ.",
              prescribed_preventative_action:
                "Bắt buộc chạy Clash Detection 3D trên BIM trước khi xuất xưởng gia công tôn 100%. Bổ sung hệ số dự phòng bù hao hụt 8.5% trong dự toán gói thầu mới.",
              effectiveness_score: 0.95,
              created_at: new Date().toISOString(),
              source_project_name: "TT AVIO Tháp A (Giai đoạn 1)",
            },
          ];
          setLessons(sampleLessons);
        } else {
          setLessons(lData);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTransferQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTransferring(true);
    try {
      const res = await fetch("/api/engineering/memory/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: transferQuery }),
      });

      if (res.ok) {
        const results = await res.json();
        setTransferResults(results);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTransferring(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader />
        <main className="container mx-auto p-4 md:p-6">
          <EngineeringNav />
          <PageSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="container mx-auto p-4 md:p-6">
        <EngineeringNav />

        {/* Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
              <Brain className="text-amber-400" size={28} />
              Cross-Project Memory Bank & Pattern Engine (PIN-4)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Ngân hàng tri thức tích hợp liên dự án, mã hóa vân tay quy luật ẩn (Pattern
              Fingerprinting) và tự động chuyển giao bài học kinh nghiệm
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData()}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              <RefreshCw size={16} />
              Làm mới
            </button>
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
              <button
                onClick={() => setActiveTab("patterns")}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  activeTab === "patterns"
                    ? "bg-amber-500 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Mẫu Quy Luật Ẩn ({patterns.length})
              </button>
              <button
                onClick={() => setActiveTab("lessons")}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  activeTab === "lessons"
                    ? "bg-amber-500 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Bài Học Kinh Nghiệm ({lessons.length})
              </button>
              <button
                onClick={() => setActiveTab("transfer")}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  activeTab === "transfer"
                    ? "bg-amber-500 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Chuyển Giao Tri Thức (Transfer Learning)
              </button>
            </div>
          </div>
        </div>

        {/* Tab 1: Knowledge Patterns */}
        {activeTab === "patterns" && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {patterns.map((pat) => (
              <div
                key={pat.id}
                className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/90"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-amber-950/80 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
                      {pat.pattern_type.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      Độ tin cậy: {Math.round(pat.confidence_score * 100)}%
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-bold text-zinc-100">{pat.category}</h3>

                  <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
                    <Fingerprint size={14} className="text-zinc-500" />
                    Hash: {pat.fingerprint_hash.slice(0, 16)}...
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-zinc-300">{pat.lesson_learned}</p>
                </div>

                <div className="mt-5 border-t border-zinc-800 pt-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Mẫu từ {pat.sample_size_projects} dự án</span>
                    <span>{pat.sample_size_observations.toLocaleString("vi-VN")} quan sát</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Lessons Learned */}
        {activeTab === "lessons" && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
            <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
              <BookOpen size={18} className="text-amber-400" />
              Sổ Lưu trữ Bài học Kinh nghiệm & Hành động Phòng ngừa
            </h2>

            <div className="mt-4 space-y-4">
              {lessons.map((les) => (
                <div key={les.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-400">
                      Gói thầu: {les.work_package_code || "Toàn dự án"}
                    </span>
                    <span className="text-xs text-zinc-400">
                      Nguồn: {les.source_project_name || "Dự án mẫu"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
                    <div className="rounded-lg bg-zinc-900 p-3">
                      <span className="font-bold text-red-400 uppercase">Sự cố ghi nhận:</span>
                      <p className="mt-1 text-zinc-300">{les.observed_problem}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-900 p-3">
                      <span className="font-bold text-amber-400 uppercase">
                        Nguyên nhân gốc rễ:
                      </span>
                      <p className="mt-1 text-zinc-300">{les.root_cause}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/40 p-3">
                      <span className="font-bold text-emerald-400 uppercase">
                        Biện pháp phòng ngừa:
                      </span>
                      <p className="mt-1 text-zinc-200">{les.prescribed_preventative_action}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Transfer Learning */}
        {activeTab === "transfer" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
              <h2 className="text-base font-bold text-zinc-200 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-400" />
                Truy vấn Chuyển giao Tri thức & Dự báo Định mức Cho Gói thầu Mới
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Nhập danh mục bộ môn hoặc mã gói thầu để AI tự động so sánh với ngân hàng dữ liệu
                các công trình trước và đưa ra khuyến nghị điều chỉnh hệ số an toàn.
              </p>

              <form onSubmit={handleTransferQuery} className="mt-4 flex gap-3">
                <input
                  type="text"
                  value={transferQuery}
                  onChange={(e) => setTransferQuery(e.target.value)}
                  placeholder="vd: HVAC, PCCC Sprinkler, Cáp điện..."
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={isTransferring}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400"
                >
                  <Search size={16} />
                  Tra cứu Tri thức
                </button>
              </form>
            </div>

            {transferResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-zinc-300">
                  Kết quả Đối sánh và Khuyến nghị Chuyển giao ({transferResults.length})
                </h3>

                {transferResults.map((res, i) => (
                  <div key={i} className="rounded-xl border border-emerald-500/40 bg-zinc-950 p-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-bold text-zinc-100">
                        {res.matchedPattern.category}
                      </h4>
                      <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs font-bold text-emerald-400">
                        Độ tương thích: {Math.round(res.similarityScore * 100)}%
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-zinc-300">
                      {res.matchedPattern.lesson_learned}
                    </p>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                        <span className="text-xs text-zinc-400 font-semibold uppercase">
                          Điều chỉnh Hệ số Định mức Dự toán:
                        </span>
                        <div className="mt-1 font-mono text-lg font-bold text-amber-300">
                          +{res.recommendedAdjustments.suggestedNormBufferPercent}% dự phòng hao hụt
                        </div>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                        <span className="text-xs text-zinc-400 font-semibold uppercase">
                          Hành động Phòng ngừa Tiên quyết:
                        </span>
                        <div className="mt-1 text-xs font-medium text-emerald-300">
                          {res.recommendedAdjustments.keyPreventativeAction}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
