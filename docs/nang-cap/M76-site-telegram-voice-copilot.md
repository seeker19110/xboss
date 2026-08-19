# M76 — Trợ Lý Hiện Trường Telegram 2 Chiều & Voice Copilot (Site Telegram & Voice Gateway)

> **Trạng thái:** Đã hoàn thành (2026-08-19)  
> **Phụ thuộc:** `migrations/0110_telegram_field_copilot.sql`, `lib/engineering-site-bot.ts`

## 1. Mục tiêu & Bối cảnh

Xây dựng trợ lý ảo hiện trường 2 chiều kết nối Telegram Bot và xử lý lệnh giọng nói / tin nhắn tiếng Việt trực tiếp từ công trường. Giúp Chỉ huy trưởng & Kỹ sư cập nhật nhanh % tiến độ WBS, báo cáo sự cố khẩn cấp, tra cứu vật tư và ghi nhật ký mà không cần mở laptop.

## 2. Năng Lực Cốt Lõi

1. **Vietnamese Field NLP Intent Parser (`parseVietnameseFieldIntent`):**
   - Tự động nhận diện 4 nhóm Intent:
     - `PROGRESS_UPDATE`: Trích xuất mã task và % hoàn thành (VD: "Cập nhật tiến độ task A1.02 đạt 85%").
     - `ISSUE_REPORT`: Trích xuất tiêu đề lỗi và phân loại mức độ nghiêm trọng (`critical`, `high`, `normal`).
     - `DIARY_LOG`: Trích xuất ghi chú vào nhật ký thi công hàng ngày.
     - `QUERY_STOCK`: Trích xuất từ khoá tra cứu bản vẽ / vật tư tồn kho.
2. **Bảo mật & Liên kết Tài khoản OTP 6 Số:**
   - Kỹ sư lấy mã OTP từ web và gửi cú pháp `/link <OTP>` trên Telegram để xác thực quyền hạn.
3. **2-Way Telegram Webhook & Voice Gateway:**
   - Xử lý tin nhắn text, ảnh hiện trường (`photo`), hoặc tin nhắn thoại (`voice`).
   - Tự động phản hồi tin nhắn xác nhận tiếng Việt về Telegram của kỹ sư.

## 3. Schema & DDL

- Migration `0110_telegram_field_copilot.sql`: Tạo 2 bảng `telegram_user_bindings` và `telegram_bot_message_logs`.

## 4. API Endpoints

- `POST /api/telegram/webhook`: Nhận webhook từ Telegram Bot.
- `POST /api/telegram/link-otp`: Sinh mã OTP liên kết tài khoản.
- `GET/POST /api/telegram/simulate-voice`: Tra cứu logs và giả lập lệnh thoại từ Web UI.

## 5. UI/UX

- Giao diện `/engineering/site-copilot` (Bàn điều khiển Chat & Voice Simulator, OTP linking card, Nhật ký lệnh hiện trường thời gian thực).
