"use client";
import { useEffect, useState } from "react";
import {
  Network,
  Search,
  Layers,
  ArrowRight,
  ArrowLeft,
  ArrowUpDown,
  AlertTriangle,
  FileText,
  Clock,
  GitCommit,
  CheckCircle2,
  Table as TableIcon,
  Eye,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import ThuNghiemBanner from "@/app/components/ThuNghiemBanner";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

type GraphNode = {
  id: string;
  externalKey: string;
  objectType: string;
  name: string | null;
  discipline: string | null;
  status: string;
  projectId: number;
};

type GraphEdge = {
  id: string;
  fromObjectId: string;
  toObjectId: string;
  relationType: string;
  projectId: number;
};

type TraversalResult = {
  rootId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depthReached: number;
  truncated: boolean;
};

type LineageResult = {
  object: GraphNode | null;
  source: {
    id: string;
    sourceType: string;
    externalKey: string;
    revisionName: string | null;
    createdAt: string;
  } | null;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    changeSummary: string | null;
    createdAt: string;
  }>;
  relations: {
    outgoing: Array<{ relationType: string; target: GraphNode }>;
    incoming: Array<{ relationType: string; source: GraphNode }>;
  };
  suggestions: Array<{
    id: string;
    title: string;
    status: string;
    riskLevel: string;
  }>;
  workflows: Array<{
    id: string;
    title: string;
    state: string;
    riskClass: string;
  }>;
};

type ImpactResult = {
  targetObject: GraphNode;
  upstreamCount: number;
  downstreamCount: number;
  upstreamNodes: GraphNode[];
  downstreamNodes: GraphNode[];
  criticalPathAlerts: string[];
};

export default function EngineeringGraphPage() {
  const [searchKey, setSearchKey] = useState("");
  const [direction, setDirection] = useState<"both" | "out" | "in">("both");
  const [depth, setDepth] = useState<number>(2);
  const [activeTab, setActiveTab] = useState<"graph" | "lineage" | "impact">("graph");
  const [viewMode, setViewMode] = useState<"visual" | "table">("visual");

  const [loading, setLoading] = useState(false);
  const [graphData, setGraphData] = useState<TraversalResult | null>(null);
  const [lineageData, setLineageData] = useState<LineageResult | null>(null);
  const [impactData, setImpactData] = useState<ImpactResult | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const queryStr = searchKey.trim();
    if (!queryStr) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Search graph traversal
      const sp = new URLSearchParams();
      if (queryStr.includes("-") && queryStr.length > 20) {
        sp.set("objectId", queryStr);
      } else {
        sp.set("externalKey", queryStr);
      }
      sp.set("direction", direction);
      sp.set("depth", depth.toString());

      const res = await fetch(`/api/engineering/graph?${sp.toString()}`);
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Không thể tải dữ liệu đồ thị");
      }

      const gJson: TraversalResult = await res.json();
      setGraphData(gJson);
      const root = gJson.nodes.find((n) => n.id === gJson.rootId) ?? gJson.nodes[0] ?? null;
      setSelectedNode(root);

      if (root) {
        // Load lineage & impact in parallel
        const [lRes, iRes] = await Promise.all([
          fetch(`/api/engineering/lineage/${root.id}`),
          fetch(`/api/engineering/impact/${root.id}?depth=${depth}`),
        ]);
        if (lRes.ok) setLineageData(await lRes.json());
        if (iRes.ok) setImpactData(await iRes.json());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  }

  async function selectNode(node: GraphNode) {
    setSelectedNode(node);
    try {
      const [lRes, iRes] = await Promise.all([
        fetch(`/api/engineering/lineage/${node.id}`),
        fetch(`/api/engineering/impact/${node.id}?depth=${depth}`),
      ]);
      if (lRes.ok) setLineageData(await lRes.json());
      if (iRes.ok) setImpactData(await iRes.json());
    } catch {
      // ignore node-switch subquery errors
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Knowledge Graph & Phả hệ kỹ thuật" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ThuNghiemBanner moduleKey="engineering-graph" />
        <EngineeringNav />

        {/* Search & Filter Bar */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[280px] flex-1">
              <label htmlFor="graph-search" className="mb-1 block text-xs text-zinc-400">
                Mã định danh hoặc External Key đối tượng
              </label>
              <div className="relative">
                <input
                  id="graph-search"
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder="vd: AHU-01, DUCT-L03-01, hoặc UUID..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pl-9 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                />
                <Search
                  size={16}
                  className="absolute left-3 top-2.5 text-zinc-500"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div>
              <label htmlFor="graph-direction" className="mb-1 block text-xs text-zinc-400">
                Hướng quan hệ
              </label>
              <select
                id="graph-direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as "both" | "out" | "in")}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="both">Hai chiều (Cả vào & ra)</option>
                <option value="out">Xuôi dòng (Downstream / Phục vụ)</option>
                <option value="in">Ngược dòng (Upstream / Phụ thuộc)</option>
              </select>
            </div>

            <div>
              <label htmlFor="graph-depth" className="mb-1 block text-xs text-zinc-400">
                Độ sâu quan hệ (Tầng)
              </label>
              <select
                id="graph-depth"
                value={depth}
                onChange={(e) => setDepth(parseInt(e.target.value, 10))}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              >
                <option value={1}>1 tầng (Trực tiếp)</option>
                <option value={2}>2 tầng</option>
                <option value={3}>3 tầng</option>
                <option value={4}>4 tầng</option>
                <option value={5}>5 tầng (Tối đa)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !searchKey.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-on-accent hover:bg-amber-500 disabled:opacity-50"
            >
              <Network size={16} />
              <span>{loading ? "Đang tra cứu..." : "Truy vấn Graph"}</span>
            </button>
          </form>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-400/10 p-3 text-xs text-rose-300">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {loading ? (
          <PageSkeleton />
        ) : !graphData ? (
          <EmptyState
            icon={Network}
            title="Sẵn sàng tra cứu Knowledge Graph"
            message="Nhập mã định danh hoặc external key đối tượng cơ điện (AHU, Van, Tuyến ống gió, Phòng kỹ thuật) để trực quan hoá đồ thị quan hệ và phả hệ."
          />
        ) : (
          <div>
            {/* Top Stats Banner */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs">
              <div className="flex items-center gap-4">
                <span className="text-zinc-400">
                  Đối tượng gốc:{" "}
                  <strong className="text-zinc-100">
                    {selectedNode?.name ?? selectedNode?.externalKey}
                  </strong>
                </span>
                <span className="text-zinc-400">
                  Tổng Nodes: <strong className="text-amber-400">{graphData.nodes.length}</strong>
                </span>
                <span className="text-zinc-400">
                  Tổng Quan hệ: <strong className="text-sky-400">{graphData.edges.length}</strong>
                </span>
                <span className="text-zinc-400">
                  Độ sâu đạt:{" "}
                  <strong className="text-emerald-400">{graphData.depthReached} tầng</strong>
                </span>
                {graphData.truncated && (
                  <span className="rounded bg-amber-950 px-2 py-0.5 text-amber-300">
                    Đã giới hạn tối đa số nodes
                  </span>
                )}
              </div>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-950 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("visual")}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                    viewMode === "visual"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Eye size={13} /> Visual Graph
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                    viewMode === "table"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <TableIcon size={13} /> Bảng chi tiết
                </button>
              </div>
            </div>

            {/* Main Tabs */}
            <div className="mb-4 flex border-b border-zinc-800 text-sm">
              <button
                type="button"
                onClick={() => setActiveTab("graph")}
                className={`border-b-2 px-4 py-2 font-medium transition-colors ${
                  activeTab === "graph"
                    ? "border-amber-400 text-amber-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Đồ thị quan hệ ({graphData.nodes.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("lineage")}
                className={`border-b-2 px-4 py-2 font-medium transition-colors ${
                  activeTab === "lineage"
                    ? "border-amber-400 text-amber-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Phả hệ & Nguồn gốc ({lineageData?.revisions.length ?? 0} rev)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("impact")}
                className={`border-b-2 px-4 py-2 font-medium transition-colors ${
                  activeTab === "impact"
                    ? "border-amber-400 text-amber-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Phân tích tác động ({impactData?.downstreamCount ?? 0} downstream)
              </button>
            </div>

            {/* TAB CONTENT: GRAPH */}
            {activeTab === "graph" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Left/Center: Visual or Table Representation */}
                <div className="lg:col-span-2">
                  {viewMode === "visual" ? (
                    <div className="min-h-[400px] rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                      <div className="mb-3 text-xs text-zinc-400">
                        Nhấp vào từng node để xem chi tiết liên kết và chuyển tâm đồ thị:
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {graphData.nodes.map((n) => {
                          const isRoot = n.id === graphData.rootId;
                          const isSelected = selectedNode?.id === n.id;

                          return (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => selectNode(n)}
                              className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                                isSelected
                                  ? "border-amber-400 bg-amber-950/30 ring-1 ring-amber-400"
                                  : isRoot
                                    ? "border-sky-700 bg-sky-950/20"
                                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    isRoot ? "bg-amber-400" : "bg-sky-400"
                                  }`}
                                />
                                <span className="text-xs font-semibold text-zinc-200">
                                  {n.externalKey}
                                </span>
                              </div>
                              <span className="mt-1 text-xs text-zinc-400">
                                {n.name ?? n.objectType}
                              </span>
                              <div className="mt-2 flex gap-1 text-[10px]">
                                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">
                                  {n.objectType}
                                </span>
                                {n.discipline && (
                                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">
                                    {n.discipline}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Edges List */}
                      <div className="mt-6 border-t border-zinc-800 pt-4">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Quan hệ giữa các node ({graphData.edges.length})
                        </h4>
                        <div className="space-y-1.5 text-xs text-zinc-300">
                          {graphData.edges.map((e) => {
                            const fromN = graphData.nodes.find((n) => n.id === e.fromObjectId);
                            const toN = graphData.nodes.find((n) => n.id === e.toObjectId);
                            return (
                              <div
                                key={e.id}
                                className="flex items-center gap-2 rounded bg-zinc-900/60 px-2.5 py-1.5"
                              >
                                <span className="font-mono text-amber-300">
                                  {fromN?.externalKey ?? e.fromObjectId.slice(0, 8)}
                                </span>
                                <ArrowRight size={13} className="text-zinc-500" />
                                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-sky-300">
                                  {e.relationType}
                                </span>
                                <ArrowRight size={13} className="text-zinc-500" />
                                <span className="font-mono text-emerald-300">
                                  {toN?.externalKey ?? e.toObjectId.slice(0, 8)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Table view fallback */
                    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-400">
                          <tr>
                            <th className="px-3 py-2">External Key</th>
                            <th className="px-3 py-2">Tên đối tượng</th>
                            <th className="px-3 py-2">Loại</th>
                            <th className="px-3 py-2">Discipline</th>
                            <th className="px-3 py-2">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {graphData.nodes.map((n) => (
                            <tr
                              key={n.id}
                              onClick={() => selectNode(n)}
                              className={`cursor-pointer hover:bg-zinc-900 ${
                                selectedNode?.id === n.id
                                  ? "bg-zinc-900 font-semibold text-amber-400"
                                  : ""
                              }`}
                            >
                              <td className="px-3 py-2 font-mono">{n.externalKey}</td>
                              <td className="px-3 py-2">{n.name ?? "—"}</td>
                              <td className="px-3 py-2">{n.objectType}</td>
                              <td className="px-3 py-2 text-zinc-400">{n.discipline ?? "—"}</td>
                              <td className="px-3 py-2">{n.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Right: Selected Node Inspector */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-xs">
                  <h3 className="mb-3 font-semibold text-zinc-100">Chi tiết đối tượng đang chọn</h3>

                  {selectedNode ? (
                    <div className="space-y-3 text-zinc-300">
                      <div>
                        <span className="text-zinc-500">External Key:</span>
                        <div className="font-mono text-sm font-semibold text-zinc-100">
                          {selectedNode.externalKey}
                        </div>
                      </div>
                      <div>
                        <span className="text-zinc-500">Tên:</span>
                        <div className="text-zinc-200">{selectedNode.name ?? "—"}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-zinc-500">Loại:</span>
                          <div className="text-zinc-200">{selectedNode.objectType}</div>
                        </div>
                        <div>
                          <span className="text-zinc-500">Discipline:</span>
                          <div className="text-zinc-200">{selectedNode.discipline ?? "—"}</div>
                        </div>
                      </div>
                      <div>
                        <span className="text-zinc-500">Trạng thái:</span>
                        <div className="text-emerald-400">{selectedNode.status}</div>
                      </div>
                      <div>
                        <span className="text-zinc-500">UUID nội bộ:</span>
                        <div className="font-mono text-[11px] text-zinc-400">{selectedNode.id}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-zinc-500">Chưa chọn node nào.</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: LINEAGE */}
            {activeTab === "lineage" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
                <h3 className="mb-4 text-sm font-semibold text-zinc-100">
                  Chuỗi phả hệ nguồn gốc (Lineage Provenance)
                </h3>

                {lineageData ? (
                  <div className="space-y-6">
                    {/* 1. Source Drawing / Model */}
                    <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                      <FileText size={18} className="mt-0.5 text-amber-400" />
                      <div>
                        <div className="font-semibold text-zinc-200">
                          Bản vẽ nguồn / Source CAD-BIM
                        </div>
                        {lineageData.source ? (
                          <div className="mt-1 text-xs text-zinc-400">
                            Loại nguồn:{" "}
                            <span className="text-zinc-200">{lineageData.source.sourceType}</span> ·
                            Mã nguồn:{" "}
                            <span className="font-mono text-zinc-200">
                              {lineageData.source.externalKey}
                            </span>{" "}
                            · Revision:{" "}
                            <span className="text-zinc-200">
                              {lineageData.source.revisionName ?? "Gốc"}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-zinc-500">
                            Không gắn nguồn bản vẽ trực tiếp.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2. Revisions Timeline */}
                    <div>
                      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        <Clock size={14} /> Lịch sử thay đổi (Object Revisions)
                      </h4>
                      {lineageData.revisions.length > 0 ? (
                        <div className="space-y-2">
                          {lineageData.revisions.map((rev) => (
                            <div
                              key={rev.id}
                              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <GitCommit size={14} className="text-sky-400" />
                                <span className="font-semibold text-zinc-200">
                                  Phiên bản #{rev.revisionNumber}
                                </span>
                                <span className="text-zinc-400">
                                  {rev.changeSummary ?? "Cập nhật dữ liệu kỹ thuật"}
                                </span>
                              </div>
                              <span className="text-zinc-500">
                                {new Date(rev.createdAt).toLocaleString("vi-VN")}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">Chưa có phiên bản sửa đổi.</div>
                      )}
                    </div>

                    {/* 3. Suggestions & Workflows */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                        <h4 className="mb-2 font-semibold text-zinc-300">Đề xuất AI liên quan</h4>
                        {lineageData.suggestions.length > 0 ? (
                          <ul className="space-y-1.5">
                            {lineageData.suggestions.map((s) => (
                              <li key={s.id} className="text-zinc-400">
                                • <strong className="text-zinc-200">{s.title}</strong> ({s.status})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-zinc-500">Không có đề xuất AI liên quan.</div>
                        )}
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                        <h4 className="mb-2 font-semibold text-zinc-300">
                          Quy trình phê duyệt (Workflows)
                        </h4>
                        {lineageData.workflows.length > 0 ? (
                          <ul className="space-y-1.5">
                            {lineageData.workflows.map((w) => (
                              <li key={w.id} className="text-zinc-400">
                                • <strong className="text-zinc-200">{w.title}</strong> [{w.state}]
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-zinc-500">Không có quy trình duyệt liên quan.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">Chưa có dữ liệu phả hệ.</div>
                )}
              </div>
            )}

            {/* TAB CONTENT: IMPACT */}
            {activeTab === "impact" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
                <h3 className="mb-4 text-sm font-semibold text-zinc-100">
                  Phân tích tác động ảnh hưởng (Impact Analysis)
                </h3>

                {impactData ? (
                  <div className="space-y-6">
                    {/* Critical path alerts */}
                    {impactData.criticalPathAlerts.length > 0 && (
                      <div className="rounded-lg border border-amber-800 bg-amber-950/40 p-4 text-xs text-amber-200">
                        <div className="mb-2 font-semibold">Cảnh báo tác động trọng yếu:</div>
                        <ul className="list-inside list-disc space-y-1">
                          {impactData.criticalPathAlerts.map((alert, idx) => (
                            <li key={idx}>{alert}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Upstream & Downstream summary */}
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-400">
                            <ArrowLeft size={14} /> Upstream (Phụ thuộc vào)
                          </h4>
                          <span className="rounded bg-sky-950 px-2 py-0.5 text-xs text-sky-300">
                            {impactData.upstreamCount} đối tượng
                          </span>
                        </div>
                        <div className="max-h-60 space-y-1.5 overflow-y-auto text-xs">
                          {impactData.upstreamNodes.map((n) => (
                            <div
                              key={n.id}
                              className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-zinc-300"
                            >
                              {n.externalKey} ({n.name ?? n.objectType})
                            </div>
                          ))}
                          {impactData.upstreamNodes.length === 0 && (
                            <div className="text-zinc-500">Không có đối tượng upstream.</div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
                            <ArrowRight size={14} /> Downstream (Gây ảnh hưởng tới)
                          </h4>
                          <span className="rounded bg-amber-950 px-2 py-0.5 text-xs text-amber-300">
                            {impactData.downstreamCount} đối tượng
                          </span>
                        </div>
                        <div className="max-h-60 space-y-1.5 overflow-y-auto text-xs">
                          {impactData.downstreamNodes.map((n) => (
                            <div
                              key={n.id}
                              className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-zinc-300"
                            >
                              {n.externalKey} ({n.name ?? n.objectType})
                            </div>
                          ))}
                          {impactData.downstreamNodes.length === 0 && (
                            <div className="text-zinc-500">Không có đối tượng downstream.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">Chưa có kết quả phân tích tác động.</div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
