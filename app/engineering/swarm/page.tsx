"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Bot,
  Users,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Key,
  Sparkles,
  Plus,
  RefreshCw,
  Clock,
  ArrowRight,
  HelpCircle,
  Flame,
  Shield,
  Layers,
  FileCheck,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";
import type {
  SwarmDebateRecord,
  SwarmArgumentRecord,
  AutonomousTechnicalDraft,
  SwarmAgentRole,
  DebateStance,
} from "@/lib/ky-thuat/engineering-swarm";

export default function SwarmEngineeringPage() {
  const [debates, setDebates] = useState<SwarmDebateRecord[]>([]);
  const [selectedDebate, setSelectedDebate] = useState<SwarmDebateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDraft, setActiveDraft] = useState<AutonomousTechnicalDraft | null>(null);
  const [showNewDebateModal, setShowNewDebateModal] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [newTrigger, setNewTrigger] = useState("");

  const fetchDebates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/engineering/swarm/debates");
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.length === 0) {
          // Mẫu phong phú ban đầu nếu chưa có phiên
          const sampleDebate: SwarmDebateRecord = {
            id: "deb-sample-1",
            project_id: 1,
            debate_topic: "Xung đột cao độ tuyến ống gió SA và dầm bê tông B12 trục 4-5 Tầng 4",
            trigger_event: "Phát hiện va chạm hình học (Hard Clash CLASH-DUCT-BEAM-01)",
            participating_agents: [
              "agent_structural",
              "agent_mepf",
              "agent_safety",
              "agent_cost_qs",
              "agent_contract",
            ],
            status: "synthesized",
            synthesis_summary:
              "Đạt thỏa hiệp kỹ thuật: Hạ cao độ đáy ống gió SA xuống 150mm (Phương án 1). Agent An toàn PCCC xác nhận khoảng thông thủy hành lang vẫn đạt 2.65m (> 2.4m theo QCVN 06:2022). Agent Kết cấu bảo lưu không đục dầm.",
            consensus_level: "majority_with_dissent",
            created_at: new Date(Date.now() - 3600000).toISOString(),
            updated_at: new Date().toISOString(),
            arguments: [
              {
                id: "arg-1",
                debate_id: "deb-sample-1",
                agent_role: "agent_structural",
                stance: "object",
                authority_weight: 1.4,
                argument_text:
                  "Tuyệt đối không được phép khoan cấy hoặc đục lỗ mở dầm B12 (400x600) tại vị trí gối tựa do mô-men uốn và lực cắt đạt cực đại.",
                cited_clauses: ["TCVN 5574:2018 - Điều 8.1.3"],
                impact_assessment: { cost_delta_vnd: 0, schedule_delta_days: 0, risk_score: 85 },
                created_at: new Date(Date.now() - 3000000).toISOString(),
              },
              {
                id: "arg-2",
                debate_id: "deb-sample-1",
                agent_role: "agent_mepf",
                stance: "propose",
                authority_weight: 1.2,
                argument_text:
                  "Đề xuất hạ đáy ống gió 150mm và bổ sung 2 cút chuyển hướng 45 độ. Tổn thất áp lực tĩnh tính toán tăng thêm 15 Pa, quạt AHU-04 vẫn đủ cột áp dư 45 Pa.",
                cited_clauses: ["TCVN 5687:2010 - Bảng 12"],
                impact_assessment: {
                  cost_delta_vnd: 1200000,
                  schedule_delta_days: 0,
                  risk_score: 10,
                },
                created_at: new Date(Date.now() - 2500000).toISOString(),
              },
              {
                id: "arg-3",
                debate_id: "deb-sample-1",
                agent_role: "agent_safety",
                stance: "concur",
                authority_weight: 1.5,
                argument_text:
                  "Chấp thuận giải pháp hạ ống gió. Cao độ thông thủy hoàn thiện đạt 2.65m, thỏa mãn quy định lối thoát nạn.",
                cited_clauses: ["QCVN 06:2022/BXD - Điều 5.1.2"],
                impact_assessment: { cost_delta_vnd: 0, schedule_delta_days: 0, risk_score: 5 },
                created_at: new Date(Date.now() - 1800000).toISOString(),
              },
              {
                id: "arg-4",
                debate_id: "deb-sample-1",
                agent_role: "agent_cost_qs",
                stance: "amend",
                authority_weight: 1.1,
                argument_text:
                  "Chi phí phụ kiện phát sinh 1.2M VNĐ nằm trong hạn mức dự phòng gói thầu HVAC. Đề xuất cập nhật vào phụ lục BOQ điều chỉnh.",
                cited_clauses: ["Hợp đồng Mục 14.2"],
                impact_assessment: {
                  cost_delta_vnd: 1200000,
                  schedule_delta_days: 0,
                  risk_score: 15,
                },
                created_at: new Date(Date.now() - 1200000).toISOString(),
              },
            ],
          };
          setDebates([sampleDebate]);
          setSelectedDebate(sampleDebate);
        } else {
          setDebates(data);
          setSelectedDebate(data[0] || null);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDebates();
  }, [fetchDebates]);

  const handleCreateDebate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic || !newTrigger) return;

    try {
      const res = await fetch("/api/engineering/swarm/debates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: newTopic, triggerEvent: newTrigger }),
      });

      if (res.ok) {
        setShowNewDebateModal(false);
        setNewTopic("");
        setNewTrigger("");
        fetchDebates();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateDraft = async () => {
    if (!selectedDebate) return;
    try {
      const res = await fetch("/api/engineering/swarm/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftType: "rfi",
          title: `RFI: Giải quyết xung đột không gian - ${selectedDebate.debate_topic}`,
          topic: selectedDebate.debate_topic,
          synthesis: selectedDebate.synthesis_summary || "Đồng thuận kỹ thuật",
          citations: [
            { code: "QCVN 06:2022/BXD", clause: "Clause 5.1.2", relevance: "Chiều cao thông thủy" },
            { code: "TCVN 5574:2018", clause: "Clause 8.1.3", relevance: "Bảo vệ tiết diện dầm" },
          ],
          costEstimateVnd: 1200000,
          scheduleDeltaDays: 0,
        }),
      });

      if (res.ok) {
        const draft = await res.json();
        setActiveDraft(draft);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getAgentBadge = (role: SwarmAgentRole) => {
    switch (role) {
      case "agent_safety":
        return { label: "An Toàn & PCCC", color: "text-red-400 bg-red-950/60 border-red-800" };
      case "agent_structural":
        return {
          label: "Kết Cấu Chịu Lực",
          color: "text-violet-400 bg-violet-950/60 border-violet-800",
        };
      case "agent_mepf":
        return { label: "Cơ Điện MEPF", color: "text-cyan-400 bg-cyan-950/60 border-cyan-800" };
      case "agent_cost_qs":
        return {
          label: "Dự Toán QS / BOQ",
          color: "text-emerald-400 bg-emerald-950/60 border-emerald-800",
        };
      default:
        return {
          label: "Hợp Đồng & Pháp Lý",
          color: "text-amber-400 bg-amber-950/60 border-amber-800",
        };
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
              <Bot className="text-amber-400" size={28} />
              Multi-Agent Swarm Orchestration & Autonomous Drafting (PIN-3)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Mạng lưới Agent đa chuyên ngành tranh biện dựa trên cấp bậc thẩm quyền nguồn, tự động
              soạn thảo RFI/Submittal kèm mã Single-use Token
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchDebates()}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              <RefreshCw size={16} />
              Làm mới
            </button>
            <button
              onClick={() => setShowNewDebateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-on-accent-dark transition-colors hover:bg-amber-400"
            >
              <Plus size={16} />
              Khởi tạo Tranh biện Swarm
            </button>
          </div>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Debates List */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-4">
            <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
              <Users size={18} className="text-amber-400" />
              Phiên Tranh Biện Swarm ({debates.length})
            </h2>

            <div className="mt-4 space-y-3">
              {debates.map((deb) => (
                <div
                  key={deb.id}
                  onClick={() => setSelectedDebate(deb)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    selectedDebate?.id === deb.id
                      ? "border-amber-400 bg-zinc-800/90 shadow-lg shadow-amber-500/10"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      {deb.status.toUpperCase()}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {new Date(deb.created_at).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <h3 className="mt-2 text-sm font-bold text-zinc-100 line-clamp-2">
                    {deb.debate_topic}
                  </h3>

                  <p className="mt-1 text-xs text-zinc-400 line-clamp-1">
                    Kích hoạt: {deb.trigger_event}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {deb.participating_agents.map((ag) => {
                      const badge = getAgentBadge(ag);
                      return (
                        <span
                          key={ag}
                          className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Debate Details & Timeline */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-8">
            {selectedDebate ? (
              <div className="space-y-6">
                {/* Topic Banner */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Chủ đề tranh biện
                    </span>
                    <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                      Đồng thuận: {selectedDebate.consensus_level}
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg font-bold text-zinc-100">
                    {selectedDebate.debate_topic}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    Sự kiện nguồn: {selectedDebate.trigger_event}
                  </p>

                  {/* Synthesis Box */}
                  {selectedDebate.synthesis_summary && (
                    <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                      <div className="flex items-center gap-1.5 font-bold text-amber-300 mb-1">
                        <Sparkles size={16} />
                        Kết luận Tổng hợp & Hòa giải Swarm:
                      </div>
                      {selectedDebate.synthesis_summary}
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
                    <div className="text-xs text-zinc-400">
                      Số lượng lập luận:{" "}
                      <span className="font-bold text-zinc-200">
                        {selectedDebate.arguments?.length || 0}
                      </span>
                    </div>
                    <button
                      onClick={handleGenerateDraft}
                      className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500"
                    >
                      <FileCheck size={14} />
                      Soạn thảo RFI / Hồ sơ Trình duyệt Tự động
                    </button>
                  </div>
                </div>

                {/* Arguments Timeline */}
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-300">
                    <MessageSquare size={16} className="text-amber-400" />
                    Dòng Thời gian Lập luận Chuyên ngành (Authority Hierarchy)
                  </h3>

                  <div className="mt-4 space-y-3">
                    {selectedDebate.arguments?.map((arg) => {
                      const badge = getAgentBadge(arg.agent_role);
                      return (
                        <div
                          key={arg.id}
                          className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition-all hover:border-zinc-700"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded border px-2 py-0.5 text-xs font-bold ${badge.color}`}
                              >
                                {badge.label}
                              </span>
                              <span className="font-mono text-[11px] text-zinc-400">
                                Trọng số: {arg.authority_weight.toFixed(2)}x
                              </span>
                            </div>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                arg.stance === "object"
                                  ? "bg-red-950 text-red-400"
                                  : arg.stance === "concur"
                                    ? "bg-emerald-950 text-emerald-400"
                                    : "bg-blue-950 text-blue-400"
                              }`}
                            >
                              {arg.stance}
                            </span>
                          </div>

                          <p className="mt-2 text-xs text-zinc-200 leading-relaxed">
                            {arg.argument_text}
                          </p>

                          {arg.cited_clauses && arg.cited_clauses.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">
                                Điều khoản viện dẫn:
                              </span>
                              {arg.cited_clauses.map((c, i) => (
                                <span
                                  key={i}
                                  className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-amber-300"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Autonomous Draft Preview Drawer (if generated) */}
                {activeDraft && (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4">
                    <div className="flex items-center justify-between border-b border-emerald-800/40 pb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="text-emerald-400" size={20} />
                        <div>
                          <h4 className="text-sm font-bold text-zinc-100">{activeDraft.title}</h4>
                          <span className="font-mono text-xs text-emerald-400 font-bold">
                            Mã hồ sơ: {activeDraft.draftId}
                          </span>
                        </div>
                      </div>
                      <span className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-on-accent-dark uppercase">
                        SẴN SÀNG KÝ DUYỆT
                      </span>
                    </div>

                    <div className="mt-3 text-xs text-zinc-300 space-y-2">
                      <p>{activeDraft.technicalDescription}</p>
                      <div className="rounded bg-zinc-950 p-2 font-mono text-[11px] text-zinc-400">
                        Nơi nhận: {activeDraft.targetRecipients.join(", ")}
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                          <Key size={14} />
                          Single-use Cryptographic Token Gate:
                        </span>
                        <span className="font-mono text-xs text-zinc-300">
                          {activeDraft.singleUseToken}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Yêu cầu Kỹ sư trưởng / PM xác thực ký token trước khi phát hành chính thức.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                title="Chưa chọn phiên tranh biện"
                message="Chọn một phiên tranh biện trong danh sách để xem diễn biến lập luận và soạn thảo RFI tự động."
              />
            )}
          </div>
        </div>

        {/* Modal Khởi tạo Phiên mới */}
        {showNewDebateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Bot className="text-amber-400" size={20} />
                Khởi tạo Phiên Swarm Debate Mới
              </h3>
              <form onSubmit={handleCreateDebate} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-400">
                    Chủ đề / Vướng mắc Kỹ thuật
                  </label>
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="vd: Xung đột cao độ tuyến ống PCCC và khay cáp điện..."
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-400">
                    Sự kiện Kích hoạt (Trigger Event)
                  </label>
                  <input
                    type="text"
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value)}
                    placeholder="vd: Phát hiện sai lệch hiện trường vượt 15mm hoặc RFI từ TVGS"
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    required
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewDebateModal(false)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-on-accent-dark hover:bg-amber-400"
                  >
                    Bắt đầu Tranh biện
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
