# M112 — Đặc tả Sơ đồ đứng (riser) bán tự động (`XBOSS_VE_TRUCDUNG` + `XBOSS_VE_RISER`)

| Thuộc tính       | Giá trị                                                                                                                                         |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Hồ sơ MEPF bắt buộc có sơ đồ đứng cho mỗi trục kỹ thuật; hiện vẽ tay hoàn toàn và **luôn lệch** so với mặt bằng sau vài vòng sửa                |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                                            |
| State            | **Draft** — chờ duyệt                                                                                                                           |
| Người/ngày duyệt |                                                                                                                                                 |
| Cập nhật         | 2026-08-28                                                                                                                                      |
| Nguồn            | `M100-xboss-ve-shop-drawing.md` §20 hàng 4 ("cần dữ liệu liên tầng có cấu trúc — chỉ khả thi sau khi nhân bản tầng + vùng/tầng M101 chạy thật") |
| Phụ thuộc        | **M111 (nhân bản tầng — nguồn dữ liệu tầng)**, M100 (`SectionBuilder`, `sheetSetup`, XData), M101 PR3 (vùng), M106 (hộp thoại)                  |

> **Điều kiện tiên quyết:** không thi hành M112 trước khi M111 đã chạy thật qua pilot. Lý do ghi ở
> M100 §20 và giữ nguyên: sơ đồ đứng chỉ đúng khi dữ liệu tầng đã có cấu trúc và đáng tin.

---

## 1. Vấn đề

Sơ đồ đứng là bản vẽ **suy ra** từ mặt bằng: cùng một trục kỹ thuật xuyên qua N tầng, mỗi tầng có
một nhánh rẽ. Vẽ tay nghĩa là chép số liệu bằng mắt từ N mặt bằng, nên **cứ sửa mặt bằng là sơ đồ
đứng lệch** — và không ai phát hiện cho tới khi thi công.

Nền 2D không chứa cao độ thật (luật M100 §6.3: bản vẽ 2D không có Z đáng tin, `XBOSS_VE_MATCAT` phải
**hỏi** cao độ chứ không bịa). Nên M112 đi đúng con đường của `XBOSS_VE_MATCAT`: **bán tự động** —
hình học và số liệu tuyến lấy từ dữ liệu XBoss đã có, chỉ **cao độ tầng** là kỹ sư khai một lần.

## 2. Cách làm — hai lệnh, hai việc tách bạch

1. **`XBOSS_VE_TRUCDUNG` (đánh dấu điểm trục đứng).** Trên mỗi mặt bằng tầng, kỹ sư chỉ điểm tuyến
   đi lên/xuống và khai **mã trục** (`TR-01`) + chiều (`len`/`xuong`/`xuyen`). Plugin đặt một block
   ký hiệu mang XData vai trò mới `TrucDung`: `{maTruc, tang, chieu, heId, itemId, size, handleTim}`.
   Đây là **dữ liệu liên tầng có cấu trúc** mà M100 §20 nói là còn thiếu — và nó nằm trong DWG, cùng
   chỗ với mọi dữ liệu khác của plugin.
2. **`XBOSS_VE_RISER` (dựng sơ đồ đứng).** Gom mọi điểm `TrucDung` cùng `maTruc` trong bản vẽ, xếp
   theo thứ tự tầng của `floorPolicy.floors` (M111), dựng sơ đồ: trục đứng + nhánh rẽ mỗi tầng + nhãn
   cỡ/hệ + đường cao độ tầng + bảng chú thích. Cao độ tầng lấy từ `floorPolicy.floorElevations` (khóa
   mới, §4), thiếu thì **hỏi**, không bịa.

## 3. Scope / non-goals

**Trong phạm vi:** 2 lệnh trên; khóa rule pack `drawTools.riserPolicy` + `floorPolicy.floorElevations`;
dựng sơ đồ dạng **schematic một đường** (không tỉ lệ theo phương ngang, đúng quy ước riser);
idempotent (chạy lại cập nhật đúng sơ đồ đó); phép kiểm mới "sơ đồ đứng cũ hơn mặt bằng"; bảng thống
kê trục đứng trong `XBOSS_VE_THONGKE`.

**Non-goals:**

- **Không** tự tìm điểm trục đứng từ hình học (không có cách nào đúng trên 2D). Kỹ sư đánh dấu.
- **Không** dựng 3D, không xuất IFC — đây vẫn là nền 2D.
- **Không** đọc dữ liệu từ tệp DWG khác. Mọi tầng của một trục phải nằm trong **cùng một bản vẽ**
  (đúng kết quả của M111, và là ranh giới đã chốt: dữ liệu nằm trong DWG, không có bảng trên server).
- Không tính thủy lực/tổn thất áp — ngoài phạm vi bộ lệnh vẽ.

## 4. Khóa rule pack mới

Version mới = hiện hành + 1 (**lấy số thật lúc code**, xem M109 §5). Mặc định `enabled: false`.

```jsonc
"floorPolicy": {
  // … các khóa của M111 …
  "floorElevations": { "05": 18000, "06": 21000, "07": 24000 },  // mm, cao độ sàn hoàn thiện
  "floorElevationsNote": "Khai tay. Tầng thiếu cao độ thì XBOSS_VE_RISER HỎI, tuyệt đối không nội suy."
},
"riserPolicy": {
  "enabled": false,
  "layer": "M-RISER",
  "branchLenMm": 3000,          // chiều dài nhánh rẽ vẽ ở mỗi tầng (schematic, không theo tỉ lệ thật)
  "floorLineStyle": { "layer": "M-RISER-GRID", "linetype": "DASHED", "color": 8 },
  "labelPattern": "{system} {size}",
  "titlePattern": "SƠ ĐỒ ĐỨNG TRỤC {maTruc}",
  "markerBlockId": "riser-marker",  // block kind=annotation trong manifest thư viện (M100 PR2)
  "staleWarnDays": 0            // 0 = cảnh báo ngay khi mặt bằng đổi sau lần dựng sơ đồ
}
```

Validator 2 tầng bắt: `branchLenMm` > 0; `titlePattern` chứa `{maTruc}`; `markerBlockId` khác rỗng khi
`enabled`; `floorElevations` chỉ chứa nhãn tầng có trong `floors`; giá trị cao độ tăng dần theo thứ
tự tầng (bắt lỗi gõ nhầm — bắt buộc, vì cao độ ngược làm sơ đồ lộn tùng phèo).

## 5. Functional requirements

### `XBOSS_VE_TRUCDUNG`

- **FR1** Kỹ sư chọn tuyến (phải mang XData vai trò `Tim`; không có thì từ chối kèm lý do, gợi ý
  `XBOSS_VE_NHANTUYEN` — cùng khuôn từ chối của `XBOSS_VE_PHUKIEN`), chỉ điểm đặt, khai **mã trục**
  (chọn từ danh sách mã đã có trong bản vẽ hoặc nhập mới) + **chiều** + **tầng** (mặc định suy từ tag
  gần nhất/`floorPolicy`, sửa được).
- **FR2** Đặt block `markerBlockId` mang XData vai trò `TrucDung` với đủ trường §2.1, liên kết
  `HandleTim` 2 chiều với tuyến.
- **FR3** Idempotent: đánh dấu lại cùng một tuyến cùng mã trục → cập nhật tại chỗ, không đặt 2 block.
- **FR4** Từ chối trùng: cùng `maTruc` + cùng `tang` + cùng `chieu` đã có ở tuyến khác → dừng kèm
  chỉ dẫn zoom tới điểm đang trùng (một trục chỉ đi lên một lần ở một tầng).

### `XBOSS_VE_RISER`

- **FR5** Hộp thoại (M106): chọn `maTruc` (danh sách kèm số tầng đã đánh dấu), điểm đặt sơ đồ, tỉ lệ
  in (qua `VeContext.HoiTiLeIn` — cửa duy nhất, M106). Hiện **chỉ đọc**: danh sách tầng sẽ vẽ, tầng
  **thiếu cao độ**, tầng **có tuyến nhưng chưa đánh dấu trục** (cảnh báo bỏ sót).
- **FR6** Thiếu cao độ tầng → hỏi từng tầng thiếu, ghi nhớ trong bản vẽ (Xrecord) để lần sau không
  hỏi lại; **không nội suy**.
- **FR7** Dựng: đường trục đứng nối các cao độ tầng; nhánh rẽ dài `branchLenMm` tại mỗi tầng, chiều
  theo `chieu`; nhãn `labelPattern` cho từng đoạn (cỡ lấy từ XData tuyến — **không gõ tay**); đường
  cao độ tầng nét đứt + nhãn tầng + trị số cao độ; tiêu đề `titlePattern`. Toàn bộ trên layer
  `riserPolicy.layer`, mang XData vai trò mới `Riser` + `maTruc` + `NgayDung` + danh sách handle
  điểm `TrucDung` nguồn.
- **FR8** Đổi cỡ giữa các tầng được thể hiện đúng: đoạn trục giữa tầng k và k+1 lấy cỡ của điểm
  `TrucDung` tầng k; cỡ đổi → ghi nhãn tại điểm đổi.
- **FR9 Idempotent.** Chạy lại cùng `maTruc` → **xóa sơ đồ cũ của đúng trục đó rồi dựng lại tại đúng
  vị trí cũ** (giữ điểm đặt), không sinh sơ đồ đôi.
- **FR10 Snapshot, không liên kết sống.** Sơ đồ đứng là ảnh chụp — **cùng bản chất `XBOSS_VE_MATCAT`**
  (M100 §6.4). Nên: phép kiểm mới trong `XBOSS_KIEMTRA` (số hiệu tiếp theo) báo **"sơ đồ đứng cũ hơn
  mặt bằng"** khi có điểm `TrucDung` của trục đó đổi sau `NgayDung`, đúng cách phép kiểm "mặt cắt cũ
  hơn tuyến" đang làm.
- **FR11** Bảng thống kê: `XBOSS_VE_THONGKE` thêm bảng **trục đứng** (mã trục, số tầng, hệ, dải cỡ,
  tổng chiều dài đứng tính từ cao độ tầng).
- **FR12** Báo cáo cuối lệnh + mục trong `VeSessionReport`: trục đã dựng, tầng thiếu cao độ đã hỏi,
  tầng có tuyến mà chưa đánh dấu.
- **FR13** Đường lui `XBOSS_UI_DIALOG=0` cho cả 2 lệnh (M106 FR9).
- **FR14** Vị trí quy trình: `XBOSS_VE_TRUCDUNG` ở `BuocQuyTrinh.VeShopDrawing` (bước 3, sau
  `XBOSS_VE_NHAN`); `XBOSS_VE_RISER` ở `BuocQuyTrinh.HoSoBanVe` (bước 5, cạnh `XBOSS_VE_MATCAT`).
- **NFR1** Trục 30 tầng: dựng ≤ 10 giây. 1 lệnh = 1 nhóm UNDO.
- **NFR2** Toàn bộ hình học + xếp tầng ở Core thuần (`Core/Draw/RiserBuilder.cs`), test CI Linux.
  Không NuGet mới.
- **NFR3** Sơ đồ đứng **không** vào `XBOSS_BOCKL`: đây là đối tượng trình bày, tuyến thật đã bóc ở mặt
  bằng. Vai trò `Riser` phải nằm trong danh sách loại trừ của takeoff (cùng cách nét biên bị loại,
  M100 FR4) — **bất biến có test** (AC7).

## 6. Acceptance criteria

- **AC1** Đánh dấu trục `TR-01` ở 6 tầng (05–10), khai cao độ đủ → `XBOSS_VE_RISER` dựng sơ đồ có 6
  mức tầng, khoảng cách đứng đúng tỉ lệ cao độ khai, 6 nhánh rẽ, nhãn cỡ đúng XData từng tuyến.
- **AC2** Tầng 08 dùng cỡ khác → sơ đồ ghi nhãn đổi cỡ đúng vị trí giữa tầng 07 và 08.
- **AC3** Tầng 09 thiếu cao độ → lệnh **hỏi**, không nội suy; trả lời xong ghi nhớ, chạy lại không hỏi lại.
- **AC4** Chạy lại `XBOSS_VE_RISER` cho `TR-01` → đúng 1 sơ đồ, ở đúng vị trí cũ.
- **AC5** Đổi cỡ tuyến tầng 07 ở mặt bằng rồi chạy `XBOSS_KIEMTRA` → báo "sơ đồ đứng trục TR-01 cũ
  hơn mặt bằng"; dựng lại thì hết báo.
- **AC6** Đánh dấu trùng (cùng trục, cùng tầng, cùng chiều) → **dừng** kèm chỉ dẫn tới điểm trùng.
- **AC7** `XBOSS_BOCKL` sau khi dựng sơ đồ cho **đúng con số như trước** — sơ đồ không lọt vào bóc.
- **AC8** Tầng có tuyến hệ đó nhưng chưa đánh dấu trục → hộp thoại cảnh báo nêu đúng tầng.
- **AC9** `riserPolicy.enabled: false` (mặc định) → cả 2 lệnh dừng kèm thông báo cách bật.
- **AC10** Một lần `U` hoàn tác trọn vẹn mỗi lệnh.
- **AC11** `floorElevations` khai ngược (tầng trên thấp hơn tầng dưới) → validator rule pack **chặn từ
  lúc nạp pack**, không đợi tới lúc dựng.

## 7. Điểm chạm code

| Tầng           | Tệp                                                                   | Vai trò                                                          |
| :------------- | :-------------------------------------------------------------------- | :--------------------------------------------------------------- |
| Rule pack (TS) | `lib/ky-thuat/cad/rule-packs/v<next>.json` + validator                | `riserPolicy` + `floorPolicy.floorElevations`                    |
| Core           | `RulePack/RulePackModels.cs`, `RulePackLoader.cs`                     | Đọc + validate (kể cả cao độ tăng dần)                           |
| Core (mới)     | `Draw/RiserBuilder.cs`                                                | Xếp tầng, tọa độ trục/nhánh/nhãn/đường cao độ — thuần, có test   |
| Core           | `Draw/VeXData.cs`                                                     | `VaiTroVe.TrucDung` + `VaiTroVe.Riser` + `MaTruc`/`Tang`/`Chieu` |
| Core           | `Inspection/PhepKiemMoRong.cs`                                        | Phép kiểm "sơ đồ đứng cũ hơn mặt bằng" (FR10)                    |
| Core           | `Draw/ThongKeTable.cs`                                                | Bảng trục đứng (FR11)                                            |
| Core           | `Takeoff/*`                                                           | Loại trừ vai trò `Riser`/`TrucDung` khỏi bóc (NFR3)              |
| Core           | `Ui/ViewModels/TrucDungDialogViewModel.cs`, `RiserDialogViewModel.cs` | Hộp thoại M106                                                   |
| Core           | `Ui/LenhCatalog.cs`, `Reporting/VeSessionReport.cs`                   | Khai 2 lệnh + mục báo cáo                                        |
| Adapter (mới)  | `XBoss.Cad.Acad/Commands/VeRiserCommands.cs`                          | 2 `[CommandMethod]`, transaction, UNDO                           |
| Adapter        | `Services/VeThucThe.cs`, `Services/BlockLibraryService.cs`            | Đặt block marker, dựng/xóa sơ đồ theo `maTruc`                   |
| Adapter        | `Ui/Wpf/XBossDialog.xaml`                                             | 2 `DataTemplate`                                                 |
| Tài liệu       | `plugin-autocad/README.md`, `CAI-DAT.md`, `VERIFY-VA-PHAT-HANH.md`    | 2 lệnh mới + mục verify tay                                      |

Thư viện block cần thêm `riser-marker` (kind `annotation`) — phát hành **version thư viện mới** theo
đường M100 PR2/M104, không sửa version đã phát hành.

Không migration, không API, không đụng web.

## 8. Test plan

- **Core (xunit):** xếp tầng theo `floors` (kể cả tick không liên tục); khoảng cách đứng đúng tỉ lệ
  cao độ; vị trí nhánh theo `chieu`; nhãn đổi cỡ đúng điểm; thiếu cao độ → trả về "cần hỏi" chứ không
  nội suy; validator bắt cao độ ngược + `titlePattern` thiếu `{maTruc}`; trùng trục/tầng/chiều bị chặn.
- **Đối chứng 2 tầng:** ca `riserPolicy` vào `plugin-autocad/doi-chung/`.
- **Bất biến takeoff (AC7):** test ở Core rằng vai trò `Riser`/`TrucDung` không lọt vào
  `TakeoffCalculator` — cùng khuôn test đã có cho nét biên.
- **Verify tay:** AC1–AC10 trên máy có AutoCAD 2026, trên bản vẽ đã nhân bản tầng bằng M111 (điều kiện
  tiên quyết ở đầu tệp).

## 9. Kế hoạch PR

| PR  | Nội dung                                                                                          | `route:`  |
| :-- | :------------------------------------------------------------------------------------------------ | :-------- |
| PR1 | Rule pack `v<next>` + validator + XData `TrucDung`/`Riser` + loại trừ takeoff + test Core         | `spec`    |
| PR2 | Adapter `XBOSS_VE_TRUCDUNG` + hộp thoại + idempotent + chặn trùng                                 | `spec`    |
| PR3 | `RiserBuilder` (Core) + Adapter `XBOSS_VE_RISER` + phép kiểm FR10 + bảng thống kê FR11 + tài liệu | `complex` |

PR3 `complex`: bố cục schematic (giãn cách, tránh đè nhãn, chỗ đặt bảng chú thích) là chỗ phải cân
nhắc đánh đổi. **Ranh giới được phép quyết:** cách giãn nhãn khi 2 tầng quá sát, hướng nhánh mặc định
khi `chieu = "xuyen"`. **Không được tự quyết:** nội suy cao độ (cấm tuyệt đối, FR6), đọc dữ liệu từ
tệp DWG khác, hay bỏ bất biến NFR3.

## 10. Rủi ro / open decisions

| Mục                                                 | Giảm thiểu                                                                          | Quyết định                    |
| :-------------------------------------------------- | :---------------------------------------------------------------------------------- | :---------------------------- |
| Sơ đồ là snapshot nên lệch dần khi mặt bằng đổi     | Phép kiểm FR10 báo cũ; `staleWarnDays: 0` mặc định báo ngay                         | Chấp nhận (đúng lối `MATCAT`) |
| Mọi tầng phải nằm cùng một DWG                      | Đúng đầu ra của M111; ghi rõ ở §3 non-goals và trong `CAI-DAT.md`                   | Chốt                          |
| Trục xuyên nhiều tệp (tháp chia tệp theo khối tầng) | Ngoài phạm vi; nếu cần thì mở M mới (đụng dữ liệu liên tệp = đụng server)           | **Open — xác nhận khi duyệt** |
| Vẽ sơ đồ theo tỉ lệ đứng thật hay giãn đều?         | Bản đầu **theo tỉ lệ cao độ thật** (AC1) — đọc đúng khoảng cách tầng                | **Open — chốt khi duyệt**     |
| M111 chưa chạy pilot mà đã làm M112                 | Điều kiện tiên quyết ghi ngay đầu tệp; coordinator không được dispatch khi chưa đạt | Chốt                          |

## 11. Approval

- [ ] Product/scope
- [ ] UX (2 lệnh tách bạch, cảnh báo bỏ sót)
- [ ] Architecture (snapshot + phép kiểm cũ hơn, loại trừ takeoff)
- [ ] Test/verify tay
- [ ] Không còn blocking question (2 mục Open ở §10)

**Kết luận:** Draft — chờ duyệt.
