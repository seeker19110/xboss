# UX01 — Tích hợp UI/UX Pro Max vào XBoss

| Thuộc tính       | Giá trị |
| ---------------- | ------- |
| Issue / Goal     | Nâng chuẩn thiết kế và review UI/UX của XBoss |
| Spec owner       | XBoss owner |
| State            | **Approved for implementation** |
| Người/ngày duyệt | Owner — yêu cầu trực tiếp trong chat, 2026-09-23 |
| Cập nhật         | 2026-09-23 |

## 1. Problem, vai trò và bằng chứng

XBoss đã có `.agents/skills/ui-ux-craftsman`, rule UI/UX, axe E2E, token theme và các script
contrast/hex. Tuy nhiên workflow hiện tại thiếu một số cơ chế có giá trị cao từ
`nextlevelbuilder/ui-ux-pro-max-skill`: phân tích context trước khi thiết kế, design-system
master + page override, query/review contract theo một mục tiêu UX, anti-pattern checklist,
motion/reduced-motion, hierarchy responsive và guidance riêng cho chart/data-heavy UI.

## 2. Outcome, metric và guardrail

Outcome: mọi thay đổi frontend có một nguồn sự thật UI/UX XBoss, tránh agent tự sáng tạo style
không nhất quán. Guardrail: không thêm runtime dependency, không thay Lucide, không copy catalog
lớn/Python engine của upstream, không phá dark-first token system, không hạ quality gate hiện có.

## 3. Nghiên cứu hiện trạng

- Stack: Next.js 16, React 19, Tailwind 4, Lucide, Recharts.
- Theme/token: `app/globals.css`, dark-first với nhiều theme và semantic on-accent tokens.
- Gate hiện có: `check:mau-accent`, `check:contrast`, `check:hex-hardcode`, Playwright + axe.
- Agent UI: `.agents/skills/ui-ux-craftsman/SKILL.md`,
  `.agents/rules/ui-ux-guidelines.md`.
- Upstream: MIT; thế mạnh nằm ở workflow/search taxonomy/checklist, không cần vendor toàn bộ data.

## 4. Phương án

| Phương án | Lợi ích | Chi phí/rủi ro | Kết luận |
| --------- | ------- | -------------- | -------- |
| Không làm | Không đổi repo | Mất workflow/review intelligence | Loại |
| Vendor toàn bộ upstream | Có đủ catalog/search engine | Nặng repo, Python, trùng rule, khó đồng bộ | Loại |
| Native hóa vào skill XBoss | Nhẹ, đúng domain, dùng gate sẵn có | Cần curate guideline | **Chọn** |

## 5. Scope / non-goals

Scope: nâng `ui-ux-craftsman`, rule tự động, master design contract, integration mapping và
một lệnh `check:ui-ux` tổng hợp gate UI. Non-goal: redesign hàng loạt màn hình, đổi component
library, đổi icon set, thêm GSAP/Python/catalog upstream.

## 6. User journeys và mọi trạng thái

Skill phải buộc agent xét desktop/mobile; loading/empty/data/error/offline/validation; keyboard,
screen reader, focus, touch target; reduced motion; bảng/chart; theme và nội dung tiếng Việt.

## 7. Functional và non-functional requirements

- FR1: context-first trước khi chọn pattern/style.
- FR2: đọc `design-system/xboss/MASTER.md`; page override chỉ khi có lý do rõ.
- FR3: review một concern cụ thể trước, tránh checklist chung chung.
- FR4: dùng stack/repo truth trước lời khuyên upstream.
- FR5: `check:ui-ux` chạy các gate UI hiện hữu + validator skill.
- NFR1: zero runtime dependency; NFR2: backward compatible; NFR3: không network trong gate.

## 8. Acceptance criteria

- AC1: skill nêu rõ precedence XBoss > upstream.
- AC2: có master contract cho hierarchy, density, motion, a11y, tables/charts/forms.
- AC3: rule frontend trỏ tới master + skill và yêu cầu `npm run check:ui-ux`.
- AC4: package có script `check:ui-ux`.
- AC5: integration doc ghi rõ phần lấy/phần loại và lý do.

## 9. Kiến trúc và điểm chạm code

Chỉ thay đổi docs/agent tooling:
`.agents/skills/ui-ux-craftsman/**`, `.agents/rules/ui-ux-guidelines.md`,
`design-system/xboss/MASTER.md`, `docs/integration/UI_UX_PRO_MAX_MAPPING.md`, `package.json`.

## 10. API contract

Không đổi API.

## 11. Data contract và DDL

Không đổi DB/schema/migration.

## 12. Security/privacy/abuse

Không gửi dữ liệu dự án ra ngoài để tìm design guidance. Không thêm network call vào validator.

## 13. UX/a11y/content

WCAG 2.2 AA, focus-visible, touch target phù hợp context, semantic HTML/ARIA, reduced motion,
không dùng màu là tín hiệu duy nhất, responsive hierarchy và tiếng Việt.

## 14. Observability và vận hành

Quality gate chạy cục bộ/CI; lỗi gate phải chỉ ra check con bị fail.

## 15. Test plan

Chạy `npm run check:ui-ux`, lint, typecheck. Không cần DB.

## 16. Kế hoạch slice/PR

Một PR: spec + design contract + skill/rule + gate.

## 17. Rollout/rollback

Docs/tooling only; rollback bằng revert PR, không migration/data reconciliation.

## 18. Risk/assumption/open decisions

| Mục | Xác minh/giảm thiểu | Owner | Hạn | Quyết định |
| --- | ------------------- | ----- | --- | ---------- |
| Trùng/đá nhau guideline | XBoss master có precedence tuyệt đối | Owner | 2026-09-23 | Đóng |
| Repo phình to | Không vendor catalog/Python upstream | Owner | 2026-09-23 | Đóng |

## 19. Approval

- [x] Product/scope
- [x] UX/a11y
- [x] Architecture/API/data
- [x] Security/RBAC/SoD/audit
- [x] Test/telemetry/rollout/rollback
- [x] Không còn blocking question

**Kết luận:** **Approved for implementation**  
**Người/ngày duyệt:** Owner — yêu cầu “đánh giá rồi tích hợp điểm hay, tốt”, 2026-09-23
