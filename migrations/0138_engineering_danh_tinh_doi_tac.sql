-- Migration 0138: gắn danh tính đối tác trong lớp engineering về `suppliers`
-- (audit 2026-08-25 §3.3, đề xuất #6 — xem ADR-0011).
--
-- VẤN ĐỀ: ba bảng lớp engineering giữ tên đối tác bằng CHỮ TỰ DO, không tham chiếu bảng
-- gốc nào: `engineering_bidding_vendor_quotes.vendor_name`,
-- `engineering_material_shipments.supplier_name`,
-- `engineering_smart_ipc_records.contractor_name`. Cùng một nhà cung cấp vì thế xuất hiện
-- dưới nhiều cách viết khác nhau, không nối được sang hồ sơ/hợp đồng/đánh giá đã có.
--
-- CÁCH LÀM: thêm cột FK `supplier_id` (cho phép NULL — dữ liệu cũ có thể không khớp tên),
-- backfill theo tên đã chuẩn hoá khi khớp DUY NHẤT. Giữ nguyên cột tên cũ làm nhãn hiển
-- thị lịch sử, KHÔNG xoá cột (xoá cột là đụng dữ liệu, để migration sau khi đã dọn xong).
--
-- ĐỤNG DỮ LIỆU (UPDATE backfill) → chạy staging trước production (DoD trong CLAUDE.md).

ALTER TABLE engineering_bidding_vendor_quotes
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE engineering_material_shipments
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE engineering_smart_ipc_records
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS engineering_bidding_vendor_quotes_supplier_idx
  ON engineering_bidding_vendor_quotes (supplier_id);
CREATE INDEX IF NOT EXISTS engineering_material_shipments_supplier_idx
  ON engineering_material_shipments (supplier_id);
CREATE INDEX IF NOT EXISTS engineering_smart_ipc_records_supplier_idx
  ON engineering_smart_ipc_records (supplier_id);

-- Backfill: chỉ gắn khi tên chuẩn hoá khớp ĐÚNG MỘT nhà cung cấp. Trùng tên hoặc không
-- khớp thì để NULL cho người xử lý tay — không đoán.
UPDATE engineering_bidding_vendor_quotes t
   SET supplier_id = s.id
  FROM (
    SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS ten_chuan,
           min(id) AS id, count(*) AS so_ban
      FROM suppliers GROUP BY 1
  ) s
 WHERE t.supplier_id IS NULL AND s.so_ban = 1
   AND lower(regexp_replace(btrim(t.vendor_name), '\s+', ' ', 'g')) = s.ten_chuan;

UPDATE engineering_material_shipments t
   SET supplier_id = s.id
  FROM (
    SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS ten_chuan,
           min(id) AS id, count(*) AS so_ban
      FROM suppliers GROUP BY 1
  ) s
 WHERE t.supplier_id IS NULL AND s.so_ban = 1
   AND lower(regexp_replace(btrim(t.supplier_name), '\s+', ' ', 'g')) = s.ten_chuan;

UPDATE engineering_smart_ipc_records t
   SET supplier_id = s.id
  FROM (
    SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS ten_chuan,
           min(id) AS id, count(*) AS so_ban
      FROM suppliers GROUP BY 1
  ) s
 WHERE t.supplier_id IS NULL AND s.so_ban = 1
   AND lower(regexp_replace(btrim(t.contractor_name), '\s+', ' ', 'g')) = s.ten_chuan;
