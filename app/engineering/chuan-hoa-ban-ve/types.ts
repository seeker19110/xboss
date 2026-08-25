import type { DxfLayerInfo } from "@/lib/ky-thuat/cad/dxf-parser";

// ── Kiểu dữ liệu dùng chung giữa trang chuẩn hóa bản vẽ và các panel con ──

export interface DrawingOption {
  id: number;
  code: string;
  name: string;
  kind: string;
  subFolder?: string;
  systemGroup: string | null;
  floorLabel: string | null;
  latestRev?: string | null;
}

export interface CadDiffItem {
  entityId: string;
  type: string;
  layer: string;
  diffStatus: "added" | "removed" | "modified" | "unchanged";
  changeDescription: string;
  location: [number, number, number];
}

export interface CadDiffResult {
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

export interface BlockCatalogItem {
  id?: string;
  block_name: string;
  discipline: string;
  category: string;
  attribute_schema: Record<string, unknown>;
  mapped_boq_code: string | null;
  mapped_material_id?: number | null;
}

export interface FolderFileItem {
  id: string;
  name: string;
  relativePath: string;
  sizeBytes: number;
  isDwg: boolean;
  isDxf: boolean;
  isCtb: boolean;
  isXref: boolean;
  content?: string;
}

// ── Nguồn bản vẽ đầu vào & điều hướng các bước ──

export type SourceMode = "design" | "upload" | "folder";

export type FolderFilter = "all" | "cad" | "xref" | "ctb";

export type Step1SubTab = "diagnostic_purge" | "layers_font" | "boq_dim_ctb" | "xref_diff";

export type Cad2dApprovalStatus = "in_progress" | "pending_approval" | "approved" | "rejected";

// ── Thông tin chuyển đổi tệp tải lên sang .DXF ──

export interface ConversionInfo {
  originalFileName: string;
  dxfFileName: string;
  dxfContent: string;
  entityCount: number;
  convertedAt: string;
}

// ── Bảng sửa tay (Manual Review & Override Studio) ──

export interface ManualLayerItem {
  id: string;
  name: string;
  standardName: string;
  discipline: DxfLayerInfo["discipline"];
  colorHex: string;
  entityCount: number;
}

export interface ManualTextItem {
  id: string;
  raw: string;
  decoded: string;
  edited: string;
  layer: string;
}

export interface ManualBlockItem {
  id: string;
  name: string;
  count: number;
  mappedBoqCode: string;
  customName: string;
}

// ── Dọn rác sâu, gốc tọa độ WCS 2D, Dim ảo & bảng nét in CTB ──

export interface PurgeState {
  isPurged: boolean;
  overlappingCount: number;
  zeroLengthCount: number;
  emptyLayersCount: number;
  anonymousBlocksCount: number;
  originalSizeMb: number;
  purgedSizeMb: number;
}

export interface WcsConfig {
  originX: number;
  originY: number;
  gridAxisReference: string;
  unit: "mm" | "m" | "inch";
  scale: "1:1" | "1:50" | "1:100";
  isAligned: boolean;
}

export interface DimOverrideItem {
  id: string;
  nominalText: string;
  actualMeasMm: number;
  isFake: boolean;
  fixed: boolean;
  location: string;
}

export interface CtbMapping {
  colorIndex: number;
  colorName: string;
  colorHex: string;
  lineweightMm: number;
  purpose: string;
  screeningPct: number;
}

// ── Đặt tên chuẩn ISO 19650 & lưu trữ dự án ──

export interface SaveConfig {
  projectCode: string;
  systems: string;
  workPackageCode: string;
  kind: "design" | "bim" | "shop" | "asbuilt";
  subFolder: "iso" | "origin";
  name: string;
  date: string;
  drawingVersions: string;
}

export interface SavedResult {
  standardFileName: string;
  relativeDirectory: string;
  fullUploadPath: string;
  drawingId?: number;
  revisionId?: number;
  drawingCode?: string;
  message?: string;
}

// ── Khung nhìn vector CAD 2D ──

export interface HoveredCadEntity {
  id: string;
  type: string;
  layer: string;
  details: string;
  isDefect?: boolean;
  defectReason?: string;
}

export interface FontSnippet {
  label: string;
  source: string;
  expected: string;
}

// ── Bộ nạp/parse bản vẽ dùng chung ──

// ── Đề xuất block vào thư viện từ AutoCAD (M103 — hàng chờ + duyệt) ──

export type BlockProposalKind = "fitting" | "equipment" | "titleblock" | "support" | "sleeve";

export type BlockProposalStatus = "pending" | "approved" | "rejected" | "stale" | "withdrawn";

export interface BlockProposal {
  id: number;
  blockName: string;
  kind: BlockProposalKind;
  kindNhan: string;
  systemId: string | null;
  takeoffItemId: string | null;
  paperSize: string | null;
  note: string | null;
  baseLibVersion: string;
  previewSvg: string | null;
  status: BlockProposalStatus;
  statusNhan: string;
  rejectReason: string | null;
  publishedVersion: string | null;
  nguoiDeXuat: string;
  /** id người gửi đề xuất — để panel biết đề xuất nào là của chính mình (server vẫn kiểm lại). */
  nguoiDeXuatId?: number;
  nguoiQuyetDinh: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface RunDxfAnalysisOptions {
  drawingId?: number | null;
  customDxfContent?: string;
  fileBase64?: string;
  filePath?: string;
  name?: string;
}

export type RunDxfAnalysis = (options?: RunDxfAnalysisOptions) => Promise<void>;
