"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Boxes,
  TrendingUp,
  FileCheck2,
  Layers,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Zap,
  ArrowRight,
  ShieldAlert,
  Sliders,
  DollarSign,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

type SpoolStatus = "fabricated" | "delivered" | "installed" | "qc_passed" | "bbnt_approved";

interface CadSpoolItem {
  id: string;
  spool_code: string;
  discipline: string;
  system_code: string;
  floor_label: string;
  zone_label: string;
  dimension_spec: string;
  length_m: number;
  calculated_qty: number;
  unit: string;
  status: SpoolStatus;
  inspection_request_id: number | null;
}

interface QtoVarianceItem {
  boqItemId: number;
  boqCode: string;
  boqName: string;
  unit: string;
  qtyContract: number;
  qtyShopCad: number;
  qtyInstalled: number;
  qtyApprovedBbnt: number;
  deltaVoQty: number;
  estimatedVoVnd: number;
  unitRateVnd: number;
  status: "normal" | "vo_risk" | "over_norm" | "critical_variance";
  riskMessage: string;
}

const STATUS_LABELS: Record<SpoolStatus, string> = {
  fabricated: "Đã gia công (20%)",
  delivered: "Đã giao hàng (40%)",
  installed: "Đã lắp đặt (75%)",
  qc_passed: "KCS nội bộ (90%)",
  bbnt_approved: "Đã nghiệm thu (100%)",
};

const STATUS_COLORS: Record<SpoolStatus, string> = {
  fabricated: "bg-zinc-800 text-zinc-300 border-zinc-700",
  delivered: "bg-sky-950 text-sky-400 border-sky-800",
  installed: "bg-amber-950 text-amber-300 border-amber-800",
  qc_passed: "bg-indigo-950 text-indigo-300 border-indigo-800",
  bbnt_approved: "bg-emerald-950 text-emerald-300 border-emerald-800",
};

const SAMPLE_SPOOLS: CadSpoolItem[] = [
  {
    id: "SP-001",
    spool_code: "SP-DUCT-L4-Z1-001",
    discipline: "hvac",
    system_code: "ACMV-SA",
    floor_label: "Tầng 4",
    zone_label: "Zone A (Văn phòng)",
    dimension_spec: "600x400",
    length_m: 4.2,
    calculated_qty: 8.82,
    unit: "m2",
    status: "installed",
    inspection_request_id: null,
  },
  {
    id: "SP-002",
    spool_code: "SP-DUCT-L4-Z1-002",
    discipline: "hvac",
    system_code: "ACMV-SA",
    floor_label: "Tầng 4",
    zone_label: "Zone A (Văn phòng)",
    dimension_spec: "500x300",
    length_m: 5.5,
    calculated_qty: 9.24,
    unit: "m2",
    status: "qc_passed",
    inspection_request_id: null,
  },
  {
    id: "SP-003",
    spool_code: "SP-PIPE-CHW-L4-001",
    discipline: "hvac",
    system_code: "CHW-SUPP",
    floor_label: "Tầng 4",
    zone_label: "Trục Kỹ thuật D",
    dimension_spec: "DN100",
    length_m: 12.0,
    calculated_qty: 12.0,
    unit: "m",
    status: "bbnt_approved",
    inspection_request_id: 101,
  },
  {
    id: "SP-004",
    spool_code: "SP-FP-SPR-L4-015",
    discipline: "firefighting",
    system_code: "FP-SPK",
    floor_label: "Tầng 4",
    zone_label: "Zone B (Hành lang)",
    dimension_spec: "DN50",
    length_m: 18.5,
    calculated_qty: 18.5,
    unit: "m",
    status: "qc_passed",
    inspection_request_id: null,
  },
  {
    id: "SP-005",
    spool_code: "SP-ELEC-TRAY-L4-008",
    discipline: "electrical",
    system_code: "ELEC-PWR",
    floor_label: "Tầng 4",
    zone_label: "Trục Kỹ thuật E",
    dimension_spec: "300x100",
    length_m: 8.0,
    calculated_qty: 8.0,
    unit: "m",
    status: "delivered",
    inspection_request_id: null,
  },
];

const SAMPLE_VARIANCES: QtoVarianceItem[] = [
  {
    boqItemId: 1,
    boqCode: "BOQ-HVAC-DUCT-01",
    boqName: "Gia công & lắp đặt ống gió tôn tráng kẽm Z270 Tầng 4",
    unit: "m2",
    qtyContract: 450.0,
    qtyShopCad: 485.5,
    qtyInstalled: 320.0,
    qtyApprovedBbnt: 180.0,
    deltaVoQty: 35.5,
    estimatedVoVnd: 28400000,
    unitRateVnd: 800000,
    status: "vo_risk",
    riskMessage:
      "Bản vẽ Shopdrawing phát sinh +35.50 m2 so với Hợp đồng BOQ do điều chỉnh tuyến né dầm.",
  },
  {
    boqItemId: 2,
    boqCode: "BOQ-FP-PIPE-02",
    boqName: "Đường ống thép hàn đen DN50 PCCC TCVN",
    unit: "m",
    qtyContract: 620.0,
    qtyShopCad: 615.0,
    qtyInstalled: 410.0,
    qtyApprovedBbnt: 350.0,
    deltaVoQty: -5.0,
    estimatedVoVnd: 0,
    unitRateVnd: 450000,
    status: "normal",
    riskMessage: "Khối lượng thi công khớp đúng theo hợp đồng và bản vẽ.",
  },
  {
    boqItemId: 3,
    boqCode: "BOQ-ELEC-TRAY-01",
    boqName: "Máng cáp sơn tĩnh điện 300x100 dày 1.5mm",
    unit: "m",
    qtyContract: 120.0,
    qtyShopCad: 155.0,
    qtyInstalled: 80.0,
    qtyApprovedBbnt: 40.0,
    deltaVoQty: 35.0,
    estimatedVoVnd: 17500000,
    unitRateVnd: 500000,
    status: "critical_variance",
    riskMessage:
      "Bản vẽ Shopdrawing vượt >15% khối lượng hợp đồng BOQ (Phát sinh +35.00 m). Cần lập hồ sơ VO khẩn cấp.",
  },
];

export default function CadQtoTrackingPage() {
  const [activeTab, setActiveTab] = useState<"floorplan" | "variance" | "bbnt">("floorplan");
  const [loading, setLoading] = useState(false);
  const [spools, setSpools] = useState<CadSpoolItem[]>([]);
  const [variances, setVariances] = useState<QtoVarianceItem[]>([]);
  const [selectedSpool, setSelectedSpool] = useState<CadSpoolItem | null>(null);
  const [selectedForBbnt, setSelectedForBbnt] = useState<Set<string>>(new Set());
  const [bbntSuccessMsg, setBbntSuccessMsg] = useState("");
  const [previewBbntDoc, setPreviewBbntDoc] = useState<{
    bbntNumber: string;
    projectName: string;
    inspectionDate: string;
    standardReference: string;
    participants: {
      investorSupervisor: string;
      generalContractorPM: string;
      mepfSubcontractorLeader: string;
    };
    workPackageDescription: string;
    totalSpoolCount: number;
    totalCalculatedQty: number;
    unit: string;
    spoolAppendix: Array<{
      spoolCode: string;
      discipline: string;
      systemCode: string;
      floor: string;
      zone: string;
      dimensionSpec: string;
      qty: number;
      unit: string;
      kcsStatus: string;
    }>;
    complianceVerdict: string;
    provenanceHash: string;
    cryptographicSignatureToken: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const resSpools = await fetch("/api/engineering/cad-qto/spools");
      if (resSpools.status === 401) {
        redirectToLogin();
        return;
      }
      if (resSpools.ok) {
        const data = await resSpools.json();
        setSpools(data.spools?.length > 0 ? data.spools : SAMPLE_SPOOLS);
      } else {
        setSpools(SAMPLE_SPOOLS);
      }

      const resVar = await fetch("/api/engineering/cad-qto/variance");
      if (resVar.ok) {
        const dataVar = await resVar.json();
        setVariances(dataVar.variances?.length > 0 ? dataVar.variances : SAMPLE_VARIANCES);
      } else {
        setVariances(SAMPLE_VARIANCES);
      }
    } catch {
      setSpools(SAMPLE_SPOOLS);
      setVariances(SAMPLE_VARIANCES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateStatus = async (spoolId: string, newStatus: SpoolStatus) => {
    setSpools((prev) => prev.map((s) => (s.id === spoolId ? { ...s, status: newStatus } : s)));
    if (selectedSpool?.id === spoolId) {
      setSelectedSpool((prev) => (prev ? { ...prev, status: newStatus } : null));
    }

    try {
      await fetch("/api/engineering/cad-qto/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spoolId, newStatus }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSelectForBbnt = (spoolId: string) => {
    const next = new Set(selectedForBbnt);
    if (next.has(spoolId)) next.delete(spoolId);
    else next.add(spoolId);
    setSelectedForBbnt(next);
  };

  const handleGenerateBbnt = async () => {
    if (selectedForBbnt.size === 0) return;

    try {
      const res = await fetch("/api/engineering/cad-qto/bbnt-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spoolIds: Array.from(selectedForBbnt),
          note: "Nghiệm thu khối lượng phân đoạn CAD Spool Tầng 4",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setBbntSuccessMsg(
          `Đã tạo thành công ${data.code} với tổng khối lượng nghiệm thu: ${data.totalQty} đơn vị.`,
        );
        if (data.electronicBbnt) {
          setPreviewBbntDoc(data.electronicBbnt);
        }
        setSelectedForBbnt(new Set());
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Tính toán Earned Value
  const totalPlanned = spools.reduce((acc, s) => acc + s.calculated_qty, 0);
  const earnedQty = spools.reduce((acc, s) => {
    const w =
      s.status === "fabricated"
        ? 0.2
        : s.status === "delivered"
          ? 0.4
          : s.status === "installed"
            ? 0.75
            : s.status === "qc_passed"
              ? 0.9
              : 1.0;
    return acc + s.calculated_qty * w;
  }, 0);
  const pctComplete = totalPlanned > 0 ? (earnedQty / totalPlanned) * 100 : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="container mx-auto p-4 md:p-6">
        <EngineeringNav />

        {/* Header Banner */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
              <Boxes className="text-amber-400" size={28} />
              CAD & QTO Tracking Studio — Vòng Lặp Kín (M66)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Hợp nhất Bản vẽ CAD &rarr; Đo bóc Khối lượng 5D &rarr; Chấm tiến độ Mặt bằng &rarr; Tự
              động sinh BBNT & Hồ sơ Thanh toán
            </p>
          </div>

          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            <button
              onClick={() => setActiveTab("floorplan")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "floorplan"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Layers size={14} />
              Mặt bằng CAD & Chấm Mốc (Pinning)
            </button>
            <button
              onClick={() => setActiveTab("variance")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "variance"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <TrendingUp size={14} />
              Đối soát 3 Chiều & Cảnh báo VO
            </button>
            <button
              onClick={() => setActiveTab("bbnt")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "bbnt"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileCheck2 size={14} />
              Tạo Hồ sơ Nghiệm thu (BBNT)
            </button>
          </div>
        </div>

        {/* KPI Earned Value Strip */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
            <span className="text-xs font-semibold uppercase text-zinc-400">
              Tổng khối lượng kế hoạch (Planned)
            </span>
            <div className="mt-1 font-mono text-2xl font-bold text-zinc-100">
              {totalPlanned.toFixed(2)} đơn vị
            </div>
          </div>
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 backdrop-blur">
            <span className="text-xs font-semibold uppercase text-emerald-400">
              Khối lượng đạt được (Physical Earned EV)
            </span>
            <div className="mt-1 font-mono text-2xl font-bold text-emerald-400">
              {earnedQty.toFixed(2)} đơn vị ({pctComplete.toFixed(1)}%)
            </div>
          </div>
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 backdrop-blur">
            <span className="text-xs font-semibold uppercase text-amber-400">
              Phát sinh Thiết kế (VO Potential)
            </span>
            <div className="mt-1 font-mono text-2xl font-bold text-amber-300">
              +{variances.reduce((acc, v) => acc + v.estimatedVoVnd, 0).toLocaleString("vi-VN")} đ
            </div>
          </div>
          <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4 backdrop-blur">
            <span className="text-xs font-semibold uppercase text-indigo-400">
              Phân đoạn Spools đang quản lý
            </span>
            <div className="mt-1 font-mono text-2xl font-bold text-indigo-300">
              {spools.length} phân đoạn
            </div>
          </div>
        </div>

        {/* TAB 1: Visual CAD Floorplan & Spool Pinning */}
        {activeTab === "floorplan" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Interactive CAD Canvas Viewport */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-8">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-zinc-200">
                  <Layers size={18} className="text-amber-400" />
                  Mặt Bằng Số Tầng 4 — Hệ Thống Cơ Điện (Interactive Spool Canvas)
                </h2>
                <span className="text-xs text-zinc-400 font-mono">Trục Grid A-F x 1-8</span>
              </div>

              {/* Simplified CAD Grid Canvas */}
              <div className="relative mt-4 h-[440px] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                {/* Background Grid Lines */}
                <div
                  className="absolute inset-0 opacity-15"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, #71717a 1px, transparent 1px), linear-gradient(to bottom, #71717a 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />

                {/* Spool Visual Nodes on CAD Map */}
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                    <span>GRID 1</span>
                    <span>GRID 2</span>
                    <span>GRID 3</span>
                    <span>GRID 4</span>
                    <span>GRID 5</span>
                  </div>

                  {/* Interactive Spool Entities */}
                  <div className="my-auto space-y-6">
                    {spools.map((spool) => {
                      const isSelected = selectedSpool?.id === spool.id;
                      return (
                        <div
                          key={spool.id}
                          onClick={() => setSelectedSpool(spool)}
                          className={`group flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-all ${
                            isSelected
                              ? "border-amber-500 bg-zinc-900 shadow-lg shadow-amber-500/10"
                              : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-3 w-3 rounded-full ${
                                spool.status === "bbnt_approved"
                                  ? "bg-emerald-400 ring-4 ring-emerald-950"
                                  : spool.status === "qc_passed"
                                    ? "bg-indigo-400 ring-4 ring-indigo-950"
                                    : spool.status === "installed"
                                      ? "bg-amber-400 ring-4 ring-amber-950"
                                      : "bg-sky-400 ring-4 ring-sky-950"
                              }`}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-zinc-200">
                                  {spool.spool_code}
                                </span>
                                <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] uppercase text-zinc-400 font-mono">
                                  {spool.discipline}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-zinc-400">
                                {spool.zone_label} | Tiết diện: {spool.dimension_spec} | Dài:{" "}
                                {spool.length_m}m
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs font-bold text-emerald-400">
                              {spool.calculated_qty} {spool.unit}
                            </span>
                            <span
                              className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                                STATUS_COLORS[spool.status]
                              }`}
                            >
                              {STATUS_LABELS[spool.status]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                    <span>TRỤC A</span>
                    <span>TRỤC B</span>
                    <span>TRỤC C</span>
                    <span>TRỤC D</span>
                    <span>TRỤC E</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Spool Details & Stage Controller Drawer */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-4">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <Sliders size={18} className="text-amber-400" />
                Cập Nhật Mốc Tiến Độ (Visual Pinning)
              </h2>

              {selectedSpool ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <span className="text-[11px] uppercase text-zinc-400 font-semibold">
                      Phân đoạn đang chọn
                    </span>
                    <div className="mt-1 font-mono text-sm font-bold text-amber-300">
                      {selectedSpool.spool_code}
                    </div>
                    <div className="mt-2 text-xs text-zinc-300 space-y-1">
                      <div>
                        Hệ thống:{" "}
                        <span className="font-mono text-zinc-100">{selectedSpool.system_code}</span>
                      </div>
                      <div>
                        Khu vực: <span className="text-zinc-100">{selectedSpool.zone_label}</span>
                      </div>
                      <div>
                        Quy cách:{" "}
                        <span className="font-mono text-zinc-100">
                          {selectedSpool.dimension_spec}
                        </span>
                      </div>
                      <div>
                        Khối lượng 5D QTO:{" "}
                        <span className="font-mono font-bold text-emerald-400">
                          {selectedSpool.calculated_qty} {selectedSpool.unit}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">
                      Chuyển trạng thái thi công:
                    </label>
                    <div className="space-y-2">
                      {(
                        [
                          "fabricated",
                          "delivered",
                          "installed",
                          "qc_passed",
                          "bbnt_approved",
                        ] as SpoolStatus[]
                      ).map((st) => (
                        <button
                          key={st}
                          onClick={() => handleUpdateStatus(selectedSpool.id, st)}
                          className={`flex w-full items-center justify-between rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                            selectedSpool.status === st
                              ? "border-amber-500 bg-amber-500/10 text-amber-300"
                              : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
                          }`}
                        >
                          <span>{STATUS_LABELS[st]}</span>
                          {selectedSpool.status === st && <CheckCircle2 size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-zinc-500">
                  <Layers size={32} className="mb-2 opacity-40" />
                  Chạm vào một đoạn tuyến Spool trên mặt bằng CAD để xem chi tiết và chấm mốc tiến
                  độ.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: 3-Way Variance Matrix */}
        {activeTab === "variance" && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-zinc-200">
                <TrendingUp size={18} className="text-amber-400" />
                Ma Trận Đối Soát Khối Lượng 3 Chiều (BOQ Hợp Đồng vs Shopdrawing vs Thi Công)
              </h2>
              <span className="text-xs text-zinc-400">
                Tự động phát hiện chênh lệch & Cảnh báo VO
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="border-b border-zinc-800 bg-zinc-950 font-semibold uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="p-3">Mã BOQ</th>
                    <th className="p-3">Hạng mục công việc</th>
                    <th className="p-3">ĐVT</th>
                    <th className="p-3 font-mono">1. Hợp đồng (BOQ)</th>
                    <th className="p-3 font-mono">2. Shop CAD (QTO)</th>
                    <th className="p-3 font-mono">3. Đã lắp đặt</th>
                    <th className="p-3 font-mono">4. Nghiệm thu (BBNT)</th>
                    <th className="p-3">Sai lệch Shop vs BOQ (VO)</th>
                    <th className="p-3">Dự kiến phát sinh (VND)</th>
                    <th className="p-3">Đánh giá rủi ro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {variances.map((v) => (
                    <tr key={v.boqItemId} className="hover:bg-zinc-800/40">
                      <td className="p-3 font-mono font-bold text-zinc-200">{v.boqCode}</td>
                      <td className="p-3 text-zinc-200 max-w-xs">{v.boqName}</td>
                      <td className="p-3 font-mono">{v.unit}</td>
                      <td className="p-3 font-mono text-zinc-400">{v.qtyContract.toFixed(2)}</td>
                      <td className="p-3 font-mono font-bold text-amber-300">
                        {v.qtyShopCad.toFixed(2)}
                      </td>
                      <td className="p-3 font-mono text-zinc-300">{v.qtyInstalled.toFixed(2)}</td>
                      <td className="p-3 font-mono font-bold text-emerald-400">
                        {v.qtyApprovedBbnt.toFixed(2)}
                      </td>
                      <td className="p-3 font-mono font-bold">
                        <span className={v.deltaVoQty > 0 ? "text-amber-400" : "text-zinc-400"}>
                          {v.deltaVoQty > 0
                            ? `+${v.deltaVoQty.toFixed(2)}`
                            : v.deltaVoQty.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-amber-300">
                        {v.estimatedVoVnd > 0
                          ? `+${v.estimatedVoVnd.toLocaleString("vi-VN")} đ`
                          : "—"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            v.status === "critical_variance"
                              ? "bg-red-950 text-red-400 border border-red-800"
                              : v.status === "vo_risk"
                                ? "bg-amber-950 text-amber-300 border border-amber-800"
                                : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          }`}
                        >
                          {v.status === "critical_variance"
                            ? "CẢNH BÁO VO >15%"
                            : v.status === "vo_risk"
                              ? "PHÁT SINH THIẾT KẾ"
                              : "CHUẨN ĐỊNH MỨC"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Autonomous BBNT Generation */}
        {activeTab === "bbnt" && (
          <div className="space-y-6">
            {bbntSuccessMsg && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-emerald-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{bbntSuccessMsg}</span>
                </div>
                <button
                  onClick={() => setBbntSuccessMsg("")}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Đóng
                </button>
              </div>
            )}

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
              <div className="flex flex-col justify-between gap-3 border-b border-zinc-800 pb-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-bold text-zinc-200">
                    <FileCheck2 size={18} className="text-amber-400" />
                    Danh Mục Phân Đoạn Spool Sẵn Sàng Nghiệm Thu (QC Passed)
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Chọn các phân đoạn đã đạt KCS nội bộ để tự động xuất Phiếu Nghiệm Thu kèm Bảng
                    Khối Lượng
                  </p>
                </div>

                <button
                  onClick={handleGenerateBbnt}
                  disabled={selectedForBbnt.size === 0}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  <FileText size={14} />
                  1-Click Tạo Phiếu Nghiệm Thu ({selectedForBbnt.size} Spools)
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 bg-zinc-950 font-semibold uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="p-3 w-10">Chọn</th>
                      <th className="p-3">Mã Spool</th>
                      <th className="p-3">Bộ môn</th>
                      <th className="p-3">Hệ thống</th>
                      <th className="p-3">Vị trí</th>
                      <th className="p-3">Quy cách</th>
                      <th className="p-3">Khối lượng 5D</th>
                      <th className="p-3">Trạng thái hiện tại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {spools.map((s) => {
                      const isChecked = selectedForBbnt.has(s.id);
                      return (
                        <tr key={s.id} className="hover:bg-zinc-800/40">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectForBbnt(s.id)}
                              className="rounded border-zinc-700 bg-zinc-900 text-amber-500"
                            />
                          </td>
                          <td className="p-3 font-mono font-bold text-zinc-100">{s.spool_code}</td>
                          <td className="p-3 uppercase">{s.discipline}</td>
                          <td className="p-3 font-mono">{s.system_code}</td>
                          <td className="p-3 text-zinc-400">
                            {s.floor_label} - {s.zone_label}
                          </td>
                          <td className="p-3 font-mono">{s.dimension_spec}</td>
                          <td className="p-3 font-mono font-bold text-emerald-400">
                            {s.calculated_qty} {s.unit}
                          </td>
                          <td className="p-3">
                            <span
                              className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                                STATUS_COLORS[s.status]
                              }`}
                            >
                              {STATUS_LABELS[s.status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {/* MODAL XEM & IN BIÊN BẢN NGHIỆM THU ĐIỆN TỬ (ELECTRONIC BBNT NGHỊ ĐỊNH 06) */}
        {previewBbntDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-950 p-6 sm:p-8 shadow-2xl text-zinc-100 space-y-6 my-8">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs uppercase">
                  <ShieldCheck className="w-4 h-4" />
                  Hồ Sơ Nghiệm Thu Điện Tử Hợp Chuẩn (Nghị định 06/2021/NĐ-CP)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition shadow"
                  >
                    <FileText className="w-3.5 h-3.5" /> In Biên Bản (Print)
                  </button>
                  <button
                    onClick={() => setPreviewBbntDoc(null)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition"
                  >
                    Đóng
                  </button>
                </div>
              </div>

              {/* Khung tài liệu BBNT chuẩn văn bản */}
              <div className="bg-white text-zinc-900 p-8 rounded-xl shadow-inner space-y-6 font-serif text-sm">
                <div className="text-center space-y-1 border-b pb-4">
                  <div className="font-bold text-xs uppercase tracking-wider">
                    CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                  </div>
                  <div className="text-xs italic underline">Độc lập - Tự do - Hạnh phúc</div>
                  <div className="pt-4 font-bold text-base uppercase text-zinc-950">
                    BIÊN BẢN NGHIỆM THU CÔNG VIỆC XÂY DỰNG & LẮP ĐẶT THIẾT BỊ MEPF
                  </div>
                  <div className="text-xs font-mono text-zinc-600">
                    Số: {previewBbntDoc.bbntNumber} • Ngày: {previewBbntDoc.inspectionDate}
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <strong>1. Công trình / Dự án:</strong> {previewBbntDoc.projectName}
                  </div>
                  <div>
                    <strong>2. Căn cứ pháp lý & kỹ thuật:</strong>{" "}
                    {previewBbntDoc.standardReference}
                  </div>
                  <div>
                    <strong>3. Thành phần nghiệm thu:</strong>
                  </div>
                  <ul className="list-disc list-inside pl-4 text-zinc-700 space-y-0.5">
                    <li>
                      Đại diện TVGS / Chủ đầu tư: {previewBbntDoc.participants.investorSupervisor}
                    </li>
                    <li>
                      Đại diện Tổng thầu thi công: {previewBbntDoc.participants.generalContractorPM}
                    </li>
                    <li>
                      Đại diện Thầu phụ chuyên ngành MEPF:{" "}
                      {previewBbntDoc.participants.mepfSubcontractorLeader}
                    </li>
                  </ul>
                  <div>
                    <strong>4. Nội dung nghiệm thu:</strong> {previewBbntDoc.workPackageDescription}
                  </div>
                  <div>
                    <strong>5. Tổng khối lượng nghiệm thu:</strong>{" "}
                    <span className="font-bold text-blue-700 font-mono text-sm">
                      {previewBbntDoc.totalCalculatedQty} {previewBbntDoc.unit}
                    </span>{" "}
                    ({previewBbntDoc.totalSpoolCount} phân đoạn)
                  </div>
                </div>

                {/* Bảng phụ lục khối lượng */}
                <div className="space-y-2">
                  <div className="font-bold text-xs">
                    PHỤ LỤC CHI TIẾT DANH MỤC PHÂN ĐOẠN CAD SPOOL NGHIỆM THU:
                  </div>
                  <div className="border border-zinc-300 rounded overflow-hidden">
                    <table className="w-full text-left text-[11px] font-sans">
                      <thead className="bg-zinc-100 border-b border-zinc-300 font-bold text-zinc-700">
                        <tr>
                          <th className="p-2">Mã Spool</th>
                          <th className="p-2">Hệ Thống</th>
                          <th className="p-2">Vị Trí</th>
                          <th className="p-2">Quy Cách Tiết Diện</th>
                          <th className="p-2 text-right">Khối Lượng 5D</th>
                          <th className="p-2">Đánh Giá KCS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {previewBbntDoc.spoolAppendix.map((item, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-mono font-bold">{item.spoolCode}</td>
                            <td className="p-2">
                              {item.discipline} ({item.systemCode})
                            </td>
                            <td className="p-2">
                              {item.floor} - {item.zone}
                            </td>
                            <td className="p-2 font-mono">{item.dimensionSpec}</td>
                            <td className="p-2 text-right font-mono font-bold">
                              {item.qty} {item.unit}
                            </td>
                            <td className="p-2 font-bold text-emerald-700">{item.kcsStatus}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Kết luận & Chữ ký số */}
                <div className="border-t pt-4 space-y-4 text-xs">
                  <div>
                    <strong>6. Kết luận:</strong>{" "}
                    <span className="font-bold text-emerald-800">
                      {previewBbntDoc.complianceVerdict}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center pt-4 font-sans text-xs">
                    <div>
                      <div className="font-bold">ĐẠI DIỆN TVGS</div>
                      <div className="text-[10px] text-zinc-500 italic">(Ký, ghi rõ họ tên)</div>
                      <div className="mt-8 font-mono text-[10px] text-zinc-400">
                        [Đã Ký Điện Tử]
                      </div>
                    </div>
                    <div>
                      <div className="font-bold">TỔNG THẦU THI CÔNG</div>
                      <div className="text-[10px] text-zinc-500 italic">(Ký, ghi rõ họ tên)</div>
                      <div className="mt-8 font-mono text-[10px] text-blue-700 font-bold">
                        {previewBbntDoc.participants.generalContractorPM}
                      </div>
                    </div>
                    <div>
                      <div className="font-bold">THẦU PHỤ MEPF</div>
                      <div className="text-[10px] text-zinc-500 italic">(Ký, ghi rõ họ tên)</div>
                      <div className="mt-8 font-mono text-[10px] text-zinc-400">
                        [Đã Ký Điện Tử]
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-200 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                    <div>Mã Xác Thực Provenance: {previewBbntDoc.provenanceHash}</div>
                    <div>Token Ký Duyệt: {previewBbntDoc.cryptographicSignatureToken}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
