-- 0140_cad_boq_code_map.sql — M101 PR4 (§6.3, hai dòng cuối bảng): gán MÃ BOQ cho từng
-- hạng mục bóc tách của rule pack THEO TỪNG DỰ ÁN.
--
-- Vì sao cần bảng riêng thay vì sửa rule pack: rule pack là tệp append-only dùng chung toàn
-- công ty (lib/ky-thuat/cad/rule-packs/*.json) — mã BOQ thì mỗi dự án một khác. Trước bảng này,
-- muốn cố định mã theo dự án phải phát hành hẳn một version rule pack mới (xem `boqCodeNote`
-- trong v7), tức QS phải gõ tay cột A của Excel mỗi lần bóc.
--
-- `boq_code` ở đây là THAM CHIẾU tới mã đã tồn tại (thường là `boq_items.code` của dự án), KHÔNG
-- phải nơi cấp phát mã mới — nên KHÔNG đăng ký vào sổ `boq_codes` (0029) và KHÔNG có trigger:
-- đăng ký sẽ đụng chính dòng BOQ đang sở hữu mã đó và làm hỏng bất biến "một mã một chủ".
-- Mã chưa có dòng BOQ tương ứng vẫn lưu được (dự án chưa nhập BOQ vào XBoss) — API đối chiếu
-- trả `qtyContract = null` cho trường hợp đó thay vì im lặng bỏ dòng.
--
-- Migration THÊM THUẦN (CREATE TABLE/INDEX + bật RLS), không đụng dòng dữ liệu nào.

CREATE TABLE IF NOT EXISTS cad_takeoff_boq_map (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- id hạng mục trong rule pack (`takeoff.items[].id`, vd 'duct-supp'). Không FK được vì rule
  -- pack là tệp JSON, không phải bảng — API kiểm id có thật trước khi ghi.
  takeoff_item_id TEXT NOT NULL,
  boq_code TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Một hạng mục chỉ có ĐÚNG một mã BOQ trong một dự án — ghi lại = UPDATE (ON CONFLICT), không
-- đẻ dòng thứ hai (idempotent khi web bấm lưu 2 lần / mạng chập chờn).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cad_takeoff_boq_map
  ON cad_takeoff_boq_map(project_id, takeoff_item_id);
CREATE INDEX IF NOT EXISTS idx_cad_takeoff_boq_map_project
  ON cad_takeoff_boq_map(project_id);

-- ===== RLS — bắt buộc với mọi bảng có project_id (docs/adr/0005-rls.md) =====
-- Dùng khuôn NGHIÊM NGẶT 2 nhánh của 0077/0092 (không có nhánh chuyển tiếp "GUC rỗng → cho qua"
-- như 0069): bảng này hoàn toàn mới, mọi đường đọc/ghi đều đi qua lib/ky-thuat/cad/boq-map.ts và
-- lib/dich-vu/cad-boq-snapshot.ts — đều bọc `withProjectScope` nên GUC luôn có mặt.
-- So sánh dạng TEXT, KHÔNG cast GUC ::int (Postgres không bảo đảm short-circuit nên nhánh '*'
-- sẽ lỗi "invalid input syntax for integer" — bài học ghi ở 0069/0077).
ALTER TABLE cad_takeoff_boq_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE cad_takeoff_boq_map FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_cad_takeoff_boq_map_project ON cad_takeoff_boq_map;
CREATE POLICY p_cad_takeoff_boq_map_project ON cad_takeoff_boq_map
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );
