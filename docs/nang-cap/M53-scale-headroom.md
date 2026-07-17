# M53 — Scale headroom: đo tải, watermark SSE O(1), pool cứng cáp, cluster-ready (P1)

> **Mục tiêu**: nâng trần chịu tải của kiến trúc hiện tại (1 process pm2 + pool 10 + Postgres tự host) **trước khi** bước sang lộ trình SaaS (M54) — vì mọi quyết định scale tiếp theo (PgBouncer, cluster, replica) cần số đo thật, và điểm nghẽn số 1 đã xác định được bằng đọc code: SSE polling chạy aggregate JOIN mỗi 3s cho từng client.
>
> **Bối cảnh đo đạc từ code** (2026-07-17): `app/api/events/route.ts` mỗi client giữ 1 SSE stream, mỗi 3s gọi `sheetVersion()` (`lib/version.ts`) = `MAX(updated_at)+COUNT` JOIN 3 bảng `tasks⋈work_packages⋈sheet_types`. N client xem tracking = N/3 query aggregate/giây tranh pool `max: 10` cứng (`lib/db/index.ts:27`, không timeout nào). 50 người đồng thời ≈ 17 query/s chỉ để hỏi "có gì mới".
>
> **Không làm** (chủ đích, có điều kiện kích hoạt ghi ở cuối): object storage cho uploads, read-replica, LISTEN/NOTIFY, gộp poll trong process — chờ số đo từ PR1 chứng minh cần.

## PR1 — Quan trắc tải (`route: standard`)

Làm ĐẦU TIÊN — không có số đo thì các PR sau và cả M54 đều là đoán.

### Điểm chạm

- `lib/db/index.ts`: export `poolStats()` trả `{ total, idle, waiting }` từ pg Pool (`pool.totalCount/idleCount/waitingCount` — API có sẵn của pg).
- `lib/db/index.ts`: log cảnh báo query chậm — trong `query/run/insertId`, đo `Date.now()` quanh `pool.query`; vượt ngưỡng `XBOSS_SLOW_QUERY_MS` (env, mặc định 500, `0` = tắt) thì `logWarn` (tái dùng `lib/log.ts`) kèm 120 ký tự đầu SQL + duration. KHÔNG log params (tránh lộ dữ liệu nhạy cảm vào log).
- `app/api/events/route.ts`: đếm stream đang mở qua module-level counter (`let openStreams = 0`, tăng ở `start`, giảm ở `close`) — export getter cho health.
- `app/api/health/route.ts`: mở rộng JSON trả thêm `{ pool: poolStats(), sseStreams, uptimeSec }`. Giữ nguyên hành vi auth hiện có của route health (đọc code trước — nếu health đang public thì phần metrics chỉ trả khi session Admin/PM, phần ping DB giữ public).

### Tiêu chí chấp nhận

- `GET /api/health` (Admin) trả pool stats + số SSE stream đúng (verify thật: mở 3 tab tracking → `sseStreams: 3`, đóng còn 0 sau ≤35s).
- Query chậm giả lập (`SELECT pg_sleep(1)`) sinh đúng 1 dòng warn, không chứa params.
- Không đổi hành vi nào khác; lint/typecheck/build/test xanh.

## PR2 — Watermark SSE O(1): bảng `sheet_versions` + trigger (`route: complex` — chạm đường nóng tracking, vùng rủi ro cao)

### Migration `0064_sheet_versions.sql` (đổi số nếu bị chiếm; thuần thêm → đi thẳng production)

```sql
-- Watermark 1 dòng/sheet thay cho aggregate JOIN mỗi tick SSE (lib/version.ts).
CREATE TABLE IF NOT EXISTS sheet_versions (
  sheet_type_id INT PRIMARY KEY REFERENCES sheet_types(id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger trên tasks: INSERT/UPDATE/DELETE → bump version của sheet chứa task.
-- Pattern trigger có tiền lệ: boq_codes_sync (0029), audit_row_change (0049).
CREATE OR REPLACE FUNCTION bump_sheet_version() RETURNS trigger AS $$ ... $$;
-- Thân hàm: xác định sheet_type_id qua work_packages của NEW/OLD.package_id
-- (UPDATE đổi package_id → bump CẢ sheet cũ lẫn mới);
-- INSERT ... ON CONFLICT (sheet_type_id) DO UPDATE SET version = sheet_versions.version + 1, updated_at = NOW().
CREATE TRIGGER trg_tasks_sheet_version AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION bump_sheet_version();
-- Backfill: INSERT 1 dòng version=1 cho mọi sheet_types hiện có (ON CONFLICT DO NOTHING).
```

Lưu ý thi hành: `work_packages` đổi `sheet_type_id` (move nhóm giữa sheet, route `workpackages/:id/move`) cũng phải bump — thêm trigger tương tự trên `work_packages` (UPDATE cột `sheet_type_id`) bump cả sheet cũ và mới.

### Điểm chạm code

- `lib/version.ts::sheetVersion(slug)`: đổi thân hàm thành lookup `SELECT version::text FROM sheet_versions sv JOIN sheet_types st ON sv.sheet_type_id = st.id WHERE st.slug = ?`. Fallback: sheet chưa có dòng (tạo sau backfill bởi đường nào đó không qua trigger — không nên xảy ra nhưng phòng thủ) → trả `'0'`. Giữ nguyên chữ ký hàm — mọi caller (`/api/events`, `/api/tasks/version`) không đổi.
- KHÔNG đổi format watermark phía client (client chỉ so sánh chuỗi khác nhau, không parse).

### Test + tiêu chí chấp nhận

- `tests/sheet-versions.test.ts` (integration, import `tests/setup.ts` đầu tiên): (1) tick dimension qua đường `recomputeTask` → version bump; (2) tạo/xoá task → bump; (3) move task sang package thuộc sheet khác → CẢ 2 sheet bump; (4) move work_package sang sheet khác → cả 2 sheet bump; (5) sửa task không đổi gì liên quan (vd note) vẫn bump là chấp nhận được (false-positive rẻ, chỉ khiến client refresh thừa 1 lần — ghi rõ trong comment).
- Đo trước/sau bằng `EXPLAIN ANALYZE` trên DB seed thật ghi vào PR description (aggregate JOIN → index scan PK).
- Verify thật: 2 trình duyệt mở cùng sheet, tick ở A → B nhận event `version` trong ≤3s (hành vi y hệt trước).

## PR3 — Pool cứng cáp qua env (`route: standard`)

### Điểm chạm `lib/db/index.ts`

- `max` đọc từ `XBOSS_PG_POOL_MAX` (mặc định 10, validate 1–100 qua `lib/env.ts` theo pattern env hiện có).
- Thêm vào config Pool: `options: "-c statement_timeout=<XBOSS_PG_STMT_TIMEOUT_MS mặc định 30000>"` và `idle_in_transaction_session_timeout=15000` — hiện KHÔNG có timeout nào, 1 query treo giữ connection vĩnh viễn. Ngoại lệ: `lib/db/migrate.ts` chạy migration bằng client riêng phải đặt `statement_timeout=0` (migration backfill dài hợp lệ).
- `connectionTimeoutMillis: 10_000` — hết pool thì request lỗi rõ sau 10s thay vì treo vô hạn.

### Tiêu chí chấp nhận

- Không đặt env → hành vi mặc định như cũ (10 connection) + timeout mới.
- Test integration: query `pg_sleep` vượt statement_timeout → lỗi Postgres 57014, connection được trả về pool (poolStats().waiting về 0).
- `DEPLOY.md` thêm mục 3 biến env mới.

## PR4 — Cluster-ready: audit state in-process + tài liệu vận hành (`route: standard`)

- Quét toàn `lib/` + `app/api/` tìm state module-level ghi-được (Map/let/global) ngoài các chỗ đã biết an toàn (`lib/permissions.ts` SWR — thiết kế sẵn cho đa instance; pool/schema-ready per-process — đúng). Mỗi phát hiện: phân loại an-toàn/không, sửa nếu nhỏ, ghi nợ nếu lớn. Counter SSE của PR1 ghi rõ là per-process (health mỗi instance trả số của nó — chấp nhận).
- Rà 6 endpoint `app/api/cron/*`: xác nhận idempotent + chống chạy chồng (đã có `sync_locks` cho sync; daily/weekly-report cần xác nhận gửi trùng có hại không — nếu có, thêm khoá `sync_locks` cùng pattern).
- `DEPLOY.md` mục mới "Chạy nhiều instance": `pm2 start npm -i 2 --name xboss -- start`, điều kiện tiên quyết (hạ `XBOSS_PG_POOL_MAX` mỗi process hoặc dựng PgBouncer transaction-pooling kèm lưu ý `set_config` SET LOCAL chỉ an toàn trong transaction — `withTransaction` hiện dùng SET LOCAL nên tương thích PgBouncer transaction mode), cron chỉ gọi từ ngoài 1 lần nên không nhân đôi.
- Tiêu chí: báo cáo quét kèm PR; chạy `pm2 -i 2` cục bộ + `npm test` E2E smoke (login, tick, SSE) xanh.

## Điều kiện kích hoạt các việc ĐANG HOÃN (ghi vào PROGRESS.md nợ kiến trúc)

- **Object storage (S3/MinIO) cho `data/uploads/`**: kích hoạt khi cần máy thứ 2 hoặc khi M54 giai đoạn 2 (SaaS nhiều org) bắt đầu — với SaaS là BẮT BUỘC, không còn là tuỳ chọn.
- **SSE bậc 2 (gộp poll trong process) / bậc 3 (LISTEN/NOTIFY)**: kích hoạt khi health PR1 cho thấy pool waiting > 0 thường xuyên dù đã có PR2.
- **PgBouncer**: kích hoạt cùng lúc chạy ≥2 process.
- **Read-replica**: chưa có bằng chứng cần; matviews (0055) đã tách đọc nặng.

## Chia PR

1. **PR1** metrics/health/slow-log — `route: standard`, không phụ thuộc.
2. **PR2** sheet_versions + trigger — `route: complex` (chạm `lib/recompute.ts` gián tiếp qua đường ghi tasks; reviewer bắt buộc rà theo `docs/audit.md` mục vùng rủi ro cao).
3. **PR3** pool env + timeout — `route: standard`, độc lập PR2.
4. **PR4** audit cluster + DEPLOY.md — `route: standard`, sau PR1–PR3.
