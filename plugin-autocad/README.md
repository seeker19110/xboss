# Plugin AutoCAD XBoss — chuẩn hóa bản vẽ & bóc tách khối lượng (M99, tầng 2)

Plugin cho **AutoCAD 2026** (một nền duy nhất — M99 §9.1: Core .NET 8, Adapter .NET 10 cập nhật 2026-08-25), thi hành ADR-0006:
chuẩn hóa bản vẽ và bóc tách khối lượng chạy bằng chính API AutoCAD trên máy kỹ sư;
quy tắc tải từ XBoss dưới dạng **rule pack** có version (không nhúng cứng).

## Cấu trúc

| Project              | Nền               | Vai trò                                                                                                                                                                                                                  |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `XBoss.Cad.Core`     | `net8.0`          | Toàn bộ quy tắc THUẦN: matcher token-boundary, ánh xạ layer, giải mã font TCVN3/VNI, kiểm tra, gộp khối lượng, ghi Excel (ClosedXML) — **không tham chiếu AutoCAD**, test trên CI Linux                                  |
| `XBoss.Cad.Tests`    | `net8.0`          | xunit — nạp rule pack THẬT từ `lib/ky-thuat/cad/rule-packs/v2.json` của repo (chống trôi 2 tầng)                                                                                                                         |
| `XBoss.Cad.Acad`     | `net10.0-windows` | Adapter AutoCAD: lệnh `XBOSS_*`, đo hình học, áp thay đổi trong 1 nhóm UNDO — **chỉ build trên Windows có ObjectARX SDK 2026**                                                                                           |
| `XBoss.Cad.AcadShim` | `net8.0`          | **Cổng CI**: biên dịch thử toàn bộ mã `XBoss.Cad.Acad` trên Linux bằng stub API AutoCAD — bắt lỗi cú pháp/sai chữ ký ngay ở PR. KHÔNG phải AutoCAD, KHÔNG thay verify tay ([README riêng](XBoss.Cad.AcadShim/README.md)) |

## Giao diện trong AutoCAD (M102)

Plugin có 2 lớp giao diện, đều chỉ là VỎ trên bộ lệnh (bấm nút = gõ lệnh, nghiệp vụ không nhân đôi):

- **Tab Ribbon "XBoss"** — 5 panel: Kết nối / Chuẩn hóa / Bóc khối lượng / Vẽ shop drawing /
  Bảng điều khiển; lệnh chính mỗi nhóm là nút to, mọi nút có tooltip tiếng Việt. Dựng từ danh mục
  `XBoss.Cad.Core/Ui/LenhCatalog.cs` (nguồn sự thật duy nhất — test `LenhCatalogTests` đối chiếu
  với mọi `[CommandMethod]`, thêm lệnh mà quên danh mục là CI đỏ). Ribbon lỗi/tắt không ảnh hưởng
  lệnh gõ tay.
- **Bảng điều khiển `XBOSS_BANG`** — PaletteSet neo được: trạng thái server/thiết bị, rule pack
  đang nạp, bản vẽ hiện hành + tóm tắt các báo cáo JSON cạnh DWG, kèm nút khắc phục nhanh
  (Đăng nhập/Nạp rule pack). Chỉ đọc, không đụng bản vẽ, không gọi mạng.

Xem đặc tả `docs/nang-cap/M102-plugin-ui.md`.

## Lệnh trong AutoCAD

| Lệnh               | Chức năng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XBOSS_LOGIN`      | Ghép thiết bị với server XBoss (M99 PR2): xin mã → duyệt trên trang web `/engineering/thiet-bi-cad` → nhận token (cất **Windows Credential Manager**, hạn 90 ngày, thu hồi được trên web) → tự tải rule pack mới nhất (ETag)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `XBOSS_RULEPACK`   | Nạp tệp rule pack JSON bằng tay (đường dự phòng offline) — cache `%APPDATA%\XBoss\rule-pack.json`. Chưa có rule pack (qua LOGIN hoặc lệnh này) thì mọi lệnh khác từ chối chạy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `XBOSS_KIEMTRA`    | Chỉ kiểm, không sửa — 9 phép kiểm nền: layer sai chuẩn, lệch Z, polyline hở/gần kín, font TCVN3/VNI, lineweight lệch CTB, dim override, rác hình học, layer rỗng, block nặc danh (rule pack v5/v8 bật thêm phép 10–16 và **17** tag trùng số trong cùng hệ / **18** hạng mục có đối tượng nhưng thiếu mã BOQ — đều mặc định TẮT, tự tắt khi bản vẽ thiếu dữ liệu) — khoanh tròn vị trí lỗi trên layer tạm `XBOSS_KIEMTRA_MARK` (không in, tự dọn) + báo cáo JSON `<tệp>.dwg.xboss-kiemtra.json` cạnh DWG                                                                                                                                                                                                                                                                                                                  |
| `XBOSS_CHUANHOA`   | Pipeline thứ tự cố định 13 bước: Audit → layer mapping → font (giải mã TCVN3/VNI **và đổi font kiểu chữ sang `fontMap.targetFont`** — rule pack v3) → flatten Z=0 → overkill → purge → lineweight/CTB + gỡ dim override → **style map (text/dim về bộ chuẩn `styleMap`, KHÔNG phá liên kết đo của dimension) → xref (báo đứt đường dẫn, tương đối hóa; chỉ bind xref khai trong `bindMatchAny`) → hatch (mẫu + tỉ lệ theo layer, hatch solid giữ nguyên) → layout (xóa layout rỗng, đổi tên theo `namePattern`) → đóng polyline gần kín (khe ≤ `gapCloseToleranceMm`) → block map (quy block lạc chuẩn về block thư viện, bản đầu `reportOnly`)** — 4 bước 8–11 là rule pack v7, 2 bước 12–13 là rule pack v8, **đều mặc định TẮT**. Xem trước diff, xác nhận, **1 lần UNDO hoàn tác toàn bộ**; báo cáo JSON ghi cạnh DWG |
| `XBOSS_BOCKL`      | Bóc khối lượng theo rule pack (`takeoff`): đo chiều dài/diện tích/đếm block theo layer mapping, quy đổi INSUNITS, tô màu vùng đã bóc + XData chống bóc trùng. **v6 (M101 PR3):** hỏi thêm "bóc theo vùng?" — chọn polyline ranh giới + đặt tên vùng thì tuyến cắt ranh giới được cắt đúng tại giao điểm (bản thân đường ranh giới không bị tính)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `XBOSS_BOCKL_XOA`  | Gỡ đánh dấu bóc (trả đúng màu trước khi bóc, xoá XData) — toàn bộ hoặc theo vùng chọn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `XBOSS_BOCKL_XUAT` | Xuất Excel **đúng mẫu công ty** (`attachments/MAU-KHOI-LUONG-BOQ.xlsx`, sheet `Data-BOQ`, cột A–K + công thức H/J/K sống, tổng nhóm hệ + TỔNG CỘNG bằng `SUBTOTAL` sống) từ trạng thái bóc đang lưu trong DWG — đóng/mở lại bản vẽ vẫn xuất được; kèm sidecar JSON máy-đọc-được cạnh tệp Excel. **v6:** khi kết quả có size/vùng/hệ số quy đổi thì cộng thêm cột L–Q (Vùng, Size, Nguồn size, Mã item, Hệ số quy đổi, KL quy đổi) + sheet `Tong-hop-vung` — cột A–K không đổi một ô nào. **M101 PR4:** hỏi thêm "kéo KL BOQ hợp đồng từ máy chủ?" (mặc định Không) — chọn Có thì dựng sheet phụ `Doi-chieu` đặt KL hợp đồng cạnh KL bóc, chênh lệch/% là công thức sống; chưa `XBOSS_LOGIN`/mất mạng chỉ cảnh báo rồi xuất bình thường, KHÔNG chặn                                                                        |
| `XBOSS_BATCH`      | Xử lý hàng loạt cả thư mục `.dwg` qua side database (không mở lên editor): chế độ chỉ-kiểm (mặc định) hoặc chuẩn hóa — **bản gốc giữ nguyên**, kết quả vào thư mục con `da-chuan-hoa/`, tệp lỗi bỏ qua, nhật ký `xboss-batch-log.txt` + báo cáo JSON từng tệp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

| `XBOSS_UPLOAD` | Gửi DWG đã lưu + DXF sidecar + báo cáo chuẩn hóa + version rule pack lên server (M99 PR5): server kiểm định lại DXF + rule pack — đạt thì tạo `drawing_revision` trạng thái `submitted`, fail thì hiện đủ lỗi trong AutoCAD, KHÔNG tạo revision. Idempotent theo hash DWG (gửi lại cùng tệp không tạo bản đôi) |
| `XBOSS_VE_DEXUAT` | **Đề xuất block vào thư viện (M103):** chọn BlockReference trên bản vẽ → dialog nhập metadata (tên/loại/hệ/item/ghi chú) → gửi ứng viên lên hàng chờ duyệt (Admin/PM duyệt trên web thành version thư viện mới). Yêu cầu `XBOSS_LOGIN` trước |
| `XBOSS_VE_DEXUAT_LO` | **Nạp block hàng loạt (M108):** quét MỌI định nghĩa block của bản vẽ đang mở (tệp thư viện tổng hợp) → hộp thoại xem trước kèm lý do từng block bị loại → gửi cả lô lên hàng chờ. Kỹ sư **không khai metadata**: máy chủ tự đề xuất phân loại (luật rule pack, và AI nếu server có bật), Admin/PM duyệt theo lô ở mục "Nạp Block Hàng Loạt" trên web. Bản vẽ chỉ được ĐỌC. Yêu cầu `XBOSS_LOGIN` trước |

### Bộ lệnh VẼ shop drawing (M100 — 14 lệnh)

Vẽ đè lên bản thiết kế đã chuẩn hóa; mọi nét/block sinh ra **đã đúng chuẩn ngay từ đầu** (layer theo
`layerMap`, block theo thư viện có version, size nằm sẵn trong XData `XBOSS_VE`) nên `XBOSS_KIEMTRA`
pass ngay và `XBOSS_BOCKL` bóc không sót. Cần **rule pack từ v4** (khối `drawTools`) và — với các
lệnh chèn block — thư viện block đã tải (`XBOSS_LOGIN` hoặc `XBOSS_VE_THUVIEN`).

| Lệnh               | Chức năng                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `XBOSS_VE_NEN`     | Chuẩn bị nền: khóa + làm mờ (`drawTools.baseFadePct`) mọi layer hiện có, tạo sẵn layer đích của hệ (+ layer nét biên) đúng màu/lineweight; chạy lại để **hoàn nguyên** (trạng thái cũ cất trong chính bản vẽ). Không sửa/xóa đối tượng nền                                                                                           |
| `XBOSS_VE`         | Vẽ **tuyến tim** như PLINE (có Cung/HoànTác/Đóng): chọn hệ → loại tuyến → size trong danh mục (nhập ngoài danh mục được, đánh dấu `custom`) → độ dốc nếu tuyến bắt buộc; kết thúc: tim đúng layer + XData `[hệ, item, size, version, custom?, slope?]`, `edgeStyle=double` sinh 2 nét biên trên layer `…EDGE` (không bao giờ bị bóc) |
| `XBOSS_VE_NHAN`    | Bấm tuyến → ghi nhãn size (+ `i=…%`) **lấy từ XData, không gõ tay**, cao chữ quy theo tỉ lệ in; tuyến có độ dốc thì chèn kèm block mũi tên `slope-arrow` theo chiều vẽ tuyến — thư viện chưa có block đó thì **chỉ ghi chữ** (không tự vẽ ký hiệu thay thế)                                                                          |
| `XBOSS_VE_PHUKIEN` | Chèn phụ kiện (co, tê, giảm, van, miệng gió…) bám tuyến tim: tự xoay theo tiếp tuyến, scale theo size khi manifest khai `scaleBySize`, đúng layer tuyến                                                                                                                                                                              |
| `XBOSS_VE_THIETBI` | Chèn thiết bị có attribute (`TAG` bắt buộc + `MODEL`/`SIZE`), layer chọn sao cho `XBOSS_BOCKL` đếm được; cảnh báo ngay khi tên block lệch `blockNameMatchAny` của rule pack                                                                                                                                                          |
| `XBOSS_VE_THUVIEN` | Nạp thư viện block: tải lại từ server hoặc nạp tệp tay (`manifest.json` + `.dwg` cạnh nhau) — đường dự phòng offline như `XBOSS_RULEPACK`; luôn kiểm `sha256` trước khi dùng                                                                                                                                                         |
| `XBOSS_VE_DOI`     | **Đổi hệ/loại/size** đoạn đã vẽ: đổi layer + XData, **xóa và dựng lại nét biên** theo bề rộng mới, cập nhật nhãn (xóa mũi tên dốc nếu tuyến mới không có độ dốc), và **gỡ đánh dấu bóc** của đúng các đoạn đó kèm cảnh báo "đổi xong phải bóc lại". 1 UNDO trả nguyên trạng                                                          |
| `XBOSS_VE_TRANGIN` | Trang in chuẩn công ty: layout + page setup (`sheetSetup.plotter`, khổ, CTB) + viewport **đúng tỉ lệ và khóa** + VP-freeze layer ngoài hệ + khung tên từ thư viện đã điền attribute. Vùng in nhận **2 điểm hoặc một polyline ranh giới kín** (lấy hình bao)                                                                          |
| `XBOSS_VE_MATCAT`  | Mặt cắt bán tự động: kẻ tuyến cắt → dựng ký hiệu đúng loại/size từ XData, đúng khoảng cách ngang thật, tên A-A tự đánh; **cao độ nhập tay** (bản vẽ 2D không chứa cao độ thật — plugin không bịa)                                                                                                                                    |
| `XBOSS_VE_GIADO`   | Rải giá đỡ dọc tuyến theo `supportSpacingMm` (mặc định **không bước nào vượt chuẩn**), xoay vuông góc tuyến, luôn có ở đầu/cuối và tại **phụ kiện nặng khai trong `drawTools.heavyFittingIds`** (rule pack v7; pack cũ thì lệnh hỏi kỹ sư). Chạy lại chỉ bổ sung chỗ thiếu                                                           |
| `XBOSS_VE_LOCHO`   | Sleeve/lỗ chờ xuyên kết cấu: size = size ống + `sleeveClearanceMm`, bấm điểm hoặc dò giao tuyến × layer kết cấu; chế độ `XUATBANG` xuất **bảng builder's work** (Table trong bản vẽ + Excel riêng, không đụng mẫu BOQ)                                                                                                               |
| `XBOSS_VE_TAG`     | Đánh tag tuần tự theo `tagPattern`, quét **trùng/nhảy số**, đánh lại giữ nguyên tag đã khóa; tầng hỏi một lần và nhớ trong chính bản vẽ                                                                                                                                                                                              |
| `XBOSS_VE_THONGKE` | Table trong bản vẽ: bảng thiết bị (từ attribute) hoặc bảng khối lượng theo hệ (từ trạng thái bóc `XBOSS_BOCKL`, chỉ ĐỌC); chạy lại **cập nhật bảng cũ tại chỗ**, không sinh bảng đôi                                                                                                                                                 |
| `XBOSS_VE_BAOCAO`  | **Báo cáo phiên vẽ** (M100 §14, chỉ đọc): số tuyến/block theo hệ, size ngoài danh mục đã dùng, các lần đụng độ định nghĩa block + lựa chọn của kỹ sư, version rule pack và thư viện; in ra dòng lệnh + ghi `<tệp>.dwg.xboss-ve.json` cạnh DWG                                                                                        |

> **Rule pack v7 (M100 PR5)** thêm 2 item takeoff đếm được — `support-hanger` (giá đỡ) và
> `sleeve-opening` (lỗ chờ) khớp theo TÊN BLOCK — nên `XBOSS_BOCKL` đếm được hai hạng mục trước đây
> phải ước tay (AC12/§6.8); và khóa `drawTools.heavyFittingIds` khai **phụ kiện nào là nặng** để
> `XBOSS_VE_GIADO` khỏi hỏi kỹ sư mỗi lần chạy. Bản vẽ không có block giá đỡ/sleeve thì bóc bằng v7
> ra kết quả **y hệt v6** (2 item mới nằm cuối danh sách, khớp first-match).

> **Rule pack v5 (M101 PR1)** khai thêm 7 phép kiểm cho `XBOSS_KIEMTRA` (chồng lấn cùng hệ, giao cắt
> khác hệ trên mặt bằng, khung tên thiếu trường, viewport chưa khóa/tỉ lệ lạ, text-dim style lệch,
> nhãn size lệch XData, đối tượng ngoài khung) + khối `styleMap`. Toàn bộ **mặc định TẮT** và Adapter
> chưa cung cấp dữ liệu đầu vào cho chúng, nên hành vi lệnh hiện vẫn đúng 9 phép kiểm ở trên; PR sau
> của M101 mới nối dữ liệu và bật dần theo dự án.

> **Rule pack v8 (M102 PR1)** khai thêm 2 phép kiểm cho `XBOSS_KIEMTRA` — **17** tag trùng số trong
> cùng hệ (dữ liệu XData của `XBOSS_VE_TAG`) và **18** hạng mục bóc tách chưa gán mã BOQ (cột A của
> Excel sẽ trống) — cùng 2 khối chính sách cho **bước chuẩn hóa 12/13** của `XBOSS_CHUANHOA`:
> `polylineClosePolicy` (đóng polyline có khe đầu–cuối ≤ ngưỡng; khe lớn hơn ngưỡng **giữ nguyên** vì
> đó thường là thiếu hẳn một đoạn tuyến, phép kiểm 3 vẫn báo) và `blockMap` (quy block lạc chuẩn về
> block thư viện — **bản đầu chỉ BÁO**, thay định nghĩa block là thao tác phá hủy nên kỹ sư quyết
> từng trường hợp; block nặc danh không bao giờ bị tự thay). Toàn bộ **mặc định TẮT** → kiểm/chuẩn
> hóa/bóc bằng v8 cho kết quả **y hệt v7**; phần Core đã xong, Adapter thi hành ở PR2. v8 cũng sửa
> `layerMap.knownIssues`: nợ "không idempotent" đã đóng từ M101 PR2 nhưng tài liệu còn ghi là nợ.

> **Rule pack v6 (M101 PR3)** khai thêm cho mỗi `takeoff.items[]` 6 khóa TÙY CHỌN của bóc tách nâng
> cao: `groupBySize` (tách dòng theo size — nguồn ưu tiên XData `XBOSS_VE` của bộ lệnh vẽ, dự phòng
> là nhãn gần tuyến qua `sizeFromNearbyText`), `wastagePct`/`perCountAdd` (hệ số quy đổi hao hụt/phụ
> kiện — hiện ở **cột KL QUY ĐỔI riêng**, không bao giờ cộng vào KL đo), `derivedFrom` + `formula`
> (item cách nhiệt tính từ size đã tách). **Tệp v6 không bật khóa nào** nên bóc bằng v6 ra kết quả y
> hệt v5; QS/kỹ sư trưởng chốt hệ số theo dự án bằng cách phát hành version kế tiếp. Đoạn tuyến chưa
> xác định được size **không bị đoán**: nó nằm ở dòng "(chưa có size)" và phần cách nhiệt tương ứng
> được báo là "còn X m chưa tính".

## Build

### Core + Tests (mọi HĐH — đây là phần CI chạy)

```bash
dotnet test plugin-autocad/XBoss.Cad.Tests/XBoss.Cad.Tests.csproj
```

Test nạp rule pack thật từ repo nên phải chạy bên trong repo XBoss.

### Biên dịch thử Adapter bằng stub API (mọi HĐH — CI cũng chạy)

```bash
dotnet build plugin-autocad/XBoss.Cad.AcadShim/XBoss.Cad.AcadShim.csproj -c Release
```

Biên dịch **toàn bộ** mã `XBoss.Cad.Acad` bằng bộ khai báo giả API AutoCAD, **không** cần
Windows/ObjectARX. Chạy lệnh này **trước khi push** mọi thay đổi chạm Adapter — nó bắt được lỗi
cú pháp và sai chữ ký API, hai lớp lỗi trước đây chỉ lộ ra khi đã ra tới máy Windows có license
(đã cháy 2 lần thật — xem `PROGRESS.md`).

⚠ **Không thay được verify tay trên máy có AutoCAD**: stub không có hành vi, nên cổng này không
kiểm logic/hình học/lỗi lúc chạy. Adapter dùng API mới mà stub chưa khai → bổ sung vào
`XBoss.Cad.AcadShim/AcadStub.cs` theo hướng dẫn trong
[`XBoss.Cad.AcadShim/README.md`](XBoss.Cad.AcadShim/README.md) (đối chiếu tài liệu ObjectARX,
đừng đoán theo lỗi biên dịch — stub sai chữ ký thì cổng xanh giả).

### Adapter (Windows + ObjectARX SDK 2026 + .NET 10 SDK)

1. Cài ObjectARX SDK 2026 (hoặc dùng thẳng thư mục cài AutoCAD 2026 — nơi có
   `acdbmgd.dll`, `acmgd.dll`, `accoremgd.dll`).
2. **Xác minh nền .NET — làm lại sau MỖI bản cập nhật AutoCAD, không chỉ khi đổi đời.** Ngày
   2026-08-25 chính máy người dùng đổi từ `.NETCoreApp,Version=v8.0` sang `v10.0` chỉ sau vài tiếng
   (AutoCAD tự cập nhật), làm build đổ với `CS1705`. Nền hiện tại của Adapter: **`net10.0-windows`**
   (cần .NET 10 SDK — `winget install Microsoft.DotNet.SDK.10`). Lệnh kiểm:

   ```powershell
   $b = [IO.File]::ReadAllBytes("C:\Program Files\Autodesk\AutoCAD 2026\acmgd.dll")
   $s = [Text.Encoding]::UTF8.GetString($b)
   [regex]::Matches($s, '\.NET[A-Za-z]*,Version=v[0-9\.]+') | ForEach-Object { $_.Value } | Select-Object -Unique
   ```

   Lệch với `TargetFramework` của `XBoss.Cad.Acad` → sửa csproj + cổng CI "Kiểm TargetFramework
   từng project" theo giá trị thật, và cập nhật M99 §9.1. (Đừng dùng `LoadFrom(...).ImageRuntimeVersion` trên PowerShell 5.1 —
   nền .NET Framework 4.8 không nạp nổi assembly .NET 8/10, chỉ ném `BadImageFormatException`.)

3. Build:

   ```powershell
   dotnet build plugin-autocad/XBoss.Cad.Acad/XBoss.Cad.Acad.csproj -c Release -p:AcadSdkDir="C:\Program Files\Autodesk\AutoCAD 2026"
   ```

## Đóng gói `.bundle` và cài đặt

**Cách nhanh — script tự làm hết** (build + tạo bundle + cài):

```powershell
powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1
powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1 -ChiDongGoi   # chỉ tạo .\dist để phát hành
```

Đóng AutoCAD trước khi chạy (DLL đang nạp thì không ghi đè được). Phần dưới mô tả cấu trúc gói
để đối chiếu khi cần làm tay.

> Hướng dẫn **build chi tiết từ máy Windows trắng** (cài .NET SDK, kiểm nền .NET của AutoCAD,
> build tay từng project, bảng lỗi thường gặp) nằm ở [`BUILD-WINDOWS.md`](BUILD-WINDOWS.md).
> Hướng dẫn cho **người dùng cuối** (cài, ghép thiết bị, trục trặc thường gặp) nằm ở
> [`CAI-DAT.md`](CAI-DAT.md). Quy trình đầy đủ **build → verify tay 26 lệnh trên AutoCAD thật →
> đóng gói → phát hành → bật nút tải trên web** nằm ở
> [`VERIFY-VA-PHAT-HANH.md`](VERIFY-VA-PHAT-HANH.md). Phần dưới đây dành cho người phát hành gói cài.

Tạo thư mục `%APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle\` với cấu trúc:

```
XBoss.bundle/
├── PackageContents.xml        (chép từ plugin-autocad/bundle/PackageContents.xml)
└── Contents/
    ├── XBoss.Cad.Acad.dll     (từ XBoss.Cad.Acad/bin/Release/)
    ├── XBoss.Cad.Core.dll
    ├── ClosedXML.dll + các dll phụ thuộc của nó (DocumentFormat.OpenXml…, từ output build)
    └── (KHÔNG chép acdbmgd/acmgd/accoremgd — AutoCAD cung cấp lúc chạy)
```

Mở AutoCAD 2026 → plugin tự nạp (autoloader), command line hiện dòng `[XBoss] Plugin ... đã nạp`.
Gỡ cài đặt = xoá thư mục `XBoss.bundle` (M99 §17).

## Luồng làm việc chuẩn của kỹ sư

1. `XBOSS_LOGIN` (lần đầu / khi token hết hạn) — ghép thiết bị + tự tải rule pack **và thư viện block**. Không có mạng thì dùng `XBOSS_RULEPACK` / `XBOSS_VE_THUVIEN` nạp tệp tay.
2. Mở bản vẽ nhận từ CĐT/TVTK → `XBOSS_KIEMTRA` xem mức lệch chuẩn.
3. `XBOSS_CHUANHOA` → kiểm tra kết quả (sai thì UNDO 1 lần) → QSAVE.
4. Làm shop drawing bằng bộ lệnh vẽ: `XBOSS_VE_NEN` → `XBOSS_VE` → `XBOSS_VE_PHUKIEN` /
   `XBOSS_VE_THIETBI` → `XBOSS_VE_NHAN` → (`XBOSS_VE_GIADO`, `XBOSS_VE_LOCHO`, `XBOSS_VE_TAG`,
   `XBOSS_VE_THONGKE` khi cần) → `XBOSS_VE_MATCAT` / `XBOSS_VE_TRANGIN` → `XBOSS_VE_NEN` lần nữa để
   hoàn nguyên nền. Sửa hệ/size đoạn đã vẽ bằng `XBOSS_VE_DOI` (không sửa tay), soát bằng `XBOSS_VE_BAOCAO`.
5. `XBOSS_BOCKL` trên bản vẽ shop đã duyệt → `XBOSS_BOCKL_XUAT` → gửi tệp Excel cho QS
   (QS điền cột F — KL BOQ hợp đồng; cột H/J/K tự tính trạng thái CHẶN/OK theo mẫu công ty).

## Ràng buộc thiết kế phải giữ khi sửa code

- **Core không được tham chiếu assembly AutoCAD** (FR17) — mọi quy tắc mới viết ở Core kèm test.
- Matcher token-boundary chỉ có MỘT bản cài (`TokenMatcher`) dùng chung layer mapping + takeoff.
- Không nhúng cứng quy tắc chuẩn hóa/bóc tách vào code — thêm quy tắc = phát hành rule pack
  version mới phía server (`lib/ky-thuat/cad/rule-packs/`, append-only).
- Mọi thay đổi bản vẽ trong 1 lệnh = 1 transaction = 1 nhóm UNDO; chỉ-kiểm không đụng bản vẽ.
- Làm tròn khối lượng CHỈ ở tổng mỗi item, không làm tròn từng đối tượng.
