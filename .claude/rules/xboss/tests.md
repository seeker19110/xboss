---
paths:
  - "tests/**/*.ts"
  - "e2e/**/*.ts"
---

# Checklist khi viết/sửa test (XBoss)

- `node:test` + `node:assert/strict` qua `tsx` (ADR-0002); chạy 1 file:
  `npx tsx --test tests/<ten>.test.ts`. Không Jest/Vitest.
- File chạm DB: `import { HAS_TEST_DB } from "./setup";` là **dòng import đầu tiên** (xoá `DATABASE_URL`, chống ghi nhầm
  DB thật). Không có `TEST_DATABASE_URL` thì test tích hợp tự skip — chạy cục bộ với
  `npm test -- --release-gate` để skip bị coi là lỗi (TRAPS.md §2).
- Không gán cứng id nhỏ vào cột khoá ngoại tới `users` (`created_by`, `actorId`…) — tạo user thật
  (`npm run check:test-fk-ids`).
- Test luồng nghiệp vụ qua **route handler thật** với đúng người bấm, không chỉ gọi lib/UPDATE
  tay (TRAPS.md §6).
- Fix lỗi logic: tái hiện bằng test, **gỡ tạm bản vá để thấy test đỏ**, rồi mới sửa.
- Skip có chủ đích phải có lý do trong `scripts/test-skip-allowlist.json`; bất biến cốt lõi có
  canh bằng `npm run test:mutation` — đổi bất biến thì cập nhật mutation tương ứng.
- Độ phủ: ratchet `coverage-baseline.json` (`npm run check:coverage`), không tụt.
