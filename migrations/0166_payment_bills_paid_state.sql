-- 0166_payment_bills_paid_state.sql — M129: IPC "đã duyệt" ≠ "đã chi". Thêm trạng thái chi của
-- phiếu thanh toán (payment_bills) để tách CAM KẾT (đã duyệt, chưa chi) khỏi THỰC CHI.
-- Xem docs/nang-cap/M129-ipc-da-chi-tach-cam-ket-thuc-chi.md §2.1.
--
--   pay_status  'committed' = đã duyệt, chưa chi (phiếu sinh khi duyệt IPC từ M129)
--               'paid'      = đã chi (có paid_at, paid_by) — mặc định, giữ hành vi phiếu nhập tay
--               'void'      = huỷ (chỉ qua điều chỉnh/đảo phiếu M128 — M129 chỉ khai trong CHECK)
--   paid_at     ngày chi thật (nguồn sự thật của "thực chi"); paid_date giữ nguyên NOT NULL làm
--               ngày lập phiếu / ngày dự kiến để không phá code cũ.
--   paid_by     người đánh dấu đã chi (SoD: ≠ người duyệt IPC gốc — kiểm ở route /pay).
--   paid_ref    số UNC/chứng từ ngân hàng (tuỳ chọn); paid_note ghi chú (tuỳ chọn).
--
-- ĐỤNG DỮ LIỆU: có UPDATE backfill `paid_at = paid_date` cho mọi phiếu cũ → BẮT BUỘC chạy staging
-- trước production (`bash deploy.sh --staging`, docs/ops/staging.md; kiểm trước bằng
-- `npm run db:migrate -- --dry-run`). Backfill idempotent (điều kiện `paid_at IS NULL`) và giữ
-- số liệu báo cáo không đổi lúc deploy: mọi phiếu cũ là 'paid' tại đúng ngày paid_date cũ.
--
-- RLS: payment_bills là bảng FORCE RLS theo dự án (0069/0077) — role migration production không
-- phải superuser nên phải tự mở phạm vi '*' (transaction-local) TRƯỚC câu UPDATE, nếu không câu
-- ghi thấy 0 dòng và lặng lẽ không backfill gì (ADR-0005 cạm bẫy #3, ghi chú 0165).
--
-- Kèm theo (thêm thuần):
--   * notifications.payment_bill_id + unique index một phần — dedup thông báo `bill_unpaid`
--     (khuôn uq_notif_cert 0014 / uq_notif_advance 0039). ON DELETE CASCADE: thông báo là dữ liệu
--     dẫn xuất, xoá phiếu committed không được kẹt FK.
--   * Trigger audit_row_change cho payment_bills (khuôn 0049) — đánh dấu chi là thao tác tài chính
--     cần vết kiểm toán. Gắn SAU backfill để không đổ một dòng audit cho mỗi phiếu cũ.
--
-- Idempotent: ADD COLUMN/CREATE INDEX IF NOT EXISTS, DROP TRIGGER IF EXISTS trước CREATE.

SELECT set_config('app.project_id', '*', true);

ALTER TABLE payment_bills
  ADD COLUMN IF NOT EXISTS pay_status TEXT NOT NULL DEFAULT 'paid'
    CHECK (pay_status IN ('committed', 'paid', 'void')),
  ADD COLUMN IF NOT EXISTS paid_at    DATE,
  ADD COLUMN IF NOT EXISTS paid_by    INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS paid_ref   TEXT,
  ADD COLUMN IF NOT EXISTS paid_note  TEXT;

-- Dữ liệu cũ: mọi phiếu hiện có coi là đã chi tại paid_date (giữ số liệu báo cáo không đổi).
UPDATE payment_bills SET paid_at = paid_date WHERE pay_status = 'paid' AND paid_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_bills_pay_status ON payment_bills (project_id, pay_status);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS payment_bill_id INTEGER REFERENCES payment_bills(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_payment_bill
  ON notifications(user_id, type, payment_bill_id) WHERE payment_bill_id IS NOT NULL;

DROP TRIGGER IF EXISTS audit_payment_bills ON payment_bills;
CREATE TRIGGER audit_payment_bills AFTER INSERT OR UPDATE OR DELETE ON payment_bills
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
