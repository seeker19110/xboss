"use client";

import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { Skeleton } from "@/app/components/Skeleton";
import {
  Scale,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  DollarSign,
  Copy,
  Check,
  RefreshCw,
  Plus,
  ArrowRight,
  ShieldCheck,
  Clock,
} from "lucide-react";

interface FidicClaim {
  id: string;
  claimCode: string;
  contractType: string;
  fidicClause: string;
  eventTitle: string;
  eventDate: string;
  noticeDate: string;
  eotDaysClaimed: number;
  costClaimedVnd: string;
  isTimeBarCompliant: boolean;
  status: string;
  dossierContent: string;
  createdAt: string;
}

export default function FidicClaimsPage() {
  const [claims, setClaims] = useState<FidicClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<FidicClaim | null>(null);

  // Form State
  const [form, setForm] = useState({
    claimCode: "CLM-EOT-2026-001",
    contractType: "FIDIC_RED_1999" as const,
    eventType: "ACCESS_DELAY" as const,
    eventTitle: "Chậm bàn giao mặt bằng trục A1-A6 tầng hầm B1",
    eventDate: "2026-08-01",
    noticeDate: "2026-08-15",
    impactDays: 21,
    dailyOverheadVnd: 25000000,
  });

  const [dossierPreview, setDossierPreview] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchClaims = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/engineering/fidic/claims");
      if (res.ok) {
        const d = await res.json();
        setClaims(d.data || []);
        if (d.data?.length > 0 && !selectedClaim) {
          setSelectedClaim(d.data[0]);
          setDossierPreview(d.data[0].dossierContent);
        }
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [selectedClaim]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const handleGeneratePreview = async () => {
    try {
      setSubmitting(true);
      const res = await fetch("/api/engineering/fidic/claims/generate-dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimCode: form.claimCode,
          projectName: "Tòa Nhà Phức Hợp Sky Tower (Dự Án #1)",
          contractType: form.contractType,
          eventType: form.eventType,
          eventTitle: form.eventTitle,
          eventDate: form.eventDate,
          noticeDate: form.noticeDate,
          events: [
            {
              title: form.eventTitle,
              eventType: form.eventType,
              startDate: form.eventDate,
              endDate: form.noticeDate,
              isOnCriticalPath: true,
              directDelayDays: form.impactDays,
            },
          ],
          evidences: [
            {
              type: "daily_diary",
              referenceCode: "LOG-2026-08-01",
              description: "Ghi nhận mặt bằng chưa giải phóng xong cốt thép sàn",
            },
            {
              type: "rfi_delay",
              referenceCode: "RFI-MEP-042",
              description: "Yêu cầu xác nhận ngày bàn giao trục A1-A6",
            },
          ],
          dailyOverheadVnd: form.dailyOverheadVnd,
        }),
      });

      if (res.ok) {
        const d = await res.json();
        setAnalysisResult(d.data);
        setDossierPreview(d.data.dossier);
      }
    } catch {
      // Ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveClaim = async () => {
    try {
      setSubmitting(true);
      const costClaimed = (form.impactDays || 0) * (form.dailyOverheadVnd || 0);
      const res = await fetch("/api/engineering/fidic/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimCode: form.claimCode,
          contractType: form.contractType,
          eventType: form.eventType,
          eventTitle: form.eventTitle,
          eventDate: form.eventDate,
          noticeDate: form.noticeDate,
          eotDaysClaimed: form.impactDays,
          costClaimedVnd: costClaimed,
          evidences: [
            {
              evidenceType: "daily_diary",
              referenceCode: "LOG-2026-08-01",
              description: "Mặt bằng chưa bàn giao",
            },
          ],
        }),
      });

      if (res.ok) {
        await fetchClaims();
      }
    } catch {
      // Ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyDossier = () => {
    if (!dossierPreview) return;
    navigator.clipboard.writeText(dossierPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <EngineeringNav />

        {/* Tiêu đề */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              AI FIDIC Contract Dispute & Delay Defense Dossier Generator (M79)
            </h1>
            <p className="text-xs text-zinc-400">
              Tự động hóa lập hồ sơ khiếu nại gia hạn tiến độ (EOT) & Bồi thường chi phí kéo dài dự
              án theo chuẩn FIDIC Red/Yellow Book
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Cột Trái: Form Thiết Lập Sự Kiện Khiếu Nại (5 Cột) */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-violet-400">
                <Scale size={16} />
                <h3 className="text-xs font-semibold">Thông Tin Sự Kiện Chậm Trễ</h3>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-[10px] text-zinc-500">Mã hồ sơ khiếu nại</label>
                  <input
                    type="text"
                    value={form.claimCode}
                    onChange={(e) => setForm((p) => ({ ...p, claimCode: e.target.value }))}
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500">Mẫu Hợp Đồng Áp Dụng</label>
                  <select
                    value={form.contractType}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, contractType: e.target.value as any }))
                    }
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="FIDIC_RED_1999">FIDIC Red Book 1999 (Xây Dựng)</option>
                    <option value="FIDIC_YELLOW_1999">
                      FIDIC Yellow Book 1999 (Thiết Kế & Thi Công)
                    </option>
                    <option value="FIDIC_RED_2017">FIDIC Red Book 2017</option>
                    <option value="FIDIC_YELLOW_2017">FIDIC Yellow Book 2017</option>
                    <option value="VIETNAM_STANDARD">Hợp Đồng Mẫu Bộ Xây Dựng (TT09/2016)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500">Nguyên nhân / Loại sự kiện</label>
                  <select
                    value={form.eventType}
                    onChange={(e) => setForm((p) => ({ ...p, eventType: e.target.value as any }))}
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="ACCESS_DELAY">Chậm bàn giao mặt bằng (Clause 2.1)</option>
                    <option value="DRAWING_DELAY">
                      Chậm bản vẽ / chỉ dẫn kỹ thuật (Clause 1.9)
                    </option>
                    <option value="UNFORESEEABLE_CONDITIONS">
                      Địa chất ngầm không lường trước (Clause 4.12)
                    </option>
                    <option value="ADVERSE_WEATHER">
                      Thời tiết bất lợi đặc biệt (Clause 8.4c)
                    </option>
                    <option value="EMPLOYER_VARIATION">
                      Lệnh thay đổi / phát sinh thiết kế (Clause 13.3)
                    </option>
                    <option value="FORCE_MAJEURE">
                      Sự kiện bất khả kháng (Clause 19.1 / 18.1)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500">Tiêu đề diễn giải sự kiện</label>
                  <input
                    type="text"
                    value={form.eventTitle}
                    onChange={(e) => setForm((p) => ({ ...p, eventTitle: e.target.value }))}
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500">Ngày phát sinh sự kiện</label>
                    <input
                      type="date"
                      value={form.eventDate}
                      onChange={(e) => setForm((p) => ({ ...p, eventDate: e.target.value }))}
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Ngày nộp thông báo (Notice)</label>
                    <input
                      type="date"
                      value={form.noticeDate}
                      onChange={(e) => setForm((p) => ({ ...p, noticeDate: e.target.value }))}
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500">
                      Số ngày trễ đường găng (TIA)
                    </label>
                    <input
                      type="number"
                      value={form.impactDays}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, impactDays: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">
                      Định mức Overhead (VND/ngày)
                    </label>
                    <input
                      type="number"
                      value={form.dailyOverheadVnd}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, dailyOverheadVnd: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleGeneratePreview}
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-violet-600 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  Phân Tích & Sinh Bản Thảo EOT
                </button>
                <button
                  type="button"
                  onClick={handleSaveClaim}
                  disabled={submitting}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-on-accent hover:bg-emerald-500 disabled:opacity-50"
                >
                  Lưu Hồ Sơ
                </button>
              </div>
            </div>

            {/* Thẻ Cảnh Báo Time-Bar Sentinel */}
            {analysisResult?.compliance && (
              <div
                className={`rounded-xl border p-3.5 text-xs space-y-1 ${
                  analysisResult.compliance.isCompliant
                    ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-300"
                    : "border-rose-700/60 bg-rose-950/20 text-rose-300"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  {analysisResult.compliance.isCompliant ? (
                    <ShieldCheck size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  <span>Sub-Clause 20.1 28-Day Notice Compliance</span>
                </div>
                <p className="text-[11px] opacity-90">{analysisResult.compliance.warningMessage}</p>
              </div>
            )}
          </div>

          {/* Cột Phải: Xem Bản Thảo Hồ Sơ Khiếu Nại FIDIC Hoàn Chỉnh (7 Cột) */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex h-[560px] flex-col rounded-xl border border-zinc-800 bg-zinc-900/80 shadow-lg">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-violet-400" />
                  <span className="text-xs font-bold text-zinc-200">
                    Bản Thảo Hồ Sơ Khiếu Nại FIDIC EOT (Claim Dossier)
                  </span>
                </div>
                <button
                  onClick={handleCopyDossier}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  {copied ? "Đã copy" : "Copy Văn Bản"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap selection:bg-violet-900 selection:text-white">
                {dossierPreview || (
                  <p className="text-zinc-600 italic">
                    Nhập thông tin sự kiện bên trái và nhấn &ldquo;Phân Tích & Sinh Bản Thảo
                    EOT&rdquo; để tự động tạo hồ sơ khiếu nại...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
