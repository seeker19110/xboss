import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createObjectRevision, engineeringObjectRevisionInputSchema } from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const parsed = engineeringObjectRevisionInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu object revision không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  const item = await createObjectRevision(parsed.data, user.id);
  if (!item) return NextResponse.json({ error: "Engineering object không tồn tại" }, { status: 404 });
  return NextResponse.json({ item }, { status: 201 });
}
