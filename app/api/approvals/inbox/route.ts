import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import { pendingForUserDisplay } from "@/lib/approvals";

export const dynamic = "force-dynamic";

// GET /api/approvals/inbox — hộp thư "chờ tôi duyệt" hợp nhất (M46 PR3): mọi entity_type
// (variation/payment_cert/proposal/task_acceptance) có approval_request đang chờ bước
// thuộc vai trò user hiện tại (admin thấy mọi bước, SoD loại request do chính user tạo).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("field", projectId);
  if (blocked) return blocked;

  const items = projectId != null ? await pendingForUserDisplay(user, projectId) : [];
  return NextResponse.json({ items });
}
