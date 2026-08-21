"use client";

import { useEffect, useState, useCallback } from "react";
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
  Wrench,
  Search,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  Compass,
  CheckCircle2,
  Box,
  SlidersHorizontal,
  ChevronRight,
  Split,
  Maximize2,
  ShieldCheck,
  FileText,
  Activity,
  FolderSync,
  HelpCircle,
  Play,
  Share2,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { showToast } from "@/app/components/Toast";
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

interface StandardLayerRule {
  discipline: "M" | "E" | "P" | "F" | "ELV" | "S";
  originalLayer: string;
  standardLayer: string;
  colorCode: string;
  colorName: string;
  lineWeight: string;
  description: string;
  status: "matched" | "standardized" | "pending";
}

interface CenterlineSpatialRoute {
  id: string;
  system: "HVAC" | "WATER" | "ELECTRICAL" | "FIRE";
  name: string;
  startPoint: [number, number, number];
  endPoint: [number, number, number];
  lengthMm: number;
  sectionDimensions: string;
  insulationMm: number;
  elevationBopMm: number;
  corridorTier: "Tier 1 (Gió)" | "Tier 2 (Điện)" | "Tier 3 (Nước)";
  combineStatus: "clean" | "clash_risk" | "verified";
  soffitClearanceMm: number;
}

export default function ChuanHoaBanVePage() {
  const [activeTab, setActiveTab] = useState<
    "layers" | "font_doctor" | "diff" | "blocks" | "spatial_bim" | "lisp"
  >("spatial_bim");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // 1. Layer Standardization States
  const [selectedDisciplineFilter, setSelectedDisciplineFilter] = useState<string>("all");
  const [layerSearch, setLayerSearch] = useState("");
  const [layerRules, setLayerRules] = useState<StandardLayerRule[]>([
    {
      discipline: "M",
      originalLayer: "01_ONG_GIO_CAP",
      standardLayer: "M-HVAC-DUCT-SUPP",
      colorCode: "#38bdf8",
      colorName: "Sky Blue (140)",
      lineWeight: "0.35 mm",
      description: "Tuyến ống gió cấp lạnh chính và nhánh kèm bọc cách nhiệt",
      status: "standardized",
    },
    {
      discipline: "M",
      originalLayer: "02_ONG_GIO_HOI",
      standardLayer: "M-HVAC-DUCT-RETN",
      colorCode: "#0284c7",
      colorName: "Dark Blue (150)",
      lineWeight: "0.30 mm",
      description: "Tuyến ống gió hồi và ống hút khói hành lang",
      status: "standardized",
    },
    {
      discipline: "E",
      originalLayer: "DIEN_MANG_CAP_DONG_LUC",
      standardLayer: "E-TRAY-POWR-PRIM",
      colorCode: "#fbbf24",
      colorName: "Amber Yellow (40)",
      lineWeight: "0.40 mm",
      description: "Thang máng cáp nguồn động lực hạ thế 3P+N",
      status: "standardized",
    },
    {
      discipline: "E",
      originalLayer: "DIEN_CHIEU_SANG_DAY",
      standardLayer: "E-LITE-WIRE-CIRC",
      colorCode: "#f59e0b",
      colorName: "Orange (30)",
      lineWeight: "0.25 mm",
      description: "Dây dẫn và ống luồn mềm chiếu sáng âm trần",
      status: "standardized",
    },
    {
      discipline: "P",
      originalLayer: "CAP_THOAT_NUOC_THAI",
      standardLayer: "P-SAN-PIPE-SOIL",
      colorCode: "#818cf8",
      colorName: "Indigo (170)",
      lineWeight: "0.35 mm",
      description: "Ống thoát phân và thoát nước thải sinh hoạt (dốc 1.5% - 2%)",
      status: "standardized",
    },
    {
      discipline: "P",
      originalLayer: "NUOC_LANH_PPR",
      standardLayer: "P-DOM-PIPE-COLD",
      colorCode: "#34d399",
      colorName: "Emerald Green (70)",
      lineWeight: "0.30 mm",
      description: "Ống cấp nước sinh hoạt PPR áp lực PN10/PN16",
      status: "standardized",
    },
    {
      discipline: "F",
      originalLayer: "PCCC_ONG_CHUA_CHAY",
      standardLayer: "F-PROT-PIPE-MAIN",
      colorCode: "#f87171",
      colorName: "Red (10)",
      lineWeight: "0.50 mm",
      description: "Tuyến ống thép đen hàn/ren cấp nước chữa cháy vách tường & sprinkler",
      status: "standardized",
    },
    {
      discipline: "ELV",
      originalLayer: "MANG_LAN_DATA_RACK",
      standardLayer: "ELV-DATA-TRAY-COMM",
      colorCode: "#c084fc",
      colorName: "Purple (210)",
      lineWeight: "0.30 mm",
      description: "Máng cáp mạng viễn thông, CCTV, BMS và âm thanh PA",
      status: "standardized",
    },
    {
      discipline: "S",
      originalLayer: "TRUC_LUOI_DANG_THEP",
      standardLayer: "S-GRID-AXIS-COOR",
      colorCode: "#a1a1aa",
      colorName: "Zinc Gray (8)",
      lineWeight: "0.15 mm",
      description: "Trục định vị kết cấu dầm cột để neo tọa độ BIM 0,0,0",
      status: "standardized",
    },
  ]);

  // 2. Font Doctor States
  const [legacyInput, setLegacyInput] = useState(
    "HÖ thèng th«ng giã tÇng 4 - èng giã 600x400 BOP=+2.85m",
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

  // 3. CAD Diff States
  const [diffResult, setDiffResult] = useState<CadDiffResult | null>(null);

  // 4. Block Catalog States
  const [blockCatalogs, setBlockCatalogs] = useState<BlockCatalogItem[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  // 5. Spatial BIM & Combine Readiness States
  const [routes, setRoutes] = useState<CenterlineSpatialRoute[]>([
    {
      id: "R-DUCT-01",
      system: "HVAC",
      name: "Tuyến ống gió cấp chính Trục A-D",
      startPoint: [1200, 2400, 3100],
      endPoint: [15400, 2400, 3100],
      lengthMm: 14200,
      sectionDimensions: "800 x 400 mm",
      insulationMm: 25,
      elevationBopMm: 2875,
      corridorTier: "Tier 1 (Gió)",
      combineStatus: "verified",
      soffitClearanceMm: 225,
    },
    {
      id: "R-TRAY-01",
      system: "ELECTRICAL",
      name: "Thang máng cáp nguồn động lực chính",
      startPoint: [1200, 3200, 2900],
      endPoint: [15400, 3200, 2900],
      lengthMm: 14200,
      sectionDimensions: "400 x 100 mm",
      insulationMm: 0,
      elevationBopMm: 2800,
      corridorTier: "Tier 2 (Điện)",
      combineStatus: "verified",
      soffitClearanceMm: 450,
    },
    {
      id: "R-CHILL-01",
      system: "WATER",
      name: "Cặp ống nước lạnh Chiller Supply/Return DN150",
      startPoint: [1200, 3800, 2600],
      endPoint: [15400, 3800, 2600],
      lengthMm: 14200,
      sectionDimensions: "Ø168 mm (DN150)",
      insulationMm: 32,
      elevationBopMm: 2368,
      corridorTier: "Tier 3 (Nước)",
      combineStatus: "clean",
      soffitClearanceMm: 600,
    },
    {
      id: "R-DRAIN-01",
      system: "WATER",
      name: "Ống thoát nước thải sinh hoạt dốc 1.5%",
      startPoint: [1200, 4200, 2550],
      endPoint: [15400, 4200, 2337],
      lengthMm: 14200,
      sectionDimensions: "Ø114 mm (uPVC)",
      insulationMm: 0,
      elevationBopMm: 2223,
      corridorTier: "Tier 3 (Nước)",
      combineStatus: "clash_risk",
      soffitClearanceMm: 150,
    },
  ]);

  // 6. AutoLISP Generator States
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

  // CAD Diff Runner
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

  // Block Catalogs Fetcher
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

  // LISP Generator
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

  // Font Doctor Convert
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
    runDiffAnalysis();
    handleGenerateLisp();
    fetchBlockCatalogs();
  }, [runDiffAnalysis, handleGenerateLisp, fetchBlockCatalogs]);

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

  const filteredLayers = layerRules.filter((r) => {
    const matchDisc =
      selectedDisciplineFilter === "all" || r.discipline === selectedDisciplineFilter;
    const matchSearch =
      r.originalLayer.toLowerCase().includes(layerSearch.toLowerCase()) ||
      r.standardLayer.toLowerCase().includes(layerSearch.toLowerCase()) ||
      r.description.toLowerCase().includes(layerSearch.toLowerCase());
    return matchDisc && matchSearch;
  });

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
                  CHUẨN HÓA BẢN VẼ (CAD → BIM)
                </span>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/20">
                  LOD 300–400 • TT AVIO
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 line-clamp-1">
                Chuẩn hóa Layer AIA, Sửa Font Tiếng Việt, Vector Diff, Dựng Khối 3D Chuẩn Bị Định
                Tuyến & Phối Hợp Combine
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
              <span>Xem Mô hình BIM</span>
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

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-5">
        {/* ── 5-STEP PIPELINE BANNER: CAD TO BIM STANDARDIZATION WORKFLOW ── */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Quy Trình Chuẩn Hóa Bản Vẽ Thiết Kế Sẵn Sàng Dựng BIM, Định Tuyến & Combine
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              Quy chuẩn BS1192 / AIA / TT 12/2021/TT-BXD
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-1">
            <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <div className="flex items-center gap-1.5 text-sky-400 text-xs font-bold">
                <span className="w-4 h-4 rounded-full bg-sky-500/20 flex items-center justify-center text-[10px]">
                  1
                </span>
                <span>Chẩn Đoán Dị Tật</span>
              </div>
              <p className="text-[11px] text-zinc-400 line-clamp-2">
                Quét lỗi font .shx, layer rác, tỷ lệ scale sai lệch
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                <span className="w-4 h-4 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px]">
                  2
                </span>
                <span>Chuẩn Hóa Layer</span>
              </div>
              <p className="text-[11px] text-zinc-400 line-clamp-2">
                Quy chuẩn AIA/BS1192 cho 5 phân hệ MEPF
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">
                  3
                </span>
                <span>Font Doctor UTF-8</span>
              </div>
              <p className="text-[11px] text-zinc-400 line-clamp-2">
                Chữa lành font SHX/VNI và bảo toàn text cao độ
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <div className="flex items-center gap-1.5 text-purple-400 text-xs font-bold">
                <span className="w-4 h-4 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px]">
                  4
                </span>
                <span>Trích Xuất Block</span>
              </div>
              <p className="text-[11px] text-zinc-400 line-clamp-2">
                Bóc tách tag, tọa độ và ánh xạ sang BIM Family
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-amber-500/30 bg-amber-500/5 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold">
                <span className="w-4 h-4 rounded-full bg-amber-500/30 flex items-center justify-center text-[10px]">
                  5
                </span>
                <span>Định Tuyến & Combine</span>
              </div>
              <p className="text-[11px] text-zinc-300 line-clamp-2">
                Dựng khối 3D AABB, phân tầng hành lang và né xung đột
              </p>
            </div>
          </div>
        </div>

        {/* ── TOOL NAVIGATION TABS ── */}
        <div className="p-2 sm:p-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab("spatial_bim")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                activeTab === "spatial_bim"
                  ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <Split className="w-3.5 h-3.5" />
              <span>1. Dựng Khối 3D & Định Tuyến Combine</span>
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
              <span>2. Chuẩn Hóa Layer AIA/BS1192</span>
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
              <span>3. Font Doctor (SHX/VNI → UTF-8)</span>
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
              <span>4. So Sánh Phiên Bản (Vector Diff)</span>
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
              <span>5. Trích Xuất Block sang Family BIM</span>
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
              <span>6. AutoLISP Sinh Chi Tiết CAD</span>
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: DỰNG KHỐI 3D & CHUẨN BỊ ĐỊNH TUYẾN / COMBINE (SPATIAL BIM)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "spatial_bim" && (
          <div className="space-y-5">
            {/* Header / Intro Card */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      <Split className="w-5 h-5" />
                    </span>
                    <h2 className="text-base font-bold text-zinc-100 uppercase tracking-tight">
                      Chuẩn Hóa Tuyến Centerline & Đùn Khối 3D Cho Định Tuyến & Combine
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Chuyển đổi đường tim polyline 2D từ bản vẽ thiết kế thành bao không gian 3D
                    Bounding Envelope (AABB). Thiết lập phân tầng hành lang kỹ thuật đa tầng
                    (Multi-Tier Corridor) và kiểm tra cao độ thông thủy trước khi import vào mô hình
                    BIM.
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

              {/* Invariants & Rules Checklist */}
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

            {/* Centerline Extrusion Table */}
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Danh Sách Tuyến Centerline Đã Chuẩn Hóa Sang Khối 3D Spatial Envelope
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
                      <th className="py-2.5 px-3">Tên Tuyến & Hệ Thống</th>
                      <th className="py-2.5 px-3">Tiết Diện</th>
                      <th className="py-2.5 px-3">Chiều Dài</th>
                      <th className="py-2.5 px-3">Cao Độ BOP</th>
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
                              <AlertTriangle className="w-3 h-3" /> Giao Cắt Dầm
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-sans font-semibold">
                              <Activity className="w-3 h-3" /> Chờ Phối Hợp
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

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: CHUẨN HÓA LAYER THEO TIÊU CHUẨN AIA / BS1192
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "layers" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    Bảng Quy Chuẩn Layer AIA/BS1192 Sang Mô Hình BIM MEPF
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Tự động lọc layer rác (PURGE), quy hoạch tên layer chuẩn, phân loại mã màu và
                    gán độ dày nét cho toàn bộ 5 phân hệ kỹ thuật.
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
                    onClick={() => {
                      showToast("Đã xuất kịch bản chuẩn hóa AutoCAD Script (.scr) thành công!");
                    }}
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
                      <th className="py-2.5 px-3">Layer Chuẩn Hóa BIM</th>
                      <th className="py-2.5 px-3">Mã Màu Chuẩn</th>
                      <th className="py-2.5 px-3">Nét Vẽ</th>
                      <th className="py-2.5 px-3">Mô Tả Chức Năng</th>
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
                        <td className="py-2.5 px-3 text-zinc-400 line-through">
                          {r.originalLayer}
                        </td>
                        <td className="py-2.5 px-3 text-emerald-400 font-bold">
                          {r.standardLayer}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-sans">
                            <span
                              className="w-3 h-3 rounded-full border border-zinc-700"
                              style={{ backgroundColor: r.colorCode }}
                            />
                            <span className="text-[11px] text-zinc-300">{r.colorName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">{r.lineWeight}</td>
                        <td className="py-2.5 px-3 font-sans text-zinc-400 text-[11px] max-w-xs truncate">
                          {r.description}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-sans font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Đã Khớp
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
            TAB 3: FONT DOCTOR (SHX / VNI / TCVN3 -> UNICODE UTF-8)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "font_doctor" && (
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
            TAB 4: SO SÁNH PHIÊN BẢN (VECTOR DIFF & REDLINE)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "diff" && (
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
                  {/* Summary Cards */}
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

                  {/* Potential VO Impact */}
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

                  {/* Differences Table */}
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
            TAB 5: TRÍCH XUẤT BLOCK SANG BIM FAMILY (BLOCK CATALOG)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "blocks" && (
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
                    xạ sang Revit BIM Family Components.
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
            TAB 6: TRÌNH SINH MÃ AUTOLISP & SCRIPT SHOPDRAWING
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "lisp" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Generator Configuration */}
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

                {/* Detail Category Selector */}
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

                {/* Dynamic Parameter Fields */}
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

              {/* Right Column: Code Viewer */}
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
          </div>
        )}
      </main>
    </div>
  );
}
