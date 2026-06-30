# KHUNG 2 — Luật AI & Mẫu định nghĩa dự án

> **File khung chung (master), tái sử dụng cho MỌI dự án.**
> Gồm: (A) luật ứng xử bắt buộc cho AI, (B) mẫu định nghĩa dự án để điền, (C) quy trình biến hai khung + yêu cầu dự án thành 2 file riêng cho dự án.
> Cặp đôi với **KHUNG 1** (quy trình + tiêu chuẩn).

---

# PHẦN A — Luật ứng xử bắt buộc cho AI

## Nguyên tắc cốt lõi
1. **Không bao giờ nói "xong" khi chưa thực sự chạy kiểm tra và đọc kết quả thật.** Cấm đoán kết quả lệnh.
2. **Mặc định nghi ngờ chính mình.** Tự review diff của mình như review code người khác.
3. **Thà dừng lại hỏi còn hơn làm sai.** Không chắc → DỪNG và HỎI.
4. **Không "ảo giác".** Mọi hàm/thư viện/API phải *thực sự tồn tại* — xác minh, không bịa.
5. **Chủ động góp ý.** Khi thấy cách làm tốt hơn, rủi ro tiềm ẩn, hoặc thiếu sót trong yêu cầu, AI phải nêu ra — không im lặng làm theo nếu biết có vấn đề.

## Cổng 1 — Trước khi COMMIT (pre-commit gate)
AI phải hoàn thành và báo cáo TẤT CẢ trước khi đề xuất commit:
1. Build thành công.
2. Type check sạch (không lỗi, không dùng `any` để né).
3. Lint sạch (0 lỗi, 0 cảnh báo).
4. Đã format.
5. Test liên quan xanh.
6. Tự review toàn bộ diff — đúng mục tiêu, không sửa nhầm.
7. Không còn rác (console.log debug, code chết, comment thừa).
8. Không có bí mật (API key, mật khẩu, token) trong code.
9. Mọi đầu vào người dùng/API đã validate.
10. Mọi thao tác có thể fail đều có xử lý lỗi.
11. Commit message theo conventional commits, nêu rõ "cái gì" + "tại sao".

## Cổng 2 — Trước khi MERGE (pre-merge gate)
Khắt khe hơn vì ảnh hưởng nhánh chính. AI phải xác minh thêm:
1. Đạt toàn bộ cổng commit.
2. Chạy TOÀN BỘ test (không chỉ phần liên quan) — tất cả xanh.
3. Nhánh đã cập nhật với nhánh chính mới nhất, không xung đột.
4. Đối chiếu đủ tiêu chí chấp nhận của tính năng.
5. Đối chiếu Definition of Done.
6. Tự chạy smoke test luồng chính (thật, không giả định).
7. Rà soát bảo mật: quyền phía server, validate đầu vào, không lộ dữ liệu.
8. Xác nhận không phá vỡ tính năng khác; ghi rõ nếu có breaking change.
9. Nếu đổi schema: có migration có phiên bản, rollback được; tài liệu đã cập nhật.
10. Liệt kê các phần hệ thống bị ảnh hưởng.

## Quy tắc chống "ảo giác"
- Không bịa API/hàm/thư viện — xác nhận tồn tại (đọc tài liệu/mã nguồn) trước khi dùng.
- Không giả định cấu trúc dự án — đọc file thật để biết cấu trúc, tên, kiểu dữ liệu.
- Không đoán output lệnh — thực sự chạy và đọc kết quả.
- Khẳng định kỹ thuật nên kèm nguồn (tài liệu chính thức) khi có thể.

## Khi nào AI PHẢI dừng và hỏi
- Yêu cầu mơ hồ / nhiều cách hiểu.
- Thao tác không thể hoàn tác (xóa dữ liệu, đổi schema phá vỡ).
- Mâu thuẫn giữa yêu cầu mới và code/thiết kế hiện có.
- Breaking change ảnh hưởng nhiều nơi.
- Nhiều giải pháp với đánh đổi khác nhau đáng kể.
- Đụng bảo mật, thanh toán, dữ liệu người dùng thật.

## Mẫu BÁO CÁO XÁC THỰC (bắt buộc trước commit/merge)
```
BÁO CÁO XÁC THỰC
────────────────
Build:           ✅ / ❌
Type check:      ✅ / ❌  (số lỗi: ...)
Lint:            ✅ / ❌  (lỗi/cảnh báo: ...)
Format:          ✅ / ❌
Test:            ✅ / ❌  (X/Y xanh)
Tự review diff:  ✅      (tóm tắt: ...)
Không bí mật/rác: ✅
Tiêu chí chấp nhận: ✅   (đối chiếu từng mục)
Definition of Done: ✅
Rủi ro/ảnh hưởng:  (liệt kê hoặc "không có")
Góp ý cải tiến:    (nếu có)

KẾT LUẬN: Sẵn sàng commit/merge  HOẶC  Cần xử lý: [danh sách]
```
Nếu bất kỳ mục nào ❌ → sửa trước, chạy lại toàn bộ, KHÔNG commit/merge.

---

# PHẦN B — Mẫu định nghĩa dự án (điền để tạo `PROJECT.md`)

> Sao chép khối này, điền đầy đủ cho từng dự án. Kết quả là `PROJECT.md` — đặc tả chính thức của dự án.

```markdown
# PROJECT.md — [Tên dự án]

## 1. Vấn đề & Người dùng
- Vấn đề (1–2 câu):
- Người dùng mục tiêu (cụ thể):
- Bằng chứng nhu cầu:
- Đối thủ & điểm khác biệt:

## 2. Phạm vi MVP (MoSCoW)
- Must have: (mỗi mục kèm tiêu chí chấp nhận)
- Should have:
- Could have:
- Won't have (lúc này):

## 3. Yêu cầu phi chức năng
- Tốc độ mục tiêu (vd Lighthouse ≥ ...):
- Bảo mật (vd RLS, xác thực, ...):
- Accessibility (vd WCAG AA):
- Thiết bị/trình duyệt hỗ trợ:

## 4. Tech stack
- Frontend / Backend / CSDL / Hosting / Khác:

## 5. Thiết kế dữ liệu
- Các bảng + cột + ràng buộc + quan hệ + index:
- Chính sách RLS:

## 6. Kiến trúc & API
- Sơ đồ luồng (client ↔ server ↔ CSDL):
- Danh sách endpoint (đầu vào / đầu ra / mã lỗi):
- Logic nào ở server (nhạy cảm):

## 7. Luồng người dùng chính
- (mô tả từng bước từ vào app đến đạt mục tiêu)

## 8. Definition of Done (DoD)
- (sao chép từ KHUNG 1, điều chỉnh nếu cần)

## 9. Lộ trình & Mốc thời gian
- (chia theo đợt/sprint, mỗi đợt một mục tiêu rõ)

## 10. Rủi ro & Giả định
- (sổ rủi ro: giả định nguy hiểm nhất + cách kiểm chứng)
```

---

# PHẦN C — Quy trình sinh 2 file riêng cho dự án

**Đầu vào:** KHUNG 1 + KHUNG 2 + yêu cầu cụ thể của dự án.
**Đầu ra:** 2 file đặt ở gốc repo dự án:

1. **`PROJECT.md`** — đặc tả dự án (điền từ Mẫu ở Phần B). Đây là "nguồn sự thật" về *cái gì cần xây*.
2. **`CLAUDE.md`** — luật vận hành cho AI, tinh chỉnh cho dự án này. Đây là "nguồn sự thật" về *AI phải làm việc thế nào*. (Xem file `CLAUDE.md` mẫu kèm theo — bản thiên về quản lý dự án.)

**Các bước sinh file (AI thực hiện cùng người dùng):**

1. **Thu thập yêu cầu:** AI hỏi người dùng đủ thông tin để điền Mẫu Phần B. Chỗ nào thiếu/mơ hồ → hỏi, không tự đoán.
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
