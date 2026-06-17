import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ENG_COOKIE } from "@/lib/eng/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(ENG_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
