-- 0071_bi_schema.sql — M55 PR1: schema `bi` (view whitelist chỉ-đọc) + role `xboss_bi`.
-- Xem docs/nang-cap/M55-bi-metabase.md § PR1.
--
-- MỤC ĐÍCH: Metabase self-host đọc dữ liệu BI mà KHÔNG xuyên thủng lớp quyền tầng app
-- (masking tiền M50 PR2, scope dự án M22, SoD). Metabase KHÔNG BAO GIỜ đọc schema `public`
-- — chỉ đọc schema `bi` gồm các VIEW đã áp sẵn luật che, qua role Postgres riêng chỉ-đọc.
-- Thuần thêm (CREATE SCHEMA/VIEW + GRANT) → đi thẳng production.
--
-- ===== 5 NGUYÊN TẮC VIẾT VIEW (áp cho MỌI view trong schema `bi`) =====
--   1. Whitelist cột tường minh — KHÔNG `SELECT *` (cột mới ở bảng gốc không tự lộ ra BI).
--   2. Cột tiền/đơn giá/tỷ lệ nhạy cảm (theo lib/sensitive-fields.ts) CHỈ xuất hiện trong
--      view có hậu tố `_fin` (nhóm tài chính, đối tượng dùng đợt 1 là Admin/PM có viewPayments).
--      View KHÔNG có `_fin` tuyệt đối không chứa cột tiền/đơn giá/tỷ lệ.
--   3. Không PII ngoài cần thiết: `users` chỉ lộ id/name/role — KHÔNG email/password_hash.
--   4. Tôn trọng soft-delete (M44): mọi view lấy từ bảng có cột deleted_at đều có
--      WHERE deleted_at IS NULL (contracts / variation_orders / payment_certs).
--   5. Tiền giữ nguyên kiểu `numeric` trong view — Metabase tự aggregate đúng trên Postgres,
--      không đi qua parser float JS (không dính ràng buộc M45). Mọi phép nhân tiền để trong SQL.
--
-- CREATE ROLE chạy TAY lúc deploy (mật khẩu không nằm trong git — xem DEPLOY.md):
--   CREATE ROLE xboss_bi LOGIN PASSWORD '...' NOBYPASSRLS;
-- Migration KHÔNG tạo role; các câu GRANT ở CUỐI file bọc trong DO ... EXCEPTION để idempotent
-- + an toàn khi role chưa được tạo tay (CI/dev Postgres sạch).
--
-- THỨ TỰ DEPLOY QUAN TRỌNG: tạo role xboss_bi TRƯỚC khi chạy migration lần đầu để GRANT áp
-- ngay. Nếu migration đã chạy trước khi có role (GRANT bị bỏ qua), chạy lại migration KHÔNG
-- áp lại GRANT (schema_migrations đã ghi nhận 0071 → không tái chạy) — phải GRANT thủ công:
--   GRANT USAGE ON SCHEMA bi TO xboss_bi;
--   GRANT SELECT ON ALL TABLES IN SCHEMA bi TO xboss_bi;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA bi GRANT SELECT ON TABLES TO xboss_bi;

CREATE SCHEMA IF NOT EXISTS bi;

-- ============================ NHÓM TIẾN ĐỘ ============================

-- bi.tasks — task + tên nhóm/sheet/hệ/tháp/dự án đã JOIN phẳng (work_packages → sheet_types
-- → towers → projects; sheet_types → systems). Ngày hiệu lực COALESCE(task, nhóm) — đúng bài
-- học fix 2026-07-16 (task chưa đặt ngày rơi về ngày nhóm). Không cột tiền.
CREATE OR REPLACE VIEW bi.tasks AS
SELECT t.id AS task_id,
       t.code AS task_code,
       t.boq_code,
       t.name AS task_name,
       t.status,
       t.progress_percent,
       COALESCE(t.start_date, wp.start_date) AS start_date,
       COALESCE(t.end_date, wp.end_date) AS end_date,
       t.duration_days,
       t.delay_reason,
       t.delay_note,
       t.updated_at,
       t.assigned_to,
       u.name AS assignee_name,
       wp.id AS package_id,
       wp.code AS package_code,
       wp.name AS package_name,
       wp.floor_label,
       st.id AS sheet_type_id,
       st.code AS sheet_code,
       st.name AS sheet_name,
       st.slug AS sheet_slug,
       sy.id AS system_id,
       sy.code AS system_code,
       sy.name AS system_name,
       sy.color AS system_color,
       tw.id AS tower_id,
       tw.name AS tower_name,
       p.id AS project_id,
       p.name AS project_name
  FROM tasks t
  JOIN work_packages wp ON wp.id = t.package_id
  JOIN sheet_types st ON st.id = wp.sheet_type_id
  LEFT JOIN systems sy ON sy.id = st.system_id
  LEFT JOIN towers tw ON tw.id = st.tower_id
  LEFT JOIN projects p ON p.id = tw.project_id
  LEFT JOIN users u ON u.id = t.assigned_to;

-- bi.task_history_daily — tiến độ trung bình mỗi ngày theo (dự án, hệ), lấy nguyên từ
-- mv_progress_daily (M47 PR2) — KHÔNG tính lại. mv dùng sentinel 0 cho project/system NULL
-- nên LEFT JOIN cho ra tên NULL với dòng sentinel (chấp nhận được cho trục thời gian).
CREATE OR REPLACE VIEW bi.task_history_daily AS
SELECT m.project_id,
       m.system_id,
       m.date,
       m.avg_progress,
       m.done_count,
       m.total_count,
       p.name AS project_name,
       sy.name AS system_name
  FROM mv_progress_daily m
  LEFT JOIN projects p ON p.id = m.project_id
  LEFT JOIN systems sy ON sy.id = m.system_id;

-- bi.delays — task đang trễ (ngày KT hiệu lực đã qua & chưa đạt 100%) + lý do trễ. Không tiền.
CREATE OR REPLACE VIEW bi.delays AS
SELECT t.id AS task_id,
       t.code AS task_code,
       t.name AS task_name,
       t.progress_percent,
       COALESCE(t.end_date, wp.end_date) AS end_date,
       (CURRENT_DATE - COALESCE(t.end_date, wp.end_date)) AS days_late,
       t.delay_reason,
       t.delay_note,
       t.assigned_to,
       u.name AS assignee_name,
       sy.name AS system_name,
       tw.name AS tower_name,
       p.name AS project_name
  FROM tasks t
  JOIN work_packages wp ON wp.id = t.package_id
  JOIN sheet_types st ON st.id = wp.sheet_type_id
  LEFT JOIN systems sy ON sy.id = st.system_id
  LEFT JOIN towers tw ON tw.id = st.tower_id
  LEFT JOIN projects p ON p.id = tw.project_id
  LEFT JOIN users u ON u.id = t.assigned_to
 WHERE COALESCE(t.end_date, wp.end_date) < CURRENT_DATE
   AND COALESCE(t.progress_percent, 0) < 1;

-- ============================ NHÓM THƯƠNG MẠI (_fin) ============================
-- Chứa cột tiền/tỷ lệ → hậu tố `_fin`, tách sẵn để đợt sau cấp role BI hẹp chỉ cần thu GRANT.

-- bi.contracts_fin — sổ hợp đồng còn sống. value/advance_pct/retention_pct là cột nhạy cảm.
CREATE OR REPLACE VIEW bi.contracts_fin AS
SELECT c.id AS contract_id,
       c.code AS contract_code,
       c.kind,
       c.title,
       c.party_name,
       c.status,
       c.signed_date,
       c.valid_from,
       c.valid_to,
       c.value,
       c.advance_pct,
       c.retention_pct,
       c.system_id,
       sy.name AS system_name,
       c.project_id,
       p.name AS project_name
  FROM contracts c
  LEFT JOIN systems sy ON sy.id = c.system_id
  LEFT JOIN projects p ON p.id = c.project_id
 WHERE c.deleted_at IS NULL;

-- bi.variations_fin — VO còn sống + giá trị đề xuất/được duyệt (Σ KL×đơn giá, tính trong SQL).
CREATE OR REPLACE VIEW bi.variations_fin AS
SELECT v.id AS vo_id,
       v.code AS vo_code,
       v.title,
       v.reason,
       v.status,
       v.submitted_at,
       v.decided_at,
       v.system_id,
       sy.name AS system_name,
       v.contract_id,
       v.project_id,
       p.name AS project_name,
       COALESCE((SELECT SUM(bi_v.qty_contract * bi_v.unit_price)::numeric
                   FROM boq_items bi_v WHERE bi_v.vo_id = v.id), 0) AS proposed_value,
       COALESCE((SELECT SUM(COALESCE(bi_a.qty_approved, 0) * bi_a.unit_price)::numeric
                   FROM boq_items bi_a WHERE bi_a.vo_id = v.id), 0) AS approved_value
  FROM variation_orders v
  LEFT JOIN systems sy ON sy.id = v.system_id
  LEFT JOIN projects p ON p.id = v.project_id
 WHERE v.deleted_at IS NULL;

-- bi.payment_certs_fin — IPC còn sống + giá trị đợt/luỹ kế (Σ KL×đơn giá snapshot). project_id
-- suy qua hợp đồng (payment_certs không có cột project_id).
CREATE OR REPLACE VIEW bi.payment_certs_fin AS
SELECT pc.id AS cert_id,
       pc.code AS cert_code,
       pc.contract_id,
       pc.period_no,
       pc.period_label,
       pc.status,
       pc.submitted_at,
       pc.decided_at,
       c.project_id,
       p.name AS project_name,
       COALESCE((SELECT SUM(pci.qty_period * pci.unit_price)::numeric
                   FROM payment_cert_items pci WHERE pci.cert_id = pc.id), 0) AS period_value,
       COALESCE((SELECT SUM(pci.qty_cumulative * pci.unit_price)::numeric
                   FROM payment_cert_items pci WHERE pci.cert_id = pc.id), 0) AS cumulative_value
  FROM payment_certs pc
  LEFT JOIN contracts c ON c.id = pc.contract_id
  LEFT JOIN projects p ON p.id = c.project_id
 WHERE pc.deleted_at IS NULL;

-- bi.cost_by_month_fin — cam kết/thực chi theo tháng, lấy nguyên từ mv_cost_by_month (M47 PR2).
CREATE OR REPLACE VIEW bi.cost_by_month_fin AS
SELECT m.project_id,
       m.month,
       m.committed,
       m.actual,
       p.name AS project_name
  FROM mv_cost_by_month m
  LEFT JOIN projects p ON p.id = m.project_id;

-- bi.cash_fin — dòng tiền thanh toán (payment_bills). amount/labor là cột tiền. project_id lấy
-- TRỰC TIẾP từ payment_bills.project_id (thêm ở 0069_rls) — đúng cột mà RLS scope theo, và
-- không rớt dòng khi bill chưa gắn sheet_type.
CREATE OR REPLACE VIEW bi.cash_fin AS
SELECT pb.id AS bill_id,
       pb.type,
       pb.responsible,
       pb.period,
       pb.paid_date,
       pb.amount,
       pb.labor,
       pb.description,
       pb.contract_id,
       pb.payment_cert_id,
       pb.sheet_type_id,
       pb.floor_label,
       pb.project_id,
       p.name AS project_name
  FROM payment_bills pb
  LEFT JOIN projects p ON p.id = pb.project_id;

-- ============================ NHÓM VẬT TƯ / MUA SẮM ============================
-- Không lộ đơn giá (unit_price ở po_items/boq_items) — các view này chỉ ở mức số lượng.

-- bi.materials — vật tư + số lượng (BOQ/kế hoạch/đã dùng/tồn). Không cột tiền.
CREATE OR REPLACE VIEW bi.materials AS
SELECT m.id AS material_id,
       m.boq_code,
       m.name AS material_name,
       m.unit,
       m.qty_boq,
       m.qty_planned,
       m.qty_used,
       m.qty_stock,
       m.min_stock_level,
       m.status,
       m.project_id,
       m.sheet_type_id,
       st.name AS sheet_name,
       sy.name AS system_name
  FROM materials m
  LEFT JOIN sheet_types st ON st.id = m.sheet_type_id
  LEFT JOIN systems sy ON sy.id = st.system_id;

-- bi.purchase_orders — đầu đơn đặt hàng (không dòng chi tiết/đơn giá). Không cột tiền.
CREATE OR REPLACE VIEW bi.purchase_orders AS
SELECT po.id AS po_id,
       po.po_code,
       po.status,
       po.expected_date,
       po.created_at,
       po.supplier_id,
       s.name AS supplier_name,
       po.contract_id,
       po.project_id
  FROM purchase_orders po
  LEFT JOIN suppliers s ON s.id = po.supplier_id;

-- bi.material_transactions — nhật ký nhập/xuất vật tư (số lượng, không tiền).
CREATE OR REPLACE VIEW bi.material_transactions AS
SELECT mt.id AS transaction_id,
       mt.material_id,
       m.name AS material_name,
       mt.type,
       mt.delta,
       mt.qty_after,
       mt.task_id,
       mt.created_at,
       mt.created_by
  FROM material_transactions mt
  LEFT JOIN materials m ON m.id = mt.material_id;

-- ============================ NHÓM QA/QC + HIỆN TRƯỜNG ============================

-- bi.ncrs — phiếu không phù hợp.
CREATE OR REPLACE VIEW bi.ncrs AS
SELECT n.id AS ncr_id,
       n.code AS ncr_code,
       n.description,
       n.status,
       n.due_date,
       n.closed_at,
       n.created_at,
       n.task_id,
       n.inspection_id,
       n.assigned_to,
       u.name AS assignee_name,
       n.project_id,
       p.name AS project_name
  FROM ncrs n
  LEFT JOIN users u ON u.id = n.assigned_to
  LEFT JOIN projects p ON p.id = n.project_id;

-- bi.inspections — biên bản kiểm tra QC (không lộ payload results JSON).
CREATE OR REPLACE VIEW bi.inspections AS
SELECT qi.id AS inspection_id,
       qi.checklist_id,
       cl.name AS checklist_name,
       cl.category,
       qi.status,
       qi.task_id,
       qi.work_package_id,
       qi.inspected_by,
       qi.approved_by,
       qi.inspected_at
  FROM qc_inspections qi
  LEFT JOIN qc_checklists cl ON cl.id = qi.checklist_id;

-- bi.hse_records — hồ sơ HSE (kiểm tra/toolbox/sự cố/permit).
CREATE OR REPLACE VIEW bi.hse_records AS
SELECT h.id AS hse_record_id,
       h.kind,
       h.record_date,
       h.floor_label,
       h.area,
       h.description,
       h.severity,
       h.permit_type,
       h.action_status,
       h.action_due,
       h.action_assignee,
       h.project_id,
       p.name AS project_name
  FROM hse_records h
  LEFT JOIN projects p ON p.id = h.project_id;

-- bi.diaries — nhật ký thi công + tổng nhân lực ngày (Σ headcount).
CREATE OR REPLACE VIEW bi.diaries AS
SELECT sd.id AS diary_id,
       sd.diary_date,
       sd.weather_am,
       sd.weather_pm,
       sd.status,
       sd.created_at,
       sd.project_id,
       p.name AS project_name,
       COALESCE((SELECT SUM(dm.headcount) FROM diary_manpower dm WHERE dm.diary_id = sd.id), 0)
         AS total_headcount
  FROM site_diaries sd
  LEFT JOIN projects p ON p.id = sd.project_id;

-- ============================ NHÓM DANH MỤC ============================

-- bi.projects — danh mục dự án (không cột tiền).
CREATE OR REPLACE VIEW bi.projects AS
SELECT p.id AS project_id,
       p.name AS project_name,
       p.code AS project_code,
       p.investor,
       p.contractor,
       p.start_date,
       p.end_date,
       p.status
  FROM projects p;

-- bi.systems — danh mục hệ MEP.
CREATE OR REPLACE VIEW bi.systems AS
SELECT sy.id AS system_id,
       sy.code AS system_code,
       sy.name AS system_name,
       sy.color AS system_color
  FROM systems sy;

-- bi.users_dim — danh mục người dùng: CHỈ id/name/role (KHÔNG email/password_hash — PII).
CREATE OR REPLACE VIEW bi.users_dim AS
SELECT u.id AS user_id,
       u.name AS user_name,
       u.role
  FROM users u;

-- ============================ CẤP QUYỀN CHO ROLE xboss_bi ============================
-- Role xboss_bi tạo TAY lúc deploy → có thể chưa tồn tại khi migration chạy (CI/dev sạch).
-- Bọc trong DO ... EXCEPTION WHEN undefined_object để migration idempotent + không vỡ.
DO $$
BEGIN
  GRANT USAGE ON SCHEMA bi TO xboss_bi;
  GRANT SELECT ON ALL TABLES IN SCHEMA bi TO xboss_bi;
  ALTER DEFAULT PRIVILEGES IN SCHEMA bi GRANT SELECT ON TABLES TO xboss_bi;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Role xboss_bi chưa tồn tại — bỏ qua GRANT. Tạo role rồi GRANT thủ công (xem header): migration đã ghi 0071 nên chạy lại KHÔNG áp lại GRANT.';
END $$;
