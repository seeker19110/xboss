"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { ComponentErrorBoundary } from "@/app/components/ComponentErrorBoundary";
import {
  Activity,
  Wind,
  Zap,
  Volume2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  Radio,
  Sliders,
  ShieldCheck,
  BellRing,
  MapPin,
  Clock,
} from "lucide-react";

interface IotDeviceItem {
  id: string;
  deviceCode: string;
  deviceName: string;
  deviceType: string;
  locationArea: string;
  isActive: boolean;
  thresholdMin?: number;
  thresholdMax?: number;
  unit: string;
  latestValue?: number;
  latestStatus?: string;
  latestMeasuredAt?: string;
}

interface IotAlertItem {
  id: string;
  deviceId: string;
  deviceCode: string;
  deviceName: string;
  locationArea: string;
  severity: string;
  alertTitle: string;
  alertMessage: string;
  standardReference?: string;
  triggeredValue: number;
  unit: string;
  isResolved: boolean;
  createdAt: string;
}

export default function IotTelemetryPage() {
  const [devices, setDevices] = useState<IotDeviceItem[]>([]);
  const [alerts, setAlerts] = useState<IotAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  // Form simulate reading
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [simValue, setSimValue] = useState<string>("55.0");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [devRes, alertRes] = await Promise.all([
        fetch("/api/engineering/iot/devices"),
        fetch("/api/engineering/iot/alerts"),
      ]);
      const devJson = await devRes.json();
      const alertJson = await alertRes.json();

      if (devJson.success && Array.isArray(devJson.data)) {
        setDevices(devJson.data);
        if (devJson.data.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(devJson.data[0].id);
        }
      }
      if (alertJson.success && Array.isArray(alertJson.data)) {
        setAlerts(alertJson.data);
      }
    } catch (e) {
      console.error("Lỗi tải dữ liệu IoT:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSimulateTelemetry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeviceId) return;
    setSimulating(true);
    try {
      await fetch("/api/engineering/iot/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId,
          metricValue: Number(simValue),
        }),
      });
      await fetchData();
    } catch (err) {
      console.error("Lỗi mô phỏng telemetry:", err);
    } finally {
      setSimulating(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      await fetch("/api/engineering/iot/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, isResolved: true }),
      });
      await fetchData();
    } catch (err) {
      console.error("Lỗi xác nhận xử lý cảnh báo:", err);
    }
  };

  const aqiDev = devices.find((d) => d.deviceType === "AIR_QUALITY");
  const gasDev = devices.find((d) => d.deviceType === "GAS_LEAK");
  const noiseDev = devices.find((d) => d.deviceType === "NOISE");
  const energyDev = devices.find((d) => d.deviceType === "ENERGY_METER");

  const unresolvedAlerts = alerts.filter((a) => !a.isResolved);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader />
      <EngineeringNav />

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 flex flex-col gap-6">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-zinc-100">
                  Smart Site IoT & Environmental Telemetry (M83)
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-teal-950/80 text-teal-400 border border-teal-800/80 rounded-full">
                  IoT Telemetry
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Giám sát nồng độ bụi PM2.5, khí độc CO tầng hầm, tiếng ồn và phụ tải điện công
                trường theo QCVN
              </p>
            </div>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-teal-400" : ""}`} />
            Làm mới
          </button>
        </div>

        {/* Realtime KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Bụi PM2.5 */}
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-sky-500/20 flex flex-col gap-1">
            <div className="flex items-center justify-between text-sky-400 text-xs font-semibold">
              <span>Bụi Mịn PM2.5</span>
              <Wind className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-zinc-100">
              {aqiDev?.latestValue ?? "--"}{" "}
              <span className="text-xs font-normal text-zinc-400">µg/m³</span>
            </div>
            <span className="text-[11px] text-zinc-400">QCVN 05:2023 ≤ 50 µg/m³</span>
          </div>

          {/* Khí CO Tầng Hầm */}
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-emerald-500/20 flex flex-col gap-1">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
              <span>Khí Độc CO (Tầng Hầm)</span>
              <Radio className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-zinc-100">
              {gasDev?.latestValue ?? "0.0"}{" "}
              <span className="text-xs font-normal text-zinc-400">ppm</span>
            </div>
            <span className="text-[11px] text-zinc-400">Ngưỡng an toàn ≤ 25 ppm</span>
          </div>

          {/* Độ ồn thi công */}
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/20 flex flex-col gap-1">
            <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
              <span>Độ Ồn Công Trường</span>
              <Volume2 className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-zinc-100">
              {noiseDev?.latestValue ?? "--"}{" "}
              <span className="text-xs font-normal text-zinc-400">dBA</span>
            </div>
            <span className="text-[11px] text-zinc-400">QCVN 26:2010 ≤ 70 dBA</span>
          </div>

          {/* Phụ tải điện MSB */}
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-teal-500/20 flex flex-col gap-1">
            <div className="flex items-center justify-between text-teal-400 text-xs font-semibold">
              <span>Công Suất Điện MSB</span>
              <Zap className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-zinc-100">
              {energyDev?.latestValue ?? "--"}{" "}
              <span className="text-xs font-normal text-zinc-400">kW</span>
            </div>
            <span className="text-[11px] text-zinc-400">Phòng điện tổng tầng 1</span>
          </div>
        </div>

        {/* Cảnh báo HSE Khẩn cấp (Nếu có) */}
        {unresolvedAlerts.length > 0 && (
          <ComponentErrorBoundary name="Cảnh Báo Vượt Ngưỡng HSE">
            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/40 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider">
                <BellRing className="w-4 h-4 animate-bounce" />
                <span>
                  Cảnh Báo An Toàn Môi Trường Thi Công Đang Kích Hoạt ({unresolvedAlerts.length})
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {unresolvedAlerts.map((alt) => (
                  <div
                    key={alt.id}
                    className="p-3 rounded-lg bg-zinc-900/90 border border-rose-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 rounded-md bg-rose-500/20 text-rose-400 shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-rose-300">
                          {alt.alertTitle} — {alt.deviceCode} ({alt.locationArea})
                        </div>
                        <div className="text-zinc-400 text-[11px] mt-0.5">{alt.alertMessage}</div>
                        {alt.standardReference && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400">
                            Tiêu chuẩn: {alt.standardReference}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleResolveAlert(alt.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 border border-emerald-700/60 text-xs font-medium transition shrink-0 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã Xử Lý
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </ComponentErrorBoundary>
        )}

        {/* Section: Danh mục thiết bị & Bộ mô phỏng Ingestion */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cột trái: Danh sách cảm biến IoT */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-400" />
              <span>Danh Mục Cảm Biến & Thiết Bị IoT Công Trường</span>
            </h2>

            <ComponentErrorBoundary name="Bảng Cảm Biến IoT">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/90 text-zinc-400 font-semibold">
                      <th className="p-3">Mã & Tên Cảm Biến</th>
                      <th className="p-3">Loại thiết bị</th>
                      <th className="p-3">Vị trí lắp đặt</th>
                      <th className="p-3 text-center">Giá trị đo gần nhất</th>
                      <th className="p-3 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {devices.map((d) => (
                      <tr key={d.id} className="hover:bg-zinc-800/40 transition">
                        <td className="p-3">
                          <div className="font-semibold text-zinc-100 font-mono text-teal-400">
                            {d.deviceCode}
                          </div>
                          <div className="text-[11px] text-zinc-400">{d.deviceName}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-zinc-800 text-[11px] text-zinc-300 font-medium">
                            {d.deviceType}
                          </span>
                        </td>
                        <td className="p-3 text-zinc-400">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-zinc-500" />
                            <span>{d.locationArea}</span>
                          </div>
                        </td>
                        <td className="p-3 text-center font-bold text-zinc-100">
                          {d.latestValue !== undefined ? `${d.latestValue} ${d.unit}` : "--"}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              d.latestStatus === "CRITICAL"
                                ? "bg-rose-950 text-rose-400 border border-rose-800"
                                : d.latestStatus === "WARNING"
                                  ? "bg-amber-950 text-amber-400 border border-amber-800"
                                  : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            }`}
                          >
                            {d.latestStatus || "NORMAL"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ComponentErrorBoundary>
          </div>

          {/* Cột phải: Hộp công cụ mô phỏng gửi telemetry */}
          <ComponentErrorBoundary name="Mô Phỏng Telemetry">
            <div className="p-5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-zinc-200 font-semibold text-xs border-b border-zinc-800 pb-3">
                <Radio className="w-4 h-4 text-teal-400" />
                <span>Mô Phỏng Ingestion Cảm Biến (Test Telemetry)</span>
              </div>

              <form onSubmit={handleSimulateTelemetry} className="flex flex-col gap-3 text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-zinc-400 font-medium">Chọn cảm biến phát dữ liệu</label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-teal-500"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.deviceCode} — {d.deviceName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-zinc-400 font-medium">Giá trị đo truyền về</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simValue}
                    onChange={(e) => setSimValue(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-teal-500 font-mono"
                    required
                  />
                  <span className="text-[10px] text-zinc-500">
                    Gợi ý: Nhập &gt; 50 (cho PM2.5) hoặc &gt; 25 (cho CO) để thử nghiệm kích hoạt
                    chuông cảnh báo HSE.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={simulating}
                  className="mt-2 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 font-semibold text-white transition shadow-lg shadow-teal-900/30"
                >
                  <PlusCircle className={`w-4 h-4 ${simulating ? "animate-spin" : ""}`} />
                  {simulating ? "Đang gửi..." : "Gửi Telemetry Mới"}
                </button>
              </form>

              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 text-[11px] text-zinc-400 flex flex-col gap-1">
                <div className="font-semibold text-zinc-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>Quy Chuẩn An Toàn HSE:</span>
                </div>
                <div>• QCVN 05:2023/BTNMT: Bụi PM2.5 &le; 50 µg/m³</div>
                <div>• QCVN 26:2010/BTNMT: Tiếng ồn &le; 70 dBA</div>
                <div>• QCVN 03:2019/BYT: Khí CO &le; 25 ppm</div>
              </div>
            </div>
          </ComponentErrorBoundary>
        </div>
      </main>
    </div>
  );
}
