# S14 — verifier PITR (base backup + WAL) và diễn tập disposable

State: **Approved for implementation**.
Chủ dự án duyệt QUALITY-FINAL-1 (2026-09-25) và yêu cầu thi hành tiếp lộ trình ngày 2026-10-08.
Spec cha: [A6 Operations](AUDIT-2026-09-25/A6-OPERATIONS.md), PLAN §S14, TEST-MATRIX A6/Q-AC08.
Đây là phạm vi con, không thay target RPO 5 phút / RTO 60 phút / lưu 35 ngày của đặc tả cha.

## Phạm vi và contract

Chỉ thêm `scripts/verify-pitr.ts` + `scripts/lib/pitr-*.ts`, mở rộng `recovery-manifest-cli`
(`--wal-archive-dir`, `--base-backups-dir`), test fixture và runbook `docs/ops/backup.md`.
Không import app/env runtime, không auto-migrate, không chạm production, không thêm job CI bắt buộc.

- Kiểm tĩnh chỉ-đọc: đoạn WAL cụt, liên tục theo timeline, cửa sổ ≥ 35 ngày (STOP TIME từ `.backup`),
  archive lag (≤120s PASS, ≤300s PASS kèm cảnh báo, >300s FAIL), `backup_manifest` + `pg_verifybackup`,
  đích sai (tương lai/trước base/sau WAL cuối) FAIL trước khi ghi, recovery set có tham chiếu key.
- Diễn tập `--drill-dir`: preflight marker `XBOSS_DISPOSABLE` + thư mục 0700 đúng chủ, không chồng kho,
  không phải data dir cluster, không chạy root; `postgres` cách ly (không TCP, archive off, không
  primary_conninfo), pause tại đích hoặc standby ở `latest`, không promote; đo RPO theo commit replay.
- Kết quả PASS/FAIL/NOT_RUN; mã thoát 0 (mọi PASS) / 1 (có FAIL hoặc tham số sai) / 2 (chỉ còn NOT_RUN).
  RTO từ công cụ không bao giờ PASS (không khởi động app/smoke) — mốc đầy đủ ghi biên bản diễn tập.

## Tiêu chí chấp nhận

- A6-AC02: base backup hỏng/thiếu tệp, manifest bị sửa, đoạn cụt, thiếu key ref → FAIL.
- A6-AC03: marker sai, chồng lấn kho, data dir cluster, đích sai bị chặn trước khi ghi; không in secret.
- A6-AC05: RPO đo qua WAL replay; RTO đầy đủ NOT_RUN nếu không có biên bản.
- A6-AC06: kho archive/base backup không đổi một byte; giữ evidence khi FAIL.
- Thiếu binary server PostgreSQL → NOT_RUN, không skip test (`--release-gate`).
- Cửa sổ 35 ngày FAIL cho tới khi người vận hành có đủ archive thật.
- A6-AC04 (verifier `scripts/verify-dr-restore.ts`): hạng mục `app-role-rls` — role app trên đích (mặc định
  `xboss_app`, đổi qua `DR_VERIFY_APP_ROLE`) phải NOBYPASSRLS, không superuser, không sở hữu bảng RLS, bảng
  tài chính bật+FORCE RLS; vi phạm hoặc thiếu role → FAIL (không NOT_RUN).
