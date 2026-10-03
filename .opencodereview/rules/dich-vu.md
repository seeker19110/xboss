## Tầng dịch vụ phối hợp (lib/dich-vu/ — ADR-0008)

- Chỉ chứa logic cần **từ 2 miền nghiệp vụ trở lên**; logic thuộc một miền phải nằm ở `lib/<miền>/` (không biến `dich-vu` thành sọt rác).
- **Không biết gì về HTTP**: không import `next/server`, không trả `NextResponse`, không đọc `Request`/cookie — trả dữ liệu thuần, route bọc response.
- Nhiều bước ghi trên nhiều miền phải trong một `withTransaction` để không ghi dở dang khi bước sau lỗi.
