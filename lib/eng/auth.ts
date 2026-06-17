import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { queryOne } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { ensureEngSchema, type EngUser } from "@/lib/eng/db";

export { hashPassword, verifyPassword };

export const ENG_COOKIE = "eng_session";
const SESSION_DAYS = 7;
export const ENG_COOKIE_MAX_AGE = SESSION_DAYS * 86400;

function getSecret(): string {
  return process.env.XBOSS_SECRET || "eng-dev-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function makeEngToken(userId: number, passwordHash: string): string {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const pwFrag = passwordHash.slice(0, 12);
  const payload = `${userId}.${exp}.${pwFrag}`;
  return `${payload}.${sign(payload)}`;
}

function parseEngToken(token: string): { uid: number; pwFrag: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [uid, exp, pwFrag, mac] = parts;
  const expected = Buffer.from(sign(`${uid}.${exp}.${pwFrag}`), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(mac, "hex");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(exp) < Date.now()) return null;
  return { uid: Number(uid), pwFrag };
}

export async function getCurrentEngUser(): Promise<EngUser | null> {
  await ensureEngSchema();
  const token = (await cookies()).get(ENG_COOKIE)?.value;
  if (!token) return null;
  const parsed = parseEngToken(token);
  if (!parsed) return null;
  const u = await queryOne<EngUser & { password_hash: string }>(
    `SELECT id, name, email, level, streak_days, last_study_date, password_hash FROM eng_users WHERE id = ?`,
    parsed.uid
  );
  if (!u) return null;
  if (!u.password_hash.startsWith(parsed.pwFrag)) return null;
  const { password_hash: _, ...user } = u;
  return user as EngUser;
}
