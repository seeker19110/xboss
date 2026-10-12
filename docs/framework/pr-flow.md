# Quy trình PR → merge tự động và giải xung đột (luật đầy đủ của CLAUDE.md §8)

> **Nguồn sự thật của luật này là file này.** `CLAUDE.md` §8 chỉ giữ bản tóm tắt + trỏ sang đây (tách ra 2026-09-23 vì
> một dòng 3 553 ký tự trong CLAUDE.md làm luật "< 200 dòng" vô nghĩa — cổng `check-docs-consistency.sh` mục 9 nay
> chặn dòng > 2 000 ký tự và tổng byte tăng thêm). Đổi luật ở đây thì soát lại tóm tắt ở CLAUDE.md §8 và `AGENTS.md`.

## 1. Quy trình PR → merge tự động (BẮT BUỘC)

- **(0) Ngay khi tạo PR — cập nhật tài liệu mô tả thay đổi đó (CODEMAP.md, TRAPS.md nếu là bug, ADR nếu đổi kiến trúc…) và commit VÀO CÙNG PR, không tách PR riêng theo sau.** Đây là nguyên nhân phổ biến gây lệch/quên cập nhật — đợi tới lúc merge hoặc "làm PR dọn dẹp sau" luôn làm sót; nếu phát hiện thiếu cập nhật SAU khi đã tạo PR, sửa và push thêm commit vào đúng PR đang mở đó (chưa merge thì luôn còn kịp), không mở PR mới cho việc đáng lẽ đã nằm trong PR hiện tại. Sau khi **tạo PR**:
- (1) **đăng ký theo dõi** PR (`subscribe_pr_activity`) và **đặt lịch tự kiểm tra mỗi 5 phút** (mặc định — xem `CLAUDE.md` §10); **chỉ bật auto-merge SAU KHI mô tả PR đã đầy đủ** — đủ mục PR template (Summary/Issue-Goal/Research-Spec/Validation/Risk/DoD, hoặc mục tương đương repo dùng) và đã gồm bước (0) ở trên — vì bật auto-merge trước rồi mới sửa mô tả sẽ tốn một vòng CI đỏ oan ở cổng `metadata` (thiếu mục PR template); soát lại mô tả xong mới gọi `enable_pr_auto_merge`/`gh pr merge --auto` nếu công cụ đang dùng hỗ trợ — nền tảng tự merge khi cổng xanh và không xung đột, không cần tự tay canh rồi gọi lệnh merge riêng; công cụ không hỗ trợ thì làm thủ công:
- (2) khi CI **xanh** → **merge vào `main`** (squash); nếu **đỏ** → sửa rồi kích lại, chưa xanh thì **chưa merge**.
- (3) **Luôn quay về `main`** sau khi merge (nền làm việc mặc định là `main`).
- (4) **FIFO — không nhảy cóc:** PR nào **tạo trước merge trước**; nhiều PR mở cùng lúc thì merge lần lượt theo thứ tự tạo, merge xong PR trước (cập nhật lại nhánh sau với `main` nếu cần) mới tới PR kế. **Trần WIP = tối đa 5 PR mở đồng thời** (tính mọi PR chưa merge/chưa đóng trên repo, mọi tác giả — người lẫn AI, mọi mô hình): đã có 5 PR mở thì **KHÔNG mở PR thứ 6** — merge hoặc đóng bớt một PR đang mở trước, rồi mới tạo mới; việc cần gấp thật sự thì hỏi người dùng có đồng ý đóng/gộp một PR đang treo để nhường chỗ, không tự ý vượt trần. Trần này áp cho toàn repo, không riêng luồng `coordinator`/subagent.
- (5) **Cập nhật `PROGRESS.md` NGAY sau khi quay về `main`** (SHA đã đối chiếu = HEAD mới, xoá/đổi dòng "Nhánh đang làm" nếu nhánh vừa merge) — đây là nguyên nhân số một khiến `PROGRESS.md` lỗi thời và làm việc lặp lại; job CI `progress-freshness` (`scripts/check-progress-freshness.sh`) chạy cả ở PR lẫn push vào `main` (`ci.yml`), nên `PROGRESS.md` lỗi thời làm đỏ ngay PR kế tiếp thay vì lọt vào `main`; PF-1 đỏ khi SHA đã đối chiếu trễ ≥ `PF_MAX_BEHIND` (mặc định 7 = trần WIP 5 + 1 commit squash + 1 nhịp dư) commit trên first-parent. **"Ngay" nghĩa là trước khi mở/merge PR kế tiếp, KHÔNG bắt buộc phải là một PR riêng chỉ để làm việc này** — mặc định gộp việc cập nhật vào PR của công việc kế tiếp (một commit đầu hoặc cuối nhánh đó); chỉ tách PR riêng khi công việc kế tiếp còn xa (vd chuyển việc khác, đóng phiên) và để `PROGRESS.md` lỗi thời quá lâu là rủi ro thật.
- Branch protection thật sự có hiệu lực (không chỉ ghi trong tài liệu) + khớp file khai báo: xem `.github/rulesets/main.json` + job CI `protection-guard` (`docs/ops/repository-settings.md`).

## 2. Giải xung đột merge/rebase

đọc commit/PR/issue gốc của **cả hai phía** để hiểu đúng ý định trước khi chọn hunk — không chọn theo cảm tính hay "bên nào dài hơn". Giữ ý định của cả hai khi có thể; khi không tương thích, chọn bên khớp mục tiêu của merge và ghi 1 dòng đánh đổi vào commit message. Không tự bịa hành vi mới. Merge commit cũng phải theo Conventional Commits — dùng `git merge -m "chore(merge): đồng bộ main (…)"` (`TRAPS.md` mục 48). Không dùng `gh pr update-branch` hay nút "Update branch" của GitHub: commit merge phía server có tiêu đề không conventional, `metadata` đỏ (`TRAPS.md` mục 48, tái phát #263). Xong mỗi hunk, chạy lại cổng (`/gate`) trước khi hoàn tất — **không bao giờ** `--abort` để né việc giải xung đột.

## 3. Cổng máy liên quan

- `pr-policy.yml` (job `metadata`): tiêu đề PR **và mọi tiêu đề commit** (kể cả merge/autofix — `TRAPS.md` mục 48) conventional, tiêu đề ≤ 72 ký tự, đủ mục PR template, Feature gate cho `feat`, trần WIP 5 PR mở, nhắc `TRAPS.md` cho `fix:`; dòng `Work ID: <ngày-slug>` phải trỏ tới `docs/work/<id>/working.md` hoặc `done.md` có thật trên nhánh PR (miễn trừ draft/bot).
- `check-progress-freshness.sh` (job `progress-freshness`): PF-1..PF-4 — bước (5) "cập nhật PROGRESS.md ngay sau khi về main" có cổng thật.
- `block-dangerous-git.sh` khuôn 3: cấm `--abort`; khuôn 1/5: cấm force-push / xoá / ép ghi đè nhánh chính.
