# M107 — Đặc tả Nhận tuyến có sẵn thành tuyến XBoss (`XBOSS_VE_NHANTUYEN`)

| Thuộc tính       | Giá trị                                                                                                                                                                        |
| :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Kỹ sư có bản thiết kế của người khác, muốn dùng bộ lệnh XBoss trên đó mà **không phải vẽ lại toàn bộ tuyến**                                                                   |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                                                                           |
| State            | **Approved for implementation** (người dùng chốt 2026-08-26: "triển khai, nhận xong đổi layer qua layer chuẩn của hệ + size chuẩn, có sinh nét biên, chọn nhiều cùng kích cỡ") |
| Người/ngày duyệt | Seeker / 2026-08-26                                                                                                                                                            |
| Cập nhật         | 2026-08-26                                                                                                                                                                     |
| Phụ thuộc        | M100 (`XBOSS_VE` — XData tim, `EdgeOffset`, layer chuẩn), M105 (chia đốt đọc XData), M106 (khung hộp thoại WPF)                                                                |

---

## 1. Vấn đề

Mọi lệnh vẽ của M100 trở đi đều đòi tuyến mang **XData `XBOSS_VE`** (hệ + cỡ), vì phụ kiện phải tự
xoay/scale theo cỡ, nhãn phải lấy cỡ từ dữ liệu chứ không gõ tay, chia đốt phải biết cỡ để chọn kiểu
nối, và `XBOSS_BOCKL` phải biết bóc vào hạng mục nào. Polyline của bản thiết kế gốc **không có gì
trong đó** — nên `XBOSS_VE_PHUKIEN` từ chối thẳng: _"không phải TUYẾN TIM do XBOSS_VE vẽ"_.

Hệ quả trong thực tế: bối cảnh dùng phổ biến nhất — nhận bản vẽ thiết kế rồi bổ sung chi tiết thi
công — lại là bối cảnh plugin **không giúp được gì**, trừ khi kỹ sư vẽ đè lại toàn bộ tuyến.

## 2. Outcome và guardrail

- **Target:** một lệnh khai cỡ cho cả loạt tuyến có sẵn; sau đó **mọi lệnh XBoss dùng được ngay** —
  phụ kiện, nhãn, chia đốt, giá đỡ, sleeve, tag, bóc khối lượng.
- **Guardrail:**
  1. **Không đụng hình học.** Chỉ đổi layer, gán XData, và THÊM nét biên. Đỉnh polyline giữ nguyên
     từng tọa độ — kỹ sư nhận tuyến để dùng tiếp, không phải để plugin nắn lại bản vẽ của người khác.
  2. **Không nhận thứ không phải tuyến.** Chỉ nhận `Polyline` (LWPOLYLINE) và `Line`; từ chối kèm lý
     do với mọi loại khác. Không nhận đối tượng thuộc **xref** (quy tắc đã chốt 2026-08-26).
  3. **1 lệnh = 1 nhóm UNDO**, hỏi đáp ngoài transaction (luật M100 §6.11).
  4. Chạy lại trên tuyến đã nhận: **cập nhật tại chỗ**, không nhân đôi nét biên.

## 3. Scope / non-goals

**Trong phạm vi:** lệnh `XBOSS_VE_NHANTUYEN`; hộp thoại WPF theo khung M106; đổi layer về layer
chuẩn của hệ; gán XData `XBOSS_VE`; sinh nét biên cho loại tuyến `edgeStyle: "double"`; nhận **nhiều
tuyến cùng lúc với chung một cỡ**.

**Non-goals:** tự đoán cỡ từ nhãn có sẵn (đó là đường `sizeFromNearbyText` của bóc khối lượng, khác
việc); nối/cắt/nắn hình học; nhận `Arc`/`Spline`/block (báo rõ, không nhận); đổi cỡ tuyến đã nhận
(đã có `XBOSS_VE_DOI`).

## 4. Functional requirements

- **FR1** Vùng chọn: kỹ sư quét chọn nhiều đối tượng. Lọc ra `Polyline`/`Line` không thuộc xref;
  đối tượng bị loại **đếm và báo theo lý do** (không phải polyline / thuộc xref / đã là tuyến XBoss).
- **FR2** Hộp thoại (M106): hệ → loại tuyến → cỡ từ danh mục rule pack (cho nhập ngoài danh mục kèm
  cờ `custom` + cảnh báo) → độ dốc khi `slopeRequired`. Hiện **chỉ đọc**: số tuyến sẽ nhận, layer
  đích, bề rộng nét biên suy từ cỡ. Một cỡ áp cho **toàn bộ** vùng chọn (người dùng chốt).
- **FR3** Với mỗi tuyến nhận được:
  1. Đổi `Layer` về **layer chuẩn của loại tuyến** trong rule pack (`DamBaoLayer` tạo nếu chưa có).
  2. Ghi XData `XBOSS_VE` vai trò `Tim`: `[systemId, itemId, size, rulePackVersion, custom?, slope?]`
     — **cùng cấu trúc** tuyến do `XBOSS_VE` vẽ, để mọi lệnh sau không phân biệt được nguồn gốc.
  3. `edgeStyle: "double"` → sinh 2 nét biên qua `EdgeOffset.Tinh` trên layer `<layer><edgeLayerSuffix>`,
     liên kết XData 2 chiều như `XBOSS_VE`. Offset thất bại (tuyến tự cắt, góc quá gắt) → **chỉ nhận
     tim + cảnh báo nêu tên tuyến**, tuyệt đối không vẽ biên sai (luật M100 §18).
- **FR4** `Line` được nhận: chuyển thành `Polyline` 2 đỉnh **cùng tọa độ** rồi xử lý như trên (mọi
  lệnh sau đều giả định tim là polyline). Ghi rõ trong báo cáo là đã chuyển kiểu.
- **FR5** Chạy lại trên tuyến đã có XData `XBOSS_VE`: coi là **nhận lại** — xóa nét biên cũ của đúng
  tuyến đó rồi dựng lại theo cỡ mới, cập nhật XData. Không sinh biên chồng biên.
- **FR6** Tuyến đã nhận có dấu bóc (`XBOSS_BOCKL`) hoặc dấu chia đốt: **gỡ dấu bóc và xóa vạch chia**
  kèm nhắc chạy lại — cùng lý do với `XBOSS_VE_DOI` (cỡ đổi thì số đốt và khối lượng đều sai).
- **FR7** Tóm tắt cuối lệnh: số tuyến đã nhận, số nét biên sinh ra, số đối tượng bỏ qua theo từng lý
  do, và cảnh báo cỡ ngoài danh mục nếu có.

## 5. Acceptance criteria

- **AC1** Chọn 5 polyline của bản thiết kế gốc → nhận với cỡ `800x400` hệ HVAC → cả 5 đổi sang layer
  chuẩn, mang XData, có 2 nét biên mỗi tuyến cách nhau 800.
- **AC2** Ngay sau AC1, `XBOSS_VE_PHUKIEN` bấm lên các tuyến đó **không còn bị từ chối**; `XBOSS_VE_NHAN`
  ghi đúng cỡ; `XBOSS_VE_CHIADOT` chọn được kiểu nối theo cỡ.
- **AC3** Vùng chọn lẫn text/block/arc và một xref → chỉ nhận polyline/line ngoài xref, phần bỏ qua
  được đếm và nêu lý do.
- **AC4** Chạy lại trên chính các tuyến đó với cỡ khác → nét biên dựng lại theo cỡ mới, **không** có
  biên cũ còn sót; dấu bóc bị gỡ kèm cảnh báo.
- **AC5** Một lần `U` hoàn tác trọn vẹn: layer, XData, nét biên đều trở lại nguyên trạng.
- **AC6** Hình học tim không đổi: so tọa độ từng đỉnh trước/sau phải trùng khít.
- **AC7** `XBOSS_UI_DIALOG=0` → lệnh chạy bằng hỏi đáp dòng lệnh, kết quả trùng khít đường hộp thoại.

## 6. Điểm chạm code

| Tầng     | Tệp                                                                                                              | Vai trò                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Acad     | `XBoss.Cad.Acad/Commands/VeNhanTuyenCommands.cs` (mới)                                                           | Lệnh `XBOSS_VE_NHANTUYEN`                              |
| Core     | `XBoss.Cad.Core/Ui/ViewModels/NhanTuyenDialogViewModel.cs` (mới)                                                 | Trạng thái hộp thoại + quy tắc khóa OK (test được)     |
| Acad     | `Ui/Wpf/XBossDialog.xaml`                                                                                        | Thêm `DataTemplate` cho lệnh mới                       |
| Core     | `Ui/LenhCatalog.cs`                                                                                              | Khai lệnh (bước 3 — Vẽ shop drawing), Ribbon tự có nút |
| Dùng lại | `VeLayerService.DamBaoLayer`, `EdgeOffset.Tinh`, `VeXDataStore`, `VeThucThe.XoaChiaDotCua`, `MarkService.Unmark` | không viết cơ chế thứ hai                              |
