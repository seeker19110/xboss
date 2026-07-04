# M14 — Quản lý mặt bằng thi công (work front)

**Đợt 2 · Phụ thuộc: — · Phức tạp: Trung bình** (số M14 vì bổ sung sau, nhưng làm ở đợt 2)

## Mục tiêu

Theo dõi bàn giao mặt bằng từ tổng thầu theo tầng/khu vực: tầng chưa có mặt bằng thì khoá/mờ trên lưới, cảnh báo khi task tới ngày bắt đầu mà chưa có mặt bằng — dữ liệu làm **bằng chứng xin gia hạn (EOT)** với tổng thầu/CĐT.

## Hiện trạng & điểm chạm

- Lưới tracking theo tầng: `lib/floors.ts`, `lib/grid.ts`, filter tầng trên `/tracking/[sheet]`; "chờ mặt bằng" hiện chỉ là 1 lý do trong `lib/delay.ts`.
- Cảnh báo: pattern `due_soon` trong `/api/notifications`; biên bản đính kèm: pattern `task_documents`.

## Schema (`migrations/000N_workfront.sql`)

```sql
CREATE TABLE IF NOT EXISTS work_fronts (
  id SERIAL PRIMARY KEY,
  sheet_type_id INTEGER NOT NULL REFERENCES sheet_types(id) ON DELETE CASCADE,
  floor_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','handed_over','in_progress','returned')),
  handed_over_at DATE,               -- ngày nhận mặt bằng
  returned_at DATE,                  -- ngày trả
  blocker TEXT,                      -- vướng: chưa xây tô / chưa trần / vướng nhà thầu khác...
  note TEXT,
  UNIQUE (sheet_type_id, floor_label)
);
CREATE TABLE IF NOT EXISTS work_front_documents (    -- biên bản bàn giao + ảnh hiện trạng
  id SERIAL PRIMARY KEY,
  work_front_id INTEGER NOT NULL REFERENCES work_fronts(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Đổi trạng thái ghi audit (bảng `task_history` không hợp — thêm cột note lịch sử trong `work_fronts` hay bảng log riêng: quyết khi code, đề xuất log riêng `work_front_history` đơn giản).

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| GET `/api/work-fronts?sheet=` | mọi user đăng nhập | trạng thái mọi tầng của sheet |
| PATCH `/api/work-fronts/:id` | Admin/PM/engineer | đổi trạng thái + ngày + blocker; transaction |
| POST/DELETE `.../:id/documents` | như PATCH | upload biên bản/ảnh hiện trạng |

**Tích hợp:**
- `/api/lookahead`: task thuộc tầng `pending` gắn cờ `waitingFront: true`.
- Notification `front_missing`: task tới `start_date` ≤ 3 ngày mà tầng còn `pending` → báo Admin/PM (đồng bộ on-fetch, dedup theo tầng).
- Dashboard (M9): đếm tầng chờ bàn giao + tổng số ngày chờ luỹ kế (Σ max(0, today − start_date sớm nhất của tầng) — con số EOT).

## UI/UX

- **`/work-fronts`**: ma trận tầng × sheet (hàng = tầng theo thứ tự `lib/floors.ts`, cột = sheet) — ô màu theo trạng thái (pending zinc + icon khoá, handed_over sky, in_progress emerald, returned zinc nhạt + check; icon kèm màu). Click ô mở panel: đổi trạng thái (stepper), ngày, blocker (select danh mục + note), upload biên bản/ảnh.
- **Lưới tracking**: header tầng thuộc front `pending` thêm badge "Chưa có mặt bằng" (amber + icon khoá); **không chặn cứng** tick (thực tế có thể vào làm cục bộ) — chỉ cảnh báo trực quan; hàng tooltip nêu blocker.
- **Lookahead/print**: task chờ mặt bằng in kèm ghi chú "⚠ chưa bàn giao MB" — trang in này chính là thứ mang đi họp với tổng thầu.
- Xuất "Báo cáo mặt bằng" (PDF): danh sách tầng pending + ngày task lẽ ra bắt đầu + số ngày chờ — format đối chứng EOT.

## Test

- Integration: PATCH trạng thái tuần tự hợp lệ (pending→handed_over→in_progress→returned, không nhảy ngược trừ Admin); notification `front_missing` tạo & tự dọn khi bàn giao; lookahead gắn cờ đúng.

## Chia PR

1. Schema + API + tích hợp lookahead/notification + test.
2. Trang `/work-fronts` (ma trận + panel) + badge lưới tracking + menu + e2e/axe.
3. Báo cáo PDF mặt bằng/EOT.

## Điểm cần quyết

- Đơn vị mặt bằng: theo tầng (floor_label) đủ hay cần chia khu/trục trong tầng? (đề xuất: theo tầng trước — khớp lưới hiện có; thêm cột `zone` sau nếu thực tế cần).
