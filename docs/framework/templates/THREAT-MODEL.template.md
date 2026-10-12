# Threat model: <System/change>

## Scope và assets

Data, money, identity, permission, availability, model/artifact và trust boundaries.

## Actors và entry points

Legitimate roles, external systems, admin/support, attacker/abuse actors, API/UI/file/event/job.

## Data flow và boundaries

Link diagram; nơi auth/validation/encryption/audit/third party boundary xảy ra.

## Threats

| ID | Threat/abuse case | Asset/boundary | Likelihood | Impact | Control/test | Residual risk | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | | | | | | | |

Bao phủ spoofing/auth bypass, tampering, repudiation/audit gaps, disclosure/cross-tenant access,
DoS/resource/cost abuse, privilege escalation, supply-chain và unsafe automation/AI output.

## Security acceptance

- [ ] Negative authorization/tenant tests.
- [ ] Input/file/event validation và output encoding.
- [ ] Secret/PII/log/retention review.
- [ ] Rate limit/idempotency/replay/concurrency.
- [ ] Dependency/build/deploy trust.
- [ ] Detection/response/recovery.

**Approver/date/review trigger:**
