# Runbook: Xử lý sự cố (Incident Response)

> Cụ thể hóa "Quy trình xử lý sự cố rõ ràng" của KHUNG 1 (GĐ 8 — Sau ra mắt).
> Mục tiêu: khi production có sự cố, **giảm thiệt hại trước, tìm nguyên nhân sau** — theo các bước cố định
> để không phải suy nghĩ lúc đang hoảng.

## Phân mức nghiêm trọng (severity)

| Mức | Nghĩa | Ví dụ | Phản hồi |
|-----|-------|-------|----------|
| **SEV1** | Sập/mất dữ liệu/lộ dữ liệu | site down, rò rỉ dữ liệu, mất tiền | Xử lý ngay, mọi lúc |
| **SEV2** | Suy giảm nặng | luồng chính lỗi, chậm nghiêm trọng | Trong giờ làm, ưu tiên cao |
| **SEV3** | Ảnh hưởng nhỏ | lỗi ngoài luồng chính, có cách lách | Lên lịch xử lý |

## Các bước (theo thứ tự)

1. **Phát hiện & ghi nhận.** Mở một issue sự cố (template `incident`); ghi thời điểm bắt đầu, triệu chứng,
   ai đang xử lý. Nguồn cảnh báo: Sentry, uptime monitor, người dùng báo.
2. **Đánh giá mức (severity)** theo bảng trên. SEV1 → ưu tiên tuyệt đối.
3. **Giảm thiệt hại trước (mitigate).** Ưu tiên khôi phục dịch vụ hơn là vá triệt để:
   - **Rollback** bản deploy gần nhất (Vercel: Promote bản trước đó), HOẶC
   - Tắt cờ tính năng/feature flag gây lỗi, HOẶC
   - Khôi phục dữ liệu từ **backup/PITR** (nếu mất/hỏng dữ liệu).
4. **Liên lạc.** Cập nhật trạng thái cho người dùng nếu ảnh hưởng diện rộng (trang status/thông báo).
5. **Khắc phục triệt để.** Sửa nguyên nhân gốc theo đúng quy trình: nhánh `fix/...` → cổng commit/merge → deploy.
6. **Đóng sự cố.** Xác nhận đã hết triệu chứng; ghi thời điểm kết thúc.
7. **Viết post-mortem** (dùng **Mẫu post-mortem** ở cuối file này) cho mọi SEV1/SEV2 — **không đổ lỗi cá nhân**,
   tập trung vào hệ thống. Mọi hành động khắc phục → tạo issue có người phụ trách + hạn.

## Nguyên tắc

- **An toàn trước tốc độ:** thao tác lên dữ liệu thật phải cân nhắc rollback trước khi chạy.
- **Một người điều phối (incident lead)** ngay cả khi làm nhóm nhỏ — tránh giẫm chân nhau.
- **Mọi thay đổi lúc chữa cháy vẫn ghi lại** để post-mortem tái dựng được dòng thời gian.
- Mỗi sự cố để lại **ít nhất một cải tiến** (test hồi quy, cảnh báo mới, hàng rào mới) để không lặp lại.


---

# Mẫu post-mortem

> Sao chép **mục này** cho mỗi sự cố SEV1/SEV2 thành `docs/ops/postmortem-YYYY-MM-DD-<slug>.md`.
> **Văn hóa không đổ lỗi (blameless):** mục tiêu là cải thiện hệ thống, không phán xét con người.

- **Ngày sự cố:**
- **Mức (severity):** SEV1 / SEV2 / SEV3
- **Thời lượng:** từ ____ đến ____ (tổng: ____)
- **Người điều phối:**
- **Trạng thái:** Đang điều tra / Đã khắc phục / Đã đóng

## Tóm tắt

<!-- 2–3 câu: chuyện gì xảy ra, ảnh hưởng ai, đã giải quyết thế nào. -->

## Ảnh hưởng

- Người dùng bị ảnh hưởng (số lượng/tỷ lệ):
- Chức năng bị ảnh hưởng:
- Dữ liệu/tiền bị ảnh hưởng (nếu có):

## Dòng thời gian (UTC)

| Thời điểm | Sự kiện |
|-----------|---------|
| | Bắt đầu (nguyên nhân được đưa vào / kích hoạt) |
| | Phát hiện (cảnh báo/báo cáo đầu tiên) |
| | Bắt đầu giảm thiệt hại |
| | Khôi phục dịch vụ |
| | Đóng sự cố |

## Nguyên nhân gốc

<!-- Phân tích "5 Whys": vì sao xảy ra? vì sao không bị chặn sớm hơn?
     Vì sao các hàng rào (test/CI/cảnh báo) không bắt được? -->

## Cái gì đã chạy tốt / chưa tốt

- **Tốt:**
- **Chưa tốt:**
- **May mắn (suýt tệ hơn):**

## Hành động khắc phục (mỗi mục → issue có người phụ trách + hạn)

| Hành động | Loại (vá / phòng ngừa / phát hiện) | Người phụ trách | Hạn | Issue |
|-----------|-----------------------------------|-----------------|-----|-------|
| | | | | |

> Quy tắc: mỗi sự cố để lại **ít nhất một hàng rào mới** (test hồi quy, cảnh báo, kiểm tra CI)
> để cùng nguyên nhân không tái diễn.
