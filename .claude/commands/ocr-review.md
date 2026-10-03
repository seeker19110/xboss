---
description: Review diff theo luật XBoss gắn đường dẫn (OpenCodeReview, chế độ delegation — không cần API key) — checklist đúc từ docs/audit.md + TRAPS.md, ADR-0012
---

Review diff theo **luật review của dự án** trong `.opencodereview/` (ADR-0012): OCR làm phần tất định (chọn file cần review, gắn checklist đúng theo đường dẫn), còn bạn làm phần đọc-hiểu. Bổ sung cho `/review` và các cổng `check:*`/lint/test, không thay thế.

> **TRIGGER:** người dùng gõ `/ocr-review`, hoặc `/review` gọi lượt luật XBoss ở Bước 2(a). Đối số tuỳ chọn: `--commit <hash>` / `--from <ref> --to <ref>` / workspace (truyền nguyên cho OCR), `-b "<bối cảnh yêu cầu>"`, `--fix`.

## Bước 1 — Xác định phạm vi

- Mặc định: `git fetch origin main` rồi `npm run -s ocr -- delegate preview --from origin/main --to HEAD`.
- Người dùng chỉ định `--commit`/`--from --to`/workspace → truyền nguyên cho `delegate preview`. Có thể thêm `-b "<bối cảnh yêu cầu>"` để OCR ghi bối cảnh vào đầu ra.
- Đọc output: các dòng `- mode:`, `- merge_base:`, danh sách file. File bị loại hiện dạng `~~...~~ (excluded: <lý do>)` — bỏ qua, không review.
- **OCR không review Markdown** (`excluded: unsupported_ext`) — gồm lệnh/agent `.claude/**/*.md`, vốn là chỉ dẫn thực thi cho agent. Diff có đụng chúng thì tự đọc diff và soát theo quy ước `CLAUDE.md` (brief đủ ngữ cảnh, không nới quyền/ranh giới ngoài ý định). Hook `.sh` và `settings.json` thì OCR review bình thường.

## Bước 2 — Lấy luật cho các file reviewable

- Chạy `npm run -s ocr -- delegate rule <các file reviewable>`.
- Output chia `### Rule Group N: <nguồn> / <pattern>` + `Applies to:` (danh sách file) + `#### Content` (checklist). **Mỗi nhóm là checklist bắt buộc cho đúng các file đó** — không áp checklist của nhóm này cho file nhóm khác.

## Bước 3 — Đọc diff từng file và đối chiếu checklist

- Diff theo mode: range → `git diff <merge_base>..<to> -- <file>`; commit → `git show <hash> -- <file>`; workspace → `git diff HEAD -- <file>` (file mới chưa track thì đọc thẳng file).
- Review **chỉ dòng thay đổi**, đối chiếu từng mục checklist của nhóm luật. Đọc code xung quanh/route anh em để xác nhận trước khi kết luận (nguyên tắc ground-truth, `docs/audit.md` §1) — không báo theo suy đoán.

## Bước 4 — Báo cáo (tiếng Việt)

- Chỉ nêu mức **Cao** và **Trung bình**; mức Thấp bỏ im lặng.
- Mỗi phát hiện có: `file:dòng`, kịch bản cụ thể dẫn tới sai, mục luật bị vi phạm (tên mảnh, vd `tai-chinh`).
- Lỗi logic → đề xuất thêm test hồi quy.
- Không có gì đáng kể → báo ngắn gọn "review theo luật sạch".

## Sửa lỗi

- **Mặc định không tự sửa** (khác lệnh gốc của OCR) — chỉ báo cáo.
- Chỉ khi người dùng truyền `--fix`: sửa phát hiện mức Cao an toàn, rõ ràng, rồi chạy lại lint/typecheck/test liên quan. Phát hiện cần đổi thiết kế → dừng và hỏi.

## Dự phòng khi `npm run ocr` không chạy được (mất mạng)

`npx` cần mạng lần đầu để tải gói. Khi không chạy được: đọc `.opencodereview/rules/manifest.json`, với từng file trong diff tự chọn **mục `rules` khớp đầu tiên theo thứ tự** (glob doublestar, so chữ thường; `include`/`exclude` quyết định file có được review) và đọc các mảnh `fragments` tương ứng (kèm `_boi-canh.md`). **Ghi rõ trong báo cáo là đã dùng dự phòng.**

## Ranh giới

- Không sửa `.opencodereview/**` trong lúc review; luật thiếu/sai → báo người dùng.
- Không tự commit/push/merge/tạo PR.
