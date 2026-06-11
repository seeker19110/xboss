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
