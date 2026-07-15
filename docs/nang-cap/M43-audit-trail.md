# M43 — Ngữ cảnh request & Audit trail toàn hệ (P0)

> **Mục tiêu**: mọi thay đổi trên nhóm bảng tài chính/hợp đồng/nghiệm thu được ghi tự động vào một bảng `audit_log` thống nhất (ai, khi nào, trường nào, giá trị cũ→mới), không sửa được, truy vấn/xuất được cho kiểm toán. Nâng trục Audit/tuân thủ từ 2.0 → ~3.5 (xem `docs/nghien-cuu-nang-cap-erp-2026-07.md` §4).
>
> **Nguyên lý**: ghi bằng **trigger Postgres generic** (không thể bỏ sót do quên gọi helper) + ngữ cảnh actor truyền qua `SET LOCAL` trong `withTransaction` — **một điểm chạm duy nhất** ở `lib/db/index.ts`, không sửa từng route.

## Hiện trạng liên quan

- `lib/db/index.ts` đã có `withTransaction` + `AsyncLocalStorage` (`txStorage`) — mọi route ghi dữ liệu nhạy cảm đã bọc transaction.
- Audit hiện rời rạc 7 bảng theo domain (`task_history`, `material_transactions`, `po_status_history`, `work_front_history`, `diary_lock_history`, `assignment_log`, `cash_transactions`) — **giữ nguyên**, `audit_log` là lớp phủ chung bên dưới, không thay thế.

## PR1 — Request context + schema + trigger

### `lib/request-context.ts` (mới)

```ts
// AsyncLocalStorage giữ ngữ cảnh request: userId/role sau getCurrentUser(),
// projectId sau getCurrentProjectId(), requestId từ header x-request-id.
export type RequestContext = { userId?: number; role?: string; projectId?: number; requestId?: string };
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T;
export function getRequestContext(): RequestContext | undefined;
export function patchRequestContext(patch: Partial<RequestContext>): void; // getCurrentUser/getCurrentProjectId gọi
```

- `middleware.ts` (mới, matcher `/api/:path*`): sinh `x-request-id` (crypto.randomUUID) nếu chưa có, gắn vào request headers.
- `getCurrentUser()` (`lib/auth.ts`) sau khi xác thực gọi `patchRequestContext({ userId, role })`; `getCurrentProjectId()` gọi `patchRequestContext({ projectId })`. Không đổi chữ ký hàm.
- `withTransaction` (`lib/db/index.ts`): ngay sau `BEGIN`, nếu có context thì chạy **1 câu**:
  ```sql
  SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true),
         set_config('app.project_id', $3, true), set_config('app.request_id', $4, true)
  ```
  (giá trị thiếu truyền `''`; `set_config(..., true)` = SET LOCAL, tự hết hạn khi COMMIT/ROLLBACK).

### Migration `0049_audit_log.sql` (kiểm tra lại số thứ tự lúc code)

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id INT, actor_role TEXT,
  entity_type TEXT NOT NULL,          -- tên bảng
  entity_id BIGINT NOT NULL,
  action TEXT NOT NULL,               -- INSERT | UPDATE | DELETE
  changes JSONB,                      -- UPDATE: {col: [old,new]} chỉ cột đổi; INSERT/DELETE: snapshot đầy đủ
  project_id INT, request_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $$
DECLARE v_changes JSONB; v_id BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(o.key, jsonb_build_array(o.value, n.value)) INTO v_changes
      FROM jsonb_each(to_jsonb(OLD)) o JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
     WHERE o.value IS DISTINCT FROM n.value;
    IF v_changes IS NULL THEN RETURN NEW; END IF;        -- không có gì đổi thật
    v_id := (to_jsonb(NEW)->>'id')::bigint;
  ELSIF TG_OP = 'INSERT' THEN
    v_changes := to_jsonb(NEW); v_id := (to_jsonb(NEW)->>'id')::bigint;
  ELSE
    v_changes := to_jsonb(OLD); v_id := (to_jsonb(OLD)->>'id')::bigint;
  END IF;
  INSERT INTO audit_log(actor_id, actor_role, entity_type, entity_id, action, changes, project_id, request_id)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::int,
          NULLIF(current_setting('app.role', true), ''),
          TG_TABLE_NAME, v_id, TG_OP, v_changes,
          NULLIF(current_setting('app.project_id', true), '')::int,
          NULLIF(current_setting('app.request_id', true), ''));
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
```

Gắn trigger (AFTER INSERT/UPDATE/DELETE FOR EACH ROW) lên nhóm bảng đợt 1: `contracts`, `variations`, `payment_certs`, `invoices`, `cash_transactions`, `advances`, `payrolls`, `purchase_orders`, `task_documents`, `baselines`, `insurance_bonds`, `claims`. Dùng `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` cho idempotent.

**Immutable**: cuối migration `REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;` — ghi chú: role app hiện là owner DB nên revoke chỉ mang tính khai báo; chặn thật ở tầng app (không viết route UPDATE/DELETE) + nâng cấp hash-chain ở M43 PR3.

### Lưu ý thiết kế

- Route ghi các bảng trên **chưa bọc transaction** thì trigger vẫn ghi log nhưng actor NULL → PR1 rà các route PATCH/POST/DELETE chạm nhóm bảng đợt 1, bọc `withTransaction` nếu thiếu (đằng nào cũng đúng nguyên tắc "ghi nhiều bước bọc transaction").
- Cột nhạy cảm không cần che trong `changes` (log chỉ Admin đọc); **không** log bảng khối lượng lớn (`progress_dimensions`, `tasks` ticking) — đã có `task_history`.

## PR2 — Trang tra cứu & xuất

- `GET /api/admin/audit?entity=&entityId=&actorId=&from=&to=&page=` — chỉ `admin` (thêm `CAN.viewAudit`); trả phân trang 50 dòng, join tên actor.
- Trang `/admin/audit`: bảng lọc theo thực thể/người/khoảng ngày, mở rộng dòng xem diff trường (cũ → mới, highlight); nút xuất Excel (tái dùng pattern `/api/export/excel`). UI theo Quy ước chung (bảng dày, sticky header).
- Chi tiết thực thể tài chính (trang contract/VO/IPC) thêm tab "Lịch sử" gọi cùng API lọc theo entity — tái dùng component bảng.

## PR3 — Hash biên bản & hash-chain (tuân thủ)

- `task_documents`, `claim_documents`, `vo_documents`, `contract_documents`: thêm cột `sha256 TEXT` (migration mới); tính khi upload (`crypto.createHash`), hiển thị trên UI chi tiết tài liệu; route GET stream so hash khi đọc, lệch → 409 + cảnh báo (file bị tráo).
- `audit_log` thêm cột `row_hash TEXT`: trigger tính `sha256(prev_hash || id || at || changes)` (lấy `prev_hash` từ dòng id lớn nhất — chấp nhận serialize theo bigserial). Script `scripts/verify-audit-chain.ts` xác minh chuỗi, chạy trong cron tuần + in kết quả vào báo cáo tuần.
- Ký số thật (PAdES, USB token/HSM) **ngoài phạm vi** — ghi vào PROGRESS.md làm nợ có chủ đích, chờ nhu cầu pháp lý.

## Test

- `tests/audit-log.test.ts` (integration, `TEST_DATABASE_URL`, import `tests/setup.ts` đầu tiên): (1) UPDATE contract trong `withTransaction` có context → dòng audit đúng actor/changes chỉ chứa cột đổi; (2) UPDATE không đổi gì → không ghi; (3) DELETE ghi snapshot; (4) ngoài transaction → actor NULL vẫn ghi; (5) chuỗi hash hợp lệ sau 3 thao tác.
- `tests/request-context.test.ts` (unit): patch/get qua async boundaries.

## Chia PR

1. **PR1**: request-context + middleware + SET LOCAL + migration trigger + rà bọc transaction — kèm test tích hợp.
2. **PR2**: API + trang `/admin/audit` + tab lịch sử + export + axe e2e.
3. **PR3**: sha256 tài liệu + hash-chain + script verify + đưa vào cron tuần.
