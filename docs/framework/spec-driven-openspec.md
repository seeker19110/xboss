# SPEC-DRIVEN — Lớp đặc tả từng thay đổi với OpenSpec (TÙY CHỌN)

> **Tùy chọn, không bắt buộc.** Khung đã có spec cấp **dự án** (`PROJECT.md`, GĐ 0–2, DoD/DoR, ADR).
> Tài liệu này bổ sung lớp còn thiếu: **spec cấp từng thay đổi** (per-change) trong GĐ 4+ —
> proposal → specs → design → tasks lưu trong Git, thay vì để yêu cầu nằm rải trong lịch sử chat.
> Công cụ dùng: **OpenSpec** (spec-driven development cho AI coding assistant).

## 0. Dữ kiện đã xác minh (research-first — kiểm lại khi áp dụng)

| Mục | Giá trị | Nguồn |
|-----|---------|-------|
| Repo | github.com/Fission-AI/OpenSpec (~59k stars, bảo trì tích cực) | GitHub |
| Gói npm | `@fission-ai/openspec` | npmjs.com |
| Phiên bản khi viết | v1.5.0 (28/06/2026) | GitHub Releases |
| Yêu cầu | Node.js ≥ 20.19.0 | README chính thức |
| Hỗ trợ | 25+ AI coding assistant (Claude Code, Cursor, Copilot, Codex…) | README chính thức |

> **Chống ảo giác:** bộ lệnh `/opsx:*` thay đổi theo phiên bản. Trước khi hướng dẫn người dùng
> hoặc tự chạy, xác minh bằng `openspec --help` + tài liệu chính thức trong repo OpenSpec —
> không trích từ trí nhớ. Khi áp dụng thực tế, giao subagent `version-check` kiểm phiên bản mới nhất.

## 1. OpenSpec lấp lỗ hổng nào của khung — và KHÔNG thay thế cái gì

**Lấp (giá trị thật):**
- **GĐ 4 trở đi**, mỗi thay đổi vừa/lớn hiện chỉ có tiêu chí chấp nhận trong `PROJECT.md` + trao đổi
  trong chat. Chat trôi → AI "quên ngữ cảnh", yêu cầu không có nguồn sự thật để đối chiếu khi review.
  OpenSpec cho mỗi thay đổi **một thư mục artifact trong Git** (`openspec/`): proposal, delta-spec,
  design, tasks — đúng nguyên tắc *"Một nguồn sự thật"* và *"Tài liệu hóa tại sao"* của KHUNG-1.
- **Delta spec**: mô tả *cái gì thay đổi so với spec hiện hành* — thứ khung chưa có công cụ nào ghi lại.
- **Operational hóa DoR**: proposal được duyệt = task đạt Definition of Ready (tiêu chí đo được,
  hết câu hỏi mở, phạm vi gói trong một PR) trước khi viết code.

**KHÔNG thay thế (khung vẫn là luật):**

| Thứ khung đã có | Quan hệ với OpenSpec |
|-----------------|----------------------|
| `PROJECT.md` (MVP, schema, kiến trúc, DoD) | Vẫn là spec **cấp dự án**; spec OpenSpec là **cấp thay đổi**, phải nhất quán với `PROJECT.md`. Mâu thuẫn → dừng và hỏi (§9). |
| 9 giai đoạn + cổng (KHUNG-1) | Không đổi. OpenSpec chỉ là công cụ **bên trong GĐ 4–5**. |
| Cổng commit/merge + `/gate` (CLAUDE.md §5–§7) | **Vẫn bắt buộc** cho mọi commit/merge — OpenSpec không có cổng chất lượng, không miễn cổng nào. |
| ADR (`docs/adr/`) | ADR ghi **quyết định & lý do** (một lần, bất biến); spec ghi **hành vi hiện hành** (sống, cập nhật). Quyết định kiến trúc lớn trong `design.md` vẫn phải chốt bằng ADR. |
| DoR/DoD (KHUNG-1 GĐ 1) | Proposal được duyệt = bằng chứng đạt DoR. DoD không đổi. |
| `PROGRESS.md` | Vẫn cập nhật như cũ; có thể trỏ tới change-folder đang mở. |

## 2. Bản đồ khái niệm

| OpenSpec | Tương ứng trong khung |
|----------|------------------------|
| `proposal.md` (ý tưởng, mục tiêu, phạm vi) | Đề xuất chủ động (CLAUDE.md §2) + kiểm DoR |
| `specs/` (yêu cầu chi tiết, hành vi, ràng buộc) | Tiêu chí chấp nhận đo được (GĐ 1) ở mức chi tiết hơn |
| `design.md` (thiết kế kỹ thuật, API, luồng dữ liệu) | GĐ 2 thu nhỏ cho một thay đổi; quyết định lớn → ADR |
| `tasks.md` (danh sách việc) | Nguyên tắc "Chia nhỏ" (CLAUDE.md §2) |
| Archive sau khi xong | Nguyên tắc "Tài liệu hóa tại sao" — lịch sử spec trong Git |

## 3. Khi nào DÙNG / KHÔNG dùng

**Nên dùng khi** (bật cho dự án, dùng cho từng thay đổi đủ lớn):
- Thay đổi vừa/lớn: tính năng mới nhiều bước, đổi hành vi có ràng buộc, việc kéo dài nhiều phiên.
- Dự án brownfield: muốn ghi lại spec hành vi hiện hành trước khi sửa.
- Nhiều người (hoặc nhiều AI/phiên) cùng làm — cần nguồn sự thật chung ngoài chat.
- Muốn review **requirement trước khi review code** (bắt lỗi rẻ nhất — shift-left).

**KHÔNG dùng khi** (chạy quy trình khung như bình thường là đủ):
- Sửa vài dòng, fix bug nhỏ, chore/refactor cơ học — proposal sẽ đắt hơn chính việc sửa.
- Prototype siêu nhanh / thử nghiệm vứt đi.
- Script vặt chạy một lần.

> Quy tắc ngón tay cái: việc **không gói gọn trong một PR nhỏ** hoặc **kéo dài > 1 phiên** → đáng có change-folder.

## 4. Cài đặt & khởi tạo (khi người dùng chốt dùng)

```bash
npm install -g @fission-ai/openspec@latest   # cần Node ≥ 20.19
cd <dự-án>
openspec init                                 # chọn AI assistant đang dùng (vd Claude Code)
```

`openspec init` sinh thư mục `openspec/` (chứa các change-folder + spec hiện hành) và đăng ký
bộ lệnh `/opsx:*` cho công cụ AI đã chọn. Commit thư mục `openspec/` vào Git — đó là mục đích chính.

## 5. Quy trình chuẩn khi đã bật (gắn vào GĐ 4–5)

1. **Đề xuất:** nhận yêu cầu thay đổi đủ lớn → tạo proposal (`/opsx:propose` hoặc lệnh tương đương
   của phiên bản đang cài). AI chủ động góp ý ngay ở bước này (CLAUDE.md §2) — rẻ hơn góp ý khi đã có code.
2. **Duyệt = cổng DoR:** người dùng duyệt proposal + spec rồi mới code. Chưa duyệt → chưa viết code.
3. **Thiết kế & tasks:** thay đổi đụng kiến trúc/API → viết `design.md`; quyết định lớn → chốt bằng `/adr`.
4. **Thực thi theo tasks:** làm từng task nhỏ; mỗi commit/merge **vẫn qua `/gate` đầy đủ** (§5–§7).
   Spec là tiêu chí đối chiếu khi tự review diff.
5. **Đồng bộ & lưu trữ:** xong và merge → đồng bộ delta vào spec chính + archive change-folder
   (lệnh sync/archive theo phiên bản). Cập nhật `PROGRESS.md` như mọi mốc khác.

**Ưu tiên khi xung đột:** CLAUDE.md + KHUNG-1/2/3 > `PROJECT.md` > spec OpenSpec của thay đổi.
Spec mâu thuẫn với tài liệu cấp trên → không tự chọn: căn theo nguồn sự thật đã khai, chỉ hỏi phần không tự xác minh được (CLAUDE.md §9, contract §3d).

## 6. Ranh giới trung thực

- OpenSpec **không làm AI viết code nhanh hơn** — nó làm AI viết **đúng hơn** nhờ yêu cầu rõ trước khi code. Chi phí: thêm bước viết/duyệt artifact cho mỗi thay đổi.
- Đây là dependency công cụ ngoài (global npm CLI) — dự án không cài vẫn dùng khung bình thường;
  mọi giá trị cốt lõi (cổng, DoR, ADR, chống ảo giác) đã có trong khung, OpenSpec chỉ *cơ giới hóa* phần per-change.
- Khung không tự động cài OpenSpec ở `/bootstrap` hay `/consult`. AI chỉ **đề xuất** khi thấy dự án
  khớp mục 3 (nhiều phiên, nhiều người, brownfield phức tạp) — người dùng chốt mới cài (đúng nếp `/consult`).
