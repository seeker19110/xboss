-- 0156_drop_orphaned_bim_viewer_tables.sql — dọn bảng mồ côi nhóm BIM Viewer/4D (0114) còn sót
-- sau 0153 (audit "6 cặp stack song song" theo ADR-0011, đợt kiểm 2026-09-22).
--
-- Trang `/engineering/bim`, `/engineering/bim-viewer` đã bị xoá — đã grep TOÀN BỘ repo
-- (lib/, app/, tests/, scripts/) xác nhận không còn tham chiếu.
--
-- ⚠️ ĐỤNG DỮ LIỆU (DROP TABLE) — theo DoD (CLAUDE.md) phải chạy qua staging
-- (`bash deploy.sh --staging`, xem docs/ops/staging.md) và `npm run db:migrate -- --dry-run`
-- trước khi lên production. KHÔNG đi thẳng production.

DROP TABLE IF EXISTS engineering_bim_4d_simulations CASCADE;
DROP TABLE IF EXISTS engineering_bim_elements CASCADE;
DROP TABLE IF EXISTS engineering_bim_models CASCADE;
