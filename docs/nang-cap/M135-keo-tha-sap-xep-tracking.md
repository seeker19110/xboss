# M135 — Kéo thả sắp xếp nhóm (tầng) và task trên lưới tracking

| Thuộc tính       | Giá trị                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| Issue / Goal     | Yêu cầu chủ repo 23/10/2026: "kéo thả để thay đổi vị trí task, các tầng" |
| Spec owner       | Phiên Claude Code                                                        |
| State            | **Approved for implementation**                                          |
| Người/ngày duyệt | Chủ repo — chốt 3 quyết định phạm vi qua câu hỏi trong phiên, 23/10/2026 |
| Cập nhật         | 2026-10-23                                                               |

Mức **M** (CLAUDE.md): một PR, không đổi schema, không chạm `recompute`/nghiệm thu/tiền.

## 1. Problem

Trang `/tracking/[sheet]` chỉ có nút ▲▼ đổi chỗ với hàng **liền kề** (`PATCH /api/workpackages/:id/move`,
`PATCH /api/tasks/:id/move`). Dời một nhóm tầng từ cuối lên đầu sheet 28 nhóm cần 27 lần bấm,
27 request và 27 lần tải lại. Admin/PM là người sắp xếp cấu trúc WBS.

## 2. Quyết định đã chốt (chủ repo, 23/10/2026)

| #   | Câu hỏi                | Chốt                                                                              |
| --- | ---------------------- | --------------------------------------------------------------------------------- |
| D1  | Kéo task tới đâu       | **Chỉ trong cùng nhóm** — không đổi `package_id`, không đụng recompute            |
| D2  | "Tầng" là gì           | **Hàng nhóm công việc** (mỗi nhóm gắn `floorLabel`), kéo trong 1 sheet            |
| D3  | Điện thoại công trường | **Kéo được cả trên cảm ứng** — thêm `@dnd-kit`, giữ nút ▲▼ làm phương án thay thế |

## 3. Scope / non-goals

- Trong scope: kéo nhóm trong sheet; kéo task trong nhóm; bàn phím (Space/mũi tên) qua `@dnd-kit`.
- Ngoài scope: kéo task sang nhóm khác, đổi `floorLabel` bằng kéo, kéo cột dimension, kéo sheet.
- Không đổi schema, không migration.

## 4. Functional requirements

- **FR1** Chỉ hiện tay nắm kéo khi `canEdit` (Admin/PM — `CAN.editStructure`) **và** đang ở chế độ sửa.
- **FR2** Tắt kéo khi đang lọc (tìm kiếm, tầng, trạng thái, lọc task): danh sách hiển thị không phải
  danh sách đầy đủ nên không suy ra được thứ tự toàn phần. Nút ▲▼ vẫn dùng được.
- **FR3** Thả xong cập nhật thứ tự **lạc quan** ngay trên UI; API lỗi thì trả về thứ tự cũ và báo lỗi tiếng Việt.
- **FR4** API nhận **toàn bộ** danh sách id theo thứ tự mới, ghi trong **một transaction**; tập id phải
  khớp đúng tập hiện có (thiếu/thừa/trùng = dữ liệu đã đổi ở máy khác) → 409, không ghi gì.
- **FR5** Cảm ứng: kéo bắt đầu sau nhấn giữ 200 ms (không cướp thao tác cuộn); chuột: sau khi rê 5 px.
- **NFR** Tay nắm ≥ 40 px vùng chạm, `aria-label` tiếng Việt, token màu zinc, không `dark:`/hex.

## 5. API contract

Cả hai: `getCurrentUser()` → 401; `CAN.editStructure` → 403; module `tracking` tắt → 404;
scope dự án qua `visibleProjectIds` (khuôn route anh em) → 404; tái kiểm quyền lúc ghi
(`ghiNeuConQuyen`, D01) → 403.

| Method + path                     | Body                             | Kết quả                                      |
| --------------------------------- | -------------------------------- | -------------------------------------------- |
| `PUT /api/workpackages`           | `{ sheetTypeId, ids: number[] }` | 200 `{ok:true}`; 400/422 input; 409 lệch tập |
| `PUT /api/workpackages/:id/tasks` | `{ ids: number[] }`              | 200 `{ok:true}`; 400/422 input; 409 lệch tập |

`ids`: số nguyên dương, không trùng, 1–2000 phần tử. Ghi `sort_order = vị trí (1..n)`.
Ghi `tasks.sort_order` kích trigger `sheet_versions` → client khác tự tải lại qua SSE.

## 6. Acceptance criteria

- **AC1** PM gửi thứ tự mới → `sort_order` khớp đúng thứ tự; nhóm/task ở sheet/nhóm khác không đổi.
- **AC2** `ids` thiếu/thừa/trùng/sai kiểu → 4xx, DB không đổi.
- **AC3** Sheet/nhóm thuộc dự án không thấy được → 404, DB không đổi.
- **AC4** Engineer/subcon/viewer → 403; chưa đăng nhập → 401.
- **AC5** UI: tay nắm chỉ hiện ở chế độ sửa của Admin/PM, ẩn khi đang lọc; thả → thứ tự đổi ngay;
  lỗi API → hoàn tác + thông báo.

## 7. Điểm chạm code

- `lib/tien-do/sap-xep.ts` (mới): kiểm `ids`, khoá dòng `FOR UPDATE`, so tập, ghi `unnest … WITH ORDINALITY`.
- `app/api/workpackages/route.ts` (+`PUT`), `app/api/workpackages/[id]/tasks/route.ts` (+`PUT`).
- `app/tracking/[sheet]/page.tsx` (DndContext nhóm), `TrackingGrid.tsx` (tay nắm nhóm + task),
  `KeoTha.tsx` (mới: wrapper sortable dùng chung).
- `package.json`: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`.
- Test: `tests/sap-xep-tracking.test.ts`.

## 8. Rollout / rollback

Không migration. Rollback = revert PR; nút ▲▼ cũ không bị bỏ nên luôn còn đường sắp xếp.
