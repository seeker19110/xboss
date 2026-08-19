"use client";
import { useEffect, useState } from "react";
import { Lightbulb, HelpCircle, AlertTriangle } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

// ENG-2 — trang đề xuất kỹ thuật (docs/nang-cap/ENG-2-engineering-intelligence.md mục 5).
// Điểm quan trọng nhất của UI này: hiển thị evidence TÁCH BẠCH theo 4 loại (§4) để người
// đọc phân biệt được đâu là sự thật đo được, đâu là suy luận/giả định của máy.

type Suggestion = {
  id: string;
  suggestionClass: string;
  title: string;
  body: string | null;
  priority: string;
  severity: string;
  confidence: "high" | "medium" | "low" | "unknown";
  confidenceSignals: Record<string, unknown>;
  status: string;
  decisionNote: string | null;
  createdAt: string;
};
type Evidence = {
  id: string;
  kind: "fact" | "inference" | "assumption" | "recommendation";
  statement: string;
  locator: string | null;
  standardRef: string | null;
};
type Detail = { suggestion: Suggestion; evidence: Evidence[] };

const PRIORITY_LABEL: Record<string, string> = {
  critical_safety: "An toàn / Toàn vẹn",
  regulatory: "Pháp lý / Hợp đồng",
  high_impact: "Chi phí / Tác động lớn",
  design_coordination: "Thiết kế & Phối hợp",
  quality: "Chất lượng",
  optimization: "Tối ưu hoá",
  cosmetic: "Hình thức",
};
const PRIORITY_CLS: Record<string, string> = {
  critical_safety: "bg-red-950/50 text-red-300 border-red-800",
  regulatory: "bg-orange-950/40 text-orange-300 border-orange-800",
  high_impact: "bg-amber-950/40 text-amber-300 border-amber-800",
  design_coordination: "bg-sky-950/40 text-sky-300 border-sky-800",
  quality: "bg-violet-950/40 text-violet-300 border-violet-800",
  optimization: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
  cosmetic: "bg-zinc-800 text-zinc-300 border-zinc-700",
};
const CLASS_LABEL: Record<string, string> = {
  design: "Thiết kế",
  drawing: "Bản vẽ",
  mep: "MEP",
  compliance: "Tuân thủ",
  quantity_cost: "Khối lượng & Chi phí",
  constructability: "Khả thi thi công",
  risk: "Rủi ro",
  change_impact: "Ảnh hưởng thay đổi",
};
const CONFIDENCE_LABEL: Record<string, string> = {
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
  unknown: "Chưa đủ cơ sở",
};
const CONFIDENCE_CLS: Record<string, string> = {
  high: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
  medium: "bg-amber-950/40 text-amber-300 border-amber-800",
  low: "bg-rose-950/40 text-rose-300 border-rose-800",
  unknown: "bg-zinc-800 text-zinc-400 border-zinc-700",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Đang mở",
  needs_review: "Cần rà lại",
  accepted: "Đã chấp nhận",
  rejected: "Đã từ chối",
  modified: "Đã điều chỉnh",
  deferred: "Tạm hoãn",
  false_positive: "Báo nhầm",
};
// §4 — 4 loại evidence, nhãn tiếng Việt rõ ràng để người đọc không nhầm suy luận với sự thật.
const EVIDENCE_GROUPS: { kind: Evidence["kind"]; label: string; hint: string }[] = [
  { kind: "fact", label: "Sự thật", hint: "Đo/đọc được trực tiếp từ nguồn" },
  { kind: "inference", label: "Suy luận", hint: "Rút ra từ sự thật, có thể sai" },
  { kind: "assumption", label: "Giả định", hint: "Điều kiện được coi là đúng khi phân tích" },
  { kind: "recommendation", label: "Khuyến nghị", hint: "Hành động đề xuất, cần người quyết định" },
];
const DECISIONS: { value: string; label: string; cls: string }[] = [
  {
    value: "accepted",
    label: "Chấp nhận",
    cls: "bg-emerald-700 hover:bg-emerald-600 text-on-accent",
  },
  { value: "modified", label: "Điều chỉnh", cls: "bg-sky-800 hover:bg-sky-700 text-on-accent" },
  { value: "deferred", label: "Tạm hoãn", cls: "bg-zinc-700 hover:bg-zinc-600 text-zinc-100" },
  { value: "rejected", label: "Từ chối", cls: "bg-rose-800 hover:bg-rose-700 text-on-accent" },
  {
    value: "false_positive",
    label: "Báo nhầm",
    cls: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300",
  },
];

export default function SuggestionsPage() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [classFilter, setClassFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [canDecide, setCanDecide] = useState(false);

  function load() {
    setLoading(true);
    const sp = new URLSearchParams();
    if (statusFilter) sp.set("status", statusFilter);
    if (classFilter) sp.set("class", classFilter);
    if (priorityFilter) sp.set("priority", priorityFilter);
    fetch(`/api/engineering/suggestions?${sp.toString()}`)
      .then(async (r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.json();
      })
      .then((j) => j && setItems(j.suggestions))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, classFilter, priorityFilter]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setCanDecide(j?.user?.role === "admin" || j?.user?.role === "pm"))
      .catch(() => setCanDecide(false));
  }, []);

  function openDetail(id: string) {
    setSelectedId(id);
    setNote("");
    setDetailLoading(true);
    fetch(`/api/engineering/suggestions/${id}`)
      .then((r) => r.json())
      .then((j) => setDetail(j))
      .finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
  }

  async function decide(decision: string) {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/engineering/suggestions/${selectedId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Ghi quyết định thất bại");
        return;
      }
      closeDetail();
      load();
    } catch {
      alert("Mất mạng — thử lại sau");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Đề xuất kỹ thuật (AI)" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <EngineeringNav />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="sug-status" className="mb-1 block text-xs text-zinc-400">
              Trạng thái
            </label>
            <select
              id="sug-status"
              aria-label="Lọc theo trạng thái đề xuất"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm"
            >
              <option value="">Tất cả</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sug-class" className="mb-1 block text-xs text-zinc-400">
              Lớp đề xuất
            </label>
            <select
              id="sug-class"
              aria-label="Lọc theo lớp đề xuất"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm"
            >
              <option value="">Tất cả</option>
              {Object.entries(CLASS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sug-priority" className="mb-1 block text-xs text-zinc-400">
              Ưu tiên
            </label>
            <select
              id="sug-priority"
              aria-label="Lọc theo mức ưu tiên"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm"
            >
              <option value="">Tất cả</option>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : !items || items.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="Chưa có đề xuất kỹ thuật nào"
            message="Hệ thống phân tích kỹ thuật bên ngoài sẽ đẩy đề xuất vào đây qua API key scope engineering."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Ưu tiên</th>
                  <th className="px-3 py-2 text-left">Lớp</th>
                  <th className="px-3 py-2 text-left">Tiêu đề</th>
                  <th className="px-3 py-2 text-left">Độ tin cậy</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => openDetail(s.id)}
                    className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${PRIORITY_CLS[s.priority] ?? PRIORITY_CLS.cosmetic}`}
                      >
                        {PRIORITY_LABEL[s.priority] ?? s.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {CLASS_LABEL[s.suggestionClass] ?? s.suggestionClass}
                    </td>
                    <td className="px-3 py-2">{s.title}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${CONFIDENCE_CLS[s.confidence]}`}
                      >
                        {s.confidence === "unknown" && <HelpCircle size={11} aria-hidden="true" />}
                        {CONFIDENCE_LABEL[s.confidence]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {STATUS_LABEL[s.status] ?? s.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            {detailLoading || !detail ? (
              <PageSkeleton />
            ) : (
              <>
                {detail.suggestion.status === "needs_review" && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-xs text-amber-200">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      Đề xuất này thiếu bằng chứng loại <strong>Sự thật</strong>, hoặc là cảnh báo
                      an toàn/pháp lý chưa đủ cơ sở đo được — cần rà lại trước khi dùng.
                    </span>
                  </div>
                )}

                <h2 className="mb-1 text-base font-semibold text-zinc-100">
                  {detail.suggestion.title}
                </h2>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded-full border px-2 py-0.5 ${PRIORITY_CLS[detail.suggestion.priority] ?? PRIORITY_CLS.cosmetic}`}
                  >
                    {PRIORITY_LABEL[detail.suggestion.priority] ?? detail.suggestion.priority}
                  </span>
                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-zinc-300">
                    {CLASS_LABEL[detail.suggestion.suggestionClass] ??
                      detail.suggestion.suggestionClass}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${CONFIDENCE_CLS[detail.suggestion.confidence]}`}
                  >
                    {detail.suggestion.confidence === "unknown" && (
                      <HelpCircle size={11} aria-hidden="true" />
                    )}
                    Độ tin cậy: {CONFIDENCE_LABEL[detail.suggestion.confidence]}
                  </span>
                </div>

                {detail.suggestion.body && (
                  <p className="mb-4 whitespace-pre-wrap text-sm text-zinc-300">
                    {detail.suggestion.body}
                  </p>
                )}

                {EVIDENCE_GROUPS.map((g) => {
                  const rows = detail.evidence.filter((e) => e.kind === g.kind);
                  if (rows.length === 0) return null;
                  return (
                    <div key={g.kind} className="mb-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        {g.label}{" "}
                        <span className="font-normal normal-case tracking-normal text-zinc-500">
                          — {g.hint}
                        </span>
                      </p>
                      <ul className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                        {rows.map((e) => (
                          <li key={e.id}>
                            {e.statement}
                            {(e.locator || e.standardRef) && (
                              <span className="ml-1 text-xs text-zinc-500">
                                ({[e.standardRef, e.locator].filter(Boolean).join(" · ")})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                {Object.keys(detail.suggestion.confidenceSignals ?? {}).length > 0 && (
                  <div className="mb-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Cơ sở tính độ tin cậy
                    </p>
                    <pre className="max-h-32 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-300">
                      {JSON.stringify(detail.suggestion.confidenceSignals, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="border-t border-zinc-800 pt-3">
                  {canDecide ? (
                    <>
                      <label htmlFor="sug-note" className="mb-1 block text-xs text-zinc-400">
                        Ghi chú (tuỳ chọn)
                      </label>
                      <textarea
                        id="sug-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeDetail}
                          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                        >
                          Đóng
                        </button>
                        {DECISIONS.map((d) => (
                          <button
                            key={d.value}
                            type="button"
                            disabled={submitting}
                            onClick={() => decide(d.value)}
                            className={`rounded-lg px-3 py-1.5 text-sm disabled:opacity-50 ${d.cls}`}
                          >
                            {submitting ? "Đang lưu..." : d.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-500">
                        Chỉ Admin/PM được ghi quyết định cho đề xuất.
                      </p>
                      <button
                        type="button"
                        onClick={closeDetail}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                      >
                        Đóng
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
