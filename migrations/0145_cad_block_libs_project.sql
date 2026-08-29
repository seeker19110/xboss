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
--
-- KHÔNG gõ tay tên ràng buộc ngầm định (`cad_block_libs_version_key` — đúng với 0139 nhưng nếu
-- một bản triển khai nào đó tạo bảng bằng tên khác thì `DROP CONSTRAINT IF EXISTS` sẽ âm thầm
-- no-op, để ràng buộc unique TOÀN BẢNG sống song song với index mới và phá đúng mục đích của
-- migration này). Tìm theo ĐỊNH NGHĨA: mọi ràng buộc unique có khoá đúng một cột `version`.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.conrelid = 'cad_block_libs'::regclass
       AND c.contype = 'u'
       AND array_length(c.conkey, 1) = 1
       AND a.attname = 'version'
  LOOP
    EXECUTE format('ALTER TABLE cad_block_libs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cad_block_libs_version
  ON cad_block_libs (COALESCE(project_id, 0), version);

CREATE INDEX IF NOT EXISTS idx_cad_block_libs_du_an ON cad_block_libs (project_id, id DESC);

-- ===== RLS (M113 §5, ADR-0005) — khuôn 2 nhánh của 0140, CỘNG nhánh toàn cục =====
-- Dòng project_id IS NULL là tài nguyên toàn cục: MỌI phiên ĐỌC được như hôm nay (guardrail 1
-- của M113 §2 — plugin bản cũ không gửi ?project= vẫn nhận đúng thư viện toàn cục); riêng đường
-- GHI bị siết ở WITH CHECK bên dưới.
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
  -- WITH CHECK KHÔNG đối xứng với USING một cách cố ý: đọc thì ai cũng thấy bộ toàn cục, còn
  -- GHI dòng `project_id IS NULL` chỉ được phép khi phiên thật sự ở phạm vi toàn cục (GUC rỗng =
  -- đường phát hành toàn cục hôm nay, hoặc '*' = ngữ cảnh xuyên dự án). Nếu cho ghi NULL trong
  -- ngữ cảnh một dự án cụ thể thì dự án đó tự "phát hành" được block hiện ra cho MỌI dự án khác
  -- theo đúng nhánh đầu của USING — leo thang phạm vi.
  -- Hệ quả cho người viết route (PR2): phát hành bộ TOÀN CỤC phải chạy ngoài withProjectScope,
  -- phát hành bộ CỦA DỰ ÁN chạy trong withProjectScope(projectId) như mọi đường ghi khác.
  WITH CHECK (
    CASE
      WHEN project_id IS NULL THEN
        NULLIF(current_setting('app.project_id', true), '') IS NULL
        OR current_setting('app.project_id', true) = '*'
      ELSE
        project_id::text = current_setting('app.project_id', true)
        OR current_setting('app.project_id', true) = '*'
    END
  );
