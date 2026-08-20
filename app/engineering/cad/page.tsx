"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Layers,
  Code,
  FileDiff,
  Boxes,
  Sparkles,
  RefreshCw,
  Copy,
  Download,
  Check,
  AlertTriangle,
  FileCheck,
  Wrench,
  Search,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

interface CadDiffItem {
  entityId: string;
  type: string;
  layer: string;
  diffStatus: "added" | "removed" | "modified" | "unchanged";
  changeDescription: string;
  location: [number, number, number];
}

interface CadDiffResult {
  sessionId?: string | null;
  totalBase: number;
  totalCompare: number;
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  differences: CadDiffItem[];
  potentialVoImpact: {
    estimatedCostVnd: number;
    riskLevel: "low" | "medium" | "high";
    reason: string;
  };
}

interface BlockCatalogItem {
  id?: string;
  block_name: string;
  discipline: string;
  category: string;
  attribute_schema: Record<string, unknown>;
  mapped_boq_code: string | null;
  mapped_material_id?: number | null;
}

export default function CadEngineeringStudioPage() {
  const [activeTab, setActiveTab] = useState<"diff" | "blocks" | "lisp" | "doctor">("diff");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // CAD Diff States
  const [diffResult, setDiffResult] = useState<CadDiffResult | null>(null);

  // Block Catalog States
  const [blockCatalogs, setBlockCatalogs] = useState<BlockCatalogItem[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  // AutoLISP Generator States
  const [lispType, setLispType] = useState<"hanger" | "sleeve" | "duct_transition">("hanger");
  const [hangerWidth, setHangerWidth] = useState(600);
  const [hangerHeight, setHangerHeight] = useState(400);
  const [rodDiameter, setRodDiameter] = useState(10);
  const [sleeveDiameter, setSleeveDiameter] = useState(150);
  const [sleeveTag, setSleeveTag] = useState("SL-FP-01");
  const [inletWidth, setInletWidth] = useState(800);
  const [inletHeight, setInletHeight] = useState(400);
  const [outletWidth, setOutletWidth] = useState(600);
  const [outletHeight, setOutletHeight] = useState(400);
  const [transitionLength, setTransitionLength] = useState(600);
  const [generatedLispCode, setGeneratedLispCode] = useState("");

  // Font Doctor States
  const [legacyInput, setLegacyInput] = useState("HÖ thèng th«ng giã tÇng 4");
  const [convertedText, setConvertedText] = useState("");

  // B3 Fix: Gọi API thật POST /api/engineering/cad/diff
  const runDiffAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const sampleBaseEntities = [
        {
          id: "E-BASE-01",
          type: "polyline",
          layer: "M-DUCT-SUPP",
          coordinates: { start: [1000, 2000, 3000], end: [5000, 2000, 3000] },
          textValue: "Duct 600x400 L=4m",
        },
        {
          id: "E-BASE-02",
          type: "insert_block",
          layer: "M-DIFFUSER",
          coordinates: { center: [2000, 2000, 2800] },
          blockName: "BLK_DIFFUSER_600",
        },
        {
          id: "E-BASE-03",
          type: "line",
          layer: "P-PIPE-COLD",
          coordinates: { start: [1000, 1500, 2850], end: [4000, 1500, 2850] },
          textValue: "DN50 PPR +2.85m",
        },
        {
          id: "E-BASE-04",
          type: "line",
          layer: "E-TRAY-PWRR",
          coordinates: { start: [4100, 2200, 3200], end: [6000, 2200, 3200] },
          textValue: "Tray 300x100",
        },
      ];

      const sampleCompareEntities = [
        {
          id: "E-BASE-01",
          type: "polyline",
          layer: "M-DUCT-SUPP",
          coordinates: { start: [1000, 2000, 3000], end: [5000, 2000, 3000] },
          textValue: "Duct 600x400 L=4m",
        },
        {
          id: "E-BASE-02",
          type: "insert_block",
          layer: "M-DIFFUSER",
          coordinates: { center: [2000, 2000, 2800] },
          blockName: "BLK_DIFFUSER_600",
        },
        {
          id: "E-BASE-03",
          type: "line",
          layer: "P-PIPE-COLD",
          coordinates: { start: [1000, 1500, 3100], end: [4000, 1500, 3100] },
          textValue: "DN50 PPR +3.10m (Né dầm)", // Modified text & elevation
        },
        {
          id: "E-NEW-05",
          type: "polyline",
          layer: "M-DUCT-SUPP",
          coordinates: { start: [1200, 3400, 2900], end: [3000, 3400, 2900] },
          textValue: "Nhánh ống gió 400x300 Zone B",
        },
        {
          id: "E-NEW-06",
          type: "insert_block",
          layer: "M-DIFFUSER",
          coordinates: { center: [1400, 3600, 2700] },
          blockName: "BLK_DIFFUSER_600",
        },
      ];

      const res = await fetch("/api/engineering/cad/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseEntities: sampleBaseEntities,
          compareEntities: sampleCompareEntities,
          toleranceMm: 5,
        }),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setDiffResult(data);
      }
    } catch (e) {
      console.error("CAD Diff error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // B4 Fix: Gọi API thật GET /api/engineering/cad/blocks
  const fetchBlockCatalogs = useCallback(async () => {
    setLoadingBlocks(true);
    try {
      const res = await fetch("/api/engineering/cad/blocks");
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setBlockCatalogs(data);
        } else {
          // Fallback sample blocks nếu DB chưa seed
          setBlockCatalogs([
            {
              block_name: "BLK_VAV_BOX_500",
              discipline: "HVAC",
              category: "Thiết bị phân phối gió",
              attribute_schema: { AirFlow: "1200 m3/h", Coil: "2-Row", In: "Ø250", Out: "400x250" },
              mapped_boq_code: "HVAC-VAV-500",
            },
            {
              block_name: "BLK_SPRINKLER_PENDENT",
              discipline: "PCCC",
              category: "Đầu phun chữa cháy",
              attribute_schema: { Thread: 'NPT 1/2"', "K-Factor": 5.6, Temp: "68°C" },
              mapped_boq_code: "FP-SPK-68C",
            },
            {
              block_name: "BLK_PANEL_DB_LV",
              discipline: "Điện",
              category: "Tủ điện phân phối",
              attribute_schema: { Rating: "100A", Poles: "3P+N", Form: "2B", IP: "IP54" },
              mapped_boq_code: "ELEC-PANEL-DB",
            },
          ]);
        }
      }
    } catch (e) {
      console.error("Fetch blocks error:", e);
    } finally {
      setLoadingBlocks(false);
    }
  }, []);

  const handleGenerateLisp = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad/lisp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType: lispType,
          params: {
            widthMm: hangerWidth,
            heightMm: hangerHeight,
            rodDiameterMm: rodDiameter,
            diameterMm: sleeveDiameter,
            tagLabel: sleeveTag,
            inletWidthMm: inletWidth,
            inletHeightMm: inletHeight,
            outletWidthMm: outletWidth,
            outletHeightMm: outletHeight,
            transitionLengthMm: transitionLength,
          },
        }),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setGeneratedLispCode(data.lispCode);
      }
    } catch (e) {
      console.error(e);
    }
  }, [
    lispType,
    hangerWidth,
    hangerHeight,
    rodDiameter,
    sleeveDiameter,
    sleeveTag,
    inletWidth,
    inletHeight,
    outletWidth,
    outletHeight,
    transitionLength,
  ]);

  const handleConvertFont = async () => {
    try {
      const res = await fetch("/api/engineering/cad/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legacyText: legacyInput }),
      });

      if (res.ok) {
        const data = await res.json();
        setConvertedText(data.unicodeText || legacyInput);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    runDiffAnalysis();
    handleGenerateLisp();
  }, [runDiffAnalysis, handleGenerateLisp]);

  useEffect(() => {
    if (activeTab === "blocks") {
      fetchBlockCatalogs();
    }
  }, [activeTab, fetchBlockCatalogs]);

  const handleCopyCode = () => {
    if (!generatedLispCode) return;
    navigator.clipboard.writeText(generatedLispCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLisp = () => {
    const blob = new Blob([generatedLispCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xboss_${lispType}_detail.lsp`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="container mx-auto p-4 md:p-6">
        <EngineeringNav />

        {/* Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
              <Code className="text-amber-400" size={28} />
              CAD Engineering Studio & Autonomous Drafting (M65 / M89)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              So sánh vector phiên bản (CAD Visual Diff), bóc tách Block động, tự động sinh mã
              AutoLISP và chuẩn hóa Layer/Font Unicode
            </p>
          </div>

          <div className="flex flex-wrap rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            <button
              onClick={() => setActiveTab("diff")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "diff"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileDiff size={14} />
              So sánh Bản vẽ (CAD Diff)
            </button>
            <button
              onClick={() => setActiveTab("blocks")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "blocks"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Boxes size={14} />
              Block QTO Extractor
            </button>
            <button
              onClick={() => setActiveTab("lisp")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "lisp"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sparkles size={14} />
              AutoLISP Drafter
            </button>
            <button
              onClick={() => setActiveTab("doctor")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "doctor"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Wrench size={14} />
              Font & Layer Doctor
            </button>
          </div>
        </div>

        {/* Tab 1: Visual CAD Diff */}
        {activeTab === "diff" && (
          <div className="space-y-6">
            {loading && <PageSkeleton />}
            {!loading && diffResult && (
              <>
                {/* KPI Banner */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                    <span className="text-xs font-semibold uppercase text-zinc-400">
                      Tổng thực thể Base &rarr; Compare
                    </span>
                    <div className="mt-1 font-mono text-2xl font-bold text-zinc-100">
                      {diffResult.totalBase} &rarr; {diffResult.totalCompare}
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 backdrop-blur">
                    <span className="text-xs font-semibold uppercase text-emerald-400">
                      Thêm mới (Added)
                    </span>
                    <div className="mt-1 font-mono text-2xl font-bold text-emerald-400">
                      +{diffResult.summary.added} đối tượng
                    </div>
                  </div>
                  <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 backdrop-blur">
                    <span className="text-xs font-semibold uppercase text-red-400">
                      Bị xóa (Removed)
                    </span>
                    <div className="mt-1 font-mono text-2xl font-bold text-red-400">
                      -{diffResult.summary.removed} đối tượng
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 backdrop-blur">
                    <span className="text-xs font-semibold uppercase text-amber-400">
                      Thay đổi (Modified)
                    </span>
                    <div className="mt-1 font-mono text-2xl font-bold text-amber-400">
                      ~{diffResult.summary.modified} đối tượng
                    </div>
                  </div>
                </div>

                {/* VO Impact Card */}
                <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-5 backdrop-blur">
                  <div className="flex items-start gap-4">
                    <ShieldAlert className="mt-0.5 text-amber-400" size={24} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-amber-300">
                          Đánh giá Nguy cơ Phát sinh Hợp đồng (VO Potential Impact)
                        </h3>
                        <span className="rounded bg-amber-900/60 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                          MỨC ĐỘ: {diffResult.potentialVoImpact.riskLevel.toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-300">
                        {diffResult.potentialVoImpact.reason}
                      </p>
                      <div className="mt-3 flex items-center gap-6">
                        <div>
                          <span className="text-[10px] text-zinc-400">Chi phí ước tính VO:</span>
                          <span className="ml-2 font-mono text-base font-bold text-amber-400">
                            {diffResult.potentialVoImpact.estimatedCostVnd.toLocaleString("vi-VN")}{" "}
                            đ
                          </span>
                        </div>
                        {diffResult.sessionId && (
                          <div className="text-[10px] text-zinc-500">
                            Session DB ID: {diffResult.sessionId}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Diff Table */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <h2 className="flex items-center gap-2 text-base font-bold text-zinc-200">
                      <FileDiff size={18} className="text-amber-400" />
                      Chi tiết Các đối tượng Khác biệt giữa 2 phiên bản
                    </h2>
                    <button
                      onClick={runDiffAnalysis}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
                    >
                      <RefreshCw size={12} />
                      Chạy lại So sánh
                    </button>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="border-b border-zinc-800 bg-zinc-950 font-semibold uppercase tracking-wider text-zinc-400">
                        <tr>
                          <th className="p-3">Entity ID</th>
                          <th className="p-3">Loại đối tượng</th>
                          <th className="p-3">Layer</th>
                          <th className="p-3">Trạng thái Diff</th>
                          <th className="p-3">Mô tả Thay đổi</th>
                          <th className="p-3">Tọa độ [X, Y, Z]</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {diffResult.differences.map((item, idx) => (
                          <tr key={idx} className="hover:bg-zinc-800/40">
                            <td className="p-3 font-mono font-bold text-zinc-100">
                              {item.entityId}
                            </td>
                            <td className="p-3 font-mono uppercase text-zinc-400">{item.type}</td>
                            <td className="p-3 font-mono text-zinc-300">{item.layer}</td>
                            <td className="p-3">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  item.diffStatus === "added"
                                    ? "border border-emerald-800 bg-emerald-950 text-emerald-400"
                                    : item.diffStatus === "removed"
                                      ? "border border-red-800 bg-red-950 text-red-400"
                                      : "border border-amber-800 bg-amber-950 text-amber-300"
                                }`}
                              >
                                {item.diffStatus}
                              </span>
                            </td>
                            <td className="p-3 text-zinc-200">{item.changeDescription}</td>
                            <td className="p-3 font-mono text-zinc-400">
                              [{item.location.join(", ")}]
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Dynamic Block QTO */}
        {activeTab === "blocks" && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-zinc-200">
                <Boxes size={18} className="text-amber-400" />
                Bóc tách Thuộc tính Block Động CAD & Liên kết BOQ
              </h2>
              <button
                onClick={fetchBlockCatalogs}
                disabled={loadingBlocks}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                <RefreshCw size={12} className={loadingBlocks ? "animate-spin" : ""} />
                Làm mới
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="border-b border-zinc-800 bg-zinc-950 font-semibold uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="p-3">Tên Block CAD</th>
                    <th className="p-3">Bộ môn</th>
                    <th className="p-3">Phân loại</th>
                    <th className="p-3">Thuộc tính Trích xuất (Dynamic Attributes)</th>
                    <th className="p-3">Mã BOQ Ánh xạ</th>
                    <th className="p-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {blockCatalogs.map((b, i) => (
                    <tr key={i} className="hover:bg-zinc-800/40">
                      <td className="p-3 font-mono font-bold text-zinc-100">{b.block_name}</td>
                      <td className="p-3 uppercase text-zinc-400">{b.discipline}</td>
                      <td className="p-3 text-zinc-300">{b.category}</td>
                      <td className="p-3 font-mono text-zinc-300">
                        {Object.entries(b.attribute_schema)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" | ")}
                      </td>
                      <td className="p-3 font-mono text-amber-300">
                        {b.mapped_boq_code || "CHƯA MAP"}
                      </td>
                      <td className="p-3">
                        <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          ĐÃ KHỚP BOQ
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: AutoLISP Generator */}
        {activeTab === "lisp" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Parameters Form */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-4">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <Sparkles size={18} className="text-amber-400" />
                Cấu hình Chi tiết Cần Vẽ
              </h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-400">
                    Loại chi tiết điển hình
                  </label>
                  <select
                    value={lispType}
                    onChange={(e) =>
                      setLispType(e.target.value as "hanger" | "sleeve" | "duct_transition")
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                  >
                    <option value="hanger">Giá đỡ ty treo chữ U (Trapeze Hanger)</option>
                    <option value="sleeve">Lỗ mở sleeve xuyên dầm sàn</option>
                    <option value="duct_transition">Côn chuyển tiết diện ống gió</option>
                  </select>
                </div>

                {lispType === "hanger" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Chiều rộng xà ngang (mm)
                      </label>
                      <input
                        type="number"
                        value={hangerWidth}
                        onChange={(e) => setHangerWidth(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Chiều dài ty treo (mm)
                      </label>
                      <input
                        type="number"
                        value={hangerHeight}
                        onChange={(e) => setHangerHeight(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Đường kính ty giằng (mm)
                      </label>
                      <input
                        type="number"
                        value={rodDiameter}
                        onChange={(e) => setRodDiameter(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                      />
                    </div>
                  </>
                )}

                {lispType === "sleeve" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Đường kính ống Sleeve (mm)
                      </label>
                      <input
                        type="number"
                        value={sleeveDiameter}
                        onChange={(e) => setSleeveDiameter(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Ký hiệu Sleeve
                      </label>
                      <input
                        type="text"
                        value={sleeveTag}
                        onChange={(e) => setSleeveTag(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                      />
                    </div>
                  </>
                )}

                {lispType === "duct_transition" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-zinc-400">
                          Rộng đầu vào (mm)
                        </label>
                        <input
                          type="number"
                          value={inletWidth}
                          onChange={(e) => setInletWidth(Number(e.target.value))}
                          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-zinc-400">
                          Cao đầu vào (mm)
                        </label>
                        <input
                          type="number"
                          value={inletHeight}
                          onChange={(e) => setInletHeight(Number(e.target.value))}
                          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-zinc-400">
                          Rộng đầu ra (mm)
                        </label>
                        <input
                          type="number"
                          value={outletWidth}
                          onChange={(e) => setOutletWidth(Number(e.target.value))}
                          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-zinc-400">
                          Cao đầu ra (mm)
                        </label>
                        <input
                          type="number"
                          value={outletHeight}
                          onChange={(e) => setOutletHeight(Number(e.target.value))}
                          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Chiều dài côn chuyển L (mm)
                      </label>
                      <input
                        type="number"
                        value={transitionLength}
                        onChange={(e) => setTransitionLength(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                      />
                    </div>
                  </>
                )}

                <button
                  onClick={handleGenerateLisp}
                  className="w-full rounded-lg bg-amber-500 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400"
                >
                  Sinh mã AutoLISP
                </button>
              </div>
            </div>

            {/* Code Preview */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-8">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-zinc-200">
                  <Code size={18} className="text-amber-400" />
                  Mã AutoLISP Generated (.lsp / .scr)
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 rounded bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    {copied ? "Đã sao chép" : "Copy Code"}
                  </button>
                  <button
                    onClick={handleDownloadLisp}
                    className="flex items-center gap-1 rounded bg-amber-500 px-2.5 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400"
                  >
                    <Download size={14} />
                    Tải file .lsp
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <pre className="max-h-[460px] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-emerald-400">
                  {generatedLispCode}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Font & Layer Doctor */}
        {activeTab === "doctor" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Font Doctor */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <Wrench size={18} className="text-amber-400" />
                Khắc phục Lỗi Font Tiếng Việt (TCVN3 / VNI &rarr; Unicode)
              </h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-400">
                    Văn bản CAD lỗi font (MText / DText TCVN3-ABC)
                  </label>
                  <textarea
                    rows={4}
                    value={legacyInput}
                    onChange={(e) => setLegacyInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs text-zinc-100"
                  />
                </div>

                <button
                  onClick={handleConvertFont}
                  className="w-full rounded-lg bg-amber-500 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400"
                >
                  Chuyển đổi sang Chuẩn Unicode UTF-8
                </button>

                {convertedText && (
                  <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-3">
                    <span className="text-[10px] font-bold uppercase text-emerald-400">
                      Kết quả Chuyển đổi:
                    </span>
                    <p className="mt-1 text-sm font-semibold text-emerald-200">{convertedText}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Layer Doctor */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <Layers size={18} className="text-amber-400" />
                Quy chuẩn Phân tầng Layer AIA / BS1192 cho MEPF
              </h2>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 bg-zinc-950 font-semibold uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="p-2.5">Layer Gốc Thường Gặp</th>
                      <th className="p-2.5">&rarr;</th>
                      <th className="p-2.5">Layer Chuẩn AIA/MEPF</th>
                      <th className="p-2.5">Màu ACI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    <tr>
                      <td className="p-2.5 font-mono text-zinc-400">ONG_GIO, DUCT_SA</td>
                      <td className="p-2.5">&rarr;</td>
                      <td className="p-2.5 font-mono font-bold text-sky-400">M-DUCT-SUPP</td>
                      <td className="p-2.5 text-zinc-400">Cyan (4)</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono text-zinc-400">ONG_NUOC_LANH, PIPE_CHW</td>
                      <td className="p-2.5">&rarr;</td>
                      <td className="p-2.5 font-mono font-bold text-blue-400">M-CWTR-PIPE</td>
                      <td className="p-2.5 text-zinc-400">Blue (5)</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono text-zinc-400">THOAT_NUOC, DRAIN</td>
                      <td className="p-2.5">&rarr;</td>
                      <td className="p-2.5 font-mono font-bold text-emerald-400">P-PIPE-SANR</td>
                      <td className="p-2.5 text-zinc-400">Green (3)</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono text-zinc-400">MANG_DIEN, CABLE_TRAY</td>
                      <td className="p-2.5">&rarr;</td>
                      <td className="p-2.5 font-mono font-bold text-amber-400">E-TRAY-PWRR</td>
                      <td className="p-2.5 text-zinc-400">Yellow (2)</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono text-zinc-400">CHUA_CHAY, SPRINKLER</td>
                      <td className="p-2.5">&rarr;</td>
                      <td className="p-2.5 font-mono font-bold text-red-400">F-SPRN-PIPE</td>
                      <td className="p-2.5 text-zinc-400">Red (1)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
