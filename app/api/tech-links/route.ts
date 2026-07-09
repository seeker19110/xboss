import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  TECH_CATEGORIES,
  listTechLinks,
  parseTechLinkBody,
  validateTechLink,
  type TechCategory,
} from "@/lib/tech";

export const dynamic = "force-dynamic";

// GET /api/tech-links?category= — danh sách link công cụ ngoài, scoped theo dự án
// đang chọn (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const categoryRaw = req.nextUrl.searchParams.get("category")?.trim() || null;
  if (categoryRaw && !TECH_CATEGORIES.includes(categoryRaw as TechCategory))
    return NextResponse.json({ error: "Nhóm không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const links =
    projectId != null
      ? await listTechLinks(projectId, (categoryRaw as TechCategory) ?? undefined)
      : [];
  return NextResponse.json({ links });
}

// POST /api/tech-links — tạo link công cụ ngoài (Admin/PM). Gán project_id = dự án
// đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTech(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo link công nghệ (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo link" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseTechLinkBody(body);
  const invalid = validateTechLink(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO tech_links (project_id, category, title, url, embed, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.category,
    input.title,
    input.url,
    input.embed,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
