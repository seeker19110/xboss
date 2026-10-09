# M130 — Chính sách retention + script dọn evidence/diễn tập DR (dry-run mặc định)

| Thuộc tính       | Giá trị                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Đóng mục 6(d) `AUDIT-S15-RELEASE-CANDIDATE.md` (A6-AC06): có chính sách retention và quyền cleanup rõ ràng |
| Spec owner       | Phiên chính (opusplan)                                                                                     |
| State            | **Approved for implementation**                                                                            |
| Người/ngày duyệt | Người dùng · 2026-10-09 ("Script cleanup dry-run + chính sách 35 ngày")                                    |
| Cập nhật         | 2026-10-09                                                                                                 |

> Spec cha: [A6 Operations](AUDIT-2026-09-25/A6-OPERATIONS.md) (A6-FR02 giữ theo phụ thuộc, A6-AC06 evidence
> không ghi đè), [APPROVAL D08](AUDIT-2026-09-25/APPROVAL.md) (cửa sổ PITR 35 ngày). Không đổi ngưỡng cha.

## 1. Vấn đề (đọc code 2026-10-09)

- `scripts/ops/backup.sh` ĐÃ dọn artifact dump/uploads theo set (local 35 ngày, remote 90 ngày, giữ set
  `COMPLETE` gần nhất). **Không cần làm lại phần này.**
- Chưa có chính sách/công cụ cho hai loại tệp còn lại mà công cụ DR sinh ra:
  1. **Evidence JSON** của `scripts/verify-dr-restore.ts --evidence-out` và `scripts/verify-pitr.ts
--evidence-out` (ghi `wx`, không ghi đè — tích luỹ vô hạn).
  2. **Thư mục diễn tập PITR `run-*`** dưới `/srv/pitr-drill` (giữ lại khi FAIL hoặc `--keep`, chứa
     `postgres.log` + data thật). `docs/ops/backup.md` hiện giao người vận hành `rm -rf` thủ công.
- Chưa ghi "ai được dọn, dọn cái gì, giữ bao lâu", nên A6-AC06 chỉ PARTIAL.

## 2. Chính sách retention (ghi vào `docs/ops/backup.md`, mục mới "Retention evidence & diễn tập")

| Loại                                         | Giữ tối thiểu                                                              | Ai dọn                              | Công cụ                        |
| -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- | ------------------------------ |
| Artifact dump/uploads (set backup)           | local 35 ngày, remote 90 ngày, luôn giữ set COMPLETE gần nhất              | backup.sh (đã có)                   | `scripts/ops/backup.sh`        |
| Base backup + WAL (PITR)                     | theo phụ thuộc ≥35 ngày (A6-FR02) — **script này KHÔNG đụng**              | người vận hành, `pg_archivecleanup` | (đã mô tả trong backup.md)     |
| Evidence JSON PASS                           | 35 ngày                                                                    | người vận hành có quyền ghi thư mục | `scripts/retention-cleanup.ts` |
| Evidence JSON FAIL / NOT_RUN có lỗi          | **365 ngày** (bằng chứng sự cố; post-mortem tham chiếu)                    | như trên                            | như trên                       |
| Thư mục diễn tập `run-*` (PASS, có `--keep`) | 7 ngày                                                                     | như trên                            | như trên                       |
| Thư mục diễn tập `run-*` (FAIL)              | 35 ngày (đọc evidence xong có thể dọn sớm bằng `--apply --force-run <id>`) | như trên                            | như trên                       |

Nguyên tắc: **dry-run mặc định** (chỉ liệt kê), chỉ `--apply` mới xoá; không bao giờ xoá trong thư mục
archive WAL/base backup hay thư mục artifact của backup.sh; không chạy bằng cron tự động trong repo
(người vận hành chạy sau khi đọc dry-run; A6 D09: agent không tạo automation production).

## 3. Script `scripts/retention-cleanup.ts` (+ `npm run retention:cleanup`)

```
npx tsx scripts/retention-cleanup.ts --evidence-dir <dir> [--drill-dir <dir>] [--apply]
    [--evidence-pass-days 35] [--evidence-fail-days 365] [--drill-pass-days 7] [--drill-fail-days 35]
    [--force-run <run-id>]... [--json] [--now <ISO>]
```

- Mặc định in bảng (tiếng Việt): từng tệp/thư mục, loại, tuổi, lý do giữ/xoá, tổng dung lượng sẽ giải
  phóng; exit 0. `--json` in JSON `{ dryRun, items:[{path,kind,ageDays,verdict,reason,bytes}], summary }`.
- Phân loại evidence: đọc JSON, PASS khi `completeDrVerified === true` (verify-dr-restore) hoặc
  `completePitrVerified === true` (verify-pitr); không parse được/thiếu trường → FAIL → giữ dài. Tuổi
  theo `completedAt`, không có thì mtime.
- Thư mục `run-*`: `pitr-drill.ts` không ghi tệp kết quả trong thư mục → PASS suy từ evidence JSON trong
  `--evidence-dir` có `drillRunDir` trùng tên và `completePitrVerified === true`; không có → FAIL. `--force-run <id>` cho phép xoá sớm một run cụ thể (có log lý do).
- An toàn: refuse (exit 2) nếu `--evidence-dir`/`--drill-dir` trùng hoặc nằm trong `BACKUP_DIR`,
  thư mục WAL archive (`/srv/xboss-wal`), hoặc là `/`, `$HOME`; chỉ xoá **tệp `.json`** trong evidence-dir
  và **thư mục khớp `^run-[0-9A-Za-z_-]+$`** trong drill-dir; symlink → bỏ qua và cảnh báo; không đệ quy
  ngoài 2 mẫu này. `--apply` ghi dòng log tổng kết (số tệp/thư mục xoá, bytes) ra stdout.
- Không chạm DB, không import `lib/db`. Đặt helper thuần (phân loại, tính tuổi, quyết định) trong
  `scripts/lib/retention.ts` để test được không cần đĩa thật.

## 4. Test `tests/retention-cleanup.test.ts`

- Logic thuần: bảng quyết định PASS/FAIL × tuổi × ngưỡng; JSON hỏng → giữ; `--force-run` chỉ áp đúng id.
- Đĩa thật (tmpdir của test): dựng evidence PASS 40 ngày, FAIL 40 ngày, PASS 10 ngày, `run-a` FAIL 40
  ngày, `run-b` PASS 5 ngày, 1 tệp lạ `.txt`, 1 symlink → dry-run không xoá gì; `--apply` xoá đúng
  {PASS 40 ngày, `run-a`}; tệp lạ/symlink còn nguyên; chạy lại `--apply` lần 2 không lỗi (idempotent).
- Từ chối thư mục nguy hiểm (exit 2, không xoá).

## 5. Tài liệu

- `docs/ops/backup.md`: thay câu "người vận hành tự `rm -rf /srv/pitr-drill/run-*`" bằng quy trình
  dry-run → đọc → `--apply`; thêm bảng chính sách §2; ghi rõ script không đụng archive/base backup.
- `docs/nang-cap/AUDIT-S15-RELEASE-CANDIDATE.md` mục 6(d) và A6-AC06: phiên chính cập nhật sau khi merge.

## 6. Tiêu chí chấp nhận

- [ ] Dry-run mặc định, không có đường xoá nào chạy khi thiếu `--apply` (test chứng minh).
- [ ] Không bao giờ xoá ngoài 2 mẫu đường dẫn; từ chối thư mục nguy hiểm.
- [ ] Evidence FAIL giữ ≥365 ngày mặc định; PASS 35 ngày; run-* 7/35 ngày.
- [ ] `npm run lint`/`typecheck`/test xanh; không dependency mới; không migration.
