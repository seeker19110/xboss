"use client";
import { useEffect, useState } from "react";
import {
  TrendingUp,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Clock,
  Sparkles,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";
import ThuNghiemBanner from "@/app/components/ThuNghiemBanner";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

type PredictionModel = {
  key: string;
  label: string;
  useCase: "schedule_risk" | "cost_anomaly" | "clash_priority";
  riskClass: string;
  isActive: boolean;
  baselineRef: string;
};

type PredictionOutput = {
  id: string;
  runId: string;
  projectId: number;
  entityType: "object" | "task" | "package" | "relation";
  entityId: string;
  score: number;
  probability: number;
  uncertaintyBin: "low" | "medium" | "high" | "unknown";
  explanation: string;
  evidenceRefs: Array<{ type: string; id: string; note: string }>;
  suggestionId: string | null;
  status: "active" | "dismissed" | "accepted";
  createdAt: string;
};

const UNCERTAINTY_BADGE = {
  low: { label: "Độ tin cậy cao", cls: "bg-emerald-950/50 text-emerald-300 border-emerald-800" },
  medium: {
    label: "Độ tin cậy trung bình",
    cls: "bg-amber-950/50 text-amber-300 border-amber-800",
  },
  high: { label: "Độ bất định cao", cls: "bg-rose-950/50 text-rose-300 border-rose-800" },
  unknown: { label: "Chưa xác định", cls: "bg-zinc-800 text-zinc-400 border-zinc-700" },
};

export default function PredictionsPage() {
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionOutput[]>([]);
  const [models, setModels] = useState<PredictionModel[]>([]);
  const [running, setRunning] = useState(false);
  const [selectedUseCase, setSelectedUseCase] = useState<
    "schedule_risk" | "cost_anomaly" | "clash_priority"
  >("schedule_risk");

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetch("/api/engineering/predictions");
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (!res.ok) throw new Error("Không thể tải danh sách dự báo");
      const data = await res.json();
      setPredictions(data.predictions || []);
      setModels(data.models || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRunPrediction() {
    setRunning(true);
    try {
      const res = await fetch("/api/engineering/predictions/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCase: selectedUseCase }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Chạy dự báo thất bại");
        return;
      }
      await loadData();
    } catch {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setRunning(false);
    }
  }

  async function handleDecide(id: string, decision: "accepted" | "dismissed") {
    try {
      const res = await fetch(`/api/engineering/predictions/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        setPredictions((prev) => prev.map((p) => (p.id === id ? { ...p, status: decision } : p)));
      }
    } catch {
      alert("Lỗi kết nối");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Predictive OS (Dự báo rủi ro có kiểm soát)" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ThuNghiemBanner moduleKey="engineering-predictions" />
        <EngineeringNav />

        {/* Action Header & Model Trigger */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <TrendingUp size={18} className="text-amber-400" />
                Dự báo rủi ro & Anomaly Detection (Uncertainty-First)
              </h2>
              <p className="mt-1 text-xs text-zinc-400 max-w-2xl">
                Dự báo AI luôn đóng vai trò là đề xuất tham vấn kỹ thuật (ENG-2) kèm cơ sở giải
                trình (Explainability), không tự ý can thiệp dữ liệu công trình khi chưa có phê
                duyệt.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Chọn bài toán dự báo"
                value={selectedUseCase}
                onChange={(e) => setSelectedUseCase(e.target.value as typeof selectedUseCase)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
              >
                <option value="schedule_risk">Tiến độ (Schedule Risk)</option>
                <option value="clash_priority">Xung đột (Clash Priority)</option>
                <option value="cost_anomaly">Chi phí (Cost Anomaly)</option>
              </select>

              <button
                type="button"
                onClick={handleRunPrediction}
                disabled={running}
                className="flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-on-accent hover:bg-amber-800 disabled:opacity-50"
              >
                <Play size={14} />
                <span>{running ? "Đang suy luận..." : "Chạy dự báo mới"}</span>
              </button>
            </div>
          </div>

          {/* Model Catalog Pills */}
          <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-zinc-800">
            {models.map((m) => (
              <div
                key={m.key}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-400"
              >
                <Sparkles size={12} className="text-amber-400" />
                <span className="font-mono text-zinc-300">{m.key}</span>
                <span className="text-zinc-500">· {m.riskClass.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Predictions Queue */}
        {loading ? (
          <PageSkeleton />
        ) : predictions.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="Chưa có cảnh báo dự báo nào"
            message="Chọn mô hình và nhấn 'Chạy dự báo mới' để rà soát rủi ro tiến độ, chi phí hoặc xung đột không gian theo thời gian thực."
          />
        ) : (
          <div className="space-y-3">
            {predictions.map((p) => {
              const uBadge = UNCERTAINTY_BADGE[p.uncertaintyBin];
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    p.status === "dismissed"
                      ? "border-zinc-800 bg-zinc-950/40 opacity-60"
                      : p.status === "accepted"
                        ? "border-emerald-900/60 bg-emerald-950/10"
                        : "border-zinc-800 bg-zinc-900"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-[300px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300">
                          {p.entityType.toUpperCase()} #{p.entityId}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${uBadge.cls}`}
                        >
                          {uBadge.label} (P={(p.probability * 100).toFixed(0)}%)
                        </span>
                        <span className="text-zinc-500 text-[11px]">
                          Điểm rủi ro:{" "}
                          <strong className="text-rose-400">
                            {(p.score * 100).toFixed(0)}/100
                          </strong>
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-zinc-200">{p.explanation}</p>

                      {p.suggestionId && (
                        <div className="mt-2">
                          <Link
                            href="/engineering/suggestions"
                            className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
                          >
                            <ExternalLink size={12} />
                            <span>Xem đề xuất kỹ thuật liên kết (ENG-2)</span>
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {p.status === "active" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDecide(p.id, "accepted")}
                            className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-emerald-800"
                          >
                            <CheckCircle2 size={13} /> Tiếp nhận
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecide(p.id, "dismissed")}
                            className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
                          >
                            <XCircle size={13} /> Bỏ qua
                          </button>
                        </>
                      ) : (
                        <span
                          className={`rounded px-2.5 py-1 text-xs font-semibold uppercase ${
                            p.status === "accepted"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-zinc-800 text-zinc-500"
                          }`}
                        >
                          {p.status === "accepted" ? "Đã tiếp nhận" : "Đã bỏ qua"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
