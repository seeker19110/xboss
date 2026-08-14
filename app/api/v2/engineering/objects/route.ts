import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  createEngineeringObject,
  listEngineeringObjects,
  engineeringObjectInputSchema,
} from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

async function projectOr401() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }) } as const;
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return { error: NextResponse.json({ error: "Không có project context hợp lệ" }, { status: 403 }) } as const;
  return { user, projectId } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await projectOr401();
  if ("error" in ctx) return ctx.error;
  const objectType = req.nextUrl.searchParams.get("objectType") ?? undefined;
  const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 100;
  return NextResponse.json({ items: await listEngineeringObjects(ctx.projectId, { objectType, limit }) });
}

export async function POST(req: NextRequest) {
  const ctx = await projectOr401();
  if ("error" in ctx) return ctx.error;
  const parsed = engineeringObjectInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu engineering object không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.projectId !== ctx.projectId) {
    return NextResponse.json({ error: "projectId không khớp project context" }, { status: 400 });
  }
  const created = await createEngineeringObject(parsed.data, ctx.user.id);
  return NextResponse.json({ item: created }, { status: 201 });
}
