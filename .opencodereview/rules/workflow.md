## GitHub Actions của XBoss (docs/audit.md §6)

- Mọi `uses:` pin theo **SHA đầy đủ 40 ký tự** kèm comment phiên bản (`# v4.6.2`), không dùng tag nổi (`@v4`, `@main`).
- Workflow/job khai `permissions:` tường minh, tối thiểu (least-privilege); job nào cần ghi tự khai thêm.
- Giá trị do PR kiểm soát (tiêu đề, body, tên nhánh) không nội suy `${{ }}` thẳng vào `run:` — truyền qua `env:` rồi dùng `"$VAR"`.
- Không dùng `pull_request_target` kèm checkout code của PR rồi chạy code đó (cấp secret cho code không tin cậy).
- `deploy.yml` chỉ chạy khi CI trước đó thật sự `success` (kể cả E2E); cổng chất lượng không được `continue-on-error` che kết quả — ngoại lệ duy nhất là job **chỉ góp ý** đã ghi rõ trong comment workflow.
- Secret chỉ đọc qua `secrets.*`; thiếu secret tuỳ chọn thì bỏ qua có thông báo, không làm đỏ CI.
