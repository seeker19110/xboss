"use client";

import { useState } from "react";
import {
  Layers,
  Search,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Package,
  QrCode,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Play,
  RotateCcw,
  Sparkles,
  MapPin,
  Clock,
  Lock,
  Unlock,
  Building2,
  Scale,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";

type ActiveTab = "mass_balance" | "stash_radar" | "spool_twin" | "jit_phantom";

export default function PipeStashHunterPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("mass_balance");

  // ==========================================================================
  // TAB 1: 5-WAY MASS BALANCE STATE
  // ==========================================================================
  const [systemCode, setSystemCode] = useState<string>("PLUMBING_DRAINAGE");
  const [nominalDiaMm, setNominalDiaMm] = useState<number>(110);
  const [bimDesignM, setBimDesignM] = useState<number>(1500);
  const [poOrderedM, setPoOrderedM] = useState<number>(1500);
  const [grnReceivedM, setGrnReceivedM] = useState<number>(1200);
  const [installedVerifiedM, setInstalledVerifiedM] = useState<number>(750);
  const [stagedOnFloorsM, setStagedOnFloorsM] = useState<number>(200);
  const [inCentralWarehouseM, setInCentralWarehouseM] = useState<number>(210);
  const [reusableRemnantsM, setReusableRemnantsM] = useState<number>(25);
  const [scrapLoggedM, setScrapLoggedM] = useState<number>(15);

  const [auditResult, setAuditResult] = useState<any>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  const handleRunMassBalance = async () => {
    setIsAuditing(true);
    try {
      const res = await fetch("/api/engineering/pipe-mass-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "audit_mass_balance",
          auditCode: `MBA-${Date.now().toString(36).toUpperCase()}`,
          systemCode,
          nominalDiaMm,
          totalBimDesignM: bimDesignM,
          totalPoOrderedM: poOrderedM,
          totalGrnReceivedM: grnReceivedM,
          totalInstalledVerifiedM: installedVerifiedM,
          totalStagedOnFloorsM: stagedOnFloorsM,
          totalInCentralWarehouseM: inCentralWarehouseM,
          totalReusableRemnantsM: reusableRemnantsM,
          totalScrapLoggedM: scrapLoggedM,
          stagingBuffers: [
            {
              towerLabel: "Tower-A",
              floorLabel: "FL-12",
              zoneLabel: "Zone-01",
              quantityM: 110.0,
              stagedAt: new Date(Date.now() - 85 * 3600 * 1000).toISOString(),
              holdingTimeHours: 85.0, // > 72h
            },
            {
              towerLabel: "Tower-A",
              floorLabel: "FL-15",
              zoneLabel: "Zone-02",
              quantityM: 90.0,
              stagedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
              holdingTimeHours: 30.0,
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAuditResult(data.result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAuditing(false);
    }
  };

  // ==========================================================================
  // TAB 4: ANTI-PHANTOM & JIT REORDER STATE
  // ==========================================================================
  const [claimedM, setClaimedM] = useState<number>(200);
  const [issuedM, setIssuedM] = useState<number>(140);
  const [phantomResult, setPhantomResult] = useState<any>(null);

  const handleCheckPhantom = async () => {
    try {
      const res = await fetch("/api/engineering/pipe-mass-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_phantom_breaker",
          claimedInstallM: claimedM,
          totalStockIssuedToSubconM: issuedM,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPhantomResult(data.result);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [installRateM, setInstallRateM] = useState<number>(25);
  const [leadDays, setLeadDays] = useState<number>(14);
  const [availStockM, setAvailStockM] = useState<number>(210);
  const [jitResult, setJitResult] = useState<any>(null);

  const handleCalcJit = async () => {
    try {
      const res = await fetch("/api/engineering/pipe-mass-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "calc_jit_reorder",
          installRateMPerDay: installRateM,
          supplierLeadDays: leadDays,
          currentAvailableStockM: availStockM,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setJitResult(data.result);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <AppHeader />
      <EngineeringNav />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Header Hero */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-emerald-950/40 border border-zinc-800 rounded-xl p-6 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-xs font-semibold text-emerald-400 mb-2">
                <Sparkles className="w-3.5 h-3.5" /> Module M95 — Mass-Balance & Geolocation Stash
                Hunter
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                <Scale className="w-7 h-7 text-emerald-400" /> Đối Soát Cân Bằng Vật Chất 5 Chiều &
                Săn Lùng Hàng Cất Giấu
              </h1>
              <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
                Thống kê số lượng ống đã lắp, tính toán khối lượng còn lại thời gian thực, đối soát
                bảo toàn vật chất 5 chiều và định vị chính xác vị trí hàng thất thoát / tồn đọng /
                cất giấu trên công trường.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> 5-Way Mass Balance Law
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
          <button
            onClick={() => setActiveTab("mass_balance")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "mass_balance"
                ? "bg-emerald-700 text-on-accent shadow-lg shadow-emerald-600/30"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
            }`}
          >
            <Scale className="w-4 h-4" /> 1. Cân Bằng Vật Chất 5 Chiều & Tiến Độ
          </button>
          <button
            onClick={() => setActiveTab("stash_radar")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "stash_radar"
                ? "bg-amber-700 text-on-accent shadow-lg shadow-amber-600/30"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
            }`}
          >
            <Search className="w-4 h-4" /> 2. Radar Định Vị Săn Lùng Hàng Cất Giấu
          </button>
          <button
            onClick={() => setActiveTab("spool_twin")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "spool_twin"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
            }`}
          >
            <QrCode className="w-4 h-4" /> 3. Quản Lý Từng Đốt Spool (LOD 400)
          </button>
          <button
            onClick={() => setActiveTab("jit_phantom")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "jit_phantom"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
            }`}
          >
            <Zap className="w-4 h-4" /> 4. Chống Khai Khống & Dự Báo JIT
          </button>
        </div>

        {/* TAB 1 CONTENT: 5-WAY MASS BALANCE */}
        {activeTab === "mass_balance" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-400" /> Tham Số Đối Soát 5 Chiều
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Hệ Thống</label>
                  <select
                    value={systemCode}
                    onChange={(e) => setSystemCode(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  >
                    <option value="PLUMBING_DRAINAGE">Thoát Nước (uPVC / HDPE)</option>
                    <option value="HVAC_CHILLER">Ống Nước Lạnh Chiller</option>
                    <option value="FIRE_SPRINKLER">Ống Chữa Cháy PCCC</option>
                    <option value="PLUMBING_WATER">Cấp Nước Sinh Hoạt</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Đường Kính Ống (mm)</label>
                  <input
                    type="number"
                    value={nominalDiaMm}
                    onChange={(e) => setNominalDiaMm(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <label className="text-[11px] text-zinc-500 block mb-0.5">BIM Thiết Kế (m)</label>
                  <input
                    type="number"
                    value={bimDesignM}
                    onChange={(e) => setBimDesignM(Number(e.target.value))}
                    className="w-full bg-transparent text-sm font-bold text-zinc-200 focus:outline-none"
                  />
                </div>
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <label className="text-[11px] text-zinc-500 block mb-0.5">
                    Đã Đặt Hàng PO (m)
                  </label>
                  <input
                    type="number"
                    value={poOrderedM}
                    onChange={(e) => setPoOrderedM(Number(e.target.value))}
                    className="w-full bg-transparent text-sm font-bold text-zinc-200 focus:outline-none"
                  />
                </div>
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <label className="text-[11px] text-zinc-500 block mb-0.5">
                    Nhập Cổng GRN (m)
                  </label>
                  <input
                    type="number"
                    value={grnReceivedM}
                    onChange={(e) => setGrnReceivedM(Number(e.target.value))}
                    className="w-full bg-transparent text-sm font-bold text-emerald-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg space-y-2 text-xs">
                <div className="text-zinc-400 font-semibold mb-1">
                  Khối lượng phân bổ thực tế tại công trường:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-zinc-500">1. Đã lắp đạt chuẩn (m):</span>
                    <input
                      type="number"
                      value={installedVerifiedM}
                      onChange={(e) => setInstalledVerifiedM(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
                    />
                  </div>
                  <div>
                    <span className="text-zinc-500">2. Đệm sàn chờ lắp (m):</span>
                    <input
                      type="number"
                      value={stagedOnFloorsM}
                      onChange={(e) => setStagedOnFloorsM(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
                    />
                  </div>
                  <div>
                    <span className="text-zinc-500">3. Tồn kho tổng (m):</span>
                    <input
                      type="number"
                      value={inCentralWarehouseM}
                      onChange={(e) => setInCentralWarehouseM(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
                    />
                  </div>
                  <div>
                    <span className="text-zinc-500">4. Phôi thừa tái dùng (m):</span>
                    <input
                      type="number"
                      value={reusableRemnantsM}
                      onChange={(e) => setReusableRemnantsM(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <span className="text-zinc-500">5. Phế liệu đầu mẩu ghi nhận (m):</span>
                    <input
                      type="number"
                      value={scrapLoggedM}
                      onChange={(e) => setScrapLoggedM(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleRunMassBalance}
                disabled={isAuditing}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-on-accent font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
              >
                {isAuditing ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Chạy Đối Soát Cân Bằng Vật Chất 5 Chiều
              </button>
            </div>

            <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" /> Kết Quả Thống Kê Tiến Độ & Cân
                  Bằng Vật Chất
                </h2>

                {auditResult ? (
                  <div className="space-y-4">
                    {/* Status Alert Banner */}
                    <div
                      className={`p-4 rounded-xl border flex items-start gap-4 ${
                        auditResult.stashRiskStatus === "CLEAN_BALANCED"
                          ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                          : auditResult.stashRiskStatus === "STASH_SUSPECTED_ALERT"
                            ? "bg-amber-950/40 border-amber-800 text-amber-300"
                            : auditResult.stashRiskStatus === "PHANTOM_CLAIM_FRAUD"
                              ? "bg-rose-950/40 border-rose-800 text-rose-300"
                              : "bg-purple-950/40 border-purple-800 text-purple-300"
                      }`}
                    >
                      {auditResult.stashRiskStatus === "CLEAN_BALANCED" ? (
                        <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-7 h-7 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="text-base font-bold uppercase">
                          {auditResult.stashRiskStatus.replace(/_/g, " ")}
                        </div>
                        <div className="text-xs opacity-90 mt-1">
                          {auditResult.anomalyDescriptions.join(" | ") ||
                            "Khối lượng bảo toàn 100% khớp tuyệt đối."}
                        </div>
                      </div>
                    </div>

                    {/* Progress & Remaining Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                        <div className="text-xs text-zinc-500">Tiến Độ Lắp Đặt</div>
                        <div className="text-base font-bold text-emerald-400">
                          {auditResult.progressPercentage}%
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {auditResult.totalInstalledVerifiedM} / {auditResult.totalBimDesignM} m
                        </div>
                      </div>
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                        <div className="text-xs text-zinc-500">Số Lượng Còn Lại</div>
                        <div className="text-base font-bold text-blue-400">
                          {auditResult.remainingToInstallM} m
                        </div>
                        <div className="text-[10px] text-zinc-500">Chưa lắp trên sàn</div>
                      </div>
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                        <div className="text-xs text-zinc-500">Cần Đặt Thêm (PO)</div>
                        <div className="text-base font-bold text-purple-400">
                          {auditResult.remainingToProcureM} m
                        </div>
                        <div className="text-[10px] text-zinc-500">Tránh đứt gãy JIT</div>
                      </div>
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                        <div className="text-xs text-zinc-500">Sai Lệch Thất Thoát (Δ)</div>
                        <div
                          className={`text-base font-bold ${
                            auditResult.deltaUnaccountedOrStashM > 0
                              ? "text-amber-400"
                              : auditResult.deltaUnaccountedOrStashM < 0
                                ? "text-rose-400"
                                : "text-emerald-400"
                          }`}
                        >
                          {auditResult.deltaUnaccountedOrStashM > 0
                            ? `+${auditResult.deltaUnaccountedOrStashM}`
                            : auditResult.deltaUnaccountedOrStashM}{" "}
                          m
                        </div>
                        <div className="text-[10px] text-zinc-500">Q_GRN − Q_PhânBổ</div>
                      </div>
                    </div>

                    {/* Suspect Locations preview if any */}
                    {auditResult.suspectLocations.length > 0 && (
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2 text-xs">
                        <div className="font-bold text-amber-400 flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" /> Vị trí Voxel nghi vấn cất giấu / tồn đọng:
                        </div>
                        {auditResult.suspectLocations.map((loc: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-2 bg-zinc-900 rounded border border-zinc-800 flex justify-between items-center"
                          >
                            <div>
                              <span className="font-semibold text-zinc-200">
                                {loc.towerLabel} • {loc.floorLabel} • {loc.zoneLabel}
                              </span>
                              <div className="text-[11px] text-zinc-400 mt-0.5">{loc.reason}</div>
                            </div>
                            <span className="text-xs font-mono text-amber-400 font-bold">
                              {loc.suspectQtyM} m
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-400 space-y-1">
                      <div className="text-zinc-500">Mã Băm Niêm Phong Merkle Seal:</div>
                      <div className="text-emerald-400">{auditResult.merkleSealHash}</div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                    <Scale className="w-12 h-12 mb-2 text-zinc-700 animate-pulse" />
                    <p className="text-sm">
                      Bấm &quot;Chạy Đối Soát Cân Bằng Vật Chất&quot; để kích hoạt thuật toán
                      Mass-Balance
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2 CONTENT: STASH HUNTER RADAR */}
        {activeTab === "stash_radar" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Search className="w-5 h-5 text-amber-400" /> Bản Đồ Radar Định Vị Săn Lùng Hàng
                  Cất Giấu & Tồn Đệm Sàn (&gt;72h)
                </h2>
                <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-xs text-amber-400">
                  Phát hiện bất thường thời gian thực
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-zinc-950 border border-amber-900/60 rounded-xl space-y-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Tầng 12 • Zone 1 (Trục A-C)</span>
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> 85h đệm sàn
                    </span>
                  </div>
                  <div className="text-base font-bold text-zinc-100">80m Ống uPVC D110</div>
                  <p className="text-xs text-zinc-400">
                    Vật tư xuất kho đã 85 giờ chưa quét nghiệm thu lắp đặt. Nghi vấn tồn đọng cản
                    trở lối thoát hiểm hoặc giấu hàng.
                  </p>
                  <div className="pt-2 flex gap-2">
                    <button className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-on-accent rounded text-xs font-semibold">
                      Phát Lệnh Kiểm Kê
                    </button>
                    <button className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs">
                      Khoanh Vùng 3D
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-zinc-950 border border-rose-900/60 rounded-xl space-y-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Tầng Hầm B2 • Trục Kỹ Thuật</span>
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Thất thoát nghi vấn
                    </span>
                  </div>
                  <div className="text-base font-bold text-zinc-100">
                    45m Ống Thép Chiller DN100
                  </div>
                  <p className="text-xs text-zinc-400">
                    Phát hiện sai lệch 45m ống đã nhận cổng nhưng không có trong kho tổng hay biên
                    bản lắp đặt. Nghi vấn cất giấu góc chết.
                  </p>
                  <div className="pt-2 flex gap-2">
                    <button className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold">
                      Khóa Xuất Kho Thầu Phụ
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Tầng 15 • Zone 2</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 30h đệm sàn (Hợp lệ)
                    </span>
                  </div>
                  <div className="text-base font-bold text-zinc-100">90m Ống PPR D63</div>
                  <p className="text-xs text-zinc-400">
                    Vật tư đang trong chu kỳ thi công lookahead 7 ngày. Dự kiến hoàn thành lắp đặt
                    trong 24h tới.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3 CONTENT: SERIALIZED SPOOL DIGITAL TWIN */}
        {activeTab === "spool_twin" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-blue-400" /> Danh Mục Từng Đốt Ống Số Hóa
                  (Piece-Level Digital Twin LOD 400)
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-300">
                  <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="p-3">Mã Spool</th>
                      <th className="p-3">Hệ Thống</th>
                      <th className="p-3">Quy Cách</th>
                      <th className="p-3">Dài Cắt (L_cut)</th>
                      <th className="p-3">Vị Trí Sàn</th>
                      <th className="p-3">Trạng Thái Vòng Đời</th>
                      <th className="p-3">Thời Gian Đệm</th>
                      <th className="p-3">Scan-to-BIM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    <tr className="hover:bg-zinc-850">
                      <td className="p-3 font-mono text-blue-400">SP-DR-T12-Z1-001</td>
                      <td className="p-3">PLUMBING_DRAINAGE</td>
                      <td className="p-3 font-bold">uPVC D110</td>
                      <td className="p-3 font-mono">3,140 mm</td>
                      <td className="p-3">Tower-A / FL-12</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded">
                          INSTALLED_VERIFIED
                        </span>
                      </td>
                      <td className="p-3 text-zinc-500">18.5h</td>
                      <td className="p-3 text-emerald-400 font-mono">Δ = 6.2mm (Pass)</td>
                    </tr>
                    <tr className="hover:bg-zinc-850">
                      <td className="p-3 font-mono text-blue-400">SP-DR-T12-Z1-002</td>
                      <td className="p-3">PLUMBING_DRAINAGE</td>
                      <td className="p-3 font-bold">uPVC D110</td>
                      <td className="p-3 font-mono">2,850 mm</td>
                      <td className="p-3">Tower-A / FL-12</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-amber-950 border border-amber-800 text-amber-400 rounded">
                          FLOOR_STAGED
                        </span>
                      </td>
                      <td className="p-3 text-rose-400 font-bold">85.0h (Quá hạn)</td>
                      <td className="p-3 text-zinc-500">Chưa quét</td>
                    </tr>
                    <tr className="hover:bg-zinc-850">
                      <td className="p-3 font-mono text-blue-400">SP-CHW-T15-Z2-014</td>
                      <td className="p-3">HVAC_CHILLER</td>
                      <td className="p-3 font-bold">Steel DN150</td>
                      <td className="p-3 font-mono">5,800 mm</td>
                      <td className="p-3">Tower-A / FL-15</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-blue-950 border border-blue-800 text-blue-400 rounded">
                          WAREHOUSE_CENTRAL
                        </span>
                      </td>
                      <td className="p-3 text-zinc-500">0h</td>
                      <td className="p-3 text-zinc-500">Chưa xuất kho</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4 CONTENT: JIT REORDER & ANTI-PHANTOM BREAKER */}
        {activeTab === "jit_phantom" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Anti-Phantom Breaker */}
            <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-rose-400" /> Ngắt Mạch Chống Nghiệm Thu Khống
                (Anti-Phantom Breaker)
              </h2>
              <p className="text-xs text-zinc-400">
                Chặn cứng biên bản nghiệm thu nếu thầu phụ báo cáo khối lượng lắp đặt vượt quá tổng
                lượng vật tư kho đã xuất cấp.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Khối Lượng Báo Lắp (m)</label>
                  <input
                    type="number"
                    value={claimedM}
                    onChange={(e) => setClaimedM(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Kho Đã Cấp Cho Tổ Đội (m)
                  </label>
                  <input
                    type="number"
                    value={issuedM}
                    onChange={(e) => setIssuedM(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
              </div>

              <button
                onClick={handleCheckPhantom}
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition-all"
              >
                Kiểm Tra Hạn Mức Cấp Phát
              </button>

              {phantomResult && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    phantomResult.allowed
                      ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                      : "bg-rose-950/40 border-rose-800 text-rose-300"
                  }`}
                >
                  <div className="font-bold mb-1 flex items-center gap-1.5">
                    {phantomResult.allowed ? (
                      <Unlock className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Lock className="w-4 h-4 text-rose-400" />
                    )}
                    {phantomResult.allowed
                      ? "HỢP LỆ: Khối lượng trong hạn mức cấp"
                      : "KHÓA CỨNG: PHÁT HIỆN NGHIỆM THU KHỐNG"}
                  </div>
                  <div>
                    {phantomResult.blockingReason ||
                      "Khối lượng báo cáo hợp lệ so với sổ xuất kho."}
                  </div>
                </div>
              )}
            </div>

            {/* JIT Reorder Predictor */}
            <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-400" /> Dự Báo Điểm Đặt Hàng Lại JIT
                (Re-Order Point)
              </h2>
              <p className="text-xs text-zinc-400">
                Tính toán tự động thời điểm cần đặt hàng bổ sung dựa trên tốc độ lắp đặt thực tế và
                Lead-time nhà cung cấp.
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Tốc Độ Lắp (m/ngày)
                  </label>
                  <input
                    type="number"
                    value={installRateM}
                    onChange={(e) => setInstallRateM(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Lead-time (ngày)</label>
                  <input
                    type="number"
                    value={leadDays}
                    onChange={(e) => setLeadDays(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Tồn Khả Dụng (m)</label>
                  <input
                    type="number"
                    value={availStockM}
                    onChange={(e) => setAvailStockM(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                  />
                </div>
              </div>

              <button
                onClick={handleCalcJit}
                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs transition-all"
              >
                Tính Toán Điểm Đặt Hàng JIT
              </button>

              {jitResult && (
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Điểm Đặt Hàng Lại (ROP):</span>
                    <span className="font-bold text-amber-400 font-mono">
                      {jitResult.reorderPointM} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Số Ngày Dự Kiến Hết Hàng:</span>
                    <span className="font-bold text-zinc-200 font-mono">
                      {jitResult.estimatedStockoutDays} ngày
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Trạng Thái Đặt Hàng:</span>
                    <span
                      className={`font-bold ${jitResult.isReorderRequired ? "text-rose-400" : "text-emerald-400"}`}
                    >
                      {jitResult.isReorderRequired
                        ? `CẦN ĐẶT NGAY (+${jitResult.recommendedOrderQtyM}m)`
                        : "TỒN KHO AN TOÀN"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
