// Xác thực & truy cập biến môi trường tập trung (thay cho process.env rải rác).
//
// THIẾT KẾ (quan trọng, khác mẫu khung generic):
//   Validate theo kiểu LAZY + memoized — KHÔNG chạy lúc import. XBoss cố ý đọc env
//   lúc dùng (xem lib/db.getPool, lib/auth.getSecret) để `next build` không cần secret/DB
//   thật. getServerEnv() chỉ validate ở lần gọi đầu (runtime), nên build vẫn không cần env.
//
//   Quy ước Next.js: biến BÍ MẬT (chỉ server) KHÔNG có tiền tố NEXT_PUBLIC_.
//   XBoss hiện không có biến client nào (toàn bộ cấu hình ở server) → chỉ có serverEnv.
import { z } from "zod";

// Bắt buộc = DATABASE_URL (app không chạy nếu thiếu). Các biến tích hợp (SMTP/Telegram/
// VAPID/Google) là TUỲ CHỌN — module liên quan tự no-op/throw on-demand khi thiếu.
// XBOSS_SECRET để optional ở đây; quy tắc "bắt buộc trong production" do lib/auth giữ
// (kèm fallback dev), không lặp lại để tránh hai nguồn sự thật.
const serverSchema = z.object({
  // Lõi
  DATABASE_URL: z.string().min(1, "bắt buộc — chuỗi kết nối Postgres"),
  XBOSS_SECRET: z.string().min(1).optional(),
  XBOSS_ADMIN_PASSWORD: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  APP_URL: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Email (SMTP) — báo cáo trễ hạn
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  REPORT_EMAIL_TO: z.string().optional(),

  // Telegram (báo cáo song song email)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // Web Push (VAPID) — thiếu thì nút bật push tự ẩn, lib/push là no-op
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // Đồng bộ Google Sheet
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SA_EMAIL: z.string().optional(),
  GOOGLE_SA_PRIVATE_KEY: z.string().optional(),
  GOOGLE_SHEET_ID: z.string().optional(),
  GOOGLE_SHEET_TAB: z.string().optional(),

  // Seed dữ liệu (scripts/seed)
  XLSX_FILE: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Hàm THUẦN (test được) — validate một nguồn biến môi trường bất kỳ.
 * Thiếu/sai biến bắt buộc → throw Error với danh sách lỗi rõ ràng.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Biến môi trường không hợp lệ:\n${lines}`);
  }
  return parsed.data;
}

let cached: ServerEnv | undefined;

/**
 * Truy cập biến môi trường server đã validate (memoized).
 * Gọi lazy ở runtime — KHÔNG gọi ở top-level module chạy lúc build.
 */
export function getServerEnv(): ServerEnv {
  if (!cached) cached = parseServerEnv(process.env);
  return cached;
}

/** Chỉ dùng trong test để xoá cache giữa các ca. */
export function __resetServerEnvCache(): void {
  cached = undefined;
}
