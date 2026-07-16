# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: <tên đợt việc> (YYYY-MM-DD)

### Bối cảnh & mục tiêu

<Vì sao làm; trỏ tới đặc tả nguồn: `docs/nang-cap/M<xx>-*.md`/`G<nn>-*.md`, `PROJECT.md`/`spec.md`, hoặc yêu cầu người dùng đã chốt qua AskUserQuestion (ghi ngày hỏi + câu trả lời).>

### Việc

#### 1. <tên việc>

- `route:` `complex` | `spec` | `standard` | `mechanical`
- agent: `complex-implementer` | `spec-executor` | `standard-worker` | `mechanical-worker`
- đặc tả: <đường dẫn file, hoặc viết đặc tả đầy đủ ngay trong brief — cấm để trống/mơ hồ>
- nhánh/worktree: `claude/<slug>` — mỗi việc song song 1 worktree riêng, base `origin/main` mới nhất (`git fetch origin` trước); ghi rõ **số migration** việc này chiếm (nếu có) để các việc song song không đụng số.
- brief (subagent không thấy hội thoại — viết đủ: file cụ thể, quy ước liên quan, việc KHÔNG được làm; với `complex`: ranh giới quyết định được phép):
  - …
- tiêu chí chấp nhận:
  - [ ] `npm run lint` + `npm run typecheck` + `npm test` (+ `npm run build`) xanh
  - [ ] <tiêu chí nghiệp vụ cụ thể, đo được>

#### 2. …

### Thứ tự & phụ thuộc

<Việc nào trước/sau, việc nào chạy song song; ai chiếm số migration nào; điểm tích hợp.>

### Sau khi worker xong (coordinator thực hiện)

- [ ] Đối chiếu từng việc với tiêu chí chấp nhận (chạy lại lint/typecheck/test nếu cần xác nhận)
- [ ] `reviewer` soát diff từng nhánh (skill `code-review`)
- [ ] Tích hợp theo mục "Thứ tự & phụ thuộc" (số migration, rebase); va chạm lớn → báo phiên chính
- [ ] Báo cáo tổng hợp về phiên chính: trạng thái từng việc, nhánh + commit, kết quả reviewer, quyết định worker tự đưa ra, điểm vướng

### Duyệt cuối (phiên chính thực hiện)

- [ ] Đối chiếu diff với đặc tả + báo cáo coordinator
- [ ] Cập nhật `PROGRESS.md` (+ `docs/ERD.md` nếu đổi schema — `npm run gen:erd`)
- [ ] Push nhánh + mở PR draft theo template
