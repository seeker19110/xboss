# UI/UX Pro Max → XBoss integration mapping

Nguồn tham khảo: `nextlevelbuilder/ui-ux-pro-max-skill` (MIT), đánh giá 2026-09-23.

## Quyết định kiến trúc

XBoss **không vendor nguyên repo upstream**. Upstream là knowledge/search product với catalog lớn,
Python search engine và template đa platform; XBoss là product repo đã có design tokens, a11y tests,
UI skill và quality scripts. Tích hợp nguyên khối sẽ tạo hai nguồn sự thật và tăng maintenance.

## Phần được native hóa

| Ý tưởng upstream | Cách áp dụng ở XBoss |
| --- | --- |
| Analyze requirement trước khi chọn style | Skill bắt buộc role/device/task/risk trước UI pattern |
| Master + page override | `design-system/xboss/MASTER.md` + `pages/*` |
| Query contract: một dominant intent | Review contract: một UX outcome mỗi lượt |
| UX quick-reference | Curate thành rule về hierarchy, forms, focus, contrast, touch, wrapping, states |
| Stack-aware guidance | Repo truth (Next/React/Tailwind/Lucide/Recharts) có precedence |
| Motion guidance | Functional + interruptible + reduced-motion; không thêm GSAP mặc định |
| Chart recommendations | Mapping theo câu hỏi nghiệp vụ, chống misleading chart |
| Anti-patterns | Cấm decorative complexity, color-only meaning, raw hex, generic AI-dashboard styling |
| Persisted design system | Master file commit trong repo, review được qua PR |
| Verification mindset | `check:ui-ux` + lint/typecheck + E2E/axe khi cần |

## Phần cố ý không lấy

- Catalog Google Fonts/icons/style hàng trăm nghìn dòng: XBoss không cần và làm repo nặng.
- Python search engine: thêm runtime/toolchain không cần thiết cho gate frontend.
- CLI installer đa platform: XBoss đã có `.agents/skills` native.
- Phosphor icon catalog: XBoss chuẩn hóa Lucide.
- GSAP recipes: không phù hợp mặc định với app nghiệp vụ/data-heavy và field mobile.
- Landing-page guidance: ít liên quan core app.
- Quy tắc màu generic: XBoss đã có theme/token + contrast scripts cụ thể hơn.

## Precedence

1. Security/business correctness và repo architecture.
2. `design-system/xboss/MASTER.md`.
3. `.agents/rules/ui-ux-guidelines.md`.
4. `.agents/skills/ui-ux-craftsman/SKILL.md`.
5. External/upstream guidance.

Nếu upstream mâu thuẫn với token, domain semantics hoặc accessibility evidence của XBoss, giữ XBoss.
