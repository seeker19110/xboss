-- 0146_cad_schematic_graphs.sql — M117 PR1 (§9 Data contract): đồ thị kết nối đọc từ bản vẽ
-- SƠ ĐỒ NGUYÊN LÝ (schematic) của một dự án.
--
-- Một dòng = một tệp DXF schematic đã được dựng thành graph (nút thiết bị / nút rẽ / đầu hở +
-- cạnh nối kèm size). Graph đi qua ba chặng đúng M117 §6: tầng 1 luật (`lib/ky-thuat/cad/schematic.ts`,
-- PR1) → tầng 2 AI bù ngữ nghĩa (PR2) → người duyệt trên web (PR3) rồi mới `trang_thai='da_duyet'`
-- cho plugin tải về sinh tuyến tim gợi ý (PR4).
--
-- Vì sao lưu cả graph vào MỘT cột JSONB thay vì hai bảng nút/cạnh:
--   • Graph là **kết quả đọc một tệp** — luôn đọc/ghi trọn gói (parse lại, AI bù, người duyệt sửa
--     rồi chốt), chưa có nhu cầu truy vấn xuyên nút/cạnh giữa các tệp. Tách bảng lúc này chỉ thêm
--     join mà không thêm câu trả lời nào.
--   • Hình dạng JSONB là hợp đồng đã chốt ở §9 và được kiểm bằng kiểu TypeScript + hàm đọc trong
--     `lib/ky-thuat/cad/schematic.ts`, không phải dữ liệu tự do.
-- Cần thống kê xuyên tệp về sau thì thêm bảng phái sinh, không phải sửa bảng này (append-only).
--
-- Migration THÊM THUẦN (CREATE TABLE / CREATE INDEX + bật RLS), không đụng dòng dữ liệu nào.

CREATE TABLE IF NOT EXISTS cad_schematic_graphs (
  id BIGSERIAL PRIMARY KEY,
  -- Kiểu BIGINT theo đúng DDL đã chốt ở M117 §9 (khoá ngoại int8 → int4 của projects/users là hợp
  -- lệ trong Postgres). KHÔNG đặt ON DELETE CASCADE: graph là bản đọc của một tệp bản vẽ thật,
  -- xoá dự án mà kéo theo graph là mất dấu vết im lặng — để FK chặn (fail-fast) đúng hơn.
  project_id BIGINT NOT NULL REFERENCES projects(id),
  -- Hệ theo rule pack `drawTools.systems[].id` (người tải lên chọn) — không FK được vì rule pack
  -- là tệp JSON phát hành, không phải bảng; API kiểm id có thật trước khi ghi.
  system_id TEXT NOT NULL,
  -- Khoá tệp DXF gốc trong kho lưu trữ (`lib/nen/storage.ts`), giữ để parse lại khi luật đổi.
  file_path TEXT NOT NULL,
  -- {nodes:[{id,kind,blockName,tag,nguon,doTinCay,...}],edges:[{from,to,size,nguon,...}]}
  graph JSONB NOT NULL,
  -- 'nhap'    = đang đọc/sửa, plugin KHÔNG tải được (PR4 trả 409);
  -- 'da_duyet'= đã có người chốt, khoá lại làm nguồn sinh tuyến tim gợi ý.
  trang_thai TEXT NOT NULL DEFAULT 'nhap' CHECK (trang_thai IN ('nhap','da_duyet')),
  duyet_boi BIGINT REFERENCES users(id),
  duyet_luc TIMESTAMPTZ,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Truy vấn chính: danh sách graph của dự án đang mở (tab "Sơ đồ nguyên lý").
CREATE INDEX IF NOT EXISTS idx_schematic_project ON cad_schematic_graphs(project_id);

-- ===== RLS — bắt buộc với mọi bảng có project_id (docs/adr/0005-rls.md) =====
-- Khuôn NGHIÊM NGẶT 2 nhánh y hệt 0140 (bảng hoàn toàn mới, mọi đường đọc/ghi đều bọc
-- `withProjectScope` nên GUC `app.project_id` luôn có mặt — không cần nhánh chuyển tiếp "GUC rỗng").
-- So sánh dạng TEXT, KHÔNG cast GUC ::int (Postgres không bảo đảm short-circuit nên nhánh '*' sẽ
-- lỗi "invalid input syntax for integer" — bài học ghi ở 0069/0077).
ALTER TABLE cad_schematic_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cad_schematic_graphs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_cad_schematic_graphs_project ON cad_schematic_graphs;
CREATE POLICY p_cad_schematic_graphs_project ON cad_schematic_graphs
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );
