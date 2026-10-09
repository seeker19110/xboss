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

// Rate limit generic tái dùng bảng login_rate_limits + pattern upsert atomic sẵn có.
// Trả về true nếu ĐÃ VƯỢT giới hạn (caller trả 429), false nếu còn quota (đã đếm +1).
// Dùng cho `api:${keyId}` (M49 PR1), `oidc:${ip}` (M49 PR3)... — đếm-trước-chặn-sau
// đủ cho API (khác login: login cần hàm check riêng để không đếm lần đăng nhập đúng).
// Upsert atomic (INSERT ... ON CONFLICT): an toàn khi nhiều instance ghi đồng thời —
// Postgres khoá theo row key, không có race đọc-rồi-ghi như Map trong process.
export async function hitRateLimit(
  key: string,
  max: number,
  windowMinutes: number,
): Promise<boolean> {
  const rows = await query<{ count: number }>(
    `INSERT INTO login_rate_limits (key, count, reset_at)
     VALUES (?, 1, NOW() + make_interval(mins => ?))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN login_rate_limits.reset_at <= NOW() THEN 1 ELSE login_rate_limits.count + 1 END,
       reset_at = CASE WHEN login_rate_limits.reset_at <= NOW() THEN NOW() + make_interval(mins => ?) ELSE login_rate_limits.reset_at END
     RETURNING count`,
    key,
    windowMinutes,
    windowMinutes,
  );
  // Dọn rác entry hết hạn từ lâu — lấy mẫu xác suất thấp để không thêm round-trip mỗi lượt. Đặt ở đây
  // (không chỉ ở đăng nhập sai) vì khoá API/tài chính sinh dòng theo người × loại thao tác: chỉ dọn khi
  // có đăng nhập sai thì bảng phình, health-check (>5000 dòng) báo động giả.
  if (Math.random() < 0.01) {
    await run(`DELETE FROM login_rate_limits WHERE reset_at < NOW() - INTERVAL '1 day'`);
  }
  return (rows[0]?.count ?? 1) > max;
}

// Ghi nhận 1 lần chạm cửa sổ login — dùng chung helper generic, giữ nguyên cửa sổ login.
// (login đếm-trước, chặn qua loginBlockedSeconds bằng ngưỡng riêng MAX_PER_KEY/MAX_PER_IP.)
async function bump(key: string): Promise<void> {
  await hitRateLimit(key, Number.POSITIVE_INFINITY, WINDOW_MINUTES);
}

// Ghi nhận 1 lần đăng nhập sai.
export async function recordLoginFailure(ip: string, email: string): Promise<void> {
  await bump(pairKey(ip, email));
  await bump(ipKey(ip));
}

// Đăng nhập đúng → xoá đếm của cặp IP+email (không xoá đếm theo IP).
export async function recordLoginSuccess(ip: string, email: string): Promise<void> {
  await run(`DELETE FROM login_rate_limits WHERE key = ?`, pairKey(ip, email));
}

// Route ghi chuỗi tiền IPC → điều chỉnh → phiếu → chi (quyết định 2026-10-09): mỗi người dùng tối đa
// 60 lượt/15 phút cho TỪNG loại thao tác (`loai`, vd "ipc-duyet") — đủ rộng cho PM nhập liệu dồn dập,
// chặn script/bấm lặp vô hạn. Trả thông báo + Retry-After để route bọc 429; null = còn quota (đã đếm).
export const GIOI_HAN_GHI_TAI_CHINH = { max: 60, windowMinutes: 15 } as const;

export async function gioiHanGhiTaiChinh(
  loai: string,
  userId: number,
): Promise<{ error: string; retryAfter: string } | null> {
  const { max, windowMinutes } = GIOI_HAN_GHI_TAI_CHINH;
  if (!(await hitRateLimit(`tai-chinh:${loai}:${userId}`, max, windowMinutes))) return null;
  return {
    error: `Thao tác quá nhanh — tối đa ${max} lượt/${windowMinutes} phút cho mỗi loại thao tác tài chính, thử lại sau ít phút`,
    retryAfter: "60",
  };
}
