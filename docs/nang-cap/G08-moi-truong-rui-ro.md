# G08 — Môi trường & Rủi ro (quan trắc, cộng đồng)

> Gộp từ M25 (môi trường & giấy phép) + M26 (quan hệ & quan trắc kết cấu). Cả 2 đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.

## M25 — Môi trường & Giấy phép

Hồ sơ môi trường (ĐTM, giấy phép MT/xả thải — **bảng riêng `env_permits`, không dùng `legal_documents`** của M23 vì có kỳ quan trắc gắn kèm) + quan trắc môi trường theo kỳ (nước thải/khí bụi/ồn rung, có ngưỡng) + quản lý chất thải. `env_permits` + `env_monitoring` (`passed = value <= threshold` **tính lúc ghi**, snapshot — ngưỡng có thể đổi theo quy định sau) + `waste_logs`. `lib/environment.ts::expiringEnvPermits`/`exceededMonitoring` → notification `env_permit_expiry`/`env_monitoring_over`. UI (`/environment`): hub 4 tab, biểu đồ đường theo thời gian + đường ngưỡng. ESG/carbon để sau (ngoài phạm vi).

## M26 — Quan hệ & Quan trắc (lún/chuyển vị, cộng đồng)

Khác M25: đây là quan trắc **kết cấu công trình** (lún/nghiêng/chuyển vị), không phải chỉ tiêu môi trường — **tách bảng riêng** để không lẫn ngữ nghĩa ngưỡng. `monitoring_points` (`UNIQUE(project_id, code)`, **2 ngưỡng** `warn_threshold`/`alarm_threshold`) + `monitoring_readings` (`UNIQUE(point_id, measured_at)`, `cumulative` **nhập tay** không tự cộng dồn — tránh sai lệch khi bỏ kỳ đo, `level` tính lúc ghi qua `computeLevel`) + `community_cases` (khiếu nại, vòng đời open→handling→closed). Notification `monitoring_alarm` chỉ bắn ở mức `alarm` (không phải `warn`), tự dọn khi reading mới về normal. UI (`/monitoring`): hub 2 tab (Quan trắc — biểu đồ đường + đường warn/alarm; Cộng đồng).

## Test

`tests/environment.test.ts`, `tests/monitoring.test.ts` (thuần: `computeLevel`/`validateMonitoringInput`; tích hợp: cảnh báo xuất hiện/tự dọn đúng ngưỡng, `TEST_DATABASE_URL`); `e2e/authed/environment.spec.ts`, `monitoring.spec.ts` (desktop+mobile+axe, kiểm cả biểu đồ).
