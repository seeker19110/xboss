# HOÀN THIỆN dự án — kế hoạch chi tiết & vòng lặp hội tụ (project completion)

> Trả lời câu hỏi: _"Làm sao đưa một dự án — nhất là dự án CÓ SẴN — lên trạng thái **không còn lỗi
> logic / lỗi cấu trúc / lỗ hổng ĐÃ BIẾT**, các tính năng **thống nhất** với nhau, và có **bằng chứng**?"_
> Cách làm: **lập kế hoạch chi tiết ngay từ đầu** → thực thi **từng bước có kiểm soát** → **quét lại
> đến khi sạch** (hội tụ) → nghiệm thu theo **Definition of Complete**.

**Quan hệ với tài liệu khác** (playbook này XÂU CHUỖI chúng thành một luồng, không thay thế):

- `existing-project-adoption.md` — dò hiện trạng + dựng hàng rào (Pha 0 dùng lại Bước 0 của file này).
- `docs/ops/comprehensive-audit-prompt.md` — quét 12 nhóm (Pha 1 chính là `/audit-full`).
- `/gate` — cổng commit/merge từng thay đổi (Pha 3 đi qua cổng này).
- `/audit-optimize` — playbook refactor không đổi hành vi (dùng cho các việc tối ưu trong kế hoạch).

## Khi nào dùng (`/completion`)

- Dự án **có sẵn** muốn "hoàn thiện tốt nhất có thể": hết lỗi đã biết, thống nhất, có bằng chứng.
- Dự án **mới** trước mốc lớn (ra mắt, bàn giao, gọi vốn) — rà tổng + đóng mọi lỗ hổng còn mở.
- **KHÔNG dùng** cho khung/template còn trống — đúng Bước -1 của `comprehensive-audit-prompt.md`:
  chưa có tính năng thật thì không có gì để hoàn thiện (chống ảo giác, `CLAUDE.md` §4).
- Người dùng chỉ nói ngắn gọn "tối ưu"/"kiểm tra lỗi" **không tự động** rơi vào đây — đây là lựa
  chọn "toàn diện nhất" trong nhiều lựa chọn nhẹ hơn (`/audit-optimize`, `/gate`, `code-review`,
  `/audit-full`). Xem `CLAUDE.md` mục 1b để hỏi rõ trước khi chọn đúng playbook này.

## Nguyên tắc (vi phạm = sai)

1. **Kế hoạch trước, sửa sau.** Mọi việc sửa phải nằm trong kế hoạch đã được người dùng duyệt.
2. **Bằng chứng, không cảm giác.** Mục nào "đã xong" phải kèm bằng chứng: lệnh đã chạy + output,
   test xanh, link PR. Không có bằng chứng = chưa xong.
3. **Truy vết đầy đủ:** phát hiện (F-xxx) → mục kế hoạch (W-xxx) → PR → bằng chứng. Không có mục
   "mồ côi" (sửa ngoài kế hoạch) và không có phát hiện bị bỏ rơi (mọi F-xxx phải có kết cục).
4. **Hội tụ:** sửa xong phải quét lại; kế hoạch chỉ đóng khi đạt tiêu chí thoát ở Pha 4.
5. **Refactor không đổi hành vi; sửa bug phải có test tái hiện trước** (đỏ → sửa → xanh).
6. **Đợt nhỏ, qua cổng.** Mỗi việc một PR nhỏ qua `/gate` — không "big bang", không gộp nhiều việc.

## 4 file trạng thái (tạo tại DỰ ÁN ĐÍCH — cho phép resume qua nhiều phiên)

| File                          | Vai trò                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `docs/FEATURE-MAP.md`         | **Bản đồ tính năng** — căn cứ rà chéo thống nhất (Nhóm 12) & lập kế hoạch (trả lời "có gì") |
| `docs/CONVENTIONS.md`         | **Sổ quy ước** — "một cách đúng duy nhất" cho mỗi pattern lặp lại (trả lời "viết thế nào")  |
| `CODEMAP.md` (gốc dự án)      | **Bản đồ sửa-ở-đâu** — trả lời "chạm vào đâu, chạy lại gì"                                  |
| `docs/ops/COMPLETION-PLAN.md` | **Kế hoạch hoàn thiện** — nguồn sự thật về tiến độ, đọc để tiếp tục                         |

(+ tái dùng `docs/ops/COMPREHENSIVE-AUDIT-STATUS.md` của `/audit-full` cho phần quét.)

---

## PHA 0 — Dò hiện trạng & lập nền

- [ ] Nếu dự án **chưa áp khung**: chạy trước Bước 0 của `existing-project-adoption.md`
      (AI tự dò stack → "Hồ sơ dự án" + `PROJECT.md` ngược + `PROGRESS.md` + `CLAUDE.md` điền thật).
- [ ] **Lập `docs/FEATURE-MAP.md`** (mẫu: `docs/framework/templates/FEATURE-MAP.template.md`): liệt kê MỌI tính năng/luồng — tên, mục đích,
      điểm vào (route/endpoint/command), dữ liệu đụng tới, trạng thái (ổn / nghi ngờ / dở dang),
      test hiện có. Đọc code thật để lập (route, menu, controller, command) — không đoán.
- [ ] **Khởi tạo `docs/CONVENTIONS.md`** (mẫu: `docs/framework/templates/CONVENTIONS.template.md`): với mỗi pattern lặp lại (validate,
      dạng lỗi API, check quyền, trạng thái UI, đặt tên, thời gian/tiền tệ, i18n…) chốt **một cách
      đúng duy nhất** + trỏ tới file ví dụ chuẩn. Chưa chốt được thì ghi "đang có N kiểu — cần hợp nhất".
- [ ] **Lập/cập nhật `CODEMAP.md`** (mẫu: `docs/framework/templates/CODEMAP.template.md`, ở gốc dự án):
      với mỗi khu vực/package chính, một dòng dạng bảng gồm 3 cột — thay đổi thường gặp, file/thư mục
      cần sửa, lệnh/cổng cần chạy lại. Đọc code + `package.json`/Makefile thật để biết lệnh nào chạy
      đúng — không đoán. File đã tồn tại (từ lần `/completion` trước) → rà lại cho khớp cấu trúc hiện
      tại, đừng viết lại từ đầu.
- [ ] **Cổng Pha 0:** người dùng xác nhận Hồ sơ dự án + Bản đồ tính năng (đúng/đủ chưa) trước khi quét.

## PHA 1 — Audit toàn diện (12 nhóm — chỉ đọc & đo, KHÔNG sửa)

- [ ] Chạy đúng `docs/ops/comprehensive-audit-prompt.md` (tức `/audit-full`), đủ các nhóm áp dụng
      theo hồ sơ — đặc biệt **Nhóm 12 (thống nhất chéo tính năng)** dùng `FEATURE-MAP` làm căn cứ.
- [ ] Mỗi phát hiện gán **ID cố định `F-001`, `F-002`…** + vị trí (file:dòng) + mức độ (Cao/Trung/Thấp) + rủi ro nếu để nguyên. ID này dùng truy vết suốt vòng đời kế hoạch.
- [ ] Cập nhật `COMPREHENSIVE-AUDIT-STATUS.md` ngay sau mỗi nhóm (resume được nếu đứt phiên).

## PHA 2 — Lập KẾ HOẠCH HOÀN THIỆN chi tiết (điểm khác biệt của playbook này)

Từ báo cáo audit + Bản đồ tính năng, lập `docs/ops/COMPLETION-PLAN.md` (mẫu: `docs/framework/templates/COMPLETION-PLAN.template.md`):

- [ ] **Chốt Definition of Complete (DoC)** — nghiệm thu cấp DỰ ÁN (khác DoD cấp tính năng). Lấy
      mẫu mặc định ở cuối file, chỉnh theo hồ sơ dự án, **người dùng duyệt cùng kế hoạch**.
- [ ] **Chia ĐỢT (wave)** theo nguyên tắc: rủi ro cao/giá trị cao trước; việc chặn việc khác đi trước;
      mỗi đợt đủ nhỏ để kết thúc gọn. Thứ tự mặc định: 1. Lỗ hổng bảo mật + nguy cơ mất/hỏng dữ liệu (Nhóm 2, 10) 2. Lỗi logic nghiệp vụ (Nhóm 3) 3. Thống nhất chéo tính năng + cấu trúc (Nhóm 12, 1) — hợp nhất logic phân kỳ về một nguồn sự thật 4. Lấp test/hàng rào còn thiếu (Nhóm 4, 8) 5. Hiệu năng + a11y/UI-UX (Nhóm 5, 6) 6. Tối ưu mã nguồn + dependency + tài liệu đồng bộ (Nhóm 7, 9, 11 + `/audit-optimize`)
- [ ] **Mỗi việc một dòng** trong kế hoạch: ID `W-xxx` · phát hiện gốc (F-xxx, có thể nhiều) ·
      mô tả · **tiêu chí nghiệm thu đo được** · phụ thuộc (W-yyy) · ước lượng (S/M/L) · trạng thái.
- [ ] **DỪNG — trình kế hoạch + DoC cho người dùng duyệt** (một cổng phê duyệt; theo ủy quyền contract §3d phiên chính tự duyệt và ghi căn cứ khi quyết định đã được ủy quyền — `CLAUDE.md` §9 chỉ hỏi phần vượt quyền).
      Chỉnh theo phản hồi. **Chưa duyệt thì chưa sửa bất cứ gì.**

## PHA 3 — Thực thi từng đợt có kiểm soát

Với từng việc trong đợt đang mở (theo đúng thứ tự phụ thuộc):

- [ ] Một nhánh riêng (`fix/…`, `refactor/…`) → một PR nhỏ → qua đủ cổng `/gate` (`CLAUDE.md` §5–§7).
- [ ] **Bug/lỗ hổng:** viết test TÁI HIỆN lỗi trước (chạy phải đỏ) → sửa → test xanh. Test này ở lại
      vĩnh viễn làm test hồi quy — mỗi lỗi chỉ được phép xuất hiện một lần.
- [ ] **Việc thống nhất (Nhóm 12):** hợp nhất về một nguồn sự thật, cập nhật `CONVENTIONS.md`
      (pattern đã chốt), refactor không đổi hành vi + có test bảo vệ.
- [ ] **Cập nhật `COMPLETION-PLAN.md` NGAY sau mỗi việc** (trạng thái + link PR + bằng chứng) —
      không đợi cuối đợt; đứt phiên vẫn resume đúng chỗ.
- [ ] **Cuối mỗi đợt:** chạy TOÀN BỘ test + smoke luồng chính; cập nhật `PROGRESS.md`.

## PHA 4 — Re-audit hội tụ & nghiệm thu

- [ ] **Sau mỗi đợt:** quét lại các nhóm audit **bị ảnh hưởng** bởi đợt đó (không cần cả 12) —
      xác nhận phát hiện đã đóng thật + không phát sinh phát hiện mới do chính việc sửa.
- [ ] **Sau đợt cuối:** quét lại **toàn bộ 12 nhóm** một lượt (nhanh hơn lần đầu vì đã có trạng thái).
- [ ] **Tiêu chí thoát (hội tụ):** 1. **0 phát hiện mức Cao còn mở.** 2. Mọi phát hiện Trung/Thấp còn lại đều có **quyết định ghi nhận**: "sửa ở đợt sau" (vào kế
      hoạch mới) hoặc "chấp nhận rủi ro" (ghi vào `PROGRESS.md` nợ kỹ thuật, kèm lý do). 3. Lượt quét gần nhất **không phát sinh phát hiện Cao mới** (nếu có → mở đợt bổ sung, lặp Pha 3–4).
- [ ] **Nghiệm thu:** đối chiếu TỪNG mục Definition of Complete (mỗi mục kèm bằng chứng) → xuất
      **BÁO CÁO HOÀN THIỆN** cuối cùng → người dùng xác nhận đóng kế hoạch. Việc phát sinh sau đó
      là chu kỳ mới (kế hoạch mới), không mở lại kế hoạch đã đóng.

---

## Definition of Complete mặc định (chỉnh theo hồ sơ dự án khi lập kế hoạch)

- [ ] 0 phát hiện audit mức **Cao** còn mở; Trung/Thấp còn lại đều có quyết định ghi nhận.
- [ ] Mọi luồng chính trong `FEATURE-MAP` có **E2E/integration test** đi qua (hồ sơ không UI dùng
      test tương đương); toàn bộ test xanh trên CI.
- [ ] Mọi bug từng sửa trong kế hoạch có **test hồi quy** ở lại.
- [ ] **Nhóm 12 sạch:** không còn logic trùng lặp phân kỳ đã biết; pattern trong `CONVENTIONS.md`
      được tuân thủ ở mọi tính năng (hoặc lệch có ghi nhận).
- [ ] Cổng chất lượng tự động đang CHẶN thật: pre-commit + CI + branch protection (thử vi phạm phải bị chặn).
- [ ] Bảo mật: quét dependency + secrets sạch; kiểm soát truy cập (RLS/ACL) đã test bằng ca "thử vượt quyền".
- [ ] Tài liệu khớp code thật: `PROJECT.md`, `CLAUDE.md` §10, `FEATURE-MAP`, ADR không còn mục lỗi thời.
- [ ] Hiệu năng đạt ngân sách theo hồ sơ (CWV / p95 / thời gian chạy) — đo thật, ghi số.
- [ ] `PROGRESS.md` phản ánh đúng trạng thái + nợ kỹ thuật còn lại (nếu có) đều có chủ đích.

## Mẫu 4 file làm việc (bản mẫu sạch trong `docs/framework/templates/`)

Không chép tay từ tài liệu — copy thẳng file mẫu rồi điền (một nguồn sự thật, không phân kỳ):

| File cần tạo ở dự án đích     | Bản mẫu                                                | Pha dùng |
| ----------------------------- | ------------------------------------------------------ | -------- |
| `docs/FEATURE-MAP.md`         | `docs/framework/templates/FEATURE-MAP.template.md`     | Pha 0    |
| `docs/CONVENTIONS.md`         | `docs/framework/templates/CONVENTIONS.template.md`     | Pha 0    |
| `CODEMAP.md` (gốc dự án)      | `docs/framework/templates/CODEMAP.template.md`         | Pha 0    |
| `docs/ops/COMPLETION-PLAN.md` | `docs/framework/templates/COMPLETION-PLAN.template.md` | Pha 3    |

(`copy-framework.sh`/`.ps1` copy nguyên thư mục `docs/framework/` nên dự án đích luôn có sẵn 4 bản mẫu này.)
