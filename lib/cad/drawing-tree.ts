// Cây thư mục quy chuẩn cho bản vẽ CAD (ISO 19650).
//
// Trước đây cấu trúc này chỉ tồn tại "tình cờ" trên máy đã từng lưu bản vẽ: route
// save-drawing chỉ mkdir đúng nhánh nó cần lúc ghi. Trên checkout sạch (CI, máy mới)
// cây không tồn tại — `drawings/` không được git track dòng nào và `data/uploads/`
// nằm trong .gitignore, nên không thể "commit thư mục rỗng" để bù. Helper này là
// nguồn duy nhất khai báo cấu trúc, được gọi lúc lưu bản vẽ và trong test.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

/** 5 phân hệ MEP/ACMV có thư mục bản vẽ riêng. */
export const DRAWING_SYSTEMS = ["HVAC", "PLUMBING", "ELECTRICAL", "FIREFIGHTING", "ELV"] as const;

/** Các nhóm con bắt buộc trong mỗi phân hệ (đường dẫn tương đối trong phân hệ đó). */
export const DRAWING_SUBDIRS = [
  join("design", "origin"),
  join("design", "iso"),
  "bim",
  "shop",
  "asbuilt",
  "temp",
] as const;

/** Hai gốc lưu bản vẽ: bản làm việc trong repo và bản upload ngoài git. */
export function drawingRoots(cwd: string = process.cwd()): string[] {
  return [join(cwd, "drawings"), join(cwd, "data", "uploads", "drawings")];
}

/**
 * Tạo đủ cây thư mục quy chuẩn dưới `baseDir` (idempotent — đã có thì bỏ qua).
 */
export function ensureDrawingTree(baseDir: string): void {
  for (const sys of DRAWING_SYSTEMS) {
    for (const sub of DRAWING_SUBDIRS) {
      mkdirSync(join(baseDir, sys, sub), { recursive: true });
    }
  }
}

/** Tạo cây quy chuẩn ở cả hai gốc lưu bản vẽ. */
export function ensureAllDrawingTrees(cwd: string = process.cwd()): void {
  for (const root of drawingRoots(cwd)) ensureDrawingTree(root);
}
