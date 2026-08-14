# ENG-1 — Tích hợp MEP/Agent (khái niệm "M43"): kho nhận Engineering Object

> **Phase 1/4 của track `ENG-*`** — đọc `docs/nang-cap/ENG-0-roadmap-tich-hop-engineering-os.md`
> TRƯỚC file này (lộ trình tổng, 12 nguyên tắc khoá kiến trúc, boundary chống AI tự cấp quyền,
> Foundation Gate). File này là đặc tả riêng của ENG-1.
>
> Viết TRƯỚC khi code phần còn lại (đặc tả kín — route: `spec`). Nguồn gốc: yêu cầu người
> dùng "nghiên cứu toàn bộ rồi viết đặc tả chi tiết rồi mới code" cho hướng tích hợp với
> `seeker19110/mep-agents` (repo Python riêng, không chung codebase; repo đích thật là
> `seeker19110/MEPF-Agents`, hiện cùng nội dung — "sẽ tích hợp sau này"). Bối cảnh đầy đủ ở
> `docs/integration/CANONICAL_ENGINEERING_MAPPING.md` (hợp đồng kiến trúc) + nghiên cứu trực
> tiếp mã nguồn/tài liệu MEP-Agents (`docs/DAC_TA_PROJECT_KERNEL.md`, `docs/AUDIT_BOC_KHOI_LUONG.md`,
> `progress.md` mục 5–15).
>
> **⚠️ Sự cố đã xảy ra + đã vá (2026-08-14):** commit `8c84e49 "feat: add M43 engineering
kernel domain services"` được push THẲNG vào `main` — thêm `lib/engineering-kernel.ts`
> (schema `engineering_objects`/`engineering_sources`/`engineering_source_revisions`/
> `engineering_object_relations`/`engineering_object_revisions`, UUID PK, đủ hàm CRUD) **mà
> không có migration nào tạo ra các bảng đó, không route, không test** — code vỡ ngay khi
> có ai gọi thật (`relation "engineering_objects" does not exist`). Bản đặc tả này BAN ĐẦU
> tự thiết kế 1 schema khác (SERIAL PK, tên bảng/cột khác) trước khi phát hiện việc trên —
> đã **bỏ thiết kế cũ, chốt schema đã có trên `main` làm chuẩn duy nhất** (không tạo bản thứ
> 3 cạnh tranh), chỉ bổ sung đúng phần còn thiếu để hết vỡ + đủ chấp nhận theo DoD. Bài học
> đúng như `PROGRESS.md` đã ghi nhiều lần: code push thẳng `main` không qua PR/review dễ để
> lọt lỗi hệ thống (ở đây là thiếu migration) — không lặp lại, PR1 của đặc tả này đi qua
> nhánh + PR bình thường.
>
> **4 quyết định đã chốt với người dùng qua `AskUserQuestion` (2026-08-14, vẫn giữ nguyên
> dù đổi schema):**
>
> 1. **Phạm vi PR1 = chỉ kho nhận + audit.** Không tự map sang `boq_items`/cost trong PR1.
> 2. **Xác thực = tái dùng hệ API key sẵn có** (`api_keys`/`requireApiKey`, M49 PR1), thêm
>    scope mới — không dựng cơ chế xác thực riêng cho MEP-Agents.
> 3. **Object mới luôn ở trạng thái chờ duyệt** — chỉ Admin/PM duyệt mới coi là xác nhận.
> 4. **PR1 có UI admin tối thiểu** để xem/duyệt.

## 1. Vì sao chỉ dừng ở "kho nhận" — hiện trạng thật của hai phía

- **MEP-Agents chưa có đường gọi nào sang hệ thống ngoài.** `docs/DAC_TA_PROJECT_KERNEL.md`
  mục 11: mới xong bước 1 ("schema + module trơn", `src/project_kernel.py` đứng độc lập,
  chưa nối `agents.py`/`graph.py`/`tools.py`). Bước 3 ("Route API + xác thực") — thứ bắt
  buộc để họ gọi được vào XBoss — **chưa làm, chưa có ETA**.
- **Chưa có dữ liệu thật để kiểm chứng map sang BOQ đúng hay sai** — quantity MEP-Agents
  tính ra đã qua 24 nguồn sai lệch được vá (`docs/AUDIT_BOC_KHOI_LUONG.md`) nhưng **chưa
  từng chạy trên hồ sơ thật của khách** (mục "Còn nợ" #4 của chính file đó). Tự thiết kế map
  `properties`/quantity → `qty_contract`/`unit_price` của `boq_items` (tiền thật, vùng rủi
  ro cao) mà chưa có dữ liệu thật để đối chiếu là đoán mù → PR2, không làm ở đây.

## 2. Schema — ĐÃ CÓ TRÊN `main` (commit `8c84e49`), không đổi tên bảng/cột

`lib/engineering-kernel.ts` (đã merge vào nhánh làm việc) định nghĩa 5 bảng qua các câu
SELECT/INSERT — spec này tái dựng đúng nguyên schema đó thành migration, KHÔNG tự đặt tên
khác. Ánh xạ khái niệm MEP-Agents (`docs/DAC_TA_PROJECT_KERNEL.md` mục 6) → bảng XBoss:

| MEP-Agents                               | Bảng XBoss (đã có lib, PR1 thêm migration)                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`                                | `engineering_sources` + `engineering_source_revisions` (versioning theo lần parse lại — XBoss có, MEP-Agents mục 6.3 chưa)                                                               |
| `engineering_objects`                    | `engineering_objects` (UUID PK, `external_key` giữ `object_id` bất biến bên MEP-Agents)                                                                                                  |
| Vòng đời/lịch sử object                  | `engineering_object_revisions` (snapshot mỗi lần đổi, có `change_reason`) — XBoss dùng cơ chế này thay cho state machine 7 trạng thái của MEP-Agents (xem mục 4)                         |
| `object_relations`                       | `engineering_object_relations`                                                                                                                                                           |
| Quantity contract (`progress.md` mục 61) | **Không có bảng riêng** — nằm trong `engineering_objects.properties`/`geometry_ref` (JSONB tự do), đúng thiết kế đã có trên `main`. Không thêm bảng `engineering_quantities` cạnh tranh. |

## 3. Migration còn thiếu — `migrations/0084_engineering_core.sql`

Thuần `CREATE TABLE`/`CREATE INDEX` (+ 1 `CREATE EXTENSION IF NOT EXISTS pgcrypto` cho
`gen_random_uuid()` — chưa dùng ở đâu khác trong dự án, mọi PK khác đều `SERIAL`; UUID ở
đây là quyết định đã có sẵn trong code `lib/engineering-kernel.ts`, migration chỉ theo
đúng, không tự đổi sang SERIAL) — không đụng dữ liệu hiện có → đi thẳng production. Chạy
`npm run gen:erd` cùng PR.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS engineering_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN
    ('drawing', 'document', 'bim', 'cad', 'model', 'photo', 'spreadsheet', 'other')),
  title TEXT NOT NULL,
  object_key TEXT,
  mime_type TEXT,
  sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engineering_sources_project ON engineering_sources(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS engineering_source_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES engineering_sources(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  object_key TEXT,
  sha256 TEXT,
  parser_name TEXT,
  parser_version TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, revision_no)
);

CREATE TABLE IF NOT EXISTS engineering_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  discipline TEXT,
  external_key TEXT,  -- object_id bất biến bên MEP-Agents ("{type}:{uuid4_hex}") — chuỗi tự do, KHÔNG phải UUID
  name TEXT,
  -- Cổng duyệt (quyết định #3): object mới luôn 'pending_review', chỉ Admin/PM chuyển
  -- 'approved'/'rejected' (route: POST /api/engineering/objects/:id/review, mục 6). 'void'
  -- = soft-delete (đã có sẵn trong lib: listEngineeringObjects lọc "status <> 'void'").
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'void')),
  properties JSONB NOT NULL DEFAULT '{}',
  geometry_ref JSONB NOT NULL DEFAULT '{}',
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_status ON engineering_objects(project_id, status);
CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_type ON engineering_objects(project_id, object_type);
-- Idempotent ingest theo external_key (mục 6, upsertEngineeringObjectFromExternal) — 1 dự
-- án không có 2 object cùng external_key. NULL (object tạo tay trong XBoss, không từ MEP-
-- Agents) không bị ràng buộc UNIQUE (partial index chỉ áp khi có external_key thật).
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_external
  ON engineering_objects(project_id, external_key) WHERE external_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS engineering_object_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  object_type TEXT NOT NULL,
  discipline TEXT,
  name TEXT,
  status TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  geometry_ref JSONB NOT NULL DEFAULT '{}',
  change_reason TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_id, revision_no)
);
CREATE INDEX IF NOT EXISTS idx_engineering_object_revisions_object ON engineering_object_revisions(object_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS engineering_object_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  to_object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engineering_object_relations_project ON engineering_object_relations(project_id);
CREATE INDEX IF NOT EXISTS idx_engineering_object_relations_from ON engineering_object_relations(from_object_id);
CREATE INDEX IF NOT EXISTS idx_engineering_object_relations_to ON engineering_object_relations(to_object_id);
```

Không thêm RLS cho 5 bảng này ở PR1 — không thuộc 11 bảng tài chính của M51/ADR-0005, mọi
hàm trong `lib/engineering-kernel.ts` đã tự lọc `WHERE project_id = ?` (pattern M22), đủ
cách ly đa dự án ở tầng app. `withProjectScope` trong các hàm đọc hiện có vẫn giữ nguyên
(vô hại — không có policy nào áp lên bảng chưa có RLS, chỉ khiến transaction đọc là
`READ ONLY`).

## 4. Bổ sung vào `lib/engineering-kernel.ts` (KHÔNG sửa hàm đã có, chỉ thêm hàm mới)

Giữ nguyên toàn bộ 254 dòng hiện có (đã chạy được, không có lý do sửa hành vi). Thêm:

```ts
// Upsert theo (project_id, external_key) — MEP-Agents gửi lại cùng object (object_id bất
// biến phía họ) không được tạo dòng mới. Có thì UPDATE properties/geometry_ref/name/
// discipline/object_type/updated_by/updated_at (GIỮ NGUYÊN status — object đã duyệt mà
// nhận bản cập nhật KHÔNG tự mất trạng thái duyệt, đúng "object_id không đổi nhưng
// properties có thể đổi" của MEP-Agents; "duyệt lại khi đổi" là quyết định để dành PR2).
// Không có thì INSERT như createEngineeringObject. Cả 2 nhánh đều gọi createObjectRevision
// ngay sau để ghi lịch sử (change_reason cố định theo nhánh).
export async function upsertEngineeringObjectFromExternal(
  input: EngineeringObjectInput & { externalKey: string },
  userId: number,
): Promise<{ id: string; created: boolean }>;

// Chuyển status: chỉ cho phép pending_review/approved/rejected <-> nhau (KHÔNG cho chuyển
// từ/tới 'void' qua hàm này — void là soft-delete, thao tác riêng ngoài phạm vi PR1). Ném
// lỗi nếu object không thuộc projectId (cách ly đa dự án, pattern billBelongsToProject).
// UPDATE status/updated_by/updated_at rồi gọi createObjectRevision(change_reason=note) để
// ghi ai duyệt/khi nào/vì sao — dùng revision log làm audit trail, không thêm cột
// reviewed_by/reviewed_at riêng (tránh 2 nơi lưu cùng 1 sự thật).
export async function reviewEngineeringObject(
  projectId: number,
  objectId: string,
  decision: "approved" | "rejected",
  reviewerId: number,
  note?: string,
): Promise<void>;
```

Validate input bằng zod (đúng phong cách file này đã dùng, không đổi sang check thủ công).
`objectType`/`discipline`/`externalKey` bắt buộc khác rỗng khi ingest từ MEP-Agents (khác
`engineeringObjectInputSchema` gốc coi `externalKey` là optional — vì object tạo tay trong
XBoss sau này có thể không có, nhưng object từ luồng ingest luôn phải có để idempotent).

## 5. Xác thực cho luồng ingest — mở rộng `lib/api-keys.ts`, KHÔNG dựng cơ chế mới

- `requireApiKey(req, scope)` — mở rộng type `scope` từ `"read" | "read_finance"` thành
  `"read" | "read_finance" | "engineering"`. Một scope duy nhất cho cả đọc/ghi (1 điểm tích
  hợp hệ thống-với-hệ thống, không phải API đối tác công khai nhiều bên — tách read/write
  riêng là quá mức cho use-case 1 caller, YAGNI).
- Admin tạo key qua UI quản lý API key hiện có (tìm route/trang lúc code, thêm option scope
  `"engineering"` vào danh sách chọn được — không tạo trang mới), gán `project_id` cụ thể
  (không dùng key toàn cục cho tích hợp 1-dự-án-1-key này).

## 6. API routes

### 6.1 `POST /api/v1/engineering/ingest` (API key, scope `engineering`)

`app/api/v1/engineering/ingest/route.ts` — pattern `app/api/v1/tasks/route.ts`. Body:

```ts
type IngestPayload = {
  source?: EngineeringSourceInput & {
    revisionNo: number;
    parserName?: string;
    parserVersion?: string;
  };
  objects: (EngineeringObjectInput & { externalKey: string })[]; // tối đa 500 phần tử/request
  relations?: EngineeringRelationInput[];
};
```

Trong 1 `withTransaction`: nếu có `source` → `createEngineeringSource` (không upsert — mỗi
lần gửi kèm bản vẽ mới coi là source mới, đúng nguyên tắc "không ghi đè source" của
MEP-Agents) rồi `createSourceRevision`; với mỗi object → `upsertEngineeringObjectFromExternal`
(mục 4), gắn `sourceRevisionId` vừa tạo nếu có; với mỗi relation (tuỳ chọn) →
`createEngineeringRelation`. Trả `{ sourceRevisionId, objects: [{ externalKey, id, created }] }`.

422 khi: `objects` rỗng hoặc > 500 phần tử; thiếu `externalKey`/`objectType` ở phần tử nào
(chỉ rõ index); `relations[].fromObjectId`/`toObjectId` không phải UUID hợp lệ.

### 6.2 Route quản trị trong XBoss (session auth — trang `/engineering`)

Quyền mới `CAN.reviewEngineeringObjects` (mục 7).

- `GET /api/engineering/objects?status=&type=` — `getCurrentUser()` → 401 →
  `CAN.reviewEngineeringObjects` → 403 → `getCurrentProjectId(user)` (null → mảng rỗng) →
  `listEngineeringObjects`.
- `GET /api/engineering/objects/:id` — `getEngineeringObject` + `getEngineeringRelations`
  (2 chiều) + revision mới nhất (`SELECT ... FROM engineering_object_revisions WHERE
object_id = ? ORDER BY revision_no DESC LIMIT 5` — 5 bản gần nhất, đủ xem lịch sử duyệt
  mà không tải toàn bộ).
- `POST /api/engineering/objects/:id/review` — body `{ decision: "approved"|"rejected",
note?: string }` → `reviewEngineeringObject`.

## 7. Quyền — `lib/auth.ts`

Thêm 1 khoá vào `CAN_DEFAULT`: `reviewEngineeringObjects: ["admin", "pm"]`. Trang
`/engineering` yêu cầu đúng quyền này để vào (xem/duyệt gộp chung, không tách quyền
chỉ-xem riêng ở PR1).

## 8. Module registry — `lib/modules.ts` + `app/lib/dashboardTree.ts`

```ts
{
  key: "engineering",
  nav: [
    { group: "Hệ thống", label: "Đối tượng kỹ thuật (AI)", href: "/engineering", icon: "Boxes" },
  ],
  permKeys: ["reviewEngineeringObjects"],
  notificationTypes: [],
  routePrefix: ["/api/engineering", "/api/v1/engineering"],
}
```

`dashboardTree.ts` thêm node vào nhóm `"Hệ thống"` (sau `dash.chuyen-doi-so`, trước
`dash.import-excel`), `roles: ["admin", "pm"]`. `public/sw.js` không cần sửa (route mới
toàn `POST`/dynamic GET theo session, không lọt cache mặc định của SW — xác nhận lại lúc
code bằng đọc `sw.js`).

## 9. UI — trang `/engineering` (Admin/PM)

Tối thiểu cho PR1 (không dashboard biểu đồ — chưa có dữ liệu thật để biết cần gì):

- Bảng: Loại (`objectType`) / Discipline / Tên (`name` hoặc `external_key` nếu chưa có tên)
  / Trạng thái (`StatusBadge`-style 4 màu: `pending_review`=zinc, `approved`=emerald,
  `rejected`=rose, `void` ẩn khỏi bảng mặc định) / Ngày nhận.
- Filter: theo Loại (select, options động từ dữ liệu hiện có), theo trạng thái (mặc định
  "Chờ duyệt").
- Click 1 dòng → modal chi tiết: `properties`/`geometry_ref` hiển thị JSON thô (`<pre>`
  cuộn ngang, chưa cần form đẹp), danh sách quan hệ (from/to/relation_type), 5 revision gần
  nhất (ai đổi/khi nào/lý do), 2 nút "Duyệt"/"Từ chối" (Admin/PM, disable khi đang gửi) + ô
  ghi chú.
- Rỗng: "Chưa nhận đối tượng kỹ thuật nào — kết nối MEP-Agents để bắt đầu." Loading:
  `Skeleton` bảng. Lỗi: thông điệp + nút thử lại.
- Mobile: bảng cuộn ngang trong container riêng. A11y: select có `aria-label`, nút icon-only
  (nếu có) có `aria-label`, `e2e/authed/engineering.spec.ts` chạy axe (desktop+mobile).

## 10. Test — `tests/engineering.test.ts`

Import `tests/setup.ts` đầu tiên. Tích hợp (cần `TEST_DATABASE_URL`, tự skip khi thiếu):

1. `upsertEngineeringObjectFromExternal` tạo mới (`created: true`), `status` mặc định
   `pending_review`; gọi lại lần 2 cùng `externalKey` với `properties` khác → cùng `id`
   (`created: false`), `properties` cập nhật đúng, `status` KHÔNG đổi.
2. Duyệt (`reviewEngineeringObject` → `approved`) rồi upsert lại object đó → `status` vẫn
   `approved` (không bị reset).
3. `reviewEngineeringObject` trên object thuộc dự án khác → ném lỗi (cách ly đa dự án).
4. Mỗi lần upsert/review đều có dòng mới trong `engineering_object_revisions`
   (`revision_no` tăng dần, không trùng — canh bằng `UNIQUE(object_id, revision_no)`).
5. `POST /api/v1/engineering/ingest`: key scope `read` gọi → 403; key scope `engineering`
   gửi 1 source + 2 object + 1 relation → 201, đọc lại đúng qua
   `listEngineeringObjects`/`getEngineeringRelations`.
6. Validate: `objects` rỗng → 422; thiếu `externalKey` ở 1 phần tử → 422 chỉ rõ index.
7. Quyền UI: `engineer`/`subcon`/`viewer` gọi `GET /api/engineering/objects` → 403;
   `admin`/`pm` → 200.

Thêm `tests/engineering.test.ts` vào lệnh `npm test` trong `package.json`.

## 11. Tiêu chí chấp nhận (Definition of Done PR1)

- [ ] `migrations/0084_engineering_core.sql` áp sạch trên Postgres 16 cục bộ mới hoàn toàn
      (kể cả `CREATE EXTENSION pgcrypto`); `npm run gen:erd` khớp (5 bảng mới).
- [ ] `lib/engineering-kernel.ts` (đã có) + 2 hàm mới (mục 4) — không sửa hành vi 254 dòng
      cũ, chỉ thêm.
- [ ] `POST /api/v1/engineering/ingest` với API key scope `engineering` nhận payload giả
      lập → 201, đọc lại đúng qua route quản trị.
- [ ] Trang `/engineering` (Admin/PM) hoạt động thật qua dev server (không chỉ test tự
      động).
- [ ] `npm run lint`/`typecheck`/`build` xanh; `npm test` xanh (toàn bộ suite).
- [ ] `e2e/authed/engineering.spec.ts` — axe sạch desktop+mobile.
- [ ] Cập nhật `PROGRESS.md` + `docs/nang-cap/README.md` (thêm dòng ENG-1 (xem docs/nang-cap/ENG-0-roadmap-tich-hop-engineering-os.md)).
- [ ] KHÔNG có route/cột nào ghi vào `boq_items`/`cost`/`payment_bills` trong PR1.
- [ ] Đi qua nhánh + PR bình thường — KHÔNG push thẳng `main` (đúng bài học mục "Sự cố đã
      xảy ra" ở đầu file).

## 12. Ngoài phạm vi PR1

- Map `properties`/quantity trong `engineering_objects` → `boq_items` + tính lại cost (PR2,
  chờ dữ liệu thật).
- Digital Twin traversal/impact analysis trên `engineering_object_relations` (MEP-Agents
  cũng mới "chỉ lưu cạnh", chưa có engine truy vấn).
- UI biểu đồ/thống kê tổng hợp theo hệ.
- Lưu trữ file bản vẽ gốc trong XBoss (`object_key`/`sha256` chỉ là tham chiếu, MEP-Agents
  tự giữ file của họ).
- Notification loại mới (chờ luồng thật chạy đều đặn).
- RLS cho 5 bảng mới (chỉ xét nếu dữ liệu thật cho thấy cần — hiện app-layer scope đã đủ).
- Bất kỳ thay đổi nào trong repo `mep-agents`.
