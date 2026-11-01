import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  searchSources,
  searchTasksAndPackages,
  type DocHit,
  type SearchHit,
} from "@/lib/tien-do/search";

export const dynamic = "force-dynamic";

// SHAPE CŨ — KHÔNG đổi field (client GlobalSearch + grep phụ thuộc); định nghĩa ở lib/tien-do/search.ts.
export type { SearchHit };

// GET /api/search?q= → tìm task + nhóm (shape SearchHit cũ) + các nguồn kho hồ sơ
// (hợp đồng/công văn/họp/nhật ký/NCR/vật tư/bản vẽ/tài liệu/bình luận — shape DocHit,
// khai báo trong lib/search.ts, tự lọc quyền + project scope + soft-delete).
//
// Chiến lược (M57 PR1 — FTS có index, unaccent bỏ dấu 2 phía):
//   - code / boq_code / mã hệ: prefix match lower(...) LIKE 'term%' — B-tree index,
//     GIỮ NGUYÊN (FTS tách token kém với mã kiểu "A1,03").
//   - name (task/nhóm): FTS index GIN biểu thức unaccent (ftsExpr) → "nghiem thu"
//     khớp "nghiệm thu". Dùng ĐÚNG index idx_tasks_fts_ua/idx_wp_fts_ua (0068_fts).
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

  // Dự án đang chọn — lọc kết quả vô điều kiện để tránh rò rỉ chéo dự án (M22+). Không có
  // dự án khả kiến (A1-AC02) → không có kết quả, không query nghiệp vụ.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ hits: [] });

  const [{ tasks, packages }, docs] = await Promise.all([
    searchTasksAndPackages(projectId, q),
    searchSources(user.role, projectId, ftsQuery, prefix),
  ]);

  const hits: (SearchHit | DocHit)[] = [...packages, ...tasks, ...docs];
  return NextResponse.json({ hits });
}
