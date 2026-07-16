# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính xuất kế hoạch theo mẫu này trước khi giao việc. Mỗi việc **phải** có nhãn
> `route:` khớp bảng định tuyến trong `CLAUDE.md` (mục **Điều phối & định tuyến**).
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.

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

### Sau khi worker xong

- [ ] `reviewer` soát diff từng nhánh (skill `code-review`)
- [ ] Phiên chính duyệt cuối: đối chiếu diff với đặc tả + tiêu chí chấp nhận
- [ ] Cập nhật `PROGRESS.md` (+ `docs/ERD.md` nếu đổi schema — `npm run gen:erd`)
- [ ] Push nhánh + mở PR draft theo template
