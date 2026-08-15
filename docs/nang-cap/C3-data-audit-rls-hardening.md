# C3 — Data Integrity, UUID Audit & Engineering RLS

> **Trạng thái:** Draft; triển khai sau C2 pilot hoặc song song trên staging khi không đổi contract.
> **Mục tiêu:** đóng các khoảng trống dữ liệu/audit/isolation trước production rollout.

## 1. Phạm vi

- Audit trail chung hỗ trợ SERIAL và UUID, tương thích dữ liệu cũ.
- RLS + relational constraints cho toàn bộ `engineering_*` theo project/org.
- Sửa dữ liệu ngày Excel cũ bằng backfill preview-first; chốt denominator import.
- Retention/deletion và data-quality checks cho engineering ingest.

## 2. Audit UUID

### Thiết kế schema

- Thêm `audit_log.entity_key TEXT`; backfill từ `entity_id::text`; giữ `entity_id BIGINT` nullable trong giai đoạn tương thích.
- Unique/index phục vụ query: `(entity_type, entity_key, at DESC)`, `(project_id, at DESC)`, chain fields hiện có.
- `audit_row_change()` lấy `to_jsonb(NEW)->>'id'` vào text; chỉ populate BIGINT khi parse an toàn.
- Không sửa migration cũ; migration mới cập nhật function/trigger và backfill theo batch nếu bảng lớn.

### Event semantics

- CRUD generic vào `audit_log`; workflow state transition vẫn ở `engineering_workflow_events` là nguồn có ngữ nghĩa.
- UI audit hợp nhất bằng read model/link, không copy event workflow vào hai bảng gây double count.
- Actor gồm user/API key/system; API key quy về creator nhưng vẫn lưu key ID/correlation trong metadata.

### Compatibility

- API/filter nhận `entityKey` string; `entityId` số cũ vẫn hoạt động.
- Export audit giữ cột cũ và thêm key/actor type/correlation; không đổi âm thầm tên cột.

## 3. Engineering RLS và constraints

### Project axis

- Xác định project trực tiếp/qua cha cho sources, source revisions, objects, revisions, relations, intelligence, evidence, workflows, gates/events, sessions/claims/conflicts và ingest requests.
- Bảng con cần policy hiệu quả có thể thêm `project_id NOT NULL`, backfill qua FK cha, constraint đồng nhất và index.

### Relational invariants

- Source revision project = source project.
- Object source revision cùng project.
- Object revision project/object/source cùng project.
- Relation project = project của cả from/to object và source revision.
- Suggestion/evidence/workflow/session references không được chéo project.
- Dùng composite UNIQUE `(id, project_id)` + composite FK khi phù hợp; trigger constraint chỉ khi chuỗi FK không biểu diễn được.

### Policy

- SELECT/WRITE theo `app.project_id` và org context hiện có; API key bắt buộc project-bound.
- App role NOBYPASSRLS; migration owner/maintenance role được tài liệu hóa riêng.
- Không có nhánh “missing context → allow”; background job phải set context rõ hoặc dùng role được kiểm soát.

## 4. Backfill ngày Excel

1. Backup DB và lưu source Excel checksum.
2. Chạy `backfill-import-dates.ts` preview theo project; xuất CSV/JSON diff.
3. PM đối chiếu sample và toàn bộ exception/user-edited rows.
4. Apply staging; recompute task/package/delayed/S-curve/report; snapshot so sánh.
5. Restore rehearsal; rồi mới maintenance window production.
6. Apply theo project; post-check counts/dates/status; chạy lần hai phải 0 change.

Không “+1 ngày hàng loạt”. Mọi row không đúng dấu vết bug cũ giữ nguyên và đưa exception report.

## 5. Denominator/import policy

- Lưu `dim_denominator_mode` và import batch/source hash để tái lập cách tính.
- UI preview buộc người import chọn/nhìn thấy `columns` hoặc `row-nonempty`; default giữ compatibility cho file cũ.
- Report cảnh báo hàng OGHL/OGCH có công thức Excel không đồng nhất; quyết định nghiệp vụ được ghi audit.

## 6. Retention và deletion

- Chốt TTL ingest requests, logs, raw payload refs, source revisions và rejected/void objects.
- Legal hold/approved workflow lineage không bị purge tự động.
- Purge job dry-run, project scoped, batch, metrics/audit và dừng được; file storage xóa sau DB tombstone theo retry-safe workflow.

## 7. Test matrix

- Audit CRUD SERIAL/UUID, chain verify, actor/correlation, legacy filter/export.
- RLS role thật: project A/B, org A/B, missing context, global maintenance, API key A→B.
- Cross-project FK negative cho mọi relation chain.
- Concurrent object revision/audit; migration rerun; backfill idempotency/exception preservation/timezone.
- Restore snapshot trước/sau migration và count/checksum reconciliation.

## 8. Chia PR

- **C3.1:** audit schema/function/API/UI compatibility.
- **C3.2:** project-axis columns/constraints, chưa lock RLS.
- **C3.3:** route/background context + RLS policies + negative suite.
- **C3.4:** denominator persistence + backfill/runbook; production apply là change record riêng.
- **C3.5:** retention/purge sau khi owner chốt thời hạn.

## 9. Rollback/forward-fix

- Audit: code dual-read/dual-write trong một release; chỉ bỏ legacy sau ít nhất một release ổn định.
- RLS: có kill procedure chỉ cho Ops, ghi audit; không drop policy tùy tiện. Ưu tiên forward-fix context.
- Backfill: restore hoặc reverse theo source snapshot/diff; không dùng script đoán ngày.

## 10. Definition of Done

- [ ] Audit UUID/legacy cùng hoạt động và chain verify xanh.
- [ ] Engineering RLS + FK invariants chặn toàn bộ cross-project cases.
- [ ] Backfill production có approval/evidence; lần hai 0 change.
- [ ] Denominator mode tái lập được theo import batch.
- [ ] Retention owner/legal/security phê duyệt; purge drill staging đạt.
- [ ] ERD/API/SECURITY/DEPLOY/PROGRESS cập nhật.
