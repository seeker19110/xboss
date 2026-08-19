# Goal: Hoàn thiện XBoss v1.0 (Product Complete)

| Thuộc tính            | Giá trị                                                          |
| --------------------- | ---------------------------------------------------------------- |
| Goal ID               | GOAL-2026-V1-PRODUCT-COMPLETE                                    |
| Owner                 | Seeker / Engineering Lead                                        |
| State                 | ACTIVE                                                           |
| Main SHA đã reconcile | ed94f858ef555609431cb88473c53950eca07e8e                         |
| Bắt đầu / review      | 2026-08-19 / 2026-08-25                                          |
| Quyền AI              | research / branch / PR / ready / merge / deploy                  |
| Budget/guardrails     | Max 3 repair attempts/failure; No bypass RLS; No unredacted logs |

## Outcome và Goal DoD

- **Vai trò/người dùng:** Toàn bộ vai trò (Admin, PM, Engineer, Subcon, BCH, CĐT, Viewer) vận hành trên hệ thống đa dự án với kiểm soát dữ liệu, RLS, audit log và quy trình phê duyệt nghiêm ngặt.
- **Baseline → target:** v0.3.0 beta → v1.0.0 Production Ready (Product Complete).
- **Cửa sổ đo:** 100% test passing, 0 type errors, 0 unapproved migrations, RLS/audit invariants bất khả xâm phạm.
- **Guardrails:** PostgreSQL raw SQL, parameterized queries, RLS with `NOBYPASSRLS`, không lộ credentials trong log/telemetry.
- **Completion approver:** Seeker

## Scope / non-goals

### In scope

- Chuỗi phase C0 → C6 trong `docs/nang-cap/PROJECT-COMPLETION-ROADMAP.md`:
  - C0: Baseline governance & doc drift
  - C1 (ENG-5): Integration contract & idempotency
  - C2: MEPF-Agents connector & pilot dataset/readiness
  - C3: Data, audit UUID, RLS hardening
  - C4: Quality, security, performance, DR release gate
  - C5: UAT & production rollout runbook
  - C6: v1.0 closeout & release tagging

### Không làm (Non-goals)

- Không triển khai các tính năng tầng tương lai (Digital Twin, Predictive OS, Controlled Autonomy A3+) khi chưa có traffic thật và phê duyệt riêng từ người dùng.
- Không tự động thay đổi schema/migration trên production đang chạy mà không qua staging testing & backup/rollback verification.

## Milestones và slices

| ID   | Outcome/AC                                            | Dependency | Spec                                     | Issue | PR               | State | Evidence                           |
| ---- | ----------------------------------------------------- | ---------- | ---------------------------------------- | ----- | ---------------- | ----- | ---------------------------------- |
| C0   | Sửa doc drift, chốt baseline quản trị                 | -          | `C0-release-baseline-governance.md`      | -     | #351, #355       | DONE  | Commit ed94f85                     |
| C1   | ENG-5 Ingest contract, OpenAPI 3.1 & fixture          | C0         | `ENG-5-integration-contract-pilot.md`    | -     | #348             | DONE  | Commit 5cd4e0e                     |
| C3   | RLS, Invariant, Audit UUID, Import batches, Retention | C1         | `C3-data-audit-rls-hardening.md`         | -     | #347, #349, #350 | DONE  | Migrations 0088-0093               |
| C4.1 | Mutation check, runner pass/fail/skip, log redaction  | C3         | `C4-quality-security-dr-release-gate.md` | -     | #351-#354        | DONE  | scripts/mutation-check.mjs         |
| C4.2 | DR restore integrity check & Release Gate suite       | C4.1       | `C4-quality-security-dr-release-gate.md` | -     | -                | BUILD | scripts/verify-dr-restore.ts       |
| C2   | MEPF-Agents connector readiness & pilot harness       | C1, C4     | `C2-mepf-connector-pilot.md`             | -     | -                | READY | tests/fixtures/engineering-ingest/ |
| C5   | UAT readiness & Production rollout checklist          | C2, C4     | `C5-uat-production-rollout.md`           | -     | -                | READY | docs/nang-cap/C5-*.md              |
| C6   | Release closeout, v1.0 release manifest & tagging     | C5         | `C6-v1-release-closeout.md`              | -     | -                | READY | docs/nang-cap/C6-*.md              |

## Risk register

| Risk                              | Trigger                        | Mitigation/rollback                                       | Owner    | State     |
| --------------------------------- | ------------------------------ | --------------------------------------------------------- | -------- | --------- |
| Lỗi dữ liệu/mất mát khi migration | Áp migration không tương thích | Append-only migration, snapshot trước khi áp              | DB Lead  | MITIGATED |
| Rò rỉ thông tin nhạy cảm qua log  | In lỗi hoặc request context    | Redaction 2 lớp trong lib/log.ts                          | Sec Lead | MITIGATED |
| Bị lọt test khi thiếu DB          | Test skip mà vẫn báo pass      | Runner đếm từng ca, release gate chặn skip chưa whitelist | QA Lead  | MITIGATED |

## Current truth

- **Goal gap:** C0, C1, C3, C4.1 đã xong. Đang tiến hành C4.2 (DR Restore verification & Release gate) và mở tiếp C2, C5, C6.
- **Production/migration truth:** 93 migrations liên tục, ERD đồng bộ, test suite 134 files xanh.
- **Blocker/câu hỏi:** Không có blocker.
- **Next best slice và lý do:** C4.2 (DR Restore verification script) để hoàn tất trụ cột DR/Reliability trước khi kích hoạt C2 & C5.
- **Quyền cần thêm:** Không cần quyền thêm.

## Iteration log

### Iteration 1 — 2026-08-19

- **State / main SHA:** ACTIVE / `ed94f858ef555609431cb88473c53950eca07e8e`
- **Slice:** C4.2 DR restore verification & Release Gate hardening
- **Gap trước/sau:** Khởi tạo goal tracker, bổ sung script kiểm tra khôi phục DR/audit integrity
- **Validation/test count/metric:** 134 test files, typecheck pass, mutation check pass
- **Next slice:** C2 MEPF Connector & Pilot harness validation
