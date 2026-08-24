"use client";
import { useEffect, useState } from "react";
import {
  Cpu,
  Search,
  Activity,
  Layers,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plus,
  ArrowRight,
  Radio,
  FileCode,
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

type TwinBinding = {
  id: string;
  projectId: number;
  objectId: string;
  bindingType: "floor" | "zone" | "system" | "task" | "drawing" | "bim_element";
  targetKey: string;
  targetId: string | null;
  sourceRevisionId: string | null;
  authority: string;
  metadata: Record<string, unknown>;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
};

type TwinState = {
  id: string;
  projectId: number;
  objectId: string;
  stateType: string;
  observedAt: string;
  ingestedAt: string;
  value: Record<string, unknown> | unknown;
  unit: string | null;
  schemaVersion: string;
  quality: "high" | "medium" | "low" | "unknown";
  freshness: "live" | "recent" | "stale" | "unknown";
  source: string;
  supersedesId: string | null;
  createdAt: string;
};

type TwinSnapshot = {
  object: GraphNode | null;
  bindings: TwinBinding[];
  latestStates: Record<string, TwinState>;
  primaryFreshness: "live" | "recent" | "stale" | "unknown";
  geometryRef: Record<string, unknown> | null;
  source: {
    id: string;
    sourceType: string;
    externalKey: string;
    revisionName: string | null;
  } | null;
};

type TwinImpact = {
  targetObject: GraphNode;
  targetStates: Record<string, TwinState>;
  downstreamImpactedNodes: Array<{
    node: GraphNode;
    states: Record<string, TwinState>;
    relationType: string;
  }>;
  operationalWarnings: string[];
};

const FRESHNESS_LABEL = {
  live: "Đang hoạt động (Live)",
  recent: "Gần đây (<24h)",
  stale: "Quá hạn (>24h)",
  unknown: "Chưa có dữ liệu",
};

const FRESHNESS_CLS = {
  live: "bg-emerald-950/60 text-emerald-300 border-emerald-700 animate-pulse",
  recent: "bg-sky-950/50 text-sky-300 border-sky-800",
  stale: "bg-amber-950/50 text-amber-300 border-amber-800",
  unknown: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const BINDING_TYPE_LABEL: Record<TwinBinding["bindingType"], string> = {
  floor: "Tầng",
  zone: "Khu vực",
  system: "Hệ thống",
  task: "Task thi công",
  drawing: "Bản vẽ",
  bim_element: "Phần tử BIM",
};

export default function DigitalTwinPage() {
  const [searchKey, setSearchKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<TwinSnapshot | null>(null);
  const [timeline, setTimeline] = useState<TwinState[] | null>(null);
  const [impact, setImpact] = useState<TwinImpact | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "impact">("overview");
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [openAddState, setOpenAddState] = useState(false);
  const [stateTypeInput, setStateTypeInput] = useState("operating_status");
  const [stateValueInput, setStateValueInput] = useState("normal");
  const [stateUnitInput, setStateUnitInput] = useState("");
  const [savingState, setSavingState] = useState(false);

  const [openAddBinding, setOpenAddBinding] = useState(false);
  const [bindingTypeInput, setBindingTypeInput] = useState<TwinBinding["bindingType"]>("floor");
  const [bindingKeyInput, setBindingKeyInput] = useState("");
  const [savingBinding, setSavingBinding] = useState(false);

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const q = searchKey.trim();
    if (!q) return;

    setLoading(true);
    setError(null);

    try {
      // 1. If external key, first find objectId via graph query
      let objId = q;
      if (!q.includes("-") || q.length < 20) {
        const gRes = await fetch(
          `/api/engineering/graph?externalKey=${encodeURIComponent(q)}&depth=1`,
        );
        if (!gRes.ok) {
          throw new Error("Không tìm thấy đối tượng có mã " + q);
        }
        const gData = await gRes.json();
        objId = gData.rootId;
      }

      // 2. Fetch Twin Snapshot, Timeline & Impact
      const [sRes, tRes, iRes] = await Promise.all([
        fetch(`/api/engineering/twin/${objId}`),
        fetch(`/api/engineering/twin/${objId}/timeline?limit=20`),
        fetch(`/api/engineering/twin/${objId}/impact`),
      ]);

      if (sRes.status === 401) {
        redirectToLogin();
        return;
      }
      if (!sRes.ok) {
        const j = await sRes.json().catch(() => null);
        throw new Error(j?.error ?? "Không thể tải Digital Twin của đối tượng");
      }

      setSnapshot(await sRes.json());
      if (tRes.ok) {
        const tJson = await tRes.json();
        setTimeline(tJson.states);
      }
      if (iRes.ok) {
        setImpact(await iRes.json());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveState() {
    if (!snapshot?.object || !stateTypeInput.trim()) return;
    setSavingState(true);
    try {
      let parsedValue: unknown = stateValueInput;
      try {
        parsedValue = JSON.parse(stateValueInput);
      } catch {
        parsedValue = stateValueInput;
      }

      const res = await fetch(`/api/engineering/twin/${snapshot.object.id}/states`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateType: stateTypeInput.trim(),
          value: parsedValue,
          unit: stateUnitInput.trim() || undefined,
          source: "web_inspector",
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Không thể lưu trạng thái");
        return;
      }

      setOpenAddState(false);
      // Reload snapshot
      const sRes = await fetch(`/api/engineering/twin/${snapshot.object.id}`);
      if (sRes.ok) setSnapshot(await sRes.json());
      const tRes = await fetch(`/api/engineering/twin/${snapshot.object.id}/timeline?limit=20`);
      if (tRes.ok) setTimeline((await tRes.json()).states);
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setSavingState(false);
    }
  }

  async function handleSaveBinding() {
    if (!snapshot?.object || !bindingKeyInput.trim()) return;
    setSavingBinding(true);
    try {
      const res = await fetch(`/api/engineering/twin/${snapshot.object.id}/bindings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bindingType: bindingTypeInput,
          targetKey: bindingKeyInput.trim(),
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Không thể tạo liên kết");
        return;
      }

      setOpenAddBinding(false);
      setBindingKeyInput("");
      const sRes = await fetch(`/api/engineering/twin/${snapshot.object.id}`);
      if (sRes.ok) setSnapshot(await sRes.json());
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setSavingBinding(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Digital Twin (Cấp độ L0–L3)" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ThuNghiemBanner moduleKey="engineering-twin" />
        <EngineeringNav />

        {/* Search Header */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[300px] flex-1">
              <label htmlFor="twin-search" className="mb-1 block text-xs text-zinc-400">
                Tra cứu đối tượng Digital Twin (External Key hoặc UUID)
              </label>
              <div className="relative">
                <input
                  id="twin-search"
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder="vd: AHU-01, PUMP-01, DUCT-L03-01..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pl-9 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                />
                <Search
                  size={16}
                  className="absolute left-3 top-2.5 text-zinc-500"
                  aria-hidden="true"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !searchKey.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-on-accent hover:bg-amber-500 disabled:opacity-50"
            >
              <Cpu size={16} />
              <span>{loading ? "Đang tra cứu..." : "Xem Digital Twin"}</span>
            </button>
          </form>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-300">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {loading ? (
          <PageSkeleton />
        ) : !snapshot || !snapshot.object ? (
          <EmptyState
            icon={Cpu}
            title="Sẵn sàng kết nối Digital Twin L0–L3"
            message="Nhập mã thiết bị hoặc tuyến ống (AHU, Bơm, Quạt, Tuyến ống gió) để hiển thị hồ sơ L0 (Asset), liên kết không gian/BIM L1 (Bindings) và trạng thái hiện trường thực tế L3 (Snapshots)."
          />
        ) : (
          <div>
            {/* Top Object Header Card (L0) */}
            <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-zinc-100">
                      {snapshot.object.name ?? snapshot.object.externalKey}
                    </h2>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        FRESHNESS_CLS[snapshot.primaryFreshness]
                      }`}
                    >
                      {FRESHNESS_LABEL[snapshot.primaryFreshness]}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-400">
                    <span>
                      Mã ngoài (Key):{" "}
                      <strong className="font-mono text-zinc-200">
                        {snapshot.object.externalKey}
                      </strong>
                    </span>
                    <span>
                      Loại: <strong className="text-zinc-200">{snapshot.object.objectType}</strong>
                    </span>
                    <span>
                      Discipline:{" "}
                      <strong className="text-zinc-200">
                        {snapshot.object.discipline ?? "General"}
                      </strong>
                    </span>
                    <span>
                      Trạng thái duyệt:{" "}
                      <strong className="text-emerald-400">{snapshot.object.status}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenAddBinding(true)}
                    className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                  >
                    <Plus size={13} /> Gán liên kết L1
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenAddState(true)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-emerald-600"
                  >
                    <Activity size={13} /> Ghi trạng thái L3
                  </button>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="mb-4 flex border-b border-zinc-800 text-sm">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`border-b-2 px-4 py-2 font-medium transition-colors ${
                  activeTab === "overview"
                    ? "border-amber-400 text-amber-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Tổng quan & Trạng thái hiện trường
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("timeline")}
                className={`border-b-2 px-4 py-2 font-medium transition-colors ${
                  activeTab === "timeline"
                    ? "border-amber-400 text-amber-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Lịch sử biến thiên (Timeline) ({timeline?.length ?? 0})
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
                Tác động vận hành (Twin Impact) ({impact?.downstreamImpactedNodes.length ?? 0})
              </button>
            </div>

            {/* TAB CONTENT: OVERVIEW */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Left: L3 Field States Cards */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                      <Activity size={16} className="text-emerald-400" />
                      Thông số hiện trường mới nhất (L3 Field Snapshots)
                    </h3>

                    {Object.keys(snapshot.latestStates).length === 0 ? (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-center text-xs text-zinc-500">
                        Chưa có dữ liệu đo kiểm / vận hành thực tế. Nhấn &quot;Ghi trạng thái
                        L3&quot; để thêm snapshot.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {Object.entries(snapshot.latestStates).map(([k, st]) => (
                          <div
                            key={k}
                            className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-semibold text-sky-400">
                                {st.stateType}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-semibold ${
                                  FRESHNESS_CLS[st.freshness]
                                }`}
                              >
                                {st.freshness}
                              </span>
                            </div>

                            <div className="my-2 text-lg font-bold text-zinc-100">
                              {typeof st.value === "object"
                                ? JSON.stringify(st.value)
                                : String(st.value)}{" "}
                              {st.unit && (
                                <span className="text-xs font-normal text-zinc-400">{st.unit}</span>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-zinc-500">
                              <span>Nguồn: {st.source}</span>
                              <span>{new Date(st.observedAt).toLocaleString("vi-VN")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* L1 Bindings */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                      <Layers size={16} className="text-amber-400" />
                      Liên kết không gian & mô hình (L1 Bindings)
                    </h3>

                    {snapshot.bindings.length === 0 ? (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-center text-xs text-zinc-500">
                        Chưa có liên kết mặt bằng tầng, khu vực hoặc phần tử BIM.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {snapshot.bindings.map((b) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-zinc-800 px-2 py-0.5 font-semibold text-amber-300">
                                {BINDING_TYPE_LABEL[b.bindingType] ?? b.bindingType}
                              </span>
                              <span className="font-mono text-zinc-200">{b.targetKey}</span>
                            </div>
                            <span className="text-zinc-500 text-[11px]">
                              Thẩm quyền: {b.authority} · Gán lúc:{" "}
                              {new Date(b.createdAt).toLocaleDateString("vi-VN")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Geometry & Source Inspector */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-xs space-y-4">
                  <h3 className="font-semibold text-zinc-100">
                    Bản vẽ nguồn & Hình học (Geometry)
                  </h3>

                  {snapshot.source ? (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="font-semibold text-zinc-200">
                        {snapshot.source.externalKey}
                      </div>
                      <div className="mt-1 text-zinc-400">
                        Loại: {snapshot.source.sourceType} · Bản:{" "}
                        {snapshot.source.revisionName ?? "Gốc"}
                      </div>
                    </div>
                  ) : (
                    <div className="text-zinc-500">Không có bản vẽ nguồn.</div>
                  )}

                  {snapshot.geometryRef ? (
                    <div>
                      <div className="mb-1 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                        Tọa độ / Geometry Bounds
                      </div>
                      <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300">
                        {JSON.stringify(snapshot.geometryRef, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-zinc-500">Chưa gắn geometry bounding-box.</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: TIMELINE */}
            {activeTab === "timeline" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
                <h3 className="mb-4 text-sm font-semibold text-zinc-100">
                  Lịch sử biến thiên trạng thái hiện trường (L3 Time-Series)
                </h3>

                {!timeline || timeline.length === 0 ? (
                  <div className="text-xs text-zinc-500">
                    Chưa có lịch sử trạng thái nào được ghi nhận.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {timeline.map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <Clock size={15} className="text-sky-400" />
                          <div>
                            <span className="font-mono font-semibold text-amber-300">
                              {st.stateType}:
                            </span>{" "}
                            <span className="font-bold text-zinc-100">
                              {typeof st.value === "object"
                                ? JSON.stringify(st.value)
                                : String(st.value)}{" "}
                              {st.unit}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                          <span>Nguồn: {st.source}</span>
                          <span>Độ tin cậy: {st.quality}</span>
                          <span>{new Date(st.observedAt).toLocaleString("vi-VN")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: IMPACT */}
            {activeTab === "impact" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
                <h3 className="mb-4 text-sm font-semibold text-zinc-100">
                  Tác động vận hành tới đối tượng hạ nguồn (Downstream Twin Impact)
                </h3>

                {impact ? (
                  <div className="space-y-5">
                    {impact.operationalWarnings.length > 0 && (
                      <div className="rounded-lg border border-amber-800 bg-amber-950/40 p-4 text-xs text-amber-200">
                        <div className="mb-1 font-semibold">Cảnh báo vận hành:</div>
                        <ul className="list-inside list-disc space-y-1">
                          {impact.operationalWarnings.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="space-y-2">
                      {impact.downstreamImpactedNodes.map((item) => (
                        <div
                          key={item.node.id}
                          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs"
                        >
                          <div>
                            <div className="font-mono font-semibold text-zinc-200">
                              {item.node.externalKey}
                            </div>
                            <div className="text-zinc-400">
                              {item.node.name ?? item.node.objectType} · Quan hệ:{" "}
                              {item.relationType}
                            </div>
                          </div>

                          <div className="text-right">
                            {Object.keys(item.states).length > 0 ? (
                              Object.entries(item.states).map(([k, s]) => (
                                <div key={k} className="text-[11px] text-zinc-300">
                                  {k}:{" "}
                                  <strong className="text-emerald-400">{String(s.value)}</strong>
                                </div>
                              ))
                            ) : (
                              <span className="text-[11px] text-zinc-500">Chưa có snapshot L3</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">Không có dữ liệu tác động.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal: Ghi trạng thái L3 */}
        {openAddState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-xs">
              <h3 className="mb-3 text-base font-semibold text-zinc-100">
                Ghi nhận trạng thái hiện trường (L3)
              </h3>

              <div className="space-y-3">
                <div>
                  <label htmlFor="state-type" className="mb-1 block text-zinc-400">
                    Loại thông số (State Type)
                  </label>
                  <input
                    id="state-type"
                    value={stateTypeInput}
                    onChange={(e) => setStateTypeInput(e.target.value)}
                    placeholder="vd: operating_status, airflow_cfm, temperature"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                  />
                </div>

                <div>
                  <label htmlFor="state-val" className="mb-1 block text-zinc-400">
                    Giá trị đo kiểm (Value)
                  </label>
                  <input
                    id="state-val"
                    value={stateValueInput}
                    onChange={(e) => setStateValueInput(e.target.value)}
                    placeholder="vd: normal, fault, 2500, 24.5"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                  />
                </div>

                <div>
                  <label htmlFor="state-unit" className="mb-1 block text-zinc-400">
                    Đơn vị (Unit - tuỳ chọn)
                  </label>
                  <input
                    id="state-unit"
                    value={stateUnitInput}
                    onChange={(e) => setStateUnitInput(e.target.value)}
                    placeholder="vd: CFM, °C, Pa, kW"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpenAddState(false)}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-700"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={savingState || !stateTypeInput.trim()}
                  onClick={handleSaveState}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 font-medium text-on-accent hover:bg-emerald-600 disabled:opacity-50"
                >
                  {savingState ? "Đang lưu..." : "Lưu snapshot"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Gán liên kết L1 */}
        {openAddBinding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-xs">
              <h3 className="mb-3 text-base font-semibold text-zinc-100">
                Gán liên kết Digital Twin (L1)
              </h3>

              <div className="space-y-3">
                <div>
                  <label htmlFor="bind-type" className="mb-1 block text-zinc-400">
                    Loại liên kết
                  </label>
                  <select
                    id="bind-type"
                    value={bindingTypeInput}
                    onChange={(e) =>
                      setBindingTypeInput(e.target.value as TwinBinding["bindingType"])
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                  >
                    <option value="floor">Tầng (Floor)</option>
                    <option value="zone">Khu vực (Zone)</option>
                    <option value="system">Hệ thống (System)</option>
                    <option value="bim_element">Phần tử BIM (BIM Element)</option>
                    <option value="task">Task thi công</option>
                    <option value="drawing">Bản vẽ (Drawing)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="bind-key" className="mb-1 block text-zinc-400">
                    Mã đích liên kết (Target Key)
                  </label>
                  <input
                    id="bind-key"
                    value={bindingKeyInput}
                    onChange={(e) => setBindingKeyInput(e.target.value)}
                    placeholder="vd: TANG-03, ZONE-A, BIM-GUID-1234..."
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpenAddBinding(false)}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-700"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={savingBinding || !bindingKeyInput.trim()}
                  onClick={handleSaveBinding}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 font-medium text-on-accent hover:bg-amber-500 disabled:opacity-50"
                >
                  {savingBinding ? "Đang gán..." : "Gán liên kết"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
