# <M/Gxx> — Đặc tả <Tên capability>

| Thuộc tính | Giá trị |
| --- | --- |
| Issue / Goal | |
| Spec owner | |
| State | Draft / In review / **Approved for implementation** |
| Người/ngày duyệt | |
| Cập nhật | YYYY-MM-DD |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

Pain point theo vai trò (admin/PM/kỹ sư/thầu phụ/BCH/CĐT/viewer), current flow, baseline, nguồn và
ngày truy cập.

## 2. Outcome, metric và guardrail

Target đo được; error/latency/offline/a11y/security/data/cost guardrail; stop/rollback threshold.

## 3. Nghiên cứu hiện trạng

Route/component/lib/test, permission, project/org scope, SQL/schema/migration, SSE/PWA/offline,
export/report và vùng audit liên quan.

## 4. Phương án

| Phương án | Lợi ích | Chi phí/rủi ro | Kết luận |
| --- | --- | --- | --- |
| Không làm | | | |
| A | | | |
| B | | | |

## 5. Scope / non-goals

## 6. User journeys và mọi trạng thái

Happy, loading, empty, error, offline, unauthorized/forbidden, retry/conflict/recovery; desktop/mobile.

## 7. Functional và non-functional requirements

Đánh số FR/NFR; gồm a11y, performance, reliability, privacy, auditability và backward compatibility.

## 8. Acceptance criteria

Given/When/Then; mỗi AC map tới test hoặc bằng chứng manual/UAT.

## 9. Kiến trúc và điểm chạm code

Boundary, route, shared lib, client state, SSE/offline queue, file dự kiến.

## 10. API contract

Request/response/error, auth/RBAC/SoD, project/org scope, idempotency, pagination, timeout/retry.

## 11. Data contract và DDL

SQL cụ thể, index/constraint, ownership/retention, tiền/date/timezone, migration number, append-only,
verify query, compatibility và recovery. Không sửa migration đã áp.

## 12. Security/privacy/abuse

Cross-project/user access, validation, parameterized SQL, upload, secret/log/PII, rate limit, audit.

## 13. UX/a11y/content

Wireflow/copy, keyboard/screen reader, focus/touch/contrast, themes, responsive và Vietnamese export.

## 14. Observability và vận hành

Event/metric/log không PII, dashboard/alert, health check, runbook/owner.

## 15. Test plan

Unit, PostgreSQL integration, concurrent/retry/idempotency, migration, E2E desktop/mobile, axe,
offline/SSE, export và UAT theo vai trò.

## 16. Kế hoạch slice/PR

Dependency, route worker, mỗi PR một outcome, thứ tự schema→API→UI→telemetry.

## 17. Rollout/rollback

Staging, backup/restore check, canary, go/no-go, migration order, revert/reconciliation.

## 18. Risk/assumption/open decisions

| Mục | Xác minh/giảm thiểu | Owner | Hạn | Quyết định |
| --- | --- | --- | --- | --- |
| | | | | |

## 19. Approval

- [ ] Product/scope
- [ ] UX/a11y
- [ ] Architecture/API/data
- [ ] Security/RBAC/SoD/audit
- [ ] Test/telemetry/rollout/rollback
- [ ] Không còn blocking question

**Kết luận:** Draft / In review / **Approved for implementation**  
**Người/ngày duyệt:**
