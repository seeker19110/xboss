-- 0157_drop_orphaned_cad_upgrade_tables.sql — dọn bảng mồ côi nhóm CAD/BIM Professional
-- Upgrade (0122) còn sót sau 0153 (audit "6 cặp stack song song" theo ADR-0011, đợt kiểm
-- 2026-09-22).
--
-- Không còn lib nào tham chiếu (khác `lib/ky-thuat/engineering-hydraulic-engine.ts` /
-- `engineering-mepf-hydraulic.ts` hiện có — hai file đó KHÔNG đụng các bảng này) — đã grep
-- TOÀN BỘ repo (lib/, app/, tests/, scripts/) xác nhận.
--
-- ⚠️ ĐỤNG DỮ LIỆU (DROP TABLE) — theo DoD (CLAUDE.md) phải chạy qua staging
-- (`bash deploy.sh --staging`, xem docs/ops/staging.md) và `npm run db:migrate -- --dry-run`
-- trước khi lên production. KHÔNG đi thẳng production.

DROP TABLE IF EXISTS engineering_bim_routing_runs CASCADE;
DROP TABLE IF EXISTS engineering_bcf_issues CASCADE;
DROP TABLE IF EXISTS engineering_hydraulic_checks CASCADE;
DROP TABLE IF EXISTS engineering_pipe_nesting_runs CASCADE;
