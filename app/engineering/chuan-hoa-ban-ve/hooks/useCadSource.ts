"use client";

import { useCallback, useRef, useState } from "react";
import { showToast } from "@/app/components/Toast";
import { redirectToLogin } from "@/app/lib/me";
import {
  parseDxf,
  DwgUnsupportedError,
  DWG_UNSUPPORTED_MESSAGE,
  exportDxf,
  DxfParseResult,
  DxfLayerInfo,
  resolveXrefDependencies,
  bindXrefToMaster,
} from "@/lib/cad/dxf-parser";
import type {
  ConversionInfo,
  DrawingOption,
  FolderFileItem,
  FolderFilter,
  RunDxfAnalysisOptions,
  SourceMode,
} from "../types";

// Chuyển ArrayBuffer sang base64 theo từng khối nhỏ để không tràn ngăn xếp với tệp lớn.
function safeArrayBufferToBase64(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 16384;
    for (let i = 0; i < len; i += chunkSize) {
      const end = Math.min(i + chunkSize, len);
      const chunk = bytes.subarray(i, end);
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    return btoa(binary);
  } catch {
    return "";
  }
}

interface UseCadSourceOptions {
  // Khởi tạo lại bảng hiển thị layer ngay khi parse xong bản vẽ từ máy chủ.
  onLayersParsed: (layers: DxfLayerInfo[]) => void;
}

// Nguồn bản vẽ đầu vào: chọn từ thư viện thiết kế, tải lên tệp đơn hoặc cả thư
// mục kèm XREF — kèm luôn model DXF đã parse dùng chung cho mọi bước sau.
export function useCadSource({ onLayersParsed }: UseCadSourceOptions) {
  // ── Nguồn: [design] thư viện bản vẽ · [upload] tệp đơn · [folder] cả thư mục kèm XREF ──
  const [sourceMode, setSourceMode] = useState<SourceMode>("design");
  const [designDrawings, setDesignDrawings] = useState<DrawingOption[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // ── Cây thư mục 2 cột duyệt bản vẽ thiết kế (drawings/[systems]/...) ──
  const [explorerCategory, setExplorerCategory] = useState<string>("all");
  const [expandedSystems, setExpandedSystems] = useState<string[]>([
    "HVAC",
    "PLUMBING",
    "ELECTRICAL",
    "FIREFIGHTING",
    "ELV",
  ]);
  const [drawingSearchQuery, setDrawingSearchQuery] = useState("");

  // ── Tải lên cả thư mục & XREF ──
  const [folderFiles, setFolderFiles] = useState<FolderFileItem[]>([]);
  const [folderName, setFolderName] = useState<string>("");
  const [selectedFolderFile, setSelectedFolderFile] = useState<string>("");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const rawFolderFilesRef = useRef<Map<string, File>>(new Map());

  const [loading, setLoading] = useState(false);

  // ── Model DXF đã parse ──
  const [dxfData, setDxfData] = useState<DxfParseResult | null>(null);
  const [scrScript, setScrScript] = useState<string>("");
  const [conversionInfo, setConversionInfo] = useState<ConversionInfo | null>(null);

  const toggleSystemExpand = (sys: string) => {
    setExpandedSystems((prev) =>
      prev.includes(sys) ? prev.filter((s) => s !== sys) : [...prev, sys],
    );
  };

  const allDrawingsList = designDrawings;

  const filteredExplorerDrawings = allDrawingsList.filter((d) => {
    let matchCat = true;
    if (explorerCategory === "all") {
      matchCat = true;
    } else if (explorerCategory.includes("/")) {
      const parts = explorerCategory.split("/");
      const sys = parts[0];
      const kind = parts[1];
      const sub = parts[2];

      if (kind === "design") {
        matchCat =
          d.systemGroup === sys &&
          d.kind === "design" &&
          (sub ? (d.subFolder || "origin") === sub : true);
      } else {
        matchCat = d.systemGroup === sys && d.kind === kind;
      }
    } else {
      // Chỉ lọc theo tên hệ
      matchCat = d.systemGroup === explorerCategory;
    }

    const matchSearch =
      !drawingSearchQuery ||
      d.code.toLowerCase().includes(drawingSearchQuery.toLowerCase()) ||
      d.name.toLowerCase().includes(drawingSearchQuery.toLowerCase()) ||
      (d.floorLabel && d.floorLabel.toLowerCase().includes(drawingSearchQuery.toLowerCase())) ||
      (d.systemGroup && d.systemGroup.toLowerCase().includes(drawingSearchQuery.toLowerCase()));

    return matchCat && matchSearch;
  });

  // ── Parse DXF/DWG qua API (fallback parse thẳng ở client) ──
  const runDxfAnalysis = useCallback(
    async (options?: RunDxfAnalysisOptions) => {
      // Không gọi API nếu không có nguồn dữ liệu bản vẽ thật
      const hasDrawingId = options?.drawingId ?? selectedDrawingId;
      const hasUploadData = options?.fileBase64 || options?.customDxfContent || options?.filePath;
      if (!hasDrawingId && !hasUploadData && !options?.name) {
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/engineering/cad/parse-dxf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            drawingId:
              options?.drawingId ??
              (options?.fileBase64 || options?.customDxfContent || options?.filePath
                ? null
                : selectedDrawingId),
            dxfContent: options?.customDxfContent,
            fileBase64: options?.fileBase64,
            filePath: options?.filePath,
            fileName: options?.name || uploadedFileName || "drawing.dxf",
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

            // Khởi tạo trạng thái hiển thị layer dựa trên layer thật trong bản vẽ
            if (json.data.layers && json.data.layers.length > 0) {
              onLayersParsed(json.data.layers as DxfLayerInfo[]);
            }
          }
        }
      } catch (e) {
        console.error("Parse DXF error:", e);
      } finally {
        setLoading(false);
      }
    },
    [selectedDrawingId, uploadedFileName, onLayersParsed],
  );

  // ── Nạp danh sách bản vẽ thiết kế của dự án ──
  const fetchDesignDrawings = useCallback(async () => {
    try {
      const res = await fetch("/api/drawings");
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (res.ok) {
        const d = await res.json();
        const list: DrawingOption[] = d.drawings || [];
        setDesignDrawings(list);
        if (list.length > 0) {
          if (!selectedDrawingId) {
            const firstDrawing = list[0];
            setSelectedDrawingId(firstDrawing.id);
            setUploadedFileName(`${firstDrawing.code}.dxf`);
            runDxfAnalysis({ drawingId: firstDrawing.id, name: `${firstDrawing.code}.dxf` });
          }
        } else {
          runDxfAnalysis({ name: "Ban_Ve_Mat_Bang_MEPF_2D.dxf" });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [selectedDrawingId, runDxfAnalysis]);

  // ── Đồng bộ toàn bộ bản vẽ từ máy chủ ──
  const handleSyncServerDrawings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/drawings/scan-local", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`✓ ${json.message || "Đã đồng bộ bản vẽ từ máy chủ"}`);
        await fetchDesignDrawings();
      } else {
        showToast(json.error || `Lỗi khi đồng bộ bản vẽ (${res.status})`);
      }
    } catch (err) {
      console.error(err);
      showToast("Lỗi kết nối máy chủ khi đồng bộ bản vẽ");
    } finally {
      setLoading(false);
    }
  };

  // ── Tải lên tệp đơn (.DXF / .DWG / .PDF) ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const isDwg = file.name.toLowerCase().endsWith(".dwg");
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    const dxfName = isDwg ? file.name.replace(/\.dwg$/i, ".dxf") : file.name;

    if (isDwg) {
      // XBoss không đọc DWG bằng TypeScript (ADR-0006/M99 PR0) — bịa hình học là rủi ro
      // đã xảy ra thật. Yêu cầu người dùng lưu sang DXF trong AutoCAD trước.
      showToast(DWG_UNSUPPORTED_MESSAGE);
      return;
    }

    if (isPdf) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        try {
          setLoading(true);
          const base64 = safeArrayBufferToBase64(arrayBuffer);
          if (base64) {
            await runDxfAnalysis({ fileBase64: base64, name: file.name });
          }
        } catch (err) {
          console.error("Local parse error:", err);
          showToast("Lỗi khi đọc file CAD");
        } finally {
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = (event.target?.result as string) || "";
        try {
          setLoading(true);
          const parsed = parseDxf(content, dxfName);
          setDxfData(parsed);

          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
          const exportedInitialDxf = exportDxf(parsed, { applyStandardLayers: true });

          setConversionInfo({
            originalFileName: file.name,
            dxfFileName: dxfName,
            dxfContent: exportedInitialDxf,
            entityCount: parsed.entities.length,
            convertedAt: timeStr,
          });

          showToast(
            `✓ Đã nạp và chuẩn hóa tệp DXF ${file.name} (${parsed.entities.length} thực thể)!`,
          );
          await runDxfAnalysis({ customDxfContent: content, name: dxfName });
        } catch (err) {
          console.error("Local parse error:", err);
          showToast("Lỗi khi đọc file CAD");
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    }
  };

  // ── Tải lên cả thư mục (kèm XREF, DWG, DXF, CTB) ──
  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      const items: FolderFileItem[] = [];
      const fileMap = new Map<string, File>();
      let detectedFolderName = "";

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        fileMap.set(f.name, f);
        const path = f.webkitRelativePath || f.name;
        const parts = path.split("/");
        if (parts.length > 1 && !detectedFolderName) {
          detectedFolderName = parts[0];
        }

        const nameLower = f.name.toLowerCase();
        const isDwg = nameLower.endsWith(".dwg");
        const isDxf = nameLower.endsWith(".dxf");
        const isCtb = nameLower.endsWith(".ctb");
        const isXref =
          nameLower.includes("xref") ||
          nameLower.includes("ref_") ||
          nameLower.startsWith("x_") ||
          path.toLowerCase().includes("/xref/") ||
          path.toLowerCase().includes("\\xref\\");

        if (isDwg || isDxf || isCtb) {
          items.push({
            id: `FILE-${i + 1}`,
            name: f.name,
            relativePath: path,
            sizeBytes: f.size,
            isDwg,
            isDxf,
            isCtb,
            isXref,
          });
        }
      }

      rawFolderFilesRef.current = fileMap;
      setFolderName(detectedFolderName || "Thư Mục Dự Án Bản Vẽ");
      setFolderFiles(items);

      // Tự chọn bản vẽ MEPF master đầu tiên nếu có
      const masterCandidate =
        items.find(
          (it) =>
            !it.isXref &&
            (it.name.includes("-M-") || it.name.includes("HVAC") || it.name.includes("-A-M-")),
        ) ||
        items.find((it) => !it.isXref && (it.isDwg || it.isDxf)) ||
        items[0];

      if (masterCandidate) {
        setSelectedFolderFile(masterCandidate.name);
        setUploadedFileName(masterCandidate.name);
        const masterRealFile = fileMap.get(masterCandidate.name);

        if (masterRealFile) {
          if (masterCandidate.isDwg) {
            // XBoss không đọc DWG bằng TypeScript (ADR-0006/M99 PR0)
            showToast(DWG_UNSUPPORTED_MESSAGE);
          } else {
            const text = await masterRealFile.text();
            const localParsed = parseDxf(text, masterRealFile.name);
            const resolvedXrefs = resolveXrefDependencies(localParsed, items);
            setDxfData({ ...localParsed, xrefs: resolvedXrefs });
            await runDxfAnalysis({ customDxfContent: text, name: masterRealFile.name });
          }
        }

        showToast(
          `✓ Đã nạp thư mục "${detectedFolderName || "dự án"}" (${items.length} tệp tin CAD/XREF/CTB)!`,
        );
      }
    } catch (err) {
      console.error("Folder upload error:", err);
      showToast(
        err instanceof DwgUnsupportedError ? DWG_UNSUPPORTED_MESSAGE : "Lỗi khi đọc thư mục bản vẽ",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFolderDrawing = async (fileName: string) => {
    setSelectedFolderFile(fileName);
    setUploadedFileName(fileName);
    const targetFile = rawFolderFilesRef.current.get(fileName);
    const isDwg = fileName.toLowerCase().endsWith(".dwg");

    try {
      if (isDwg) {
        // XBoss không đọc DWG bằng TypeScript (ADR-0006/M99 PR0)
        showToast(DWG_UNSUPPORTED_MESSAGE);
        return;
      }
      if (targetFile) {
        const text = await targetFile.text();
        const localParsed = parseDxf(text, fileName);
        const resolvedXrefs = resolveXrefDependencies(localParsed, folderFiles);
        setDxfData({ ...localParsed, xrefs: resolvedXrefs });
        await runDxfAnalysis({ customDxfContent: text, name: fileName });
      } else {
        await runDxfAnalysis({ name: fileName });
      }
      showToast(`Đã chuyển sang bản vẽ Master: ${fileName}`);
    } catch (err) {
      console.error("Select folder drawing error:", err);
      showToast(
        err instanceof DwgUnsupportedError ? DWG_UNSUPPORTED_MESSAGE : "Lỗi khi đọc file CAD",
      );
    }
  };

  const handleToggleXrefBind = (xrefId: string) => {
    if (!dxfData) return;
    const updated = bindXrefToMaster(dxfData, xrefId);
    setDxfData(updated);
    const targetXref = updated.xrefs.find((x) => x.id === xrefId);
    if (targetXref?.isBound) {
      showToast(`✓ Đã GỘP (Bind) XREF "${targetXref.name}" trực tiếp vào cây layer Master!`);
    } else {
      showToast(`✓ Đã chuyển XREF "${targetXref?.name}" sang chế độ OVERLAY (Tham chiếu mờ 50%)!`);
    }
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

  return {
    sourceMode,
    setSourceMode,
    designDrawings,
    selectedDrawingId,
    setSelectedDrawingId,
    uploadedFileName,
    fileInputRef,
    folderInputRef,
    explorerCategory,
    setExplorerCategory,
    expandedSystems,
    drawingSearchQuery,
    setDrawingSearchQuery,
    toggleSystemExpand,
    allDrawingsList,
    filteredExplorerDrawings,
    folderFiles,
    folderName,
    selectedFolderFile,
    folderFilter,
    setFolderFilter,
    loading,
    dxfData,
    setDxfData,
    scrScript,
    conversionInfo,
    runDxfAnalysis,
    fetchDesignDrawings,
    handleSyncServerDrawings,
    handleFileUpload,
    handleFolderUpload,
    handleSelectFolderDrawing,
    handleToggleXrefBind,
    handleDownloadScr,
  };
}
