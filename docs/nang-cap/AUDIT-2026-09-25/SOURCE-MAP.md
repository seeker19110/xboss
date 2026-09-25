# S00 — Nguồn đã đối chiếu và preflight bắt buộc

Baseline: **833691815fdc7e96bb72975d86bd6902a412b259**, main ngày2026-09-25.
PR529 đã merge b29bb9de4b8d723b273ba790065c06cc6e3719f0;
PR530 đã merge thành baseline trên. Không còn chờ hai PR đó merge ở snapshot này.

Trạng thái: **đã đối chiếu tĩnh vùng trọng yếu bên dưới; chưa phải inventory toàn repository
hoặc catalog production đã kiểm**. Search API trả incomplete_results không là chứng cứ vắng
một cơ chế. Clone về môi trường soạn lỗi DNS; không tuyên bố đã quét toàn repo, chạy formatter,
PostgreSQL, benchmark hoặc restore cục bộ. Các reads thực hiện bằng GitHub connector.

ERD là artifact sinh từ schema trong repo, không là truy vấn trực tiếp DB đang vận hành.
Trước migration phải dựng DB disposable và so catalog thật. Đường dẫn dưới hiểu tại baseline.

## 1. Mâu thuẫn v1 đã được sửa

IPC: paymentcerts.ts có enum draft/submitted/approved/rejected; dongVuotHopDong ghi quyết
định người dùng2026-09-04 cảnh báo, không chặn. A5/AC đã sửa để giữ policy đó, thêm xác nhận/
audit thay hard-cap tự đặt. Không thêm cancelled giả vào fixture payment_certs.

IPC rounding: certTotals dùng SUM(qty_period*unit_price)::text, parseMoney rồi tính tỷ lệ
advance/retention. Giữ SUM rồi round tổng, không áp default round từng line vào IPC.
fetchCerts có json_build_object chứa numeric bên trong; cast ngoài cùng không sửa numeric
đã thành JSON number. Đường exact phải xử lý từng field DTO bên trong.

Payment scope: payment_bills có project_id, contract_id, payment_cert_id, sheet_type_id,
floor_label. Comment cost.ts nói không có project_id đã lỗi thời. Direct scope và tất cả
parent populated phải nhất quán; payment không sheet không được bị rơi khỏi tổng.

BOQ code: ERD boq_codes PK(org_id,code), UNIQUE(table_name,row_id), không unique xuyên tất
cả org. Không viết test cấm hai org có cùng code hợp lệ; không join nhầm chỉ theo code.

Permission: permissions.ts key role/perm/project-or-wildcard thiếu org; reload không SELECT
org; TTL60s, cold-start fallback defaults. DELETE và ON CONFLICT cũng thiếu org. ERD
role_permissions có org_id nhưng uq_role_perm_scope thiếu org. A1 chốt cả index/CRUD/cache.

Quantity: po_items.qty_ordered/qty_received là float8, unit_price numeric; cast kết quả
float ra text không phục hồi input gốc. DATA-MIGRATIONS chốt exact shadow/provenance,
không tuyên bố lỗi tiền đã hết chỉ từ việc monetary amount columns là numeric.

## 2. Scope/schema trọng yếu đã xác nhận

- users: id integer, role text, org_id/session_version integer NOT NULL; TOTP có sẵn.
- projects: id integer, org_id integer NOT NULL; code unique(org_id,code).
- user_projects: PK(user_id,project_id), FK tới users/projects; FK không chứng minh cùng org.
- role_permissions: id bigint, org_id integer, role/perm_key/allowed/project_id nullable;
  index hiện tại(role,perm_key,COALESCE(project_id,0)). Target bổ sung org mọi khóa.
- Task chain: tasks.package_id → work_packages.sheet_type_id → sheet_types.tower_id
  → towers.project_id → projects.org_id. Nullable legacy không được fallback project1.
- Contract: contracts.project_id. IPC: payment_certs.contract_id → contracts.
- IPC line: payment_cert_items.cert_id → payment_certs, boq_item_id → boq_items;
  hai đầu phải cùng contract/project/org. checkCertLinesBelongToContract đã tồn tại.
- BOQ: boq_items.project_id và contract_id nếu có phải nhất quán;
  boq_task_map PK(boq_item_id,task_id), weight numeric(5,4).
- Payment: project_id trực tiếp; contract/cert/sheet liên kết nếu có không được mâu thuẫn.
- Warehouse: warehouse_receipts.idempotency_key text, unique(po_id,idempotency_key) khi key
  không NULL. Tái dùng ở miền kho, không dùng thay receipt bốn kind offline.

## 3. Monetary và quantity map từ ERD

- boq_items: qty_contract/qty_sub/qty_approved numeric(15,3), unit_price/sub_unit_price(15,2).
- contracts.value numeric(15,2); advance_pct/retention_pct numeric(5,2), đơn vị phần trăm.
- contract_addenda.value_delta numeric(15,2).
- payment_cert_items.qty_period/qty_cumulative numeric(15,3); unit_price numeric(15,2).
- payment_bills.amount/labor numeric(15,2); quantity(15,3); progress_snapshot và
  pct_this_period numeric(5,4) không phải tiền.
- invoices.net_amount/vat_amount numeric(15,2), vat_rate numeric(5,2).
- advances.amount/settled_amount, claims.amount_requested/amount_settled numeric(15,2).
- cash_transactions.amount, insurance_bonds.value, proposals.amount numeric(15,2).
- payroll.rate numeric(12,2), gross/deductions/net numeric(15,2); workdays numeric(6,1).
- boq_norms.qty_per_unit numeric(15,4), boq_task_map.weight numeric(5,4).
- purchase_requests.qty_requested, po_items.qty_ordered/qty_received,
  receipt_items.qty_received là float8; po_items.unit_price numeric(15,2).
- materials.qty_boq/qty_planned/qty_used float8; phải inventory đường sync/tồn kho trước
  thay đổi, không lấy scale tiền ép vào mọi quantity.
- tasks.progress_percent và work_packages.progress float8; tiến độ không phải money.
- cost_settings global id smallint default1, warn_pct/over_pct numeric(5,2), không per-project.

numeric(15,2) cho13 chữ số phần nguyên; row validator kiểm biên. SUM/utility có thể lớn
hơn từng row và vẫn cần bigint/string exact. Không tự nâng mọi cột hoặc ép scale quantity.
NULL thiếu/masked không được thành0. Mọi consumer mới của exact DTO phải giữ phân quyền field.

Đường đọc đã xem: money.ts, db/index.ts, cost.ts, paymentcerts.ts. Miền tiền ngoài mapping
trên/caller export/UI chưa đọc đầy đủ phải bổ sung trước khi đóng A3 toàn hệ.

## 4. State/transaction đã xác nhận

suggestQtyForContract: executed theo boqExecutedQty trừ approved cumulative gần nhất;
đây là gợi ý khối lượng thực hiện, không bằng chứng nghiệm thu.
saveCertItems: replace draft lines, snapshot unit_price và cumulative từ kỳ approved;
S13 phải lock/recompute ở quyết định cuối để draft song song không dùng số cũ.
certTotals: round tổng và lấy contract rates hiện tại; target freeze basis/rule khi chốt.
dongVuotHopDong: warning từng dòng, không hard cap.

app/api/payment-certs/route.ts: GET contract/project, POST CAN.manageContracts,
withUniqueRetry/withTransaction, saveCertItems/openApproval. Giữ engine hiện hữu.
app/api/tasks/[id]/approve/route.ts: CAN.approve, task scope, module flag, FOR UPDATE,
progress100%, requiredInspectionMissing, approval engine, approval_source=task.
Không coi có các helper này là bằng chứng mọi race và đường bulk đã được test.

lib/db/index.ts: AsyncLocalStorage giữ connection; withProjectScope lồng thay GUC trên
client hiện có. Target reject nested khác scope và BEGIN isolation trước SELECT.
query/run hiện ensureSchema tự migration; production target separate migration job.

## 5. Cache và queue đã xác nhận

SW v19: API stale-while-revalidate theo URL, CLEAR_CACHE xóa API, HTML network-first có
cache. Target static shell riêng, sensitive network-only, generation chống late response.
Queue logic: tick/tick_batch/photo/diary_note, v1 không owner/org/project; diary dedup ngày,
shouldRetry chỉ network/5xx; index gửi theo cookie hiện tại, singleton chỉ một tab.
Store: xboss-offline version1, ops store; request success chưa chờ transaction complete.

Endpoint thật từ opEndpoint: PATCH /api/dimensions/:id, PATCH /api/dimensions/batch,
POST /api/tasks/:id/photos, PUT /api/diaries/:date. Context/receipt/precondition trên chính
endpoint này, không tạo đường bypass auth. Vault/device APIs là thiết kế mới, không claim
đã có vì chúng được nêu trong DATA-CONTRACTS.

## 6. S00 khi thi hành: kiểm fact, không hỏi lại phương án

Reload main/diff; AST inventory route/method/export alias/wrapper, cron/device/API-key,
export và mọi caller thuộc slice. Mỗi dòng ghi source file/line/SHA, auth, CAN/assignment,
org/project, parent joins, SQL, DTO/masking/cache, consumer/test và verdict.
Không đánh dấu coverage toàn hệ từ grep một helper hoặc search trả incomplete_results.

Dựng PostgreSQL disposable bằng migrations, lấy information_schema/pg_constraints/indexes/
policies/roles, so ERD và kiểu/constraint thật. Có scope finite IDs/membership/permission
fixtures và RLS app role, không owner làm bằng chứng. Catalog production chỉ khi có quyền.

Đầu ra per-slice: route-scope inventory, monetary-column map, cache-queue inventory,
business-transition map, recovery inventory và benchmark workload/count/p95.
Phần chưa đọc/đo là NOT_MAPPED/NOT_RUN. Khi một slice còn thiếu map thì hoàn thiện trước code,
không tự đoán và cũng không đòi chủ dự án quyết lại D01–D09.

Số migration lấy kế tiếp lúc code; object mới trùng tên phải reconcile định nghĩa trước.
Đó là kiểm kỹ thuật, không lựa chọn sản phẩm còn mở. Không sửa ERD bằng tay hoặc dùng
IF NOT EXISTS che schema không đúng. Giữ dữ liệu người dùng và worktree chưa commit.

## 7. Nguồn cố định

[ERD](https://github.com/seeker19110/xboss/blob/833691815fdc7e96bb72975d86bd6902a412b259/docs/ERD.md),
[IPC](https://github.com/seeker19110/xboss/blob/833691815fdc7e96bb72975d86bd6902a412b259/lib/tai-chinh/paymentcerts.ts),
[Permissions](https://github.com/seeker19110/xboss/blob/833691815fdc7e96bb72975d86bd6902a412b259/lib/bao-mat/permissions.ts).
Nguồn S01–S12 của README bổ sung các đường đã đọc trước. Đây là mã nguồn và schema artifact,
không phải kiểm chứng production, full inventory hoặc kết quả chạy54AC.
