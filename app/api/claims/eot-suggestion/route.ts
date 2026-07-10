import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { eotEvidenceSuggestion } from "@/lib/claims";

export const dynamic = "force-dynamic";

// GET /api/claims/eot-suggestion — gợi ý số ngày EOT khi tạo claim kind='eot' (tái dùng
// số ngày chờ mặt bằng luỹ kế của lib/workfronts.ts, xem lib/claims.ts:eotEvidenceSuggestion).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewClaims(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem claim" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const suggestion = await eotEvidenceSuggestion(projectId);
  return NextResponse.json(suggestion);
}
