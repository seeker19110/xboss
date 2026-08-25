# M100 — Đặc tả: `XBOSS_VE_*` — vẽ shop drawing chuẩn hóa sẵn đè lên thiết kế (plugin AutoCAD, tầng 2)

| Thuộc tính       | Giá trị                                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Bộ lệnh vẽ trong AutoCAD: kỹ sư vẽ shop drawing MEPF **đè lên bản thiết kế đã chuẩn hóa** — mọi nét/block sinh ra **đã đúng chuẩn ngay từ đầu** (layer, block, style theo rule pack), khép kín vòng chuẩn hóa → vẽ → bóc khối lượng |
| Spec owner       | (chờ gán)                                                                                                                                                                                             |
| State            | **Draft — chờ duyệt** (theo luật "Không code khi chưa Approved for implementation")                                                                                                                    |
| Người/ngày duyệt | (chờ)                                                                                                                                                                                                 |
| Cập nhật         | 2026-08-25 — bản đầu + bổ sung cùng ngày: trang in/mặt cắt (giữa chừng) + 5 tính năng rà sót (giá đỡ, lỗ chờ, tag, bảng thống kê, độ dốc) + mục "Phiên bản sau" §20 |
| Quyết định nền   | `docs/adr/0006-plugin-autocad-va-pipeline-server.md` + M99 §9.1 (AutoCAD 2026, 1 bản build) — **kế thừa nguyên vẹn, không mở lại**                                                                    |
| Phụ thuộc        | M99 PR-A/PR-B/PR2/PR5/PR6 (đã merge) — plugin, rule pack v3, `XBOSS_LOGIN`, upload, bảng điều khiển web                                                                                              |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

M99 đã đóng nửa sau của quy trình: nhận bản vẽ bẩn → `XBOSS_CHUANHOA` → `XBOSS_BOCKL` → Excel. Nhưng bước ở giữa — **kỹ sư vẽ shop drawing** — vẫn thủ công hoàn toàn: tự nhớ layer chuẩn, tự tìm block, tự đặt style. Hệ quả thật (chính là lý do M99 phải tồn tại): bản vẽ shop tự vẽ cũng lệch chuẩn như bản nhận từ TVTK, phải chuẩn hóa lại chính sản phẩm của mình, và `XBOSS_BOCKL` bóc thiếu/sai khi nét rơi nhầm layer.

M100 đảo chiều: thay vì *sửa sai sau khi vẽ*, plugin làm **công cụ vẽ** — kỹ sư chọn hệ (HVAC/PIPING/FIREFIGHTING/ELECTRICAL/ELV), mọi tuyến ống/máng và phụ kiện/thiết bị chèn ra **tự rơi vào đúng layer, đúng block chuẩn, mang sẵn size trong XData** — `XBOSS_KIEMTRA` pass ngay, `XBOSS_BOCKL` bóc chính xác tuyệt đối vì chính plugin kiểm soát dữ liệu sinh ra.

Vai trò: kỹ sư MEPF (AutoCAD 2026 full, plugin M99 đã cài). Người vẫn là người thiết kế tuyến — plugin **không tự nghĩ ra thiết kế** (xem non-goals).

## 2. Outcome, metric và guardrail

- **O1** Bản vẽ shop vẽ bằng `XBOSS_VE_*` chạy `XBOSS_KIEMTRA` ra **0 lỗi** thuộc các nhóm layer sai chuẩn / lệch Z / lineweight lệch CTB (các nhóm plugin kiểm soát được khi vẽ).
- **O2** `XBOSS_BOCKL` trên bản vẽ shop vẽ bằng `XBOSS_VE_*` **không sót, không bóc nhầm hệ**: 100% tuyến tim khớp đúng item takeoff của hệ đã chọn.
- **O3** Tốc độ: vẽ 1 tuyến + chèn phụ kiện nhanh **không chậm hơn** vẽ tay bằng PLINE + INSERT (mục tiêu là *đúng chuẩn miễn phí*, không phải thêm bước).
- **O4** Thư viện block dùng thống nhất toàn công ty, có version — 2 kỹ sư khác máy chèn cùng 1 block ra cùng 1 định nghĩa.
- **Guardrail:** mỗi lệnh vẽ = 1 nhóm UNDO (như M99 FR7); lệnh vẽ **không đụng** đối tượng của bản thiết kế nền; không có rule pack + thư viện block thì lệnh vẽ từ chối chạy (như `XBOSS_RULEPACK` hiện tại).
- **Stop:** phát hiện lệnh vẽ sửa/xóa nhầm đối tượng nền → thu hồi bản phát hành ngay.

## 3. Nghiên cứu hiện trạng

| Thành phần                                             | Vai trò trong M100                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `lib/ky-thuat/cad/rule-packs/v3.json`                  | Nền — **mở rộng v4**: thêm `drawTools` (§11). `layerMap.groups[].branches[].target` là nguồn tên layer đích duy nhất, không khai trùng |
| `lib/ky-thuat/cad/rule-pack.ts` + `GET /api/engineering/cad/rule-pack` | Giữ nguyên cơ chế version/ETag — v4 đi cùng đường                                                                |
| `XBoss.Cad.Core` (`Matching/TokenMatcher`, `Takeoff/`) | Tái dùng: item takeoff + matcher là nguồn khớp hệ↔layer↔block; **thêm `Draw/`** cho hình học thuần (offset nét đôi, xoay phụ kiện) |
| `XBoss.Cad.Acad` (`Commands/`, `Services/`)            | Thêm nhóm lệnh `XBOSS_VE_*` + service quản lý thư viện block (tải, cache, chèn định nghĩa vào DWG)                              |
| `XBOSS_LOGIN` / token scope `cad` (M99 PR2)            | Tái dùng nguyên vẹn cho việc tải thư viện block                                                                                  |
| Bảng điều khiển `/engineering/chuan-hoa-ban-ve` (M99 PR6) | Thêm mục "Thư viện block": phát hành/xem version, tải xuống                                                                   |
| `takeoff.items[]` (rule pack)                          | `blockNameMatchAny` của item count (FCU/AHU/SPK…) phải khớp tên block trong thư viện — **một nguồn tên duy nhất** (§12 rủi ro trôi) |

## 4. Phương án

| Điểm                       | Phương án                                                                    | Kết luận                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thư viện block đóng gói    | Nhúng trong `.bundle` plugin vs **tệp `.dwg` + manifest tải từ server**      | **Tải từ server** — cùng nguyên tắc rule pack (ADR-0006 nguyên tắc 1): thêm/sửa block = phát hành version mới, không build lại plugin. Manifest JSON (tên block ↔ hệ ↔ item takeoff ↔ tham số chèn) nằm trong repo append-only; tệp `.dwg` nhị phân lưu qua `lib/nen/storage.ts` (không vào git — như gói plugin M99) |
| Cách chèn block            | `INSERT` từ tệp ngoài mỗi lần vs **nhập định nghĩa vào BlockTable của DWG 1 lần** | **Nhập 1 lần** (`Database.Insert`/`WblockCloneObjects` từ tệp thư viện đã cache) — bản vẽ tự chứa định nghĩa, mở trên máy chưa cài plugin vẫn hiển thị đúng; chèn lần sau tái dùng định nghĩa sẵn có (so tên + so hash để phát hiện lệch version)                     |
| Biểu diễn tuyến            | 1 nét tim vs 2 nét biên vs **tim + biên tách layer**                          | **Tim là nguồn sự thật**: polyline tim trên layer đo của hệ (đúng layer `takeoff.layerMatchAny` — BOCKL đo tim tuyến, nhất quán M99 §6.5). Ống gió/máng cáp cần thể hiện bề rộng → plugin sinh thêm nét biên trên **layer phụ `<layer>-EDGE`** (mới, KHÔNG nằm trong `layerMatchAny` nào) — không bao giờ bóc trùng |
| Liên kết tim ↔ biên        | Group AutoCAD vs block ẩn danh vs **XData 2 chiều**                           | **XData**: nét biên mang handle của tim, tim mang danh sách handle biên — xóa/sửa tim thì lệnh `XBOSS_VE_DOI` dựng lại biên; không dùng block ẩn danh (M99 đang kiểm "block nặc danh" là lỗi)                                                                          |
| Size tuyến                 | Text tự do vs **danh mục size trong rule pack**                               | **Danh mục** `drawTools.systems[].sizes[]` — chọn từ danh sách, ghi vào XData tim (`XBOSS_VE` appname) + nhãn. Size ngoài danh mục: cho nhập tay kèm cờ `custom` trong XData + cảnh báo trong báo cáo                                                                 |
| Nền thiết kế               | Xref vs copy vào bản vẽ                                                       | **Không ép** — kỹ sư đang có sẵn quy trình (đa số copy/xref tùy dự án). Lệnh `XBOSS_VE_NEN` chỉ *hỗ trợ*: khóa + làm mờ (fade) các layer không thuộc hệ đang vẽ, đổi màu screening. Hoàn tác được                                                                     |

## 5. Scope / non-goals

**Trong phạm vi:** rule pack v4 (`drawTools` + `sheetSetup`); thư viện block chuẩn có version (manifest + tệp `.dwg`, phát hành trên web, tải qua API có token); bộ lệnh vẽ: chuẩn bị nền, vẽ tuyến (tim ± nét biên), chèn phụ kiện tự xoay theo tuyến, chèn thiết bị có attribute, ghi nhãn size, đổi hệ/size đoạn đã vẽ; **trang in** (layout + viewport đúng tỉ lệ + khung tên chuẩn công ty, `XBOSS_VE_TRANGIN`); **mặt cắt bán tự động** (`XBOSS_VE_MATCAT` — dựng khung mặt cắt từ dữ liệu size trong XData trên tuyến cắt do kỹ sư kẻ); **giá đỡ tự động dọc tuyến** (`XBOSS_VE_GIADO`); **sleeve/lỗ chờ + bảng builder's work** (`XBOSS_VE_LOCHO`); **đánh tag tuần tự + kiểm trùng** (`XBOSS_VE_TAG`); **bảng thống kê trong bản vẽ** (`XBOSS_VE_THONGKE`); **độ dốc ống thoát** (tham số slope trong `XBOSS_VE`/`VE_NHAN`); mục "Thư viện block" trên bảng điều khiển web.

**Non-goals:** **tự động thiết kế tuyến** (auto-routing, tránh va chạm, chọn size theo tính toán thủy lực/gió — người quyết, plugin chỉ đảm bảo *vẽ gì cũng chuẩn*); 3D/BIM; **mặt cắt tự động hoàn toàn** (bản vẽ 2D không chứa cao độ lắp đặt thật — plugin dựng *khung* mặt cắt đúng size/khoảng cách ngang từ XData, cao độ và chi tiết treo đỡ kỹ sư hoàn thiện; tự động 100% cần 3D/BIM — trần công nghệ); vẽ trên server (license Autodesk — ADR-0006); sửa đổi bản thiết kế nền (chỉ khóa/mờ, không đổi nội dung); tính lại khối lượng ngay khi vẽ (vẫn qua `XBOSS_BOCKL` — một đường bóc duy nhất); hỗ trợ AutoCAD ≠ 2026 (M99 §9.1).

## 6. User journeys và mọi trạng thái

### 6.1 Journey chính — vẽ shop drawing 1 hệ

1. Mở bản thiết kế **đã qua `XBOSS_CHUANHOA`** (khuyến nghị, không bắt buộc — §6.6).
2. `XBOSS_VE_NEN` → chọn hệ sẽ vẽ → plugin khóa (lock) mọi layer hiện có + làm mờ (transparency theo `drawTools.baseFadePct`); tạo sẵn các layer đích của hệ (từ `layerMap` + `-EDGE`) nếu chưa có, đúng màu/lineweight theo `lineweightMap`.
3. `XBOSS_VE` → chọn loại tuyến của hệ (vd HVAC: ống gió cấp/hồi/thải, ống CHW) → chọn size từ danh mục → vẽ polyline tim như PLINE thường (mọi option PLINE giữ nguyên) → kết thúc: tim nằm đúng layer, XData `[systemId, itemId, size, rulePackVersion]`; loại tuyến có `edgeStyle` (ống gió, máng cáp) → plugin sinh 2 nét biên offset ±width/2 trên layer `-EDGE`, liên kết XData 2 chiều.
4. `XBOSS_VE_PHUKIEN` → chọn phụ kiện (co, tê, giảm, van, miệng gió, đầu phun…) → bấm điểm trên tuyến tim → block chèn đúng layer của hệ, **tự xoay theo hướng tuyến tại điểm chèn**, scale theo size của tim (nếu manifest khai `scaleBySize`).
5. `XBOSS_VE_THIETBI` → chọn thiết bị (FCU/AHU/quạt/bơm…) → chèn block có attribute (`TAG`, `MODEL`, `SIZE`) — nhập tag ngay lúc chèn.
6. `XBOSS_VE_NHAN` → bấm đoạn tim → plugin ghi nhãn size (MTEXT/leader theo `drawTools.labelStyle`) trên layer annotation (`G-ANNO-TEXT`), nội dung lấy từ XData — không gõ tay, không lệch nhau.
7. Xong hệ → `XBOSS_VE_NEN` lần nữa để mở khóa/bỏ mờ. `XBOSS_KIEMTRA` → `XBOSS_BOCKL` → `XBOSS_BOCKL_XUAT` như M99.

### 6.2 `XBOSS_VE_DOI` — đổi hệ/size đoạn đã vẽ

Chọn các đoạn tim → chọn hệ/loại/size mới → plugin đổi layer, cập nhật XData, **xóa và dựng lại nét biên** theo width mới, cập nhật nhãn liên kết. Đoạn đã bóc (`XBOSS_BOCKL` XData) → cảnh báo "đã bóc khối lượng, đổi xong phải bóc lại" + gỡ đánh dấu bóc của đúng các đoạn đó (tái dùng logic `XBOSS_BOCKL_XOA` theo vùng chọn).

### 6.3 `XBOSS_VE_TRANGIN` — trang in chuẩn công ty

1. Chọn khổ giấy + tỉ lệ (danh mục trong `sheetSetup.paperSizes`/`scales`) → chọn vùng mặt bằng cần in (2 điểm hoặc polyline ranh giới).
2. Plugin tạo **layout mới**: page setup đúng khổ/máy in PDF (`sheetSetup.plotter`, mặc định `DWG To PDF.pc3`) + CTB theo `lineweightMap`; viewport đúng tỉ lệ chọn, khóa tỉ lệ (locked) để không zoom lệch; chèn **block khung tên** từ thư viện (kind `titleblock`) và điền attribute (tên dự án/hạng mục/tỉ lệ/ngày/người vẽ — dự án lấy từ cấu hình cache lúc `XBOSS_LOGIN`, còn lại nhập lúc chạy, nhớ giá trị lần trước).
3. Nhiều vùng → lặp lại, layout đặt tên tuần tự theo `sheetSetup.layoutNamePattern` (vd `SHOP-{hệ}-{stt}`). 1 UNDO xóa cả layout vừa tạo.
4. Freeze-theo-viewport các layer không thuộc hệ đang in (VP freeze — không đổi trạng thái layer toàn cục).

### 6.4 `XBOSS_VE_MATCAT` — mặt cắt bán tự động

1. Kỹ sư kẻ **tuyến cắt** (2 điểm) ngang qua các tuyến tim đã vẽ bằng `XBOSS_VE` → chọn điểm đặt hình cắt.
2. Plugin tìm mọi giao điểm tuyến cắt × tim (trong phạm vi hệ đã vẽ), đọc XData `[itemId, size]` từng tuyến → dựng hình cắt tại điểm đặt: mỗi tuyến 1 ký hiệu mặt cắt đúng loại (ống gió = chữ nhật đúng WxH, ống tròn = tròn đúng DN, máng cáp = chữ nhật W×H có nét máng) **đúng khoảng cách ngang giữa các tuyến theo tỉ lệ thật**, kèm nhãn size từng ký hiệu + ký hiệu tên mặt cắt (A-A, B-B… tự đánh số) đặt hai đầu tuyến cắt.
3. **Cao độ đặt theo giá trị nhập tay từng tuyến** (prompt lần lượt, mặc định danh mục `sheetSetup.defaultElevations` hoặc giá trị lần trước) — bản vẽ 2D không chứa cao độ thật, plugin không bịa (ranh giới §5). Đối tượng sinh ra nằm layer của hệ tương ứng + nhãn trên layer annotation; cả hình cắt là 1 nhóm UNDO.
4. Tuyến nguồn đổi (VE_DOI/xóa) **không** tự cập nhật hình cắt — hình cắt là snapshot, XData ghi `[tuyến-cắt-handle, ngày]` để `XBOSS_KIEMTRA` cảnh báo "mặt cắt cũ hơn tuyến" (so thời điểm sửa).

### 6.7 `XBOSS_VE_GIADO` — giá đỡ/treo đỡ tự động dọc tuyến

Chọn các đoạn tim (hoặc cả hệ) → plugin đặt block giá đỡ (manifest kind `support`, chọn theo loại tuyến) **cách đều theo khoảng cách chuẩn** `drawTools.systems[].lines[].supportSpacingMm` (theo size — vd ống gió 2400, CHW DN50 2000), tự xoay vuông góc tuyến, đúng layer hệ; điểm đầu/cuối và tại phụ kiện nặng (van, thiết bị) luôn có giá đỡ. Chạy lại trên tuyến đã có → chỉ bổ sung đoạn thiếu (XData liên kết tim↔giá đỡ, không đặt trùng). Giá đỡ là block đếm được → khai item takeoff `measure: count` tương ứng — **`XBOSS_BOCKL` đếm được số giá đỡ** (hạng mục đang ước tay). Kỹ sư dời/xóa từng cái tự do sau khi đặt.

### 6.8 `XBOSS_VE_LOCHO` — sleeve/lỗ chờ xuyên tường-sàn-dầm + bảng builder's work

Bấm điểm tuyến xuyên kết cấu (hoặc để plugin dò giao tim × đối tượng trên layer kết cấu `S-GRID-COLS` rồi xác nhận từng điểm) → chèn block sleeve (kind `sleeve`) đúng tâm tuyến, size = size ống + khe hở `sleeveClearanceMm` (rule pack, theo loại tuyến), XData `[tuyến, size ống, size sleeve, loại kết cấu]`. `XBOSS_VE_LOCHO` chế độ xuất: **bảng lỗ chờ** (builder's work) — Table trong bản vẽ + tệp Excel đơn giản (STT, vị trí theo trục gần nhất, cao độ nhập tay, size, hệ) gửi bên kết cấu/xây dựng. Sleeve cũng đếm được qua takeoff.

### 6.9 `XBOSS_VE_TAG`, `XBOSS_VE_THONGKE` và độ dốc

- **`XBOSS_VE_TAG`:** đánh/đánh lại tag tuần tự cho thiết bị đã chèn theo pattern `drawTools.tagPattern` (vd `{loại}-{tầng}-{stt}` → `FCU-05-01`); tầng nhập 1 lần/bản vẽ (nhớ lại); quét attribute `TAG` toàn bản vẽ báo **trùng/nhảy số** (phép kiểm này cũng vào `XBOSS_KIEMTRA` khi M101 duyệt). Đánh lại giữ tag đã khóa (kỹ sư đánh dấu giữ qua option).
- **`XBOSS_VE_THONGKE`:** sinh Table AutoCAD trong bản vẽ từ dữ liệu thật: bảng thiết bị (tag/model/size — từ attribute) hoặc bảng khối lượng theo hệ (từ trạng thái bóc XData `XBOSS_BOCKL`); style bảng theo `drawTools.tableStyle`; chạy lại → cập nhật bảng cũ tại chỗ (XData đánh dấu bảng do plugin sinh), không sinh bảng đôi.
- **Độ dốc:** tuyến hệ thoát (`edgeStyle` nào khai `slopeRequired: true` — mặc định `pipe-sanr`) khi vẽ bằng `XBOSS_VE` hỏi thêm slope (danh mục `slopes`: 1%, 2%…); ghi XData + `XBOSS_VE_NHAN` in nhãn `i=1%` kèm mũi tên hướng dốc (block `slope-arrow` trong thư viện) đặt dọc tuyến.

### 6.10 Trạng thái thư viện block

| Trạng thái                                        | Hành vi                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Chưa có thư viện (chưa LOGIN, chưa nạp tay)       | `XBOSS_VE_PHUKIEN`/`XBOSS_VE_THIETBI` từ chối chạy, báo tiếng Việt chỉ cách lấy; `XBOSS_VE` (tuyến) vẫn chạy được — chỉ cần rule pack |
| Có cache, server có version mới hơn (so ETag)     | Tự tải bản mới khi `XBOSS_LOGIN`/khởi động có mạng; đang vẽ giữa chừng KHÔNG tự đổi version (đổi khi mở bản vẽ mới)                  |
| Offline                                           | Dùng cache `%APPDATA%\XBoss\block-lib\` (tệp `.dwg` + manifest); lệnh `XBOSS_VE_THUVIEN` nạp tệp tay (đường dự phòng như `XBOSS_RULEPACK`) |
| Bản vẽ chứa block trùng tên nhưng khác định nghĩa (hash lệch) | KHÔNG ghi đè âm thầm: hỏi kỹ sư — giữ định nghĩa trong bản vẽ / cập nhật theo thư viện (redefine, có UNDO); ghi lựa chọn vào báo cáo |
| Manifest khai block không tồn tại trong tệp `.dwg` | Server chặn ngay lúc phát hành (kiểm bằng parser DXF tầng 3 trên bản DXF sidecar của thư viện — §10); client coi là thư viện hỏng, từ chối dùng |

### 6.11 Trạng thái vẽ

- Vẽ khi hệ chưa chọn → lệnh tự hỏi hệ trước (không có trạng thái ngầm bắt buộc).
- ESC giữa chừng → transaction abort, không để lại đối tượng mồ côi (tim không biên, biên không tim).
- Bản vẽ có `INSUNITS` ≠ mm → cảnh báo 1 lần như M99 §6.7; width/scale block quy đổi theo cùng chính sách.
- Snap/OSNAP của người dùng giữ nguyên — plugin không đổi cấu hình vẽ toàn cục.

## 7. Functional / non-functional requirements

- **FR1** Rule pack v4 thêm `drawTools` (§11); v4 là **mở rộng thuần** từ v3 — mọi lệnh M99 chạy với v4 không đổi hành vi; `XBOSS_VE_*` yêu cầu tối thiểu v4.
- **FR2** Thư viện block có version, phát hành trên web (Admin/PM), tải qua `GET /api/engineering/cad/block-lib` (token scope `cad`, ETag), cache cục bộ, nạp tay được. Tính toàn vẹn: manifest ghi `sha256` của tệp `.dwg`, client kiểm trước khi dùng.
- **FR3** `XBOSS_VE` vẽ tuyến tim đúng layer đích của hệ (tên layer lấy từ `layerMap` — không khai trùng trong `drawTools`), XData `[systemId, itemId, size, rulePackVersion, custom?]`.
- **FR4** Loại tuyến có `edgeStyle` sinh nét biên offset trên layer `<layer>-EDGE`; layer `-EDGE` **không được khớp** bất kỳ `takeoff.layerMatchAny` nào (kiểm tự động khi phát hành rule pack — §10).
- **FR5** `XBOSS_VE_PHUKIEN` chèn block từ thư viện: đúng layer hệ, xoay theo tiếp tuyến tuyến tim tại điểm chèn, scale theo manifest; định nghĩa block nhập vào DWG 1 lần, tái dùng.
- **FR6** `XBOSS_VE_THIETBI` chèn block thiết bị có attribute (`TAG` bắt buộc, `MODEL`/`SIZE` tùy chọn); tên block khớp `takeoff.blockNameMatchAny` của item tương ứng để `XBOSS_BOCKL` đếm được (đối chiếu tự động — §15).
- **FR7** `XBOSS_VE_NHAN` ghi nhãn từ XData (không gõ tay), style theo `drawTools.labelStyle`, layer annotation.
- **FR8** `XBOSS_VE_DOI` đổi hệ/size: đổi layer + XData + dựng lại biên + cập nhật nhãn; đoạn đã bóc → gỡ đánh dấu bóc đúng phạm vi + cảnh báo.
- **FR9a** `XBOSS_VE_TRANGIN`: tạo layout + page setup (khổ giấy/plotter/CTB theo `sheetSetup` + `lineweightMap`) + viewport đúng tỉ lệ và KHÓA tỉ lệ + khung tên từ thư viện (kind `titleblock`, attribute điền tự động/nhập) + VP-freeze layer ngoài hệ; đặt tên layout theo pattern; 1 UNDO xóa trọn layout.
- **FR9b** `XBOSS_VE_MATCAT`: dựng hình cắt từ giao tuyến-cắt × tim, ký hiệu đúng loại/size từ XData, đúng khoảng cách ngang; cao độ nhập tay (không bịa); tự đánh tên A-A/B-B; snapshot có XData để cảnh báo lệch khi tuyến nguồn đổi.
- **FR9c** `XBOSS_VE_GIADO`: đặt block giá đỡ cách đều theo `supportSpacingMm` (theo size), vuông góc tuyến, luôn có tại đầu/cuối/phụ kiện nặng; XData tim↔giá đỡ chống đặt trùng; block khai được vào takeoff `count`.
- **FR9d** `XBOSS_VE_LOCHO`: chèn sleeve size = ống + `sleeveClearanceMm`, XData đủ để xuất **bảng lỗ chờ** (Table trong bản vẽ + Excel: STT/vị trí theo trục/cao độ nhập tay/size/hệ).
- **FR9e** `XBOSS_VE_TAG`: đánh tag tuần tự theo `tagPattern`, phát hiện trùng/nhảy số, giữ tag đã khóa.
- **FR9f** `XBOSS_VE_THONGKE`: Table thiết bị/khối lượng từ attribute + XData bóc; chạy lại cập nhật tại chỗ, không sinh bảng đôi.
- **FR9g** Tuyến `slopeRequired` nhận slope từ danh mục, XData + nhãn `i=…%` kèm mũi tên hướng dốc.
- **FR9** `XBOSS_VE_NEN` khóa + làm mờ layer nền, tạo layer đích còn thiếu đúng màu/lineweight `lineweightMap`; chạy lại để hoàn nguyên; **không sửa/xóa đối tượng nền**.
- **FR10** Mỗi lệnh = 1 transaction = 1 nhóm UNDO (kể cả bộ tim + biên + nhãn sinh trong 1 lần vẽ); ESC = abort sạch.
- **FR11** Toàn bộ hình học thuần (offset biên, góc xoay theo tiếp tuyến, scale theo size, validate manifest, đối chiếu tên block ↔ takeoff) nằm trong `XBoss.Cad.Core/Draw/` — **không tham chiếu assembly AutoCAD**, test CI Linux (kế thừa M99 FR17).
- **NFR1** Không gửi bản vẽ ra ngoài hạ tầng tự host. **NFR2** Toàn bộ UI/thông báo tiếng Việt. **NFR3** Lệnh vẽ phản hồi tức thời (thao tác vẽ là tương tác chính — không hộp thoại chắn giữa các lần bấm điểm). **NFR4** Token/cache như M99 (Credential Manager, `%APPDATA%\XBoss\`).

## 8. Acceptance criteria

- **AC1** _Given_ hệ HVAC + size 300x200, _when_ `XBOSS_VE` vẽ 1 tuyến, _then_ tim nằm layer `M-DUCT-SUPP` + 2 nét biên cách tim 150 mỗi bên trên `M-DUCT-SUPP-EDGE`, và **1 UNDO** xóa cả bộ.
- **AC2** _Given_ bản vẽ shop vẽ hoàn toàn bằng `XBOSS_VE_*`, _when_ `XBOSS_KIEMTRA`, _then_ 0 lỗi nhóm layer/Z/lineweight.
- **AC3** _Given_ tuyến tim 10m hệ CHW vẽ bằng `XBOSS_VE`, _when_ `XBOSS_BOCKL`, _then_ item `chw-pipe` ra đúng 10.00 m; nét biên **không** đóng góp khối lượng.
- **AC4** _Given_ block `FCU` chèn bằng `XBOSS_VE_THIETBI`, _when_ `XBOSS_BOCKL`, _then_ item `fcu-unit` đếm đúng số block đã chèn.
- **AC5** _Given_ phụ kiện chèn trên đoạn tim xiên góc α, _then_ block xoay đúng α (sai số ≤0.1°).
- **AC6** _Given_ `XBOSS_VE_DOI` đổi size 300x200 → 400x250 trên đoạn đã bóc, _then_ biên dựng lại đúng width mới, nhãn cập nhật, đánh dấu bóc của đúng đoạn đó bị gỡ kèm cảnh báo.
- **AC7** _Given_ bản vẽ có block `FCU` khác định nghĩa thư viện, _when_ chèn `FCU` mới, _then_ plugin hỏi (không ghi đè âm thầm) và làm đúng lựa chọn.
- **AC8** _Given_ thư viện version mới phát hành trên web, _when_ máy kỹ sư `XBOSS_LOGIN`, _then_ tự tải bản mới (ETag) và manifest hash khớp tệp.
- **AC10** _Given_ `XBOSS_VE_TRANGIN` khổ A1 tỉ lệ 1:50, _then_ layout có viewport khóa đúng 1:50 (đo 1000mm model = 20mm giấy), khung tên đủ attribute, và in PDF ra nét đúng CTB.
- **AC11** _Given_ tuyến cắt qua 3 tuyến (ống gió 300x200, CHW DN50, máng 200x100), _when_ `XBOSS_VE_MATCAT`, _then_ hình cắt có đúng 3 ký hiệu đúng loại/kích thước, khoảng cách ngang khớp khoảng cách thật giữa các tim, nhãn size đúng XData.
- **AC12** _Given_ tuyến ống gió 10m size 300x200 (`supportSpacingMm`=2400), _when_ `XBOSS_VE_GIADO`, _then_ đặt đúng 5 giá đỡ (2 đầu + chia đều ≤2400), chạy lại không thêm cái nào, và `XBOSS_BOCKL` đếm ra 5.
- **AC13** _Given_ 3 điểm xuyên tường đã chèn sleeve, _when_ xuất bảng lỗ chờ, _then_ Table + Excel có đúng 3 dòng, size sleeve = size ống + khe hở rule pack.
- **AC14** _Given_ 2 FCU trùng tag, _when_ `XBOSS_VE_TAG` quét, _then_ báo đúng 2 đối tượng; đánh lại tuần tự thì hết trùng và tag khóa giữ nguyên.
- **AC9** _Given_ rule pack v4 nạp vào plugin M99 hiện tại (chưa có M100), _then_ mọi lệnh M99 chạy bình thường (mở rộng thuần).

## 9. Kiến trúc và điểm chạm code

Kế thừa toàn bộ M99 §9 (Core thuần / Adapter Windows / rule pack một nguồn / .NET theo §9.1 — Adapter `net10.0-windows`, kiểm lại sau mỗi bản cập nhật AutoCAD).

```
XBoss.Cad.Core/
  Draw/                    ← MỚI, thuần
    DrawToolsConfig.cs       (đọc drawTools từ rule pack, validate: layer khớp layerMap, -EDGE không đụng takeoff)
    EdgeOffset.cs            (tính 2 polyline biên từ polyline tim + width — hình học thuần)
    FittingPlacement.cs      (góc xoay theo tiếp tuyến, scale theo size)
    BlockManifest.cs         (parse + validate manifest thư viện, sha256)
    TakeoffCrossCheck.cs     (đối chiếu tên block manifest ↔ blockNameMatchAny — cảnh báo trôi)
    SectionBuilder.cs        (giao tuyến cắt × tim, dựng toạ độ ký hiệu mặt cắt theo size — thuần)
    SheetSetupConfig.cs      (validate sheetSetup: khổ giấy/tỉ lệ/pattern, titleblockId có trong manifest)
XBoss.Cad.Acad/
  Commands/VeCommands.cs   ← MỚI (XBOSS_VE, _PHUKIEN, _THIETBI, _NHAN, _DOI, _NEN, _THUVIEN, _TRANGIN, _MATCAT)
  Services/BlockLibraryService.cs ← MỚI (tải/cache/nhập định nghĩa, so hash)
lib/ky-thuat/cad/
  rule-packs/v4.json       ← MỚI (append-only)
  block-lib.ts             ← MỚI (đọc manifest hiện hành, phục vụ API; kiểm phát hành)
app/api/engineering/cad/block-lib/route.ts ← MỚI (GET tải, POST phát hành — Admin/PM)
app/engineering/chuan-hoa-ban-ve/…         ← thêm mục "Thư viện block" vào bảng điều khiển
migrations/0NNN_block_library.sql          ← MỚI (bảng `cad_block_libs`: version, manifest JSONB, storage key, sha256, người/ngày phát hành) — LẤY SỐ THẬT bằng `ls migrations | sort -V | tail -3` lúc code
```

## 10. API contract

| Endpoint                              | Method | Auth                          | Hành vi                                                                                                                                                        |
| ------------------------------------- | ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/engineering/cad/block-lib`      | GET    | token scope `cad` hoặc session | Trả tệp `.dwg` version hiện hành + header `X-Manifest` (hoặc `?manifest=1` trả JSON manifest); ETag theo version — 304 khi cache còn mới                       |
| `/api/engineering/cad/block-lib`      | POST   | session Admin/PM + CSRF        | Phát hành version mới: nhận `.dwg` + manifest JSON; server kiểm — manifest hash khớp tệp, mọi block khai có thật (đối chiếu qua DXF sidecar do người phát hành nộp kèm, parser tầng 3 hiện có), tên block khớp `takeoff.blockNameMatchAny` (cảnh báo nếu lệch); đạt → lưu qua `storagePut` + dòng `cad_block_libs`; sai → 422 kèm danh sách lỗi |
| `/api/engineering/cad/rule-pack`      | GET    | (đã có — M99)                  | Không đổi; v4 phát hành cùng cơ chế                                                                                                                             |

Route handler chỉ là ranh giới HTTP (ADR-0008) — kiểm định nằm trong `lib/ky-thuat/cad/block-lib.ts`.

## 11. Data contract và DDL

**Rule pack v4 — mở rộng thuần từ v3, thêm khối `drawTools`:**

```jsonc
"drawTools": {
  "baseFadePct": 70,                    // độ mờ layer nền khi XBOSS_VE_NEN
  "edgeLayerSuffix": "-EDGE",           // hậu tố layer nét biên — cấm khớp mọi takeoff.layerMatchAny
  "labelStyle": { "textHeightMm": 2.5, "layer": "G-ANNO-TEXT" },
  "systems": [
    {
      "id": "HVAC",                     // khớp layerMap.groups[].id
      "name": "Điều hòa thông gió",
      "lines": [
        { "itemId": "duct-supp", "name": "Ống gió cấp",  "layer": "M-DUCT-SUPP", // khớp branch target — validator bắt lệch
          "edgeStyle": "double", "sizes": ["200x150","300x200","400x250","500x300","..."], "sizeKind": "WxH" },
        { "itemId": "chw-pipe",  "name": "Ống CHW", "layer": "M-CHW-PIPE",
          "edgeStyle": "none", "sizes": ["DN25","DN32","DN40","DN50","DN65","DN80","DN100","..."], "sizeKind": "DN" }
      ],
      "fittings":  ["elbow-duct", "tee-duct", "reducer-duct", "damper-vcd", "grille-supp", "..."],  // id trong manifest thư viện
      "equipment": ["fcu-unit", "ahu-unit"]                                                          // id item takeoff measure=count
    }
    // PIPING / FIREFIGHTING / ELECTRICAL / ELV cùng khung
  ]
},
"sheetSetup": {                          // phục vụ XBOSS_VE_TRANGIN / XBOSS_VE_MATCAT
  "plotter": "DWG To PDF.pc3",
  "paperSizes": ["A1", "A2", "A3"],
  "scales": [20, 25, 50, 100],
  "layoutNamePattern": "SHOP-{system}-{seq}",
  "titleblockId": "titleblock-a1",       // id block kind=titleblock trong manifest thư viện (mỗi khổ 1 block)
  "defaultElevations": [2700, 3000, 3300],
  "sectionNamePattern": "{alpha}-{alpha}", // A-A, B-B…
  "tagPattern": "{type}-{floor}-{seq}",
  "tableStyle": { "textHeightMm": 2.5 },
  "slopes": ["1%", "2%", "3%"]
}
// Mỗi lines[] nhận thêm (tùy chọn): supportSpacingMm theo size {"DN50": 2000, …} | số chung,
// sleeveClearanceMm, slopeRequired; manifest thư viện thêm kind "support" | "sleeve" và block "slope-arrow"
```

**Manifest thư viện block (phát hành kèm tệp `.dwg`):**

```jsonc
{
  "version": "b1",
  "dwgSha256": "…",
  "blocks": [
    { "id": "elbow-duct", "blockName": "XB-DUCT-ELBOW", "system": "HVAC", "kind": "fitting",
      "scaleBySize": true, "rotateToPath": true },
    { "id": "fcu-unit", "blockName": "FCU", "system": "HVAC", "kind": "equipment",
      "attributes": ["TAG", "MODEL", "SIZE"], "takeoffItemId": "fcu-unit" },
    { "id": "titleblock-a1", "blockName": "XB-TB-A1", "kind": "titleblock", "paper": "A1",
      "attributes": ["DU_AN", "HANG_MUC", "TI_LE", "NGAY", "NGUOI_VE", "SO_BAN_VE"] }
  ]
}
```

**DDL (`cad_block_libs` — thêm thuần):** `id BIGSERIAL PK`, `version TEXT UNIQUE NOT NULL`, `manifest JSONB NOT NULL`, `storage_key TEXT NOT NULL`, `dwg_sha256 TEXT NOT NULL`, `published_by BIGINT REFERENCES users(id)`, `created_at TIMESTAMPTZ DEFAULT now()`. Idempotent `IF NOT EXISTS`.

**XData:** appname `XBOSS_VE` trên tim `[systemId, itemId, size, rulePackVersion, custom?, edgeHandles…]`; trên biên `[centerHandle]`. Không đụng appname `XBOSS_BOCKL` (M99).

## 12. Security/privacy/abuse

- Tải thư viện: token scope `cad` sẵn có (M99 PR2 — hash, thu hồi, rate limit). Phát hành: chỉ session Admin/PM + CSRF; tệp `.dwg` nhận vào **không được server thực thi/parse binary** — server chỉ lưu + kiểm qua DXF sidecar bằng parser tầng 3 (giữ nguyên tắc "server không đọc DWG").
- Toàn vẹn chuỗi cung ứng nội bộ: client kiểm `sha256` manifest↔tệp trước khi nhập block vào bản vẽ; hash lệch → từ chối, báo rõ.
- Giới hạn upload phát hành (kích thước tối đa, mime) như các route upload hiện có; audit ai phát hành version nào (cột `published_by` + audit trigger hiện hành nếu bảng thuộc phạm vi M43).
- Rủi ro trôi 3 nguồn tên (layerMap ↔ drawTools ↔ manifest ↔ takeoff): validator chạy ở **cả hai chỗ** — server lúc phát hành (chặn), Core lúc nạp (từ chối dùng) + test đối chứng §15.

## 13. UX/a11y/content

- Toàn bộ prompt dòng lệnh + hộp thoại tiếng Việt; chọn hệ/loại/size qua keyword dòng lệnh AutoCAD (quen tay kỹ sư) — hộp thoại chỉ cho việc chọn block có preview.
- Bảng điều khiển web (mục "Thư viện block"): dùng bộ component `app/components/ui/`, dark-first, không hex — theo chuẩn UI hiện hành; hiển thị version hiện hành, lịch sử, nút phát hành (Admin/PM).
- Nhãn size format thống nhất (`300x200`, `DN50`) — đúng như chuỗi trong `sizes[]`, không tự chế format.

## 14. Observability và vận hành

- Báo cáo phiên vẽ (JSON cạnh DWG, cùng khung báo cáo M99): số tuyến/block theo hệ, size custom đã dùng, các lần đụng độ định nghĩa block và lựa chọn của kỹ sư, version rule pack + thư viện.
- Nhật ký phát hành thư viện trên web (bảng `cad_block_libs`).

## 15. Test plan

- **Core (CI Linux, xunit — mở rộng bộ M99):** EdgeOffset (tuyến thẳng/cong/polyline nhiều đỉnh, width chẵn lẻ, đơn vị ≠ mm); FittingPlacement (góc tiếp tuyến tại đỉnh/giữa đoạn/trên cung); validate drawTools v4 (layer lệch layerMap → lỗi; `-EDGE` đụng takeoff → lỗi); BlockManifest (hash, block thiếu, attribute thiếu); **TakeoffCrossCheck** — nạp rule pack v4 THẬT + manifest mẫu từ repo, mọi `equipment[]` phải trỏ tới item `measure=count` có `blockNameMatchAny` khớp `blockName` (chống trôi — cùng triết lý test đối chứng AC6 của M99).
- **Core (bổ sung):** `SectionBuilder` (giao điểm/thứ tự/khoảng cách ngang, tuyến song song tuyến cắt → bỏ qua kèm cảnh báo); `SheetSetupConfig` (titleblockId thiếu trong manifest → lỗi); quy đổi tỉ lệ viewport (1:50 → custom scale đúng).
- **Server (node:test):** route block-lib GET/POST (auth, ETag, 422 khi manifest sai), `lib/ky-thuat/cad/block-lib.ts` thuần.
- **Tích hợp trên máy có AutoCAD (tay, theo release — cùng ràng buộc M99 PR7b/không có runner Windows):** AC1–AC8 checklist; đặc biệt AC3/AC4 (vẽ → bóc round-trip).

## 16. Kế hoạch slice/PR

| PR  | Nội dung                                                                                                                              | route:    | Điều kiện                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------- |
| PR1 | Rule pack v4 (`drawTools`) + validator Core (`DrawToolsConfig`, `TakeoffCrossCheck`) + test; server phục vụ v4 (không code mới ngoài data) | `spec`    | —                                  |
| PR2 | Thư viện block: DDL `cad_block_libs` + `lib/ky-thuat/cad/block-lib.ts` + API GET/POST + mục web + `BlockManifest` Core + test           | `complex` | PR1                                |
| PR3 | Adapter: `XBOSS_VE_NEN` + `XBOSS_VE` (tuyến tim + biên, `EdgeOffset` Core) + `XBOSS_VE_NHAN`                                            | `complex` | PR1; build/verify tay máy Windows |
| PR4 | Adapter: `XBOSS_VE_PHUKIEN` + `XBOSS_VE_THIETBI` + `XBOSS_VE_THUVIEN` (`BlockLibraryService`, `FittingPlacement`)                       | `complex` | PR2+PR3                            |
| PR5 | `XBOSS_VE_DOI` + báo cáo phiên vẽ + tài liệu (README plugin, CAI-DAT.md) + checklist AC tích hợp                                        | `standard`| PR3+PR4                            |
| PR6 | `XBOSS_VE_TRANGIN` (layout/viewport/khung tên, `SheetSetupConfig`) + `XBOSS_VE_MATCAT` (`SectionBuilder`) + AC10/AC11                    | `complex` | PR2+PR3 (cần titleblock trong thư viện) |
| PR7 | `XBOSS_VE_GIADO` + `XBOSS_VE_LOCHO` (kèm bảng builder's work) + `XBOSS_VE_TAG` + `XBOSS_VE_THONGKE` + slope (Core: spacing/clip thuần)  | `complex` | PR2+PR3; item takeoff giá đỡ/sleeve vào rule pack cùng PR |

Nội dung thư viện block đầu tiên (vẽ các block `XB-*` chuẩn công ty trong tệp `.dwg`) là việc của kỹ sư trưởng/CAD manager — **không phải việc code**; PR2 giao kèm tệp mẫu tối thiểu (1 block/loại) để test.

## 17. Rollout/rollback

- Lệnh mới hoàn toàn cộng thêm — không đổi hành vi lệnh M99 nào; rollback = phát hành lại gói plugin cũ (xóa `.bundle`, chép bản cũ).
- Rule pack v4/thư viện block: append-only — sự cố thì phát hành version kế tiếp sửa lại, client tự tải (không sửa version đã phát hành).
- Pilot: 1 kỹ sư + 1 hệ (HVAC) + 1 mặt bằng trước khi phổ biến.

## 18. Risk/assumption/open decisions

| Mục                                                                       | Xác minh/giảm thiểu                                                                                                                                          | Quyết định            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Trôi tên giữa 4 nguồn** (layerMap/drawTools/manifest/takeoff)           | Validator 2 chỗ + `TakeoffCrossCheck` chạy CI trên dữ liệu thật của repo (§15) — rủi ro số 1, kế thừa bài học M99                                             | Giảm thiểu            |
| Kỹ sư không dùng lệnh mới (vẽ tay quen hơn)                               | O3 tốc độ ngang PLINE; pilot hẹp lấy phản hồi; giá trị bán kèm: khỏi gõ nhãn, bóc không sót                                                                   | Theo dõi sau pilot    |
| Nét biên lệch khi tuyến có cung/spline phức tạp                           | `EdgeOffset` test kỹ trên Core; đoạn không offset được (spline tự cắt) → chỉ vẽ tim + cảnh báo, không vẽ biên sai                                             | Giảm thiểu            |
| Bản vẽ nền chưa chuẩn hóa → layer đích trùng tên nội dung bẩn             | `XBOSS_VE_NEN` cảnh báo khi layer đích đã có đối tượng cũ; khuyến nghị CHUANHOA trước (không ép)                                                              | Chấp nhận có chủ đích |
| Danh mục size/danh sách phụ kiện tùy công ty, rule pack toàn cục          | Như `boqCode` M99: v4 mang bộ mặc định, cần theo dự án → phát hành version mới                                                                                 | Chấp nhận, xem lại sau UAT |
| Không có runner Windows có license                                        | Kế thừa nguyên trạng M99 §18 — phần Adapter verify tay theo release, checklist AC trong PR5                                                                    | Chấp nhận (đã có tiền lệ) |
| Mặt cắt bán tự động bị hiểu nhầm là "đúng cao độ thật"                    | Nhãn hình cắt in rõ "cao độ nhập tay, kiểm tra tại hiện trường"; cao độ luôn prompt, không có giá trị ngầm                                                     | Giảm thiểu            |
| Nền .NET AutoCAD đổi giữa bản cập nhật                                     | Kế thừa quy trình kiểm M99 §9.1 (đã xảy ra 2026-08-25)                                                                                                         | Quy trình sẵn có      |
| ~~Open~~ thư viện toàn cục hay theo dự án                                  | **ĐÃ CHỐT 2026-08-25 (duyệt trọn gói): toàn cục** — đa dự án xem lại sau UAT                                                                                    | Đã chốt               |
| ~~Open~~ transparency vs screening                                          | **ĐÃ CHỐT: transparency**; tinh chỉnh cảm quan là ranh giới quyết của PR3                                                                                        | Đã chốt               |

## 19. Approval

- [x] Product/scope — Seeker 2026-08-25 ("ok duyệt tất cả", gồm 5 tính năng bổ sung)
- [ ] UX/a11y (prompt lệnh + mục web — xem ở UAT)
- [x] Architecture/API/data (rule pack v4 + `cad_block_libs`)
- [x] Security/RBAC/audit (phát hành thư viện — rà lại `docs/audit.md` khi code PR2)
- [ ] Test/rollout (checklist tích hợp chốt ở PR5)
- [x] 2 open decisions §18 đã chốt

**Kết luận:** **Approved for implementation** — thi hành theo thứ tự PR §16.
**Người/ngày duyệt:** Seeker — 2026-08-25.

## 20. Phiên bản sau — tính năng đáng giá đã rà, chủ đích để lại

Ghi theo yêu cầu người dùng 2026-08-25 ("ghi chú thêm những tính năng đáng giá cần nâng cấp cho phiên bản sau"). Chưa có đặc tả — mỗi mục khi làm phải mở M mới hoặc bổ sung M100 có duyệt lại:

| Tính năng                                   | Giá trị                                                                                                          | Lý do để lại                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `XBOSS_VE_NGATNET` — ngắt nét giao chéo     | Quy ước trình bày 2D "ống dưới ngắt nét" — bản vẽ nộp đẹp chuẩn                                                   | Đụng hình học hiển thị quanh tim — phải thiết kế để gap CHỈ ở nét biên/hiển thị, tim giữ nguyên (không được lệch BOCKL); cần nghĩ kỹ      |
| `XBOSS_VE_REV` — revision cloud + tam giác  | Đánh dấu vùng sửa giữa các revision, liên kết `drawing_revisions` trên server — truy vết CĐT yêu cầu sửa gì       | Nên đi cùng chu trình duyệt bản vẽ trên web (trạng thái revision, so sánh 2 bản) — một đợt riêng trọn vẹn hơn                             |
| Nhân bản tầng điển hình                     | Copy cả hệ sang N tầng (tháp căn hộ AVIO tầng điển hình nhiều), giữ XData, tự đổi tag `{floor}` + tên vùng        | Giá trị lớn nhưng rủi ro nhân bản lỗi hàng loạt — chờ M100 lõi chạy ổn qua pilot                                                          |
| Sơ đồ đứng (riser) bán tự động              | Dựng riser từ dữ liệu tuyến các tầng                                                                               | Cần dữ liệu liên tầng có cấu trúc (bản vẽ nào = tầng nào, điểm trục đứng) — gần bài toán BIM; chỉ khả thi sau khi nhân bản tầng + vùng/tầng của M101 chạy thật |
| Thư viện block theo dự án (`org_id`)        | Mỗi dự án/CĐT một bộ block riêng                                                                                   | Đã chốt bản đầu toàn cục; xem lại sau UAT                                                                                                 |
| Đối chiếu chéo M101                         | Tag trùng vào `XBOSS_KIEMTRA` (phép 17), giá đỡ/sleeve vào bóc theo vùng                                          | Tự động có khi M101 triển khai — ghi để không quên nối 2 đặc tả                                                                            |
