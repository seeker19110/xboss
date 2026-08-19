"use client";
import { useEffect, useState } from "react";
import {
  Radio,
  Scan,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Layers,
  MapPin,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

interface RealityCapture {
  id: string;
  project_id: number;
  capture_code: string;
  capture_type: string;
  spatial_zone: string;
  elevation_level: string | null;
  capture_timestamp: string;
  total_points: number;
  storage_uri: string;
  processing_status: string;
  metadata: Record<string, unknown>;
}

interface SpatialDeviation {
  id: string;
  project_id: number;
  capture_id: string;
  object_id: string;
  element_guid: string | null;
  deviation_type: string;
  measured_deviation_mm: string | number;
  tolerance_threshold_mm: string | number;
  severity: "low" | "medium" | "high" | "critical";
  point_coordinates: { x?: number; y?: number; z?: number };
  remediation_status: "open" | "acknowledged" | "remediated" | "accepted_as_built" | "rejected";
  capture_code?: string;
  capture_type?: string;
  spatial_zone?: string;
  object_name?: string;
  object_code?: string;
}

interface SensorStream {
  id: string;
  project_id: number;
  sensor_code: string;
  sensor_type: string;
  object_id: string | null;
  sampling_interval_seconds: number;
  latest_value: number | string | null;
  latest_unit: string | null;
  latest_observed_at: string | null;
  anomaly_status: "normal" | "warning" | "critical" | "offline";
  threshold_config: { min?: number | null; max?: number | null; critical_max?: number | null };
  object_name?: string;
  object_code?: string;
}

export default function LivingTwinRealityPage() {
  const [loading, setLoading] = useState(true);
  const [captures, setCaptures] = useState<RealityCapture[]>([]);
  const [deviations, setDeviations] = useState<SpatialDeviation[]>([]);
  const [sensors, setSensors] = useState<SensorStream[]>([]);
  const [activeTab, setActiveTab] = useState<"deviations" | "captures" | "sensors">("deviations");
  const [error, setError] = useState<string | null>(null);

  // New Capture Modal
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [captureCode, setCaptureCode] = useState("");
  const [captureType, setCaptureType] = useState("lidar_pointcloud");
  const [spatialZone, setSpatialZone] = useState("Zone A - Level 3");
  const [storageUri, setStorageUri] = useState("s3://xboss-pointclouds/proj-1/capture-01.las");
  const [totalPoints, setTotalPoints] = useState(1500000);

  // Remediation Action
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resCaptures, resDeviations, resSensors] = await Promise.all([
        fetch("/api/engineering/twin/reality-capture"),
        fetch("/api/engineering/twin/deviations"),
        fetch("/api/engineering/twin/sensors"),
      ]);

      if (resCaptures.status === 401 || resDeviations.status === 401 || resSensors.status === 401) {
        redirectToLogin();
        return;
      }

      if (!resCaptures.ok || !resDeviations.ok || !resSensors.ok) {
        throw new Error("Không thể tải dữ liệu Living Digital Twin");
      }

      const [dataCaptures, dataDeviations, dataSensors] = await Promise.all([
        resCaptures.json(),
        resDeviations.json(),
        resSensors.json(),
      ]);

      setCaptures(Array.isArray(dataCaptures) ? dataCaptures : []);
      setDeviations(Array.isArray(dataDeviations) ? dataDeviations : []);
      setSensors(Array.isArray(dataSensors) ? dataSensors : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captureCode || !spatialZone || !storageUri) return;

    try {
      const res = await fetch("/api/engineering/twin/reality-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captureCode,
          captureType,
          spatialZone,
          storageUri,
          totalPoints: Number(totalPoints),
          captureTimestamp: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Lỗi tạo bản ghi reality capture");
      }

      setShowCaptureModal(false);
      setCaptureCode("");
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemediate = async (deviationId: string, status: string) => {
    setActionLoadingId(deviationId);
    try {
      const res = await fetch(`/api/engineering/twin/deviations/${deviationId}/remediate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Lỗi cập nhật trạng thái");
      }

      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader />
        <main className="mx-auto max-w-7xl px-4 py-8">
          <EngineeringNav />
          <PageSkeleton />
        </main>
      </div>
    );
  }

  const criticalDeviations = deviations.filter(
    (d) => d.severity === "critical" && d.remediation_status === "open",
  );
  const activeSensors = sensors.filter((s) => s.anomaly_status !== "offline");
  const sensorAnomalies = sensors.filter(
    (s) => s.anomaly_status === "warning" || s.anomaly_status === "critical",
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <EngineeringNav />

        {/* Title and Controls */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
              <Radio className="text-amber-400" size={28} />
              Living Digital Twin (L4–L6) & Khảo sát Thực địa 3D
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Đối soát sai lệch không gian BIM vs As-Built thời gian thực và giám sát luồng cảm biến
              IoT hiện trường.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchData()}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              <RefreshCw size={16} />
              Làm mới
            </button>
            <button
              onClick={() => setShowCaptureModal(true)}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400"
            >
              <Plus size={16} />
              Nạp Reality Capture
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* KPI Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-sm font-medium">Đợt quét thực địa (Captures)</span>
              <Scan size={18} className="text-sky-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-zinc-100">{captures.length}</div>
            <div className="mt-1 text-xs text-zinc-400">Point-Cloud, LiDAR & Drone 3D</div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-sm font-medium">Sai lệch BIM vs As-Built</span>
              <AlertTriangle size={18} className="text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-400">{deviations.length}</div>
            <div className="mt-1 text-xs text-zinc-400">
              <span className="font-semibold text-rose-400">{criticalDeviations.length}</span> vi
              phạm nghiêm trọng (Critical)
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-sm font-medium">Luồng cảm biến IoT (L5–L6)</span>
              <Activity size={18} className="text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-400">{activeSensors.length}</div>
            <div className="mt-1 text-xs text-zinc-400">Nhiệt độ, áp suất, độ rung, nghiêng</div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-sm font-medium">Bất thường cảm biến</span>
              <Zap size={18} className="text-rose-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-400">{sensorAnomalies.length}</div>
            <div className="mt-1 text-xs text-zinc-400">Vượt ngưỡng an toàn cho phép</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab("deviations")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "deviations"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <AlertTriangle size={16} />
            Sai lệch BIM vs As-Built ({deviations.length})
          </button>
          <button
            onClick={() => setActiveTab("captures")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "captures"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Scan size={16} />
            Đợt quét thực địa ({captures.length})
          </button>
          <button
            onClick={() => setActiveTab("sensors")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "sensors"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Activity size={16} />
            Cảm biến IoT thời gian thực ({sensors.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "deviations" && (
          <div className="space-y-4">
            {deviations.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="Không phát hiện sai lệch không gian"
                message="Toàn bộ tọa độ thực địa quét từ đám mây điểm khớp chuẩn với mô hình BIM thiết kế trong ngưỡng cho phép."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Phần tử / Đối tượng</th>
                      <th className="px-4 py-3">Loại sai lệch</th>
                      <th className="px-4 py-3">Sai số đo được</th>
                      <th className="px-4 py-3">Dung sai chuẩn</th>
                      <th className="px-4 py-3">Mức độ</th>
                      <th className="px-4 py-3">Khu vực / Tọa độ (m)</th>
                      <th className="px-4 py-3">Trạng thái xử lý</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {deviations.map((dev) => (
                      <tr key={dev.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-200">
                            {dev.object_name || "Đối tượng kỹ thuật"}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {dev.object_code || dev.element_guid || dev.object_id}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-zinc-800 px-2 py-1 text-xs font-mono text-zinc-300">
                            {dev.deviation_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-rose-400">
                          {dev.measured_deviation_mm} mm
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          ±{dev.tolerance_threshold_mm} mm
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              dev.severity === "critical"
                                ? "bg-rose-950 text-rose-400 border border-rose-800/50"
                                : dev.severity === "high"
                                  ? "bg-amber-950 text-amber-400 border border-amber-800/50"
                                  : "bg-sky-950 text-sky-400 border border-sky-800/50"
                            }`}
                          >
                            {dev.severity.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-400">
                          <div>{dev.spatial_zone || "Zone A"}</div>
                          <div className="font-mono text-zinc-400">
                            x:{dev.point_coordinates?.x ?? 0}, y:{dev.point_coordinates?.y ?? 0}, z:
                            {dev.point_coordinates?.z ?? 0}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-zinc-800/80 px-2 py-1 text-xs text-zinc-300">
                            {dev.remediation_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {dev.remediation_status === "open" && (
                            <div className="flex justify-end gap-1">
                              <button
                                disabled={actionLoadingId === dev.id}
                                onClick={() => handleRemediate(dev.id, "acknowledged")}
                                className="rounded bg-zinc-800 px-2 py-1 text-xs text-amber-300 hover:bg-zinc-700"
                              >
                                Tiếp nhận
                              </button>
                              <button
                                disabled={actionLoadingId === dev.id}
                                onClick={() => handleRemediate(dev.id, "accepted_as_built")}
                                className="rounded bg-emerald-950 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-900 border border-emerald-800/40"
                              >
                                Chấp thuận As-Built
                              </button>
                            </div>
                          )}
                          {dev.remediation_status === "acknowledged" && (
                            <button
                              disabled={actionLoadingId === dev.id}
                              onClick={() => handleRemediate(dev.id, "remediated")}
                              className="rounded bg-sky-950 px-2 py-1 text-xs text-sky-400 hover:bg-sky-900 border border-sky-800/40"
                            >
                              Đã sửa chữa
                            </button>
                          )}
                          {dev.remediation_status === "remediated" && (
                            <span className="text-xs text-emerald-400 flex items-center justify-end gap-1">
                              <CheckCircle2 size={14} /> Hoàn tất
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "captures" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {captures.length === 0 ? (
              <div className="col-span-full">
                <EmptyState
                  icon={Scan}
                  title="Chưa có dữ liệu reality capture"
                  message="Bấm 'Nạp Reality Capture' để tải lên dữ liệu quét 3D point-cloud, ảnh drone hoặc camera AI."
                />
              </div>
            ) : (
              captures.map((cap) => (
                <div key={cap.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-zinc-100">{cap.capture_code}</div>
                      <div className="text-xs text-zinc-400">{cap.capture_type}</div>
                    </div>
                    <span className="rounded bg-emerald-950 border border-emerald-800/50 px-2 py-0.5 text-xs text-emerald-400">
                      {cap.processing_status}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-xs text-zinc-300">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-amber-400" />
                      <span>
                        Khu vực: {cap.spatial_zone}{" "}
                        {cap.elevation_level && `(${cap.elevation_level})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-sky-400" />
                      <span>Số điểm quét: {Number(cap.total_points).toLocaleString()} points</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-400">
                      <ArrowUpRight size={14} />
                      <span className="truncate font-mono">{cap.storage_uri}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                    Thời điểm ghi nhận: {new Date(cap.capture_timestamp).toLocaleString("vi-VN")}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "sensors" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sensors.length === 0 ? (
              <div className="col-span-full">
                <EmptyState
                  icon={Activity}
                  title="Chưa kết nối luồng cảm biến IoT"
                  message="Các cảm biến đo nhiệt độ, áp suất, độ nghiêng và độ rung sẽ được truyền qua endpoint API /api/engineering/twin/sensors/telemetry."
                />
              </div>
            ) : (
              sensors.map((s) => (
                <div key={s.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-zinc-100">{s.sensor_code}</div>
                      <div className="text-xs text-zinc-400">
                        {s.sensor_type} • {s.object_name || "Hệ thống chung"}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        s.anomaly_status === "critical"
                          ? "bg-rose-950 text-rose-400 border border-rose-800/50"
                          : s.anomaly_status === "warning"
                            ? "bg-amber-950 text-amber-400 border border-amber-800/50"
                            : "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                      }`}
                    >
                      {s.anomaly_status.toUpperCase()}
                    </span>
                  </div>

                  <div className="my-4 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-zinc-100">
                      {s.latest_value ?? "--"}
                    </span>
                    <span className="text-sm text-zinc-400">{s.latest_unit}</span>
                  </div>

                  <div className="space-y-1 text-xs text-zinc-400">
                    <div>
                      Ngưỡng cảnh báo: Max {s.threshold_config?.max ?? "N/A"} | Critical{" "}
                      {s.threshold_config?.critical_max ?? "N/A"}
                    </div>
                    <div>
                      Cập nhật gần nhất:{" "}
                      {s.latest_observed_at
                        ? new Date(s.latest_observed_at).toLocaleTimeString("vi-VN")
                        : "Chưa có"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Modal Nạp Reality Capture */}
        {showCaptureModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-zinc-100">Nạp Reality Capture Mới</h2>
              <form onSubmit={handleCreateCapture} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    Mã đợt quét (Capture Code)
                  </label>
                  <input
                    type="text"
                    required
                    value={captureCode}
                    onChange={(e) => setCaptureCode(e.target.value)}
                    placeholder="VD: SCAN-LIDAR-T2-FL3-01"
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">Loại khảo sát</label>
                    <select
                      value={captureType}
                      onChange={(e) => setCaptureType(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="lidar_pointcloud">LiDAR Point Cloud</option>
                      <option value="drone_photogrammetry">Drone Photogrammetry</option>
                      <option value="camera_ai_survey">Camera AI Survey</option>
                      <option value="bim_scan_diff">BIM Scan Diff</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Khu vực / Tầng
                    </label>
                    <input
                      type="text"
                      required
                      value={spatialZone}
                      onChange={(e) => setSpatialZone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    Đường dẫn tệp lưu trữ (Storage URI)
                  </label>
                  <input
                    type="text"
                    required
                    value={storageUri}
                    onChange={(e) => setStorageUri(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    Số điểm quét (Total Points)
                  </label>
                  <input
                    type="number"
                    value={totalPoints}
                    onChange={(e) => setTotalPoints(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCaptureModal(false)}
                    className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
                  >
                    Nạp dữ liệu
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
