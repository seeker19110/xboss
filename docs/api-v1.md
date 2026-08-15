# API mở XBoss `/api/v1`

API mở cho phép hệ thống bên thứ ba **đọc** dữ liệu XBoss (tiến độ, vật tư, thanh
toán) qua **API key**. Đây là contract ổn định, tách riêng khỏi 284 route nội bộ (shape
không đổi theo UI). Namespace: `/api/v1`.

**Ghi:** phần đọc (`read`/`read_finance`) vẫn thuần đọc. Riêng scope **`engineering`**
(track `ENG-*`) có endpoint **ghi** để hệ agent kỹ thuật ngoài nạp dữ liệu vào _kho nhận_ —
xem mục [Engineering](#engineering-scope-engineering). Dữ liệu nạp vào luôn ở trạng thái
`pending_review`; **không** endpoint nào trong namespace này ghi được sang
`tasks`/`boq_items`/`payment_bills` hay tự duyệt workflow (boundary `ENG-0` mục 4).

## Xác thực

Mọi request gửi API key qua header:

```
Authorization: Bearer xbk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Key do Admin tạo tại **Admin → Tích hợp hệ ngoài → API keys**. Key thô (`xbk_...`)
  **chỉ hiển thị 1 lần lúc tạo** — hệ thống chỉ lưu bản băm (sha256). Mất key thì tạo key mới.
- Thu hồi key bất kỳ lúc nào (nút "Thu hồi"): request tiếp theo dùng key đó trả `401`.

### Mã lỗi

| HTTP  | Ý nghĩa                                                                              |
| ----- | ------------------------------------------------------------------------------------ |
| `401` | Thiếu header, key sai định dạng, key không tồn tại hoặc đã bị thu hồi                |
| `403` | Key không có scope cần thiết cho tài nguyên (vd gọi `payment-certs` bằng key `read`) |
| `422` | Key **toàn cục** nhưng thiếu `?project=<id>`                                         |
| `429` | Vượt giới hạn 120 request/phút cho mỗi key (kèm header `Retry-After`)                |

Thân lỗi luôn dạng `{ "error": "..." }` (tiếng Việt).

## Scope

| Scope          | Cho phép                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read`         | Đọc tiến độ, nhóm công tác, vật tư, KPI dashboard                                                                                                                               |
| `read_finance` | Đọc chứng chỉ thanh toán (`payment-certs`) — scope độc lập, không bao gồm `read`                                                                                                |
| `engineering`  | **Ghi** vào kho nhận Engineering Object (track `ENG-*`). **Bắt buộc gắn 1 dự án** — không có key toàn cục cho scope này (`ENG-0` mục 4.5, giới hạn blast radius nếu key bị lộ). |

Mỗi endpoint yêu cầu 1 scope tối thiểu (xem bảng bên dưới).

## Phạm vi dự án

- **Key gắn 1 dự án**: chỉ thấy dữ liệu của dự án đó — không cần và không dùng `?project=`.
- **Key toàn cục** (không gắn dự án): mỗi request **bắt buộc** chỉ định `?project=<id>`;
  thiếu → `422`.

## Phân trang

Mọi endpoint danh sách nhận `?page=` (bắt đầu từ 1), trả **100 dòng/trang**:

```json
{ "data": [ ... ], "page": 1, "total": 357 }
```

`total` là tổng số bản ghi khớp bộ lọc (dùng để tính số trang). Cột kiểu ngày trả nguyên
chuỗi `YYYY-MM-DD`. Trường trả về dạng `camelCase`.

## Endpoint

| Method & path               | Scope          | Tham số                            | Trường trả (`data[]`)                                                                                             |
| --------------------------- | -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/tasks`         | `read`         | `sheet`, `floor`, `status`, `page` | `id`, `code`, `boqCode`, `name`, `floor`, `status`, `progress`, `startDate`, `endDate`, `packageId`               |
| `GET /api/v1/packages`      | `read`         | `sheet`, `page`                    | `id`, `code`, `boqCode`, `name`, `floor`, `progress`, `status`, `sheetSlug`                                       |
| `GET /api/v1/materials`     | `read`         | `page`                             | `id`, `boqCode`, `name`, `unit`, `qtyBoq`, `qtyPlanned`, `qtyUsed`, `qtyStock`, `status`                          |
| `GET /api/v1/dashboard/kpi` | `read`         | —                                  | `kpi[]` (`sheetId`, `sheetType`, `sheetSlug`, `total`, `avgProgress`) + `statusCounts` (map trạng thái → số task) |
| `GET /api/v1/payment-certs` | `read_finance` | `page`                             | `id`, `code`, `contractId`, `periodNo`, `status`, `submittedAt`, `decidedAt`                                      |

`/api/v1/dashboard/kpi` không phân trang (trả toàn bộ sheet của dự án).

## Engineering (scope `engineering`)

Endpoint **ghi** cho hệ agent kỹ thuật ngoài (MEPF-Agents). Hợp đồng đầy đủ:
`docs/nang-cap/ENG-5-integration-contract-pilot.md`.

| Method & path                                        | Mục đích                                      |
| ---------------------------------------------------- | --------------------------------------------- |
| `POST /api/v1/engineering/ingest`                    | Nạp source/revision + objects + relations     |
| `POST /api/v1/engineering/intelligence`              | Nạp Intelligence Package + suggestion (ENG-2) |
| `POST /api/v1/engineering/agent-sessions`            | Mở phiên đa agent (ENG-4)                     |
| `POST /api/v1/engineering/agent-sessions/:id/claims` | Gửi claim vào phiên (ENG-4)                   |

### `POST /api/v1/engineering/ingest`

| Header                           | Bắt buộc    | Quy tắc                                                                  |
| -------------------------------- | ----------- | ------------------------------------------------------------------------ |
| `Authorization: Bearer <key>`    | Có          | Key scope `engineering`, gắn đúng 1 dự án                                |
| `Content-Type: application/json` | Có          | Chỉ nhận JSON UTF-8                                                      |
| `Idempotency-Key`                | **Có**      | Cùng key + cùng body → trả lại response cũ; cùng key + body khác → `409` |
| `X-Correlation-Id`               | Khuyến nghị | Thiếu thì server tự sinh; luôn trả lại trong header và body response     |

**Giới hạn:** tối đa **500** objects, **2 000** relations, **5 MiB** body/request.

**Mã trạng thái:** `201` request mới · `200` replay (lũy đẳng) · `409` trùng
`Idempotency-Key` khác body · `413` body quá lớn · `422` lỗi validate (kèm `pointer`
dạng JSON Pointer, vd `/relations/0/toExternalKey`) · `429` vượt rate-limit (kèm
`Retry-After`).

**Định danh — agent chỉ dùng khoá của chính nó, không cần biết UUID nội bộ của XBoss:**

| Thực thể        | Khoá lũy đẳng                                                                  |
| --------------- | ------------------------------------------------------------------------------ |
| Source          | `(dự án, source.externalKey)`                                                  |
| Source revision | `(source, source.revision.externalRevisionKey)` — `revisionNo` chỉ để hiển thị |
| Object          | `(dự án, objects[].externalKey)`                                               |
| Relation        | `(dự án, from, to, relationType, sourceRevision)`                              |

Relation tham chiếu 2 đầu bằng `fromExternalKey`/`toExternalKey`; XBoss resolve trong cùng
transaction sau khi upsert objects. Key không tồn tại **hoặc thuộc dự án khác** → `422`
(cách ly dự án được bảo đảm thêm bằng ràng buộc FK ở tầng DB, không chỉ ở app).

```bash
curl -X POST https://<host>/api/v1/engineering/ingest \
  -H "Authorization: Bearer $XBOSS_ENG_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "X-Correlation-Id: $(uuidgen)" \
  -d '{
    "contractVersion": "2026-08-15",
    "source": {
      "externalKey": "drawing:avio-a:hvac:level-03",
      "sourceType": "drawing",
      "title": "HVAC Level 03",
      "revision": {
        "externalRevisionKey": "drawing:avio-a:hvac:level-03:R02",
        "revisionNo": 2,
        "parserName": "mepf-cad-parser",
        "parserVersion": "1.4.0"
      }
    },
    "objects": [
      { "externalKey": "duct:4a7c", "objectType": "component", "discipline": "hvac", "name": "Ống gió cấp AHU-03" },
      { "externalKey": "ahu:2b91", "objectType": "component", "discipline": "hvac", "name": "AHU-03" }
    ],
    "relations": [
      { "fromExternalKey": "duct:4a7c", "toExternalKey": "ahu:2b91", "relationType": "SERVES" }
    ]
  }'
```

Client chỉ retry lỗi mạng/`429`/`5xx` (exponential backoff + jitter); **không** retry `4xx`
khác `429` trước khi sửa payload.

## Ví dụ `curl`

```bash
KEY="xbk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 1) Danh sách công tác của 1 sheet, lọc theo trạng thái trễ (key gắn dự án)
curl -s -H "Authorization: Bearer $KEY" \
  "https://xboss.example.com/api/v1/tasks?sheet=ogtd&status=tre&page=1"

# 2) Vật tư — key TOÀN CỤC phải kèm ?project=
curl -s -H "Authorization: Bearer $KEY" \
  "https://xboss.example.com/api/v1/materials?project=1&page=1"

# 3) KPI dashboard tổng hợp
curl -s -H "Authorization: Bearer $KEY" \
  "https://xboss.example.com/api/v1/dashboard/kpi"

# 4) Chứng chỉ thanh toán — cần key scope read_finance
curl -s -H "Authorization: Bearer $KEY" \
  "https://xboss.example.com/api/v1/payment-certs?page=1"
```
