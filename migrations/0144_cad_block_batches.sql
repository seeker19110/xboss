-- 0144_cad_block_batches.sql — M108 PR1: nạp block HÀNG LOẠT từ một tệp tổng hợp.
-- DDL theo M108 §11. Thêm thuần (CREATE TABLE / CREATE INDEX) — đi thẳng production theo DoD.
--
-- Vì sao là bảng riêng chứ không thêm cột vào `cad_block_proposals` (0141): một đề xuất M103 là
-- MỘT block kèm gói ứng viên đã dựng sẵn; một lô M108 là N block dùng CHUNG một gói (đường plugin)
-- hoặc N tệp lẻ (đường web, mô hình đa tệp M104 §1), và mỗi dòng còn mang kết quả phân loại
-- (nguồn quyết định + độ tin cậy + lý do) mà đề xuất lẻ không có. Nhét chung sẽ làm bảng cũ mang
-- hai nghĩa; tách bảng giữ `cad_block_proposals` đúng như hợp đồng M103 đang chạy.
--
-- KHÔNG có RLS: bám đúng lựa chọn đã chốt cho `cad_block_libs` (0139) và `cad_block_proposals`
-- (0141) — thư viện block là dữ liệu phát hành TOÀN CỤC, không mang org_id/project_id.

CREATE TABLE IF NOT EXISTS cad_block_batches (
  id                    SERIAL PRIMARY KEY,
  nguon                 TEXT NOT NULL CHECK (nguon IN ('plugin','web')),
  base_lib_version      TEXT NOT NULL,          -- chống đua version, y hệt M103 §1 AC4
  candidate_storage_key TEXT,                   -- gói gộp (đường plugin); NULL với đường web đa tệp
  candidate_dwg_sha256  TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',  -- tái dùng TRANG_THAI_DE_XUAT của M103
  reject_reason         TEXT,
  published_version     TEXT,                   -- version thư viện sinh ra khi duyệt
  ai_enabled            BOOLEAN NOT NULL DEFAULT FALSE,   -- lô này có chạy tầng 2/3 không (PR2)
  proposed_by           INTEGER NOT NULL REFERENCES users(id),
  decided_by            INTEGER REFERENCES users(id),
  decided_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Truy vấn chính: lọc hàng chờ theo trạng thái (panel web + plugin hỏi "lô của tôi").
CREATE INDEX IF NOT EXISTS idx_cad_block_batches_status ON cad_block_batches(status);

-- Mỗi dòng = 1 block ứng viên trong lô.
CREATE TABLE IF NOT EXISTS cad_block_batch_items (
  id               SERIAL PRIMARY KEY,
  batch_id         INTEGER NOT NULL REFERENCES cad_block_batches(id) ON DELETE CASCADE,
  block_name       TEXT NOT NULL,
  kind             TEXT,                    -- NULL = chưa quyết được, chờ người khai (FR6)
  system_id        TEXT,
  takeoff_item_id  TEXT,
  paper_size       TEXT,
  attributes       JSONB,                   -- thẻ ATTDEF đọc được từ chính định nghĩa block
  file_key         TEXT,                    -- đường web đa tệp (M104 §1); NULL với gói gộp
  file_sha256      TEXT,
  preview_svg      TEXT,                    -- best-effort, dựng từ DXF; NULL nếu không dựng được
  nguon_quyet_dinh TEXT NOT NULL            -- luat | ngu_nghia | hinh_anh | nguoi_sua | chua_quyet
    CHECK (nguon_quyet_dinh IN ('luat','ngu_nghia','hinh_anh','nguoi_sua','chua_quyet')),
  do_tin_cay       NUMERIC(3,2),            -- 0.00–1.00; NULL với nguồn luat/nguoi_sua/chua_quyet
  ly_do            TEXT,
  chon             BOOLEAN NOT NULL DEFAULT TRUE,   -- người duyệt bỏ chọn dòng không muốn nạp
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cad_block_batch_items_batch ON cad_block_batch_items(batch_id);

-- Trong cùng một lô, tên block là duy nhất (không phân biệt hoa thường — AutoCAD cũng vậy):
-- tệp tổng hợp không thể chứa 2 định nghĩa trùng tên, nên trùng ở đây là lỗi dựng lô.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cad_block_batch_items_ten
  ON cad_block_batch_items(batch_id, upper(block_name));
