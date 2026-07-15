# M48 — Tích hợp tài chính: khung integrations, kế toán, hoá đơn điện tử (P1)

> **Mục tiêu**: đóng khoảng cách "ERP tài chính" bằng tích hợp thay vì tự dựng sổ kép (quyết định trong `docs/nghien-cuu-nang-cap-erp-2026-07.md` §6): khung tích hợp thống nhất, đẩy chứng từ sang phần mềm kế toán, phát hành hoá đơn điện tử đúng Nghị định 70/2025/NĐ-CP (hiệu lực 01/6/2025).
>
> **Điều kiện tiên quyết**: chốt nhà cung cấp thật trước khi code PR2/PR3 (kế toán: MISA AMIS / BRAVO; HĐĐT: meInvoice / Viettel SInvoice / VNPT) — spec viết theo mẫu adapter, phần gọi API cụ thể điền khi có tài khoản + tài liệu API của NCC. PR1 code được ngay.

## PR1 — Khung `lib/integrations/` + trạng thái đồng bộ

Chuẩn hoá pattern đã chạy tốt ở `lib/material-sync.ts` (khoá `sync_locks`, 3-way, log) thành khung chung:

### Migration `0053_integrations.sql`

```sql
CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,            -- 'misa' | 'bravo' | 'einvoice_misa' | ...
  project_id INT REFERENCES projects(id),
  config JSONB NOT NULL DEFAULT '{}',  -- KHÔNG chứa secret — secret ở env (quy ước sẵn có)
  active BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(provider, project_id)
);
CREATE TABLE IF NOT EXISTS integration_runs (
  id SERIAL PRIMARY KEY,
  integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',   -- running | ok | error
  stats JSONB, error TEXT
);
CREATE TABLE IF NOT EXISTS sync_cursors (
  integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,              -- 'invoice' | 'payment_cert' | ...
  last_local_id BIGINT, last_remote_key TEXT, last_at TIMESTAMPTZ,
  PRIMARY KEY(integration_id, entity)
);
CREATE TABLE IF NOT EXISTS remote_links (
  entity_type TEXT NOT NULL, entity_id BIGINT NOT NULL,
  integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  remote_key TEXT NOT NULL, remote_status TEXT, synced_at TIMESTAMPTZ,
  PRIMARY KEY(entity_type, entity_id, integration_id)
);
```

### `lib/integrations/core.ts`

```ts
export type Adapter = {
  provider: string;
  pushEntities: string[];            // entity đẩy đi
  push(entity: string, rows: Row[], cfg: Config): Promise<PushResult>;   // trả remote_key từng dòng
  pullStatus?(entity: string, links: Link[], cfg: Config): Promise<StatusUpdate[]>;
};
export async function runSync(provider: string, projectId: number): Promise<RunSummary>;
// - Khoá sync_locks (tái dùng bảng M18) chống chạy chồng; ghi integration_runs.
// - Đẩy bản ghi mới hơn cursor → lưu remote_links; kéo trạng thái về remote_status.
// - Lỗi từng dòng không chặn cả batch — gom vào stats.errors, retry lần chạy sau (idempotent theo remote_key).
```

- Điểm vào: `POST /api/integrations/:provider/sync` (Admin/PM) + `GET /api/cron/sync-integrations` (CRON_SECRET Bearer — quét mọi integration active).
- UI `/admin/integrations`: danh sách provider, bật/tắt, lần chạy gần nhất + stats/lỗi (đọc `integration_runs`), nút "Đồng bộ ngay".
- **Di trú Google Sheet sync vào khung này: KHÔNG làm** — đang chạy ổn, để nguyên (YAGNI); chỉ thêm dòng hiển thị read-only trạng thái của nó trên trang admin cho đủ bức tranh.

## PR2 — Adapter kế toán (đẩy chứng từ, kéo trạng thái thanh toán)

- Phạm vi đẩy: `payment_certs` đã duyệt (IPC → chứng từ phải thu/phải trả theo chiều hợp đồng), `invoices` (hoá đơn đầu vào NCC), `advances` (tạm ứng). Map trường theo tài liệu API NCC — bảng map để trong `lib/integrations/<provider>.ts` dạng hằng có chú thích.
- Kéo về: trạng thái thanh toán (đã chi/đã thu, ngày, số tiền) → cập nhật `remote_links.remote_status` + hiển thị badge "Đã thanh toán (kế toán)" trên trang finance/payment-certs — **không ghi đè** dữ liệu XBoss (kế toán là source of truth phần tiền đã chi; XBoss là source phần khối lượng/giá trị nghiệm thu).
- Điều kiện chặn đẩy: chỉ đẩy chứng từ ở trạng thái duyệt cuối (sau M46: `approval_requests.status = 'approved'`); đẩy lại (re-run) không tạo trùng nhờ `remote_links`.
- Secret: `MISA_API_KEY`/`BRAVO_API_URL`… qua env, thiếu → adapter throw fail-fast khi sync (pattern `lib/google-sheets.ts`), build không ảnh hưởng.

## PR3 — Hoá đơn điện tử (NĐ 70/2025)

- Phạm vi: **phát hành hoá đơn đầu ra** cho IPC/thanh toán được CĐT chấp nhận (nếu đơn vị là nhà thầu xuất hoá đơn) — tạo hoá đơn nháp trên hệ thống NCC HĐĐT từ dữ liệu IPC, người dùng ký phát hành trên cổng NCC (XBoss không giữ chữ ký số).
- Bảng: tái dùng `remote_links` (entity_type `payment_cert`, remote_status = trạng thái hoá đơn: draft/issued/replaced/adjusted) + cột mới `invoices.einvoice_no`, `invoices.einvoice_link` cho tra cứu.
- Tuân thủ NĐ 70/2025 các điểm chạm XBoss: (1) không có thao tác "huỷ hoá đơn đã lập sai" — chỉ điều chỉnh/thay thế, UI phản ánh trạng thái từ NCC; (2) thời điểm lập theo chuyển giao — nhắc trên UI khi IPC duyệt xong quá N ngày chưa phát hành (notification).
- UI: khu "Hoá đơn điện tử" trong trang chi tiết IPC/invoice — trạng thái + link cổng NCC + nút "Tạo nháp trên <NCC>".

## Test

- `tests/integrations-core.test.ts` (integration): runSync với adapter giả (in-memory) — cursor tiến đúng, re-run không trùng, lỗi từng dòng không chặn batch, khoá chống chạy chồng.
- Adapter thật: test bằng mock HTTP (node:test + fetch mock) theo response mẫu từ tài liệu NCC; verify tay trên sandbox NCC khi triển khai (ghi kết quả vào PR).

## Chia PR

1. **PR1**: khung core + migration + trang admin + cron.
2. **PR2**: adapter kế toán (provider chốt sau) + badge trạng thái thanh toán.
3. **PR3**: adapter HĐĐT + cột invoices + UI + notification nhắc phát hành.
