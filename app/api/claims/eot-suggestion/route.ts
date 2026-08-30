import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { eotEvidenceSuggestion } from "@/lib/tai-chinh/claims";

export const dynamic = "force-dynamic";

// GET /api/claims/eot-suggestion — gợi ý số ngày EOT khi tạo claim kind='eot' (tái dùng
// số ngày chờ mặt bằng luỹ kế của lib/constructionStages.ts, xem lib/claims.ts:eotEvidenceSuggestion).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewClaims(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem claim" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const suggestion = await eotEvidenceSuggestion(projectId);
  return NextResponse.json(suggestion);
}
