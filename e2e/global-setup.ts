import { execSync } from "node:child_process";
import { E2E_DB } from "./constants";

// Seed dữ liệu mẫu vào DB test 1 lần trước toàn bộ E2E (chỉ khi E2E_DATABASE_URL được đặt).
// Chạy script seed như tiến trình con (script gọi process.exit ở cuối — không import trực tiếp).
// Tài khoản admin KHÔNG seed ở đây: app tự tạo khi login lần đầu (ensureDefaultUsers + XBOSS_ADMIN_PASSWORD).
export default function globalSetup(): void {
  if (!E2E_DB) return;
  console.log("[e2e] Seed dữ liệu mẫu vào DB test…");
  execSync("npx tsx scripts/seed-sample.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: E2E_DB },
  });
}
