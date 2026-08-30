"use client";
import { useEffect, useState } from "react";
import { Network, Info } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

// ENG-4 — trang phiên phối hợp đa agent (docs/nang-cap/ENG-4-multi-agent-engineering-os.md
// mục 5). Hai điểm phải làm rõ trên UI:
//  1. "Chưa đồng thuận" là KẾT QUẢ HỢP LỆ, không tô như lỗi hệ thống (§22).
//  2. Kế hoạch đã hoà giải CHƯA có hiệu lực thi hành — phải qua workflow ENG-3 (§26).

type Session = {
  id: string;
  intent: string;
  consensus: string;
  status: string;
  maxRounds: number;
  roundCount: number;
  workflowId: string | null;
  createdAt: string;
};
type Claim = {
  id: string;
  agentRole: string;
  agentName: string;
  topic: string;
  claim: string;
  confidence: string;
  sourceAuthority: string;
};
type Conflict = {
  id: string;
  topic: string;
  conflictType: string;
  stage: string;
  resolution: string | null;
  resolutionMethod: string | null;
  proposal: { method: string; rationale: string; needsHuman: boolean };
};
type Detail = { session: Session; claims: Claim[]; conflicts: Conflict[] };

const CONSENSUS_LABEL: Record<string, string> = {
  pending: "Chưa xét",
  consensus_confirmed: "Đồng thuận",
  consensus_with_risk: "Đồng thuận có rủi ro",
  partial_agreement: "Đồng thuận một phần",
  conflict_requires_review: "Xung đột cần xem xét",
  no_consensus: "Chưa đồng thuận (hợp lệ)",
};
const CONSENSUS_CLS: Record<string, string> = {
  pending: "bg-zinc-800 text-zinc-300 border-zinc-700",
  consensus_confirmed: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
  consensus_with_risk: "bg-amber-950/40 text-amber-300 border-amber-800",
  partial_agreement: "bg-sky-950/40 text-sky-300 border-sky-800",
  conflict_requires_review: "bg-orange-950/40 text-orange-300 border-orange-800",
  // Cố ý KHÔNG tô đỏ: no_consensus là kết quả hợp lệ, không phải sự cố.
  no_consensus: "bg-zinc-800 text-zinc-300 border-zinc-700",
};
const CONFLICT_LABEL: Record<string, string> = {
  data: "Dữ liệu",
  interpretation: "Diễn giải",
  constraint: "Ràng buộc",
  execution: "Thực thi",
  scope: "Phạm vi",
};
const METHOD_LABEL: Record<string, string> = {
  source_authority: "Theo thẩm quyền nguồn",
  evidence_comparison: "So sánh bằng chứng",
  constraint_hierarchy: "Theo thứ bậc ràng buộc",
  independent_verification: "Kiểm chứng độc lập",
  human_authority: "Người có thẩm quyền quyết",
  preference_vote: "Bỏ phiếu ưu tiên (rủi ro thấp)",
};
const ROLE_LABEL: Record<string, string> = {
  planner: "Điều phối",
  specialist: "Chuyên môn",
  verifier: "Kiểm chứng",
  critic: "Phản biện",
  reconciler: "Hoà giải",
  executor: "Thực thi",
};

export default function AgentSessionsPage() {
  const [items, setItems] = useState<Session[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [canResolve, setCanResolve] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/engineering/agent-sessions")
      .then(async (r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.json();
      })
      .then((j) => j && setItems(j.sessions))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setCanResolve(j?.user?.role === "admin" || j?.user?.role === "pm"))
      .catch(() => setCanResolve(false));
  }, []);

  function openDetail(id: string) {
    setSelectedId(id);
    setResolution("");
    setDetailLoading(true);
    fetch(`/api/engineering/agent-sessions/${id}`)
      .then((r) => r.json())
      .then((j) => setDetail(j))
      .finally(() => setDetailLoading(false));
  }

  async function resolve(conflictId: string, method: string) {
    if (!selectedId || !resolution.trim()) {
      alert("Nhập nội dung kết luận trước khi chốt");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/engineering/agent-sessions/${selectedId}/conflicts/${conflictId}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution, method }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Chốt xung đột thất bại");
        return;
      }
      setResolution("");
      openDetail(selectedId);
      load();
    } catch {
      alert("Mất mạng — thử lại sau");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Phiên phối hợp agent" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <EngineeringNav />
        {loading ? (
          <PageSkeleton />
        ) : !items || items.length === 0 ? (
          <EmptyState
            icon={Network}
            title="Chưa có phiên phối hợp nào"
            message="Hệ thống agent kỹ thuật bên ngoài mở phiên qua API key scope engineering."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Mục tiêu</th>
                  <th className="px-3 py-2 text-left">Mức đồng thuận</th>
                  <th className="px-3 py-2 text-left">Vòng</th>
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
                    <td className="px-3 py-2">{s.intent}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${CONSENSUS_CLS[s.consensus]}`}
                      >
                        {CONSENSUS_LABEL[s.consensus] ?? s.consensus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {s.roundCount}/{s.maxRounds}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {s.status === "closed" ? "Đã đóng" : "Đang mở"}
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
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            {detailLoading || !detail ? (
              <PageSkeleton />
            ) : (
              <>
                <h2 className="mb-1 text-base font-semibold text-zinc-100">
                  {detail.session.intent}
                </h2>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-full border px-2 py-0.5 ${CONSENSUS_CLS[detail.session.consensus]}`}
                  >
                    {CONSENSUS_LABEL[detail.session.consensus]}
                  </span>
                  <span className="text-zinc-400">
                    Vòng {detail.session.roundCount}/{detail.session.maxRounds}
                  </span>
                </div>

                <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-900 bg-sky-950/30 p-3 text-xs text-sky-200">
                  <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Kết quả phiên này là <strong>kế hoạch đã hoà giải</strong> — chưa có hiệu lực
                    thi hành. Muốn tác động thật, phải tạo workflow kỹ thuật và đi qua các cửa
                    duyệt.
                  </span>
                </div>

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Phát biểu của các agent
                </p>
                <ul className="mb-4 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                  {detail.claims.map((c) => (
                    <li key={c.id} className="text-zinc-300">
                      <span className="text-zinc-500">
                        [{ROLE_LABEL[c.agentRole] ?? c.agentRole} · {c.agentName}]
                      </span>{" "}
                      <span className="text-zinc-500">({c.topic})</span> {c.claim}{" "}
                      <span className="text-zinc-600">
                        — tin cậy: {c.confidence}, nguồn: {c.sourceAuthority}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Xung đột
                </p>
                {detail.conflicts.length === 0 ? (
                  <p className="mb-4 text-sm text-zinc-400">Không có xung đột nào.</p>
                ) : (
                  <ul className="mb-4 space-y-3">
                    {detail.conflicts.map((c) => (
                      <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <p className="mb-1 text-sm text-zinc-200">
                          {c.topic}{" "}
                          <span className="text-xs text-zinc-500">
                            ({CONFLICT_LABEL[c.conflictType] ?? c.conflictType})
                          </span>
                        </p>
                        <p className="mb-1 text-xs text-zinc-400">
                          Cách phân xử đề nghị:{" "}
                          {METHOD_LABEL[c.proposal.method] ?? c.proposal.method} —{" "}
                          {c.proposal.rationale}
                        </p>
                        {c.resolution ? (
                          <p className="text-xs text-emerald-300">
                            Đã chốt: {c.resolution}{" "}
                            <span className="text-zinc-500">
                              ({METHOD_LABEL[c.resolutionMethod ?? ""] ?? c.resolutionMethod})
                            </span>
                          </p>
                        ) : canResolve && c.proposal.needsHuman ? (
                          <div className="mt-2">
                            <label
                              htmlFor={`res-${c.id}`}
                              className="mb-1 block text-xs text-zinc-400"
                            >
                              Kết luận của bạn
                            </label>
                            <textarea
                              id={`res-${c.id}`}
                              value={resolution}
                              onChange={(e) => setResolution(e.target.value)}
                              rows={2}
                              className="mb-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => resolve(c.id, c.proposal.method)}
                              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-on-accent hover:bg-emerald-800 disabled:opacity-50"
                            >
                              {submitting ? "Đang lưu..." : "Chốt xung đột"}
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-500">
                            {c.proposal.needsHuman ? "Chờ Admin/PM chốt" : "Có thể tự phân xử"}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex justify-end border-t border-zinc-800 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setDetail(null);
                    }}
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                  >
                    Đóng
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
