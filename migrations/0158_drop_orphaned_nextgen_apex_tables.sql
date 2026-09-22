-- 0158_drop_orphaned_nextgen_apex_tables.sql — dọn bảng mồ côi nhóm NextGen Apex (0127) còn
-- sót sau 0153 (audit "6 cặp stack song song" theo ADR-0011, đợt kiểm 2026-09-22).
--
-- lib `engineering-generative-routing.ts`/`engineering-edge-vision-tracking.ts`/
-- `engineering-smart-ipc.ts` đã bị xoá cùng đợt xoá `engineering-nextgen-apex` (audit
-- 2026-09-22). `engineering_smart_ipc_records` từng bị 0153 CỐ Ý giữ lại vì lib đọc không có
-- try/catch — nay lib đã không còn nên an toàn xoá. Đã grep TOÀN BỘ repo (lib/, app/, tests/,
-- scripts/) xác nhận không còn tham chiếu.
--
-- KHÔNG đụng `engineering_fidic_tia_claims` (cũng thuộc 0127) — vẫn được
-- `lib/tai-chinh/contracts-fidic.ts` (M94 TIA Claim Engine) đọc/ghi thật, không thuộc diện
-- mồ côi.
--
-- ⚠️ ĐỤNG DỮ LIỆU (DROP TABLE) — theo DoD (CLAUDE.md) phải chạy qua staging
-- (`bash deploy.sh --staging`, xem docs/ops/staging.md) và `npm run db:migrate -- --dry-run`
-- trước khi lên production. KHÔNG đi thẳng production.

DROP TABLE IF EXISTS engineering_smart_ipc_records CASCADE;
DROP TABLE IF EXISTS engineering_rebar_prepour_audits CASCADE;
DROP TABLE IF EXISTS engineering_edge_vision_detections CASCADE;
DROP TABLE IF EXISTS engineering_generative_routing_runs CASCADE;
