"use client";

import React, { useState, useEffect } from "react";
import EngineeringNav from "@/app/components/EngineeringNav";
import {
  ShieldAlert,
  Camera,
  Eye,
  AlertTriangle,
  CheckCircle,
  FileWarning,
  RefreshCw,
  Upload,
} from "lucide-react";

interface Hazard {
  hazardType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  boundingBox: [number, number, number, number];
  description: string;
  standardViolation: string;
  fineAmountVnd: number;
}

interface HseScan {
  id: string;
  scanName: string;
  imageUrl: string;
  totalHazardsFound: number;
  siteSafetyScore: string;
  riskTier: "SAFE" | "WARNING" | "DANGER" | "CRITICAL";
  analyzedAt: string;
}

export default function HseVisionPage() {
  const [scans, setScans] = useState<HseScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [currentResult, setCurrentResult] = useState<any>(null);

  // Form quét ảnh
  const [scanName, setScanName] = useState("Kiểm tra An toàn Khu vực Tầng 8 Tháp A");
  const [imageUrl, setImageUrl] = useState(
    "https://images.unsplash.com/photo-1541888946425-d0fbb180f5f6",
  );
  const [assignedSubcon, setAssignedSubcon] = useState("Đội Cơ Điện Tháp A");

  const fetchScans = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/engineering/hse-vision/scans");
      const json = await res.json();
      if (json.success) {
        setScans(json.data);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách quét HSE:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScans();
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setScanning(true);
      const res = await fetch("/api/engineering/hse-vision/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanName,
          imageUrl,
          assignedSubcon,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCurrentResult(json.data);
        fetchScans();
      } else {
        alert("Lỗi: " + json.error);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
              <ShieldAlert className="text-rose-400" />
              HSE AI Computer Vision Sentinel & Hazard Detection (M87)
            </h1>
            <p className="text-sm text-zinc-400">
              Động cơ thị giác AI phát hiện vi phạm bảo hộ (PPE), mép sàn nguy hiểm và tự động phát
              hành vé an toàn
            </p>
          </div>
          <span className="rounded-full bg-rose-950/80 border border-rose-700/50 px-3 py-1 text-xs font-semibold text-rose-400">
            HSE AI Sentinel Active
          </span>
        </div>

        <EngineeringNav />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cột trái: Form phân tích ảnh */}
          <div className="space-y-6 lg:col-span-1">
            <div className="bento-card p-5 space-y-4">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Camera size={18} className="text-amber-400" />
                Quét Thị Giác Ảnh Hiện Trường
              </h2>
              <form onSubmit={handleScan} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-300">
                    Tên phiên kiểm tra
                  </label>
                  <input
                    type="text"
                    value={scanName}
                    onChange={(e) => setScanName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-rose-500 transition"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-300">
                    URL hình ảnh công trường
                  </label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-rose-500 transition"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-300">
                    Đơn vị thi công phụ trách
                  </label>
                  <input
                    type="text"
                    value={assignedSubcon}
                    onChange={(e) => setAssignedSubcon(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-rose-500 transition"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={scanning}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition hover:bg-rose-500 active:scale-[0.98] disabled:opacity-50 shadow-sm"
                >
                  {scanning ? <RefreshCw className="animate-spin" size={16} /> : <Eye size={16} />}
                  Quét Phát Hiện Vi Phạm An Toàn AI
                </button>
              </form>
            </div>

            {/* Lịch sử các đợt quét */}
            <div className="bento-card p-5 space-y-4">
              <h2 className="text-base font-bold text-zinc-100">Lịch Sử Đợt Quét An Toàn</h2>
              {loading ? (
                <div className="text-center py-6 text-xs sm:text-sm text-zinc-500">
                  Đang tải lịch sử...
                </div>
              ) : scans.length === 0 ? (
                <div className="text-center py-6 text-xs sm:text-sm text-zinc-500">
                  Chưa có dữ liệu quét an toàn.
                </div>
              ) : (
                <div className="space-y-3">
                  {scans.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3.5 space-y-2 hover:bg-zinc-850 transition"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-zinc-200 line-clamp-1">{s.scanName}</span>
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                            s.riskTier === "CRITICAL"
                              ? "bg-rose-950/90 text-rose-400 border border-rose-800/60"
                              : s.riskTier === "DANGER"
                                ? "bg-amber-950/90 text-amber-400 border border-amber-800/60"
                                : "bg-emerald-950/90 text-emerald-400 border border-emerald-800/60"
                          }`}
                        >
                          Điểm: {Number(s.siteSafetyScore).toFixed(0)}/100
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                        <span>Phát hiện: {s.totalHazardsFound} lỗi</span>
                        <span>{new Date(s.analyzedAt).toLocaleDateString("vi-VN")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cột phải: Kết quả nhận diện AI Bounding Boxes */}
          <div className="space-y-6 lg:col-span-2">
            {currentResult ? (
              <div className="space-y-6">
                {/* Thẻ chỉ số an toàn */}
                <div
                  className={`bento-card p-5 ${
                    currentResult.scan.riskTier === "CRITICAL"
                      ? "border-rose-700/60 bg-rose-950/30"
                      : currentResult.scan.riskTier === "DANGER"
                        ? "border-amber-700/60 bg-amber-950/30"
                        : "border-emerald-700/60 bg-emerald-950/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <ShieldAlert size={20} className="text-rose-400" />
                        Chỉ Số An Toàn Hiện Trường (HSE Index): {currentResult.scan.siteSafetyScore}
                        /100
                      </h3>
                      <div className="mt-1 text-xs text-zinc-300">
                        Phân cấp rủi ro:{" "}
                        <strong className="text-rose-300 font-bold">
                          {currentResult.scan.riskTier}
                        </strong>{" "}
                        • Tìm thấy {currentResult.scan.totalHazardsFound} vị trí nguy cơ
                      </div>
                    </div>
                  </div>
                </div>

                {/* Danh sách các vi phạm phát hiện */}
                <div className="bento-card p-5 space-y-4">
                  <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                    <FileWarning size={18} className="text-amber-400" />
                    Chi Tiết Vi Phạm & Vé Xử Phạt Tự Động
                  </h3>
                  <div className="space-y-3">
                    {currentResult.hazards.map((h: Hazard, idx: number) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="rounded-lg bg-rose-950/80 border border-rose-800/60 px-2 py-0.5 text-xs font-bold text-rose-400">
                            [{h.hazardType}] - Mức độ: {h.severity}
                          </span>
                          <span className="text-xs font-mono font-bold text-emerald-400">
                            Độ tin cậy AI: {h.confidence}%
                          </span>
                        </div>
                        <div className="text-sm font-medium text-zinc-100">{h.description}</div>
                        <div className="text-xs text-zinc-400 font-mono">
                          <strong>Căn cứ quy chuẩn:</strong> {h.standardViolation}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs font-mono">
                          <span className="text-zinc-400">
                            Thời hạn khắc phục: <strong>4 giờ</strong>
                          </span>
                          <span className="text-amber-400 font-bold">
                            Hạn mức phạt dự kiến: {h.fineAmountVnd.toLocaleString("vi-VN")} VND
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bento-card flex h-96 items-center justify-center p-6 text-xs sm:text-sm text-zinc-400">
                Nhập thông tin bên trái và bấm &quot;Quét Phát Hiện Vi Phạm An Toàn AI&quot; để xem
                kết quả phân tích
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
