// Kiểu dữ liệu và hằng số hiển thị cho mô hình BIM/3D — THUẦN, không chạm DB (tầng 0).
//
// Vì sao nằm ở lib/nen: trang `app/engineering/bim-viewer/page.tsx` là client component
// nên KHÔNG được import giá trị từ `lib/ky-thuat/engineering-bim-viewer.ts` — module đó
// import `@/lib/db`, kéo theo `pg` vào bundle trình duyệt. Trước đây trang tự khai lại
// toàn bộ kiểu và bảng màu; hai bản đã phân kỳ (bản trong trang rụng mất `path`,
// `BoundingBox3D` và chú thích liệt kê giá trị hợp lệ). Đặt ở tầng 0 để cả server lẫn
// client dùng CHUNG một bản.

// ── Hình học 3D dùng chung ────────────────────────────────────────────────────
// Trước đây khai trùng ở engineering-bim-viewer, engineering-generative-routing và
// engineering-spatial-wasm (giống hệt nhau).

export interface Point3D {
  x: number; // mm
  y: number; // mm
  z: number; // mm
}

export interface BoundingBox3D {
  min: [number, number, number]; // [x, y, z] mm
  max: [number, number, number]; // [x, y, z] mm
}

// ── Kiểu phần tử BIM ──────────────────────────────────────────────────────────

export interface MeshGeometry3D {
  vertices: number[];
  indices: number[];
  normals?: number[];
  color?: string;
  dimensions: {
    width?: number; // mm
    height?: number; // mm
    length?: number; // mm
    diameter?: number; // mm
  };
  path?: Point3D[]; // Tuyến tim ống/ống gió
}

export interface BimElementProperties {
  pset?: {
    airflow?: number; // m3/h
    velocity?: number; // m/s
    pressureDrop?: number; // Pa
    material?: string; // Tôn mạ kẽm Z80, Inox 304, PVC-U, PPR, Thép đen
    insulation?: string; // Aeroflex 19mm, Bông thủy tinh 50mm
    elevation?: number; // mm so với FFL sàn
    supplier?: string;
    specification?: string;
  };
  customFields?: Record<string, unknown>;
}

export interface BimElement {
  id: string;
  modelId: string;
  projectId: number;
  guid: string;
  elementType: string; // DUCT_STRAIGHT | DUCT_ELBOW | DUCT_TEE | PIPE_STRAIGHT | PIPE_VALVE | CABLE_TRAY | AIR_TERMINAL | EQUIPMENT | SLAB | BEAM
  systemType: string; // HVAC_SUPPLY | HVAC_RETURN | PLUMBING_WATER | PLUMBING_DRAINAGE | ELECTRICAL_POWER | FIRE_SPRINKLER
  name: string;
  geometryData: MeshGeometry3D;
  properties: BimElementProperties;
  wbsTaskId?: number | null;
  createdAt?: string;
}

export interface BimModel {
  id: string;
  projectId: number;
  name: string;
  discipline: "hvac" | "plumbing" | "electrical" | "firefighting" | "structure" | "combined";
  floorId?: number | null;
  format: "ifc" | "gltf" | "json_mesh";
  fileUrl?: string | null;
  fileHash?: string | null;
  elementCount: number;
  boundingBox: BoundingBox3D;
  metadata: Record<string, unknown>;
  createdBy?: number | null;
  createdAt?: string;
}

// ── Mô phỏng 4D ───────────────────────────────────────────────────────────────

export type Element4DVisualStatus =
  "not_started" | "in_progress" | "completed" | "approved" | "delayed";

export interface Element4DState {
  elementId: string;
  guid: string;
  wbsTaskId?: number | null;
  status: Element4DVisualStatus;
  progressPercent: number;
  colorHex: string;
  opacity: number;
  visible: boolean;
  highlightAlert?: boolean;
}

export interface SimulationTimeStepResult {
  targetDate: string;
  totalElements: number;
  countsByStatus: Record<Element4DVisualStatus, number>;
  overallProgressPercent: number;
  elements: Element4DState[];
}

// ── Bảng màu ──────────────────────────────────────────────────────────────────
// Đây là màu VẬT THỂ trong khung nhìn 3D (không phải màu giao diện), nên dùng mã hex
// cố định và KHÔNG đảo theo theme sáng/tối — mô hình phải giữ nguyên màu hệ thống MEP
// để kỹ sư nhận diện. Bảng này do server tính (gán vào `Element4DState.colorHex`) và
// client vẽ, nên bắt buộc chỉ có MỘT bản.

export const SYSTEM_DEFAULT_COLORS: Record<string, string> = {
  HVAC_SUPPLY: "#0284c7", // Xanh da trời
  HVAC_RETURN: "#f59e0b", // Hổ phách
  PLUMBING_WATER: "#06b6d4", // Xanh lơ
  PLUMBING_DRAINAGE: "#84cc16", // Xanh cốm
  ELECTRICAL_POWER: "#eab308", // Vàng
  FIRE_SPRINKLER: "#ef4444", // Đỏ
  STRUCTURE: "#64748b", // Xám đá
};

export const STATUS_4D_COLORS: Record<Element4DVisualStatus, string> = {
  not_started: "#3f3f46", // Zinc tối — phần tử "bóng ma" chưa thi công
  in_progress: "#38bdf8", // Xanh da trời sáng
  completed: "#34d399", // Xanh ngọc
  approved: "#10b981", // Xanh ngọc đậm — đã nghiệm thu
  delayed: "#f43f5e", // Đỏ hồng — cảnh báo trễ
};
