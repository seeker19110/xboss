# S16 — Đóng các route coi `projectId == null` là "không lọc" (A1-AC03)

Ngày: 2026-10-09 · Nhánh `s16-null-scope-fail-closed` (base `3d09fa5`) · Test: `tests/s16-null-scope.test.ts`

## Vấn đề

`getCurrentProjectId(user)` trả `null` khi người gọi **không có dự án khả kiến** (PM có 0 membership
trong khi `user_projects` không rỗng; admin của một org chưa có dự án). Nhiều route/hàm lib vẫn
coi `null` là "không lọc dự án", theo một trong ba dạng:

1. **Bỏ lọc trong SQL**: `projectId != null ? " AND x.project_id = ?" : ""` (hoặc `if (projectId)`
   không có `else`) → trả dữ liệu **mọi dự án, mọi org**.
2. **So khớp `null === null`**: `if (projectId != null && rowProject !== projectId) 404` hoặc
   `rowProject !== projectId` → với `projectId = null` và hàng legacy `project_id NULL`
   (towers/drawings/meetings cho phép NULL), phép so sánh "khớp" nên ghi/đọc được hàng mồ côi.
3. **Rơi về "dự án đầu tiên"**: `SELECT … FROM projects ORDER BY id LIMIT 1` để lấy tên/mã dự án
   cho file xuất → lộ tên/mã dự án của org khác.

## Khuôn sửa (theo S02)

| Loại route                       | Khi `projectId == null`                                                   |
| -------------------------------- | ------------------------------------------------------------------------- |
| Danh sách / tổng hợp (GET)       | **200 rỗng đúng shape** của phản hồi bình thường                          |
| Chi tiết / ghi / export / upload | **404** (`Không tìm thấy dự án` hoặc thông điệp 404 sẵn có của route)     |
| POST tạo mới                     | **422** `Chưa có dự án nào để tạo …` — đối xứng route anh em (contracts…) |

Hàm lib chỉ có route gọi → `projectId: number` **bắt buộc**, bỏ nhánh không lọc (typecheck chặn
caller mới truyền `null`). Hàm lib còn được gọi với `undefined` có chủ đích (test, thông báo nội
bộ) → giữ chữ ký, chặn `null` ở route (xem mục "Nợ").

## Bảng route đã sửa (rò thật, có test đỏ trên `3d09fa5`)

| Route                                       | Hàm lib                                                                                                    | Cách sửa                                                                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/design-changes`                   | `listDesignChanges` (`lib/ky-thuat/designchanges.ts`)                                                      | route null → `{ items: [] }`; `DesignChangeFilters.projectId: number` bắt buộc, luôn `dc.project_id = ?`                                                                         |
| `POST /api/design-changes`                  | `checkDesignChangeRefs(input, projectId: number)`                                                          | null → 422 trước validate (trước đây tạo hàng `project_id NULL`); bản vẽ tham chiếu phải `AND project_id = ?` (trước đây nhận drawingId org khác)                                |
| `GET/PATCH/DELETE /api/design-changes/[id]` | `getDesignChange(id, projectId: number)`, `markDrawingUpdated(id, pid)`                                    | null → 404; `UPDATE`/`DELETE … AND project_id = ?`                                                                                                                               |
| `POST /api/design-changes/[id]/decide`      | `decideDesignChange` (opts.projectId: number)                                                              | null → 404; luôn lọc dự án                                                                                                                                                       |
| `GET /api/gantt`                            | `getCpmData(systemId, projectId: number)` (`lib/tien-do/gantt-data.ts`)                                    | null → shape rỗng `{bars,deps,blocked,critical,criticalDeps,float}`; JOIN towers lọc dự án; **cạnh phụ thuộc** chỉ lấy khi cả hai đầu thuộc dự án                                |
| `GET /api/schedule-control`                 | `getScheduleControlData(systemId, projectId: number)`                                                      | null → `{critical:[],delayed:[],delayPareto:[],groupProgress:{}}`                                                                                                                |
| `GET /api/resources` (mọi view)             | `workloadByWeek`/`manpowerByWeek`/`assignmentConflicts`/`equipmentUsageByWeek` (`lib/vat-tu/resources.ts`) | null → `{from,to,workload:[],manpower:[]}` (+ `equipmentUsage`/`conflicts` rỗng theo view); `equipmentUsageByWeek` nay `JOIN equipment … e.project_id = ?` (trước đây không lọc) |
| `GET /api/documents-hub`                    | `listAllDocuments(user, projectId: number, …)` + 5 hàm nguồn                                               | null → `{ documents: [] }`                                                                                                                                                       |
| `GET /api/systems/[code]/upload-template`   | `buildPlanTemplate`/`buildTrackingTemplate` (`lib/tien-do/system-upload.ts`, helper `locDuAn`)             | null → 404 `Không tìm thấy dự án`                                                                                                                                                |
| `POST /api/systems/[code]/upload`           | `parsePlanUpload`/`parseTrackingUpload`                                                                    | resolve dự án ngay sau validate `kind`, **trước khi đọc file**; null → 404 (trước đây ghi tiến độ task mọi dự án theo mã)                                                        |
| `GET /api/admin/approval-flows`             | `listApprovalFlows(orgId, projectId: number)` (`lib/tien-do/approvals.ts`)                                 | null → `{ flows: [] }`; lọc `f.org_id = ?` + `(f.project_id = ? OR f.project_id IS NULL)` (trước đây flow toàn cục org khác vẫn hiện)                                            |
| `GET /api/admin/audit-log`                  | `buildAuditFilter(sp, projectId: number)` (`lib/bao-mat/audit.ts`)                                         | null → `{ rows: [], total: 0 }`; filter luôn bắt đầu `(al.project_id = ? OR al.project_id IS NULL)`                                                                              |
| `GET /api/admin/audit-log/export`           | như trên                                                                                                   | null → 404 `Không tìm thấy dự án`                                                                                                                                                |
| `GET /api/claims/eot-suggestion`            | `eotEvidenceSuggestion(projectId: number)` (`lib/tai-chinh/claims.ts`)                                     | null → `{ suggestedDays: 0, waitingFloors: 0 }`                                                                                                                                  |

### Phát hiện thêm trong lúc kiểm kê (cùng lớp lỗi, đã sửa)

| Route                                                                 | Dạng lỗi                                                                                           | Cách sửa                                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/norms/over`                                                 | (1) `overNormItems(t, projectId ?? undefined)`                                                     | null → `{ items: [] }`, truyền `projectId` tường minh                                                                     |
| `GET /api/diaries/[date]` (khối prefill)                              | (1) `buildDiaryPrefill(date, projectId ?? undefined)`                                              | `buildDiaryPrefill(date, projectId: number)`; null → prefill rỗng `{workDone:"",updatedBy:[],photos:[]}`                  |
| `GET /api/notifications` (`lib/dich-vu/thong-bao.ts`)                 | (1) 3 khối gọi không truyền dự án: `alarmingPoints()`, `overduePunch(uid)`, `exceededMonitoring()` | truyền `projectId ?? undefined` — route vốn đã chặn null, khối nào cũng lọc dự án hiện hành; dedup/dọn bản ghi giữ nguyên |
| `PATCH /api/drawings/revisions/[id]`, `GET …/file`, `POST …/withdraw` | (2) null === NULL legacy                                                                           | `getRevisionDrawingProject` chỉ gọi khi `projectId != null`, ngược lại coi như không tìm thấy → 404                       |
| `PATCH/DELETE /api/meetings/[id]/actions/[aid]`                       | (2)                                                                                                | `getMeetingAction` chỉ gọi khi `projectId != null` → 404                                                                  |
| `POST /api/approvals` (nghiệm thu theo lô)                            | (2) sheet NULL legacy được duyệt                                                                   | null → 404 `Không tìm thấy loại sheet này`, đặt trước `assertModuleEnabled`                                               |
| `GET /api/system-uploads/[id]/file`                                   | (2)                                                                                                | resolve dự án trước truy vấn; null → 404. Giữ 403 khi khác dự án (test `route-vat-tu-2` đang khoá hành vi này)            |
| `GET /api/export/excel`                                               | (3) mã dự án "đầu tiên" vào tên file                                                               | `SELECT code FROM projects WHERE id = ?` theo dự án hiện hành                                                             |
| `GET /api/work-fronts/report`                                         | (3) tên dự án "đầu tiên" trên PDF                                                                  | `SELECT name FROM projects WHERE id = ?`                                                                                  |

## Đã rà và xác nhận an toàn (null → rỗng/404 sẵn có)

`dashboard`, `notifications` (route), `systems`, `claims`, `contracts`, `insurance-bonds`,
`warranty-items`, `finance/summary`, `export/pdf`, `v1/kpi` (`requireApiKey` → 422), mọi helper
`loadExisting` (`if (projectId == null) return undefined`), `correspondences/[id]`, `proposals`,
`tenders/[id]` + award, `purchase-orders/[id]`, `admin/assignments` (422), `boq/coverage`
(`doPhuBoq` null → rỗng), `events`/`tasks/version` (`sheetVersion` null → `"0"`), `templates` (tĩnh),
`work-fronts` (`visibleProjectIds`), `personnel/[id]`, `qr`, `systems/[code]/uploads` (404).

5 dòng `NULL_AS_WIDE_SUSPECT` còn lại trong `S00-SCOPE-INVENTORY.md` đều là **dương tính giả** —
danh mục cấp org dùng chung `project_id IS NULL OR project_id = ?` có lọc `org_id`:
`admin/integrations` GET, `construction-stages/[id]` PATCH (400 khi null), `floor-stage-fronts` PUT
(400 khi null), `saved-reports` GET, `systems/[code]/uploads` GET (404 khi null).

## Route cố tình giữ wildcard (KHÔNG sửa)

| Vị trí                                                                                          | Lý do giữ                                                                                                                                |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/payments/floors/route.ts:51` `withProjectScope("*")`                                   | Route đã 404 khi null (`getCurrentProjectIdStrict`); SQL lọc `tw.project_id = ?` tường minh — `"*"` chỉ để JOIN bảng tài chính chịu RLS. |
| `lib/tien-do/constructionStages.ts:330` `stageMissingList` `withProjectScope(projectId ?? "*")` | Caller duy nhất có thể truyền null là thông báo/cron nội bộ; mọi route caller đã chặn null (`eot-suggestion` nay truyền `number`).       |
| `app/api/cron/*` (daily/weekly-report, sync-sheets…)                                            | Cron lặp từng dự án khả kiến theo org (N1) hoặc bắt buộc `GOOGLE_SHEET_PROJECT_ID`; không đi qua `getCurrentProjectId`.                  |
| `lib/bao-mat/permissions.ts:28` khoá cache `projectId ?? "*"`                                   | Khoá cache override cấp org, không phải scope dữ liệu.                                                                                   |

## Nợ: hàm lib còn nhánh "null = không lọc" nhưng mọi caller đã chặn

Không đổi chữ ký trong PR này (ngoài phạm vi, nhiều hàm được test gọi không tham số hoặc được thông
báo nội bộ gọi với `undefined`). Mọi route gọi tới đều đã 200-rỗng/404 khi null — nhưng **caller mới
có thể tái phát lỗi**; nên siết dần sang `projectId: number`:

- `lib/dich-vu/thong-bao.ts` `syncAndListNotifications(user, projectId: number | null)` (~30 khối
  ternary; test gọi ngoài request scope với `null`)
- `lib/hien-truong/`: correspondence, diary (`getDiaryByDate`, `listDiaryCalendar`, `missingDiaryDates`),
  environment, handover (kể cả `overduePunch`), hr, hse, kickoff, meetings, monitoring
  (`alarmingPoints`), risks, warranty
- `lib/tai-chinh/`: claims, contracts, finance, insurance, paymentcerts, procurement, proposals,
  tender, vo
- `lib/tien-do/`: approvals (`overdueApprovals`), constructionStages (`stageMissingList`),
  dashboardext, group-progress, kpi, report, workfronts
- `lib/ky-thuat/`: designchanges (`pendingDesignChanges`), drawings, engineering-kernel,
  engineering-workflow, qaqc, tech
- `lib/khoi-luong/norms.ts` `overNormItems`, `lib/vat-tu/equipment.ts`, `lib/van-hanh/alerts.ts`

## Phát hiện ngoài phạm vi (chuyển phiên chính — trạng thái cập nhật 2026-10-09)

1. ~~**`POST /api/dimensions/rename` không có scope dự án/org**~~ — đã sửa cùng PR S16 (JOIN theo dự án
   hiện hành, test `route-tien-do-3`).
2. ~~`PATCH /api/nav-settings` (global) gửi thông báo cho mọi PM toàn hệ~~ — đã sửa 2026-10-09: chỉ PM
   `org_id` của admin.
3. ~~`audit_log` không có `org_id` → hàng `project_id IS NULL` của org khác vẫn hiện~~ — đã sửa
   2026-10-09: `buildAuditFilter(…, orgId)` chỉ giữ bản ghi toàn cục khi `users.org_id` của người thao
   tác = org người xem (dòng không có người thao tác bị ẩn). Không thêm cột.
4. ~~`custom_field_defs` toàn cục không lọc org~~ — đọc đã do FORCE RLS org (0165) chặn; unique index
   `(entity_type, phạm vi, key)` toàn hệ đổi sang theo org ở migration 0169.
5. ~~Unique index `ux_flow_active` toàn hệ~~ — migration 0169: `ux_flow_org_active (org_id, entity_type,
COALESCE(project_id, 0)) WHERE active` (cùng mẫu `ux_alert_rule_org_active` ở 0161).
6. ~~`allocationOverNorm` gọi `overNormItems()` không tham số~~ — đã sửa 2026-10-09: lọc theo
   `proposals.project_id`.
7. ~~`stageMissingList` JOIN `work_packages` không ràng dự án~~ — đã sửa 2026-10-09 (PR #621).
8. ~~`system-uploads/[id]/file`: legacy NULL đọc được; 403 lộ id~~ — đã sửa 2026-10-09: hàng NULL chỉ
   hiện/tải được khi người upload cùng tổ chức (`PHAM_VI_UPLOAD`, `lib/tien-do/systems.ts`, dùng chung
   cho route lịch sử upload); khác dự án → 404.
9. `tests/project-scope-invariant.test.ts` đỏ sẵn trên `3d09fa5` vì `app/api/ready` (Q-AC07) chưa vào
   WHITELIST — không do PR này.

## Test

`tests/s16-null-scope.test.ts` — 18 ca `A1-AC03: …`, fixture 3 org (A có dự án, B có dữ liệu đánh dấu
`BI MAT ORG B`, C org chưa có dự án) + dữ liệu legacy `project_id NULL`; user PM 0 membership (org A),
PM có dự án (đối chứng), admin org C.

- Trên `3d09fa5` (code cũ): **18/18 đỏ** — mỗi ca đều là rò thật (vd design-changes trả `DCB3 … BI MAT
ORG B`, decide 200, POST 201 tạo hàng mồ côi, upload 200, revision/meeting action legacy 200, tên file
  export mang mã dự án khác).
- Sau sửa: **18/18 xanh**; ca đối chứng (PM có dự án vẫn thấy dữ liệu của mình, deps gantt trong dự án)
  vẫn xanh.
