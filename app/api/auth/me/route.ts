import { NextResponse } from "next/server";
import { getCurrentUser, ensureDefaultUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureDefaultUsers();
  const user = getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}
