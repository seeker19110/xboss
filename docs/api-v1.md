# API mở XBoss `/api/v1` (đọc-only)

API mở cho phép hệ thống bên thứ ba **đọc** dữ liệu XBoss (tiến độ, vật tư, thanh
toán) qua **API key**. Đây là contract ổn định, tách riêng khỏi 284 route nội bộ (shape
không đổi theo UI). Namespace: `/api/v1`. Chỉ đọc — không có endpoint ghi ở v1.

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

| Scope          | Cho phép                                                                         |
| -------------- | -------------------------------------------------------------------------------- |
| `read`         | Đọc tiến độ, nhóm công tác, vật tư, KPI dashboard                                |
| `read_finance` | Đọc chứng chỉ thanh toán (`payment-certs`) — scope độc lập, không bao gồm `read` |

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
