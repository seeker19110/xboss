## Test E2E Playwright (e2e/)

- Trang/luồng mới cần spec axe chạy desktop + mobile, assert không có vi phạm `serious`/`critical` (cổng merge, docs/audit.md §5).
- Chọn phần tử theo vai trò/nhãn truy cập (`getByRole`, `getByLabel`) — tên tiếng Việt khớp UI thật; tránh selector CSS mong manh.
- Không dùng `waitForTimeout` cố định; chờ theo điều kiện (`expect(...).toBeVisible()`, `waitForResponse`).
- Spec không phụ thuộc thứ tự chạy hay dữ liệu spec khác tạo (CI chạy chia shard).
- Không biến ca đang hỏng thành `fixme`/`skip` để qua cổng mà không ghi lý do + kế hoạch sửa.
