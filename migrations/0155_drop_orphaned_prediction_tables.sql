-- 0155_drop_orphaned_prediction_tables.sql — dọn bảng mồ côi nhóm Prediction (0096) còn sót
-- sau 0153 (audit "6 cặp stack song song" theo ADR-0011, đợt kiểm 2026-09-22).
--
-- lib `lib/ky-thuat/engineering-predictions.ts` đã bị xoá (audit 2026-09-22, xem PROGRESS.md)
-- — đã grep TOÀN BỘ repo (lib/, app/, tests/, scripts/) xác nhận không còn tham chiếu.
--
-- Tách RIÊNG khỏi các nhóm BIM/CAD/NextGen Apex khác (từng gộp chung ở 0155 cũ, tách lại
-- thành nhiều migration nhỏ hơn để giảm thời gian giữ khoá advisory mỗi lần DROP CASCADE).
--
-- ⚠️ ĐỤNG DỮ LIỆU (DROP TABLE) — theo DoD (CLAUDE.md) phải chạy qua staging
-- (`bash deploy.sh --staging`, xem docs/ops/staging.md) và `npm run db:migrate -- --dry-run`
-- trước khi lên production. KHÔNG đi thẳng production.

DROP TABLE IF EXISTS engineering_prediction_outputs CASCADE;
DROP TABLE IF EXISTS engineering_prediction_runs CASCADE;
DROP TABLE IF EXISTS engineering_prediction_model_versions CASCADE;
DROP TABLE IF EXISTS engineering_prediction_models CASCADE;
