-- 0053_approvals.sql — M46 PR1: Approval Engine (phê duyệt nhiều cấp cấu hình được).
-- Gom logic duyệt đang hard-code rải rác (VO, IPC, proposal, nghiệm thu) về một engine
-- dữ liệu-hoá: chuỗi duyệt nhiều cấp theo vai trò, ngưỡng theo giá trị, SLA, phân tách
-- nhiệm vụ (SoD), idempotent. Không seed flow nào — không có flow = hành xử như hiện tại
-- (duyệt 1 bước qua CAN.approve). Xem docs/nang-cap/M46-approval-engine.md.
-- (Đặc tả ghi số 0051 — đã bị M45 chiếm; dùng 0053, số kế tiếp sau 0052_soft_delete.sql.)

-- Chuỗi duyệt cho 1 loại thực thể (áp mọi dự án khi project_id NULL, hoặc riêng 1 dự án).
CREATE TABLE IF NOT EXISTS approval_flows (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,   -- NULL = áp mọi dự án
  entity_type TEXT NOT NULL,      -- 'variation' | 'payment_cert' | 'proposal' | 'task_acceptance'
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
-- Tối đa 1 flow active mỗi (loại, dự án); COALESCE gộp NULL về 0 để index nhất quán.
CREATE UNIQUE INDEX IF NOT EXISTS ux_flow_active
  ON approval_flows(entity_type, COALESCE(project_id, 0)) WHERE active;

-- Các bước duyệt của flow (theo seq tăng dần).
CREATE TABLE IF NOT EXISTS approval_steps (
  id SERIAL PRIMARY KEY,
  flow_id INT NOT NULL REFERENCES approval_flows(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  role TEXT NOT NULL,             -- vai trò (lib/roles.ts) được duyệt bước này
  min_amount NUMERIC(15,2),       -- bước chỉ kích hoạt khi amount >= min_amount (NULL = luôn)
  sla_days INT,
  UNIQUE(flow_id, seq)
);

-- 1 yêu cầu duyệt = 1 thực thể đang đi qua flow.
CREATE TABLE IF NOT EXISTS approval_requests (
  id SERIAL PRIMARY KEY,
  flow_id INT NOT NULL REFERENCES approval_flows(id),
  entity_type TEXT NOT NULL,
  entity_id INT NOT NULL,
  project_id INT NOT NULL,
  amount NUMERIC(15,2),
  current_seq INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | cancelled
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
-- Tối đa 1 request đang chạy mỗi thực thể (chống mở trùng).
CREATE UNIQUE INDEX IF NOT EXISTS ux_request_live
  ON approval_requests(entity_type, entity_id) WHERE status = 'pending';

-- Nhật ký quyết định từng bước (idempotent: 1 quyết định/bước qua UNIQUE).
CREATE TABLE IF NOT EXISTS approval_actions (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_seq INT NOT NULL,
  actor_id INT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,        -- approve | reject
  note TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id, step_seq)
);

-- Gắn audit trigger (0049) lên bảng approval để mọi thay đổi được ghi tự động (M43 PR1).
-- audit_row_change() đã tồn tại từ 0049; DROP+CREATE cho idempotent.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_requests', 'approval_actions'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
