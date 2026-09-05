-- 0152_lessons_rls.sql — RLS cho `engineering_cross_project_lessons` (nợ kỹ thuật ghi ở đợt
-- audit 2026-09-05).
--
-- Bối cảnh: 0098 tạo bảng này nhưng KHÔNG bật RLS, trong khi mọi bảng lân cận cùng migration
-- đều có. Audit 2026-09-05 đã vá ở TẦNG ỨNG DỤNG (`listCrossProjectLessons` bắt buộc nhận
-- `projectIds` và lọc `source_project_id IN (...)`). Migration này thêm lưới an toàn thứ hai
-- đúng nguyên tắc ADR-0005: RLS KHÔNG thay check app, chỉ đảm bảo app quên thì trả RỖNG.
--
-- QUAN TRỌNG — vì sao theo ORG chứ không theo PROJECT như các bảng khác: tính năng này vốn
-- là "bài học XUYÊN DỰ ÁN" — người dùng đọc bài học của nhiều dự án họ được thấy, nên policy
-- so `app.project_id` (một dự án) sẽ giết chính tính năng. Ranh giới đúng là tổ chức: xuyên
-- dự án được, xuyên tổ chức thì không. Bảng không có `org_id` nên suy qua `projects.org_id`.
--
-- Ba nhánh giống hệt khuôn 0080_org_rls.sql, gồm cả giai đoạn chuyển tiếp "GUC rỗng → cho
-- qua" (đường đọc hiện tại gọi query thường, không bọc withTransaction nên chưa có GUC).
-- Bỏ nhánh đó là việc riêng, làm sau khi theo dõi production như tiền lệ M62 PR2.
--
-- Dòng có `source_project_id IS NULL` (dự án bị xoá — ON DELETE SET NULL) chỉ hiện khi GUC
-- là '*' hoặc rỗng: tầng ứng dụng cũng đã không trả về chúng (lọc IN danh sách dự án).
ALTER TABLE engineering_cross_project_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_cross_project_lessons FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_cross_project_lessons_org ON engineering_cross_project_lessons;
CREATE POLICY p_eng_cross_project_lessons_org ON engineering_cross_project_lessons
  USING (
    EXISTS (
      SELECT 1 FROM projects p
       WHERE p.id = engineering_cross_project_lessons.source_project_id
         AND p.org_id::text = current_setting('app.org_id', true)
    )
    OR NULLIF(current_setting('app.org_id', true), '') IS NULL
    OR current_setting('app.org_id', true) = '*'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
       WHERE p.id = engineering_cross_project_lessons.source_project_id
         AND p.org_id::text = current_setting('app.org_id', true)
    )
    OR NULLIF(current_setting('app.org_id', true), '') IS NULL
    OR current_setting('app.org_id', true) = '*'
  );

-- Truy vấn luôn lọc theo dự án nguồn (tầng app) và policy trên cũng tra theo cột này.
CREATE INDEX IF NOT EXISTS idx_eng_cross_lessons_source_project
  ON engineering_cross_project_lessons(source_project_id);
