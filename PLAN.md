# PLAN.md — mẫu kế hoạch thi hành (tầng 1 → tầng 2)

> **Trạng thái:** KHÔNG có kế hoạch nào đang chờ kích hoạt. Kế hoạch trước đây trong tệp này
> (đợt M115→M117 + M118, tự động triển khai bản vẽ MEPF từ tuyến tim trên plugin AutoCAD) đã
> **hết hiệu lực**: toàn bộ cụm CAD/BIM + plugin AutoCAD bị gỡ khỏi sản phẩm ngày 2026-09-04
> (xem `PROGRESS.md` mục "Gỡ toàn bộ cụm CAD/BIM khỏi sản phẩm — đợt 3"), các đặc tả M115–M118
> đã xoá cùng đợt. Lịch sử tệp còn trong git nếu cần tra cứu.
>
> Phần dưới là **khung mẫu** để phiên chính (tầng 1) xuất kế hoạch mới theo mô hình 3 tầng trong
> `CLAUDE.md` mục "Lập kế hoạch → điều phối → thi hành". Khi có kế hoạch thật: thay nội dung mẫu
> bằng kế hoạch, giữ nguyên các tiêu đề, rồi giao **nguyên văn** tệp cho `coordinator`.

# PLAN.md — Đợt <tên đợt>: <một câu mục tiêu>

**Cập nhật:** <YYYY-MM-DD> · **Nguồn:** `docs/nang-cap/M<xx>-*.md` (**Approved <ngày>**), …
**Nhánh nền:** `<tên nhánh>` — base MỌI worktree trên nhánh này (trước khi bắt đầu: `git fetch origin`
và rebase nhánh nền lên `origin/main` mới nhất nếu main đã tiến — bài học M32/M33/M34 trong
`PROGRESS.md`).
**Trạng thái thi hành:** CHƯA KÍCH HOẠT / ĐANG THI HÀNH — khi kích hoạt: giao nguyên văn tệp này cho
`coordinator`.

## Bối cảnh & ràng buộc CỨNG cho mọi việc

- Worker không thấy hội thoại. Bắt buộc đọc trước: `CLAUDE.md`; TOÀN BỘ đặc tả M của việc mình;
  code hiện trạng nêu trong brief.
- Ràng buộc kiến trúc áp cho cả đợt (ADR liên quan, miền `lib/` theo ADR-0007, route chỉ là ranh
  giới HTTP theo ADR-0008, migration append-only, quy tắc tiền tệ trên bigint…).
- Vùng rủi ro cao trong `docs/audit.md` mà đợt này chạm (nếu có) → mọi việc chạm vùng đó phải rà
  theo mục "Vùng rủi ro cao" trước khi báo xong.
- Tiếng Việt toàn bộ UI/thông báo/comment/commit. Worker KHÔNG push — commit trong worktree,
  coordinator tích hợp tuần tự vào nhánh nền.
- Cổng mỗi việc: `npm run lint` + `npm run typecheck` + test node liên quan xanh (không làm đỏ ca
  cũ); việc chạm UI thêm `npm run build`; việc thêm migration thêm `npm run check:migrations`.
- Việc cuối mỗi pha cập nhật `PROGRESS.md` + trạng thái trong `docs/nang-cap/README.md`.

---

# Pha 1 — M<xx>: <tên> (làm TRƯỚC, trọn pha rồi mới sang Pha 2)

**Đặc tả:** `docs/nang-cap/M<xx>-*.md`. <Có/không migration, có/không API mới.>

## Việc V1 — <tên việc> (M<xx> PR1) — `route: complex | spec | standard | mechanical`

Đặc tả §<mục>, §<FR>, §<AC>.

1. <Bước 1 — file cụ thể, schema DDL/API/điểm chạm code.>
2. <Bước 2.>
3. <Test: ca dương/âm cho từng bất biến; file test chạm DB import `tests/setup.ts` đầu tiên.>

**Ranh giới được quyết** (chỉ với `route: complex`): <những gì worker được tự cân nhắc>. **KHÔNG
được:** <những gì cấm đổi>.
**Tiêu chí chấp nhận:** <đo được — cổng xanh, AC nào pass, số liệu nào không đổi>.

## Việc V2 — <tên việc> (M<xx> PR2) — `route: …` (SAU V1)

…

---

## Thứ tự & phụ thuộc toàn đợt

V1 → V2 → … ‖ <việc nào song song được, khác vùng file nào>. Mỗi việc 1 worktree riêng; tên file như
brief để không đụng nhau. `reviewer` soát từng việc trước khi tích hợp tuần tự vào nhánh nền.
Coordinator KHÔNG push/mở PR — phiên chính duyệt cuối rồi quyết định push/PR theo quy ước repo.
