import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getEngineeringObject } from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Không có project context hợp lệ" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id là bắt buộc" }, { status: 400 });
  const item = await getEngineeringObject(projectId, id);
  if (!item) return NextResponse.json({ error: "Engineering object không tồn tại" }, { status: 404 });
  return NextResponse.json({ item });
}
