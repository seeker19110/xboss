# M8 — Bản vẽ BIM/Shop drawing + biện pháp thi công

**Đợt 3 · Phụ thuộc: — (M10 nối sau nếu muốn) · Phức tạp: Trung bình-Cao**

## Mục tiêu

Drawing register chuẩn: mã bản vẽ + phiên bản rev + trạng thái trình duyệt; kỹ sư/thầu phụ tra bản **mới nhất đã duyệt** trên điện thoại tại hiện trường; biện pháp thi công dùng chung luồng.

## Hiện trạng & điểm chạm

- Hiện chỉ có 1 file `drawing` gắn work package (route `workpackages/:id/drawing`, quyền đã vá `canTouchPackage`) — migrate thành rev đầu của register, giữ route cũ hoạt động (redirect/reuse) đến khi UI mới thay hẳn.
- Upload pattern chuẩn; viewer: PDF mở tab mới hoặc `<embed>`; sw.js loại trừ `/api/photos/` — file bản vẽ cân nhắc tương tự.

## Schema (`migrations/000N_drawings.sql`)

```sql
CREATE TABLE IF NOT EXISTS drawings (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- số bản vẽ (VD: ACMV-SD-T05-001)
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'shop' CHECK (kind IN ('shop','asbuilt','bim','method')), -- method = biện pháp thi công
  system_group TEXT, floor_label TEXT,
  work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS drawing_revisions (
  id SERIAL PRIMARY KEY,
  drawing_id INTEGER NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  rev TEXT NOT NULL,                   -- A, B, C...
  file_path TEXT NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL, size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','commented','approved','approved_with_comments','rejected','superseded')),
  submitted_at DATE, decided_at DATE, decision_note TEXT,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (drawing_id, rev)
);
```

Rev mới `approved` → rev approved cũ tự thành `superseded` (transaction). File PDF max 50MB (bản vẽ nặng hơn biên bản), mime whitelist pdf/png/jpg + (ifc/dwg chỉ lưu trữ, không preview).

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `/api/drawings` GET/POST | xem: mọi user (kể cả subcon — cần bản vẽ để thi công); tạo: Admin/PM/engineer | filter `?kind=&floor=&system=&status=` |
| `/api/drawings/:id/revisions` POST | Admin/PM/engineer | upload rev mới |
| PATCH `/api/drawings/revisions/:id` | đổi trạng thái duyệt: Admin/PM | supersede transaction; audit |
| GET `/api/drawings/revisions/:id/file` | mọi user đăng nhập | stream có check quyền |

Gate biện pháp (`kind='method'`): tương tự hold point M3 — package đánh dấu "cần biện pháp" chỉ tick được khi có method `approved` (dùng chung hàm chặn `lib/qaqc.ts` nếu M3 đã có, không thì if đơn giản).

## UI/UX (`app/drawings/page.tsx`)

- **Register**: bảng mã · tên · hệ · tầng · rev hiện hành (badge to) · trạng thái (màu + icon: submitted sky/approved emerald/rejected rose/superseded zinc gạch) · ngày trình/duyệt. Filter chip theo hệ/tầng/loại/trạng thái.
- **Chi tiết bản vẽ**: timeline rev dọc (mỗi rev: trạng thái, ngày, ghi chú TVGS, nút xem file); **nút to "Xem bản mới nhất đã duyệt"** — hành động chính của hiện trường; xem rev cũ hiện banner cảnh báo amber "Đây là rev cũ (đã có rev X duyệt)".
- Mobile: danh sách dạng card, search theo mã nhanh (autofocus); PDF mở fullscreen.
- Tab "Biện pháp thi công" lọc `kind='method'` — thêm cột package áp dụng + trạng thái gate.
- Thông báo: rev được duyệt/trả lại → notification cho người upload + engineer liên quan package.

## Test

- Integration: supersede đúng (chỉ 1 rev approved/drawing); migrate file drawing cũ thành rev A; quyền subcon chỉ đọc; gate method chặn tick.

## Chia PR

1. Schema + API + migrate dữ liệu drawing cũ + test.
2. Trang register + chi tiết + viewer + menu + e2e/axe.
3. Biện pháp thi công (kind method + gate) + notification duyệt bản vẽ.

## Điểm cần quyết

- Giới hạn dung lượng & định dạng thực tế (BIM export IFC có cần không hay chỉ PDF? — hỏi người dùng khi triển khai).
- Dung lượng `data/uploads/` trên VPS: đặt cảnh báo dung lượng ở trang admin (việc nhỏ, làm kèm PR 1).
