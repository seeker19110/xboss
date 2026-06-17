import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { run, queryOne } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { ensureEngSchema } from "@/lib/eng/db";
import { makeEngToken, ENG_COOKIE, ENG_COOKIE_MAX_AGE } from "@/lib/eng/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureEngSchema();

  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Tên phải có ít nhất 2 ký tự" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, { status: 400 });
  }

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM eng_users WHERE email = ?`,
    email
  );
  if (existing) {
    return NextResponse.json({ error: "Email đã được sử dụng" }, { status: 409 });
  }

  const passwordHash = hashPassword(password);
  const newUser = await queryOne<{
    id: number;
    name: string;
    email: string;
    level: string;
    streak_days: number;
    last_study_date: string | null;
  }>(
    `INSERT INTO eng_users (name, email, password_hash, level, streak_days)
     VALUES (?, ?, ?, 'beginner', 0)
     RETURNING id, name, email, level, streak_days, last_study_date`,
    name,
    email,
    passwordHash
  );

  if (!newUser) {
    return NextResponse.json({ error: "Không thể tạo tài khoản" }, { status: 500 });
  }

  const token = makeEngToken(newUser.id, passwordHash);
  const cookieStore = await cookies();
  cookieStore.set(ENG_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ENG_COOKIE_MAX_AGE,
    path: "/",
  });

  return NextResponse.json({ user: newUser }, { status: 201 });
}
