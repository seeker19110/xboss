# M40 — Trung tâm thông báo: nhóm · lọc · click-through

> **Trạng thái: KẾ HOẠCH — chưa triển khai.** 1 trong 4 module chạy song song — xem `docs/ke-hoach-ux-cai-tien-2026-07.md`. Đọc kỹ mục "Rủi ro trùng file" cuối `M38-mau-token-tuong-phan.md` trước khi sửa `NotificationBell.tsx`.

## Bối cảnh hiện trạng

- `app/components/NotificationBell.tsx` (205 dòng): dropdown liệt kê phẳng `items` (tối đa theo những gì `GET /api/notifications` trả), không tab/filter/nhóm. Click item chỉ gọi `markRead(n.id)` (dòng 115-118) — **không điều hướng đi đâu cả**, dù `Notif.taskId` đã có sẵn trong type (dòng 8) nhưng không được dùng để tạo link.
- `/api/notifications` (đọc kỹ trước khi code) sinh ~9-20 loại thông báo on-fetch (theo `CLAUDE.md`: `delayed`, `due_soon`, `comment`, `material_over`, `ncr_overdue`, `stalled`, `poLateList`, `expiringContracts`, `pendingCerts`, ... — danh sách đầy đủ nằm trong route, liệt kê lại bằng cách đọc file thay vì đoán).
- Chưa có trang `/notifications` riêng — kiểm tra `app/` xem đã có thư mục `notifications/` chưa (nếu route API `/api/notifications` khác trang UI). Nếu chưa có, đây là trang mới cần tạo.
- Không có bảng lưu "nhóm"/agrregation ở DB — việc gộp ("12 nghiệm thu quá hạn ở Zone 1") phải làm ở tầng hiển thị (client), KHÔNG đổi schema DB (tránh việc lớn ngoài phạm vi, đúng nguyên tắc YAGNI — bảng `notifications` hiện tại đủ dữ liệu để nhóm theo `type` + rút trích "hệ"/"khu vực" từ nội dung `message` bằng parse chuỗi nếu cần, hoặc đơn giản hơn: nhóm theo `type` thôi, không cần tách theo hệ nếu message không có cấu trúc field riêng — **đọc route trước để biết field thực tế có `systemCode`/`floorLabel` riêng hay chỉ có `message` dạng câu hoàn chỉnh**).

## Yêu cầu triển khai

### 1. Dropdown (`NotificationBell.tsx`) — giữ nguyên khung, nâng cấp nội dung

- Header: thêm số chưa đọc rõ ràng (đã có phần `unread`) + nút "Xem tất cả" link tới `/notifications` (trang mới, mục 3).
- Tabs lọc: `Tất cả | Chưa đọc | Quá hạn | Nghiệm thu | Được giao việc` — implement bằng state `tab` client-side lọc mảng `items` đã tải theo `type` (map loại API → nhóm tab; vd `delayed`/`ncr_overdue` → "Quá hạn", loại liên quan `approve`/`nghiem_thu` nếu có → "Nghiệm thu"). Nếu API không phân biệt đủ loại để map "Nghiệm thu"/"Được giao việc" — chỉ implement tab nào map được rõ ràng từ `type` hiện có, ghi rõ trong PR loại nào chưa tách được (không tự bịa field DB không tồn tại).
- Nhóm theo thời gian: "Hôm nay / Hôm qua / Cũ hơn" dựa vào `createdAt` so với `new Date()` (dùng helper đã có `lib/date.ts` nếu có hàm ngày phù hợp, không tự parse timezone thủ công nếu tránh được).
- Click-through: bọc mỗi item bằng logic điều hướng — nếu `n.taskId` có giá trị, dùng `router.push` (hoặc `<a href>`) tới route hợp lý chứa task đó. Vì task thuộc 1 sheet cụ thể, cần API trả thêm đủ thông tin để dựng URL (`/tracking/<slug>?floor=<f>&task=<id>` theo pattern đã dùng ở `ProgressMap`/tìm kiếm toàn cục `GlobalSearch`) — **kiểm tra `GET /api/notifications` hiện có trả sheet slug không; nếu chưa, đây là thay đổi API tối thiểu cần thêm** (JOIN thêm `sheet_types.slug` qua `task.package_id → work_packages.sheet_type_id`, giữ nguyên các field khác). Đồng thời tự động gọi `markRead` khi click (đã có hàm, chỉ cần gọi trước khi điều hướng).
- Giới hạn 10 item trong dropdown (`items.slice(0, 10)`), phần còn lại chỉ xem ở trang `/notifications`.
- Gộp thông báo cùng loại: nếu ≥3 thông báo cùng `type` xuất hiện liên tiếp trong danh sách, hiển thị 1 dòng gộp "N thông báo <nhãn loại>" có thể bấm để bung ra (state `expandedGroups: Set<string>`) — nhãn loại lấy từ map tĩnh nhỏ trong chính file (không cần thêm field DB).

### 2. Trang `/notifications` (mới)

- `app/notifications/page.tsx`, `'use client'`, dùng `AppHeader` + `PageSkeleton` theo đúng pattern mọi trang khác (xem `app/approvals/page.tsx` làm mẫu cấu trúc file).
- Danh sách đầy đủ (không giới hạn 10), filter theo loại (dropdown/tab), theo khoảng ngày (`<input type="date">` x2), theo trạng thái đọc; search theo `message` (tìm chuỗi con, không cần debounce phức tạp cho danh sách này — có thể tái dùng logic nhỏ tương tự `TableToolbar` của M39 NẾU đã có sẵn lúc code, nhưng **không phụ thuộc cứng vào M39 hoàn thành trước** — nếu component đó chưa tồn tại khi module này chạy, tự viết input search/filter đơn giản riêng, không block chờ nhánh khác).
- Phân trang: client-side (chia trang mảng đã tải, ví dụ 20 dòng/trang) — API `/api/notifications` hiện trả toàn bộ, không cần đổi thành phân trang server trừ khi số lượng thực tế >1000 (không có dấu hiệu này).
- Hành động hàng loạt: checkbox chọn nhiều + nút "Đánh dấu đã đọc" — cần **kiểm tra route hiện có hỗ trợ đánh dấu nhiều ID cùng lúc chưa** (`app/api/notifications/[id]/read/route.ts` hiện chỉ theo 1 id — hoặc gọi lặp `Promise.all` các PATCH riêng lẻ nếu không muốn đổi API, chấp nhận được vì số lượng chọn thường nhỏ; không bắt buộc thêm endpoint batch mới trừ khi UX quá chậm khi test tay).

### 3. Badge đúng số chưa đọc

`unread` trong state hiện đã lấy từ `j.unread` do API trả — xác nhận route đang trả đúng "số chưa đọc" chứ không phải tổng số bằng cách đọc `app/api/notifications/route.ts`; nếu route đã đúng thì không cần sửa, chỉ cần không làm hỏng khi thêm tab/nhóm (badge luôn tính trên toàn bộ `items` chưa đọc, không phụ thuộc tab đang chọn).

## Không làm (out of scope)

- Không thêm bảng "notification_groups" hay đổi schema `notifications` cho việc gộp hiển thị — gộp thuần client-side.
- Không xây dựng chuông real-time (WebSocket/SSE) mới cho notification — giữ polling `POLL_MS = 30_000` hiện có.
- Không xoá vĩnh viễn thông báo (đề bài đã nói rõ "Không cần xóa vĩnh viễn").

## Test & Definition of Done

- Test tay: bấm 1 thông báo "quá hạn" → điều hướng đúng sheet/tầng + item chuyển đã đọc; lọc tab "Nghiệm thu" chỉ còn đúng loại; nhóm ≥3 item cùng loại gộp và bung được; "Đọc tất cả" đưa badge về 0; trang `/notifications` filter/phân trang hoạt động.
- Nếu có sửa API (`GET /api/notifications` thêm sheet slug), viết/cập nhật test tương ứng nếu file test đã tồn tại cho route này (`grep -rn notifications tests/`) — thêm case mới nếu cần.
- `npm run lint` + `npm run typecheck` + `npm test` xanh; route mới/sửa vẫn giữ `getCurrentUser()` + 401 theo quy ước.
- Trang `/notifications` mới → thêm `e2e/authed/notifications.spec.ts` chạy axe (theo quy ước README "trang mới thêm axe test"), hoặc mở rộng nếu file tương tự đã tồn tại.

## Rủi ro trùng file với module chạy song song

- `NotificationBell.tsx` cũng bị M38 sửa (chỉ đổi màu/icon item, không đổi cấu trúc). Khi tích hợp: merge M38 trước, sau đó module này rebase và **giữ lại phần phân loại màu/icon của M38**, chỉ thêm khung tab/nhóm/click-through lên trên — không revert đổi màu của M38.
