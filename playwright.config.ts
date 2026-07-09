import { defineConfig, devices } from "@playwright/test";
import { ADMIN_PW, AUTH_FILE, E2E_DB, E2E_SECRET, HAS_DB } from "./e2e/constants";

// Cổng webServer — cho phép override qua PW_PORT để tránh nhiều subagent chạy
// e2e song song trên cùng máy cướp nhầm server :3000 của nhau.
const port = process.env.PW_PORT ?? "3000";

/**
 * Cấu hình E2E (Playwright) cho XBoss — desktop (Chromium) + mobile (Pixel 5).
 *
 * Hai nhánh test:
 *  1. Công khai (`e2e/login.spec.ts`, `e2e/offline.spec.ts`): smoke + axe trang /login,
 *     app shell PWA offline — KHÔNG cần CSDL (pool kết nối lazy, DATABASE_URL giả) — luôn chạy.
 *  2. Sau đăng nhập (`e2e/authed/**`): chỉ chạy khi có `E2E_DATABASE_URL` (DB test).
 *     Project `setup` đăng nhập 1 lần (e2e/auth.setup.ts) lưu cookie, các project
 *     authed-* tái dùng qua storageState. Mirror quy ước TEST_DATABASE_URL của test tích hợp.
 *
 * webServer chạy bản production (`npm run start`); cần XBOSS_SECRET (ký phiên) +
 * XBOSS_ADMIN_PASSWORD (tạo admin lần đầu) khi bật nhánh sau-auth.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: HAS_DB ? "./e2e/global-setup.ts" : undefined,

  use: {
    baseURL: process.env.BASE_URL ?? `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    // Escape-hatch chỉ dùng khi máy đã có sẵn Chromium build khác bản pin (vd môi trường
    // CI dựng sẵn). Bỏ trống ở CI thường → Playwright dùng trình duyệt cài qua `playwright install`.
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },

  projects: [
    // ── Nhánh công khai (không cần đăng nhập) ──
    {
      name: "public-desktop",
      testMatch: /(login|offline)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "public-mobile",
      testMatch: /(login|offline)\.spec\.ts$/,
      use: { ...devices["Pixel 5"] },
    },

    // ── Nhánh sau đăng nhập (chỉ khi có DB test) ──
    ...(HAS_DB
      ? [
          { name: "setup", testMatch: /auth\.setup\.ts$/, use: { ...devices["Desktop Chrome"] } },
          {
            name: "authed-desktop",
            testMatch: /authed\/.*\.spec\.ts$/,
            dependencies: ["setup"],
            use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
          },
          {
            name: "authed-mobile",
            testMatch: /authed\/.*\.spec\.ts$/,
            dependencies: ["setup"],
            use: { ...devices["Pixel 5"], storageState: AUTH_FILE },
          },
        ]
      : []),
  ],

  webServer: {
    command: "npm run start",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DB ?? process.env.DATABASE_URL ?? "postgres://x:x@127.0.0.1:5432/x",
      XBOSS_SECRET: E2E_SECRET,
      XBOSS_ADMIN_PASSWORD: ADMIN_PW,
      PORT: port,
    },
  },
});
