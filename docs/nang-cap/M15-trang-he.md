# M15 — Trang làm việc riêng từng hệ (discipline hub)

**Đợt 1 (ngay sau M0 + M1 phần `disciplines`) · Phụ thuộc: M0 (AppShell), bảng `disciplines` (M1) · Phức tạp: Trung bình**

## Mục tiêu

Mỗi hệ (Kết cấu / Xây tô / ACMV / Điện / Nước / PCCC...) có **1 trang riêng** `/he/[code]` — như cách toàn bộ app hiện nay đang phục vụ ACMV: vào trang hệ là thấy đủ tiến độ, sheet tracking, và (khi các module sau hoàn thành) BOQ, QA&QC, bản vẽ, mặt bằng **của riêng hệ đó**.

**Mục đích quản lý: phân chia theo nhà thầu.** Mỗi hệ thường do 1 nhà thầu (phụ) phụ trách — trang hệ chính là **hồ sơ quản lý nhà thầu đó**: PM mở trang hệ Điện là thấy toàn cảnh nhà thầu điện (tiến độ, nhân lực, chất lượng, sản lượng, thanh toán); tài khoản của nhà thầu (`subcon`) gắn hệ nào chỉ thấy/thao tác trang hệ đó.

## Nguyên tắc thiết kế then chốt

**KHÔNG nhân bản UI mỗi module cho từng hệ.** Trang hệ = **hub tổng quan + deep-link có filter**: mỗi trang module dùng chung (BOQ, QA&QC, bản vẽ...) nhận query param `?he=<code>` để lọc theo hệ; trang hệ chỉ render phần tổng quan riêng + các thẻ/tab dẫn sang trang module với filter đã gài sẵn. Một UI, n hệ — sửa 1 chỗ, đúng mọi hệ.

## Hiện trạng & điểm chạm

- `sheet_types` + `discipline_id` (M1/§3b); các sheet ACMV hiện có gán `discipline='acmv'` khi migrate.
- Dashboard tổng (`/api/dashboard`) và S-curve đã có cơ chế tính theo sheet — tái dùng query, thêm điều kiện discipline.
- `NAV_ITEMS` (M0): nhóm "Thi công" đổi thành nhóm **"Hệ thi công"** liệt kê từ `/api/disciplines`.

## Schema

Dùng `disciplines` + `sheet_types.discipline_id` (M1) và `user_disciplines` (§3b — áp cho CẢ tài khoản `subcon`: nhà thầu hệ nào gắn hệ đó, chỉ thấy/ghi trong hệ mình). Thêm 1 liên kết nhà thầu phụ trách hệ:

```sql
ALTER TABLE disciplines ADD COLUMN IF NOT EXISTS contractor_supplier_id INTEGER REFERENCES suppliers(id); -- nhà thầu phụ trách hệ (1 hệ 1 nhà thầu chính; NULL = tự thi công)
```

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| GET `/api/disciplines` | mọi user đăng nhập | list hệ + số sheet, % tiến độ tổng (cache nhẹ trong request) |
| GET `/api/disciplines/:code/summary` | mọi user đăng nhập | KPI hệ: % tiến độ (bình quân theo task các sheet thuộc hệ), số task trễ, chờ nghiệm thu, danh sách sheet kèm % từng sheet; khối mở rộng trả thêm khi module tồn tại: NCR mở (M3), % ngân sách hệ (M2 — chỉ `PAYMENT_VIEW_ROLES`), bản vẽ chờ duyệt (M8), tầng chờ mặt bằng (M14) — pattern "khối null thì UI ẩn" như M9 |
| Các API module sẵn có | — | thêm param lọc `?discipline=` (tasks/boq/quality/drawings/work-fronts) — mỗi module tự thêm khi triển khai |

## UI/UX (`app/he/[code]/page.tsx`)

- **Header hệ**: tên hệ + **tên nhà thầu phụ trách** + dải màu nhận diện từ `disciplines.color` (viền trái đậm — cùng màu này dùng ở sidebar, biểu đồ, badge mọi nơi), KPI strip: % tiến độ to, task trễ, chờ nghiệm thu (+ NCR/ngân sách/bản vẽ khi có).
- **Khối "Quản lý nhà thầu"** trong tab Tổng quan (quyền Admin/PM/BCH, hiện dần theo module): nhân lực hôm nay của nhà thầu (M5 — manpower theo tổ đội thuộc hệ), sản lượng giao thầu vs thực hiện (M1 — `qty_sub`), NCR mở của hệ (M3), thanh toán/công nợ nhà thầu (M2 sau backfill FK — `payment_bills` theo supplier), đánh giá (M4). Đây là màn hình họp giao ban với từng nhà thầu.
- **Tab trong trang hệ** (hiện dần theo module đã triển khai — tab ẩn khi khối summary trả null):
  1. **Tổng quan**: S-curve của hệ + danh sách sheet thuộc hệ (mỗi sheet 1 card: tên, % progress bar, số task trễ → bấm vào lưới tracking như hiện nay).
  2. **Tracking**: danh sách sheet (như trên, dạng đầy đủ) — lưới tracking giữ nguyên route `/tracking/[sheet]` hiện tại, breadcrumb topbar thành "Hệ Điện / OGTĐ".
  3. **BOQ** → `/boq?he=<code>` (sau M1) · **QA&QC** → `/quality?he=` (M3) · **Bản vẽ** → `/drawings?he=` (M8) · **Mặt bằng** → `/work-fronts?he=` (M14) — tab kiểu link, mở trang module với filter gài sẵn + nút "← về trang hệ".
- **Sidebar (M0)**: nhóm "Hệ thi công" — mỗi hệ 1 mục (chấm màu + tên); user có `user_disciplines` thì hệ của mình lên đầu + mặc định điều hướng vào đó sau login; sheet không còn liệt kê phẳng ở sidebar mà nằm trong trang hệ (đỡ dài menu khi 6+ hệ × n sheet).
- Trang chủ `/` (dashboard tổng) giữ nguyên vai trò nhìn **toàn dự án** — thêm hàng "card hệ" (mỗi hệ: màu + % + trễ, bấm vào trang hệ; chính là bảng chéo hệ M9 dạng rút gọn).
- Hệ chưa có sheet: EmptyState "Chưa có sheet tracking cho hệ này" + nút tạo sheet (Admin/PM — form tạo sheet sẵn có, thêm field chọn hệ).
- Mobile: KPI strip cuộn ngang; card sheet 1 cột; tab cuộn ngang `.scrollbar-none`.

## Test

- Integration: summary tính đúng % theo hệ (2 hệ, sheet lẫn nhau); khối module chưa có trả null; quyền khối ngân sách theo `PAYMENT_VIEW_ROLES`.
- e2e `e2e/authed/discipline.spec.ts`: điều hướng sidebar → trang hệ → sheet; axe desktop + mobile.

## Chia PR

1. API `/api/disciplines` + summary + gán discipline cho 5 sheet gốc (migration data nhỏ) + test.
2. Trang `/he/[code]` (header + tab Tổng quan/Tracking) + sidebar nhóm hệ + card hệ trên dashboard + e2e/axe.
3. Param `?he=` cho các trang module — làm rải trong PR của từng module sau (M1/M3/M8/M14 đã ghi chú trong file tương ứng).

## Điểm cần quyết

- Sau login điều hướng vào trang hệ của user hay dashboard tổng? (đề xuất: engineer/subcon có 1 hệ → vào trang hệ; Admin/PM/BCH → dashboard tổng).
- 1 hệ có thể 2+ nhà thầu chia tầng/khu không? (hiện thiết kế 1 hệ 1 nhà thầu chính; nếu thực tế chia khu → chuyển sang bảng nối `discipline_contractors` khi triển khai — hỏi lại lúc đó).
