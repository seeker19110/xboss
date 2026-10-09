# AUDIT-S16 — Cutover "membership rỗng không mở quyền" (A1-AC02/A1-AC03, D01)

> Mục 6(a) của `AUDIT-S15-RELEASE-CANDIDATE.md`. Đặc tả nền: `AUDIT-2026-09-25/A1-SCOPE.md`
> (A1-FR03, A1-AC02, A1-AC03), `APPROVAL.md` D01. Slice này chỉ **chuẩn bị** cutover bằng cờ —
> **không** tự bật trên môi trường nào. Bật/tắt là việc của người vận hành được cấp quyền.

## 1. Đã có gì

| Thành phần                   | Vị trí                                                                     | Ghi chú                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cờ `XBOSS_STRICT_MEMBERSHIP` | `lib/nen/env.ts` (schema + `strictMembershipEnabled()`)                    | Mặc định TẮT. Chỉ nhận `0`/`1`/`true`/`false`; giá trị khác → throw (fail-fast, lộ ngay trên staging). Đọc `process.env` mỗi lần gọi — đổi cờ cần restart process (pm2) như mọi biến env.                                                 |
| Luật phạm vi theo cờ         | `lib/ha-tang/projects.ts` `visibleProjectIds`                              | Cờ BẬT: non-admin chỉ thấy dự án được gán trong `user_projects` cùng org, **kể cả khi bảng rỗng toàn hệ**. Admin cùng org vẫn thấy mọi dự án org (recovery — gán lại được). Cờ TẮT: y hệt trước (nhánh legacy "bảng rỗng = thấy cả org"). |
| Người nhận báo cáo ngày/tuần | `lib/tien-do/report.ts` `reportRecipients`                                 | Cùng luật: cờ BẬT bỏ nhánh "bảng rỗng = mọi PM cùng org".                                                                                                                                                                                 |
| `/api/project` (tên dự án)   | `app/api/project/route.ts`                                                 | Cờ BẬT + đã đăng nhập + không có dự án khả kiến → trả rỗng, không rơi về "dự án đầu tiên của DB" (có thể thuộc org khác). Ẩn danh (/login) giữ fallback như cũ.                                                                           |
| Màn "chưa được gán"          | `app/components/ChuaGanDuAn.tsx`, `app/lib/duAnKhaKien.ts`                 | Trang chủ (`/`, cả 2 chế độ), `/my-tasks`, `/tracking/*`: danh sách dự án khả kiến rỗng → "Bạn chưa được gán dự án nào — liên hệ quản trị viên" (admin: "Tổ chức chưa có dự án nào" + nút sang `/admin`). Áp cả khi cờ tắt.               |
| Dry-run chỉ đọc              | `npm run membership:dry-run [-- --json]` (`scripts/membership-dry-run.ts`) | 1 transaction `BEGIN READ ONLY`; liệt kê theo org: user non-admin 0 membership (email, vai trò, số dự án đang thấy nhờ legacy), tổng user sẽ MẤT quyền xem, org chưa có dòng gán. Không in mật khẩu/hash. Exit 0.                         |
| Test                         | `tests/s16-membership-cutover.test.ts`                                     | Route thật + cookie phiên ký thật; ca "bảng rỗng toàn hệ" chạy trong transaction rồi ROLLBACK.                                                                                                                                            |

## 2. A1-AC03 nhánh (ii) — "cookie sai → null" CHƯA bật

Brief cho phép bật (ii) chỉ khi mọi route nghiệp vụ coi `projectId == null` là 404/rỗng. Rà lại
(đọc tay các caller của `getCurrentProjectId` + các hàm `lib/` có mẫu `projectId != null ? "AND …" : ""`)
thấy **vẫn còn route coi null = không lọc** (§3) → `resolveProjectId` giữ nguyên: cookie sai/không
được cấp vẫn rơi về dự án khả kiến ĐẦU TIÊN của chính user (không bao giờ ra ngoài membership/org).
Khi §3 đóng hết, (ii) chỉ cần đổi `resolveProjectId` theo khuôn `getCurrentProjectIdStrict` đã có.

## 3. Route còn coi `projectId == null` = KHÔNG lọc (chặn bật cờ)

`projectId` null đã xảy ra **ngay hôm nay** với non-admin không có membership khi bảng
`user_projects` đã có dòng (cờ tắt). Cờ BẬT làm nhóm user này lớn hơn (mọi non-admin 0 membership).
Vì vậy đây là **điều kiện tiên quyết** của bước bật cờ, không chỉ của (ii):

| Route                                                                               | Hàm `lib/` bỏ lọc khi null                                                                                  | Hậu quả khi null                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /api/design-changes`                                                           | `listDesignChanges` (`lib/ky-thuat/designchanges.ts`)                                                       | Đọc thay đổi thiết kế mọi dự án/mọi org (đã tái hiện: PM org A 0 membership đọc được bản ghi org B). |
| `GET/PATCH/DELETE /api/design-changes/[id]`, `POST /api/design-changes/[id]/decide` | `getDesignChange`, `decideDesignChange`, `markDrawingUpdated`                                               | Đọc/sửa/xoá/duyệt thay đổi thiết kế dự án khác theo id.                                              |
| `GET /api/gantt`, `GET /api/schedule-control`                                       | `getCpmData`, `getScheduleControlData` (`projectId ?? undefined` = không lọc)                               | Gantt/CPM/trễ toàn hệ.                                                                               |
| `GET /api/documents-hub`                                                            | `listTaskDocuments`/`listContractDocuments`/`listVoDocuments`/`listDrawingDocuments`/`listProjectDocuments` | Danh mục tài liệu mọi dự án.                                                                         |
| `GET /api/resources`                                                                | `workloadByWeek`, `manpowerByWeek`, `assignmentConflicts`, `equipmentUsageByWeek`                           | Tải công việc/nhân lực toàn hệ.                                                                      |
| `GET /api/systems/[code]/upload-template`, `POST /api/systems/[code]/upload`        | `buildPlanTemplate`/`buildTrackingTemplate`/`parsePlanUpload`/`parseTrackingUpload`                         | Xuất task mọi dự án; upload **ghi** ngày KH/tiến độ vào task mọi dự án khớp BOQCODE.                 |
| `GET /api/admin/approval-flows`                                                     | `listApprovalFlows(null)` "trả hết"                                                                         | PM thấy flow duyệt mọi org.                                                                          |
| `GET /api/admin/audit-log`, `/export`                                               | `buildAuditFilter(…, null)` bỏ điều kiện dự án                                                              | Admin-only; chỉ chạm khi org của admin không có dự án nào.                                           |
| `GET /api/claims/eot-suggestion`                                                    | `stageMissingList(undefined)` → `withProjectScope("*")`                                                     | Tổng số ngày chờ mặt bằng toàn hệ (số gộp).                                                          |

Danh sách lấy từ rà tay + heuristic, **không chứng minh là đủ** (helper khác file có thể còn sót).
Cách sửa từng route: `if (projectId == null)` → 404 (chi tiết/ghi) hoặc 200 rỗng đúng shape (danh
sách), kèm test route thật ca không dự án — cùng khuôn S02b/S02d. Đề xuất slice riêng (route
`complex`/`spec`, chạm route nghiệm thu/tài liệu).

## 4. Runbook cutover

Điều kiện vào: §3 đã đóng hết (CI xanh trên SHA phát hành); người vận hành có quyền production.

1. **Dry-run trên production (chỉ đọc).** `DATABASE_URL=<prod> npm run membership:dry-run -- --json > membership-<ngày>.json`.
   Đọc dòng "Bảng user_projects": RỖNG toàn hệ → mọi user ở cột "MẤT quyền xem" sẽ mất quyền khi bật;
   đã có dòng → bật cờ không làm ai mất thêm quyền xem (chỉ gỡ nhánh legacy + người nhận báo cáo).
2. **Chủ dự án duyệt danh sách gán.** Với từng org: ai được thấy dự án nào. Không gán hàng loạt
   "mọi user × mọi dự án" (A1-FR03 — không INSERT cấp quyền hàng loạt).
3. **Gán qua UI admin** `/admin` → khu quản lý dự án (gọi `PUT /api/user-projects`). Lưu ý cờ TẮT: dòng
   gán ĐẦU TIÊN của toàn hệ làm nhánh legacy tắt cho MỌI org ngay lập tức — gán theo đợt trong giờ thấp
   điểm, chạy lại dry-run sau mỗi đợt.
4. **Bật cờ trên staging** (`docs/ops/staging.md`): thêm `XBOSS_STRICT_MEMBERSHIP=1` vào `.env.local`
   staging → `pm2 restart xboss-staging --update-env`.
5. **Kiểm trên staging:** user 0 membership thấy màn "Bạn chưa được gán dự án nào"; `/api/projects` rỗng;
   admin vẫn vào `/admin` gán được; PM được gán chỉ thấy dự án của mình; chạy
   `TEST_DATABASE_URL=<staging test DB> npx tsx --experimental-test-module-mocks --test tests/s16-membership-cutover.test.ts`.
6. **Production:** lặp bước 1 (dry-run lần cuối, lưu JSON làm bằng chứng) → bật cờ → `pm2 restart xboss --update-env` → kiểm như bước 5 với 1 tài khoản thật mỗi vai trò.
7. Sau khi ổn định: đảo 2 ca legacy trong `tests/project-scope-security-unit.test.ts` và cân nhắc bỏ
   nhánh legacy + cờ (slice riêng).

## 5. Rollback

Đặt `XBOSS_STRICT_MEMBERSHIP=0` (hoặc xoá dòng) → restart process. Không có migration, không đổi dữ
liệu: các dòng `user_projects` đã gán vẫn giữ nguyên và vẫn được tôn trọng (bảng đã có dòng thì nhánh
legacy cũng không mở lại quyền theo org). Muốn trả về hẳn "mọi người thấy cả org" thì phải xoá dòng gán —
không khuyến nghị.

## 6. Ảnh hưởng

- Non-admin 0 membership: không thấy dự án nào (màn "chưa được gán"), không nhận email/push báo cáo ngày/tuần.
- Admin: không đổi (vẫn thấy mọi dự án cùng org — đường recovery).
- PM/kỹ sư được gán: không đổi.
- Cookie dự án cũ trỏ dự án không còn được cấp: rơi về dự án được gán đầu tiên (như trước).
- Trang đăng nhập (ẩn danh): không đổi.
