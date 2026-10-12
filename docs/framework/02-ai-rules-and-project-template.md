# KHUNG 2 — Luật AI & Mẫu định nghĩa dự án

> **File khung chung (master), tái sử dụng cho MỌI dự án.**
> **File khung chung (master), tái sử dụng cho MỌI dự án.**
> Còn lại ở đây: (C) quy trình biến hai khung + yêu cầu dự án thành 2 file riêng. Luật AI và mẫu `PROJECT.md` không chép lại ở đây (tránh bản sao lệch) — xem hai con trỏ dưới.
> Cặp đôi với **KHUNG 1** (quy trình + tiêu chuẩn).

---

# PHẦN A — Luật ứng xử bắt buộc cho AI (con trỏ)

Luật AI đầy đủ nằm ở nguồn sự thật, không chép lại ở đây: `CLAUDE.md` §4–§7 (chống ảo giác, cổng commit, cổng merge, mẫu báo cáo xác thực) và `CLAUDE.md` §9 + `docs/framework/standard-delivery.md` §3d (khi nào dừng và hỏi).

---

# PHẦN B — Mẫu định nghĩa dự án (con trỏ)

Mẫu `PROJECT.md` chính là file `PROJECT.md` ở gốc repo khung (`copy-framework.sh` copy sang dự án đích) — điền trực tiếp file đó, không dùng bản sao trong tài liệu này.

---

# PHẦN C — Quy trình sinh 2 file riêng cho dự án

**Đầu vào:** KHUNG 1 + KHUNG 2 + yêu cầu cụ thể của dự án.
**Đầu ra:** 2 file đặt ở gốc repo dự án:

1. **`PROJECT.md`** — đặc tả dự án (điền từ mẫu `PROJECT.md` ở gốc repo khung, xem Phần B). Đây là "nguồn sự thật" về *cái gì cần xây*.
2. **`CLAUDE.md`** — luật vận hành cho AI, tinh chỉnh cho dự án này. Đây là "nguồn sự thật" về *AI phải làm việc thế nào*. (Xem file `CLAUDE.md` mẫu kèm theo — bản thiên về quản lý dự án.)

**Các bước sinh file (AI thực hiện cùng người dùng):**

1. **Thu thập yêu cầu:** AI hỏi người dùng đủ thông tin để điền `PROJECT.md`. Chỗ nào thiếu dữ kiện không tự xác minh → hỏi (theo ủy quyền contract §3d (phiên chính tự duyệt và ghi căn cứ khi quyết định đã được ủy quyền)), không tự đoán.
2. **AI góp ý & phản biện (bắt buộc):** Trước khi chốt, AI **chạy KHUNG 3** (research-first) và chủ động nêu:
   - **PHẦN A của KHUNG 3** — rà *mọi mặt* (bảo mật, pháp lý/quyền riêng tư, hiệu năng, a11y, quy mô, chi phí...), không chỉ vài mục.
   - **PHẦN B của KHUNG 3** — đề xuất công nghệ + **phiên bản ổn định đã xác minh bằng nguồn sống** (không đoán theo trí nhớ), cân bằng độ phổ biến ↔ năng lực; ghi ADR.
   - Phạm vi MVP có quá lớn không? Nên cắt gì?
   - Schema CSDL có lỗ hổng/thiếu ràng buộc/thiếu index không?
   - → Đề xuất bổ sung/sửa đổi cụ thể để dự án hoàn thiện nhất.
3. **Chốt `PROJECT.md`** sau khi người dùng đồng ý các góp ý.
4. **Sinh `CLAUDE.md`** cho dự án: điền các chỗ cụ thể (stack, lệnh, cấu trúc thư mục, quy ước) dựa trên `PROJECT.md`.
5. **Thiết lập hàng rào tự động** (pre-commit + CI) — theo file hướng dẫn cấu hình.
6. **Bắt đầu thực hiện theo từng giai đoạn** của KHUNG 1, qua cổng đầy đủ ở mỗi bước.

> Quy tắc vàng ở bước 2: AI **không được** chỉ làm theo yêu cầu một cách thụ động. Nếu AI thấy cách tốt hơn hoặc rủi ro tiềm ẩn, AI phải nói ra. Mục tiêu là dự án *hoàn hảo nhất*, không phải làm cho xong.

---

## Tóm tắt mối quan hệ các file

```
KHUNG 1 (quy trình + tiêu chuẩn)  ─┐
KHUNG 2 (luật AI + mẫu dự án)     ─┤──►  + Yêu cầu dự án cụ thể
                                   │
                                   ▼
              ┌─────────────────────────────────┐
              │  PROJECT.md   (đặc tả dự án)     │
              │  CLAUDE.md    (luật AI cho dự án)│
              └─────────────────────────────────┘
                                   │
                                   ▼
                 + Cấu hình pre-commit & CI (hàng rào)
                                   │
                                   ▼
                 Thực hiện theo 9 giai đoạn (KHUNG 1)
```
