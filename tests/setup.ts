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
// (chạy migration). Migration 0069_rls.sql tự tạo role ứng dụng `xboss_app` (NOBYPASSRLS)
// khi áp; tests/rls.test.ts mở pool riêng kết nối bằng role đó để kiểm RLS thật (superuser
// bỏ qua RLS nên không kiểm được nếu chỉ dùng 1 role).

// Cho tiến trình test THOÁT NGAY khi mọi connection đã rỗi.
//
// Vì sao cần: `lib/db` không đặt idleTimeoutMillis nên `pg` dùng mặc định 10s — connection
// rỗi vẫn giữ event loop sống, Node không thoát dù test đã xong từ lâu. Đo được: thân test
// 117ms nhưng cả tiến trình 10.368ms. Nhân với ~127 file chạm DB là khoảng 21 PHÚT chờ
// rỗng mỗi lần chạy full suite — chi phí lớn nhất của bộ test, và hoàn toàn vô ích.
//
// Dùng `allowExitOnIdle` (cờ sẵn có của `pg`, đúng mục đích này) thay vì gọi pool.end()
// trong hook after(): nhiều file test có after() RIÊNG còn chạm DB, mà hook của setup.ts
// đăng ký trước nên sẽ chạy trước — đóng pool ở đó vừa không cứu được các file ấy (pool bị
// dựng lại ngay sau đó), vừa có nguy cơ làm chúng đỏ vì "cannot use a pool after end".
// Cờ này chỉ bật trong test, không đổi hành vi production.
process.env.XBOSS_PG_ALLOW_EXIT_ON_IDLE = "1";
