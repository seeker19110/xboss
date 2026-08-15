# C2 — MEPF-Agents Connector & End-to-End Pilot

> **Trạng thái:** Draft; chỉ thi hành sau C1/ENG-5 đạt DoD.
> **Repo đối tác:** https://github.com/seeker19110/MEPF-Agents

## 1. Mục tiêu và ranh giới

Kết nối MEPF-Agents với XBoss qua API versioned, chạy được khi retry/restart, và chứng minh chuỗi source → object → relation/evidence → review → suggestion/workflow/conflict. Pilot không tự ghi task/BOQ/cost/payment và không tự execute workflow.

Không chia sẻ DB, filesystem, session cookie hoặc API key giữa project/environment. XBoss không chạy agent; MEPF-Agents không trở thành nguồn sự thật cho project/quyền/phê duyệt.

## 2. Kiến trúc connector phía MEPF-Agents

```text
Deterministic tool output
  → Canonical adapter
  → Local outbox (pending/sending/sent/failed)
  → HTTP client ENG-5
  → XBoss response mapping
  → checkpoint/telemetry
```

### Config bắt buộc

- `XBOSS_BASE_URL`, `XBOSS_ENGINEERING_API_KEY`, `XBOSS_PROJECT_EXTERNAL_KEY`, timeout, retry max, contract version.
- Secret chỉ từ environment/secret store; redacted khi log; staging/prod dùng key khác.
- Startup validate URL HTTPS ở production, key có mặt và contract version được hỗ trợ.

### Outbox

Mỗi item lưu local ID, idempotency key, correlation ID, contract version, payload hash/ref, attempts, next retry, last error, created/sent time. Payload nhạy cảm mã hóa hoặc chỉ lưu reference theo threat model MEPF. Restart không làm mất pending item.

State machine: `pending → sending → sent`; lỗi retryable → `pending`; lỗi 4xx contract → `failed_needs_review`; revoke/auth → dừng queue và alert, không loop.

## 3. Canonical adapter

- Source key ổn định theo project/source identity; revision key ổn định theo revision/hash.
- Object `externalKey` bất biến qua lần chạy; object type/discipline theo registry XBoss.
- Quantity phải có value, unit, method, source objects/revisions, evidence, calculation/tool/parser version và quality flags.
- Relation dùng `fromExternalKey`/`toExternalKey`; không lưu UUID XBoss làm identity chính.
- Claims mang agent role, statement, evidence, assumptions, confidence signals và source authority.
- JSON Schema validation chạy trước khi vào outbox; lỗi chỉ rõ JSON Pointer.

## 4. HTTP/retry protocol

- Một logical payload giữ nguyên `Idempotency-Key` khi retry; thay body phải sinh key mới.
- Retry timeout/network/429/5xx bằng exponential backoff + jitter; tôn trọng `Retry-After`.
- Không retry 400/401/403/409/422 vô hạn; 401/403 khóa connector cho đến khi operator xử lý.
- Verify response contract/version/correlation; response không hợp lệ coi là retryable có giới hạn và alert.

## 5. Contract fixtures dùng chung

Lưu fixture không chứa dữ liệu khách hàng trong cả hai repo hoặc package versioned:

1. HVAC source R01 + 2 object + `SERVES` relation.
2. R02 cập nhật cùng object keys; không duplicate source/object/relation.
3. Quantity deterministic + evidence đầy đủ.
4. Unknown relation endpoint → 422 đúng index.
5. Replay cùng key/body → 200 cùng response; cùng key/body khác → 409.
6. Cross-project source/object/relation → bị chặn.
7. Claims mâu thuẫn data/constraint → ENG-4 phân loại đúng, không majority vote.

Fixture có expected IDs theo external key, counts, hashes, errors và decisions; không phụ thuộc UUID ngẫu nhiên.

## 6. XBoss pilot UI/ops

- Ingest health: requests/success/replay/failure/latency/backlog theo project/key/version.
- Review queue: source/revision, parser/calculation version, object diff, evidence, correlation ID.
- Operator actions: retry/replay từ outbox phía MEPF; XBoss không có nút “replay arbitrary payload”.
- Alert: 5xx spike, validation spike, stale connector, review backlog, revoked/expired key.

## 7. Kịch bản pilot

### P0 — Connectivity

Tạo staging project/key, gửi health fixture, rotate/revoke key, xác nhận rate limit/correlation/log redaction.

### P1 — Deterministic ingest

Chạy CAD/HVAC fixture hai lần và sau restart; counts/hash/revision/relation khớp tuyệt đối.

### P2 — Review/intelligence/workflow

PM duyệt object; ingest suggestion/evidence; tạo workflow ENG-3; ký gate theo SoD; không execute side effect.

### P3 — Multi-agent conflict

Gửi claims có conflict; kiểm authority hierarchy, human resolution, max rounds/no-consensus và audit.

### P4 — Failure drill

Timeout sau khi XBoss đã commit, 429, 500, invalid payload, key revoke, MEPF restart và XBoss unavailable; không duplicate/mất request.

## 8. Security/privacy

- Dataset pilot được phân loại/ẩn dữ liệu; không đưa bản vẽ khách hàng vào git/CI artifacts.
- Egress allowlist chỉ XBoss endpoint; chống SSRF ở URL config nếu có UI nhập.
- API key least privilege/project-bound/expiry/rotation; audit create/revoke/use.
- Log chỉ IDs/hash/count; payload/evidence nhạy cảm theo retention policy.

## 9. Test và CI

- MEPF: adapter unit, outbox persistence/state, retry clock, schema/consumer contract.
- XBoss: provider contract, DB integration, auth/RLS, idempotency/concurrency.
- Nightly optional staging contract; PR CI không phụ thuộc external live service.
- Version skew test N/N-1 và explicit unsupported version error.

## 10. Chia PR

- **MEPF C2.1:** adapter + schema fixtures.
- **MEPF C2.2:** outbox + client/retry/telemetry.
- **XBOSS C2.1:** provider fixtures/observability/review provenance.
- **C2.2:** staging config/runbook/failure drill/pilot report.

## 11. Definition of Done

- [ ] Contract tests hai repo xanh và version pin rõ.
- [ ] Toàn bộ P0→P4 đạt, duplicate/mất dữ liệu bằng 0.
- [ ] Không cross-project hoặc side effect nghiệp vụ.
- [ ] Rotate/revoke/recovery được diễn tập.
- [ ] PM/QA/Engineering/Ops/MEPF owner ký pilot report.
- [ ] Monitoring/runbook/on-call owner sẵn sàng trước production.
