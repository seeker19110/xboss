import { defineConfig, devices } from "@playwright/test";

/**
 * Cấu hình E2E (Playwright) cho XBoss.
 * Hai project: desktop (Chromium) + mobile (Pixel 5) → luồng chính kiểm trên cả hai
 * kích thước, ép tinh thần mobile-first (BO-SUNG-chat-luong.md Nhóm 2 mục 4).
 *
 * webServer chạy bản production (`npm run start`) với DATABASE_URL giả: pool kết nối
 * lazy nên app khởi động không cần DB thật; smoke test hiện chỉ chạm trang /login
 * (render hoàn toàn client, không cần CSDL). Luồng cần đăng nhập sẽ thêm sau khi có
 * chiến lược seed DB test.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],

  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://x:x@127.0.0.1:5432/x",
    },
  },
});
