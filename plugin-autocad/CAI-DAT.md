# Cài đặt plugin XBoss cho AutoCAD — hướng dẫn cho kỹ sư

Tài liệu này dành cho **người dùng cuối** (kỹ sư MEP/QS trên máy trạm). Người phát hành gói cài xem
phần build/đóng gói trong [`README.md`](README.md), hoặc hướng dẫn build từ đầu trên Windows ở
[`BUILD-WINDOWS.md`](BUILD-WINDOWS.md).

> **Điều kiện bắt buộc: AutoCAD 2026** (một nền duy nhất, **.NET 10** — M99 §9.1 cập nhật 2026-08-25). Bản 2021–2024 chạy
> runtime khác nên **không nạp được** plugin; plugin đọc `ACADVER` lúc nạp và báo tiếng Việt rồi
> dừng, thay vì lỗi khó hiểu giữa chừng. AutoCAD LT không hỗ trợ.

## 0. Trước bản cài đầu tiên trong công ty (người phát hành làm 1 lần)

**Kiểm lại sau MỖI bản cập nhật AutoCAD** (không chỉ khi đổi đời): ngày 2026-08-25, một bản cập
nhật AutoCAD 2026 đã đổi Managed API từ .NET 8 sang **.NET 10** chỉ trong vài tiếng, khiến plugin
build cho nền cũ không biên dịch lại được. Nền hiện tại: **.NET 10**. Lệnh kiểm (chỉ đọc tệp):

```powershell
$b = [IO.File]::ReadAllBytes("C:\Program Files\Autodesk\AutoCAD 2026\acmgd.dll")
$s = [Text.Encoding]::UTF8.GetString($b)
[regex]::Matches($s, '\.NET[A-Za-z]*,Version=v[0-9\.]+') | ForEach-Object { $_.Value } | Select-Object -Unique
```

Không ra `.NETCoreApp,Version=v10.0` → **dừng lại**, báo đội phát triển sửa `TargetFramework` theo
giá trị thật rồi build lại (M99 §9.1).

## 1. Lấy gói cài

Vào XBoss → **Chuẩn hóa bản vẽ CAD** (`/engineering/chuan-hoa-ban-ve`) → khối **Bảng Điều Khiển
Plugin AutoCAD** → nút **Tải Gói Cài Plugin**.

Nếu chỗ đó hiện hướng dẫn thay vì nút tải, nghĩa là quản trị chưa khai biến `XBOSS_PLUGIN_URL` —
hỏi quản trị hệ thống, đừng tự tải gói từ nguồn khác.

## 2. Cài

1. Đóng hẳn AutoCAD.
2. Giải nén gói vào: `%APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle\`
   (đường dẫn cuối phải đúng dạng `...\ApplicationPlugins\XBoss.bundle\PackageContents.xml`).
3. Mở AutoCAD 2026. Dòng lệnh hiện `[XBoss] Plugin ... đã nạp` là xong.

**Gỡ cài đặt:** đóng AutoCAD, xoá thư mục `XBoss.bundle`. Không để lại gì trong bản vẽ.

## 3. Đăng nhập lần đầu (ghép thiết bị)

1. Trong AutoCAD gõ `XBOSS_LOGIN` → plugin hiện **mã ghép** dạng `XXXX-XXXX` (sống 10 phút).
2. Mở XBoss trên trình duyệt → **Thiết Bị & Token** (`/engineering/thiet-bi-cad`) → nhập mã → **Duyệt**.
3. Quay lại AutoCAD: plugin nhận token (hạn 90 ngày) và tự tải bộ quy tắc đang phát hành.

Token lưu trong **Windows Credential Manager**, không ghi ra tệp. Mất máy/nghi lộ → vào trang Thiết
Bị & Token bấm **Thu hồi**; lần gọi kế tiếp của máy đó nhận 401 và phải ghép lại.

**Máy không ra được mạng nội bộ:** tải tệp JSON bộ quy tắc từ bảng điều khiển (nút _Tải JSON_), chép
sang máy trạm rồi gõ `XBOSS_RULEPACK` chọn tệp. Chuẩn hóa vẫn chạy, nhưng **không tải bản vẽ lên
được** cho tới khi bộ quy tắc khớp bản đang phát hành (chủ đích — M99 AC8).

## 4. Dùng hằng ngày

| Lệnh               | Làm gì                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XBOSS_KIEMTRA`    | Chỉ kiểm, **không đụng bản vẽ**; xuất báo cáo JSON cạnh tệp DWG                                                                                                                                                   |
| `XBOSS_CHUANHOA`   | Chuẩn hóa theo bộ quy tắc; sai thì **1 lần UNDO** về nguyên trạng                                                                                                                                                 |
| `XBOSS_BOCKL`      | Bóc khối lượng theo layer, tô màu + đánh dấu vùng đã bóc (chạy lại không trùng)                                                                                                                                   |
| `XBOSS_BOCKL_XOA`  | Gỡ đánh dấu, trả màu từng đối tượng về đúng màu trước khi bóc                                                                                                                                                     |
| `XBOSS_BOCKL_XUAT` | Xuất Excel đúng mẫu công ty (công thức sống) để gửi QS; tuỳ chọn kéo KL BOQ hợp đồng từ máy chủ → sheet `Doi-chieu`                                                                                               |
| `XBOSS_UPLOAD`     | Gửi bản vẽ đã chuẩn hóa về XBoss (server kiểm định lại rồi mới ghi sổ)                                                                                                                                            |
| `XBOSS_RULEPACK`   | Nạp tệp rule pack JSON bằng tay (khi chưa ghép thiết bị hoặc máy không ra được mạng nội bộ — làm 1 lần, cache ở máy); đã ghép thiết bị thì nạp xong tự cảnh báo nếu plugin đang dùng bản cũ hơn server (dòng `⚠`) |
| `XBOSS_BATCH`      | Xử lý hàng loạt cả thư mục; **bản gốc giữ nguyên**, kết quả vào `da-chuan-hoa/`                                                                                                                                   |
| `XBOSS_VE_DEXUAT`  | Đề xuất block vào thư viện: chọn block trên bản vẽ → dialog metadata → gửi hàng chờ (Admin/PM duyệt trên web); yêu cầu `XBOSS_LOGIN`                                                                              |
| `XBOSS_VE…`        | Bộ lệnh **vẽ shop drawing** đúng chuẩn ngay từ đầu — xem mục 4b bên dưới                                                                                                                                          |
| `XBOSS_BANG`       | Bật/tắt **bảng điều khiển XBoss**: xem nhanh đã đăng nhập chưa, rule pack nào đang nạp, kết quả kiểm tra/bóc tách gần nhất, phiên bản plugin so với server                                                        |

**Cảnh báo phiên bản cũ:** khi `XBOSS_RULEPACK` hoặc bảng `XBOSS_BANG` báo plugin đang chạy bản cũ
hơn server, tải bản mới ở XBoss → `/engineering/cai-dat-plugin` rồi cài lại theo mục 2. Mất mạng
hoặc chưa ghép thiết bị thì không cảnh báo gì (không đủ dữ liệu để so) — không phải là lỗi.

**Không cần thuộc tên lệnh:** trên Ribbon có tab **XBoss** — đủ nút cho mọi lệnh trên, chia theo
nhóm Kết nối / Chuẩn hóa / Bóc khối lượng / Vẽ shop drawing, rê chuột vào nút là có chú thích
tiếng Việt. Bấm nút giống hệt gõ lệnh.

Trình tự khuyên dùng: `XBOSS_KIEMTRA` → `XBOSS_CHUANHOA` → kiểm mắt → `QSAVE` → `XBOSS_UPLOAD`.

## 4b. Vẽ shop drawing bằng bộ lệnh `XBOSS_VE_*`

Ý tưởng: **không vẽ tay rồi sửa chuẩn sau nữa**. Vẽ bằng bộ lệnh này thì nét/block sinh ra đã đúng
layer, đúng block chuẩn công ty, mang sẵn size bên trong — nên `XBOSS_KIEMTRA` không báo lỗi và
`XBOSS_BOCKL` bóc không sót, không nhầm hệ. Mọi câu hỏi hiện ngay trên dòng lệnh AutoCAD (gõ số thứ
tự hoặc từ khóa); **ESC bất cứ lúc nào là bản vẽ nguyên trạng**, và mỗi lệnh chỉ cần **1 lần `U`
(UNDO)** để bỏ hết những gì nó vừa tạo.

**Cần có trước:** đã `XBOSS_LOGIN` (để có bộ quy tắc **và thư viện block**). Máy không ra được mạng
thì nạp tay: `XBOSS_RULEPACK` cho bộ quy tắc, `XBOSS_VE_THUVIEN` cho thư viện block (chọn tệp
`manifest.json`, tệp `.dwg` để cạnh nó).

Thư viện block có **hai tầng** (M113): bộ dùng chung toàn công ty + bộ riêng của dự án (khung tên,
ký hiệu theo CĐT) đè lên. Chọn dự án ở câu hỏi của `XBOSS_LOGIN` là plugin tự tải đúng bộ của dự án
đó; chưa chọn thì dùng bộ toàn cục như trước. Muốn biết một block đang lấy từ đâu:
`XBOSS_VE_THUVIEN` → `Nguon` (cột `[Dự án]` / `[Toàn cục]`), hoặc xem dòng "Bộ đang dùng" trên
bảng `XBOSS_BANG`.

### Trình tự một buổi vẽ

| Bước | Lệnh                            | Làm gì                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `XBOSS_VE_HANHLANG`             | (M114, chỉ khi rule pack bật `routingPolicy`) Khai **hành lang đi ống** một lần cho cả tầng: vẽ tim hành lang mới hoặc **nhận** polyline trục hành lang có sẵn (giữ nguyên từng đỉnh), kèm bề rộng khả dụng, cao độ đáy dầm/trần và hệ nào được đi qua. Sửa/xóa cũng bằng lệnh này — xóa hành lang còn hệ đi qua thì lệnh nêu rõ hệ nào rồi hỏi lại                                                                                                                            |
| 2    | `XBOSS_VE_NEN`                  | Chọn hệ sắp vẽ → nền thiết kế bị khóa + làm mờ, layer đích được tạo sẵn. **Vẽ xong chạy lại lệnh này để trả nền về như cũ**                                                                                                                                                                                                                                                                                                                                                    |
| 3    | `XBOSS_VE_TUYENTUDONG`          | (M114, chỉ khi rule pack bật `routingPolicy`) Nối **cả một hệ trong một lượt** theo hành lang đã khai ở bước 1: quét chọn thiết bị (Enter = mọi thiết bị của hệ chưa có tuyến) → chọn vùng cấm nếu có (Enter = bỏ qua) → bấm điểm nguồn → xem bảng đề xuất + nét mảnh tạm rồi bấm OK. **Không bấm OK là bản vẽ không đổi gì.** Thiết bị nào không nối được thì lệnh **nói rõ vì sao** chứ không vẽ đại. Chạy lại được nhiều lần — nhánh nào bạn đã sửa tay thì lệnh giữ nguyên |
| 4    | `XBOSS_VE`                      | Vẽ tay phần còn lại (nhánh lắt léo, đoạn ngoài hành lang): chọn loại tuyến → size → (độ dốc nếu là ống thoát) → bấm điểm như PLINE. Ống gió/máng tự có 2 nét biên đúng bề rộng                                                                                                                                                                                                                                                                                                 |
| 5    | `XBOSS_VE_PHUKIEN` / `_THIETBI` | Chèn co/tê/van/miệng gió bám tuyến (tự xoay theo tuyến) và thiết bị FCU/AHU… (nhập `TAG` ngay lúc chèn)                                                                                                                                                                                                                                                                                                                                                                        |
| 6    | `XBOSS_VE_NHAN`                 | Bấm tuyến → nhãn size tự ghi (kèm `i=2%` + mũi tên hướng dốc nếu có). **Không gõ tay** nên nhãn không bao giờ lệch tuyến                                                                                                                                                                                                                                                                                                                                                       |
| 7    | `XBOSS_VE_GIADO` / `_LOCHO`     | Rải giá đỡ cách đều đúng chuẩn treo đỡ; chèn lỗ chờ xuyên tường/sàn rồi `XUATBANG` để có bảng builder's work (Table + Excel) gửi kết cấu                                                                                                                                                                                                                                                                                                                                       |
| 8    | `XBOSS_VE_TAG` / `_THONGKE`     | Đánh tag tuần tự + tìm tag trùng; sinh bảng thiết bị/khối lượng ngay trong bản vẽ                                                                                                                                                                                                                                                                                                                                                                                              |
| 9    | `XBOSS_VE_NGATNET`              | Chỗ hai tuyến khác hệ cắt nhau: tuyến đi dưới **ngắt nét** cho bản vẽ đọc được ai trên ai dưới. Ai đi trên do bộ quy tắc quyết, cặp nào muốn ngược lại thì tích ô **Đảo** trong hộp thoại. Muốn bỏ: `XBOSS_VE_NGATNET_XOA`                                                                                                                                                                                                                                                     |
| 10   | `XBOSS_VE_MATCAT` / `_TRANGIN`  | Dựng mặt cắt từ tuyến đã vẽ (cao độ **nhập tay**); tạo trang in đúng khổ/tỉ lệ, viewport đã khóa, khung tên điền sẵn                                                                                                                                                                                                                                                                                                                                                           |
| 11   | `XBOSS_VE_REV*`                 | Nộp lại sau khi sửa: `XBOSS_VE_REV` khoanh vùng đã sửa (plugin **đề xuất sẵn** vùng nào đổi so với lần chốt trước), `XBOSS_VE_REV_CHOT` ghi bảng revision vào khung tên mọi layout, `XBOSS_VE_REV_HIENTHI` chỉ hiện lần sửa mới nhất khi in                                                                                                                                                                                                                                    |
| 12   | `XBOSS_VE_BAOCAO`               | Xem lại cả buổi vẽ: bao nhiêu tuyến/block theo hệ, bao nhiêu nhánh do đi tuyến tự động sinh, có size nào nằm ngoài danh mục không                                                                                                                                                                                                                                                                                                                                              |

### Bốn việc hay phải làm lại

- **Đổi size/hệ đoạn đã vẽ:** dùng `XBOSS_VE_DOI`, đừng sửa tay. Lệnh đổi luôn layer, nhãn và
  **dựng lại nét biên** theo size mới; đoạn nào đã bóc khối lượng thì lệnh gỡ đánh dấu và nhắc
  **chạy lại `XBOSS_BOCKL`** (số cũ đã sai).
- **Đi tuyến tự động lại sau khi thêm/bớt thiết bị hay dời hành lang:** cứ chạy lại
  `XBOSS_VE_TUYENTUDONG` cho đúng hệ đó. Lệnh xóa các nhánh tự động cũ rồi dựng lại theo kết quả
  mới (chỗ chiếm làn trong hành lang được gỡ trước khi cấp lại), nên chạy bao nhiêu lần cũng ra
  cùng một bản vẽ. **Nhánh nào bạn đã kéo/sửa tay thì lệnh nhận ra và giữ nguyên** — muốn nó được
  dựng lại thì xóa hẳn nhánh đó rồi chạy lệnh. Nhánh bị dựng lại mà từng bóc khối lượng thì lệnh
  nhắc **chạy lại `XBOSS_BOCKL`**.
- **Vẽ nhầm hệ:** cứ `U` (UNDO) một lần cho mỗi lệnh — tim, nét biên và nhãn của một lần vẽ đi liền
  một khối.
- **Size không có trong danh mục:** vẫn gõ được, plugin đánh dấu là size ngoài danh mục và liệt kê
  trong `XBOSS_VE_BAOCAO` để kỹ sư trưởng bổ sung vào bộ quy tắc bản sau.

- **Khoanh revision cho lần nộp sau:** chốt xong một lần phát hành bằng `XBOSS_VE_REV_CHOT` thì
  plugin nhớ mốc; lần sửa sau chạy `XBOSS_VE_REV` là có sẵn danh sách "vùng đã đổi mà chưa khoanh".
  Bản vẽ **chưa từng chốt** revision thì chưa đề xuất được — lần đầu khoanh tay, plugin nói rõ lý do.

### Khi lệnh vẽ từ chối chạy

| Hiện tượng                                               | Nguyên nhân & xử lý                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| "cần rule pack từ v4 trở lên"                            | Bộ quy tắc trên máy quá cũ → `XBOSS_LOGIN` (hoặc `XBOSS_RULEPACK` nạp tệp mới)                                                                    |
| "Chưa có thư viện block trên máy"                        | `XBOSS_LOGIN` để tải, hoặc `XBOSS_VE_THUVIEN` nạp tệp tay. Riêng `XBOSS_VE` (vẽ tuyến) **không cần** thư viện                                     |
| Nhãn độ dốc chỉ có chữ, không có mũi tên                 | Thư viện chưa có block `slope-arrow` — plugin **không tự vẽ ký hiệu thay thế**; báo kỹ sư trưởng bổ sung thư viện                                 |
| "Rule pack chưa khai supportSpacingMm/sleeveClearanceMm" | Thiếu số liệu chuẩn treo đỡ/khe hở cho loại tuyến đó — plugin không tự bịa; bổ sung ở bản quy tắc sau                                             |
| Báo bản vẽ đang khóa layer                               | Đang trong chế độ nền của `XBOSS_VE_NEN` → chạy lại `XBOSS_VE_NEN` để hoàn nguyên rồi thử lại                                                     |
| "Đi tuyến tự động đang TẮT trong rule pack"              | `drawTools.routingPolicy.enabled = false` (mặc định) → nhờ Admin/PM bật rồi phát hành bản quy tắc mới                                             |
| Đi tuyến tự động báo "quá bán kính rẽ nhánh"             | Thiết bị nằm xa mọi hành lang hơn `snapRadiusMm` → **vẽ thêm hành lang** tới khu đó rồi chạy lại. Lệnh cố ý **không** nới bán kính cho ra kết quả |
| Đi tuyến tự động báo "hết làn"                           | Hành lang đó đã kín làn cho các hệ chạy trước → tăng bề rộng khả dụng bằng `XBOSS_VE_HANHLANG` (chế độ `SUA`), hoặc cho hệ này đi hành lang khác  |

## 4c. Hoàn thiện bản vẽ từ tuyến tim bằng `XBOSS_TUYEN_*` / `XBOSS_HOANTHIEN` (M115)

Ý tưởng: **chỉ vẽ tay đúng một thứ** — line/pline tuyến tim từ điểm nguồn tới thiết bị bằng AutoCAD
thuần (không cần lệnh `XBOSS_VE`) — rồi để plugin tự hoàn thiện phần còn lại (nét đôi, phụ kiện,
chia đốt, giá đỡ, lỗ chờ, ngắt nét, tag, thống kê) bằng cách điều phối lại đúng bộ lệnh `XBOSS_VE_*`
đã quen thuộc ở mục 4b. Con người quyết _đi đâu_, máy lo _vẽ đúng chuẩn thế nào_.

**Cần có trước:** rule pack từ **v16** (khối `drawTools.completionPolicy`, mặc định TẮT — nhờ
Admin/PM bật rồi phát hành bản quy tắc mới nếu lệnh báo chưa đủ version).

| Bước | Lệnh                | Làm gì                                                                                                                                                                                                           |
| ---- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | AutoCAD thuần       | Vẽ **line/pline tuyến tim** từ điểm nguồn tới từng thiết bị (block thư viện đã đặt sẵn). Rẽ nhánh = pline chạm/giao tuyến chính                                                                                  |
| 2    | `XBOSS_TUYEN_GAN`   | Chọn 1..n tuyến vừa vẽ → hộp thoại chọn hệ/size/cao độ/vật liệu/kiểu nối → ghi thuộc tính cho cả lô một lượt; layer khớp `layerMap` thì hệ được điền sẵn                                                         |
| 3    | `XBOSS_TUYEN_DOTHI` | Dựng đồ thị + kiểm: gộp điểm chạm/giao thành nút, suy tê/co-cút/giảm/lên-xuống, snap đầu tuyến vào thiết bị đúng hệ. Hộp thoại hiện danh sách nút/nhánh/phụ kiện suy ra để **duyệt/sửa** trước khi hoàn thiện    |
| 4    | (trong hộp thoại)   | **Duyệt đồ thị** — sửa từng điểm chưa ưng (đổi loại tê/co, bỏ qua). Tuyến hở/thiếu size/sai hệ bị **chặn**, có danh sách lỗi bấm-tới-đối-tượng                                                                   |
| 5    | `XBOSS_HOANTHIEN`   | Hoàn thiện bản vẽ — chạy chuỗi 8 giai đoạn (`VE_NEN` → `VE_PHUKIEN` → `VE_CHIADOT` → `VE_GIADO` → `VE_LOCHO` → `VE_NGATNET` → `VE_TAG` → `VE_THONGKE`) trên cả cụm tuyến, xem trước + bỏ qua được từng giai đoạn |
| 6    | Tay                 | Sửa phần chưa ưng — bản vẽ là "draft ~80%". Chạy lại bước 5 an toàn (idempotent), **không đụng tọa độ tuyến tim**                                                                                                |
| 7    | (đã có)             | `XBOSS_KIEMTRA` → `XBOSS_BOCKL` → `XBOSS_UPLOAD` như quy trình hiện hành                                                                                                                                         |

Mất mạng thì dùng rule pack/thư viện block cache offline M113 như mọi lệnh khác, không chặn.

## 4d. Phối hợp xung đột 2D liên hệ bằng `XBOSS_PHOIHOP*` (M116)

Ý tưởng: sau khi các hệ đã hoàn thiện theo M115 (đủ hệ/cao độ/cỡ trong XData), plugin **quét ra
xung đột giữa các hệ** trên bản vẽ combined services (hoặc bản vẽ hệ mình + xref các hệ khác) rồi
**đề xuất cách xử lý theo luật** — kỹ sư quyết, plugin **không bao giờ tự sửa tuyến**.

**Cần có trước:** rule pack từ **v17** (khối `drawTools.coordinationPolicy`, mặc định TẮT — nhờ
Admin/PM bật rồi phát hành bản quy tắc mới nếu lệnh báo chưa đủ version).

| Bước | Lệnh                   | Làm gì                                                                                                                                                                                                                                                                           |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `XBOSS_PHOIHOP`        | Chọn phạm vi (cả bản vẽ / vùng chọn / theo hành lang) → quét 3 lớp kiểm: giao cắt cùng cao độ (CỨNG), tranh chấp hành lang (MỀM), khoảng cách quy phạm (CẢNH BÁO). Hộp thoại liệt kê + đề xuất xử lý, đánh dấu **chấp nhận** (tự sửa tay) hoặc **bỏ qua có lý do** cho từng dòng |
| 2    | Tay                    | Xử lý theo đề xuất (thường là sửa cao độ bằng `XBOSS_TUYEN_GAN` rồi chạy lại `XBOSS_HOANTHIEN`), rồi chạy lại bước 1 — trạng thái đã đánh dấu **giữ nguyên** (idempotent theo id)                                                                                                |
| 3    | `XBOSS_PHOIHOP_BAOCAO` | Xuất bảng xung đột ra Excel + sidecar JSON cạnh DWG — `XBOSS_UPLOAD` gửi kèm để web hiện số liệu phối hợp trên bảng điều khiển                                                                                                                                                   |
| —    | `XBOSS_PHOIHOP_XOA`    | Gỡ sạch marker phối hợp trên layer `XBOSS-PHOIHOP`, trả bản vẽ về đúng trước khi chạy `XBOSS_PHOIHOP` — tuyến không đụng                                                                                                                                                         |

Mất mạng thì dùng rule pack cache offline M113 như mọi lệnh khác, không chặn.

## 5. Trục trặc thường gặp

| Hiện tượng                                      | Nguyên nhân & xử lý                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Mở AutoCAD không thấy dòng `[XBoss] ... đã nạp` | Sai đường dẫn `XBoss.bundle`, hoặc không phải AutoCAD 2026 — xem lại bước 2 và điều kiện đầu trang     |
| Lệnh báo "chưa nạp bộ quy tắc"                  | Chạy `XBOSS_LOGIN` (có mạng) hoặc `XBOSS_RULEPACK` (nạp tệp JSON)                                      |
| Gọi lệnh nhận **401**                           | Token hết hạn hoặc đã bị thu hồi → `XBOSS_LOGIN` ghép lại                                              |
| `XBOSS_UPLOAD` báo **422** kèm danh sách lỗi    | Server kiểm định không đạt — sửa đúng các lỗi liệt kê rồi tải lại; **không có bản vẽ nào được ghi sổ** |
| `XBOSS_UPLOAD` báo trùng rev                    | Rev đó đã có với nội dung khác → tăng rev rồi gửi lại                                                  |
| Báo bộ quy tắc cũ hơn bản đang phát hành        | `XBOSS_LOGIN` để cập nhật, **chuẩn hóa lại**, rồi mới tải lên (AC8)                                    |
| Khối lượng bóc lệch bất thường                  | Kiểm `$INSUNITS` của bản vẽ — báo cáo có cảnh báo khi bản vẽ không dùng mm (plugin đã tự quy đổi)      |
| Bóc lần 2 ra 0                                  | Đúng như thiết kế: vùng đã bóc mang dấu chống trùng — dùng `XBOSS_BOCKL_XOA` nếu muốn bóc lại từ đầu   |

## 6. Cần nhớ

- Bản vẽ **không rời hạ tầng tự host** của công ty; plugin không gửi nội dung bản vẽ đi đâu khác.
- Plugin **không tự cập nhật ngầm** — nâng cấp là do người phát hành công bố gói mới.
- Đổi quy tắc chuẩn hóa = **phát hành phiên bản rule pack mới** trên server, không sửa bản đã phát hành.
