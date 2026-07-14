# G11 — UI/UX xuyên suốt

> Gộp từ M37 (redesign theme sáng Phase 2) + M38 (màu/token tương phản) + M39 (bảng filter/sort/sticky) + M40 (trung tâm thông báo) + M41 (responsive mobile) + M42 (flatten submenu sidebar). Tất cả đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`. Không có route/schema riêng — thay đổi xuyên suốt giao diện hiện có.

**Bất biến chung mọi module trong nhóm này** (kế thừa từ redesign PR1): cơ chế đảo màu qua biến CSS trong `app/globals.css` (`html.light`/`dark`/`kingblue`/`darkblue`/`navy`) — dark-first, thang `zinc` + accent `-300/-400`, không `dark:`/hex hardcode; accent `-700..-950` không đảo theo theme; cổng CI chặn merge (Lighthouse a11y ≥0.9 trên `/login`, axe E2E không lỗi serious/critical).

## M37 — Redesign theme sáng Phase 2 (typography/spacing/component)

Chuẩn hoá 5 mảng rải rác qua 70+ file, ưu tiên **nhất quán** hơn "làm to mọi thứ" (dữ liệu dày, không nống mật độ): thang typography (h1 `text-lg`/h2 `text-base`, chỉ áp trang lưu lượng cao), padding thẻ theo tier (stat `p-3`/thẻ nội dung `p-4`/panel trang `p-5`, bỏ `p-6`), nút danger 2 mẫu chuẩn (đặc `bg-red-700`, ghost `text-zinc-500 hover:text-red-300`), gộp overlay tự chế về `<Modal>` chung (`dialogs.tsx`), `theme-color` PWA động theo theme đang chọn.

## M38 — Màu cho người mù màu + tương phản

Thêm tín hiệu thứ hai ngoài màu (icon) cho nơi hiển thị dày đặc màu: `lib/status.ts::STATUS_ICON` (map icon lucide theo status) dùng cho `ProgressMap.tsx` (heatmap ô 100%/trễ + legend) và `NotificationBell.tsx` (phân cấp màu theo mức độ nghiêm trọng của `type`, không còn tô đỏ mọi thông báo chưa đọc như nhau). Verify bằng Chrome DevTools "Emulate vision deficiencies" (không thêm dependency giả lập mù màu vào CI).

## M39 — Filter/Search/Sort + Sticky header/cột

`app/components/TableToolbar.tsx` (mới, dùng chung): search debounce 300ms + filter multi-select + đồng bộ URL qua `useSearchParams` + chip lọc + highlight khớp — toàn bộ **client-side** (không phân trang server, không thêm thư viện ngoài). Áp cho `/approvals` (lọc theo hệ/trạng thái/%tiến độ). Cột sort "Tầng" dùng `sortFloorsAsc`/`sortFloorsDesc` có sẵn (`lib/floors.ts`), không viết `compareFloor` mới. `ProgressMap.tsx` thêm sticky header hàng (kết hợp với sticky cột Tầng có sẵn — ô góc trên-trái cần cả 2 lớp sticky, `z-30`).

## M40 — Trung tâm thông báo (nhóm, lọc, click-through)

`NotificationBell.tsx`: tab lọc (Tất cả/Chưa đọc/Quá hạn/Nghiệm thu/Được giao việc), nhóm theo thời gian (Hôm nay/Hôm qua/Cũ hơn), click-through điều hướng đúng sheet/tầng (API bổ sung JOIN `sheet_types.slug`), gộp hiển thị ≥3 thông báo cùng loại (thuần client-side, không đổi schema `notifications`). Trang mới `/notifications` (danh sách đầy đủ, filter/phân trang client-side, hành động hàng loạt đánh dấu đã đọc). Không thêm WebSocket — giữ polling 30s hiện có.

## M41 — Tối ưu responsive mobile

Card view cho `/approvals` dưới 640px (thay bảng cuộn ngang bằng card full-width, nút hành động ≥44px). Rà icon-button trong `AppHeader.tsx` đảm bảo vùng chạm ≥44×44px (chuông, avatar, hamburger, theme toggle). Rà soát tổng thể bảng `min-w-[...]` đã bọc `overflow-x-auto` đúng cách. Không đổi lại sidebar/drawer (đã xong từ M00), không sửa `ProgressMap.tsx` (tránh trùng M39).

## M42 — Bỏ submenu lồng trong sidebar

Sửa `renderDashboard` (`AppHeader.tsx`): khi 1 dashboard chỉ có 1 nhãn trùng/gần trùng cụm cha và có `children`, bỏ hẳn lớp header + chevron riêng của dashboard đó — flatten mục con thẳng dưới cụm cha (chỉ còn 1 lớp gập/mở ở cấp cụm). **Không đổi** `app/lib/dashboardTree.ts` (dữ liệu cây, id/href giữ nguyên 100% — chỉ đổi cách render), không đổi `renderCluster`/`renderLeaf`/`toggleDash`.

## Test

Phần lớn module trong nhóm này verify bằng test tay qua UI thật (DevTools responsive/vision-deficiency emulation) + `npm run lint`/`typecheck` + axe E2E hiện có phải giữ xanh; `e2e/authed/notifications.spec.ts` (M40, trang mới); cập nhật `e2e/authed/appshell.spec.ts` khi cấu trúc sidebar đổi (M42).
