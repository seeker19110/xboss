# A1 — Phạm vi và quyền theo tổ chức

State: **Approved for implementation**, QUALITY-FINAL-1, 2026-09-25; thi hành sau.
Decision: D01/D09 trong APPROVAL.md. Đọc cùng README, SOURCE-MAP, DATA-CONTRACTS và TEST-MATRIX.

## 1. Vấn đề và lựa chọn

Source map xác nhận helper đọc/ghi khác nhau, fallback project1 và membership rỗng toàn hệ;
cache quyền có key/query/upsert/delete thiếu org và cold-start fallback defaults.
Chọn resolver trung tâm, permission snapshot hợp lệ theo request và app/RLS cùng bảo vệ.
Vá từng route không đủ; viết lại RBAC hoặc microservices không thuộc phạm vi.

Outcome: actor chỉ truy cập dữ liệu được phép trong org/project, cả read/write/export/cron;
không bỏ filter hoặc mở quyền vì input/context/cache thiếu. Thấy dự án không thay quyền sửa
resource; admin ứng dụng không được tự thành quản trị xuyên org.

## 2. FR/NFR

A1-FR01: actor lấy từ session/API credential server xác thực. Đọc org/session_version hiện
hành, giữ giao thức 2FA của #529. Token không khớp org/session bị từ chối; không dùng org cũ
ký trong token làm quyền vĩnh viễn. Credential service/device phải có org/project thật.

A1-FR02: candidate ID strict theo DATA-CONTRACTS. Input tường minh không hợp lệ không fallback.
Ghi phải có project đã kiểm; không `|| 1`, `?? 1` hoặc undefined thành all.
Đọc chưa chọn chỉ tự suy khi duy nhất một project hợp lệ; nhiều project yêu cầu chọn.
UI có context đã kiểm thì dùng context đó; không âm thầm chọn project đầu thay project bị cấm.

A1-FR03: non-admin cần user_projects cùng org, kể cả khi bảng rỗng. Admin chỉ các project
cùng org. Trước cutover có membership dry-run/danh sách ảnh hưởng và admin recovery;
không INSERT cấp quyền hàng loạt để tránh bị khóa. Global catalog thật sự dùng chung phải
có registry/owner; không coi mọi project_id NULL là dữ liệu public.

A1-FR04: resolve project trước permission override. Permission key có org/role/action/project;
await snapshot hợp lệ, cold-start/DB lỗi không được suy không có override. Các đường quyết
định tài chính/nghiệm thu/quản trị không dùng stale permission để cho ghi.
Giữ luật LOCKED_PERMS không mở quyền ghi cho vai trò chỉ-xem qua override.

A1-FR05: list/reload/upsert/delete role_permissions lọc org tường minh. Unique target mới
uq_role_perm_org_scope theo DATA-CONTRACTS. Hai org có cùng role/perm scope null độc lập;
xóa org A không xóa override B. Cache dùng org và phiên bản nguồn; lỗi nguồn fail closed.

A1-FR06: task/package/sheet/tower, cert/contract/BOQ, payment/cert/sheet/project cùng scope
qua mọi liên kết có mặt. Nullable legacy không suy ra được scope thì từ chối/đối soát,
không cấp scope1. Resource ngoài scope trả404; danh sách/metadata không lộ tên bị cấm.

A1-FR07: transaction theo DATA-CONTRACTS; nested khác scope/actor hoặc nâng readOnly/isolation
bị chặn. Không thay GUC trong Promise.all. Pool cleanup trên COMMIT/ROLLBACK và request
context cache chỉ được dùng lại đúng actor/org/candidate trong một request.

A1-FR08: portfolio/cron/export toàn danh mục dùng tập IDs hữu hạn cùng org, server cấp.
Không nhận wildcard từ client, không bỏ WHERE vì có RLS. Luồng app role đúng quyền phải
thấy dữ liệu đúng, không chỉ test sai quyền trả rỗng. Không nhầm số liệu bị RLS che với số0.

NFR: không rò chéo org/project; các giới hạn latency chung trong APPROVAL phải đo. Log
scope_denied/context_stale/nested_scope_mismatch không kèm payload/PII. Query tham số hóa.

## 3. API, schema và điểm chạm

authorizeProject/authorizePortfolio và transaction signature ở DATA-CONTRACTS; adapter cho
getCurrentProjectId/chotProjectIdChoDoc/chotProjectIdChoGhi phải cùng resolver.
Không shim actor thiếu org bằng default1; chuyển caller theo inventory S02.
Giữ status/payload auth hiện có. 400/401/403/404/409/503 dùng đúng hợp đồng chung.

File: lib/ha-tang/projects.ts, lib/bao-mat/auth.ts, lib/bao-mat/permissions.ts,
lib/nen/request-context.ts, lib/db/index.ts, route project/select/costs và caller từng slice.
DDL index quyền theo DATA-CONTRACTS; không đổi schema membership chỉ để làm test dễ hơn.
RLS/grants theo role app không owner. ERD được sinh, không sửa tay.

## 4. Journey và acceptance

Loading xác minh scope không hiển thị data cũ. Chưa membership hiện hướng dẫn liên hệ quản
trị; không fallback dự án ngẫu nhiên. Mất quyền/expired session khóa data, cho đăng nhập/chọn
lại. Keyboard/screen reader/theme/mobile theo README.

A1-AC01: hai org cùng role admin vẫn không đọc/ghi/chọn/export chéo; DB không đổi.
A1-AC02: user_projects rỗng không mở toàn hệ; admin recovery trong org vẫn hoạt động.
A1-AC03: input thiếu/sai và child-ID khác scope không query nghiệp vụ hoặc ghi project1.
A1-AC04: nested A→B/wildcard lỗi và rollback; 20 request cạnh tranh qua pool không rò scope.
A1-AC05: project/org override deny được giữ, kể cả cold-start/cache lỗi; không fallback allow.
A1-AC06: app role NOBYPASSRLS kiểm đúng/sai/missing scope; owner chỉ dùng chuẩn bị fixture.
A1-AC07: token cũ sau đổi org/thu hồi phiên không tiếp tục truy cập dữ liệu cũ.
Q-AC01 bổ sung test full CRUD/index/cache quyền giữa hai org.

## 5. Test, rollout và rollback

Unit resolver; PostgreSQL policies/unique/concurrency; HTTP từng method/auth mechanism;
E2E đủ role và portfolio/export. Stub không thay DB/HTTP. S00 hoàn thiện caller inventory
trước S01/S03/S02; không coi grep pattern xanh là coverage toàn bộ endpoint.

Triển khai permission-schema không trộn writer cũ/mới; tạm khóa cấu hình quyền khi cần.
Membership dry-run trước production; không tự sửa data thật. Canary hai org trên staging.
No-go: bất kỳ dữ liệu trả/ghi sai scope hoặc cold-start cho quyền bị cấm.
Rollback giữ fail-closed và schema/key theo org; không khôi phục fallback1/cache toàn hệ.
Chỉ đóng khi test/review/CI trên main có bằng chứng và không còn caller chưa chuyển trong miền.
