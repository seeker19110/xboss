# M111 — Đặc tả: nền cấu hình đa dự án cho plugin (rule pack phân lớp + thư viện block theo dự án)

| Thuộc tính       | Giá trị                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Plugin dùng cho **nhiều dự án**, mà rule pack và thư viện block đang **toàn cục một bản**. Làm nền phân lớp cấu hình để mọi tính năng sau tự thừa hưởng |
| Spec owner       | Phiên chính (tầng 1)                                                                                                                                    |
| State            | **Draft — chờ duyệt.** Không code khi chưa `Approved for implementation`                                                                                |
| Người/ngày duyệt | (chờ)                                                                                                                                                   |
| Quyết định nền   | ADR-0006 (rule pack là nguồn quy tắc duy nhất), ADR-0003 (migration append-only), M101 PR4 (tiền lệ đè theo dự án cho `boqCode`)                        |
| Vị trí lộ trình  | **MỐC 0** — đi **trước** M109 và M110. Người dùng chốt 2026-08-27: _"plugin dùng để áp dụng nhiều dự án"_                                               |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

### 1.1 Cấu hình đang toàn cục, trong khi thực tế mỗi dự án một khác

`lib/ky-thuat/cad/rule-pack.ts`:

```ts
export function getCurrentRulePack(): CadRulePack {
  return RULE_PACK_HIEN_HANH; // một tệp JSON tĩnh, dùng chung TOÀN CÔNG TY
}
```

| Cấu hình                  | Hiện tại                                                                                         | Thực tế                                |
| ------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `layerMap`                | Toàn cục                                                                                         | Mỗi CĐT/TVTK một chuẩn layer           |
| `sheetSetup` / khung tên  | Toàn cục                                                                                         | Mỗi CĐT một khung tên, khổ giấy        |
| `drawTools` (cỡ tuyến…)   | Toàn cục                                                                                         | Mỗi dự án một danh mục cỡ              |
| `inspectionPolicy`        | Toàn cục                                                                                         | Dung sai nghiệm thu khác nhau theo CĐT |
| Thư viện block            | Toàn cục — `ORG_THU_VIEN_BLOCK = 1`, migration `0139` ghi rõ "bảng KHÔNG mang org_id/project_id" | Mỗi CĐT một bộ block                   |
| `takeoff.items[].boqCode` | ✅ **Đè được theo dự án** (M101 PR4, bảng `cad_takeoff_boq_map`)                                 | —                                      |

Tức là **đã có đúng một lỗ đè theo dự án**, mở riêng cho `boqCode`, còn lại toàn cục.

### 1.2 Vì sao phải làm NGAY, trước M109/M110

`elevationBands` (M109) và `routing` (M110) **bản chất là per-project**:

- Cao độ tầng: chung cư trần 2,8 m so với nhà xưởng 8 m — con số `2875` đúng cho tháp căn hộ là vô
  nghĩa với nhà máy.
- `buocLuoiMm` / `phatDoiHuongMm`: phụ thuộc quy mô mặt bằng dự án.

Viết chúng thành khoá toàn cục ⇒ **đóng đinh khuyết tật đa dự án sâu thêm một tầng**, và mỗi tính năng
mới sau đó lại phải mở thêm một lỗ đè riêng — sửa N lần thay vì 1 lần.

### 1.3 Nợ đã ghi sẵn

`M100 §20` liệt kê **"Thư viện block theo dự án (`org_id`)"** ở mục _Phiên bản sau_, lý do để lại: _"Đã
chốt bản đầu toàn cục; xem lại sau UAT"_. M108 vừa xây thêm cả đường nạp hàng loạt **lên trên** thư viện
toàn cục đó — càng để lâu càng đắt.

## 2. Outcome, metric và guardrail

- **O1** Hai dự án cùng công ty dùng **chuẩn layer khác nhau**, **khung tên khác nhau**, **cao độ khác
  nhau** — cùng một bản cài plugin, không ai phải sửa tệp cục bộ.
- **O2** Thêm một khoá cấu hình mới về sau **không cần** mở thêm cơ chế đè riêng: nó tự đè được theo dự án.
- **O3** Dự án **chưa cấu hình gì** vẫn chạy y hệt hôm nay (lõi công ty là mặc định) — không dự án nào
  bị gãy vì M111.
- **O4** Nguồn gốc mỗi giá trị **truy được**: kỹ sư nhìn `XBOSS_BANG` biết khoá này đến từ lõi công ty
  hay hồ sơ dự án.
- **Guardrail:** lõi công ty vẫn **append-only, có version** như hiện nay — lớp dự án chỉ **đè**, không
  bao giờ sửa lõi. Không có lớp thứ ba "ghi đè trên máy cá nhân" (đó là đường trôi chuẩn).
- **Stop:** phát hiện một dự án đọc nhầm cấu hình của dự án khác → dừng phát hành ngay (rò rỉ chuẩn giữa
  các CĐT là lỗi hợp đồng, không chỉ lỗi kỹ thuật).

## 3. Nghiên cứu hiện trạng

| Thành phần                                   | Vai trò sau thay đổi                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `rule-packs/*.json`                          | **Giữ nguyên vai trò** — thành **lõi công ty** (lớp 1), vẫn append-only, vẫn có version                  |
| `lib/ky-thuat/cad/rule-pack.ts`              | Thêm `layRulePackChoDuAn(projectId)` — trộn lõi + lớp dự án                                              |
| `lib/ky-thuat/cad/boq-map.ts` (M101 PR4)     | **Tiền lệ và khuôn mẫu** — `cad_takeoff_boq_map` chính là lớp dự án cho `boqCode`; M111 tổng quát hoá nó |
| `getRulePackEtagChoDuAn` (đã có)             | Mở rộng: băm cả lớp đè, không chỉ map BOQ                                                                |
| `app/api/engineering/cad/rule-pack/route.ts` | `?project=` trả bản **đã trộn đủ mọi lớp**, không chỉ `boqCode`                                          |
| `cad_block_libs` (0139) — toàn cục           | Thêm `project_id NULL` = bộ chung; NOT NULL = bộ riêng dự án                                             |
| `XBoss.Cad.Acad/Services/RulePackStore.cs`   | Cache theo **(dự án, ETag)**, không chỉ ETag                                                             |
| `XBOSS_LOGIN` / `ChonDuAn.cs`                | Đã có khái niệm chọn dự án — M111 gắn cấu hình vào đó                                                    |

## 4. Phương án

| Điểm                 | Phương án                                               | Kết luận                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mô hình              | Mỗi dự án **một rule pack đầy đủ** vs **lõi + lớp đè**  | **Lõi + lớp đè.** Rule pack đầy đủ mỗi dự án sẽ trôi chuẩn: sửa `fontMap` ở lõi thì 20 dự án không ai nhận được. Lớp đè giữ "một chỗ sửa, mọi dự án cùng đúng" cho phần chuẩn chung |
| Số lớp               | 2 (lõi + dự án) vs 3 (thêm máy cá nhân)                 | **2.** Lớp máy cá nhân là đường trôi chuẩn — chính thứ ADR-0006 sinh ra để dẹp                                                                                                      |
| Lớp đè lưu ở đâu     | Tệp JSON trong repo vs **DB**                           | **DB** (`cad_project_rule_overrides`) — cấu hình dự án đổi theo hợp đồng, không nên đòi deploy. Bám đúng tiền lệ `cad_takeoff_boq_map`                                              |
| Độ mịn của đè        | Đè cả khối vs **đè theo đường dẫn khoá** (JSON pointer) | **Theo đường dẫn khoá.** Đè cả `layerMap` chỉ để đổi một target sẽ làm dự án đó đứng ngoài mọi cải tiến sau của lõi                                                                 |
| Ai được sửa          | Admin/PM vs thêm engineer                               | **Admin/PM.** Đây là chuẩn hồ sơ nộp CĐT — cùng mức quyền với duyệt thư viện block (`CAN.approve`)                                                                                  |
| Thư viện block       | Bộ riêng hoàn toàn vs **bộ chung + bộ riêng**           | **Chung + riêng.** Block phổ thông (cút, tê, van) dùng chung; chỉ khung tên và thiết bị đặc thù mới riêng. Tránh mỗi dự án phải nạp lại từ đầu                                      |
| Xung đột lõi ↔ dự án | Báo lỗi vs **dự án thắng, có ghi nguồn**                | **Dự án thắng**, và `XBOSS_BANG` hiện rõ khoá nào bị đè (O4). Báo lỗi sẽ chặn đúng tình huống mà tính năng này sinh ra để phục vụ                                                   |

## 5. Scope / non-goals

**Trong phạm vi:** bảng lớp đè theo dự án + API đọc/ghi; `layRulePackChoDuAn` trộn 2 lớp theo đường dẫn
khoá; ETag theo dự án; plugin cache theo (dự án, ETag); thư viện block chung + riêng dự án; UI quản lý
lớp đè trên `/engineering/chuan-hoa-ban-ve`; `XBOSS_BANG` hiện nguồn gốc từng khoá; **kiểm cô lập giữa
các dự án**.

**Non-goals:** lớp cấu hình cấp máy cá nhân (cố ý loại); đa tenant/`org_id` (đã có track M54 riêng); đổi
định dạng rule pack lõi; `elevationBands`/`routing` (là **nội dung** của M109/M110 — M111 chỉ làm **chỗ
chứa**); di trú dữ liệu dự án hiện có (chưa dự án nào có lớp đè).

## 6. User journeys và mọi trạng thái

1. **Dự án mới, chưa cấu hình gì:** plugin tải rule pack → nhận **nguyên lõi công ty**. Chạy y hệt hôm
   nay. Đây là đường mặc định, không ai phải làm gì.
2. **CĐT có chuẩn layer riêng:** Admin/PM vào `/engineering/chuan-hoa-ban-ve` mục **"Cấu hình theo dự
   án"** → thêm lớp đè cho `layerMap.groups[HVAC].branches[0].target` → lưu → plugin lần tải sau nhận
   bản đã trộn (ETag đổi nên cache tự hỏi lại).
3. **Xem cái gì đang bị đè:** bảng liệt kê từng khoá đè: đường dẫn, giá trị lõi, giá trị dự án, ai sửa,
   khi nào. `XBOSS_BANG` cũng hiện số khoá đang bị đè để kỹ sư biết mình đang làm với chuẩn riêng.
4. **Gỡ đè:** xoá dòng → dự án quay về giá trị lõi. Không có bước "khôi phục" phức tạp.
5. **Thư viện block riêng:** phát hành bộ block cho dự án → plugin của dự án đó thấy **bộ chung + bộ
   riêng**; dự án khác không thấy bộ riêng này.
6. **Kỹ sư làm nhiều dự án:** `XBOSS_LOGIN` đã có bước chọn dự án — đổi dự án thì rule pack và thư viện
   block đổi theo, **plugin phải nói rõ đang ở dự án nào** trước mỗi lệnh vẽ.
7. **Trạng thái lỗi:** đường dẫn khoá đè không tồn tại trong lõi → **từ chối lúc lưu**, không phải lúc
   dùng; kiểu dữ liệu không khớp lõi → từ chối kèm kiểu mong đợi; lớp đè làm rule pack không qua
   validator → **từ chối lưu**, nêu rõ luật nào vỡ.

## 7. Functional / non-functional requirements

- **FR1** Lớp đè khai theo **đường dẫn khoá** vào rule pack, giá trị là JSON bất kỳ hợp kiểu với lõi.
- **FR2** `layRulePackChoDuAn(projectId)` trả bản đã trộn; **không dự án nào** đọc được lớp đè của dự án khác.
- **FR3** Lưu lớp đè phải **chạy nguyên bộ validator** của rule pack trên bản đã trộn; không qua ⇒ từ
  chối, **không lưu**.
- **FR4** Đường dẫn khoá không tồn tại trong lõi ⇒ từ chối lúc lưu (chống gõ sai âm thầm).
- **FR5** ETag phản ánh cả lõi lẫn lớp đè ⇒ đổi cấu hình dự án thì plugin tải lại, đổi lõi cũng vậy.
- **FR6** Plugin cache rule pack theo **(projectId, ETag)** — đổi dự án không được dùng nhầm cache.
- **FR7** Thư viện block: `project_id NULL` = bộ chung mọi dự án; NOT NULL = riêng dự án đó. Plugin nhận
  **hợp** của hai bộ; trùng tên thì **bộ riêng thắng**, và nói rõ.
- **FR8** Mọi lệnh vẽ hiện tên dự án đang làm việc trước khi thao tác (journey 6).
- **FR9** Dự án không có lớp đè ⇒ kết quả **byte-for-byte** như trước M111.

**NFR1** Trộn lớp là thao tác **thuần**, test được không cần DB. **NFR2** Đọc rule pack theo dự án
không thêm quá 1 truy vấn DB so với hiện nay. **NFR3** Mọi nhãn tiếng Việt.

## 8. Acceptance criteria

- **AC1** Dự án không cấu hình gì → rule pack trả về **giống hệt** bản toàn cục hôm nay (so từng byte).
- **AC2** Đè `layerMap` của dự án A → dự án B **không đổi một byte nào**.
- **AC3 (then chốt — cô lập)** Người chỉ thuộc dự án B gọi API cấu hình của dự án A → **403/404**, không
  rò một giá trị nào.
- **AC4** Đè khoá làm rule pack vỡ validator → **từ chối lưu**, nêu rõ luật vỡ; bản cũ còn nguyên.
- **AC5** Đường dẫn khoá gõ sai (không có trong lõi) → từ chối lúc **lưu**.
- **AC6** Đổi lớp đè → ETag đổi → plugin tải lại; không đổi → `304 Not Modified`.
- **AC7** Plugin đang mở dự án A, chuyển sang B → rule pack **và** thư viện block đổi theo, không dùng
  nhầm cache của A.
- **AC8** Block trùng tên giữa bộ chung và bộ riêng → **bộ riêng thắng**, plugin báo rõ một dòng.
- **AC9** Lõi công ty phát hành version mới → mọi dự án **nhận ngay** phần không bị đè (đây là lý do chọn
  lớp đè thay vì rule pack đầy đủ mỗi dự án).
- **AC10** `XBOSS_BANG` hiện đúng số khoá đang bị đè và tên dự án đang làm việc.

## 9. Kiến trúc và điểm chạm code

```
rule-packs/v11.json  (LÕI CÔNG TY — append-only, có version, một chỗ sửa cho mọi dự án)
        │
        ├── cad_project_rule_overrides (LỚP DỰ ÁN — DB, theo đường dẫn khoá)
        │           │
        │           ▼
        └──→ layRulePackChoDuAn(projectId) ──→ validator ──→ ETag(projectId, lõi, đè)
                                                                    │
                    ┌───────────────────────────────────────────────┘
                    ▼
        GET /api/engineering/cad/rule-pack?project=<id>
                    ▼
        RulePackStore (plugin) — cache theo (projectId, ETag)

cad_block_libs:  project_id NULL = bộ chung  │  NOT NULL = bộ riêng dự án
```

| Việc                      | Tệp                                                                            |
| ------------------------- | ------------------------------------------------------------------------------ |
| Migration                 | **mới** `migrations/0145_cad_project_rule_overrides.sql`                       |
| Trộn lớp (thuần)          | **mới** `lib/ky-thuat/cad/rule-pack-lop.ts`                                    |
| Đọc rule pack theo dự án  | `lib/ky-thuat/cad/rule-pack.ts`                                                |
| API cấu hình              | **mới** `app/api/engineering/cad/rule-overrides/route.ts`                      |
| Route rule pack           | `app/api/engineering/cad/rule-pack/route.ts`                                   |
| Thư viện block theo dự án | `migrations/0146_cad_block_libs_project.sql` + `lib/ky-thuat/cad/block-lib.ts` |
| UI cấu hình               | **mới** `app/engineering/chuan-hoa-ban-ve/components/CauHinhDuAnPanel.tsx`     |
| Plugin cache              | `XBoss.Cad.Acad/Services/RulePackStore.cs`, `BlockLibraryService.cs`           |
| Hiện nguồn gốc            | `XBoss.Cad.Acad/Ui/TrangThaiGom.cs`                                            |

## 10. API contract

| Method   | Đường dẫn                                      | Quyền    | Ghi chú                                                                           |
| -------- | ---------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `GET`    | `/api/engineering/cad/rule-overrides?project=` | Admin/PM | Danh sách khoá đè + giá trị lõi để đối chiếu                                      |
| `PUT`    | `/api/engineering/cad/rule-overrides`          | Admin/PM | `{ projectId, overrides: [{ duongDan, giaTri }] }` — chạy validator trước khi lưu |
| `DELETE` | `/api/engineering/cad/rule-overrides`          | Admin/PM | `{ projectId, duongDan }` — gỡ một khoá                                           |
| `GET`    | `/api/engineering/cad/rule-pack?project=`      | (như cũ) | **Đổi hành vi:** trả bản đã trộn đủ mọi lớp, không chỉ `boqCode`                  |

Mọi route: `getCurrentUser()` → 401; kiểm quyền `CAN.approve`; **kiểm dự án thuộc về người gọi** (AC3);
`export const dynamic = "force-dynamic"`.

## 11. Data contract và DDL

Hai migration **thêm thuần** ⇒ theo DoD đi thẳng production.

```sql
-- 0145 — lớp đè rule pack theo dự án
CREATE TABLE IF NOT EXISTS cad_project_rule_overrides (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Đường dẫn khoá vào rule pack, vd 'layerMap.groups[0].branches[0].target'.
  -- Không FK được vì rule pack là tệp JSON — API kiểm đường dẫn có thật trước khi ghi (FR4).
  duong_dan   TEXT NOT NULL,
  gia_tri     JSONB NOT NULL,
  ghi_chu     TEXT,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cad_rule_override
  ON cad_project_rule_overrides(project_id, duong_dan);
-- RLS theo project_id — bám đúng khuôn `cad_takeoff_boq_map` (0140). Cô lập giữa dự án là
-- yêu cầu HỢP ĐỒNG (chuẩn của CĐT này không được lộ sang CĐT khác), không chỉ là kỹ thuật.
```

```sql
-- 0146 — thư viện block theo dự án
ALTER TABLE cad_block_libs ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
-- NULL = bộ CHUNG cho mọi dự án (mọi dòng hiện có giữ nguyên NULL ⇒ hành vi không đổi).
CREATE INDEX IF NOT EXISTS idx_cad_block_libs_project ON cad_block_libs(project_id);
```

> `ADD COLUMN` không kèm `UPDATE`/backfill ⇒ vẫn là "thêm thuần" theo DoD. Mọi bản thư viện đã phát hành
> mang `project_id = NULL` nên tự động thành **bộ chung** — không dự án nào mất block.

## 12. Security / privacy / abuse

**Cô lập giữa dự án là yêu cầu chính của đặc tả này**, không phải phụ. Chuẩn layer/khung tên/danh mục cỡ
của một CĐT lộ sang CĐT khác là vấn đề hợp đồng. Ba lớp phòng: kiểm quyền ở route (AC3), lọc `project_id`
ở tầng app, RLS ở DB — đúng ba lớp mà `cad_takeoff_boq_map` đang dùng. Lớp đè do người dùng nhập ⇒ chạy
**nguyên bộ validator** trước khi lưu (FR3), không tin đầu vào.

## 13. UX / a11y / content

Bảng cấu hình hiện **ba cột: giá trị lõi — giá trị dự án — ai sửa/khi nào**, để người duyệt thấy ngay
mình đang lệch chuẩn công ty ở đâu. Khoá bị đè đánh dấu bằng **icon + chữ**, không chỉ màu. Bám
`app/components/ui/` (ADR-0009), dark-first, không `dark:`, không hex cứng (ADR-0010).

## 14. Observability và vận hành

Ghi audit mọi lần đổi lớp đè (ai, khoá nào, từ giá trị gì sang gì) — đây là chuẩn hồ sơ nộp, phải truy
được. `XBOSS_BANG` hiện: tên dự án đang làm, số khoá bị đè, version lõi.

## 15. Test plan

1. **Thuần (node:test):** trộn lớp theo đường dẫn khoá (mảng, khoá lồng, khoá không tồn tại); dự án
   không đè → **byte-for-byte** như lõi (AC1); đè A không ảnh hưởng B (AC2); ETag đổi/không đổi (AC6).
2. **Tích hợp (`TEST_DATABASE_URL`, import `tests/setup.ts` ĐẦU TIÊN):** cô lập dự án qua RLS (AC3);
   validator chặn lớp đè xấu (AC4); thư viện block chung + riêng, trùng tên (AC7/AC8).
3. **.NET (xunit):** `RulePackStore` cache theo (projectId, ETag) — đổi dự án không dùng nhầm cache.
4. **e2e:** đè một khoá → tải rule pack của 2 dự án → khác nhau đúng chỗ đó.
5. **Verify tay:** journey 6 (đổi dự án trong AutoCAD) cần máy thật.

Cổng: đủ **14 cổng job `static`** + `test (Postgres)` (gồm `check:coverage` **và `gen:erd`** — có 2
migration nên **bắt buộc** sinh lại ERD) + `plugin` + `plugin-shim`.

## 16. Kế hoạch slice/PR

| PR  | Nội dung                                                                                                 | route đề nghị |
| --- | -------------------------------------------------------------------------------------------------------- | ------------- |
| PR1 | Migration `0145` + `rule-pack-lop.ts` (trộn, thuần) + validator lúc lưu + test (1). Chưa có API, chưa UI | `spec`        |
| PR2 | API `rule-overrides` + `?project=` trả bản trộn đủ lớp + ETag + test (2)                                 | `spec`        |
| PR3 | UI `CauHinhDuAnPanel` + `XBOSS_BANG` hiện nguồn gốc + e2e                                                | `standard`    |
| PR4 | Migration `0146` + thư viện block chung/riêng + `BlockLibraryService` + `RulePackStore` cache theo dự án | `complex`     |

## 17. Rollout / rollback

Mọi dự án khởi đầu **không có lớp đè** ⇒ hành vi không đổi (AC1/FR9). Bật dần: cấu hình cho **một dự án
pilot** trước. Rollback: xoá dòng lớp đè → về lõi ngay, không cần deploy. Migration thêm thuần nên không
có bước lùi dữ liệu.

## 18. Risk / assumption / open decisions

| #      | Rủi ro / giả định                                                                     | Xử lý                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| R1     | Đè quá nhiều khoá ⇒ dự án đứng ngoài mọi cải tiến của lõi                             | `XBOSS_BANG` + bảng cấu hình hiện **số khoá bị đè** như một chỉ báo; nhiều bất thường là tín hiệu nên nâng lõi               |
| R2     | Đường dẫn khoá là chuỗi ⇒ lõi đổi cấu trúc thì đường dẫn cũ trỏ trượt                 | Validator chạy **mỗi lần đọc**, không chỉ lúc ghi; đường dẫn trượt ⇒ báo rõ chứ không im lặng bỏ qua                         |
| R3     | Kỹ sư làm 2 dự án dễ nhầm đang ở dự án nào                                            | FR8 — mọi lệnh vẽ hiện tên dự án trước khi thao tác                                                                          |
| R4     | M108 vừa xây nạp lô lên thư viện toàn cục ⇒ PR4 phải sửa cả đường đó                  | PR4 xếp cuối; `project_id NULL` giữ mọi thứ đang chạy nguyên vẹn                                                             |
| **O1** | **Đè theo dự án hay theo CĐT?** Một CĐT thường có nhiều dự án dùng chung chuẩn        | **Cần chốt.** Đặc tả đang làm **theo dự án**; nếu thực tế là theo CĐT thì thêm một lớp nữa — quyết trước PR1 sẽ rẻ hơn nhiều |
| **O2** | Khoá nào **cấm đè** (vd `fontMap`, thuật toán matcher — đè vào là vỡ tính nhất quán)? | **Cần chốt danh sách khoá cấm đè** trước PR1                                                                                 |

## 19. Approval

- [ ] Người duyệt: ……… — ngày ………
- [ ] Chốt O1 (theo dự án hay theo CĐT) và O2 (danh sách khoá cấm đè) — **chặn PR1**
- [ ] Chuyển State thành `Approved for implementation` trước khi code
