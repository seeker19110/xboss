import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getSuggestion } from "@/lib/engineering-intel";

export const dynamic = "force-dynamic";

// GET /api/engineering/suggestions/:id — chi tiết đề xuất + toàn bộ evidence (phân biệt 4
// loại fact/inference/assumption/recommendation, §4 evidence-first). Admin/PM/Kỹ sư.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringSuggestions(user.role))
    return NextResponse.json({ error: "Không có quyền xem đề xuất kỹ thuật" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const { id } = await params;
  const found = await getSuggestion(projectId, id);
  if (!found) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });

  return NextResponse.json(found);
}
