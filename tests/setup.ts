// Import file này ĐẦU TIÊN trong mọi test chạm DB (ESM hoist import lên trước).
// - Có TEST_DATABASE_URL → test tích hợp chạy trên DB đó.
// - Không có → XOÁ DATABASE_URL để test không bao giờ ghi nhầm vào DB thật;
//   các test tích hợp sẽ tự skip (xem HAS_TEST_DB).
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  delete process.env.DATABASE_URL;
}

export const HAS_TEST_DB = !!process.env.TEST_DATABASE_URL;

// M51 PR1 — test RLS 2 role như production: TEST_DATABASE_URL trỏ role owner/superuser
// (chạy migration). Migration 0067_rls.sql tự tạo role ứng dụng `xboss_app` (NOBYPASSRLS)
// khi áp; tests/rls.test.ts mở pool riêng kết nối bằng role đó để kiểm RLS thật (superuser
// bỏ qua RLS nên không kiểm được nếu chỉ dùng 1 role).
