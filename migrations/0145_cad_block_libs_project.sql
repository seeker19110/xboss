-- 0145_cad_block_libs_project.sql — M113 PR1 (§5): thư viện block HAI TẦNG (toàn cục + theo dự án).
--
-- 0139 cố ý làm thư viện TOÀN CỤC (ghi chú ngay trong migration đó, M100 §20 hẹn xem lại). Thực tế
-- sau pilot: khung tên và ký hiệu thiết bị mỗi CĐT một kiểu, còn phần lớn block MEPF thì giống nhau
-- ở mọi dự án ⇒ không chọn "toàn cục" hay "theo dự án" mà là hai tầng, dự án ĐÈ lên toàn cục
-- (luật trộn nằm gọn trong lib/ky-thuat/cad/block-lib.ts::tronThuVienBlock).
--
-- CẢNH BÁO VẬN HÀNH: migration này ĐỤNG RÀNG BUỘC trên dữ liệu đang có (DROP CONSTRAINT +
-- CREATE UNIQUE INDEX) ⇒ theo DoD trong CLAUDE.md phải chạy STAGING trước (bash deploy.sh
-- --staging, docs/ops/staging.md), kiểm bằng `npm run db:migrate -- --dry-run`, KHÔNG đi thẳng
-- production. Verify trước khi áp (M113 §5) — phải trả 0 dòng:
--   SELECT version, count(*) FROM cad_block_libs GROUP BY 1 HAVING count(*) > 1;

-- Thêm thuần cột nullable: NULL = bộ toàn cục (mọi dòng đang có giữ nguyên nghĩa).
ALTER TABLE cad_block_libs ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE;

-- UNIQUE(version) cũ KHÔNG còn đúng: hai dự án được phép cùng đặt nhãn 'b1'.
-- Đổi thành duy nhất theo (project_id, version), coi NULL là một "dự án" riêng.
ALTER TABLE cad_block_libs DROP CONSTRAINT IF EXISTS cad_block_libs_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cad_block_libs_version
  ON cad_block_libs (COALESCE(project_id, 0), version);

CREATE INDEX IF NOT EXISTS idx_cad_block_libs_du_an ON cad_block_libs (project_id, id DESC);

-- ===== RLS (M113 §5, ADR-0005) — khuôn 2 nhánh của 0140, CỘNG nhánh toàn cục =====
-- Dòng project_id IS NULL là tài nguyên toàn cục: mọi phiên đọc/ghi được như hôm nay (guardrail 1
-- của M113 §2 — plugin bản cũ không gửi ?project= vẫn nhận đúng thư viện toàn cục).
-- Dòng có project_id chỉ đọc/ghi trong withProjectScope(projectId): dự án A không thấy bộ của B.
-- So sánh dạng TEXT, KHÔNG cast GUC ::int (Postgres không bảo đảm short-circuit — bài học 0069/0077).
ALTER TABLE cad_block_libs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cad_block_libs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_cad_block_libs_project ON cad_block_libs;
CREATE POLICY p_cad_block_libs_project ON cad_block_libs
  USING (
    project_id IS NULL
    OR project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id IS NULL
    OR project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );
