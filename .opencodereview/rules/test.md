## Test node:test (tests/ — ADR-0002)

- File test chạm DB phải import `./setup` là import **đầu tiên** (mẫu: `import { HAS_TEST_DB } from "./setup";`) — `tests/setup.ts` xoá `DATABASE_URL` hoặc thay bằng `TEST_DATABASE_URL` để chống ghi nhầm DB thật. Import khác đứng trước (kể cả `@/lib/db`) là lỗi thật.
- Không gán cứng số nguyên nhỏ vào vị trí id khoá ngoại tới `users` (`created_by`, `actorId`...) — lấy id từ hàm `tao*()` (cổng `check:test-fk-ids`, TRAPS.md).
- Test tích hợp tự SKIP khi thiếu `TEST_DATABASE_URL` — CI chạy `--release-gate` coi SKIP là lỗi; không thêm `skip` mới mà không khai lý do trong `scripts/test-skip-allowlist.json`.
- Test hồi quy phải **đỏ được**: assert đúng giá trị nghiệp vụ (%/tiền/trạng thái/mã HTTP), không chỉ "không throw". Test sửa lỗi logic cần ca biên (rỗng, 1 phần tử, `null` vs 0, off-by-one, ngày quanh 0h giờ VN).
- Test độc lập thứ tự: tạo dữ liệu riêng, không phụ thuộc dữ liệu test khác để lại; không dùng `sleep` cố định để chờ.
- Không bỏ/giảm assert để test "xanh" — nếu diff xoá assert hoặc nới điều kiện, nêu lý do có hợp lệ không.
