-- 0155_drop_orphaned_engineering_zalo_tables.sql — dọn bảng mồ côi sau đợt xoá module
-- Engineering OS/code chết theo yêu cầu người dùng (PR #514/#515/#516, 2026-09-22, xem
-- PROGRESS.md).
--
-- Đã rà kỹ TOÀN BỘ repo (app/, lib/, scripts/, tests/, e2e/) trước khi liệt kê bảng ở đây —
-- không còn route/lib/component/test nào đọc/ghi các bảng dưới đây:
--
--   zalo_user_bindings, zalo_site_message_logs, zalo_field_action_dispatches (M86, migration
--     0119) — lib `engineering-zalo-copilot.ts` xoá ở PR #514. Đã gỡ kèm: entry retention
--     "zalo_site_message_logs" trong lib/ha-tang/retention.ts, mảng ZALO trong
--     tests/rls.test.ts (3 bảng cùng scope theo project_id, cùng migration 0119).
--   engineering_apex_system_pulses, engineering_apex_command_actions (M74, migration 0121) —
--     lib `engineering-pinnacle-synergy.ts` xoá ở PR #514 (tính điểm "Apex Synergy Pulse" cho
--     trang /engineering — trang này KHÔNG bị xoá nhưng widget đọc 2 bảng này đã gỡ hẳn khỏi
--     UI, không còn try/catch rơi về mặc định như 0153 đã làm với pinnacle synergy trước đó).
--   engineering_pipe_spool_tracking, engineering_material_mass_balance_audits (M95, migration
--     0128) — lib `engineering-pipe-stash-hunter.ts` xoá ở PR #514.
--   engineering_qs_bom_explosions (M69, migration 0103) — lib `engineering-qs-omnipotent.ts`
--     xoá ở PR #514.
--   engineering_shopdrawing_lod400_runs (M69, migration 0103) — lib
--     `engineering-shopdrawing-omnipotent.ts` xoá ở PR #514.
--   engineering_mepf_voice_logs (M68, migration 0102) — lib `engineering-mepf-voice.ts` xoá ở
--     PR #514.
--   engineering_fidic_tia_claims (M79, migration 0127) — lib `lib/tai-chinh/contracts-fidic.ts`
--     xoá ở PR #515; route /api/engineering/fidic-tia đã xoá từ đợt engineering-nextgen-apex
--     trước đó (2026-09-22), lớp lib còn lại mồ côi tới nay mới DROP bảng.
--
-- CỐ Ý KHÔNG DROP ở đợt này: engineering_subcon_profiles (M82, migration 0102/0137) — dù lib
-- `subcon-metrics.ts` đã xoá ở PR #515, bảng này vẫn có bất biến DB (unique index dự án+nhà
-- cung cấp, migration 0137) được `tests/subcon-profile-link.test.ts` và
-- `tests/backfill-0137-0138.test.ts` kiểm thật, và `scripts/dem-du-lieu-engineering.ts` còn liệt
-- kê nó vào danh sách "cặp stack song song chưa quyết gộp-hay-xoá" (cần đếm dữ liệu thật trên
-- production/staging trước khi quyết — xem comment đầu file script đó). DROP bảng này là quyết
-- định riêng, cần chạy script đếm trước.
--
-- Không có bảng NÀO khác trong repo REFERENCES tới các bảng bị DROP ở đây (đã grep xác nhận) —
-- không cần CASCADE để dọn FK con, nhưng vẫn giữ CASCADE cho nhất quán với tiền lệ 0153 (an
-- toàn, không có tác dụng phụ khi không có FK con).
--
-- ⚠️ ĐỤNG DỮ LIỆU (DROP TABLE) — theo DoD (CLAUDE.md) phải chạy qua staging
-- (`bash deploy.sh --staging`, xem docs/ops/staging.md) và `npm run db:migrate -- --dry-run`
-- trước khi lên production. KHÔNG đi thẳng production.

DROP TABLE IF EXISTS zalo_field_action_dispatches CASCADE;
DROP TABLE IF EXISTS zalo_site_message_logs CASCADE;
DROP TABLE IF EXISTS zalo_user_bindings CASCADE;
DROP TABLE IF EXISTS engineering_apex_command_actions CASCADE;
DROP TABLE IF EXISTS engineering_apex_system_pulses CASCADE;
DROP TABLE IF EXISTS engineering_pipe_spool_tracking CASCADE;
DROP TABLE IF EXISTS engineering_material_mass_balance_audits CASCADE;
DROP TABLE IF EXISTS engineering_qs_bom_explosions CASCADE;
DROP TABLE IF EXISTS engineering_shopdrawing_lod400_runs CASCADE;
DROP TABLE IF EXISTS engineering_mepf_voice_logs CASCADE;
DROP TABLE IF EXISTS engineering_fidic_tia_claims CASCADE;
