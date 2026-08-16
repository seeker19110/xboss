# Quy trình đóng góp — XBoss

Nguồn chi tiết: `CLAUDE.md`, `AGENTS.md`, `docs/AI_DELIVERY_LOOP.md` và `docs/audit.md`.

## Luồng bắt buộc

**Idea → Research → Spec được duyệt → Plan → Code → Verify → PR → Merge → Observe.**

Mọi feature phải có đặc tả `docs/nang-cap/*` ghi **Approved for implementation**, người và ngày
duyệt trước khi sửa source. Mục tiêu nhiều PR phải có `docs/goals/<goal-id>.md`; sau mỗi merge
đo lại goal gap và chọn một slice Ready tiếp theo.

## Git/PR

1. Đồng bộ `main`.
2. Spec: `docs/spec-<issue>-<slug>`; implementation: `feat|fix/<issue>-<slug>`.
3. Commit Conventional Commits, một thay đổi logic mỗi commit.
4. Mở draft PR sớm, link Goal/Issue/Spec.
5. Chuyển Ready khi đủ evidence; đợi `CI` và `PR policy` xanh.
6. Merge qua PR theo quyền được cấp; xác minh deploy/metric rồi checkpoint Goal.

Không push trực tiếp `main`. Không xây code phụ thuộc lên base chưa merge khi có thể tránh.

## Gate cục bộ

```bash
npm run lint
npm run typecheck
npm run check:sw-exclude
npm run check:migrations
npm test -- --release-gate
npm run build
npm run test:e2e
```

Test DB dùng PostgreSQL disposable. Documentation-only: Prettier file đổi + `git diff --check`.

## Definition of Done

- AC có bằng chứng; implementation khớp spec.
- Route có auth/RBAC/SoD/project scope và input validation đúng.
- SQL dùng placeholder; migration append-only, có verify/recovery và ERD.
- Race/retry/idempotency, offline/SSE/PWA, export và a11y được test khi liên quan.
- Không secret/dữ liệu production; diff đúng scope.
- Audit hẹp vùng rủi ro; docs/ADR/PROGRESS/telemetry/runbook cập nhật.
- Required checks xanh và review được giải quyết.

## Giới hạn vòng lặp AI

Một iteration = một outcome + một PR. Cùng failure sửa tối đa ba lần. Dừng WAITING/BLOCKED khi
cần quyết định product/architecture, secret/production/chi phí/quyền mới, destructive migration,
CI ngoài scope hoặc guardrail vượt ngưỡng. Không hạ gate hoặc nới bảo mật để làm test xanh.
