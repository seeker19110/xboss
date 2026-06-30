# ADR-0002: Dùng `node:test` qua `tsx` (không vitest/jest)

- **Trạng thái:** Đã chấp nhận (ghi nhận hồi tố)
- **Ngày:** 2026-06-30

## Bối cảnh

Bộ khung (`BO-SUNG-chat-luong.md` Nhóm 2) đề xuất **vitest** + ngưỡng coverage cho tầng unit. XBoss đã dùng bộ chạy test có sẵn của Node: `node:test` chạy qua `tsx` (`npm test`), với `tests/setup.ts` import đầu tiên để chống ghi nhầm DB thật.

## Quyết định

Giữ `node:test` + `tsx`. Test tích hợp (`recompute.test.ts`) chạy thật trên Postgres qua `TEST_DATABASE_URL` (CI có service container Postgres 16).

## Lý do

- Không thêm dependency/bundler cho test; chạy thẳng TS qua `tsx`, khởi động nhanh.
- Bộ test hiện tại đã phủ phần lõi (status, import, recompute, ratelimit, cpm, auth, material-sync, grid) và chạy ổn trong CI.
- "Đừng thay nếu đang chạy tốt" (nguyên tắc brownfield).

## Các phương án đã cân nhắc

- **vitest:** API phong phú (mock, coverage v8, watch UI) nhưng thêm cấu hình + dependency; lợi ích chưa đủ vượt chi phí chuyển đổi cho quy mô hiện tại.

## Hệ quả

- **Tích cực:** ít dependency, test nhanh, gần chuẩn Node.
- **Đánh đổi:** chưa có báo cáo coverage tự động (ngưỡng coverage của khung chưa áp); mock/spy thủ công hơn vitest.
- **Việc tiếp theo:** nếu cần đo coverage làm cổng, cân nhắc `c8`/`node --experimental-test-coverage` trước khi nghĩ tới đổi sang vitest.
