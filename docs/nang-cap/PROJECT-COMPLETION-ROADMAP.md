# XBoss — Đặc tả hoàn thành dự án từ ENG-5 đến Engineering OS

> **Trạng thái:** Draft để duyệt; là kế hoạch thi hành, không tự cấp quyền triển khai production hoặc Controlled Autonomy.  
> **Cập nhật:** 2026-08-15  
> **Phụ thuộc:** `PROJECT.md`, `spec.md`, `PROGRESS.md`, `PLAN.md`, `ENG-0`→`ENG-5`, `ENGINEERING-OS-FUTURE-SYSTEMS.md`.

## 1. Hai định nghĩa “hoàn thành”

### 1.1 Product Complete — XBoss v1.0

XBOSS v1.0 được coi là hoàn thành khi toàn bộ module hiện có và ENG-1→ENG-5 chạy ổn định trên production, dữ liệu được đối soát, bảo mật/cách ly dự án được kiểm chứng, người dùng UAT ký nhận, có runbook vận hành và không còn lỗi P0/P1 chưa có biện pháp giảm thiểu.

### 1.2 Vision Complete — Engineering OS

Tầm nhìn Engineering OS hoàn thành khi XBoss đã đi qua System of Record → Digital Twin → Predictive OS → Controlled Autonomy ở mức được doanh nghiệp phê duyệt. Đây là lộ trình **có điều kiện**: phase sau chỉ bắt đầu khi phase trước có dữ liệu thật, chỉ số chất lượng và owner vận hành. A3 trở lên luôn cần quyết định riêng của người dùng.

Product Complete không phụ thuộc việc hoàn thành toàn bộ Vision Complete. Sau v1.0, mỗi phase tương lai là một release độc lập với quyền dừng hợp lệ.

## 2. Nguyên tắc điều hành chung

1. Mỗi phase: đặc tả → review → implementation PR nhỏ → staging → UAT/gate → production.
2. Migration append-only; lấy số migration mới nhất tại thời điểm code, không ghi cứng số trong kế hoạch.
3. Mỗi thay đổi dữ liệu có backup, preview/dry-run, rollback hoặc phương án forward-fix được thử trên staging.
4. Không agent nào tự cấp API key/quyền, tự duyệt, ghi thẳng DB hoặc bỏ qua ENG-3.
5. Mọi kết quả kỹ thuật quan trọng có source, revision, evidence, actor, correlation ID và trạng thái duyệt.
6. Không dùng confidence để hạ risk/approval; safety/law/contract luôn đi theo authority và human gate.
7. Không thêm hạ tầng mới (graph DB, vector DB, event bus, model platform) trước khi tải thật chứng minh PostgreSQL/hạ tầng hiện có không đủ.

## 3. Chuỗi phase và cổng phụ thuộc

```text
C0 Chốt nguồn sự thật
  → C1 ENG-5 contract hardening
  → C2 Connector + pilot MEPF-Agents
  → C3 Data, audit, RLS hardening
  → C4 Quality, security, performance, DR
  → C5 UAT + rollout production
  → C6 Đóng release XBoss v1.0 (Product Complete)
  → O1 Engineering System of Record
  → O2 Digital Twin
  → O3 Predictive OS
  → O4 Controlled Autonomy
  → O5 Đóng chương trình Engineering OS (Vision Complete)
```

## 4. C0 — Chốt nguồn sự thật và baseline phát hành

### Phạm vi

- Sửa doc drift: `PROJECT.md`/`spec.md` phải phản ánh RLS thật, phiên bản app, số route/bảng và track ENG.
- Chốt một bảng trạng thái duy nhất trong `PROGRESS.md`: done, pilot, deferred, technical debt.
- Chụp baseline: commit, migration checksum, schema/ERD, dependency lock, coverage, CI/E2E, Lighthouse và dữ liệu production đã backup.
- Gắn owner cho product, DB/ops, security, PM/QA và phía MEPF-Agents.

### Deliverables

- Release manifest v1.0-rc1; ma trận owner/RACI; risk register; danh sách environment và secret owner.
- Checklist go/no-go dùng chung cho C1→C6.

### Exit gate

- Không còn tài liệu mâu thuẫn về auth/RLS/deploy; main xanh; migration history khớp DB staging; owner ký baseline.

## 5. C1 — Thi hành ENG-5 Integration Contract

Nguồn chi tiết: `ENG-5-integration-contract-pilot.md`.

### Schema/migration

- Thêm external key cho source và source revision; unique theo project/source.
- Thêm `engineering_ingest_requests` cho idempotency, body hash, response snapshot, correlation ID, status và TTL.
- Thêm unique relation và bất biến project: hai đầu relation cùng project; source revision cùng project object.
- Ưu tiên composite FK/constraint; trigger chỉ dùng nếu FK không biểu diễn được bất biến.

### API/lib

- `/api/v1/engineering/ingest` nhận external-key relation, `Idempotency-Key`, `X-Correlation-Id`, contract version và error theo JSON Pointer.
- Resolve objects/relations trong một transaction; replay cùng key/body trả cùng response, cùng key/body khác trả 409.
- Giới hạn byte, object/relation count và JSON depth; log không chứa secret/payload nhạy cảm.
- OpenAPI 3.1 và Zod dùng chung nguồn schema; bổ sung `docs/api-v1.md`.

### Test/DoD

- Unit contract; integration DB; concurrency/retry; cross-project source/relation; body-size; rate-limit; old-client compatibility nếu còn caller.
- 20 request đồng thời cùng logical payload tạo đúng một bộ dữ liệu.
- Lint/typecheck/test/build/E2E/ERD/migration checks xanh; review riêng security và data integrity.

## 6. C2 — Connector và pilot MEPF-Agents

### Phía MEPF-Agents

- Module connector riêng: cấu hình base URL, secret từ environment, project binding, timeout/backoff và correlation ID.
- Adapter chuyển CAD/BIM/quantity/claims sang contract versioned; deterministic output giữ calculation/tool/parser version.
- Outbox bền vững hoặc hàng đợi retry cục bộ; không mất request khi process restart; không ghi chung DB XBoss.
- Consumer-contract fixtures chạy trong CI repo MEPF-Agents.

### Phía XBoss

- Project/key riêng cho staging pilot; dashboard ingest health và backlog review.
- UI provenance: source/revision/parser/calculation/evidence/trace chain; hành động duyệt/từ chối rõ actor/time/note.
- Luồng pilot đầy đủ: ingest → review object → suggestion → workflow → agent claims/conflict → human resolution; dừng trước side effect nghiệp vụ.

### Pilot dataset

- Ít nhất một hồ sơ HVAC, một electrical/plumbing/firefighting, một quantity/BOQ candidate và một clash/conflict.
- Dữ liệu ẩn thông tin nhạy cảm; source hash và expected deterministic results được khóa trong fixture.

### Exit gate

- Hai repo contract test xanh; retry/idempotency/cross-project/revoke-key được diễn tập; PM + QA + owner hai hệ ký pilot report; không còn P0/P1 mở.

## 7. C3 — Data, audit và database isolation hardening

### C3.1 Audit UUID

- Mở rộng audit theo hướng tương thích ngược: thêm `entity_key TEXT` hoặc mô hình polymorphic; giữ `entity_id BIGINT` cho dữ liệu cũ trong giai đoạn chuyển tiếp.
- Trigger generic không cast UUID sang BIGINT; backfill key cũ; index theo `(entity_type, entity_key, at)`.
- Map event có ngữ nghĩa của ENG-3 vào màn hình audit chung mà không nhân đôi nguồn sự thật.
- Test insert/update/delete cho cả SERIAL và UUID; verify audit chain/tamper detection.

### C3.2 RLS engineering

- Thêm `project_id` trực tiếp ở bảng con nếu cần để policy/FK biểu diễn cách ly rõ ràng.
- Policy dùng `app.project_id`/org context hiện có; app role NOBYPASSRLS; route/API key set đúng context.
- Negative tests: đoán UUID, source revision chéo dự án, relation chéo dự án, API key project A đọc/ghi B.

### C3.3 Chất lượng dữ liệu hiện hữu

- Backup → preview `backfill-import-dates.ts` trên staging → đối chiếu file Excel nguồn → owner duyệt → apply production theo project.
- Kiểm tra lại delayed status, S-curve, package progress và report sau backfill; lần chạy hai phải idempotent.
- Chốt quy tắc mẫu số dimension Excel (`columns` hay `row-nonempty`) theo quyết định nghiệp vụ; lưu lựa chọn theo import batch.

### Exit gate

- Audit UUID đầy đủ; RLS negative suite xanh; không còn dữ liệu ngày sai đã biết; restore snapshot sau migration được diễn tập.

## 8. C4 — Quality, security, performance và disaster recovery

### Test matrix bắt buộc

- Unit business rules; integration Postgres thật; API auth/RBAC/RLS; Playwright desktop/mobile/axe; import/export round-trip; offline queue; multi-user concurrency.
- Test vai trò × project × organization × module flag; financial/safety paths bắt buộc negative cases.
- Contract tests XBoss↔MEPF-Agents và fixture CAD/BIM versioned.

### Performance/load

- Mục tiêu hiện có: API chính P95 <500 ms. Mục tiêu ingest pilot đề xuất: 500 objects + 2,000 relations P95 <5 s trên staging cấu hình tương đương production; owner xác nhận trước khi khóa SLO.
- Load SSE, dashboard, search, export 2,000+ records, upload Excel 20 MiB, concurrent dimension updates và ingest retry.
- Query mới có `EXPLAIN (ANALYZE, BUFFERS)` trên dataset đại diện; không merge index theo phỏng đoán.

### Security

- Threat model: session, API key, upload, object reference, SSRF, webhook, CAD/BIM metadata và agent prompt/tool boundary.
- Secret rotation, key expiry/revoke, least privilege, CSRF, rate-limit, dependency audit, secret scanning và log redaction.
- Pen-test/smoke tập trung IDOR/cross-project, mass assignment, JSON bombs và retry replay.

### DR/operations

- Xác nhận RPO/RTO với owner; đề xuất ban đầu để duyệt: RPO ≤24h, RTO ≤4h.
- Restore test Postgres + object storage; kiểm checksum/record count; diễn tập DB unavailable, storage unavailable và key compromise.
- Runbook alert/Sentry/slow query/cron/SSE/queue; escalation matrix và incident template.

### Exit gate

- CI đầy đủ xanh trên DB thật; không vulnerability high/critical; SLO/load đạt; restore drill đạt RPO/RTO đã duyệt; lỗi P0=0, P1=0.

## 9. C5 — UAT, migration và rollout production

### UAT theo vai trò

- Admin: user/project/key/config/import/export/audit/restore visibility.
- PM/BCH/CDT: dashboard, schedule, BOQ/cost/contract, approval/workflow và báo cáo đúng phạm vi.
- Engineer/Sub-con: mobile, assigned scope, offline queue, photos/diary/progress và QA gate.
- Engineering reviewer: object/evidence/suggestion/conflict/decision lineage.

### Rollout

1. Freeze schema window; backup và preflight environment.
2. Deploy staging release candidate; smoke + UAT + migration rehearsal.
3. Production migration ngoài giờ vận hành; health/smoke/read-write checks.
4. Bật ENG theo project pilot/feature flag; canary nhóm nhỏ; theo dõi tối thiểu một chu kỳ báo cáo.
5. Mở rộng theo cohort; rollback/disable flag khi vượt error budget.

### Đối soát

- So sánh Excel nguồn ↔ XBoss: counts, dates, progress, delayed, package averages và exports.
- So sánh MEPF fixture ↔ XBoss: sources, revisions, objects, relations, evidence, decisions.
- Biên bản sai lệch phải có owner, quyết định chấp nhận/sửa và thời hạn.

### Exit gate

- UAT ký bởi owner nghiệp vụ; production theo dõi ổn định qua chu kỳ đã thống nhất; training/user guide/support channel sẵn sàng.

## 10. C6 — Đóng release XBoss v1.0

### Deliverables

- Release notes/changelog, SBOM/dependency snapshot, ERD/API docs, user guide, admin/ops/security runbooks, backup/restore evidence và known limitations.
- Ownership: product, engineering, DB/ops, security, support; SLA/escalation và lịch maintenance.
- Archive các PLAN cũ; `PROGRESS.md` chốt Product Complete; tag/release `v1.0.0` chỉ sau go-live sign-off.

### Product Complete gate

- Tất cả acceptance C0→C5 đạt; CI/main xanh; P0/P1=0; dữ liệu đối soát; UAT và vận hành ký nhận; rollback/restore đã thử; hệ thống hoạt động không phụ thuộc phiên AI phát triển.

## 11. O1 — Engineering System of Record & Knowledge Graph

### Kích hoạt khi

- C6 đạt; ENG pilot có traffic thật đủ đại diện; canonical mapping ổn định; query relation thực tế chứng minh nhu cầu traversal.

### Phạm vi

- Canonical object taxonomy/version registry; typed relations; revision lineage; evidence/provenance query.
- Graph traversal/impact analysis trên PostgreSQL recursive CTE trước; chỉ cân nhắc graph DB sau benchmark.
- Read model cho source→object→quantity→BOQ candidate→workflow→decision; không tự ghi BOQ.
- Data quality dashboard: orphan, stale revision, missing evidence, invalid relation, unresolved conflict.

### Schema/API/UI dự kiến

- Registry tables: `engineering_object_types`, `engineering_relation_types`, version/effective dates và JSON Schema; không hard-code taxonomy trong UI.
- Read model/materialized view cho lineage; refresh có watermark, project/org scope và freshness timestamp.
- `GET /api/engineering/graph?objectId=&depth=` với depth/max-node cap; `GET /api/engineering/lineage/:id`; `GET /api/engineering/data-quality`.
- Trang `/engineering/graph`: search object, relation filter, lineage timeline, impact list và evidence drawer; có table fallback/a11y, không phụ thuộc canvas để truyền đạt dữ liệu.

### Test bắt buộc

- Cycle/self-loop, orphan, depth cap, multi-path duplicate, revision superseded và cross-project traversal.
- Kết quả recursive query khớp fixture tính độc lập; performance trên graph đại diện; refresh read model idempotent.

### Exit gate

- Truy vấn lineage/impact đúng trên fixture và dự án thật; latency/SLO đạt; PM/engineer hiểu và UAT; không tạo nguồn sự thật thứ hai.

## 12. O2 — Digital Twin có cấp độ

### Thứ tự

- L0 registry tài sản/đối tượng → L1 geometry/reference → L2 relation/topology → L3 trạng thái hiện trường. L4+ realtime/behavior chỉ khi có nguồn sensor/BMS thật.

### Phạm vi

- Mapping object ↔ floor/zone/system/task/drawing/BIM element; revision-aware geometry refs.
- Read-only twin viewer và impact view; clash/status overlays; timestamp và freshness rõ ràng.
- Đồng bộ có source authority, conflict handling, retention và rollback; không ghi ngược CAD/BIM ở phase đầu.

### Schema/API/UI dự kiến

- `twin_bindings`: object ↔ project/floor/zone/system/task/source element, effective revision và authority.
- `twin_states`: snapshot trạng thái có `observed_at`, `valid_from/to`, source/evidence và quality; L3+ mới thêm time-series/partitioning sau đo tải.
- `GET /api/engineering/twin/:objectId`, `GET /api/engineering/twin/impact`, endpoint ingest state riêng chỉ khi có source thật và contract versioned.
- Viewer progressive: registry/table trước, geometry lazy-load sau; overlay có legend, freshness/stale badge, revision switch và đường về source.

### Test bắt buộc

- Binding uniqueness theo revision, state out-of-order, stale detection, timezone, deleted/superseded source, project isolation và viewer fallback khi geometry unavailable.

### Exit gate

- Completeness/accuracy/freshness đạt ngưỡng do owner ký; không lẫn revision/project; drill-down tới source/evidence; tải viewer đạt SLO.

## 13. O3 — Predictive OS

### Kích hoạt khi

- Có lịch sử đủ dài và outcome labels đáng tin; baseline mô tả đơn giản được đo trước; owner xác nhận quyết định nào thực sự cần dự báo.

### Phạm vi

- Use case đầu: nguy cơ trễ, cost/material anomaly hoặc clash priority — chọn một, không mở đồng thời.
- Dataset/version/feature lineage; train/validation/test theo thời gian; chống leakage; uncertainty/calibration; champion/challenger.
- Prediction chỉ là suggestion ENG-2; safety/legal/contract luôn human review; không side effect.
- Monitoring drift, quality, false-positive/negative, chi phí và rollback về rule baseline.

### Schema/API/UI dự kiến

- `prediction_models`, `prediction_model_versions`, `prediction_runs`, `prediction_outputs`, `prediction_evaluations` và `prediction_drift_metrics`; lưu metadata/ref, không nhúng model binary vào Postgres.
- API ingest prediction tách khỏi API training; server kiểm model version/project/feature schema; output luôn liên kết object/task + evidence + observation window.
- Trang `/engineering/predictions`: outcome, uncertainty, top evidence/features có thể giải thích, model/version/freshness, accept/reject và feedback thực tế.
- Scheduler chỉ tạo prediction/draft; mọi hành động đi qua ENG-2/ENG-3.

### Test bắt buộc

- Time-split/leakage checks, missing/stale feature, calibration bins, drift threshold, model rollback, duplicate run idempotency, project isolation và failure fallback về rule baseline.

### Exit gate

- Vượt baseline trên metric nghiệp vụ đã chốt; calibration đạt; model card/data card; shadow mode qua ít nhất một chu kỳ; PM/QA chấp nhận.

## 14. O4 — Controlled Autonomy

### Mức mặc định

- A0 quan sát; A1 đề xuất; A2 chuẩn bị draft/workflow. Đây là trần mặc định sau O3.
- A3 thực thi reversible, A4 giới hạn theo policy, A5 rộng hơn: **không được đặc tả/code/kích hoạt nếu người dùng chưa phê duyệt riêng từng workflow type**.

### Điều kiện cho A3+

- Executor whitelist; policy envelope theo workflow/risk/project/role/time/budget; idempotency; dry-run; approval token; kill switch; immutable audit; rollback tested.
- Không autonomy cho safety/law/authority release, payment, permission/API key hoặc non-reversible action.
- Error budget và tự hạ cấp về A1/A0 khi drift, conflict, thiếu evidence, service degradation hoặc human override.

### Schema/API/UI dự kiến

- `autonomy_policies`: capability/workflow/project/risk ceiling, allowed action, budget, approval mode, effective time và owner.
- `execution_requests`/`execution_steps`: immutable intent, dry-run diff, approval token, idempotency key, status, result/evidence và rollback reference.
- `autonomy_kill_switches`: global/project/capability scope, actor/reason/time; deny-by-default khi không đọc được policy hoặc switch state.
- API tách `POST .../dry-run`, `POST .../authorize`, `POST .../execute`, `POST .../rollback`; executor không nhận arbitrary SQL/URL/command.
- Trang `/engineering/autonomy`: policy registry, pending executions, dry-run diff, live kill switch, audit và error-budget status. A3+ controls chỉ hiện sau capability approval nhưng API vẫn là ranh giới thật.

### Test bắt buộc

- Deny-by-default, expired/replayed approval token, SoD, concurrent execute, budget/risk ceiling, kill switch giữa chừng, partial failure/compensation, rollback, audit immutability và project isolation.

### Exit gate

- Simulation + shadow + canary; SoD và kill-switch drill; mọi side effect truy vết/rollback; owner nghiệp vụ/security ký từng capability.

## 15. O5 — Đóng chương trình Engineering OS

Vision Complete chỉ đạt ở **mức autonomy doanh nghiệp đã phê duyệt**, không mặc định phải đạt A5.

- Mọi phase O1→O4 được ký nghiệm thu hoặc ghi quyết định dừng có chủ đích.
- Architecture decision records, model/data cards, policy registry, runbooks, đào tạo và owner lâu dài đầy đủ.
- Đo outcome trước/sau: thời gian review, lỗi kỹ thuật bị chặn, độ chính xác quantity, thời gian xử lý conflict, schedule/cost impact và adoption.
- Chuyển từ “project delivery” sang product operations: quarterly governance, audit, dependency/model review và roadmap theo dữ liệu sử dụng.

## 16. Quy tắc chia PR

- Một PR chỉ có một mục tiêu kiểm chứng được; schema/API/UI/test có thể tách nhưng không merge API public thiếu contract/test.
- PR migration độc lập với backfill production; script backfill mặc định dry-run.
- Mỗi phase có PR đặc tả được duyệt trước PR code; update `PROGRESS.md` khi đạt gate, không đánh dấu done chỉ vì code đã merge.
- PR tương lai không dùng nhãn `M<xx>`; dùng `ENG-*` cho integration và `OS-*` cho Engineering OS sau v1.0.

### Gói PR tối thiểu theo phase

| Phase | PR đề xuất | Nội dung                                                                |
| ----- | ---------- | ----------------------------------------------------------------------- |
| C0    | 1          | Baseline, doc drift, owner/risk/release manifest                        |
| C1    | 3–4        | Schema/idempotency → API contract → UI/observability → hardening review |
| C2    | 2 mỗi repo | Connector/outbox + contract fixtures; pilot/runbook/report              |
| C3    | 3          | Audit UUID → RLS engineering → backfill/data reconciliation             |
| C4    | 3          | Full DB/E2E → security/load → DR/incident drills                        |
| C5    | 2          | UAT fixes → production canary/rollout evidence                          |
| C6    | 1          | Documentation/sign-off/release tag preparation                          |
| O1–O4 | ≥3/phase   | Spec/schema → API/domain → UI/ops/UAT; phase gate trước phase kế        |

## 17. Bảng kết thúc tổng hợp

| Mốc   | Trạng thái ban đầu            | Điều kiện kết thúc                      |
| ----- | ----------------------------- | --------------------------------------- |
| C0    | Chờ làm                       | Nguồn sự thật/baseline/owner thống nhất |
| C1    | Đặc tả ENG-5 draft            | Contract hardening code + test đạt      |
| C2    | Chưa có traffic thật          | Pilot hai repo ký nhận                  |
| C3    | Có nợ audit UUID/backfill/RLS | Data/audit/isolation đạt                |
| C4    | Một phần hạ tầng đã có        | Full quality/security/load/DR đạt       |
| C5    | Chưa rollout ENG              | UAT + production canary đạt             |
| C6    | Chưa đóng v1.0                | Product Complete, tag v1.0.0            |
| O1–O4 | Hoãn có chủ đích              | Chỉ kích hoạt tuần tự theo gate         |
| O5    | Chưa áp dụng                  | Vision Complete ở mức được phê duyệt    |
