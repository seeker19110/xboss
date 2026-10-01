## Giao diện (`app/**/*.tsx` — docs/audit.md §5, ADR-0009, ADR-0010)

Người dùng chính là kỹ sư/thầu phụ dùng **điện thoại ở công trường**, mạng chập chờn.

- **Theme dark-first**: viết class cho chế độ tối; light mode tự đảo qua biến CSS trong `app/globals.css`. Cấm biến thể `dark:` và cấm mã hex trong component (cổng `check:hex-hardcode`). Nền/chữ/viền dùng thang `zinc`; màu nhấn mức `-300`/`-400`.
- Nút nền màu đặc: chữ trắng trên `bg-{c}-700`, hover **đậm dần** `hover:bg-{c}-800` (không sáng dần — tụt tương phản AA, ADR-0010). Emerald = đang chọn/hành động chính; amber/đỏ chỉ cho cảnh báo. Không dùng `transition-all` (cổng `check:ui-ux-guard`).
- Dùng bộ component nền `app/components/ui/` (`Button`, `Card`, `Chip`, `Section`, `StatCard`), `Skeleton`, `Modal`/`appConfirm`/`appPrompt`/`appAlert` (`app/components/dialogs.tsx`), `showToast` — không dùng `window.confirm/prompt/alert`, không tự viết lại nút/thẻ.
- Màn hình dữ liệu xử lý đủ 4 trạng thái: đang tải (Skeleton), rỗng (thông điệp + gợi ý), lỗi (thân thiện, có thử lại), có dữ liệu. API trả 401 → chuyển `/login`.
- `fetch` ghi dữ liệu có `try/catch` + kiểm `res.ok` và hiện `error` server; nút submit disable + loading khi đang gửi (chặn double-submit); thất bại giữ nguyên dữ liệu đã nhập. Lỗi thật đã lặp nhiều lần: nút kẹt "Đang lưu..." vĩnh viễn khi mất mạng.
- Optimistic UI phải rollback đúng khi server từ chối và báo lý do cụ thể.
- A11y: vùng chạm ≥ 40px; nút icon-only có `aria-label` tiếng Việt; không truyền tải thông tin chỉ bằng màu (kèm icon/nhãn); focus thấy rõ; không có thanh cuộn ngang toàn trang ở màn 360px; bảng dày dùng header sticky + cuộn ngang trong khung.
- Không render nội dung người dùng nhập bằng `dangerouslySetInnerHTML` (nếu buộc phải có rich text thì qua sanitizer).
- Trang in (`/report`...) sạch khi `window.print()`: ẩn nav/nút.

### Quy ước dự án ưu tiên hơn luật chung

- Chuỗi giao diện tiếng Việt viết thẳng trong component là **đúng quy ước** — không báo "hardcode chuỗi"/"nên i18n".
- Mọi trang là `'use client'` fetch `/api/*` — không đề xuất chuyển sang server component lấy dữ liệu.
- Comment tiếng Việt là đúng quy ước.
