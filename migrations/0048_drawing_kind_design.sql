-- Thêm loại bản vẽ 'design' (Thiết kế — bản vẽ thiết kế từ CĐT/TVTK, đứng trước
-- shop drawing trong luồng triển khai) vào drawings.kind — phục vụ mục "Thiết kế"
-- trong cụm sidebar "Thiết kế & BPTC" (deep-link /drawings?kind=design).
ALTER TABLE drawings DROP CONSTRAINT IF EXISTS drawings_kind_check;
ALTER TABLE drawings ADD CONSTRAINT drawings_kind_check
  CHECK (kind IN ('design', 'shop', 'asbuilt', 'bim', 'method'));
