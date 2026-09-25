# Đặc tả thi hành audit XBoss — QUALITY-FINAL-1

Ngày chốt: **2026-09-25**. State: **Approved for implementation — thi hành sau**.
Chủ dự án yêu cầu: “chốt theo phương án chất lượng cao nhất”. Các lựa chọn D01–D09 được
cụ thể hóa ở [APPROVAL](APPROVAL.md), không còn yêu cầu chủ dự án chọn lại chín phương án.
Lần này chỉ cập nhật đặc tả; không chạy code ứng dụng, migration, merge hoặc production.

## 1. Đọc theo thứ tự

Đọc APPROVAL → [SOURCE-MAP](SOURCE-MAP.md) → [DATA-CONTRACTS](DATA-CONTRACTS.md) →
[PLAN](PLAN.md) → chương của slice → [TEST-MATRIX](TEST-MATRIX.md).
[Goal](../../goals/audit-2026-09-25.md) ghi trạng thái và bằng chứng còn phải có.
Các file này là một bộ hợp đồng; không giao riêng một đoạn cho worker thiếu context.

Phạm vi sáu chương giữ nguyên:

- [A1 — Quyền, tổ chức, dự án, cache quyền và RLS](A1-SCOPE.md).
- [A2 — Cache/offline, vault bản nháp và đồng bộ nhiều tab](A2-OFFLINE.md).
- [A3 — Tiền exact, quy tắc IPC và DTO/export](A3-MONEY.md).
- [A4 — Báo cáo đúng nguồn, cùng snapshot và KPI portfolio](A4-REPORTING.md).
- [A5 — Chuỗi nghiệp vụ, cảnh báo vượt khối lượng và concurrency](A5-BUSINESS-CHAIN.md).
- [A6 — PITR, restore có bằng chứng và phát hành](A6-OPERATIONS.md).

QUALITY-FINAL-1 thay thế trạng thái In review và các phương án còn mở của bản ở commit
833691815fdc7e96bb72975d86bd6902a412b259. Lịch sử bản v1 còn trong Git; không dùng các ví dụ
hard-cap IPC, xóa draft mặc định khi logout, round từng dòng mặc định cho IPC hoặc RPO24h/RTO4h
của v1 để ghi đè quyết định đã sửa trong bản này.

## 2. Baseline và mức hoàn tất

Main đã kiểm: **833691815fdc7e96bb72975d86bd6902a412b259**.
PR #529 đã merge (b29bb9d); PR #530 đã merge (8336918). Những ghi chú “đang chờ merge” trong
checkpoint cũ là lịch sử, không còn là blocker ở baseline này. Trước code vẫn reload main
và kiểm diff thực, không coi một SHA cũ là trạng thái hiện tại mãi mãi.

Đã chốt phương án thiết kế và bổ sung đối chiếu tĩnh các vùng trọng yếu ở SOURCE-MAP.
Chưa chạy toàn bộ inventory caller/catalog sống, benchmark, browser test, restore hoặc UAT
cho A1–A6. Không đánh dấu S00/54 AC đã hoàn tất chỉ vì tài liệu được duyệt hay CI docs xanh.
S00 là bước kiểm thực tế bắt buộc của lần thi hành, không là vòng hỏi lại lựa chọn sản phẩm.

## 3. Hợp đồng chung

API là biên kiểm quyền; mọi request xác thực actor/org/project/permission/resource parent.
UI/cache/IndexedDB/context header không thay kiểm server. RLS là lớp thứ hai, test bằng
role app không owner/superuser/BYPASSRLS. Thiếu context/cấu hình bắt buộc phải fail closed.
Không mở lại project1, wildcard từ client hoặc cache quyền chưa nạp để tránh lỗi UI.

Giữ giao thức login/2FA và makeToken của #529. 401 chưa auth; 403 thiếu quyền; resource không
có trong scope trả 404; input sai 400/422; context/warning/idempotency conflict409; version
conflict412; missing precondition428; rate limit429 có Retry-After; hạ tầng503. Không trả 0
thay lỗi dữ liệu/DB và không lộ tên hoặc nội dung bị cấm trong error.

Ngày nghiệp vụ là YYYY-MM-DD theo Asia/Ho_Chi_Minh, sự kiện UTC ISO. Tiền là bigint VND×100
và numeric, quantity/rate/progress là kiểu khác. Null/unknown/masked khác 0.
SQL tham số hóa qua lib/db; không nối input vào SQL. Snapshot báo cáo và quyết định nghiệp vụ
phải nêu rõ thời điểm/phiên bản nguồn, không suy từ Promise.all.

Mọi màn hình đổi có loading, empty, error, offline, forbidden, conflict và recovery.
UI tiếng Việt, keyboard/focus/screen-reader và axe desktop/mobile; test Safari/iOS thật cho
vault/SW/IDB. Giữ theme/token/component hiện có, không tự đổi framework hoặc hardcode màu.
Log không cookie/token/key/password/payload/ảnh/tiền chi tiết. Metrics không dùng ID user/
project làm nhãn cardinality cao. Audit nghiệp vụ khác log retry kỹ thuật.

Không thêm ORM, framework state mới, microservices hoặc dịch vụ AI/paid provider vì mục tiêu
audit này. Hạ tầng backup chất lượng cao có thể cần chi phí, nhưng bản đặc tả không tự mua/cấp
quyền hạ tầng; chi phí và thông tin môi trường được ghi khi lập release runbook thật.

## 4. Ngưỡng đã chốt, chưa phải số đo đã đạt

Không rò chéo scope; không nhân đôi hiệu ứng cùng operationId; không mất draft do app tự xóa;
sai lệch tiền exact SQL/API/export bằng 0 đơn vị nhỏ. Draft local không được quảng cáo đã
backup server hoặc miễn nhiễm việc mất máy/xóa storage.

Offline shared-safe 15 phút; field-personal 8 giờ chỉ sau đăng ký/duyệt thiết bị đúng chủ.
RPO tối đa 5 phút, RTO tối đa 60 phút, PITR 35 ngày. p95 tương tác tối đa500ms và báo cáo
chuẩn tối đa2s, không regression quá10% trên cùng fixture/hạ tầng; workload ở APPROVAL.
Bất kỳ rò dữ liệu/sai tiền/mất draft đã báo lưu do lỗi app/bypass nghiệm thu là no-go.

CI xanh không thay UAT, reviewer độc lập, quyền production hoặc phép đo RPO/RTO.
54 AC = 46 AC nền đã chỉnh theo quyết định đúng + 8 AC chất lượng bổ sung. Tất cả AC của
phần mới vẫn NOT_RUN cho tới khi implementation có bằng chứng đúng SHA.

## 5. Schema, release và worker

Migration append-only, số kế tiếp tại lúc code, không sửa migration đã áp. Catalog thật phải
khớp thiết kế; object khác định nghĩa không được nuốt bằng IF NOT EXISTS. Expand/contract,
dry-run/backfill có checkpoint và rollback tương thích; không sửa dữ liệu thật trong test.
Runtime production chỉ kiểm schema, migration ở bước deploy riêng với role riêng.
Auth/DB/money/schema/ERD/registry/lockfile là các file dùng chung phải có một đầu mối tích hợp.
Tách worker chỉ khi file không chồng và contract đã ổn định. Không giả đã gọi subagent.

Tối đa ba repair attempts cho một failure theo AI_DELIVERY_LOOP. Không skip test/hạ threshold/
nới quyền để lấy CI xanh. Đổi contract khác quyết định đã chốt phải báo delta; mapping thêm
caller và xác minh môi trường không đòi hỏi chủ dự án quyết lại D01–D09.

## 6. Nguồn

S01: AGENTS.md, CLAUDE.md, PROJECT.md, spec.md, docs/audit.md, docs/AI_DELIVERY_LOOP.md.
S02: lib/ha-tang/projects.ts. S03: public/sw.js.
S04: app/components/offlineQueue/{index,logic,store}.ts.
S05: lib/nen/money.ts. S06: lib/tai-chinh/cost.ts. S07: lib/db/index.ts.
S08: scripts/verify-dr-restore.ts. S09: PR #529 và PR #530.
S10: docs/ERD.md. S11: lib/tai-chinh/paymentcerts.ts.
S12: lib/bao-mat/permissions.ts. SOURCE-MAP có đường dẫn cố định và phần thực tế đã đọc.
Các đường dẫn S01–S12 được hiểu tại baseline trên, không đại diện dữ liệu production.

Nguồn chuẩn đã đối chiếu ngày 2026-09-25:

- [PostgreSQL 16 numeric](https://www.postgresql.org/docs/16/datatype-numeric.html): numeric,
  precision/scale và cách round ties; không dùng float làm oracle tiền.
- [PostgreSQL 16 isolation](https://www.postgresql.org/docs/16/transaction-iso.html): snapshot
  READ COMMITTED khác REPEATABLE READ và điều kiện retry.
- [PostgreSQL 16 RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html): app role khác owner.
- [PostgreSQL 16 PITR](https://www.postgresql.org/docs/16/continuous-archiving.html): base backup+
  WAL, archive lag và khác biệt với pg_dump. RPO/RTO là target do dự án chốt, không do tài liệu này chứng nhận.
- [IndexedDB](https://www.w3.org/TR/IndexedDB/): transaction complete/abort khác request success.
- [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache): chính sách SW phải chủ động quản lý.
- [Web Cryptography](https://www.w3.org/TR/webcrypto/): thuật toán chuẩn, không tự chế crypto.
- [OWASP HTML5 security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html):
  local storage không là ranh giới xác thực; không coi vault là cách giải quyết XSS.
