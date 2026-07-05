# M19 — Đề xuất & phê duyệt online tổng quát

**Nhóm D · Phụ thuộc: không cứng (nên sau M18 nếu muốn cảnh báo vượt định mức ngay từ đầu — không bắt buộc) · Phức tạp: Trung bình (3 PR)**

## Mục tiêu

FastCons có "quản lý đề xuất & phê duyệt online" tổng quát (tạm ứng, thanh toán, mua sắm, cấp phát...) với quy trình tuỳ biến. XBoss hiện chỉ có `purchase_requests` (yêu cầu mua vật tư) — hẹp. M19 tổng quát hoá thành `proposals` cho **các loại đề xuất khác** (tạm ứng, thanh toán, cấp phát vật tư ngoài định mức, đề xuất khác) **mà không thay thế** `purchase_requests` hiện có (giữ nguyên luồng mua vật tư đang chạy tốt — tránh big-bang, đúng nguyên tắc dự án).

## Hiện trạng & điểm chạm

- `purchase_requests` (baseline) — vẫn là luồng mua vật tư; PR route hiện có (`app/api/purchase-requests/`) giữ nguyên, KHÔNG migrate dữ liệu cũ sang `proposals`.
- Vòng đời duyệt mượn pattern nghiệm thu 2 bước (`CAN.approve`) — đã dùng ở M6 (VO), M17 (IPC).
- `contracts`/`payment_bills` (M16) — đề xuất loại "thanh toán"/"tạm ứng" khi duyệt xong có thể tạo thẳng `payment_bills` (liên kết mềm, không bắt buộc).
- `boq_norms`/`overNormItems` (M18) — cảnh báo đề xuất cấp phát vật tư vượt định mức (PR 3, phụ thuộc mềm — làm được trước, bổ sung cảnh báo sau).
- Notification: cơ chế on-fetch dedup/tự dọn sẵn có.

## Schema (`migrations/0015_proposals.sql`)

```sql
CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                          -- DX-0001
  kind TEXT NOT NULL CHECK (kind IN ('advance','payment','allocation','other')),
  title TEXT NOT NULL,
  amount NUMERIC(15,2),                                -- NULL khi đề xuất không có giá trị tiền
  contract_id INTEGER REFERENCES contracts(id),        -- tạm ứng/thanh toán: gắn HĐ (tuỳ chọn)
  material_id INTEGER REFERENCES materials(id),        -- cấp phát: gắn vật tư (tuỳ chọn)
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at DATE, decided_at DATE, decided_by INTEGER REFERENCES users(id),
  reject_reason TEXT,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS proposal_documents (       -- pattern task_documents
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  caption TEXT, uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS proposal_id INTEGER REFERENCES proposals(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_proposal ON notifications(user_id, type, proposal_id)
  WHERE proposal_id IS NOT NULL;
```

## `lib/proposals.ts`

- `validateProposalInput`: `kind` hợp lệ; `title` không rỗng; `amount` (nếu có) ≥ 0; `kind='allocation'` khuyến khích có `material_id` (không bắt buộc cứng — đề xuất có thể chưa rõ vật tư cụ thể lúc tạo).
- `canDecideProposal(user)`: alias `CAN.approve` (Admin/PM) — tách hàm riêng để chỗ gọi rõ nghĩa, không đổi hành vi.
- `pendingProposalsOver(days = 5)`: `status='submitted'` quá N ngày chưa quyết → notification `proposal_pending` (cùng pattern `vo_pending`/`cert_pending`).
- `allocationOverNorm(proposalId)` (PR 3, phụ thuộc M18): khi `kind='allocation'` có `material_id`, kiểm `material_id` có nằm trong `overNormItems()` (M18) không → trả cảnh báo hiển thị (không chặn cứng, giống Σweight ở M1).

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET/POST /api/proposals?kind=&status=` | GET: mọi user (lọc `requested_by=self` cho vai trò không quản lý — subcon/viewer chỉ thấy đề xuất của mình); POST: mọi vai trò thao tác (`editProgress`) | mã tự sinh `DX-000N` |
| `GET/PATCH/DELETE /api/proposals/:id` | GET: người tạo hoặc Admin/PM/bch; PATCH (khi draft): người tạo hoặc Admin/PM; DELETE: người tạo (khi draft) hoặc Admin | đối xứng `purchase_requests` hiện có |
| `POST /api/proposals/:id/submit` | người tạo hoặc Admin/PM | draft → submitted |
| `POST /api/proposals/:id/decide` | `CAN.approve` | `{decision, rejectReason?}`; approved + `kind∈{advance,payment}` + có `contract_id` → tuỳ chọn tạo `payment_bills` (checkbox trong request, không tự động ép) |
| `POST/DELETE .../:id/documents(/:did)` | như PATCH/GET tương ứng | pattern `task_documents` |

Notification `proposal_pending`: on-fetch, gửi Admin/PM, dedup theo `proposal_id`.

## UI/UX (`app/proposals/page.tsx`)

- Tab theo `kind` (Tạm ứng / Thanh toán / Cấp phát / Khác) — mỗi tab bảng đề xuất: mã, tiêu đề, giá trị, người đề xuất, trạng thái (badge), ngày.
- Form tạo nhanh (mobile-first, kỹ sư hiện trường dùng được): loại + tiêu đề + giá trị (tuỳ chọn) + lý do + đính kèm ảnh/file → gửi duyệt.
- Màn duyệt (Admin/PM): danh sách `submitted` gộp mọi loại (giống hộp thư chờ duyệt), mở chi tiết duyệt/từ chối kèm lý do; nếu `kind∈{advance,payment}` có `contract_id` → checkbox "Tạo phiếu thanh toán tương ứng".
- Sidebar mục "Đề xuất & phê duyệt" (nhóm Tiền hoặc nhóm mới "Duyệt" tuỳ vị trí menu lúc triển khai — quyết định UI cụ thể khi code, không chốt trước ở đây).
- Widget "Chờ duyệt của tôi" trên dashboard cho Admin/PM (đếm `proposals.status='submitted'` + `purchase_requests.status='pending'` gộp — 1 con số duy nhất, tránh 2 nơi rời rạc).

## Test (`tests/proposals.test.ts`)

- Thuần: `validateProposalInput`.
- Tích hợp: vòng đời draft→submitted→approved/rejected; `pendingProposalsOver` xuất hiện/biến mất; approve `payment`/`advance` có tạo `payment_bills` đúng khi checkbox bật, không tạo khi tắt; quyền xem giới hạn theo `requested_by` cho vai trò hẹp.

## Chia PR

1. Schema + `lib/proposals.ts` + API vòng đời + test.
2. Trang `/proposals` (4 tab + form + màn duyệt) + widget dashboard + sidebar + e2e/axe.
3. Documents + notification `proposal_pending` + tích hợp cảnh báo `allocationOverNorm` (M18) nếu M18 đã xong.

## Điểm cần quyết & mặc định đã chọn (2026-07-05)

- **KHÔNG gộp `purchase_requests` vào `proposals`** trong đợt này — 2 bảng song song, chấp nhận widget "chờ duyệt" phải đếm gộp cả 2. Gộp thật (migrate `purchase_requests` → `proposals` loại mới `material`) là việc lớn hơn, để đợt sau nếu thấy 2 luồng gây nhầm lẫn thực tế (YAGNI — chưa có nhu cầu xác nhận).
- **Quy trình duyệt 1 cấp** (submit → Admin/PM quyết) — FastCons quảng cáo "tuỳ chỉnh quy trình duyệt theo nghiệp vụ" (multi-step/multi-approver) nhưng XBoss hiện mọi vòng đời duyệt đều 1 cấp (nghiệm thu, VO, IPC) — giữ nhất quán, không thêm engine workflow cấu hình được (over-engineer so với quy mô 1 dự án).
- Đề xuất **"Khác" (`other`)** không có `amount`/`contract_id`/`material_id` bắt buộc — dùng cho các loại chưa lường trước, tránh phải thêm bảng mới mỗi khi có nhu cầu đề xuất lạ.
