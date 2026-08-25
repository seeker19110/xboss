# M99 — Đặc tả: Plugin AutoCAD chuẩn hóa bản vẽ & bóc tách khối lượng (tầng 2)

| Thuộc tính       | Giá trị                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Issue / Goal     | Chuẩn hóa bản vẽ + bóc tách khối lượng bằng chính API AutoCAD trên máy kỹ sư, thay cho việc tự đọc/ghi DXF bằng TypeScript                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Spec owner       | (chờ gán)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| State            | **Approved for implementation** — PR0 (đã merge) + PR1 (rule pack v1, đã merge); PR-A (rule pack v2 + khung plugin + KIEMTRA/CHUANHOA/BOCKL/Excel — nhánh `claude/autocad-csharp-plugin-ypi9nb`); PR2 (ghép thiết bị + token scope cad + `XBOSS_LOGIN` — **đã merge #386**, tái dùng `api_keys`, xem §10/§11); PR-B (đã merge #389); PR5 (plugin-upload + kiểm định server + `XBOSS_UPLOAD` — **đã merge #392**); **PR6 (bảng điều khiển web + bỏ tầng 1) + PR7a (đối chứng AC6 + bộ mẫu + tài liệu cài đặt) — nhánh `claude/pr6-tiep-tuc-y9689t`**; PR7b chờ máy Windows có license (§18) |
| Người/ngày duyệt | Seeker (liendv@live.com), 2026-08-23 ("duyệt luôn cả 3, làm tiếp"); 2026-08-24 yêu cầu bổ sung BOCKL + xuất Excel ClosedXML và triển khai ngay ("mọi quyết định đều ưu tiên chất lượng cao nhất")                                                                                                                                                                                                                                                                                                                                                                                          |
| Cập nhật         | 2026-08-24 — bản mở rộng: thêm bóc tách khối lượng (`XBOSS_BOCKL`) + xuất Excel theo mẫu công ty (ClosedXML); siết đặc tả chuẩn hóa (pipeline thứ tự cố định, kiểm tra highlight, đơn vị bản vẽ)                                                                                                                                                                                                                                                                                                                                                                                           |
| Cập nhật (PR-B)  | 2026-08-24 — nâng cấp trọn khối: 2 phép kiểm mới theo `purgePolicy.deepPurge` (layer rỗng `reportEmptyLayers`, block nặc danh `reportAnonymousBlocks` — v2 khai sẵn nhưng PR-A chưa cài); `XBOSS_KIEMTRA` xuất báo cáo JSON cạnh DWG (đủ FR8 cho cả 2 chế độ); Excel bóc tách thêm tổng nhóm hệ + TỔNG CỘNG bằng công thức `SUBTOTAL` sống; sidecar JSON kết quả bóc cạnh Excel (chuẩn bị PR5); `XBOSS_BATCH` (journey 7 — phần plugin của PR6): xử lý hàng loạt thư mục qua side database, bản gốc giữ nguyên, kết quả vào `da-chuan-hoa/`, nhật ký + bỏ qua tệp lỗi                      |
| Quyết định nền   | `docs/adr/0006-plugin-autocad-va-pipeline-server.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

Kỹ sư MEPF (chạy **AutoCAD full**) nhận bản vẽ thiết kế từ CĐT/TVTK ở đủ kiểu layer/font/đơn vị, phải chuẩn hóa trước khi làm shop drawing. Hiện XBoss tự parse DXF bằng TS và đã sinh ra 2 lớp lỗi thật (tệp không mở được; DWG bị bịa nội dung — xem ADR-0006 §Bối cảnh). Mọi thao tác cần làm đều là chức năng gốc của AutoCAD.

Sau khi chuẩn hóa, cùng kỹ sư đó phải **bóc tách khối lượng** (quantity takeoff) từ bản vẽ shop đã duyệt để điền cột **"KHỐI LƯỢNG ĐỊNH MỨC (Bản vẽ thi công)"** trong biểu mẫu BOQ công ty (`attachments/MAU-KHOI-LUONG-BOQ.xlsx`, sheet `02_MAU_BOQ_TRONG`) — hiện đang đo tay từng đoạn ống/máng trong AutoCAD rồi gõ lại vào Excel: chậm, sót, không truy vết được đã bóc vùng nào. Bóc tách nằm cùng một chỗ với chuẩn hóa (trong AutoCAD, trên cùng bản vẽ) nên thuộc cùng plugin này.

## 2. Outcome, metric và guardrail

- **O1** Chuẩn hóa 1 bản vẽ mặt bằng điển hình trong **≤30s**, không rời AutoCAD.
- **O2** **0** trường hợp tệp sau chuẩn hóa không mở lại được (AutoCAD tự ghi → cấu trúc luôn hợp lệ).
- **O3** Fidelity giữ nguyên: dimension liên kết, MTEXT, xref, dynamic block **không** bị hạ cấp.
- **O4** Kết quả tầng 2 và tầng 3 trên cùng bản vẽ mẫu **khớp nhau** theo tiêu chí ở §15.
- **O5** Bóc khối lượng 1 hệ trên 1 mặt bằng trong **≤5 phút** (so với hàng giờ đo tay), kết quả xuất thẳng ra Excel **đúng mẫu công ty** — QS mở lên dùng được ngay, không sửa layout.
- **O6** Không bóc trùng: chạy lại `XBOSS_BOCKL` trên vùng đã bóc **không** cộng lặp khối lượng (đánh dấu XData, xem §6.5).
- **Guardrail:** không sửa bản vẽ khi chưa xác nhận; mọi thay đổi hoàn tác được bằng **1 lần UNDO** (kể cả tô màu đánh dấu của BOCKL); bản gốc luôn được giữ; chế độ chỉ-kiểm là mặc định lần chạy đầu.
- **Stop:** phát hiện plugin làm hỏng/mất dữ liệu bản vẽ thật → thu hồi bản phát hành ngay.

## 3. Nghiên cứu hiện trạng

| Thành phần                                                          | Vai trò sau thay đổi                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `lib/ky-thuat/cad/dxf-writer.ts` (R12 + `validateDxf`)              | Giữ — tầng 3 và cổng kiểm tệp nhận vào                                                             |
| `lib/ky-thuat/cad/dxf-parser.ts`                                    | Giữ phần đọc DXF; **bỏ** nhánh bịa hình học của `parseDwgBinary` (PR0 — đã làm)                    |
| `generateStandardizedAutocadScript`, `generateAutoLispDetailScript` | **Đã bỏ** (tầng 1 đã loại — ADR-0006; thi hành ở PR6)                                              |
| `app/engineering/chuan-hoa-ban-ve`                                  | Chuyển vai: từ "công cụ chuẩn hóa" → **bảng điều khiển** (rule pack, lịch sử, kết quả, tải plugin) |
| `Dockerfile.mepf-worker` (`ezdxf`)                                  | Tầng 3: kiểm định + xuất R2000                                                                     |
| `lib/bao-mat/auth.ts`, `lib/ky-thuat/drawings.ts`                   | Thêm token API cho desktop; nhận revision từ plugin (PR2/PR5)                                      |
| `lib/ky-thuat/cad/rule-pack.ts` + `rule-packs/v1.json` (PR1)        | Nguồn quy tắc duy nhất — **mở rộng v2**: thêm `takeoff` + `inspectionPolicy` (§11)                 |
| `attachments/MAU-KHOI-LUONG-BOQ.xlsx`                               | **Mẫu công ty** cho xuất Excel BOCKL — sheet `02_MAU_BOQ_TRONG` là hợp đồng layout (§13.2)         |
| `lib/khoi-luong/boq.ts` (BOQCODE toàn hệ thống)                     | Nguồn tham chiếu mã BOQ; plugin ghi mã vào cột A của Excel xuất ra, **không** ghi thẳng vào DB     |

## 4. Phương án

Đã chốt ở ADR-0006. Trong đặc tả này chỉ còn lựa chọn nội bộ:

| Điểm              | Phương án                                                            | Kết luận                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ngôn ngữ          | C# .NET (AutoCAD Managed API) vs C++ ObjectARX                       | **C#** — API quản lý đủ dùng, năng suất cao hơn nhiều                                                                                                                                                                                      |
| Nạp plugin        | Installer MSI vs **thư mục `.bundle` autoloader**                    | **`.bundle`** đặt tại `%APPDATA%\Autodesk\ApplicationPlugins\` — tự nạp, không cần quyền admin                                                                                                                                             |
| Nền build         | 1 bản duy nhất vs đa nền                                             | **ĐÃ CHỐT: 1 bản duy nhất — AutoCAD 2026, .NET 8.** Không hỗ trợ 2021–2024. Xem §9.1                                                                                                                                                       |
| Quy tắc chuẩn hóa | Nhúng trong plugin vs **tải rule pack từ XBoss**                     | **Tải** — bắt buộc, chống trôi quy tắc giữa 2 tầng (ADR-0006 nguyên tắc 1)                                                                                                                                                                 |
| Thư viện Excel    | ClosedXML vs EPPlus vs Open XML SDK thô                              | **ClosedXML** (MIT, thuần managed, API bảng tính cấp cao, chạy được trên CI Linux để test round-trip). EPPlus 5+ đổi sang Polyform Noncommercial — loại. Open XML SDK thô quá thấp cấp cho mẫu có công thức/format — loại                  |
| Logic bóc tách    | Trong Adapter (gọi API đo của AutoCAD) vs **đo hình học trong Core** | **Adapter đo, Core gộp**: chiều dài/diện tích lấy từ chính đối tượng AutoCAD (`Curve.GetDistanceAtParameter`, `Area`) — nguồn sự thật là bản vẽ; Core chỉ nhận số đo thô + quy đổi đơn vị + gộp nhóm + làm tròn (thuần, test được trên CI) |

## 5. Scope / non-goals

**Trong phạm vi:** rule pack có version (v2: thêm bóc tách + chính sách kiểm tra); token API cho desktop (PR2); bộ lệnh chuẩn hóa trong AutoCAD (kiểm tra + chuẩn hóa theo pipeline thứ tự cố định); **bóc tách khối lượng theo layer mapping, đánh dấu vùng đã bóc, xuất Excel đúng mẫu công ty (ClosedXML)**; báo cáo diff; tải DWG + DXF sidecar lên XBoss (PR5); kiểm định phía server; bảng điều khiển trên web.

**Non-goals:** đọc DWG bằng TypeScript; chạy AutoCAD trên server (license cấm); 3D/BIM; sinh shop drawing tự động; hỗ trợ AutoCAD LT hoặc CAD hãng khác (đã loại ở ADR-0006); **hỗ trợ AutoCAD 2024 trở về trước** (đã chốt chỉ 2026 — §9.1); **đơn giá/thành tiền trong Excel bóc tách** (cột tiền là việc của QS trên hệ BOQ, plugin chỉ giao khối lượng — tránh đụng quy ước tiền tệ M45); **ghi khối lượng thẳng vào DB XBoss từ plugin** (đường ghi sổ duy nhất là upload có kiểm định ở PR5, không mở đường ghi tắt).

## 6. User journeys và mọi trạng thái

1. **Ghép thiết bị (PR2):** `XBOSS_LOGIN` → hiện mã ghép → kỹ sư duyệt trên web → plugin lưu token vào **Windows Credential Manager**. Trạng thái: chờ duyệt / hết hạn / bị thu hồi / mất mạng.
2. **Nạp rule pack — giai đoạn chuyển tiếp khi PR2 chưa có:** `XBOSS_RULEPACK` nạp tệp JSON rule pack (kỹ sư tải từ trang `/engineering/chuan-hoa-ban-ve` bằng phiên đăng nhập web) → plugin kiểm cấu trúc + version, cache tại `%APPDATA%\XBoss\rule-pack.json`, hiện version + hash. Khi PR2 xong, `XBOSS_LOGIN` tải trực tiếp qua `GET /api/engineering/cad/rule-pack` (ETag) — lệnh `XBOSS_RULEPACK` vẫn giữ làm đường dự phòng offline. **Chưa nạp rule pack → mọi lệnh kiểm/chuẩn hóa/bóc tách từ chối chạy** (không có quy tắc nhúng cứng — ADR-0006 nguyên tắc 1).
3. **Chỉ kiểm, không sửa:** `XBOSS_KIEMTRA` → báo cáo lệch chuẩn **không đụng bản vẽ**, kèm **highlight trực quan từng nhóm lỗi** (§6.4). Đây là mặc định lần chạy đầu.
4. **Chuẩn hóa:** `XBOSS_CHUANHOA` → xem trước diff (bảng: hạng mục / trước / sau / số lượng) → xác nhận → thực thi pipeline thứ tự cố định (§6.6) trong **1 nhóm UNDO** → báo cáo kết quả. Huỷ giữa chừng → rollback sạch.
5. **Bóc tách khối lượng:** `XBOSS_BOCKL` (§6.5) → chọn phạm vi (toàn model space / quét cửa sổ) → plugin quét đối tượng khớp quy tắc `takeoff` trong rule pack → bảng kết quả theo hệ/hạng mục → xác nhận → **tô màu vùng đã bóc + ghi XData** (1 nhóm UNDO riêng) → `XBOSS_BOCKL_XUAT` xuất Excel đúng mẫu công ty. `XBOSS_BOCKL_XOA` gỡ đánh dấu (toàn bộ hoặc theo chọn).
6. **Tải lên (PR5):** `XBOSS_UPLOAD` → gửi DWG + DXF sidecar + báo cáo + version rule pack → server kiểm định → tạo `drawing_revision` trạng thái `submitted`. Server từ chối → hiện lý do trong AutoCAD.
7. **Hàng loạt (PR6):** `XBOSS_BATCH` chọn thư mục → xử lý tuần tự, ghi nhật ký, bỏ qua tệp lỗi và báo cuối.
8. **Trạng thái lỗi:** không có rule pack (mạng) → dùng bản cache kèm cảnh báo, **cấm** tải lên; token hết hạn → yêu cầu đăng nhập lại; bản vẽ đang có thay đổi chưa lưu → yêu cầu lưu trước; bản vẽ không phải đơn vị mm (`INSUNITS`) → cảnh báo + tự quy đổi (§6.7); AutoCAD không phải 2026 → báo tiếng Việt và không nạp lệnh (§9.1).

### 6.4 `XBOSS_KIEMTRA` — các phép kiểm và cách highlight

Nguồn quy tắc: các section sẵn có của rule pack + `inspectionPolicy` (v2, §11). Mỗi phép kiểm cho ra một **nhóm phát hiện** trong báo cáo, kèm số lượng, danh sách handle và highlight:

| #   | Phép kiểm               | Quy tắc nguồn                                     | Phát hiện                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Layer sai chuẩn         | `layerMap` (token-boundary, thứ tự nhóm)          | Layer có tên sẽ bị đổi khi chuẩn hóa (tên hiện tại ≠ target)                                                                                                                                                                                                                                                                         |
| 2   | Lệch Z / elevation      | `flattenPolicy` + `inspectionPolicy.zToleranceMm` | Thực thể có \|Z\| > dung sai ở bất kỳ đỉnh/elevation nào                                                                                                                                                                                                                                                                             |
| 3   | **Polyline hở**         | `inspectionPolicy.openPolyline`                   | Polyline **không đóng** trên các layer thuộc diện đo diện tích (`takeoff` measure=area) + layer khai thêm; phân biệt "hở thật" vs "gần kín" (2 đầu cách nhau ≤ `nearGapToleranceMm` — thường là vẽ thiếu 1 cú click). Khi `reportNearClosedOnAllLayers=true`, ca "gần kín" được báo trên **mọi** layer (gần như chắc chắn là lỗi vẽ) |
| 4   | Font cũ TCVN3/VNI       | `fontMap`                                         | Text/MText/thuộc tính block/dimension override chứa chuỗi giải mã được (kết quả giải mã ≠ chuỗi gốc)                                                                                                                                                                                                                                 |
| 5   | Lineweight/màu lệch CTB | `lineweightMap.byAci`                             | Thực thể/layer có ACI nằm trong bảng nhưng lineweight khác quy định                                                                                                                                                                                                                                                                  |
| 6   | Dim override            | `purgePolicy` (gỡ override là bước chuẩn hóa)     | Dimension có text/measurement override                                                                                                                                                                                                                                                                                               |
| 7   | Rác hình học            | `purgePolicy.deepPurge`                           | Đoạn zero-length (≤ `zeroLengthToleranceMm`), đối tượng trùng chồng (cùng khóa làm tròn mm, cả 2 chiều)                                                                                                                                                                                                                              |

Bổ sung (PR-B) — 2 phép kiểm đọc từ `purgePolicy.deepPurge` (v2 đã khai sẵn):

| #   | Phép kiểm      | Quy tắc nguồn                                 | Phát hiện                                                                                                                                            |
| --- | -------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | Layer rỗng     | `purgePolicy.deepPurge.reportEmptyLayers`     | Layer không có thực thể nào trên TOÀN bản vẽ (mọi block table record — không suy từ model space kẻo báo oan); bỏ qua `0`/`Defpoints`/layer `XBOSS_*` |
| 9   | Block nặc danh | `purgePolicy.deepPurge.reportAnonymousBlocks` | Block anonymous (`*U…`/`*D…`) không phải layout/xref — dấu hiệu explode/copy bừa làm phình bản vẽ                                                    |

`XBOSS_KIEMTRA` cũng ghi **báo cáo JSON** `<tệp>.dwg.xboss-kiemtra.json` cạnh DWG (cùng cơ chế với CHUANHOA — FR8 phủ cả 2 chế độ, PR5 gửi kèm khi upload).

**Highlight không đụng bản vẽ:** dùng `Entity.Highlight()`/selection set cho nhóm đang xem + vẽ marker (circle/revcloud nhỏ) trên layer tạm **`XBOSS_KIEMTRA_MARK`** tại vị trí lỗi (đầu hở của polyline, tâm thực thể lệch Z). Layer marker do plugin tạo, **xoá toàn bộ khi kết thúc phiên kiểm** (lệnh kết thúc hoặc chạy lại) — marker không được tính vào diff chuẩn hóa, không xuất hiện trong purge report, và nằm trong 1 nhóm UNDO riêng của phiên kiểm. Báo cáo cho phép **nhảy tới từng lỗi** (zoom vào handle).

### 6.5 `XBOSS_BOCKL` — bóc tách khối lượng

**Nguyên tắc: bản vẽ là nguồn sự thật về hình học; rule pack là nguồn sự thật về quy tắc gán.** Plugin không suy diễn khối lượng từ text/dim ghi trên bản vẽ — chỉ đo hình học thật.

1. **Phạm vi:** toàn model space (mặc định) hoặc chọn vùng cửa sổ/đa giác. Không bóc trong paper space, không bóc đối tượng trong xref (báo số lượng đối tượng xref bị bỏ qua để kỹ sư biết).
2. **Khớp quy tắc:** mỗi đối tượng được thử lần lượt các `takeoff.items` (thứ tự khai trong rule pack, first-match): khớp khi layer của đối tượng khớp `layerMatchAny` (thuật toán token-boundary **dùng chung** với `layerMap` — một bộ matcher duy nhất trong Core) **và** (nếu item khai `blockNameMatchAny`) đối tượng là BlockReference có tên khớp. Item `measure` quyết định loại đối tượng nhận: `length` nhận Line/Arc/Circle/Polyline/Polyline2d/3d/Ellipse/Spline (đo bằng `Curve.GetDistanceAtParameter(EndParam)`); `area` nhận Polyline **đóng**/Hatch/Region (đo bằng thuộc tính `Area`; polyline hở → **không đo**, ghi vào cảnh báo, trỏ sang `XBOSS_KIEMTRA` phép kiểm 3); `count` nhận BlockReference (đếm; dynamic block đếm theo tên block gốc — `DynamicBlockTableRecord`).
3. **Quy đổi đơn vị:** số đo thô (đơn vị bản vẽ) × hệ số `INSUNITS`→mm (bản vẽ mm chuẩn thì ×1; bản vẽ m thì ×1000; `INSUNITS=0 Unitless` → cảnh báo + coi là mm) × `factor` của item (mm→m: `0.001`; mm²→m²: `1e-6`; count: `1`). Làm tròn theo `takeoff.rounding` **chỉ ở tổng cuối mỗi item**, không làm tròn từng đối tượng (tránh tích lũy sai số).
4. **Kết quả:** bảng theo nhóm hệ (group của item) → item: tên, quy cách, đơn vị, số đối tượng, khối lượng; kèm cảnh báo (polyline hở bị bỏ, đối tượng khớp ≥2 item chỉ tính item đầu, xref bỏ qua). Mã BOQ lấy từ `boqCode` của item (rule pack có thể để trống → cột A Excel để trống cho QS gán).
5. **Đánh dấu chống bóc trùng:** sau xác nhận, mỗi đối tượng đã bóc được **tô màu** `takeoff.markColorAci` (color override trên entity) và ghi **XData** app `takeoff.xdataAppName` (`XBOSS_BOCKL`): item id, version rule pack, ngày ISO. Lần chạy sau **mặc định bỏ qua** đối tượng đã có XData (hiện số lượng bị bỏ qua + tuỳ chọn "bóc lại từ đầu" = gỡ đánh dấu vùng chọn rồi bóc). Toàn bộ tô màu + XData nằm trong **1 nhóm UNDO**.
6. **`XBOSS_BOCKL_XOA`:** gỡ đánh dấu (trả màu về ByLayer/ByBlock đúng trạng thái trước — lưu màu cũ trong XData để trả lại chính xác, không mặc định ByLayer) + xoá XData; phạm vi: toàn bản vẽ hoặc theo chọn; 1 nhóm UNDO.
7. **`XBOSS_BOCKL_XUAT`:** xuất Excel theo §13.2 từ kết quả bóc **đang đánh dấu trên bản vẽ** (đọc lại từ XData — nghĩa là đóng AutoCAD mở lại vẫn xuất được, trạng thái bóc sống trong DWG chứ không trong RAM plugin).

### 6.6 `XBOSS_CHUANHOA` — pipeline thứ tự cố định

Chạy đúng thứ tự sau, toàn bộ trong **1 nhóm UNDO**, có preview diff trước khi thực thi:

1. **AUDIT** (`Database.Audit(fix=true)`) — sửa lỗi cấu trúc trước khi đụng nội dung.
2. **Layer mapping** — đổi tên/gộp layer theo `layerMap` (tương đương `LAYTRANS`): layer nguồn trùng target đã tồn tại → gộp (chuyển thực thể, xoá layer nguồn); target chưa có → đổi tên. Thực thể để màu/lineweight ByLayer đi theo layer mới.
3. **Font** — giải mã TCVN3/VNI → Unicode NFC trên `DBText`/`MText`/`AttributeReference`/dimension text override, theo `fontMap` (per-character TCVN3, ordered-replace-all VNI, cadSymbols). **Chọn bảng giải mã theo font của text style** (font `.Vn*`/TCVN → bảng TCVN3; font `VNI-*` → bảng VNI; font không rõ → chỉ ký hiệu CAD `%%c`…) — KHÔNG áp VNI mù lên mọi text vì `A1`/`E5`… là chuỗi hợp lệ trong mã hàng/tên trục (VNI định nghĩa `A1`→`Á`).
4. **Flatten** — ép elevation + mọi tọa độ Z về 0 theo WCS (`flattenPolicy`), giữ nguyên hình chiếu XY.
5. **Overkill** — xoá zero-length + trùng chồng theo `purgePolicy.deepPurge` (khóa làm tròn mm, cả 2 chiều).
6. **Purge** — layer/block không dùng (`keepReferenced=true`, không đụng đối tượng có tham chiếu), lặp tới khi không còn gì purge được (purge block lồng nhau cần nhiều lượt).
7. **Lineweight/CTB + dim override** — áp `lineweightMap.byAci` cho layer (không ghi đè từng thực thể trừ khi thực thể có override sai), gỡ dimension override theo chính sách.

Mỗi bước ghi số liệu vào báo cáo diff (JSON + bản tiếng Việt): bước / hạng mục / trước / sau / số lượng. Version rule pack in trong mọi báo cáo (FR1).

### 6.7 Đơn vị bản vẽ

Plugin đọc `INSUNITS` khi mở phiên làm việc. Chuẩn dự án là **mm**. `INSUNITS` ≠ mm → mọi lệnh vẫn chạy nhưng hiện cảnh báo cố định trên báo cáo + tự quy đổi số đo về mm trước khi áp `factor` (BOCKL) và trước khi so `zeroLengthToleranceMm`/`nearGapToleranceMm` (KIEMTRA/CHUANHOA). `INSUNITS=0` (Unitless) → cảnh báo mạnh, coi là mm, ghi rõ trong báo cáo.

## 7. Functional / non-functional requirements

- **FR1** Rule pack có version, tải từ `GET /api/engineering/cad/rule-pack` (hoặc nạp tệp qua `XBOSS_RULEPACK` khi chưa có token), cache cục bộ, **ghi version vào mọi báo cáo và mọi Excel xuất ra**.
- **FR2** Chuẩn hóa layer theo ánh xạ AIA trong rule pack (cơ chế tương đương `LAYTRANS`), matcher token-boundary **duy nhất** dùng chung cho layerMap lẫn takeoff.
- **FR3** Sửa text font TCVN3/VNI → Unicode trên đối tượng thật (`DBText`/`MText`/thuộc tính block/dimension override).
- **FR4** Ép phẳng 2D: elevation + Z của mọi thực thể về 0, dựng lại theo WCS.
- **FR5** Purge/audit theo chính sách rule pack; **không** xoá đối tượng có tham chiếu.
- **FR6** Chuẩn hóa lineweight/CTB và gỡ dim override theo rule pack.
- **FR7** Mọi thay đổi trong **1 nhóm UNDO**; có chế độ chỉ-kiểm (journey 3).
- **FR8** Báo cáo diff có cấu trúc (JSON) + bản đọc được bằng tiếng Việt.
- **FR9** Tải lên DWG + **DXF sidecar** để server kiểm mà không cần đọc DWG (PR5).
- **FR10** Server **kiểm định lại** trước khi ghi sổ: `ezdxf` audit + đối chiếu rule pack; sai → 422, không tạo revision (PR5).
- **FR11** Bỏ `generateStandardizedAutocadScript`, `generateAutoLispDetailScript` và nhánh bịa hình học trong `parseDwgBinary` (PR0 đã làm phần parse; phần generator **đã bỏ ở PR6**).
- **FR12** `XBOSS_KIEMTRA` phát hiện và highlight đủ 7 nhóm ở §6.4, **không thay đổi bản vẽ** (marker trên layer tạm, dọn sạch khi kết thúc).
- **FR13** `XBOSS_BOCKL` bóc theo `takeoff` của rule pack: đo length/area/count đúng loại đối tượng, quy đổi `INSUNITS` + `factor`, làm tròn chỉ ở tổng, first-match có cảnh báo khi một đối tượng khớp nhiều item.
- **FR14** Đánh dấu vùng đã bóc bằng màu `markColorAci` + XData (item id, rule pack version, ngày, màu cũ); chạy lại không bóc trùng; `XBOSS_BOCKL_XOA` trả lại đúng màu cũ.
- **FR15** Xuất Excel bằng **ClosedXML** đúng mẫu công ty §13.2: sheet `Data-BOQ`, cột A–K, công thức H/J/K nguyên văn mẫu, header dự án + bản vẽ + version rule pack + người bóc + ngày; mở được bằng Excel/LibreOffice không cảnh báo.
- **FR16** Trạng thái bóc sống trong DWG (XData), không sống trong RAM: `XBOSS_BOCKL_XUAT` dựng lại kết quả từ XData sau khi đóng/mở lại bản vẽ.
- **FR17** Toàn bộ quy tắc thuần (matcher, giải mã font, gộp khối lượng, ghi Excel, dựng báo cáo) nằm trong `XBoss.Cad.Core` **không tham chiếu assembly AutoCAD** — unit test chạy trên CI Linux.
- **NFR1** Không gửi bản vẽ ra ngoài hạ tầng tự host. **NFR2** Toàn bộ giao diện/thông báo tiếng Việt.
- **NFR3** Plugin không chặn UI AutoCAD quá 2s liên tục (chạy nền, có progress + nút huỷ). **NFR4** Token lưu ở Credential Manager, **không** ghi ra tệp phẳng (PR2).

## 8. Acceptance criteria

- **AC1** _Given_ bản vẽ layer sai chuẩn, _when_ `XBOSS_CHUANHOA`, _then_ layer đổi đúng ánh xạ rule pack và **1 lần UNDO** khôi phục nguyên trạng.
- **AC2** _Given_ bản vẽ text TCVN3, _when_ chuẩn hóa, _then_ chuỗi hiển thị đúng dấu tiếng Việt **(gồm cả việc đổi font của KIỂU CHỮ sang `fontMap.targetFont` — đổi nội dung chuỗi thôi thì AutoCAD vẫn hiển thị sai, xác nhận thật 2026-08-25)**; dimension liên kết vẫn là dimension.
- **AC3** _Given_ bản vẽ có Z≠0, _when_ chuẩn hóa, _then_ mọi thực thể có Z=0 và hình chiếu XY không đổi.
- **AC4** _Given_ chế độ chỉ-kiểm, _when_ chạy, _then_ bản vẽ **không thay đổi** (so sánh trước/sau) và vẫn có báo cáo.
- **AC5** _Given_ plugin tải lên tệp không đạt chuẩn, _when_ server kiểm định, _then_ trả 422 và **không** tạo `drawing_revision` (PR5).
- **AC6** _Given_ cùng một bản vẽ mẫu, _when_ chạy qua tầng 2 và tầng 3, _then_ kết quả khớp theo tiêu chí §15.
- **AC7** _Given_ token bị thu hồi trên web, _when_ plugin gọi API, _then_ nhận 401 và yêu cầu ghép lại (PR2).
- **AC8** _Given_ rule pack chỉ có bản cache, _when_ chuẩn hóa, _then_ vẫn chạy nhưng **chặn tải lên** kèm cảnh báo.
- **AC9** _Given_ bản vẽ có polyline hở trên layer đo diện tích, _when_ `XBOSS_KIEMTRA`, _then_ polyline đó được liệt kê + highlight, phân loại "gần kín" nếu 2 đầu cách ≤ dung sai; và _when_ `XBOSS_BOCKL`, _then_ nó **không** được đo diện tích, có cảnh báo trỏ về KIEMTRA.
- **AC10** _Given_ mặt bằng có 3 đoạn ống trên layer khớp item length (factor 0.001, bản vẽ mm), _when_ `XBOSS_BOCKL` toàn model space, _then_ khối lượng = tổng chiều dài 3 đoạn (mm) × 0.001, làm tròn đúng `rounding.length`, cả 3 đổi sang màu `markColorAci` và mang XData; _when_ chạy `XBOSS_BOCKL` lần 2, _then_ khối lượng mới = 0, báo "đã bóc trước đó: 3 đối tượng".
- **AC11** _Given_ kết quả bóc đang đánh dấu, _when_ `XBOSS_BOCKL_XUAT`, _then_ tệp `.xlsx` mở bằng Excel: đúng layout §13.2, cột G mang khối lượng bóc, công thức H/J/K sống (sửa cột F thì H/J/K tự tính), tiêu đề có tên dự án + tên bản vẽ + version rule pack; _and_ đóng AutoCAD mở lại bản vẽ rồi xuất vẫn ra đúng kết quả (FR16).
- **AC12** _Given_ vùng đã bóc, _when_ `XBOSS_BOCKL_XOA`, _then_ màu từng đối tượng trả về **đúng màu trước khi bóc** (kể cả đối tượng vốn có color override riêng), XData sạch, và 1 UNDO khôi phục lại trạng thái đã bóc.
- **AC13** _Given_ bản vẽ `INSUNITS=6` (m), _when_ `XBOSS_BOCKL`, _then_ số đo được quy đổi m→mm trước khi áp factor (kết quả cuối bằng đúng bản vẽ mm cùng hình học) và báo cáo có cảnh báo đơn vị.
- **AC14** _Given_ chưa nạp rule pack, _when_ chạy bất kỳ lệnh kiểm/chuẩn hóa/bóc tách, _then_ lệnh từ chối chạy với hướng dẫn `XBOSS_RULEPACK` bằng tiếng Việt.

## 9. Kiến trúc và điểm chạm code

```
Máy kỹ sư (Windows + AutoCAD 2026)           Server XBoss (Linux, tự host)
┌──────────────────────────────────┐         ┌────────────────────────────────┐
│ Plugin .NET 8 (.bundle)          │─rule────►│ GET  /api/engineering/cad/     │
│  ├ XBoss.Cad.Core (thuần C#)     │◄──pack──│      rule-pack  (v2)           │
│  │   matcher · font · takeoff    │         │ POST /api/engineering/cad/     │
│  │   gộp KL · ClosedXML · report │─DWG+DXF►│      plugin-upload (PR5)       │
│  └ XBoss.Cad.Acad (Adapter)      │ +báo cáo│   └► worker ezdxf kiểm định     │
│      lệnh XBOSS_* · đo · UNDO    │         │   └► drawing_revisions          │
└──────────────────────────────────┘         └────────────────────────────────┘
```

**Tách Core/Adapter là bắt buộc**: toàn bộ quy tắc + gộp khối lượng + ghi Excel nằm trong Core thuần C# không tham chiếu `acdbmgd.dll`/`acmgd.dll`, nên **unit test chạy được trên CI không cần AutoCAD** (FR17). Adapter chỉ dịch sang API AutoCAD: dựng snapshot, đo hình học, áp thay đổi trong UNDO group, hộp thoại.

Thư mục: `plugin-autocad/` — `XBoss.Cad.sln`, `XBoss.Cad.Core/` (net8.0; phụ thuộc duy nhất: ClosedXML), `XBoss.Cad.Acad/` (net8.0-windows; tham chiếu ObjectARX 2026 qua thuộc tính MSBuild `AcadSdkDir`, `CopyLocal=false`; **không build trong CI**), `XBoss.Cad.Tests/` (xunit, chỉ tham chiếu Core), `bundle/PackageContents.xml`, `README.md` (build/cài đặt/xác minh runtime §9.1).

File server: `lib/ky-thuat/cad/rule-pack.ts` + `rule-packs/v2.json` (PR-A); `app/api/engineering/cad/plugin-upload/route.ts`, `lib/bao-mat/cad-devices.ts`, `app/api/devices/pair/*`, `app/api/tokens/*`, trang `/engineering/thiet-bi-cad` (PR2 — đã làm); plugin-upload (PR5).

### 9.1 Đời AutoCAD mục tiêu — **ĐÃ CHỐT: AutoCAD 2026, một nền duy nhất**

**Quyết định (2026-08-22): plugin chỉ hỗ trợ AutoCAD 2026. Một bản build duy nhất trên .NET 8. Không hỗ trợ 2021–2024, không đa nền.**

Bối cảnh: Autodesk đổi runtime Managed API từ **AutoCAD 2025** — 2021–2024 chạy .NET Framework 4.8, 2025 trở đi chạy .NET 8. Plugin build cho nền này **không nạp được** trên nền kia. Chốt 2026 nên ranh giới đó không còn ảnh hưởng.

Lý do chọn 2026:

1. **Tích hợp AI nằm ở runtime, không ở tính năng AI của AutoCAD.** Thứ XBoss cần là plugin gọi được API (HTTP/JSON) và dùng được SDK hiện đại. Hệ sinh thái NuGet cho AI/HTTP nhắm .NET 6/8+; nhiều gói **đã bỏ hỗ trợ .NET Framework 4.8** (ClosedXML 0.105 cũng yêu cầu .NET 6+/netstandard2.1+).
2. **`System.Text.Json`, `HttpClient`, `async/await`, `IAsyncEnumerable`** chín hơn hẳn trên .NET 8.
3. **Định dạng DWG không bị chia rẽ:** từ AutoCAD 2018 tới nay vẫn là định dạng **DWG 2018 (AC1032)**, nên tệp do 2026 ghi ra vẫn mở được trên máy đời cũ hơn.
4. **Tính năng AI sẵn có của Autodesk** không phải điểm tích hợp — không mở API cho bên thứ ba.

**Hệ quả kiến trúc:**

| Hạng mục                    | Chốt                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `XBoss.Cad.Core`            | Target **`net8.0`** — dùng được API .NET hiện đại trong chính lớp quy tắc; phụ thuộc NuGet duy nhất: `ClosedXML`                                 |
| `XBoss.Cad.Acad`            | Target `net8.0-windows`, tham chiếu `acmgd.dll` / `acdbmgd.dll` / `accoremgd.dll` của **ObjectARX SDK 2026** qua `AcadSdkDir`, `CopyLocal=false` |
| Số bản build                | **1** — 1 pipeline, 1 bộ test tích hợp, 1 gói phát hành                                                                                          |
| Kiểm tra phiên bản lúc chạy | Plugin đọc biến `ACADVER` khi nạp; **không phải 2026 → báo tiếng Việt và không nạp lệnh**, thay vì lỗi khó hiểu giữa chừng                       |
| Cổng CI                     | Kiểm `TargetFramework` đúng `net8.0*` để không ai vô tình hạ nền; CI build + test **Core/Tests** (Linux), không build Adapter                    |

**Nguyên tắc build:** tham chiếu SDK đúng đời 2026. Managed API tương thích tiến, không tương thích lùi — build trên SDK mới rồi chạy trên AutoCAD cũ hơn sẽ hỏng.

> **✅ ĐÃ XÁC MINH TRÊN MÁY THẬT (2026-08-25):** AutoCAD 2026 cài trên máy người dùng cho
> `acmgd.dll` mang `.NETCoreApp,Version=v8.0` và `Acmgd, Version=25.1.0.0` — **đúng .NET 8 và đúng
> ACADVER 25.1** như quyết định §9.1 giả định. `TargetFramework net8.0*` giữ nguyên, hằng
> `PluginExtension.AcadVer2026 = "25.1"` đúng. Assumption cuối cùng của quyết định này **đã đóng**.
>
> Lệnh dùng để xác minh (đọc thẳng chuỗi TargetFramework trong tệp, không nạp assembly — cách này
> chạy được cả trên Windows PowerShell 5.1):
>
> ```powershell
> $b = [IO.File]::ReadAllBytes("C:\Program Files\Autodesk\AutoCAD 2026\acmgd.dll")
> $s = [Text.Encoding]::UTF8.GetString($b)
> [regex]::Matches($s, '\.NET[A-Za-z]*,Version=v[0-9\.]+') | ForEach-Object { $_.Value } | Select-Object -Unique
> ```
>
> Lưu ý cho lần kiểm sau trên máy khác: `[Reflection.Assembly]::LoadFrom(...).ImageRuntimeVersion`
> **ném `BadImageFormatException` trên Windows PowerShell 5.1** vì 5.1 chạy .NET Framework 4.8,
> không nạp nổi assembly .NET 8 — bản thân lỗi đó đã là dấu hiệu nền .NET 8, nhưng dùng lệnh trên
> mới đọc được con số. Máy AutoCAD đời khác vẫn phải kiểm lại trước khi phát hành cho đời đó.

## 10. API contract

| Endpoint                                          | Nội dung                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/devices/pair`                          | Plugin xin mã ghép → `{ userCode, deviceCode, expiresIn, confirmPath }` — device flow: `userCode` ngắn cho người gõ vào web, `deviceCode` bí mật 256-bit chỉ plugin giữ (DB lưu hash). Public + rate limit IP (PR2 — đã làm)   |
| `POST /api/devices/pair/confirm`                  | Kỹ sư duyệt/từ chối `userCode` trên web (session + `CAN.manageDrawings`) (PR2 — đã làm)                                                                                                                                        |
| `POST /api/devices/pair/claim`                    | Plugin poll bằng `deviceCode` (body POST, không URL): 202 chờ · 200 `{ key, expiresAt }` — key sinh TẠI ĐÂY, trả đúng 1 lần, claim atomic · 410 hết hạn · 403 từ chối (PR2 — đã làm; endpoint bổ sung so với bản đặc tả trước) |
| `GET /api/engineering/cad/rule-pack`              | **v2**: `{ version, layerMap, fontMap, purgePolicy, lineweightMap, flattenPolicy, takeoff, inspectionPolicy }`; hỗ trợ `ETag`                                                                                                  |
| `POST /api/engineering/cad/plugin-upload`         | multipart: `dwg`, `dxf`, `report.json`, `rulePackVersion` → `202 { jobId }` (PR5)                                                                                                                                              |
| `GET /api/engineering/cad/plugin-upload/:jobId`   | `{ status, validation, revisionId? }` (PR5)                                                                                                                                                                                    |
| `GET/POST /api/tokens` + `DELETE /api/tokens/:id` | Kỹ sư tự quản token thiết bị của mình (list không lộ key/hash · tạo thủ công trả key 1 lần · thu hồi = revoked_at, chủ token hoặc Admin; Admin thấy mọi key ở /api/admin/api-keys sẵn có) (PR2 — đã làm)                       |

**Ghi chú PR5 (điểm lệch/bổ sung so với bảng trên):** multipart nhận thêm `rev` + `drawingCode` (số bản vẽ trong sổ — bảng gốc không nói cách trỏ bản vẽ đích) hoặc `drawingId`; kiểm định fail trả **422 ngay** (AC5) thay vì 202; kiểm định dùng parser DXF TS sẵn có của tầng 3 thay cho worker ezdxf (một parser duy nhất cả hai tầng — cùng tinh thần FR10, bớt một stack Python); job ghi vào hàng đợi `engineering_async_tasks` sẵn có, GET /:jobId chỉ NGƯỜI TẠO job đọc được.

Auth: token Bearer cho mọi endpoint plugin; quyền `CAN.manageDrawings`; kiểm project scope. Idempotent theo hash nội dung DWG. Giới hạn kích thước tệp; rate limit theo token. Rule pack v2 là **mở rộng thuần** (chỉ thêm field) — client v1 (nếu có) không vỡ.

## 11. Data contract và DDL

**ĐIỂM LỆCH SO VỚI BẢN NHÁP (quyết định PR2, 2026-08-24): KHÔNG tạo bảng `api_tokens` mới —
tái dùng `api_keys` sẵn có** (0061: hash sha256, thu hồi, rate limit, audit trigger, org_id từ
0078, admin UI) — DDL nháp `api_tokens` trong bản trước được viết khi chưa rà hiện trạng; tạo
bảng song song là vi phạm "tái dùng trước khi viết mới" và nhân đôi bề mặt audit. Đã thi hành
trong `migrations/0133_cad_device_pairing.sql` (thêm thuần):

```sql
-- Token thiết bị có hạn + tên thiết bị (key đọc-only cũ expires_at NULL = vô hạn, không đổi hành vi)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS device_name TEXT;
-- scope mới 'cad' trong api_keys.scopes; token quy về người duyệt (created_by) → quyền qua CAN

CREATE TABLE IF NOT EXISTS cad_device_pairings (
  id SERIAL PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,          -- mã ngắn (XXXX-XXXX, bảng chữ không nhập nhằng)
  device_code_hash TEXT NOT NULL UNIQUE,   -- sha256 của bí mật 256-bit plugin giữ
  device_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','claimed','denied')),
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL          -- mã ghép sống 10 phút
);
-- + audit trigger như 0061. Key thô KHÔNG BAO GIỜ nằm trong DB: sinh tại thời điểm claim,
-- trả đúng 1 lần; token hạn 90 ngày (CAD_TOKEN_TTL_DAYS).
```

Phần `drawing_revisions` giữ nguyên kế hoạch, thi hành ở PR5:

```sql
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS rule_pack_version TEXT;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS standardize_report JSONB;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS source_tool TEXT;  -- 'plugin' | 'server'
```

Rule pack lưu dạng tệp có version trong repo (`lib/ky-thuat/cad/rule-packs/`) — đổi quy tắc = thêm version mới, không sửa version đã phát hành. **v2 = v1 + 2 section mới:**

- **`takeoff`** — quy tắc bóc tách: `drawingUnitAssumption` (mm), `markColorAci`, `xdataAppName`, `rounding { length, area, count }` (số chữ số thập phân), `items[]`: `{ id, group, name, spec, unit, measure: "length"|"area"|"count", layerMatchAny[], blockNameMatchAny?[], factor, boqCode }`. `layerMatchAny` khớp **token-boundary** cùng thuật toán `layerMap.matchingNote`; item bám các **layer đích đã chuẩn hóa** (M-DUCT-SUPP…) — bóc tách chạy SAU chuẩn hóa là luồng chuẩn; `boqCode` để trống khi mã tùy dự án (QS gán trong Excel).
- **`inspectionPolicy`** — chính sách kiểm tra: `zToleranceMm`, `openPolyline { checkLayersFromAreaTakeoff, extraLayersMatchAny[], nearGapToleranceMm }`.

**v3 = v2 + `fontMap.targetFont`** (phát hành 2026-08-25, mở rộng thuần — plugin đọc v2 vẫn nạp được v3):

- **`targetFont`** — `{ typeFace, note }`: font Unicode đích cho **kiểu chữ** đã giải mã TCVN3/VNI.
  Lý do phát hành: bước sửa font trước đây chỉ đổi **nội dung** chuỗi, `TextStyle` vẫn trỏ `.VnTime`
  nên AutoCAD **hiển thị vẫn sai** dù dữ liệu đúng — AC2 không đạt trên bản vẽ thật. Plugin chỉ đổi
  font của kiểu chữ mà nó thực sự nhận ra là mã cũ (`DetectFontKind != None`); kiểu chữ vốn đã
  Unicode giữ nguyên. Rule pack không khai `targetFont` (v2) → plugin bỏ qua bước này và **ghi cảnh
  báo vào báo cáo**, không tự chế font.

XData trên đối tượng đã bóc (app `XBOSS_BOCKL`): `[itemId, rulePackVersion, ngày ISO, màu-trước-khi-bóc]` — hợp đồng đọc/ghi duy nhất nằm trong Adapter, format ghi rõ trong README plugin.

## 12. Security/privacy/abuse

**Đây là phần rủi ro cao nhất — chạm `lib/bao-mat/auth.ts`, phải rà theo `docs/audit.md`.**

- Token: sinh ngẫu nhiên đủ entropy, **chỉ lưu hash** trong DB, hiện đúng 1 lần lúc tạo, có hạn dùng, thu hồi được, ghi `last_used_at`. Rate limit đăng nhập/ghép thiết bị như `login_rate_limits`.
- Scope hẹp (`cad`), **không** cho token desktop làm việc quản trị; vẫn qua `CAN` + project scope như session thường.
- Server **không tin client**: kiểm định lại tệp; giới hạn kích thước; quét tên tệp; ghi audit ai tải lên từ thiết bị nào.
- Bản vẽ **không rời hạ tầng tự host**; không ghi nội dung bản vẽ vào log.
- Plugin: không tự cập nhật im lặng; xác minh chữ ký gói cài. Rule pack nạp từ tệp (`XBOSS_RULEPACK`) được kiểm cấu trúc chặt (parse strict, từ chối field lạ kiểu sai) — tệp JSON là dữ liệu, không bao giờ thực thi.
- Excel xuất ra chỉ chứa dữ liệu bóc + công thức bảng tính của chính mẫu công ty — **không macro** (.xlsx thuần, không .xlsm).

## 13. UX/a11y/content

Trong AutoCAD: lệnh tiền tố `XBOSS_`, thêm ribbon panel; hộp thoại xem trước diff (bảng: hạng mục / trước / sau / số lượng); bảng kết quả bóc tách theo hệ; progress có nút huỷ. Toàn bộ tiếng Việt. Trên web: trang `/engineering/chuan-hoa-ban-ve` đổi vai thành bảng điều khiển — rule pack đang phát hành (kèm nút tải JSON cho `XBOSS_RULEPACK`), lịch sử chuẩn hóa theo bản vẽ, kết quả kiểm định, quản lý token/thiết bị, nút tải plugin.

### 13.2 Hợp đồng layout Excel (mẫu công ty — `attachments/MAU-KHOI-LUONG-BOQ.xlsx`, sheet `02_MAU_BOQ_TRONG`)

Tệp xuất: `.xlsx` (ClosedXML), 1 sheet tên **`Data-BOQ`** (đúng tên sheet dữ liệu mà dashboard công ty tham chiếu `'Data-BOQ'!A7:A883`). Layout:

| Vùng      | Nội dung                                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1–B4     | `DỰ ÁN: <tên dự án>` / `ĐỊA ĐIỂM/BẢN VẼ: <tên tệp DWG>` / `GÓI THẦU: <gói thầu>` / `BIỂU MẪU: QUẢN LÝ KHỐI LƯỢNG BOQ & ĐỊNH MỨC BÓC TÁCH BẢN VẼ` — kèm dòng ghi chú `Bóc bằng XBoss plugin — rule pack <version> — <ngày> — <người bóc>`                                                                                        |
| Hàng 6    | Header A–K nguyên văn mẫu: `Mã BOQ\n(Duy nhất)` · `STT` · `MÔ TẢ CÔNG TÁC / VẬT TƯ` · `Mã/ Quy cách` · `Đơn vị` · `KHỐI LƯỢNG BOQ\n(Dự toán HĐ)` · `KHỐI LƯỢNG ĐỊNH MỨC\n(Bản vẽ thi công)` · `CHÊNH LỆCH ĐỊNH MỨC\n(= BOQ - Định mức)` · `GHI CHÚ KỸ THUẬT` · `KIỂM SOÁT ĐẶT HÀNG\n(QS DUYỆT)` · `GỢI Ý HÀNH ĐỘNG / ĐIỀU KIỆN` |
| Hàng 7+   | Hàng nhóm hệ (STT La Mã I/II/…, tên nhóm in đậm, nền xám nhạt) rồi hàng item: A=`boqCode` (trống nếu rule pack chưa gán), B=STT trong nhóm, C=tên item, D=quy cách, E=đơn vị, F=**trống** (QS điền KL BOQ hợp đồng), G=**khối lượng bóc**, I=ghi chú (số đối tượng, cảnh báo)                                                   |
| H/J/K     | Công thức **nguyên văn mẫu công ty** từng hàng item (thay số hàng): `H: =IF(OR(ISNUMBER(F{r}),ISNUMBER(G{r})),N(F{r})-N(G{r}),"")`; `J: =IF(...⚠️ Chưa bóc tách định mức / ✅ OK - Cho phép đặt hàng / ❌ CHẶN ĐẶT HÀNG - CẦN BẢO VỆ KL...)`; `K: =IF(...Được đặt hàng tối đa...Vượt dự toán...)`                               |
| Định dạng | Bề rộng cột theo mẫu (A:18, B:8, C:50, D:14, E:10, F:18, G:20, H:22, I:18, J:30, K:45); border mảnh quanh vùng bảng; header đậm, wrap, nền; freeze hàng 6; số cột F/G/H định dạng `#,##0.00`                                                                                                                                    |

Tính chất bắt buộc: mở bằng Excel **không cảnh báo sửa lỗi**; công thức sống (điền F → H/J/K tự tính); không macro. Kiểm bằng round-trip ClosedXML trong unit test (ghi → đọc lại → đối chiếu ô/công thức) + UAT mở bằng Excel thật.

## 14. Observability và vận hành

Metric: số lần chuẩn hóa theo rule pack version, tỉ lệ upload bị từ chối kèm lý do, thời gian xử lý p95, số thiết bị hoạt động; số lần bóc tách + tổng số đối tượng bóc theo version. Alert khi tỉ lệ từ chối tăng đột biến (dấu hiệu rule pack mới sai). Runbook: thu hồi rule pack lỗi = phát hành version mới, plugin tự lấy ở lần chạy sau.

## 15. Test plan

- **Unit (C#, CI Linux không cần AutoCAD):** toàn bộ `XBoss.Cad.Core` — matcher token-boundary (kể cả ca `THOAT`↛`OA`, thứ tự nhóm `CAP` điện-trước-nước), ánh xạ layer (đối chiếu cùng corpus với test TS ở `tests/engineering-cad-rule-pack.test.ts`), giải mã TCVN3/VNI/cadSymbols + NFC, gộp khối lượng (quy đổi INSUNITS, factor, first-match, làm tròn chỉ-ở-tổng, chống trùng theo tập handle), phát hiện polyline hở/gần kín từ snapshot, **BoqExcelWriter round-trip** (ghi → đọc lại bằng ClosedXML → đối chiếu header, dữ liệu, công thức H/J/K, tên sheet `Data-BOQ`), parse rule pack v2 strict.
- **Integration (cần AutoCAD):** chạy qua `accoreconsole.exe` trên **runner tự host có license**; bộ bản vẽ mẫu cam kết trong repo; kiểm AC1–AC4, AC9–AC13 gồm round-trip UNDO và persist XData qua đóng/mở tệp.
- **Đối chứng 2 tầng (AC6):** hai phần. (a) **Quy tắc — chạy trên CI Linux (PR7a, đã làm):** corpus dùng chung `plugin-autocad/doi-chung/corpus.json` + kết quả kỳ vọng do tầng 3 sinh (`npm run cad:doi-chung`), cả hai tầng đối chiếu đúng hai tệp đó (`tests/cad-doi-chung-2-tang.test.ts` + `DoiChungHaiTangTests.cs`) → so tập tên layer sau ánh xạ và nội dung text sau giải mã TCVN3/VNI. (b) **Hình học — cần AutoCAD (PR7b):** cùng bản vẽ mẫu chạy tầng 2 và tầng 3 → so toạ độ XY trong sai số 1e-6 và số thực thể theo loại. Không so byte.
- **Server (TS):** rule pack v2 contract (đủ 8 field, takeoff/inspectionPolicy đúng cấu trúc, ETag đổi theo version); `plugin-upload` từ chối tệp sai; token hết hạn/thu hồi; project scope; idempotency (PR2/PR5).
- **E2E:** ghép thiết bị → duyệt trên web → tải lên → thấy revision mới trong sổ bản vẽ (PR5).
- **UAT:** kỹ sư chạy trên bản vẽ dự án thật; QS mở Excel xuất ra đối chiếu với 1 hệ đã đo tay.

## 16. Kế hoạch slice/PR

| PR       | Nội dung                                                                                                                                                                                                                                                                                         | Route      | Trạng thái / phụ thuộc                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------- |
| **PR0**  | Bỏ nhánh bịa hình học trong `parseDwgBinary`; DWG trả 422 kèm hướng dẫn                                                                                                                                                                                                                          | `standard` | ✅ đã merge                                                                                        |
| **PR1**  | Rule pack v1 + endpoint + kiểm contract                                                                                                                                                                                                                                                          | `spec`     | ✅ đã merge                                                                                        |
| **PR-A** | **Rule pack v2 (takeoff + inspectionPolicy) + toàn bộ mã nguồn plugin**: `XBoss.Cad.Core` (matcher, font, kiểm tra, gộp KL, Excel ClosedXML, báo cáo) + `XBoss.Cad.Tests` (CI Linux) + `XBoss.Cad.Acad` (XBOSS_RULEPACK/KIEMTRA/CHUANHOA/BOCKL/BOCKL_XOA/BOCKL_XUAT) + `.bundle` + CI job dotnet | `complex`  | nhánh `claude/autocad-csharp-plugin-ypi9nb` — gộp phạm vi PR3+PR4 cũ (trừ LOGIN) + BOCKL/Excel mới |
| PR2      | `api_tokens` + ghép thiết bị + quản lý/thu hồi trên web + `XBOSS_LOGIN` (**vùng rủi ro cao — rà `docs/audit.md`**)                                                                                                                                                                               | `complex`  | chờ; sau PR-A                                                                                      |
| PR5      | `plugin-upload` + kiểm định `ezdxf` trong worker + tạo revision + `XBOSS_UPLOAD`                                                                                                                                                                                                                 | `spec`     | chờ PR2                                                                                            |
| PR6      | `XBOSS_BATCH` (plugin — làm ở PR-B) + bảng điều khiển web (nút tải rule pack JSON + tải plugin qua `XBOSS_PLUGIN_URL` + lịch sử upload/kiểm định) + **bỏ tầng 1** (generator .SCR/LISP) — **xong**                                                                                               | `standard` | xong                                                                                               |
| PR7a     | **Xong** — đối chứng 2 tầng phần quy tắc (AC6: layer + font, corpus dùng chung `plugin-autocad/doi-chung/`, canh cả 2 tầng + 2 cổng CI) + bộ bản vẽ mẫu `plugin-autocad/mau-ban-ve/` + tài liệu cài đặt `plugin-autocad/CAI-DAT.md`                                                              | `standard` | xong                                                                                               |
| PR7b     | Kiểm tích hợp AC1–AC4, AC9–AC13 qua `accoreconsole` trên bộ mẫu + xác minh runtime `acmgd.dll` (§9.1) + UAT                                                                                                                                                                                      | `standard` | **chờ máy Windows có license** (người dùng xác nhận có, làm sau)                                   |

(PR3/PR4 của bản đặc tả trước được gộp vào PR-A — lý do: người dùng yêu cầu 2026-08-24 triển khai trọn khối chuẩn hóa + bóc tách; phần phụ thuộc điều kiện ngoài (token/upload/runner) vẫn tách PR riêng.)

## 17. Rollout/rollback

Pilot 1–2 kỹ sư trên bản vẽ thật trước khi mở rộng. Luồng web hiện tại **giữ nguyên chạy song song** suốt pilot. Phát hành plugin theo version cố định; rollback = gỡ thư mục `.bundle`. Rule pack lỗi = phát hành version mới, không sửa version cũ. Migration ở PR2 thuần thêm → đi thẳng production được. Trước bản cài đầu tiên: chạy lệnh xác minh runtime §9.1 trên máy thật.

## 18. Risk/assumption/open decisions

| Mục                                                                                                           | Xác minh/giảm thiểu                                                                                                                                                    | Quyết định                         |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Trôi quy tắc giữa 2 tầng**                                                                                  | Rule pack một nguồn + test đối chứng AC6 chạy trong CI phần server + Core test dùng cùng corpus với test TS                                                            | Giảm thiểu — rủi ro số 1           |
| Không có runner Windows có license cho CI                                                                     | PR7a đã tách phần đối chứng **quy tắc** (AC6 layer/font) chạy được trên CI Linux; phần hình học + AC9–AC13 chạy tay theo release trên máy có license, ghi rõ trong DoD | **Giảm thiểu — chỉ còn chặn PR7b** |
| Đời AutoCAD cụ thể đang dùng                                                                                  | **ĐÃ CHỐT: AutoCAD 2026, 1 bản .NET 8** (§9.1). Assumption runtime **đã đóng 2026-08-25**: `acmgd.dll` trên máy thật = `.NETCoreApp,Version=v8.0`, `Acmgd 25.1.0.0`    | **Đã chốt**                        |
| Token desktop mở rộng bề mặt tấn công                                                                         | Scope hẹp, có hạn, thu hồi được, chỉ lưu hash, rate limit; rà `docs/audit.md`                                                                                          | Giảm thiểu (PR2)                   |
| Plugin làm hỏng bản vẽ thật                                                                                   | Chỉ-kiểm là mặc định; 1 nhóm UNDO; giữ bản gốc; pilot hẹp                                                                                                              | Giảm thiểu                         |
| **Bóc sai vì đơn vị bản vẽ ≠ mm**                                                                             | Đọc `INSUNITS` + quy đổi tự động + cảnh báo cố định trong báo cáo/Excel (§6.7, AC13)                                                                                   | Giảm thiểu                         |
| **Bóc trùng / bỏ sót khi chạy nhiều lần**                                                                     | XData đánh dấu sống trong DWG (FR14/FR16), mặc định bỏ qua đã bóc, có lệnh gỡ + báo số bị bỏ qua                                                                       | Giảm thiểu                         |
| **Khối lượng đo được ≠ khối lượng thật thi công** (ống vẽ tim tuyến vs chiều dài lắp thật, chưa trừ phụ kiện) | Ghi rõ trong Excel cột I "đo theo tim tuyến trên bản vẽ"; hệ số hao hụt/phụ kiện là việc của QS trên cột F/định mức — plugin không tự cộng                             | Chấp nhận có chủ đích              |
| `boqCode` tùy dự án, rule pack là toàn cục                                                                    | v2 để trống `boqCode` mặc định, QS gán trong Excel; khi cần cố định theo dự án → phát hành rule pack version mới có mã                                                 | Chấp nhận, xem lại sau UAT         |
| Chi phí duy trì stack C#                                                                                      | Chấp nhận có chủ đích (ADR-0006)                                                                                                                                       | Đã chấp nhận                       |
| License thư viện Excel                                                                                        | ClosedXML = MIT (kèm phụ thuộc DocumentFormat.OpenXml của Microsoft, MIT) — dùng thương mại tự do                                                                      | Đã chốt                            |

## 19. Approval

- [x] Product/scope — người dùng duyệt 2026-08-23 + yêu cầu mở rộng BOCKL/Excel 2026-08-24
- [ ] UX/a11y (hộp thoại plugin — xem ở UAT)
- [x] Architecture/API/data — ADR-0006 + §9.1 đã chốt; rule pack v2 mở rộng thuần
- [ ] Security/RBAC/SoD/audit — phần PR2 còn chờ
- [ ] Test/telemetry/rollout/rollback — phần tích hợp chờ runner
- [ ] Không còn blocking question cho PR7b (xác minh runtime **đã xong 2026-08-25**; còn: chạy kiểm tích hợp `accoreconsole` trên máy có license)

**Kết luận:** Approved for implementation — phạm vi PR-A thi hành ngay; PR2/PR5/PR6/PR7 giữ trình tự chờ điều kiện ngoài.
**Người/ngày duyệt:** Seeker — 2026-08-23 (3 PR đầu), 2026-08-24 (mở rộng BOCKL + Excel, "ưu tiên chất lượng cao nhất")
