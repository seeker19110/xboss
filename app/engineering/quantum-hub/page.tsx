"use client";

import { useState, useEffect } from "react";
import AppHeader from "@/app/components/AppHeader";
import ThuNghiemBanner from "@/app/components/ThuNghiemBanner";
import EngineeringNav from "@/app/components/EngineeringNav";
import {
  Zap,
  Database,
  ShieldCheck,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  Activity,
  Maximize2,
  Box,
} from "lucide-react";

// Tab "Hàng đợi tác vụ phân tán" đã gỡ cùng cụm `/api/engineering/queue/**` — hàng đợi đó chỉ có
// daemon Python `mepf-worker` tiêu thụ, worker bị xoá thì tác vụ nạp vào nằm `pending` vĩnh viễn.
export default function QuantumHubPage() {
  const [activeTab, setActiveTab] = useState<"spatial" | "merkle">("spatial");

  // State Tab 1: Spatial Compute
  const [computeType, setComputeType] = useState<
    "sweep_volume" | "voxel_clashes" | "sheet_nesting"
  >("sweep_volume");
  const [spatialResult, setSpatialResult] = useState<Record<string, unknown> | null>(null);
  const [spatialLoading, setSpatialLoading] = useState(false);

  // State Tab 2: Merkle Ledger
  const [merkleRoots, setMerkleRoots] = useState<Array<Record<string, unknown>>>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [sealingBatch, setSealingBatch] = useState(false);
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null);

  // Load Merkle Roots
  const fetchMerkleRoots = async () => {
    setLedgerLoading(true);
    try {
      const res = await fetch("/api/engineering/ledger/merkle");
      const data = await res.json();
      if (data.roots) setMerkleRoots(data.roots);
    } catch {
      // Ignored
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "merkle") fetchMerkleRoots();
  }, [activeTab]);

  // Run Spatial Compute
  const handleRunSpatialCompute = async () => {
    setSpatialLoading(true);
    try {
      const res = await fetch("/api/engineering/spatial/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ computeType }),
      });
      const data = await res.json();
      if (data.success) setSpatialResult(data.result);
    } catch {
      // Ignored
    } finally {
      setSpatialLoading(false);
    }
  };

  // Seal Merkle Batch
  const handleSealMerkleBatch = async () => {
    setSealingBatch(true);
    try {
      await fetch("/api/engineering/ledger/merkle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchCode: `BATCH-AUDIT-${Date.now().toString(36).toUpperCase()}`,
          records: [
            {
              event: "ACCEPTANCE_BBNT",
              taskId: "TASK-001",
              status: "APPROVED",
              at: new Date().toISOString(),
            },
            {
              event: "MATERIAL_TX",
              materialId: "MAT-042",
              delta: -15,
              unit: "Cay",
              at: new Date().toISOString(),
            },
            {
              event: "PROGRESS_TICK",
              dimensionId: 108,
              checked: true,
              at: new Date().toISOString(),
            },
            {
              event: "QAQC_INSPECTION",
              requestId: "INSP-099",
              result: "PASSED",
              at: new Date().toISOString(),
            },
          ],
        }),
      });
      fetchMerkleRoots();
    } catch {
      // Ignored
    } finally {
      setSealingBatch(false);
    }
  };

  // Verify Demo Proof
  const handleVerifyDemoProof = async (rootHash: string) => {
    try {
      const demoRecord = {
        event: "ACCEPTANCE_BBNT",
        taskId: "TASK-001",
        status: "APPROVED",
      };
      const res = await fetch("/api/engineering/ledger/verify-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leafRecord: demoRecord,
          proof: [],
          expectedRoot: rootHash,
        }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      // Ignored
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Quantum Core & Merkle Ledger (M73)" />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <EngineeringNav />
        <ThuNghiemBanner moduleKey="engineering-quantum-hub" />

        {/* Tab Navigation */}
        <div className="mb-6 flex space-x-2 border-b border-zinc-800 pb-2">
          <button
            onClick={() => setActiveTab("spatial")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "spatial"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            <Zap size={16} />
            <span>1. Siêu Tính Toán Không Gian (WASM)</span>
          </button>
          <button
            onClick={() => setActiveTab("merkle")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "merkle"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            <Database size={16} />
            <span>2. Sổ Cái Merkle Bất Biến (Ledger)</span>
          </button>
        </div>

        {/* TAB 1: SPATIAL COMPUTE */}
        {activeTab === "spatial" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-zinc-100">
                <Box size={18} className="text-amber-400" />
                <span>Cấu Hình Thuật Toán Không Gian</span>
              </h3>
              <p className="mb-4 text-xs text-zinc-400">
                Lựa chọn động cơ tính toán hình học 3D siêu tốc có hỗ trợ Spatial Hash Caching.
              </p>

              <div className="space-y-3">
                <label className="block text-xs font-medium text-zinc-300">Loại thuật toán:</label>
                <div className="space-y-2">
                  <button
                    onClick={() => setComputeType("sweep_volume")}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${
                      computeType === "sweep_volume"
                        ? "border border-amber-500/50 bg-amber-500/10 text-amber-300"
                        : "border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    1. 3D Polyline Sweep Volume (Quét thể tích tuyến ống)
                  </button>
                  <button
                    onClick={() => setComputeType("voxel_clashes")}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${
                      computeType === "voxel_clashes"
                        ? "border border-amber-500/50 bg-amber-500/10 text-amber-300"
                        : "border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    2. Spatial AABB Voxel Clash Grid (Giao cắt không gian)
                  </button>
                  <button
                    onClick={() => setComputeType("sheet_nesting")}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${
                      computeType === "sheet_nesting"
                        ? "border border-amber-500/50 bg-amber-500/10 text-amber-300"
                        : "border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    3. 2D Sheet Nesting Optimization (Xếp phôi tấm tôn)
                  </button>
                </div>

                <button
                  onClick={handleRunSpatialCompute}
                  disabled={spatialLoading}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-semibold text-on-accent-dark hover:bg-amber-400 disabled:opacity-50"
                >
                  <Play size={14} />
                  <span>{spatialLoading ? "Đang Tính Toán..." : "Kích Hoạt Siêu Tính Toán"}</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-2">
              <h3 className="mb-3 flex items-center justify-between text-base font-semibold text-zinc-100">
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-emerald-400" />
                  <span>Kết Quả Tính Toán & Trạng Thái Cache</span>
                </div>
                {spatialResult && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      (spatialResult as { fromCache?: boolean }).fromCache
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    }`}
                  >
                    {(spatialResult as { fromCache?: boolean }).fromCache
                      ? "Cache Hit (0ms)"
                      : "Fresh Compute"}
                  </span>
                )}
              </h3>

              {spatialResult ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-xs text-zinc-400">Thời gian chạy</div>
                      <div className="text-sm font-bold text-amber-300">
                        {String((spatialResult as { durationMs?: number }).durationMs ?? 0)} ms
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-xs text-zinc-400">Input Hash</div>
                      <div className="truncate font-mono text-xs text-zinc-300">
                        {String((spatialResult as { inputHash?: string }).inputHash ?? "N/A").slice(
                          0,
                          10,
                        )}
                        ...
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-xs text-zinc-400">Động cơ</div>
                      <div className="text-sm font-semibold text-zinc-200">WASM / V8</div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-xs text-zinc-400">Độ chính xác</div>
                      <div className="text-sm font-semibold text-emerald-400">100% Exact</div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <div className="mb-2 text-xs font-medium text-zinc-300">
                      Dữ liệu chi tiết kết quả:
                    </div>
                    <pre className="max-h-64 overflow-auto rounded bg-zinc-900 p-3 font-mono text-xs text-zinc-300">
                      {JSON.stringify(
                        (spatialResult as { data?: unknown }).data ?? spatialResult,
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-zinc-500">
                  <Maximize2 size={32} className="mb-2 stroke-1 text-zinc-600" />
                  <span>
                    Chọn loại thuật toán và nhấn &quot;Kích Hoạt Siêu Tính Toán&quot; để xem kết
                    quả.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: IMMUTABLE MERKLE LEDGER */}
        {activeTab === "merkle" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  Sổ Cái Mật Mã Merkle Tree Bất Biến (Cryptographic Ledger)
                </h3>
                <p className="text-xs text-zinc-400">
                  Mỗi chu kỳ nghiệm thu/tiến độ được đóng dấu cây Merkle SHA-256 bất biến, chống
                  chối bỏ toán học.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSealMerkleBatch}
                  disabled={sealingBatch}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-on-accent-dark hover:bg-emerald-400 disabled:opacity-50"
                >
                  <ShieldCheck size={14} />
                  <span>{sealingBatch ? "Đang Niêm Phong..." : "Niêm Phong Batch Mới"}</span>
                </button>
                <button
                  onClick={fetchMerkleRoots}
                  disabled={ledgerLoading}
                  className="rounded-lg border border-zinc-700 p-2 text-zinc-400 hover:text-zinc-200"
                >
                  <RotateCcw size={14} className={ledgerLoading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h4 className="mb-3 text-xs font-semibold text-zinc-300">
                    Danh Mục Các Khối Merkle Root Đã Niêm Phong
                  </h4>
                  <div className="space-y-3">
                    {merkleRoots.length > 0 ? (
                      merkleRoots.map((r) => (
                        <div
                          key={String(r.id)}
                          className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between pb-2">
                            <span className="font-semibold text-emerald-300">
                              {String(r.batch_code)}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                              <Clock size={12} />
                              <span>{new Date(String(r.created_at)).toLocaleTimeString()}</span>
                            </span>
                          </div>
                          <div className="space-y-1 font-mono text-[11px] text-zinc-400">
                            <div>
                              <span className="text-zinc-500">Root Hash: </span>
                              <span className="text-amber-300">{String(r.merkle_root)}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500">Token Ký Số: </span>
                              <span className="text-zinc-300">{String(r.signature_token)}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span>Số lá sự kiện: {String(r.leaf_count)}</span>
                              <button
                                onClick={() => handleVerifyDemoProof(String(r.merkle_root))}
                                className="rounded bg-zinc-800 px-2 py-1 font-sans text-[10px] text-zinc-200 hover:bg-zinc-700"
                              >
                                Test Xác Thực Proof
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-center text-xs text-zinc-500">
                        Chưa có khối Merkle nào được niêm phong. Nhấn &quot;Niêm Phong Batch
                        Mới&quot; để tạo.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span>Kết Quả Xác Thực Merkle Proof</span>
                  </h4>
                  {verifyResult ? (
                    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">Kết luận:</span>
                        <span
                          className={`font-semibold ${
                            (verifyResult as { isValid?: boolean }).isValid
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {(verifyResult as { isValid?: boolean }).isValid
                            ? "✅ XÁC THỰC TOÀN VẸN 100%"
                            : "❌ DỮ LIỆU BỊ SỬA ĐỔI"}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-zinc-400">
                        <div className="truncate">
                          <span className="text-zinc-500">Leaf: </span>
                          <span>{String((verifyResult as { leafHash?: string }).leafHash)}</span>
                        </div>
                        <div className="truncate">
                          <span className="text-zinc-500">Root: </span>
                          <span>
                            {String((verifyResult as { expectedRoot?: string }).expectedRoot)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-zinc-500">
                      Chọn &quot;Test Xác Thực Proof&quot; ở khối bên trái để chạy đối soát toán
                      học.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
