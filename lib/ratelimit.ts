// Rate limit in-memory chống brute-force đăng nhập.
// Giới hạn theo cặp IP+email và theo riêng IP (chống quét nhiều email).
// Lưu trong process: restart là reset, mỗi instance đếm riêng — đủ tốt cho
// deployment 1 instance; muốn chặt hơn (multi-instance) cần chuyển sang DB/Redis.

const WINDOW_MS = 15 * 60_000;   // cửa sổ 15 phút
const MAX_PER_KEY = 5;           // 5 lần sai / IP+email
const MAX_PER_IP = 20;           // 20 lần sai / IP (mọi email cộng lại)

type Entry = { count: number; resetAt: number };
const g = globalThis as unknown as { __xbossLoginFails?: Map<string, Entry> };
const store = () => (g.__xbossLoginFails ??= new Map());

function bump(key: string): Entry {
  const s = store();
  const now = Date.now();
  const e = s.get(key);
  if (!e || e.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + WINDOW_MS };
    s.set(key, fresh);
    return fresh;
  }
  e.count++;
  return e;
}

function current(key: string): Entry | null {
  const e = store().get(key);
  if (!e || e.resetAt <= Date.now()) return null;
  return e;
}

// Còn bị khoá không? Trả về số giây phải chờ, hoặc 0 nếu được phép thử.
export function loginBlockedSeconds(ip: string, email: string): number {
  const now = Date.now();
  const byPair = current(`${ip}|${email}`);
  const byIp = current(`ip|${ip}`);
  const blockedUntil = Math.max(
    byPair && byPair.count >= MAX_PER_KEY ? byPair.resetAt : 0,
    byIp && byIp.count >= MAX_PER_IP ? byIp.resetAt : 0);
  return blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
}

// Ghi nhận 1 lần đăng nhập sai.
export function recordLoginFailure(ip: string, email: string): void {
  bump(`${ip}|${email}`);
  bump(`ip|${ip}`);
  // Dọn rác entry hết hạn khi map phình to (tránh rò bộ nhớ khi bị quét lâu dài).
  const s = store();
  if (s.size > 10_000) {
    const now = Date.now();
    for (const [k, e] of s) if (e.resetAt <= now) s.delete(k);
  }
}

// Đăng nhập đúng → xoá đếm của cặp IP+email (không xoá đếm theo IP).
export function recordLoginSuccess(ip: string, email: string): void {
  store().delete(`${ip}|${email}`);
}
