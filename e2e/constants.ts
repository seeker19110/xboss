// Hằng dùng chung cho hạ tầng E2E có đăng nhập.
// Cùng đọc từ process.env của RUNNER (Playwright) — playwright.config.ts chuyển tiếp
// đúng các giá trị này vào webServer (app), nên fixture login và app luôn khớp.

// Tài khoản được seed tường minh bởi global-setup.ts vào DB E2E, không tạo qua HTTP.
export const ADMIN_EMAIL = "admin@xboss.vn";

// Mật khẩu admin + secret ký phiên cho môi trường E2E (DB ephemeral, không phải bí mật thật).
export const ADMIN_PW = process.env.XBOSS_ADMIN_PASSWORD ?? "e2e-admin-pw";
export const E2E_SECRET = process.env.XBOSS_SECRET ?? "e2e-secret-khong-bi-mat";
// Keyring KEK vault offline (S05, định dạng `<version>:<secret ≥32 ký tự>`, khác XBOSS_SECRET) —
// giá trị TEST cho DB ephemeral để vault/hàng đợi offline BẬT trong E2E (S08 browser acceptance).
export const E2E_OFFLINE_KEK =
  process.env.XBOSS_OFFLINE_KEK ?? "e2e1:e2e-offline-kek-khong-bi-mat-du-32-ky-tu";

// File lưu cookie phiên sau khi login 1 lần (storageState) — KHÔNG commit (.gitignore).
export const AUTH_FILE = "playwright/.auth/admin.json";

// Bật nhánh test sau-auth khi có DB test (mirror quy ước TEST_DATABASE_URL của recompute.test.ts).
export const E2E_DB = process.env.E2E_DATABASE_URL;
export const HAS_DB = !!E2E_DB;
