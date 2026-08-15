# OS-4 — Controlled Autonomy & Safe Execution

> **Trạng thái:** Conditional draft. A0–A2 là trần mặc định.
> **Luật cứng:** A3+ chỉ được đặc tả thi hành/code/kích hoạt sau phê duyệt riêng của người dùng cho từng capability/workflow type.

## 1. Mức autonomy

| Mức | Hành vi                         | Trạng thái mặc định              |
| --- | ------------------------------- | -------------------------------- |
| A0  | Quan sát/đo lường               | Cho phép                         |
| A1  | Đề xuất                         | Qua ENG-2                        |
| A2  | Chuẩn bị draft/workflow         | Qua ENG-3 Gate 0, chưa execute   |
| A3  | Execute reversible sau approval | Cấm đến khi phê duyệt capability |
| A4  | Execute trong policy envelope   | Cấm đến khi maturity gate riêng  |
| A5  | Autonomy rộng                   | Không phải mục tiêu mặc định     |

Vision Complete không yêu cầu A5; doanh nghiệp có thể chốt ở A1/A2.

## 2. Capability approval packet cho A3+

Trước code, mỗi capability phải ghi:

- exact action/target API, business owner, value và alternatives;
- risk/safety/legal/contract/financial classification;
- reversible/rollback/compensation và maximum blast radius;
- project/role/time/budget/rate/data-quality envelope;
- approval/SoD, evidence, dry-run diff, idempotency và timeout;
- kill switch/fail mode/error budget/monitoring/on-call;
- simulation/shadow/canary/UAT/rollback acceptance.

Không dùng generic “run tool”/arbitrary SQL/URL/command capability.

## 3. Schema

- `autonomy_capabilities`: immutable key/version, executor type, risk class, reversible, owner, status.
- `autonomy_policies`: capability/project/workflow/risk ceiling, allowed roles/actions, budget/rate/time window, approval mode, effective dates, owner.
- `execution_requests`: intent/input hash, source suggestion/workflow, risk snapshot, dry-run diff, idempotency, correlation, status.
- `execution_approvals`: approver/role/time/comment/evidence/token hash/expiry; SoD enforced.
- `execution_steps`: ordered executor calls, attempts, before/after evidence, result/error.
- `execution_rollbacks`: strategy, trigger, actor, steps, result/evidence.
- `autonomy_kill_switches`: global/org/project/capability state, actor/reason/time/expiry.
- Immutable `autonomy_events` chain cho mọi decision/transition/action.

## 4. Policy engine

- Deny by default; missing/invalid/expired policy, context, evidence hoặc kill-switch read failure → deny.
- Risk classification server-side; confidence không hạ approval/risk.
- Safety/law/authority release, permission/API key, payment và non-reversible action bị cấm autonomy.
- Policy version snapshot vào request; policy đổi không retroactively authorize pending request.
- Budget/rate/concurrency atomic ở DB; không chỉ check client/in-memory.

## 5. Execution protocol

```text
propose → validate context → classify risk → dry-run
→ Gate 0/workflow approval → issue short-lived approval token
→ revalidate policy/state → execute idempotently
→ verify postcondition → complete OR compensate/rollback
→ immutable audit + notify
```

- Approval token bound request hash/capability/project/policy/expiry; single-use.
- Precondition/version checks chống stale write; optimistic/row lock theo target.
- Executor whitelist typed inputs/outputs; timeout/circuit breaker; no arbitrary network/DB.
- Partial failure chuyển `compensating`/`needs_human`, không giả completed.

## 6. API

- `POST /api/engineering/autonomy/requests` từ accepted suggestion/workflow hợp lệ.
- `POST .../:id/dry-run`; `POST .../:id/authorize`; `POST .../:id/execute`; `POST .../:id/rollback`.
- `GET .../:id` trả policy/risk/diff/approvals/steps/events; secret masked.
- Kill switch endpoints admin/security-only, re-auth/2FA, reason bắt buộc và audit.
- Không endpoint nào cho agent tự tạo policy/capability/key/permission hoặc approve request của nó.

## 7. UI

- Policy/capability registry read-only cho đa số; edit/publish riêng role + SoD.
- Execution queue: intent, risk, dry-run diff, evidence, rollback, approvers và current state.
- Kill switch luôn dễ thấy, trạng thái global/project/capability, confirmation + reason; không ẩn trong menu sâu.
- Error budget/paused/degraded banners; audit timeline và rollback status.

## 8. Safety/security

- Threat model executor/prompt injection/tool output/replay/approval theft/insider/policy tamper.
- Executor service account least privilege per capability; network/storage allowlist.
- Signed artifact/config; secret isolation; output validation; no sensitive log.
- Human override bất kỳ lúc; kill switch propagation SLO và drill.

## 9. Test/fault injection

- Deny-default/missing context/policy version/expired token/replay/hash mismatch.
- SoD/self-approval/wrong role/project/risk/budget/rate/concurrency.
- Kill switch before/during execution; executor timeout/partial success/duplicate callback.
- Postcondition failure → compensation/rollback; rollback failure → needs human/P0 alert.
- Audit immutability, idempotency, crash/restart recovery và cross-project.
- Simulation property tests chứng minh forbidden tables/actions không reachable.

## 10. Rollout maturity gates

1. Simulation only.
2. Shadow dry-run, human executes outside system; compare diff/outcome.
3. A2 draft/workflow production.
4. A3 canary một project/capability/reversible action sau explicit approval.
5. Expand envelope nhỏ từng bước; auto-pause khi vượt error budget.
6. A4/A5 cần spec, governance và approval mới; không kế thừa tự động từ A3.

## 11. Chia PR

- **OS4.0:** capability approval/spec/ADR/threat model, không code.
- **OS4.1:** policy/capability/event schema + deterministic engine.
- **OS4.2:** dry-run/request/approval token, chưa executor.
- **OS4.3:** một typed reversible executor + rollback/fault tests.
- **OS4.4:** UI/kill switch/monitoring/simulation/shadow.
- **OS4.5:** canary change record sau explicit approval.

## 12. Definition of Done

- [ ] Capability được phê duyệt riêng, exact scope và forbidden actions rõ.
- [ ] Deny-default/SoD/policy/idempotency/token/kill-switch/audit đạt.
- [ ] Dry-run/postcondition/rollback/failure recovery được diễn tập.
- [ ] Simulation/shadow/canary đạt error budget và owner ký.
- [ ] Không self-authorize, arbitrary executor hoặc autonomy với forbidden domains.
- [ ] Hệ tự hạ cấp A1/A0 khi uncertainty/drift/degradation/override.
