# Verify tay trên máy có AutoCAD 2026 — M100 (bộ lệnh vẽ) + M101 (nâng trần)

> **Vì sao phải làm bằng tay:** `XBoss.Cad.Acad` chỉ build được trên Windows có ObjectARX SDK 2026, dự án **không có runner Windows có license** (M99 §18). CI Linux chỉ kiểm được:
>
> - `XBoss.Cad.Core` — toàn bộ logic thuần (hình học, quy tắc, Excel): **440 ca xunit**;
> - `plugin-shim` — biên dịch thử Adapter bằng stub API AutoCAD: bắt lỗi **cú pháp + sai chữ ký**, **KHÔNG** bắt được sai **hành vi**.
>
> Vì vậy mọi thứ dưới đây chỉ có thể xác nhận trên AutoCAD thật. **Chưa chạy xong checklist này thì chưa phát hành cho kỹ sư dùng.**

**Thời lượng ước tính:** 60–90 phút cho toàn bộ. Cần 1 người biết dùng AutoCAD.
**Người chạy / ngày:** ................................................

---

## 0. Chuẩn bị (làm một lần)

### 0.1 Kiểm nền .NET của AutoCAD — **BẮT BUỘC, làm lại sau MỖI bản cập nhật AutoCAD**

Ngày 2026-08-25 chính máy người dùng đổi từ .NET 8 sang .NET 10 chỉ sau vài tiếng do AutoCAD tự cập nhật, làm build đổ `CS1705`.

```powershell
$b = [IO.File]::ReadAllBytes("C:\Program Files\Autodesk\AutoCAD 2026\acmgd.dll")
[regex]::Matches([Text.Encoding]::UTF8.GetString($b), '\.NET[A-Za-z]*,Version=v[0-9\.]+') |
  ForEach-Object { $_.Value } | Select-Object -Unique
```

- Kết quả phải khớp `TargetFramework` của `plugin-autocad/XBoss.Cad.Acad/XBoss.Cad.Acad.csproj` (hiện **`net10.0-windows`**).
- Lệch → sửa `TargetFramework` + cổng CI "Kiểm TargetFramework từng project" theo giá trị **thật**, cập nhật M99 §9.1, rồi mới build.
- ☐ Nền .NET khớp: `_______________`

### 0.2 Build + cài plugin

```powershell
# Đóng AutoCAD trước (DLL đang nạp thì không ghi đè được)
powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1
```

Mở AutoCAD 2026 → dòng lệnh phải hiện `[XBoss] Plugin ... đã nạp`.
☐ Plugin nạp OK — bản build ngày: `_______________`

### 0.3 Ghép thiết bị + rule pack

```
XBOSS_LOGIN
```

→ duyệt mã trên `/engineering/thiet-bi-cad` → nhận token.
☐ LOGIN OK ☐ Rule pack tải về, version = **v7** (nếu khác v7, phần lớn ca dưới đây sẽ sai — dừng lại và báo)

### 0.4 Thư viện block — điều kiện tiên quyết của AC4/AC5/AC7/AC8/AC10/AC12/AC13

Repo **chỉ có bộ mẫu tối thiểu để test** (`plugin-autocad/doi-chung/block-lib-manifest-mau.json`). Thư viện thật (các block `XB-*` vẽ đúng chuẩn công ty) là việc của **kỹ sư trưởng / CAD manager**.

Tối thiểu để chạy hết checklist, thư viện cần có:

| Id block        | Tên block                  | Kind       | Dùng cho ca    |
| --------------- | -------------------------- | ---------- | -------------- |
| `elbow-duct`    | `XB-DUCT-ELBOW`            | fitting    | AC5            |
| `fcu-unit`      | `FCU` (có attribute `TAG`) | equipment  | AC4, AC7, AC14 |
| `titleblock-a1` | `XB-TB-A1` (khổ A1)        | titleblock | AC10           |
| `support-duct`  | `XB-SUP-DUCT`              | support    | AC12           |
| `sleeve-wall`   | `XB-SLEEVE-W`              | sleeve     | AC13           |
| `slope-arrow`   | (mũi tên dốc)              | fitting    | mục 3.2        |

⚠️ **Quy ước kích thước block chưa chốt:** block có `scaleBySize` hiện được giả định **vẽ theo kích thước danh nghĩa 1 đơn vị** rồi plugin scale theo bề rộng thật. Nếu CAD manager vẽ theo mm thật (vd 100mm), tỉ lệ chèn sẽ **sai 100 lần**. Chốt quy ước này trước khi vẽ thư viện.

☐ Thư viện đã phát hành trên web, version = `_______________`

### 0.5 Bản vẽ thử

Tạo bản vẽ mới, **`INSUNITS` = Millimeters** (gõ `UNITS`). Ca nào cần đơn vị khác sẽ ghi rõ.
☐ INSUNITS = mm

---

## 1. AC1–AC14 (M100 — bộ lệnh vẽ)

> Cách ghi kết quả: ✔ đạt · ✘ không đạt (ghi rõ hiện tượng + ảnh chụp màn hình) · — không chạy được (ghi lý do).

### ☐ AC1 — Vẽ tuyến: layer, nét biên, 1 UNDO

1. `XBOSS_VE_NEN` → chọn hệ **HVAC**.
2. `XBOSS_VE` → loại tuyến **Ống gió cấp** → size **300x200** → vẽ 1 tuyến thẳng ngang, dài bất kỳ → Enter kết thúc.

**Phải đạt:**

- Tim nằm layer **`M-DUCT-SUPP`** (chọn nét tim → `LIST` hoặc bảng Properties).
- Có **2 nét biên** trên layer **`M-DUCT-SUPPEDGE`** — chú ý **hậu tố liền, KHÔNG có dấu gạch**. (Hậu tố `-EDGE` từng bị chính token-matcher tách token nên layer biên vẫn khớp layer tim ⇒ bóc trùng khối lượng; đã đổi có chủ đích, xem M100 §11.)
- Đo khoảng cách tim → mỗi nét biên = **150** (= 300/2). Dùng `DIST`.
- Gõ **`U` một lần** → **cả tim lẫn 2 nét biên biến mất cùng lúc**. (Nếu phải UNDO nhiều lần là **KHÔNG đạt** — vi phạm FR10.)

Kết quả: ......... Khoảng cách đo được: ......... mm

### ☐ AC2 — Bản vẽ vẽ bằng lệnh XBoss phải sạch lỗi

1. Vẽ vài tuyến của 2–3 hệ khác nhau bằng `XBOSS_VE`, chèn vài phụ kiện/thiết bị.
2. `XBOSS_KIEMTRA`.

**Phải đạt:** **0 lỗi** ở 3 nhóm: _layer sai chuẩn_, _lệch Z_, _lineweight lệch CTB_.
(Các nhóm khác — font, dim override, rác hình học… — có thể có nếu bản vẽ nền bẩn; chỉ 3 nhóm trên là thứ lệnh vẽ chịu trách nhiệm.)

Kết quả: ......... Số lỗi 3 nhóm: .........

### ☐ AC3 — Bóc khối lượng: đúng số, nét biên không cộng vào

1. Bản vẽ mới. `XBOSS_VE_NEN` → **PIPING**.
2. `XBOSS_VE` → **Ống CHW** → size **DN50** → vẽ tuyến thẳng **đúng 10000 mm** (gõ toạ độ: điểm 1 `0,0` ↵ điểm 2 `10000,0` ↵) → Enter.
3. `XBOSS_BOCKL` → `XBOSS_BOCKL_XUAT`.

**Phải đạt:** dòng item `chw-pipe` = **10.00 m** (không phải 20.00 — nếu ra 20 nghĩa là nét biên bị cộng vào, lỗi nghiêm trọng).
_Ghi chú:_ CHW khai `edgeStyle: none` nên không sinh nét biên; muốn thử đúng ca "biên không cộng" thì làm lại với **Ống gió cấp 300x200** và kiểm dòng `duct-supp` = 10.00 m.

Kết quả: `chw-pipe` = ......... m · `duct-supp` = ......... m

### ☐ AC4 — Thiết bị đếm được

1. `XBOSS_VE_THIETBI` → chọn **FCU** → chèn **3 cái** → nhập TAG cho từng cái.
2. `XBOSS_BOCKL` → `XBOSS_BOCKL_XUAT`.

**Phải đạt:** item `fcu-unit` = **3 Bộ**.
Kết quả: ......... Bộ

### ☐ AC5 — Phụ kiện xoay theo tuyến

1. Vẽ 1 tuyến ống gió **xiên** (vd điểm 1 `0,0` → điểm 2 `1000,1000` = 45°).
2. `XBOSS_VE_PHUKIEN` → chọn **co (elbow)** → bấm 1 điểm **trên tim**.

**Phải đạt:** block xoay đúng **45°** (chọn block → Properties → Rotation; sai số ≤ 0.1°).
Thử thêm: bấm **đúng tại đỉnh gãy** của tuyến polyline → block lấy **hướng đi vào** đỉnh.

Kết quả: góc đo được = ......... °

### ☐ AC6 — Đổi size: dựng lại biên, gỡ đánh dấu bóc

1. Vẽ tuyến ống gió **300x200**, chạy `XBOSS_BOCKL` (tuyến chuyển màu đánh dấu).
2. `XBOSS_VE_DOI` → chọn tuyến đó → size mới **400x250**.

**Phải đạt (đủ 4 điều):**

- Nét biên **dựng lại** đúng bề rộng mới: tim → biên = **200** (= 400/2), đo bằng `DIST`.
- Nhãn size (nếu đã đặt bằng `XBOSS_VE_NHAN`) cập nhật thành `400x250`.
- Có **cảnh báo** rằng đoạn này đã bóc và **đánh dấu bóc bị gỡ** (tuyến trả về màu trước khi bóc).
- 1 UNDO hoàn tác trọn vẹn.

Kết quả: ......... Khoảng cách biên mới: ......... mm

### ☐ AC7 — Trùng tên block: phải HỎI, không ghi đè âm thầm

1. Trong bản vẽ, tạo/chèn sẵn một block **tên `FCU`** nhưng **hình khác** thư viện.
2. `XBOSS_VE_THIETBI` → chèn `FCU`.

**Phải đạt:** plugin **hỏi** (giữ bản trong bản vẽ / cập nhật theo thư viện), **không tự ghi đè**. Chọn từng phương án và kiểm kết quả đúng như đã chọn.
**Phải đạt thêm:** lựa chọn đó được ghi vào báo cáo — chạy `XBOSS_VE_BAOCAO`, mở tệp `<tên>.dwg.xboss-ve.json` cạnh DWG, tìm mục nhật ký.

Kết quả: .........

### ☐ AC8 — Thư viện tự cập nhật theo ETag

1. Trên web `/engineering/chuan-hoa-ban-ve` → mục **Thư Viện Block** → phát hành **version mới**.
2. Trên máy AutoCAD: `XBOSS_LOGIN` lại.

**Phải đạt:** plugin tải bản mới (không phải bản cũ trong cache), hash manifest khớp tệp `.dwg`. Kiểm cache tại `%APPDATA%\XBoss\block-lib\`.
Kết quả: version trước ......... → sau .........

### ☐ AC9 — Rule pack mới không phá lệnh cũ _(có thể kiểm không cần vẽ)_

Chạy `XBOSS_KIEMTRA`, `XBOSS_CHUANHOA`, `XBOSS_BOCKL` trên một bản vẽ cũ đã dùng với plugin M99 trước đây.
**Phải đạt:** kết quả **y hệt** trước khi nâng cấp (rule pack v5/v6/v7 mọi mục mới đều mặc định TẮT).
Kết quả: .........

### ☐ AC10 — Trang in: viewport khóa đúng tỉ lệ

1. `XBOSS_VE_TRANGIN` → khổ **A1** → tỉ lệ **1:50** → chọn vùng in (2 điểm hoặc polyline ranh giới).

**Phải đạt:**

- Layout mới được tạo, tên theo pattern (`SHOP-...`).
- Viewport **khóa** (chọn viewport → Properties → _Display locked_ = **Yes**).
- **Đo tỉ lệ thật:** vẽ tạm 1 đoạn dài **1000 mm** trong model → trên giấy phải đúng **20 mm** (1000/50).
- Khung tên chèn đúng khổ A1, các attribute đã điền (DỰ ÁN / HẠNG MỤC / TỈ LỆ / NGÀY / NGƯỜI VẼ).
- In ra PDF: nét đúng bảng CTB (nét cắt đậm hơn nét tim).
- 1 UNDO xóa trọn layout vừa tạo.

Kết quả: đo trên giấy = ......... mm (kỳ vọng 20)

⚠️ **Rủi ro cao nhất của checklist này** nằm ở đây: các API `Layout` / `PlotSettingsValidator` / `Viewport.FreezeLayersInViewport` **chưa từng dùng trong repo trước đây**, chỉ mới được stub xác nhận chữ ký. Nếu ca này đổ, chụp nguyên văn thông báo lỗi.

### ☐ AC11 — Mặt cắt bán tự động

1. Vẽ 3 tuyến **song song nhau, cách nhau khoảng đã biết**: ống gió **300x200**, CHW **DN50**, máng cáp **200x100**.
2. `XBOSS_VE_MATCAT` → kẻ tuyến cắt vuông góc qua cả 3 → chọn điểm đặt hình cắt → nhập cao độ từng tuyến.

**Phải đạt:**

- Hình cắt có **đúng 3 ký hiệu**, đúng loại: chữ nhật 300×200, **tròn** DN50, chữ nhật máng 200×100.
- **Khoảng cách ngang giữa các ký hiệu = khoảng cách thật giữa các tim** (đo bằng `DIST` cả hai nơi rồi so).
- Nhãn size đúng, tên mặt cắt `A-A` xuất hiện ở hai đầu tuyến cắt.
- Tiêu đề hình cắt có ghi chú **"cao độ nhập tay — kiểm tra tại hiện trường"** (bản vẽ 2D không chứa cao độ thật, plugin không được bịa).

Kết quả: khoảng cách thật ......... / trên hình cắt .........

### ☐ AC12 — Giá đỡ: 6 cái, bước 2000

1. Vẽ tuyến ống gió **đúng 10000 mm**, size 300x200 (`supportSpacingMm` = 2400).
2. `XBOSS_VE_GIADO` → chọn tuyến → giữ **chế độ mặc định**.

**Phải đạt:**

- Đặt đúng **6 giá đỡ**, bước **2000 mm** mỗi khoảng, **0 cảnh báo**.
- Chạy lại `XBOSS_VE_GIADO` trên chính tuyến đó → **không thêm cái nào**.
- `XBOSS_BOCKL` → item `support-hanger` đếm ra **6 Bộ**.
- Thử chế độ `GANNHAT` → ra **5 giá đỡ**, bước 2500, và **phải có cảnh báo vượt chuẩn 2400**.

> Vì sao 6 chứ không phải 5: khoảng cách treo đỡ là **ngưỡng tối đa** — 5 giá đỡ nghĩa là 4 khoảng × 2500 mm, **vượt** 2400. Đặc tả bản đầu ghi "5" là sai số học, đã sửa 2026-08-25.

Kết quả: số giá đỡ ......... · bước ......... mm · BOCKL đếm .........

### ☐ AC13 — Lỗ chờ: bảng builder's work

1. Vẽ 3 tuyến ống xuyên qua đối tượng trên layer kết cấu (`S-GRID-COLS`).
2. `XBOSS_VE_LOCHO` → chèn sleeve tại 3 điểm → chọn chế độ **xuất bảng**.

**Phải đạt:**

- Table trong bản vẽ **và** tệp Excel đều có **đúng 3 dòng**.
- Size sleeve = size ống + khe hở rule pack (**HVAC: +50**; ống nước: +25). Ví dụ `DN50` → `DN75`; `300x200` → `350x250`.
- `XBOSS_BOCKL` → item `sleeve-opening` đếm ra **3 Cái**.

Kết quả: số dòng ......... · size sleeve mẫu: ......... → .........

### ☐ AC14 — Tag: phát hiện trùng, đánh lại

1. Chèn 2 FCU rồi **sửa tay** cho **trùng tag** (vd cả hai `FCU-05-01`).
2. `XBOSS_VE_TAG` → quét.

**Phải đạt:**

- Báo đúng **2 đối tượng** trùng.
- Đánh lại tuần tự → hết trùng.
- Tag đã **khóa** thì giữ nguyên khi đánh lại.

Kết quả: .........

---

## 2. M101 — phần cần AutoCAD thật

7 phép kiểm mới và 4 bước chuẩn hóa mới **mặc định TẮT**, nên hành vi hôm nay không đổi. Chỉ kiểm khi bật:

### ☐ 2.1 Bóc theo vùng

Vẽ tuyến **10000 mm**, kẻ polyline ranh giới kín cắt tuyến ở mốc **6000**. `XBOSS_BOCKL` → chọn vùng.
**Phải đạt:** vùng A = **6.00 m**, vùng B = **4.00 m**; Excel có cột **VÙNG** + sheet `Tong-hop-vung`.
Kết quả: ......... / .........

### ☐ 2.2 Cách nhiệt (nếu bật `derivedFrom` cho dự án)

Ống gió **300x200 dài 10 m** → dòng dẫn xuất phải ra **10.00 m²** (= 10 × (0.3+0.2) × 2).
Kết quả: ......... m²

### ☐ 2.3 Đọc size từ nhãn (bán tự động)

Tuyến **không** vẽ bằng `XBOSS_VE` (không có XData) nhưng có nhãn text `300x200` gần đó → cột **NGUỒN SIZE** phải ghi _đọc từ nhãn_; nhãn quá xa → size **để trống**, tuyệt đối **không đoán**.
Kết quả: .........

### ☐ 2.4 Bốn bước chuẩn hóa mới (chỉ khi bật trong rule pack)

Bật lần lượt từng khối rồi chạy `XBOSS_CHUANHOA` trên bản sao bản vẽ bẩn:
`styleMap` (dim/text style) · `xrefPolicy` (mặc định **chỉ báo**, không bind) · `hatchMap` · `layoutPolicy`.
**Phải đạt:** dimension **không mất liên kết** (kéo thử điểm đo, số phải đổi theo); 1 UNDO hoàn tác cả pipeline.
Kết quả: .........

### ☐ 2.5 Batch bóc hàng loạt

`XBOSS_BATCH` → chế độ **BocKL** → chọn thư mục nhiều DWG.
**Phải đạt:** 1 Excel tổng có cột **Tệp**; **bản gốc không đổi** (so `Date modified` trước/sau); tệp lỗi bị bỏ qua và ghi vào nhật ký.
Kết quả: .........

---

## 3. Điểm đã biết là còn hở — kiểm nhưng không tính là lỗi mới

### 3.1 API chưa có tiền lệ trong repo

Chỉ được stub xác nhận **chữ ký**, chưa ai chạy thật. Đổ ở đây là bình thường, chụp lỗi rồi báo:
`Layout` / `LayoutManager` / `PlotSettingsValidator` / `Viewport.FreezeLayersInViewport` (AC10) · `WblockCloneObjects` khi nhập định nghĩa block (AC7) · `Table` + `db.Tablestyle` (`XBOSS_VE_THONGKE`, AC13) · `Entity.IntersectWith` (dò kết cấu, AC13) · `Hatch.SetHatchPattern` / `Database.BindXrefs` (mục 2.4).

### 3.2 Mũi tên hướng dốc

Chỉ chèn được khi thư viện có block `slope-arrow`; thiếu block → **chỉ in text `i=…%`** (đúng thiết kế, không bịa tên block). Mũi tên quay theo **chiều vẽ tuyến**.

### 3.3 `XBOSS_LOGIN` chưa lấy rule pack theo dự án

Muốn cột A (mã BOQ) tự điền theo dự án: vào web → **Tải Rule Pack Của Dự Án** → nạp bằng `XBOSS_RULEPACK`. Nếu thấy bất tiện, cần quyết định "chọn dự án lúc LOGIN" (đổi luồng M99).

### 3.4 Hai dữ liệu công ty chưa chốt

- **Bộ trường bắt buộc của khung tên** — phép kiểm 12 đang dùng bộ tạm `DU_AN, HANG_MUC, TEN_BAN_VE, MA_BAN_VE, TY_LE, NGAY`, hiện TẮT. Chốt trước khi bật.
- **Tên tệp CTB** — rule pack chưa khai, nên `XBOSS_VE_TRANGIN` **hỏi** kỹ sư chọn. Muốn tự động thì khai thêm khóa ở version rule pack sau.

---

## 4. Khi một ca KHÔNG đạt

1. Chụp màn hình + **copy nguyên văn** dòng lệnh AutoCAD (kể cả stack trace nếu có).
2. Ghi lại: version plugin, version rule pack, version thư viện block, `INSUNITS`, tên lệnh, các lựa chọn đã nhập.
3. Lưu bản vẽ tái hiện được (`.dwg`) — đây là thứ giá trị nhất để sửa.
4. Báo về, kèm số hiệu ca (vd "AC10 không đạt").

**Không được** tự sửa rule pack đã phát hành để "chữa" lỗi — rule pack là **append-only**, sửa = phát hành version mới.

---

## 5. Kết luận

☐ Toàn bộ AC1–AC14 đạt → **đủ điều kiện phát hành cho kỹ sư dùng thật** (khuyến nghị pilot hẹp: 1 kỹ sư, 1 hệ HVAC, 1 mặt bằng trước khi phổ biến).
☐ Còn ca chưa đạt: `_______________________________` → chưa phát hành.

Người chạy: ....................... Ngày: ............... Chữ ký: ...............
