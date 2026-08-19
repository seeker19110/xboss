# Sổ tay quản trị & Vận hành Engineering OS (Governance & Runbook)

> **Mã tài liệu:** `XBOSS-OPS-ENG-01`
> **Phạm vi:** Vận hành hệ thống Engineering OS (OS-1 → OS-5).

---

## 1. Ma trận trách nhiệm RACI

| Hoạt động                                           |  Admin  |  PM   | Lead Engineer | AI Agent | BCH Công trường |
| :-------------------------------------------------- | :-----: | :---: | :-----------: | :------: | :-------------: |
| Phê duyệt mô hình dự báo (OS-3)                     |  **A**  | **R** |     **C**     |    I     |        I        |
| Cấp Approval Token tự động hóa (OS-4)               |  **A**  | **R** |     **C**     |    I     |        I        |
| Kích hoạt Kill Switch khẩn cấp                      | **R/A** | **R** |     **C**     |    -     |        I        |
| Xử lý vấn đề chất lượng dữ liệu (OS-1)              |  **A**  | **C** |     **R**     |    I     |        I        |
| Ghi nhận trạng thái hiện trường Digital Twin (OS-2) |    I    | **C** |     **R**     |    I     |      **R**      |

_(R: Responsible, A: Accountable, C: Consulted, I: Informed)_

---

## 2. Quy trình xử lý sự cố & Kích hoạt Kill Switch (P0 Runbook)

### 2.1 Khi nào cần bật Kill Switch?

1. Phát hiện hành vi tự động hóa bất thường (sai lệch dữ liệu hàng loạt).
2. Phát hiện lỗi tràn trần ngân sách hoặc xung đột logic trong yêu cầu thực thi.
3. Sự cố an ninh bảo mật hoặc tấn công dò quét API.

### 2.2 Các bước thực hiện:

```bash
# 1. Kích hoạt Kill Switch qua API (hoặc giao diện UI /engineering/autonomy)
curl -X POST https://xboss.example.com/api/engineering/autonomy/kill-switch \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"isActive": true, "reason": "P0: Nghi vấn sai lệch tự động hóa lúc 14:00"}'

# 2. Kiểm tra trạng thái hệ thống
curl -s https://xboss.example.com/api/engineering/autonomy/policies | jq .
```

### 2.3 Phục hồi sau sự cố:

1. Rà soát log trong `engineering_execution_requests` và bảng `audit_log`.
2. Khắc phục nguyên nhân gốc rễ (Root cause).
3. Admin thực hiện tắt Kill Switch để mở lại hoạt động bình thường.

---

## 3. Lịch bảo trì định kỳ

- **Hàng ngày:** Rà quét vi phạm chất lượng dữ liệu tự động (`/api/engineering/data-quality`).
- **Hàng tuần:** Đánh giá độ tươi mới (Freshness) của các đối tượng Digital Twin (`/api/engineering/twin/[id]`).
- **Hàng tháng:** Đánh giá độ chính xác (Precision/Recall/Brier) của các mô hình dự báo rủi ro (`/api/engineering/predictions`).
- **Hàng quý:** Diễn tập kiểm tra khôi phục DR (`npm run audit:verify-dr`) và diễn tập Kill Switch.
