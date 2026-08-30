-- 0134: Chống trùng cảnh báo ngưỡng IoT (V3 — audit 2026-08-24).
-- Trước đây mỗi lần POST /api/engineering/iot/telemetry vượt ngưỡng lại chèn thêm một
-- dòng cảnh báo mới → một thiết bị lỗi liên tục sinh hàng loạt cảnh báo HSE trùng nhau.
-- Bám đúng cơ chế dedup của notifications (unique index một phần, xem 0001_baseline.sql).

-- Bước 1 (ĐỤNG DỮ LIỆU): gộp cảnh báo CHƯA xử lý trùng thiết bị — giữ dòng mới nhất.
DELETE FROM engineering_iot_threshold_alerts a
 WHERE a.is_resolved = false
   AND EXISTS (
     SELECT 1 FROM engineering_iot_threshold_alerts b
      WHERE b.is_resolved = false
        AND b.device_id = a.device_id
        AND (b.created_at, b.id) > (a.created_at, a.id)
   );

-- Bước 2: mỗi thiết bị chỉ được có tối đa 1 cảnh báo đang mở.
CREATE UNIQUE INDEX IF NOT EXISTS uq_iot_alert_dang_mo
  ON engineering_iot_threshold_alerts(device_id)
  WHERE is_resolved = false;
