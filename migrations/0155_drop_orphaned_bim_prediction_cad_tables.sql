-- 0155_drop_orphaned_bim_prediction_cad_tables.sql — dọn bảng mồ côi còn sót sau 0153
-- (audit "6 cặp stack song song" theo ADR-0011, đợt kiểm 2026-09-22).
--
-- 0153 (2026-09-21) đã dọn nhóm HSE/FIDIC-claim/spatial mồ côi nhưng KHÔNG đụng tới nhóm BIM
-- (0114, 0122) và nhóm Prediction (0096) — đã rà kỹ TOÀN BỘ repo (grep mọi *.ts/*.tsx ngoài
-- migrations/) trước khi liệt kê ở đây, không còn lib/route/trang nào đọc/ghi:
--
-- - engineering_prediction_models, engineering_prediction_model_versions,
--   engineering_prediction_runs, engineering_prediction_outputs (0096) — lib
--   `lib/ky-thuat/engineering-predictions.ts` đã bị xoá (audit 2026-09-22, xem PROGRESS.md).
-- - engineering_bim_models, engineering_bim_elements, engineering_bim_4d_simulations (0114) —
--   trang `/engineering/bim`, `/engineering/bim-viewer` đã bị xoá.
-- - engineering_pipe_nesting_runs, engineering_hydraulic_checks, engineering_bcf_issues,
--   engineering_bim_routing_runs (0122) — cùng nhóm CAD/BIM Professional Upgrade, không còn
--   lib nào tham chiếu (khác `lib/ky-thuat/engineering-hydraulic-engine.ts` /
--   `engineering-mepf-hydraulic.ts` hiện có — hai file đó KHÔNG đụng các bảng này).
-- - engineering_generative_routing_runs, engineering_edge_vision_detections,
--   engineering_rebar_prepour_audits, engineering_smart_ipc_records (0127) — lib
--   `engineering-generative-routing.ts`/`engineering-edge-vision-tracking.ts`/
--   `engineering-smart-ipc.ts` đã bị xoá cùng đợt xoá `engineering-nextgen-apex` (audit
--   2026-09-22). Bảng `engineering_smart_ipc_records` từng bị 0153 CỐ Ý giữ lại vì lib đọc
--   không có try/catch — nay lib đã không còn nên an toàn xoá.
--
-- KHÔNG đụng `engineering_fidic_tia_claims` (0127) — vẫn được `lib/tai-chinh/contracts-fidic.ts`
-- (M94 TIA Claim Engine) đọc/ghi thật, không thuộc diện mồ côi.
--
-- DROP CASCADE để tự dọn FK con trong cùng nhóm (bim_elements/4d_simulations → bim_models,
-- prediction_model_versions/runs → prediction_models, prediction_outputs → prediction_runs).
--
-- ⚠️ ĐỤNG DỮ LIỆU (DROP TABLE) — theo DoD (CLAUDE.md) phải chạy qua staging
-- (`bash deploy.sh --staging`, xem docs/ops/staging.md) và `npm run db:migrate -- --dry-run`
-- trước khi lên production. KHÔNG đi thẳng production.

DROP TABLE IF EXISTS engineering_prediction_outputs CASCADE;
DROP TABLE IF EXISTS engineering_prediction_runs CASCADE;
DROP TABLE IF EXISTS engineering_prediction_model_versions CASCADE;
DROP TABLE IF EXISTS engineering_prediction_models CASCADE;
DROP TABLE IF EXISTS engineering_bim_4d_simulations CASCADE;
DROP TABLE IF EXISTS engineering_bim_elements CASCADE;
DROP TABLE IF EXISTS engineering_bim_models CASCADE;
DROP TABLE IF EXISTS engineering_pipe_nesting_runs CASCADE;
DROP TABLE IF EXISTS engineering_hydraulic_checks CASCADE;
DROP TABLE IF EXISTS engineering_bcf_issues CASCADE;
DROP TABLE IF EXISTS engineering_bim_routing_runs CASCADE;
DROP TABLE IF EXISTS engineering_generative_routing_runs CASCADE;
DROP TABLE IF EXISTS engineering_edge_vision_detections CASCADE;
DROP TABLE IF EXISTS engineering_rebar_prepour_audits CASCADE;
DROP TABLE IF EXISTS engineering_smart_ipc_records CASCADE;
