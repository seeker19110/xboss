# M113 — Đặc tả Thư viện block theo dự án

| Thuộc tính       | Giá trị                                                                                                                                                                                         |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Mỗi dự án/CĐT có bộ block riêng (ký hiệu, khung tên, quy ước thiết bị); bản đầu của M100 cố ý làm thư viện **toàn cục**                                                                         |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                                                                                            |
| State            | **Approved for implementation**                                                                                                                                                                 |
| Người/ngày duyệt | Seeker / 2026-08-29                                                                                                                                                                             |
| Cập nhật         | 2026-08-28                                                                                                                                                                                      |
| Nguồn            | `M100-xboss-ve-shop-drawing.md` §20 hàng 5 ("đã chốt bản đầu toàn cục; xem lại sau UAT") + `migrations/0139` ghi chú                                                                            |
| Phụ thuộc        | M100 PR2 (`cad_block_libs`, `lib/ky-thuat/cad/block-lib.ts`), M101 PR4 (**khuôn mẫu per-project đã chạy thật**: `0140_cad_boq_code_map.sql`, `?project=`), M103/M104/M108 (các đường nạp block) |

---

## 1. Vấn đề

`cad_block_libs` (0139) cố ý **không mang `project_id`/`org_id`** và không vào RLS — ghi chú ngay
trong migration nói rõ đây là quyết định của bản đầu, để lại cho phiên bản sau. Thực tế sau pilot:

- Khung tên (`kind: titleblock`) là thứ **mỗi CĐT một kiểu** — dùng chung toàn cục là sai ngay từ
  bản vẽ đầu tiên của dự án thứ hai.
- Ký hiệu thiết bị/phụ kiện theo tiêu chuẩn của từng tư vấn cũng khác nhau.
- Ngược lại, phần lớn block MEPF (co, tê, van, giá đỡ, sleeve) **giống nhau ở mọi dự án** — bắt mỗi
  dự án tự nạp lại 200 block là thụt lùi so với hiện tại.

⇒ Không phải chọn "toàn cục" hay "theo dự án", mà là **hai tầng, dự án đè lên toàn cục**.

## 2. Outcome và guardrail

- **Target:** dự án dùng ngay bộ block toàn cục mà không phải làm gì; khi cần thì phát hành bộ riêng
  và chỉ những block khai riêng mới đè lên bản toàn cục.
- **Guardrail:**
  1. **Tương thích ngược tuyệt đối.** Máy kỹ sư đang chạy plugin bản cũ (không gửi `?project=`) vẫn
     nhận đúng thư viện toàn cục như hôm nay. Không có đợt "phải cập nhật plugin rồi mới dùng được".
  2. **Append-only giữ nguyên** (ADR-0006 nguyên tắc 1): sửa/thêm block = phát hành version MỚI;
     version đã phát hành không bao giờ bị sửa — áp cho cả bộ theo dự án.
  3. **Cách ly dữ liệu dự án.** Bộ theo dự án phải vào **RLS** như `cad_takeoff_boq_map` (0140) —
     dự án A không đọc được block của dự án B. Đây là vùng rủi ro cao trong `docs/audit.md`, phải rà
     theo mục "Vùng rủi ro cao" khi làm.
  4. **Một lần giải quyết, một chỗ.** Việc trộn 2 tầng nằm trong **một hàm thuần duy nhất** ở
     `lib/ky-thuat/cad/block-lib.ts`, có test — không rải logic đè trong route/UI/plugin.

## 3. Scope / non-goals

**Trong phạm vi:** migration thêm `project_id` (nullable) vào `cad_block_libs` + RLS 2 nhánh; hàm
trộn 2 tầng; `GET /api/engineering/cad/block-lib?project=` trả **manifest đã trộn** kèm ETag phản ánh
cả hai tầng; phát hành bộ theo dự án qua các đường nạp đã có (M100 PR2 / M104 / M108) với tham số
`project`; mục UI trên `/engineering/chuan-hoa-ban-ve` phân biệt rõ **block toàn cục / block của dự
án**; plugin gửi `project` khi tải thư viện và hiển thị nguồn của mỗi block.

**Non-goals:**

- Không đổi cấu trúc manifest (`blocks[]` giữ nguyên hợp đồng M100 §11) — chỉ thêm **nguồn** ở kết
  quả trộn, không thêm trường vào manifest đã phát hành.
- Không di trú block toàn cục hiện có sang bất kỳ dự án nào (chúng ở đúng chỗ rồi).
- Không làm thư viện theo **tổ chức** (`org_id`) trong đợt này — mức dự án đủ cho bài toán thật; nếu
  sau này cần thì thêm tầng thứ ba theo đúng khuôn này.
- Không đụng `rule_pack` (đã có đường per-project riêng ở M101 PR4).

## 4. Quy tắc trộn 2 tầng

Nguồn sự thật: hàm thuần `tronThuVienBlock(toanCuc, cuaDuAn)` trong `lib/ky-thuat/cad/block-lib.ts`.

1. Lấy **version hiện hành toàn cục** (`project_id IS NULL`, id lớn nhất) và **version hiện hành của
   dự án** (`project_id = ?`, id lớn nhất).
2. Trộn theo **`blocks[].id`**: id có ở cả hai → **bản của dự án thắng**; id chỉ có ở một bên → giữ.
3. Mỗi entry trong kết quả mang thêm `nguon: "global" | "project"` và `libVersion` (version của bộ
   mà nó đến từ) — plugin cần biết tải tệp `.dwg` từ bộ nào, và kỹ sư cần thấy block này của ai.
4. Dự án chưa có bộ riêng → kết quả **trùng khít** thư viện toàn cục hôm nay (guardrail 1).
5. `dwg_sha256` kiểm theo **từng bộ**, không trộn: client tải 2 tệp `.dwg` (hoặc 1 nếu dự án chưa có
   bộ riêng), mỗi tệp kiểm hash của chính bộ đó.
6. **ETag** = băm của cặp `(id bộ toàn cục, id bộ dự án)` — đổi một trong hai thì client tải lại.

Xung đột **tên block AutoCAD** (`blockName`) giữa 2 bộ với `id` khác nhau → **lỗi kiểm định lúc phát
hành bộ dự án**, không phải lúc dùng: hai định nghĩa cùng tên không cùng tồn tại trong một bản vẽ
được. Bổ sung vào `kiemDinhManifest` (đã có sẵn khuôn kiểm) với thông điệp tiếng Việt nêu rõ block
nào đụng bộ toàn cục nào.

## 5. Data contract và DDL

Số migration: **lấy tại thời điểm code** bằng `ls migrations | sort -V | tail -1` rồi +1 (hiện max
`0144_cad_block_batches.sql` — không tin số ghi ở đây, luật số migration trong
`docs/nang-cap/README.md`).

```sql
-- Thêm thuần cột nullable + index: đi thẳng production được (DoD).
ALTER TABLE cad_block_libs ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE;

-- UNIQUE(version) cũ KHÔNG còn đúng: hai dự án được phép cùng đặt nhãn 'b1'.
-- Đổi thành duy nhất theo (project_id, version), coi NULL là một "dự án" riêng.
ALTER TABLE cad_block_libs DROP CONSTRAINT IF EXISTS cad_block_libs_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cad_block_libs_version
  ON cad_block_libs (COALESCE(project_id, 0), version);

CREATE INDEX IF NOT EXISTS idx_cad_block_libs_du_an ON cad_block_libs (project_id, id DESC);
```

**Cảnh báo cho người thi hành:** `DROP CONSTRAINT` + `CREATE UNIQUE INDEX` **đụng ràng buộc trên dữ
liệu đang có** ⇒ theo DoD, migration này **phải chạy staging trước** (`bash deploy.sh --staging`,
`docs/ops/staging.md`), kiểm bằng `npm run db:migrate -- --dry-run`, **không** đi thẳng production.
Verify query trước khi áp: `SELECT version, count(*) FROM cad_block_libs GROUP BY 1 HAVING count(*) > 1`
phải trả 0 dòng.

**RLS** (theo đúng khuôn 2 nhánh của `0140_cad_boq_code_map.sql`, ADR-0005): dòng `project_id IS NULL`
đọc được bởi mọi phiên đã đăng nhập (tài nguyên toàn cục, như hôm nay); dòng có `project_id` chỉ đọc/
ghi trong `withProjectScope(projectId)`. Ghi (phát hành) bộ dự án đi qua `chotProjectIdChoGhi` như
mọi route ghi khác. Trigger audit của 0139 giữ nguyên, tự áp cho dòng mới.

## 6. API contract

| Route                                                             | Đổi gì                                                                                                                                                                                                                                                     |
| :---------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/engineering/cad/block-lib`                              | Thêm `?project=<id>` **tuỳ chọn**. Không có → **hành vi y hệt hôm nay** (chỉ toàn cục, guardrail 1). Có → manifest đã trộn §4 + `nguon`/`libVersion` mỗi entry; ETag theo cặp id. Auth: Bearer `cad` (kiểm **trước** cookies, quy ước M99 PR2) hoặc phiên. |
| `GET /api/engineering/cad/block-lib?file=`                        | Nhận thêm `libVersion` (hoặc `libId`) để tải đúng tệp `.dwg` của **bộ** chứa block đó; thiếu → mặc định bộ toàn cục (tương thích ngược). Scope dự án kiểm trước khi trả tệp.                                                                               |
| `POST /api/engineering/cad/block-lib` (phát hành bộ)              | Nhận `project` tuỳ chọn. Có → phát hành bộ **của dự án đó**, quyền `CAN.manageDrawings` **trong phạm vi dự án** + `chotProjectIdChoGhi`; kiểm định thêm luật xung đột `blockName` §4. Không có → như hôm nay.                                              |
| `POST /api/engineering/cad/block-lib/blocks` (M104 thêm block lẻ) | Nhận `project` tuỳ chọn, cùng quy tắc; advisory lock chống đua đổi khóa thành **theo dự án** (khóa toàn cục và khóa dự án A không được chặn nhau).                                                                                                         |
| Đường nạp lô M108                                                 | Nhận `project` tuỳ chọn, truyền xuống cùng một hàm phát hành.                                                                                                                                                                                              |

Lỗi: `project` không tồn tại hoặc ngoài phạm vi người dùng → **404** (không phải 403 — không tiết lộ
sự tồn tại của dự án khác, cùng lối các route đã có).

## 7. Functional requirements

- **FR1** Hàm thuần `tronThuVienBlock` theo §4, có test đầy đủ, là **chỗ duy nhất** biết luật đè.
- **FR2** `layBlockLibHienHanh(projectId?)` trả bộ hiện hành đúng tầng; `layLichSuBlockLib(projectId?)`
  lọc theo tầng.
- **FR3** Kiểm định phát hành bộ dự án: mọi luật `kiemDinhManifest` hiện có **cộng thêm** luật xung
  đột `blockName` với bộ toàn cục hiện hành (§4).
- **FR4** UI `/engineering/chuan-hoa-ban-ve` mục "Thư Viện Block": tách 2 khối rõ ràng — **Toàn cục**
  (chỉ đọc với người không phải Admin) và **Của dự án này** (phát hành/xem lịch sử); danh sách block
  hiển thị chip nguồn (`Toàn cục` / `Dự án`) và block bị đè hiện rõ là **đang dùng bản của dự án**.
  Dùng `Chip`/`Card`/`Section` của `app/components/ui/` — không tự vẽ style mới (ADR-0009).
- **FR5** Plugin: `XBossApiClient` gửi `project` khi tải thư viện (dự án đã chọn qua `ChonDuAn`);
  `BlockLibraryService` tải đúng tệp `.dwg` theo `libVersion` của từng block và **kiểm hash theo từng
  bộ**; `XBOSS_VE_THUVIEN` hiển thị nguồn mỗi block. Plugin **chưa chọn dự án** → gửi không kèm
  `project` → nhận bộ toàn cục (guardrail 1).
- **FR6** `XBOSS_BANG` (bảng điều khiển) hiện version của **cả hai** bộ đang dùng.
- **FR7** Đường nạp M103 (`XBOSS_VE_DEXUAT`) gửi kèm dự án đang chọn → đề xuất vào hàng chờ **của dự
  án đó**; hàng chờ toàn cục giữ nguyên cho đề xuất không kèm dự án.
- **NFR1** Không đổi hợp đồng manifest đã phát hành; bộ toàn cục hiện có chạy nguyên trạng.
- **NFR2** `GET block-lib?project=` thêm tối đa 1 truy vấn so với hôm nay; ETag vẫn cho phép 304.

## 8. Acceptance criteria

- **AC1** Plugin bản cũ (không gửi `project`) sau khi migration áp xong → tải thư viện **trùng khít**
  trước migration (manifest, hash, ETag ổn định).
- **AC2** Dự án A phát hành bộ `b1` đè `titleblock-a1`; `GET ?project=A` trả manifest có
  `titleblock-a1` với `nguon: "project"`, các block còn lại `nguon: "global"`.
- **AC3** `GET ?project=B` (B chưa có bộ riêng) → trùng khít manifest toàn cục.
- **AC4** Dự án A và dự án B cùng phát hành nhãn version `b1` → **cả hai thành công** (unique theo
  cặp), không đụng nhau.
- **AC5** Phát hành lại đúng tệp cũ cho dự án A → **idempotent**, trả đúng dòng cũ (hành vi 0139 giữ
  nguyên ở tầng dự án).
- **AC6** Bộ dự án khai block có `blockName` trùng bộ toàn cục nhưng khác `id` → **từ chối lúc phát
  hành** kèm thông điệp tiếng Việt nêu đúng block đụng nhau.
- **AC7** **RLS:** phiên thuộc dự án B truy vấn trực tiếp `cad_block_libs` không thấy dòng của dự án
  A; vẫn thấy dòng `project_id IS NULL`. Test tích hợp trên Postgres thật, theo khuôn test RLS 0140.
- **AC8** `GET ?project=<dự án không thuộc quyền>` → 404, không rò rỉ.
- **AC9** Plugin đã chọn dự án A → `XBOSS_VE_THUVIEN` chèn đúng block khung tên của A; đổi sang dự án
  B → chèn khung tên toàn cục; hash kiểm đúng ở cả hai.
- **AC10** Trang thư viện hiển thị đúng 2 khối + chip nguồn; axe sạch; tương phản đạt ở **cả 2 theme**.

## 9. Điểm chạm code

| Tầng     | Tệp                                                                         | Vai trò                                                                          |
| :------- | :-------------------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| DB       | `migrations/0<next>_cad_block_libs_project.sql`                             | Cột + unique index + RLS 2 nhánh (§5)                                            |
| lib      | `lib/ky-thuat/cad/block-lib.ts`                                             | `tronThuVienBlock`, `layBlockLibHienHanh(projectId?)`, kiểm xung đột `blockName` |
| API      | `app/api/engineering/cad/block-lib/route.ts` + `blocks/route.ts`            | `?project=`, `libVersion` khi tải tệp, scope ghi                                 |
| Web      | `app/engineering/chuan-hoa-ban-ve/components/*` (mục Thư Viện Block)        | 2 khối + chip nguồn (FR4)                                                        |
| Plugin   | `XBoss.Cad.Core/Api/XBossApiClient.cs`, `Core/Draw/BlockManifest.cs`        | Tham số `project`, `nguon`/`libVersion` trong model                              |
| Plugin   | `XBoss.Cad.Acad/Services/BlockLibraryService.cs`, `Services/ChonDuAn.cs`    | Tải 2 bộ, hash theo bộ, chèn đúng định nghĩa                                     |
| Plugin   | `XBoss.Cad.Acad/Ui/BangDieuKhienControl.cs`                                 | Hiện version cả 2 bộ (FR6)                                                       |
| Test     | `tests/cad-block-lib*.test.ts` (mở rộng), `plugin-autocad/XBoss.Cad.Tests/` | Trộn, RLS, tương thích ngược, hash theo bộ                                       |
| Tài liệu | `docs/ERD.md` (regen), `plugin-autocad/README.md`, `CAI-DAT.md`             |                                                                                  |

**Vùng rủi ro cao:** migration + RLS + route ghi ⇒ bắt buộc rà `docs/audit.md` mục "Vùng rủi ro cao"
khi review PR1/PR2.

## 10. Test plan

- **Unit (TS):** `tronThuVienBlock` — đè theo id, giữ id lẻ, gắn `nguon`/`libVersion`, dự án rỗng →
  trùng khít toàn cục; ETag đổi khi một trong hai bộ đổi; kiểm xung đột `blockName`.
- **Tích hợp Postgres thật:** AC4 (unique theo cặp), AC5 (idempotent), **AC7 (RLS 2 nhánh)** — import
  `tests/setup.ts` **đầu tiên** theo quy ước.
- **Migration:** `npm run db:migrate -- --dry-run` + verify query §5 trên bản sao dữ liệu production;
  chạy staging trước.
- **C# (xunit):** client gửi/không gửi `project`; kiểm hash theo từng bộ; model manifest đọc được
  `nguon`/`libVersion` và **bỏ qua an toàn** khi server bản cũ không trả 2 trường này.
- **E2E + axe:** trang thư viện 2 khối.
- **Verify tay:** AC9 trên máy có AutoCAD 2026.

## 11. Kế hoạch PR

| PR  | Nội dung                                                                                    | `route:`   |
| :-- | :------------------------------------------------------------------------------------------ | :--------- |
| PR1 | Migration + RLS + `tronThuVienBlock` + `layBlockLibHienHanh(projectId?)` + test (kể cả RLS) | `spec`     |
| PR2 | API `?project=` cho 3 route + kiểm xung đột `blockName` + ERD regen                         | `spec`     |
| PR3 | Web: 2 khối + chip nguồn + axe                                                              | `standard` |
| PR4 | Plugin: gửi `project`, tải/kiểm hash theo bộ, `XBOSS_BANG`, M103 gửi kèm dự án + tài liệu   | `spec`     |

Thứ tự bắt buộc: schema → API → UI → plugin. PR1 **không** đi thẳng production (§5).

## 12. Rollout / rollback

- Staging trước, kiểm verify query §5, backup trước khi áp (DoD).
- Rollback: cột `project_id` để nguyên (thêm thuần, vô hại); nếu phải lùi thì dựng lại
  `UNIQUE(version)` **chỉ khi** chưa dự án nào phát hành bộ riêng — kiểm bằng
  `SELECT count(*) FROM cad_block_libs WHERE project_id IS NOT NULL`.
- Bật dần: dự án pilot phát hành bộ riêng trước, các dự án khác không đổi gì.

## 13. Rủi ro / open decisions

| Mục                                                          | Giảm thiểu                                                                        | Quyết định                                                                              |
| :----------------------------------------------------------- | :-------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| Đổi `UNIQUE(version)` trên bảng đang có dữ liệu              | Verify query + staging + dry-run (§5); đây là lý do PR1 không đi thẳng production | Chốt                                                                                    |
| Plugin cũ gặp manifest có trường mới                         | AC1 + test C# "bỏ qua an toàn trường lạ"                                          | Chốt                                                                                    |
| Ai được phát hành bộ của dự án — Admin toàn hệ hay PM dự án? | Đề xuất: `CAN.manageDrawings` **trong phạm vi dự án** (PM dự án làm được)         | **Chốt 2026-08-29: `CAN.manageDrawings` trong phạm vi dự án** — PM dự án phát hành được |
| Có cần tầng `org_id` nữa không?                              | Khuôn §4 mở rộng được thành 3 tầng; chưa có nhu cầu thật                          | **Chốt 2026-08-29: chưa làm** — khuôn §4 mở rộng được, xem lại sau UAT đa tổ chức       |
| Dự án bị xoá → `ON DELETE CASCADE` xoá cả bộ block           | Đúng mong muốn; tệp `.dwg` trong storage dọn theo đường retention đã có           | Chấp nhận                                                                               |

## 14. Approval

- [x] Product/scope
- [x] UX/a11y (2 khối + chip nguồn, 2 theme)
- [x] Architecture/API/data (trộn 1 chỗ, append-only)
- [x] Security/RBAC/RLS/audit — **rà `docs/audit.md` vùng rủi ro cao**
- [x] Test/rollout/rollback (staging bắt buộc)
- [x] Không còn blocking question — 2 mục Open ở §13 đã chốt 2026-08-29

**Kết luận:** **Approved for implementation** (người dùng chốt 2026-08-29: "duyệt tất cả").
**Người/ngày duyệt:** Seeker / 2026-08-29
