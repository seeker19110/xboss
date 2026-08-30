// Kiểm tra trạng thái hoạt động (health check) các tính năng dùng API (DB, Telegram Bot
// API) và không dùng API (biến môi trường cấu hình email/push/Google Sheet, lưu trữ file,
// cron job) của XBoss. Dùng cho panel "Hệ thống" (/tech, Admin) — nút kiểm tra thủ công —
// và cron 2 lần/ngày (/api/cron/health-check) gửi cảnh báo khi có lỗi. Xem PROGRESS.md.
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { query } from "@/lib/db";
import { UPLOAD_DIR, dirSize, STORAGE_WARN_BYTES, ensureUploadDir } from "@/lib/nen/photos";
import { pushConfigured } from "@/lib/van-hanh/push";

export type HealthStatus = "ok" | "warn" | "fail" | "skip";
export type HealthCheckKind = "api" | "non_api";

export type HealthCheckItem = {
  key: string;
  label: string;
  kind: HealthCheckKind;
  status: HealthStatus;
  detail: string;
};

export type HealthCheckReport = {
  checkedAt: string;
  items: HealthCheckItem[];
  failCount: number;
  warnCount: number;
  hasIssues: boolean;
};

function item(
  key: string,
  label: string,
  kind: HealthCheckKind,
  status: HealthStatus,
  detail: string,
): HealthCheckItem {
  return { key, label, kind, status, detail };
}

// Database Postgres — nền tảng của toàn bộ app (API và cron đều phụ thuộc).
async function checkDatabase(): Promise<HealthCheckItem> {
  try {
    const start = Date.now();
    await query("SELECT 1");
    const ms = Date.now() - start;
    return item("database", "Kết nối Postgres", "api", "ok", `Phản hồi sau ${ms}ms`);
  } catch (e) {
    return item(
      "database",
      "Kết nối Postgres",
      "api",
      "fail",
      `Không kết nối được: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// XBOSS_SECRET — bắt buộc trong production (ký cookie phiên đăng nhập).
function checkSessionSecret(): HealthCheckItem {
  if (process.env.XBOSS_SECRET)
    return item("session_secret", "Khoá ký phiên (XBOSS_SECRET)", "non_api", "ok", "Đã cấu hình");
  if (process.env.NODE_ENV === "production")
    return item(
      "session_secret",
      "Khoá ký phiên (XBOSS_SECRET)",
      "non_api",
      "fail",
      "Thiếu XBOSS_SECRET — bắt buộc trong production",
    );
  return item(
    "session_secret",
    "Khoá ký phiên (XBOSS_SECRET)",
    "non_api",
    "warn",
    "Chưa cấu hình (chỉ chấp nhận ngoài production)",
  );
}

// CRON_SECRET — bảo vệ các endpoint /api/cron/*.
function checkCronSecretConfigured(): HealthCheckItem {
  if (process.env.CRON_SECRET)
    return item("cron_secret", "Bảo vệ cron (CRON_SECRET)", "non_api", "ok", "Đã cấu hình");
  return item(
    "cron_secret",
    "Bảo vệ cron (CRON_SECRET)",
    "non_api",
    "warn",
    "Chưa cấu hình — endpoint /api/cron/* chỉ gọi được qua session Admin/PM",
  );
}

// SMTP — gửi email báo cáo ngày/tuần.
function checkEmail(): HealthCheckItem {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS)
    return item("email", "Gửi email (SMTP)", "non_api", "ok", `Đã cấu hình (${SMTP_HOST})`);
  return item(
    "email",
    "Gửi email (SMTP)",
    "non_api",
    "warn",
    "Chưa cấu hình SMTP_HOST/SMTP_USER/SMTP_PASS — báo cáo ngày/tuần không gửi được email",
  );
}

// Telegram Bot API — kiểm tra sống bằng getMe (nhẹ, không gửi tin nhắn thật).
async function checkTelegram(): Promise<HealthCheckItem> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_ID ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!token || chatIds.length === 0)
    return item(
      "telegram",
      "Thông báo Telegram",
      "non_api",
      "warn",
      "Chưa cấu hình TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID",
    );
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok)
      return item(
        "telegram",
        "Thông báo Telegram",
        "api",
        "fail",
        `Telegram API lỗi ${res.status} — kiểm tra lại TELEGRAM_BOT_TOKEN`,
      );
    return item(
      "telegram",
      "Thông báo Telegram",
      "api",
      "ok",
      `Đã cấu hình, bot phản hồi bình thường (${chatIds.length} chat)`,
    );
  } catch (e) {
    return item(
      "telegram",
      "Thông báo Telegram",
      "api",
      "fail",
      `Không gọi được Telegram API: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// Web Push (VAPID) — no-op khi thiếu key, không phải lỗi nghiêm trọng.
function checkWebPush(): HealthCheckItem {
  if (pushConfigured()) return item("web_push", "Web Push (VAPID)", "non_api", "ok", "Đã cấu hình");
  return item(
    "web_push",
    "Web Push (VAPID)",
    "non_api",
    "warn",
    "Chưa cấu hình VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — nút bật push tự ẩn",
  );
}

// Đồng bộ Google Sheet — chỉ kiểm tra đã cấu hình đủ biến, không gọi API thật (tránh tốn
// quota/ghi log lạ khi chạy health check nền).
function checkGoogleSheets(): HealthCheckItem {
  const hasJson = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const hasPair = !!(
    process.env.GOOGLE_SA_EMAIL?.trim() && process.env.GOOGLE_SA_PRIVATE_KEY?.trim()
  );
  const hasSheetId = !!process.env.GOOGLE_SHEET_ID?.trim();
  if ((hasJson || hasPair) && hasSheetId)
    return item("google_sheets", "Đồng bộ Google Sheet vật tư", "non_api", "ok", "Đã cấu hình");
  return item(
    "google_sheets",
    "Đồng bộ Google Sheet vật tư",
    "non_api",
    "warn",
    "Chưa cấu hình đủ Service Account + GOOGLE_SHEET_ID — tính năng đồng bộ tắt",
  );
}

// Lưu trữ file (data/uploads) — kiểm tra ghi được + cảnh báo dung lượng.
async function checkStorage(): Promise<HealthCheckItem> {
  try {
    await access(UPLOAD_DIR, fsConstants.W_OK).catch(() => ensureUploadDir());
    const { bytes, files } = await dirSize(UPLOAD_DIR);
    if (bytes >= STORAGE_WARN_BYTES)
      return item(
        "storage",
        "Lưu trữ file (data/uploads)",
        "non_api",
        "warn",
        `Đã vượt ngưỡng cảnh báo — ${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB / ${files} file`,
      );
    return item(
      "storage",
      "Lưu trữ file (data/uploads)",
      "non_api",
      "ok",
      `${(bytes / 1024 / 1024).toFixed(1)}MB / ${files} file`,
    );
  } catch (e) {
    return item(
      "storage",
      "Lưu trữ file (data/uploads)",
      "non_api",
      "fail",
      `Không ghi được thư mục lưu trữ: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// Rate-limit login còn treo — bảng login_rate_limits phình to bất thường có thể là dấu
// hiệu tấn công brute-force hoặc job dọn dẹp bị hỏng.
async function checkLoginRateLimit(): Promise<HealthCheckItem> {
  try {
    const rows = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM login_rate_limits`);
    const n = Number(rows[0]?.n ?? 0);
    if (n > 5000)
      return item(
        "login_rate_limit",
        "Bảng chống brute-force đăng nhập",
        "non_api",
        "warn",
        `${n} bản ghi — bất thường cao, có thể đang bị dò mật khẩu hàng loạt`,
      );
    return item(
      "login_rate_limit",
      "Bảng chống brute-force đăng nhập",
      "non_api",
      "ok",
      `${n} bản ghi`,
    );
  } catch (e) {
    return item(
      "login_rate_limit",
      "Bảng chống brute-force đăng nhập",
      "non_api",
      "fail",
      `Lỗi truy vấn: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export async function runHealthChecks(): Promise<HealthCheckReport> {
  const items = await Promise.all([
    checkDatabase(),
    checkSessionSecret(),
    checkCronSecretConfigured(),
    checkEmail(),
    checkTelegram(),
    checkWebPush(),
    checkGoogleSheets(),
    checkStorage(),
    checkLoginRateLimit(),
  ]);
  const failCount = items.filter((i) => i.status === "fail").length;
  const warnCount = items.filter((i) => i.status === "warn").length;
  return {
    checkedAt: new Date().toISOString(),
    items,
    failCount,
    warnCount,
    hasIssues: failCount > 0 || warnCount > 0,
  };
}
