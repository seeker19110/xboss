# PLAN.md — Đợt 4 chiến dịch coverage: phủ test THỰC THI cho các cụm route `app/api/**` phi-engineering còn lại

**Cập nhật:** 2026-09-05 · **Nguồn:** `PROGRESS.md` các mục "Đợt 1/2/3 chiến dịch coverage" (2026-09-04) +
mục "Đợt sau" của Đợt 3; khuôn test đã chốt ở `tests/helpers/phien.ts`, `tests/route-*.test.ts`.
Mục tiêu người dùng đã chốt từ Đợt 1: nâng coverage lên cao nhất có thể (lines 100%), làm dần theo đợt.
**Nhánh nền:** `claude/tiep-tuc-yu4ib7` — đã reset lên `origin/main` sau khi PR #477 merge. Base MỌI
worktree trên nhánh này (trước khi bắt đầu: `git fetch origin` và kiểm `git log -1 origin/main` khớp).
**Trạng thái thi hành:** ĐANG THI HÀNH — giao nguyên văn tệp này cho `coordinator`.

## Bối cảnh & ràng buộc CỨNG cho mọi việc

- Worker không thấy hội thoại. Bắt buộc đọc trước: `CLAUDE.md`; `tests/helpers/phien.ts` (toàn bộ
  comment đầu file); MỘT file mẫu cùng khuôn: `tests/route-to-chuc-thau-phu.test.ts` (route có
  `[id]`, subcon, project scope) và `tests/route-ban-ve-ho-so.test.ts` (route upload multipart —
  `FormData` + `File`, `params: Promise.resolve({ id })`); `tests/route-cron.test.ts` (route dùng
  biến môi trường, cách đặt/khôi phục env); `PROGRESS.md` mục "Đợt 2 chiến dịch coverage" phần
  "Bài học hạ tầng test" và "5 BUG THẬT".
- **Test phải THỰC THI route handler thật** (import `@/app/api/.../route`, gọi `GET/POST/...` với
  `NextRequest`), KHÔNG tái hiện SQL trong test, KHÔNG `assert.match` trên mã nguồn route. Mỗi
  handler trong phạm vi phải có tối thiểu: ca 401 chưa đăng nhập (`dangXuat()`), ca 403 sai vai trò
  (nếu route có kiểm `CAN`/vai trò), ca hạnh phúc (200/201) kiểm đúng dữ liệu trả về/ghi DB, ca
  validate (400/422) cho input sai, ca 404 xuyên dự án/xuyên org khi route có lọc dự án/org (tạo 2
  dự án, id của dự án B dưới phiên dự án A → 404), ca ranh giới nghiệp vụ đặc thù của route (chuyển
  trạng thái không hợp lệ, không được xoá bản ghi đã dùng, idempotency…).
- **Mọi ca có dự án dùng `dangNhapDuAn(user, projectId)`** (không `dangNhap` trần). Trước khi báo
  xong, worker chạy bước **kiểm chứng chống nhiễu**: chèn 1 dòng lạ vào `user_projects` (user ngẫu
  nhiên, dự án ngẫu nhiên) rồi chạy lại file — phải vẫn xanh; xong thì xoá dòng đó.
- Dữ liệu test tự tạo bằng `insertId`/`run` qua `@/lib/db` với hậu tố duy nhất (`uniq()` như file
  mẫu). Không `DELETE`/`TRUNCATE` bảng dùng chung (`users`, `projects`, `user_projects`…), không
  sửa `tests/setup.ts`/`tests/helpers/phien.ts` (thiếu helper → thêm hàm nhỏ trong chính file test).
- File test: `tests/route-<ten-cum>.test.ts` (tên trong brief), đầu file: `import { HAS_TEST_DB } from
"./setup"` rồi `import ... from "./helpers/phien"` TRƯỚC mọi import route; `const S = { skip:
!HAS_TEST_DB }` cho mọi `test(...)`. Comment đầu file liệt kê đủ route được phủ (như file mẫu).
- **Postgres cục bộ đã dựng sẵn**: server ở `127.0.0.1:5433`, user `postgres`, không mật khẩu. Mỗi
  việc dùng DB RIÊNG để không đụng nhau khi chạy song song:
  `createdb -h 127.0.0.1 -p 5433 -U postgres xboss_test_<ma_viec>` rồi
  `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/xboss_test_<ma_viec>`. Migration tự áp khi
  query đầu tiên (`ensureSchema`). Lệnh chạy 1 file (BẮT BUỘC có cờ mock module):
  `TEST_DATABASE_URL=... node --experimental-test-module-mocks --import ./node_modules/tsx/dist/loader.mjs --test tests/<file>.test.ts`
  (`npx tsx --test` trần sẽ đỏ vì thiếu cờ). Muốn kiểm "DB sạch hoàn toàn": `dropdb` + `createdb`
  lại rồi chạy.
- **Worktree**: `node_modules` không tự có trong worktree; tạo symlink
  `ln -s /home/user/xboss/node_modules <worktree>/node_modules` (cùng commit, cùng `package.json`)
  thay vì `npm ci` lại. Nhớ lệnh lint/typecheck chạy từ thư mục worktree.
- **Khi test lộ BUG THẬT trong route** (đúng lớp đã gặp ở Đợt 2/3: 401 bị trả thành 403 do gộp
  `!user || !CAN`; `PATCH`/`DELETE` theo `:id` không lọc `org_id`/dự án trong khi `GET` cùng cụm đã
  lọc; validate thiếu ngày thật (`isValidDateISO` ở `lib/nen/date.ts`); lộ dữ liệu xuyên dự án):
  **sửa tối thiểu ngay trong route cùng nhánh**, bám đúng khuôn route anh em đã đúng, viết ca test
  chứng minh, ghi rõ trong báo cáo (route, triệu chứng, cách sửa). Bug đòi quyết định thiết kế
  (vd bảng "toàn hệ" không có `org_id`, đổi schema, đổi hợp đồng API) → KHÔNG sửa, KHÔNG viết test
  khoá hành vi sai, ghi vào mục "Ghi nhận, chưa sửa" của báo cáo.
- **Không** đụng `lib/tien-do/recompute.ts`, `lib/bao-mat/auth.ts`, `lib/khoi-luong/boq.ts`,
  `lib/vat-tu/material-sync.ts` (vùng rủi ro cao — chỉ được sửa route). Không thêm migration.
- Route gửi ra ngoài (email/Telegram/Zalo/push/Google Sheet/S3) → test phải chặn mạng: đặt biến
  môi trường thiếu để route đi nhánh no-op/preview, hoặc `mock.module` đúng module gửi (xem
  `tests/route-cron.test.ts`, `tests/material-sync.test.ts`); không được để test gọi mạng thật.
- Route trả file/stream (`.../file`, `photos/[id]`, `export/excel`, `qc/documents/export/zip`,
  `qr/labels`) → kiểm `status`, `content-type`, và với tệp đã upload trong test thì kiểm byte trả về
  khớp byte đã gửi. Ảnh/PDF giả: dùng byte thật tối thiểu như `PDF_BYTES`/PNG 1×1 trong file mẫu
  (route có `verifyFileMime`).
- Tiếng Việt toàn bộ tên ca test/comment/commit. Worker KHÔNG push — commit trong worktree (1 commit
  cho test + 1 commit riêng cho mỗi bug fix route nếu có), coordinator tích hợp tuần tự vào nhánh nền.
- **Cổng mỗi việc**: file test của mình xanh trên DB riêng vừa `dropdb/createdb` sạch; kiểm chứng
  chống nhiễu `user_projects` xanh; `npx eslint tests/<file>.test.ts <route đã sửa>` xanh;
  `npm run typecheck` xanh; nếu có sửa route thì chạy thêm các file test cũ có nhắc tới route đó
  (`grep -l "<đường dẫn route>" tests/*.test.ts`) — phải vẫn xanh.
- Tiêu chí số lượng: mỗi route trong phạm vi được chạm ít nhất 1 ca; mục tiêu **lines ≥ 90% cho từng
  file route** trong phạm vi (đo bằng `node --experimental-test-coverage ...` trên file của mình,
  đọc bảng coverage cuối output — chỉ nhìn các dòng `app/api/...` thuộc phạm vi).

---

# Pha 1 — 7 việc song song, mỗi việc 1 cụm route, 1 worktree, 1 file test

Không phụ thuộc lẫn nhau. Danh sách route dưới đây là **304 route chưa có test nào nhắc tới** (đo
2026-09-05 bằng grep đường dẫn thư mục route trong `tests/`), đã trừ toàn bộ `app/api/engineering/**`
(để Đợt 5). Route nào worker thấy đã có test thực thi ở file khác thì bỏ qua và ghi rõ trong báo cáo.

## Việc V1 — Tài chính cụm 3a: thanh toán · tạm ứng · hoá đơn · lương · chi phí — `route: standard`

File: `tests/route-tai-chinh-3a.test.ts`. Phạm vi (18 route):

- `app/api/advances/route.ts`, `app/api/advances/[id]/route.ts`
- `app/api/cash-transactions/route.ts`, `app/api/cash-transactions/[id]/route.ts`
- `app/api/invoices/route.ts`, `app/api/invoices/[id]/route.ts`, `app/api/invoices/[id]/restore/route.ts`
- `app/api/payments/route.ts`, `app/api/payments/bills/route.ts`, `app/api/payments/bills/[id]/route.ts`,
  `app/api/payments/floors/route.ts`
- `app/api/payroll/route.ts`, `app/api/payroll/[id]/route.ts`
- `app/api/payment-certs/[id]/submit/route.ts`, `app/api/payment-certs/[id]/decide/route.ts`
- `app/api/costs/route.ts`, `app/api/costs/settings/route.ts`, `app/api/finance/summary/route.ts`

Lưu ý nghiệp vụ: tiền là NUMERIC — so sánh số tiền trả về bằng `Number(...)`/chuỗi đúng như route trả,
không tự cộng tiền trong test bằng float để suy kết quả (đọc quy ước "Tiền tệ (M45 PR1)" trong
`CLAUDE.md`). `payment-certs` submit/decide là luồng duyệt: kiểm SoD/vai trò (`CAN.approve`),
chuyển trạng thái không hợp lệ → 4xx, quyết định 2 lần → không ghi đè. `PAYMENT_VIEW_ROLES`
(`admin/pm/bch`) cho GET tài chính — kiểm `engineer`/`subcon` → 403.

**Tiêu chí chấp nhận:** cổng chung; tất cả 18 route được chạm; kiểm xuyên dự án cho mọi route có
`[id]`.

## Việc V2 — Tài chính cụm 3b: hợp đồng · khiếu nại · VO · đấu thầu · bảo lãnh · NCC — `route: standard`

File: `tests/route-tai-chinh-3b.test.ts`. Phạm vi (22 route):

- `app/api/contracts/[id]/addenda/route.ts`, `app/api/contracts/[id]/addenda/[aid]/route.ts`,
  `app/api/contracts/[id]/documents/route.ts`, `app/api/contract-documents/[id]/route.ts`,
  `app/api/contracts/[id]/restore/route.ts`
- `app/api/claims/[id]/reject/route.ts`, `app/api/claims/[id]/restore/route.ts`,
  `app/api/claims/[id]/settle/route.ts`, `app/api/claims/[id]/documents/route.ts`,
  `app/api/claim-documents/[id]/route.ts`, `app/api/claims/eot-suggestion/route.ts`
- `app/api/variations/[id]/submit/route.ts`, `app/api/variations/[id]/contract-add/route.ts`,
  `app/api/variations/[id]/documents/route.ts`, `app/api/vo-documents/[id]/route.ts`
- `app/api/tenders/[id]/bids/route.ts`, `app/api/tenders/[id]/bids/[bidId]/route.ts`,
  `app/api/tenders/[id]/bids/[bidId]/file/route.ts`, `app/api/tenders/[id]/award/route.ts`
- `app/api/insurance-bonds/[id]/file/route.ts`, `app/api/insurance-bonds/[id]/restore/route.ts`
- `app/api/suppliers/[id]/ratings/route.ts`, `app/api/suppliers/[id]/summary/route.ts`

Lưu ý: các route `documents`/`file` là upload/stream (khuôn `tests/route-ban-ve-ho-so.test.ts`);
`restore` là khôi phục bản ghi đã xoá mềm (kiểm: chưa xoá → 4xx hoặc no-op đúng như route; xuyên dự
án → 404). `award` chỉ Admin/PM, gói đã trao → không trao lại. `eot-suggestion` là tính toán thuần
từ dữ liệu trễ — dựng 1 task trễ thật rồi kiểm số ngày gợi ý.

**Tiêu chí chấp nhận:** cổng chung; 22 route được chạm.

## Việc V3 — Tiến độ/WBS cụm 3: giai đoạn · mặt trận · nghiệm thu tầng · phụ thuộc · lưới — `route: standard`

File: `tests/route-tien-do-3.test.ts`. Phạm vi (31 route):

- `app/api/construction-stages/route.ts`, `app/api/construction-stages/[id]/route.ts`
- `app/api/floor-stage-fronts/route.ts`, `app/api/floor-stage-fronts/[id]/documents/route.ts`,
  `app/api/floor-stage-front-documents/[id]/route.ts`
- `app/api/floor-approvals/route.ts`, `app/api/floor-approvals/[id]/route.ts`,
  `app/api/floor-approvals/[id]/documents/route.ts`
- `app/api/work-fronts/route.ts`, `app/api/work-fronts/[id]/route.ts`,
  `app/api/work-fronts/[id]/documents/route.ts`, `app/api/work-front-documents/[id]/route.ts`
- `app/api/package-dependencies/[id]/route.ts`, `app/api/packages/[id]/dependencies/route.ts`
- `app/api/tasks/batch/route.ts`, `app/api/tasks/version/route.ts`, `app/api/tasks/[id]/dimensions/route.ts`,
  `app/api/tasks/[id]/documents/route.ts`, `app/api/tasks/[id]/photos/route.ts`, `app/api/photos/[id]/route.ts`,
  `app/api/comments/[id]/route.ts`, `app/api/dimensions/rename/route.ts`
- `app/api/workpackages/[id]/bbnt/route.ts`, `app/api/workpackages/[id]/dimensions/route.ts`,
  `app/api/workpackages/[id]/dimensions/column/route.ts`,
  `app/api/workpackages/[id]/dimensions/column/move/route.ts`, `app/api/workpackages/[id]/drawing/route.ts`,
  `app/api/workpackages/[id]/tasks/route.ts`, `app/api/workpackages/qc-status/route.ts`
- `app/api/my-tasks/route.ts`, `app/api/towers/[id]/route.ts`

Lưu ý: dựng WBS tối thiểu `projects → towers → sheet_types → work_packages → tasks → progress_dimensions`
bằng INSERT trực tiếp (xem cách các file `tests/route-tien-do.test.ts`/`route-wbs-con-lai.test.ts`
đã dựng — tái dùng đúng cột). `construction_stages`/`floor_stage_fronts`/`baselines` có RLS theo
`project_id` (M123, migration 0149) — ca xuyên dự án bắt buộc. Subcon: `canTouchTask` — task không
được giao → 403. `tasks/batch` (gán người/đặt ngày hàng loạt, Admin/PM) → kiểm ngày KT < BĐ bị từ chối
và `recomputeTask` cập nhật trạng thái trễ sau khi đổi ngày. `dimensions/column/move`: kiểm thứ tự cột
sau khi di chuyển. `photos/[id]` GET stream + DELETE quyền.

**Tiêu chí chấp nhận:** cổng chung; 31 route được chạm; không đụng `lib/tien-do/recompute.ts`.

## Việc V4 — Hiện trường cụm 2: nhân sự · huy động · môi trường · bảo hành · rủi ro · quan trắc · album — `route: standard`

File: `tests/route-hien-truong-2.test.ts`. Phạm vi (44 route):

- `app/api/attendance/route.ts`, `app/api/attendance/[id]/route.ts`, `app/api/personnel/route.ts`,
  `app/api/personnel/[id]/route.ts`
- `app/api/mobilization/route.ts`, `app/api/mobilization/[id]/route.ts`, `app/api/demob/route.ts`,
  `app/api/demob/[id]/route.ts`, `app/api/commissioning/route.ts`, `app/api/commissioning/[id]/route.ts`
- `app/api/env-monitoring/route.ts`, `app/api/env-monitoring/[id]/route.ts`, `app/api/env-permits/[id]/file/route.ts`,
  `app/api/waste-logs/route.ts`, `app/api/waste-logs/[id]/route.ts`
- `app/api/warranty-items/route.ts`, `app/api/warranty-items/[id]/route.ts`, `app/api/warranty-claims/route.ts`,
  `app/api/warranty-claims/[id]/route.ts`, `app/api/om-documents/route.ts`, `app/api/om-documents/[id]/route.ts`
- `app/api/lessons-learned/route.ts`, `app/api/lessons-learned/[id]/route.ts`, `app/api/community-cases/route.ts`,
  `app/api/community-cases/[id]/route.ts`, `app/api/risks/route.ts`, `app/api/risks/[id]/route.ts`
- `app/api/monitoring-points/route.ts`, `app/api/monitoring-points/[id]/route.ts`,
  `app/api/monitoring-points/[id]/readings/route.ts`
- `app/api/progress-albums/route.ts`, `app/api/progress-albums/[id]/route.ts`,
  `app/api/progress-albums/[id]/photos/route.ts`, `app/api/hse/[id]/photos/route.ts`, `app/api/hse-photos/[id]/route.ts`
- `app/api/handover-items/[id]/route.ts`, `app/api/handover-items/[id]/file/route.ts`,
  `app/api/inspection-requests/[id]/route.ts`, `app/api/diaries/[date]/lock/route.ts`
- `app/api/equipment/[id]/cert/route.ts`, `app/api/equipment/[id]/logs/route.ts`,
  `app/api/certifications/[id]/file/route.ts`, `app/api/legal-documents/[id]/file/route.ts`
- `app/api/meetings/[id]/actions/route.ts`, `app/api/meetings/[id]/actions/[aid]/route.ts`,
  `app/api/meetings/actions/route.ts`, `app/api/crews/[id]/members/route.ts`
- `app/api/subcontractors/[supplierId]/documents/route.ts`, `app/api/subcontractors/[supplierId]/evaluations/route.ts`,
  `app/api/subcontractors/[supplierId]/profile/route.ts`, `app/api/subcon-documents/[id]/route.ts`

Lưu ý: cụm này là nơi Đợt 2 lộ lỗi `DATE_RE` (ngày sai như `2026-13-40`) — mỗi route có trường ngày
phải có ca ngày không tồn tại → 400/422 (không phải lỗi 500 từ Postgres `22008`). `warranty-claims`
PATCH `status='closed'` tự set `closed_date` hôm nay và không đè khi đã đóng trước. `diaries/[date]/lock`
kiểm quyền khoá + khoá 2 lần idempotent. Subcon với `subcontractors/[supplierId]/*` chỉ thấy NTP của
mình (`users.supplier_id`).

**Tiêu chí chấp nhận:** cổng chung; 44 route được chạm. Việc lớn nhất đợt — ưu tiên phủ đủ route trước,
đào sâu ranh giới sau.

## Việc V5 — Quản trị/tài khoản cụm 2: API key · audit · SoD · thông báo · TOTP · dự án — `route: standard`

File: `tests/route-quan-tri-2.test.ts`. Phạm vi (33 route):

- `app/api/admin/api-keys/route.ts`, `app/api/admin/api-keys/[id]/route.ts`, `app/api/admin/assignments/route.ts`,
  `app/api/admin/audit-log/route.ts`, `app/api/admin/audit-log/export/route.ts`, `app/api/admin/audit/route.ts`,
  `app/api/admin/permissions-snapshot/route.ts`, `app/api/admin/sod-report/route.ts`, `app/api/admin/storage/route.ts`,
  `app/api/admin/traffic/events/route.ts`, `app/api/admin/traffic/ingest/route.ts`
- `app/api/users/[id]/revoke-sessions/route.ts`, `app/api/user-projects/route.ts`, `app/api/project/select/route.ts`,
  `app/api/projects/[id]/clone-config/route.ts`
- `app/api/auth/password/route.ts`, `app/api/auth/totp/route.ts`, `app/api/auth/totp/setup/route.ts`,
  `app/api/auth/totp/confirm/route.ts`
- `app/api/nav-settings/route.ts`, `app/api/ui-texts/route.ts`, `app/api/feature-flags/route.ts`,
  `app/api/code-lists/route.ts`, `app/api/custom-fields/route.ts`, `app/api/raci/route.ts`
- `app/api/presence/route.ts`, `app/api/push/subscribe/route.ts`, `app/api/notifications/[id]/read/route.ts`,
  `app/api/notifications/feed/route.ts`, `app/api/notifications/prefs/route.ts`
- `app/api/integrations/[provider]/sync/route.ts`, `app/api/import/batches/route.ts`, `app/api/approvals/inbox/route.ts`

Lưu ý: `revoke-sessions` → sau khi gọi, token cũ của user đó phải 401 ở request kế (dựng lại cookie
bằng `sessionVersion` cũ rồi gọi một route bất kỳ). `auth/password` có rate-limit + same-origin
(`isSameOrigin` — đặt header `origin`/`host` đúng qua `NextRequest` headers) và cần `XBOSS_SECRET`
(đọc `tests/route-auth.test.ts` xem cách đã làm). TOTP: `setup` sinh secret, `confirm` với mã đúng
(sinh bằng chính `lib/bao-mat/totp.ts`) → bật 2FA; mã sai → 4xx. `api-keys` chỉ Admin, POST trả
plaintext key đúng 1 lần, `[id]` DELETE xuyên org → 404. `integrations/[provider]/sync` phải chặn
mạng (provider không cấu hình → nhánh lỗi/preview, không gọi ra ngoài). `push/subscribe` upsert theo
`endpoint` (gọi 2 lần cùng endpoint → 1 dòng).

**Tiêu chí chấp nhận:** cổng chung; 33 route được chạm; không sửa `lib/bao-mat/auth.ts`.

## Việc V6 — Vật tư/BOQ/mua sắm cụm 2 + API v1 + cổng hệ thống — `route: standard`

File: `tests/route-vat-tu-2.test.ts`. Phạm vi (24 route):

- `app/api/boq-norms/[id]/route.ts`, `app/api/boq/[id]/norms/route.ts`, `app/api/boq/[id]/norm-usage/route.ts`,
  `app/api/boq/import/route.ts`, `app/api/boq/template/route.ts`, `app/api/norms/over/route.ts`
- `app/api/materials/[id]/issue/route.ts`, `app/api/materials/[id]/move/route.ts`, `app/api/materials/[id]/return/route.ts`,
  `app/api/materials/allocation-meta/route.ts`, `app/api/materials/batch/route.ts`, `app/api/materials/columns/route.ts`,
  `app/api/materials/sync/route.ts`, `app/api/materials/template/route.ts`
- `app/api/purchase-requests/route.ts`, `app/api/purchase-requests/[id]/route.ts`, `app/api/resources/route.ts`
- `app/api/qr/labels/route.ts`, `app/api/r/[kind]/[id]/route.ts`
- `app/api/systems/[code]/summary/route.ts`, `app/api/systems/[code]/upload/route.ts`,
  `app/api/systems/[code]/upload-template/route.ts`, `app/api/systems/[code]/uploads/route.ts`,
  `app/api/system-uploads/[id]/file/route.ts`
- `app/api/portfolio/kpi/route.ts`, `app/api/v1/materials/route.ts`, `app/api/v1/packages/route.ts`,
  `app/api/v1/dashboard/kpi/route.ts`

Lưu ý: `materials/[id]/issue|move|return` phải ghi `material_transactions` (delta ± đúng dấu, người
ghi) — kiểm bảng sau khi gọi; `materials/sync` phải chặn Google Sheet (thiếu `GOOGLE_*` → route trả
lỗi cấu hình rõ, không throw 500 thô — nếu throw 500 thô là bug, ghi nhận). `boq/import` +
`systems/[code]/upload` là upload Excel: dựng workbook nhỏ bằng thư viện sẵn trong repo (`exceljs`
hoặc thứ `lib/tien-do/import.ts` đang dùng) — 1 ca hợp lệ + 1 ca file sai định dạng. `boq/template`,
`materials/template`, `upload-template` trả file xlsx (kiểm content-type + magic bytes `PK`).
`r/[kind]/[id]` là redirect QR — kiểm 302/307 `Location` và `kind` lạ → 404. `api/v1/*` xác thực
bằng API key Bearer (xem `lib/bao-mat/api-keys.ts`, `tests/` có ca `v1` nào chưa? tái dùng cách tạo
key) — kiểm thiếu key 401, key sai scope 403.

**Tiêu chí chấp nhận:** cổng chung; 28 route được chạm; không sửa `lib/khoi-luong/boq.ts`,
`lib/vat-tu/material-sync.ts`.

## Việc V7 — Bản vẽ/hồ sơ/QC cụm 2 + bot Telegram/Zalo + tiện ích dashboard — `route: standard`

File: `tests/route-ho-so-bot.test.ts`. Phạm vi (27 route):

- `app/api/drawings/revisions/[id]/file/route.ts`, `app/api/drawings/revisions/[id]/withdraw/route.ts`,
  `app/api/drawings/scan-local/route.ts`, `app/api/documents-hub/route.ts`, `app/api/project-documents/[id]/route.ts`
- `app/api/correspondences/[id]/files/route.ts`, `app/api/correspondence-files/[id]/route.ts`
- `app/api/proposals/[id]/decide/route.ts`, `app/api/proposals/[id]/submit/route.ts`,
  `app/api/proposals/[id]/documents/route.ts`, `app/api/proposals/[id]/documents/[did]/route.ts`,
  `app/api/design-changes/[id]/decide/route.ts`, `app/api/qc/documents/export/zip/route.ts`
- `app/api/tech-links/route.ts`, `app/api/tech-links/[id]/route.ts`, `app/api/tech/health-check/route.ts`,
  `app/api/tech/system-status/route.ts`
- `app/api/telegram/link-otp/route.ts`, `app/api/telegram/simulate-voice/route.ts`,
  `app/api/zalo/link-otp/route.ts`, `app/api/zalo/simulate-action/route.ts`
- `app/api/saved-reports/[id]/data/route.ts`, `app/api/schedule-control/route.ts`,
  `app/api/dashboard/evm/route.ts`, `app/api/dashboard/floors/route.ts`, `app/api/dashboard/forecast/route.ts`,
  `app/api/export/excel/route.ts`, `app/api/events/route.ts`

Lưu ý: `drawings/scan-local` quét thư mục đĩa — trỏ vào thư mục tạm trong test (đọc route xem lấy
đường dẫn từ đâu; nếu là hằng cứng không đổi được → chỉ kiểm quyền + 4xx, ghi nhận). `design-changes/
[id]/decide`: Đợt 3 ghi nhận GET `design-changes` thiếu guard `projectId != null` — riêng `decide` kiểm
xuyên dự án 404. `telegram/zalo/link-otp` sinh OTP liên kết tài khoản (kiểm 1 user 1 OTP sống, gọi lại
làm mới); `simulate-*` là mô phỏng webhook cho dev — kiểm chỉ Admin/PM và phải chặn gửi tin thật
(thiếu `TELEGRAM_BOT_TOKEN` → no-op). `events` là SSE — chỉ kiểm 401 và header `content-type:
text/event-stream` rồi huỷ stream ngay (`res.body?.cancel()`), không chờ tick 3s. `export/excel`
Admin/PM, `?sheet=<slug>` sai → 404, trả xlsx (magic `PK`). `qc/documents/export/zip` trả zip (magic
`PK`) hoặc 404 khi rỗng — đúng theo route.

**Tiêu chí chấp nhận:** cổng chung; 27 route được chạm; không đợi SSE.

---

# Pha 2 — Tích hợp + đo lại coverage (SAU khi cả 7 việc đã qua reviewer)

## Việc V8 — Chạy toàn bộ suite trên DB sạch, cập nhật baseline + PROGRESS — `route: standard`

Coordinator đã tích hợp V1–V7 vào nhánh nền (mỗi việc 1–n commit; va chạm chỉ có thể ở route bị 2
việc cùng sửa — nếu có, dừng báo phiên chính). Brief cho V8 PHẢI dán kèm báo cáo tóm tắt của từng
việc V1–V7 (số ca, bug đã sửa, "ghi nhận chưa sửa", route bỏ qua vì đã có test).

1. Trên nhánh nền (không worktree mới): `dropdb`/`createdb xboss_test_full`, chạy
   `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/xboss_test_full npm test -- --release-gate`
   → phải **0 file fail**; nếu đỏ ở file KHÔNG thuộc đợt này → đối chiếu bằng cách chạy lại file đó
   trên `git stash`/nhánh nền trước tích hợp; đỏ do đợt này → sửa test/route gây đỏ (báo rõ).
2. `TEST_DATABASE_URL=... npm run test:coverage` → đọc 4 số cuối (`Số file trong phạm vi`, lines,
   branches, funcs) → cập nhật `coverage-baseline.json` (`measuredAt` = hôm nay) — chỉ khi số mới
   không thấp hơn cũ quá 1 điểm %; thấp hơn → không cập nhật, báo.
3. `npm run lint` · `npm run typecheck` · `npm run check:dead-code` · `npm run check:route-perms` ·
   `npm run check:project-scope` xanh.
4. `PROGRESS.md`: thêm mục mới **trên cùng** `## ✅ Đợt 4 chiến dịch coverage — 7 cụm route phi-engineering
(2026-09-05)` đúng khuôn mục Đợt 3 (tổng file/ca; bảng 7 cụm + số ca; "BUG THẬT lộ ra" đánh số kèm
   route/triệu chứng/cách sửa; "Ghi nhận, chưa sửa"; "Bài học hạ tầng test" nếu có; số coverage
   cũ → mới; "Đợt sau": `app/api/engineering/**` ~100 route). Cập nhật câu "Đợt sau" của mục Đợt 3
   thành tham chiếu sang Đợt 4.

**Tiêu chí chấp nhận:** full suite 0 fail (release-gate), baseline cập nhật, PROGRESS.md đúng khuôn,
prettier sạch cho file md/json đã sửa (`npx prettier --check PROGRESS.md coverage-baseline.json`).

---

## Thứ tự & phụ thuộc toàn đợt

V1 ‖ V2 ‖ V3 ‖ V4 ‖ V5 ‖ V6 ‖ V7 (song song, khác file test, khác DB, chỉ có thể trùng nhau ở
route được sửa bug — khi tích hợp thấy 2 việc sửa cùng 1 route thì dừng, báo phiên chính) → tích
hợp tuần tự V1→V7 vào nhánh nền (`git merge --no-ff` hoặc cherry-pick, giữ commit tách bạch
test/fix) → V8. Mỗi việc 1 worktree riêng tại `/home/user/xboss-wt/<ma_viec>` (tạo bằng
`git worktree add -b claude/cov4-<ma_viec> /home/user/xboss-wt/<ma_viec> claude/tiep-tuc-yu4ib7`),
symlink `node_modules`, DB riêng `xboss_test_<ma_viec>`. `reviewer` soát từng việc (diff nhánh so
với nhánh nền) trước khi tích hợp. Coordinator KHÔNG push/mở PR — phiên chính duyệt cuối rồi push +
mở PR theo quy ước repo.
