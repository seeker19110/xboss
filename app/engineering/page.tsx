"use client";
import { useEffect, useState } from "react";
import { Boxes, Check, X } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

// ENG-1 — trang admin xem/duyệt Engineering Object nhận từ hệ thống ngoài (MEP-Agents),
// xem docs/nang-cap/ENG-1-mep-agent-integration.md mục 9. Tối thiểu cho PR1: bảng + modal
// chi tiết (properties/geometry_ref thô, quan hệ, 5 revision gần nhất) + duyệt/từ chối.

type EngObject = {
  id: string;
  objectType: string;
  discipline: string | null;
  externalKey: string | null;
  name: string | null;
  status: "pending_review" | "approved" | "rejected" | "void";
  properties: Record<string, unknown>;
  geometryRef: Record<string, unknown>;
  createdAt: string;
};

type Relation = {
  id: string;
  fromObjectId: string;
  toObjectId: string;
  relationType: string;
};

type Revision = {
  id: string;
  revisionNo: number;
  status: string;
  changeReason: string | null;
  createdBy: number;
  createdAt: string;
};

type Detail = { object: EngObject; relations: Relation[]; revisions: Revision[] };

const STATUS_LABEL: Record<EngObject["status"], string> = {
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  void: "Đã xoá",
};
const STATUS_CLS: Record<EngObject["status"], string> = {
  pending_review: "bg-zinc-800 text-zinc-300 border-zinc-700",
  approved: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
  rejected: "bg-rose-950/40 text-rose-300 border-rose-800",
  void: "bg-zinc-900 text-zinc-500 border-zinc-800",
};

export default function EngineeringPage() {
  const [objects, setObjects] = useState<EngObject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    const sp = new URLSearchParams();
    if (statusFilter) sp.set("status", statusFilter);
    if (typeFilter) sp.set("type", typeFilter);
    fetch(`/api/engineering/objects?${sp.toString()}`)
      .then(async (r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.json();
      })
      .then((j) => j && setObjects(j.objects))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  function openDetail(id: string) {
    setSelectedId(id);
    setNote("");
    setDetailLoading(true);
    fetch(`/api/engineering/objects/${id}`)
      .then((r) => r.json())
      .then((j) => setDetail(j))
      .finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
  }

  async function review(decision: "approved" | "rejected") {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/engineering/objects/${selectedId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Duyệt đối tượng thất bại");
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
      <AppHeader title="Đối tượng kỹ thuật (AI)" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="eng-status" className="mb-1 block text-xs text-zinc-400">
              Trạng thái
            </label>
            <select
              id="eng-status"
              aria-label="Lọc theo trạng thái duyệt"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm"
            >
              <option value="">Tất cả</option>
              <option value="pending_review">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>
          </div>
          <div>
            <label htmlFor="eng-type" className="mb-1 block text-xs text-zinc-400">
              Loại đối tượng
            </label>
            <input
              id="eng-type"
              aria-label="Lọc theo loại đối tượng"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              placeholder="vd AHU, pipe_segment"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-600"
            />
          </div>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : !objects || objects.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="Chưa nhận đối tượng kỹ thuật nào"
            message="Kết nối MEP-Agents để bắt đầu (API key scope engineering, xem Admin → Tích hợp hệ ngoài)."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Loại</th>
                  <th className="px-3 py-2 text-left">Discipline</th>
                  <th className="px-3 py-2 text-left">Tên</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                  <th className="px-3 py-2 text-left">Ngày nhận</th>
                </tr>
              </thead>
              <tbody>
                {objects.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => openDetail(o.id)}
                    className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2">{o.objectType}</td>
                    <td className="px-3 py-2 text-zinc-400">{o.discipline ?? "—"}</td>
                    <td className="px-3 py-2">{o.name ?? o.externalKey ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLS[o.status]}`}
                      >
                        {STATUS_LABEL[o.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {new Date(o.createdAt).toLocaleString("vi-VN")}
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
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-zinc-100">
                    {detail.object.name ?? detail.object.externalKey ?? detail.object.objectType}
                  </h2>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLS[detail.object.status]}`}
                  >
                    {STATUS_LABEL[detail.object.status]}
                  </span>
                </div>

                <div className="mb-3 text-xs text-zinc-400">
                  Loại: {detail.object.objectType} · Discipline: {detail.object.discipline ?? "—"} ·
                  Mã ngoài: {detail.object.externalKey ?? "—"}
                </div>

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Properties
                </p>
                <pre className="mb-3 max-h-40 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-300">
                  {JSON.stringify(detail.object.properties, null, 2)}
                </pre>

                {detail.relations.length > 0 && (
                  <>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Quan hệ
                    </p>
                    <ul className="mb-3 space-y-1 text-xs text-zinc-300">
                      {detail.relations.map((r) => (
                        <li key={r.id}>
                          {r.fromObjectId === detail.object.id ? "→" : "←"} {r.relationType}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Lịch sử gần nhất
                </p>
                <ul className="mb-4 space-y-1 text-xs text-zinc-400">
                  {detail.revisions.map((r) => (
                    <li key={r.id}>
                      #{r.revisionNo} — {r.changeReason ?? r.status} (
                      {new Date(r.createdAt).toLocaleString("vi-VN")})
                    </li>
                  ))}
                </ul>

                {detail.object.status === "pending_review" ||
                detail.object.status === "rejected" ? (
                  <div className="border-t border-zinc-800 pt-3">
                    <label htmlFor="review-note" className="mb-1 block text-xs text-zinc-400">
                      Ghi chú (tuỳ chọn)
                    </label>
                    <textarea
                      id="review-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={closeDetail}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => review("rejected")}
                        aria-label="Từ chối đối tượng kỹ thuật"
                        className="flex items-center gap-1 rounded-lg bg-rose-800 px-3 py-1.5 text-sm text-on-accent hover:bg-rose-700 disabled:opacity-50"
                      >
                        <X size={14} /> Từ chối
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => review("approved")}
                        aria-label="Duyệt đối tượng kỹ thuật"
                        className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-on-accent hover:bg-emerald-600 disabled:opacity-50"
                      >
                        <Check size={14} /> {submitting ? "Đang lưu..." : "Duyệt"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end border-t border-zinc-800 pt-3">
                    <button
                      type="button"
                      onClick={closeDetail}
                      className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                    >
                      Đóng
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
