# M114 — Đặc tả Auto-routing MEPF theo đồ thị hành lang (`XBOSS_VE_HANHLANG` + `XBOSS_VE_TUYENTUDONG`)

| Thuộc tính       | Giá trị                                                                                                                                                     |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Vẽ tuyến nhánh tới hàng trăm thiết bị là việc lặp lại thuần túy; kỹ sư chuẩn bị hành lang một lần rồi máy đi tuyến từng hệ                                  |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                                                        |
| State            | **Draft** — chờ duyệt                                                                                                                                       |
| Người/ngày duyệt |                                                                                                                                                             |
| Cập nhật         | 2026-08-29                                                                                                                                                  |
| Nghiên cứu nền   | `RESEARCH-AUTO-ROUTING-MEPF.md` (2026-08-29) — đọc trước, tệp này không lặp lại phần khảo sát hiện trạng                                                    |
| Phụ thuộc        | M100 (`XBOSS_VE` XData tim, layer chuẩn, `EdgeOffset`), M101 PR3 (`Core/Zoning/VungClipper.cs`), M106 (hộp thoại WPF), M107 (khuôn "nhận đối tượng có sẵn") |

---

## 1. Vấn đề

`XBOSS_VE` vẽ **một tuyến một lượt**. Một tầng điển hình có 40–120 thiết bị đầu cuối (miệng gió, đầu
phun, thiết bị vệ sinh, ổ cắm), mỗi cái cần một nhánh về trục chính. Đó là vài trăm thao tác vẽ lặp
lại mà **quyết định thực sự chỉ có vài cái**: hệ này chạy hành lang nào, gom trục ở đâu, ai đi tầng
trên.

Đồng thời `RESEARCH-AUTO-ROUTING-MEPF.md` §1 đã xác định thứ đang mang tên "auto-routing" trong repo
(M77) **không dùng lại được**: không phải bộ tìm đường, phép thử va chạm báo thừa, và quan trọng
nhất — không có đường nào chạy vào bản vẽ của kỹ sư.

## 2. Quyết định nền (người dùng chốt 2026-08-29: "chọn phương án tốt nhất")

| #   | Câu hỏi                                   | Chốt                                                                                                                                                                                                                                                                                                                            |
| :-- | :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Hành lang vẽ mới hay nhận có sẵn?         | **Cả hai, cùng một lệnh.** Vẽ mới là đường chính; thêm chế độ **nhận** polyline có sẵn thành hành lang (chỉ gán XData + bề rộng, **không đụng hình học**) — dùng đúng khuôn M107 đã chạy thật, chi phí thêm rất nhỏ mà bỏ được việc vẽ đè lên trục hành lang kiến trúc đã có                                                    |
| 2   | Tầng/làn tính ở đâu?                      | **Core C#.** Toàn bộ dây chuyền vẽ đã là Core-thuần, test trên CI Linux, không phụ thuộc mạng. Chống trôi 2 bản bằng **hai lớp**: (a) tham số tầng/làn khai trong **rule pack** nên hai bên dùng chung _dữ liệu_; (b) bộ đối chứng trong `plugin-autocad/doi-chung/` ghim _thuật toán_ — đúng cơ chế đã trị rủi ro số 1 của M99 |
| 3   | Có làm thủy lực (chọn cỡ theo lưu lượng)? | **Không** ở bản này. Kỹ sư khai cỡ như `XBOSS_VE` đang làm. Ghép thủy lực là mở mặt trận khác (cần lưu lượng từng thiết bị — dữ liệu chưa có)                                                                                                                                                                                   |
| 4   | M77 xử lý sao?                            | **Đính chính tài liệu** (đã làm cùng đợt này: khối cảnh báo đầu `M77-auto-routing-beam-sleeve.md`). Giữ `validateBeamSleeve` (logic thật, dùng được); `findOptimalRoute3D`/`solve3DGenerativeRoute` chỉ còn là ước lượng phía web — **lệnh plugin không gọi vào**                                                               |

## 3. Outcome và guardrail

- **Target:** chuẩn bị hành lang một lần (~5 phút/tầng), sau đó mỗi hệ đi tuyến trong một lượt; tuyến
  sinh ra **dùng được ngay** với toàn bộ lệnh sẵn có, không phải vẽ lại.
- **Guardrail:**
  1. **Kết quả là tuyến thật, không phải đề xuất trên giấy.** Sinh polyline tim mang XData
     `XBOSS_VE` vai trò `Tim` **đúng cấu trúc `XBOSS_VE` vẽ ra** (như M107) ⇒ `_PHUKIEN`, `_NHAN`,
     `_CHIADOT`, `_GIADO`, `_LOCHO`, `_TAG`, `_THONGKE`, `XBOSS_BOCKL` chạy được ngay.
  2. **Một hệ một lượt.** Không có nút "route tất cả" ở bản đầu. Thứ tự hệ do kỹ sư chọn, mặc định
     theo hạng ưu tiên; hệ chạy sau thấy hệ chạy trước đang chiếm chỗ.
  3. **Không giải được thì nói không giải được.** Thiếu hành lang nối tới thiết bị, hành lang hết
     làn, không thỏa độ dốc tự chảy → **báo kèm lý do và chỉ đúng thiết bị/hành lang**, tuyệt đối
     không vẽ đại một tuyến. Sai ở đây đi thẳng vào khối lượng và ra hiện trường.
  4. **Không đè lên công sức của người.** Nhánh kỹ sư đã sửa tay được đánh dấu; chạy lại **bỏ qua**
     nhánh đó.
  5. **Xem trước bắt buộc** trước khi ghi (cùng lý do M111).
  6. **Không tự nắn tuyến của hệ đã chạy trước** để nhường chỗ — đó là combined services, chưa có
     đặc tả (ranh giới này M109 §3 đã ghi).
  7. 1 lệnh = 1 nhóm UNDO, hỏi đáp ngoài transaction (M100 §6.11).

## 4. Scope / non-goals

**Trong phạm vi:** 2 lệnh `XBOSS_VE_HANHLANG` (vẽ/nhận/sửa hành lang) và `XBOSS_VE_TUYENTUDONG` (đi
tuyến một hệ); khóa rule pack `drawTools.routingPolicy`; dựng đồ thị hành lang; Dijkstra + hàm chi
phí gom trục; chế độ tự chảy; cấp phát tầng/làn ở Core; xem trước; sinh tuyến thật; cờ sửa tay; báo
cáo phiên.

**Non-goals:** thủy lực/chọn cỡ (§2 #3); clash 3D; tự nắn hệ đã chạy; đọc mô hình kết cấu; route
xuyên tầng (phương đứng thuộc M112 `XBOSS_VE_TRUCDUNG`); route qua nhiều bản vẽ; gọi vào M77.

## 5. Kỹ sư chuẩn bị gì — 4 mẩu, 3 đã có sẵn

| #   | Mẩu dữ liệu      | Lấy từ đâu                                                                                                |
| :-- | :--------------- | :-------------------------------------------------------------------------------------------------------- |
| 1   | **Hành lang**    | **Mới** — `XBOSS_VE_HANHLANG` (vẽ hoặc nhận polyline có sẵn)                                              |
| 2   | Điểm đấu nối     | **Đã có** — block thiết bị mang XData `ThietBi` (M100); điểm nguồn/trục chính khai khi chạy lệnh          |
| 3   | Vùng cấm         | **Đã có** — vùng của M101 PR3 (`Core/Zoning/VungClipper.cs`), đánh dấu `loai: "cam"`                      |
| 4   | Tầng/làn theo hệ | **Đã có dạng dữ liệu** — khai trong rule pack, mặc định theo thứ tự phân tầng của `planMultiTierCorridor` |

## 6. Khóa rule pack mới (`drawTools.routingPolicy`)

Version mới = hiện hành + 1 (hiện `v9`; **lấy số thật lúc code** bằng
`ls lib/ky-thuat/cad/rule-packs | sort -V | tail -1`). Mặc định `enabled: false`.

```jsonc
"routingPolicy": {
  "enabled": false,
  "corridorLayer": "M-CORRIDOR",
  "snapRadiusMm": 4000,        // bán kính tối đa từ thiết bị tới hành lang gần nhất để rẽ nhánh
  "cost": {
    "elbowMm": 3000,           // α — mỗi lần chuyển hướng "đắt" bằng 3 m tuyến
    "congestionMm": 500,       // β — mỗi hệ đã chiếm làn trong hành lang cộng thêm chừng này mỗi mét
    "reuseFactor": 0.35        // γ — cạnh mà nhánh khác CỦA CHÍNH hệ này đã đi chỉ tính 35% giá
  },
  "costNote": "reuseFactor < 1 là thứ khiến các nhánh gom vào một trục chung rồi mới tỏa ra — giống bản vẽ người làm. Đặt = 1 là tắt gom trục.",
  "tiers": [                   // dữ liệu DÙNG CHUNG giữa Core C# và planMultiTierCorridor (TS)
    { "id": "tier1", "name": "Sát đáy dầm", "systems": ["HVAC"], "offsetFromBeamMm": 30 },
    { "id": "tier2", "name": "Máng cáp/ELV", "systems": ["ELEC","ELV"], "offsetFromBeamMm": 140 },
    { "id": "tier3", "name": "Ống nước", "systems": ["PLUMB","CHW"], "offsetFromBeamMm": 240 },
    { "id": "sprinkler", "name": "Sát trần", "systems": ["FP"], "offsetFromCeilingMm": 80 }
  ],
  "laneGapMm": { "default": 100, "elecToHot": 150 },
  "systemOrder": ["PLUMB_DRAIN","HVAC","FP","CHW","PLUMB_SUPPLY","ELEC"],
  "systemOrderNote": "Thứ tự chạy mặc định — hệ cứng trước, hệ dẻo sau. Kỹ sư đổi được lúc chạy lệnh."
}
```

Validator 2 tầng bắt: `snapRadiusMm` > 0; `reuseFactor` trong `(0, 1]`; mọi id hệ trong `tiers`/
`systemOrder` phải có thật trong `drawTools.systems`; một hệ không được nằm ở 2 tier.

## 7. Functional requirements

### `XBOSS_VE_HANHLANG`

- **FR1 Hai chế độ.** _Vẽ mới_: kỹ sư vẽ polyline tim hành lang. _Nhận_: chọn polyline có sẵn →
  **chỉ gán XData + đổi layer, không đụng tọa độ đỉnh** (đúng guardrail M107). Từ chối `Arc`/`Spline`/
  đối tượng thuộc xref kèm lý do đếm được.
- **FR2 Thuộc tính.** Bề rộng khả dụng (mm), cao độ đáy dầm và cao độ trần của đoạn hành lang đó
  (**hỏi, không suy** — luật M100 §6.3), danh sách hệ được phép đi qua (mặc định: tất cả).
- **FR3 XData.** Vai trò mới `HanhLang`: `{beRongMm, cotDayDamMm, cotTranMm, heChoPhep[], lanDaCap[]}`.
  `lanDaCap` là sổ chiếm chỗ — mỗi lần một hệ chạy qua, ghi thêm `{heId, tierId, lanTuMm, lanDenMm,
caoDoMm}`. Nhờ đó **trạng thái chiếm chỗ sống trong bản vẽ**, không cần server, và hệ chạy sau đọc
  được ngay cả khi mở lại bản vẽ hôm khác.
- **FR4 Sửa/xóa.** Sửa bề rộng/cao độ tại chỗ; xóa hành lang còn hệ đang đi qua → **cảnh báo nêu hệ
  nào** và hỏi lại (xóa thì các tuyến đó thành tuyến thường, không tự xóa theo).

### `XBOSS_VE_TUYENTUDONG`

- **FR5 Chọn phạm vi.** Hộp thoại (M106): hệ + loại tuyến + cỡ (như `XBOSS_VE`), tập thiết bị đích
  (quét chọn hoặc "mọi thiết bị của hệ này chưa có tuyến"), điểm nguồn/trục chính (chỉ điểm, hoặc
  chọn một điểm `TrucDung` của M112 nếu có).
- **FR6 Dựng đồ thị.** Nút = giao điểm giữa các hành lang + điểm rẽ (hình chiếu vuông góc của thiết
  bị lên hành lang gần nhất trong `snapRadiusMm`); cạnh = đoạn hành lang, trọng số = chiều dài. Thiết
  bị không có hành lang nào trong bán kính → **vào danh sách không giải được**, nêu tên và khoảng
  cách tới hành lang gần nhất (guardrail 3).
- **FR7 Đi tuyến.** Với mỗi thiết bị (xử lý tuần tự, thiết bị xa trục nhất trước): đường đi ngắn
  nhất theo hàm chi phí `chiều dài + α×số lần chuyển hướng + β×độ đông − thưởng γ trên cạnh mà nhánh
trước của **chính hệ này** đã dùng`. Cạnh đi qua **vùng cấm** bị loại khỏi đồ thị.
- **FR8 Chế độ tự chảy.** Hệ có `slopeRequired`: ràng buộc cao độ **đơn điệu giảm** từ thiết bị về
  điểm xả, độ dốc lấy từ rule pack. Không tồn tại đường thỏa → **báo không giải được kèm số liệu**
  (chênh cao cần vs chênh cao có), **không** hạ độ dốc để "cho xong".
- **FR9 Cấp phát tầng/làn.** Sau khi có tuyến, gọi Core cấp tầng theo `tiers` và làn còn trống trong
  từng hành lang theo `lanDaCap` + `laneGapMm`; ghi ngược `lanDaCap` vào XData hành lang. Hết làn →
  không giải được cho đoạn đó, nêu rõ hành lang nào đầy và hệ nào đang chiếm.
- **FR10 Xem trước bắt buộc.** Vẽ tuyến đề xuất bằng nét mảnh tạm trên layer riêng + bảng chỉ-đọc:
  số thiết bị nối được, tổng chiều dài, số co, tầng/làn được cấp, và **danh sách không giải được kèm
  lý do**. Không bấm "Thực hiện" thì bản vẽ **không đổi một nét nào**.
- **FR11 Sinh tuyến thật.** Chấp nhận → xóa nét tạm, sinh polyline tim trên layer chuẩn của loại
  tuyến, XData vai trò `Tim` đủ trường như `XBOSS_VE`, cộng thêm `TuDong: true`, `PhienTuyen` (mã
  phiên chạy) và `SuaTay: false`. `edgeStyle: "double"` → sinh nét biên qua `EdgeOffset.Tinh`; offset
  thất bại → chỉ giữ tim + cảnh báo nêu tên tuyến (luật M100 §18).
- **FR12 Cờ sửa tay.** Kỹ sư sửa hình học một tuyến `TuDong` → lần chạy sau `XBOSS_VE_TUYENTUDONG`
  phát hiện (băm hình học lệch so với lúc sinh, cùng cơ chế mốc của M110) và đặt `SuaTay: true`.
  **Chạy lại bỏ qua mọi tuyến `SuaTay: true`** và nói rõ đã bỏ qua bao nhiêu (guardrail 4).
- **FR13 Chạy lại.** Với tuyến `TuDong` chưa sửa tay: xóa và dựng lại theo kết quả mới (idempotent).
  Trước khi xóa, **gỡ chiếm chỗ cũ** của chính phiên đó khỏi `lanDaCap` để không rò rỉ làn.
- **FR14 Báo cáo.** Tóm tắt + mục trong `Core/Reporting/VeSessionReport.cs`: hệ đã chạy, số nhánh,
  tổng chiều dài, số co, tỉ lệ cạnh dùng chung (đo hiệu quả gom trục), danh sách không giải được theo
  từng lý do, số tuyến bỏ qua vì `SuaTay`.
- **FR15 Đường lui.** `XBOSS_UI_DIALOG=0` → hỏi đáp dòng lệnh, **xem trước FR10 vẫn hiện** dạng bảng
  text + hỏi xác nhận.
- **FR16 Vị trí quy trình.** `XBOSS_VE_HANHLANG` ở `BuocQuyTrinh.ChuanHoaNen` (bước 2 — chuẩn bị nền);
  `XBOSS_VE_TUYENTUDONG` ở `BuocQuyTrinh.VeShopDrawing` (bước 3), đứng trước `XBOSS_VE` trong danh mục.
- **NFR1** 120 thiết bị, 40 đoạn hành lang: dựng đồ thị + đi tuyến ≤ 5 giây (đồ thị vài chục nút —
  Dijkstra thừa sức; **không dùng lưới không gian 3D**).
- **NFR2** Toàn bộ đồ thị, chi phí, tầng/làn ở Core thuần, test trên CI Linux. Không NuGet mới.
- **NFR3** Lỗi giữa chừng lúc ghi → abort transaction, bản vẽ nguyên trạng, `lanDaCap` không bị bẩn.

## 8. Acceptance criteria

- **AC1** Tầng có 3 hành lang + 24 miệng gió + 1 điểm nguồn → lệnh nối đủ 24, tuyến chạy **dọc hành
  lang** (không cắt chéo phòng), gom về trục chung.
- **AC2** Đặt `reuseFactor: 1` (tắt gom trục) rồi chạy lại → tổng chiều dài **tăng**, số cạnh dùng
  chung **giảm** — chứng minh số hạng γ có tác dụng thật, không phải trang trí.
- **AC3** Ngay sau AC1: `XBOSS_VE_PHUKIEN` bấm lên tuyến sinh ra **không bị từ chối**; `XBOSS_VE_NHAN`
  ghi đúng cỡ; `XBOSS_VE_CHIADOT` chia đúng; `XBOSS_BOCKL` bóc ra đúng tổng chiều dài đo được.
- **AC4** Một miệng gió đặt cách mọi hành lang 6 m (> `snapRadiusMm` 4 m) → **không giải được**, báo
  đúng tên thiết bị + khoảng cách 6 m; 23 cái còn lại vẫn nối bình thường.
- **AC5** Hệ thoát nước có `slopeRequired`, điểm xả **cao hơn** thiết bị → báo không giải được kèm
  chênh cao cần vs có; **không** sinh tuyến nào.
- **AC6** Chạy hệ HVAC rồi hệ ELEC trên cùng hành lang → ELEC nhận tier2 và làn khác, `lanDaCap` của
  hành lang có đủ 2 bản ghi, khoảng hở ≥ `laneGapMm.elecToHot`.
- **AC7** Hành lang rộng 600 mm đã kín làn → hệ thứ 3 báo hết làn, nêu đúng hành lang + hệ đang chiếm.
- **AC8** Kéo đỉnh 1 tuyến `TuDong` rồi chạy lại → tuyến đó `SuaTay: true`, **giữ nguyên**; các tuyến
  khác dựng lại; tóm tắt nói đã bỏ qua 1.
- **AC9** Chạy lại 3 lần liên tiếp không sửa gì → số tuyến và `lanDaCap` không đổi sau lần 1.
- **AC10** Vùng cấm cắt ngang hành lang duy nhất → tuyến đi vòng hành lang khác, hoặc báo không giải
  được; **không** có tuyến nào cắt qua vùng cấm.
- **AC11** Bấm Hủy ở bước xem trước → bản vẽ **không đổi một nét nào** (so số thực thể trước/sau).
- **AC12** Một lần `U` hoàn tác trọn vẹn, `lanDaCap` trở lại nguyên trạng.
- **AC13** Nhận polyline có sẵn thành hành lang → **tọa độ từng đỉnh không đổi** (so trước/sau).
- **AC14** `routingPolicy.enabled: false` (mặc định) → cả 2 lệnh dừng kèm thông báo cách bật.

## 9. Điểm chạm code

| Tầng           | Tệp                                                                         | Vai trò                                                                 |
| :------------- | :-------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| Rule pack (TS) | `lib/ky-thuat/cad/rule-packs/v<next>.json` + validator                      | `routingPolicy` (§6)                                                    |
| Core           | `RulePack/RulePackModels.cs`, `RulePackLoader.cs`                           | Đọc + validate                                                          |
| Core (mới)     | `Routing/HanhLangGraph.cs`                                                  | Dựng đồ thị: giao điểm, điểm rẽ, loại cạnh qua vùng cấm                 |
| Core (mới)     | `Routing/DinhTuyen.cs`                                                      | Dijkstra + hàm chi phí α/β/γ + chế độ tự chảy                           |
| Core (mới)     | `Routing/CapPhatLanTang.cs`                                                 | Cấp tầng/làn (bản C# của `planMultiTierCorridor`, tham số từ rule pack) |
| Core           | `Zoning/VungClipper.cs`                                                     | Vùng cấm — dùng lại                                                     |
| Core           | `Draw/VeXData.cs`                                                           | `VaiTroVe.HanhLang` + `TuDong`/`SuaTay`/`PhienTuyen`                    |
| Core           | `Ui/ViewModels/HanhLangDialogViewModel.cs`, `TuyenTuDongDialogViewModel.cs` | Hộp thoại M106 + bảng xem trước                                         |
| Core           | `Ui/LenhCatalog.cs`, `Reporting/VeSessionReport.cs`                         | Khai 2 lệnh + mục báo cáo                                               |
| Adapter (mới)  | `XBoss.Cad.Acad/Commands/VeHanhLangCommands.cs`, `VeTuyenTuDongCommands.cs` | 2 `[CommandMethod]`, transaction, UNDO, nét tạm xem trước               |
| Adapter        | `Services/VeThucThe.cs`, `Services/MarkService.cs`                          | Dựng/xóa tuyến + biên, gỡ dấu bóc khi dựng lại                          |
| Adapter        | `Ui/Wpf/XBossDialog.xaml`                                                   | 2 `DataTemplate`                                                        |
| Đối chứng      | `plugin-autocad/doi-chung/routing-doi-chung.json` (mới)                     | Ghim thuật toán tầng/làn giữa C# và `planMultiTierCorridor` (§2 #2)     |
| Tài liệu       | `plugin-autocad/README.md`, `CAI-DAT.md`, `VERIFY-VA-PHAT-HANH.md`          | 2 lệnh mới + mục verify tay                                             |

**Không migration, không API mới, không đụng `app/`.** Trạng thái chiếm chỗ sống trong DWG (FR3).

## 10. Test plan

- **Core (xunit):** đồ thị từ hành lang chữ T/chữ H; điểm rẽ ngoài `snapRadiusMm` bị loại; cạnh qua
  vùng cấm bị loại; Dijkstra ra đúng đường trên đồ thị dựng tay; **γ giảm tổng chiều dài** (AC2 ở
  mức hàm thuần); tự chảy — có nghiệm/vô nghiệm; cấp làn tuần tự + `laneGapMm.elecToHot`; hết làn;
  validator bắt đủ 4 lỗi §6.
- **Đối chứng 2 tầng:** `routing-doi-chung.json` — cùng đầu vào, `CapPhatLanTang` (C#) và
  `planMultiTierCorridor` (TS) phải ra **cùng** tầng + cao độ + làn; test hai phía đọc chung tệp.
- **Verify tay** (`VERIFY-VA-PHAT-HANH.md`, mục mới): AC1, AC3, AC6, AC8, AC10–AC13 trên máy có
  AutoCAD 2026, làm trên một tầng thật của AVIO.

## 11. Kế hoạch PR

| PR  | Nội dung                                                                                            | `route:`  |
| :-- | :-------------------------------------------------------------------------------------------------- | :-------- |
| PR1 | Rule pack `v<next>` + validator + `HanhLangGraph` + `DinhTuyen` + XData mới + test Core             | `spec`    |
| PR2 | `CapPhatLanTang` + `routing-doi-chung.json` + test đối chứng 2 tầng                                 | `spec`    |
| PR3 | Adapter `XBOSS_VE_HANHLANG` (vẽ + nhận + sửa/xóa) + hộp thoại M106                                  | `spec`    |
| PR4 | Adapter `XBOSS_VE_TUYENTUDONG`: xem trước, sinh tuyến thật, cờ sửa tay, chạy lại, báo cáo, tài liệu | `complex` |

PR4 `complex`. **Ranh giới được phép quyết:** cách vẽ nét tạm xem trước (thực thể tạm hay
transient graphics), thứ tự xử lý thiết bị trong FR7, cách gom nhánh chung đoạn cuối thành một
polyline hay giữ nhiều polyline rời. **Không được tự quyết:** bỏ bất kỳ guardrail nào ở §3, nới
`snapRadiusMm`/độ dốc để "cho ra kết quả", gọi vào M77, hay thêm nút "route tất cả các hệ".

## 12. Rủi ro / open decisions

| Mục                                                            | Giảm thiểu                                                                                            | Quyết định                           |
| :------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- | :----------------------------------- |
| Tuyến ra "đúng máy nhưng xấu mắt kỹ sư"                        | γ gom trục + α phạt chuyển hướng; xem trước bắt buộc; kỹ sư sửa nhánh nào cũng được và được tôn trọng | Chấp nhận                            |
| Hai bản cấp làn (C#/TS) trôi khác nhau                         | Tham số ở rule pack + đối chứng `routing-doi-chung.json` (cơ chế đã trị rủi ro số 1 của M99)          | Chốt                                 |
| `lanDaCap` bẩn khi lệnh lỗi giữa chừng                         | NFR3 nguyên tử + AC12; gỡ chiếm chỗ cũ trước khi dựng lại (FR13)                                      | Chốt                                 |
| Vẽ hành lang là việc thêm cho kỹ sư                            | Chế độ **nhận** polyline có sẵn (§2 #1) bỏ được phần lớn công vẽ                                      | Chấp nhận                            |
| Một nhánh nên tách polyline riêng hay nối liền vào trục chung? | Ảnh hưởng cách `XBOSS_BOCKL` đếm và cách `_CHIADOT` chia — cần thử trên bản vẽ thật                   | **Open — chốt ở PR4 với bằng chứng** |
| Bản sau có nên chạy nhiều hệ một lượt?                         | Chỉ mở sau khi một-hệ-một-lượt chạy ổn qua pilot; khi làm phải mở M mới                               | **Open — để sau**                    |

## 13. Approval

- [ ] Product/scope
- [ ] UX (xem trước bắt buộc, tôn trọng sửa tay)
- [ ] Architecture (đồ thị hành lang, chiếm chỗ sống trong DWG, Core-thuần)
- [ ] Test/đối chứng 2 tầng/verify tay
- [ ] Không còn blocking question (2 mục Open ở §12)

**Kết luận:** Draft — chờ duyệt.
