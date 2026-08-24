"use client";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Check,
  X,
  FileCheck,
  Search,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

type DataQualityIssue = {
  id: string;
  projectId: number;
  entityType: string;
  entityId: string;
  issueRule: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  status: "open" | "investigating" | "resolved" | "ignored";
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
  resolutionNote: string | null;
};

const SEVERITY_LABEL: Record<DataQualityIssue["severity"], string> = {
  critical: "Nghiêm trọng",
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
  info: "Thông tin",
};

const SEVERITY_CLS: Record<DataQualityIssue["severity"], string> = {
  critical: "bg-red-950/50 text-red-300 border-red-800",
  high: "bg-amber-950/40 text-amber-300 border-amber-800",
  medium: "bg-yellow-950/40 text-yellow-300 border-yellow-800",
  low: "bg-blue-950/40 text-blue-300 border-blue-800",
  info: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const STATUS_LABEL: Record<DataQualityIssue["status"], string> = {
  open: "Đang mở",
  investigating: "Đang điều tra",
  resolved: "Đã xử lý",
  ignored: "Bỏ qua",
};

const STATUS_CLS: Record<DataQualityIssue["status"], string> = {
  open: "bg-amber-950/40 text-amber-300 border-amber-800",
  investigating: "bg-sky-950/40 text-sky-300 border-sky-800",
  resolved: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
  ignored: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

export default function DataQualityPage() {
  const [issues, setIssues] = useState<DataQualityIssue[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");

  const [selectedIssue, setSelectedIssue] = useState<DataQualityIssue | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);

  function load() {
    setLoading(true);
    const sp = new URLSearchParams();
    if (severityFilter) sp.set("severity", severityFilter);
    if (statusFilter) sp.set("status", statusFilter);

    fetch(`/api/engineering/data-quality?${sp.toString()}`)
      .then(async (r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.json();
      })
      .then((j) => j && setIssues(j.issues))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severityFilter, statusFilter]);

  async function handleResolve() {
    if (!selectedIssue || !resolveNote.trim()) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/engineering/data-quality/${selectedIssue.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: resolveNote.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Xử lý vấn đề thất bại");
        return;
      }
      setSelectedIssue(null);
      setResolveNote("");
      load();
    } catch {
      alert("Mất kết nối — vui lòng thử lại sau");
    } finally {
      setResolving(false);
    }
  }

  // Count stats
  const criticalCount =
    issues?.filter((i) => i.severity === "critical" && i.status === "open").length ?? 0;
  const highCount = issues?.filter((i) => i.severity === "high" && i.status === "open").length ?? 0;
  const totalOpen = issues?.filter((i) => i.status === "open").length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Chất lượng dữ liệu kỹ thuật" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <EngineeringNav />

        {/* KPI Cards Banner */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-xs text-zinc-400">Vấn đề đang mở</div>
            <div className="mt-1 text-2xl font-bold text-amber-400">{totalOpen}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-xs text-zinc-400">Nghiêm trọng (Critical)</div>
            <div className="mt-1 text-2xl font-bold text-rose-400">{criticalCount}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-xs text-zinc-400">Mức cao (High)</div>
            <div className="mt-1 text-2xl font-bold text-yellow-400">{highCount}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-xs text-zinc-400">Trạng thái kiểm toán</div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
              <CheckCircle2 size={16} /> Đạt chuẩn OS-1
            </div>
          </div>
        </div>

        {/* Filters and Scan Action */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="dq-severity" className="mb-1 block text-xs text-zinc-400">
                Mức độ nghiêm trọng
              </label>
              <select
                id="dq-severity"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
              >
                <option value="">Tất cả mức độ</option>
                <option value="critical">Nghiêm trọng (Critical)</option>
                <option value="high">Cao (High)</option>
                <option value="medium">Trung bình (Medium)</option>
                <option value="low">Thấp (Low)</option>
              </select>
            </div>

            <div>
              <label htmlFor="dq-status" className="mb-1 block text-xs text-zinc-400">
                Trạng thái
              </label>
              <select
                id="dq-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="open">Đang mở (Open)</option>
                <option value="resolved">Đã xử lý (Resolved)</option>
                <option value="ignored">Bỏ qua</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Quét lại dữ liệu</span>
          </button>
        </div>

        {/* Issue Table */}
        {loading ? (
          <PageSkeleton />
        ) : !issues || issues.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Dữ liệu kỹ thuật sạch & hợp lệ"
            message="Không phát hiện đối tượng mồ côi (orphan objects), đề xuất thiếu bằng chứng (missing evidence) hoặc bất thường phân cấp trong dự án."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Mức độ</th>
                  <th className="px-4 py-3">Quy tắc kiểm tra</th>
                  <th className="px-4 py-3">Mô tả vấn đề</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Phát hiện lúc</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {issues.map((iss) => (
                  <tr key={iss.id} className="hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          SEVERITY_CLS[iss.severity]
                        }`}
                      >
                        {SEVERITY_LABEL[iss.severity]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-sky-400">{iss.issueRule}</td>
                    <td className="max-w-md px-4 py-3 text-xs text-zinc-200">
                      {iss.description}
                      {iss.resolutionNote && (
                        <div className="mt-1 text-[11px] text-emerald-400">
                          ✓ Ghi chú xử lý: {iss.resolutionNote}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          STATUS_CLS[iss.status]
                        }`}
                      >
                        {STATUS_LABEL[iss.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {new Date(iss.detectedAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {iss.status === "open" && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIssue(iss);
                            setResolveNote("");
                          }}
                          className="rounded-lg bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                        >
                          Xử lý
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Resolve */}
        {selectedIssue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-zinc-100">
                  Xử lý vấn đề chất lượng dữ liệu
                </h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    SEVERITY_CLS[selectedIssue.severity]
                  }`}
                >
                  {SEVERITY_LABEL[selectedIssue.severity]}
                </span>
              </div>

              <p className="mb-3 text-xs text-zinc-300">{selectedIssue.description}</p>

              <div className="mb-4">
                <label htmlFor="resolve-note" className="mb-1 block text-xs text-zinc-400">
                  Ghi chú giải quyết / bằng chứng xử lý (bắt buộc)
                </label>
                <textarea
                  id="resolve-note"
                  rows={3}
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="Nêu rõ lý do, mã bản vẽ bổ sung hoặc quyết định kỹ thuật..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIssue(null)}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={resolving || !resolveNote.trim()}
                  onClick={handleResolve}
                  className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-emerald-600 disabled:opacity-50"
                >
                  <Check size={14} />
                  <span>{resolving ? "Đang lưu..." : "Xác nhận đã giải quyết"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
