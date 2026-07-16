import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { runSync } from "@/lib/integrations/core";

export const dynamic = "force-dynamic";

// POST /api/integrations/:provider/sync — chạy đồng bộ tay cho provider trên dự án đang
// chọn. Admin/PM (viewIntegrations). Lỗi nghiệp vụ dự kiến (chưa bật/đang chạy/chưa đăng
// ký adapter) trả 422 kèm error, KHÔNG phải 500.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewIntegrations(user.role))
    return NextResponse.json({ error: "Không có quyền đồng bộ tích hợp" }, { status: 403 });

  const { provider } = await params;
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 422 });

  const summary = await runSync(provider, projectId);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 422 });
}
