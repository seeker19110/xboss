// Kho lưu bản vẽ CAD chuẩn hóa (trang /engineering/chuan-hoa-ban-ve).
// Quy chuẩn thư mục: mỗi phân hệ MEPF có 1 thư mục tạm `temp/` (bản chưa duyệt)
// + các thư mục chính thức `design/origin`, `design/iso`, `bim`, `shop`, `asbuilt`.
// Cây thư mục được dựng idempotent (mkdir recursive) nên gọi lại nhiều lần vô hại.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// 5 phân hệ MEPF — khớp danh sách hiển thị trên trang chuẩn hóa bản vẽ.
export const DRAWING_SYSTEMS = ["HVAC", "PLUMBING", "ELECTRICAL", "FIREFIGHTING", "ELV"] as const;

// Phân hệ ngoài MEPF vẫn nhận file (bản vẽ nền kiến trúc/kết cấu để tham chiếu),
// nhưng không nằm trong cây thư mục quy chuẩn dựng sẵn — thư mục tạo khi cần.
export const DRAWING_SYSTEMS_EXTRA = ["STRUCTURE", "ARCHITECTURE"] as const;
export const ALL_DRAWING_SYSTEMS: readonly string[] = [
  ...DRAWING_SYSTEMS,
  ...DRAWING_SYSTEMS_EXTRA,
];

// Loại bản vẽ hợp lệ cho luồng chuẩn hóa CAD (tập con của DRAWING_KINDS trong
// lib/drawings.ts — luồng này không sinh biện pháp thi công 'method').
export const CAD_DRAWING_KINDS = ["design", "bim", "shop", "asbuilt"] as const;
export type CadDrawingKind = (typeof CAD_DRAWING_KINDS)[number];

// Thư mục con của 'design' (bản gốc từ CĐT/TVTK vs bản đã chuẩn hóa theo ISO).
export const DESIGN_SUB_FOLDERS = ["origin", "iso"] as const;
export type DesignSubFolder = (typeof DESIGN_SUB_FOLDERS)[number];

// 2 gốc lưu trữ song song: `drawings/` (bản làm việc, kỹ sư mở trực tiếp bằng CAD)
// và `data/uploads/drawings/` (kho file của app, cùng chỗ với các upload khác).
export function drawingRoots(cwd: string = process.cwd()): string[] {
  return [join(cwd, "drawings"), join(cwd, "data", "uploads", "drawings")];
}

// Đường dẫn tương đối theo trạng thái duyệt: chưa duyệt → {systems}/temp,
// đã duyệt → vị trí chính thức theo loại bản vẽ.
export function drawingRelativePath(
  systems: string,
  kind: CadDrawingKind,
  subFolder: DesignSubFolder,
  isApproved: boolean,
): string {
  if (!isApproved) return join(systems, "temp");
  if (kind === "design") return join(systems, "design", subFolder);
  return join(systems, kind);
}

// Dựng đầy đủ cây thư mục quy chuẩn ở cả 2 gốc lưu trữ.
export function ensureDrawingDirs(cwd: string = process.cwd()): void {
  for (const root of drawingRoots(cwd)) {
    for (const sys of DRAWING_SYSTEMS) {
      mkdirSync(join(root, sys, "temp"), { recursive: true });
      for (const sub of DESIGN_SUB_FOLDERS) {
        mkdirSync(join(root, sys, "design", sub), { recursive: true });
      }
      for (const kind of CAD_DRAWING_KINDS) {
        if (kind === "design") continue;
        mkdirSync(join(root, sys, kind), { recursive: true });
      }
    }
  }
}
