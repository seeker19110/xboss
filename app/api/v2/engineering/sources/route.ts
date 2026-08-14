import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createEngineeringSource,
  engineeringSourceInputSchema,
  listEngineeringSources,
} from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = Number(req.nextUrl.searchParams.get("projectId"));
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 400 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  return NextResponse.json({ items: await listEngineeringSources(projectId, limit) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const parsed = engineeringSourceInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu source không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }

  return NextResponse.json({ item: await createEngineeringSource(parsed.data, user.id) }, { status: 201 });
}
