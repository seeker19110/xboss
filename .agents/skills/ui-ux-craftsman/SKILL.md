---
name: ui-ux-craftsman
description: "Quy chuẩn thiết kế UI/UX đỉnh cao và quy trình triển khai trang/component cho XBoss. Bắt buộc kích hoạt khi tạo mới, thiết kế, review hoặc sửa đổi bất kỳ trang (page), layout, modal, form, bảng dữ liệu (table), dashboard hay component giao diện nào."
---

# UI/UX CRAFTSMAN — QUY CHUẨN THIẾT KẾ ĐỈNH CAO, CÔNG THÁI HỌC & KHẢ NĂNG TIẾP CẬN ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức thiết kế giao diện cao cấp (Masterclass UI/UX Design System), công thái học thao tác một tay ngoài công trường (Thumb-Zone Ergonomics), tiêu chuẩn khả năng tiếp cận quốc tế (**WCAG 2.2 AA**), ma trận tương phản 5 Theme độc quyền, và 4 bố cục mẫu chuyên biệt (4 Page Archetypes) cho nền tảng XBoss.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Bất biến Cơ Chế Đảo Màu Dark-First Qua Biến CSS (Dark-First Invariant):**
   - Viết class Tailwind theo chế độ tối; chế độ sáng **tự đảo màu** qua override biến CSS trong `app/globals.css` (`html.light`).
   - Tuyệt đối **KHÔNG dùng biến thể `dark:`** và **KHÔNG hardcode mã màu hex `#...`** trong bất kỳ component nào để tránh làm vỡ cơ chế đổi theme toàn cục.

2. **Bất biến Phân Cấp Thang Màu Zinc (Zinc Scale Hierarchy Invariant):**
   - Nền chính trang: `bg-background`
   - Bề mặt Card/Panel: `bg-zinc-950` hoặc `bg-zinc-900`
   - Viền ngăn cách: `border-zinc-800` (hoặc `border-zinc-700` khi cần tương phản mạnh)
   - Chữ chính (Primary text): `text-zinc-100` hoặc `text-foreground`
   - Chữ phụ (Secondary text): `text-zinc-400` (đạt chuẩn tương phản AA $\ge 4.5:1$ trên mọi theme; cấm dùng `text-zinc-500` hay `text-zinc-600` cho body text).

3. **Bất biến Vùng Chạm Ngón Cái Trên Di Động (Touch-First $\ge 44\text{px}$ Invariant):**
   - Toàn bộ các nút bấm, ô checkbox, hàng bảng dữ liệu chọn được trên thiết bị di động bắt buộc có diện tích chạm tối thiểu $44 \times 44\text{px}$ (`min-h-[44px] min-w-[44px]`), đặt tại nửa dưới màn hình (Thumb-Zone) để kỹ sư thao tác mượt mà bằng một tay ngoài công trường.

4. **Bất biến Đủ 5 Trạng Thái Giao Diện & Zero CLS (The 5 States & Zero CLS Invariant):**
   - Mọi trang/component có tải dữ liệu bắt buộc phải hoàn thiện đủ 5 trạng thái: (1) Empty State, (2) Skeleton Loading (`animate-pulse` khớp $100\%$ bố cục), (3) Data Loaded, (4) Error/Offline State kèm nút Thử lại, (5) Field-level Validation feedback.
   - Điểm giật bố cục khi tải trang Cumulative Layout Shift $CLS < 0.1$.

5. **Bất biến Tương Phản Màu WCAG 2.2 AA Trên 5 Themes (Contrast Ratio $\ge 4.5:1$):**
   - Nút hành động chữ trắng (`--on-accent`): Luôn dùng accent cấp `-600` hoặc `-700` (`bg-emerald-600 hover:bg-emerald-700`, `bg-blue-600`, `bg-rose-700`) để đảm bảo tỷ lệ tương phản $\ge 4.5:1$ trên cả 5 theme (`dark`, `light`, `kingblue`, `darkblue`, `navy`).

6. **Bất biến Định Dạng Số & Tiền Tệ (Mono Tabular-Nums Invariant):**
   - Toàn bộ số liệu tiến độ $\%$, khối lượng, đơn giá, số tiền VND và mã hiệu WBS bắt buộc sử dụng font chữ `font-mono tabular-nums` và căn lề phải (`text-right`) trong bảng biểu để các chữ số thẳng hàng dọc dễ so sánh.

7. **Bất biến Bảng Dữ Liệu Dày Cố Định Tiêu Đề (Sticky Header/Columns Invariant):**
   - Bảng theo dõi tiến độ và bảng BOQ mật độ cao (Data-Dense Table) bắt buộc phải cố định dòng tiêu đề (`sticky top-0`) và cột mã hiệu/tên bên trái (`sticky left-0`) khi cuộn ngang dọc.

8. **Bất biến Tiến Trình Nghiệm Thu & Lý Do Từ Chối Bắt Buộc (Stepper & Rejection Invariant):**
   - Các luồng phê duyệt/nghiệm thu bắt buộc hiển thị dạng **Stepper** trực quan từng bước. Nút "Từ chối" (Reject) BẮT BUỘC mở modal yêu cầu nhập lý do chi tiết trước khi gửi API.

9. **Bất biến Bản In Thân Thiện Trang Báo Cáo (`@media print` Invariant):**
   - Trang `/report` và các trang in ấn bắt buộc phải có CSS `@media print` ẩn toàn bộ thanh điều hướng, nút bấm, header/footer của app để xuất PDF vừa vặn khổ giấy A4 sạch đẹp.

10. **Bất biến Bản Địa Hóa 100% Tiếng Việt (Zero English Untranslated Invariant):**
    - Toàn bộ nhãn, tiêu đề, thông điệp lỗi, cảnh báo, tooltip và email/push notification bắt buộc viết bằng **tiếng Việt chuẩn mực**, rõ ràng, văn phong kỹ thuật xây dựng chuyên nghiệp.

---

## 2. BỐN BỐ CỤC MẪU CHUYÊN BIỆT (4 PAGE ARCHETYPES)

1. **Archetype 1 — Hiện trường & Tracking Di động (`engineer`/`subcon`):**
   - Layout tối ưu cuộn dọc, nút nổi Thumb-Action Bar cố định đáy màn hình, bảng chọn nhanh tầng/zone, hỗ trợ Offline Queue Badge.
2. **Archetype 2 — PM Bento Dashboard (`pm`/`bch`/`cdt`):**
   - Bố cục Bento Grid đa thẻ, tích hợp thẻ KPI Sparkline, biểu đồ S-Curve và Heatmap tiến độ.
3. **Archetype 3 — Bảng Dữ liệu Lớn & BOQ/Chi phí (`qs`/`ke_toan`):**
   - Mật độ cao (Compact rows), Sticky Headers, Cây phân cấp WBS mở rộng/thu gọn mượt mà, Inline Editing ô dữ liệu.
4. **Archetype 4 — Nghiệm thu, Cổng Kiểm soát & Ký Số (Approval Stepper):**
   - Thanh tiến trình Stepper từng bước, Carousel xem ảnh hiện trường Fullscreen Lightbox, Audit Trail timeline hiển thị chữ ký số.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] wcag-contrast-matrix-and-tokens

# CẨM NANG BẢNG MA TRẬN TƯƠNG PHẢN WCAG 2.2 AA TRÊN 5 THEMES

## 1. QUY TẮC TƯƠNG PHẢN BODY TEXT THANG ZINC

| Theme        | `text-zinc-400` trên nền Thẻ (`bg-zinc-950` / `bg-zinc-900`) |  Kết luận WCAG 2.2 AA  |
| :----------- | :----------------------------------------------------------: | :--------------------: |
| **dark**     |        $7.72:1 - 6.91:1$ (Ngưỡng yêu cầu $\ge 4.5:1$)        | **PASS (Rất an toàn)** |
| **light**    |                      $7.73:1 - 7.03:1$                       | **PASS (Rất an toàn)** |
| **kingblue** |                      $6.93:1 - 5.35:1$                       |   **PASS (An toàn)**   |
| **darkblue** |                      $7.33:1 - 5.99:1$                       |   **PASS (An toàn)**   |
| **navy**     |                      $7.66:1 - 6.64:1$                       |   **PASS (An toàn)**   |

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/ui_ux_validator.ts](file:///c:/Users/liend/xboss/.agents/skills/ui-ux-craftsman/scripts/ui_ux_validator.ts): Bộ kịch bản CLI kiểm tra tự động tỷ lệ tương phản WCAG 2.2 AA của hệ token trên 5 theme và xác thực 5 trạng thái UI.
