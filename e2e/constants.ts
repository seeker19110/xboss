// Hằng dùng chung cho hạ tầng E2E có đăng nhập.
// Cùng đọc từ process.env của RUNNER (Playwright) — playwright.config.ts chuyển tiếp
// đúng các giá trị này vào webServer (app), nên fixture login và app luôn khớp.

// Tài khoản admin: production tự tạo qua ensureDefaultUsers() khi login lần đầu
// (lib/auth.ts) với mật khẩu = XBOSS_ADMIN_PASSWORD.
export const ADMIN_EMAIL = "admin@xboss.vn";

// Mật khẩu admin + secret ký phiên cho môi trường E2E (DB ephemeral, không phải bí mật thật).
export const ADMIN_PW = process.env.XBOSS_ADMIN_PASSWORD ?? "e2e-admin-pw";
export const E2E_SECRET = process.env.XBOSS_SECRET ?? "e2e-secret-khong-bi-mat";

// File lưu cookie phiên sau khi login 1 lần (storageState) — KHÔNG commit (.gitignore).
export const AUTH_FILE = "playwright/.auth/admin.json";

// Bật nhánh test sau-auth khi có DB test (mirror quy ước TEST_DATABASE_URL của recompute.test.ts).
export const E2E_DB = process.env.E2E_DATABASE_URL;
export const HAS_DB = !!E2E_DB;
