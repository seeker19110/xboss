# M110 — Đặc tả: solver định tuyến tất định (một hệ, một mặt phẳng)

| Thuộc tính       | Giá trị                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | `XBOSS_VE_TUDONG`: cho hai điểm, máy **tự tìm đường** cho một tuyến — tránh kết cấu, ít cút nhất, ra polyline y hệt `XBOSS_VE` vẽ tay |
| Spec owner       | Phiên chính (tầng 1)                                                                                                                  |
| State            | **Draft — chờ duyệt.** Không code khi chưa `Approved for implementation`                                                              |
| Người/ngày duyệt | (chờ)                                                                                                                                 |
| Phụ thuộc        | **M109 PR1–PR2** (nền cao độ) — bắt buộc. Không có cao độ thì solver chỉ chạy được 1 hệ, và không mở tiếp lên đa hệ được              |
| Quyết định nền   | ADR-0006; hướng auto-routing chốt 2026-08-27: **solver tất định, KHÔNG LLM**                                                          |
| Vị trí lộ trình  | **Mốc 2** — mốc có tỷ lệ giá trị/rủi ro tốt nhất của hướng auto-routing                                                               |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

`XBOSS_VE` bắt kỹ sư **bấm từng đỉnh tuyến** (`ed.GetPoint` — `VeTuyenCommands.cs:391`). Máy lo đúng
chuẩn (layer, XData, nét biên, size), nhưng **người quyết đường đi**. Đặc tả M100 §2 O3 nói thẳng mục
tiêu là _"đúng chuẩn miễn phí, không phải thêm bước"_ — tức là M100 **chưa bao giờ** đặt mục tiêu tự
động vẽ.

Trong khi đó mọi thứ **hạ nguồn** của tuyến đã tự động sạch: nét biên (`EdgeOffset`), chia đốt
(`JointSegmenter`), giá đỡ, lỗ chờ, tag, bảng thống kê, bóc khối lượng. Nút thắt duy nhất còn lại là
**quyết định đường đi**.

**Và đây không phải bài toán AI.** Tìm đường trên lưới có chướng ngại là bài toán đã giải xong (A*/Lee).
Hồ sơ thi công bắt buộc **tái lập được** — cùng đầu vào phải ra cùng bản vẽ — nên solver tất định là
đúng công cụ, còn mô hình ngôn ngữ thì sai công cụ: nó thêm phi tất định, chi phí và phụ thuộc mạng mà
không cho thêm năng lực nào.

`grep` toàn repo: **chưa có thuật toán tìm đường nào.**

## 2. Outcome, metric và guardrail

- **O1** Cho 2 điểm trên cùng mặt bằng + 1 loại tuyến, máy sinh đường đi **hợp lệ** (không đâm kết cấu,
  đủ khoảng hở) trong **≤3 giây** trên mặt bằng điển hình.
- **O2** Kết quả chạy `XBOSS_KIEMTRA` ra **0 lỗi** thuộc nhóm plugin kiểm soát được — cùng chuẩn O1 của M100.
- **O3** **Tất định tuyệt đối:** cùng bản vẽ + cùng 2 điểm + cùng rule pack ⇒ **cùng một đường**, byte-for-byte.
- **O4** Đầu ra là polyline mang XData `XBOSS_VE` **không phân biệt được** với tuyến vẽ tay ⇒ mọi lệnh
  hạ nguồn chạy nguyên vẹn, **không sửa một dòng nào**.
- **O5** Số cút của đường máy tìm **không nhiều hơn** đường kỹ sư vẽ tay trên bộ đối chứng §15.4.
- **Guardrail:** 1 nhóm UNDO; **không đụng** đối tượng của bản thiết kế nền; không tìm được đường thì
  **từ chối kèm lý do**, tuyệt đối không vẽ đường đâm xuyên kết cấu; không có rule pack/thư viện block
  thì từ chối chạy (như mọi lệnh vẽ khác).
- **Stop:** phát hiện solver vẽ đường đâm kết cấu mà không báo → thu hồi bản phát hành ngay.

## 3. Nghiên cứu hiện trạng

| Thành phần                                              | Vai trò trong M110                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `XBoss.Cad.Core/Geometry/Segment2D.cs`                  | Hình học đoạn thẳng đã có — nền để dựng lưới và kiểm cắt                                   |
| `XBoss.Cad.Acad/Services/DrawingSnapshotBuilder.cs`     | Đã trích được `Layers` + `Entities` — **con mắt** của solver                               |
| `XBoss.Cad.Core/Draw/EdgeOffset.cs`                     | Nhận `IReadOnlyList<DinhPolyline>` — solver trả đúng kiểu này thì nét biên chạy ngay       |
| `XBoss.Cad.Core/Inspection/Inspector.cs` (18 phép kiểm) | **Oracle**: chấm kết quả solver trước khi cho nhận                                         |
| `XBoss.Cad.Acad/Services/VeThucThe.cs` (`TaoPolyline`)  | Đường tạo polyline dùng chung — solver **tái dùng nguyên**, không tự tạo thực thể          |
| `layerMap.groups` nhóm `STRUCTURAL`                     | Nguồn duy nhất xác định "cái gì là chướng ngại" (đã dùng cho dò giao của `XBOSS_VE_LOCHO`) |
| **M109** `elevationBands` + `caodotim`                  | Gán cao độ cho tuyến máy vẽ; nền để mở lên đa hệ ở M111                                    |
| **Mới** `Core/Routing/`                                 | Lưới, A*, hàm chi phí — **thuần**, test trên CI Linux                                      |

## 4. Phương án

| Điểm                | Phương án                                          | Kết luận                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cỗ máy              | LLM **vs** solver tất định                         | **Solver.** Hồ sơ phải tái lập được; A* là bài toán đã giải; LLM chỉ thêm phi tất định + chi phí + phụ thuộc mạng                                                                         |
| Không gian tìm kiếm | Lưới đều **vs** đồ thị tầm nhìn (visibility graph) | **Lưới đều.** Tuyến MEP gần như luôn trực giao; lưới cho ra đường trực giao tự nhiên, dễ giải thích với kỹ sư, và dễ test. Visibility graph tối ưu hơn nhưng ra đường xiên khó nghiệm thu |
| Thuật toán          | A* **vs** Dijkstra **vs** Lee                      | **A*** với heuristic Manhattan — đúng cho lưới trực giao, tất định khi khai rõ thứ tự phá hoà                                                                                             |
| Hàm chi phí         | Chỉ chiều dài **vs** chiều dài + phạt đổi hướng    | **Có phạt đổi hướng.** Mỗi lần đổi hướng = 1 cút = tiền vật tư + tổn thất áp + công lắp. Chỉ tối ưu chiều dài sẽ ra đường ngoằn ngoèo mà thợ không lắp                                    |
| Đầu ra              | Thực thể mới **vs** polyline như `XBOSS_VE`        | **Polyline y hệt.** `Curve` là thứ duy nhất `TakeoffScanner` đo ra mét được (`BlockReference` rơi vào nhánh **đếm**, mất khối lượng)                                                      |
| Bước lưới           | Cố định **vs** khai trong rule pack                | **Rule pack.** Bước lưới quyết định cả tốc độ lẫn độ mịn — phải chỉnh được theo dự án mà không sửa code                                                                                   |
| Không tìm được      | Trả đường "gần đúng" **vs** từ chối                | **Từ chối kèm lý do.** Đường đâm kết cấu tệ hơn hẳn không có đường                                                                                                                        |

## 5. Scope / non-goals

**Trong phạm vi:** lệnh `XBOSS_VE_TUDONG` (2 điểm → 1 tuyến, 1 hệ, 1 mặt bằng); lưới + A* + hàm chi phí ở
Core; chướng ngại lấy từ nhóm layer `STRUCTURAL`; khoảng hở theo rule pack; tự chèn phụ kiện tại mỗi khúc
(tái dùng đường của `XBOSS_VE_PHUKIEN`); tự chấm kết quả bằng `Inspector` trước khi cho nhận; hộp thoại
theo khung M106.

**Non-goals:** **đa hệ + clash 3D** (→ M111); tối ưu toàn tầng; chọn giúp phương án nào tốt hơn khi nhiều
phương án đều hợp lệ (**đây là quyết định có người chịu trách nhiệm — cố ý để cho người**); tránh tuyến
của hệ khác (chưa có cao độ đa hệ, thuộc M111); độ dốc tự động; LLM ở bất kỳ khâu nào.

## 6. User journeys và mọi trạng thái

1. **Đường chính:** chạy `XBOSS_VE_TUDONG` → hộp thoại chọn hệ + loại tuyến + cỡ (như `XBOSS_VE`) → bấm
   **điểm đầu**, bấm **điểm cuối** → máy tìm đường → **xem trước** (nét mờ + số liệu: chiều dài, số cút,
   số lần cắt qua vùng hẹp) → xác nhận → vẽ thật trong 1 nhóm UNDO, XData đầy đủ gồm `caodotim` của M109.
2. **Không tìm được đường:** báo rõ lý do phân biệt được — _"điểm đầu nằm trong vùng kết cấu"_ /
   _"không có hành lang nào đủ rộng cho ống 800 kèm khoảng hở 50"_ / _"hai điểm bị kết cấu chia cắt hoàn
   toàn"_. **Không vẽ gì.**
3. **Kết quả không đạt `Inspector`:** hiện lỗi, **không** cho nhận. Đây là chốt chặn cuối, không phải cảnh báo.
4. **Kỹ sư sửa sau khi nhận:** đường máy vẽ là polyline bình thường ⇒ kéo grip, TRIM, EXTEND đều chạy;
   sửa xong chạy lại `XBOSS_VE_NHAN`/`_CHIADOT` như tuyến vẽ tay.
5. **Trạng thái lỗi:** chưa nạp rule pack → từ chối (như mọi lệnh vẽ); rule pack chưa khai `routing` →
   từ chối kèm hướng dẫn; bản vẽ chưa chuẩn hoá (layer kết cấu chưa đúng chuẩn) → **cảnh báo mạnh** vì
   chướng ngại nhận diện theo layer, nhưng vẫn cho chạy nếu kỹ sư xác nhận.
6. **UI hỏng / `XBOSS_UI_DIALOG=0`:** về hỏi đáp dòng lệnh (FR9 của M106).

## 7. Functional / non-functional requirements

- **FR1** Nhận đúng 2 điểm; điểm nằm trong chướng ngại → từ chối ngay, nói rõ điểm nào.
- **FR2** Chướng ngại = mọi thực thể trên layer thuộc nhóm `STRUCTURAL` của `layerMap`, **nở ra** một
  khoảng bằng `nửa bề rộng tuyến + khoảng hở` khai trong rule pack.
- **FR3** A* trên lưới đều, bước lưới từ rule pack; chi phí = `chiều dài + phatDoiHuong × số lần đổi hướng`.
- **FR4** **Tất định:** khai rõ thứ tự duyệt hàng xóm và quy tắc phá hoà khi hai đường cùng chi phí ⇒
  chạy 100 lần ra 100 kết quả giống hệt.
- **FR5** Đầu ra `IReadOnlyList<DinhPolyline>` → đưa thẳng qua `VeThucThe.TaoPolyline`, **không** tự tạo thực thể.
- **FR6** Tự chèn phụ kiện tại mỗi lần đổi hướng, tái dùng đúng đường của `XBOSS_VE_PHUKIEN`.
- **FR7** Trước khi cho nhận: chạy `Inspector` trên đúng tập thực thể vừa sinh; có lỗi ⇒ **không nhận**.
- **FR8** Xem trước không được để lại rác: huỷ ⇒ bản vẽ **không đổi một byte**.
- **FR9** Toàn bộ solver **thuần**, không tham chiếu AutoCAD ⇒ test trên CI Linux.
- **FR10** Trần kích thước lưới; vượt ⇒ từ chối kèm **số đo thật** (không cắt âm thầm).

**NFR1** ≤3s trên mặt bằng điển hình (O1). **NFR2** Không gọi mạng — chạy được offline hoàn toàn.
**NFR3** Mọi nhãn/thông báo tiếng Việt.

## 8. Acceptance criteria

- **AC1** Hai điểm trên mặt bằng trống → ra đường trực giao ngắn nhất, **đúng 1 lần đổi hướng** (chữ L).
- **AC2** Có 1 tường chắn giữa → đường vòng qua, **không cắt** tường, giữ đủ khoảng hở.
- **AC3** Hai điểm bị kết cấu chia cắt hoàn toàn → **từ chối**, nêu đúng lý do, **không vẽ gì**.
- **AC4** Điểm đầu nằm trong chướng ngại → từ chối, nói rõ _điểm đầu_ hay _điểm cuối_.
- **AC5 (then chốt)** Chạy **100 lần** cùng đầu vào → 100 kết quả **giống hệt nhau** từng đỉnh.
- **AC6** Tăng `phatDoiHuong` → số cút **giảm hoặc giữ nguyên**, không bao giờ tăng.
- **AC7** Kết quả chạy `XBOSS_KIEMTRA` ra 0 lỗi nhóm plugin kiểm soát được.
- **AC8** Tuyến máy vẽ và tuyến vẽ tay **không phân biệt được** qua XData (trừ `caodonguon`);
  `XBOSS_VE_CHIADOT`/`_GIADO`/`_LOCHO`/`_NHAN`/`BOCKL` chạy trên nó y hệt.
- **AC9** Huỷ ở bước xem trước → bản vẽ không đổi (so sánh handle trước/sau).
- **AC10** Trên bộ đối chứng §15.4: số cút của máy **≤** số cút kỹ sư vẽ tay ở **mọi** ca.
- **AC11** Rule pack chưa khai `routing` → lệnh từ chối kèm hướng dẫn, các lệnh khác không ảnh hưởng.

## 9. Kiến trúc và điểm chạm code

```
DrawingSnapshotBuilder ─ layer STRUCTURAL ─→ Core/Routing/LuoiChuongNgai  (thuần)
rule pack routing{} ───────────────────────→ Core/Routing/HamChiPhi       (thuần)
                                                      ↓
                                             Core/Routing/TimDuong (A*)   (thuần, test CI)
                                                      ↓  IReadOnlyList<DinhPolyline>
                                             VeThucThe.TaoPolyline  ← dùng chung với XBOSS_VE
                                                      ↓
                                             Inspector  ← ORACLE, chặn trước khi nhận
```

| Việc             | Tệp                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Lưới chướng ngại | **mới** `XBoss.Cad.Core/Routing/LuoiChuongNgai.cs`                                                        |
| Hàm chi phí      | **mới** `XBoss.Cad.Core/Routing/HamChiPhi.cs`                                                             |
| A*               | **mới** `XBoss.Cad.Core/Routing/TimDuong.cs`                                                              |
| Lệnh             | **mới** `XBoss.Cad.Acad/Commands/VeTuDongCommands.cs`                                                     |
| Hộp thoại        | **mới** `XBoss.Cad.Core/Ui/ViewModels/TuDongDialogViewModel.cs` + `DataTemplate` trong `XBossDialog.xaml` |
| Đăng ký lệnh     | `XBoss.Cad.Core/Ui/LenhCatalog.cs` (**bắt buộc** khai `Buoc`/`ThuTuTrongBuoc`)                            |
| Rule pack        | `rule-packs/v11.json` + `RulePackLoader.ValidateRoutingV11`                                               |

## 10. API contract

**Không có route HTTP mới.** Hợp đồng nội bộ của Core:

```csharp
public static KetQuaTimDuong TimDuong(
    LuoiChuongNgai luoi, DiemLuoi dau, DiemLuoi cuoi, ThamSoChiPhi chiPhi);

public sealed record KetQuaTimDuong(
    IReadOnlyList<DinhPolyline>? Duong,   // null = không tìm được
    string? LyDoThatBai,                  // tiếng Việt, phân biệt được từng ca
    int SoLanDoiHuong,
    double ChieuDaiMm);
```

## 11. Data contract và DDL

**Không có migration.** Rule pack **v11** thêm:

```jsonc
"routing": {
  "source": "M110 — tham số solver định tuyến",
  "buocLuoiMm": 50,               // bước lưới; nhỏ hơn = mịn hơn nhưng chậm hơn
  "phatDoiHuongMm": 2000,         // 1 lần đổi hướng "đắt" bằng 2000mm chạy thẳng
  "khoangHoKetCauMm": 50,         // khoảng hở tối thiểu tới kết cấu
  "tranONhoNhat": 4000000,        // trần số ô lưới; vượt thì từ chối kèm số đo thật
  "nhomLayerChuongNgai": ["STRUCTURAL"]
}
```

> `phatDoiHuongMm` là **núm chỉnh quan trọng nhất** và nên hiệu chỉnh trên bản vẽ thật ở pilot: đặt thấp
> ra đường ngoằn ngoèo, đặt cao ra đường vòng xa. Giá trị trên là điểm khởi đầu, không phải kết luận.

## 12. Security / privacy / abuse

Không mạng, không DB, không quyền mới — solver chạy hoàn toàn cục bộ trong AutoCAD. Rủi ro duy nhất là
**tài nguyên**: lưới quá mịn trên mặt bằng lớn làm treo AutoCAD ⇒ chặn bằng `tranONhoNhat` (FR10).

## 13. UX / a11y / content

Hộp thoại theo khung M106; xem trước dùng màu nhấn của hệ đang vẽ + **kèm số liệu bằng chữ** (chiều dài,
số cút) chứ không chỉ bằng hình. Lý do từ chối phải **phân biệt được từng ca** (FR2 journey 2) — "không
tìm được đường" trơ trọi là vô dụng với người đứng ở công trường.

## 14. Observability và vận hành

Báo cáo phiên vẽ ghi mỗi lượt solver: số ô lưới, thời gian tìm, số cút, có bị `Inspector` chặn không.
Đây là dữ liệu để hiệu chỉnh `phatDoiHuongMm` và `buocLuoiMm` sau pilot.

## 15. Test plan

1. **Thuần (xunit, CI Linux) — phần lớn AC nằm ở đây:** mặt bằng trống → chữ L (AC1); 1 tường → vòng qua
   (AC2); chia cắt hoàn toàn → null + đúng lý do (AC3); điểm trong chướng ngại (AC4); **100 lần cùng kết
   quả (AC5)**; tăng `phatDoiHuong` → cút giảm (AC6); vượt trần lưới (FR10).
2. **Bộ đối chứng định tuyến (mới, `plugin-autocad/doi-chung/`):** ≥10 mặt bằng mẫu, mỗi cái kèm **đường
   kỹ sư vẽ tay** làm mốc so sánh, đo AC10.
   > ⚠️ Như bài học M108 §18 R4: đường vẽ tay làm mốc phải do **kỹ sư trưởng** vẽ, không phải người viết
   > code — tự dựng mốc rồi tự so với mốc của mình là đo thiên vị. Cờ `mocDaXacNhan` + test canh không
   > cho tự bật.
3. **Đối chứng hạ nguồn:** tuyến máy vẽ chạy `_CHIADOT`/`_GIADO`/`_LOCHO`/`BOCKL` ra kết quả hợp lệ (AC8).
4. **Verify tay** (§18): AC7, AC9 và toàn bộ trải nghiệm xem trước cần AutoCAD thật.

Cổng: đủ **14 cổng job `static`** + `test (Postgres)` + `plugin` + `plugin-shim`.

## 16. Kế hoạch slice/PR

| PR  | Nội dung                                                                                                                              | route đề nghị |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| PR1 | Core: `LuoiChuongNgai` + `HamChiPhi` + `TimDuong` + rule pack v11 + validator + **toàn bộ test (1)**. Chưa có lệnh, chưa đụng Adapter | `complex`     |
| PR2 | Adapter: `XBOSS_VE_TUDONG` + xem trước + `Inspector` chặn + hộp thoại M106 + `LenhCatalog`                                            | `spec`        |
| PR3 | Bộ đối chứng định tuyến + đo AC10 + báo cáo phiên vẽ                                                                                  | `standard`    |

**PR1 đứng một mình đã kiểm chứng được toàn bộ phần khó** — thuật toán và tính tất định đều test được
trên CI mà không cần AutoCAD. Nếu PR1 cho kết quả kém trên bộ mẫu thì dừng tại đó, chưa tốn công Adapter.

## 17. Rollout / rollback

Lệnh mới, **không đổi hành vi lệnh nào đang có** ⇒ rollback = không dùng lệnh. Rule pack v11 mở rộng
thuần, v10 vẫn chạy (lệnh mới từ chối, lệnh cũ y nguyên). Pilot: dùng trên **một mặt bằng phụ** trước,
so đường máy với đường kỹ sư, hiệu chỉnh `phatDoiHuongMm`, rồi mới dùng cho mặt bằng chính.

## 18. Risk / assumption / open decisions

| #      | Rủi ro / giả định                                                                               | Xử lý                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| R1     | Chướng ngại nhận diện **theo layer** — bản vẽ chưa chuẩn hoá thì nhận sai                       | Cảnh báo mạnh khi layer kết cấu không đúng chuẩn (journey 5); đây cũng là lý do M110 đứng sau pipeline chuẩn hoá |
| R2     | Đường "hợp lệ về hình học" chưa chắc **lắp được** (không gian thao tác, thứ tự lắp)             | Đúng, và **không định giải**. Người xác nhận là chốt chặn — mô hình "máy sinh, người chọn" đã chốt               |
| R3     | Kỹ sư quen vẽ tay không dùng lệnh mới                                                           | Đầu ra giống hệt tuyến vẽ tay nên dùng lẫn lộn được; không ép ai bỏ `XBOSS_VE`                                   |
| R4     | Lưới đều làm đường bám lưới trông "máy móc"                                                     | Đo ở pilot. Nếu thành vấn đề thật thì thêm bước làm mượt **sau** khi có đường hợp lệ, không đổi solver           |
| **O1** | **Xem trước vẽ bằng gì:** transient graphics (không vào DWG) hay thực thể tạm trên layer riêng? | **Cần chốt ở PR2.** Transient sạch hơn (AC9 hiển nhiên đúng) nhưng API khó hơn                                   |
| **O2** | Có cho chọn **điểm giữa bắt buộc phải đi qua** (waypoint) không?                                | **Đề nghị KHÔNG ở bản đầu** — giữ phạm vi nhỏ. Mở lại nếu pilot cho thấy cần                                     |

> ⛔ **Điều kiện tiên quyết:** (a) **M109 PR1–PR2 phải xong** — không có cao độ thì M110 dừng ở một hệ và
> không mở lên M111 được; (b) **verify tay** trên máy có AutoCAD 2026 — PR2 thao tác trên bản vẽ thật,
> mà plugin chưa từng chạy thật lần nào.

## 19. Approval

- [ ] Người duyệt: ……… — ngày ………
- [ ] Xác nhận M109 PR1–PR2 đã xong trước khi bắt đầu PR1
- [ ] Chuyển State thành `Approved for implementation` trước khi code
