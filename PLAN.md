# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Bối cảnh chung (đọc trước khi dispatch cả 2 việc)

Người dùng yêu cầu thi hành **M58 PR3** (wire ảnh/nhật ký vào khung offline queue) và
**M59** (histogram tài nguyên) — 2 việc **độc lập nhau, không đụng file chung**, chạy
song song trên 2 nhánh/worktree riêng.

Đã kiểm tra trên code thật trước khi lập kế hoạch (LUẬT bắt buộc, xem `docs/nang-cap/README.md`):
- `git fetch origin` xong, `origin/main` = `d851b5e` = HEAD nhánh hiện tại — đồng bộ.
- `enqueuePhoto`/`enqueueDiaryNote` đã tồn tại trong `app/components/offlineQueue/index.ts`
  (M58 PR2, đã merge) nhưng **CHƯA có UI nào gọi tới** (grep xác nhận 0 call site ngoài
  `offlineQueue/`) → đúng M58 PR3 chưa làm.
- Không có schema/lib/route nào cho histogram tài nguyên (`grep -rl "histogram" lib/ app/`
  chỉ trúng file đặc tả) → M59 chưa làm.
- **M59 PR2 KHÔNG nằm trong đợt này** — đặc tả tự ghi rõ "sau PR1 dùng thật ≥1 tuần",
  chưa đủ điều kiện. Chỉ dispatch PR1.

---

## Kế hoạch A: M58 PR3 — Wire ảnh + nhật ký vào khung offline queue

- `route: spec-executor` (đặc tả dưới đây đã đóng kín toàn bộ điểm chạm + quyết định
  thiết kế còn thiếu trong `docs/nang-cap/M58-qr-offline-hien-truong.md` — worker CHỈ
  thi hành đúng, không tự quyết thêm kiến trúc)
- Nhánh: `claude/feat-m58-pr3-wire-offline`
- Đặc tả gốc: `docs/nang-cap/M58-qr-offline-hien-truong.md` mục **PR3** (đọc trước, brief
  dưới đây là bản đã đóng kín + điểm chạm code thật, KHÔNG lặp lại toàn văn đặc tả gốc).

### Phát hiện quan trọng — SỬA đặc tả gốc trước khi thi hành

1. **`sha256` chưa có trên `task_photos`** — đặc tả gốc viết "idempotency ảnh qua hash
   sha256 sẵn có (M43)" nhưng M43 PR3 (`migrations/0050_document_hash.sql`) chỉ thêm cột
   `sha256` cho `task_documents`/`claim_documents`/`vo_documents`/`contract_documents` —
   **KHÔNG có `task_photos`**. Phải thêm migration mới (xem PR3.1 dưới).
2. **`diary_note` trong PR2 là placeholder SAI, PHẢI sửa lại, không giữ nguyên** —
   `PUT /api/diaries/:date` là **full-replace** (xoá-ghi-lại toàn bộ `diary_manpower` +
   `diary_photos`, và các cột `weatherAm/weatherPm/obstacles/safetyNote` không gửi thì
   ghi `NULL`, xem `app/api/diaries/[date]/route.ts` dòng ~95-140). Payload hiện tại của
   `diary_note` trong `logic.ts`/`index.ts` chỉ có `{date, text}` rồi gửi
   `{workDone: op.payload.text}` — nếu dùng nguyên trạng, offline-save sẽ **XOÁ SẠCH**
   thời tiết/nhân lực/ảnh đã nhập trước đó của đúng ngày đó. Đây là lỗi mất dữ liệu thật
   nếu triển khai theo đúng chữ đặc tả gốc — PR3 BẮT BUỘC đổi payload `diary_note` thành
   **toàn bộ body PUT** (xem PR3.3 dưới), không phải chỉ text.

### PR3.1 — Migration + idempotency ảnh

- File mới `migrations/0071_task_photos_hash.sql` (thêm thuần tuý, đi thẳng production
  theo DoD — không đụng dữ liệu hiện có):
  ```sql
  ALTER TABLE task_photos ADD COLUMN IF NOT EXISTS sha256 TEXT;
  CREATE INDEX IF NOT EXISTS idx_task_photos_task_hash
    ON task_photos(task_id, sha256) WHERE sha256 IS NOT NULL;
  ```
  Chạy `npm run gen:erd` sau khi thêm.
- `app/api/tasks/[id]/photos/route.ts` (POST): sau đoạn `verifyFileMime(fileBuf, file.type)`
  (đã có buffer `fileBuf` sẵn), tính `const hash = sha256Hex(fileBuf)` (import từ
  `@/lib/photos`, hàm đã có sẵn — KHÔNG viết hàm hash mới). Trước khi `writeFile`+`insertId`,
  query:
  ```sql
  SELECT id, caption, size_bytes AS "sizeBytes"
    FROM task_photos
   WHERE task_id = ? AND sha256 = ? AND created_at > now() - interval '24 hours'
   ORDER BY id DESC LIMIT 1
  ```
  Có kết quả → **KHÔNG ghi file, KHÔNG insert dòng mới** — trả thẳng
  `NextResponse.json({ id: existing.id, taskId, caption: existing.caption, sizeBytes: existing.sizeBytes, deduped: true }, { status: 200 })`.
  Không có kết quả → giữ nguyên luồng cũ, thêm cột `sha256` vào câu `INSERT INTO task_photos`
  (giá trị `hash`).
- Test tích hợp mới trong `tests/photos.test.ts` nếu file đã tồn tại (nếu chưa có file test
  cho route này, tạo `tests/task-photos-dedupe.test.ts`, import `tests/setup.ts` đầu tiên):
  POST cùng buffer ảnh 2 lần liên tiếp cùng task → lần 2 trả `200` + cùng `id` với lần 1,
  không có dòng `task_photos` thứ 2 trong DB (đếm `COUNT(*)`); POST buffer khác task khác
  hoặc task khác nhưng cùng nội dung ảnh → tạo dòng mới bình thường (không bị dedupe chéo
  task).

### PR3.2 — Wire ảnh vào `PhotosModal` (`app/tracking/[sheet]/TrackingGrid.tsx`)

- Import `enqueuePhoto`, `useOfflineQueueStatus` (hoặc hàm đọc riêng — xem dưới) từ
  `@/app/components/offlineQueue`.
- Hàm `upload(rawFile: File)` hiện tại (dòng ~1830): giữ nguyên bước nén ảnh
  (`compressImage` cục bộ của file này, KHÔNG đổi sang `compressImage` của
  `offlineQueue/image.ts` — 2 hàm khác nhau, giữ nguyên hàm cục bộ đang dùng vì UI đã quen
  UX nén 20% của nó) và bước hỏi caption. Sau khi có `file`+`caption`:
  - Nếu `!navigator.onLine` → gọi thẳng `enqueuePhoto({ taskId: task.id, blob: file, caption: caption.trim() || undefined })`
    (hàm này tự nén lại bằng `compressImage` của `offlineQueue/image.ts` bên trong — chấp
    nhận nén 2 lần, không tối ưu lại luồng nén, ngoài phạm vi PR3), rồi `showToast`
    "Đã xếp vào hàng đợi offline — tự gửi khi có mạng" (tìm import `showToast`/toast hiện
    có trong file — dùng đúng cơ chế toast đang dùng ở nơi khác trong `TrackingGrid.tsx`,
    không tạo cơ chế mới), set `uploading=false`, **không gọi `load()`** (server chưa có ảnh).
  - Nếu `navigator.onLine`, thử `fetch` như cũ; nếu `fetch` **throw** (mất mạng giữa
    chừng) → catch, fallback y hệt nhánh offline ở trên (enqueue).
  - Nếu `fetch` trả về nhưng không `res.ok` → giữ nguyên hành vi cũ (hiện `error`, KHÔNG
    enqueue — đây là lỗi nghiệp vụ thật như quyền/định dạng, không phải lỗi mạng, enqueue
    sẽ vô nghĩa vì server sẽ từ chối y hệt khi flush).
- Hiển thị ảnh đang chờ gửi: thêm state `pendingPhotos` (đọc qua hàm mới
  `offlineQueue.getQueuedPhotos(taskId: number)` — thêm method này vào class
  `OfflineQueueManager` trong `app/components/offlineQueue/index.ts`, đọc `this.store.getAll()`
  rồi filter `kind==='photo' && payload.taskId===taskId`, trả về
  `{id, caption, size, queuedAt, tries}[]`). Gọi lại `pendingPhotos` sau mỗi `enqueuePhoto`
  thành công và trong callback `onFlushed` đã có sẵn ở hook (nếu `PhotosModal` chưa dùng
  `useOfflineTickQueue`, chỉ cần gọi lại thủ công sau `enqueuePhoto` và đăng ký
  `offlineQueue.onFlushed(load)` trong `useEffect` của modal — sau khi hàng đợi rỗng thì
  `load()` lấy đúng ảnh thật từ server, xoá state `pendingPhotos` bằng cách đọc lại rỗng).
  Render các mục `pendingPhotos` **cùng lưới ảnh thật**, dùng `URL.createObjectURL` để
  preview blob cục bộ, kèm badge nhỏ "Chờ gửi" (icon `WifiOff` hoặc `Clock`, tái dùng style
  badge sẵn có trong file — không tạo component badge mới) — không cho xoá/sửa mục đang
  chờ gửi (ngoài phạm vi PR3, YAGNI).

### PR3.3 — Wire nhật ký vào `DiaryEditorModal` (`app/diary/DiaryEditorModal.tsx`)

- **Đổi shape `diary_note` trong `app/components/offlineQueue/logic.ts`**: type
  `QueuedOp` nhánh `diary_note` đổi `payload: { date: string; text: string }` thành
  ```ts
  payload: {
    date: string;
    weatherAm: string | null;
    weatherPm: string | null;
    workDone: string | null;
    obstacles: string | null;
    safetyNote: string | null;
    manpower: { crew: string; headcount: number; note?: string | null }[];
    photoIds: number[];
  }
  ```
  (khớp đúng field mà `PUT /api/diaries/:date` đọc). Thêm hàm thuần
  `diaryDedupeIds(ops: QueuedOp[], date: string): number[]` (cùng khuôn `tickDedupeIds`) —
  **mỗi ngày chỉ giữ 1 bản offline mới nhất** (vì PUT là full-replace, xếp hàng 2 bản cho
  cùng ngày rồi gửi tuần tự sẽ khiến bản cũ đè lên bản mới nếu gửi không đúng thứ tự —
  dedupe loại bỏ rủi ro này, cùng lý do dedupe tick theo `dimId`).
- `app/components/offlineQueue/index.ts`:
  - `enqueueDiaryNote(input)` đổi tham số thành đúng object payload trên (không phải
    `{date, text}` nữa); bên trong gọi `diaryDedupeIds` xoá bản cũ cùng `date` trước khi
    `store.add` (giống hệt cách `enqueueTick` gọi `tickDedupeIds`).
  - `sendOp()`: nhánh `diary_note` đổi từ `JSON.stringify({ workDone: op.payload.text })`
    sang gửi thẳng `JSON.stringify(op.payload)` (đã đúng shape body PUT, trừ field `date`
    không cần gửi trong body vì đã nằm trên URL — loại `date` ra khỏi object trước
    `JSON.stringify`, ví dụ dùng destructure `const { date: _d, ...body } = op.payload`).
  - Thêm export `getQueuedDiaryNote(date: string): Promise<QueuedOp | undefined>` (đọc
    `store.getAll()`, tìm `kind==='diary_note' && payload.date===date`) — modal dùng để
    biết có bản nháp offline đang chờ hay không (ưu tiên hiển thị bản chờ gửi thay vì bản
    đã lưu trên server, tránh mất thao tác của chính phiên đó nếu mở lại modal).
- `DiaryEditorModal.tsx`, hàm `save()` (dòng ~106): body object hiện đang dựng để `fetch`
  PUT — giữ nguyên cách dựng, chỉ bọc: nếu `!navigator.onLine` → gọi
  `enqueueDiaryNote({ date, weatherAm, weatherPm, workDone: workDone || null, obstacles, safetyNote, manpower: manpowerInput, photoIds })`
  (dùng đúng biến state hiện có trong file — đọc lại tên biến thật khi code, không suy
  đoán), đóng modal với toast "Đã lưu offline — sẽ tự gửi khi có mạng", **không gọi** PUT.
  Nếu `fetch` throw (mất mạng giữa chừng) → catch, fallback y hệt nhánh offline. Nếu
  `fetch` trả về nhưng không `ok` (409 khoá sổ, 422 validate...) → giữ nguyên hành vi lỗi
  cũ, KHÔNG enqueue (lỗi nghiệp vụ thật, không phải lỗi mạng).
- Mở modal: nếu `getQueuedDiaryNote(date)` có kết quả, ưu tiên nạp giá trị từ đó vào state
  form (không phải từ response `GET /api/diaries/:date`) + hiện banner nhỏ "Có bản nháp
  đang chờ gửi offline" (tái dùng style banner "Đã khoá bởi..." đã có trong file).

### PR3.4 — Giữ nguyên hành vi 4xx/dedup từ PR2

Hành vi `shouldRetry` (4xx bỏ khỏi hàng đợi không retry, 5xx/mạng giữ + backoff) **giữ
nguyên, không mở rộng** — không thêm cơ chế thông báo khi 1 thao tác bị bỏ do 4xx (ngoài
phạm vi PR3, đã là hành vi đã chốt từ PR2).

### Test + verify (PR3)

- Mở rộng `tests/offline-queue.test.ts`: thêm ca cho `diaryDedupeIds` (2 lần enqueue cùng
  ngày → chỉ còn 1 bản, giữ bản mới nhất), `sendOp`/payload shape của `diary_note` không
  còn field `text` (đổi từ ca test cũ nếu có), quota ảnh/dedup tick không đổi (không được
  vỡ test cũ).
- `npm run lint`/`typecheck`/`build` xanh; `npm test` toàn bộ file xanh (kể cả test tích
  hợp mới nếu có `TEST_DATABASE_URL`).
- Verify thật bằng Chromium DevTools (offline mode) đúng kịch bản đặc tả: mở task, bật
  offline, chụp 5 ảnh (nén, xếp hàng, thấy badge "Chờ gửi"), mở `/diary` hôm đó, sửa
  workDone + thêm 1 dòng nhân lực, lưu offline (banner nháp chờ gửi) → bật lại mạng → đợi
  tự flush → xác nhận: 5 ảnh lên đúng task không trùng (đếm `task_photos` = 5, không phải
  10 nếu lỡ gửi lại), nhật ký ngày đó giữ đúng field đã sửa (thời tiết/nhân lực cũ nếu có
  từ trước KHÔNG bị xoá) + workDone mới đúng.
- Không sửa hành vi tick (đã đúng từ PR2) — chạy lại `e2e/authed/tracking.spec.ts` nếu có
  sẵn, xác nhận không vỡ.

### Tiêu chí chấp nhận (PR3)

- [ ] Migration `0071` thêm thuần tuý (`ADD COLUMN`/`CREATE INDEX`), `npm run gen:erd` cập nhật.
- [ ] POST ảnh trùng hash cùng task trong 24h → 200 + không nhân đôi dòng DB.
- [ ] Offline chụp ảnh → xếp hàng đợi, có badge "Chờ gửi", tự gửi khi online, không mất/trùng.
- [ ] Offline lưu nhật ký → xếp hàng đợi (dedupe theo ngày), tự gửi khi online, **không xoá**
      thời tiết/nhân lực/ảnh đã có sẵn của ngày đó (test tay: nhập online trước → offline sửa
      1 field → online lại → field khác vẫn còn).
- [ ] `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] Cập nhật `PROGRESS.md` mục "Đã xong" + đóng dòng M58 PR3 trong `docs/nang-cap/README.md`.

---

## Kế hoạch B: M59 PR1 — API tổng hợp tài nguyên + trang `/resources`

- `route: complex` (đúng như đặc tả gốc `docs/nang-cap/M59-tai-nguyen.md` — có điểm phải
  tự quyết trong ranh giới nêu dưới, không phải kiến trúc tự do)
- Nhánh: `claude/feat-m59-pr1-resources`
- Đặc tả gốc: `docs/nang-cap/M59-tai-nguyen.md` mục **PR1**. Brief dưới đây bổ sung schema
  thật (đã đọc trực tiếp từ `migrations/`, KHÔNG suy đoán) + đóng sẵn 1 điểm mà đặc tả gốc
  để ngỏ.

### Đã đóng sẵn (KHÔNG cần tự quyết thêm): xung đột thiết bị

Đặc tả gốc cho phép "bỏ nếu dữ liệu không cho phép" đối với xung đột phân bổ thiết bị. Đã
đọc `migrations/0021_equipment.sql`: bảng `equipment_logs` chỉ có `action` (điểm sự kiện
`issue/return/move/maintain/calibrate` tại 1 `created_at`), **KHÔNG có cột dải ngày** (không
`start_date`/`end_date`) → không đủ dữ liệu để tính "2 phân bổ giao nhau cùng thiết bị" đúng
nghĩa. **QUYẾT ĐỊNH: PR1 KHÔNG làm xung đột thiết bị, chỉ làm `assignmentConflicts` cho
NGƯỜI (user/task).** `equipmentUsageByWeek` (mật độ dùng, không phải xung đột) vẫn làm theo
mô tả dưới.

### Schema thật (đọc trước khi code — KHÔNG suy đoán cột)

```sql
-- crews (migrations/0031_hr.sql)
crews(id, project_id, name, discipline_id, supplier_id, leader_id)
crew_members(crew_id, personnel_id)  -- PK ghép
attendance(id, project_id, work_date DATE, crew_id, personnel_id NULL,
           headcount INT, present BOOLEAN, hours NUMERIC(4,1), note, recorded_by, created_at)
  -- personnel_id NULL = chấm gộp theo tổ (dùng headcount); personnel_id có giá trị =
  -- chấm từng người (headcount thường NULL trong trường hợp này, dùng present/hours)

-- equipment_logs (migrations/0021_equipment.sql)
equipment_logs(id, equipment_id, action, to_location, to_crew, note, logged_by, created_at)

-- tasks/work_packages (đã có từ baseline) — kế thừa ngày/người phụ trách từ nhóm khi NULL:
--   COALESCE(t.start_date, wp.start_date), COALESCE(t.end_date, wp.end_date)
--   (assigned_to KHÔNG kế thừa tự động trong lib/recompute.ts hiện tại — task.assigned_to
--    NULL nghĩa là chưa gán tay, KHÔNG suy ra từ wp.assigned_to; workloadByWeek chỉ tính
--    task có assigned_to trực tiếp KHÔNG NULL — khớp đúng nghĩa "tải đã gán cho ai")
```

### `lib/resources.ts` (mới) — không migration, chỉ đọc

- `workloadByWeek({ projectId, from, to, subconUserId }: { projectId: number | null; from: string; to: string; subconUserId?: number })`:
  SQL 1 câu dùng `generate_series(date_trunc('week', ?::date), date_trunc('week', ?::date), interval '1 week') AS week`
  CROSS/LEFT JOIN với task đang chạy giao nhau tuần đó — điều kiện giao nhau:
  `COALESCE(t.start_date, wp.start_date) <= week + interval '6 days' AND COALESCE(t.end_date, wp.end_date) >= week`,
  loại `t.status IN ('hoan_thanh','nghiem_thu')`, `t.assigned_to IS NOT NULL`, scope
  `projectId` qua JOIN `work_packages wp → sheet_types st → towers tw` lọc `tw.project_id = ?`
  (đúng pattern JOIN scope dùng ở `lib/dashboardext.ts`/`lib/assignments.ts` — copy cách
  JOIN, không tự chế). Nếu `subconUserId` có giá trị → thêm `AND t.assigned_to = ?` (dùng
  cho vai trò `subcon` chỉ thấy tải chính mình). Group theo `week, t.assigned_to, u.name,
  st.discipline_id` (JOIN `users u`, `disciplines`), trả `{ week, userId, userName,
  disciplineCode, taskCount }[]`.
- `manpowerByWeek({ projectId, from, to })`: `GROUP BY date_trunc('week', work_date), crew_id`
  trên `attendance` JOIN `crews`, `SUM(COALESCE(headcount, 0)) + COUNT(*) FILTER (WHERE personnel_id IS NOT NULL AND present)`
  — **quyết định trong ranh giới cho phép**: vì `attendance` có 2 kiểu chấm công (gộp theo
  headcount HOẶC từng người qua personnel_id+present) không loại trừ nhau trong schema,
  cách cộng phải tránh đếm đôi — ghi rõ trong code comment: dòng nào có `personnel_id IS NOT NULL`
  đếm 1 người (nếu `present`), dòng nào `personnel_id IS NULL` cộng `headcount`; đây là 2
  tập dữ liệu tách biệt theo thiết kế bảng (không có UNIQUE ràng buộc chống nhập cả 2 kiểu
  cho cùng crew/ngày — nếu dữ liệu thật có trùng, tổng sẽ cao hơn thực tế, ghi nợ 1 dòng
  trong `PROGRESS.md`/comment code thay vì tự chế ràng buộc DB mới ngoài phạm vi "không
  migration"). Scope `projectId` trực tiếp qua `attendance.project_id`.
- `equipmentUsageByWeek({ projectId, from, to })`: đếm SỐ SỰ KIỆN `equipment_logs` theo
  tuần × `action` (KHÔNG phải dải ngày sử dụng liên tục — đã quyết định ở trên là bỏ mô
  hình dải ngày do thiếu cột) — `GROUP BY date_trunc('week', created_at), action`, JOIN
  `equipment e` lọc theo `e.project_id = ?` nếu bảng `equipment` có cột đó (đọc
  `migrations/0021_equipment.sql` xác nhận trước khi code — nếu không có, bỏ scope dự án
  cho khối này và ghi rõ lý do trong comment, KHÔNG suy đoán JOIN sai bảng).
- `assignmentConflicts({ projectId, minTasks = 5 }: { projectId: number | null; minTasks?: number })`:
  với mỗi `assigned_to` KHÔNG NULL, đếm số task **đang hoạt động cùng lúc** (giao nhau theo
  ngày, cùng điều kiện loại `hoan_thanh`/`nghiem_thu` như trên) ≥ `minTasks` → trả về
  `{ userId, userName, overlappingTaskCount, tasks: {id, code, name, startDate, endDate}[] }[]`,
  sắp theo `overlappingTaskCount DESC`. Tính bằng self-JOIN 2 task cùng `assigned_to` giao
  nhau ngày rồi đếm nhóm liên thông đơn giản (đếm số task chồng lấn tại **1 thời điểm bất kỳ**
  qua kỹ thuật sweep: với mỗi task, đếm số task khác cùng người có khoảng ngày giao nhau nó
  — lấy MAX trong nhóm người đó làm `overlappingTaskCount`) — đây là điểm thuật toán, viết
  bằng SQL window function hoặc CTE, KHÔNG kéo hết task về JS rồi lặp lồng (điều đặc tả
  gốc đã cấm — "toàn bộ tính trên SQL"). Quyền xem: dùng quyền xem chung (mọi vai trò đăng
  nhập); `subcon` chỉ thấy dòng có `userId = user.id` (lọc sau câu SQL hoặc thêm điều kiện
  `WHERE t.assigned_to = ?` khi role subcon).

### API: `GET /api/resources`

- `app/api/resources/route.ts` (mới): `export const dynamic = "force-dynamic"`.
  `getCurrentUser()` → 401. Query params: `from`, `to` (mặc định 8 tuần quanh hôm nay nếu
  thiếu — `todayISO()` trừ/cộng, xem cách `lib/lookahead.ts`-tương-tự nếu có, không thì tự
  tính bằng `Date`), `view=manpower|equipment|conflicts` (mặc định trả cả `workload` +
  `manpower`, `equipment`/`conflicts` chỉ trả khi `view` khớp — theo đúng câu đặc tả gốc
  "GET /api/resources?from=&to=&view=..."). `projectId = await getCurrentProjectId(user)`.
  `subconUserId = user.role === 'subcon' ? user.id : undefined` truyền vào
  `workloadByWeek`/`assignmentConflicts`. KHÔNG có gate quyền nào khác ngoài đăng nhập
  (đúng quyết định "dùng quyền xem chung, không dữ liệu tiền" trong đặc tả gốc).

### UI: `app/resources/page.tsx` (mới)

- `'use client'`, fetch `/api/resources`, loading `Skeleton`, empty-state khi rỗng **bắt
  buộc theo đặc tả gốc** — thông điệp tiếng Việt hướng dẫn rõ "cần phân công người phụ
  trách (assigned_to) + chấm công (attendance) mới có số liệu, xem trang Nhân sự/Nhật ký".
  Chart cột chồng theo tuần (`recharts` `BarChart`/`ComposedChart`, palette theo hệ —
  tái dùng token màu hệ đã có, xem `lib/disciplineColors.ts`), toggle "Kế hoạch" (workload)
  / "Thực tế" (manpower) 2 đường cạnh nhau. Bảng xung đột: mỗi dòng bấm nhảy tới
  `/tracking/<sheet>?task=<id>` (dùng khuôn panel Pareto trễ đã có trên Dashboard —
  tìm component đó trong `app/page.tsx`/`app/components/` để tái dùng style, không viết
  mới từ đầu). Mobile: chart cuộn ngang trong container riêng (`overflow-x-auto`), bảng
  sticky header — đúng chuẩn UI/UX bảng dữ liệu dày trong `CLAUDE.md`.
- Sidebar: thêm node vào `app/lib/dashboardTree.ts`, nhóm "Thi công hiện trường" →
  dashboard `dash.hien-truong` → thêm vào mảng `children` (cạnh "Mặt bằng"):
  `{ href: "/resources", label: "Tài nguyên", icon: Users }` (icon `Users` đã import sẵn
  trong file — dùng lại, không thêm icon mới nếu không cần thiết; nếu trùng ý nghĩa icon
  khác trong cùng nhóm thì chọn icon khác đã import sẵn, ưu tiên không thêm import
  lucide-react mới).
- `lib/modules.ts`: thêm 1 entry `ModuleDef` mới (bắt buộc theo `docs/nang-cap/README.md`
  mục "Module registry"):
  ```ts
  {
    key: "resources",
    nav: [{ group: "Thi công hiện trường", label: "Tài nguyên", href: "/resources", icon: "Users" }],
    permKeys: [],
    routePrefix: ["/api/resources"],
  }
  ```
  (không `notificationTypes`/`swExclude` — PR1 chưa có notification, `/api/resources` là
  API đọc thường, không cần loại trừ cache SW theo đúng pattern `/api/dashboard`/`/api/costs`
  hiện không bị loại trừ).

### Test + tiêu chí (PR1)

- `tests/resources.test.ts` (integration, import `tests/setup.ts` đầu tiên): dựng 2 dự án,
  ≥2 user × ≥6 task chồng lịch (đối chiếu số tay từng tuần cho `workloadByWeek`), 1 task
  kế thừa ngày từ `work_packages` (không set `t.start_date`/`end_date`) tính đúng qua
  `COALESCE`; `attendance` trộn cả 2 kiểu chấm (headcount gộp + personnel_id từng người)
  cộng đúng theo đúng quy tắc đã ghi ở trên; `assignmentConflicts` bắt đúng ngưỡng
  `minTasks` (test với `minTasks=2` cho dễ dựng dữ liệu nhỏ); `subcon` chỉ thấy tải/xung
  đột của chính mình; 2 dự án không lẫn số liệu.
- `npm run lint`/`typecheck`/`build` xanh; `npm test` xanh toàn bộ (kể cả file mới, chạy
  thật nếu có `TEST_DATABASE_URL`).
- Verify UI thật (Postgres cục bộ + seed dữ liệu chồng lịch thật): chart 2 đường kế
  hoạch/thực tế render đúng, bấm dòng xung đột nhảy đúng tới task trên lưới tracking,
  empty-state hiện đúng khi test trên dự án chưa có `attendance`/`assigned_to`.

### Tiêu chí chấp nhận (PR1)

- [ ] Không có migration nào (chỉ đọc dữ liệu có sẵn).
- [ ] `workloadByWeek`/`manpowerByWeek`/`equipmentUsageByWeek`/`assignmentConflicts` đều
      scope đúng theo `projectId`, subcon chỉ thấy dữ liệu của mình.
- [ ] Toàn bộ tính trên SQL (không kéo bảng về JS lặp lồng).
- [ ] Trang `/resources` có trong sidebar, empty-state rõ ràng, mobile không vỡ layout.
- [ ] `lib/modules.ts` có entry `resources`.
- [ ] `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] Cập nhật `PROGRESS.md` mục "Đã xong" (ghi rõ quyết định bỏ xung đột thiết bị) +
      cập nhật trạng thái M59 trong `docs/nang-cap/README.md` (chỉ PR1 xong, PR2 vẫn
      "chưa" — chờ dùng thật ≥1 tuần theo đúng đặc tả gốc, KHÔNG dispatch PR2 trong đợt này).

---

## Điều phối

- Cả 2 việc độc lập, dispatch song song trên 2 worktree riêng
  (`claude/feat-m58-pr3-wire-offline`, `claude/feat-m59-pr1-resources`), base từ
  `origin/main` (`d851b5e`) — không chia sẻ working tree.
- Sau khi mỗi việc code xong: gọi `reviewer` soát diff (đặc biệt soát kỹ PR3.3 — đúng là
  vùng dễ sai vì liên quan mất dữ liệu nhật ký nếu payload sai shape; và PR1 phần SQL
  window function của `assignmentConflicts` — đúng là vùng dễ sai N+1/JS loop).
- Không xung đột file giữa 2 việc (M58 PR3 chỉ chạm `offlineQueue/`, `TrackingGrid.tsx`,
  `DiaryEditorModal.tsx`, `tasks/[id]/photos/route.ts`, 1 migration mới; M59 PR1 chỉ chạm
  file mới + `dashboardTree.ts`/`modules.ts` — 2 file này CÓ THỂ đụng nhau nếu M58 PR3 cũng
  sửa, nhưng PR3 không cần sửa `dashboardTree.ts`/`modules.ts` nên an toàn) — merge tuần tự
  bình thường, không cần dàn xếp đặc biệt.
- Báo cáo tổng hợp về phiên chính: kết quả 2 PR, số PR GitHub nếu đã mở, kết quả reviewer,
  bất kỳ điểm nào worker báo vướng đặc tả (dừng lại, không tự chế) để phiên chính xử lý.
