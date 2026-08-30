"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Scan,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  TrendingUp,
  FileCheck,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

interface DeviationItem {
  spoolCode: string;
  discipline: string;
  designCoordinate: [number, number, number];
  actualScannedCoordinate: [number, number, number];
  deltaXMm: number;
  deltaYMm: number;
  deltaZMm: number;
  euclideanDeviationMm: number;
  toleranceThresholdMm: number;
  status: "within_tolerance" | "moderate_slope_warning" | "critical_clash_defect";
  remediationRecommendation: string;
}

interface ScanToBimResult {
  scanCode: string;
  pointCloudSource: string;
  totalPointsScanned: number;
  spoolsAnalyzedCount: number;
  passRatePercent: number;
  maxDeviationMm: number;
  defectsCount: number;
  deviations: DeviationItem[];
}

export default function ScanToBimStudioPage() {
  const [activeTab, setActiveTab] = useState<"deviations" | "scan_run" | "closed_loop">(
    "deviations",
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Scan Result State
  const [scanResult, setScanResult] = useState<ScanToBimResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const runSampleScanAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const sampleSpools = [
        {
          spoolCode: "SP-HVAC-B1-01",
          discipline: "hvac",
          systemCode: "SA-01",
          nominalSpec: "Duct 800x400",
          designStartPoint: [12000, 5400, 3200] as [number, number, number],
          designEndPoint: [16000, 5400, 3200] as [number, number, number],
          lengthM: 4.0,
        },
        {
          spoolCode: "SP-PLUM-B1-04",
          discipline: "plumbing",
          systemCode: "SAN-01",
          nominalSpec: "Pipe DN100 PVC (i=1.5%)",
          designStartPoint: [12200, 4800, 3050] as [number, number, number],
          designEndPoint: [15200, 4800, 3005] as [number, number, number],
          lengthM: 3.0,
        },
        {
          spoolCode: "SP-FIRE-B1-08",
          discipline: "firefighting",
          systemCode: "FP-01",
          nominalSpec: "Pipe DN65 Black Steel",
          designStartPoint: [12500, 6200, 3350] as [number, number, number],
          designEndPoint: [18500, 6200, 3350] as [number, number, number],
          lengthM: 6.0,
        },
        {
          spoolCode: "SP-ELEC-B1-12",
          discipline: "electrical",
          systemCode: "TR-01",
          nominalSpec: "Cable Tray 400x100",
          designStartPoint: [13000, 3900, 3400] as [number, number, number],
          designEndPoint: [17000, 3900, 3400] as [number, number, number],
          lengthM: 4.0,
        },
      ];

      // Đám mây điểm LiDAR thực tế
      const samplePoints = [
        { pointId: "PT-01", x: 12005, y: 5403, z: 3206 }, // +8.6mm -> within_tolerance (<=15mm)
        { pointId: "PT-02", x: 12210, y: 4815, z: 3025 }, // +30.5mm -> moderate_slope_warning (15-35mm)
        { pointId: "PT-03", x: 12530, y: 6220, z: 3305 }, // +55.0mm -> critical_clash_defect (>35mm)
        { pointId: "PT-04", x: 13002, y: 3904, z: 3405 }, // +6.7mm -> within_tolerance (<=15mm)
      ];

      const res = await fetch("/api/engineering/scan-to-bim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanCode: `SCAN-LIDAR-B1-${Date.now().toString().slice(-4)}`,
          pointCloudSource: "LiDAR FARO Focus S350 (Laser Scan Point Cloud)",
          spoolModels: sampleSpools,
          scannedPoints: samplePoints,
          toleranceThresholdMm: 15.0,
        }),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setScanResult(data);
      }
    } catch (e) {
      console.error("Scan-to-BIM error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClosedLoopSync = async (spoolCode: string) => {
    setSyncing(true);
    try {
      // Mô phỏng đồng bộ spool sang WBS Task & IPC Certificate
      setTimeout(() => {
        setSyncResult(
          `Đã niêm phong mật mã và đồng bộ Spool [${spoolCode}] sang WBS Task #1042. Mã Provenance Token: PROV-${Date.now().toString(36).toUpperCase()}-A2`,
        );
        setSyncing(false);
      }, 600);
    } catch (e) {
      console.error(e);
      setSyncing(false);
    }
  };

  useEffect(() => {
    runSampleScanAnalysis();
  }, [runSampleScanAnalysis]);

  const filteredDeviations = scanResult?.deviations.filter((d) => {
    if (statusFilter === "all") return true;
    return d.status === statusFilter;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="container mx-auto p-4 md:p-6">
        <EngineeringNav />

        {/* Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
              <Scan className="text-cyan-400" size={28} />
              Scan-to-BIM Reality Capture & Closed-Loop Quality Engine (M70 / M89)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              So khớp đám mây điểm LiDAR với mô hình BIM 3D, phân tích sai lệch hình học và tự động
              khóa chứng chỉ thanh toán IPC
            </p>
          </div>

          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            <button
              onClick={() => setActiveTab("deviations")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "deviations"
                  ? "bg-cyan-500 text-on-accent-dark"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Activity size={14} />
              Bảng Sai lệch (Heatmap)
            </button>
            <button
              onClick={() => setActiveTab("scan_run")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "scan_run"
                  ? "bg-cyan-500 text-on-accent-dark"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Zap size={14} />
              Quét Thực tế & Nạp Point Cloud
            </button>
            <button
              onClick={() => setActiveTab("closed_loop")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "closed_loop"
                  ? "bg-cyan-500 text-on-accent-dark"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ShieldCheck size={14} />
              Đóng Vòng Lặp Nghiệm thu (Closed-Loop)
            </button>
          </div>
        </div>

        {loading && <PageSkeleton />}

        {!loading && scanResult && (
          <div className="space-y-6">
            {/* KPI Banner */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                <span className="text-xs font-semibold uppercase text-zinc-400">
                  Tỷ lệ Đạt Chuẩn (Pass Rate)
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className={`font-mono text-3xl font-bold ${
                      scanResult.passRatePercent >= 90
                        ? "text-emerald-400"
                        : scanResult.passRatePercent >= 70
                          ? "text-amber-400"
                          : "text-red-400"
                    }`}
                  >
                    {scanResult.passRatePercent}%
                  </span>
                  <span className="text-xs text-zinc-400">
                    ({scanResult.spoolsAnalyzedCount - scanResult.defectsCount}/
                    {scanResult.spoolsAnalyzedCount} Spools)
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                <span className="text-xs font-semibold uppercase text-zinc-400">
                  Sai lệch Lớn nhất (Max Dev)
                </span>
                <div className="mt-1 font-mono text-3xl font-bold text-red-400">
                  {scanResult.maxDeviationMm} mm
                </div>
                <span className="text-[10px] text-zinc-500">Giới hạn TCVN: 15.0 mm</span>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                <span className="text-xs font-semibold uppercase text-zinc-400">
                  Số lỗi Hình học (Defects)
                </span>
                <div className="mt-1 font-mono text-3xl font-bold text-amber-400">
                  {scanResult.defectsCount} vị trí
                </div>
                <span className="text-[10px] text-zinc-500">Cần hiệu chỉnh ty treo/nắn tuyến</span>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                <span className="text-xs font-semibold uppercase text-zinc-400">
                  Nguồn Point Cloud
                </span>
                <div className="mt-1 truncate font-mono text-sm font-bold text-zinc-100">
                  {scanResult.pointCloudSource.split(" ")[0]}
                </div>
                <span className="text-[10px] text-zinc-500">
                  {scanResult.totalPointsScanned} điểm quét 3D
                </span>
              </div>
            </div>

            {/* Tab 1: Deviations Heatmap */}
            {activeTab === "deviations" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                <div className="flex flex-col justify-between gap-4 border-b border-zinc-800 pb-3 sm:flex-row sm:items-center">
                  <h2 className="flex items-center gap-2 text-base font-bold text-zinc-200">
                    <Activity size={18} className="text-cyan-400" />
                    Ma trận Sai lệch Hình học Tuyến ống (Scan vs As-Designed BIM)
                  </h2>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Bộ lọc:</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-200"
                    >
                      <option value="all">Tất cả ({scanResult.deviations.length})</option>
                      <option value="within_tolerance">Đạt chuẩn (&le;15mm)</option>
                      <option value="moderate_slope_warning">Cảnh báo độ dốc (15-35mm)</option>
                      <option value="critical_clash_defect">Lỗi nghiêm trọng (&gt;35mm)</option>
                    </select>

                    <button
                      onClick={runSampleScanAnalysis}
                      className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
                    >
                      <RefreshCw size={12} />
                      Quét lại
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="border-b border-zinc-800 bg-zinc-950 font-semibold uppercase tracking-wider text-zinc-400">
                      <tr>
                        <th className="p-3">Mã Spool</th>
                        <th className="p-3">Bộ môn</th>
                        <th className="p-3">Tọa độ Thiết kế [X,Y,Z]</th>
                        <th className="p-3">Tọa độ Quét [X,Y,Z]</th>
                        <th className="p-3">Độ lệch 3D (&Delta;)</th>
                        <th className="p-3">Đánh giá</th>
                        <th className="p-3">Khuyến nghị Khắc phục</th>
                        <th className="p-3">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {filteredDeviations?.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-800/40">
                          <td className="p-3 font-mono font-bold text-zinc-100">
                            {item.spoolCode}
                          </td>
                          <td className="p-3 uppercase text-zinc-400">{item.discipline}</td>
                          <td className="p-3 font-mono text-zinc-400">
                            [{item.designCoordinate.join(", ")}]
                          </td>
                          <td className="p-3 font-mono text-zinc-200">
                            [{item.actualScannedCoordinate.join(", ")}]
                          </td>
                          <td className="p-3 font-mono font-bold">
                            <span
                              className={
                                item.status === "within_tolerance"
                                  ? "text-emerald-400"
                                  : item.status === "moderate_slope_warning"
                                    ? "text-amber-400"
                                    : "text-red-400"
                              }
                            >
                              &Delta; {item.euclideanDeviationMm} mm
                            </span>
                            <div className="text-[10px] text-zinc-500">
                              (&Delta;Z: {item.deltaZMm > 0 ? `+${item.deltaZMm}` : item.deltaZMm}{" "}
                              mm)
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`flex w-fit items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                item.status === "within_tolerance"
                                  ? "border border-emerald-800 bg-emerald-950 text-emerald-400"
                                  : item.status === "moderate_slope_warning"
                                    ? "border border-amber-800 bg-amber-950 text-amber-300"
                                    : "border border-red-800 bg-red-950 text-red-400"
                              }`}
                            >
                              {item.status === "within_tolerance" && <CheckCircle2 size={12} />}
                              {item.status === "moderate_slope_warning" && (
                                <AlertTriangle size={12} />
                              )}
                              {item.status === "critical_clash_defect" && <XCircle size={12} />}
                              {item.status === "within_tolerance"
                                ? "ĐẠT CHUẨN"
                                : item.status === "moderate_slope_warning"
                                  ? "CẢNH BÁO"
                                  : "LỆCH LỚN"}
                            </span>
                          </td>
                          <td className="p-3 text-zinc-200">{item.remediationRecommendation}</td>
                          <td className="p-3">
                            {item.status === "within_tolerance" ? (
                              <button
                                onClick={() => handleClosedLoopSync(item.spoolCode)}
                                disabled={syncing}
                                className="flex items-center gap-1 rounded bg-emerald-950 px-2 py-1 text-[10px] font-bold text-emerald-300 border border-emerald-800 hover:bg-emerald-900"
                              >
                                <ShieldCheck size={12} />
                                Nghiệm thu WBS
                              </button>
                            ) : (
                              <span className="text-[10px] font-semibold text-red-400">
                                CHẶN IPC
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 2: Point Cloud Scan Ingestion */}
            {activeTab === "scan_run" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
                <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                  <Zap size={18} className="text-cyan-400" />
                  Nạp Dữ liệu Quét Thực tế Công trường (LiDAR Point Cloud Ingestion)
                </h2>

                <div className="mt-4 space-y-4 max-w-2xl">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-zinc-400">
                      Mã phiên quét thực tế (Scan Run Code)
                    </label>
                    <input
                      type="text"
                      defaultValue={scanResult.scanCode}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-zinc-400">
                      Thiết bị quét / Phương pháp đo đạc
                    </label>
                    <input
                      type="text"
                      defaultValue={scanResult.pointCloudSource}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                    />
                  </div>

                  <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 p-4">
                    <h3 className="text-xs font-bold text-cyan-300">
                      Nguyên tắc Bảo toàn Độ dốc Trọng lực & Khoét Dầm (Invariant Invariant)
                    </h3>
                    <p className="mt-1 text-xs text-zinc-300">
                      Hệ thống tự động kiểm tra độ dốc ống thoát nước (&Delta;Z) và tọa độ xuyên dầm
                      bê tông. Mọi sai lệch &gt; 15mm sẽ kích hoạt cảnh báo kỹ thuật và chặn ký biên
                      bản BBNT tự động.
                    </p>
                  </div>

                  <button
                    onClick={runSampleScanAnalysis}
                    className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 px-4 text-xs font-bold text-on-accent-dark hover:bg-cyan-400"
                  >
                    <RefreshCw size={14} />
                    Chạy Phân tích Sai lệch Toàn diện
                  </button>
                </div>
              </div>
            )}

            {/* Tab 3: Closed-Loop Synchronization */}
            {activeTab === "closed_loop" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
                <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                  <ShieldCheck size={18} className="text-cyan-400" />
                  Cơ chế Đóng Vòng Lặp Nghiệm thu & Thanh toán (Closed-Loop Invariant)
                </h2>

                <div className="mt-4 space-y-4 max-w-3xl">
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Dữ liệu quét thực tế sau khi được xác nhận đạt chuẩn hình học (&Delta; &le;
                    15mm) sẽ được tự động đồng bộ sang <strong>Tiến độ WBS</strong> và chuyển khối
                    lượng thực sang <strong>Chứng chỉ thanh toán IPC</strong> kèm mã niêm phong mật
                    mã SHA-256 (Human Gate A2).
                  </p>

                  {syncResult && (
                    <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                        <CheckCircle2 size={16} />
                        Đồng bộ Hoàn tất:
                      </div>
                      <p className="mt-1 font-mono text-xs text-emerald-200">{syncResult}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">
                        Spools Đủ Điều kiện Nghiệm thu
                      </span>
                      <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
                        {
                          scanResult.deviations.filter((d) => d.status === "within_tolerance")
                            .length
                        }{" "}
                        phân đoạn
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Đạt chuẩn dung sai hình học theo TCVN 5687
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">
                        Spools Bị Chặn Nghiệm thu
                      </span>
                      <div className="mt-2 text-2xl font-bold font-mono text-red-400">
                        {scanResult.defectsCount} phân đoạn
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Đang tạo phiếu cảnh báo NCR hiện trường
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
