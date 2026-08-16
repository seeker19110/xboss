<!-- Tiêu đề Conventional Commits, mô tả tiếng Việt. -->

## Thay đổi gì

-

## Issue / Goal

Closes #

## Research / Spec

<!-- Bắt buộc với feat: docs/nang-cap/<spec>.md đã Approved for implementation. -->

- Goal:
- Spec:
- Trạng thái/người/ngày duyệt:
- Điểm lệch so với spec:

## Loại thay đổi

- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] docs/spec
- [ ] test
- [ ] chore/ci
- [ ] breaking change

## Validation

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run check:sw-exclude`
- [ ] `npm run check:migrations`
- [ ] `npm test -- --release-gate` với PostgreSQL test khi cần
- [ ] `npm run build`
- [ ] `npm run test:e2e` desktop/mobile + axe khi đổi flow/UI/API/auth
- [ ] Audit hẹp theo `docs/audit.md` nếu chạm vùng rủi ro

### Bằng chứng

<!-- Test count, screenshot/UAT, query migration, metric delta. -->

## Ảnh hưởng, rollout và rollback

- Vai trò/project/critical flow:
- Auth/RBAC/SoD/project scope:
- Data/migration/ERD:
- Offline/SSE/PWA/export:
- Rollout/canary/health check:
- Backup/rollback/reconciliation:

## Definition of Done

- [ ] Với feat: research hoàn tất; spec merge và Approved trước source code.
- [ ] Implementation khớp spec; deviation được review.
- [ ] AC có bằng chứng; không còn blocker.
- [ ] Diff đúng scope; không secret/production data/debug/generated rác.
- [ ] Auth/permission/project scope/input/SQL parameterization đã soát.
- [ ] Migration append-only, không trùng số, có verify/recovery và ERD cập nhật.
- [ ] Test chứng minh behavior/race/retry/idempotency phù hợp.
- [ ] Docs/ADR/PROGRESS/telemetry/runbook cập nhật khi cần.
- [ ] Required CI xanh; review thread đã giải quyết.

## Ghi chú reviewer
