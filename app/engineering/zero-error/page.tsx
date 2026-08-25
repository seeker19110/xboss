"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Camera,
  MapPin,
  Scale,
  Lock,
  Unlock,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck2,
  Fingerprint,
  QrCode,
  Layers,
  ArrowRight,
  ExternalLink,
  Cpu,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";

type ActiveTab = "challenge" | "reconcile" | "circuit_breaker" | "merkle_ledger";

export default function ZeroErrorEngineeringPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("challenge");

  // Tab 1: Challenge & Photo State
  const [challengeCode, setChallengeCode] = useState<string>("#XB-LIVE");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number>(90);
  const [lat, setLat] = useState<number>(10.77692);
  const [lon, setLon] = useState<number>(106.70091);
  const [isMockGps, setIsMockGps] = useState<boolean>(false);
  const [isDarkUnderground, setIsDarkUnderground] = useState<boolean>(false);
  const [isLowResolution, setIsLowResolution] = useState<boolean>(false);
  const [bimMatchedPercent, setBimMatchedPercent] = useState<number>(95);
  const [photoVerifyResult, setPhotoVerifyResult] = useState<any>(null);
  const [isVerifyingPhoto, setIsVerifyingPhoto] = useState<boolean>(false);

  // Tab 2: Quad-Reconciliation State
  const [reportedQty, setReportedQty] = useState<number>(100);
  const [bimDesignQty, setBimDesignQty] = useState<number>(120);
  const [boqApprovedQty, setBoqApprovedQty] = useState<number>(120);
  const [warehouseReceivedQty, setWarehouseReceivedQty] = useState<number>(200);
  const [warehouseUsedQty, setWarehouseUsedQty] = useState<number>(50);
  const [reconcileResult, setReconcileResult] = useState<any>(null);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);

  // Tab 3: Concealed Work Circuit Breaker State
  const [concealedTasks, setConcealedTasks] = useState([
    {
      id: "TASK-SLV-01",
      name: "Sleeves xuyên dầm D110 trục 3-4",
      zone: "Zone 1 (Tầng 12)",
      bbntSigned: true,
      pressurePassed: true,
    },
    {
      id: "TASK-ELE-02",
      name: "Ống luồn dây điện chiếu sáng âm sàn trục E-F",
      zone: "Zone 1 (Tầng 12)",
      bbntSigned: true,
      pressurePassed: true,
    },
    {
      id: "TASK-PLB-03",
      name: "Ống thoát nước uPVC D90 âm sàn vệ sinh",
      zone: "Zone 1 (Tầng 12)",
      bbntSigned: true,
      pressurePassed: true,
    },
    {
      id: "TASK-EAR-04",
      name: "Mối hàn tiếp địa chống sét dầm biên",
      zone: "Zone 1 (Tầng 12)",
      bbntSigned: true,
      pressurePassed: true,
    },
  ]);

  // Tab 4: Merkle Ledger State
  const [certificates, setCertificates] = useState<any[]>([]);
  const [isIssuingCert, setIsIssuingCert] = useState<boolean>(false);

  // Sinh mã Challenge mới
  const fetchChallenge = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/zero-error/challenge");
      if (res.ok) {
        const data = await res.json();
        setChallengeCode(data.challenge.challengeCode);
        setExpiresAt(data.challenge.expiresAt);
        setTimeLeft(90);
      }
    } catch {
      // Fallback
      setChallengeCode("#XB-7A9F");
      setTimeLeft(90);
    }
  }, []);

  useEffect(() => {
    fetchChallenge();
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          fetchChallenge();
          return 90;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchChallenge]);

  // Thẩm định ảnh hiện trường
  const handleVerifyPhoto = async () => {
    setIsVerifyingPhoto(true);
    try {
      const res = await fetch("/api/engineering/zero-error/verify-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeCode,
          lat,
          lon,
          isMockLocation: isMockGps,
          rawConfidence: 0.95,
          isDarkUnderground,
          isLowResolution,
          bimMatchedPercent,
        }),
      });
      const data = await res.json();
      setPhotoVerifyResult(data);
    } catch (e: any) {
      setPhotoVerifyResult({ success: false, summary: e.message || "Lỗi kết nối máy chủ" });
    } finally {
      setIsVerifyingPhoto(false);
    }
  };

  // Đối soát định lượng 4 chiều
  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      const res = await fetch("/api/engineering/zero-error/reconcile-quad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedQty,
          bimDesignQty,
          boqApprovedQty,
          warehouseReceivedQty,
          warehouseUsedQty,
        }),
      });
      const data = await res.json();
      setReconcileResult(data);
    } catch (e: any) {
      setReconcileResult({ status: "ERROR", error: e.message });
    } finally {
      setIsReconciling(false);
    }
  };

  // Toggle Task BBNT / Áp lực
  const toggleTaskBbnt = (id: string) => {
    setConcealedTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, bbntSigned: !t.bbntSigned } : t)),
    );
  };

  const toggleTaskPressure = (id: string) => {
    setConcealedTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, pressurePassed: !t.pressurePassed } : t)),
    );
  };

  // Tính trạng thái Circuit Breaker
  const unpassedTasks = concealedTasks.filter((t) => !t.bbntSigned || !t.pressurePassed);
  const isCircuitLocked = unpassedTasks.length > 0;

  // Cấp chứng chỉ Merkle
  const handleIssueCertificate = async () => {
    setIsIssuingCert(true);
    try {
      const res = await fetch("/api/engineering/zero-error/issue-certificate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone: "Zone 1 (Tầng 12 Tháp A)",
          taskIds: concealedTasks.map((t) => t.id),
          reconciledQty: reportedQty,
          challengeCode,
          lat,
          lon,
        }),
      });
      const data = await res.json();
      if (data.certificate) {
        setCertificates((prev) => [data.certificate, ...prev]);
      }
    } catch (e: any) {
      alert("Lỗi cấp chứng chỉ: " + e.message);
    } finally {
      setIsIssuingCert(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <AppHeader title="Zero-Error & Anti-Fraud Construction OS" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <EngineeringNav />

        {/* Hero Section */}
        <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-cyan-950/60 border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                Chuẩn Mực Không Sai Sót (Zero-Defect Standard)
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                XBoss Zero-Error & Anti-Fraud Control Center
              </h1>
              <p className="text-slate-400 text-sm mt-1 max-w-2xl">
                Hệ thống kiểm soát thi công đa tầng: Hợp nhất kiểm tra thực địa thủ công 3 bên, viễn
                trắc IoT, AI thị giác máy tính neo căn cứ vật lý, và sổ cái Merkle Tree bất biến.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchChallenge}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-on-accent rounded-xl text-xs font-semibold shadow-lg transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Làm mới Challenge
              </button>
            </div>
          </div>
        </div>

        {/* Bento Grid Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-mono font-bold text-lg">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Dynamic Challenge Code</div>
              <div className="text-lg font-mono font-extrabold text-cyan-300">{challengeCode}</div>
              <div className="text-[11px] text-slate-500">TTL: {timeLeft}s (Tự đổi sau 90s)</div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Geofence Proximity</div>
              <div className="text-lg font-bold text-emerald-300">Trong Bán Kính 5m</div>
              <div className="text-[11px] text-slate-500">TT AVIO Tháp A (10.7769, 106.7009)</div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">4-Way Quad Balance</div>
              <div className="text-lg font-bold text-purple-300">100% Cân Bằng</div>
              <div className="text-[11px] text-slate-500">BIM = BOQ = Kho = Báo cáo</div>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isCircuitLocked
                  ? "bg-red-500/20 text-red-400"
                  : "bg-emerald-500/20 text-emerald-400"
              }`}
            >
              {isCircuitLocked ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Pour Permit Circuit</div>
              <div
                className={`text-lg font-bold ${isCircuitLocked ? "text-red-400" : "text-emerald-300"}`}
              >
                {isCircuitLocked ? "LOCKED (Ngắt mạch)" : "ACTIVE (Mở lệnh)"}
              </div>
              <div className="text-[11px] text-slate-500">
                {isCircuitLocked
                  ? `Còn ${unpassedTasks.length} task ngầm chưa xong`
                  : "100% Task ngầm đạt chuẩn"}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 space-x-2">
          <button
            onClick={() => setActiveTab("challenge")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "challenge"
                ? "border-emerald-500 text-emerald-400 bg-slate-900/40"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Camera className="w-4 h-4" />
            1. Thẩm Định Ảnh & Challenge Hiện Trường
          </button>
          <button
            onClick={() => setActiveTab("reconcile")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "reconcile"
                ? "border-emerald-500 text-emerald-400 bg-slate-900/40"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Scale className="w-4 h-4" />
            2. Đối Soát Định Lượng 4 Chiều (BIM-BOQ-Kho)
          </button>
          <button
            onClick={() => setActiveTab("circuit_breaker")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "circuit_breaker"
                ? "border-emerald-500 text-emerald-400 bg-slate-900/40"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Lock className="w-4 h-4" />
            3. Ngắt Mạch Đổ Bê Tông (Pour Permit Circuit)
          </button>
          <button
            onClick={() => setActiveTab("merkle_ledger")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "merkle_ledger"
                ? "border-emerald-500 text-emerald-400 bg-slate-900/40"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Fingerprint className="w-4 h-4" />
            4. Sổ Cái Niêm Phong Mật Mã Merkle
          </button>
        </div>

        {/* Tab 1: Live Field Photo Proof & Challenge */}
        {activeTab === "challenge" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-emerald-400" />
                Mô Phỏng Tải Ảnh Chụp Hiện Trường & Cảm Biến
              </h3>
              <p className="text-xs text-slate-400">
                Thử nghiệm kiểm tra tính toàn vẹn của bằng chứng thực địa: kiểm tra mã thử thách
                ngẫu nhiên, toạ độ Geofencing GPS, và đo lường độ tin cậy AI tránh ảo giác.
              </p>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs text-slate-300 font-medium">
                    Mã Thử Thách Động (Dynamic Challenge Code)
                  </label>
                  <input
                    type="text"
                    value={challengeCode}
                    onChange={(e) => setChallengeCode(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-cyan-300 font-mono text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300 font-medium">
                      Vĩ độ GPS (Latitude)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={lat}
                      onChange={(e) => setLat(parseFloat(e.target.value))}
                      className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 font-medium">
                      Kinh độ GPS (Longitude)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={lon}
                      onChange={(e) => setLon(parseFloat(e.target.value))}
                      className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-300">
                    Mô phỏng Điều kiện Môi trường & Gian lận:
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMockGps}
                      onChange={(e) => setIsMockGps(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-red-500 focus:ring-red-500"
                    />
                    <span className="text-red-400">Giả lập Fake GPS (Mock Location Provider)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDarkUnderground}
                      onChange={(e) => setIsDarkUnderground(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span>Ảnh chụp dưới tầng hầm thiếu sáng (-20% điểm tin cậy)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isLowResolution}
                      onChange={(e) => setIsLowResolution(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span>Ảnh mờ / Độ phân giải thấp (-25% điểm tin cậy)</span>
                  </label>
                </div>

                <div className="pt-2">
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Tỷ lệ Khớp Danh mục Cấu kiện BIM:</span>
                    <span className="font-bold text-emerald-400">{bimMatchedPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="100"
                    value={bimMatchedPercent}
                    onChange={(e) => setBimMatchedPercent(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                  />
                </div>

                <button
                  onClick={handleVerifyPhoto}
                  disabled={isVerifyingPhoto}
                  className="w-full mt-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-on-accent rounded-xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isVerifyingPhoto ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  Thẩm Định Bằng Chứng Hiện Trường
                </button>
              </div>
            </div>

            {/* Results Panel */}
            <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-cyan-400" />
                Kết Quả Thẩm Định & Neo Giữ Căn Cứ Vật Lý
              </h3>

              {photoVerifyResult ? (
                <div className="space-y-4">
                  <div
                    className={`p-4 rounded-xl border flex items-start gap-3 ${
                      photoVerifyResult.success
                        ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                        : "bg-red-950/40 border-red-500/40 text-red-200"
                    }`}
                  >
                    {photoVerifyResult.success ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold text-sm">
                        {photoVerifyResult.success
                          ? "ĐẠT CHUẨN THI CÔNG KHÔNG SAI SÓT"
                          : "CẢNH BÁO TỪ CHỐI / CẦN KIỂM TRA MẮT"}
                      </div>
                      <div className="text-xs mt-1 text-slate-300">{photoVerifyResult.summary}</div>
                    </div>
                  </div>

                  {photoVerifyResult.checks && (
                    <div className="space-y-2 text-xs">
                      {/* Check 1: Dynamic Challenge */}
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-slate-200">
                            1. Dynamic Challenge Code
                          </div>
                          <div className="text-slate-400 text-[11px]">
                            {photoVerifyResult.checks.dynamicChallenge.reason}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-[10px] font-bold ${
                            photoVerifyResult.checks.dynamicChallenge.valid
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {photoVerifyResult.checks.dynamicChallenge.valid ? "VALID" : "INVALID"}
                        </span>
                      </div>

                      {/* Check 2: Geofencing */}
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-slate-200">
                            2. Geofence & Anti-Fake GPS
                          </div>
                          <div className="text-slate-400 text-[11px]">
                            Khoảng cách: {photoVerifyResult.checks.geofence.distanceMeters}m so với
                            tâm công trình
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-[10px] font-bold ${
                            photoVerifyResult.checks.geofence.valid
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {photoVerifyResult.checks.geofence.valid
                            ? "PASSED"
                            : photoVerifyResult.checks.geofence.reason}
                        </span>
                      </div>

                      {/* Check 3: AI Confidence */}
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div className="font-semibold text-slate-200">
                            3. AI Confidence Calibration & Grounding
                          </div>
                          <span
                            className={`px-2 py-1 rounded text-[10px] font-bold ${
                              photoVerifyResult.checks.aiCalibration.status === "AUTO_PROPOSE"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            Score: {photoVerifyResult.checks.aiCalibration.calibratedConfidence} (
                            {photoVerifyResult.checks.aiCalibration.status})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {photoVerifyResult.checks.aiCalibration.groundTruthAnchored
                            ? "✓ Đã neo căn cứ vật lý, AI được phép đề xuất cập nhật tiến độ (Cấp A1)."
                            : "⚠ Điểm tin cậy < 0.85 hoặc thiếu căn cứ vật lý. AI bị tước quyền tự động kết luận, yêu cầu TVGS kiểm tra trực tiếp bằng mắt."}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Nhập thông số bên trái và bấm{" "}
                  <span className="text-emerald-400 font-semibold">
                    &ldquo;Thẩm Định Bằng Chứng Hiện Trường&rdquo;
                  </span>{" "}
                  để xem kết quả đánh giá đa tầng.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Quad-Reconciliation Matrix */}
        {activeTab === "reconcile" && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-purple-400" />
                Ma Trận Đối Soát Định Lượng 4 Chiều (The Quad-Reconciler Invariant)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Nguyên tắc bất biến: Khối lượng báo cáo không thể vượt quá thiết kế BIM 3D, dự toán
                BOQ hợp đồng, và số lượng vật tư tồn kho thực tế.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="text-xs font-semibold text-slate-400">
                  1. Báo Cáo Thực Địa (m)
                </label>
                <input
                  type="number"
                  value={reportedQty}
                  onChange={(e) => setReportedQty(parseFloat(e.target.value) || 0)}
                  className="w-full mt-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-emerald-400 font-bold text-lg focus:outline-none"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="text-xs font-semibold text-slate-400">
                  2. Thiết Kế BIM 3D (m)
                </label>
                <input
                  type="number"
                  value={bimDesignQty}
                  onChange={(e) => setBimDesignQty(parseFloat(e.target.value) || 0)}
                  className="w-full mt-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-cyan-400 font-bold text-lg focus:outline-none"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="text-xs font-semibold text-slate-400">3. BOQ Hợp Đồng (m)</label>
                <input
                  type="number"
                  value={boqApprovedQty}
                  onChange={(e) => setBoqApprovedQty(parseFloat(e.target.value) || 0)}
                  className="w-full mt-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-purple-400 font-bold text-lg focus:outline-none"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="text-xs font-semibold text-slate-400">
                  4. Tổng Nhập Kho GRN (m)
                </label>
                <input
                  type="number"
                  value={warehouseReceivedQty}
                  onChange={(e) => setWarehouseReceivedQty(parseFloat(e.target.value) || 0)}
                  className="w-full mt-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-blue-400 font-bold text-lg focus:outline-none"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="text-xs font-semibold text-slate-400">5. Đã Xuất Dùng (m)</label>
                <input
                  type="number"
                  value={warehouseUsedQty}
                  onChange={(e) => setWarehouseUsedQty(parseFloat(e.target.value) || 0)}
                  className="w-full mt-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-amber-400 font-bold text-lg focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleReconcile}
                disabled={isReconciling}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {isReconciling ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Scale className="w-4 h-4" />
                )}
                Thực Hiện Đối Soát Định Lượng 4 Chiều
              </button>
            </div>

            {reconcileResult && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-4 ${
                  reconcileResult.status === "APPROVED_QUANTITY"
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                    : "bg-red-950/40 border-red-500/40 text-red-200"
                }`}
              >
                {reconcileResult.status === "APPROVED_QUANTITY" ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold text-sm">
                    {reconcileResult.status === "APPROVED_QUANTITY"
                      ? "KHỐI LƯỢNG HỢP LỆ — ĐƯỢC PHÉP NGHIỆM THU VÀ CẬP NHẬT TIẾN ĐỘ"
                      : "PHÁT HIỆN SAI LỆCH / GIAN LẬN KHỐI LƯỢNG — BỊ KHÓA CHẶN TỨC THỜI"}
                  </div>
                  <div className="text-xs mt-1 text-slate-300">
                    {reconcileResult.reconciliation.errorReason ||
                      `Khối lượng ${reportedQty}m nằm trong giới hạn cho phép tối đa ${reconcileResult.reconciliation.maxAllowedQty}m.`}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Concealed Work Circuit Breaker */}
        {activeTab === "circuit_breaker" && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-red-400" />
                  Ngắt Mạch Đổ Bê Tông — Bảo Vệ Công Tác Ngầm (Pour Permit Circuit Breaker)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Khu vực:{" "}
                  <span className="text-emerald-400 font-semibold">Zone 1 (Tầng 12 Tháp A)</span>.
                  Tuyệt đối không được cấp lệnh đổ bê tông nếu còn bất kỳ task ngầm nào chưa ký BBNT
                  hoặc chưa đạt thử áp.
                </p>
              </div>
              <div
                className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 ${
                  isCircuitLocked
                    ? "bg-red-500/20 border-red-500/40 text-red-300"
                    : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                }`}
              >
                {isCircuitLocked ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {isCircuitLocked
                  ? "LỆNH ĐỔ BÊ TÔNG BỊ KHÓA CỨNG"
                  : "LỆNH ĐỔ BÊ TÔNG SẴN SÀNG (ACTIVE)"}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
                <thead className="bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Mã Task</th>
                    <th className="p-3">Hạng Mục Công Tác Ngầm</th>
                    <th className="p-3 text-center">BBNT Ký Số 3 Bên</th>
                    <th className="p-3 text-center">Thử Áp Lực / Thử Kín</th>
                    <th className="p-3 text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                  {concealedTasks.map((task) => {
                    const isTaskPassed = task.bbntSigned && task.pressurePassed;
                    return (
                      <tr key={task.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-300">{task.id}</td>
                        <td className="p-3 font-medium text-white">{task.name}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => toggleTaskBbnt(task.id)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                              task.bbntSigned
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                : "bg-red-500/20 text-red-400 border-red-500/40"
                            }`}
                          >
                            {task.bbntSigned ? "✓ ĐÃ KÝ 3 BÊN" : "✕ CHƯA KÝ"}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => toggleTaskPressure(task.id)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                              task.pressurePassed
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                : "bg-red-500/20 text-red-400 border-red-500/40"
                            }`}
                          >
                            {task.pressurePassed ? "✓ ĐẠT THỬ ÁP" : "✕ CHƯA THỬ"}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-[10px] font-bold ${
                              isTaskPassed
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {isTaskPassed ? "HOLD-POINT PASSED" : "BLOCKED"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Tamper-Proof Merkle Audit Ledger */}
        {activeTab === "merkle_ledger" && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-cyan-400" />
                  Sổ Cái Mật Mã Merkle Tree — Niêm Phong Bất Biến (Zero-Error Audit Certificates)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Mỗi sự kiện nghiệm thu được băm SHA-256 (Leaf Hash) và nối vào cây Merkle Root.
                  Bất kỳ sự sửa đổi cơ sở dữ liệu ngầm sẽ làm gãy chuỗi mật mã.
                </p>
              </div>
              <button
                onClick={handleIssueCertificate}
                disabled={isIssuingCert}
                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-on-accent rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {isIssuingCert ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileCheck2 className="w-4 h-4" />
                )}
                Niêm Phong & Cấp Chứng Chỉ Merkle
              </button>
            </div>

            {certificates.length > 0 ? (
              <div className="space-y-3">
                {certificates.map((cert, index) => (
                  <div
                    key={index}
                    className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 hover:border-cyan-500/40 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="font-mono font-bold text-sm text-cyan-300">
                        {cert.certificateNumber}
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                        {cert.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Merkle Leaf Hash: </span>
                        <span className="font-mono text-slate-300 break-all">
                          {cert.merkleLeafHash}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Signature Token: </span>
                        <span className="font-mono text-slate-300">{cert.signatureToken}</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-900">
                      Thời điểm niêm phong: {new Date(cert.issuedAt).toLocaleString("vi-VN")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                Chưa có chứng chỉ kiểm toán nào được cấp trong phiên này. Bấm{" "}
                <span className="text-cyan-400 font-semibold">
                  &ldquo;Niêm Phong & Cấp Chứng Chỉ Merkle&rdquo;
                </span>{" "}
                để tạo chứng chỉ đầu tiên.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
