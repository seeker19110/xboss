"use client";

import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { Skeleton } from "@/app/components/Skeleton";
import {
  Route,
  ShieldCheck,
  AlertTriangle,
  Play,
  Layers,
  Box,
  Compass,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Sliders,
  Maximize2,
  ArrowRight,
} from "lucide-react";

interface SleeveRecord {
  id: string;
  drawingCode: string;
  beamRef: string;
  sleeveType: string;
  diameterMm: number;
  beamDepthMm: number;
  beamSpanMm: number;
  coordX: number;
  coordY: number;
  coordZ: number;
  isStructuralApproved: boolean;
  validationResult: {
    isValid: boolean;
    violations: string[];
    maxAllowedDiameterMm: number;
  };
  status: string;
}

export default function AutoRoutingPage() {
  // Routing Pathfinding State
  const [startPoint, setStartPoint] = useState({ x: 0, y: 1000, z: 3200 });
  const [endPoint, setEndPoint] = useState({ x: 4500, y: 3000, z: 3200 });
  const [obstacles, setObstacles] = useState([
    {
      minX: 1800,
      minY: 800,
      minZ: 2800,
      maxX: 2400,
      maxY: 3200,
      maxZ: 3600,
      label: "Dầm Chính D2 (600x800)",
    },
  ]);
  const [routeResult, setRouteResult] = useState<any>(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  // Beam Sleeve Validation State
  const [sleeveForm, setSleeveForm] = useState({
    drawingCode: "DWG-M-FL08-01",
    beamRef: "D3-A1 (400x700)",
    sleeveType: "pipe_sleeve",
    diameterMm: 150,
    beamDepthMm: 700,
    beamSpanMm: 6000,
    coordX: 1800,
    coordY: 1200,
    coordZ: 3350,
  });
  const [sleeves, setSleeves] = useState<SleeveRecord[]>([]);
  const [sleevesLoading, setSleevesLoading] = useState(true);

  // Trade Clash State
  const [tradeA, setTradeA] = useState("GRAVITY_DRAINAGE");
  const [tradeB, setTradeB] = useState("LARGE_HVAC_DUCT");
  const [clashAdvice, setClashAdvice] = useState<any>(null);

  // Spatial Grid Clash State
  const [spatialClashResults, setSpatialClashResults] = useState<any[]>([]);
  const [spatialClashLoading, setSpatialClashLoading] = useState(false);

  const fetchSleeves = useCallback(async () => {
    try {
      setSleevesLoading(true);
      const res = await fetch("/api/engineering/routing/sleeves");
      if (res.ok) {
        const d = await res.json();
        setSleeves(d.data || []);
      }
    } catch {
      // Ignore
    } finally {
      setSleevesLoading(false);
    }
  }, []);

  const handleRunSpatialClash = async () => {
    setSpatialClashLoading(true);
    try {
      const sampleBoxes = [
        {
          elementGuid: "ELEM-DUCT-01",
          discipline: "HVAC",
          min: [1000, 800, 2800],
          max: [3000, 1400, 3400],
        },
        {
          elementGuid: "ELEM-BEAM-D2",
          discipline: "STRUCTURE",
          min: [1800, 800, 2800],
          max: [2400, 3200, 3600],
        },
        {
          elementGuid: "ELEM-PIPE-DN100",
          discipline: "PLUMBING",
          min: [1500, 1000, 3100],
          max: [1600, 2800, 3200],
        },
      ];

      const res = await fetch("/api/engineering/bim-routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "spatial_clash",
          boundingBoxes: sampleBoxes,
          softClearanceMm: 50,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSpatialClashResults(data.clashes || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSpatialClashLoading(false);
    }
  };

  useEffect(() => {
    fetchSleeves();
  }, [fetchSleeves]);

  const handleComputeRoute = async () => {
    try {
      setRoutingLoading(true);
      const res = await fetch("/api/engineering/routing/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: startPoint,
          end: endPoint,
          obstacles,
          tradeA,
          tradeB,
        }),
      });

      if (res.ok) {
        const d = await res.json();
        setRouteResult(d.data?.route);
        setClashAdvice(d.data?.clashAdvice);
      }
    } catch {
      // Ignore
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleCreateSleeve = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/engineering/routing/sleeves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sleeveForm),
      });

      if (res.ok) {
        await fetchSleeves();
      }
    } catch {
      // Ignore
    }
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
              AI Multi-Trade Auto-Routing & Beam Sleeve Clash Solver (M77)
            </h1>
            <p className="text-xs text-zinc-400">
              Thuật toán 3D A* Pathfinding tự động phối hợp tuyến tránh va chạm & Kiểm chuẩn lỗ
              khoét dầm Beam Sleeve
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cột Trái & Giữa: Bảng Điều Khiển Auto-Routing */}
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-violet-400">
                  <Route size={16} />
                  <h3 className="text-xs font-semibold">Tự Động Tìm Tuyến 3D (A* Pathfinding)</h3>
                </div>
                <button
                  onClick={handleComputeRoute}
                  disabled={routingLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  <Play size={12} /> {routingLoading ? "Đang tính..." : "Tính Toán Tuyến Tối Ưu"}
                </button>
              </div>

              {/* Toạ độ Start & End */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2">
                  <span className="text-[11px] font-semibold text-emerald-400">
                    Điểm Đầu (Start Point)
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-zinc-500">X (mm)</label>
                      <input
                        type="number"
                        value={startPoint.x}
                        onChange={(e) =>
                          setStartPoint((p) => ({ ...p, x: Number(e.target.value) }))
                        }
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500">Y (mm)</label>
                      <input
                        type="number"
                        value={startPoint.y}
                        onChange={(e) =>
                          setStartPoint((p) => ({ ...p, y: Number(e.target.value) }))
                        }
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500">Z (mm)</label>
                      <input
                        type="number"
                        value={startPoint.z}
                        onChange={(e) =>
                          setStartPoint((p) => ({ ...p, z: Number(e.target.value) }))
                        }
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2">
                  <span className="text-[11px] font-semibold text-sky-400">
                    Điểm Cuối (End Point)
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-zinc-500">X (mm)</label>
                      <input
                        type="number"
                        value={endPoint.x}
                        onChange={(e) => setEndPoint((p) => ({ ...p, x: Number(e.target.value) }))}
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500">Y (mm)</label>
                      <input
                        type="number"
                        value={endPoint.y}
                        onChange={(e) => setEndPoint((p) => ({ ...p, y: Number(e.target.value) }))}
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500">Z (mm)</label>
                      <input
                        type="number"
                        value={endPoint.z}
                        onChange={(e) => setEndPoint((p) => ({ ...p, z: Number(e.target.value) }))}
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Kết Quả Tuyến Auto-Route */}
              {routeResult && (
                <div className="rounded-lg border border-violet-700/40 bg-violet-950/20 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-violet-300">
                      Kết Quả Tuyến: {routeResult.totalLengthM} m | {routeResult.elbowCount} Co lơ
                    </span>
                    <span className="rounded bg-violet-900/60 px-2 py-0.5 text-[10px] font-mono text-violet-200">
                      Sụt áp dự tính: {routeResult.estimatedHeadLossPa} Pa
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300">{routeResult.pathExplanation}</p>

                  {/* Waypoints List */}
                  <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono text-zinc-400">
                    {routeResult.waypoints.map((wp: any, idx: number) => (
                      <span key={idx} className="flex items-center gap-1">
                        <span className="rounded bg-zinc-900 px-1.5 py-0.5 border border-zinc-800">
                          P{idx}: ({wp.x}, {wp.y}, {wp.z})
                        </span>
                        {idx < routeResult.waypoints.length - 1 && <ArrowRight size={10} />}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Trade Clash Hierarchy Advice */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2">
                <span className="text-[11px] font-semibold text-amber-400">
                  Xử Lý Va Chạm Theo Thứ Tự Ưu Tiên (Trade Hierarchy)
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-zinc-500">Hệ Thống A</label>
                    <select
                      value={tradeA}
                      onChange={(e) => setTradeA(e.target.value)}
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                    >
                      <option value="GRAVITY_DRAINAGE">Thoát nước tự chảy (Độ dốc 1-2%)</option>
                      <option value="LARGE_HVAC_DUCT">Ống gió lớn HVAC</option>
                      <option value="FIRE_SPRINKLER">Chữa cháy PCCC Sprinkler</option>
                      <option value="CHILLED_WATER_PIPE">Ống Chiller cấp lạnh</option>
                      <option value="DOMESTIC_WATER_PIPE">Ống cấp nước sinh hoạt</option>
                      <option value="ELECTRICAL_CABLE_TRAY">Khay máng cáp điện</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Hệ Thống B</label>
                    <select
                      value={tradeB}
                      onChange={(e) => setTradeB(e.target.value)}
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                    >
                      <option value="LARGE_HVAC_DUCT">Ống gió lớn HVAC</option>
                      <option value="GRAVITY_DRAINAGE">Thoát nước tự chảy</option>
                      <option value="FIRE_SPRINKLER">Chữa cháy PCCC Sprinkler</option>
                      <option value="ELECTRICAL_CABLE_TRAY">Khay máng cáp điện</option>
                    </select>
                  </div>
                </div>

                {clashAdvice && (
                  <div className="mt-2 rounded bg-amber-950/30 p-2 text-xs text-amber-200 border border-amber-800/40">
                    <p className="font-semibold">{clashAdvice.solution}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">{clashAdvice.actionRequired}</p>
                  </div>
                )}
              </div>

              {/* Spatial Grid Clash Detection Panel */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sky-400">
                    <Box size={16} />
                    <span className="text-xs font-semibold">
                      Quét Va Chạm Lưới Không Gian (Spatial Grid Clash Index)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunSpatialClash}
                    disabled={spatialClashLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    <Play size={11} />
                    {spatialClashLoading ? "Đang quét..." : "Quét Va Chạm O(n log n)"}
                  </button>
                </div>

                {spatialClashResults.length > 0 ? (
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <div className="text-[11px] text-zinc-400">
                      Phát hiện{" "}
                      <span className="font-bold text-rose-400">{spatialClashResults.length}</span>{" "}
                      điểm xung đột không gian:
                    </div>
                    {spatialClashResults.map((c: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-zinc-950 p-2.5 text-xs border border-zinc-800"
                      >
                        <div className="space-y-0.5">
                          <span className="font-bold text-zinc-200">
                            {c.elementA} &harr; {c.elementB}
                          </span>
                          <div className="text-[10px] text-zinc-400">
                            Khoảng hở đo được:{" "}
                            <span className="font-mono text-amber-300">{c.clearanceMm} mm</span>{" "}
                            (Soft clearance tối thiểu: 50mm)
                          </div>
                        </div>
                        <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800 uppercase">
                          {c.clashType.replace("_", " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    Bấm &ldquo;Quét Va Chạm&rdquo; để kiểm tra giao cắt giữa các khối bounding box
                    cơ điện và dầm kết cấu.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Cột Phải: Bảng Kiểm Chuẩn Lỗ Khoét Dầm (Beam Sleeve) */}
          <div className="space-y-4 lg:col-span-1">
            <form
              onSubmit={handleCreateSleeve}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3"
            >
              <div className="flex items-center gap-2 text-emerald-400">
                <ShieldCheck size={16} />
                <h3 className="text-xs font-semibold">Kiểm Chuẩn Lỗ Khoét Dầm (Beam Sleeve)</h3>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-[10px] text-zinc-500">Ký hiệu dầm</label>
                  <input
                    type="text"
                    required
                    value={sleeveForm.beamRef}
                    onChange={(e) => setSleeveForm((p) => ({ ...p, beamRef: e.target.value }))}
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500">Đường kính lỗ (mm)</label>
                    <input
                      type="number"
                      required
                      value={sleeveForm.diameterMm}
                      onChange={(e) =>
                        setSleeveForm((p) => ({ ...p, diameterMm: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Chiều cao dầm H (mm)</label>
                    <input
                      type="number"
                      required
                      value={sleeveForm.beamDepthMm}
                      onChange={(e) =>
                        setSleeveForm((p) => ({ ...p, beamDepthMm: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500">Nhịp dầm L (mm)</label>
                    <input
                      type="number"
                      required
                      value={sleeveForm.beamSpanMm}
                      onChange={(e) =>
                        setSleeveForm((p) => ({ ...p, beamSpanMm: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Vị trí X từ gối (mm)</label>
                    <input
                      type="number"
                      required
                      value={sleeveForm.coordX}
                      onChange={(e) =>
                        setSleeveForm((p) => ({ ...p, coordX: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
              >
                Kiểm Chuẩn & Thêm Vào Bảng Sleeve
              </button>
            </form>

            {/* Danh Sách Sleeve Đã Lưu */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-200">
                  Bảng Thống Kê Sleeve ({sleeves.length})
                </h4>
                <button onClick={fetchSleeves} className="text-zinc-500 hover:text-zinc-300">
                  <RefreshCw size={12} />
                </button>
              </div>

              {sleevesLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : sleeves.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-500">Chưa có lỗ khoét dầm nào</p>
              ) : (
                <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                  {sleeves.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-200">{s.beamRef}</span>
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            s.isStructuralApproved
                              ? "bg-emerald-950/40 text-emerald-400"
                              : "bg-rose-950/40 text-rose-400"
                          }`}
                        >
                          {s.isStructuralApproved ? (
                            <CheckCircle2 size={10} />
                          ) : (
                            <XCircle size={10} />
                          )}
                          {s.isStructuralApproved ? "HỢP CHUẨN" : "VI PHẠM"}
                        </span>
                      </div>

                      <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
                        <span>Lỗ: Ø{s.diameterMm}mm</span>
                        <span>Dầm: {s.beamDepthMm}mm</span>
                        <span>X: {s.coordX}mm</span>
                      </div>

                      {s.validationResult?.violations?.length > 0 && (
                        <p className="mt-1 text-[10px] text-rose-400">
                          ⚠ {s.validationResult.violations[0]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
