# OS-1 — Engineering System of Record & Knowledge Graph

> **Trạng thái:** Conditional draft. Chỉ thi hành sau C6 và traffic ENG thật đạt gate.
> **Nguyên tắc:** PostgreSQL trước, graph DB chỉ sau benchmark chứng minh cần.

## 1. Mục tiêu

Biến dữ liệu engineering đã duyệt thành hệ thống tra cứu canonical có taxonomy/version, lineage, relation traversal và data-quality; vẫn không tự ghi BOQ/task hoặc quyết định kỹ thuật.

## 2. Điều kiện kích hoạt

- XBoss v1.0 Product Complete; C2 pilot production ổn định.
- Có tập object/relation/revision/evidence thật đủ đại diện và owner cho taxonomy.
- Ít nhất ba use case traversal/impact có người dùng, query và acceptance cụ thể.
- Audit/RLS C3 hoàn tất; không còn P0/P1 data isolation.

## 3. Domain model

### Taxonomy registry

- `engineering_object_types`: key, label, discipline applicability, schema version/ref, status, effective dates, owner.
- `engineering_relation_types`: key, direction, allowed from/to types, cardinality, transitive/symmetric flags, schema/ref, owner.
- Registry version immutable khi published; thay đổi breaking tạo version mới và migration/adaptation plan.

### Canonical/read model

- `engineering_objects` vẫn là canonical entity; không copy sang graph table cạnh tranh.
- Read/materialized views tổng hợp current approved revision, source/evidence, relation counts và workflow decision.
- `engineering_data_quality_issues`: rule, entity key, severity, detected/resolved time, status/owner/evidence.

### Relation rules

- Typed, project scoped, no dangling endpoints, source/evidence cho relation kỹ thuật.
- Cycle policy theo relation type: `CONTAINS`/`LOCATED_IN` acyclic; `CONNECTED_TO` có thể cyclic; self-loop chỉ khi registry cho phép.
- Superseded/void object không bị xóa khỏi lineage nhưng loại khỏi current graph mặc định.

## 4. Services/lib

- Registry validate object/relation payload theo published schema.
- Graph traversal dùng recursive CTE với `depth`, `maxNodes`, visited set và timeout.
- Lineage service: source → revisions → object revisions → evidence/suggestion → workflow/decision.
- Impact service chỉ trả ảnh hưởng/đối tượng liên quan và evidence; không biến thành execution.
- Data-quality engine deterministic: orphan, missing source/evidence, stale revision, invalid type/cardinality/cycle.

## 5. API

- `GET /api/engineering/taxonomy?version=`; admin endpoints publish/deprecate qua quyền riêng.
- `GET /api/engineering/graph?objectId=&direction=&types=&depth=&maxNodes=`.
- `GET /api/engineering/lineage/:id`.
- `GET /api/engineering/impact/:id?relationTypes=&depth=`.
- `GET /api/engineering/data-quality?severity=&status=&type=`; resolve requires note/evidence.

Responses có project, graph/taxonomy version, generated/freshness time, truncated flag và continuation nếu vượt cap. UUID đoán sai/project khác trả 404.

## 6. UI

- `/engineering/graph`: search, centered object, filter relation/direction/depth, node details/evidence/lineage.
- Luôn có accessible table/tree fallback; graph canvas không là cách duy nhất đọc thông tin.
- `/engineering/data-quality`: KPI + queue severity, owner, source, resolution note; không auto-resolve theo confidence.
- Revision/taxonomy selector và stale/truncated banner rõ ràng.

## 7. Performance/scale

- Baseline Postgres CTE/materialized view trên dataset thật; depth mặc định 2, cap cứng theo đo tải.
- Cache key gồm project/object/revision/filter/taxonomy version; invalidate theo watermark.
- Chỉ ADR graph DB khi P95/SLO không đạt sau index/query/read-model tối ưu và có tải chứng minh.

## 8. Security/audit

- RLS project/org trên registry data/read models/issues; permission view/manage taxonomy/resolve quality tách riêng.
- Audit publish/deprecate taxonomy, quality resolve và relation mutation.
- Properties/evidence field-level masking theo role nếu chứa thương mại/PII.

## 9. Test

- Registry schema/version compatibility; invalid type/from-to/cardinality.
- Cycle/self-loop/multi-path/depth/cap/truncation/superseded/void.
- Independent fixture expected traversal/lineage/impact; project/org negative.
- Concurrent relation/revision update và read-model refresh idempotency.
- Load/EXPLAIN trên graph đại diện; a11y/mobile UI.

## 10. Chia PR

- **OS1.1:** approved execution spec + taxonomy schema/registry/migration/tests.
- **OS1.2:** traversal/lineage/data-quality services + API.
- **OS1.3:** UI/read model/performance/a11y.
- **OS1.4:** staging data migration/UAT/ops; production flag theo project.

## 11. Definition of Done

- [ ] Taxonomy owner/version/schema và migration path rõ.
- [ ] Traversal/lineage/impact đúng fixture + dữ liệu thật và đạt SLO.
- [ ] Data-quality queue có owner/resolution/audit.
- [ ] Không nguồn sự thật thứ hai hoặc side effect nghiệp vụ.
- [ ] RLS/security/a11y/load/UAT đạt; production rollout theo flag.
