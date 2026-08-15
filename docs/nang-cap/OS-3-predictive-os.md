# OS-3 — Predictive OS, Uncertainty-First

> **Trạng thái:** Conditional draft; chỉ bắt đầu khi OS-2/data foundation đạt gate.
> **Ranh giới:** prediction luôn là ENG-2 suggestion; không trực tiếp execute.

## 1. Điều kiện kích hoạt

- Có outcome label, lịch sử đủ dài, data-quality/freshness và lineage đáng tin.
- Chọn đúng một use case đầu với owner/decision/action: delay risk, material/cost anomaly hoặc clash priority.
- Có deterministic/rule baseline và cost của false positive/negative.
- Privacy/security/retention/model owner và review cadence được ký.

## 2. Problem contract

Mỗi use case ghi rõ:

- population, prediction target, observation window, prediction horizon và label availability delay;
- decision user, thời điểm sử dụng, hành động được phép và hành động bị cấm;
- baseline, metrics, minimum improvement, calibration target và subgroup/project evaluation;
- uncertainty/abstention: khi nào trả `unknown`/không dự báo;
- rollback về baseline và điều kiện tự pause.

Không triển khai “AI dự báo chung” thiếu outcome/decision contract.

## 3. Data/model schema

- `prediction_models`: use case, owner, status, framework/type, baseline ref, risk class.
- `prediction_model_versions`: immutable artifact URI/hash, code/data/feature schema versions, training window, metrics/model card, approved by/at.
- `prediction_runs`: project, model version, observation/horizon, idempotency key, status, input snapshot/hash, started/completed/error.
- `prediction_outputs`: entity ref, score/probability, uncertainty/calibration bin, explanation/evidence, status/link suggestion.
- `prediction_evaluations`: eventual label/outcome, metric contribution, reviewer feedback.
- `prediction_drift_metrics`: data/concept/performance/calibration drift by period/subgroup.

Model artifact không lưu blob trong DB; storage hash/signature và access control bắt buộc.

## 4. Dataset/feature pipeline

- Dataset manifest immutable: source tables/queries, as-of semantics, inclusion/exclusion, label logic, hashes/counts and owner.
- Time-aware split; feature chỉ dùng dữ liệu có sẵn tại prediction time; automated leakage tests.
- Missing/stale feature explicit; không impute thành zero nếu không có domain policy.
- Feature definitions versioned/deterministic; timezone/unit/project normalization và lineage.
- PII/commercial minimization; retention/purpose limitation.

## 5. Training/evaluation

- Baseline trước model phức tạp; champion/challenger, seed/reproducibility khi khả thi.
- Metrics theo use case, không chỉ accuracy: precision/recall/cost, calibration/Brier, lead time, abstention, subgroup stability.
- Confidence từ calibration/data quality, không cho model tự khai tùy ý.
- Model card: scope, data, metrics, limitations, ethical/safety risks, intended/not intended use và rollback.
- Approval bởi domain + data/model + security cho high-risk use case.

## 6. Serving/API

- Batch first; realtime chỉ khi decision horizon chứng minh cần.
- Ingest prediction endpoint API-key/internal service project-bound, model/version allowlist, idempotency và schema validation.
- `GET /api/engineering/predictions?useCase=&status=&entity=&period=`.
- `GET /api/engineering/predictions/:id` gồm source snapshot, uncertainty, explanation, model card/ref và feedback/outcome.
- Output tạo ENG-2 suggestion theo evidence gate; unknown/low quality vào `needs_review` hoặc abstain.

## 7. UI/workflow

- `/engineering/predictions`: queue theo priority/risk, không sort chỉ theo confidence.
- Hiển thị probability/uncertainty/calibration/freshness/baseline comparison và evidence; ngôn ngữ “nguy cơ/ước lượng”, không “sự thật”.
- Accept/reject/feedback kèm note; accepted vẫn cần ENG-3 trước action.
- Model health page: version, drift, calibration, errors, usage/cost và paused status.

## 8. Monitoring/governance

- Shadow mode trước production decision; outcome lag-aware evaluation.
- Drift threshold + alert + auto-pause/hạ về baseline; no silent model swap.
- Version promotion/rollback approval/audit; expired model không serve.
- Quarterly/use-case review: value, harm, subgroup, false-negative incidents và data changes.

## 9. Test

- Dataset as-of/leakage/label/timezone/unit/reproducibility.
- Schema/version/artifact hash, duplicate run, partial batch, project isolation.
- Calibration/drift/abstention/unknown, baseline fallback and pause.
- Suggestion/workflow boundary invariant; no writes to protected business tables.
- UI interpretation/a11y; adversarial extreme/missing/out-of-distribution inputs.

## 10. Rollout

1. Offline retrospective vs baseline.
2. Shadow production, no user action.
3. Visible advisory A1 with feedback.
4. Accepted suggestion → ENG-3 workflow, still no auto-execution.
5. Expand cohort only after outcome metrics and owner sign-off.

## 11. Chia PR

- **OS3.1:** problem/data/model cards + schema/governance.
- **OS3.2:** dataset/evaluation/baseline + offline report.
- **OS3.3:** serving/ingest/suggestion integration.
- **OS3.4:** UI/monitoring/shadow/UAT.

## 12. Definition of Done

- [ ] Use case/decision/baseline/metrics/uncertainty contract được ký.
- [ ] No leakage, lineage/reproducibility/model card đầy đủ.
- [ ] Vượt baseline và calibration/subgroup gates.
- [ ] Shadow qua window đủ outcome; drift/pause/rollback được thử.
- [ ] Prediction chỉ qua ENG-2/ENG-3, không side effect.
- [ ] Domain/security/model owner ký production advisory release.
