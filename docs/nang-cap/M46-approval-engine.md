# M46 — Approval Engine: phê duyệt nhiều cấp cấu hình được (P1)

> **Mục tiêu**: gom logic phê duyệt đang hard-code rải rác (VO, IPC, proposal, nghiệm thu) về một engine dữ liệu-hoá: chuỗi duyệt nhiều cấp theo vai trò, ngưỡng kích hoạt theo giá trị, SLA nhắc hạn, phân tách nhiệm vụ (SoD), idempotent. Nâng trục Workflow 2.0 → ~3.5.
>
> **Nguyên tắc không phá**: entity chưa có flow active → hành xử y như hiện tại (duyệt 1 bước qua `CAN.approve`). Gate nghiệp vụ (task 100% mới nghiệm thu, hold-point, `requiredInspectionMissing`) **giữ nguyên trong route** — engine chỉ trả lời "ai duyệt, đến bước nào".
>
> **Phụ thuộc**: nên sau M43 PR1 (audit trail tự ghi mọi thay đổi bảng approval).

## PR1 — Schema + logic thuần

### Migration `0051_approvals.sql`

```sql
CREATE TABLE IF NOT EXISTS approval_flows (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,   -- NULL = áp mọi dự án
  entity_type TEXT NOT NULL,      -- 'variation' | 'payment_cert' | 'proposal' | 'task_acceptance'
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_flow_active
  ON approval_flows(entity_type, COALESCE(project_id, 0)) WHERE active;   -- 1 flow active/entity/dự án

CREATE TABLE IF NOT EXISTS approval_steps (
  id SERIAL PRIMARY KEY,
  flow_id INT NOT NULL REFERENCES approval_flows(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  role TEXT NOT NULL,             -- vai trò lib/roles.ts được duyệt bước này
  min_amount NUMERIC(15,2),       -- bước chỉ kích hoạt khi amount >= min_amount (NULL = luôn)
  sla_days INT,
  UNIQUE(flow_id, seq)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id SERIAL PRIMARY KEY,
  flow_id INT NOT NULL REFERENCES approval_flows(id),
  entity_type TEXT NOT NULL, entity_id INT NOT NULL,
  project_id INT NOT NULL,
  amount NUMERIC(15,2),
  current_seq INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | cancelled
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_request_live
  ON approval_requests(entity_type, entity_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS approval_actions (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_seq INT NOT NULL,
  actor_id INT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,        -- approve | reject
  note TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id, step_seq)   -- idempotent: 1 quyết định/bước
);
```

### `lib/approvals.ts` (mới)

```ts
// Bước hiệu lực của request = các step của flow có min_amount IS NULL hoặc <= amount, theo seq.
export async function getActiveFlow(entityType: string, projectId: number): Promise<Flow | undefined>;
export async function openApproval(opts: { entityType; entityId; projectId; amount?; user }): Promise<Request | null>;
  // null nếu không có flow (caller giữ hành vi cũ). Bọc withTransaction. Không có bước hiệu lực → auto-approved.
export async function advanceApproval(opts: { entityType; entityId; user; decision; note? }): Promise<Result>;
  // - SELECT request FOR UPDATE; 404 nếu không pending.
  // - Quyền: user.role === step.role hiện tại, HOẶC admin. VIEW_ONLY_ROLES luôn 403.
  // - SoD: actor_id === created_by → 403 "Người tạo không được tự duyệt".
  // - reject → status=rejected, chốt. approve → bước hiệu lực kế tiếp hoặc status=approved.
export async function pendingForUser(user, projectId): Promise<PendingItem[]>;  // hộp thư "chờ tôi duyệt"
export function decideNext(steps, amount, currentSeq): Step | null;             // logic thuần — unit test
```

## PR2 — Áp cho VO + IPC (payment_certs)

- `POST /api/variations` / `POST /api/payment-certs`: sau khi tạo, gọi `openApproval` (amount = giá trị VO/IPC). Route duyệt hiện có (PATCH status → approved) đổi thành gọi `advanceApproval`; không có flow → fallback check `CAN.approve` như cũ (giữ nguyên hành vi production hiện tại).
- Trạng thái hiển thị: entity đang có request pending → badge "Chờ duyệt (bước n/N — vai trò X)"; lịch sử duyệt (actions) hiển thị trong tab chi tiết.
- Notification: khi request mở/chuyển bước → upsert notification type mới `approval_pending` cho user thuộc role của bước (dedup theo request); tự dọn khi hết pending (cơ chế on-fetch sẵn có). SLA: quá `sla_days` → notification `approval_overdue` (đánh giá trong cùng lần đồng bộ on-fetch, so `now - created_at`).

## PR3 — Áp nghiệm thu + hộp thư duyệt hợp nhất

- Nghiệm thu task (`POST /api/tasks/:id/approve`, `POST /api/approvals`): nếu có flow `task_acceptance` active → đi qua engine (mỗi task 1 request, amount NULL); không có → 1 bước như hiện tại. Gate 100% + `requiredInspectionMissing` giữ nguyên trước khi mở request.
- Trang `/approvals` mở rộng: thêm section "Chờ tôi duyệt" (mọi entity_type, từ `pendingForUser`) phía trên danh sách task chờ nghiệm thu hiện có; mỗi dòng: loại + mã + giá trị + bước + hạn SLA + nút Duyệt/Từ chối (kèm note bắt buộc khi từ chối).
- Proposal (`/api/proposals`) chuyển sang engine cùng PR này (ít dùng, rủi ro thấp).

## PR4 — UI Admin cấu hình flow

- `GET/POST /api/admin/approval-flows`, `PATCH/DELETE /api/admin/approval-flows/:id` (admin; PM chỉ xem): CRUD flow + steps (mảng {seq, role, min_amount, sla_days}). Validate: seq liên tục từ 1, role hợp lệ ngoài VIEW_ONLY (trừ `cdt` — cho phép làm bước duyệt cuối), không sửa flow đang có request pending (409 kèm số request).
- Trang `/admin/approval-flows`: danh sách theo entity_type, form bước dạng bảng thêm/xoá dòng. Seed mặc định: không seed — không có flow nghĩa là hành vi cũ.

## Test

- `tests/approvals.test.ts` (unit): `decideNext` — ngưỡng min_amount lọc bước, amount NULL, hết bước.
- `tests/approvals-flow.test.ts` (integration): mở request → duyệt sai role 403 → SoD 403 → duyệt đúng 2 bước → approved; reject chốt; unique chặn duyệt trùng bước (23505 → 409); fallback không flow.

## Chia PR

1. **PR1**: migration + `lib/approvals.ts` + test.
2. **PR2**: VO + IPC + notification + badge.
3. **PR3**: nghiệm thu + proposal + hộp thư `/approvals`.
4. **PR4**: UI Admin cấu hình.
