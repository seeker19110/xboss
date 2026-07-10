// M31 — Chuyển đổi số & Công nghệ: gom link công cụ ngoài (BIM viewer, P6/MS Project,
// camera/drone) + album ảnh mốc tiến độ (drone) + trạng thái hệ thống (dung lượng, sao
// lưu, phiên bản SW). Chủ yếu gom & nhúng — không tự xây camera/IoT/BIM engine.
// Xem docs/nang-cap/M31-chuyen-doi-so.md.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { query, queryOne } from "@/lib/db";
import { UPLOAD_DIR, dirSize, STORAGE_WARN_BYTES } from "@/lib/photos";

export const TECH_CATEGORIES = ["bim", "schedule", "camera", "drone", "other"] as const;
export type TechCategory = (typeof TECH_CATEGORIES)[number];
export const TECH_CATEGORY_LABEL: Record<TechCategory, string> = {
  bim: "BIM",
  schedule: "Phần mềm QLDA",
  camera: "Giám sát (camera)",
  drone: "Giám sát (flycam/drone)",
  other: "Khác",
};

// Whitelist host cho phép nhúng iframe (embed=true) — chống XSS/CSP qua iframe tuỳ
// tiện. Chỉ liệt kê domain BIM viewer/camera phổ biến hợp lý; công ty cần xác nhận/bổ
// sung domain thật (vd domain riêng của NCC camera/BIM đang dùng) trước khi bật embed
// cho các nhà cung cấp khác — quyết định ghi rõ trong PROGRESS.md.
export const EMBED_HOST_WHITELIST = [
  "viewer.autodesk.com", // Autodesk Platform Services (APS/Forge) BIM viewer
  "acc.autodesk.com", // Autodesk Construction Cloud
  "my.matterport.com", // Matterport 3D walkthrough (flycam/hiện trạng)
  "app.smartsheet.com", // một số dự án dùng thay P6/MS Project online
  "donghanhcungban.com", // Công ty — camera/BIM riêng
];

export type TechLinkRow = {
  id: number;
  projectId: number | null;
  category: TechCategory;
  title: string;
  url: string;
  embed: boolean;
  note: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

// Danh sách link công cụ ngoài — projectId undefined = không lọc dự án (test cũ/nội bộ).
export async function listTechLinks(
  projectId?: number,
  category?: TechCategory,
): Promise<TechLinkRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("l.project_id = ?");
    args.push(projectId);
  }
  if (category) {
    conds.push("l.category = ?");
    args.push(category);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<TechLinkRow>(
    `SELECT l.id, l.project_id AS "projectId", l.category, l.title, l.url, l.embed, l.note,
            l.created_by AS "createdBy", u.name AS "createdByName", l.created_at AS "createdAt"
       FROM tech_links l LEFT JOIN users u ON u.id = l.created_by
      ${where}
      ORDER BY l.category, l.id DESC`,
    ...args,
  );
}

export type TechLinkInput = {
  category: TechCategory;
  title: string;
  url: string;
  embed: boolean;
  note: string | null;
};

// Đọc body JSON thành TechLinkInput (POST dùng nguyên, PATCH merge với bản ghi cũ).
export function parseTechLinkBody(body: Record<string, unknown>): TechLinkInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    category: str(body.category) as TechCategory,
    title: str(body.title),
    url: str(body.url),
    embed: body.embed === true,
    note: strOrNull(body.note),
  };
}

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ.
// url phải bắt đầu https:// (bám pattern drawingUrl ở app/api/tasks/[id]/route.ts —
// chỉ chặt hơn: bắt buộc https, không nhận http:// trần, tránh nhúng nội dung mixed-content
// hoặc không mã hoá qua iframe). embed=true thì hostname phải nằm trong whitelist —
// không tự fallback embed=false, báo lỗi rõ để người dùng biết vì sao không nhúng được.
export function validateTechLink(input: TechLinkInput): string | null {
  if (!input.title.trim()) return "Thiếu tiêu đề link";
  if (!TECH_CATEGORIES.includes(input.category)) return "Nhóm không hợp lệ";
  const url = input.url.trim();
  if (!url) return "Thiếu URL";
  if (!/^https:\/\//i.test(url)) return "URL phải bắt đầu bằng https://";

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return "URL không hợp lệ";
  }

  if (input.embed && !EMBED_HOST_WHITELIST.includes(hostname))
    return `Không thể nhúng iframe cho domain "${hostname}" — chỉ hỗ trợ: ${EMBED_HOST_WHITELIST.join(", ")}. Bỏ chọn "Nhúng" để dùng link mở ngoài.`;

  return null;
}

export type ProgressAlbumRow = {
  id: number;
  projectId: number | null;
  milestoneLabel: string;
  capturedDate: string | null;
  note: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  photoCount: number;
};

// Danh sách album ảnh mốc tiến độ — kèm số ảnh (photoCount). projectId undefined =
// không lọc dự án (test cũ/nội bộ).
export async function listAlbums(projectId?: number): Promise<ProgressAlbumRow[]> {
  const where = projectId != null ? "WHERE a.project_id = ?" : "";
  const args = projectId != null ? [projectId] : [];
  return query<ProgressAlbumRow>(
    `SELECT a.id, a.project_id AS "projectId", a.milestone_label AS "milestoneLabel",
            a.captured_date AS "capturedDate", a.note,
            a.created_by AS "createdBy", u.name AS "createdByName", a.created_at AS "createdAt",
            COUNT(p.id) AS "photoCount"
       FROM progress_albums a
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN task_photos p ON p.album_id = a.id
      ${where}
      GROUP BY a.id, u.name
      ORDER BY a.captured_date DESC NULLS LAST, a.id DESC`,
    ...args,
  );
}

export type AlbumPhotoRow = {
  id: number;
  albumId: number;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  caption: string | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
};

// Ảnh trong 1 album — dùng chung task_photos, lọc album_id.
export async function listAlbumPhotos(albumId: number): Promise<AlbumPhotoRow[]> {
  return query<AlbumPhotoRow>(
    `SELECT p.id, p.album_id AS "albumId", p.original_name AS "originalName",
            p.mime_type AS "mimeType", p.size_bytes AS "sizeBytes", p.caption,
            p.uploaded_by AS "uploadedBy", u.name AS "uploaderName", p.created_at AS "createdAt"
       FROM task_photos p LEFT JOIN users u ON u.id = p.uploaded_by
      WHERE p.album_id = ?
      ORDER BY p.id DESC`,
    albumId,
  );
}

export type AlbumInput = {
  milestoneLabel: string;
  capturedDate: string | null;
  note: string | null;
};

export function parseAlbumBody(body: Record<string, unknown>): AlbumInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    milestoneLabel: str(body.milestoneLabel),
    capturedDate: strOrNull(body.capturedDate),
    note: strOrNull(body.note),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateAlbumInput(input: AlbumInput): string | null {
  if (!input.milestoneLabel.trim()) return "Thiếu tên mốc";
  if (input.capturedDate != null && !DATE_RE.test(input.capturedDate))
    return "Ngày chụp không đúng định dạng YYYY-MM-DD";
  return null;
}

export type SystemStatus = {
  storage: { bytes: number; files: number; warnBytes: number; warn: boolean };
  techLinkCount: number;
  albumCount: number;
  swCacheVersion: string | null;
};

// Trạng thái hệ thống (chỉ Admin xem — kiểm quyền ở route) — tái dùng logic dung lượng
// của GET /api/admin/storage (lib/photos.dirSize/STORAGE_WARN_BYTES) thay vì viết lại.
export async function systemStatus(): Promise<SystemStatus> {
  const [{ bytes, files }, linkCountRow, albumCountRow, swCacheVersion] = await Promise.all([
    dirSize(UPLOAD_DIR),
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM tech_links`),
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM progress_albums`),
    readSwCacheVersion(),
  ]);
  return {
    storage: { bytes, files, warnBytes: STORAGE_WARN_BYTES, warn: bytes >= STORAGE_WARN_BYTES },
    techLinkCount: Number(linkCountRow?.n ?? 0),
    albumCount: Number(albumCountRow?.n ?? 0),
    swCacheVersion,
  };
}

// Đọc phiên bản cache hiện tại của service worker (const CACHE = "xboss-vN") từ
// public/sw.js — chỉ đọc, không sửa; null nếu không đọc được (vd môi trường build khác).
async function readSwCacheVersion(): Promise<string | null> {
  try {
    const content = await readFile(join(process.cwd(), "public", "sw.js"), "utf-8");
    const m = content.match(/const\s+CACHE\s*=\s*["']([^"']+)["']/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
