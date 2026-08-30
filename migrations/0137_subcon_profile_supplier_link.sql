-- Migration 0137: nối danh tính hồ sơ thầu phụ M82 về nguồn duy nhất `suppliers`
-- (audit 2026-08-25 §3.3, đề xuất #5).
--
-- VẤN ĐỀ: `engineering_subcon_profiles` (0115) tự giữ `company_name`/`tax_code` với
-- `supplier_id` chỉ là FK TUỲ CHỌN, trong khi `subcontractor_profiles` (0041) lấy chính
-- `supplier_id` làm khoá chính. Cùng một nhà thầu phụ vì thế có thể tồn tại hai bản ghi
-- lệch tên/lệch mã số thuế mà không cơ chế nào bắt được.
--
-- ĐỤNG DỮ LIỆU (UPDATE backfill) → phải chạy staging trước khi lên production
-- (DoD trong CLAUDE.md; kiểm trước bằng `npm run db:migrate -- --dry-run`).

-- 1) Backfill: gắn supplier_id cho hồ sơ đang trống, khớp theo TÊN đã chuẩn hoá
--    (bỏ khoảng trắng thừa, không phân biệt hoa thường). `suppliers` không có cột mã số
--    thuế nên không khớp theo mã được. Chỉ gắn khi khớp DUY NHẤT một nhà cung cấp — trùng
--    tên thì để nguyên NULL cho người xử lý tay, không đoán.
UPDATE engineering_subcon_profiles p
   SET supplier_id = s.id
  FROM (
    SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS ten_chuan,
           min(id) AS id,
           count(*) AS so_ban
      FROM suppliers
     GROUP BY 1
  ) s
 WHERE p.supplier_id IS NULL
   AND s.so_ban = 1
   AND lower(regexp_replace(btrim(p.company_name), '\s+', ' ', 'g')) = s.ten_chuan;

-- 2) Chặn trùng từ nay: mỗi nhà cung cấp chỉ có tối đa 1 hồ sơ thầu phụ trong 1 dự án.
--    Index MỘT PHẦN vì hồ sơ cũ chưa khớp được vẫn còn supplier_id NULL (nhiều NULL thì
--    unique thường vẫn cho qua, nhưng khai rõ điều kiện cho đúng ý đồ).
CREATE UNIQUE INDEX IF NOT EXISTS engineering_subcon_profiles_project_supplier_uniq
  ON engineering_subcon_profiles (project_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

-- KHÔNG đặt supplier_id NOT NULL ở bước này: hồ sơ cũ không khớp được tên sẽ làm migration
-- đổ. Đường ghi mới (lib/hien-truong/subcon-metrics.ts → taoHoSoThauPhu) đã bắt buộc
-- supplier_id, nên tập NULL chỉ có thể co lại. Siết NOT NULL ở migration sau, khi
-- production đã dọn hết dòng NULL.
