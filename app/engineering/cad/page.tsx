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

export default function CadEngineeringStudioPage() {
  const [activeTab, setActiveTab] = useState<"diff" | "blocks" | "lisp" | "doctor">("diff");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // CAD Diff States
  const [diffResult, setDiffResult] = useState<CadDiffResult | null>(null);

  // AutoLISP Generator States
  const [lispType, setLispType] = useState<"hanger" | "sleeve">("hanger");
  const [hangerWidth, setHangerWidth] = useState(600);
  const [hangerHeight, setHangerHeight] = useState(400);
  const [rodDiameter, setRodDiameter] = useState(10);
  const [sleeveDiameter, setSleeveDiameter] = useState(150);
  const [sleeveTag, setSleeveTag] = useState("SL-FP-01");
  const [generatedLispCode, setGeneratedLispCode] = useState("");

  // Font Doctor States
  const [legacyInput, setLegacyInput] = useState("HÖ thèng th«ng giã tÇng 4");
  const [convertedText, setConvertedText] = useState("");

  const runSampleDiff = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setDiffResult({
        totalBase: 1240,
        totalCompare: 1315,
        summary: {
          added: 75,
          removed: 12,
          modified: 28,
          unchanged: 1200,
        },
        differences: [
          {
            entityId: "DIFF-001",
            type: "polyline",
            layer: "M-DUCT-SUPP",
            diffStatus: "added",
            changeDescription: "Bổ sung nhánh ống gió cấp 400x300 vào phòng họp Zone B",
            location: [1200, 3400, 2900],
          },
          {
            entityId: "DIFF-002",
            type: "insert_block",
            layer: "M-DIFFUSER",
            diffStatus: "added",
            changeDescription: "Bổ sung 4 miệng gió khuếch tán vuông 600x600",
            location: [1400, 3600, 2700],
          },
          {
            entityId: "DIFF-003",
            type: "polyline",
            layer: "P-PIPE-COLD",
            diffStatus: "modified",
            changeDescription: "Nâng cao độ tim ống nước cấp từ +2.85m lên +3.10m để né dầm",
            location: [2800, 1900, 3100],
          },
          {
            entityId: "DIFF-004",
            type: "line",
            layer: "E-TRAY-PWRR",
            diffStatus: "removed",
            changeDescription: "Hủy bỏ nhánh máng cáp phụ do gộp tuyến vào máng chính",
            location: [4100, 2200, 3200],
          },
        ],
        potentialVoImpact: {
          estimatedCostVnd: 18500000,
          riskLevel: "medium",
          reason:
            "Phát hiện 75 đối tượng thêm mới (nhánh ống gió và miệng gió phụ) có nguy cơ phát sinh chi phí hợp đồng VO.",
        },
      });
      setLoading(false);
    }, 400);
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
  }, [lispType, hangerWidth, hangerHeight, rodDiameter, sleeveDiameter, sleeveTag]);

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
    runSampleDiff();
    handleGenerateLisp();
  }, [runSampleDiff, handleGenerateLisp]);

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
              CAD Engineering Studio & Autonomous Drafting (M65)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              So sánh vector phiên bản (CAD Visual Diff), bóc tách Block động, tự động sinh mã
              AutoLISP và chuẩn hóa Layer/Font Unicode
            </p>
          </div>

          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
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
        {activeTab === "diff" && diffResult && (
          <div className="space-y-6">
            {/* KPI Banner */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                <span className="text-xs text-zinc-400 font-semibold uppercase">
                  Tổng thực thể Rev A vs B
                </span>
                <div className="mt-1 text-2xl font-bold font-mono text-zinc-100">
                  {diffResult.totalBase} &rarr; {diffResult.totalCompare}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 backdrop-blur">
                <span className="text-xs text-emerald-400 font-semibold uppercase">
                  Thêm mới (Added)
                </span>
                <div className="mt-1 text-2xl font-bold font-mono text-emerald-400">
                  +{diffResult.summary.added} đối tượng
                </div>
              </div>
              <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 backdrop-blur">
                <span className="text-xs text-red-400 font-semibold uppercase">
                  Bị xóa (Removed)
                </span>
                <div className="mt-1 text-2xl font-bold font-mono text-red-400">
                  -{diffResult.summary.removed} đối tượng
                </div>
              </div>
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 backdrop-blur">
                <span className="text-xs text-amber-400 font-semibold uppercase">
                  Thay đổi (Modified)
                </span>
                <div className="mt-1 text-2xl font-bold font-mono text-amber-300">
                  {diffResult.summary.modified} đối tượng
                </div>
              </div>
            </div>

            {/* VO Impact Alert Box */}
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                  <ShieldAlert size={18} />
                  Cảnh báo Phát sinh Khối lượng & Chi phí (Potential VO Impact):
                </div>
                <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-zinc-950 uppercase">
                  Ước tính: +{diffResult.potentialVoImpact.estimatedCostVnd.toLocaleString("vi-VN")}{" "}
                  đ
                </span>
              </div>
              <p className="mt-2 text-xs text-amber-200/90">
                {diffResult.potentialVoImpact.reason}
              </p>
            </div>

            {/* Diff Elements Table */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <FileDiff size={18} className="text-amber-400" />
                Danh mục Chi tiết Sai khác Hình học & Thuộc tính CAD
              </h2>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 bg-zinc-950 font-semibold uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="p-3">Mã thực thể</th>
                      <th className="p-3">Loại đối tượng</th>
                      <th className="p-3">Layer CAD</th>
                      <th className="p-3">Trạng thái Diff</th>
                      <th className="p-3">Nội dung thay đổi chi tiết</th>
                      <th className="p-3">Tọa độ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {diffResult.differences.map((item) => (
                      <tr key={item.entityId} className="hover:bg-zinc-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-300">{item.entityId}</td>
                        <td className="p-3 font-mono uppercase">{item.type}</td>
                        <td className="p-3 font-mono text-zinc-400">{item.layer}</td>
                        <td className="p-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                              item.diffStatus === "added"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : item.diffStatus === "removed"
                                  ? "bg-red-950 text-red-400 border border-red-800"
                                  : "bg-amber-950 text-amber-300 border border-amber-800"
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
          </div>
        )}

        {/* Tab 2: Dynamic Block QTO */}
        {activeTab === "blocks" && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
            <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
              <Boxes size={18} className="text-amber-400" />
              Bóc tách Thuộc tính Block Động CAD & Liên kết BOQ
            </h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="border-b border-zinc-800 bg-zinc-950 font-semibold uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="p-3">Tên Block CAD</th>
                    <th className="p-3">Bộ môn</th>
                    <th className="p-3">Số lượng đếm</th>
                    <th className="p-3">Thuộc tính Trích xuất (Dynamic Attributes)</th>
                    <th className="p-3">Mã BOQ Ánh xạ</th>
                    <th className="p-3">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  <tr className="hover:bg-zinc-800/40">
                    <td className="p-3 font-mono font-bold text-zinc-100">BLK_VAV_BOX_500</td>
                    <td className="p-3 uppercase">HVAC</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">18 bộ</td>
                    <td className="p-3 font-mono text-zinc-300">
                      AirFlow: 1200 m3/h | Coil: 2-Row | In: Ø250 | Out: 400x250
                    </td>
                    <td className="p-3 font-mono text-amber-300">HVAC-VAV-500</td>
                    <td className="p-3">
                      <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        ĐÃ KHỚP BOQ
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-zinc-800/40">
                    <td className="p-3 font-mono font-bold text-zinc-100">BLK_SPRINKLER_PENDENT</td>
                    <td className="p-3 uppercase">PCCC</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">240 cái</td>
                    <td className="p-3 font-mono text-zinc-300">
                      Thread: NPT 1/2&quot; | K-Factor: 5.6 | Temp: 68°C
                    </td>
                    <td className="p-3 font-mono text-amber-300">FP-SPK-68C</td>
                    <td className="p-3">
                      <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        ĐÃ KHỚP BOQ
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-zinc-800/40">
                    <td className="p-3 font-mono font-bold text-zinc-100">BLK_PANEL_DB_LV</td>
                    <td className="p-3 uppercase">Điện</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">6 tủ</td>
                    <td className="p-3 font-mono text-zinc-300">
                      Rating: 100A | Poles: 3P+N | Form: 2B | IP: IP54
                    </td>
                    <td className="p-3 font-mono text-amber-300">ELEC-PANEL-DB</td>
                    <td className="p-3">
                      <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        ĐÃ KHỚP BOQ
                      </span>
                    </td>
                  </tr>
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
                    onChange={(e) => setLispType(e.target.value as "hanger" | "sleeve")}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                  >
                    <option value="hanger">Giá đỡ ty treo chữ U (Trapeze Hanger)</option>
                    <option value="sleeve">Lỗ mở sleeve xuyên dầm sàn</option>
                  </select>
                </div>

                {lispType === "hanger" ? (
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
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Đường kính lỗ sleeve (mm)
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
                        Nhãn ký hiệu (Tag)
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

                <button
                  onClick={handleGenerateLisp}
                  className="w-full rounded-lg bg-amber-500 py-2 text-xs font-bold text-zinc-950 transition-colors hover:bg-amber-400"
                >
                  Sinh mã AutoLISP
                </button>
              </div>
            </div>

            {/* Code Output Panel */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-8">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-base font-bold text-zinc-200">
                  Mã Nguồn AutoLISP Tự Động (
                  {lispType === "hanger" ? "DRAW_TRAPEZE_HANGER" : "DRAW_SLEEVE_OPENING"})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    {copied ? "Đã copy" : "Copy mã"}
                  </button>
                  <button
                    onClick={handleDownloadLisp}
                    className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    <Download size={14} />
                    Tải file .lsp
                  </button>
                </div>
              </div>

              <pre className="mt-4 max-h-[420px] overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs text-amber-300 leading-relaxed">
                {generatedLispCode}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 4: Font & Layer Doctor */}
        {activeTab === "doctor" && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Font Doctor */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <Wrench size={18} className="text-amber-400" />
                Sửa Lỗi Font Chữ Tiếng Việt (SHX / TCVN3 / VNI &rarr; Unicode)
              </h2>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-400">
                    Chuỗi ký tự bị lỗi hiển thị (VNI / TCVN3):
                  </label>
                  <input
                    type="text"
                    value={legacyInput}
                    onChange={(e) => setLegacyInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 font-mono"
                  />
                </div>

                <button
                  onClick={handleConvertFont}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400"
                >
                  Giải mã sang Unicode UTF-8
                </button>

                {convertedText && (
                  <div className="mt-4 rounded-lg border border-emerald-500/40 bg-zinc-950 p-3">
                    <span className="text-xs text-zinc-400 font-semibold uppercase">
                      Kết quả chuẩn hóa:
                    </span>
                    <div className="mt-1 text-base font-bold text-emerald-300 font-sans">
                      {convertedText}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Layer Normalizer */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <Layers size={18} className="text-amber-400" />
                Chuẩn Hóa Hệ Layer Theo Tiêu Chuẩn AIA / MEPF
              </h2>

              <div className="mt-4 space-y-2 text-xs text-zinc-300">
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="font-mono text-red-400">ONG_GIO_CAP_LV4</span>
                  <span className="text-zinc-500">&rarr;</span>
                  <span className="font-mono font-bold text-emerald-400">M-DUCT-SUPP</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="font-mono text-red-400">ONG_NUOC_LANH_CHW</span>
                  <span className="text-zinc-500">&rarr;</span>
                  <span className="font-mono font-bold text-emerald-400">P-PIPE-SANR</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="font-mono text-red-400">MANG_CAP_DIEN</span>
                  <span className="text-zinc-500">&rarr;</span>
                  <span className="font-mono font-bold text-emerald-400">E-TRAY-PWRR</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="font-mono text-red-400">DUONG_ONG_PCCC_SPK</span>
                  <span className="text-zinc-500">&rarr;</span>
                  <span className="font-mono font-bold text-emerald-400">F-SPRN-PIPE</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
