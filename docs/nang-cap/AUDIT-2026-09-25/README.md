# Đặc tả thi hành audit XBoss — 2026-09-25

## Trạng thái và cách dùng

**State: In review — đặc tả để chủ dự án duyệt và thi hành sau.**
Yêu cầu hiện tại chỉ là hoàn thiện tài liệu. Không đồng nghĩa cấp quyền code, merge,
deploy, đổi quyền truy cập, thay mật khẩu hay chạy lệnh trên production.
Chưa có người/ngày duyệt implementation; không tự ghi Approved thay chủ dự án.

Đọc [PLAN.md](PLAN.md) để chọn đúng slice, rồi đọc chương tương ứng và
[TEST-MATRIX.md](TEST-MATRIX.md). Dùng [APPROVAL.md](APPROVAL.md) để ghi nhận quyết định.
Checkpoint tổng thể ở [goal](../../goals/audit-2026-09-25.md).
Mỗi chương cùng hợp đồng chung ở đây đáp ứng các trường của SPEC-TEMPLATE.md;
không tách một chương ra khỏi hợp đồng chung khi giao worker.

## Phạm vi đầy đủ

- [A1 — Phạm vi người dùng, tổ chức, dự án và RLS](A1-SCOPE.md).
- [A2 — Cache, Service Worker, offline queue và nhiều tab](A2-OFFLINE.md).
- [A3 — Số học tiền từ SQL tới API và xuất báo cáo](A3-MONEY.md).
- [A4 — Tổng hợp chi phí, chống lặp và KPI portfolio](A4-REPORTING.md).
- [A5 — Chuỗi BOQ, vật tư, tiến độ, nghiệm thu và thanh toán](A5-BUSINESS-CHAIN.md).
- [A6 — Restore, vận hành, phát hành và final audit](A6-OPERATIONS.md).

Không mở lại các module thử nghiệm đã loại bỏ, không thêm ORM, nền tảng AI, framework
state/query, dịch vụ trả phí hoặc thay stack chỉ để thực hiện audit này.
Không thay điều khoản thuế/hợp đồng, không tự quyết chuyển dữ liệu thương mại lịch sử.

## Baseline đã kiểm tra

Ngày đọc nguồn: 2026-09-25. Main: `a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3`.
PR #529: head `2641b6f733ae157a188168aba162fb8c081c3e2f`, còn mở tại lần đọc.
CI của PR đó đã thành công; điều này không chứng minh các chương A1–A6 đã được thực hiện.
PR tài liệu này độc lập từ main, không mang theo code của #529 và không thay HEAD đã kiểm của #529.

Trước lần thi hành phải reload main, đọc diff kể từ baseline và xác minh các bất biến của
#529 đã có trên main. Squash-merge có thể đổi SHA; kiểm nội dung và test, không chỉ kiểm ancestry.
Nếu #529 chưa merge thì dừng các slice code phụ thuộc; vẫn được đọc/duyệt đặc tả.
Không tự cherry-pick, merge #529 hoặc xây code phụ thuộc trên nhánh chưa merge.

## Hợp đồng chung áp dụng mọi chương

### Phân quyền và dữ liệu

API xác thực lại actor, quyền, tổ chức, dự án và quan hệ tài nguyên; UI không là biên bảo mật.
`401` là chưa xác thực; `403` là không được phép; ID sai cú pháp `400`;
không tìm thấy hoặc nằm ngoài phạm vi được thấy trả `404` cho endpoint tài nguyên cụ thể.
Không trả tên dự án/tài nguyên bị cấm trong thông báo lỗi. Lỗi chọn dự án giữ `403`.
`409` dùng cho xung đột ngữ cảnh/phiên bản/idempotency; payload sai nghiệp vụ `422`;
`429` giữ Retry-After; lỗi hạ tầng `503`, không trả số 0 thay lỗi.
Giữ giao thức login/2FA và chữ ký token của #529 nếu không có đặc tả riêng được duyệt.

Mọi thời điểm kiểm tra: UTC ISO cho sự kiện, ngày nghiệp vụ YYYY-MM-DD theo
Asia/Ho_Chi_Minh; không chuyển ngày thành Date rồi làm lệch múi giờ.
Tiền giữ quy ước hiện hữu VND × 100 trong bigint; không nhầm thành đơn vị đồng nguyên.
Giá trị tiền, tiến độ và thống kê 0 phải phân biệt với null/không có dữ liệu/bị che quyền.

### UX, riêng tư và quan sát

Mọi màn hình đổi phải có loading, empty, error, offline, forbidden, conflict và retry rõ ràng.
Không để dữ liệu tài khoản/dự án cũ lóe lên lúc đổi ngữ cảnh. Mất quyền che nội dung ngay;
không hiển thị thông tin thương mại đã bị cấm từ cache, toast, export hoặc bản nháp.
Nội dung tiếng Việt; giữ theme hiện có, không hardcode hex hoặc thêm dark:.
Keyboard/focus, nhãn screen reader, trạng thái aria-live và kiểm axe desktop/mobile là bắt buộc.

Log chỉ request-id, mã slice, loại sự kiện, mã lỗi và thời lượng; không ghi cookie/token,
mật khẩu, ảnh, nội dung nhật ký, payload hợp đồng hoặc tiền chi tiết. ID kỹ thuật trong log
chỉ khi cần đối soát, có kiểm soát truy cập; metrics không dùng ID làm nhãn cardinality cao.
Mỗi slice có owner tích hợp, reviewer vùng rủi ro, log/check bằng chứng và cách quay lui.

### Ngưỡng và nguyên tắc nghiệm thu

Các ngưỡng dưới đây là **mục tiêu đề xuất để duyệt**, không phải số đo hiện tại:
không rò chéo ngữ cảnh; không mất thao tác đã báo lưu cục bộ; không nhân đôi hiệu ứng nghiệp vụ;
sai lệch tiền chuẩn giữa SQL/API/export = 0 đơn vị nhỏ; p95 các luồng đã đo không chậm hơn
baseline quá 20% trên cùng fixture/máy và cùng mức đồng thời.
RPO/RTO chỉ được đánh dấu đạt khi A6 có phép đo và người vận hành duyệt mục tiêu.

Một lỗi rò dữ liệu, sai tiền, mất dữ liệu, bỏ qua nghiệm thu hoặc ghi vào production ngoài
phạm vi là điều kiện dừng ngay. Không dùng cờ tính năng để mở lại đường truy cập không an toàn.
CI xanh không thay cho UAT, kiểm browser thật, restore và phê duyệt phát hành.

### Schema và quyền thi hành

SQL trong đặc tả là thiết kế, **không phải lệnh được phép chạy ngay**.
Chỉ tạo migration append-only sau S00, trên main mới, lấy số kế tiếp tại lúc triển khai;
không giữ trước số migration và không sửa file đã áp. Khác catalog thực tế thì dừng slice,
cập nhật phụ lục mapping/ADR rồi duyệt, không đoán tên bảng/cột hoặc tự nhân đôi cơ chế đã có.
Mọi backfill có dry-run, báo số lượng, batch/checkpoint, khả năng chạy lại và phương án đối soát.
Những thay đổi vào auth, DB, tiền, migration, lockfile do một đầu mối tích hợp tuần tự.

## Nguồn và bằng chứng

Nguồn repo là hiện trạng, không phải bằng chứng đã khai thác lỗi trên production.
Các rủi ro từ đọc code cần tái hiện trên DB/browser disposable trước khi ghi là lỗi đã xác nhận.

- [S01 — quy tắc agent](https://github.com/seeker19110/xboss/blob/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/AGENTS.md), CLAUDE.md, PROJECT.md, spec.md, docs/audit.md và docs/AI_DELIVERY_LOOP.md cùng SHA.
- [S02 — helper dự án và portfolio](https://github.com/seeker19110/xboss/blob/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/lib/ha-tang/projects.ts).
- [S03 — Service Worker](https://github.com/seeker19110/xboss/blob/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/public/sw.js).
- [S04 — offline queue](https://github.com/seeker19110/xboss/tree/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/app/components/offlineQueue): index.ts, logic.ts và store.ts đã đọc.
- [S05 — tiền](https://github.com/seeker19110/xboss/blob/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/lib/nen/money.ts).
- [S06 — chi phí](https://github.com/seeker19110/xboss/blob/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/lib/tai-chinh/cost.ts).
- [S07 — DB/parser/transaction](https://github.com/seeker19110/xboss/blob/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/lib/db/index.ts).
- [S08 — kiểm restore hiện có](https://github.com/seeker19110/xboss/blob/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/scripts/verify-dr-restore.ts); package.json cùng SHA xác nhận các lệnh trong PLAN.
- [S09 — đợt 1](https://github.com/seeker19110/xboss/pull/529), [CI của HEAD đợt 1](https://github.com/seeker19110/xboss/actions/runs/36095713458).
- [E01 — W3C Service Workers, mục Caches](https://www.w3.org/TR/service-workers/#caches): Cache API do ứng dụng quản lý; không xem Cache-Control là thay thế chính sách SW. Đây là tài liệu tiêu chuẩn đang phát triển; test tính năng thực có của browser, không giả định mọi phần đã hỗ trợ.
- [E02 — W3C IndexedDB](https://www.w3.org/TR/IndexedDB/): phân biệt request success với transaction complete/abort; dùng làm cơ sở bảo đảm báo lưu đúng thời điểm.
- [E03 — PostgreSQL 16 numeric](https://www.postgresql.org/docs/16/datatype-numeric.html): tính chính xác, scale và làm tròn.
- [E04 — PostgreSQL 16 RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html): owner/superuser/BYPASSRLS không phải role phù hợp để chứng minh cách ly ứng dụng.
- [E05 — PostgreSQL 16 backup/PITR](https://www.postgresql.org/docs/16/continuous-archiving.html): phân biệt logical dump và base backup/WAL; cấu hình ngoài DB cần sao lưu riêng.

## Điểm bắt đầu cho lần sau

Chỉ dẫn cho AI: đọc README này, PLAN, APPROVAL và goal; báo main SHA thật, trạng thái #529,
các approval còn thiếu và slice đầu đủ điều kiện. Chưa Approved thì chỉ đối chiếu và báo cáo,
không code. Khi đã Approved, thi hành đúng một slice, verify và mở PR; chưa có quyền thì không merge.
