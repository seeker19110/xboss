# PLAN.md — Dọn nốt sau đợt rà "route có backend nhưng UI không gọi" (2026-09-23)

**Cập nhật:** 2026-09-23 · **Nhánh làm việc:** `claude/amazing-dijkstra-la2kpd` (= `origin/main` `198781d`). **Trạng thái:** ĐÃ THI HÀNH — 5 việc gộp vào nhánh làm việc 2026-09-23 (coordinator không có công cụ Agent, phiên chính tự dispatch worker + reviewer).
**Bối cảnh (worker không thấy hội thoại):** đợt quét 2026-09-22/23 (xem `PROGRESS.md` mục "Xoá 2 module chỉ còn test/script tự gọi" và 3 mục "Khôi phục UI …") tìm ra nhiều route có backend + test nhưng không trang nào gọi. Đợt này xử lý phần còn lại theo quyết định của phiên chính: **nối UI** cho xoá baseline, tổ đội, mặt trận thi công (work_fronts) và 3 route kỹ thuật (impact/lineage/transition); **xoá** route `verify-proof`; **DROP** bảng mồ côi `engineering_closed_loop_sync_logs` bằng migration mới.

## Ràng buộc CỨNG (mọi việc)

- Đọc trước: `CLAUDE.md` (Auth, ADR-0007 tầng `lib/`, mục "Thiết kế giao diện (UI/UX)", Quy ước), `docs/adr/0009-bo-component-ui-nen.md`, `app/components/ui/*`, `app/components/dialogs.tsx` (`Modal`, `appConfirm`, `appAlert`, `appPrompt`), `app/components/Toast.tsx` (`showToast`), `app/lib/taiDuLieu.ts` (`taiJson`/`taiJsonMoi`).
- **Không đổi route/API/schema hiện có** (trừ Việc 4c xoá route và Việc 5 thêm migration). Không thêm/bớt quyền trong `CAN`. Không chạm `lib/bao-mat/`, `lib/tien-do/recompute.ts`.
- UI: dark-first, **không `dark:`/không hex**, thang `zinc` + màu nhấn `-300/-400`, nút ≥40px (kể cả `sm`), `aria-label` cho nút icon, hover nền đậm dần (`bg-{c}-700 hover:bg-{c}-800`, ADR-0010), emerald = hành động chính, amber/rose chỉ cảnh báo. Mọi chữ tiếng Việt. Loading dùng `Skeleton`, rỗng/lỗi dùng `EmptyState`/`ErrorState` (`app/components/EmptyState.tsx` — kiểm tên export thật trước khi dùng). Khung bảng cuộn ngang phải có `relative overflow-x-auto` (bài học #525).
- Client component **không được import module `lib/` có `import ... from "@/lib/db"`** (kéo `pg` vào bundle). Cần hằng số/type dùng chung thì tách ra file thuần (không import DB) trong cùng miền và re-export từ file gốc để caller cũ không đổi.
- Không dùng `any`. Import nội bộ qua alias `@/…`.
- Test chạm DB: `import "./setup"` (hoặc `HAS_TEST_DB` từ `./setup`) **dòng đầu**. Postgres cục bộ đang chạy: `TEST_DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/xboss_test`. Chạy 1 file: `TEST_DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/xboss_test npx tsx --test tests/<file>.test.ts`.
- Cổng trước khi báo xong (mỗi việc): `npm run lint`, `npm run typecheck`, test liên quan của việc, `npm run check:contrast`, `npm run check:mau-accent`, `npm run check:hex-hardcode`; việc thêm/tách file `lib/` chạy thêm `npm run check:lib-layers`; việc xoá file chạy thêm `npm run check:dead-code` + `npm run check:dead-routes`.
- Worker commit trên nhánh/worktree của mình, **không push**, không sửa `PROGRESS.md`/`docs/nang-cap/README.md` (phiên chính cập nhật). Commit message: conventional prefix + tiếng Việt, ghi `(dọn route 2026-09-23 việc N)`.

## Thứ tự & song song

- **Đợt 1 (song song, 5 worktree, base `origin/main`):** Việc 1 ∥ Việc 2 ∥ Việc 3 ∥ Việc 4 ∥ Việc 5 — tập file không giao nhau (V1 `app/components/SCurveChart.tsx`; V2 `app/personnel/**`; V3 `app/site/_components/WorkFrontsTab.tsx` + `lib/tien-do/workfront*.ts`; V4 `app/engineering/**`, `lib/ky-thuat/engineering-workflow*.ts`, `app/api/engineering/ledger/verify-proof/`, `tests/route-eng-mepf.test.ts`; V5 `migrations/0156_*.sql`, `docs/ERD.md`).
- Sau mỗi việc gọi `reviewer` soát diff nhánh đó. Coordinator gộp 5 nhánh vào nhánh làm việc `claude/amazing-dijkstra-la2kpd` theo thứ tự 5 → 1 → 2 → 3 → 4 (xung đột chỉ có thể ở `tests/route-eng-mepf.test.ts`/không có; xung đột logic → dừng, báo).
- Số migration: **`0156`** (file cao nhất hiện là `0155_drop_orphaned_engineering_zalo_tables.sql`). Nếu lúc gộp `origin/main` đã có `0156` khác → đổi thành số kế tiếp, không sửa nội dung.

## Việc 1 — Nút xoá baseline trong `SCurveChart` — `route: standard`

Route đã có: `DELETE /api/baselines/:id` (`app/api/baselines/[id]/route.ts`, Admin/PM = `CAN.editStructure`, 404 khi khác dự án, `baseline_tasks` xoá CASCADE; test `tests/baselines.test.ts`). UI chọn/chốt baseline ở `app/components/SCurveChart.tsx` (state `baselines`, `baseline`, nút "Chốt baseline" hiện cho mọi vai trò — server chặn 403).

- Thêm nút icon `Trash2` (lucide) **ngay sau select "Chọn baseline so sánh"**, chỉ render khi `baseline !== ""`; `aria-label="Xoá baseline đang chọn"`, `title` giải thích "Xoá baseline này (Admin/PM) — S-curve quay về kế hoạch hiện tại"; cùng cỡ/hình thức với nút "Chốt baseline" (viền `border-zinc-700`, nền `bg-zinc-800 hover:bg-zinc-700`, icon `text-rose-400`), cao ≥40px (sửa cả nút "Chốt baseline" lên `min-h-10` cho đồng bộ, không đổi nội dung).
- Bấm → `appConfirm(\`Xoá baseline "<tên>"? Dữ liệu snapshot sẽ mất, không hoàn tác được.\`)`; đồng ý → `fetch(\`/api/baselines/${id}\`, { method: "DELETE" })`bọc try/catch (mất mạng →`appAlert("Mất kết nối — chưa xoá được baseline")`, nút mở lại). `res.ok`→ bỏ khỏi`baselines`, `setBaseline("")`, `showToast("Đã xoá baseline", "success")`(kiểm chữ ký`showToast`thật); lỗi →`appAlert(j?.error ?? "Không xoá được baseline")`. State `deleting` để disable nút khi đang gọi.
- Không đổi fetch/tính toán biểu đồ, không đổi e2e (`e2e/authed/dashboard.spec.ts` chỉ cần heading "S-curve").

Tiêu chí: typecheck/lint xanh; kiểm tay bằng `next dev` + DB test nếu tiện (không bắt buộc); `check:contrast`/`check:mau-accent`/`check:hex-hardcode` xanh.
Commit: `feat(dashboard): nút xoá baseline đang chọn trong S-curve (dọn route 2026-09-23 việc 1)`.

## Việc 2 — Quản lý tổ đội & thành viên ở trang `/personnel` — `route: standard`

Hiện trạng: **chưa từng có UI** tạo/sửa/xoá tổ đội hay gán thành viên (không phải hồi quy — `git log -S` không thấy). Trang `/org` ghi "tạo tổ đội ở trang Nhân sự" nhưng `/personnel` chỉ có select lọc theo tổ đội. Backend + test đã có:

- `GET /api/crews` → `{ crews: CrewRow[] }` (`lib/hien-truong/hr.ts::listCrews`: `id, projectId, name, systemId, systemName, supplierId, supplierName, leaderId, leaderName, memberCount`). Mọi vai trò xem.
- `POST /api/crews` body `{ name, systemId?, supplierId?, leaderId? }` (Admin/PM = `CAN.manageHr`; 409 trùng tên; 422 validate). `PATCH /api/crews/:id` cùng body (chỉ gửi trường đổi). `DELETE /api/crews/:id` (409 "đã có dữ liệu chấm công").
- `POST /api/crews/:id/members` body `{ personnelId }` (201, idempotent). `DELETE /api/crews/:id/members?personnelId=` (200). Thành viên của 1 tổ = `GET /api/personnel?crewId=<id>` (trả `{ personnel: [...] }` — kiểm tên khoá thật trong `app/api/personnel/route.ts`); `GET /api/personnel` (không lọc) để chọn người thêm vào tổ.
- Danh mục: hệ thi công `GET /api/systems` → `{ systems: [{ id, name, ... }] }` (kiểm shape trong `lib/tien-do/systems.ts::listSystems`); nhà thầu phụ `GET /api/suppliers` (trang đã tải, state `suppliers`).
- Test route: `tests/route-hien-truong-2.test.ts` (crews + members) — không cần thêm test route; UI-only.

Điểm chạm:

- Mới `app/personnel/_components/CrewsModal.tsx` (mở từ nút "Tổ đội" — `Button` variant phụ, icon `Users`, cạnh "Thêm nhân sự" trong `bottomActions` của `AppHeader`; mọi vai trò mở được để xem, nút ghi chỉ khi `canManage`). Bố cục 2 mức trong 1 `Modal`:
  1. **Danh sách tổ đội**: bảng/danh sách thẻ: tên, hệ, NTP, đội trưởng, số thành viên; nút "Thêm tổ đội" (canManage); mỗi dòng: "Thành viên" (mở mức 2), "Sửa", "Xoá" (canManage; xoá qua `appConfirm`, lỗi 409 hiện đúng `error` server bằng `showToast(..., "error")`).
  2. **Form tổ đội** (thêm/sửa, cùng modal, quay lại được): tên (bắt buộc), hệ (select từ `/api/systems`, có "— Không —"), NTP (select từ `suppliers`), đội trưởng (select từ `/api/personnel` — hiện `fullName (code)`); lưu → POST/PATCH; 409/422 hiện `error` server.
  3. **Thành viên** của tổ: danh sách từ `/api/personnel?crewId=`; nút xoá từng người (canManage, `appConfirm`) → DELETE members; select "Thêm thành viên" liệt kê nhân sự **chưa** thuộc tổ (lọc theo id) + nút "Thêm" → POST members; sau mỗi thay đổi tải lại danh sách thành viên + gọi `onChanged`.
- `app/personnel/page.tsx`: state mở modal; `onChanged` của modal → tải lại `crews` (`/api/crews`) và `loadPersonnel()` (cột "TỔ ĐỘI" hiện `crewNames`). Sửa thông điệp `EmptyState` ở `app/org/page.tsx` nếu cần cho khớp ("tạo tổ đội ở trang Nhân sự → nút Tổ đội").
- Không đổi bộ lọc hiện có; mobile 390px không tràn ngang (khung cuộn `relative`).

Tiêu chí: Admin tạo tổ → sửa → thêm 2 thành viên → cột TỔ ĐỘI ở bảng nhân sự hiện tên tổ → bỏ 1 thành viên → xoá tổ (không có chấm công) thành công; viewer mở modal chỉ thấy danh sách, không thấy nút ghi. Lint/typecheck/check UI xanh.
Commit: `feat(nhan-su): quản lý tổ đội & thành viên trong trang /personnel (dọn route 2026-09-23 việc 2)`.

## Việc 3 — Tab "Mặt Bằng & Phân Khu" ở `/site` dùng dữ liệu `work_fronts` thật + tài liệu mặt trận — `route: spec`

Hiện trạng: `app/site/_components/WorkFrontsTab.tsx` là **thẻ demo** — fetch `/api/work-fronts` rồi đọc sai khoá (`data.fronts`, API trả `workFronts`) nên luôn rơi về mảng `DEFAULT_FLOORS` hardcode. Mô hình `work_fronts` (G05/M14: `UNIQUE(sheet_type_id, floor_label)`, status `pending → handed_over → in_progress → returned`, `blocker`, `note`; `work_front_documents` biên bản/ảnh) vẫn được lưới tracking (badge "Chưa có mặt bằng"), `/api/lookahead` (`waitingFront`), thông báo `front_missing`, dashboard và báo cáo EOT dùng — nhưng **không còn UI nào đổi trạng thái hay xem tài liệu** (trang `/work-fronts` nay là ma trận tầng × công tác của bảng khác: `floor_stage_fronts`, không đụng).

API đã có (đọc kỹ trước khi làm):

- `GET /api/work-fronts?sheetTypeId=` → `{ workFronts: WorkFrontRow[] }` (`lib/tien-do/workfronts.ts`: `id, sheetTypeId, sheetCode, floorLabel, status, handedOverAt, returnedAt, blocker, note, updatedAt`). Mọi vai trò; module `field` tắt → response chặn của `assertModuleEnabled` (kiểm mã/shape trong `lib/ha-tang/feature-flags.ts`).
- `PATCH /api/work-fronts/:id` body `{ status, handedOverAt?, returnedAt?, blocker?, note? }` (Admin/PM/kỹ sư = `CAN.manageWorkFronts`; chỉ Admin được lùi trạng thái; 409 khi vi phạm, 422 status sai).
- `GET /api/work-fronts/:id/documents` → `{ documents: [{ id, fileName, mime, createdAt, uploadedBy, uploaderName }] }`; `POST` multipart field **`file`** (PDF/ảnh, max `MAX_DOC_BYTES` 20MB, `CAN.manageWorkFronts`) → 201 `{ id }`; `GET /api/work-front-documents/:id` stream file; `DELETE /api/work-front-documents/:id` (người upload hoặc `CAN.manageWorkFronts`).
- `GET /api/sheets` → `{ sheets: [{ id, code, name, slug, ... }] }`.
- Test route đã có: `tests/route-tien-do-3.test.ts` (documents), `tests/workfronts.test.ts`. Không thêm test route.

Điểm chạm:

1. **Tách hằng số thuần**: mới `lib/tien-do/workfront-status.ts` (KHÔNG import gì từ `@/lib/db`) chứa `WORK_FRONT_STATUSES`, `WorkFrontStatus`, `WORK_FRONT_STATUS_LABEL`, `STEP_ORDER` (export), `isForwardTransition`; `lib/tien-do/workfronts.ts` import + `export { … } from "./workfront-status"` để mọi caller cũ giữ nguyên. `npm run check:lib-layers` + `check:dead-code` xanh.
2. **Viết lại `WorkFrontsTab.tsx`** (xoá hẳn `DEFAULT_FLOORS` và mọi `any`):
   - Fetch song song `/api/work-fronts` + `/api/sheets` + `fetchMe()` (`app/lib/me.ts`). `canManage = me.role ∈ {admin, pm, engineer}`; `isAdmin = me.role === "admin"`.
   - Header khối: tiêu đề "Mặt bằng thi công theo tầng × sheet", mô tả ngắn; 4 `Chip`/thẻ đếm theo trạng thái (Chưa bàn giao / Đã bàn giao / Đang thi công / Đã trả) tính từ dữ liệu.
   - **Ma trận**: hàng = `floorLabel` (sắp bằng `sortFloorsDesc` từ `@/lib/nen/floors`), cột = các sheet có trong `workFronts` (theo `sheetTypeId`, nhãn `sheetCode`); ô = nút (≥40px) hiện nhãn trạng thái rút gọn + icon (`Clock` pending zinc, `Handshake`/`ArrowRightLeft` handed_over sky, `Hammer` in_progress amber, `CheckCircle2` returned emerald — chọn icon có trong lucide), màu chữ/viền `-300/-400` + nền `bg-{c}-500/10`; có `blocker` → thêm icon `AlertTriangle` rose + `title`. Header dính, cột tầng `sticky left-0`, khung `relative overflow-x-auto`.
   - Không có dữ liệu → `EmptyState` "Chưa có ô mặt bằng — ô được tạo tự động từ tầng của lưới tracking". Module tắt / lỗi → `ErrorState` với thông điệp server.
   - Bấm ô → mở **`WorkFrontModal`** (file mới `app/site/_components/WorkFrontModal.tsx`, dùng `Modal` của `dialogs.tsx`):
     - Tiêu đề "<sheetCode> · Tầng <floorLabel>", chip trạng thái hiện tại, `updatedAt` (`formatDateTimeVN`).
     - Form (chỉ khi `canManage`): select trạng thái — mọi `WORK_FRONT_STATUSES` với admin, còn lại chỉ status có `STEP_ORDER >= STEP_ORDER[hiện tại]`; `handedOverAt`, `returnedAt` (input `date`, hiện khi status ≥ tương ứng, có thể để trống); `blocker` (input, gợi ý "Lý do chưa bàn giao được"), `note` (textarea). Nút "Lưu" → PATCH; 409/422 hiện `error` server bằng `showToast(..., "error")`; thành công → `showToast("Đã cập nhật mặt bằng")`, gọi `onChanged` (tab tải lại). Không phải `canManage` → hiện chỉ đọc.
     - Khối **"Biên bản & ảnh hiện trạng"**: tải `taiJsonMoi` (không cache SW) danh sách; mỗi dòng: icon theo `mime` (ảnh → thumbnail `<img src="/api/work-front-documents/:id" loading="lazy">` cao 64px; PDF → `FileText`), `fileName`, người + thời gian, nút mở tab mới (`<a target="_blank" rel="noreferrer">`), nút xoá (`Trash2`, chỉ khi `me.id === uploadedBy || canManage`, `appConfirm`). Nút "Tải lên" (`canManage`) → `<input type="file" accept="application/pdf,image/*">` → `FormData` field `file` → POST; đang tải hiện "Đang tải…"; lỗi hiện `error` server. Bám bố cục `app/hse/_components/HsePhotosModal.tsx`.
3. `public/sw.js`: nếu `/api/work-front-documents/` chưa nằm trong danh sách loại trừ cache (kiểm bằng `npm run check:sw-exclude` + đọc file), thêm vào như `/api/hse-photos/` và tăng `CACHE` version. Nếu đã có thì không đụng.

Tiêu chí: với Postgres test + `next dev` (hoặc Playwright nếu môi trường có): Admin thấy ma trận từ dữ liệu thật (không còn dòng "FL06 Tầng 6 Căn Hộ" demo), đổi 1 ô `pending → handed_over` kèm ngày → ô đổi màu + đếm cập nhật; kỹ sư không thấy lựa chọn lùi trạng thái; upload 1 PDF → hiện trong danh sách, mở được, xoá được; viewer mở modal chỉ đọc. `lint`, `typecheck`, `check:lib-layers`, `check:dead-code`, `check:sw-exclude`, `check:contrast`, `check:mau-accent`, `check:hex-hardcode` xanh; e2e `e2e/authed/work-fronts.spec.ts` không bị ảnh hưởng (trang khác).
Commit: `feat(hien-truong): tab Mặt bằng & Phân khu dùng work_fronts thật — đổi trạng thái + biên bản/ảnh mặt trận (dọn route 2026-09-23 việc 3)`.

## Việc 4 — Engineering: nối transition/impact/lineage vào UI, xoá `verify-proof` — `route: standard`

**4a. Chuyển trạng thái workflow thủ công** — route `POST /api/engineering/workflows/:id/transition { to, reason? }` (`CAN.createEngineeringWorkflow` = admin/pm/engineer; 422 trạng thái sai; lib `transitionWorkflow` kiểm `canTransition`). Trang `app/engineering/workflows/page.tsx` hiện có nút "Trình duyệt" (`draft → validating` qua `/submit`) và duyệt/từ chối cửa (`awaiting_approval` qua `/gates/:seq`), nhưng không cách nào đưa workflow đã duyệt sang `executing → validating_result → completed`, hay `cancelled/failed/rolled_back`.

- Tách hằng số thuần: mới `lib/ky-thuat/engineering-workflow-states.ts` (KHÔNG import DB) chứa `WORKFLOW_STATES`, `WorkflowState`, `WORKFLOW_STATE_LABELS`, `ALLOWED_TRANSITIONS`, `canTransition` (cắt nguyên văn từ `lib/ky-thuat/engineering-workflow.ts` dòng ~102–153); file gốc import lại + `export { … } from "./engineering-workflow-states"` để route/test cũ không đổi. `check:lib-layers`/`check:dead-code` xanh.
- Trang workflows: thay map cục bộ `STATE_LABEL` bằng `WORKFLOW_STATE_LABELS` import từ file thuần (giữ `STATE_CLS`). Trong modal chi tiết, dưới khối nút hiện có, thêm khối "Chuyển trạng thái thủ công": `targets = ALLOWED_TRANSITIONS[wf.state]` **trừ** `validating` khi `wf.state === "draft"` (đã có "Trình duyệt") và trừ `approved`/`rejected` khi `wf.state === "awaiting_approval"` (đi qua cửa duyệt); `targets.length === 0` → không render khối. UI: select đích (nhãn tiếng Việt từ `WORKFLOW_STATE_LABELS`), textarea "Lý do (tuỳ chọn, ≤2000 ký tự)", nút "Chuyển" (`bg-emerald-700 hover:bg-emerald-800`; đích ∈ {`cancelled`,`failed`,`rolled_back`} → `appConfirm` trước và nút màu rose). Gọi `post(\`/api/engineering/workflows/${id}/transition\`, { to, reason })`(helper`post`sẵn có) → thành công: tải lại danh sách + chi tiết,`showToast`. Ghi chú 1 dòng cạnh khối (từ comment route): "Hệ chỉ ghi nhận — việc thực thi ngoài đời do người xác nhận".
- Trang chưa có `me` → không cần: server chặn 403, hiện `error` server như các nút khác.

**4b. Tác động & phả hệ của đối tượng kỹ thuật** — routes `GET /api/engineering/impact/:id?depth=` → `ImpactAnalysisResult { targetObject, upstreamCount, downstreamCount, upstreamNodes[], downstreamNodes[], criticalPathAlerts[] }` và `GET /api/engineering/lineage/:id` → `ObjectLineageResult { object, source, revisions[], relations { outgoing[{relationType,target}], incoming[{relationType,source}] }, suggestions[], workflows[] }` (`lib/ky-thuat/engineering-graph.ts` dòng 8–58; `GraphNode { id, externalKey, objectType, name, discipline, status }`; quyền `CAN.viewEngineeringGraph`). Trang `app/engineering/page.tsx` có modal chi tiết đối tượng (`selectedId`, `detail`) nhưng không gọi 2 route này.

- Trong modal chi tiết (sau khối "Quan hệ", trước "Lịch sử gần nhất"), thêm 2 nút phụ (`bg-zinc-800 hover:bg-zinc-700`, ≥40px, icon `GitBranch` cho "Phả hệ", `Radar`/`Waypoints` cho "Tác động" — chọn icon có trong lucide): bấm → fetch tương ứng (state riêng, `Skeleton` khi tải, `showToast` lỗi), kết quả render ngay dưới nút dạng khối `bg-zinc-950 rounded-lg p-3 text-xs`:
  - Tác động: 2 số đếm (ngược dòng / xuôi dòng), `criticalPathAlerts` là danh sách `text-amber-300` kèm `AlertTriangle` (rỗng → "Không có cảnh báo đường găng"), 2 danh sách node (`name ?? externalKey · objectType`, tối đa 20 dòng + "… và N nữa").
  - Phả hệ: nguồn (`sourceType · externalKey · revisionName`), danh sách phiên bản (`#revisionNumber — changeSummary`), quan hệ vào/ra (`relationType → name ?? externalKey`), đề xuất (`title · status · riskLevel`), workflow liên quan (`title · nhãn state`, link `/engineering/workflows`). Rỗng → dòng "—".
  - Bấm lại nút → ẩn khối (toggle). Đổi `selectedId` → reset 2 state.

**4c. Xoá `POST /api/engineering/ledger/verify-proof`** — route nhận `leafHash/proof/expectedRoot` do client tự gửi và chỉ gọi hàm thuần `verifyMerkleProof`; không trang nào phát hành proof hay gọi route này, sổ cái Merkle trên UI chỉ là 1 con số đếm (`/engineering-intelligence`). Xoá thư mục `app/api/engineering/ledger/verify-proof/`, xoá block test tương ứng trong `tests/route-eng-mepf.test.ts` (dòng ~599–620 và dòng liệt kê ở header comment ~18), rà `scripts/`, `docs/` (chỉ sửa `docs/nang-cap/M73-*.md` nếu có dòng liệt kê route — thêm ghi chú "đã xoá 2026-09-23, không có UI"), giữ nguyên `lib/ky-thuat/engineering-merkle-ledger.ts` (route `merkle` còn dùng; nếu `verifyMerkleProof` thành export không ai dùng thì **vẫn giữ** — hàm thuần có test đơn vị, không phải module chết). Chạy `check:dead-code`, `check:dead-routes`, `check:route-perms`, `check:project-scope` xanh; test `tests/route-eng-mepf.test.ts` xanh với DB test.

Tiêu chí: 4a — workflow ở `approved` chuyển được sang `executing` rồi `validating_result` → `completed` qua UI; ở `draft` khối chỉ đưa ra `cancelled`. 4b — mở đối tượng có quan hệ, bấm "Tác động"/"Phả hệ" thấy dữ liệu, không lỗi console. 4c — cổng ở trên xanh. Toàn bộ: lint/typecheck/check UI xanh.
Commit (1 commit hoặc 3 commit nhỏ đều được): `feat(ky-thuat): chuyển trạng thái workflow thủ công + tác động/phả hệ đối tượng trên UI, xoá route verify-proof không UI (dọn route 2026-09-23 việc 4)`.

## Việc 5 — Migration `0156` DROP bảng mồ côi `engineering_closed_loop_sync_logs` + ERD — `route: mechanical`

Bảng do `migrations/0104_scan_to_bim_closed_loop.sql` tạo; lib/route dùng nó (`lib/ky-thuat/engineering-closed-loop-sync.ts`, `app/api/engineering/closed-loop-sync`) đã xoá 2026-09-23 (xem `PROGRESS.md` mục "Xoá 2 module chỉ còn test/script tự gọi"). Đã grep toàn repo: chỉ còn `migrations/0104_*.sql`, `docs/ERD.md`, `PROGRESS.md` nhắc tới — không test/script/lib nào đọc/ghi (`tests/rls.test.ts`, `lib/ha-tang/retention.ts`, `scripts/dem-du-lieu-engineering.ts` đều không liệt kê). Không bảng nào `REFERENCES` tới nó.

- Mới `migrations/0156_drop_orphaned_closed_loop_sync_logs.sql`: header comment **bám đúng phong cách `0155_drop_orphaned_engineering_zalo_tables.sql`** (lý do, đã rà repo, cảnh báo ⚠️ ĐỤNG DỮ LIỆU phải qua staging + `npm run db:migrate -- --dry-run`, KHÔNG đi thẳng production), thân: `DROP TABLE IF EXISTS engineering_closed_loop_sync_logs CASCADE;`. Không đụng bảng `engineering_scan_to_bim_runs` (cùng migration 0104 — kiểm bằng grep xem còn code dùng không; nếu **cũng** mồ côi thì KHÔNG tự DROP, chỉ ghi vào báo cáo cho phiên chính quyết).
- Sinh lại `docs/ERD.md` bằng công cụ (KHÔNG sửa tay): tạo DB tạm `psql -h 127.0.0.1 -U ci -d postgres -c "CREATE DATABASE xboss_erd"`, rồi `DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/xboss_erd npm run db:migrate` và `DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/xboss_erd npm run gen:erd`. Diff `docs/ERD.md` phải **chỉ** mất block `### engineering_closed_loop_sync_logs` (khoảng dòng 4211–4232); nếu diff có thay đổi khác → dừng, báo (không commit ERD lệch).
- `npm run check:migrations` xanh; chạy `TEST_DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/xboss_test npx tsx --test tests/rls.test.ts tests/migrate.test.ts` (file nào tồn tại) xanh.

Tiêu chí: 2 file đổi (`migrations/0156_*.sql`, `docs/ERD.md`); các cổng trên xanh.
Commit: `chore(db): migration 0156 DROP bảng mồ côi engineering_closed_loop_sync_logs + sinh lại ERD (dọn route 2026-09-23 việc 5)`.

## Ngoài kế hoạch (phiên chính tự làm sau khi gộp)

- Cập nhật `PROGRESS.md`; ghi chú `.env.example` (phiên không mở được file `.env*` — hướng dẫn người dùng sửa tay); chạy `npm test -- --release-gate` với DB test; push + mở PR + merge khi CI xanh; nhắc migration 0156 phải qua staging.
