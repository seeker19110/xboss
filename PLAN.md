# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: M55 — BI qua Metabase self-host (schema `bi` an toàn + vận hành)

### Bối cảnh & mục tiêu

Hàng đợi thi hành đã chốt (`docs/nang-cap/README.md`, `PROGRESS.md` mục "Tiếp theo")
xếp M55 sau M53 PR4/M56 PR2. Người dùng yêu cầu **kiểm tra kỹ rồi làm luôn M55** —
đã grep code thật (`grep -rn "xboss_bi\|CREATE SCHEMA.*bi" .`, `ls migrations/`) và
xác nhận **M55 CHƯA triển khai**: không có schema `bi`, không có role `xboss_bi`,
không migration nào liên quan — chỉ có ghi chú kế hoạch trong `PROGRESS.md`. Đặc tả
đầy đủ đã có sẵn: `docs/nang-cap/M55-bi-metabase.md` (đọc trước khi thi hành, KHÔNG
lặp lại toàn văn ở đây — brief dưới đây trích + bổ sung điểm chạm code thật để
worker không phải tự dò lại từ đầu).

**Rủi ro trung tâm** (đã nêu trong đặc tả gốc, nhắc lại vì đây là lý do PR1 route
`complex` chứ không phải `spec`): Metabase đọc thẳng Postgres sẽ xuyên thủng toàn bộ
lớp quyền tầng app (masking tiền M50 PR2, scope dự án M22). Vì vậy: KHÔNG BAO GIỜ
cấp `xboss_bi` quyền trên schema `public`; mọi view `bi.*` phải whitelist cột tường
minh (không `SELECT *`), tôn trọng soft-delete (`WHERE deleted_at IS NULL` — xem
`migrations/0052_soft_delete.sql`: áp cho `contracts`, `variation_orders`,
`payment_certs`, `invoices`, `insurance_bonds`, `claims`), và loại cột nhạy cảm khỏi
view mặc định (nhóm `_fin` tách riêng cho giá trị tiền/đơn giá — đối chiếu
`lib/sensitive-fields.ts` để biết đúng trường nào là "tiền/đơn giá/tỷ lệ nhạy cảm").

### Việc 1 — M55 PR1: Schema `bi` + view whitelist + role chỉ-đọc

`route: complex` → `complex-implementer`

**Đặc tả nền**: `docs/nang-cap/M55-bi-metabase.md` mục "PR1" (đọc nguyên văn — DDL mẫu,
5 nguyên tắc viết view, danh sách ~15 view theo nhóm, tiêu chí test).

**Ranh giới được phép tự quyết** (đây là lý do route `complex` chứ không `spec` —
đặc tả liệt kê ~15 view theo TÊN NHÓM, không có DDL đầy đủ từng cột; worker phải tự
xác định cột thật bằng cách đọc migration):

- Số migration: dùng **`migrations/0071_bi_schema.sql`** (đã xác nhận 0070 là file
  mới nhất — `organizations.sql`; grep lại trước khi tạo phòng khi có nhánh khác
  chiếm số).
- Tự đọc schema thật của từng bảng nguồn qua `migrations/*.sql` (KHÔNG đoán tên cột)
  trước khi viết mỗi view. Bảng nguồn chính đã xác nhận tồn tại: `tasks`,
  `work_packages`, `sheet_types`, `towers`, `projects`, `disciplines` (hệ — cột
  `code/name/color`), `task_history`, `contracts`, `contract_addenda`,
  `variation_orders`, `payment_certs`, `payment_cert_items`, `materials`,
  `material_transactions`, `purchase_orders`, `po_items`, `qc_inspections`, `ncrs`,
  `inspection_requests`, `hse_records`, `site_diaries`, `diary_manpower`, `users`
  (cột `id/name/email/password_hash/role`), `mv_progress_daily`, `mv_cost_by_month`
  (đã có sẵn từ M47 PR2, `migrations/0055_matviews.sql` — dùng làm nguồn cho
  `bi.task_history_daily`/`bi.cost_by_month_fin`, không tính lại).
- Được tự quyết đặt tên cột trong view (nên giữ camelCase→snake hoặc snake gốc nhất
  quán, ưu tiên dễ đọc cho người dùng Metabase hơn là khớp JSON API) và JOIN cụ thể
  (vd hệ/tháp/dự án cho `bi.tasks` phải JOIN phẳng qua `work_packages → sheet_types →
  towers → projects`, tương tự `mv_progress_daily` đã làm — xem CTE `task_scope`
  trong `migrations/0055_matviews.sql` làm mẫu JOIN chain đúng).
- Không có `qty_used`/`unit_price` nào tính bằng float JS trong view — mọi phép nhân
  tiền để nguyên trong SQL (`::numeric`), khớp ràng buộc M45 (`CLAUDE.md` mục "Tiền
  tệ"). View là VIEW thường (không phải bảng vật chất hoá) nên không cần refresh.
- `CREATE ROLE xboss_bi` **không nằm trong migration** (chạy tay lúc deploy, đã ghi
  rõ trong đặc tả gốc) — chỉ viết migration `GRANT USAGE ON SCHEMA bi TO xboss_bi` +
  `ALTER DEFAULT PRIVILEGES`; nếu role `xboss_bi` chưa tồn tại lúc migration chạy (CI/
  dev), câu `GRANT ... TO xboss_bi` sẽ lỗi — bọc trong `DO $$ BEGIN ... EXCEPTION WHEN
  undefined_object THEN NULL; END $$;` hoặc kiểm `pg_roles` trước khi GRANT, để
  migration vẫn idempotent/an toàn chạy trên máy chưa tạo role tay (CI Postgres sạch).

**Tiêu chí chấp nhận** (khớp đặc tả gốc mục "Test + tiêu chí chấp nhận"):

- `tests/bi-schema.test.ts` (integration, import `tests/setup.ts` đầu tiên, tự skip
  khi thiếu `TEST_DATABASE_URL`): (1) nếu role `xboss_bi` tồn tại trên DB test thì
  SELECT được mọi view `bi.*`; nếu role chưa được tạo tay trên máy chạy test, test
  này tự skip có ghi log rõ lý do (đừng fail cứng vì "chạy tay lúc deploy" nằm ngoài
  migration) — quyết định cách skip nằm trong ranh giới tự quyết của worker, miễn có
  comment giải thích. (2) **bất biến bắt buộc, KHÔNG được skip**: query
  `information_schema.columns WHERE table_schema='bi'` giao với blacklist cột cấm
  (đối chiếu `lib/sensitive-fields.ts`: `password_hash`, `email`, các trường tiền/đơn
  giá/tỷ lệ liệt kê trong file đó) trên MỌI view KHÔNG có hậu tố `_fin` — đỏ ngay khi
  ai thêm view quên luật (cùng triết lý bất biến `project-scope-invariant` đã có, xem
  test tương tự trong `tests/rls.test.ts` hoặc `tests/permissions.test.ts` làm mẫu
  phong cách viết bất biến). (3) view có bảng nguồn từng soft-delete thì kiểm điều
  kiện `deleted_at IS NULL` có mặt (query `pg_get_viewdef` chứa chuỗi, hoặc kiểm dữ
  liệu: soft-delete 1 dòng rồi xác nhận view không còn trả về).
- Thêm file test vào lệnh `npm test` trong `package.json`.
- `npm run lint`/`typecheck`/`build` xanh; `npm run gen:erd` chạy được (dù ERD tự
  sinh chủ yếu phản ánh `public`, kiểm không vỡ khi có schema `bi` mới).
- Migration `0071` chỉ `CREATE SCHEMA`/`CREATE VIEW`/`GRANT` (thêm thuần, không đụng
  dữ liệu hiện có) → thuộc diện đi thẳng production theo DoD, không cần staging.

### Việc 2 — M55 PR2: Tài liệu vận hành Metabase

`route: standard` → `standard-worker`, **base trên nhánh của Việc 1** (cần schema
`bi` đã tồn tại để tài liệu tham chiếu đúng tên view thật).

**Đặc tả nền**: `docs/nang-cap/M55-bi-metabase.md` mục "PR2" (đọc nguyên văn).

**Việc cụ thể** (đặc tả đã kín, không cần tự quyết kiến trúc — chỉ viết tài liệu +
đối chiếu code):

- Viết mới `docs/ops/metabase.md`: hướng dẫn dựng Metabase self-host qua
  docker-compose — Metabase + Postgres nội bộ RIÊNG cho Metabase (không dùng chung
  database `xboss`), kết nối tới Postgres XBoss qua role `xboss_bi` (chỉ thấy schema
  `bi`, đã tạo ở PR1), đặt sau Nginx tại subdomain riêng (tham khảo cách `DEPLOY.md`
  đã đặt Nginx/certbot cho domain chính, dùng cùng pattern), ghi rõ RAM tối thiểu
  ~2GB (Metabase chạy JVM) + cách kiểm VPS hiện tại đủ RAM hay không trước khi cài,
  cách backup database nội bộ Metabase (câu hỏi/dashboard người dùng tạo nằm ở đó,
  mất là mất luôn — không phục hồi được từ `bi`), cách cập nhật phiên bản.
- Cập nhật `DEPLOY.md`: thêm mục ngắn trỏ sang `docs/ops/metabase.md`, ghi chú biến
  `xboss_bi` password tạo tay lúc deploy (không đưa vào `.env`/git — đây là role
  Postgres riêng, không phải biến môi trường app).
- Cập nhật `.env.example` NẾU đặc tả gốc yêu cầu thêm biến — đọc kỹ lại: PR2 không
  code app, chỉ docs/compose, nên khả năng cao KHÔNG cần sửa `.env.example`; nếu thấy
  không cần thì bỏ qua, đừng thêm biến thừa.
- KHÔNG viết code app trong việc này (đúng phạm vi đặc tả gốc "KHÔNG code app trong
  PR này").
- Tiêu chí chấp nhận: tài liệu đủ chi tiết để 1 người vận hành dựng được từ đầu trên
  staging (liệt kê đủ bước, không bỏ ngầm định); ghi rõ câu lệnh `CREATE ROLE
  xboss_bi LOGIN PASSWORD '...'` chạy tay ở bước nào trong quy trình.

### Sau khi cả 2 việc xong

- Cập nhật `docs/nang-cap/README.md`: đổi dòng `M55-bi-metabase.md` từ `❌ chưa`
  sang `✅ xong` (PR1+PR2), ghi migration thực tế dùng (0071 hoặc số thật nếu đổi).
  PR3 (bổ sung view theo nhu cầu) giữ nguyên "tuỳ chọn, sau khi dùng thật ≥2 tuần" —
  không đánh dấu xong.
- Cập nhật `PROGRESS.md` mục "Tiếp theo": thêm đoạn ghi nhận M55 đã xong (PR1+PR2,
  số PR GitHub, migration thực tế, kết quả verify), xoá M55 khỏi câu mô tả hàng đợi
  còn lại (hàng đợi còn lại sau M55: M56 PR2 → M58 PR3 → M54 GĐ1 → M59 — nhưng LƯU Ý
  dòng 51 `docs/nang-cap/README.md` đã ghi M56 PR2 "đã xong" khác với dòng 66 cũng
  ghi "✅ xong" — coordinator KHÔNG cần xử lý phần này, chỉ ghi đúng M55, để phiên
  chính tự đối chiếu M56 ở lượt sau).

### Reviewer

Sau khi cả 2 việc code xong (PR1 trước, PR2 sau trên nhánh base PR1), gọi `reviewer`
soát diff **cả 2 PR gộp lại** — rà kỹ theo `docs/audit.md` mục "Vùng rủi ro cao" dù
PR này không chạm trực tiếp `lib/auth.ts`/`lib/recompute.ts`/`lib/boq.ts`, nhưng
**bản chất PR1 là mở một đường đọc dữ liệu MỚI né qua lớp quyền app** — trọng tâm
review: (a) không view nào lộ cột nhạy cảm ngoài `_fin`, (b) role `xboss_bi` chắc
chắn không có quyền ghi/quyền trên `public`, (c) soft-delete được tôn trọng đúng ở
mọi view có nguồn từng xoá mềm.

### Tích hợp & báo cáo

- 2 nhánh liên tiếp (PR2 base trên PR1) hoặc gộp làm 1 nhánh `claude/feat-m55-bi-metabase`
  với 2 commit tách biệt — coordinator tự quyết cách chia nhánh miễn tích hợp sạch,
  không xung đột số migration với nhánh khác đang chạy song song (kiểm `git fetch
  origin` trước khi bắt đầu, theo `CLAUDE.md` mục "đồng bộ nhánh trước").
- Mở PR draft, verify DoD đầy đủ (lint/typecheck/test/build xanh, `npm run gen:erd`
  khớp), báo cáo tổng hợp về phiên chính: số PR, migration thực tế dùng, kết quả
  test, điểm gì worker phải tự quyết ngoài brief (nếu có) để phiên chính duyệt cuối.
