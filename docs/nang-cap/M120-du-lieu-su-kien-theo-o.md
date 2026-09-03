# M120 — Dữ liệu sự kiện theo ô tick & ngày thực tế của task

| Thuộc tính       | Giá trị                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Giai đoạn 1 của lộ trình cải thiện kế hoạch/tiến độ/tracking (rà soát 2026-09-02). Giai đoạn 0 đã xong ở PR #458. |
| Spec owner       | Phiên chính (opusplan)                                                                                            |
| State            | **Approved for implementation**                                                                                   |
| Người/ngày duyệt | Người dùng · 2026-09-03 (chốt D1/D2/R1 theo đề xuất, xem §18)                                                     |
| Cập nhật         | 2026-09-03                                                                                                        |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

Lưới tracking ghi nhận tiến độ bằng ô checkbox (`progress_dimensions.installed` 0/1), nhưng
**không lưu bất kỳ dấu vết nào về sự kiện tick**: ai tick, tick lúc nào, tick vì lý do gì.
Bảng chỉ có `updated_at` — bị ghi đè mỗi lần toggle, nên không phân biệt được "ô tick hôm qua
rồi không đụng tới" với "ô vừa bị bỏ tick 5 phút trước".

Bằng chứng hiện trạng (đọc code 2026-09-02):

- `migrations/0001_baseline.sql:79-87` — `progress_dimensions(id, task_id, dimension_label,
installed, value, sort_order, updated_at)`. Không có `installed_at`/`installed_by`/`note`.
- Cột `value DOUBLE PRECISION` là **cột chết**: mọi đường ghi đều set `value = installed`
  (`app/api/dimensions/[id]/route.ts`, `app/api/dimensions/batch/route.ts`,
  `lib/tien-do/system-upload.ts:368`), không đường nào ĐỌC nó.
- `tasks` (`0001_baseline.sql:59-77`) chỉ có `start_date`/`end_date` = ngày **kế hoạch**.
  Grep toàn `migrations/` + `lib/`: **không có `actual_start`/`actual_end`** ở bất kỳ bảng nào.
- `task_history` chỉ ghi % tổng của task, không ghi ô nào đổi (`lib/tien-do/recompute.ts:84-96`).

Pain point theo vai trò:

| Vai trò           | Không làm được hôm nay                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM / BCH          | Hỏi "ô CH-05 tầng 12 được tick ngày nào, ai tick" — không có câu trả lời. Tranh chấp nghiệm thu/khối lượng với thầu phụ không có bằng chứng thời điểm.                                        |
| PM                | Không đo được **thời gian thi công thực tế** (bắt đầu thật → xong thật) vs kế hoạch. SPI hiện dựa hoàn toàn vào % tại thời điểm, không có ngày thực tế nào để so với `start_date`/`end_date`. |
| Kỹ sư hiện trường | Tick nhầm ô của người khác không ai biết; không ghi được ghi chú tại ô ("chờ vật tư", "ống bị lệch cao độ") — phải viết vào `tasks.note` chung cho cả task 200 ô.                             |
| Admin             | Không truy vết được thao tác tick khi cần điều tra số liệu bất thường (chỉ có `task_history` mức task, thiếu mức ô).                                                                          |

Hệ quả downstream: `reconstructProgressAtDate` (`lib/tien-do/report.ts`) dựng lại % quá khứ từ
`task_history`; mọi phân tích năng suất/dự báo (OS-3 delay risk) đều cần **nhãn kết quả có mốc
thời gian thực** mà hệ chưa có — đây là lý do OS-3 bị khoá bởi gate "chưa đủ dữ liệu".

## 2. Outcome, metric và guardrail

**Outcome:** mỗi ô tick mang đủ 3 dữ kiện _ai / lúc nào / ghi chú_, và mỗi task có **ngày bắt
đầu thực tế + ngày kết thúc thực tế** suy tự động từ chuỗi tick, không cần ai nhập tay.

| Metric                                    | Baseline | Target sau M120                                                |
| ----------------------------------------- | -------- | -------------------------------------------------------------- |
| Ô tick có `installed_by` + `installed_at` | 0%       | 100% ô tick MỚI (ô cũ giữ NULL — không backfill được, xem §11) |
| Task đã 100% có `actual_end_date`         | 0%       | 100% task đạt 100% SAU khi triển khai                          |
| Độ trễ thêm của 1 lần tick (p95)          | —        | ≤ +15ms so với hiện tại (chỉ thêm 2-3 cột vào `UPDATE` đã có)  |

**Guardrail (dừng/rollback nếu vi phạm):**

- Tick đơn / batch không được chậm thêm quá 50ms p95 → nếu vượt, revert.
- Không đổi bất kỳ con số `progress_percent` / `work_packages.progress` nào đang có: M120 chỉ
  **thêm dữ liệu sự kiện**, không đụng công thức % (xem §5 non-goals).
- Migration phải thuần thêm (`ADD COLUMN`/`CREATE INDEX`) → đi thẳng production theo
  `CLAUDE.md`; không `UPDATE`/backfill dữ liệu hiện có.

## 3. Nghiên cứu hiện trạng

**4 đường ghi `progress_dimensions.installed`** (mọi đường đều phải gắn dữ liệu sự kiện):

| #   | Điểm ghi                                                      | Ngữ cảnh                                                                                                               |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | `app/api/dimensions/[id]/route.ts` (`PATCH`)                  | Tick 1 ô từ lưới; cũng là điểm đến của hàng đợi offline (`opEndpoint`, `app/components/offlineQueue/logic.ts:117-126`) |
| 2   | `app/api/dimensions/batch/route.ts` (`PATCH`, `MAX_IDS=1000`) | Tick vùng chọn — **hiện chưa có consumer UI** (Giai đoạn 2 sẽ nối)                                                     |
| 3   | `lib/tien-do/import.ts:579-600`                               | Import Excel gốc: `DELETE` toàn bộ dimension của task rồi `INSERT` lại                                                 |
| 4   | `lib/tien-do/system-upload.ts:345-370`                        | M64 upload tracking theo hệ: `UPDATE ... SET installed = ?, value = ?` theo ô khớp nhãn                                |

**Điểm tạo dimension mới** (`installed = 0`, không phải sự kiện tick):
`app/api/workpackages/[id]/dimensions/column/route.ts` (`POST` thêm cột, `PATCH` copy cột).

**Điểm đọc dimension:**

- `app/api/workpackages/[id]/dimensions/route.ts:56-60` —
  `SELECT pd.id, pd.task_id AS "taskId", pd.dimension_label AS label, pd.installed ... ORDER BY pd.sort_order, pd.id`
- `app/api/tasks/[id]/dimensions/route.ts:28-29` —
  `SELECT id, dimension_label AS label, installed, value ... ORDER BY id`

**Chuỗi tính %:** `lib/tien-do/recompute.ts` — `recomputeTask` (FOR UPDATE, đếm
`installed = 1` / tổng, `progressFromChecks` ghim trần 0.99) → `deriveStatus` →
`recomputePackage`. Đây là nơi duy nhất biết "% vừa đổi từ bao nhiêu sang bao nhiêu" nên là
chỗ đúng để suy ngày thực tế.

**Quyền & scope:** tick gate bởi `CAN.editProgress` + `canTouchTask` (subcon chỉ task được
giao) + hold-point M3/M8 (`handoverBlocked`/`methodStatementBlocked`) — M120 **không đụng** lớp
này. `progress_dimensions` không có `project_id`, scope suy qua `task → work_package →
sheet_type → tower → project`.

**Offline (PWA):** `TickPayload = { dimId, installed }` (`logic.ts:10`); op mang `queuedAt`
(client clock) nhưng **không gửi lên server** (`index.ts:38-43` chỉ gửi `{ installed }`).

**Audit sẵn có:** trigger generic `audit_row_change()` (`migrations/0049`) — hiện KHÔNG gắn
trên `progress_dimensions` (kiểm bằng grep `0049`, `0147`).

## 4. Phương án

| Phương án                                                                                                         | Lợi ích                                                                                                         | Chi phí/rủi ro                                                                                                                                       | Kết luận                                                     |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Không làm**                                                                                                     | 0 rủi ro                                                                                                        | Vĩnh viễn không trả lời được "ai tick, lúc nào"; khoá cứng mọi phân tích năng suất và OS-3                                                           | Bác                                                          |
| **A. Thêm cột trên `progress_dimensions`** (`installed_at`, `installed_by`, `note`) + suy `actual_*` trên `tasks` | Rẻ nhất; 1 migration thuần thêm; không đổi công thức %; đọc trong cùng câu SELECT sẵn có (không thêm JOIN nặng) | Chỉ giữ được **trạng thái hiện tại** của ô (bỏ tick → mất mốc cũ), không có lịch sử đầy đủ từng lần tick                                             | **Chọn**                                                     |
| **B. Bảng sự kiện riêng `dimension_events`** (append-only, mỗi tick 1 dòng)                                       | Lịch sử đầy đủ, không mất khi bỏ tick; nền cho phân tích năng suất sâu                                          | Bảng lớn nhanh (200 ô × N task × mỗi lần toggle); phải thêm retention; đọc lưới cần JOIN/aggregate → chạm đúng đường nóng nhất của app; scope gấp ~3 | Hoãn — mở lại khi có nhu cầu thật về lịch sử từng lần toggle |
| **C. Gắn trigger `audit_row_change()` (0049) lên `progress_dimensions`**                                          | Gần như 0 dòng code                                                                                             | Ghi audit cho MỌI thay đổi kể cả `sort_order` khi thêm cột → phình bảng audit; không phục vụ được UI (không đọc ra để hiện tooltip được)             | Bác                                                          |

**Lý do chọn A:** phần lớn giá trị nghiệp vụ nằm ở "ô này ai tick, ngày nào" (trạng thái hiện
tại), không phải ở "ô này từng bị toggle 7 lần". Bỏ tick là thao tác sửa sai hiếm; khi đó mốc
cũ mất là chấp nhận được, và mức task vẫn còn `task_history`. Phương án B có thể chồng lên A
sau này mà không phải sửa A (cột vẫn đúng nghĩa "lần tick hiện hành").

## 5. Scope / non-goals

**Trong scope:**

1. 3 cột mới trên `progress_dimensions`: `installed_at`, `installed_by`, `note`.
2. 2 cột mới trên `tasks`: `actual_start_date`, `actual_end_date` — suy **tự động**, không nhập tay.
3. Gắn dữ liệu sự kiện ở cả 4 đường ghi (§3).
4. Trả các trường mới trong 2 route GET dimension + route GET task.
5. Hiển thị tối thiểu: tooltip trên ô lưới ("Tick bởi X · 02/09/2026"), 2 ngày thực tế trong
   modal sửa ngày task. **Không** dựng UI mới.

**Non-goals (nói rõ để không bị nhặt thêm khi code):**

- ❌ **Không tạo cột `qty`** (khối lượng theo ô) — quyết định R1 (§18, chốt 2026-09-03). `qty`
  chỉ có nghĩa khi đi kèm đổi công thức % sang trọng số khối lượng = Giai đoạn 3 (hợp nhất 4
  cách tính "% kế hoạch"); tạo cột trước sẽ thành cột chết thứ hai bên cạnh `value`.
- ❌ **Không đổi công thức %** — M120 không đụng `progressFromChecks`/`recomputePackage`.
- ❌ Không backfill `installed_at`/`installed_by` cho ô đã tick trước đây (không có nguồn dữ liệu).
- ❌ Không sửa `value` (cột chết) — giữ nguyên hành vi, đánh dấu deprecated trong comment migration.
- ❌ Không lưu **thời điểm tick thật khi offline** (dùng giờ server lúc đồng bộ — xem §18 R2).
- ❌ Không có ảnh theo ô, không có undo/redo, không chọn vùng — đó là Giai đoạn 2.
- ❌ Không đụng `lib/tien-do/report.ts`, S-curve, EVM, dashboard (ngày thực tế chưa được tiêu thụ
  ở đâu trong M120 — chỉ lưu và hiện; dùng để tính SPI thực là việc sau).

## 6. User journeys và mọi trạng thái

**J1 — Kỹ sư tick 1 ô (happy, desktop + mobile):** tick → optimistic UI như hiện tại → server
ghi `installed=1, installed_at=NOW(), installed_by=<user.id>` → recompute → nếu đây là ô đầu
tiên của task thì `tasks.actual_start_date = hôm nay`. Rê chuột/chạm giữ lên ô đã tick → tooltip
"Nguyễn Văn A · 02/09/2026". Ô chưa tick: không tooltip.

**J2 — Tick nốt ô cuối:** task đạt 100% → `actual_end_date = hôm nay`. Modal sửa ngày task hiện
thêm dòng "Thực tế: 12/08/2026 → 02/09/2026" cạnh ngày kế hoạch.

**J3 — Bỏ tick để sửa sai:** `installed=0` → `installed_at`, `installed_by`, `note` về `NULL`
(ô không còn ở trạng thái đã lắp thì không giữ mốc lắp). Task tụt dưới 100% → `actual_end_date`
về `NULL`. `actual_start_date` **giữ nguyên** (công việc đã từng bắt đầu — xem §18 D1).

**J4 — Ghi chú tại ô:** kỹ sư mở tooltip → nhập ghi chú ≤ 500 ký tự → `PATCH` với `note`.
Ghi chú chỉ tồn tại khi ô đang tick (bỏ tick là xoá theo J3).

**J5 — Offline:** tick lúc mất sóng → xếp hàng đợi như hiện tại → khi có mạng, gửi lên và
`installed_at` = **giờ server lúc đồng bộ** (không phải giờ tick thật). UI hiện badge hàng đợi
như cũ; tooltip sau khi đồng bộ hiện giờ đồng bộ. Đây là hạn chế đã biết, ghi rõ trong tooltip
help của badge offline.

**J6 — Import Excel / upload tracking theo hệ (M64):** ô được set `installed=1` qua import ghi
`installed_by = người chạy import`, `installed_at = NOW()`, `note = NULL`. Task đạt 100% qua
import cũng nhận `actual_end_date`.

**Trạng thái khác:** loading (Skeleton như hiện tại, không đổi) · empty (task chưa có ô: không
đổi) · unauthorized (403 `canTouchTask`, không đổi) · conflict (hold-point 409, không đổi) ·
error (toast + rollback optimistic, không đổi).

## 7. Functional và non-functional requirements

**FR1** — `PATCH /api/dimensions/:id` khi `installed=true`: ghi `installed_at = NOW()`,
`installed_by = user.id`; khi `installed=false`: set cả hai + `note` về `NULL`.
`installed_at`/`installed_by` **luôn do server quyết định**, không nhận từ body (chống giả mạo).

**FR2** — `PATCH /api/dimensions/batch` áp cùng quy tắc FR1 cho toàn lô, trong cùng transaction.

**FR3** — `PATCH /api/dimensions/:id` nhận thêm `note?: string | null` (≤500 ký tự, trim, rỗng →
`NULL`). Chỉ chấp nhận khi `installed=true` hoặc ô đang tick; gửi `note` kèm `installed=false` →
`note` vẫn bị xoá về `NULL` (J3 thắng).

**FR4** — Import Excel (`lib/tien-do/import.ts`) và upload tracking (`lib/tien-do/system-upload.ts`)
ghi `installed_at`/`installed_by` cho ô được đánh dấu đã lắp, `NULL` cho ô chưa lắp.

**FR5** — `recomputeTask` sau khi ghi `progress_percent` mới, cập nhật ngày thực tế trong **cùng
transaction** theo đúng 3 luật:

- `newProgress > 0` và `actual_start_date IS NULL` → `= CURRENT_DATE`.
- `newProgress >= 1` và `actual_end_date IS NULL` → `= CURRENT_DATE`.
- `newProgress < 1` và `actual_end_date IS NOT NULL` → `= NULL`.
- `actual_start_date` một khi đã đặt thì **không bao giờ tự xoá** (kể cả progress về 0).

**FR6** — `PATCH /api/tasks/:id/progress` (đường nhập % thủ công, không qua ô) áp **cùng FR5**
qua hàm dùng chung — hai đường ghi % không được cho ra 2 kết quả ngày thực tế khác nhau.

**FR7** — `GET /api/workpackages/:id/dimensions` và `GET /api/tasks/:id/dimensions` trả thêm
`installedAt`, `installedBy` (id), `installedByName` (JOIN `users.name`), `note`.

**FR8** — `GET /api/tasks/:id` (và câu SELECT task trong route PATCH) trả thêm
`actualStartDate`, `actualEndDate`.

**FR9** — Lưới tracking hiện tooltip trên ô đã tick: `"<tên người> · <dd/MM/yyyy>"`; thiếu dữ
liệu (ô cũ) → `"Không rõ người tick"`. Modal sửa ngày task hiện 2 ngày thực tế (chỉ đọc).

**NFR1 (performance)** — Không thêm round-trip DB nào: dữ liệu sự kiện ghi trong chính câu
`UPDATE` đã có; ngày thực tế ghi trong chính transaction của `recomputeTask` bằng 1 câu `UPDATE`
có điều kiện (chỉ chạy khi thực sự cần đổi). GET dimension thêm 1 `LEFT JOIN users` — phải giữ
`idx_dims_task` là đường truy cập chính.

**NFR2 (backward compatibility)** — Mọi cột mới `NULL`-able, không `DEFAULT` sinh dữ liệu giả.
Client cũ (SW cache) không gửi `note` vẫn chạy đúng.

**NFR3 (a11y)** — Tooltip phải đọc được bằng bàn phím (focus vào ô) và screen reader
(`aria-describedby`), không chỉ hover. Không dùng màu để truyền tải "có/không có ghi chú" —
kèm icon.

**NFR4 (auditability)** — Bỏ tick xoá `installed_by` là **mất dấu vết có chủ đích** (§4 A).
Bù lại: mức task vẫn ghi `task_history` khi % đổi (đã có sẵn), nên vẫn biết "ai làm % tụt".

**NFR5 (privacy)** — `installed_by` là FK `users(id)`, không lưu tên/email trùng lặp. Không log
tên người tick ra `log.info`.

## 8. Acceptance criteria

| #    | Given / When / Then                                                                                                                                        | Bằng chứng                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| AC1  | Given ô chưa tick · When `PATCH /api/dimensions/:id {installed:true}` · Then `installed_at` ≈ NOW (±5s), `installed_by` = id người gọi                     | Integration test (Postgres)      |
| AC2  | Given ô đang tick có `note` · When `PATCH {installed:false}` · Then cả `installed_at`, `installed_by`, `note` = NULL                                       | Integration test                 |
| AC3  | Given body chứa `installedBy: 999` · When PATCH · Then giá trị bị **bỏ qua**, ghi đúng id phiên                                                            | Integration test (chống giả mạo) |
| AC4  | Given task 3 ô, 0 ô tick, `actual_start_date IS NULL` · When tick 1 ô · Then `actual_start_date = CURRENT_DATE`, `actual_end_date IS NULL`                 | Integration test                 |
| AC5  | Given task 3 ô đã tick đủ · When tick nốt ô cuối · Then `actual_end_date = CURRENT_DATE`                                                                   | Integration test                 |
| AC6  | Given task 100% có `actual_end_date` · When bỏ tick 1 ô · Then `actual_end_date IS NULL` **và** `actual_start_date` giữ nguyên                             | Integration test                 |
| AC7  | Given task không có ô nào · When `PATCH /api/tasks/:id/progress {progress:1}` · Then `actual_end_date = CURRENT_DATE` (FR6 — cùng luật)                    | Integration test                 |
| AC8  | Given lô 500 ô của 3 task · When `PATCH /api/dimensions/batch` · Then cả 500 ô có `installed_at`/`installed_by`, 3 task được recompute đúng 1 lần mỗi task | Integration test                 |
| AC9  | Given ô đã tick bởi user A · When mở lưới tracking · Then tooltip hiện tên A + ngày dd/MM/yyyy; ô cũ (NULL) hiện "Không rõ người tick"                     | E2E desktop + mobile             |
| AC10 | Given migration đã chạy · When `npm run check:migrations` + `npm run gen:erd` · Then số migration không trùng, ERD khớp schema                             | CI                               |
| AC11 | Given toàn bộ test cũ · When `npm test -- --release-gate` · Then **không ca nào đổi kết quả** (không con số % nào đổi)                                     | CI                               |
| AC12 | Given ô tick với `note` 501 ký tự · When PATCH · Then 422 + thông điệp tiếng Việt rõ                                                                       | Integration test                 |

## 9. Kiến trúc và điểm chạm code

```
Lưới tracking (TrackingGrid.tsx)
  └─ PATCH /api/dimensions/:id  ──┐
  └─ PATCH /api/dimensions/batch ─┤
Import Excel (lib/tien-do/import.ts) ────┤──> UPDATE progress_dimensions
Upload M64 (lib/tien-do/system-upload.ts)┘     (+ installed_at/by/note)
                                          │
                                          └──> recomputeTask (lib/tien-do/recompute.ts)
                                                 └─ capNhatNgayThucTe()  ← MỚI, cùng transaction
                                                      └─ UPDATE tasks SET actual_start_date/actual_end_date
```

| File                                            | Thay đổi                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/0148_dimension_events.sql`          | **Mới** — 6 cột + 1 index (§11)                                                                                                        |
| `lib/tien-do/recompute.ts`                      | **Mới** hàm `capNhatNgayThucTe(taskId, newProgress)`; gọi trong `recomputeTask` sau khi ghi `progress_percent`, trong cùng transaction |
| `app/api/tasks/[id]/progress/route.ts`          | Gọi `capNhatNgayThucTe` (FR6) trong transaction sẵn có                                                                                 |
| `app/api/dimensions/[id]/route.ts`              | Ghi 3 cột sự kiện; nhận `note`                                                                                                         |
| `app/api/dimensions/batch/route.ts`             | Ghi 3 cột sự kiện cho cả lô                                                                                                            |
| `lib/tien-do/import.ts`                         | Truyền `installed_by` = người chạy import vào `INSERT`                                                                                 |
| `lib/tien-do/system-upload.ts`                  | Như trên cho `UPDATE`                                                                                                                  |
| `app/api/workpackages/[id]/dimensions/route.ts` | `LEFT JOIN users` + trả trường mới                                                                                                     |
| `app/api/tasks/[id]/dimensions/route.ts`        | Như trên                                                                                                                               |
| `app/api/tasks/[id]/route.ts`                   | Trả `actualStartDate`/`actualEndDate` trong SELECT task                                                                                |
| `app/tracking/[sheet]/TrackingGrid.tsx`         | Tooltip ô (a11y theo NFR3) + ô nhập `note`                                                                                             |
| `app/tracking/[sheet]/DateEditModal.tsx`        | Hiện 2 ngày thực tế (chỉ đọc)                                                                                                          |
| `docs/ERD.md`                                   | Sinh lại bằng `npm run gen:erd` (không sửa tay)                                                                                        |

**Không đụng:** `lib/tien-do/status.ts`, `progressFromChecks`, `deriveStatus`, `recomputePackage`,
mọi route tài chính/nghiệm thu, S-curve/EVM/dashboard.

## 10. API contract

### `PATCH /api/dimensions/:id`

```jsonc
// Request (thêm `note`; KHÔNG nhận installedAt/installedBy)
{ "installed": true, "note": "Chờ nghiệm thu áp lực" }
// 200
{ "id": 123, "installed": true, "task": { "progress": 0.5, "status": "dang_thi_cong" } }
```

Lỗi: `400` id sai · `401` chưa đăng nhập · `403` `CAN.editProgress` / `canTouchTask` ·
`404` không có ô · `409` hold-point M3/M8 · `422` `note` > 500 ký tự.

### `PATCH /api/dimensions/batch`

```jsonc
{ "ids": [1, 2, 3], "installed": true } // `note` KHÔNG áp cho batch (ghi chú là việc của từng ô)
```

Giữ nguyên `MAX_IDS = 1000` và mọi mã lỗi hiện có.

### `GET /api/workpackages/:id/dimensions` — thêm trường

```jsonc
{
  "id": 1,
  "taskId": 9,
  "label": "D100",
  "installed": 1,
  "installedAt": "2026-09-02T08:15:00Z",
  "installedBy": 4,
  "installedByName": "Nguyễn Văn A",
  "note": null,
}
```

### `GET /api/tasks/:id` — thêm trường

```jsonc
{ "task": { "...": "...", "actualStartDate": "2026-08-12", "actualEndDate": null } }
```

**RBAC/scope:** không đổi lớp quyền nào. `installedByName` chỉ là tên hiển thị của người dùng
cùng tổ chức (đã nằm trong `users` mà mọi vai trò đều thấy qua `/api/users` hiện hành) → không
lộ thêm thông tin.

**Idempotency:** PATCH cùng giá trị `installed` 2 lần → lần 2 **cập nhật lại** `installed_at`
(ghi đè giờ mới). Chấp nhận: hàng đợi offline dedup theo `dimId` nên không gửi lặp; retry sau
lỗi mạng chỉ làm mốc lệch vài giây.

## 11. Data contract và DDL

`migrations/0148_dimension_events.sql` — **thuần thêm** (`ADD COLUMN` + `CREATE INDEX`), không
`UPDATE`/backfill dòng nào → đi thẳng production theo `CLAUDE.md` (không cần staging).

```sql
-- 0148_dimension_events.sql — M120: dữ liệu sự kiện theo ô tick + ngày thực tế của task.
-- Thuần thêm cột NULL-able + 1 index → không đụng dòng dữ liệu hiện có, không đổi bất kỳ
-- con số progress_percent/work_packages.progress nào (M120 không sửa công thức %).
-- Cột `value DOUBLE PRECISION` (0001) là cột CHẾT từ lâu (mọi đường ghi set = installed, không
-- đường nào đọc) — giữ nguyên, deprecated; KHÔNG đổi nghĩa để tránh làm hỏng dữ liệu cũ.
-- KHÔNG tạo cột `qty` ở đây: quyết định R1 (§18) tách sang Giai đoạn 3, nơi đổi công thức %
-- sang trọng số khối lượng — tạo trước sẽ thành cột chết thứ hai bên cạnh `value`.

ALTER TABLE progress_dimensions ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ;
ALTER TABLE progress_dimensions ADD COLUMN IF NOT EXISTS installed_by INTEGER REFERENCES users(id);
ALTER TABLE progress_dimensions ADD COLUMN IF NOT EXISTS note TEXT;

-- Ngày thực tế của task — SUY TỰ ĐỘNG từ chuỗi tick trong recomputeTask, không nhập tay.
-- Kiểu DATE (không TIMESTAMPTZ) để đồng bộ với start_date/end_date: lib/db parse DATE thành
-- CHUỖI 'YYYY-MM-DD', toàn bộ code so sánh ngày bằng so sánh chuỗi.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- Truy vấn "ai tick gì trong khoảng thời gian" (điều tra số liệu bất thường).
CREATE INDEX IF NOT EXISTS idx_dims_installed_at
  ON progress_dimensions(installed_at DESC) WHERE installed_at IS NOT NULL;
```

**Ràng buộc bất biến** (giữ ở tầng app, không CHECK ở DB vì `installed` có thể đổi trong cùng
transaction với recompute): `installed = 0 ⇒ installed_at IS NULL AND installed_by IS NULL AND
note IS NULL`. Test AC2 khoá bất biến này.

**Verify query sau khi áp migration:**

```sql
-- Phải trả 0 dòng: không ô nào "chưa lắp" mà còn mang dấu vết lắp.
SELECT COUNT(*) FROM progress_dimensions
 WHERE installed = 0 AND (installed_at IS NOT NULL OR installed_by IS NOT NULL OR note IS NOT NULL);
-- Phải trả 0 dòng: không task nào 100% mà thiếu ngày kết thúc thực tế (chỉ đúng với task
-- đạt 100% SAU khi triển khai — task cũ giữ NULL, đây là kỳ vọng, không phải lỗi).
SELECT COUNT(*) FROM tasks WHERE progress_percent >= 1 AND actual_end_date IS NULL
   AND updated_at > '<ngày deploy>';
```

**Ownership/retention:** dữ liệu sự kiện đi theo vòng đời task (xoá task đã `DELETE
progress_dimensions` sẵn ở `app/api/tasks/[id]/route.ts`). Không thêm mục retention mới.

**Recovery:** revert = `ALTER TABLE ... DROP COLUMN` (dữ liệu sự kiện mất, không ảnh hưởng %).
Vì cột chỉ thêm, rollback code mà không rollback migration cũng an toàn.

**Sau migration:** chạy `npm run gen:erd` (ERD tự sinh) + `npm run check:migrations`.

## 12. Security/privacy/abuse

- **Chống giả mạo:** `installed_at`/`installed_by` **chỉ** do server đặt (`NOW()`, `user.id`).
  Body có `installedBy`/`installedAt` bị bỏ qua hoàn toàn — AC3 khoá bằng test.
- **SQL:** mọi câu qua helper `lib/db` placeholder `?`; không nối chuỗi.
- **Validate:** `note` trim + giới hạn 500 ký tự → 422 (không để Postgres từ chối thành 500).
  M120 **không** có cột/trường `qty` (R1 §18) nên không có gì phải validate cho nó.
- **XSS:** `note` render bằng text node React (không `dangerouslySetInnerHTML`) — cùng cách
  `tasks.note` đang làm.
- **Cross-project:** không thêm đường đọc mới nào ngoài phạm vi task người dùng đã có quyền
  (`canTouchTask` giữ nguyên); `installedByName` lấy qua JOIN trong chính câu đã bị giới hạn theo
  package/task.
- **Rate limit:** không thêm — tick vốn đã bị giới hạn bởi `MAX_IDS=1000` và quyền theo task.
- **Log:** không log tên người tick (NFR5).

## 13. UX/a11y/content

- **Tooltip ô** (`TrackingGrid.tsx`): ô đã tick có `title` + `aria-describedby` trỏ tới node ẩn
  chứa `"Tick bởi Nguyễn Văn A · 02/09/2026"`. Ô có `note` thêm icon nhỏ (lucide
  `MessageSquare`, `size=10`) ở góc — **kèm icon, không chỉ đổi màu** (NFR3).
- **Ô cũ thiếu dữ liệu:** `"Đã tick — không rõ người tick (trước 09/2026)"`.
- **Nhập ghi chú:** mở từ tooltip/long-press trên mobile; `textarea` + đếm ký tự còn lại; nút
  theo `app/components/ui/Button` (`rounded-lg`, cao ≥40px), emerald = hành động chính.
- **Modal ngày** (`DateEditModal.tsx`): thêm khối chỉ-đọc "Thực tế" dưới khối "Kế hoạch",
  định dạng `dd/MM/yyyy`, chưa có thì hiện `—`.
- **Theme:** chỉ dùng token có sẵn (`zinc` + accent `-300/-400`), không hex cứng, không biến thể
  `dark:` (ADR-0010).
- **Mobile:** tooltip mở bằng chạm giữ (long-press) vì không có hover; vùng chạm ≥40px.
- **Tiếng Việt:** toàn bộ nhãn/thông báo.

## 14. Observability và vận hành

- Không thêm metric/dashboard mới (M120 không có luồng nền nào).
- `log.error` giữ nguyên ở các route đã có; **không** thêm log chứa tên người dùng.
- Runbook kiểm tra sau deploy: chạy 2 verify query ở §11; tick thử 1 ô trên staging rồi
  `SELECT installed_at, installed_by FROM progress_dimensions WHERE id = ...`.
- Owner: PM dự án (nghiệp vụ) + phiên chính (kỹ thuật).

## 15. Test plan

| Loại                   | Nội dung                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                   | `capNhatNgayThucTe` — bảng chân lý 3 luật FR5 × 4 trạng thái đầu vào (bao gồm ca progress 0→0.5→1→0.5)                                                                                                   |
| Integration (Postgres) | AC1–AC8, AC12 — trong `tests/dimension-events.test.ts` (mới), import `tests/setup.ts` **đầu tiên**                                                                                                       |
| Concurrent             | 2 tick đồng thời trên cùng task: `installed_at` của cả 2 ô đều được ghi, `actual_start_date` chỉ đặt 1 lần (không bị 2 transaction ghi đè lẫn nhau) — tận dụng `FOR UPDATE` sẵn có trong `recomputeTask` |
| Idempotency            | PATCH cùng `installed` 2 lần → không nhân bản `task_history`, `installed_at` cập nhật lại (hành vi đã chốt ở §10)                                                                                        |
| Migration              | `npm run check:migrations`; áp migration 2 lần liên tiếp phải idempotent (`IF NOT EXISTS`)                                                                                                               |
| Hồi quy                | `npm test -- --release-gate` — AC11: **không ca cũ nào đổi kết quả**                                                                                                                                     |
| E2E (Playwright)       | AC9 desktop + mobile + **axe** (tooltip có tên accessible, ô note có icon) trong `e2e/authed/tracking.spec.ts`                                                                                           |
| Offline                | Tick offline → online → ô có `installed_at` = giờ đồng bộ (khoá hành vi đã biết ở §5)                                                                                                                    |
| UAT                    | PM: mở lưới, xác nhận đọc được ai tick ô nào; kỹ sư: ghi chú tại ô trên điện thoại                                                                                                                       |

## 16. Kế hoạch slice/PR

Thứ tự bắt buộc: **schema → ghi → đọc → UI**. Mỗi PR tự đứng được (merge được mà không cần PR sau).

| PR      | Nội dung                                                                                                                                                                  | `route:`     | Cổng                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------- |
| **PR1** | `migrations/0148` + `capNhatNgayThucTe` trong `recompute.ts` + gọi từ `recomputeTask` và `/tasks/:id/progress` + unit test bảng chân lý + integration AC4–AC7 + `gen:erd` | `spec`       | lint/typecheck/test/build; AC11 (không ca cũ đổi) |
| **PR2** | Ghi dữ liệu sự kiện ở cả 4 đường (`dimensions/:id`, `dimensions/batch`, `import.ts`, `system-upload.ts`) + `note` + integration AC1–AC3, AC8, AC12                        | `spec`       | như trên                                          |
| **PR3** | Trả trường mới ở 3 route GET (`LEFT JOIN users`) + cập nhật type client                                                                                                   | `standard`   | như trên                                          |
| **PR4** | UI: tooltip ô + nhập ghi chú + ngày thực tế trong `DateEditModal` + E2E/axe AC9                                                                                           | `standard`   | thêm `npm run test:e2e`                           |
| **PR5** | Cập nhật `PROGRESS.md` + `docs/nang-cap/README.md` (đóng M120)                                                                                                            | `mechanical` | —                                                 |

Ghi chú định tuyến: PR1/PR2 chạm `lib/tien-do/recompute.ts` — **vùng rủi ro cao** theo
`docs/audit.md`, nên dùng `spec` (Opus) chứ không `standard`, và bắt buộc `reviewer` soát diff
trước khi phiên chính duyệt.

## 17. Rollout/rollback

1. **Staging trước? KHÔNG bắt buộc** — migration thuần thêm cột/index, không `UPDATE`, không đổi
   kiểu cột (theo DoD `CLAUDE.md`). Vẫn chạy `npm run db:migrate -- --dry-run` trước.
2. Backup: snapshot DB theo lịch hiện hành, không cần bước riêng (rollback = `DROP COLUMN`).
3. Deploy PR1 → chạy verify query §11 → theo dõi 24h (không có ô nào ghi dữ liệu sự kiện ở bước
   này, chỉ có ngày thực tế bắt đầu chạy).
4. Deploy PR2–PR4 tuần tự, mỗi bước cách nhau ít nhất 1 ngày làm việc để phát hiện lệch số liệu.
5. **Go/no-go:** hủy đợt nếu bất kỳ con số `progress_percent`/`work_packages.progress` nào đổi
   so với trước deploy (query so sánh trước/sau trên 20 task mẫu).
6. **Rollback:** revert PR (code) — cột thừa không gây lỗi; chỉ `DROP COLUMN` nếu cần dọn sạch.
   Không có reconciliation nào cần chạy (dữ liệu mới là bổ sung, không thay thế).

## 18. Risk/assumption/open decisions

| Mục                                                                                 | Xác minh/giảm thiểu                                                                                                                                           | Owner       | Hạn       | Quyết định                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- | ----------------------------- |
| **D1** `actual_start_date` có tự xoá khi progress về 0 không?                       | **KHÔNG xoá** — công việc đã từng bắt đầu là sự thật lịch sử; bỏ tick là sửa sai chứ không phải "chưa từng làm"                                               | Người dùng  | Trước PR1 | ✅ chốt 2026-09-03: không xoá |
| **D2** Bỏ tick có xoá `installed_by`/`note` không?                                  | **CÓ xoá** (§4 A) — ô không ở trạng thái đã lắp thì không giữ dấu vết lắp. Cần lịch sử đầy đủ từng lần toggle → phương án B (bảng sự kiện riêng), đợt sau     | Người dùng  | Trước PR2 | ✅ chốt 2026-09-03: có xoá    |
| **R1** `qty` tạo cột nhưng chưa dùng → nguy cơ thành "cột chết thứ hai" như `value` | **TÁCH khỏi M120**: không tạo cột `qty` đợt này. `qty` chỉ có nghĩa khi đi kèm đổi công thức % sang có trọng số (Giai đoạn 3) — tạo trước là cột chết thứ hai | Người dùng  | PR1       | ✅ chốt 2026-09-03: tách ra   |
| **R2** Tick offline mang giờ đồng bộ, không phải giờ tick thật                      | Chấp nhận trong M120 (§5). Nhận `clientTickedAt` là mở đường giả mạo mốc thời gian → chỉ làm khi có nhu cầu thật, kèm cách chống giả mạo                      | Phiên chính | —         | ✅ chốt: dùng giờ server      |
| **R3** Thêm `LEFT JOIN users` vào GET lưới (đường nóng nhất) làm chậm               | Đo trước/sau trên nhóm 200 ô; nếu chậm > 15ms p95 thì bỏ `installedByName` khỏi payload lưới, chỉ trả khi mở tooltip (thêm route lẻ)                          | Phiên chính | PR3       | ⬜                            |
| **A1** Giả định: mọi tick đều đi qua 4 đường ở §3                                   | Đã grep toàn repo 2026-09-02; nếu phát sinh đường thứ 5 khi code → dừng, báo phiên chính                                                                      | —           | —         | —                             |

## 19. Approval

- [x] Product/scope — **D1** không xoá `actual_start_date`; **D2** bỏ tick xoá dấu vết lắp;
      **R1** `qty` TÁCH khỏi M120 (để Giai đoạn 3 quyết cùng công thức % có trọng số)
- [x] UX/a11y
- [x] Architecture/API/data
- [x] Security/RBAC/SoD/audit
- [x] Test/telemetry/rollout/rollback
- [x] Không còn blocking question

**Kết luận:** **Approved for implementation**
**Người/ngày duyệt:** Người dùng · 2026-09-03
