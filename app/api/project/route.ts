import { NextResponse } from "next/server";
import { queryOne, run, withOrgScope } from "@/lib/db";
import { getCurrentUser, isAdminOrPm } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { strictMembershipEnabled } from "@/lib/nen/env";

export const dynamic = "force-dynamic";

/** Tổ chức mặc định (DEFAULT của projects.org_id) — chỉ cho fallback ẩn danh của trang /login. */
const TO_CHUC_MAC_DINH = 1;

// GET /api/project → tên/mã dự án + tháp đầu tiên + tiêu đề heatmap.
// Public (chỉ trả tên hiển thị) — dùng cho header, trang login, báo cáo.
// Có phiên + đã chọn dự án → đọc đúng dự án đang chọn (getCurrentProjectId đã tự đối chiếu
// quyền xem + org). Không phiên / chưa chọn dự án → giữ fallback công khai "dự án đầu tiên"
// (trang /login gọi route này khi chưa đăng nhập). Không nhận `?projectId=` để endpoint public
// không thành chỗ dò tên dự án theo id.
// Cờ XBOSS_STRICT_MEMBERSHIP bật (AUDIT-S16): user ĐÃ đăng nhập mà không thấy dự án nào → trả
// rỗng, không rơi về "dự án đầu tiên" của DB (có thể thuộc tổ chức khác). Cờ tắt: giữ hành vi cũ.
export async function GET() {
  try {
    const user = await getCurrentUser();
    const projectId = user ? await getCurrentProjectId(user) : null;
    if (user && projectId == null && strictMembershipEnabled())
      return NextResponse.json(
        {
          name: null,
          code: null,
          tower: null,
          investor: null,
          contractor: null,
          logo: null,
          project: { heatmapTitle: null },
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    type DongDuAn = {
      name: string;
      code: string | null;
      heatmap_title: string | null;
      investor: string | null;
      contractor: string | null;
      logo: string | null;
    };
    const project =
      projectId != null
        ? await queryOne<DongDuAn>(
            `SELECT name, code, heatmap_title, investor, contractor, logo FROM projects WHERE id = ?`,
            projectId,
          )
        : // S16 (RLS 0165): fallback "dự án đầu tiên" chỉ trong 1 tổ chức — của user nếu có
          // phiên, ẩn danh (trang /login) thì tổ chức mặc định 1 (DEFAULT của projects.org_id).
          // Không dùng '*' ở route công khai.
          await withOrgScope(user ? user.orgId : TO_CHUC_MAC_DINH, () =>
            queryOne<DongDuAn>(
              `SELECT name, code, heatmap_title, investor, contractor, logo FROM projects ORDER BY id LIMIT 1`,
            ),
          );
    const tower = await queryOne<{ name: string }>(`SELECT name FROM towers ORDER BY id LIMIT 1`);
    return NextResponse.json(
      {
        name: project?.name ?? null,
        code: project?.code ?? null,
        tower: tower?.name ?? null,
        investor: project?.investor ?? null,
        contractor: project?.contractor ?? null,
        logo: project?.logo ?? null,
        project: { heatmapTitle: project?.heatmap_title ?? null },
      },
      {
        headers: {
          // Thân phản hồi giờ PHỤ THUỘC PHIÊN (cookie dự án) ở nhánh có `projectId` — để nguyên
          // `public, s-maxage=60` thì CDN/proxy dùng chung có thể phục vụ tên/logo dự án của
          // user này cho user khác. App deploy sau CDN (Vercel) nên đây là rủi ro thật, không
          // phải lý thuyết. Chỉ nhánh fallback ẩn danh (dùng cho trang /login) mới cache được.
          "Cache-Control":
            projectId != null
              ? "private, no-store"
              : "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch {
    return NextResponse.json({ name: null, code: null, tower: null, project: null });
  }
}

// PATCH /api/project — cập nhật tiêu đề heatmap (Admin/PM).
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để cập nhật" }, { status: 422 });

  const body = await req.json();

  // Cập nhật logo (data URL ảnh, tối đa ~2MB) — gửi chuỗi rỗng/null để xoá.
  if (body.logo !== undefined) {
    const logo: string | null = body.logo ? String(body.logo) : null;
    if (
      logo &&
      (!/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/.test(logo) ||
        logo.length > 2_800_000)
    )
      return NextResponse.json(
        { error: "Logo không hợp lệ (chỉ nhận ảnh ≤ 2MB)" },
        { status: 400 },
      );
    await run(`UPDATE projects SET logo = ? WHERE id = ?`, logo, projectId);
    return NextResponse.json({ ok: true });
  }

  const { heatmapTitle } = body;
  await run(`UPDATE projects SET heatmap_title = ? WHERE id = ?`, heatmapTitle ?? null, projectId);
  return NextResponse.json({ ok: true });
}
