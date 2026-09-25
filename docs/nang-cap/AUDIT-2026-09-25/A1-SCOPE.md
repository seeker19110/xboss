# A1 — Thống nhất phạm vi user, org, project và transaction

State: In review. Owner duyệt: chủ dự án; owner kỹ thuật: đầu mối auth/DB được giao trong PLAN.
Phụ thuộc: bất biến #529 có trên main và S00 hoàn tất. Hợp đồng chung: README.md.

## 1. Vấn đề, bằng chứng và outcome

S02: `visibleProjectIds` cho admin mọi dự án; khi user_projects rỗng toàn hệ, non-admin cũng
được danh sách mọi dự án. `chotProjectIdChoGhi` có `projectHienTai || 1`, không nhận orgId;
helper đọc lại lọc org. `getCurrentProjectId` memoize projectId trong request.
S07: `withProjectScope` lồng có thể đặt lại GUC project trên cùng transaction mà không phục hồi.
Đây là các nhánh cần test tái hiện, không là kết luận toàn bộ hệ thống đã bị rò.
Outcome: một chính sách được kiểm chứng cho mọi điểm vào, không có fallback dự án 1 hoặc
phạm vi toàn hệ từ giá trị thiếu; không thể đổi scope âm thầm trong transaction.

## 2. Phương án và phạm vi

Không làm: các route tiếp tục hiểu khác nhau. Vá từng route: giảm lỗi trước mắt nhưng dễ tái phát.
Chọn resolver trung tâm + chuyển call-site từng cụm + test app/RLS song song.
Không viết lại toàn bộ RBAC; giữ CAN, override và canTouchTask/canTouchPackage hiện có.
Không xóa cơ chế cross-project hợp lệ, nhưng phải đặt tên và cấp quyền tường minh.

## 3. Yêu cầu chức năng

A1-FR01: actor lấy từ xác thực server; org hiện tại phải khớp người dùng trong DB. Khi đổi
org hoặc thu hồi quyền phiên, tăng session_version hoặc từ chối token không còn khớp;
không chỉ tin org cũ trong cookie ký. Giữ hợp đồng 2FA của #529.

A1-FR02: một resolver thuần về quyết định nhận actor `{id, role, orgId}`, input ID chưa tin,
ngữ cảnh hiện tại đã kiểm, mục đích read/write và chế độ chọn. ID chỉ là số nguyên an toàn
lớn hơn 0 hoặc chuỗi chữ số thập phân canonical; từ chối boolean, object, array, hex, exponent,
NaN, Infinity và số vượt safe integer. Input tường minh sai không được fallback.
Không dùng `|| 1`, `?? 1`, `undefined => all` hoặc `'*'` từ request client.

A1-FR03: admin ứng dụng vẫn chỉ thao tác trong org hiện tại. Non-admin cần membership cụ thể
cùng org. Chế độ rỗng-bảng không được tự mở toàn hệ trong trạng thái đích. Không tự backfill
mọi người vào mọi dự án để tránh bị khóa; thực hiện chuyển đổi membership có chủ sở hữu duyệt.
Global catalog thật sự dùng chung phải có registry và lý do, không suy từ project_id NULL.

A1-FR04: thiếu ID đọc, chỉ suy ra khi có đúng một dự án hợp lệ; nhiều dự án trả
`403 project_required` hoặc adapter contract hiện hữu cho màn chọn. Đọc trong UI có lựa chọn
đã kiểm thì dùng lựa chọn đó. Ghi luôn cần scope đã kiểm tường minh, không tự chọn dự án đầu.
Mọi resource ID con phải thuộc cùng scope với cha: task/package/sheet/tower; contract/PO/BOQ/
supplier theo quan hệ nghiệp vụ đã xác minh. Thấy dự án không thay quyền sửa tài nguyên.

A1-FR05: resolve candidate scope trước CAN override theo dự án. Nếu resolve lỗi, trả lỗi;
không fallback global permission để tiếp tục đọc/ghi. Memoization chỉ trong một request,
khóa theo actor+org+candidate; giá trị không thể tái sử dụng cho actor khác trong test/cron.

A1-FR06: transaction mang actor/org/project đã kiểm. Lồng cùng scope thì tái sử dụng;
lồng khác scope, numeric sang `'*'` hoặc `'*'` sang numeric phải throw lỗi trước query nghiệp vụ.
Đọc lồng trong transaction ghi không tự đổi cha thành read-only. Transaction đọc cha không
được nâng thành ghi. COMMIT/ROLLBACK không để scope rò qua connection pool.
Không sửa ngữ cảnh dùng chung trong Promise.all trên cùng transaction.

A1-FR07: portfolio/cron/import/export/API key/device token được kiểm kê riêng. Với báo cáo
nhiều dự án phải tính danh sách IDs được phép trong org hiện tại từ server và lọc SQL rõ ràng.
Không có quyền cross-org mới trong phạm vi này. Cron tích hợp phải có actor/service scope
được cấp rõ, không dùng admin giả hoặc header user-controlled để bypass.

## 4. Contract API và tích hợp

Kết quả resolver đề xuất, không phải export đã tồn tại:

```ts
type ScopeResult =
  | { ok: true; scope: { userId: number; orgId: number; projectId: number } }
  | { ok: false; code: "invalid_project" | "project_required" | "project_forbidden" };
```

Adapter của `getCurrentProjectId`, `chotProjectIdChoDoc`, `chotProjectIdChoGhi` cùng gọi resolver.
Đổi chữ ký helper ghi để có orgId; chuyển tất cả caller trong inventory, không để shim thiếu
org được mặc định. Đầu vào chưa kiểm không có quyền xây ScopeResult thành công bằng ép kiểu.

Response lỗi mới dạng `{error, code, requestId}` không chứa danh sách bị cấm.
Giữ route #529 `/api/costs` và `/api/project/select` tương thích; adapter contract device-token
hiện hữu có thể giữ lý do/danh sách chọn nhưng chỉ chứa dự án đã được phép trong org.
Test đầy đủ auth method, không chỉ cookie-session.

## 5. Điểm chạm code và dữ liệu

File hiện có: `lib/ha-tang/projects.ts`, `lib/bao-mat/auth.ts`, `lib/nen/request-context.ts`,
`lib/db/index.ts`, `app/api/project/select/route.ts`, `app/api/costs/route.ts`.
S00 liệt kê toàn bộ caller và test tương ứng; mỗi PR chỉ khóa cụm được giao.
Có thể thêm `lib/ha-tang/project-scope.ts` để tách hàm thuần; tên này là đề xuất.

Không bắt buộc DDL cho resolver/transaction. Membership hiện có dùng `user_projects`;
trước áp strict phải có dry-run cho mỗi org: số user không được gán, dự án được thấy trước/sau,
service account và tài khoản admin dự phòng. Không tự INSERT membership production.
Unique/FK/index cần bổ sung chỉ sau catalog inventory, trong migration riêng được duyệt.

Truy vấn kiểm kê read-only minh họa trên schema baseline:

```sql
SELECT up.user_id, up.project_id, u.org_id AS user_org, p.org_id AS project_org
FROM user_projects up
JOIN users u ON u.id = up.user_id
JOIN projects p ON p.id = up.project_id
WHERE u.org_id IS DISTINCT FROM p.org_id;
```

Kết quả khác rỗng là dữ liệu cần owner phân loại; không DELETE hoặc sửa org tự động.

## 6. Acceptance và kiểm chứng

A1-AC01: Given hai org và cùng role admin, When chỉ định project org khác, Then mọi đường
đọc/ghi/membership/export bị chặn, DB không đổi. Test PostgreSQL + HTTP thật.
A1-AC02: Given user_projects rỗng, When non-admin truy cập, Then không tự được quyền toàn hệ;
UI có trạng thái cần gán dự án, admin vẫn phục hồi được trong org mình.
A1-AC03: Given current scope trống hoặc ID sai, When ghi, Then không có query nghiệp vụ hoặc
bản ghi mới ở project 1. Chạy cả batch, import, resource child IDs.
A1-AC04: Given scope A trong transaction, When gọi helper scope B, Then lỗi và rollback;
request B sau đó trên cùng pool vẫn chỉ thấy B. Đồng thời tối thiểu 20 request lặp fixture.
A1-AC05: Given role override cấm ghi trong project A, Then membership/admin visibility không
bỏ qua override; thiếu context không rơi về global allow.
A1-AC06: Given role app không-owner, NOBYPASSRLS, Then đọc/ghi chéo scope bị RLS chặn.
Test bằng owner riêng chỉ để tạo fixture, không ghi nhận là bằng chứng RLS.
A1-AC07: Given org user thay đổi/phiên bị thu hồi, Then token cũ không đọc/ghi dữ liệu org cũ.

## 7. UX, observability và rollout

UI: loading khi xác minh scope; empty khi chưa được gán; lỗi mất quyền yêu cầu chọn lại/đăng
nhập, không đổi sang dự án ngẫu nhiên. AppHeader/switcher/portfolio không lộ tên org khác.
Metric: scope_required, scope_denied, nested_scope_mismatch, context_stale theo route family.

Slice theo PLAN: hợp đồng, resolver/membership, route inventory chuyển đổi, transaction/RLS.
Trước bật strict trên production phải chốt membership dry-run và đường admin phục hồi.
Canary staging hai org trước. Một truy vấn rò scope hoặc dữ liệu ghi sai là no-go.
Rollback bằng hotfix/đóng route lỗi; không mở lại fallback 1 hoặc thiếu scope => all.
Dữ liệu membership sửa có file đối soát được duyệt; không rollback bằng cấp quyền hàng loạt.

## 8. Rủi ro, phê duyệt và DoD

Thay đổi quyền nhìn thấy là breaking hành vi có chủ đích; owner phải duyệt kế hoạch gán dự án.
Không coi toàn bộ caller đã chuyển khi chỉ grep xanh; inventory phải có route-test-evidence.
Tất cả A1-AC có bằng chứng main, RLS đúng role, UAT đủ 7 vai trò, docs/ADR cập nhật mới được đóng.
Người/ngày duyệt implementation: chưa có; ghi tại APPROVAL.md trước S01.
