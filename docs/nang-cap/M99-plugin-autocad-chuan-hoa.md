# M99 — Đặc tả: Plugin AutoCAD chuẩn hóa bản vẽ (tầng 2)

| Thuộc tính       | Giá trị                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Chuẩn hóa bản vẽ bằng chính API AutoCAD trên máy kỹ sư, thay cho việc tự đọc/ghi DXF bằng TypeScript                             |
| Spec owner       | (chờ gán)                                                                                                                        |
| State            | **Approved for implementation** — PR0 (đã merge) + PR1 (rule pack v1); PR2+ (api_tokens, plugin C#) chờ điều kiện ngoài (mục 18) |
| Người/ngày duyệt | Seeker (liendv@live.com), 2026-08-23 — duyệt qua phiên chat ("duyệt luôn cả 3, làm tiếp")                                        |
| Cập nhật         | 2026-08-22                                                                                                                       |
| Quyết định nền   | `docs/adr/0006-plugin-autocad-va-pipeline-server.md`                                                                             |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

Kỹ sư MEPF (chạy **AutoCAD full**) nhận bản vẽ thiết kế từ CĐT/TVTK ở đủ kiểu layer/font/đơn vị, phải chuẩn hóa trước khi làm shop drawing. Hiện XBoss tự parse DXF bằng TS và đã sinh ra 2 lớp lỗi thật (tệp không mở được; DWG bị bịa nội dung — xem ADR-0006 §Bối cảnh). Mọi thao tác cần làm đều là chức năng gốc của AutoCAD.

## 2. Outcome, metric và guardrail

- **O1** Chuẩn hóa 1 bản vẽ mặt bằng điển hình trong **≤30s**, không rời AutoCAD.
- **O2** **0** trường hợp tệp sau chuẩn hóa không mở lại được (AutoCAD tự ghi → cấu trúc luôn hợp lệ).
- **O3** Fidelity giữ nguyên: dimension liên kết, MTEXT, xref, dynamic block **không** bị hạ cấp.
- **O4** Kết quả tầng 2 và tầng 3 trên cùng bản vẽ mẫu **khớp nhau** theo tiêu chí ở §15.
- **Guardrail:** không sửa bản vẽ khi chưa xác nhận; mọi thay đổi hoàn tác được bằng **1 lần UNDO**; bản gốc luôn được giữ.
- **Stop:** phát hiện plugin làm hỏng/mất dữ liệu bản vẽ thật → thu hồi bản phát hành ngay.

## 3. Nghiên cứu hiện trạng

| Thành phần                                                          | Vai trò sau thay đổi                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `lib/cad/dxf-writer.ts` (R12 + `validateDxf`)                       | Giữ — tầng 3 và cổng kiểm tệp nhận vào                                                             |
| `lib/cad/dxf-parser.ts`                                             | Giữ phần đọc DXF; **bỏ** nhánh bịa hình học của `parseDwgBinary`                                   |
| `generateStandardizedAutocadScript`, `generateAutoLispDetailScript` | **Bỏ** (tầng 1 đã loại — ADR-0006)                                                                 |
| `app/engineering/chuan-hoa-ban-ve`                                  | Chuyển vai: từ "công cụ chuẩn hóa" → **bảng điều khiển** (rule pack, lịch sử, kết quả, tải plugin) |
| `Dockerfile.mepf-worker` (`ezdxf`)                                  | Tầng 3: kiểm định + xuất R2000                                                                     |
| `lib/auth.ts`, `lib/drawings.ts`                                    | Thêm token API cho desktop; nhận revision từ plugin                                                |

## 4. Phương án

Đã chốt ở ADR-0006. Trong đặc tả này chỉ còn lựa chọn nội bộ:

| Điểm              | Phương án                                         | Kết luận                                                                                       |
| ----------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Ngôn ngữ          | C# .NET (AutoCAD Managed API) vs C++ ObjectARX    | **C#** — API quản lý đủ dùng, năng suất cao hơn nhiều                                          |
| Nạp plugin        | Installer MSI vs **thư mục `.bundle` autoloader** | **`.bundle`** đặt tại `%APPDATA%\Autodesk\ApplicationPlugins\` — tự nạp, không cần quyền admin |
| Nền build         | 1 bản duy nhất vs đa nền                          | **ĐÃ CHỐT: 1 bản duy nhất — AutoCAD 2026, .NET 8.** Không hỗ trợ 2021–2024. Xem §9.1           |
| Quy tắc chuẩn hóa | Nhúng trong plugin vs **tải rule pack từ XBoss**  | **Tải** — bắt buộc, chống trôi quy tắc giữa 2 tầng (ADR-0006 nguyên tắc 1)                     |

## 5. Scope / non-goals

**Trong phạm vi:** rule pack có version; token API cho desktop; bộ lệnh chuẩn hóa trong AutoCAD; báo cáo diff; tải DWG + DXF sidecar lên XBoss; kiểm định phía server; bảng điều khiển trên web.

**Non-goals:** đọc DWG bằng TypeScript; chạy AutoCAD trên server (license cấm); 3D/BIM; sinh shop drawing tự động; hỗ trợ AutoCAD LT hoặc CAD hãng khác (đã loại ở ADR-0006); **hỗ trợ AutoCAD 2024 trở về trước** (đã chốt chỉ 2026 — §9.1).

## 6. User journeys và mọi trạng thái

1. **Ghép thiết bị:** `XBOSS_LOGIN` → hiện mã ghép → kỹ sư duyệt trên web → plugin lưu token vào **Windows Credential Manager**. Trạng thái: chờ duyệt / hết hạn / bị thu hồi / mất mạng.
2. **Chỉ kiểm, không sửa:** `XBOSS_KIEMTRA` → báo cáo lệch chuẩn (layer, font, Z≠0, lineweight, dim override) **không đụng bản vẽ**. Đây là mặc định lần chạy đầu.
3. **Chuẩn hóa:** `XBOSS_CHUANHOA` → xem trước diff → xác nhận → thực thi trong **1 nhóm UNDO** → báo cáo kết quả. Huỷ giữa chừng → rollback sạch.
4. **Tải lên:** `XBOSS_UPLOAD` → gửi DWG + DXF sidecar + báo cáo + version rule pack → server kiểm định → tạo `drawing_revision` trạng thái `submitted`. Server từ chối → hiện lý do trong AutoCAD.
5. **Hàng loạt:** `XBOSS_BATCH` chọn thư mục → xử lý tuần tự, ghi nhật ký, bỏ qua tệp lỗi và báo cuối.
6. **Trạng thái lỗi:** không có rule pack (mạng) → dùng bản cache kèm cảnh báo, **cấm** tải lên; token hết hạn → yêu cầu đăng nhập lại; bản vẽ đang có thay đổi chưa lưu → yêu cầu lưu trước.

## 7. Functional / non-functional requirements

- **FR1** Rule pack có version, tải từ `GET /api/engineering/cad/rule-pack`, cache cục bộ, **ghi version vào mọi báo cáo**.
- **FR2** Chuẩn hóa layer theo ánh xạ AIA trong rule pack (dùng cơ chế tương đương `LAYTRANS`).
- **FR3** Sửa text font TCVN3/VNI → Unicode trên đối tượng thật (`DBText`/`MText`/thuộc tính block/dimension override).
- **FR4** Ép phẳng 2D: elevation + Z của mọi thực thể về 0, dựng lại theo WCS.
- **FR5** Purge/audit theo chính sách rule pack; **không** xoá đối tượng có tham chiếu.
- **FR6** Chuẩn hóa lineweight/CTB và gỡ dim override theo rule pack.
- **FR7** Mọi thay đổi trong **1 nhóm UNDO**; có chế độ chỉ-kiểm (FR-2 journey).
- **FR8** Báo cáo diff có cấu trúc (JSON) + bản đọc được bằng tiếng Việt.
- **FR9** Tải lên DWG + **DXF sidecar** để server kiểm mà không cần đọc DWG.
- **FR10** Server **kiểm định lại** trước khi ghi sổ: `ezdxf` audit + đối chiếu rule pack; sai → 422, không tạo revision.
- **FR11** Bỏ `generateStandardizedAutocadScript`, `generateAutoLispDetailScript` và nhánh bịa hình học trong `parseDwgBinary`.
- **NFR1** Không gửi bản vẽ ra ngoài hạ tầng tự host. **NFR2** Toàn bộ giao diện/thông báo tiếng Việt.
- **NFR3** Plugin không chặn UI AutoCAD quá 2s liên tục (chạy nền, có progress). **NFR4** Token lưu ở Credential Manager, **không** ghi ra tệp phẳng.

## 8. Acceptance criteria

- **AC1** _Given_ bản vẽ layer sai chuẩn, _when_ `XBOSS_CHUANHOA`, _then_ layer đổi đúng ánh xạ rule pack và **1 lần UNDO** khôi phục nguyên trạng.
- **AC2** _Given_ bản vẽ text TCVN3, _when_ chuẩn hóa, _then_ chuỗi hiển thị đúng dấu tiếng Việt; dimension liên kết vẫn là dimension.
- **AC3** _Given_ bản vẽ có Z≠0, _when_ chuẩn hóa, _then_ mọi thực thể có Z=0 và hình chiếu XY không đổi.
- **AC4** _Given_ chế độ chỉ-kiểm, _when_ chạy, _then_ bản vẽ **không thay đổi** (so sánh trước/sau) và vẫn có báo cáo.
- **AC5** _Given_ plugin tải lên tệp không đạt chuẩn, _when_ server kiểm định, _then_ trả 422 và **không** tạo `drawing_revision`.
- **AC6** _Given_ cùng một bản vẽ mẫu, _when_ chạy qua tầng 2 và tầng 3, _then_ kết quả khớp theo tiêu chí §15.
- **AC7** _Given_ token bị thu hồi trên web, _when_ plugin gọi API, _then_ nhận 401 và yêu cầu ghép lại.
- **AC8** _Given_ rule pack chỉ có bản cache, _when_ chuẩn hóa, _then_ vẫn chạy nhưng **chặn tải lên** kèm cảnh báo.

## 9. Kiến trúc và điểm chạm code

```
Máy kỹ sư (Windows + AutoCAD full)          Server XBoss (Linux, tự host)
┌────────────────────────────┐              ┌────────────────────────────────┐
│ Plugin .NET (.bundle)      │──rule pack──►│ GET  /api/engineering/cad/     │
│  ├ Core: quy tắc thuần C#  │◄─────────────│      rule-pack                 │
│  │   (không phụ thuộc ACAD)│              │ POST /api/engineering/cad/     │
│  └ Adapter: AutoCAD API    │──DWG+DXF────►│      plugin-upload             │
└────────────────────────────┘   +báo cáo   │        └► worker ezdxf kiểm định│
                                             │        └► drawing_revisions     │
                                             └────────────────────────────────┘
```

**Tách Core/Adapter là bắt buộc**: toàn bộ quy tắc nằm trong Core thuần C# không tham chiếu `acdbmgd.dll`/`acmgd.dll`, nên **unit test chạy được trên CI không cần AutoCAD**. Adapter chỉ dịch sang API AutoCAD.

Thư mục dự kiến: `plugin-autocad/` (`XBoss.Cad.Core/`, `XBoss.Cad.Acad/`, `XBoss.Cad.Tests/`, `bundle/PackageContents.xml`).
File server: `lib/cad/rule-pack.ts`, `app/api/engineering/cad/rule-pack/route.ts`, `app/api/engineering/cad/plugin-upload/route.ts`, `lib/api-tokens.ts`, `app/api/tokens/*`.

### 9.1 Đời AutoCAD mục tiêu — **ĐÃ CHỐT: AutoCAD 2026, một nền duy nhất**

**Quyết định (2026-08-22): plugin chỉ hỗ trợ AutoCAD 2026. Một bản build duy nhất trên .NET 8. Không hỗ trợ 2021–2024, không đa nền.**

Bối cảnh: Autodesk đổi runtime Managed API từ **AutoCAD 2025** — 2021–2024 chạy .NET Framework 4.8, 2025 trở đi chạy .NET 8. Plugin build cho nền này **không nạp được** trên nền kia. Chốt 2026 nên ranh giới đó không còn ảnh hưởng.

Lý do chọn 2026:

1. **Tích hợp AI nằm ở runtime, không ở tính năng AI của AutoCAD.** Thứ XBoss cần là plugin gọi được API (HTTP/JSON) và dùng được SDK hiện đại. Hệ sinh thái NuGet cho AI/HTTP nhắm .NET 6/8+; nhiều gói **đã bỏ hỗ trợ .NET Framework 4.8**.
2. **`System.Text.Json`, `HttpClient`, `async/await`, `IAsyncEnumerable`** (đọc phản hồi AI dạng stream) chín hơn hẳn trên .NET 8.
3. **Định dạng DWG không bị chia rẽ:** từ AutoCAD 2018 tới nay vẫn là định dạng **DWG 2018 (AC1032)**, nên tệp do 2026 ghi ra vẫn mở được trên máy đời cũ hơn — nâng phiên bản không cô lập ai về mặt trao đổi tệp.
4. **Tính năng AI sẵn có của Autodesk** (Smart Blocks, Markup Assist…) **không phải điểm tích hợp** — không mở API cho bên thứ ba. Không tính vào lý do chọn.

**Hệ quả kiến trúc (đơn giản hoá so với bản Draft trước):**

| Hạng mục                    | Chốt                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `XBoss.Cad.Core`            | Target **`net8.0`** (không cần `netstandard2.0` nữa vì chỉ 1 nền) — dùng được API .NET hiện đại trong chính lớp quy tắc             |
| `XBoss.Cad.Acad`            | Target `net8.0-windows`, tham chiếu `acmgd.dll` / `acdbmgd.dll` / `accoremgd.dll` của **ObjectARX SDK 2026**, đặt `CopyLocal=false` |
| Số bản build                | **1** — 1 pipeline, 1 bộ test tích hợp, 1 gói phát hành                                                                             |
| Kiểm tra phiên bản lúc chạy | Plugin đọc biến `ACADVER` khi nạp; **không phải 2026 → báo tiếng Việt và không nạp lệnh**, thay vì lỗi khó hiểu giữa chừng          |
| Cổng CI                     | Kiểm `TargetFramework` đúng `net8.0*` để không ai vô tình hạ nền                                                                    |

**Nguyên tắc build:** tham chiếu SDK đúng đời 2026. Managed API tương thích tiến, không tương thích lùi — build trên SDK mới rồi chạy trên AutoCAD cũ hơn sẽ hỏng.

> **Việc phải làm ở PR3 trước khi viết code (1 lệnh):** xác nhận runtime thật của bản AutoCAD 2026 đang cài, đừng tin con số trong tài liệu này. Trên máy có AutoCAD:
>
> ```powershell
> # Đường dẫn điển hình: C:\Program Files\Autodesk\AutoCAD 2026\
> [System.Reflection.Assembly]::LoadFrom("C:\Program Files\Autodesk\AutoCAD 2026\acmgd.dll").ImageRuntimeVersion
> ```
>
> Nếu kết quả không phải runtime .NET 8, cập nhật `TargetFramework` theo giá trị thật và sửa mục này. Đây là **assumption duy nhất còn lại** của quyết định.

## 10. API contract

| Endpoint                                        | Nội dung                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST /api/devices/pair`                        | Plugin xin mã ghép → `{ deviceCode, expiresIn }`                                           |
| `POST /api/devices/pair/confirm`                | Người dùng duyệt trên web (session thường) → phát token                                    |
| `GET /api/engineering/cad/rule-pack`            | `{ version, layerMap, fontMap, purgePolicy, lineweightMap, flattenPolicy }`; hỗ trợ `ETag` |
| `POST /api/engineering/cad/plugin-upload`       | multipart: `dwg`, `dxf`, `report.json`, `rulePackVersion` → `202 { jobId }`                |
| `GET /api/engineering/cad/plugin-upload/:jobId` | `{ status, validation, revisionId? }`                                                      |
| `GET/POST/DELETE /api/tokens`                   | Quản lý + **thu hồi** token (web)                                                          |

Auth: token Bearer cho mọi endpoint plugin; quyền `CAN.manageDrawings`; kiểm project scope. Idempotent theo hash nội dung DWG (tải lại cùng tệp không tạo revision trùng). Giới hạn kích thước tệp; rate limit theo token.

## 11. Data contract và DDL

Migration **append-only**, thuần `CREATE TABLE`/`ADD COLUMN`/`CREATE INDEX` (đi thẳng production theo DoD):

```sql
CREATE TABLE IF NOT EXISTS api_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,      -- chỉ lưu hash, không lưu token gốc
  scopes TEXT NOT NULL DEFAULT 'cad',
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);

ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS rule_pack_version TEXT;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS standardize_report JSONB;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS source_tool TEXT;  -- 'plugin' | 'server'
```

Rule pack lưu dạng tệp có version trong repo (`lib/cad/rule-packs/v1.json`) — đổi quy tắc = thêm version mới, không sửa version đã phát hành (cùng triết lý append-only của migration).

## 12. Security/privacy/abuse

**Đây là phần rủi ro cao nhất — chạm `lib/auth.ts`, phải rà theo `docs/audit.md`.**

- Token: sinh ngẫu nhiên đủ entropy, **chỉ lưu hash** trong DB, hiện đúng 1 lần lúc tạo, có hạn dùng, thu hồi được, ghi `last_used_at`. Rate limit đăng nhập/ghép thiết bị như `login_rate_limits`.
- Scope hẹp (`cad`), **không** cho token desktop làm việc quản trị; vẫn qua `CAN` + project scope như session thường.
- Server **không tin client**: kiểm định lại tệp; giới hạn kích thước; quét tên tệp; ghi audit ai tải lên từ thiết bị nào.
- Bản vẽ **không rời hạ tầng tự host**; không ghi nội dung bản vẽ vào log.
- Plugin: không tự cập nhật im lặng; xác minh chữ ký gói cài.

## 13. UX/a11y/content

Trong AutoCAD: lệnh có tiền tố `XBOSS_`, thêm ribbon panel; hộp thoại xem trước diff (bảng: hạng mục / trước / sau / số lượng); progress có nút huỷ. Trên web: trang `/engineering/chuan-hoa-ban-ve` đổi vai thành bảng điều khiển — rule pack đang phát hành, lịch sử chuẩn hóa theo bản vẽ, kết quả kiểm định, quản lý token/thiết bị, nút tải plugin. Toàn bộ tiếng Việt; giữ chuẩn a11y/theme hiện hành.

## 14. Observability và vận hành

Metric: số lần chuẩn hóa theo rule pack version, tỉ lệ upload bị từ chối kèm lý do, thời gian xử lý p95, số thiết bị hoạt động. Alert khi tỉ lệ từ chối tăng đột biến (dấu hiệu rule pack mới sai). Runbook: thu hồi rule pack lỗi = phát hành version mới, plugin tự lấy ở lần chạy sau.

## 15. Test plan

- **Unit (C#, CI không cần AutoCAD):** toàn bộ quy tắc trong `XBoss.Cad.Core` — ánh xạ layer, giải mã font, chính sách purge/flatten.
- **Integration (cần AutoCAD):** chạy qua `accoreconsole.exe` trên **runner tự host có license**; bộ bản vẽ mẫu cam kết trong repo; kiểm AC1–AC4 gồm cả round-trip UNDO.
- **Đối chứng 2 tầng (AC6):** cùng bản vẽ mẫu chạy tầng 2 và tầng 3 → so **tập tên layer, nội dung text sau giải mã, toạ độ XY trong sai số 1e-6, số thực thể theo loại**. Không so byte (2 bộ ghi khác nhau là chuyện bình thường).
- **Server (TS):** rule pack contract; `plugin-upload` từ chối tệp sai; token hết hạn/thu hồi; project scope chéo dự án; idempotency khi tải lại cùng tệp.
- **E2E:** ghép thiết bị → duyệt trên web → tải lên → thấy revision mới trong sổ bản vẽ.
- **UAT:** kỹ sư chạy trên bản vẽ dự án thật, đối chiếu kết quả với thao tác tay.

## 16. Kế hoạch slice/PR

| PR      | Nội dung                                                                                                                      | Route      | Phụ thuộc |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | --------- |
| **PR0** | **Bỏ nhánh bịa hình học trong `parseDwgBinary`**; DWG trả 422 kèm hướng dẫn. Sửa rủi ro hồ sơ đang chạy, độc lập mọi thứ khác | `standard` | —         |
| PR1     | Rule pack v1 (`lib/cad/rule-packs/v1.json`) + endpoint + kiểm contract; rút quy tắc đang rải rác trong `lib/cad` về một chỗ   | `spec`     | PR0       |
| PR2     | `api_tokens` + ghép thiết bị + quản lý/thu hồi trên web (**vùng rủi ro cao — rà `docs/audit.md`**)                            | `complex`  | PR1       |
| PR3     | Khung plugin: `XBoss.Cad.Core` + Adapter + `.bundle`, lệnh `XBOSS_LOGIN`/`XBOSS_KIEMTRA` (chỉ kiểm, chưa sửa)                 | `complex`  | PR1, PR2  |
| PR4     | `XBOSS_CHUANHOA`: layer + font + flatten 2D + purge/lineweight, 1 nhóm UNDO, báo cáo diff                                     | `complex`  | PR3       |
| PR5     | `plugin-upload` + kiểm định bằng `ezdxf` trong worker + tạo revision + `XBOSS_UPLOAD`                                         | `spec`     | PR4       |
| PR6     | `XBOSS_BATCH` + bảng điều khiển web + **bỏ tầng 1** (`generateStandardizedAutocadScript`, LISP generator)                     | `standard` | PR5       |
| PR7     | Test đối chứng 2 tầng (AC6) + bộ bản vẽ mẫu + tài liệu cài đặt                                                                | `standard` | PR5, M98  |

**PR0 tách làm ngay, không chờ duyệt phần còn lại.**

## 17. Rollout/rollback

Pilot 1–2 kỹ sư trên bản vẽ thật trước khi mở rộng. Luồng web hiện tại **giữ nguyên chạy song song** suốt pilot. Phát hành plugin theo version cố định; rollback = gỡ thư mục `.bundle` (không có gì để gỡ cài). Rule pack lỗi = phát hành version mới, không sửa version cũ. Migration ở PR2 thuần thêm → đi thẳng production được.

## 18. Risk/assumption/open decisions

| Mục                                       | Xác minh/giảm thiểu                                                                                                               | Owner | Hạn | Quyết định               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- | --- | ------------------------ |
| **Trôi quy tắc giữa 2 tầng**              | Rule pack một nguồn + test đối chứng AC6 chạy trong CI phần server                                                                |       |     | Giảm thiểu — rủi ro số 1 |
| Không có runner Windows có license cho CI | Xác nhận có máy chạy được `accoreconsole`; nếu không, test tích hợp chạy tay theo release và ghi rõ trong DoD                     |       |     | **Mở — chặn PR3**        |
| Đời AutoCAD cụ thể đang dùng              | **ĐÃ CHỐT 2026-08-22: AutoCAD 2026, 1 bản .NET 8** (§9.1). Còn 1 assumption: xác nhận runtime thật của `acmgd.dll` 2026 ở đầu PR3 |       |     | **Đã chốt**              |
| Token desktop mở rộng bề mặt tấn công     | Scope hẹp, có hạn, thu hồi được, chỉ lưu hash, rate limit; rà `docs/audit.md`                                                     |       |     | Giảm thiểu               |
| Plugin làm hỏng bản vẽ thật               | Chỉ-kiểm là mặc định; 1 nhóm UNDO; giữ bản gốc; pilot hẹp                                                                         |       |     | Giảm thiểu               |
| Chi phí duy trì stack C#                  | Chấp nhận có chủ đích (ADR-0006)                                                                                                  |       |     | Đã chấp nhận             |

## 19. Approval

- [ ] Product/scope
- [ ] UX/a11y
- [ ] Architecture/API/data
- [ ] Security/RBAC/SoD/audit
- [ ] Test/telemetry/rollout/rollback
- [ ] Không còn blocking question

**Kết luận:** Draft — chờ duyệt  
**Người/ngày duyệt:**
