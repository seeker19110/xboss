import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queryOne } from "@/lib/db/index";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const result = await queryOne<{ ok: boolean }>("SELECT true AS ok");
    return NextResponse.json({ ok: result?.ok === true, component: "engineering-kernel" });
  } catch {
    return NextResponse.json({ ok: false, component: "engineering-kernel" }, { status: 503 });
  }
}
