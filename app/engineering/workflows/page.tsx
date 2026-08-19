"use client";
import { useEffect, useState } from "react";
import { Workflow, ShieldAlert, Check, X } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

// ENG-3 — trang workflow kỹ thuật (docs/nang-cap/ENG-3-engineering-workflow-os.md mục 5).
// Điểm nhấn UI: hiển thị kết quả Gate 0 dạng checklist (vì sao bị chặn) + từng gate ai ký,
// để người dùng thấy rõ quyết định đi qua những cửa nào — không phải "một nút duyệt".

type WorkflowRow = {
  id: string;
  title: string;
  profile: string;
  riskClass: string;
  state: string;
  reversible: boolean;
  createdAt: string;
};
type Gate = {
  id: string;
  seq: number;
  gateType: string;
  requiredRole: string;
  decision: string | null;
  decidedBy: number | null;
  decidedAt: string | null;
  comments: string | null;
};
type Ev = {
  id: string;
  fromState: string | null;
  toState: string;
  reason: string | null;
  createdAt: string;
};
type Gate0 = { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] };
type Detail = {
  workflow: WorkflowRow & {
    description: string | null;
    rollbackStrategy: string | null;
    gate0Result: Gate0;
  };
  gates: Gate[];
  events: Ev[];
};

const STATE_LABEL: Record<string, string> = {
  draft: "Nháp",
  validating: "Đang kiểm tự động",
  awaiting_approval: "Chờ duyệt",
  approved: "Đã duyệt",
  executing: "Đang thực hiện",
  validating_result: "Đang kiểm kết quả",
  completed: "Hoàn thành",
  rejected: "Bị từ chối",
  cancelled: "Đã huỷ",
  blocked: "Bị chặn",
  failed: "Thất bại",
  rolled_back: "Đã hoàn tác",
  superseded: "Bị thay thế",
};
const STATE_CLS: Record<string, string> = {
  draft: "bg-zinc-800 text-zinc-300 border-zinc-700",
  validating: "bg-sky-950/40 text-sky-300 border-sky-800",
  awaiting_approval: "bg-amber-950/40 text-amber-300 border-amber-800",
  approved: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
  executing: "bg-violet-950/40 text-violet-300 border-violet-800",
  validating_result: "bg-sky-950/40 text-sky-300 border-sky-800",
  completed: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
  rejected: "bg-rose-950/40 text-rose-300 border-rose-800",
  cancelled: "bg-zinc-900 text-zinc-500 border-zinc-800",
  blocked: "bg-rose-950/40 text-rose-300 border-rose-800",
  failed: "bg-rose-950/40 text-rose-300 border-rose-800",
  rolled_back: "bg-zinc-800 text-zinc-300 border-zinc-700",
  superseded: "bg-zinc-900 text-zinc-500 border-zinc-800",
};
const RISK_LABEL: Record<string, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  critical: "Nghiêm trọng",
};
const RISK_CLS: Record<string, string> = {
  low: "bg-zinc-800 text-zinc-300 border-zinc-700",
  medium: "bg-amber-950/40 text-amber-300 border-amber-800",
  high: "bg-orange-950/40 text-orange-300 border-orange-800",
  critical: "bg-red-950/50 text-red-300 border-red-800",
};
const GATE_LABEL: Record<string, string> = {
  technical_review: "Rà soát kỹ thuật",
  discipline_qa: "Rà soát chuyên ngành / QA",
  independent_qa: "QA độc lập",
  authority_release: "Thẩm quyền phát hành",
};
const PROFILE_HINT: Record<string, string> = {
  A: "Chỉ Gate 0 — không có tác động",
  B: "1 cửa duyệt",
  C: "2 cửa duyệt",
  D: "3 cửa duyệt (có thẩm quyền phát hành)",
  E: "4 cửa duyệt (an toàn / quy chuẩn)",
};

export default function WorkflowsPage() {
  const [items, setItems] = useState<WorkflowRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState("");

  function load() {
    setLoading(true);
    const sp = new URLSearchParams();
    if (stateFilter) sp.set("state", stateFilter);
    fetch(`/api/engineering/workflows?${sp.toString()}`)
      .then(async (r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.json();
      })
      .then((j) => j && setItems(j.workflows))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter]);

  function openDetail(id: string) {
    setSelectedId(id);
    setComments("");
    setDetailLoading(true);
    fetch(`/api/engineering/workflows/${id}`)
      .then((r) => r.json())
      .then((j) => setDetail(j))
      .finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
  }

  async function post(url: string, body?: unknown) {
    setSubmitting(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Thao tác thất bại");
        return false;
      }
      return true;
    } catch {
      alert("Mất mạng — thử lại sau");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function submitWf(id: string) {
    if (await post(`/api/engineering/workflows/${id}/submit`)) {
      openDetail(id);
      load();
    }
  }

  async function signGate(id: string, seq: number, decision: "approved" | "rejected") {
    if (await post(`/api/engineering/workflows/${id}/gates/${seq}`, { decision, comments })) {
      setComments("");
      openDetail(id);
      load();
    }
  }

  const wf = detail?.workflow;
  const nextGate = detail?.gates.find((g) => !g.decision);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Workflow kỹ thuật" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <EngineeringNav />
        <div className="mb-4">
          <label htmlFor="wf-state" className="mb-1 block text-xs text-zinc-400">
            Trạng thái
          </label>
          <select
            id="wf-state"
            aria-label="Lọc theo trạng thái workflow"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm"
          >
            <option value="">Tất cả</option>
            {Object.entries(STATE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : !items || items.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="Chưa có workflow kỹ thuật nào"
            message="Workflow được tạo từ đề xuất kỹ thuật đã chấp nhận, hoặc tạo trực tiếp qua API."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Tiêu đề</th>
                  <th className="px-3 py-2 text-left">Profile</th>
                  <th className="px-3 py-2 text-left">Rủi ro</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                  <th className="px-3 py-2 text-left">Hoàn tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr
                    key={w.id}
                    onClick={() => openDetail(w.id)}
                    className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2">{w.title}</td>
                    <td className="px-3 py-2 text-zinc-400" title={PROFILE_HINT[w.profile]}>
                      {w.profile}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${RISK_CLS[w.riskClass]}`}
                      >
                        {(w.riskClass === "high" || w.riskClass === "critical") && (
                          <ShieldAlert size={11} aria-hidden="true" />
                        )}
                        {RISK_LABEL[w.riskClass]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${STATE_CLS[w.state]}`}
                      >
                        {STATE_LABEL[w.state]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {w.reversible ? "Có" : "Không"}
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
            {detailLoading || !wf ? (
              <PageSkeleton />
            ) : (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-zinc-100">{wf.title}</h2>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATE_CLS[wf.state]}`}
                  >
                    {STATE_LABEL[wf.state]}
                  </span>
                </div>
                <p className="mb-3 text-xs text-zinc-400">
                  Profile {wf.profile} ({PROFILE_HINT[wf.profile]}) · Rủi ro:{" "}
                  {RISK_LABEL[wf.riskClass]} · Hoàn tác: {wf.reversible ? "Có" : "Không"}
                </p>
                {wf.description && (
                  <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-300">{wf.description}</p>
                )}
                {!wf.reversible && wf.rollbackStrategy && (
                  <div className="mb-3 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-xs text-amber-200">
                    <strong>Không thể hoàn tác tự động.</strong> Phương án xử lý:{" "}
                    {wf.rollbackStrategy}
                  </div>
                )}

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Gate 0 — kiểm tự động
                </p>
                <ul className="mb-3 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                  {(wf.gate0Result?.checks ?? []).map((c) => (
                    <li key={c.name} className="flex items-start gap-2">
                      {c.ok ? (
                        <Check
                          size={12}
                          className="mt-0.5 shrink-0 text-emerald-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <X size={12} className="mt-0.5 shrink-0 text-rose-400" aria-hidden="true" />
                      )}
                      <span className={c.ok ? "text-zinc-300" : "text-rose-300"}>
                        {c.name}
                        {c.detail && <span className="text-zinc-500"> — {c.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>

                {detail.gates.length > 0 && (
                  <>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Các cửa duyệt
                    </p>
                    <ul className="mb-3 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                      {detail.gates.map((g) => (
                        <li key={g.id} className="flex flex-wrap items-center gap-2">
                          <span className="text-zinc-300">
                            {g.seq}. {GATE_LABEL[g.gateType] ?? g.gateType}
                          </span>
                          <span className="text-zinc-500">(vai trò: {g.requiredRole})</span>
                          {g.decision === "approved" && (
                            <span className="text-emerald-400">✓ đã duyệt</span>
                          )}
                          {g.decision === "rejected" && (
                            <span className="text-rose-400">✕ từ chối</span>
                          )}
                          {!g.decision && <span className="text-zinc-500">— chờ</span>}
                          {g.comments && <span className="text-zinc-500">“{g.comments}”</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Dòng thời gian
                </p>
                <ul className="mb-4 space-y-1 text-xs text-zinc-400">
                  {detail.events.map((e) => (
                    <li key={e.id}>
                      {e.fromState ? `${STATE_LABEL[e.fromState] ?? e.fromState} → ` : ""}
                      {STATE_LABEL[e.toState] ?? e.toState}
                      {e.reason && ` — ${e.reason}`}{" "}
                      <span className="text-zinc-600">
                        ({new Date(e.createdAt).toLocaleString("vi-VN")})
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-zinc-800 pt-3">
                  {wf.state === "awaiting_approval" && nextGate && (
                    <>
                      <label htmlFor="wf-comments" className="mb-1 block text-xs text-zinc-400">
                        Nhận xét cho cửa “{GATE_LABEL[nextGate.gateType] ?? nextGate.gateType}”
                      </label>
                      <textarea
                        id="wf-comments"
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        rows={2}
                        className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                    </>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeDetail}
                      className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                    >
                      Đóng
                    </button>
                    {wf.state === "draft" && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => submitWf(wf.id)}
                        className="rounded-lg bg-sky-800 px-3 py-1.5 text-sm text-on-accent hover:bg-sky-700 disabled:opacity-50"
                      >
                        {submitting ? "Đang gửi..." : "Trình duyệt"}
                      </button>
                    )}
                    {wf.state === "awaiting_approval" && nextGate && (
                      <>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => signGate(wf.id, nextGate.seq, "rejected")}
                          className="rounded-lg bg-rose-800 px-3 py-1.5 text-sm text-on-accent hover:bg-rose-700 disabled:opacity-50"
                        >
                          Từ chối
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => signGate(wf.id, nextGate.seq, "approved")}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-on-accent hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {submitting ? "Đang lưu..." : `Duyệt cửa ${nextGate.seq}`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
