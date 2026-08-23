-- revision_name: nhãn tên gợi nhớ cho bản sửa đổi nguồn (vd "Rev C - IFC 2026-08"),
-- dùng để hiển thị trong đồ thị kỹ thuật (lib/engineering-graph.ts, lib/engineering-twin.ts)
-- thay vì chỉ revision_no. Thêm cột thuần tuý, không đụng dữ liệu hiện có.
ALTER TABLE engineering_source_revisions ADD COLUMN IF NOT EXISTS revision_name TEXT;
