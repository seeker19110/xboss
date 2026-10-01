# Ưu tiên khi lớp ECC mâu thuẫn với XBoss

Repo vendor một phần **ECC** (Everything Claude Code, `affaan-m/ECC`, MIT — xem ADR-0013): rules
`.claude/rules/ecc/**`, agent `ecc-*`, skill `ecc-*`, command `/ecc-*`. Đó là kho kiến thức
**chung** viết cho mọi dự án; XBoss có quy ước riêng. Khi hai bên nói khác nhau:

**`CLAUDE.md` + `docs/adr/*` + `docs/audit.md` + `.claude/rules/xboss/*` THẮNG `ecc-*`.**
Không hỏi lại người dùng về các điểm đã liệt kê dưới đây — chúng đã được chốt.

## Tên gọi

- Mọi thành phần ECC trong repo mang tiền tố `ecc-`. Nội dung ECC nhắc `planner`,
  `ecc:planner`, `/plan`, `/code-review`… thì hiểu là agent `ecc-planner`, command `/ecc-plan`,
  `/ecc-code-review`. Thành phần ECC **không** vendor (`/orchestrate`, `/multi-*`, `/plan-canvas`,
  hookify, instinct/continuous-learning-v2, AgentShield cài sẵn, hook runtime `scripts/hooks/*.js`)
  thì **không có** — đừng gọi, đừng cài thêm khi chưa hỏi.
- Skill/command nhắc lệnh `gh …`: phiên cloud không có `gh` CLI → dùng tool `mcp__github__*`.

## Điểm ghi đè đã chốt

1. **Ai làm việc gì**: luồng 3 tầng + bảng `route:` trong `CLAUDE.md` quyết định. Agent `ecc-*`
   là **chuyên gia bổ trợ** gọi theo mục "Định tuyến ECC" của `CLAUDE.md` — không tự kích hoạt
   kiểu "use proactively / no user prompt needed" như văn bản ECC.
2. **Test**: `node:test` qua `tsx` + `node:assert/strict` (ADR-0002). Không Jest/Vitest/RTL/MSW;
   ví dụ `expect(x).toBe(y)` của ECC → `assert.equal(x, y)`. UI kiểm bằng Playwright + axe
   (`e2e/`). File test chạm DB import `tests/setup.ts` đầu tiên.
3. **Độ phủ**: không có mốc "80% cứng" — cổng là **ratchet** `coverage-baseline.json`
   (`npm run check:coverage`), không tụt so với lần đo trước.
4. **TDD**: với fix lỗi logic, test hồi quy phải được thấy **đỏ trên code cũ** trước khi sửa
   (cách làm đã dùng ở các đợt audit) — khớp `ecc-tdd-workflow`; với tính năng mới thì test đi
   cùng PR là đủ, không bắt buộc RED-first từng hàm.
5. **DB**: raw SQL qua `lib/db` với placeholder `?` (ADR-0001) — không ORM/Prisma/Supabase/Drizzle.
   Phần "Supabase best practices" trong `ecc-postgres-patterns`/`ecc-database-reviewer` chỉ dùng
   phần Postgres thuần; RLS theo ADR-0005. Migration **append-only** `migrations/000N_*.sql`,
   idempotent (`IF NOT EXISTS`), không down-migration; migration đụng dữ liệu đi qua staging.
6. **Tiền**: cấm cộng/nhân tiền trên float JS — tổng/tích làm trong SQL, còn lại qua
   `lib/nen/money.ts`.
7. **API**: route giữ format phản hồi hiện có (`NextResponse.json(data)` / `{ error: "<tiếng Việt>" }`
   với mã HTTP đúng) — **không** đổi sang envelope `{ success, data, error, meta }` của ECC.
   Route chỉ là ranh giới HTTP (ADR-0008): `getCurrentUser()` → 401, quyền qua `CAN`/
   `canTouchTask`, `export const dynamic = "force-dynamic"`.
8. **Kiến trúc**: không áp "Repository pattern"/hexagonal của ECC — `lib/` chia theo miền + số
   tầng (ADR-0007, `npm run check:lib-layers`). Tìm tái dùng trong `lib/*`, `app/components/ui/`
   trước; thêm gói npm mới phải nêu lý do (CI chạy `npm audit`).
9. **Phong cách**: "immutability / hàm < 50 dòng / file < 800 dòng" là hướng dẫn mềm cho code
   MỚI — không refactor code cũ ngoài phạm vi PR chỉ để đạt.
10. **Log**: không `console.log` trong `app/`/`lib/` — dùng `lib/nen/log.ts` (đã lọc secret).
11. **UI**: hệ token dark-first thang `zinc`, **không** `dark:`, **không** hex trong component,
    bộ `app/components/ui/` (ADR-0009/0010, `design-system/xboss/MASTER.md`) thắng mọi gợi ý
    thẩm mỹ của `ecc-design-system`, `ecc-make-interfaces-feel-better`, `rules/ecc/web/*`.
    Mọi nhãn/thông báo tiếng Việt.
12. **Commit/PR**: prefix conventional + mô tả **tiếng Việt**; giữ dòng attribution; PR mở qua
    GitHub MCP; merge khi CI xanh theo `CLAUDE.md`.
13. **Model**: bảng định tuyến XBoss thắng mục "Model Selection" của `rules/ecc/common/performance.md`.
14. **Tài liệu & trí nhớ**: ghi vào `PROGRESS.md`, `docs/adr/`, `docs/nang-cap/`, `docs/audit.md`.
    Không tự tạo thư mục gốc mới mà ECC gợi ý (`docs/CODEMAPS/`, `.ecc/`, `openspec/`,
    `~/.claude/session-data/`) khi chưa hỏi — container cloud bị thu hồi, chỉ cái gì **commit vào
    repo** mới còn. Bài học lặp lại → skill `/hoc`.
15. **Công cụ ngoài**: không chạy `npx <gói>` khi gói đó **không có trong `package.json`** (là
    dependency, hoặc script đã ghim phiên bản như `npm run ocr`) mà chưa hỏi người dùng — vd
    `ecc-agentshield`, `ecc-universal`, `knip`, `depcheck`, `ts-prune`, `madge`, `lighthouse`, bundle
    analyzer, `prisma`, `drizzle-kit`, `vitest`, `jest`. Tải và chạy mã ngoài là bề mặt chuỗi cung
    ứng. Dùng tương đương sẵn có: `npm run check:dead-code`/`check:dead-routes` (thay
    knip/ts-prune/depcheck), workflow `lighthouse-ci.yml`, `npx playwright` (đã cài). Lệnh dọn kiểu
    `rm -rf node_modules …` bị `settings.json` chặn — dùng `npm ci`.
