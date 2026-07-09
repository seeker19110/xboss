# M34 — Claim chi phí & Gia hạn thời gian (EOT)

**Cụm I · Phụ thuộc: M06 (VO), M14 (mặt bằng — bằng chứng EOT), M16 (hợp đồng) · Phức tạp: Trung bình (2 PR)**

## Mục tiêu

Lấp khoảng trống mục I4 (`docs/ke-hoach-ia-chi-tiet-2026-07.md`): **claim chi phí** (notice→định lượng→đàm phán→chốt) và **gia hạn thời gian EOT** (thông báo→phân tích ảnh hưởng→hồ sơ→duyệt) như 2 loại của cùng 1 quy trình claim — tách khỏi VO (M6, dùng khi CHỦ ĐỘNG đề xuất thay đổi KL/giá) vì claim là **phản ứng** với sự kiện gây chậm/phát sinh chi phí ngoài kiểm soát (chờ mặt bằng, thay đổi thiết kế của CĐT, điều kiện công trường...).

## Hiện trạng & điểm chạm — tái dùng, không lặp

- `variation_orders` (M6): đã có cột `reason` gồm `design_change`/`client_request`/`site_condition`/`other` — claim có thể **nối tới 1 VO đã có** (khi claim dẫn tới điều chỉnh HĐ chính thức) nhưng KHÔNG bắt buộc — nhiều claim (đặc biệt EOT) không cần VO.
- "EOT" hiện tại (M14) chỉ là **bằng chứng** (badge lưới + số ngày chờ mặt bằng luỹ kế trong `lib/workfronts.ts`/`lib/dashboardext.ts`) — KHÔNG có bảng/vòng đời claim chính thức. M34 dùng lại số liệu này làm gợi ý điền form (không tính lại công thức).
- `contracts` (M16): claim gắn `contract_id` (claim theo HĐ nào, nullable — có claim tổng dự án không theo 1 HĐ cụ thể).
- `design_changes` (M32, nếu đã làm) — claim chi phí có thể phát sinh TỪ 1 design change; cột `design_change_id` nullable, không bắt buộc phụ thuộc cứng vào M32 (M34 làm độc lập được, cột này chỉ dùng nếu M32 đã tồn tại — kiểm bằng `to_regclass` hoặc thử tồn tại bảng trước khi thêm FK, nếu M32 chưa làm thì bỏ cột này, thêm sau bằng migration riêng khi cần).

## Schema (`migrations/0041_claims.sql`)

```sql
CREATE TABLE IF NOT EXISTS claims (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  code TEXT,                                                 -- CLM-0001 (nextSeqCode pad 4)
  kind TEXT NOT NULL CHECK (kind IN ('cost', 'eot')),
  title TEXT NOT NULL,
  contract_id INTEGER REFERENCES contracts(id),
  vo_id INTEGER REFERENCES variation_orders(id),             -- nối VO nếu claim dẫn tới điều chỉnh HĐ chính thức (nullable)
  notice_date DATE NOT NULL,                                  -- ngày thông báo (mốc pháp lý — nhiều HĐ có hạn thông báo)
  cause TEXT NOT NULL,                                        -- nguyên nhân (mô tả)
  amount_requested NUMERIC(15,2),                             -- claim kind='cost'
  days_requested INTEGER,                                     -- claim kind='eot'
  amount_settled NUMERIC(15,2),
  days_settled INTEGER,
  status TEXT NOT NULL DEFAULT 'notice'
    CHECK (status IN ('notice', 'quantified', 'negotiating', 'settled', 'rejected')),
  settlement_note TEXT,
  settled_by INTEGER REFERENCES users(id),
  settled_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claims_contract ON claims(contract_id);
CREATE TABLE IF NOT EXISTS claim_documents (                 -- hồ sơ định lượng (pattern task_documents)
  id SERIAL PRIMARY KEY,
  claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  title TEXT,
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS claim_id INTEGER REFERENCES claims(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_claim ON notifications(user_id, type, claim_id)
  WHERE claim_id IS NOT NULL;
```

## `lib/claims.ts`

- `listClaims(projectId?, filters?: {kind, status, contractId})` / `getClaim(id)` (kèm `claim_documents`).
- `validateClaimInput` (thuần — `kind='cost'` bắt buộc `amount_requested`, `kind='eot'` bắt buộc `days_requested`).
- `nextClaimCode()` — `nextSeqCode(table, column, 'CLM-', 4)`.
- `pendingClaims(days, projectId?)` — `status IN ('notice','quantified','negotiating')` quá N ngày kể từ `notice_date` chưa `settled`/`rejected` (mirror `pendingVariations`).
- `eotEvidenceSuggestion(projectId?)` — gọi lại `lib/workfronts.ts` (số ngày chờ mặt bằng luỹ kế theo tầng) để gợi ý điền `days_requested` khi tạo claim `kind='eot'` (không bắt buộc dùng, chỉ gợi ý — người dùng tự nhập số cuối).

## API

| Route                                                                        | Quyền                                                                                                                                                                                                    | Ghi chú                                                                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET/POST /api/claims` + `GET/PATCH/DELETE /api/claims/:id`                  | ghi: admin/pm/engineer (ghi nhận notice tại hiện trường); xem: admin/pm/engineer/bch (nhạy cảm thương mại — loại cdt/subcon/viewer, đồng mức VO/thanh toán KL/đấu thầu theo quyết định chung 2026-07-04) | tạo sinh `code`, gán `project_id` từ server                                                               |
| `POST /api/claims/:id/settle`                                                | `CAN.approve`                                                                                                                                                                                            | ghi `amount_settled`/`days_settled`/`settlement_note`, chuyển `status='settled'`, trong `withTransaction` |
| `POST /api/claims/:id/reject`                                                | `CAN.approve`                                                                                                                                                                                            | bắt buộc `settlement_note` làm lý do                                                                      |
| `GET/POST /api/claims/:id/documents` + `GET/DELETE /api/claim-documents/:id` | ghi: admin/pm/engineer; xem: cùng nhóm trên                                                                                                                                                              | pattern `task_documents`                                                                                  |

Notification `claim_pending`: quá hạn xử lý (mirror `vo_pending`/`punch_overdue` — dedup/tự dọn, truyền `projectId` ngay từ đầu).

## UI/UX (`app/claims/page.tsx`)

Trang riêng (không gộp `/variations` — đủ khác biệt về vòng đời/mục đích để tách, tránh 1 trang quá tải nhiều loại workflow): 2 thẻ KPI (số claim cost đang mở + tổng giá trị đề xuất, số claim EOT đang mở + tổng ngày đề xuất), toggle lọc theo `kind`, bảng (mã/loại/tiêu đề/HĐ/ngày notice/trạng thái màu/giá trị hoặc số ngày), modal chi tiết: form tạo (chọn kind → hiện đúng field tương ứng, nếu `kind='eot'` hiện gợi ý từ `eotEvidenceSuggestion`) + tab Hồ sơ (upload) + nút Chốt/Từ chối (Admin/PM). Mục sidebar mới **"Claim & Thay đổi"** trong nhóm "Tiền" (cạnh "Phát sinh" — `dash.claim` đã có sẵn dạng coming-soon trong `dashboardTree.ts`, chỉ gán `href: "/claims"`).

## Test (`tests/claims.test.ts`)

Thuần: `validateClaimInput` đủ ca theo `kind`. Tích hợp: `pendingClaims` xuất hiện/tự dọn đúng, không lẫn dự án (M22); vòng đời `notice→quantified→negotiating→settled`/`rejected`; `nextClaimCode` sinh tuần tự.

## Chia PR

1. Migration + `lib/claims.ts` + API + notification + test.
2. Trang `/claims` + gán `href` sidebar + e2e.

## Điểm cần quyết & mặc định đã chọn

- **Tách hẳn `claims` khỏi `variation_orders`** — claim là phản ứng với sự kiện ngoài kiểm soát, VO là đề xuất chủ động; giữ `vo_id` nullable để nối khi cần, không gộp bảng.
- **`design_change_id` trên `claims` là tuỳ chọn, phụ thuộc M32 có tồn tại hay chưa** — không chặn M34 làm độc lập trước M32 nếu được ưu tiên khác thứ tự; nếu M32 làm sau, thêm cột bằng 1 migration nhỏ riêng lúc đó.
- **Quyền xem hẹp như VO/thanh toán KL** (loại cdt/subcon/viewer) — claim là thông tin tranh chấp/thương mại nhạy cảm, nhất quán quyết định 2026-07-04 đã áp cho toàn bộ nhóm "Tiền".
