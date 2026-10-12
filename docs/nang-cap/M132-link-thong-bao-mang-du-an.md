# M132 — Link thông báo/push mang theo dự án

| Thuộc tính       | Giá trị                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Lộ trình hoàn thiện §0.3 "link `/tracking/<slug>` trong thông báo không mang dự án"; sổ nợ #572                   |
| Spec owner       | Phiên chính (lượt `/auto-complete` 2026-10-12, hồ sơ `docs/nang-cap/auto/2026-10-12-hoan-thien-no-code.md` W-002) |
| State            | **Approved for implementation** — phiên chính tự duyệt theo /auto-complete (ADR-0015), 2026-10-12                 |
| Người/ngày duyệt | Phiên chính, 2026-10-12 (ủy quyền ADR-0015)                                                                       |
| Cập nhật         | 2026-10-12                                                                                                        |

## 1. Problem, vai trò và bằng chứng

Kỹ sư/thầu phụ/PM thuộc ≥ 2 dự án nhận thông báo (chuông, trang `/notifications/all`) hoặc Web Push về một task.
Link dựng là `/tracking/<slug>?floor=<tầng>` (`app/components/NotificationBell.tsx:166-170`,
`app/notifications/all/page.tsx:27-30`, `lib/tien-do/assignments.ts:110,173,228`). Trang `/tracking/[sheet]` gọi
`/api/tasks?sheet=<slug>`, API giải slug theo **dự án đang chọn** (cookie `xboss_project`). Từ migration 0161 slug
chỉ duy nhất **trong một dự án** (`uq_sheet_types_project_slug`) và 5 slug chuẩn (`ogtd`…) trùng giữa các dự án.

Kịch bản lỗi: đang chọn dự án A, bấm thông báo về task ở dự án B → (a) A có sheet cùng slug: trang mở **im lặng
sheet của A** ở đúng tầng đó, người dùng có thể tick nhầm dự án; (b) A không có slug: lỗi "Sheet không hợp lệ".

## 2. Outcome, metric và guardrail

- Bấm thông báo/push về task ở dự án khác → luôn mở đúng dự án của task (hoặc báo lỗi rõ khi không còn quyền),
  không bao giờ hiển thị sheet của dự án đang chọn thay thế.
- Guardrail: server vẫn là ranh giới quyền — tham số `project` chỉ là gợi ý điều hướng, việc đổi dự án đi qua
  `POST /api/project/select` (kiểm `chotProjectIdChoDoc`). Đổi dự án phải đi đúng thủ tục đổi ngữ cảnh S05/S08 như
  `ProjectSwitcher` (phát đổi ngữ cảnh giữa tab, xoá cache SW, tải lại trang).

## 3. Nghiên cứu hiện trạng

- `lib/dich-vu/thong-bao.ts` `listNotifications`: đã LEFT JOIN `tasks → work_packages → sheet_types` để lấy slug +
  tầng; chưa trả `st.project_id`.
- `lib/tien-do/assignments.ts`: 3 điểm push `notifyAssigned(..., "/tracking/<slug>")`; truy vấn `prev` đọc
  `sheet_types` nên lấy thêm được `project_id`.
- `app/components/ProjectSwitcher.tsx` `select()`: thủ tục đổi dự án (POST select → localStorage → `phatDoiNguCanh`
  → `clearServiceWorkerCache` → reload) — viết inline, chưa tái dùng được.
- `public/sw.js` `notificationclick` mở `data.url` — không cần đổi (URL đã mang tham số).
- GlobalSearch dùng cùng mẫu link nhưng an toàn: `/api/search` chỉ trả kết quả trong dự án đang chọn.

## 4. Phương án

| Phương án                                                                              | Lợi ích                                                                                                   | Chi phí/rủi ro                                                                     | Kết luận                              |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| Không làm                                                                              | 0 code                                                                                                    | Tick nhầm dự án (toàn vẹn dữ liệu)                                                 | Loại (bậc 1)                          |
| A. Thêm `notifications.project_id` (migration + backfill + mọi điểm ghi)               | Lọc được chuông theo dự án                                                                                | Migration đụng dữ liệu (backfill → qua staging), hơn 30 loại cảnh báo phải ghi cột | Loại (bậc 2 — nhiều hơn, cần staging) |
| B. Link mang `?project=<id>`; trang tracking đổi dự án qua thủ tục chuẩn trước khi tải | Không migration; dùng lại `POST /api/project/select` + thủ tục S05/S08; áp cho chuông, trang tất cả, push | Thêm 1 lần tải lại khi khác dự án                                                  | **Chọn**                              |
| C. Ẩn link khi thông báo thuộc dự án khác                                              | Ít code nhất                                                                                              | Người dùng mất đường tới task; push vẫn sai                                        | Loại (bậc 1 — vẫn sai với push)       |

## 5. Scope / non-goals

- Trong phạm vi: link chuông + trang tất cả thông báo + 3 push phân công; trang `/tracking/[sheet]` xử lý `?project=`.
- Ngoài phạm vi: lọc danh sách chuông theo dự án; link của các loại thông báo không gắn task; GlobalSearch.

## 6. User journeys và mọi trạng thái

- `?project=` trùng dự án đang chọn (hoặc không có tham số): trang chạy như cũ; tham số bị gỡ khỏi URL.
- Khác dự án: hiện `PageSkeleton` "đang chuyển dự án" → đổi dự án → `location.replace` cùng URL bỏ `project`.
- Không còn quyền (403) / tham số sai: `ErrorState` tiếng Việt, không tải lưới. Mất mạng: `ErrorState` + "Thử lại".

## 7. Functional và non-functional requirements

- FR1 `listNotifications` trả `projectId` (từ `sheet_types.project_id`, null khi thông báo không gắn task).
- FR2 Helper thuần `linkTracking(slug, { floor, projectId })` ở `lib/nen/` dựng URL; mọi điểm dựng link
  task (chuông, trang tất cả, push phân công) dùng chung helper.
- FR3 Helper client `chuyenDuAn(id)` ở `app/lib/` gom thủ tục đổi dự án của `ProjectSwitcher`; `ProjectSwitcher` dùng
  lại nó (không đổi hành vi).
- FR4 Trang `/tracking/[sheet]`: quyết định thuần `quyetDinhDuAnTuLink(thamSo, duAnHienTai)` →
  `khong-co | go-tham-so | chuyen`; chỉ render lưới khi không phải `chuyen`.
- NFR: không đổi API ghi; không migration; nhãn/lỗi tiếng Việt; trạng thái lỗi có `role="alert"` (qua `ErrorState`).

## 8. Acceptance criteria

- AC1 Given thông báo gắn task ở dự án B, When gọi `GET /api/notifications`, Then mục đó có `projectId = B`
  (test `tests/m132-link-thong-bao.test.ts`, cần DB).
- AC2 `linkTracking("ogtd", { floor: "T5", projectId: 7 })` = `/tracking/ogtd?floor=T5&project=7`; thiếu
  projectId/floor thì bỏ tham số tương ứng; ký tự đặc biệt được mã hoá (unit test).
- AC3 `quyetDinhDuAnTuLink`: không tham số → `khong-co`; trùng → `go-tham-so`; khác hoặc chưa có cookie →
  `chuyen`; tham số không phải số nguyên dương → `go-tham-so` (unit test).
- AC4 Push phân công nhóm/task/hệ mang `project=<id>` của sheet (unit test trên helper + review diff).
- AC4b Push bình luận (`/api/tasks/:id/comments`) cũng mang `project=<id>` (bổ sung sau review).
- AC4c Cổng chạy lại khi `?project=` đổi do điều hướng client-side cùng slug (`router.push` từ chuông); phiên
  hết hạn (401) → `redirectToLogin`, `2fa_required` → trang bật 2FA; lỗi khác → màn lỗi có "Thử lại" +
  "Về trang chủ" (bổ sung sau review).
- AC4d `?project=` TRÙNG cookie vẫn kiểm dự án còn trong danh sách xem được (`GET /api/projects`) — cookie có
  thể trỏ dự án user đã bị gỡ, server khi đó rơi về dự án khác; không còn → màn lỗi, không dựng lưới (bổ sung
  sau audit hội tụ 2026-10-12).
- AC5 `npm run gate -- --test --build` xanh; e2e hiện có của tracking/notifications không đỏ.

## 9. Kiến trúc và điểm chạm code

`lib/nen/link-tracking.ts` (mới, tầng 0) · `lib/dich-vu/thong-bao.ts` · `lib/tien-do/assignments.ts` ·
`app/lib/chuyenDuAn.ts` (mới) · `app/components/ProjectSwitcher.tsx` · `app/components/NotificationBell.tsx` ·
`app/notifications/all/page.tsx` · `app/tracking/[sheet]/page.tsx` (bọc cổng `?project=`).

## 10. API contract

`GET /api/notifications` thêm trường `projectId: number | null` cho mỗi mục (bổ sung, tương thích ngược). Không
route mới; đổi dự án dùng `POST /api/project/select` hiện có.

## 11. Data contract và DDL

Không đổi schema.

## Giả định (điều lẽ ra hỏi chủ repo — đã tự chọn)

- Khi khác dự án, **tự đổi dự án** thay vì hỏi xác nhận: người dùng đã bấm vào thông báo của chính task đó, ý định
  rõ; thủ tục đổi giống hệt bấm ProjectSwitcher (có phát đổi ngữ cảnh cho tab khác).
- Không lọc chuông theo dự án: chuông hiện là "thông báo của tôi" xuyên dự án — giữ nguyên hành vi.
