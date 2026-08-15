# OS-2 — Digital Twin theo cấp độ L0–L6

> **Trạng thái:** Conditional draft; chỉ bắt đầu sau OS-1 đạt gate.
> **Mặc định:** triển khai tuần tự L0→L3; L4+ cần nguồn telemetry/BMS thật và approval riêng.

## 1. Mục tiêu

Tạo representation theo revision/thời gian của đối tượng kỹ thuật và liên kết với project/floor/zone/system/task/drawing/BIM. Twin phải hiển thị nguồn, freshness và uncertainty; không giả realtime khi chỉ có snapshot.

## 2. Các cấp độ

| Level | Capability                  | Gate                                           |
| ----- | --------------------------- | ---------------------------------------------- |
| L0    | Asset/object registry       | OS-1 canonical objects                         |
| L1    | Geometry/document reference | Revision-safe refs, viewer fallback            |
| L2    | Topology/relations          | OS-1 graph correctness/SLO                     |
| L3    | Field state snapshots       | Source/time/quality, no fake realtime          |
| L4    | Live telemetry              | Sensor/BMS contract, time-series load/security |
| L5    | Behavioral simulation       | Validated model/calibration                    |
| L6    | Closed-loop action          | O4 policy/autonomy approval                    |

Mỗi level là release/gate riêng. Có thể dừng ở L2/L3 và vẫn coi OS-2 phase mục tiêu đạt theo business scope đã ký.

## 3. Schema

### Bindings

- `twin_bindings`: project, object, binding type (`floor/zone/system/task/drawing/bim_element`), target key/id, source revision, authority, valid_from/to, metadata.
- Unique current binding theo project/object/type/target; history không overwrite.

### State snapshots

- `twin_states`: project, object, state type, observed_at, ingested_at, value JSONB, unit/schema version, quality/freshness, source/evidence, valid_from/to.
- Partition/time-series extension chỉ sau benchmark L4; L3 dùng PostgreSQL/index chuẩn.
- State immutable; correction append bản mới với `supersedes_id`/reason/actor.

### Geometry refs

- Không lưu blob geometry lớn trong Postgres. Lưu storage object key/hash/format/coordinate system/bounds/source revision.
- Signed access ngắn hạn qua storage abstraction; không expose filesystem/internal bucket URL.

## 4. Sync/ingest

- Contract versioned cho bindings/state; idempotency theo source event key.
- Out-of-order state chấp nhận nhưng current view chọn `observed_at` + authority/quality policy rõ.
- Source precedence không merge im lặng: conflict tạo issue/claim; human resolution khi authority bằng nhau hoặc safety/contract.
- Stale threshold theo state type; missing data là `unknown`, không suy thành safe/zero.

## 5. API

- `GET /api/engineering/twin/:objectId?at=&revision=` current/historical snapshot.
- `GET /api/engineering/twin/:objectId/timeline?type=&from=&to=` bounded pagination.
- `GET /api/engineering/twin/impact/:objectId?stateType=` kết hợp graph + state.
- Internal/API-key ingest bindings/states chỉ khi source được whitelist/project-bound.
- Response có `observedAt`, `ingestedAt`, freshness, quality, source/evidence và `partial`/`unknown` flags.

## 6. UI

- `/engineering/twin`: project/floor/zone/system filters; object list/table và viewer optional.
- Geometry lazy-load, revision switch, overlay relation/clash/progress/state, legend không chỉ màu.
- Timeline current vs historical, freshness/stale/unknown badges; click về source/evidence/workflow.
- Mobile/table fallback; viewer failure không chặn dữ liệu textual.

## 7. Security/privacy

- RLS project/org, signed URLs, MIME/hash verification và storage retention.
- Telemetry allowlist/schema/rate; thiết bị/source identity/rotation; chống replay/timestamp abuse.
- Floor/geometry/security-system data có thể sensitive; role/masking/download audit.

## 8. Performance

- Viewer bundle/geometry budgets, LOD/progressive loading, cap overlay objects.
- Timeline pagination/downsampling deterministic; raw data vẫn retrievable theo policy.
- Freshness/current state materialized view có watermark; no unbounded scans.

## 9. Test

- Binding revision/uniqueness/history; geometry missing/hash mismatch/format/CRS.
- State out-of-order/duplicate/correction/timezone/stale/unknown/source conflict.
- Historical `at` query, current view, graph impact và project isolation.
- Load state ingest/timeline/viewer; offline/slow network; desktop/mobile/axe.
- L4+ thêm device auth, clock skew, burst/backpressure và retention/partition tests.

## 10. Chia PR

- **OS2.L0/L1.1:** binding/geometry schema + API + textual UI.
- **OS2.L2.1:** topology overlays/impact integration.
- **OS2.L3.1:** state contract/schema/current/timeline.
- **OS2.L3.2:** viewer/overlays/freshness/UAT.
- L4/L5/L6 mỗi level cần spec/ADR/approval riêng; không gộp.

## 11. Definition of Done

- [ ] Level mục tiêu và nguồn data được owner ký; không tuyên bố level cao hơn thực tế.
- [ ] Revision/time/source/freshness/quality truy vết đầy đủ.
- [ ] Historical/current queries đúng và đạt SLO.
- [ ] Viewer có accessible fallback; geometry/state được bảo vệ.
- [ ] Conflict/unknown/stale không bị trình bày thành fact.
- [ ] UAT theo use case và production flag/cohort đạt.
