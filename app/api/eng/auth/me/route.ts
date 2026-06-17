import { NextResponse } from "next/server";
import { getCurrentEngUser } from "@/lib/eng/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentEngUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  return NextResponse.json({ user });
}
