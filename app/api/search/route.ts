import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { ftsExpr, searchSources, type DocHit } from "@/lib/search";

export const dynamic = "force-dynamic";

// SHAPE CŨ — KHÔNG đổi field (client GlobalSearch + grep phụ thuộc).
export type SearchHit = {
  kind: "task" | "package";
  id: number;
  code: string;
  name: string;
  boqCode: string | null;
  status: string | null;
  progress: number;
  floorLabel: string | null;
  sheetType: string;
  sheetSlug: string | null;
};

// GET /api/search?q= → tìm task + nhóm (shape SearchHit cũ) + các nguồn kho hồ sơ
// (hợp đồng/công văn/họp/nhật ký/NCR/vật tư/bản vẽ/tài liệu/bình luận — shape DocHit,
// khai báo trong lib/search.ts, tự lọc quyền + project scope + soft-delete).
//
// Chiến lược (M57 PR1 — FTS có index, unaccent bỏ dấu 2 phía):
//   - code / boq_code / mã hệ: prefix match lower(...) LIKE 'term%' — B-tree index,
//     GIỮ NGUYÊN (FTS tách token kém với mã kiểu "A1,03").
//   - name (task/nhóm): FTS index GIN biểu thức unaccent (ftsExpr) → "nghiem thu"
//     khớp "nghiệm thu". Dùng ĐÚNG index idx_tasks_fts_ua/idx_wp_fts_ua (0064_fts).
// Mọi vai trò tìm thấy toàn bộ task/nhóm (giống lưới tracking). Nguồn kho hồ sơ lọc
// quyền theo registry (contracts chỉ PAYMENT_VIEW_ROLES).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const prefix = `${q.toLowerCase()}%`;
  // plainto_tsquery chấp nhận chuỗi tự do; bỏ ký tự đặc biệt để không sinh token rác.
  const ftsQuery = q.replace(/[^\p{L}\p{N}\s]/gu, " ").trim() || q;

  // Dự án đang chọn — lọc kết quả để tránh rò rỉ chéo dự án (M22+). null = DB chưa có
  // project nào → giữ hành vi không lọc (tương thích ngược).
  const projectId = await getCurrentProjectId(user);
  const projectJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const projectParam = projectId != null ? [projectId] : [];

  const taskFts = ftsExpr(["t.code", "t.boq_code", "t.name"]);
  const wpFts = ftsExpr(["wp.code", "wp.boq_code", "wp.name"]);

  const [tasks, packages, docs] = await Promise.all([
    query<SearchHit>(
      `SELECT 'task' AS kind, t.id, t.code, t.name, t.boq_code AS "boqCode",
              t.status, t.progress_percent AS progress,
              wp.floor_label AS "floorLabel", st.code AS "sheetType", st.slug AS "sheetSlug"
         FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         LEFT JOIN systems sys ON sys.id = st.system_id${projectJoin}
        WHERE (lower(t.code) LIKE ?
           OR lower(t.boq_code) LIKE ?
           OR ${taskFts} @@ plainto_tsquery('simple', xboss_unaccent(?))
           OR lower(sys.code) LIKE ?
           OR lower(sys.name) LIKE ?)${projectFilter}
        ORDER BY st.id, t.code LIMIT 15`,
      prefix,
      prefix,
      ftsQuery,
      prefix,
      prefix,
      ...projectParam,
    ),

    query<SearchHit>(
      `SELECT 'package' AS kind, wp.id, wp.code, wp.name, wp.boq_code AS "boqCode",
              wp.status, wp.progress, wp.floor_label AS "floorLabel",
              st.code AS "sheetType", st.slug AS "sheetSlug"
         FROM work_packages wp
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         LEFT JOIN systems sys ON sys.id = st.system_id${projectJoin}
        WHERE (lower(wp.code) LIKE ?
           OR lower(wp.boq_code) LIKE ?
           OR ${wpFts} @@ plainto_tsquery('simple', xboss_unaccent(?))
           OR lower(sys.code) LIKE ?
           OR lower(sys.name) LIKE ?)${projectFilter}
        ORDER BY st.id, wp.code LIMIT 10`,
      prefix,
      prefix,
      ftsQuery,
      prefix,
      prefix,
      ...projectParam,
    ),

    searchSources(user.role, projectId, ftsQuery, prefix),
  ]);

  const hits: (SearchHit | DocHit)[] = [...packages, ...tasks, ...docs];
  return NextResponse.json({ hits });
}
