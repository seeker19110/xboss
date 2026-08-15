# ENG-5 — Integration Contract & Pilot MEPF-Agents

> **Trạng thái:** Draft để duyệt, chưa triển khai code/migration.  
> **Mục tiêu:** biến ENG-1→ENG-4 từ “đã có code” thành tích hợp đối tác có thể chạy, retry an toàn, cách ly dự án và truy vết đầy đủ.  
> **Đối tác chính thức:** https://github.com/seeker19110/MEPF-Agents

## 1. Ranh giới phase

ENG-5 chỉ tạo **hợp đồng giao tiếp, cơ chế ingest an toàn và pilot vận hành**. Không triển khai Digital Twin, dự báo, tự phê duyệt hay tự thực thi thay đổi nghiệp vụ.

MEPF-Agents vẫn sở hữu workspace, file CAD/BIM gốc và tính toán xác định. XBoss vẫn là nguồn sự thật cho `projects`, định danh/quyền người dùng, workflow và quyết định của con người. Hai hệ không dùng chung database, không vendor code và không dùng chung API key.

## 2. Các bất biến bắt buộc

1. Một API key engineering gắn đúng một project; mọi object, source revision và relation phải thuộc project đó.
2. Agent chỉ dùng `externalKey` bền vững của chính nó; không phải biết UUID nội bộ của XBoss.
3. Retry cùng một logical request không tạo source, revision hay relation trùng.
4. Không endpoint engineering nào được tạo/duyệt workflow, hoặc ghi task, BOQ, chi phí, thanh toán hay quyền truy cập.
5. Mọi request có correlation ID; truy vết được từ request → source/revision → object/relation → suggestion/workflow/session nếu các bước sau phát sinh.

## 3. Contract HTTP v1

### 3.1 Endpoint và headers

`POST /api/v1/engineering/ingest`

| Header                           | Bắt buộc    | Quy tắc                                                              |
| -------------------------------- | ----------- | -------------------------------------------------------------------- |
| `Authorization: Bearer <key>`    | Có          | API key có scope `engineering`, project-bound                        |
| `Content-Type: application/json` | Có          | Chỉ nhận JSON UTF-8                                                  |
| `Idempotency-Key`                | Có          | UUID v4; cùng key + cùng project + cùng body hash trả lại kết quả cũ |
| `X-Correlation-Id`               | Khuyến nghị | UUID v4; thiếu thì XBoss sinh và trả lại trong response              |

- Tối đa 500 objects, 2,000 relations và 5 MiB body/request.
- `201`: request mới; `200`: replay; `409`: cùng key nhưng body khác; `422`: lỗi theo JSON Pointer; `429`: kèm `Retry-After`.
- Client chỉ retry lỗi mạng/`429`/`5xx`, exponential backoff có jitter; không retry `4xx` khác `429` trước khi sửa payload.

### 3.2 Payload chuẩn

```json
{
  "contractVersion": "2026-08-15",
  "source": {
    "externalKey": "drawing:avio-a:hvac:level-03",
    "sourceType": "drawing",
    "title": "HVAC Level 03",
    "revision": {
      "externalRevisionKey": "drawing:avio-a:hvac:level-03:R02",
      "revisionNo": 2,
      "sha256": "<64-char hex>",
      "parserName": "mepf-cad-parser",
      "parserVersion": "1.4.0"
    }
  },
  "objects": [
    {
      "externalKey": "duct:4a7c...",
      "objectType": "component",
      "discipline": "hvac",
      "name": "Ống gió cấp AHU-03",
      "properties": { "schemaVersion": "mepf.object/1" },
      "geometryRef": { "schemaVersion": "mepf.geometry/1" }
    }
  ],
  "relations": [
    {
      "fromExternalKey": "duct:4a7c...",
      "toExternalKey": "ahu:2b91...",
      "relationType": "SERVES",
      "properties": { "schemaVersion": "mepf.relation/1" }
    }
  ]
}
```

Source external key và external revision key bắt buộc khi có source. Relation không nhận UUID XBoss từ agent; XBoss resolve external key trong cùng transaction sau khi upsert objects. Key không tồn tại hoặc không thuộc project trả `422` theo index.

### 3.3 Định danh và lũy đẳng

- Source unique: `(project_id, external_key)`.
- Source revision unique: `(source_id, external_revision_key)`; `revision_no` chỉ hiển thị.
- Object unique: `(project_id, external_key)` (đã có).
- Relation unique: `(project_id, from_object_id, to_object_id, relation_type, source_revision_id)`.
- Bảng `engineering_ingest_requests` lưu project, idempotency key, request SHA-256, trạng thái, response JSON, correlation ID và thời điểm hết hạn. TTL tối thiểu 30 ngày.

## 4. Validation, cách ly dự án và concurrency

- Mọi `sourceRevisionId` nội bộ phải được kiểm project qua source cha; không tin UUID từ caller chỉ vì đúng định dạng.
- Trước khi insert relation, xác nhận hai object cùng `project_id` của key. DB phải có constraint hoặc trigger bảo vệ bất biến này; app-layer check đơn lẻ không đủ.
- Upsert object/source/relation và ghi idempotency request chạy trong một transaction. Dùng `INSERT … ON CONFLICT`/row lock phù hợp để không đua `revision_no`.
- `properties`/`geometryRef` phải có `schemaVersion`; giới hạn kích thước/depth JSON và cấm secret, URL nội bộ hoặc blob CAD/BIM nhúng trực tiếp.

## 5. OpenAPI, fixtures và compatibility

1. Thêm OpenAPI 3.1 machine-readable cho endpoint vào `docs/api-v1.md` hoặc file contract riêng.
2. Sinh schema Zod và OpenAPI từ một nguồn type chung để tránh runtime-validation drift.
3. Fixture versioned gồm source/revision, hai object + relation, retry, relation unknown, relation chéo project, body/key xung đột, quantity evidence và conflict claim.
4. Consumer-contract test chạy ở cả XBoss và MEPF-Agents; CI hai bên pin `contractVersion`.
5. Version mới chỉ additive trong v1; breaking change cần `/v2` hoặc sunset tối thiểu 90 ngày.

## 6. Observability và audit

- Log correlation ID, API key ID (không log secret), project, contract version, object/relation count, latency, HTTP status và idempotency outcome.
- Metrics: ingest success/error/replay, validation lỗi theo field, duplicate relation, cross-project rejection, latency p50/p95 và backlog review.
- Alert khi 5xx hoặc validation failure vượt ngưỡng đã thống nhất; runbook chỉ định owner XBoss, owner MEPF-Agents, kênh liên lạc và quy trình revoke key/replay.
- ENG-3 giữ event audit có ngữ nghĩa. Đặc tả audit UUID riêng phải đóng khoảng trống audit trail chung trước khi mở rộng ngoài pilot.

## 7. Pilot runbook

1. Tạo project pilot và API key engineering riêng trên staging; không dùng key production.
2. Chạy fixture contract và dữ liệu CAD/BIM đã ẩn thông tin nhạy cảm.
3. Xác nhận retry trả `200` cùng response; payload khác cùng key trả `409`.
4. Xác nhận relation bằng external key, source revision mới và rejection cross-project.
5. PM/QA duyệt một object, xem provenance và đi qua một workflow ENG-3 không side effect.
6. Diễn tập revoke key, retry sau timeout và rollback migration trên staging.
7. Chỉ mở production khi owner hai bên ký pilot, dashboard/alert hoạt động và không còn P0/P1 chưa giảm thiểu.

## 8. Definition of Done

- [ ] Migration append-only, rollback/runbook và kiểm staging với dữ liệu sao chép an toàn.
- [ ] Contract OpenAPI + fixtures + consumer tests xanh trên cả hai repo.
- [ ] Test tích hợp chứng minh không tạo relation/source cross-project hay duplicate khi retry.
- [ ] E2E xác nhận Admin/PM xem provenance; agent không có đường sang workflow execution/financial data.
- [ ] Rate limit, correlation, metric, alert và quy trình revoke/replay được vận hành thử.
- [ ] Cập nhật `docs/api-v1.md`, `PROGRESS.md`, `PLAN.md` và catalogue `docs/nang-cap/README.md`.

## 9. Ngoài phạm vi

- Đồng bộ hai chiều, webhook callback, streaming CAD/BIM hoặc chia sẻ file workspace.
- Tự map quantity sang BOQ/cost hoặc tự approve theo confidence.
- Digital Twin traversal, predictive model và controlled autonomy.
