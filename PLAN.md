# PLAN.md — Sửa 3 lỗi mức Cao từ đợt audit 2026-09-22 (S1, L1, L2) + test hồi quy

**Cập nhật:** 2026-09-22 · **Nguồn đặc tả:** `PROGRESS.md` mục "🔍 Đợt audit toàn dự án … 2026-09-22" (S1, L1, L2) + kế hoạch này.
**Nhánh làm việc:** `claude/practical-davinci-fvlxpp` (đang = `origin/…`, HEAD `133dc8a`). Hai việc **độc lập về file** → coordinator có thể
chạy song song bằng 2 worktree riêng rồi merge về nhánh làm việc (không conflict: việc A chạm `app/api/user-projects/` + 1 file test; việc B chạm
`app/api/tasks/**`, `app/api/dimensions/**` + 1 file test mới). **Trạng thái:** CHỜ THI HÀNH.

## Ràng buộc CỨNG (cả 2 việc)

- Worker không thấy hội thoại. Đọc trước: `CLAUDE.md` (mục Auth, Chuỗi tính toán tiến độ, Quy ước), `docs/audit.md` §3–§4, `tests/helpers/phien.ts`,
  và file test mẫu `tests/route-admin-assignments-cach-ly.test.ts` (cách dựng dự án/tháp/sheet/nhóm/task + gọi handler + `dangNhapDuAn`).
- **Không** đổi schema/migration, không đổi `lib/tien-do/recompute.ts`, không đổi `lib/ha-tang/projects.ts` (`visibleProjectIds`) — chỉ sửa ở ranh giới route.
- SQL qua helper `lib/db` placeholder `?`. Comment code + thông điệp lỗi tiếng Việt, giữ phong cách chú thích "vì sao" như code xung quanh.
- Test chạm DB: `import { HAS_TEST_DB } from "./setup"` **dòng đầu tiên**, rồi `./helpers/phien`. Chạy bằng
  `TEST_DATABASE_URL=postgres://ci:ci@localhost:5432/xboss_test npx tsx --test tests/<file>.test.ts` (Postgres cục bộ đã sẵn sàng).
- Cổng trước khi báo xong: `npm run lint`, `npm run typecheck`, file test của việc đó xanh, **và** các file test hiện có liên quan vẫn xanh
  (việc A: `tests/route-quan-tri-2.test.ts`, `tests/projects.test.ts`; việc B: `tests/route-tien-do.test.ts`, `tests/route-tien-do-cach-ly-du-an.test.ts`,
  `tests/route-task-cach-ly.test.ts`, `tests/recompute.test.ts`, `tests/approvals-task-proposal.test.ts`, `tests/dimension-events.test.ts`).
- Worker **commit** trên nhánh/worktree của mình, **không push**. Không sửa `PROGRESS.md` (phiên chính cập nhật).

## Việc A — S1: `PUT /api/user-projects` leo quyền dự án — `route: standard`

**File:** `app/api/user-projects/route.ts` (hàm `PUT`, dòng 26–55). Test: thêm ca vào `tests/route-quan-tri-2.test.ts` (mục "GET/PUT /api/user-projects",
dòng ~767 trở đi, dùng helper `taoDuAn`/`taoUser`/`dangNhapDuAn`/`jreq` sẵn có trong file).

**Lỗi:** route chỉ kiểm `CAN.assign` (Admin/PM) rồi ghi thẳng `user_projects` theo `userId`/`projectIds` client gửi — PM tự cấp mình mọi dự án trong org,
hoặc xoá quyền thấy của Admin/PM khác.

**Đặc tả sửa (thứ tự kiểm, đặt SAU bước validate 422 hiện có và TRƯỚC `withTransaction`):**

1. Người bị gán phải tồn tại **cùng org** với người gọi: `SELECT id, role FROM users WHERE id = ? AND org_id = ?` (`user.orgId`). Không có → **404**
   `{ error: "Không tìm thấy người dùng" }` (không lộ user org khác).
2. Nếu người gọi là **PM** (không phải admin):
   - Không được sửa dòng của **chính mình** (`userId === user.id`) → **403** `{ error: "Không thể tự gán dự án cho chính mình" }`.
   - Không được sửa dòng của user có `role = 'admin'` → **403** `{ error: "Chỉ Admin mới gán được dự án cho Admin" }`.
   - `projectIds` phải là **tập con** của `await visibleProjectIds(user)` (import từ `@/lib/ha-tang/projects`) → có id ngoài tập → **403**
     `{ error: "Chỉ gán được dự án bạn đang được thấy" }`.
3. Với **mọi** người gọi: mọi `projectIds` phải tồn tại trong `projects` **cùng org**: `SELECT id FROM projects WHERE id = ANY(?) AND org_id = ?`
   (hoặc `id IN (...)` sinh placeholder từ mảng — bám cách các route khác trong repo đang làm với mảng id) — thiếu bất kỳ id nào → **422**
   `{ error: "Dự án không tồn tại" }`. Mảng rỗng `[]` hợp lệ (chủ động khoá user, giữ hành vi cũ đã ghi trong comment route).
4. Giữ nguyên phần ghi (`DELETE` + `INSERT … ON CONFLICT`) trong `withTransaction`.

**Tiêu chí chấp nhận (test hồi quy, mỗi ca 1 `test(...)`, có dọn dữ liệu cuối ca như mẫu file):**

- AC1: PM được gán dự án P1 (có dòng `user_projects` cho PM→P1), gọi PUT `{ userId: <chính PM>, projectIds: [P1, P2] }` → **403**, bảng `user_projects`
  của PM vẫn chỉ P1.
- AC2: PM thấy P1, gán cho engineer cùng org `{ projectIds: [P2] }` (P2 ngoài tập thấy) → **403**, không có dòng engineer→P2.
- AC3: PM thấy P1, gán cho engineer `{ projectIds: [P1] }` → **200**, có dòng engineer→P1.
- AC4: PM gán cho user có role admin → **403**.
- AC5: Admin gán cho user org khác (tạo user với `org_id` khác — nếu tạo org mới cần `INSERT INTO organizations`; xem cách `tests/*` khác tạo org, grep
  `INSERT INTO organizations`) → **404**.
- AC6: Admin gán `projectIds` chứa id không tồn tại (vd `999999999`) → **422**.
- AC7: Admin gán hợp lệ `{ userId: engineer, projectIds: [P1, P2] }` → **200**, đúng 2 dòng.
- Các ca cũ 401/403/422 trong file vẫn xanh.

**Commit:** `fix(bảo mật): PUT /api/user-projects — PM chỉ gán được dự án mình thấy, không tự gán/không gán Admin, kiểm user và dự án cùng org (S1 audit 2026-09-22)`.

## Việc B — L1 + L2: bất biến nghiệm thu bị phá qua route thường — `route: spec`

**File chạm (5 route):** `app/api/tasks/[id]/route.ts` (PATCH, khối `withTransaction` dòng ~141–175), `app/api/tasks/batch/route.ts` (vòng lặp
sau `SELECT … FOR UPDATE` dòng ~62–90), `app/api/tasks/[id]/progress/route.ts` (khối `withTransaction` dòng ~63–112), `app/api/dimensions/[id]/route.ts`
(trước/trong `withTransaction` dòng ~74–79), `app/api/dimensions/batch/route.ts` (trước/trong `withTransaction` dòng ~86–92).
Test mới: `tests/route-nghiem-thu-bat-bien.test.ts`.

**Bất biến cần bảo vệ (CLAUDE.md):** `nghiem_thu` chỉ đặt/huỷ qua `POST/DELETE /api/tasks/:id/approve` (hoặc `/api/approvals`), và `nghiem_thu ⇒ progress = 1`.
Hiện 5 route trên chỉ chặn _đặt_ `status = "nghiem_thu"`, không chặn khi task **đang** `nghiem_thu`.

**Đặc tả sửa — quy tắc chung:** task đang `status = 'nghiem_thu'` (đọc trong cùng transaction sau `FOR UPDATE` ở route đã có; ở 2 route dimensions
đọc `t.status` thêm vào câu SELECT sẵn có `JOIN tasks t`) thì mọi thao tác **làm đổi trạng thái hoặc giảm tiến độ** bị từ chối **409** với thông điệp
`"Task đã nghiệm thu — huỷ nghiệm thu (DELETE /api/tasks/:id/approve) trước khi sửa"`. Cụ thể:

1. `PATCH /api/tasks/[id]`: trong `withTransaction`, sau khi có `before`: nếu `before.status === "nghiem_thu"` **và** `body.status !== undefined` →
   trả `{ error, httpStatus: 409 }` (kể cả `body.status === "hoan_thanh"`). Sửa các trường khác (tên, ngày, BOQ, gán người…) vẫn cho phép — `recomputeTask`
   khi đổi ngày đã giữ `nghiem_thu` (`deriveStatus` giữ). Đặt kiểm này **trước** `statusConsistentWithProgress`.
2. `POST /api/tasks/batch`: cùng luật với `exists.status === "nghiem_thu" && patch.status !== undefined` → `throw new Error("Task #<id> đã nghiệm thu — …")`
   (batch đang map lỗi → response; bám cách file map, nếu batch trả 422 cho mọi lỗi nghiệp vụ thì chấp nhận 422 cho batch, ghi rõ trong test).
3. `PATCH /api/tasks/[id]/progress`: sau khi có `task` (FOR UPDATE): nếu `task.status === "nghiem_thu"` **và** (`progress !== 1` **hoặc** `body.status !== undefined`)
   → `{ error, httpStatus: 409 }`. Gửi lại `progress = 1` không kèm status (replay offline) vẫn 200 và không đổi gì (idempotent).
4. `PATCH /api/dimensions/[id]`: thêm `t.status` vào SELECT `dim`; nếu `dim.status === "nghiem_thu"` **và** `installed === false` (bỏ tick) → **409** (đặt cùng chỗ
   với kiểm hold-point, trước `withTransaction`). Tick `installed = true` trên task đã nghiệm thu vẫn cho (không giảm %, idempotent replay).
5. `PATCH /api/dimensions/batch`: thêm `t.status` vào SELECT `dims`; nếu `installed === false` và **bất kỳ** task trong `taskIds` có status `nghiem_thu` → **409**
   cho cả lô, không ghi gì.

**Tiêu chí chấp nhận (test hồi quy `tests/route-nghiem-thu-bat-bien.test.ts`):** dựng dự án/tháp/sheet/nhóm/task như file mẫu; task có 2 ô
`progress_dimensions` (`installed = 1`), `progress_percent = 1`, `status = 'nghiem_thu'`; đăng nhập Admin với dự án đó (`dangNhapDuAn`).

- AC1: PATCH `/api/tasks/:id` `{ status: "hoan_thanh" }` → 409; DB vẫn `nghiem_thu`, không thêm dòng `task_history`.
- AC2: PATCH `/api/tasks/:id` `{ name: "Tên mới" }` → 200; status vẫn `nghiem_thu`, tên đổi.
- AC3: POST `/api/tasks/batch` với patch `status: "dang_thi_cong"` cho task đó → mã lỗi theo file (409 hoặc 422, ghi rõ), DB vẫn `nghiem_thu`.
- AC4: PATCH `/api/tasks/:id/progress` `{ progress: 0.5 }` → 409; `progress_percent` vẫn 1, `actual_end_date` không bị NULL, không thêm `task_history`.
- AC5: PATCH `/api/tasks/:id/progress` `{ progress: 1 }` → 200 (idempotent), không thêm `task_history`.
- AC6: PATCH `/api/dimensions/:dimId` `{ installed: false }` → 409; ô vẫn `installed = 1`, task vẫn 100% `nghiem_thu`.
- AC7: PATCH `/api/dimensions/batch` `{ ids: [dim1, dim2], installed: false }` → 409; cả 2 ô vẫn 1.
- AC8 (đối chứng): task **chưa** nghiệm thu (`hoan_thanh`, 100%) → PATCH dimension `{ installed: false }` → 200 và % giảm — chứng minh không chặn nhầm.
- AC9 (đối chứng): sau `DELETE /api/tasks/:id/approve` (import handler từ `app/api/tasks/[id]/approve/route.ts`) → PATCH progress `{ progress: 0.5 }` → 200.

**Commit:** `fix(tiến độ): chặn sửa trạng thái/giảm % task đang nghiệm thu ở PATCH task, batch, progress, dimensions (L1+L2 audit 2026-09-22)`.

## Sau khi 2 việc xong (coordinator)

1. Merge 2 nhánh việc về `claude/practical-davinci-fvlxpp` (không conflict kỳ vọng).
2. Gọi `reviewer` soát toàn bộ diff so với `133dc8a`.
3. Chạy đủ cổng: `npm run lint && npm run typecheck && TEST_DATABASE_URL=postgres://ci:ci@localhost:5432/xboss_test npm test -- --release-gate && npm run build`.
4. Báo cáo về phiên chính: danh sách file đổi, kết quả cổng (số file/ca test), phát hiện của reviewer (đã sửa/chưa), mã lỗi batch đã chọn ở AC3.
   **Không push.**
