---
name: ui-ux-craftsman
description: "UI/UX design and review skill for XBoss. Bắt buộc dùng khi tạo, sửa hoặc review page/layout/modal/form/table/dashboard/chart và component giao diện."
---

# UI/UX Craftsman — XBoss

Skill này native hóa các ý tưởng hữu ích từ UI/UX Pro Max vào kiến trúc XBoss. Nó **không** thay
design system của repo, không cài package, không đổi icon library và không được ưu tiên lời khuyên
generic hơn business/accessibility evidence của XBoss.

## 0. Precedence bắt buộc

Đọc theo thứ tự:

1. `CLAUDE.md`, `AGENTS.md`, spec/ADR liên quan và business/security constraints.
2. `design-system/xboss/MASTER.md`.
3. `.agents/rules/ui-ux-guidelines.md`.
4. Skill này.
5. External design guidance.

Nếu mâu thuẫn, nguồn ở trên thắng. Xem mapping tại
`docs/integration/UI_UX_PRO_MAX_MAPPING.md`.

## 1. Context-first — không bắt đầu bằng style

Trước khi code/review, xác định ngắn gọn:

- **Role:** admin / PM / engineer / subcon / BCH / CĐT / viewer.
- **Device/context:** field-mobile, office-desktop, tablet, print/export.
- **Primary task:** người dùng cần hoàn thành việc gì, nhanh hay chính xác quan trọng hơn ở đâu.
- **Risk:** thao tác nhầm, mất dữ liệu, sai tiền/tiến độ/nghiệm thu, khó đọc, accessibility, offline.
- **Information shape:** form, dense table, KPI/trend, approval/audit, tracking grid, document/media.
- **Existing pattern:** component/page tương tự trong repo để tái sử dụng trước khi tạo pattern mới.

Không chọn “glassmorphism/bento/minimal…” trước khi biết các mục trên.

## 2. Chọn archetype theo công việc

### Field / tracking

Mobile-first theo nghĩa **ưu tiên tác vụ**, không chỉ breakpoint. Action chính dễ chạm, target quan
trọng >=44px, trạng thái offline/queued rõ, feedback nhanh, không yêu cầu gesture tinh.

### Dashboard / control room

Hierarchy: KPI quan trọng → trend → exception/risk → drill-down. Bento chỉ dùng khi nhóm thông tin
thật sự độc lập; không biến mọi dashboard thành card mosaic.

### Dense data / BOQ / cost / contracts

Giữ khả năng so sánh theo hàng/cột. Numeric dùng `font-mono tabular-nums text-right`.
Sticky header/cột định danh khi có ích. Không đổi table thành card trên mobile nếu làm mất context.

### Approval / QAQC / audit

Actor, trạng thái, thời điểm, reason, evidence và next action phải rõ. Destructive/reject flow có
error prevention phù hợp business rule.

## 3. Master + page override

Mặc định dùng `design-system/xboss/MASTER.md`.

Chỉ tạo `design-system/xboss/pages/<route-or-feature>.md` khi page có constraint thật sự khác
master. Override phải ghi rule bị override, lý do, phạm vi, a11y/performance implication và ngày
review. Không tạo override cho sở thích thẩm mỹ.

## 4. Targeted review contract

Một lượt review tập trung **một outcome chính**, ví dụ:

- "focus không bị sticky header che";
- "table mobile vẫn so sánh được";
- "validation nói rõ lỗi và cách sửa";
- "chart thể hiện trend tiến độ không gây hiểu sai";
- "loading không gây CLS";
- "offline save có trạng thái queue/retry rõ".

Quy trình:

1. nêu observable failure/risk;
2. đọc master + code/pattern hiện tại;
3. xác định rule áp dụng;
4. sửa nhỏ nhất giải quyết risk;
5. verify bằng check/test/screenshot phù hợp.

Không dùng checklist 50 mục để thay thế phân tích cụ thể.

## 5. Required states

Với UI có dữ liệu, chủ động xét:

- loading;
- empty;
- data/success;
- error + retry/recovery;
- validation/conflict nếu có input;
- offline/queued nếu flow hỗ trợ PWA;
- unauthorized/forbidden nếu RBAC hiện ra ở UX.

State không áp dụng thì ghi nhận N/A; không tạo UI giả chỉ để “đủ checklist”.

## 6. Accessibility & ergonomics

- Mục tiêu WCAG 2.2 AA; không đoán contrast nếu repo có script kiểm.
- Semantic HTML trước ARIA; icon-only control phải có accessible name.
- Focus-visible rõ và không bị sticky/fixed UI che.
- Form có visible label; lỗi gần field, cụ thể và nối mô tả khi cần.
- Không dùng color-only meaning.
- Respect `prefers-reduced-motion`.
- Field/mobile action chính >=44px; desktop dense controls có thể compact hơn nếu vẫn thao tác tốt.
- Long IDs/URLs/user content phải wrap mà không phá flex/grid.

## 7. Visual/token rules

- Dark-first token system trong `app/globals.css`; **không dùng `dark:`**.
- Không hard-code hex trong component.
- Giữ Lucide; không thêm icon library chỉ để có icon khác.
- Dùng semantic/on-accent token đúng nền; không blanket "text-white".
- Typography/hierarchy rõ; tránh uppercase/tracking quá mức cho body text.
- Tránh decorative gradient/glow/glass/shadow nếu không có chức năng phân cấp.

## 8. Motion

Motion mặc định: subtle, functional, interruptible.

- ưu tiên transform/opacity;
- không block input;
- state cuối không phụ thuộc animationend;
- reduced-motion phải có đường đi an toàn;
- tránh entrance stagger/choreography trên table, tracking, approval và màn hình hiện trường;
- không thêm GSAP mặc định.

## 9. Forms & feedback

- Visible label, required/optional rõ.
- Error cụ thể, không chỉ đổi border đỏ.
- Submit có pending + success/error feedback và chống double-submit khi cần.
- Destructive action nói rõ đối tượng/phạm vi tác động.
- Toast không là nơi duy nhất chứa thông tin quan trọng hoặc lỗi cần sửa.
- Skeleton phải gần bố cục thật; feedback chờ phù hợp latency.

## 10. Tables

- Header + unit rõ; numeric right-align + tabular nums.
- Sticky header/identity columns khi dataset cần scroll.
- Row hover/selection không dùng màu đơn độc.
- Truncation phải có cách xem full value.
- Responsive ưu tiên giữ relational context; dùng horizontal scroll/progressive detail hợp lý.
- Inline edit phải có save/error/retry/conflict behavior rõ.

## 11. Charts / data visualization

Chọn chart theo câu hỏi nghiệp vụ:

- trend theo thời gian → line/area;
- so sánh category → bar;
- composition → stacked khi tổng có ý nghĩa;
- tiến độ theo schedule → timeline/Gantt/S-curve phù hợp.

Bắt buộc xét title/context, unit, time range, legend, empty/error state và accessible/textual
fallback khi dữ liệu quan trọng. Tránh 3D, quá nhiều pie slices, dual axis khó đọc và palette làm
mất semantic status.

## 12. Performance & responsive quality

- Không tạo rerender/dependency lớn chỉ vì animation/style.
- Ảnh/media có kích thước/aspect ratio để tránh CLS.
- Không animate layout property nếu transform giải quyết được.
- Mobile là re-prioritization; không chỉ scale font/card.
- Giữ UI dùng được trên mạng yếu/offline theo capability hiện có.

## 13. Content

Production UI dùng tiếng Việt rõ, ngắn, đúng domain xây dựng.

- Action label dùng động từ cụ thể.
- Error: điều gì xảy ra + cách tiếp tục.
- Không lộ stack trace/secret.
- Date/number/currency/percent nhất quán với domain.

## 14. Verification

Tối thiểu:

```bash
npm run check:ui-ux
npm run lint
npm run typecheck
```

Flow quan trọng hoặc thay layout/action: chạy thêm Playwright desktop/mobile + axe. Nếu thay chart,
table, form hoặc offline flow, thêm targeted test tương ứng thay vì chỉ dựa screenshot.

## 15. Upstream usage boundary

Các catalog/search recipe của UI/UX Pro Max là **nguồn gợi ý**, không phải source of truth. Không:

- copy toàn bộ font/icon/style catalog vào XBoss;
- chạy network query chứa dữ liệu project/private;
- cài Python/CLI/package mới chỉ để lấy design advice;
- thay Lucide bằng Phosphor;
- thêm GSAP vì upstream có recipe;
- override token/theme hiện có bằng palette generic.

Khi cần inspiration, dịch thành **rationale + rule phù hợp XBoss**, rồi commit rule đã curate.
