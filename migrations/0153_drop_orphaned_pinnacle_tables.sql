-- 0153_drop_orphaned_pinnacle_tables.sql — dọn bảng mồ côi sau khi xoá 10 phân hệ Engineering
-- Đỉnh cao theo yêu cầu người dùng (PR #502, 2026-09-21, xem PROGRESS.md): HSE AI Vision (M87),
-- Site Telegram Copilot (M76), Swarm Debates (PIN-3), Spatial Annotation Pinning (M74), FIDIC
-- Claims Dossier (M79), Quantum Spatial/Merkle Compute (M73), Prescriptive Pareto (O3+),
-- Cross-Project Memory Bank (PIN-4), IoT Telemetry (M83, chỉ phần compliance/prescriptive —
-- xem ghi chú riêng bên dưới).
--
-- Đã rà kỹ TOÀN BỘ repo trước khi liệt kê bảng ở đây, tách 3 nhóm:
--
-- 1) DROP thẳng — không còn route/lib nào đọc/ghi (xác nhận bằng grep):
--    engineering_prescriptive_scenarios, engineering_compliance_rules,
--    engineering_compliance_audits, engineering_swarm_debates, engineering_swarm_arguments,
--    engineering_knowledge_patterns, engineering_cross_project_lessons,
--    engineering_spatial_compute_cache, telegram_user_bindings,
--    engineering_fidic_claim_evidences, engineering_iot_threshold_alerts,
--    engineering_hse_action_tickets.
--
-- 2) DROP có ảnh hưởng CHẤP NHẬN ĐƯỢC — vẫn bị `lib/ky-thuat/engineering-pinnacle-synergy.ts`
--    (tính điểm "Apex Synergy Pulse" cho trang `/engineering`, KHÔNG thuộc diện xoá) đọc, nhưng
--    mỗi truy vấn có try/catch riêng nên xoá bảng KHÔNG làm dashboard lỗi — 3 trục điểm
--    Spatial/Legal/Site chỉ rơi về số mặc định cứng thay vì tính từ dữ liệu thật (quyết định
--    người dùng 2026-09-21, chấp nhận đánh đổi vì tính năng nguồn đã bị xoá):
--    engineering_spatial_annotations, engineering_fidic_claims, engineering_hse_vision_scans,
--    engineering_hse_detected_hazards.
--
--    telegram_bot_message_logs cũng thuộc nhóm này — chỉ còn 1 entry đăng ký dọn dữ liệu định
--    kỳ trong lib/ha-tang/retention.ts (RETENTION_TARGETS), không route nào đọc; entry đó đã
--    xoá cùng đợt commit này.
--
-- 2b) CỐ Ý KHÔNG DROP — vẫn bị đọc THẬT, KHÔNG có try/catch, dropped sẽ crash tính năng đang
--    sống (quyết định người dùng 2026-09-21, giữ nguyên):
--    engineering_iot_devices, engineering_iot_telemetry_logs — Smart IPC Gate 3 (thử áp thủy
--    tĩnh, `lib/ky-thuat/engineering-smart-ipc.ts`, trang `/engineering/nextgen-apex`) đọc trực
--    tiếp không bọc try/catch.
--
-- 3) NGOÀI PHẠM VI — không đụng: engineering_merkle_roots, engineering_async_tasks,
--    engineering_twin_*, engineering_apex_system_pulses, engineering_apex_command_actions —
--    đều thuộc tính năng khác còn sống hoặc nợ kỹ thuật cũ không liên quan đợt xoá này.
--
-- DROP có CASCADE để tự dọn FK con trong cùng nhóm (compliance_audits→compliance_rules,
-- swarm_arguments→swarm_debates, fidic_claim_evidences→fidic_claims,
-- hse_detected_hazards/hse_action_tickets→hse_vision_scans) — đã xác nhận bằng grep không có
-- bảng NGOÀI danh sách này tham chiếu tới bất kỳ bảng nào ở đây.
--
-- ⚠️ ĐỤNG DỮ LIỆU (DROP TABLE) — theo DoD (CLAUDE.md) phải chạy qua staging
-- (`bash deploy.sh --staging`, xem docs/ops/staging.md) và `npm run db:migrate -- --dry-run`
-- trước khi lên production. KHÔNG đi thẳng production.

DROP TABLE IF EXISTS engineering_compliance_audits CASCADE;
DROP TABLE IF EXISTS engineering_compliance_rules CASCADE;
DROP TABLE IF EXISTS engineering_prescriptive_scenarios CASCADE;
DROP TABLE IF EXISTS engineering_swarm_arguments CASCADE;
DROP TABLE IF EXISTS engineering_swarm_debates CASCADE;
DROP TABLE IF EXISTS engineering_knowledge_patterns CASCADE;
DROP TABLE IF EXISTS engineering_cross_project_lessons CASCADE;
DROP TABLE IF EXISTS engineering_spatial_compute_cache CASCADE;
DROP TABLE IF EXISTS engineering_spatial_annotations CASCADE;
DROP TABLE IF EXISTS telegram_user_bindings CASCADE;
DROP TABLE IF EXISTS telegram_bot_message_logs CASCADE;
DROP TABLE IF EXISTS engineering_fidic_claim_evidences CASCADE;
DROP TABLE IF EXISTS engineering_fidic_claims CASCADE;
DROP TABLE IF EXISTS engineering_iot_threshold_alerts CASCADE;
DROP TABLE IF EXISTS engineering_hse_action_tickets CASCADE;
DROP TABLE IF EXISTS engineering_hse_detected_hazards CASCADE;
DROP TABLE IF EXISTS engineering_hse_vision_scans CASCADE;
