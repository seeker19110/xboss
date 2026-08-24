// M8 — Quét thư mục bản vẽ cục bộ (data/uploads/drawings) và đăng ký vào DB.
// Dùng chung cho route HTTP `POST /api/drawings/scan-local` và script CLI
// `npm run scan:drawings` — trước đây hai nơi copy-paste toàn bộ logic, bản
// script còn chèn sai tên cột nên chết ngay câu INSERT. Xem docs/nang-cap/G06-ban-ve-ho-so.md.
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { query, queryOne, run } from "@/lib/db";
import type { DrawingKind } from "@/lib/ky-thuat/drawings";

export const DRAWINGS_DIR = join(process.cwd(), "data", "uploads", "drawings");

/** Phần mở rộng được coi là bản vẽ; các đuôi tạm của AutoCAD bị loại. */
const DRAWING_EXTS = [".dwg", ".dxf", ".pdf", ".png", ".jpg", ".ifc"];
const IGNORED_SUFFIXES = [".dwl", ".dwl2", ".bak"];

const MIME_BY_EXT: Record<string, string> = {
  ".dwg": "image/vnd.dwg",
  ".dxf": "application/dxf",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ifc": "application/x-step",
};

export function mimeFromExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

export type DrawingFileInfo = {
  code: string;
  name: string;
  kind: DrawingKind;
  systemGroup: string;
  floorLabel: string;
  rev: string;
  ext: string;
};

/** Suy ra hệ/loại/tầng/revision từ tên tệp theo quy ước đặt tên của dự án. */
export function parseDrawingInfo(filename: string): DrawingFileInfo {
  const ext = extname(filename).toLowerCase();
  const nameWithoutExt = basename(filename, ext);
  const upper = nameWithoutExt.toUpperCase();

  // Hệ thống (System Group)
  let systemGroup = "HVAC";
  if (
    upper.includes("PLUMB") ||
    upper.includes("SAN") ||
    upper.includes("CAP_THOAT") ||
    upper.startsWith("P-") ||
    upper.includes("NUOC")
  ) {
    systemGroup = "PLUMBING";
  } else if (
    upper.includes("ELEC") ||
    upper.includes("DIEN") ||
    upper.startsWith("E-") ||
    upper.includes("TRAY")
  ) {
    systemGroup = "ELECTRICAL";
  } else if (
    upper.includes("FIRE") ||
    upper.includes("PCCC") ||
    upper.startsWith("F-") ||
    upper.includes("SPK")
  ) {
    systemGroup = "FIREFIGHTING";
  } else if (
    upper.includes("ARCH") ||
    upper.includes("KT") ||
    upper.startsWith("A-") ||
    upper.includes("KIEN_TRUC")
  ) {
    systemGroup = "ARCHITECTURE";
  } else if (
    upper.includes("STRUCT") ||
    upper.includes("KC") ||
    upper.startsWith("S-") ||
    upper.includes("KET_CAU")
  ) {
    systemGroup = "STRUCTURE";
  }

  // Loại bản vẽ (Kind)
  let kind: DrawingKind = "design";
  if (upper.includes("SHOP")) kind = "shop";
  else if (upper.includes("BIM") || ext === ".ifc" || ext === ".rvt" || ext === ".nwd")
    kind = "bim";
  else if (upper.includes("HOAN_CONG") || upper.includes("ASBUILT") || upper.includes("AS_BUILT"))
    kind = "asbuilt";
  else if (upper.includes("BPTC") || upper.includes("BIEN_PHAP")) kind = "method";

  // Tầng (Floor)
  let floorLabel = "Tầng Điển Hình";
  const floorMatch = upper.match(/FL(\d+)|TANG_?(\d+)|T(\d+)|HAM_?(\d+)|BASEMENT_?(\d+)/i);
  if (floorMatch) {
    const num = floorMatch[1] || floorMatch[2] || floorMatch[3];
    const basement = floorMatch[4] || floorMatch[5];
    if (basement) floorLabel = `Tầng Hầm ${basement}`;
    else if (num) floorLabel = `Tầng ${num}`;
  }

  // Revision
  let rev = "Rev A";
  const revMatch = upper.match(/REV[_\s-]?([A-Z0-9]+)|R([0-9]+)/i);
  if (revMatch) rev = `Rev ${revMatch[1] || revMatch[2]}`;

  return {
    code: nameWithoutExt
      .replace(/_REV.*$/i, "")
      .replace(/_R\d+$/i, "")
      .trim(),
    name: nameWithoutExt.replace(/_/g, " "),
    kind,
    systemGroup,
    floorLabel,
    rev,
    ext,
  };
}

export type ScannedDrawingFile = {
  fullPath: string;
  /** Đường dẫn tương đối so với DRAWINGS_DIR, luôn dùng dấu `/`. */
  relativePath: string;
  fileName: string;
};

/** Duyệt đệ quy thư mục bản vẽ; thư mục không đọc được thì bỏ qua, không ném lỗi. */
export function getAllDrawingFilesRecursively(dir: string): ScannedDrawingFile[] {
  const results: ScannedDrawingFile[] = [];
  if (!existsSync(dir)) return results;

  const stack: string[] = [""];
  while (stack.length > 0) {
    const currentRel = stack.pop()!;
    const currentFull = join(dir, currentRel);
    let entries;
    try {
      entries = readdirSync(currentFull, { withFileTypes: true });
    } catch {
      continue; // thư mục bị xoá/không có quyền — bỏ qua, quét tiếp phần còn lại
    }
    for (const entry of entries) {
      const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        stack.push(relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!DRAWING_EXTS.includes(ext)) continue;
      if (IGNORED_SUFFIXES.some((s) => entry.name.endsWith(s))) continue;
      results.push({
        fullPath: join(currentFull, entry.name),
        relativePath: relPath,
        fileName: entry.name,
      });
    }
  }
  return results;
}

export type ScanSyncResult = {
  totalFilesOnDisk: number;
  newlySyncedRevisions: number;
  /** Tên tệp bị lỗi khi đồng bộ — đã bỏ qua để không chặn các tệp còn lại. */
  failedFiles: string[];
};

export type ScanSyncOptions = {
  projectId: number;
  /** `users.id` ghi vào `drawings.created_by`/`drawing_revisions.uploaded_by`; null khi chạy CLI. */
  userId: number | null;
  /** Nhận log tiến trình (script CLI truyền `console.log`). */
  onProgress?: (message: string) => void;
};

/**
 * Quét `DRAWINGS_DIR` và đăng ký bản vẽ + revision chưa có vào DB.
 * Idempotent: chạy lại không tạo trùng (khoá theo `drawings.code` và
 * `drawing_revisions (drawing_id, rev)`).
 */
export async function syncDrawingsFromDisk(opts: ScanSyncOptions): Promise<ScanSyncResult> {
  const { projectId, userId, onProgress } = opts;
  const files = getAllDrawingFilesRecursively(DRAWINGS_DIR);
  const failedFiles: string[] = [];
  let synced = 0;

  for (const item of files) {
    try {
      const stat = statSync(item.fullPath);
      const info = parseDrawingInfo(item.fileName);

      let drawing = await queryOne<{ id: number }>(
        `SELECT id FROM drawings WHERE code = ? AND project_id = ?`,
        info.code,
        projectId,
      );

      if (!drawing) {
        // BOQCODE/`code` là duy nhất toàn hệ thống — bám vào bản ghi sẵn có nếu
        // mã đã thuộc dự án khác thay vì INSERT gây vi phạm ràng buộc unique.
        const existingByCode = await queryOne<{ id: number }>(
          `SELECT id FROM drawings WHERE code = ?`,
          info.code,
        );
        if (existingByCode) {
          drawing = existingByCode;
        } else {
          const res = await query<{ id: number }>(
            `INSERT INTO drawings (project_id, code, name, kind, system_group, floor_label, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
             RETURNING id`,
            projectId,
            info.code,
            info.name,
            info.kind,
            info.systemGroup,
            info.floorLabel,
            userId,
          );
          drawing = res[0];
          onProgress?.(
            `  + Đã tạo bản vẽ mới: [${info.code}] ${info.name} (${info.systemGroup}, ${info.floorLabel})`,
          );
        }
      }
      if (!drawing) continue;

      const existingRev = await queryOne<{ id: number }>(
        `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
        drawing.id,
        info.rev,
      );
      if (existingRev) continue;

      await run(
        `INSERT INTO drawing_revisions (
           drawing_id, rev, status, file_name, original_name, mime_type, size_bytes,
           submitted_at, decided_at, decision_note, uploaded_by, created_at
         ) VALUES (?, ?, 'approved', ?, ?, ?, ?, CURRENT_DATE, CURRENT_DATE, 'Đồng bộ tự động từ thư mục dự án', ?, NOW())`,
        drawing.id,
        info.rev,
        `drawings/${item.relativePath.replace(/\\/g, "/")}`,
        item.fileName,
        mimeFromExt(info.ext),
        stat.size,
        userId,
      );
      synced++;
      onProgress?.(
        `    -> Đã đăng ký phiên bản ${info.rev} (File: ${item.fileName}, Size: ${(stat.size / 1024).toFixed(1)} KB)`,
      );
    } catch (fileErr) {
      failedFiles.push(item.fileName);
      console.error(`Lỗi đồng bộ tệp ${item.fileName}:`, fileErr);
    }
  }

  return { totalFilesOnDisk: files.length, newlySyncedRevisions: synced, failedFiles };
}
