# Plugin AutoCAD XBoss — chuẩn hóa bản vẽ & bóc tách khối lượng (M99, tầng 2)

Plugin .NET 8 cho **AutoCAD 2026** (một nền duy nhất — M99 §9.1), thi hành ADR-0006:
chuẩn hóa bản vẽ và bóc tách khối lượng chạy bằng chính API AutoCAD trên máy kỹ sư;
quy tắc tải từ XBoss dưới dạng **rule pack** có version (không nhúng cứng).

## Cấu trúc

| Project           | Nền              | Vai trò                                                                                                                                                                                 |
| ----------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XBoss.Cad.Core`  | `net8.0`         | Toàn bộ quy tắc THUẦN: matcher token-boundary, ánh xạ layer, giải mã font TCVN3/VNI, kiểm tra, gộp khối lượng, ghi Excel (ClosedXML) — **không tham chiếu AutoCAD**, test trên CI Linux |
| `XBoss.Cad.Tests` | `net8.0`         | xunit — nạp rule pack THẬT từ `lib/ky-thuat/cad/rule-packs/v2.json` của repo (chống trôi 2 tầng)                                                                                        |
| `XBoss.Cad.Acad`  | `net8.0-windows` | Adapter AutoCAD: lệnh `XBOSS_*`, đo hình học, áp thay đổi trong 1 nhóm UNDO — **chỉ build trên Windows có ObjectARX SDK 2026**                                                          |

## Lệnh trong AutoCAD

| Lệnh               | Chức năng                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XBOSS_LOGIN`      | Ghép thiết bị với server XBoss (M99 PR2): xin mã → duyệt trên trang web `/engineering/thiet-bi-cad` → nhận token (cất **Windows Credential Manager**, hạn 90 ngày, thu hồi được trên web) → tự tải rule pack mới nhất (ETag)                                                                                        |
| `XBOSS_RULEPACK`   | Nạp tệp rule pack JSON bằng tay (đường dự phòng offline) — cache `%APPDATA%\XBoss\rule-pack.json`. Chưa có rule pack (qua LOGIN hoặc lệnh này) thì mọi lệnh khác từ chối chạy                                                                                                                                       |
| `XBOSS_KIEMTRA`    | Chỉ kiểm, không sửa — 9 phép kiểm: layer sai chuẩn, lệch Z, polyline hở/gần kín, font TCVN3/VNI, lineweight lệch CTB, dim override, rác hình học, layer rỗng, block nặc danh — khoanh tròn vị trí lỗi trên layer tạm `XBOSS_KIEMTRA_MARK` (không in, tự dọn) + báo cáo JSON `<tệp>.dwg.xboss-kiemtra.json` cạnh DWG |
| `XBOSS_CHUANHOA`   | Pipeline thứ tự cố định: Audit → layer mapping → font → flatten Z=0 → overkill → purge → lineweight/CTB + gỡ dim override. Xem trước diff, xác nhận, **1 lần UNDO hoàn tác toàn bộ**; báo cáo JSON ghi cạnh DWG                                                                                                     |
| `XBOSS_BOCKL`      | Bóc khối lượng theo rule pack (`takeoff`): đo chiều dài/diện tích/đếm block theo layer mapping, quy đổi INSUNITS, tô màu vùng đã bóc + XData chống bóc trùng                                                                                                                                                        |
| `XBOSS_BOCKL_XOA`  | Gỡ đánh dấu bóc (trả đúng màu trước khi bóc, xoá XData) — toàn bộ hoặc theo vùng chọn                                                                                                                                                                                                                               |
| `XBOSS_BOCKL_XUAT` | Xuất Excel **đúng mẫu công ty** (`attachments/MAU-KHOI-LUONG-BOQ.xlsx`, sheet `Data-BOQ`, cột A–K + công thức H/J/K sống, tổng nhóm hệ + TỔNG CỘNG bằng `SUBTOTAL` sống) từ trạng thái bóc đang lưu trong DWG — đóng/mở lại bản vẽ vẫn xuất được; kèm sidecar JSON máy-đọc-được cạnh tệp Excel                      |
| `XBOSS_BATCH`      | Xử lý hàng loạt cả thư mục `.dwg` qua side database (không mở lên editor): chế độ chỉ-kiểm (mặc định) hoặc chuẩn hóa — **bản gốc giữ nguyên**, kết quả vào thư mục con `da-chuan-hoa/`, tệp lỗi bỏ qua, nhật ký `xboss-batch-log.txt` + báo cáo JSON từng tệp                                                       |

| `XBOSS_UPLOAD` | Gửi DWG đã lưu + DXF sidecar + báo cáo chuẩn hóa + version rule pack lên server (M99 PR5): server kiểm định lại DXF + rule pack — đạt thì tạo `drawing_revision` trạng thái `submitted`, fail thì hiện đủ lỗi trong AutoCAD, KHÔNG tạo revision. Idempotent theo hash DWG (gửi lại cùng tệp không tạo bản đôi) |

## Build

### Core + Tests (mọi HĐH — đây là phần CI chạy)

```bash
dotnet test plugin-autocad/XBoss.Cad.Tests/XBoss.Cad.Tests.csproj
```

Test nạp rule pack thật từ repo nên phải chạy bên trong repo XBoss.

### Adapter (Windows + ObjectARX SDK 2026)

1. Cài ObjectARX SDK 2026 (hoặc dùng thẳng thư mục cài AutoCAD 2026 — nơi có
   `acdbmgd.dll`, `acmgd.dll`, `accoremgd.dll`).
2. **Xác minh runtime trước bản phát hành đầu tiên** (M99 §9.1 — assumption duy nhất còn lại):

   ```powershell
   [System.Reflection.Assembly]::LoadFrom("C:\Program Files\Autodesk\AutoCAD 2026\acmgd.dll").ImageRuntimeVersion
   ```

   Không phải runtime .NET 8 → sửa `TargetFramework` của `XBoss.Cad.Acad` theo giá trị thật
   và cập nhật M99 §9.1. Đồng thời xác minh `ACADVER` của 2026 (hằng `PluginExtension.AcadVer2026`
   đang là `25.1`).

3. Build:

   ```powershell
   dotnet build plugin-autocad/XBoss.Cad.Acad/XBoss.Cad.Acad.csproj -c Release -p:AcadSdkDir="C:\Program Files\Autodesk\AutoCAD 2026"
   ```

## Đóng gói `.bundle` và cài đặt

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

1. `XBOSS_LOGIN` (lần đầu / khi token hết hạn) — ghép thiết bị + tự tải rule pack. Không có mạng thì dùng `XBOSS_RULEPACK` nạp tệp tay.
2. Mở bản vẽ nhận từ CĐT/TVTK → `XBOSS_KIEMTRA` xem mức lệch chuẩn.
3. `XBOSS_CHUANHOA` → kiểm tra kết quả (sai thì UNDO 1 lần) → QSAVE.
4. Làm shop drawing như bình thường.
5. `XBOSS_BOCKL` trên bản vẽ shop đã duyệt → `XBOSS_BOCKL_XUAT` → gửi tệp Excel cho QS
   (QS điền cột F — KL BOQ hợp đồng; cột H/J/K tự tính trạng thái CHẶN/OK theo mẫu công ty).

## Ràng buộc thiết kế phải giữ khi sửa code

- **Core không được tham chiếu assembly AutoCAD** (FR17) — mọi quy tắc mới viết ở Core kèm test.
- Matcher token-boundary chỉ có MỘT bản cài (`TokenMatcher`) dùng chung layer mapping + takeoff.
- Không nhúng cứng quy tắc chuẩn hóa/bóc tách vào code — thêm quy tắc = phát hành rule pack
  version mới phía server (`lib/ky-thuat/cad/rule-packs/`, append-only).
- Mọi thay đổi bản vẽ trong 1 lệnh = 1 transaction = 1 nhóm UNDO; chỉ-kiểm không đụng bản vẽ.
- Làm tròn khối lượng CHỈ ở tổng mỗi item, không làm tròn từng đối tượng.
