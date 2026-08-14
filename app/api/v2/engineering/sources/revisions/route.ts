import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createSourceRevision,
  engineeringSourceRevisionInputSchema,
  listSourceRevisions,
} from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const projectId = Number(req.nextUrl.searchParams.get("projectId"));
  const sourceId = req.nextUrl.searchParams.get("sourceId");
  if (!Number.isInteger(projectId) || projectId <= 0 || !sourceId) {
    return NextResponse.json({ error: "projectId/sourceId không hợp lệ" }, { status: 400 });
  }
  return NextResponse.json({ items: await listSourceRevisions(projectId, sourceId) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const parsed = engineeringSourceRevisionInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu source revision không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  const item = await createSourceRevision(parsed.data, user.id);
  if (!item) return NextResponse.json({ error: "Source không tồn tại" }, { status: 404 });
  return NextResponse.json({ item }, { status: 201 });
}
