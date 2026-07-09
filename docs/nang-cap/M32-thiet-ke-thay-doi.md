# M32 — Quản lý thay đổi thiết kế (Design Change)

**Cụm C · Phụ thuộc: M08 (bản vẽ) · Phức tạp: Nhỏ-Trung bình (1-2 PR)**

## Mục tiêu

Lấp khoảng trống còn lại của cụm "Thiết kế & Biện pháp thi công" (`docs/ke-hoach-ia-chi-tiet-2026-07.md` mục C1): quy trình **thay đổi thiết kế** — tiếp nhận yêu cầu → đánh giá tác động (kỹ thuật/chi phí/tiến độ) → trình duyệt → cập nhật bản vẽ liên quan. Đây là mục con còn thiếu duy nhất của C1 sau khi rà lại code thật.

## Hiện trạng & điểm chạm — ĐÃ CÓ, không làm lại

- **Biện pháp thi công (BPTC) — ĐÃ XONG, không phải khoảng trống thật** (tài liệu `ke-hoach-ia-chi-tiet-2026-07.md` viết trước khi rà code, đã lỗi thời ở điểm này): `drawings.kind` (`migrations/0016_ban_ve.sql`) đã có giá trị `'method'` = biện pháp thi công, dùng chung bảng `drawings`/`drawing_revisions` với vòng đời duyệt đầy đủ (`submitted→commented→approved/approved_with_comments/rejected→superseded`). `app/drawings/page.tsx` đã render riêng khối `kind === "method"`; `lib/qaqc.ts:99-113` đã dùng `drawings.kind='method'` làm điều kiện mở khoá hold-point. **M32 KHÔNG đụng lại phần này.**
- RFI/công văn gửi thiết kế/TVGS: đã có `/correspondences` (M10) — tái dùng nguyên trạng, không tạo luồng riêng.
- `/drawings` (M08): trang bản vẽ hiện tại, đơn tab. M32 thêm 1 tab mới vào trang này (không tạo route riêng).

## Schema (`migrations/0039_design_changes.sql`)

```sql
CREATE TABLE IF NOT EXISTS design_changes (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  code TEXT,                                                 -- DC-0001 (nextSeqCode, pad 4)
  title TEXT NOT NULL,
  discipline_id INTEGER REFERENCES disciplines(id),
  drawing_id INTEGER REFERENCES drawings(id),                -- bản vẽ liên quan (nullable — có thể chưa gắn bản vẽ cụ thể)
  requested_by_note TEXT,                                    -- ai/đơn vị nào yêu cầu (CĐT/TVGS/nhà thầu) — nhập tay, không FK cứng
  reason TEXT NOT NULL,                                       -- lý do thay đổi
  impact_technical TEXT,
  impact_cost TEXT,                                           -- mô tả định tính; số tiền thật nối qua VO (variation_orders.design_change_id) nếu có
  impact_schedule TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'assessing', 'approved', 'rejected', 'drawing_updated')),
  decision_note TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_changes_drawing ON design_changes(drawing_id);

-- Nối VO (M6) khi thay đổi thiết kế phát sinh chi phí — tuỳ chọn, không bắt buộc mọi DC đều có VO.
ALTER TABLE variation_orders ADD COLUMN IF NOT EXISTS design_change_id INTEGER REFERENCES design_changes(id);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS design_change_id INTEGER REFERENCES design_changes(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_design_change ON notifications(user_id, type, design_change_id)
  WHERE design_change_id IS NOT NULL;
```

## `lib/designchanges.ts`

- `listDesignChanges(projectId?, filters?)` / `getDesignChange(id)`.
- `validateDesignChangeInput` (thuần — `title`/`reason` bắt buộc).
- `nextDesignChangeCode()` — dùng lại `nextSeqCode` (`lib/seqcode.ts`, `pad=4`, tiền tố `DC`).
- `pendingDesignChanges(days, projectId?)` — DC `submitted`/`assessing` quá N ngày chưa quyết (mirror `pendingVariations`).

## API

| Route                                                      | Quyền                                                                                                               | Ghi chú                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET/POST /api/design-changes` + `.../:id`                 | ghi: `CAN.manageDesignChanges` (admin/pm/engineer — kỹ sư hiện trường ghi nhận yêu cầu); xem: mọi vai trò đăng nhập | tạo sinh `code` qua `nextDesignChangeCode()`, gán `project_id` từ server                                                           |
| `POST /api/design-changes/:id/decide`                      | `CAN.approve`                                                                                                       | `approved`/`rejected`, `approved` bắt buộc `decision_note` nếu có tác động chi phí/tiến độ                                         |
| `PATCH /api/design-changes/:id` (status='drawing_updated') | `CAN.manageDesignChanges`                                                                                           | đánh dấu đã cập nhật bản vẽ xong sau khi duyệt (không tự động — người dùng xác nhận tay sau khi upload revision mới ở `/drawings`) |

Notification `design_change_pending`: DC `submitted`/`assessing` quá 5 ngày → Admin/PM (cơ chế dedup/tự dọn như `vo_pending`, truyền `projectId` ngay từ đầu — không tạo nợ kỹ thuật mới).

## UI/UX

Thêm 1 tab **"Thay đổi thiết kế"** vào `app/drawings/page.tsx` (trang đã có, chuyển thành hub nhiều tab nếu chưa — tab hiện có coi là "Bản vẽ"). Bảng DC (mã/tiêu đề/hệ/trạng thái màu theo status/ngày tạo), modal chi tiết: form tiếp nhận (reason + 3 ô đánh giá tác động) → nút Duyệt/Từ chối (Admin/PM) → sau duyệt hiện nút "Đánh dấu đã cập nhật bản vẽ" + link tới bản vẽ liên quan (nếu có `drawing_id`) hoặc nút "Tạo bản vẽ mới" (điều hướng `/drawings` tạo mới, gán `drawing_id` quay lại qua PATCH). Không thêm mục sidebar riêng — vẫn dùng mục "Bản vẽ" hiện có (M08), chỉ thêm tab.

## Test (`tests/designchanges.test.ts`)

Thuần: `validateDesignChangeInput`, `nextDesignChangeCode` sinh tuần tự. Tích hợp: `pendingDesignChanges` xuất hiện/tự dọn đúng điều kiện, không lẫn dự án (scoping M22), vòng đời `submitted→assessing→approved→drawing_updated`/`rejected`.

## Chia PR

1. Migration + `lib/designchanges.ts` + API + notification + test.
2. Tab "Thay đổi thiết kế" trong `/drawings` + e2e.

## Điểm cần quyết & mặc định đã chọn

- **KHÔNG làm lại BPTC** — đã có đủ qua `drawings.kind='method'` + `drawing_revisions`, chỉ là tài liệu kế hoạch cũ chưa cập nhật theo thực tế code (đã sửa nhận định trong file này).
- **`impact_cost` là mô tả định tính** (text), không phải số tiền — số tiền thật đi qua VO (M6) nếu thay đổi thiết kế phát sinh chi phí, nối qua cột `variation_orders.design_change_id` mới thêm (tuỳ chọn, không bắt buộc mọi DC phải có VO — nhiều DC chỉ đổi bản vẽ không phát sinh tiền).
- **Không tự động cập nhật bản vẽ khi duyệt** — người dùng tự xác nhận qua nút riêng sau khi thao tác thật ở `/drawings` (tránh giả định luồng nghiệp vụ chưa rõ, an toàn hơn tự động hoá sai).
