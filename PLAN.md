# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: Đóng nợ kỹ thuật phát hiện qua audit PROGRESS.md (2026-07-16)

### Bối cảnh & mục tiêu

Audit toàn bộ `PROGRESS.md` (693 dòng) đối chiếu với code thật (grep xác minh trực
tiếp, không suy đoán) cho thấy 4 mục nợ kỹ thuật thật sự còn mở (nhiều mục khác trong
log tưởng còn mở nhưng đã được đóng ở các đợt sau — đã loại khỏi kế hoạch này, ví dụ
magic-byte MIME sniffing `verifyFileMime`/`sniffMime` đã wire đủ ở 25/28 route upload,
`lib/material-sync.ts::sheetRowToFieldsChecked` đã fix coercion). Người dùng yêu cầu
**"giao fix hết, trừ sentry"** (Sentry DSN production là việc vận hành, không phải code
— giữ nguyên, không đưa vào kế hoạch).

Không có việc nào trong kế hoạch này đổi schema DB — không tạo migration mới, không có
xung đột số migration giữa các việc.

### Việc

#### 1. Vá lỗ hổng rò rỉ chéo dự án (ADR-0004/M22) — 7 route chưa lọc `project_id`

- `route:` `spec`
- agent: `spec-executor`
- nhánh/worktree: `claude/fix-project-scoping-routes` (base `origin/main` mới nhất)
- đặc tả (đã xác minh code hiện tại, đóng hoàn toàn — không cần tự quyết):

  **Bối cảnh:** Từ M22, mọi route đọc dữ liệu theo dự án phải lọc qua
  `getCurrentProjectId(user)` (trả `number | null` — `null` = "Toàn bộ dự án", hợp lệ
  với vai trò admin/xem toàn cục) rồi thêm điều kiện `tw.project_id = ?` khi có giá trị.
  Pattern chuẩn tham khảo `app/api/dashboard/floors/route.ts` dòng 20-22, 42:

  ```ts
  const projectId = await getCurrentProjectId(user);
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const projectParams = projectId != null ? [projectId] : [];
  // ... FROM ... LEFT JOIN towers tw ON st.tower_id = tw.id
  // ... WHERE ... ${projectFilter}  -- nối vào cuối mệnh đề WHERE hiện có
  // params: ...cácParamCũ, ...projectParams
  ```

  7 route sau **hoàn toàn chưa gọi** `getCurrentProjectId`/không lọc `project_id`
  (xác nhận lại bằng `grep -n "projectId\|getCurrentProjectId"` → 0 kết quả mỗi file):

  1. **`app/api/norms/over/route.ts`** — đơn giản nhất: `lib/norms.ts::overNormItems`
     **đã nhận sẵn** tham số `projectId?: number` (dòng 189-191, filter qua
     `bi.project_id` có sẵn). Chỉ cần: import `getCurrentProjectId` từ `@/lib/projects`,
     gọi `const projectId = await getCurrentProjectId(user);`, sửa lời gọi thành
     `overNormItems(thresholdPct, projectId ?? undefined)`.

  2. **`app/api/my-tasks/route.ts`** — thêm `getCurrentProjectId`, thêm
     `LEFT JOIN towers tw ON st.tower_id = tw.id` vào câu SELECT chính, thêm điều kiện
     `${projectFilter}` vào `WHERE t.assigned_to = ?` (nối bằng AND), thêm
     `...projectParams` vào cuối mảng tham số truyền cho `query()`.

  3. **`app/api/lookahead/route.ts`** — thêm `getCurrentProjectId`; thêm
     `LEFT JOIN towers tw ON st.tower_id = tw.id` vào biến `select` dùng chung cho cả
     2 câu (`starting`, `due`); thêm `${projectFilter}` vào cả 2 mệnh đề WHERE (đặt
     cạnh `${systemFilter}` đã có sẵn theo mẫu cùng file); thêm `...projectParams` vào
     cuối mảng tham số của **cả 2** lời gọi `query()` (đúng thứ tự: `today, until,
...systemParams, ...projectParams`).

  4. **`app/api/timeline/route.ts`** — thêm `getCurrentProjectId`. Câu `current` đã có
     sẵn `LEFT JOIN towers tw ON st.tower_id = tw.id` — chỉ cần thêm `${projectFilter}`
     vào WHERE + `...projectParams` vào tham số. Câu `history` **chưa join towers** —
     thêm `LEFT JOIN towers tw ON st.tower_id = tw.id` vào FROM, thêm `${projectFilter}`
     vào WHERE, thêm `...projectParams` vào tham số (đặt sau `...systemParams` như câu
     `current`).

  5. **`app/api/tasks/route.ts`** (lưới tracking chính) — thêm `getCurrentProjectId`.
     Sửa câu `queryOne<Sheet>` lấy `sheet_types` để join towers + lọc dự án:

     ```ts
     const st = await queryOne<Sheet>(
       `SELECT st.id, st.code, st.name, st.responsible, st.slug
          FROM sheet_types st
          LEFT JOIN towers tw ON st.tower_id = tw.id
         WHERE st.slug = ?${projectId != null ? " AND tw.project_id = ?" : ""}`,
       slug,
       ...(projectId != null ? [projectId] : []),
     );
     ```

     Giữ nguyên thông báo lỗi cũ `"Sheet không hợp lệ"` (404) khi sheet thuộc dự án
     khác — không lộ thông tin sheet có tồn tại ở dự án khác hay không (nhất quán
     cách các route đã scope khác xử lý 404).

  6. **`app/api/gantt/route.ts` + `lib/gantt-data.ts`** — `getCpmData(systemId)` cần
     thêm tham số thứ 2 `projectId?: number` → đổi chữ ký thành
     `getCpmData(systemId: number | null, projectId?: number)`. Trong hàm, câu `bars`
     hiện `FROM work_packages wp JOIN sheet_types st ON wp.sheet_type_id = st.id` —
     thêm `LEFT JOIN towers tw ON st.tower_id = tw.id`, thêm điều kiện
     `projectId != null ? " AND tw.project_id = ?" : ""` vào WHERE, thêm param tương
     ứng vào cuối mảng (sau `...systemParams`). Route `app/api/gantt/route.ts` gọi
     `getCurrentProjectId(user)` rồi `getCpmData(systemId, projectId ?? undefined)`.

  7. **`app/api/schedule-control/route.ts` + `lib/schedule-control.ts`** —
     `getScheduleControlData(systemId)` đổi chữ ký thành
     `getScheduleControlData(systemId: number | null, projectId?: number)`; hàm này
     tự gọi `getCpmData(systemId, projectId)` (đã sửa ở việc 6 — 2 việc này **PHỤ
     THUỘC nhau, phải làm cùng 1 nhánh/PR**, xem mục "Thứ tự & phụ thuộc"), đồng thời
     câu `delayed` trong `getScheduleControlData` (`FROM tasks t JOIN work_packages wp
... JOIN sheet_types st ...`) cũng cần thêm `LEFT JOIN towers tw ON st.tower_id =
tw.id` + filter `project_id` giống các route khác. Route
     `app/api/schedule-control/route.ts` gọi `getCurrentProjectId(user)` rồi truyền
     vào `getScheduleControlData(systemId, projectId ?? undefined)`.

  **Cập nhật test bắt buộc:** `tests/schedule-control.test.ts` gọi trực tiếp
  `getScheduleControlData`/`getCpmData` — cập nhật lời gọi cho khớp chữ ký mới (thêm
  `undefined` hoặc bỏ trống tham số thứ 2 nếu test hiện không cần lọc dự án — không lọc
  vẫn phải cho ra kết quả y hệt cũ, đây là điều kiện tương thích ngược bắt buộc). Thêm
  ít nhất 1 ca test mới xác nhận lọc đúng khi truyền `projectId` (dựng 2 dự án, xác nhận
  dữ liệu không lẫn) — tối thiểu cho `getCpmData`/`getScheduleControlData` và
  `overNormItems` (đã có sẵn hạ tầng test đa dự án tham khảo `tests/cost.test.ts`).

- tiêu chí chấp nhận:
  - [ ] `npm run lint` + `npm run typecheck` + `npm test` (+ `npm run build`) xanh
  - [ ] Grep xác nhận cả 7 route đều xuất hiện `getCurrentProjectId`/`projectId`
  - [ ] Không truyền `projectId` (dự án chưa bật/`null`) → hành vi và kết quả **y hệt
        trước khi sửa** (tương thích ngược, verify bằng test cũ vẫn xanh không sửa kỳ vọng)
  - [ ] Có `projectId` cụ thể → dữ liệu route trả về chỉ gồm tháp/sheet/task thuộc đúng
        dự án đó (verify bằng test tích hợp dựng 2 dự án)

#### 2. `/api/notifications` — truyền `projectId` cho 4 loại cảnh báo còn thiếu + dọn dead code

- `route:` `mechanical`
- agent: `mechanical-worker`
- nhánh/worktree: `claude/fix-notifications-project-scope` (base `origin/main` mới nhất)
- đặc tả (đóng hoàn toàn, các hàm lib đã sẵn tham số `projectId?`, chỉ cần truyền vào
  đúng như 16 loại cảnh báo khác trong CÙNG FILE đã làm — bám sát mẫu có sẵn ngay cạnh):
  - `app/api/notifications/route.ts`: sửa 4 lời gọi sau, thêm đúng 1 tham số
    `projectId ?? undefined` (biến `projectId` đã có sẵn trong scope hàm route qua
    `await getCurrentProjectId(user)` ở đầu file — dùng lại, không khai báo mới):
    - dòng ~342: `expiringInsuranceBonds()` → `expiringInsuranceBonds(30, projectId ?? undefined)`
      (kiểm tra chữ ký thật trong `lib/insurance.ts` — tham số đầu `days` mặc định
      `INSURANCE_EXPIRY_WARN_DAYS`, giữ nguyên giá trị ngưỡng ngày hiện route đang dùng
      nếu route có truyền `days` riêng; chỉ thêm `projectId`).
    - dòng ~370: `expiringLegalDocs()` → thêm `projectId ?? undefined` làm tham số thứ 2
      (chữ ký `lib/kickoff.ts`: `(days = LEGAL_EXPIRY_WARN_DAYS, projectId?: number)`).
    - dòng ~398: `expiringCertifications()` → thêm `projectId ?? undefined` làm tham số
      **thứ nhất** (chữ ký `lib/hr.ts` khác thứ tự: `(projectId?: number, days =
CERT_EXPIRY_WARN_DAYS)` — chú ý đúng vị trí tham số, không đảo nhầm với 2 hàm
      trên).
    - dòng ~892: `expiringEnvPermits()` → thêm `projectId ?? undefined` làm tham số
      **thứ nhất** (chữ ký `lib/environment.ts`: `(projectId?: number, days =
ENV_PERMIT_EXPIRY_WARN_DAYS)` — cùng lưu ý thứ tự như trên).
    - **Kiểm tra kỹ chữ ký thật của từng hàm trước khi sửa** (đọc file lib tương ứng) —
      2 hàm thứ tự tham số khác nhau giữa các lib, không suy đoán theo mẫu 1 hàm rồi áp
      y hệt cho hàm khác.
  - `lib/material-sync.ts`: xoá hàm `sheetRowToFields` (dòng ~151-160) — dead code
    không còn nơi nào gọi (đã xác nhận bằng `grep -rn "sheetRowToFields\b"` chỉ khớp
    đúng dòng khai báo), đã bị thay hoàn toàn bởi `sheetRowToFieldsChecked` đang dùng
    thật ở dòng 352/420. Xoá sạch, không để lại comment "removed".
- tiêu chí chấp nhận:
  - [ ] `npm run lint` + `npm run typecheck` + `npm test` (+ `npm run build`) xanh
  - [ ] Grep xác nhận cả 4 lời gọi đã truyền `projectId ?? undefined` đúng vị trí tham
        số theo chữ ký thật từng hàm
  - [ ] `sheetRowToFields` không còn tồn tại trong `lib/material-sync.ts`
  - [ ] Không đổi hành vi khi dự án đang chọn = "Toàn bộ" (`projectId === null` →
        `undefined` → không lọc, y hệt trước khi sửa)

#### 3. Hoàn thiện M46 Approval Engine PR2 — badge bước duyệt + notification + lịch sử duyệt

- `route:` `standard`
- agent: `standard-worker`
- nhánh/worktree: `claude/feat-approval-engine-followup` (base `origin/main` mới nhất)
- đặc tả (nợ kỹ thuật ghi rõ có chủ đích trong `PROGRESS.md` dòng 101, đặc tả gốc
  `docs/nang-cap/M46-approval-engine.md` — 3 phần, làm đủ cả 3 trong PR này):

  **3a. Hàm tra trạng thái duyệt của 1 thực thể (`lib/approvals.ts`, thêm mới):**

  ```ts
  export type ApprovalActionRow = {
    seq: number;
    actorId: number;
    actorName: string | null;
    decision: "approve" | "reject";
    note: string | null;
    at: string; // ISO timestamp
  };
  export type EntityApprovalStatus = {
    requestId: number;
    status: "pending" | "approved" | "rejected" | "cancelled";
    currentSeq: number;
    totalSteps: number;
    currentRole: Role | null; // null khi status != 'pending'
    actions: ApprovalActionRow[];
  };
  // Trả trạng thái duyệt GẦN NHẤT của 1 thực thể (theo created_at DESC, LIMIT 1) —
  // null nếu chưa từng mở approval request (không có flow cấu hình, hoặc entity mới).
  export async function getEntityApprovalStatus(
    entityType: string,
    entityId: number,
  ): Promise<EntityApprovalStatus | null>;
  ```

  Lấy `approval_requests` mới nhất theo `(entity_type, entity_id)`, JOIN đếm
  `approval_steps` theo `flow_id` ra `totalSteps`; nếu `status === 'pending'`, tra
  `role` của step có `seq = currentSeq` làm `currentRole` (giống logic
  `advanceApproval` đã có ở dòng 164-203 — tái dùng cách query, không viết lại từ đầu);
  lấy toàn bộ `approval_actions` của request kèm `JOIN users` lấy tên (`actorName`),
  sắp theo `seq`.

  **3b. Wire vào 2 route chi tiết + hiển thị UI:**
  - `app/api/variations/[id]/route.ts` (GET): thêm field `approvalStatus:
await getEntityApprovalStatus("variation", id)` vào response JSON.
  - `app/api/payment-certs/[id]/route.ts` (GET): thêm field `approvalStatus:
await getEntityApprovalStatus("payment_cert", id)` vào response JSON.
  - `app/variations/page.tsx` modal chi tiết: khi `approvalStatus != null &&
approvalStatus.status === 'pending'`, hiện badge **"Chờ duyệt (bước
    {currentSeq}/{totalSteps})"** cạnh badge trạng thái VO hiện có (màu `amber`, cùng
    hệ màu trạng thái dự án — không hardcode hex, dùng class Tailwind `zinc`/accent
    theo quy ước CLAUDE.md). Thêm khối "Lịch sử duyệt" trong tab đang có (hoặc tab mới
    nếu tab hiện tại đã đầy) liệt kê `approvalStatus.actions` (tên người duyệt, quyết
    định, ghi chú, thời gian) — ẩn hoàn toàn khối này khi `approvalStatus == null`
    (không có flow cấu hình → UI y hệt trước đây, đúng nguyên tắc "dormant" của M46).
  - `app/payment-certs/page.tsx`: làm y hệt cho modal chi tiết đợt IPC.

  **3c. Notification `approval_pending` (SLA quá hạn theo `sla_days` của bước hiện tại):**
  - `lib/approvals.ts` thêm hàm mới:
    ```ts
    export type PendingApprovalOverdue = {
      requestId: number;
      entityType: string;
      entityId: number;
      currentRole: Role;
      slaDays: number;
      createdAt: string; // dùng làm mốc tính quá hạn bước hiện tại (đơn giản hoá:
      // không lưu thời điểm chuyển bước riêng — chấp nhận theo
      // đặc tả gốc M46, ghi rõ trong comment)
    };
    // Request đang 'pending', bước hiện tại có `slaDays` khác NULL, và đã quá
    // `created_at + slaDays ngày` → coi là quá hạn (approval_pending/overdue gộp
    // chung 1 loại, không tách 2 loại như đặc tả cũ nêu — đơn giản hoá hợp lý vì
    // schema hiện không lưu mốc thời gian chuyển bước riêng lẻ).
    export async function overdueApprovals(projectId?: number): Promise<PendingApprovalOverdue[]>;
    ```
  - `app/api/notifications/route.ts`: thêm khối mới theo đúng cơ chế
    on-fetch/dedup/tự dọn của `vo_pending`/`cert_pending` đã có sẵn trong file (copy
    cấu trúc, đổi tên loại thành `approval_pending`, dedup theo cột mới cần thêm
    migration hay dùng cột JSON có sẵn — **kiểm tra bảng `notifications` hiện có cột
    nào tái dùng được cho `(entity_type, entity_id)` trước khi quyết định thêm cột
    mới; nếu cần thêm cột, đó là "thêm thuần" (`ADD COLUMN` + `CREATE INDEX`) được đi
    thẳng production theo quy ước migration của CLAUDE.md** — file
    `migrations/0057_notif_approval.sql` nếu cần, số kế tiếp sau `0056_alert_rules.sql`).
    Gửi tới người có vai trò = `currentRole` của bước (không gửi tới người tạo request).

  **Test bắt buộc:** `tests/approvals.test.ts` (đã có từ M46 PR1/PR2 — mở rộng, không
  tạo file mới) thêm ca: `getEntityApprovalStatus` trả đúng `null`/dữ liệu đầy đủ theo
  2 kịch bản (chưa có request / có request pending + đã có 1 action); `overdueApprovals`
  xuất hiện/biến mất đúng điều kiện quá hạn SLA. `e2e/authed/variations.spec.ts` +
  `payment-certs.spec.ts` (nếu có) thêm ca kiểm badge/lịch sử hiển thị đúng khi có flow
  test (nếu hạ tầng e2e đã có cách tạo flow test — nếu không, verify qua test tích hợp
  - smoke test tay là đủ, ghi rõ lý do trong PROGRESS.md).

- tiêu chí chấp nhận:
  - [ ] `npm run lint` + `npm run typecheck` + `npm test` (+ `npm run build`) xanh
  - [ ] Không có flow cấu hình cho `variation`/`payment_cert` (mặc định hiện tại) →
        `approvalStatus` luôn `null`, UI/notification không đổi gì so với trước (verify
        bằng test hiện có vẫn xanh nguyên trạng)
  - [ ] Có flow cấu hình + request đang pending → badge hiện đúng bước, lịch sử duyệt
        hiện đủ action, notification `approval_pending` xuất hiện đúng khi quá SLA và
        tự dọn khi hết điều kiện

#### 4. Chặn sớm upload quá lớn bằng `Content-Length` (trước khi buffer `formData()`)

- `route:` `standard`
- agent: `standard-worker`
- nhánh/worktree: `claude/fix-upload-size-precheck` (base `origin/main` mới nhất)
- đặc tả (đóng — pattern lặp lại chính xác trên nhiều file, nhưng cần viết + test 1
  helper mới nên xếp `standard` thay vì `mechanical`):

  **Vấn đề:** Toàn bộ ~28 route upload hiện tại chỉ kiểm `file.size > MAX_*_BYTES` **sau
  khi** `await req.formData()` đã đọc/buffer toàn bộ file vào bộ nhớ — request rất lớn
  (không giới hạn ở tầng Next.js/reverse-proxy) có thể gây DoS bộ nhớ trước khi kịp từ
  chối. Magic-byte MIME sniffing (`verifyFileMime`) đã được wire đủ ở các route này rồi
  — **không đụng lại phần đó**, chỉ thêm bước chặn sớm bằng header `Content-Length`.

  **Bước 1 — thêm helper thuần trong `lib/photos.ts`:**

  ```ts
  // Chặn sớm request multipart quá lớn dựa vào header Content-Length — TRƯỚC KHI
  // buffer toàn bộ body qua req.formData(), né DoS bộ nhớ với file khổng lồ. Thiếu
  // header (vd chunked transfer) → bỏ qua, vẫn có check `file.size` sau formData()
  // làm lưới an toàn cuối như cũ. +64KB dung sai cho boundary/header multipart.
  export function isContentTooLarge(contentLengthHeader: string | null, maxBytes: number): boolean {
    if (!contentLengthHeader) return false;
    const n = Number(contentLengthHeader);
    return Number.isFinite(n) && n > maxBytes + 64 * 1024;
  }
  ```

  **Bước 2 — wire vào đúng 28 route sau** (danh sách đầy đủ từ
  `grep -rl "formData()" app/api`), thêm ngay **sau bước kiểm quyền/tồn tại record,
  TRƯỚC dòng `req.formData()`**, dùng đúng hằng số max đã import sẵn trong từng file
  (không đổi tên biến hằng số hiện có):

  ```ts
  if (isContentTooLarge(req.headers.get("content-length"), MAX_DOC_BYTES)) {
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${MAX_DOC_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }
  ```

  (thông báo lỗi tái dùng đúng string đã có sẵn ngay bên dưới ở check `file.size` cũ
  trong cùng file — copy để nhất quán, không tự nghĩ câu mới)

  Danh sách 28 file (hằng số max tương ứng ghi kèm — đọc để chắc đúng tên):
  `app/api/boq/import/route.ts` (`MAX_BYTES` local),
  `app/api/certifications/[id]/route.ts` (`MAX_DOC_BYTES`),
  `app/api/claims/[id]/documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/contracts/[id]/documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/correspondences/[id]/files/route.ts` (`MAX_DOC_BYTES`),
  `app/api/drawings/[id]/revisions/route.ts` (`MAX_DRAWING_BYTES`),
  `app/api/env-permits/[id]/route.ts` (`MAX_DOC_BYTES`),
  `app/api/equipment/[id]/cert/route.ts` (`MAX_DOC_BYTES`),
  `app/api/floor-approvals/[id]/documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/floor-stage-fronts/[id]/documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/handover-items/[id]/route.ts` (`MAX_DOC_BYTES`),
  `app/api/hse/[id]/photos/route.ts` (`MAX_PHOTO_BYTES`),
  `app/api/import/excel/route.ts` (`MAX_BYTES` local),
  `app/api/insurance-bonds/[id]/route.ts` (`MAX_DOC_BYTES`),
  `app/api/legal-documents/[id]/route.ts` (`MAX_DOC_BYTES`),
  `app/api/materials/import/route.ts` (đọc file để xác định hằng số dùng — chưa liệt
  kê ở trên vì không nằm trong danh sách grep MAX ban đầu, kiểm tra lại khi code),
  `app/api/om-documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/progress-albums/[id]/photos/route.ts` (`MAX_PHOTO_BYTES`),
  `app/api/project-documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/proposals/[id]/documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/subcontractors/[supplierId]/documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/tasks/[id]/documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/tasks/[id]/photos/route.ts` (`MAX_PHOTO_BYTES`),
  `app/api/tenders/[id]/bids/[bidId]/file/route.ts` (đọc file để xác định hằng số),
  `app/api/variations/[id]/documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/work-fronts/[id]/documents/route.ts` (`MAX_DOC_BYTES`),
  `app/api/workpackages/[id]/bbnt/route.ts` (`MAX_DOC_BYTES`),
  `app/api/workpackages/[id]/drawing/route.ts` (`MAX_DOC_BYTES`).

  Với 2 file chưa xác định rõ hằng số (`materials/import`, `tenders/.../file`) — đọc
  file thật lúc code, dùng đúng hằng số/giá trị max đang có trong route đó (không thêm
  hằng số mới nếu đã có sẵn).

  **Test:** thêm `tests/photos.test.ts` (hoặc file test thuần tương ứng nếu đã có sẵn
  cho `lib/photos.ts`) — test thuần `isContentTooLarge` (thiếu header → false; header
  hợp lệ dưới/trên ngưỡng + biên dung sai 64KB; header không parse được → false).
  Không cần test tích hợp riêng cho từng route (đã có smoke test thủ công đủ, tránh
  overengineer 28 test case lặp lại).

- tiêu chí chấp nhận:
  - [ ] `npm run lint` + `npm run typecheck` + `npm test` (+ `npm run build`) xanh
  - [ ] Grep xác nhận đủ 28 route đều gọi `isContentTooLarge` trước `formData()`
  - [ ] Upload file hợp lệ, đúng kích thước cho phép vẫn qua bình thường (không phá
        luồng upload hiện có — verify bằng ít nhất 1 smoke test tay qua curl với file
        thật cỡ nhỏ trên 1-2 route đại diện, vd `/api/tasks/:id/photos`)
  - [ ] Request khai `Content-Length` vượt ngưỡng bị chặn 413 **trước khi** log server
        cho thấy đã đọc hết body (verify bằng curl `--header "Content-Length: <số lớn>"`
        hoặc file thật vượt ngưỡng)

### Thứ tự & phụ thuộc

- 4 việc **độc lập hoàn toàn** về file — chạy song song, mỗi việc 1 worktree riêng.
- **Riêng việc 1**: 2 file `app/api/gantt/route.ts`+`lib/gantt-data.ts` và
  `app/api/schedule-control/route.ts`+`lib/schedule-control.ts` phụ thuộc lẫn nhau
  (`getScheduleControlData` gọi `getCpmData`) — **phải sửa cùng lúc trong cùng 1 PR/
  nhánh** (đã gộp chung vào việc 1, không tách ra).
- Không việc nào tạo migration, **trừ khả năng** việc 3 cần `migrations/0057_notif_approval.sql`
  nếu quyết định thêm cột dedup — không đụng số migration của việc nào khác.
- Không có điểm tích hợp chéo giữa 4 việc — coordinator merge tuần tự vào main, xung
  đột dự kiến bằng 0 (4 file/nhóm file tách biệt).

### Sau khi worker xong (coordinator thực hiện)

- [ ] Đối chiếu từng việc với tiêu chí chấp nhận (chạy lại lint/typecheck/test nếu cần xác nhận)
- [ ] `reviewer` soát diff từng nhánh (skill `code-review`) — đặc biệt chú ý việc 1 (rủi
      ro cao theo `docs/audit.md` vì chạm truy vấn dữ liệu tài chính/tiến độ) và việc 3
      (chạm `lib/approvals.ts`, đảm bảo hành vi dormant khi chưa có flow không đổi)
- [ ] Tích hợp theo mục "Thứ tự & phụ thuộc" ở trên; va chạm lớn → báo phiên chính
- [ ] Báo cáo tổng hợp về phiên chính: trạng thái từng việc, nhánh + commit, kết quả
      reviewer, quyết định worker tự đưa ra (đặc biệt: có thêm migration 0057 hay
      không, và lý do), điểm vướng

### Duyệt cuối (phiên chính thực hiện)

- [ ] Đối chiếu diff với đặc tả + báo cáo coordinator
- [ ] Cập nhật `PROGRESS.md` (+ `docs/ERD.md` nếu việc 3 thêm cột — `npm run gen:erd`)
- [ ] Push nhánh + mở PR draft theo template (4 PR riêng, không gộp)
