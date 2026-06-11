import { scryptSync, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { queryOne, run } from "@/lib/db";

export const COOKIE = "xboss_session";
const SECRET = process.env.XBOSS_SECRET ?? "xboss-dev-secret-change-me";
const SESSION_DAYS = 7;

export type Role = "admin" | "pm" | "engineer" | "subcon";
export type User = { id: number; name: string; email: string; role: Role };

// ===== Mật khẩu (scrypt) =====
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, "hex");
  return test.length === ref.length && timingSafeEqual(test, ref);
}

// ===== Cookie phiên (stateless, ký HMAC) =====
function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}
export function makeToken(userId: number): string {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}
function parseToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, mac] = parts;
  if (sign(`${uid}.${exp}`) !== mac) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(uid);
}

// ===== Người dùng hiện tại =====
export async function getCurrentUser(): Promise<User | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const uid = parseToken(token);
  if (!uid) return null;
  const u = await queryOne<User>(`SELECT id, name, email, role FROM users WHERE id = ?`, uid);
  return u ?? null;
}

export const COOKIE_MAX_AGE = SESSION_DAYS * 86400;

// ===== Tạo user mặc định (chạy 1 lần nếu DB chưa có user) =====
const DEFAULTS: { name: string; email: string; pw: string; role: Role }[] = [
  { name: "Quản trị", email: "admin@xboss.vn", pw: "admin123", role: "admin" },
  { name: "Trưởng dự án", email: "pm@xboss.vn", pw: "pm123", role: "pm" },
  { name: "Kỹ sư", email: "engineer@xboss.vn", pw: "eng123", role: "engineer" },
  { name: "Thầu phụ", email: "subcon@xboss.vn", pw: "sub123", role: "subcon" },
];
export async function ensureDefaultUsers(): Promise<void> {
  const c = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM users`);
  if (c && Number(c.n) > 0) return;
  for (const u of DEFAULTS) {
    await run(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING`,
      u.name, u.email, hashPassword(u.pw), u.role);
  }
}

// Quyền theo vai trò (rút gọn từ §8 spec).
export const CAN = {
  import: (r?: Role) => r === "admin" || r === "pm",
  export: (r?: Role) => r === "admin" || r === "pm",
  editProgress: (r?: Role) => r === "admin" || r === "pm" || r === "engineer" || r === "subcon",
  editStructure: (r?: Role) => r === "admin" || r === "pm", // sửa tên/code/trục/căn hộ
  viewDashboard: (r?: Role) => r !== "subcon",
};
