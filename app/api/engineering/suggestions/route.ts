import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listSuggestions } from "@/lib/engineering-intel";

export const dynamic = "force-dynamic";

// GET /api/engineering/suggestions?status=&class=&priority=&objectId= — danh sách đề xuất
// kỹ thuật của dự án đang chọn, đã sắp theo ranking §3 trong SQL (ENG-2 mục 4.2).
// Admin/PM/Kỹ sư xem được.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringSuggestions(user.role))
    return NextResponse.json({ error: "Không có quyền xem đề xuất kỹ thuật" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ suggestions: [] });

  const sp = new URL(req.url).searchParams;
  const suggestions = await listSuggestions(projectId, {
    status: sp.get("status") || undefined,
    suggestionClass: sp.get("class") || undefined,
    priority: sp.get("priority") || undefined,
    objectId: sp.get("objectId") || undefined,
  });
  return NextResponse.json({ suggestions });
}
