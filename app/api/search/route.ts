import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

// GET /api/search?q= → tìm task + nhóm theo mã / BOQCODE / tên.
// Chiến lược tìm kiếm (không cần pg_trgm extension):
//   - code / boq_code: prefix match lower(code) LIKE 'term%' — dùng B-tree index
//   - name: plainto_tsquery('simple', ...) trên tsvector GIN index — built-in Postgres
// Mọi vai trò tìm thấy toàn bộ task/nhóm (giống lưới tracking — subcon cần ngữ cảnh
// tầng/nhóm xung quanh việc của mình, xem app/api/tasks/route.ts). Không lọc theo assigned_to.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const prefix = `${q.toLowerCase()}%`;
  // plainto_tsquery chấp nhận chuỗi tự do (không cần cú pháp đặc biệt).
  // Nếu chuỗi không sinh được token hợp lệ (vd: ký tự đặc biệt) thì trả rỗng — an toàn.
  const ftsQuery = q.replace(/[^\p{L}\p{N}\s]/gu, " ").trim() || q;

  const [tasks, packages] = await Promise.all([
    query<SearchHit>(
      `SELECT 'task' AS kind, t.id, t.code, t.name, t.boq_code AS "boqCode",
              t.status, t.progress_percent AS progress,
              wp.floor_label AS "floorLabel", st.code AS "sheetType", st.slug AS "sheetSlug"
         FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
        WHERE lower(t.code) LIKE ?
           OR lower(t.boq_code) LIKE ?
           OR to_tsvector('simple', coalesce(t.name, '')) @@ plainto_tsquery('simple', ?)
        ORDER BY st.id, t.code LIMIT 15`,
      prefix,
      prefix,
      ftsQuery,
    ),

    query<SearchHit>(
      `SELECT 'package' AS kind, wp.id, wp.code, wp.name, wp.boq_code AS "boqCode",
              wp.status, wp.progress, wp.floor_label AS "floorLabel",
              st.code AS "sheetType", st.slug AS "sheetSlug"
         FROM work_packages wp
         JOIN sheet_types st ON wp.sheet_type_id = st.id
        WHERE lower(wp.code) LIKE ?
           OR lower(wp.boq_code) LIKE ?
           OR to_tsvector('simple', coalesce(wp.name, '')) @@ plainto_tsquery('simple', ?)
        ORDER BY st.id, wp.code LIMIT 10`,
      prefix,
      prefix,
      ftsQuery,
    ),
  ]);

  return NextResponse.json({ hits: [...packages, ...tasks] });
}
