# M64 — Upload kế hoạch & tracking theo hệ (`/progress/[system]`)

> Viết TRƯỚC khi code (đặc tả kín — route: `spec`). Yêu cầu gốc: "trong Kế hoạch và
> tiến độ, trong mỗi hệ cho phép admin upload kế hoạch và tracking để kỹ sư tracking
> và tuân theo". Đã chốt với người dùng qua `AskUserQuestion` (2026-08-09):
>
> 1. Admin **xuất file mẫu Excel từ DB** (không phải tự soạn tay) → tải xuống, điền,
>    upload lại → hệ thống **parse để cập nhật dữ liệu thật** (không chỉ lưu tham khảo).
> 2. "Mỗi hệ" = 6 hệ trong cụm sidebar "Kế hoạch & Tiến độ" (`/progress/[system]`:
>    acmv/dien/nuoc/pccc/ket_cau/xay_to) — bảng `systems`, tra bằng `resolveSystemId`
>    (`lib/systems.ts`).
> 3. File "tracking" dùng lưới x/○ theo từng ô dimension (tái dùng format đang export
>    ở `buildTrackingTab`, `app/api/export/excel/route.ts`) — không dùng 1 cột %.
> 4. Upload "kế hoạch" (ngày BĐ/KT) **ghi đè toàn bộ** ngày cũ của task khớp BOQCODE.

## 1. Bối cảnh & lý do không tái dùng thẳng cơ chế cũ

- `lib/import.ts::importWorkbook` đã parse Excel gốc nhưng **hard-code** `SHEET_MAP` (5
  sheet cố định OGTĐ/OGHL/OGCH/ODNN1/ODNN2, tất cả gán cứng `system_id` của hệ `acmv`) và
  layout cột theo **vị trí cố định** (`HEADER_ROW=2, DATA_START=5, DIM_START=9`) khớp đúng
  file Excel gốc lịch sử — **không tổng quát được** cho 6 hệ mới (điện/nước/pccc/kết
  cấu/xây tô có sheet tạo tự do qua `POST /api/sheets`, không theo layout cũ).
- `POST /api/baselines` snapshot NGÀY/% đang có vào bảng riêng để vẽ S-curve kế hoạch —
  không phải cơ chế "admin đẩy kế hoạch mới từ file vào DB".
- → M64 viết **lib mới, độc lập**, khoá bằng **tên cột header + BOQCODE** (không phụ
  thuộc vị trí cột/dòng cố định) để hoạt động đúng với bất kỳ hệ/sheet nào.

## 2. Schema

`migrations/0081_system_uploads.sql` — thuần `CREATE TABLE`/`CREATE INDEX`, không đụng
dữ liệu hiện có → đi thẳng production (không cần staging).

```sql
CREATE TABLE IF NOT EXISTS system_uploads (
  id SERIAL PRIMARY KEY,
  system_id INTEGER NOT NULL REFERENCES systems(id),
  kind TEXT NOT NULL CHECK (kind IN ('ke_hoach', 'tracking')),
  file_name TEXT NOT NULL,        -- tên file lưu trữ (server sinh, dùng với storagePut/Get)
  original_name TEXT,             -- tên file gốc người dùng upload (hiển thị UI)
  uploaded_by INTEGER REFERENCES users(id),
  row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  warnings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_uploads_system ON system_uploads(system_id, kind, created_at DESC);
```

Chạy `npm run gen:erd` sau khi thêm migration (ERD tự sinh, không sửa tay).

## 3. Lib mới `lib/system-upload.ts`

Tách `buildTrackingTab` (+ `styleHeader`, `fill`, `STATUS_FILL`, `GROUP_FILL`,
`HEADER_FILL`, `safeTabName`, kiểu `TrackTask`/`DimRow`) từ
`app/api/export/excel/route.ts` sang `lib/excel-tracking.ts` (export các hàm/kiểu này),
route export import lại từ đó — **không đổi hành vi export hiện có** (chỉ di chuyển vị
trí code, giữ nguyên logic 100%). `lib/system-upload.ts` import `buildTrackingTab` từ đó
để dùng chung, tránh lặp code.

```ts
// lib/system-upload.ts
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

export type UploadKind = "ke_hoach" | "tracking";

export type PlanRow = { taskId: number; boqCode: string; startDate: string | null; endDate: string | null };

// Dựng workbook mẫu "kế hoạch": 1 tab, mỗi dòng 1 task thuộc hệ `systemId` (lọc thêm
// projectId nếu có — cùng kiểu JOIN towers như app/api/export/excel/route.ts).
// Cột: BOQCODE | Sheet | Nhóm | Mã | Tên công việc | Ngày bắt đầu KH | Ngày kết thúc KH
// (2 cột cuối là cột admin sửa tay). Task không có BOQCODE vẫn liệt kê (để admin thấy
// đủ danh sách) nhưng ghi chú ở cột "Tên công việc": "(không có BOQCODE — không thể
// khớp khi upload)" và BOQCODE để trống.
export async function buildPlanTemplate(
  systemId: number,
  projectId?: number | null,
): Promise<ExcelJS.Workbook>;

// Dựng workbook mẫu "tracking": 1 tab / sheet thuộc hệ (tái dùng buildTrackingTab từ
// lib/excel-tracking.ts, tên tab = sheet_types.code qua safeTabName — PHẢI khớp cách
// route upload nhận diện tab để match ngược, xem parseTrackingWorkbook).
export async function buildTrackingTemplate(
  systemId: number,
  projectId?: number | null,
): Promise<ExcelJS.Workbook>;

export type UploadResult = { rowCount: number; matched: number; unmatched: number; warnings: string[] };

// Đọc file kế hoạch (xlsx, đọc bằng thư viện `xlsx` như lib/import.ts), khoá cột bằng
// TÊN HEADER ở dòng 1 (không theo vị trí cố định — robust khi admin sắp xếp lại cột):
// bắt buộc có "BOQCODE", "Ngày bắt đầu KH", "Ngày kết thúc KH" (thiếu 1 trong 3 → throw
// lỗi rõ ràng "File không đúng mẫu — thiếu cột X", KHÔNG cố đoán).
// Với mỗi dòng dữ liệu (từ dòng 2):
//   - BOQCODE rỗng → unmatched++, warning "Dòng N: thiếu BOQCODE, bỏ qua".
//   - Không tìm thấy task có boq_code khớp VÀ thuộc đúng hệ systemId (join
//     package → sheet_type → system_id) → unmatched++, warning "Dòng N: BOQCODE
//     "X" không thuộc hệ này hoặc không tồn tại".
//   - Khớp: parse ngày bằng `toISO` (tái dùng từ lib/import.ts, export thêm nếu cần) —
//     đọc lỗi (không parse được) → unmatched++, warning tương ứng, KHÔNG cập nhật dòng
//     đó (fail theo từng dòng, không rollback toàn bộ file).
//   - Ngày bắt đầu sau ngày kết thúc (đều có giá trị) → cùng loại lỗi, unmatched++.
//   - Còn lại → matched++, UPDATE tasks SET start_date=?, end_date=? WHERE id=? (GHI ĐÈ
//     toàn bộ kể cả khi task đã có ngày — đúng quyết định đã chốt), rồi gọi
//     `recomputeTask(taskId, <tên người upload>)` (cập nhật lại trễ/status + task_history
//     nếu % đổi — % không đổi vì không đụng dimensions, nhưng vẫn phải gọi vì
//     recomputeTask suy lại status theo effectiveEndDate mới).
// Trả về UploadResult + không ném lỗi cho lỗi từng dòng (chỉ throw khi thiếu cột bắt
// buộc hoặc file không phải .xlsx hợp lệ).
export async function parsePlanUpload(
  systemId: number,
  buffer: Buffer,
  changedBy: string,
): Promise<UploadResult>;

// Đọc file tracking: mỗi tab ứng với 1 sheet_type.code (khớp qua safeTabName — so sánh
// case-sensitive với tên tab thật trong workbook để chấp nhận, KHÔNG throw nếu 1 tab lạ
// xuất hiện, chỉ bỏ qua tab đó + warning "Tab "X" không khớp sheet nào trong hệ này").
// Trong mỗi tab: dòng 1 = header (bắt buộc có "BOQCODE" ở cột đầu — throw nếu không có,
// nghĩa là sai mẫu hoàn toàn); dòng nhóm (cột 2 "Mã" rỗng) bỏ qua; dòng task: cột 1 =
// BOQCODE. Cột dimension = mọi cột SAU 9 cột cố định (BOQCODE/Mã/Chi tiết công việc/
// Tầng/Người phụ trách/Bắt đầu/Kết thúc/% Tiến độ/Trạng thái), nhãn cột lấy từ header —
// khớp dimension theo CẶP (taskId, label) trong `progress_dimensions` (KHÔNG theo vị trí
// cột — nếu admin xoá bớt cột dimension ở giữa, các cột còn lại vẫn map đúng nhãn).
// Với mỗi ô: "x" (không phân biệt hoa/thường, trim) = đã lắp, "○" hoặc rỗng = chưa lắp —
// dùng lại đúng hàm nhận diện "x" của `lib/import.ts::isChecked` (export thêm nếu cần).
//   - BOQCODE rỗng hoặc không khớp task thuộc đúng hệ → unmatched++, warning.
//   - Nhãn dimension trong file KHÔNG khớp bất kỳ dimension nào của task đó trong DB →
//     bỏ qua cột đó cho dòng này, warning "Dòng N: nhãn "Y" không khớp dimension nào của
//     task, bỏ qua" (KHÔNG tự tạo dimension mới — tránh phình bảng progress_dimensions
//     vì lỗi gõ nhãn).
//   - Khớp: UPDATE progress_dimensions SET installed=?, value=? WHERE task_id=? AND
//     dimension_label=?, rồi cuối cùng gọi `recomputeTask(taskId, changedBy)` — MỘT LẦN
//     mỗi task (không gọi lặp lại theo từng ô), sau khi đã cập nhật hết các ô của task đó.
export async function parseTrackingUpload(
  systemId: number,
  buffer: Buffer,
  changedBy: string,
): Promise<UploadResult>;
```

Toàn bộ UPDATE + `recomputeTask` trong `parsePlanUpload`/`parseTrackingUpload` chạy trong
**1 `withTransaction`** bao ngoài (giống pattern `app/api/tasks/[id]/route.ts` PATCH ngày —
`recomputeTask` tự `FOR UPDATE` khoá từng task, transaction ngoài đảm bảo cả file
thành công/thất bại cùng nhau ở tầng DB, còn lỗi từng DÒNG vẫn chỉ là warning không
throw). Không dùng `run()` rời rạc ngoài transaction cho các UPDATE này.

## 4. API routes (`app/api/systems/[code]/...`)

Cả 2 route mới đặt cạnh `app/api/systems/[code]/summary/route.ts` đã có. Resolve
`systemId` bằng `resolveSystemId(code)` (`lib/systems.ts`) — không thấy → 404. Lấy
`projectId` qua `getCurrentProjectId(user)` như route summary/export đã làm, dùng lọc
task theo hệ ĐÚNG dự án đang chọn (JOIN towers, cùng kiểu `projectJoin`/`projectFilter`
trong `app/api/export/excel/route.ts`).

### `GET /api/systems/[code]/upload-template?kind=ke_hoach|tracking`

- Auth: `getCurrentUser()` bắt buộc, 401 nếu chưa đăng nhập — **không giới hạn role**
  (kỹ sư cũng cần xem/tải để đối chiếu, chỉ upload mới giới hạn Admin).
- `kind` không hợp lệ (khác 2 giá trị) → 400.
- Trả file `.xlsx` (`Content-Type:
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), tên file
  `KeHoach-<code>-<today>.xlsx` hoặc `Tracking-<code>-<today>.xlsx`.

### `POST /api/systems/[code]/upload?kind=ke_hoach|tracking` (multipart, field `file`)

- Auth: `getCurrentUser()` + **bắt buộc `user.role === "admin"`** (đúng yêu cầu gốc "cho
  phép ADMIN upload" — không mở cho PM, khác với `CAN.import`/`CAN.export` hiện có vốn
  cho cả Admin/PM) → 403 nếu không phải admin, thông báo "Chỉ Admin được upload kế
  hoạch/tracking theo hệ".
- Giới hạn 20MB, dùng `isContentTooLarge` như `app/api/import/excel/route.ts`.
- Kiểm phần mở rộng/`file.type` phải là `.xlsx`
  (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) — sai định dạng
  → 415.
- Gọi `parsePlanUpload`/`parseTrackingUpload` tương ứng `kind`. Lỗi thiếu cột bắt buộc
  (throw) → 400 với thông điệp lỗi thật (không lộ stack).
- Lưu file gốc qua `storagePut(user.orgId, fileName, buffer)` — `fileName` sinh bởi hàm
  mới `newSystemUploadFileName(systemId, kind, mime)` trong `lib/photos.ts` (theo đúng
  pattern `newDocFileName`/`newContractDocFileName` đã có).
- `INSERT INTO system_uploads (system_id, kind, file_name, original_name, uploaded_by,
  row_count, matched_count, unmatched_count, warnings) VALUES (...)`.
- Trả `{ rowCount, matched, unmatched, warnings, uploadId }`.

### `GET /api/systems/[code]/uploads?kind=ke_hoach|tracking` — lịch sử phiên bản

- Auth: `getCurrentUser()`, không giới hạn role (mọi vai trò xem được lịch sử để biết
  admin đã cập nhật kế hoạch/tracking khi nào).
- Trả tối đa 20 bản gần nhất: `{ id, kind, originalName, uploadedBy: {id,name},
  rowCount, matchedCount, unmatchedCount, warnings, createdAt }[]`.

### `GET /api/system-uploads/[id]/file` — tải lại file đã upload

- Auth: `getCurrentUser()`, không giới hạn role.
- `SELECT system_id, kind, file_name, original_name FROM system_uploads WHERE id = ?` →
  404 nếu không có. `storageGet(user.orgId, file_name)` → 404 nếu file không còn (đã bị
  dọn thủ công) — trả JSON lỗi rõ ràng thay vì 500.
- Trả file với `Content-Disposition: attachment; filename="<originalName hoặc file_name>"`.

Mọi route mới có `export const dynamic = "force-dynamic";`.

## 5. UI — `app/components/SystemUploadPanel.tsx` (mới, client component)

Props: `{ systemCode: string; canUpload: boolean }` (`canUpload = me.role === "admin"`,
truyền từ `app/progress/[system]/page.tsx`).

Chèn 1 section mới vào `app/progress/[system]/page.tsx`, ngay sau section "1. Tổng quan
tiến độ" (trước "2. Biểu đồ kế hoạch so với thực tế"), cùng style card
(`bg-zinc-900 border border-zinc-800 rounded-xl p-5`) như section "Nguyên nhân trễ".

Nội dung panel — 2 khối con "Kế hoạch" và "Tracking" cạnh nhau (`grid grid-cols-1
sm:grid-cols-2 gap-4`), mỗi khối:

- Tiêu đề + icon (`CalendarCheck` cho kế hoạch, `ClipboardList` cho tracking — từ
  `lucide-react`, đã import sẵn trong `dashboardTree.ts` nên chắc chắn có trong bộ icon
  dự án).
- Nút "Tải file mẫu" (mọi role) → `<a href="/api/systems/{code}/upload-template?kind=...">`
  tải trực tiếp (không cần fetch JS).
- Nếu `canUpload`: input file (`accept=".xlsx"`) + nút "Upload" — gọi
  `POST /api/systems/{code}/upload?kind=...` bằng `FormData`, disable nút lúc đang gửi,
  hiện toast/thông báo kết quả `${matched} dòng khớp, ${unmatched} dòng bỏ qua` + liệt kê
  tối đa 5 `warnings` đầu (kèm nút "xem thêm" nếu nhiều hơn) — dùng style thông báo lỗi/
  cảnh báo đã có (`text-xs text-amber-400`/`text-rose-400` tương tự trang `/import`).
- Danh sách lịch sử (gọi `GET /api/systems/{code}/uploads?kind=...` lúc mount): mỗi dòng
  `originalName · uploadedBy.name · createdAt (định dạng giờ VN)` + link tải lại
  (`/api/system-uploads/{id}/file`) — tối đa hiện 5 dòng, không phân trang thêm (YAGNI).
- Trạng thái rỗng: "Chưa có lần upload nào."
- Loading: dùng `Skeleton` có sẵn (`app/components/Skeleton.tsx`) thay vì trắng trang.

Toàn bộ nhãn/thông báo tiếng Việt, không hardcode màu ngoài thang zinc/emerald/amber/rose
theo quy ước theme dark-first của dự án (không `dark:`, không hex).

## 6. Test (`tests/system-upload.test.ts`, mới — import `tests/setup.ts` đầu tiên)

Cần `TEST_DATABASE_URL` (tự skip nếu thiếu, đúng quy ước `recompute.test.ts`).

- `buildPlanTemplate`/`buildTrackingTemplate`: workbook sinh ra đọc lại được bằng
  `ExcelJS`/`xlsx`, đúng số dòng = số task thuộc hệ test, header đúng tên cột kỳ vọng.
- `parsePlanUpload`: seed 2 task có BOQCODE trong hệ test + 1 task hệ khác (boq khác) →
  workbook với 3 dòng (2 khớp hệ test đổi ngày, 1 dòng BOQCODE thuộc hệ khác → unmatched,
  1 dòng thiếu BOQCODE → unmatched); xác nhận ngày cập nhật đúng + task thuộc hệ khác
  KHÔNG bị đụng; xác nhận task trễ (end_date mới < hôm nay) đổi `status='tre'` sau upload
  (gọi đúng `recomputeTask`).
- `parseTrackingUpload`: seed task có 3 dimension (2 đã tick, 1 chưa) → workbook tick nốt
  ô còn lại → `progress_percent` task = 1, `status` phù hợp (`hoan_thanh`/giữ
  `nghiem_thu` nếu đã duyệt trước đó — test cả 2 nhánh theo bất biến ở `lib/recompute.ts`);
  nhãn dimension sai → warning, không tạo dimension mới (đếm số dòng
  `progress_dimensions` không đổi).
- Route test (nếu có harness gọi route trực tiếp theo pattern file test route khác trong
  `tests/`): 403 khi user không phải admin gọi `POST .../upload`; 401 khi chưa đăng nhập;
  404 khi `code` không tồn tại.

## 7. Tiêu chí chấp nhận (Definition of Done)

- [ ] Migration `0081_system_uploads.sql` áp sạch (`npm run db:migrate`), `docs/ERD.md`
      sinh lại có bảng `system_uploads`.
- [ ] Cả 6 trang `/progress/[system]` hiện panel upload; role không phải admin thấy nút
      tải mẫu + lịch sử nhưng KHÔNG thấy input upload.
- [ ] Upload file mẫu kế hoạch tự tải (không sửa gì) → parse thành công, `matched` = số
      task có BOQCODE trong hệ, ngày không đổi (idempotent).
- [ ] Sửa 1 ngày kế hoạch trong file mẫu rồi upload lại → task tương ứng đổi ngày +
      trạng thái trễ (nếu áp dụng) cập nhật đúng ngay khi tải lại trang tracking.
- [ ] Upload file mẫu tracking tự tải (tick thêm 1 ô) → % task tăng đúng, `task_history`
      có dòng mới, nhóm cha (`work_packages.progress`) cập nhật qua `recomputePackage`.
- [ ] File/BOQCODE không khớp hệ → không đụng dữ liệu hệ khác, có trong `warnings` trả
      về và hiển thị trên UI.
- [ ] Lịch sử upload liệt kê đúng thứ tự mới nhất trước, tải lại file cũ được.
- [ ] `npm run lint`/`typecheck` xanh; `npm test` xanh (test mới cần `TEST_DATABASE_URL`,
      tự skip nếu môi trường không có — không làm đỏ CI cục bộ thiếu DB); `npm run build`
      xanh.
- [ ] `PROGRESS.md` cập nhật mục "Đã làm" + `docs/nang-cap/README.md` (mở mục M64 mới).
