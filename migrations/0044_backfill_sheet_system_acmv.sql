-- 0044_backfill_sheet_system_acmv.sql — sửa lỗi sheet OGTĐ/OGHL/OGCH/ODNN tạo qua import
-- Excel (lib/import.ts::importWorkbook, dùng bởi npm run db:seed và /api/import/excel)
-- không gán system_id nên rơi ra ngoài hệ ACMV — /progress/acmv (trang "Kế hoạch & Tiến
-- độ") không thấy dữ liệu dù task/nhóm vẫn tồn tại bình thường. Migration 0005_boq.sql chỉ
-- backfill 1 lần lúc chạy migration, không phủ được sheet tạo sau đó qua import. An toàn
-- chạy lại: chỉ đụng sheet chưa có system_id.
UPDATE sheet_types SET system_id = (SELECT id FROM systems WHERE code = 'acmv')
 WHERE system_id IS NULL;
