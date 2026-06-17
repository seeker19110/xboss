import { NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/project → tên/mã dự án + tháp đầu tiên + tiêu đề heatmap.
// Public (chỉ trả tên hiển thị) — dùng cho header, trang login, báo cáo.
export async function GET() {
  try {
    const project = await queryOne<{ name: string; code: string | null; heatmap_title: string | null; investor: string | null; contractor: string | null; logo: string | null }>(
      `SELECT name, code, heatmap_title, investor, contractor, logo FROM projects ORDER BY id LIMIT 1`);
    const tower = await queryOne<{ name: string }>(`SELECT name FROM towers ORDER BY id LIMIT 1`);
    return NextResponse.json({
      name: project?.name ?? null,
      code: project?.code ?? null,
      tower: tower?.name ?? null,
      investor: project?.investor ?? null,
      contractor: project?.contractor ?? null,
      logo: project?.logo ?? null,
      project: { heatmapTitle: project?.heatmap_title ?? null },
    });
  } catch {
    return NextResponse.json({ name: null, code: null, tower: null, project: null });
  }
}

// PATCH /api/project — cập nhật tiêu đề heatmap (Admin/PM).
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "pm")
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const body = await req.json();

  // Cập nhật logo (data URL ảnh, tối đa ~2MB) — gửi chuỗi rỗng/null để xoá.
  if (body.logo !== undefined) {
    const logo: string | null = body.logo ? String(body.logo) : null;
    if (logo && (!/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/.test(logo) || logo.length > 2_800_000))
      return NextResponse.json({ error: "Logo không hợp lệ (chỉ nhận ảnh ≤ 2MB)" }, { status: 400 });
    await run(
      `UPDATE projects SET logo = ? WHERE id = (SELECT id FROM projects ORDER BY id LIMIT 1)`,
      logo
    );
    return NextResponse.json({ ok: true });
  }

  const { heatmapTitle } = body;
  await run(
    `UPDATE projects SET heatmap_title = ? WHERE id = (SELECT id FROM projects ORDER BY id LIMIT 1)`,
    heatmapTitle ?? null
  );
  return NextResponse.json({ ok: true });
}
