import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// Kho text tuỳ chỉnh của giao diện (nhãn, tiêu đề...) — admin sửa inline.
// Lưu dạng JSON { key: value } trong cột projects.ui_texts của DỰ ÁN ĐANG CHỌN (S02: trước
// đây khoá cứng "dự án đầu tiên theo id" toàn hệ — admin tổ chức khác đọc/ghi được text của
// dự án tổ chức khác).

// GET /api/ui-texts → { texts: Record<string,string> }
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // GET và PATCH cùng nhắm 1 dòng: dự án đang chọn (đã đối chiếu org trong getCurrentProjectId).
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ texts: {} });
  const row = await queryOne<{ ui_texts: string | null }>(
    `SELECT ui_texts FROM projects WHERE id = ? AND org_id = ?`,
    projectId,
    user.orgId,
  );
  let texts: Record<string, string> = {};
  try {
    texts = JSON.parse(row?.ui_texts ?? "{}") ?? {};
  } catch {
    /* dùng mặc định */
  }
  return NextResponse.json({ texts });
}

// PATCH /api/ui-texts  body: { key: string, value: string } (chỉ Admin)
// value rỗng = đặt lại mặc định (xoá override).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin được sửa text giao diện" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!key) return NextResponse.json({ error: "Thiếu key" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const row =
    projectId == null
      ? undefined
      : await queryOne<{ ui_texts: string | null }>(
          `SELECT ui_texts FROM projects WHERE id = ? AND org_id = ?`,
          projectId,
          user.orgId,
        );
  if (!row) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
  let texts: Record<string, string> = {};
  try {
    texts = JSON.parse(row.ui_texts ?? "{}") ?? {};
  } catch {
    /* reset */
  }

  if (value) texts[key] = value;
  else delete texts[key];

  await run(
    `UPDATE projects SET ui_texts = ? WHERE id = ? AND org_id = ?`,
    JSON.stringify(texts),
    projectId,
    user.orgId,
  );
  return NextResponse.json({ ok: true, texts });
}
