import { NextRequest, NextResponse } from "next/server";
import { query, insertId } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listSourcesFor, getSource, validateConfig } from "@/lib/reports";

export const dynamic = "force-dynamic";

// GET /api/saved-reports → báo cáo của tôi + báo cáo được chia sẻ (trong dự án đang chọn)
// + danh mục nguồn khả dụng theo vai trò (để form tạo mới dựng bộ lọc/cột).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  // Lọc theo dự án đang chọn để không lẫn báo cáo giữa các dự án; báo cáo project_id NULL
  // (danh mục chung) luôn hiện. Chỉ chủ sở hữu thấy báo cáo riêng của mình; shared → mọi ai.
  const reports = await query(
    `SELECT r.id, r.name, r.source, r.config, r.shared,
            r.owner_id AS "ownerId", u.name AS "ownerName", r.created_at AS "createdAt",
            (r.owner_id = ?) AS "isMine"
       FROM saved_reports r
       LEFT JOIN users u ON u.id = r.owner_id
      WHERE (r.project_id = ? OR r.project_id IS NULL)
        AND (r.owner_id = ? OR r.shared = TRUE)
      ORDER BY r.name`,
    user.id,
    projectId,
    user.id,
  );

  return NextResponse.json({ reports, sources: listSourcesFor(user.role) });
}

// POST /api/saved-reports { name, source, config?, shared? } → tạo báo cáo lưu.
// Mọi vai trò được tạo báo cáo của mình; nguồn tiền cần quyền xem tài chính.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const source = String(body?.source ?? "");
  if (!name) return NextResponse.json({ error: "Thiếu tên báo cáo" }, { status: 422 });

  const src = getSource(source);
  if (!src) return NextResponse.json({ error: "Nguồn báo cáo không hợp lệ" }, { status: 422 });
  if (!src.canView(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền dùng nguồn báo cáo này" },
      { status: 403 },
    );

  let config;
  try {
    config = validateConfig(source, body?.config ?? {});
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  const projectId = await getCurrentProjectId(user);
  const shared = body?.shared === true;
  const id = await insertId(
    `INSERT INTO saved_reports (project_id, owner_id, name, source, config, shared)
     VALUES (?, ?, ?, ?, ?, ?)`,
    projectId,
    user.id,
    name,
    source,
    JSON.stringify(config),
    shared,
  );

  return NextResponse.json({ id, name, source, config, shared }, { status: 201 });
}
