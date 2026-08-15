# C4 — Quality, Security, Performance & DR Release Gate

> **Trạng thái:** Draft; là cổng bắt buộc trước UAT production C5.

## 1. Mục tiêu

Chứng minh release candidate hoạt động đúng trên Postgres thật, chịu được tải đại diện, không có lỗi bảo mật P0/P1, phục hồi được và có chỉ số/runbook đủ để vận hành.

## 2. Test pyramid và environment

- Unit: business rules deterministic, không mock logic cần chứng minh.
- Integration: Postgres 16 sạch và bản sao schema/data representative; `TEST_DATABASE_URL` bắt buộc trong CI release.
- API/security: session/API key/RBAC/RLS/project/org/module flags/idempotency.
- E2E: desktop + mobile, 7 vai trò, axe, offline/network failure, cross-browser hỗ trợ.
- Contract: XBoss provider + MEPF consumer fixtures, N/N-1 contract version.
- Staging: cùng runtime/config class với production; secret/data tách biệt.

Không tính test “pass” nếu bị skip do thiếu DB ở release gate. CI phải xuất số pass/fail/skip; skip bắt buộc whitelist và lý do.

## 3. Ma trận luồng trọng yếu

1. Login/2FA/session revoke/role/project switch.
2. Import Excel preview/confirm/idempotency → dashboard/tracking/export.
3. Mobile/offline tick/photo/diary → reconnect/reconcile.
4. QA hold point → progress → nghiệm thu → report.
5. BOQ/contract/VO/IPC/cost/finance với SoD và project scope.
6. MEPF ingest/retry/review → suggestion → ENG workflow/conflict, không side effect.
7. Backup/migration/restore và post-restore smoke.

Mỗi luồng có happy, validation, authorization, concurrency và dependency failure cases.

## 4. Coverage và mutation

- Giữ/ratchet thresholds hiện có; report riêng business-critical libs/routes.
- Mutation test chọn mẫu cho delayed/progress/money/RBAC/RLS/idempotency/risk/gates; chứng minh test fail khi đổi invariant.
- Không chạy theo coverage số dòng mà bỏ integration behavior.

## 5. Performance specification

### Workloads

- Dashboard/list/search: dataset nhiều project, ≥2,000 task/project.
- Tracking: concurrent reads + dimension updates + SSE clients.
- Excel import/export: file 20 MiB và file AVIO thật.
- Engineering ingest: 500 objects/2,000 relations, replay và concurrent same-key.
- Audit/graph (khi có): deep history và bounded traversal.

### SLO đề xuất để owner duyệt

| Luồng                             | Mục tiêu                      |
| --------------------------------- | ----------------------------- |
| API tương tác chính               | P95 <500 ms, error <1%        |
| Tick progress                     | P95 <750 ms end-to-end server |
| Dashboard representative          | P95 <2 s                      |
| ENG ingest max batch              | P95 <5 s                      |
| Export ~2,000 records             | <10 s                         |
| Notification/realtime propagation | <5 s khi hạ tầng khỏe         |

Ghi hardware/concurrency/dataset. SLO chỉ khóa sau baseline; không “tối ưu” nếu chưa đo.

### Query gate

- Query mới/nóng có `EXPLAIN (ANALYZE, BUFFERS)`; lưu plan trước/sau.
- Kiểm N+1, sequential scan bất hợp lý, lock contention, pool saturation và long transaction.
- Index phải có workload/chỉ số chứng minh và migration rollback/size estimate.

## 6. Security verification

### Threat model

- Assets: project/commercial/PII/CAD-BIM/API keys/approval/audit/backups.
- Boundaries: browser/API/DB/storage/cron/webhook/MEPF connector/AI tool output.
- Threats: IDOR, cross-project/org, privilege escalation, mass assignment, SQL/JSON injection, SSRF, upload/polyglot, replay, secret leak, prompt/tool injection và audit tamper.

### Tests/gates

- Auth/authz negative per route family; RLS with NOBYPASSRLS role.
- CSRF same-origin, cookies, headers/CSP, rate limit, API key expiry/revoke/rotation.
- Upload MIME sniff/size/path traversal/malware policy; external URL allowlist/pinned lookup.
- Dependency audit high/critical=0, gitleaks, SBOM/license review cho dependency mới.
- Log redaction scan: secret/token/password/raw sensitive payload không xuất hiện.

## 7. Reliability và failure injection

- DB unavailable/slow/connection exhaustion; transaction rollback.
- Storage unavailable/partial upload/delete retry.
- Email/Telegram/webhook/cron failure không làm hỏng transaction lõi.
- SSE disconnect/fallback polling; offline queue conflicts.
- MEPF timeout sau commit, 429/5xx, duplicate/reorder.

Hệ phải fail closed ở auth/policy và fail explicit ở engineering decision; không giả success.

## 8. Backup, restore và DR

- Xác nhận backup Postgres + object storage + config/secret inventory; encryption/access/retention.
- Restore vào environment cô lập theo lịch; chạy migrations, integrity counts/checksums và smoke trọng yếu.
- RPO/RTO đề xuất: ≤24h/≤4h, owner phê duyệt hoặc thay bằng mục tiêu thực tế.
- Runbook: accidental delete, bad migration, DB corruption, storage loss, key compromise và region/VPS failure.
- Mỗi drill có timestamp, artifact IDs, elapsed time, issues/owner và corrective action.

## 9. Observability

- Structured logs/correlation; Sentry release/environment/user/project-safe context.
- Metrics: API latency/errors, DB pool/slow query, cron/webhook, SSE, offline sync, import, engineering ingest/review/workflow.
- Alert có threshold/dedup/runbook/owner; diễn tập alert tới người trực.
- Dashboard release so sánh baseline trước/sau deploy.

## 10. Chia PR/run

- **C4.1:** full integration/E2E matrix + skip enforcement.
- **C4.2:** load harness/baseline/query fixes.
- **C4.3:** threat model/security fixes.
- **C4.4:** DR/observability/runbooks/drills.
- Release gate run là artifact riêng, không chỉ comment “CI xanh”.

## 11. Definition of Done

- [ ] Full suite DB thật xanh; skip chỉ whitelist.
- [ ] P0/P1 security/quality = 0; high/critical dependency = 0.
- [ ] SLO/load đạt trên environment ghi rõ.
- [ ] Restore drill đạt RPO/RTO đã duyệt.
- [ ] Failure injection không mất/duplicate dữ liệu ngoài contract.
- [ ] Alert/runbook/on-call được thử và có owner.
