import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createEngineeringRelation,
  engineeringRelationInputSchema,
  getEngineeringRelations,
} from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const projectId = Number(req.nextUrl.searchParams.get("projectId"));
  const objectId = req.nextUrl.searchParams.get("objectId");
  if (!Number.isInteger(projectId) || projectId <= 0 || !objectId) {
    return NextResponse.json({ error: "projectId/objectId không hợp lệ" }, { status: 400 });
  }
  return NextResponse.json({ items: await getEngineeringRelations(projectId, objectId) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const parsed = engineeringRelationInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu relation không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json({ item: await createEngineeringRelation(parsed.data, user.id) }, { status: 201 });
}
