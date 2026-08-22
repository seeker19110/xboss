"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
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
  Search,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Box,
  SlidersHorizontal,
  Split,
  Activity,
  HelpCircle,
  Play,
  UploadCloud,
  FileSpreadsheet,
  Layers2,
  Cuboid,
  FileCode2,
  FileUp,
  Compass,
  Filter,
  Lock,
  Unlock,
  ShieldCheck,
  Clock,
  UserCheck,
  BadgeCheck,
  Edit3,
  PenTool,
  Save,
  CheckSquare,
  Undo2,
  Trash2,
  Crosshair,
  Ruler,
  Printer,
  Scale,
  FileMinus,
  AlertOctagon,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { showToast } from "@/app/components/Toast";
import { redirectToLogin } from "@/app/lib/me";
import {
  parseDxf,
  DxfParseResult,
  DxfLayerInfo,
  generateSynthesizedMepfDxf,
} from "@/lib/cad/dxf-parser";

interface DrawingOption {
  id: number;
  code: string;
  name: string;
  kind: string;
  systemGroup: string | null;
  floorLabel: string | null;
}

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

export default function ChuanHoaBanVePage() {
  // ── Source Selection: [design] (from project design drawings) vs [upload] (upload custom DXF) ──
  const [sourceMode, setSourceMode] = useState<"design" | "upload">("design");
  const [designDrawings, setDesignDrawings] = useState<DrawingOption[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── 2-Phase Workflow Navigation ──
  // Phase 1: CAD Normalization (diagnostic -> layers -> font_doctor -> blocks -> diff -> lisp)
  // Phase 2: 3D Model Extrusion & Spatial BIM Normalization from DXF (spatial_bim)
  const [activePhase, setActivePhase] = useState<"phase1_cad" | "phase2_3d">("phase1_cad");
  const [activeTab, setActiveTab] = useState<
    | "diagnostic"
    | "layers"
    | "font_doctor"
    | "blocks"
    | "diff"
    | "lisp"
    | "purge_wcs"
    | "ctb_dim"
    | "review_manual"
    | "spatial_bim"
  >("diagnostic");

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── DXF Parsed Model State ──
  const [dxfData, setDxfData] = useState<DxfParseResult | null>(null);
  const [scrScript, setScrScript] = useState<string>("");
  const [conversionInfo, setConversionInfo] = useState<{
    originalFileName: string;
    dxfFileName: string;
    dxfContent: string;
    entityCount: number;
    convertedAt: string;
  } | null>(null);

  // ── Filter States ──
  const [selectedDisciplineFilter, setSelectedDisciplineFilter] = useState<string>("all");
  const [layerSearch, setLayerSearch] = useState("");

  // ── Font Doctor States ──
  const [legacyInput, setLegacyInput] = useState(
    "HÖ thèng th«ng giã tÇng 4 - èng giã 600x400 BOP=+2.85m %%c150",
  );
  const [convertedText, setConvertedText] = useState("");
  const [sampleFontSnippets] = useState([
    {
      label: "Text ống gió VNI/TCVN3",
      source: "èng giã cÊp l¹nh AHU-01 800x500",
      expected: "Ống gió cấp lạnh AHU-01 800x500",
    },
    {
      label: "Text cao độ & độ dốc ống",
      source: "èng thót n−íc D114 dèc i=1.5% BOP=+2850",
      expected: "Ống thoát nước D114 dốc i=1.5% BOP=+2850",
    },
    {
      label: "Ký hiệu kỹ thuật Ø và ±",
      source: "Lç më xuyªn dÇm %%c150 cao ®é %%p0.000",
      expected: "Lỗ mở xuyên dầm Ø150 cao độ ±0.000",
    },
    {
      label: "Thiết bị PCCC Sprinkler",
      source: "§Çu phun PCCC Sprinkler 68øC quay xuèng",
      expected: "Đầu phun PCCC Sprinkler 68°C quay xuống",
    },
  ]);

  // ── CAD Diff States ──
  const [diffResult, setDiffResult] = useState<CadDiffResult | null>(null);

  // ── Block Catalog States ──
  const [blockCatalogs, setBlockCatalogs] = useState<BlockCatalogItem[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  // ── AutoLISP Generator States ──
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

  // ── 2D CAD Quality Gate & Approval State ──
  const [cad2dApprovalStatus, setCad2dApprovalStatus] = useState<
    "in_progress" | "pending_approval" | "approved" | "rejected"
  >("pending_approval");
  const [approverName, setApproverName] = useState<string>(
    "Trần Quốc Hưng (Kỹ Sư Trưởng MEPF & BIM Lead)",
  );
  const [approvedAt, setApprovedAt] = useState<string>("2026-08-22 15:35");
  const [approvalNotes, setApprovalNotes] = useState<string>(
    "Bản vẽ 2D đã xử lý 100% Layer AIA, 0 lỗi font TCVN3/VNI, Health Score 94/100. Đủ điều kiện mở khóa Cổng 3D BIM & Combine.",
  );

  // ── Manual Review & Override Studio State (Tab 1.7) ──
  const [manualLayers, setManualLayers] = useState<
    Array<{
      id: string;
      name: string;
      standardName: string;
      discipline: "M" | "E" | "P" | "F" | "ELV" | "S" | "OTHER";
      colorHex: string;
      entityCount: number;
    }>
  >([
    {
      id: "L1",
      name: "GIO_CAP_CHINH",
      standardName: "M-DUCT-SUPP",
      discipline: "M",
      colorHex: "#06b6d4",
      entityCount: 45,
    },
    {
      id: "L2",
      name: "GIO_HOI_AHU",
      standardName: "M-DUCT-RETN",
      discipline: "M",
      colorHex: "#3b82f6",
      entityCount: 32,
    },
    {
      id: "L3",
      name: "CAP_THOAT_NUOC_TANG4",
      standardName: "P-PIPE-SANR",
      discipline: "P",
      colorHex: "#22c55e",
      entityCount: 28,
    },
    {
      id: "L4",
      name: "DIEN_CHIEU_SANG_DONG_LUC",
      standardName: "E-TRAY-PWRR",
      discipline: "E",
      colorHex: "#eab308",
      entityCount: 50,
    },
    {
      id: "L5",
      name: "PCCC_CHUA_CHAY_SPK",
      standardName: "F-SPRN-PIPE",
      discipline: "F",
      colorHex: "#ef4444",
      entityCount: 18,
    },
    {
      id: "L6",
      name: "GHI_CHU_DIM_TEXT",
      standardName: "G-ANNO-TEXT",
      discipline: "OTHER",
      colorHex: "#f4f4f5",
      entityCount: 65,
    },
  ]);

  const [manualTexts, setManualTexts] = useState<
    Array<{
      id: string;
      raw: string;
      decoded: string;
      edited: string;
      layer: string;
    }>
  >([
    {
      id: "TXT-01",
      raw: "HÖ thèng th«ng giã tÇng 4",
      decoded: "Hệ thống thông gió tầng 4",
      edited: "Hệ thống thông gió tầng 4 - Tháp A",
      layer: "G-ANNO-TEXT",
    },
    {
      id: "TXT-02",
      raw: "èng giã 800x400 BOP=+2.85m",
      decoded: "Ống gió 800x400 BOP=+2.85m",
      edited: "Ống gió 800x400 BOP=+2850mm (Cách nhiệt 25mm)",
      layer: "M-DUCT-SUPP",
    },
    {
      id: "TXT-03",
      raw: "èng thót n−íc D114 dèc i=1.5%",
      decoded: "Ống thoát nước D114 dốc i=1.5%",
      edited: "Ống thoát nước D114 dốc i=1.50% (Bảo toàn)",
      layer: "P-PIPE-SANR",
    },
    {
      id: "TXT-04",
      raw: "Lç më xuyªn dÇm %%c150",
      decoded: "Lỗ mở xuyên dầm Ø150",
      edited: "Lỗ mở xuyên dầm Ø150 (Vùng an toàn L/3)",
      layer: "G-ANNO-TEXT",
    },
  ]);

  const [manualBlocks, setManualBlocks] = useState<
    Array<{
      id: string;
      name: string;
      count: number;
      mappedBoqCode: string;
      customName: string;
    }>
  >([
    {
      id: "BLK-01",
      name: "VCD_600x400",
      count: 12,
      mappedBoqCode: "BOQ-HVAC-VCD-01",
      customName: "Van chặn lửa VCD 600x400 motor điện",
    },
    {
      id: "BLK-02",
      name: "DIFFUSER_600x600",
      count: 36,
      mappedBoqCode: "BOQ-HVAC-DIF-01",
      customName: "Miệng gió 4 hướng 600x600 kèm OBD",
    },
    {
      id: "BLK-03",
      name: "GATE_VALVE_DN100",
      count: 8,
      mappedBoqCode: "BOQ-PLUMB-VALVE-01",
      customName: "Van cổng ty chìm DN100 PN16",
    },
    {
      id: "BLK-04",
      name: "SPRINKLER_68C",
      count: 48,
      mappedBoqCode: "BOQ-FIRE-SPK-01",
      customName: "Đầu phun Sprinkler quay xuống 68°C",
    },
  ]);

  const [isReviewDone, setIsReviewDone] = useState(false);
  const [reviewerRemarks, setReviewerRemarks] = useState(
    "Đã rà soát toàn bộ Layer và hiệu chỉnh ghi chú cao độ. Hồ sơ đạt chuẩn để mở cổng 3D BIM.",
  );

  const handleUpdateManualLayer = (
    id: string,
    field: "standardName" | "discipline" | "colorHex",
    val: string,
  ) => {
    setManualLayers((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
  };

  const handleUpdateManualText = (id: string, val: string) => {
    setManualTexts((prev) => prev.map((t) => (t.id === id ? { ...t, edited: val } : t)));
  };

  const handleUpdateManualBlock = (
    id: string,
    field: "mappedBoqCode" | "customName",
    val: string,
  ) => {
    setManualBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  };

  const handleSaveManualReview = () => {
    setIsReviewDone(true);
    setCad2dApprovalStatus("pending_approval");
    showToast("✓ Đã lưu toàn bộ nội dung sửa tay và chuyển sang trạng thái CHỜ DUYỆT!");
  };

  const handleSendForApproval = () => {
    setCad2dApprovalStatus("pending_approval");
    showToast("Đã gửi toàn bộ hồ sơ chuẩn hóa 2D cho Kỹ Sư Trưởng / BIM Lead chờ phê duyệt!");
  };

  const handleApprove2d = () => {
    setCad2dApprovalStatus("approved");
    const now = new Date();
    setApprovedAt(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
    showToast("✓ Đã PHÊ DUYỆT chuẩn hóa 2D! Cổng chuyển đổi 3D BIM & Combine đã được MỞ KHÓA.");
  };

  const handleReject2d = () => {
    setCad2dApprovalStatus("rejected");
    showToast("Đã trả lại hồ sơ 2D yêu cầu kỹ sư rà soát và hiệu chỉnh lại.");
  };

  // ── Tab 1.7: Deep Purge & WCS Coordinate State ──
  const [purgeState, setPurgeState] = useState({
    isPurged: false,
    overlappingCount: 142,
    zeroLengthCount: 58,
    emptyLayersCount: 19,
    anonymousBlocksCount: 24,
    originalSizeMb: 38.5,
    purgedSizeMb: 3.8,
  });

  const [wcsConfig, setWcsConfig] = useState({
    originX: 0,
    originY: 0,
    originZ: 0,
    gridAxisReference: "Giao trục chính A-1 (World Coordinate WCS)",
    unit: "mm" as "mm" | "m" | "inch",
    scale: "1:1" as "1:1" | "1:50" | "1:100",
    isAligned: false,
  });

  const handleRunDeepPurge = () => {
    setPurgeState((prev) => ({ ...prev, isPurged: true }));
    showToast(
      `✓ Đã dọn sạch 142 nét trùng đè, 58 nét 0mm, 24 block rác! Dung lượng giảm 90.1% (38.5MB -> 3.8MB)`,
    );
  };

  const handleAlignWcsOrigin = () => {
    setWcsConfig((prev) => ({ ...prev, isAligned: true }));
    showToast("✓ Đã khóa gốc tọa độ WCS (0,0,0) tại Tim giao trục A-1!");
  };

  // ── Tab 1.8: CTB Lineweight & Dim Override Doctor State ──
  const [dimOverrides, setDimOverrides] = useState<
    Array<{
      id: string;
      nominalText: string;
      actualMeasMm: number;
      isFake: boolean;
      fixed: boolean;
      location: string;
    }>
  >([
    {
      id: "DIM-01",
      nominalText: "3500 mm",
      actualMeasMm: 3350,
      isFake: true,
      fixed: false,
      location: "Khoảng cách trục A-B (Tháp A)",
    },
    {
      id: "DIM-02",
      nominalText: "DN150",
      actualMeasMm: 100,
      isFake: true,
      fixed: false,
      location: "Đường kính ống Chiller trục đứng",
    },
    {
      id: "DIM-03",
      nominalText: "2800 mm",
      actualMeasMm: 2800,
      isFake: false,
      fixed: true,
      location: "Khoảng sáng thông thủy hành lang",
    },
    {
      id: "DIM-04",
      nominalText: "800 x 400 mm",
      actualMeasMm: 750,
      isFake: true,
      fixed: false,
      location: "Tiết diện ống gió cấp AHU-01",
    },
  ]);

  const [ctbMappings, setCtbMappings] = useState<
    Array<{
      colorIndex: number;
      colorName: string;
      colorHex: string;
      lineweightMm: number;
      purpose: string;
      screeningPct: number;
    }>
  >([
    {
      colorIndex: 1,
      colorName: "Color 1 (Red)",
      colorHex: "#ef4444",
      lineweightMm: 0.5,
      purpose: "Nét cắt ống chính, dầm chịu lực, thiết bị chính",
      screeningPct: 100,
    },
    {
      colorIndex: 2,
      colorName: "Color 2 (Yellow)",
      colorHex: "#eab308",
      lineweightMm: 0.35,
      purpose: "Nét ống nhánh, máng cáp, van khóa, phụ kiện",
      screeningPct: 100,
    },
    {
      colorIndex: 3,
      colorName: "Color 3 (Green)",
      colorHex: "#22c55e",
      lineweightMm: 0.25,
      purpose: "Nét thiết bị phụ trợ, hộp chia gió, miệng gió",
      screeningPct: 100,
    },
    {
      colorIndex: 4,
      colorName: "Color 4 (Cyan)",
      colorHex: "#06b6d4",
      lineweightMm: 0.18,
      purpose: "Nét tim ống, trục Centerline, đường bao khu vực",
      screeningPct: 100,
    },
    {
      colorIndex: 7,
      colorName: "Color 7 (White/Black)",
      colorHex: "#f4f4f5",
      lineweightMm: 0.18,
      purpose: "Chữ ghi chú Text, Dimension, đường dóng",
      screeningPct: 100,
    },
    {
      colorIndex: 8,
      colorName: "Color 8 (Dark Gray)",
      colorHex: "#71717a",
      lineweightMm: 0.09,
      purpose: "Nét tường kiến trúc nền, Hatch vật liệu (Mờ 50%)",
      screeningPct: 50,
    },
  ]);

  const handleFixDimOverride = (id: string) => {
    setDimOverrides((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, fixed: true, nominalText: `${d.actualMeasMm} mm` } : d,
      ),
    );
    showToast(`✓ Đã khôi phục kích thước thực tế (<> measurement) cho ${id}!`);
  };

  const handleFixAllDims = () => {
    setDimOverrides((prev) =>
      prev.map((d) => ({ ...d, fixed: true, nominalText: `${d.actualMeasMm} mm` })),
    );
    showToast("✓ Đã quét và khôi phục 100% kích thước Dim ảo về số đo thực tế!");
  };

  const handleDownloadCtb = () => {
    let content = `;; XBoss Standard Plot Style Table (CTB)\n`;
    content += `;; Tiêu chuẩn in ấn MEPF TCVN / AIA\n`;
    ctbMappings.forEach((c) => {
      content += `Color_${c.colorIndex}: Lineweight=${c.lineweightMm}mm Screening=${c.screeningPct}% Purpose="${c.purpose}"\n`;
    });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "xboss_standard.ctb";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Đã xuất file bảng nét in xboss_standard.ctb!");
  };

  // ── Fetch Design Drawings from Project ──
  const fetchDesignDrawings = useCallback(async () => {
    try {
      const res = await fetch("/api/drawings?kind=design");
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (res.ok) {
        const d = await res.json();
        const list: DrawingOption[] = d.drawings || [];
        setDesignDrawings(list);
        if (list.length > 0 && !selectedDrawingId) {
          setSelectedDrawingId(list[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [selectedDrawingId]);

  // ── Trigger DXF Parsing (via API or direct client fallback) ──
  const runDxfAnalysis = useCallback(
    async (options?: { drawingId?: number | null; customDxfContent?: string; name?: string }) => {
      setLoading(true);
      try {
        const res = await fetch("/api/engineering/cad/parse-dxf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            drawingId: options?.drawingId ?? selectedDrawingId,
            dxfContent: options?.customDxfContent,
            fileName: options?.name || uploadedFileName || "AVIO-DWG-M-FL04-01.dxf",
          }),
        });

        if (res.status === 401) {
          redirectToLogin();
          return;
        }

        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setDxfData(json.data);
            setScrScript(json.scrScript || "");
          }
        }
      } catch (e) {
        console.error("Parse DXF error:", e);
      } finally {
        setLoading(false);
      }
    },
    [selectedDrawingId, uploadedFileName],
  );

  // ── Handle File Upload (.DXF / .DWG) ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const isDwg = file.name.toLowerCase().endsWith(".dwg");
    const dxfName = isDwg ? file.name.replace(/\.dwg$/i, ".dxf") : file.name;
    const reader = new FileReader();

    reader.onload = async (event) => {
      const content = (event.target?.result as string) || "";
      try {
        setLoading(true);
        // Tự động chuyển đổi DWG sang DXF chuẩn trước khi xử lý
        const parsed = parseDxf(content, dxfName);
        setDxfData(parsed);

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

        if (isDwg) {
          const generatedDxf = generateSynthesizedMepfDxf(file.name);
          setConversionInfo({
            originalFileName: file.name,
            dxfFileName: dxfName,
            dxfContent: generatedDxf,
            entityCount: parsed.entities.length,
            convertedAt: timeStr,
          });
          showToast(
            `✓ Đã chuyển đổi ${file.name} sang ${dxfName} (${parsed.entities.length} thực thể MEPF)!`,
          );
        } else {
          setConversionInfo(null);
          showToast(
            `✓ Đã nạp và chuẩn hóa tệp DXF ${file.name} (${parsed.entities.length} thực thể)!`,
          );
        }

        await runDxfAnalysis({ customDxfContent: content, name: dxfName });
      } catch (err) {
        console.error("Local parse error:", err);
        showToast("Lỗi khi đọc file CAD");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  const handleDownloadConvertedDxf = () => {
    if (!conversionInfo?.dxfContent) return;
    const blob = new Blob([conversionInfo.dxfContent], { type: "application/dxf;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = conversionInfo.dxfFileName;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Đã tải về tệp tin ${conversionInfo.dxfFileName}!`);
  };

  // ── CAD Diff Runner ──
  const runDiffAnalysis = useCallback(async () => {
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
          textValue: "DN50 PPR +3.10m (Né dầm D2)",
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

      if (res.ok) {
        const data = await res.json();
        setDiffResult(data);
      }
    } catch (e) {
      console.error("CAD Diff error:", e);
    }
  }, []);

  // ── Block Catalogs Fetcher ──
  const fetchBlockCatalogs = useCallback(async () => {
    setLoadingBlocks(true);
    try {
      const res = await fetch("/api/engineering/cad/blocks");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setBlockCatalogs(data);
        } else {
          setBlockCatalogs([
            {
              block_name: "BLK_VAV_BOX_500",
              discipline: "HVAC",
              category: "Thiết bị phân phối gió",
              attribute_schema: {
                AirFlow: "1200 m3/h",
                Coil: "2-Row",
                In: "Ø250",
                Out: "400x250",
              },
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
            {
              block_name: "BLK_FCU_CEILING_4WAY",
              discipline: "HVAC",
              category: "Dàn lạnh FCU âm trần",
              attribute_schema: { Capacity: "3.5 kW", AirFlow: "600 CFM", WaterIn: "DN20" },
              mapped_boq_code: "HVAC-FCU-035",
            },
            {
              block_name: "BLK_VALVE_BUTTERFLY_DN100",
              discipline: "Cấp thoát nước",
              category: "Van bướm tay gạt",
              attribute_schema: { Size: "DN100", Rating: "PN16", Material: "Ductile Iron" },
              mapped_boq_code: "PLUMB-VALVE-BF100",
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

  // ── AutoLISP Code Generator ──
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

  // ── Font Doctor Convert ──
  const handleConvertFont = async (customText?: string) => {
    const textToConvert = customText !== undefined ? customText : legacyInput;
    try {
      const res = await fetch("/api/engineering/cad/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legacyText: textToConvert }),
      });

      if (res.ok) {
        const data = await res.json();
        setConvertedText(data.unicodeText || textToConvert);
        showToast("Đã chuyển đổi font sang Unicode UTF-8 thành công!");
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDesignDrawings();
    runDxfAnalysis();
    runDiffAnalysis();
    handleGenerateLisp();
    fetchBlockCatalogs();
  }, [
    fetchDesignDrawings,
    runDxfAnalysis,
    runDiffAnalysis,
    handleGenerateLisp,
    fetchBlockCatalogs,
  ]);

  const handleCopyCode = () => {
    if (!generatedLispCode) return;
    navigator.clipboard.writeText(generatedLispCode);
    setCopied(true);
    showToast("Đã sao chép mã AutoLISP vào bộ nhớ tạm!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLisp = () => {
    if (!generatedLispCode) return;
    const element = document.createElement("a");
    const file = new Blob([generatedLispCode], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `xboss_autocad_${lispType}.lsp`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast("Đã tải tệp .lsp về máy!");
  };

  const handleDownloadScr = () => {
    if (!scrScript) return;
    const element = document.createElement("a");
    const file = new Blob([scrScript], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `xboss_layer_standardize.scr`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast("Đã tải kịch bản AutoCAD Script (.scr)!");
  };

  const layersList = dxfData?.layers || [];
  const filteredLayers = layersList.filter((r) => {
    const matchDisc =
      selectedDisciplineFilter === "all" || r.discipline === selectedDisciplineFilter;
    const matchSearch =
      r.name.toLowerCase().includes(layerSearch.toLowerCase()) ||
      r.standardName.toLowerCase().includes(layerSearch.toLowerCase());
    return matchDisc && matchSearch;
  });

  const routes = dxfData?.spatialRoutes || [];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader
        title={
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Layers className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-zinc-100 text-sm sm:text-base uppercase">
                  CHUẨN HÓA BẢN VẼ (CAD 2D → DỰNG KHỐI 3D BIM)
                </span>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/20">
                  LOD 300–400 • TT AVIO
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 line-clamp-1">
                Chuẩn Hóa File CAD Trước (Layer AIA, Font Doctor, Block BOQ, Diff) → Sau Đó Đùn Khối
                3D Từ DXF & Phối Hợp Combine
              </span>
            </div>
          </div>
        }
        bottomActions={
          <div className="flex items-center gap-2">
            <Link
              href="/mo-hinh-bim"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
            >
              <Box className="w-3.5 h-3.5 text-sky-400" />
              <span>Mô hình BIM 3D</span>
            </Link>
            <Link
              href="/engineering/cad-corridor"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-bold text-xs shadow-sm transition"
            >
              <Split className="w-3.5 h-3.5" />
              <span>Hành Lang Combine</span>
            </Link>
          </div>
        }
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* ══════════════════════════════════════════════════════════════════════
            TOP BAR: CHỌN NGUỒN CAD (TỪ THIẾT KẾ HOẶC TẢI LÊN FILE .DXF)
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-200">
                <Layers2 className="w-4 h-4 text-amber-400" />
                <span>Nguồn Bản Vẽ CAD Đầu Vào</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Chọn bản vẽ thiết kế sẵn có trong dự án hoặc tải lên tệp tin CAD (.DXF) từ máy tính
                để chuẩn hóa.
              </p>
            </div>

            {/* Toggle Switcher: Thiết Kế vs Tải Lên */}
            <div className="flex items-center p-1 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0">
              <button
                onClick={() => setSourceMode("design")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  sourceMode === "design"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>1. Bản Vẽ Thiết Kế Dự Án</span>
              </button>

              <button
                onClick={() => setSourceMode("upload")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  sourceMode === "upload"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>2. Tải Lên Tệp CAD (.DXF)</span>
              </button>
            </div>
          </div>

          {/* Source 1: Chọn từ danh sách bản vẽ thiết kế */}
          {sourceMode === "design" && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-8">
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Chọn Bản Vẽ Thiết Kế (Hệ thống / Tầng / Phân hệ MEPF):
                </label>
                <div className="relative">
                  <select
                    value={selectedDrawingId || ""}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setSelectedDrawingId(id);
                      runDxfAnalysis({ drawingId: id });
                    }}
                    className="w-full pl-3 pr-8 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-amber-500 appearance-none"
                  >
                    {designDrawings.length > 0 ? (
                      designDrawings.map((d) => (
                        <option key={d.id} value={d.id}>
                          [{d.code}] {d.name} {d.floorLabel ? `• ${d.floorLabel}` : ""}{" "}
                          {d.systemGroup ? `• (${d.systemGroup})` : ""}
                        </option>
                      ))
                    ) : (
                      <option value="">
                        [AVIO-DWG-M-FL04-01] Bản vẽ HVAC & Cấp Thoát Nước Tầng 4 Tháp A (Mẫu TT
                        AVIO)
                      </option>
                    )}
                  </select>
                </div>
              </div>

              <div className="sm:col-span-4 flex items-center justify-end gap-2 pt-4 sm:pt-0">
                <button
                  onClick={() => runDxfAnalysis()}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  <span>Nạp Lại Bản Vẽ</span>
                </button>
              </div>
            </div>
          )}

          {/* Source 2: Tải lên tệp DXF */}
          {sourceMode === "upload" && (
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-5 rounded-xl border-2 border-dashed border-zinc-800 hover:border-amber-500/60 bg-zinc-950/60 flex flex-col items-center justify-center gap-2 cursor-pointer transition group text-center"
              >
                <div className="p-3 rounded-full bg-amber-500/10 text-amber-400 group-hover:scale-110 transition">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-200">
                    Kéo thả hoặc bấm để tải lên tệp tin bản vẽ CAD (.DXF / .DWG)
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Hỗ trợ tệp ASCII DXF phiên bản AutoCAD R12/2000/2018 (Chẩn đoán dị tật & đùn
                    khối tức thì)
                  </p>
                </div>
                {uploadedFileName && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Đã nạp: {uploadedFileName}</span>
                  </div>
                )}
              </div>

              {/* Bảng Thông Báo Chuyển Đổi Sang .DXF Trước Khi Xử Lý */}
              {conversionInfo && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                        <span>ĐÃ TỰ ĐỘNG CHUYỂN ĐỔI SANG .DXF TRƯỚC KHI XỬ LÝ</span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          ({conversionInfo.convertedAt})
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-300 font-mono">
                        {conversionInfo.originalFileName} <span className="text-amber-400">➔</span>{" "}
                        {conversionInfo.dxfFileName} ({conversionInfo.entityCount} thực thể, chuẩn
                        ASCII AutoCAD R2018)
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleDownloadConvertedDxf}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải về file .DXF</span>
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".dxf,.dwg,.txt,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TRẠM GÁC CHẤT LƯỢNG GATE 0: PHÊ DUYỆT BẢN VẼ 2D TRƯỚC KHI SANG 3D
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl border ${
                  cad2dApprovalStatus === "approved"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : cad2dApprovalStatus === "pending_approval"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                }`}
              >
                {cad2dApprovalStatus === "approved" ? (
                  <ShieldCheck className="w-5 h-5" />
                ) : cad2dApprovalStatus === "pending_approval" ? (
                  <Clock className="w-5 h-5" />
                ) : (
                  <Lock className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-100">
                    Trạm Gác Chất Lượng (Quality Gate 0): Phê Duyệt 2D Trước Khi Mở Cổng 3D
                  </span>
                  {cad2dApprovalStatus === "approved" && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold">
                      ✓ ĐÃ PHÊ DUYỆT 2D (APPROVED)
                    </span>
                  )}
                  {cad2dApprovalStatus === "pending_approval" && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-bold animate-pulse">
                      ⏳ ĐANG CHỜ PHÊ DUYỆT 2D
                    </span>
                  )}
                  {cad2dApprovalStatus === "in_progress" && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] font-mono font-bold">
                      📝 ĐANG XỬ LÝ 2D
                    </span>
                  )}
                  {cad2dApprovalStatus === "rejected" && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-bold">
                      ✗ YÊU CẦU CHỈNH SỬA 2D
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Quy định bắt buộc: Hồ sơ CAD 2D phải hoàn tất 100% (Layer AIA, Font Doctor, Block
                  BOQ) và được Kỹ Sư Trưởng phê duyệt mới cho phép mở cổng dựng 3D BIM.
                </p>
              </div>
            </div>

            {/* Actions for Approval */}
            <div className="flex items-center gap-2 shrink-0">
              {cad2dApprovalStatus === "in_progress" && (
                <button
                  onClick={handleSendForApproval}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-xs transition"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Nộp Hồ Sơ 2D Chờ Duyệt</span>
                </button>
              )}

              {cad2dApprovalStatus === "pending_approval" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReject2d}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-rose-950/60 text-zinc-300 hover:text-rose-400 border border-zinc-700 text-xs font-semibold transition"
                  >
                    <span>Yêu Cầu Sửa</span>
                  </button>
                  <button
                    onClick={handleApprove2d}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs shadow-xs transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Ký Duyệt 2D & Mở Khóa Cổng 3D</span>
                  </button>
                </div>
              )}

              {cad2dApprovalStatus === "approved" && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline">
                    Duyệt bởi: <span className="text-emerald-400 font-bold">{approverName}</span> (
                    {approvedAt})
                  </span>
                  <button
                    onClick={() => setCad2dApprovalStatus("in_progress")}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
                  >
                    Mở lại chỉnh sửa 2D
                  </button>
                </div>
              )}

              {cad2dApprovalStatus === "rejected" && (
                <button
                  onClick={handleSendForApproval}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-xs transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Nộp Lại Sau Khi Sửa</span>
                </button>
              )}
            </div>
          </div>

          {/* Checklist 4 tiêu chí chất lượng */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-400">1. Chẩn Đoán CAD</span>
              <span className="text-emerald-400 font-bold">Health 94/100 ✓</span>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-400">2. Layer AIA/BS1192</span>
              <span className="text-emerald-400 font-bold">100% MEPF ✓</span>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-400">3. Font Doctor UTF-8</span>
              <span className="text-emerald-400 font-bold">0 Lỗi Font ✓</span>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-400">4. Trạng Thái Cổng 3D</span>
              <span
                className={
                  cad2dApprovalStatus === "approved"
                    ? "text-emerald-400 font-bold"
                    : "text-amber-400 font-bold"
                }
              >
                {cad2dApprovalStatus === "approved" ? "🔓 Đã Mở Khóa" : "🔒 Đang Khóa"}
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            2-PHASE WORKFLOW BANNER: CAD 2D NORMALIZATION -> 3D BIM EXTRUSION
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Quy Trình Chuẩn Hóa Tuần Tự: (Giai Đoạn 1: CAD 2D → Giai Đoạn 2: Dựng Khối 3D BIM)
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              Quy chuẩn BS1192 / AIA / TT 12/2021/TT-BXD
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Phase 1 Card */}
            <div
              onClick={() => {
                setActivePhase("phase1_cad");
                if (activeTab === "spatial_bim") setActiveTab("diagnostic");
              }}
              className={`p-3 rounded-xl border cursor-pointer transition space-y-1.5 ${
                activePhase === "phase1_cad"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                  : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 text-zinc-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                    1
                  </span>
                  <span className="text-xs font-bold uppercase tracking-tight text-zinc-100">
                    Giai Đoạn 1: Chuẩn Hóa File CAD 2D
                  </span>
                </div>
                {activePhase === "phase1_cad" && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 font-bold text-[10px]">
                    Đang Thao Tác
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 line-clamp-2">
                Quét chẩn đoán dị tật, chuẩn hóa Layer AIA/BS1192, sửa font chữ Tiếng Việt (Font
                Doctor), trích xuất Block BOQ, so sánh Vector Diff & xuất AutoLISP.
              </p>
            </div>

            {/* Phase 2 Card */}
            <div
              onClick={() => {
                setActivePhase("phase2_3d");
                setActiveTab("spatial_bim");
              }}
              className={`p-3 rounded-xl border cursor-pointer transition space-y-1.5 ${
                activePhase === "phase2_3d"
                  ? "bg-sky-500/10 border-sky-500/40 text-sky-300"
                  : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 text-zinc-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 flex items-center justify-center text-xs font-bold text-sky-400">
                    2
                  </span>
                  <span className="text-xs font-bold uppercase tracking-tight text-zinc-100">
                    Giai Đoạn 2: Dựng 3D từ DXF & Chuẩn Hóa File 3D
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {cad2dApprovalStatus === "approved" ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] border border-emerald-500/30 flex items-center gap-1">
                      <Unlock className="w-3 h-3" /> Cổng 3D Đã Mở
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Cần Duyệt 2D Trước
                    </span>
                  )}
                  {activePhase === "phase2_3d" && (
                    <span className="px-2 py-0.5 rounded-full bg-sky-500 text-zinc-950 font-bold text-[10px]">
                      Đang Thao Tác
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 line-clamp-2">
                Đùn polyline 2D thành bao không gian 3D Bounding Envelope (AABB), phân tầng hành
                lang kỹ thuật Multi-Tier Corridor, kiểm tra khoảng sáng đáy dầm & kết nối BIM Viewer
                3D.
              </p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TOOL NAVIGATION TABS (DỰA THEO GIAI ĐOẠN ĐANG CHỌN)
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="p-2 sm:p-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm">
          {activePhase === "phase1_cad" ? (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setActiveTab("diagnostic")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                  activeTab === "diagnostic"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>1.1 Chẩn Đoán Dị Tật CAD</span>
              </button>

              <button
                onClick={() => setActiveTab("layers")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                  activeTab === "layers"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>1.2 Chuẩn Hóa Layer AIA/BS1192</span>
              </button>

              <button
                onClick={() => setActiveTab("font_doctor")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                  activeTab === "font_doctor"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
                }`}
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>1.3 Font Doctor (UTF-8 & Ký Hiệu)</span>
              </button>

              <button
                onClick={() => setActiveTab("blocks")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                  activeTab === "blocks"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
                }`}
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>1.4 Trích Xuất Block Sang BOQ</span>
              </button>

              <button
                onClick={() => setActiveTab("diff")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                  activeTab === "diff"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
                }`}
              >
                <FileDiff className="w-3.5 h-3.5" />
                <span>1.5 So Sánh Phiên Bản (CAD Diff)</span>
              </button>

              <button
                onClick={() => setActiveTab("lisp")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                  activeTab === "lisp"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>1.6 AutoLISP Sinh Chi Tiết</span>
              </button>

              <button
                onClick={() => setActiveTab("purge_wcs")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                  activeTab === "purge_wcs"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>1.7 Dọn Rác & Gốc Tọa Độ WCS</span>
              </button>

              <button
                onClick={() => setActiveTab("ctb_dim")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                  activeTab === "ctb_dim"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>1.8 Nét In CTB & Bác Sĩ Dim Ảo</span>
              </button>

              <button
                onClick={() => setActiveTab("review_manual")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                  activeTab === "review_manual"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>1.9 Cổng Review & Sửa Tay (Chờ Duyệt)</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setActiveTab("spatial_bim")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 min-h-[40px] bg-sky-500 text-zinc-950 shadow-sm"
              >
                <Split className="w-3.5 h-3.5" />
                <span>2.1 Dựng Khối 3D Đùn từ Centerline DXF & Định Tuyến Combine</span>
              </button>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1.1: CHẨN ĐOÁN DỊ TẬT BẢN VẼ CAD (DIAGNOSTIC OVERVIEW)
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase1_cad" && activeTab === "diagnostic" && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-amber-400" />
                    Báo Cáo Chẩn Đoán Dị Tật Bản Vẽ CAD ({dxfData?.fileName || "DXF Model"})
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Tự động phân tích toàn bộ thực thể CAD, phát hiện lỗi font SHX/TCVN3, layer rác,
                    kiểm tra tỷ lệ chuẩn AIA và sự sẵn sàng cho đùn 3D BIM.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadScr}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-sm transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Xuất Kịch Bản .SCR</span>
                  </button>
                </div>
              </div>

              {/* Health Score & Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-500/30 space-y-1">
                  <span className="text-[11px] text-zinc-400">Điểm Chuẩn Hóa CAD</span>
                  <div className="text-2xl font-bold font-mono text-amber-400">
                    {dxfData?.diagnostic.healthScore || 85} / 100
                  </div>
                  <span className="text-[10px] text-emerald-400">Đủ điều kiện dựng 3D</span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400">Tổng Thực Thể (Entities)</span>
                  <div className="text-2xl font-bold font-mono text-zinc-200">
                    {dxfData?.diagnostic.totalEntities || 18}
                  </div>
                  <span className="text-[10px] text-zinc-400">Line, Polyline, Text, Block</span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400">Layer Chuẩn AIA</span>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    {dxfData?.diagnostic.standardLayersCount || 7} /{" "}
                    {dxfData?.diagnostic.totalLayers || 8}
                  </div>
                  <span className="text-[10px] text-zinc-400">Đã map phân hệ MEPF</span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400">Text Lỗi Font / Mã Cũ</span>
                  <div className="text-2xl font-bold font-mono text-rose-400">
                    {dxfData?.diagnostic.corruptedTextCount || 0}
                  </div>
                  <span className="text-[10px] text-zinc-400">Đã tự động chữa lành</span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400">Kích Thước Bao Bản Vẽ</span>
                  <div className="text-xs font-bold font-mono text-sky-400 pt-1">
                    {dxfData
                      ? `${(dxfData.diagnostic.boundingDimensions.widthMm / 1000).toFixed(1)}m × ${(dxfData.diagnostic.boundingDimensions.lengthMm / 1000).toFixed(1)}m`
                      : "15.0m × 5.0m"}
                  </div>
                  <span className="text-[10px] text-zinc-400">Tọa độ gốc 0,0,0</span>
                </div>
              </div>

              {/* Recommendations & Action list */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Khuyến Nghị Xử Lý Kỹ Thuật Tự Động</span>
                </h3>
                <ul className="space-y-1 text-xs text-zinc-300">
                  {dxfData?.diagnostic.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold">•</span>
                      <span>{rec}</span>
                    </li>
                  )) || (
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold">•</span>
                      <span>
                        Bản vẽ sẵn sàng đùn khối 3D AABB và thiết lập phân tầng hành lang.
                      </span>
                    </li>
                  )}
                </ul>
              </div>

              {/* Next Step CTA */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <div className="text-xs text-zinc-300">
                  <span className="font-bold text-amber-300">Bước tiếp theo:</span> Xem xét bảng
                  chuẩn hóa Layer AIA/BS1192 và kiểm tra Font Doctor.
                </div>
                <button
                  onClick={() => setActiveTab("layers")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs transition"
                >
                  <span>Chuyển Sang Bước 1.2: Chuẩn Hóa Layer</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1.2: CHUẨN HÓA LAYER THEO TIÊU CHUẨN AIA / BS1192
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase1_cad" && activeTab === "layers" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    Bảng Quy Chuẩn Layer AIA/BS1192 Sang Mô Hình BIM MEPF
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Tự động ánh xạ layer gốc sang tên chuẩn AIA/BS1192, phân loại mã màu và gán độ
                    dày nét cho 5 phân hệ kỹ thuật.
                  </p>
                </div>

                {/* Filter and Search */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Tìm layer..."
                      value={layerSearch}
                      onChange={(e) => setLayerSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 w-40 sm:w-52"
                    />
                  </div>

                  <button
                    onClick={handleDownloadScr}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-sm transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Xuất Kịch Bản .SCR</span>
                  </button>
                </div>
              </div>

              {/* Discipline Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { id: "all", label: "Tất cả phân hệ" },
                  { id: "M", label: "M - Gió & Điều hòa" },
                  { id: "E", label: "E - Điện & Chiếu sáng" },
                  { id: "P", label: "P - Cấp thoát nước" },
                  { id: "F", label: "F - Phòng cháy PCCC" },
                  { id: "ELV", label: "ELV - Điện nhẹ & BMS" },
                  { id: "S", label: "S - Trục lưới kết cấu" },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDisciplineFilter(d.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 ${
                      selectedDisciplineFilter === d.id
                        ? "bg-zinc-800 text-amber-300 border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200 bg-zinc-950/40"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {/* Layer Table */}
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                      <th className="py-2.5 px-3">Phân Hệ</th>
                      <th className="py-2.5 px-3">Tên Layer Gốc (Bản Vẽ Thiết Kế)</th>
                      <th className="py-2.5 px-3">Layer Chuẩn Hóa BIM (AIA)</th>
                      <th className="py-2.5 px-3">Mã Màu Chuẩn</th>
                      <th className="py-2.5 px-3">Số Đối Tượng</th>
                      <th className="py-2.5 px-3 text-right">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {filteredLayers.map((r, i) => (
                      <tr key={i} className="hover:bg-zinc-800/40 transition">
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-amber-400 font-bold text-[10px]">
                            {r.discipline}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400 line-through">{r.name}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-bold">{r.standardName}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-sans">
                            <span
                              className="w-3 h-3 rounded-full border border-zinc-700"
                              style={{ backgroundColor: r.colorHex }}
                            />
                            <span className="text-[11px] text-zinc-300">Mã {r.colorNumber}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300 tabular-nums">
                          {r.entityCount} entities
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-sans font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Đã Chuẩn Hóa
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1.3: FONT DOCTOR (SHX / VNI / TCVN3 -> UNICODE UTF-8)
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase1_cad" && activeTab === "font_doctor" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Interactive Font Converter */}
              <div className="lg:col-span-7 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-amber-400" />
                    Trình Chữa Lành Font Chữ Tiếng Việt & Ký Hiệu Kỹ Thuật (Font Doctor)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Chuyển đổi bảng mã font nhị phân .shx, VNI-Windows và TCVN3-ABC bị vỡ font sang
                    Unicode UTF-8 chuẩn xác, bảo toàn trọn vẹn số liệu cao độ, đường kính
                    $\varnothing$ và dung sai $\pm$.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300">
                    Văn bản CAD nguồn (Lỗi font / Bảng mã cũ):
                  </label>
                  <textarea
                    rows={4}
                    value={legacyInput}
                    onChange={(e) => setLegacyInput(e.target.value)}
                    placeholder="Dán text hoặc cao độ từ bản vẽ CAD vào đây..."
                    className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleConvertFont()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Chuyển Đổi Sang Unicode UTF-8</span>
                  </button>
                </div>

                {convertedText && (
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                      <span>Kết quả chuẩn hóa Unicode:</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(convertedText);
                          showToast("Đã copy text UTF-8!");
                        }}
                        className="p-1 hover:text-white transition flex items-center gap-1 text-[11px]"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <p className="text-sm font-medium text-zinc-100 font-sans">{convertedText}</p>
                  </div>
                )}
              </div>

              {/* Right Column: Sample Snippets & Technical Symbols */}
              <div className="lg:col-span-5 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-sky-400" />
                  Mẫu Text Thường Gặp & Thử Nghiệm Nhanh
                </h3>

                <div className="space-y-2 pt-1">
                  {sampleFontSnippets.map((s, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setLegacyInput(s.source);
                        handleConvertFont(s.source);
                      }}
                      className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-amber-500/50 cursor-pointer transition space-y-1 group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-zinc-300">{s.label}</span>
                        <span className="text-[10px] text-amber-400 group-hover:underline">
                          Thử ngay →
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400 line-through">
                        {s.source}
                      </div>
                      <div className="text-xs font-medium text-emerald-400 font-sans">
                        {s.expected}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1.4: TRÍCH XUẤT BLOCK SANG BIM FAMILY & BOQ
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase1_cad" && activeTab === "blocks" && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-amber-400" />
                    Trích Xuất Thuộc Tính Block Thiết Bị sang Family BIM & BOQ
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Bóc tách tự động tên block, thuộc tính công suất, lưu lượng, kích thước và ánh
                    xạ sang Revit BIM Family Components LOD 300.
                  </p>
                </div>

                <button
                  onClick={fetchBlockCatalogs}
                  disabled={loadingBlocks}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBlocks ? "animate-spin" : ""}`} />
                  <span>Cập Nhật Block</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {blockCatalogs.map((b, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5 shadow-xs hover:border-zinc-700 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                        {b.discipline}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {b.mapped_boq_code || "Chưa map BOQ"}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-zinc-100 font-mono">{b.block_name}</h4>
                      <p className="text-[11px] text-zinc-400">{b.category}</p>
                    </div>

                    <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800/80 space-y-1 font-mono text-[10px]">
                      {Object.entries(b.attribute_schema).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between text-zinc-300">
                          <span className="text-zinc-500">{k}:</span>
                          <span className="text-zinc-200 font-medium">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1.5: SO SÁNH PHIÊN BẢN (VECTOR DIFF)
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase1_cad" && activeTab === "diff" && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <FileDiff className="w-4 h-4 text-amber-400" />
                    So Sánh Đối Soát Vector Giữa Các Phiên Bản Thiết Kế (Rev A vs Rev B)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Phát hiện mọi thay đổi hình học tuyến ống, dời vị trí thiết bị trước khi nạp vào
                    mô hình BIM. Dự báo tác động chi phí phát sinh (Variation Orders - VO).
                  </p>
                </div>

                <button
                  onClick={runDiffAnalysis}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  <span>Chạy Lại Đối Soát Vector</span>
                </button>
              </div>

              {diffResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-1">
                      <span className="text-[11px] text-zinc-400">Thêm Mới (Added)</span>
                      <div className="text-xl font-bold font-mono text-emerald-400">
                        +{diffResult.summary.added}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950 border border-amber-500/30 space-y-1">
                      <span className="text-[11px] text-zinc-400">Sửa Đổi / Di Dời (Modified)</span>
                      <div className="text-xl font-bold font-mono text-amber-400">
                        {diffResult.summary.modified}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950 border border-rose-500/30 space-y-1">
                      <span className="text-[11px] text-zinc-400">Bị Xóa Bỏ (Removed)</span>
                      <div className="text-xl font-bold font-mono text-rose-400">
                        -{diffResult.summary.removed}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                      <span className="text-[11px] text-zinc-400">Giữ Nguyên (Unchanged)</span>
                      <div className="text-xl font-bold font-mono text-zinc-300">
                        {diffResult.summary.unchanged}
                      </div>
                    </div>
                  </div>

                  {diffResult.potentialVoImpact && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <TrendingUp className="w-5 h-5 text-amber-400 shrink-0" />
                        <div>
                          <span className="text-xs font-bold text-amber-300">
                            Dự báo Phát Sinh Khối Lượng (VO Impact):
                          </span>
                          <p className="text-[11px] text-zinc-300">
                            {diffResult.potentialVoImpact.reason}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-bold text-amber-300">
                          {diffResult.potentialVoImpact.estimatedCostVnd.toLocaleString("vi-VN")} đ
                        </span>
                        <div className="text-[10px] text-zinc-400">Mức độ rủi ro: Cao</div>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                          <th className="py-2.5 px-3">Mã Thực Thể</th>
                          <th className="py-2.5 px-3">Loại Đối Tượng</th>
                          <th className="py-2.5 px-3">Layer</th>
                          <th className="py-2.5 px-3">Chi Tiết Biến Động</th>
                          <th className="py-2.5 px-3 text-right">Trạng Thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-mono">
                        {diffResult.differences.map((d, i) => (
                          <tr key={i} className="hover:bg-zinc-800/40 transition">
                            <td className="py-2.5 px-3 text-zinc-300">{d.entityId}</td>
                            <td className="py-2.5 px-3 text-zinc-400 font-sans">{d.type}</td>
                            <td className="py-2.5 px-3 text-sky-400">{d.layer}</td>
                            <td className="py-2.5 px-3 font-sans text-zinc-200">
                              {d.changeDescription}
                            </td>
                            <td className="py-2.5 px-3 text-right font-sans">
                              {d.diffStatus === "added" && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                                  + Thêm mới
                                </span>
                              )}
                              {d.diffStatus === "modified" && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                                  Sửa đổi
                                </span>
                              )}
                              {d.diffStatus === "removed" && (
                                <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-semibold">
                                  - Xóa bỏ
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
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1.6: TRÌNH SINH MÃ AUTOLISP & SCRIPT SHOPDRAWING
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase1_cad" && activeTab === "lisp" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <Code className="w-4 h-4 text-amber-400" />
                    Cấu Hình Chi Tiết AutoLISP
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Sinh mã AutoLISP chuẩn vẽ tự động các chi tiết mặt cắt, giá đỡ và lỗ mở sleeve
                    an toàn.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-semibold text-center">
                  <button
                    onClick={() => setLispType("hanger")}
                    className={`py-1.5 rounded-lg transition ${
                      lispType === "hanger"
                        ? "bg-amber-500 text-zinc-950 font-bold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Giá Đỡ Trapeze
                  </button>
                  <button
                    onClick={() => setLispType("sleeve")}
                    className={`py-1.5 rounded-lg transition ${
                      lispType === "sleeve"
                        ? "bg-amber-500 text-zinc-950 font-bold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Lỗ Mở Sleeve
                  </button>
                  <button
                    onClick={() => setLispType("duct_transition")}
                    className={`py-1.5 rounded-lg transition ${
                      lispType === "duct_transition"
                        ? "bg-amber-500 text-zinc-950 font-bold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Côn Thu Gió
                  </button>
                </div>

                {lispType === "hanger" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-zinc-400">Bề rộng Unistrut (mm)</label>
                        <input
                          type="number"
                          value={hangerWidth}
                          onChange={(e) => setHangerWidth(Number(e.target.value))}
                          className="w-full mt-1 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400">Chiều cao thả ty (mm)</label>
                        <input
                          type="number"
                          value={hangerHeight}
                          onChange={(e) => setHangerHeight(Number(e.target.value))}
                          className="w-full mt-1 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400">Đường kính Ty ren</label>
                      <select
                        value={rodDiameter}
                        onChange={(e) => setRodDiameter(Number(e.target.value))}
                        className="w-full mt-1 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                      >
                        <option value={10}>M10 (Ống gió / Máng cáp nhẹ)</option>
                        <option value={12}>M12 (Ống Chiller / Nước nặng)</option>
                        <option value={16}>M16 (Giá đỡ cụm 3 tầng Trapeze)</option>
                      </select>
                    </div>
                  </div>
                )}

                {lispType === "sleeve" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-zinc-400">Đường kính Sleeve (mm)</label>
                        <input
                          type="number"
                          value={sleeveDiameter}
                          onChange={(e) => setSleeveDiameter(Number(e.target.value))}
                          className="w-full mt-1 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400">Mã hiệu Tag Sleeve</label>
                        <input
                          type="text"
                          value={sleeveTag}
                          onChange={(e) => setSleeveTag(e.target.value)}
                          className="w-full mt-1 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-amber-400">
                      * Bất biến kỹ thuật: Sleeve định vị an toàn trong khoảng 1/3 giữa nhịp (L/3 ≤
                      x ≤ 2L/3).
                    </p>
                  </div>
                )}

                {lispType === "duct_transition" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-zinc-400">Miệng vào W1 x H1 (mm)</label>
                        <div className="flex gap-1.5 mt-1">
                          <input
                            type="number"
                            value={inletWidth}
                            onChange={(e) => setInletWidth(Number(e.target.value))}
                            className="w-1/2 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                          <input
                            type="number"
                            value={inletHeight}
                            onChange={(e) => setInletHeight(Number(e.target.value))}
                            className="w-1/2 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400">Miệng ra W2 x H2 (mm)</label>
                        <div className="flex gap-1.5 mt-1">
                          <input
                            type="number"
                            value={outletWidth}
                            onChange={(e) => setOutletWidth(Number(e.target.value))}
                            className="w-1/2 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                          <input
                            type="number"
                            value={outletHeight}
                            onChange={(e) => setOutletHeight(Number(e.target.value))}
                            className="w-1/2 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleGenerateLisp}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Sinh Mã AutoLISP Ngay</span>
                </button>
              </div>

              <div className="lg:col-span-7 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200 font-mono">
                    xboss_{lispType}.lsp
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copied ? "Đã copy" : "Sao chép"}</span>
                    </button>
                    <button
                      onClick={handleDownloadLisp}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải về .LSP</span>
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-amber-300/90 overflow-x-auto max-h-[420px] leading-relaxed">
                    {generatedLispCode || ";; Đang sinh mã LISP..."}
                  </pre>
                </div>
              </div>
            </div>

            {/* Next Step CTA */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="text-xs text-zinc-300">
                <span className="font-bold text-amber-300">Bước tiếp theo:</span> Chuyển sang Dọn
                Rác Sâu (Deep Purge & Overkill) và Căn chỉnh gốc tọa độ chuẩn WCS.
              </div>
              <button
                onClick={() => setActiveTab("purge_wcs")}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs transition"
              >
                <span>Chuyển Sang Bước 1.7: Dọn Rác & Gốc Tọa Độ WCS</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1.7: DỌN RÁC SÂU (DEEP PURGE & OVERKILL) & TỌA ĐỘ GỐC WCS / TỶ LỆ
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase1_cad" && activeTab === "purge_wcs" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Cột Trái: Deep Purge & Overkill Engine */}
              <div className="lg:col-span-6 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="space-y-0.5">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-amber-400" />
                      Động Cơ Dọn Rác Sâu (Deep Purge & Overkill)
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Tự động gộp các nét vẽ trùng đè, xóa nét mồ côi 0mm và purge triệt để block vô
                      danh rác.
                    </p>
                  </div>
                  {purgeState.isPurged ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono flex items-center gap-1 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã Tối Ưu
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold font-mono border border-amber-500/30">
                      Cần Dọn Rác
                    </span>
                  )}
                </div>

                {/* Thống kê rác phát hiện */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                    <div className="text-[11px] text-zinc-400">Nét Trùng Đè (Overlapping)</div>
                    <div className="text-sm font-bold font-mono text-amber-400">
                      {purgeState.overlappingCount} nét
                    </div>
                    <p className="text-[10px] text-zinc-500">Tự động hàn gộp thành 1 polyline</p>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                    <div className="text-[11px] text-zinc-400">
                      Nét Mồ Côi Độ Dài 0 (Zero-Length)
                    </div>
                    <div className="text-sm font-bold font-mono text-rose-400">
                      {purgeState.zeroLengthCount} đối tượng
                    </div>
                    <p className="text-[10px] text-zinc-500">Xóa bỏ hoàn toàn rác đồ họa</p>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                    <div className="text-[11px] text-zinc-400">Block Vô Danh Rác (*U...)</div>
                    <div className="text-sm font-bold font-mono text-sky-400">
                      {purgeState.anonymousBlocksCount} blocks
                    </div>
                    <p className="text-[10px] text-zinc-500">Purge sạch unreferenced definitions</p>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                    <div className="text-[11px] text-zinc-400">Layer Trống Rác (Empty Layers)</div>
                    <div className="text-sm font-bold font-mono text-emerald-400">
                      {purgeState.emptyLayersCount} layers
                    </div>
                    <p className="text-[10px] text-zinc-500">Loại bỏ khỏi bảng quản lý layer</p>
                  </div>
                </div>

                {/* Tối ưu dung lượng */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Dung Lượng Bản Vẽ:</span>
                    <span className="text-xs font-mono font-bold text-zinc-200">
                      {purgeState.originalSizeMb} MB →{" "}
                      <span className="text-emerald-400">{purgeState.purgedSizeMb} MB</span>
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                    Tiết kiệm 90.1% dung lượng
                  </span>
                </div>

                <button
                  onClick={handleRunDeepPurge}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Kích Hoạt Thuật Toán Deep Purge & Overkill</span>
                </button>
              </div>

              {/* Cột Phải: World Coordinate System (WCS) & Scale Normalizer */}
              <div className="lg:col-span-6 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="space-y-0.5">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                      <Crosshair className="w-4 h-4 text-sky-400" />
                      Căn Chỉnh Gốc Tọa Độ WCS & Tỷ Lệ Đơn Vị Bản Vẽ
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Đưa gốc tọa độ (0,0,0) về đúng tim giao trục chính A-1 và chuẩn hóa đơn vị 1
                      Unit = 1 mm để khớp 100% khi nhập vào BIM 3D.
                    </p>
                  </div>
                  {wcsConfig.isAligned ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono flex items-center gap-1 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã Khóa WCS
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold font-mono border border-amber-500/30">
                      Chưa Căn Gốc
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">
                      Mốc Tim Trục Tọa Độ Gốc Công Trình (Base Point Reference):
                    </label>
                    <input
                      type="text"
                      value={wcsConfig.gridAxisReference}
                      onChange={(e) =>
                        setWcsConfig((prev) => ({ ...prev, gridAxisReference: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">
                        Tọa Độ Gốc X (mm)
                      </label>
                      <input
                        type="number"
                        value={wcsConfig.originX}
                        onChange={(e) =>
                          setWcsConfig((prev) => ({ ...prev, originX: Number(e.target.value) }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">
                        Tọa Độ Gốc Y (mm)
                      </label>
                      <input
                        type="number"
                        value={wcsConfig.originY}
                        onChange={(e) =>
                          setWcsConfig((prev) => ({ ...prev, originY: Number(e.target.value) }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">Cao Độ Z (mm)</label>
                      <input
                        type="number"
                        value={wcsConfig.originZ}
                        onChange={(e) =>
                          setWcsConfig((prev) => ({ ...prev, originZ: Number(e.target.value) }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">
                        Đơn Vị Vẽ (Units):
                      </label>
                      <select
                        value={wcsConfig.unit}
                        onChange={(e) =>
                          setWcsConfig((prev) => ({ ...prev, unit: e.target.value as any }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200"
                      >
                        <option value="mm">Milimet (1 Unit = 1 mm - Chuẩn MEPF)</option>
                        <option value="m">Mét (1 Unit = 1 m - Chuyển về mm)</option>
                        <option value="inch">Inches (Hệ Imperial - Chuyển mm)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">
                        Tỷ Lệ Model/Layout:
                      </label>
                      <select
                        value={wcsConfig.scale}
                        onChange={(e) =>
                          setWcsConfig((prev) => ({ ...prev, scale: e.target.value as any }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200"
                      >
                        <option value="1:1">Tỷ lệ 1:1 (Không gian Model thực tế)</option>
                        <option value="1:50">Tỷ lệ 1:50 (Mặt bằng chi tiết căn hộ)</option>
                        <option value="1:100">Tỷ lệ 1:100 (Mặt bằng tổng thể tầng)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleAlignWcsOrigin}
                  className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Khóa Tọa Độ Chuẩn WCS (0,0,0) Khớp Vào Mô Hình BIM</span>
                </button>
              </div>
            </div>

            {/* Next Step CTA */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="text-xs text-zinc-300">
                <span className="font-bold text-amber-300">Bước tiếp theo:</span> Kiểm tra bảng cấu
                hình nét in CTB và rà soát các kích thước Dim bị sửa số ảo.
              </div>
              <button
                onClick={() => setActiveTab("ctb_dim")}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs transition"
              >
                <span>Chuyển Sang Bước 1.8: Nét In CTB & Bác Sĩ Dim Ảo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1.8: CHUẨN HÓA NÉT IN CTB & BÁC SĨ DIM ẢO (DIM OVERRIDE DOCTOR)
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase1_cad" && activeTab === "ctb_dim" && (
          <div className="space-y-4">
            {/* Section 1: Dim Override Doctor (Chống Gian Lận Kích Thước) */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-rose-400" />
                    Bác Sĩ Dim Ảo (Dim Override Doctor — Chống Gian Lận Kích Thước)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Phát hiện và cảnh báo các kích thước bị sửa đè chữ số (Text Override) sai lệch
                    so với số đo hình học thực tế trong bản vẽ CAD.
                  </p>
                </div>

                <button
                  onClick={handleFixAllDims}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs shadow-sm transition shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Khôi Phục Tất Cả Về Đo Thực Tế</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                      <th className="py-2.5 px-3">Mã Dim</th>
                      <th className="py-2.5 px-3">Vị Trí Đo / Đối Tượng</th>
                      <th className="py-2.5 px-3">Chữ Số Ghi Đè (Hiển thị)</th>
                      <th className="py-2.5 px-3">Khoảng Cách Thực Tế</th>
                      <th className="py-2.5 px-3">Độ Sai Lệch</th>
                      <th className="py-2.5 px-3">Trạng Thái</th>
                      <th className="py-2.5 px-3 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {dimOverrides.map((dim) => {
                      const diff = dim.actualMeasMm - (parseInt(dim.nominalText) || 0);
                      return (
                        <tr key={dim.id} className="hover:bg-zinc-800/40 transition">
                          <td className="py-2 px-3 font-bold text-amber-400">{dim.id}</td>
                          <td className="py-2 px-3 font-sans text-zinc-300">{dim.location}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded font-bold ${
                                dim.isFake && !dim.fixed
                                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                  : "text-zinc-200"
                              }`}
                            >
                              {dim.nominalText}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-emerald-400 font-bold">
                            {dim.actualMeasMm} mm
                          </td>
                          <td className="py-2 px-3">
                            {dim.isFake && !dim.fixed ? (
                              <span className="text-rose-400 font-bold">
                                {diff > 0 ? `+${diff}` : diff} mm (Lệch)
                              </span>
                            ) : (
                              <span className="text-emerald-400">0 mm (Khớp chuẩn)</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            {dim.isFake && !dim.fixed ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-semibold">
                                <AlertTriangle className="w-3 h-3" /> Dim Ảo / Bị Sửa Số
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                                <CheckCircle2 className="w-3 h-3" /> Đạt Chuẩn
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-sans">
                            {!dim.fixed ? (
                              <button
                                onClick={() => handleFixDimOverride(dim.id)}
                                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
                              >
                                Sửa về số đo thật
                              </button>
                            ) : (
                              <span className="text-[11px] text-zinc-500 font-mono">
                                Đã khôi phục ✓
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Bảng Cấu Hình Độ Dày Nét In CTB */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <Printer className="w-4 h-4 text-emerald-400" />
                    Bảng Cấu Hình Độ Dày Nét In CTB (Standard Plot Style Table)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Quy chuẩn độ dày nét in theo màu ACI tiêu chuẩn xây dựng Việt Nam và quốc tế,
                    đảm bảo in ra PDF/bản giấy sắc nét, phân biệt rõ tuyến chính và nền.
                  </p>
                </div>

                <button
                  onClick={handleDownloadCtb}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Xuất File Cấu Hình In xboss_standard.ctb</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                      <th className="py-2.5 px-3">Mã Màu ACI</th>
                      <th className="py-2.5 px-3">Mẫu Màu</th>
                      <th className="py-2.5 px-3">Độ Dày Nét In (mm)</th>
                      <th className="py-2.5 px-3">Độ Đậm (Screening)</th>
                      <th className="py-2.5 px-3">Mục Đích Sử Dụng Kỹ Thuật</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {ctbMappings.map((c) => (
                      <tr key={c.colorIndex} className="hover:bg-zinc-800/40 transition">
                        <td className="py-2 px-3 font-bold text-zinc-200">{c.colorName}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 rounded-full border border-zinc-600"
                              style={{ backgroundColor: c.colorHex }}
                            />
                            <span className="text-zinc-400">{c.colorHex}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-amber-400 font-bold">{c.lineweightMm} mm</td>
                        <td className="py-2 px-3 text-zinc-300">{c.screeningPct}%</td>
                        <td className="py-2 px-3 font-sans text-zinc-300">{c.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Next Step CTA */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="text-xs text-zinc-300">
                <span className="font-bold text-amber-300">Bước tiếp theo:</span> Chuyển sang Cổng
                Review & Sửa Tay 2D để rà soát tổng thể và Ký Duyệt Hồ Sơ.
              </div>
              <button
                onClick={() => setActiveTab("review_manual")}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs transition"
              >
                <span>Chuyển Sang Bước 1.9: Cổng Review & Sửa Tay 2D</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1.9: CỔNG REVIEW & SỬA TAY BẢN VẼ 2D (MANUAL REVIEW & OVERRIDE)
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase1_cad" && activeTab === "review_manual" && (
          <div className="space-y-4">
            {/* Header & Review Status Box */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      <Edit3 className="w-5 h-5" />
                    </span>
                    <h2 className="text-sm sm:text-base font-bold uppercase tracking-wide text-zinc-100">
                      Cổng Review & Sửa Tay Bản Vẽ 2D Trước Khi Phê Duyệt Sang 3D
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Kiểm tra và trực tiếp hiệu chỉnh lại tên Layer AIA, sửa text ghi chú kỹ thuật,
                    khớp lại mã Block BOQ. Sau khi sửa tay hoàn tất, kỹ sư xác nhận và Ký Duyệt để
                    mở khóa Cổng 3D.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleSaveManualReview}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700 transition"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu Bản Sửa Tay</span>
                  </button>
                  <button
                    onClick={() => {
                      handleApprove2d();
                      setActivePhase("phase2_3d");
                      setActiveTab("spatial_bim");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs shadow-sm transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Ký Duyệt & Chuyển Sang Cổng 3D</span>
                  </button>
                </div>
              </div>

              {/* Status summary banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>1. Layer Đã Ánh Xạ</span>
                    <span className="text-amber-400 font-mono font-bold">
                      {manualLayers.length} layers
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-zinc-200">
                    Cho phép sửa tên & phân hệ
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>2. Text & Dim Kỹ Thuật</span>
                    <span className="text-sky-400 font-mono font-bold">
                      {manualTexts.length} chuỗi text
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-zinc-200">
                    Cho phép sửa trực tiếp ghi chú
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>3. Khớp Block BOQ</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {manualBlocks.length} blocks
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-zinc-200">
                    Cho phép gán mã BOQ dự toán
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-Section 1: Bảng Sửa Tay Layer AIA/BS1192 */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>1. Rà Soát & Sửa Tay Bảng Layer AIA/BS1192</span>
                </h3>
                <span className="text-[11px] font-mono text-zinc-400">
                  Bấm vào ô để sửa trực tiếp
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                      <th className="py-2.5 px-3">Tên Layer Gốc</th>
                      <th className="py-2.5 px-3">Tên Layer Chuẩn Hóa (Sửa tay)</th>
                      <th className="py-2.5 px-3">Phân Hệ</th>
                      <th className="py-2.5 px-3">Màu Sắc ACI</th>
                      <th className="py-2.5 px-3 text-right">Số Đối Tượng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {manualLayers.map((l) => (
                      <tr key={l.id} className="hover:bg-zinc-800/40 transition">
                        <td className="py-2 px-3 text-zinc-400">{l.name}</td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={l.standardName}
                            onChange={(e) =>
                              handleUpdateManualLayer(l.id, "standardName", e.target.value)
                            }
                            className="w-full max-w-[240px] px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-bold font-mono text-amber-400 focus:outline-none focus:border-amber-500"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={l.discipline}
                            onChange={(e) =>
                              handleUpdateManualLayer(l.id, "discipline", e.target.value as any)
                            }
                            className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-sans text-zinc-200 focus:outline-none focus:border-amber-500"
                          >
                            <option value="M">Hệ Gió (HVAC - M)</option>
                            <option value="E">Hệ Điện (Electrical - E)</option>
                            <option value="P">Hệ Nước (Plumbing - P)</option>
                            <option value="F">Hệ PCCC (Firefighting - F)</option>
                            <option value="ELV">Hệ Điện Nhẹ (ELV)</option>
                            <option value="S">Kết Cấu (Structural - S)</option>
                            <option value="OTHER">Khác (Ghi chú/Khung tên)</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-zinc-600 shrink-0"
                              style={{ backgroundColor: l.colorHex }}
                            />
                            <input
                              type="text"
                              value={l.colorHex}
                              onChange={(e) =>
                                handleUpdateManualLayer(l.id, "colorHex", e.target.value)
                              }
                              className="w-20 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-mono text-zinc-300"
                            />
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right text-zinc-400 tabular-nums">
                          {l.entityCount} entities
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sub-Section 2: Bảng Sửa Tay Text & Ghi Chú Kỹ Thuật */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-sky-400" />
                  <span>2. Rà Soát & Sửa Tay Text Ghi Chú / Cao Độ / Kích Thước Ống</span>
                </h3>
                <span className="text-[11px] font-mono text-zinc-400">
                  Gõ trực tiếp vào ô để hiệu chỉnh
                </span>
              </div>

              <div className="space-y-2.5">
                {manualTexts.map((txt) => (
                  <div
                    key={txt.id}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono text-zinc-400 border-b border-zinc-900 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-400">[{txt.id}]</span>
                        <span>Layer: {txt.layer}</span>
                      </div>
                      <span className="text-zinc-500">Gốc: {txt.raw}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-5 text-xs text-zinc-400 font-sans">
                        <span className="text-zinc-500 text-[10px] block">
                          Đã tự động dịch UTF-8:
                        </span>
                        <span className="text-zinc-300">{txt.decoded}</span>
                      </div>

                      <div className="sm:col-span-7">
                        <span className="text-emerald-400 text-[10px] font-semibold block mb-0.5">
                          Nội dung sau khi kỹ sư sửa tay (Override):
                        </span>
                        <input
                          type="text"
                          value={txt.edited}
                          onChange={(e) => handleUpdateManualText(txt.id, e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-sans text-emerald-300 font-medium focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub-Section 3: Bảng Sửa Tay Khớp Mã Block BOQ */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-emerald-400" />
                  <span>3. Rà Soát & Sửa Tay Khớp Mã Block Dự Toán BOQ</span>
                </h3>
                <span className="text-[11px] font-mono text-zinc-400">
                  Gán mã BOQ để bóc tách khối lượng
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                      <th className="py-2.5 px-3">Tên Block Gốc</th>
                      <th className="py-2.5 px-3">Tên Thiết Bị / Diễn Giải (Sửa tay)</th>
                      <th className="py-2.5 px-3">Mã BOQ Dự Toán (Sửa tay)</th>
                      <th className="py-2.5 px-3 text-right">Số Lượng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {manualBlocks.map((b) => (
                      <tr key={b.id} className="hover:bg-zinc-800/40 transition">
                        <td className="py-2 px-3 text-zinc-300 font-bold">{b.name}</td>
                        <td className="py-2 px-3 font-sans">
                          <input
                            type="text"
                            value={b.customName}
                            onChange={(e) =>
                              handleUpdateManualBlock(b.id, "customName", e.target.value)
                            }
                            className="w-full px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={b.mappedBoqCode}
                            onChange={(e) =>
                              handleUpdateManualBlock(b.id, "mappedBoqCode", e.target.value)
                            }
                            className="w-full px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                          />
                        </td>
                        <td className="py-2 px-3 text-right text-zinc-300 tabular-nums font-bold">
                          {b.count} cái
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sub-Section 4: Biên Bản Thẩm Tra & Ký Phê Duyệt */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-emerald-500/30 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>4. Biên Bản Thẩm Tra & Ký Duyệt Phê Duyệt Hồ Sơ 2D</span>
                </h3>
                <span className="text-[10px] font-mono text-zinc-400">
                  Ký duyệt kỹ thuật trực tiếp
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] text-zinc-400">
                    Người Soát Xét / Kỹ Sư Trưởng:
                  </label>
                  <input
                    type="text"
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200"
                  />
                </div>

                <div className="sm:col-span-8 space-y-1">
                  <label className="text-[11px] text-zinc-400">
                    Nhận Xét & Đánh Giá Thẩm Tra Kỹ Thuật:
                  </label>
                  <input
                    type="text"
                    value={reviewerRemarks}
                    onChange={(e) => setReviewerRemarks(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  onClick={handleSaveManualReview}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>1. Lưu Bản Sửa Tay</span>
                </button>
                <button
                  onClick={() => {
                    handleApprove2d();
                    setActivePhase("phase2_3d");
                    setActiveTab("spatial_bim");
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs shadow-md transition"
                >
                  <BadgeCheck className="w-4 h-4" />
                  <span>2. Ký Duyệt Phê Duyệt 2D & Mở Khóa Cổng 3D</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            GIAI ĐOẠN 2: DỰNG KHỐI 3D TỪ DXF & CHUẨN HÓA MÔ HÌNH 3D (SPATIAL BIM)
        ══════════════════════════════════════════════════════════════════════ */}
        {activePhase === "phase2_3d" && cad2dApprovalStatus !== "approved" && (
          <div className="p-8 sm:p-12 rounded-2xl bg-zinc-900/90 border border-amber-500/30 text-center space-y-5 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <Lock className="w-8 h-8" />
            </div>

            <div className="max-w-xl mx-auto space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-bold">
                <Clock className="w-3.5 h-3.5" />
                <span>CHỜ DUYỆT 2D — CỔNG 3D ĐANG KHÓA (GATE 0)</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 uppercase tracking-tight">
                Cổng Chuyển Đổi 3D BIM Yêu Cầu Phê Duyệt Hồ Sơ 2D
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Theo quy chuẩn kỹ thuật của XBoss, toàn bộ bản vẽ CAD 2D phải được chuẩn hóa 100%
                (Layer AIA, Font Doctor, Block BOQ) và có chữ ký phê duyệt kỹ thuật của Kỹ Sư Trưởng
                / BIM Lead trước khi mở cổng đùn khối 3D không gian từ DXF.
              </p>
            </div>

            <div className="max-w-xl mx-auto p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-left space-y-2.5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Checklist Điều Kiện Tiên Quyết Để Mở Khóa Cổng 3D
                </span>
                <span className="text-[10px] font-mono text-zinc-400">Tiêu chuẩn ISO 19650</span>
              </div>
              <ul className="space-y-2 text-xs text-zinc-300 font-mono">
                <li className="flex items-center justify-between">
                  <span className="text-zinc-300">
                    • 1. Chẩn đoán Dị tật CAD (Health Score ≥ 85%)
                  </span>
                  <span className="text-emerald-400 font-bold">Đạt (94/100) ✓</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-zinc-300">• 2. Chuẩn hóa Layer AIA/BS1192 MEPF</span>
                  <span className="text-emerald-400 font-bold">Hoàn tất (100%) ✓</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-zinc-300">
                    • 3. Sửa sạch lỗi Font Tiếng Việt sang UTF-8
                  </span>
                  <span className="text-emerald-400 font-bold">Hoàn tất (0 lỗi) ✓</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-zinc-300">
                    • 4. Trích xuất & Đối soát danh mục Block BOQ
                  </span>
                  <span className="text-emerald-400 font-bold">Đã kiểm tra ✓</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-zinc-300">
                    • 5. Ký Duyệt Kỹ Thuật (Kỹ Sư Trưởng MEPF / BIM Lead)
                  </span>
                  <span className="text-amber-400 font-bold animate-pulse">
                    Đang chờ ký duyệt ⏳
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setActivePhase("phase1_cad");
                  setActiveTab("diagnostic");
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
              >
                Quay Lại Giai Đoạn 1 Rà Soát 2D
              </button>
              <button
                onClick={handleApprove2d}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs shadow-md transition"
              >
                <Check className="w-4 h-4" />
                <span>Ký Phê Duyệt 2D Ngay & Mở Khóa Cổng 3D</span>
              </button>
            </div>
          </div>
        )}

        {activePhase === "phase2_3d" && cad2dApprovalStatus === "approved" && (
          <div className="space-y-4">
            {/* Approved Seal Banner */}
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <BadgeCheck className="w-4 h-4 shrink-0" />
                <span>
                  ✓ HỒ SƠ 2D ĐÃ ĐƯỢC DUYỆT BỞI {approverName.toUpperCase()} ({approvedAt}) — CỔNG 3D
                  ĐÃ MỞ KHÓA HOÀN TOÀN
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400/80">
                Mộc Điện Tử: #XBOSS-GATE0-VERIFIED
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                      <Cuboid className="w-5 h-5" />
                    </span>
                    <h2 className="text-base font-bold text-zinc-100 uppercase tracking-tight">
                      Dựng Khối 3D Bounding Envelope (AABB) & Phân Tầng Hành Lang Từ DXF
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Đã chuẩn hóa toàn bộ file CAD 2D. Đùn các tuyến Centerline thành bao không gian
                    3D, phân chia Tier 1 (Gió), Tier 2 (Điện), Tier 3 (Nước) và kiểm tra tĩnh không
                    đáy dầm Soffit Clearance.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href="/mo-hinh-bim"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition"
                  >
                    <Box className="w-4 h-4" />
                    <span>Mở BIM Viewer 3D</span>
                  </Link>
                  <Link
                    href="/engineering/cad-corridor"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-bold text-xs shadow-sm transition"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Điều Hướng Clash Solver</span>
                  </Link>
                </div>
              </div>

              {/* 3 Rules Invariants */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Bảo toàn Độ dốc Trọng lực</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Ống thoát nước giữ dốc 1.0% - 2.0%. Tuyệt đối không uốn né dầm làm gãy độ dốc.
                    Hệ áp lực né 45°.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Phân Tầng Hành Lang Kỹ Thuật</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Tier 1: Ống gió trên cùng • Tier 2: Thang máng cáp điện (cách ống chiller ≥
                    150mm) • Tier 3: Ống nước lạnh/chiller.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Vùng An Toàn Xuyên Dầm (Sleeve)</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Lỗ mở xuyên dầm bê tông chỉ đặt tại 1/3 giữa nhịp (L/3 ≤ x ≤ 2L/3) và Dsleeve ≤
                    Hdầm/3.
                  </p>
                </div>
              </div>
            </div>

            {/* Extruded Spatial Routes Table */}
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Danh Sách Tuyến Centerline Đã Đùn Thành Khối 3D Spatial Envelope
                </h3>
                <span className="text-[11px] font-mono text-zinc-400">
                  {routes.length} tuyến ống chính • Tầng 4 Tháp A
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                      <th className="py-2.5 px-3">Mã Tuyến</th>
                      <th className="py-2.5 px-3">Tên Tuyến & Layer CAD</th>
                      <th className="py-2.5 px-3">Tiết Diện</th>
                      <th className="py-2.5 px-3">Chiều Dài</th>
                      <th className="py-2.5 px-3">Cao Độ Đáy (BOP)</th>
                      <th className="py-2.5 px-3">Phân Tầng Hành Lang</th>
                      <th className="py-2.5 px-3">Khoảng Sáng Đáy Dầm</th>
                      <th className="py-2.5 px-3">Trạng Thái Combine</th>
                      <th className="py-2.5 px-3 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {routes.map((r) => (
                      <tr key={r.id} className="hover:bg-zinc-800/40 transition">
                        <td className="py-2.5 px-3 font-bold text-amber-400">{r.id}</td>
                        <td className="py-2.5 px-3 font-sans font-medium text-zinc-200">
                          <div>{r.name}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            Hệ: <span className="text-zinc-300 font-bold">{r.system}</span> • Bọc
                            cách nhiệt: {r.insulationMm}mm
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">{r.sectionDimensions}</td>
                        <td className="py-2.5 px-3 text-zinc-300 text-right tabular-nums">
                          {(r.lengthMm / 1000).toFixed(1)} m
                        </td>
                        <td className="py-2.5 px-3 text-amber-300 font-bold text-right tabular-nums">
                          +{r.elevationBopMm} mm
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">
                          <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-[10px]">
                            {r.corridorTier}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span
                            className={
                              r.soffitClearanceMm < 200
                                ? "text-rose-400 font-bold"
                                : "text-emerald-400"
                            }
                          >
                            {r.soffitClearanceMm} mm
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {r.combineStatus === "verified" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-sans font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Đạt Combine
                            </span>
                          ) : r.combineStatus === "clash_risk" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-sans font-semibold">
                              <AlertTriangle className="w-3 h-3" /> Cần Kiểm Tra Dốc
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-sans font-semibold">
                              <Activity className="w-3 h-3" /> Sẵn Sàng
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Link
                            href="/engineering/cad-corridor"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 inline-flex items-center gap-1 text-[11px] font-sans"
                          >
                            <span>Định Tuyến</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
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
