# ADR-0015: Lấy `/auto-complete` (bản port XBoss) — trong lượt này phiên chính tự quyết thay chủ repo, kể cả đặc tả M/L

- **Trạng thái:** Đã chấp nhận (chủ repo chọn trực tiếp 2 điểm trong phiên 2026-10-12: "Port bản XBoss" + "Tự quyết toàn bộ")
- **Ngày:** 2026-10-12
- **Sửa đổi:** ADR-0014 mục 4 ("giữ nguyên LUẬT CỨNG thiếu đặc tả thì hỏi") — thêm **một ngoại lệ** chỉ trong lượt
  `/auto-complete`; ngoài lượt đó LUẬT CỨNG giữ nguyên.
- **Nguồn upstream:** [`seeker19110/projects-template`](https://github.com/seeker19110/projects-template) @ `59bd1d1` —
  `.claude/commands/auto-complete.md`, `.claude/hooks/auto-complete-guard.sh`, `standard-delivery.md` §3d (ủy quyền +
  thang ưu tiên), `project-completion.md` (Pha 0–4)

## Bối cảnh

Lần nâng khung #632 (ADR-0014) loại `/auto`, `/auto-complete`, `/completion` vì chúng chạy trên `docs/work/<id>/`,
`scripts/dev-task.sh`, `subagent-dispatch.sh` (engine Python) và hook `auto-complete-guard` — hạ tầng XBoss không lấy.
Chủ repo cần một lệnh "làm tới xong" không phải trả lời từng cổng phê duyệt. Bản khung còn **mâu thuẫn trực tiếp** với
LUẬT CỨNG của `CLAUDE.md` ("thiếu đặc tả chi tiết thì HỎI, không đoán"): `/auto-complete` tự chốt kế hoạch, DoC và
kiến trúc thay chủ repo.

## Quyết định

1. **Port, không chép nguyên văn:** `.claude/commands/auto-complete.md` viết lại chạy trên artifact sẵn có — hồ sơ lượt
   `docs/nang-cap/auto/<ngày>-<slug>.md` (thay `docs/work/<id>/working.md`), đặc tả `docs/nang-cap/M<xx>`, `PLAN.md` +
   bảng `route:`, `npm run gate`, `reviewer`/`audit-*`, lộ trình `docs/ops/lo-trinh-*` + sổ nợ thay `COMPLETION-PLAN`.
   `/auto` và `/completion` **không** lấy riêng — chuỗi của chúng nằm trong lệnh này.
2. **Tự quyết toàn bộ trong lượt `/auto-complete`:** phiên chính tự viết + tự duyệt đặc tả M/L (ghi
   "Approved … phiên chính tự duyệt theo /auto-complete (ADR-0015)" + mục Giả định), tự duyệt kế hoạch/DoC/ADR, kể cả
   vùng §8 — theo thang (1) đúng + bảo mật + không mất dữ liệu → (2) ít hơn → (3) kiểm được → (4) nhanh/rẻ, mỗi quyết
   định một dòng trong hồ sơ để chủ repo audit sau.
3. **Không bao giờ tự quyết** (ghi `Blocked`/`Waiting` rồi dừng): deploy/production/staging/VPS và chạy migration lên
   DB thật; xoá/đổi phá vỡ dữ liệu thật; secret, biến môi trường production, quyền GitHub/branch protection; chi phí
   mới, `npx` gói ngoài `package.json`; ngoài phạm vi; viết lại lịch sử git; nới test/cổng; việc cần người/thiết bị
   thật; cùng một lỗi quá 3 lần.
4. **Sàn chất lượng không đổi:** test đỏ-trước cho fix logic, `risk-zone-gate` + `audit-*` bắt buộc ở vùng §8,
   `reviewer` tách người viết trước mỗi PR, `npm run gate`, CI xanh mới merge.
5. **Cưỡng chế bằng máy:** hook Stop `auto-complete-guard.sh` chặn kết lượt khi hồ sơ còn `Active` (dừng ở
   `Blocked`/`Waiting`/`Done`, trần `AUTO_COMPLETE_MAX_CONTINUES` = 20, lời cuối lặp, chuỗi đỏ ≥ 3);
   `pre-commit-gate.sh` ghi `.claude/.gate-red-streak` (cùng chữ ký lỗi thì tăng, xanh thì xoá). Test:
   `tests/claude-hooks.test.ts`.

## Lý do

- Hồ sơ thứ hai song song (`docs/work/`) cạnh `PROGRESS.md` + `docs/nang-cap/` là nguồn lệch tài liệu — bài học lặp
  lại nhiều lần của XBoss; engine Python không đáng thêm vào chuỗi công cụ TS (ADR-0014).
- Ủy quyền rõ phạm vi + nhật ký quyết định giữ được khả năng audit mà không chặn tiến độ; danh sách "không bao giờ tự
  quyết" giữ các thao tác khó đảo (dữ liệu thật, production, quyền, tiền) ở tay chủ repo.
- "Đừng dừng khi chưa xong" chỉ bằng văn xuôi không giữ được; tín hiệu dừng đọc từ file trạng thái chứ không từ lời
  khai của model.

## Các phương án đã cân nhắc

- **Chép nguyên văn khung** (`/auto` + `/completion` + `docs/work/` + `dev-task.sh` + engine Python) — bị loại: hệ hồ sơ
  thứ hai và Python trong chuỗi công cụ.
- **Giữ không lấy** (quyết định #632) — bị loại: chủ repo cần chế độ chạy tới xong.
- **Tự quyết chỉ trong đặc tả đã có** (thiếu đặc tả nghiệp vụ hoặc chạm §8 thì dừng hỏi) — chủ repo chọn "tự quyết
  toàn bộ" thay vì phương án này (2026-10-12).

## Hệ quả

- Tích cực: một lệnh đi từ mục tiêu tới PR đã merge + báo cáo hoàn thiện, nối tiếp được qua nhiều phiên.
- Đánh đổi: đặc tả nghiệp vụ có thể sai ý chủ repo → giảm bằng mục "Giả định" bắt buộc trong đặc tả tự duyệt và nhật ký
  quyết định; đảo được vì mọi thứ đi qua PR. Thao tác không đảo được nằm trong danh sách "không bao giờ tự quyết".
- Nâng khung về sau: `auto-complete.md` đã tuỳ biến nên `--upgrade` để bản khung cạnh bên (`.framework-new`).
