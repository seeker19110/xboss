import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEngineeringObject } from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const projectId = Number(req.nextUrl.searchParams.get("projectId"));
  const { id } = await context.params;
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 400 });
  }
  const item = await getEngineeringObject(projectId, id);
  if (!item) return NextResponse.json({ error: "Engineering object không tồn tại" }, { status: 404 });
  return NextResponse.json({ item });
}
