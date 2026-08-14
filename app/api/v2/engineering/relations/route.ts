import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  createEngineeringRelation,
  engineeringRelationInputSchema,
  getEngineeringRelations,
} from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

async function projectContext() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }) } as const;
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return { error: NextResponse.json({ error: "Không có project context hợp lệ" }, { status: 403 }) } as const;
  return { user, projectId } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await projectContext();
  if ("error" in ctx) return ctx.error;
  const objectId = req.nextUrl.searchParams.get("objectId");
  if (!objectId) return NextResponse.json({ error: "objectId không hợp lệ" }, { status: 400 });
  return NextResponse.json({ items: await getEngineeringRelations(ctx.projectId, objectId) });
}

export async function POST(req: NextRequest) {
  const ctx = await projectContext();
  if ("error" in ctx) return ctx.error;
  const parsed = engineeringRelationInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu relation không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.projectId !== ctx.projectId) {
    return NextResponse.json({ error: "projectId không khớp project context" }, { status: 400 });
  }
  return NextResponse.json({ item: await createEngineeringRelation(parsed.data, ctx.user.id) }, { status: 201 });
}
