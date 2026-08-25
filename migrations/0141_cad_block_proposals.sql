-- 0141_cad_block_proposals.sql — M103: đề xuất block vào thư viện từ AutoCAD (hàng chờ + duyệt).
-- DDL theo M103 §2. Thêm thuần (CREATE TABLE / CREATE INDEX) — đi thẳng production theo DoD.
--
-- Thư viện block vẫn là dữ liệu PHÁT HÀNH có version toàn cục (M100 §18): đề xuất KHÔNG sửa
-- `cad_block_libs`, chỉ xếp hàng chờ; duyệt mới chép nguyên gói ứng viên thành version mới.
-- Server không chạy AutoCAD nên không gộp DWG được — plugin dựng sẵn thư viện ứng viên hoàn
-- chỉnh (blocks.dwg + manifest đầy đủ + sidecar DXF), server chỉ kiểm định rồi lưu nguyên.
--
-- Chống đua version: mỗi đề xuất mang `base_lib_version`; lúc NHẬN và lúc DUYỆT server đều so
-- với version hiện hành, lệch → 409 và đánh dấu `stale` (M103 §1, AC4).

CREATE TABLE IF NOT EXISTS cad_block_proposals (
  id               SERIAL PRIMARY KEY,
  block_name       TEXT NOT NULL,
  kind             TEXT NOT NULL,            -- fitting|equipment|titleblock|support|sleeve (LOAI_BLOCK)
  system_id        TEXT,                     -- bắt buộc trừ titleblock
  takeoff_item_id  TEXT,                     -- bắt buộc với kind đếm KL (fitting/equipment/support/sleeve)
  paper_size       TEXT,                     -- chỉ titleblock
  note             TEXT,
  base_lib_version TEXT NOT NULL,
  candidate_manifest JSONB NOT NULL,         -- manifest ĐẦY ĐỦ sau khi thêm
  candidate_storage_key TEXT NOT NULL,       -- DWG ứng viên trong data/uploads/ (tên server sinh như task_documents)
  candidate_dwg_sha256  TEXT NOT NULL,
  preview_svg      TEXT,                     -- best-effort từ sidecar DXF; null nếu không dựng được
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected|stale
  reject_reason    TEXT,
  published_version TEXT,                    -- version thư viện sinh ra khi approved
  proposed_by      INTEGER NOT NULL REFERENCES users(id),
  decided_by       INTEGER REFERENCES users(id),
  decided_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Truy vấn chính: lọc hàng chờ theo trạng thái (panel web + plugin hỏi "đề xuất của tôi").
CREATE INDEX IF NOT EXISTS idx_cad_block_proposals_status ON cad_block_proposals(status);
