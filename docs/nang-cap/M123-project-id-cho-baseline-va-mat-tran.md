# M123 — `project_id` cho baseline, danh mục công tác và mặt trận theo tầng

| Thuộc tính       | Giá trị                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Issue / Goal     | Giai đoạn 4 của lộ trình cải thiện kế hoạch/tiến độ/tracking. Giai đoạn 3 = M122 (#465–#467). |
| Spec owner       | Phiên chính (opusplan)                                                                        |
| State            | Draft — **chờ duyệt**                                                                         |
| Người/ngày duyệt | (chưa duyệt) — 2 quyết định nghiệp vụ đã chốt với người dùng 2026-09-03, xem §18              |
| Cập nhật         | 2026-09-03                                                                                    |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

XBoss đã đa dự án từ M27 (`migrations/0027_multi_project.sql`, ADR-0004) và đã bật RLS theo dự án
từ M?/`migrations/0069_rls.sql` (ADR-0005). Nhưng **ba bảng của mảng kế hoạch/mặt trận vẫn nằm
ngoài trục dự án**, và nợ này đã được ghi nhận chính thức trong whitelist của
`tests/project-scope-invariant.test.ts:70,79` (`baselines: "nợ đa dự án đã biết"`,
`"floor-stage-fronts": "mặt trận theo tầng/giai đoạn của sheet"`).

Khảo sát mã nguồn 2026-09-03:

**(a) `baselines` — snapshot trộn mọi dự án.** `app/api/baselines/route.ts:42-51` chốt baseline
bằng `INSERT INTO baseline_tasks SELECT ?, id, start_date, end_date, progress_percent FROM tasks`
— **không mệnh đề WHERE nào**. PM của dự án A bấm "Chốt baseline" là chụp luôn toàn bộ task của dự
án B. Danh sách baseline (`:12-19`) cũng không lọc, nên selector baseline trên `SCurveChart` /
`EvmChart` hiện baseline của dự án khác. Hệ quả đo được: đường kế hoạch trên S-curve của dự án A
được vẽ từ một tập task lớn hơn tập task của A. Đây là lỗ hổng nghiêm trọng nhất trong 3 bảng —
vừa sai số liệu, vừa rò rỉ thông tin xuyên dự án.

**(b) `floor_stage_fronts` — hai dự án cùng tên tầng thì dùng chung một dòng.**
`floor_label` là **chuỗi tự do, không phải khoá ngoại** (`migrations/0046_construction_stages.sql:15`),
và ràng buộc `UNIQUE (floor_label, stage_id)` (`:23`) không có dự án. Hai dự án cùng có tầng
`"T5"` sẽ **ghi đè lẫn nhau** ngày bàn giao/nhận mặt bằng, nhà thầu đi/đến, và tài liệu đính kèm
(`floor_stage_front_documents`). `ensureFloorStageFronts()`
(`lib/tien-do/constructionStages.ts:81-84`) sinh ô bằng `ON CONFLICT (floor_label, stage_id) DO
NOTHING` nên lỗi này im lặng tuyệt đối. `allProjectFloors()` (`:182-190`) tên là "allProject"
nhưng **không lọc `project_id`** — nó liệt kê mọi nhãn tầng của mọi dự án.

**(c) `construction_stages` — danh mục dùng chung, không có lối tách.** 7 công tác seed khi bảng
rỗng (`0046:39-49`). Hiện đúng với thực tế 1 dự án, nhưng dự án thứ hai có bộ công tác khác thì
buộc phải nhét chung vào danh mục toàn hệ, kéo theo `ensureFloorStageFronts` sinh ô rác cho mọi
tầng của mọi dự án.

**(d) Ba bảng chưa có RLS.** Khác với 10 migration đã áp policy theo `app.project_id`
(`0069`, `0098`, `0109`, `0117`, `0119`, `0122`, `0125`, `0145`, `0146`), 3 bảng này không có
`ROW LEVEL SECURITY` — nên ngay cả khi route lọc đúng, không có lớp phòng thủ thứ hai.

Vai trò bị ảnh hưởng: **PM/BCH** (số S-curve/EVM sai vì baseline trộn dự án), **kỹ sư hiện
trường** (mặt trận theo tầng ghi đè nhau), **admin đa dự án** (không tách được danh mục công tác).

## 2. Outcome, metric và guardrail

**Outcome:** 3 bảng vào trục dự án; mọi truy vấn lọc theo dự án đang chọn; RLS làm lớp chặn thứ hai.

**Metric (đo được, kiểm bằng test):**

- `tests/project-scope-invariant.test.ts` **gỡ 2 mục whitelist** `baselines` và
  `floor-stage-fronts` mà vẫn xanh (test này có assert "WHITELIST có mục thừa" nên không thể quên).
- Chốt baseline khi đang ở dự án A: `baseline_tasks` chỉ chứa task của A (test tích hợp).
- Hai dự án cùng có tầng `"T5"`: 2 dòng `floor_stage_fronts` độc lập, sửa dòng này không đổi dòng kia.

**Guardrail:**

- **Không đổi một con số nào của dự án hiện tại.** Repo production hiện có đúng 1 dự án thật
  (AVIO Tháp A) — sau migration, mọi số trên `/dashboard`, `/schedule`, `/work-fronts` phải y hệt
  trước. Đây là tiêu chí chấp nhận AC7.
- Migration **đụng ràng buộc trên dữ liệu đang có** (DROP UNIQUE cũ + backfill) ⇒ theo DoD trong
  `CLAUDE.md` **bắt buộc chạy staging** (`bash deploy.sh --staging`, xem `docs/ops/staging.md`) và
  `npm run db:migrate -- --dry-run` trước khi lên production.
- Không đụng `lib/tien-do/recompute.ts`, không đụng `tasks`/`work_packages`.

**Stop/rollback threshold:** nếu sau khi deploy, `/work-fronts` hoặc `/schedule` mất dữ liệu (đếm
dòng `floor_stage_fronts` giảm, hoặc selector baseline rỗng) → rollback theo §17.

## 3. Nghiên cứu hiện trạng

DDL và mọi điểm chạm đã khảo sát đầy đủ (2026-09-03). Tóm tắt:

| Bảng                          | DDL                                                                        | Điểm chạm chính                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `baselines`                   | `0001_baseline.sql:169-175` — không project/sheet/tower                    | `app/api/baselines/route.ts`, `app/api/baselines/[id]/route.ts`                                                |
| `baseline_tasks`              | `0001_baseline.sql:177-185`, `UNIQUE(baseline_id,task_id)`                 | `lib/tien-do/evm.ts:138-140`, `app/api/dashboard/scurve/route.ts:113-115`; xoá cascade ở 3 route task/wp/sheet |
| `construction_stages`         | `0046:6-12` + `duration_days` (`0046:63`)                                  | `lib/tien-do/constructionStages.ts:17-56`, `app/api/construction-stages/**`                                    |
| `floor_stage_fronts`          | `0046:14-24` + `0046:65-67` + `0047:13-18`, `UNIQUE(floor_label,stage_id)` | `lib/tien-do/constructionStages.ts:81-270`, `app/api/floor-stage-fronts/**`                                    |
| `floor_stage_front_documents` | `0046:26-34`                                                               | `app/api/floor-stage-fronts/[id]/documents/route.ts`, `app/api/floor-stage-front-documents/[id]/route.ts`      |

Cơ chế dự án đang chọn: `lib/ha-tang/projects.ts` — cookie `xboss_project`, `visibleProjectIds`,
`resolveProjectId`, và helper route **bắt buộc** `getCurrentProjectId(user)` (`:48`, memoize theo
request, kiểm `projects.org_id === user.orgId`). **Route không được tin `project_id` client gửi.**
Transaction scope RLS: `withProjectScope(projectId, fn)` trong `@/lib/db`.

Migration mới nhất: `0148_dimension_events.sql` ⇒ file mới đánh số **`0149_`**.

Khuôn mẫu tham chiếu: `0027_multi_project.sql` (ADD COLUMN + backfill `MIN(projects.id)` + index),
`0069_rls.sql:31-34` (thêm cột ngay trước khi bật RLS), và **`0145_cad_block_libs_project.sql`**
(khuôn sát nhất: DROP UNIQUE cũ bằng vòng `DO $$ ... pg_constraint JOIN pg_attribute` theo **định
nghĩa cột** thay vì gõ tên ràng buộc ngầm định, + `CREATE UNIQUE INDEX ON t (COALESCE(project_id,0), …)`
để NULL vẫn coi là một "dự án", + policy USING/WITH CHECK bất đối xứng).

## 4. Phương án

**Phương án A (chọn) — cột `project_id` thật trên 3 bảng cha, suy diễn cho bảng con.**

- `baselines.project_id` **NOT NULL sau backfill** — không suy được từ đâu khác (baseline là thực
  thể độc lập).
- `baseline_tasks` **KHÔNG thêm cột** — suy qua `task_id → work_packages → sheet_types →
towers.project_id`, đúng nguyên tắc ADR-0004 ghi trong `0027_multi_project.sql`: "bảng nào suy
  được project qua cha NOT NULL thì KHÔNG thêm cột (tránh 2 nguồn sự thật)".
- `construction_stages.project_id` **NULLABLE**: `NULL` = danh mục dùng chung mọi dự án (7 công
  tác seed giữ NULL), có giá trị = công tác riêng của dự án đó. (Quyết định D1, §18.)
- `floor_stage_fronts.project_id` **NOT NULL sau backfill**, đổi `UNIQUE (floor_label, stage_id)`
  → `UNIQUE (project_id, floor_label, stage_id)`.
- `floor_stage_front_documents` **KHÔNG thêm cột** — suy qua `floor_stage_front_id` (NOT NULL).

**Phương án B (bác) — suy `project_id` cho `floor_stage_fronts` qua `floor_label` khi đọc.** Đây
gần như là hiện trạng của `pendingStageFloors`/`stageMissingList`
(`lib/tien-do/constructionStages.ts:210-270`, join `wp.floor_label = fsf.floor_label`). Bác vì:
join theo **giá trị chuỗi** không phải khoá ngoại; tầng chưa có work_package nào thì biến mất khỏi
kết quả; và ràng buộc UNIQUE vẫn ghi đè xuyên dự án ở đường **ghi** — tức là không sửa được (b).

**Phương án C (bác) — `construction_stages` NOT NULL, nhân bản 7 công tác cho từng dự án.** Bác
theo quyết định D1: migration phải ánh xạ lại `stage_id` của mọi `floor_stage_fronts` hiện có sang
bản sao mới, đụng dữ liệu nặng hơn hẳn, đổi lấy một tiện ích chưa ai cần (hiện 1 dự án thật).

## 5. Scope / non-goals

**Trong phạm vi:** DDL 3 bảng + backfill + index + RLS; lọc dự án ở mọi route/hàm đọc-ghi 3 bảng;
`ensureFloorStageFronts`/`upsertFloorStageFront` theo dự án; gỡ 2 mục whitelist trong
`tests/project-scope-invariant.test.ts`; cập nhật `scripts/gen-erd.ts` + `docs/ERD.md`.

**Non-goals (chưa làm, không phải bỏ sót):**

- Đổi `floor_label` từ chuỗi tự do thành khoá ngoại tới một bảng `floors` thật — việc lớn riêng,
  chạm `work_packages`, `lookahead`, `claims`.
- UI quản lý danh mục công tác riêng theo dự án (thêm/sửa công tác có `project_id`) — DDL mở
  đường, nhưng màn hình quản trị để đợt sau; PR3 chỉ đảm bảo **đọc** đúng (chung + riêng).
- Di trú baseline trộn dự án thành nhiều baseline con — theo D2 chỉ gán về dự án đầu tiên.
- Lập lịch thật (phụ thuộc cấp task, lag, lịch làm việc, milestone, CPM biết tiến độ thực) —
  Giai đoạn 5, cần đặc tả riêng.

## 6. User journeys và mọi trạng thái

1. **PM chốt baseline khi đang ở dự án A** → `baseline_tasks` chỉ chứa task của A; tên baseline
   hiển thị kèm dự án không đổi (baseline đã lọc rồi).
2. **PM mở selector baseline trên S-curve/EVM** → chỉ thấy baseline của dự án đang chọn. Dự án
   chưa có baseline nào → danh sách rỗng, S-curve vẽ như hiện tại (không có đường kế hoạch chốt),
   **không lỗi**.
3. **PM đổi dự án bằng cookie `xboss_project`** → danh sách baseline, mặt trận theo tầng, và danh
   mục công tác đổi theo trong lần fetch kế tiếp.
4. **Kỹ sư mở `/work-fronts` ở dự án B, tầng "T5"** → ô mặt trận độc lập với "T5" của dự án A.
5. **Xoá baseline của dự án khác** (gọi thẳng API bằng id đoán được) → **404**, không phải 403 —
   không tiết lộ sự tồn tại (khuôn hiện có ở các route đã lọc dự án).
6. **DB chưa có dự án nào** (`projects` rỗng, chỉ xảy ra lúc khởi tạo) → migration bỏ qua backfill,
   `NOT NULL` chỉ đặt khi backfill thành công (xem §11).

## 7. Functional và non-functional requirements

**F1.** Mọi route đọc/ghi 3 bảng gọi `getCurrentProjectId(user)` và lọc theo giá trị đó; **không**
nhận `project_id` từ body/query của client.
**F2.** `POST /api/baselines` chỉ snapshot task thuộc dự án hiện tại (join qua
`work_packages → sheet_types → towers`).
**F3.** `GET /api/baselines` chỉ trả baseline của dự án hiện tại; `DELETE /api/baselines/:id` trả
404 khi baseline không thuộc dự án hiện tại.
**F4.** `listStages()` trả công tác `project_id IS NULL OR project_id = :current` (dùng chung + riêng).
**F5.** `ensureFloorStageFronts`/`listFloorStageFronts`/`upsertFloorStageFront`/`allProjectFloors`
nhận `projectId` **bắt buộc** (tham số, không tuỳ chọn) và lọc theo nó.
**F6.** `pendingStageFloors`/`stageMissingList` đổi từ join-theo-chuỗi sang lọc thẳng
`fsf.project_id = ?` (vẫn giữ join `work_packages` nếu cần nhãn tầng, nhưng dự án lấy từ cột).

**NF1.** Không thêm truy vấn N+1; index `(project_id, …)` cho cả 3 bảng.
**NF2.** Migration idempotent (`IF NOT EXISTS`, `DO $$` kiểm tra trước khi DROP).
**NF3.** RLS bật kèm `FORCE ROW LEVEL SECURITY`, policy 3 nhánh y khuôn `0069_rls.sql`
(`project_id::text = current_setting('app.project_id', true)` OR GUC rỗng OR GUC = `'*'`; so sánh
TEXT cố ý, tránh cast lỗi). Với `construction_stages` thêm nhánh `project_id IS NULL` (bản dùng chung).

## 8. Acceptance criteria

- **AC1.** `migrations/0149_*.sql` chạy sạch trên DB có dữ liệu thật; `npm run db:migrate -- --dry-run`
  không cảnh báo; chạy lại lần 2 không lỗi (idempotent).
- **AC2.** Chốt baseline ở dự án A không sinh dòng `baseline_tasks` nào trỏ tới task của dự án B
  (test tích hợp `tests/baselines.test.ts`).
- **AC3.** `GET /api/baselines` ở dự án B không trả baseline của A; `DELETE` baseline của A khi
  đang ở B trả **404**.
- **AC4.** Hai dự án cùng nhãn tầng `"T5"`: `ensureFloorStageFronts` sinh 2 bộ ô độc lập;
  `upsertFloorStageFront` ở dự án A không đổi dòng của B (test tích hợp).
- **AC5.** `listStages()` ở dự án bất kỳ trả đủ 7 công tác dùng chung; công tác tạo với
  `project_id = A` không hiện ở dự án B.
- **AC6.** `tests/project-scope-invariant.test.ts` xanh **sau khi gỡ** 2 mục whitelist
  `baselines` và `floor-stage-fronts`.
- **AC7 (guardrail không đổi số).** Trên DB 1 dự án: số dòng `floor_stage_fronts`,
  `construction_stages`, `baselines`, `baseline_tasks` trước và sau migration **bằng nhau**; và
  `/api/dashboard/scurve`, `/api/dashboard/spi`, `/api/work-fronts/report` trả cùng kết quả.
- **AC8.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` xanh; `docs/ERD.md`
  sinh lại khớp schema mới.

## 9. Kiến trúc và điểm chạm code

| Việc                         | File                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DDL + backfill + index + RLS | `migrations/0149_baseline_stage_project.sql` (mới)                                                                                                                           |
| Chốt/liệt kê/xoá baseline    | `app/api/baselines/route.ts`, `app/api/baselines/[id]/route.ts`                                                                                                              |
| Danh mục công tác            | `lib/tien-do/constructionStages.ts:17-56`, `app/api/construction-stages/route.ts`, `.../[id]/route.ts`                                                                       |
| Mặt trận theo tầng           | `lib/tien-do/constructionStages.ts:81-270`, `app/api/floor-stage-fronts/route.ts`, `.../[id]/documents/route.ts`                                                             |
| Người dùng của hàm mặt trận  | `app/api/lookahead/route.ts:4`, `app/api/work-fronts/report/route.tsx:6`, `lib/dich-vu/thong-bao.ts:18`, `lib/tien-do/dashboardext.ts:98-101`, `lib/tai-chinh/claims.ts:239` |
| ERD                          | `scripts/gen-erd.ts:23-26,135-136`, `docs/ERD.md`                                                                                                                            |
| Bất biến phạm vi dự án       | `tests/project-scope-invariant.test.ts:70,79` (gỡ whitelist)                                                                                                                 |

Tuân ADR-0007: `constructionStages.ts` ở `lib/tien-do/` (tầng 4) được phép import
`lib/ha-tang/projects.ts` (tầng 2) — nhưng **không** import: `projectId` truyền vào từ route
(route là nơi gọi `getCurrentProjectId`), giữ hàm lib thuần theo tham số.

## 10. API contract

**Không thêm/xoá endpoint nào, không đổi hình dạng request/response.** Thay đổi duy nhất là **tập
dữ liệu trả về bị thu hẹp theo dự án đang chọn**, và `DELETE /api/baselines/:id` thêm nhánh 404.

| Endpoint                             | Trước                | Sau                                                                 |
| ------------------------------------ | -------------------- | ------------------------------------------------------------------- |
| `GET /api/baselines`                 | mọi baseline         | baseline của dự án hiện tại                                         |
| `POST /api/baselines`                | snapshot mọi task    | snapshot task của dự án hiện tại                                    |
| `DELETE /api/baselines/:id`          | xoá bất kỳ           | 404 nếu khác dự án                                                  |
| `GET /api/construction-stages`       | mọi công tác         | `project_id IS NULL OR = current`                                   |
| `POST /api/construction-stages`      | tạo công tác toàn hệ | tạo với `project_id = current` (công tác riêng dự án)               |
| `PATCH /api/construction-stages/:id` | sửa bất kỳ           | 404 nếu công tác thuộc dự án khác; công tác NULL sửa được bởi Admin |
| `GET/PUT /api/floor-stage-fronts`    | theo `floor_label`   | theo `(project_id hiện tại, floor_label)`                           |

## 11. Data contract và DDL

`migrations/0149_baseline_stage_project.sql`:

```sql
-- 1) baselines: NOT NULL sau backfill
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
DO $$
DECLARE p INTEGER := (SELECT MIN(id) FROM projects);
BEGIN
  IF p IS NOT NULL THEN
    UPDATE baselines SET project_id = p WHERE project_id IS NULL;      -- D2
    ALTER TABLE baselines ALTER COLUMN project_id SET NOT NULL;
  END IF;                                -- projects rỗng (DB mới) → để nullable, migration sau siết
END $$;
CREATE INDEX IF NOT EXISTS idx_baselines_project ON baselines(project_id);

-- 2) construction_stages: NULLABLE (NULL = dùng chung mọi dự án) — D1
ALTER TABLE construction_stages ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS idx_construction_stages_project ON construction_stages(project_id);

-- 3) floor_stage_fronts: NOT NULL + đổi UNIQUE
ALTER TABLE floor_stage_fronts ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
DO $$
DECLARE p INTEGER := (SELECT MIN(id) FROM projects);
BEGIN
  IF p IS NOT NULL THEN
    UPDATE floor_stage_fronts SET project_id = p WHERE project_id IS NULL;
    ALTER TABLE floor_stage_fronts ALTER COLUMN project_id SET NOT NULL;
  END IF;
END $$;
-- DROP ràng buộc UNIQUE cũ theo ĐỊNH NGHĨA CỘT (không gõ tên ngầm định) — khuôn 0145
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'floor_stage_fronts'::regclass AND con.contype = 'u'
      AND (SELECT array_agg(att.attname ORDER BY att.attname)
           FROM unnest(con.conkey) k JOIN pg_attribute att
             ON att.attrelid = con.conrelid AND att.attnum = k)
          = ARRAY['floor_label','stage_id']
  LOOP EXECUTE format('ALTER TABLE floor_stage_fronts DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_floor_stage_fronts_project
  ON floor_stage_fronts (COALESCE(project_id, 0), floor_label, stage_id);
CREATE INDEX IF NOT EXISTS idx_floor_stage_fronts_project ON floor_stage_fronts(project_id);
```

**Điểm chết người:** `ON CONFLICT (floor_label, stage_id)` ở `lib/tien-do/constructionStages.ts:83`
và `:127` sẽ **lỗi runtime** ("no unique constraint matching") ngay khi ràng buộc cũ bị DROP ⇒ hai
chỗ này phải sửa thành `ON CONFLICT (COALESCE(project_id,0), floor_label, stage_id)` **trong cùng
PR với migration**, không tách PR.

RLS (cùng file, sau phần trên) theo khuôn `0069_rls.sql`, `FORCE ROW LEVEL SECURITY`, policy 3
nhánh; riêng `construction_stages` thêm nhánh `project_id IS NULL`.

## 12. Security/privacy/abuse

- Lỗ hổng đang đóng chính là **rò rỉ xuyên dự án**: hiện PM dự án A đọc được tên/ngày/nhà thầu
  mặt trận của dự án B, và chốt baseline nuốt luôn dữ liệu B.
- `project_id` **luôn lấy từ `getCurrentProjectId(user)`**, không bao giờ từ client (ghi rõ ở
  header `lib/ha-tang/projects.ts`).
- Truy cập chéo trả **404** (không phải 403) để không xác nhận sự tồn tại của bản ghi.
- RLS là lớp hai: dù route quên lọc, GUC `app.project_id` vẫn chặn — nhưng **không được coi RLS
  là thay cho lọc ở route** (`docs/audit.md`, vùng rủi ro cao).
- Không đổi ma trận quyền: `CAN.approve`-style gate của các route giữ nguyên.

## 13. UX/a11y/content

Không đổi giao diện. Hai điểm nội dung:

- Selector baseline trên `SCurveChart`/`EvmChart` rỗng khi dự án chưa chốt baseline → hiện chữ
  tiếng Việt rõ ràng ("Dự án chưa có baseline nào — bấm _Chốt baseline_ để tạo"), không để dropdown
  trống trơn.
- Nếu PR3 mở đường tạo công tác riêng dự án: nhãn phân biệt "dùng chung" vs "riêng dự án" phải
  kèm **chữ**, không chỉ màu (ADR-0010 / quy ước a11y).

## 14. Observability và vận hành

- Migration đụng dữ liệu ⇒ chạy staging trước (`docs/ops/staging.md`), `--dry-run` trước.
- Sau deploy production, đối chiếu **đếm dòng 4 bảng trước/sau** (AC7) — ghi số vào `PROGRESS.md`.
- Query chậm mới phát sinh sẽ hiện qua `XBOSS_SLOW_QUERY_MS` (mặc định 500ms) — theo dõi 24h đầu.

## 15. Test plan

- `tests/baselines.test.ts` (**mới**, tích hợp, import `tests/setup.ts` đầu tiên): 2 dự án ×
  task riêng → chốt baseline ở A, assert `baseline_tasks` không chứa task của B; `GET` lọc đúng;
  `DELETE` chéo dự án → 404.
- `tests/constructionStages.test.ts` (**mới hoặc mở rộng**, tích hợp): `ensureFloorStageFronts`
  hai dự án cùng nhãn tầng → 2 bộ ô; `upsertFloorStageFront` không rò; `listStages` trả
  chung + riêng, không trả riêng-của-dự-án-khác.
- `tests/project-scope-invariant.test.ts`: **gỡ** 2 mục whitelist; test tự fail nếu để thừa.
- `tests/dashboardext.test.ts:29-58`: cập nhật theo chữ ký hàm mới (`projectId` bắt buộc).
- `npm test -- --release-gate` phải xanh (ca SKIP = lỗi).

## 16. Kế hoạch slice/PR

| PR      | Nội dung                                                                                                                                                                                          | `route:`     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **PR1** | `migrations/0149_*.sql` (DDL + backfill + UNIQUE mới + index + RLS) **+ sửa 2 chỗ `ON CONFLICT`** trong `constructionStages.ts` — đi cùng nhau vì DROP UNIQUE làm hỏng `ON CONFLICT` ngay lập tức | `spec`       |
| **PR2** | `baselines`: lọc dự án ở `GET`/`POST`/`DELETE` + `tests/baselines.test.ts`                                                                                                                        | `standard`   |
| **PR3** | `construction_stages` + `floor_stage_fronts`: `projectId` bắt buộc cho 6 hàm trong `constructionStages.ts`, cập nhật 5 nơi gọi, route theo dự án + test                                           | `spec`       |
| **PR4** | Gỡ 2 mục whitelist `project-scope-invariant`, sinh lại `docs/ERD.md`, cập nhật `PROGRESS.md` + `docs/nang-cap/README.md`                                                                          | `mechanical` |

Thứ tự **bắt buộc tuần tự** (PR2/PR3 phụ thuộc cột của PR1; PR4 chỉ xanh sau PR2+PR3). Không chạy
song song.

## 17. Rollout/rollback

- **Rollout:** staging → đọc số đếm 4 bảng → production. Migration thuần thêm cột + index thì an
  toàn, nhưng phần DROP UNIQUE + `SET NOT NULL` là phần đụng dữ liệu ⇒ **không** đi thẳng production.
- **Rollback:** cột `project_id` để nguyên (không DROP — sẽ mất backfill); rollback bằng cách
  revert code PR2/PR3 (route quay lại không lọc). Ràng buộc UNIQUE mới rộng hơn cũ nên code cũ vẫn
  chạy, **trừ** `ON CONFLICT` — nên nếu phải rollback PR1 thì khôi phục ràng buộc cũ bằng
  `CREATE UNIQUE INDEX ... (floor_label, stage_id)` (chỉ được nếu chưa có dữ liệu trùng xuyên dự án).
- **Không có cờ tính năng** — đây là sửa đúng đắn dữ liệu, không phải tính năng bật/tắt.

## 18. Risk/assumption/open decisions

**Quyết định đã chốt với người dùng 2026-09-03:**

- **D1 — `construction_stages` dùng mô hình lai.** `project_id` NULLABLE: `NULL` = danh mục dùng
  chung (7 công tác seed giữ nguyên, mọi dự án đều thấy), có giá trị = công tác riêng dự án. Bác
  phương án NOT NULL + nhân bản (§4 phương án C) vì migration đụng dữ liệu nặng hơn hẳn.
- **D2 — baseline cũ backfill về `MIN(projects.id)`.** Đúng với thực tế production hiện chỉ có 1
  dự án thật; theo khuôn `0027`/`0069` đã dùng cho `contracts`/`payment_bills`.

**Rủi ro:**

- **R1 (cao).** DROP UNIQUE cũ làm `ON CONFLICT (floor_label, stage_id)` lỗi runtime ngay → đã xử
  bằng cách buộc PR1 chứa cả migration lẫn 2 chỗ sửa `ON CONFLICT` (§11, §16).
- **R2 (trung bình).** `floor_label` vẫn là chuỗi tự do; sau M123, "T5" của A và của B là 2 dòng
  khác nhau nhưng **vẫn không có gì đảm bảo "T5" là tầng có thật** trong dự án đó. Non-goal, ghi
  nhận làm nợ cho đợt bảng `floors`.
- **R3 (thấp).** DB `projects` rỗng lúc khởi tạo → migration bỏ qua `SET NOT NULL`; cột để
  nullable. Chấp nhận: `ensureSchema()` chạy trước khi seed dự án đầu tiên là đường hợp lệ.

**Open decision (cần chốt lúc duyệt):** ai được sửa công tác `project_id IS NULL` (dùng chung)?
Đề xuất: **chỉ Admin**; PM chỉ sửa/tạo công tác của dự án mình. Ghi vào §10 khi duyệt.

## 19. Approval

Chờ người dùng duyệt. Sau khi duyệt: cập nhật State = **Approved for implementation**, ghi
người/ngày duyệt, rồi lập `PLAN.md` giao coordinator thi hành 4 PR theo §16.
