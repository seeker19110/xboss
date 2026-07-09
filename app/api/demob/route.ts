import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listDemob, parseDemobBody, validateDemobInput } from "@/lib/handover";

export const dynamic = "force-dynamic";

// GET /api/demob — checklist giải thể công trường, scoped theo dự án đang chọn (M22).
// Xem: mọi vai trò đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const items = projectId != null ? await listDemob(projectId) : [];
  return NextResponse.json({ items });
}

// POST /api/demob — tạo hạng mục giải thể (manageHandover: Admin/PM/kỹ sư). Gán
// project_id = dự án đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hạng mục giải thể (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Chưa có dự án nào để tạo hạng mục giải thể" },
      {
        status: 422,
      },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseDemobBody(body);
  const invalid = validateDemobInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO demob_items (project_id, title, category, status, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    projectId,
    input.title,
    input.category,
    input.status,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
