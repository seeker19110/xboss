---
description: Review code trước khi mở PR — gọi skill code-review (+ security-review nếu chạm vùng nhạy cảm), khác /gate là bước máy chạy lint/typecheck/test
---

Kích hoạt **rà soát code trước khi mở Pull Request**. Đây là bước đọc-hiểu (logic/thiết kế/tái sử
dụng), bổ sung cho việc chạy `npm run lint && npm run typecheck && npm test` — làm **cả hai**,
không thay thế nhau.

> **TRIGGER:** người dùng nói đã xong một tính năng/sửa lỗi và sắp mở PR ("xong rồi", "review giúp
> trước khi PR", "chuẩn bị PR"), hoặc tự thấy diff đủ lớn/đủ rủi ro logic trước khi đề xuất mở PR.

## Bước 1 — Xác định phạm vi diff

- Mặc định: diff hiện tại so với `main` (`git diff origin/main...HEAD`).
- Nếu người dùng chỉ định PR/nhánh/đường dẫn cụ thể → dùng đúng phạm vi đó.

## Bước 2 — Gọi skill `code-review`

Dùng `Skill(code-review)` ở effort phù hợp độ rủi ro của diff (mặc định `medium`; nâng `high` nếu
diff chạm nhiều file/luồng nghiệp vụ chính, hoặc đụng vùng rủi ro cao trong `docs/audit.md`:
`lib/tien-do/recompute.ts`, `lib/bao-mat/auth.ts`, `lib/vat-tu/material-sync.ts`,
`lib/khoi-luong/boq.ts`, route tài chính/nghiệm thu). Có thể giao thẳng cho subagent `reviewer`
(`.claude/agents/reviewer.md`) nếu muốn tách khỏi ngữ cảnh phiên chính.

## Bước 3 — Gọi thêm `security-review` nếu chạm vùng nhạy cảm

Diff đụng auth, thanh toán, dữ liệu người dùng thật, quyền truy cập, hoặc input từ bên ngoài chưa
rõ đã validate → gọi thêm `Skill(security-review)`.

## Bước 4 — Xử lý phát hiện

- Lỗi **correctness/bảo mật** xác nhận thật → sửa ngay, chạy lại lint/typecheck/test, review lại
  phần đã sửa.
- Gợi ý **đơn giản hoá/tái sử dụng** không bắt buộc → nêu cho người dùng quyết định (không tự ý
  refactor ngoài phạm vi PR).
- Không phát hiện gì đáng kể → báo ngắn gọn "review sạch, sẵn sàng mở PR".

## Ranh giới

- **Không thay thế** lint/typecheck/test/build — vẫn phải chạy đủ cổng ở mục "Definition of Done"
  của `CLAUDE.md` trước khi commit/push.
- **Không tự merge/tạo PR** thay người dùng nếu chưa được yêu cầu.
- Phát hiện vấn đề kiến trúc lớn (không phải bug cục bộ) → dừng và hỏi người dùng thay vì tự quyết
  sửa, đúng nguyên tắc "Thực hiện hành động cẩn trọng" trong system prompt.
