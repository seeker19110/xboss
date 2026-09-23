"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Check,
  X,
  Scale,
  Activity,
  ArrowUpRight,
  GitBranch,
  Waypoints,
  AlertTriangle,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton, Skeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";
import { showToast } from "@/app/components/Toast";
import { WORKFLOW_STATE_LABELS } from "@/lib/ky-thuat/engineering-workflow-states";

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

// Tác động & phả hệ (lib/ky-thuat/engineering-graph.ts) — khai lại kiểu thuần ở đây thay vì
// import file lib (kéo `@/lib/db` vào bundle client), theo đúng ranh giới ADR-0007.
type GraphNode = {
  id: string;
  externalKey: string;
  objectType: string;
  name: string | null;
  discipline: string | null;
  status: string;
};
type ImpactResult = {
  targetObject: GraphNode;
  upstreamCount: number;
  downstreamCount: number;
  upstreamNodes: GraphNode[];
  downstreamNodes: GraphNode[];
  criticalPathAlerts: string[];
};
type LineageResult = {
  object: GraphNode | null;
  source: {
    sourceType: string;
    externalKey: string;
    revisionName: string | null;
  } | null;
  revisions: Array<{ revisionNumber: number; changeSummary: string | null }>;
  relations: {
    outgoing: Array<{ relationType: string; target: GraphNode }>;
    incoming: Array<{ relationType: string; source: GraphNode }>;
  };
  suggestions: Array<{ id: string; title: string; status: string; riskLevel: string }>;
  workflows: Array<{ id: string; title: string; state: string }>;
};

const STATUS_LABEL: Record<EngObject["status"], string> = {
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  void: "Đã xoá",
};

const STATUS_CLS: Record<EngObject["status"], string> = {
  pending_review: "bg-amber-950/40 text-amber-300 border-amber-800",
  approved: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
  rejected: "bg-rose-950/40 text-rose-300 border-rose-800",
  void: "bg-zinc-900 text-zinc-500 border-zinc-800",
};

// Danh sách node ngược/xuôi dòng trong khối "Tác động" — tối đa 20 dòng.
function NodeList({ nodes }: { nodes: GraphNode[] }) {
  if (nodes.length === 0) return <p className="text-zinc-500">—</p>;
  const shown = nodes.slice(0, 20);
  return (
    <ul className="space-y-0.5 text-zinc-300">
      {shown.map((n) => (
        <li key={n.id}>
          {n.name ?? n.externalKey} · {n.objectType}
        </li>
      ))}
      {nodes.length > 20 && (
        <li className="text-zinc-500">… và {nodes.length - 20} nữa</li>
      )}
    </ul>
  );
}

export default function EngineeringApexCockpitPage() {
  const [objects, setObjects] = useState<EngObject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "objects">("overview");
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [lineage, setLineage] = useState<LineageResult | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);

  async function loadData() {
    try {
      const sp = new URLSearchParams();
      if (statusFilter) sp.set("status", statusFilter);
      if (typeFilter) sp.set("type", typeFilter);
      const objRes = await fetch(`/api/engineering/objects?${sp.toString()}`);
      if (objRes.status === 401) {
        redirectToLogin();
        return;
      }
      if (objRes.ok) {
        const objJson = await objRes.json();
        setObjects(objJson.objects || []);
      }
    } catch (err) {
      console.error("Lỗi khi tải dữ liệu Apex Cockpit:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  function openDetail(id: string) {
    setSelectedId(id);
    setNote("");
    setImpact(null);
    setLineage(null);
    setDetailLoading(true);
    fetch(`/api/engineering/objects/${id}`)
      .then((r) => r.json())
      .then((j) => setDetail(j))
      .finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setImpact(null);
    setLineage(null);
  }

  async function toggleImpact() {
    if (impact) {
      setImpact(null);
      return;
    }
    if (!selectedId) return;
    setImpactLoading(true);
    try {
      const res = await fetch(`/api/engineering/impact/${selectedId}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Không tải được phân tích tác động", "error");
        return;
      }
      setImpact(j);
    } catch {
      showToast("Mất mạng — thử lại sau", "error");
    } finally {
      setImpactLoading(false);
    }
  }

  async function toggleLineage() {
    if (lineage) {
      setLineage(null);
      return;
    }
    if (!selectedId) return;
    setLineageLoading(true);
    try {
      const res = await fetch(`/api/engineering/lineage/${selectedId}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Không tải được phả hệ đối tượng", "error");
        return;
      }
      setLineage(j);
    } catch {
      showToast("Mất mạng — thử lại sau", "error");
    } finally {
      setLineageLoading(false);
    }
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
      loadData();
    } catch {
      alert("Mất mạng — thử lại sau");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader title="Trung Tâm Điều Hành Kỹ Thuật Đỉnh Cao (Apex Cockpit)" />
        <main className="mx-auto max-w-7xl px-4 py-6">
          <PageSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Trung Tâm Điều Hành Kỹ Thuật Đỉnh Cao (Apex Cockpit)" />
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <EngineeringNav />

        {/* View Switcher: Cụm điều hành chuyên sâu vs Bảng duyệt đối tượng kỹ thuật */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("overview")}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold transition ${
                activeTab === "overview"
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              Cụm Điều Hành Chuyên Sâu
            </button>
            <button
              onClick={() => setActiveTab("objects")}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold transition flex items-center gap-2 ${
                activeTab === "objects"
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <span>Đối Tượng Kỹ Thuật (ENG-1)</span>
              {objects && objects.filter((o) => o.status === "pending_review").length > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                  {objects.filter((o) => o.status === "pending_review").length}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeTab === "overview" ? (
          /* Bento Grid các cụm kỹ thuật */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Bento Item 1: Tài chính, Pháp lý & Chuỗi cung ứng */}
            <div className="bento-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Scale className="h-4 w-4 text-violet-400" />
                    <span>Tài chính, Pháp lý & Logistics</span>
                  </div>
                  <span className="rounded bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400 border border-violet-500/20 font-mono">
                    PKI Sealed
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  <Link
                    href="/engineering/cashflow"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Dynamic Cashflow & Working Capital (M85)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/esign"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Paperless Smart e-Signature PKI (M84)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/procurement?tab=qr-logistics"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Smart Materials QR Logistics (M78)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/bidding-matrix"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Smart Bidding & Skewing Analysis (M75)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                Toàn vẹn số liệu tài chính trên BigInt đơn vị nhỏ, chống trượt số float.
              </div>
            </div>

            {/* Bento Item 2: Quản trị Quy trình & Chất lượng (ENG-3 / ENG-2) */}
            <div className="bento-card p-5 flex flex-col justify-between lg:col-span-2">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    <span>Quản trị Quy trình Phê duyệt & Đề xuất Kỹ thuật (Gate 0 OS)</span>
                  </div>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-500/20 font-mono">
                    Gate 0 Enforced
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Link
                    href="/engineering/workflows"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Quy trình phê duyệt Gate 0 (ENG-3)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/data-quality"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Chất lượng dữ liệu kỹ thuật (OS-1)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                Bảo vệ ranh giới bảo mật, phân quyền RBAC & SoD (Phân tách trách nhiệm) đa dự án.
              </div>
            </div>
          </div>
        ) : (
          /* Bảng Quản lý & Duyệt Đối tượng Kỹ thuật (ENG-1) */
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label htmlFor="eng-status" className="mb-1 block text-xs text-zinc-400">
                  Trạng thái
                </label>
                <select
                  id="eng-status"
                  aria-label="Lọc theo trạng thái duyệt"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
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
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-600 text-zinc-200"
                />
              </div>
            </div>

            {!objects || objects.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="Chưa nhận đối tượng kỹ thuật nào"
                message="Nạp dữ liệu qua cổng tiếp nhận ENG-1 để có đối tượng kỹ thuật hiển thị ở đây."
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
                        className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900 transition-colors"
                      >
                        <td className="px-3 py-2 font-medium">{o.objectType}</td>
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
          </div>
        )}
      </main>

      {/* Modal Chi tiết & Duyệt Đối tượng Kỹ thuật */}
      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--overlay-scrim)" }}
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
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

                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toggleLineage}
                    aria-label="Xem phả hệ đối tượng"
                    className="flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                  >
                    <GitBranch size={14} aria-hidden="true" /> Phả hệ
                  </button>
                  <button
                    type="button"
                    onClick={toggleImpact}
                    aria-label="Xem phân tích tác động"
                    className="flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                  >
                    <Waypoints size={14} aria-hidden="true" /> Tác động
                  </button>
                </div>

                {impactLoading && <Skeleton className="mb-3 h-24 w-full" />}
                {impact && (
                  <div className="mb-3 rounded-lg bg-zinc-950 p-3 text-xs">
                    <div className="mb-2 flex flex-wrap gap-4">
                      <span className="text-zinc-300">
                        Ngược dòng: <strong className="text-zinc-100">{impact.upstreamCount}</strong>
                      </span>
                      <span className="text-zinc-300">
                        Xuôi dòng: <strong className="text-zinc-100">{impact.downstreamCount}</strong>
                      </span>
                    </div>
                    <p className="mb-1 font-semibold text-zinc-400">Cảnh báo đường găng</p>
                    {impact.criticalPathAlerts.length === 0 ? (
                      <p className="mb-2 text-zinc-500">Không có cảnh báo đường găng</p>
                    ) : (
                      <ul className="mb-2 space-y-1">
                        {impact.criticalPathAlerts.map((a, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-amber-300">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                            {a}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 font-semibold text-zinc-400">Node ngược dòng</p>
                        <NodeList nodes={impact.upstreamNodes} />
                      </div>
                      <div>
                        <p className="mb-1 font-semibold text-zinc-400">Node xuôi dòng</p>
                        <NodeList nodes={impact.downstreamNodes} />
                      </div>
                    </div>
                  </div>
                )}

                {lineageLoading && <Skeleton className="mb-3 h-24 w-full" />}
                {lineage && (
                  <div className="mb-3 space-y-2 rounded-lg bg-zinc-950 p-3 text-xs">
                    <div>
                      <p className="mb-1 font-semibold text-zinc-400">Nguồn</p>
                      <p className="text-zinc-300">
                        {lineage.source
                          ? `${lineage.source.sourceType} · ${lineage.source.externalKey} · ${lineage.source.revisionName ?? "—"}`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-zinc-400">Phiên bản</p>
                      {lineage.revisions.length === 0 ? (
                        <p className="text-zinc-500">—</p>
                      ) : (
                        <ul className="space-y-0.5 text-zinc-300">
                          {lineage.revisions.map((r, i) => (
                            <li key={i}>
                              #{r.revisionNumber} — {r.changeSummary ?? "—"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-zinc-400">Quan hệ ra</p>
                      {lineage.relations.outgoing.length === 0 ? (
                        <p className="text-zinc-500">—</p>
                      ) : (
                        <ul className="space-y-0.5 text-zinc-300">
                          {lineage.relations.outgoing.map((r, i) => (
                            <li key={i}>
                              {r.relationType} → {r.target.name ?? r.target.externalKey}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-zinc-400">Quan hệ vào</p>
                      {lineage.relations.incoming.length === 0 ? (
                        <p className="text-zinc-500">—</p>
                      ) : (
                        <ul className="space-y-0.5 text-zinc-300">
                          {lineage.relations.incoming.map((r, i) => (
                            <li key={i}>
                              {r.relationType} → {r.source.name ?? r.source.externalKey}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-zinc-400">Đề xuất liên quan</p>
                      {lineage.suggestions.length === 0 ? (
                        <p className="text-zinc-500">—</p>
                      ) : (
                        <ul className="space-y-0.5 text-zinc-300">
                          {lineage.suggestions.map((s) => (
                            <li key={s.id}>
                              {s.title} · {s.status} · {s.riskLevel}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-zinc-400">Workflow liên quan</p>
                      {lineage.workflows.length === 0 ? (
                        <p className="text-zinc-500">—</p>
                      ) : (
                        <ul className="space-y-0.5 text-zinc-300">
                          {lineage.workflows.map((w) => (
                            <li key={w.id}>
                              <Link
                                href="/engineering/workflows"
                                className="text-sky-400 hover:underline"
                              >
                                {w.title} ·{" "}
                                {WORKFLOW_STATE_LABELS[w.state as keyof typeof WORKFLOW_STATE_LABELS] ??
                                  w.state}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
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
                      className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
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
                        className="flex items-center gap-1 rounded-lg bg-rose-800 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        <X size={14} /> Từ chối
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => review("approved")}
                        aria-label="Duyệt đối tượng kỹ thuật"
                        className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-on-accent hover:bg-emerald-800 disabled:opacity-50"
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
