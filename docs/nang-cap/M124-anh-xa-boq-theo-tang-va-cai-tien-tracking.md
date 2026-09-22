# M124 — Ánh xạ BOQ theo tầng + cải tiến trang BOQ và lưới tracking

| Thuộc tính   | Giá trị                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| Issue / Goal | Đề xuất cải tiến tracking & BOQ (khảo sát 2026-09-22). Tiếp nối M120/M121/M122.                         |
| Spec owner   | Phiên chính (opusplan)                                                                                  |
| State        | **Approved for implementation** — người dùng chốt 2026-09-22 ("ánh xạ theo tầng, còn đâu theo đề xuất") |
| Cập nhật     | 2026-09-22                                                                                              |

## 1. Vấn đề và bằng chứng

1. **Map BOQ ↔ task thủ công từng task.** `BoqDetailModal` (`app/boq/page.tsx`) chỉ có ô tìm
   `/api/search?q=` rồi thêm từng task. Dòng BOQ "Ống gió tầng 5–12" cần thêm hàng chục task ⇒
   độ phủ thấp, M122 PR3/PR4 kẹt ở cổng độ phủ.
   **Lưu ý đã xác nhận:** `tasks.boq_code` và `boq_items.code` KHÔNG BAO GIỜ trùng nhau (registry
   `boq_codes` cấm xuyên bảng, xem chú thích trong `lib/khoi-luong/boq-coverage.ts`), nên không có
   cách "map tự động theo mã". Đường đúng: chọn **tầng** (`work_packages.floor_label`) trong các
   sheet **cùng hệ** với dòng BOQ (`boq_items.system_id = sheet_types.system_id`), xếp task theo
   độ giống tên để người dùng tick nhanh.
2. **Trang `/boq` (1407 dòng) không có tìm/lọc/sắp xếp/xuất Excel**; chỉ nhóm theo hệ + collapse.
3. **`boq_items` không có lịch sử**: `qty_contract`/`unit_price` đổi im lặng trong khi số này chảy
   vào gợi ý IPC (`lib/tai-chinh/paymentcerts.ts`).
4. **Lưới tracking** chỉ lọc ở cấp nhóm (mã/tên/BOQ, tầng, trạng thái nhóm) và không ghi vào URL;
   không lọc được task bên trong nhóm.
5. **Dán từ Excel vào vùng tick** là non-goal của M121; `parseTSV` (`lib/tien-do/grid.ts`) đã có.
6. Nợ kỹ thuật đã xác nhận (audit 2026-09-22): `addNorm` (`app/boq/page.tsx:~1242`) không
   try/catch, kẹt `saving`; `lib/vat-tu/material-sync.ts:449` `boqTakenBy(boqCode, 1)` hard-code
   org 1; 14 chỗ `text-zinc-600` trong `TrackingGrid.tsx`.

## 2. Scope / non-goals

**Scope:** 6 việc ở §16. **Non-goals:** cột `qty` trên ô dimension (R1, chờ số độ phủ thật);
virtualization lưới (chờ đo); đổi `PUT /api/boq/:id/map` (giữ nguyên hợp đồng); đổi
`recompute.ts`; đổi lớp tài chính.

## 9–11. Kiến trúc, API, DDL — theo từng việc

### Việc 1 — Map theo tầng (`lib/khoi-luong/boq-map-tang.ts` + `GET /api/boq/:id/tasks-theo-tang`)

- `lib/nen/van-ban.ts` (mới, thuần): `boDauThuong(s)` (NFD, bỏ dấu, hạ chữ, `đ→d`, gộp khoảng
  trắng) và `diemGiongTen(a, b): number` = Jaccard trên tập token (bỏ token ≤1 ký tự). Nếu repo
  đã có hàm bỏ dấu tương đương trong `lib/nen/`, tái dùng thay vì viết mới.
- `lib/khoi-luong/boq-map-tang.ts`:
  ```ts
  export type TaskTheoTang = {
    id: number;
    code: string;
    name: string;
    sheetName: string;
    pkgCode: string;
    pkgName: string;
    progressPercent: number;
    daMapDongKhac: boolean;
    diemGiong: number;
  };
  export async function cacTangCuaHe(projectId: number, systemId: number | null): Promise<string[]>;
  export async function taskTheoTang(opts: {
    projectId: number;
    systemId: number | null;
    floorLabel: string;
    tenDongBoq: string;
  }): Promise<TaskTheoTang[]>;
  ```
  - `cacTangCuaHe`: `SELECT DISTINCT wp.floor_label FROM work_packages wp JOIN sheet_types st … JOIN towers tw …
WHERE tw.project_id=? AND wp.floor_label IS NOT NULL AND (? IS NULL OR st.system_id = ?)`, sắp bằng
    `sortFloorsDesc` (`lib/tien-do/floors.ts`). `systemId` null ⇒ mọi hệ.
  - `taskTheoTang`: task của các nhóm `floor_label = ?` cùng điều kiện hệ, kèm
    `daMapDongKhac = EXISTS(boq_task_map m WHERE m.task_id=t.id)`; bọc `withProjectScope`.
    Sắp theo `diemGiong` giảm dần rồi `sheetName, pkgCode, code`.
- Route `app/api/boq/[id]/tasks-theo-tang/route.ts` — `GET ?floor=<label>` (thiếu `floor` ⇒ chỉ trả
  `{ floors }`). Auth: `getCurrentUser` 401; `CAN.editStructure` 403; `getCurrentProjectId` +
  `assertModuleEnabled("materials")` + `SELECT id, name, system_id FROM boq_items WHERE id=? AND project_id=?`
  404 — bám đúng mẫu `app/api/boq/[id]/map/route.ts`. Trả `{ floors: string[], tasks: TaskTheoTang[] }`.
  `export const dynamic = "force-dynamic"`.
- UI (`BoqDetailModal`, sau khi tách ra `app/boq/_components/BoqDetailModal.tsx` ở Việc 2 — Việc 1 làm
  TRƯỚC nên sửa trực tiếp trong `app/boq/page.tsx`, Việc 2 tách sau): nút **"Thêm theo tầng"** cạnh
  "Chia đều" ⇒ panel: `<select>` tầng (từ `floors`, có `aria-label="Chọn tầng"`), danh sách task có
  checkbox; mặc định **tick sẵn** task có `diemGiong ≥ 0.5` và chưa `daMapDongKhac`; task
  `daMapDongKhac` hiện chip "đã map dòng khác" (vẫn cho tick); task đã có trong `mapEntries` bị disable
  - chip "đã có". Nút "Thêm N task" ⇒ thêm vào `mapEntries` với `weight = 1`, rồi tự gọi `splitEvenly()`
    (chia đều toàn bộ map). Lưu vẫn qua nút "Lưu map" hiện có (không đổi `PUT`). Trạng thái rỗng: "Tầng
    này chưa có task cùng hệ". Lỗi mạng: thông điệp + nút thử lại, không kẹt.
- AC: (1) GET không login 401; engineer 403; dòng BOQ dự án khác 404. (2) Dòng BOQ hệ A, tầng "5F" có
  2 nhóm hệ A và 1 nhóm hệ B ⇒ chỉ trả task hệ A; `systemId` null ⇒ cả hai. (3) Task đã map dòng BOQ
  khác có `daMapDongKhac=true`. (4) `diemGiongTen("Ống gió tầng 5","Lắp ống gió T5") > diemGiongTen("Ống gió tầng 5","Cáp điện")`.
  (5) `floors` sắp giảm dần theo `sortFloorsDesc`. Test: `tests/boq-map-tang.test.ts` (unit thuần cho
  `van-ban` + tích hợp `{skip:!HAS_TEST_DB}` dựng project/tower/systems/sheet_types/work_packages/tasks
  như `tests/boq-coverage.test.ts`; route qua `tests/helpers/phien.ts` `dangNhapDuAn`).

### Việc 2 — Trang `/boq`: tìm/lọc/sắp xếp/xuất Excel + tách component

- Tách `app/boq/page.tsx` thành `app/boq/_components/{AddBoqModal,ImportBoqModal,BoqDetailModal,NormsSection}.tsx`
  (giữ nguyên hành vi, copy nguyên khối; types dùng chung sang `app/boq/_components/types.ts`).
- Thanh công cụ trên bảng (dùng `app/components/ui`): ô tìm (mã/tên, không dấu — dùng `boDauThuong`),
  select lọc: "Tất cả · Chưa map · Σ tỷ trọng lệch" (Σ lệch = `|Σweight−1| > NGUONG_LECH_WEIGHT`, tính
  client từ `item.map`), select sắp xếp: "Thứ tự BOQ · Giá trị HĐ ↓ · % thực hiện ↓". Lọc/sắp làm
  **client-side** trên `items` đã tải (API GET không đổi). Ghi `?q=&loc=&sap=` vào URL (`replaceState`).
- Xuất: `GET /api/boq/export` (mới, auth 401; `PAYMENT_VIEW_ROLES` mới thấy cột tiền — vai trò khác vẫn
  tải được nhưng cột đơn giá/thành tiền để trống) ⇒ `.xlsx` bằng `exceljs` như
  `app/api/export/excel/route.ts`, 1 sheet `BOQ`, cột: Mã BOQ · Hệ · Mô tả · ĐVT · KL HĐ · Đơn giá ·
  Thành tiền · KL thực hiện · % thực hiện · Số task map · Σ tỷ trọng. Thành tiền tính **trong SQL**
  (`::text`) theo quy ước M45. Tên file `BOQ-<tên dự án>-<YYYY-MM-DD>.xlsx` (tên dự án từ DB).
  Nút "Xuất Excel" cạnh "Tải mẫu".
- AC: tìm "ong gio" thấy "Ống gió"; lọc "Chưa map" chỉ còn dòng `map.length===0`; export 401 khi chưa
  login; viewer export có cột tiền rỗng; typecheck/lint xanh; e2e `e2e/authed/boq.spec.ts` hiện có
  vẫn xanh. Test: `tests/route-boq-export.test.ts`.

### Việc 3 — Lịch sử dòng BOQ (`boq_item_history`)

- `migrations/0154_boq_item_history.sql` (thêm thuần):
  ```sql
  CREATE TABLE IF NOT EXISTS boq_item_history (
    id SERIAL PRIMARY KEY,
    boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
    field TEXT NOT NULL,            -- 'code'|'name'|'unit'|'system_id'|'qty_contract'|'unit_price'|'qty_sub'|'sub_unit_price'|'note'|'import'
    old_value TEXT, new_value TEXT, -- NUMERIC ghi ::text (M45), null khi tạo
    changed_by INTEGER REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_boq_item_history_item ON boq_item_history(boq_item_id, changed_at DESC);
  ```
- `lib/khoi-luong/boq-history.ts`: `ghiLichSuBoq(boqItemId, thayDoi:{field,oldValue,newValue}[], userId)`
  (1 INSERT nhiều VALUES; mảng rỗng ⇒ no-op) và `lichSuBoq(boqItemId, limit=100)` (join `users.name`).
- Điểm ghi: `PATCH /api/boq/:id` — SELECT dòng cũ trước UPDATE, chỉ ghi field thật sự đổi (so chuỗi sau
  `::text`); `commitBoqImport` (`lib/khoi-luong/boq-import.ts`) — dòng cập nhật ghi từng field đổi,
  dòng thêm mới ghi 1 dòng `field='import'`, `new_value = code`. Cả hai trong cùng transaction với UPDATE.
- `GET /api/boq/:id/history` (auth 401, dự án 404, mọi vai trò xem được BOQ đều xem được) ⇒
  `{ rows:[{field,oldValue,newValue,changedBy,changedByName,changedAt}] }`.
- UI: mục "Lịch sử thay đổi" cuối `BoqDetailModal` (tải khi mở, nhãn field tiếng Việt, tối đa 100 dòng).
- AC: PATCH đổi `qtyContract` 10→12 sinh đúng 1 dòng (`old='10.000'`-tương-đương số, `new` tương đương 12);
  PATCH gửi lại giá trị cũ ⇒ 0 dòng (idempotent); import commit cập nhật 1 dòng đổi `unit_price` ⇒ 1 dòng
  lịch sử; xoá dòng BOQ ⇒ lịch sử cascade. Test: `tests/boq-history.test.ts`.

### Việc 4 — Lưới tracking: lọc cấp task + URL

- `app/tracking/[sheet]/page.tsx`: bộ lọc hiện có (`query`, `floorFilter`, `statusFilter`) ghi/đọc URL
  `?q=&floor=&status=` (giữ tương thích `?floor=`), dùng `replaceState`, không reload.
- Thêm select "Task: Tất cả · Trễ · Chưa bắt đầu · Đang thi công · Chờ nghiệm thu(=hoan_thanh) · Đã nghiệm thu"
  (`?task=`) — lọc `p.tasks` theo `status` (slug `lib/tien-do/status.ts`): nhóm nào không còn task khớp thì
  ẩn nhóm; nhóm còn ⇒ tự `expanded`. Truyền `taskFilter` xuống `TrackingGrid` để ẩn hàng task không khớp
  trong `grid.tasks` (không đổi API, không đổi `useTickVung` — vùng chọn tính trên danh sách đã lọc:
  nếu điều đó phức tạp thì **tắt chọn vùng khi đang lọc task** và hiện chú thích, ghi rõ trong PR).
- AC: `?task=tre` chỉ hiện nhóm có task trễ và chỉ hàng trễ; xoá lọc ⇒ đủ hàng; e2e `tracking.spec.ts` xanh;
  unit test thuần cho hàm lọc `locNhomTheoTask(packages, taskFilter)` đặt ở `app/tracking/[sheet]/locTask.ts`
  (test `tests/tracking-loc-task.test.ts`).

### Việc 5 — Dán từ Excel vào vùng tick

- Trong `useTickVung`/`TrackingGrid`: khi có vùng chọn và `editMode`, bắt `paste` trên `window` (chỉ khi
  focus không nằm trong input/textarea): `parseTSV(clipboard text)`; ô nguồn "x"/"X"/"1"/"true" ⇒ tick,
  ""/"0"/"○"/"o"/"false" ⇒ bỏ tick, giá trị khác ⇒ bỏ qua ô. Lát ma trận từ góc trên-trái vùng chọn
  bằng `spreadPaste`; giới hạn trong cùng nhóm (D2 M121) và `MAX_O_MOI_LO`. Gom thành 2 lô
  (tick/bỏ tick) qua `ghiThaoTacLo` sẵn có ⇒ hoàn tác được; thông báo "Đã dán N ô (M bỏ qua)".
  Ngược lại Ctrl+C trên vùng chọn ⇒ `serializeTSV` ma trận "x"/"" vào clipboard.
- Hàm thuần `doiOSangTick(raw): boolean|null` + `dungLoTuDan(matrix, vung, grid)` trong
  `app/tracking/[sheet]/dan.ts`, test `tests/tracking-dan.test.ts`.
- AC: dán ma trận 2×3 vào vùng 1 ô ⇒ 6 ô đổi; ô "?" bị bỏ qua; Ctrl+Z hoàn tác cả lần dán.

### Việc 6 — Nợ kỹ thuật (mechanical)

- `addNorm` (`NormsSection`): bọc try/catch/finally, mất mạng ⇒ toast "Mất kết nối…", `saving` reset.
- `lib/vat-tu/material-sync.ts:449`: `boqTakenBy(boqCode, orgId)` — `orgId` lấy từ tham số/ngữ cảnh
  hàm đang chạy (truy ngược chữ ký `runMaterialSync`; nếu chưa có thì thêm tham số `orgId` bắt buộc và
  sửa 2 điểm gọi: `POST /api/materials/sync`, `GET /api/cron/sync-sheets` — cron dùng org của dự án).
- 14 `text-zinc-600` trong `TrackingGrid.tsx` ⇒ `text-zinc-500` (giữ hover). Kiểm `npm run check:contrast`.
- Kiểm tra `useTrackingData` SSE **đã** tự thử lại (`SSE_RETRY_MS`) — không sửa, chỉ ghi nhận.

## 15. Cổng chung

`npm run lint` · `npm run typecheck` · file test của việc · `npm run check:lib-layers` (việc 1, 3 thêm
module lib) · `npm run build` trước khi mở PR. Test chạm DB import `tests/setup.ts` đầu tiên.

## 16. Thứ tự PR

1 (map theo tầng) → 2 (trang BOQ + tách component) → 3 (lịch sử) → 4 (lọc tracking) → 5 (dán) → 6 (nợ)
— 4/5/6 độc lập file với 1/2/3 nên chạy song song được; 2 phải sau 1 (cùng file `page.tsx`); 3 sau 2
(sửa `BoqDetailModal.tsx` đã tách).

## 18. Quyết định đã chốt

- D1 Ánh xạ theo **tầng** (không theo nhóm) — người dùng 2026-09-22.
- D2 Không map tự động theo mã (bất khả thi, §1).
- D3 Tỷ trọng sau khi thêm theo tầng = chia đều toàn bộ map; PM sửa tay sau.
