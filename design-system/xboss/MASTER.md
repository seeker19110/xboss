# XBoss UI/UX Master Design Contract

Nguồn sự thật cho mọi UI XBoss. File này có precedence cao hơn guideline tổng quát hoặc output
từ tool/skill bên ngoài.

## 1. Product context

XBoss là hệ quản lý thi công/ERP xây dựng, dùng ở hai môi trường trái ngược:
- **Hiện trường:** mobile, ánh sáng khó, mạng yếu, thao tác một tay, cần phản hồi nhanh.
- **Văn phòng/PM:** desktop, dữ liệu dày, bảng/biểu đồ, so sánh tiến độ/chi phí và audit trail.

Thiết kế phải ưu tiên **clarity, speed, error prevention, information hierarchy** hơn hiệu ứng trang trí.

## 2. Visual language

- Giữ cơ chế **dark-first token inversion** trong `app/globals.css`; không dùng `dark:`.
- Component không hard-code hex. Dùng token Tailwind/semantic token hiện có.
- Accent mang ý nghĩa nghiệp vụ nhất quán; không dùng màu làm tín hiệu duy nhất.
- Lucide là icon system mặc định. Không thêm icon library mới chỉ vì guideline ngoài repo.
- Tránh glassmorphism, gradient decoration, shadow nặng hoặc “AI dashboard look” nếu không phục vụ
  phân cấp thông tin.

## 3. Density & hierarchy

Dùng density theo context thay vì một layout cho mọi màn hình:
- Field/mobile: target chạm >= 44px, action quan trọng ở vùng dễ với tới, nội dung ưu tiên theo thứ tự.
- Dashboard: medium density; KPI → trend → exception → detail.
- Data table/BOQ/cost: dense nhưng scan được; header/cột định danh sticky khi cần; số dùng
  `font-mono tabular-nums` và căn phải.
- Approval/audit: trạng thái, actor, thời điểm, reason và next action phải nhìn thấy ngay.

Không hy sinh khả năng quét dữ liệu chỉ để tăng whitespace.

## 4. Responsive contract

- Thiết kế mobile là **re-prioritization**, không phải thu nhỏ desktop.
- Không ép bảng quan trọng thành card nếu làm mất khả năng so sánh cột; ưu tiên horizontal scroll,
  sticky identity column và progressive detail.
- Text container trong flex/grid phải có khả năng co; nội dung dài dùng wrapping hợp lý.
- Heading ngắn ưu tiên wrap tự nhiên; ID/URL/user content phải không phá layout.

## 5. Interaction & forms

- Mọi control có hover/active/focus-visible/disabled khi phù hợp.
- Icon-only action cần accessible name; tooltip/title chỉ là bổ sung, không thay aria-label.
- Form có label thật; lỗi cụ thể gần field và nối bằng `aria-describedby` khi cần.
- Destructive/irreversible action yêu cầu confirmation phù hợp mức rủi ro.
- Reject/nghiệm thu phải thu reason khi business flow yêu cầu.
- Loading không được làm nhấp nháy; dùng skeleton khi cấu trúc đã biết và giữ CLS < 0.1.

## 6. Required UI states

Với data-driven UI, đánh giá tối thiểu:
1. loading,
2. empty,
3. data/success,
4. error + recovery,
5. validation/conflict khi có input,
6. offline/queued khi flow hỗ trợ PWA offline,
7. unauthorized/forbidden nếu route có RBAC UX.

Không tạo state giả nếu capability không có trạng thái đó; nhưng phải chủ động xét và ghi rõ N/A.

## 7. Accessibility

- Mục tiêu WCAG 2.2 AA.
- Body text/foreground-background pair phải đạt contrast phù hợp; dùng gate repo thay vì đoán.
- Focus không bị che bởi sticky header/footer.
- Keyboard order theo visual/logical order; modal quản lý focus đúng.
- Không dùng color-only meaning; trạng thái cần text/icon/shape hỗ trợ.
- Respect `prefers-reduced-motion`; animation không được là điều kiện để state trở nên đúng.
- Touch target điều chỉnh theo ngữ cảnh nhưng field/mobile action chính không nhỏ hơn 44px.

## 8. Motion

Motion mặc định ở XBoss là **subtle, functional, interruptible**:
- animate transform/opacity khi có thể;
- state transition phải ngắn, không block input;
- reduced-motion phải bỏ/chuyển động lớn;
- tránh stagger/choreography trên bảng dữ liệu, workflow nghiệp vụ và màn hình hiện trường;
- loading spinner/progress chỉ dùng khi truyền đạt trạng thái chờ thực sự.

Không thêm GSAP chỉ để tăng “độ đẹp”.

## 9. Tables & data visualization

### Tables
- Header mô tả rõ đơn vị.
- Numeric columns: tabular nums + right align.
- Hỗ trợ scan: zebra/row hover/section grouping chỉ khi contrast vẫn đạt.
- Sticky header/identity columns khi dataset lớn.
- Truncation phải có cách xem full value.

### Charts
- Chọn chart theo câu hỏi: trend → line/area; comparison → bar; composition → stacked; schedule →
  timeline/Gantt phù hợp.
- Luôn có title/context, unit, time range, legend hợp lý và textual fallback khi cần.
- Không dùng 3D, donut/pie quá nhiều category, dual-axis nếu dễ gây hiểu sai.
- Màu chart phải giữ semantic status và đủ phân biệt khi không nhìn màu tốt.

## 10. Content

- UI production dùng tiếng Việt rõ, ngắn, chuyên nghiệp.
- Label hành động dùng động từ cụ thể: “Lưu thay đổi”, “Gửi nghiệm thu”, “Thử lại”.
- Error nói điều gì xảy ra + người dùng làm gì tiếp theo; không lộ secret/stack trace.
- Số, tiền, ngày, phần trăm hiển thị nhất quán theo domain XBoss.

## 11. Master + page override

Nếu một page thực sự cần lệch master, tạo:
`design-system/xboss/pages/<route-or-feature>.md`.

Override phải ghi:
- lý do nghiệp vụ;
- rule nào bị override;
- phạm vi;
- a11y/performance implication;
- ngày review.

Không tạo override chỉ để thay đổi thẩm mỹ cá nhân.

## 12. Review contract

Review UI theo **một outcome cụ thể mỗi lượt**:
1. xác định role + device + task chính;
2. xác định failure/risk quan sát được;
3. kiểm rule master + code hiện tại;
4. đề xuất thay đổi nhỏ nhất giải quyết risk;
5. verify bằng gate/test/screenshot phù hợp.

Các concern thường tách riêng: hierarchy, mobile ergonomics, form validation, keyboard/focus,
contrast, table density, chart semantics, loading/CLS, offline recovery, motion.

## 13. Verification

Tối thiểu cho thay đổi UI:
```bash
npm run check:ui-ux
npm run lint
npm run typecheck
```

Thay đổi flow quan trọng chạy thêm Playwright desktop/mobile + axe.
