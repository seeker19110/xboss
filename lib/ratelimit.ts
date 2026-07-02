// Rate limit đăng nhập chống brute-force — lưu trong Postgres (bảng login_rate_limits,
// xem migrations/0002_login_rate_limit.sql) thay vì Map trong process: đếm trong process
// sai khi chạy nhiều instance (mỗi instance đếm riêng, kẻ tấn công phân tán request qua
// nhiều instance thì né được giới hạn). Giới hạn theo cặp IP+email và theo riêng IP
// (chống quét nhiều email).
import { query, run } from "@/lib/db";

const WINDOW_MINUTES = 15; // cửa sổ 15 phút
const MAX_PER_KEY = 5; // 5 lần sai / IP+email
const MAX_PER_IP = 20; // 20 lần sai / IP (mọi email cộng lại)

const pairKey = (ip: string, email: string) => `${ip}|${email}`;
const ipKey = (ip: string) => `ip|${ip}`;

type Row = { key: string; count: number; reset_at: Date };

// Còn bị khoá không? Trả về số giây phải chờ, hoặc 0 nếu được phép thử.
export async function loginBlockedSeconds(ip: string, email: string): Promise<number> {
  const rows = await query<Row>(
    `SELECT key, count, reset_at FROM login_rate_limits WHERE key IN (?, ?) AND reset_at > NOW()`,
    pairKey(ip, email),
    ipKey(ip),
  );
  const byPair = rows.find((r) => r.key === pairKey(ip, email));
  const byIp = rows.find((r) => r.key === ipKey(ip));
  const now = Date.now();
  const blockedUntil = Math.max(
    byPair && byPair.count >= MAX_PER_KEY ? byPair.reset_at.getTime() : 0,
    byIp && byIp.count >= MAX_PER_IP ? byIp.reset_at.getTime() : 0,
  );
  return blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
}

// Upsert atomic (INSERT ... ON CONFLICT): an toàn khi nhiều instance ghi đồng thời —
// Postgres khoá theo row key, không có race đọc-rồi-ghi như Map trong process.
async function bump(key: string): Promise<void> {
  await run(
    `INSERT INTO login_rate_limits (key, count, reset_at)
     VALUES (?, 1, NOW() + make_interval(mins => ?))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN login_rate_limits.reset_at <= NOW() THEN 1 ELSE login_rate_limits.count + 1 END,
       reset_at = CASE WHEN login_rate_limits.reset_at <= NOW() THEN NOW() + make_interval(mins => ?) ELSE login_rate_limits.reset_at END`,
    key,
    WINDOW_MINUTES,
    WINDOW_MINUTES,
  );
}

// Ghi nhận 1 lần đăng nhập sai.
export async function recordLoginFailure(ip: string, email: string): Promise<void> {
  await bump(pairKey(ip, email));
  await bump(ipKey(ip));
  // Dọn rác entry hết hạn từ lâu — lấy mẫu xác suất thấp để không thêm round-trip mỗi lần đăng nhập.
  if (Math.random() < 0.01) {
    await run(`DELETE FROM login_rate_limits WHERE reset_at < NOW() - INTERVAL '1 day'`);
  }
}

// Đăng nhập đúng → xoá đếm của cặp IP+email (không xoá đếm theo IP).
export async function recordLoginSuccess(ip: string, email: string): Promise<void> {
  await run(`DELETE FROM login_rate_limits WHERE key = ?`, pairKey(ip, email));
}
