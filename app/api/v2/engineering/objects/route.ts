import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createEngineeringObject,
  listEngineeringObjects,
  engineeringObjectInputSchema,
} from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const rawProjectId = req.nextUrl.searchParams.get("projectId");
  const projectId = Number(rawProjectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 400 });
  }

  const objectType = req.nextUrl.searchParams.get("objectType") ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const items = await listEngineeringObjects(projectId, { objectType, limit });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const parsed = engineeringObjectInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu engineering object không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }

  const created = await createEngineeringObject(parsed.data, user.id);
  return NextResponse.json({ item: created }, { status: 201 });
}
