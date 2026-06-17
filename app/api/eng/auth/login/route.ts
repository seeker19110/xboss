import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { queryOne, run } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { ensureEngSchema } from "@/lib/eng/db";
import { makeEngToken, ENG_COOKIE, ENG_COOKIE_MAX_AGE } from "@/lib/eng/auth";
import { todayISO } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureEngSchema();

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email và mật khẩu không được để trống" }, { status: 400 });
  }

  const user = await queryOne<{
    id: number;
    name: string;
    email: string;
    password_hash: string;
    level: string;
    streak_days: number;
    last_study_date: string | null;
  }>(
    `SELECT id, name, email, password_hash, level, streak_days, last_study_date FROM eng_users WHERE email = ?`,
    email
  );

  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
  }

  const today = todayISO();
  let newStreak = user.streak_days;

  if (user.last_study_date === null) {
    newStreak = 1;
  } else if (user.last_study_date === today) {
    // Đã học hôm nay, giữ nguyên streak
  } else {
    const lastDate = new Date(user.last_study_date);
    const todayDate = new Date(today);
    const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / 86400_000);
    if (diffDays === 1) {
      newStreak = user.streak_days + 1;
    } else {
      newStreak = 1;
    }
  }

  await run(
    `UPDATE eng_users SET streak_days = ?, last_study_date = ? WHERE id = ?`,
    newStreak,
    today,
    user.id
  );

  const token = makeEngToken(user.id, user.password_hash);
  const cookieStore = await cookies();
  cookieStore.set(ENG_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ENG_COOKIE_MAX_AGE,
    path: "/",
  });

  const { password_hash: _, ...safeUser } = user;
  return NextResponse.json({
    user: { ...safeUser, streak_days: newStreak, last_study_date: today },
  });
}
