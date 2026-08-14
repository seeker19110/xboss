import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { createObjectRevision, engineeringObjectRevisionInputSchema } from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Không có project context hợp lệ" }, { status: 403 });
  const { id } = await params;
  const parsed = engineeringObjectRevisionInputSchema.safeParse({
    ...(await req.json().catch(() => null)),
    objectId: id,
  });
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu revision không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  const created = await createObjectRevision(parsed.data, user.id);
  if (!created) return NextResponse.json({ error: "Engineering object không tồn tại" }, { status: 404 });
  return NextResponse.json({ item: created }, { status: 201 });
}
