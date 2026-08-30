-- M99 — Lưu bản DXF đã chuẩn hoá qua lớp storage (S3/MinIO lẫn đĩa cục bộ).
--
-- Trước đây route save-drawing ghi thẳng bằng fs vào cây ISO 19650 rồi lưu chính đường dẫn cây đó
-- vào `drawing_revisions.file_name`. Hệ quả: (1) triển khai dùng S3 không có tệp nào trong kho
-- lưu trữ, (2) `storageGet()` chặn tên chứa dấu "/" (chống path traversal) nên đọc lại bản đã lưu
-- là lỗi. Nay `file_name` giữ TÊN PHẲNG do máy chủ sinh (đọc lại được qua lớp storage), còn đường
-- dẫn theo cây ISO 19650 chuyển sang cột `iso_path` — chỉ để hiển thị và đọc dự phòng trên đĩa.
--
-- Thêm cột thuần tuý, không đụng dòng dữ liệu hiện có: bản ghi cũ giữ nguyên đường dẫn cây trong
-- `file_name` và route đọc vẫn xử lý được cả hai dạng.
ALTER TABLE drawing_revisions
  ADD COLUMN IF NOT EXISTS iso_path TEXT;
