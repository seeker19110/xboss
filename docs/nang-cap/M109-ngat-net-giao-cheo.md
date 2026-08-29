# M109 — Đặc tả Ngắt nét giao chéo (`XBOSS_VE_NGATNET`)

| Thuộc tính       | Giá trị                                                                                                                                        |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Quy ước trình bày 2D "tuyến đi dưới ngắt nét tại chỗ giao" — bản vẽ nộp đọc được ngay ai trên ai dưới, không cần tra mặt cắt                   |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                                           |
| State            | **Approved for implementation**                                                                                                                |
| Người/ngày duyệt | Seeker / 2026-08-29                                                                                                                            |
| Cập nhật         | 2026-08-28                                                                                                                                     |
| Nguồn            | `M100-xboss-ve-shop-drawing.md` §20 hàng 1 ("đụng hình học hiển thị quanh tim — phải thiết kế để gap CHỈ ở nét biên/hiển thị, tim giữ nguyên") |
| Phụ thuộc        | M100 (XData `XBOSS_VE`, `EdgeOffset`, layer chuẩn), M101 PR1 (phép kiểm 11 clash 2D — nguồn danh sách giao cắt), M106 (hộp thoại WPF)          |

---

## 1. Vấn đề

Bản vẽ shop drawing MEPF luôn có tuyến cắt qua tuyến. Trên nền 2D, quy ước duy nhất để người đọc
biết ai đi trên ai đi dưới là **ngắt nét tuyến đi dưới** tại vùng giao (hoặc vẽ cầu vượt cho tuyến
đơn nét). Hiện `XBOSS_VE` vẽ mọi tuyến liền mạch, nên bản vẽ do plugin sinh ra **thua bản vẽ vẽ tay
về mặt trình bày** — đúng chuẩn dữ liệu nhưng chưa đúng chuẩn hồ sơ nộp.

Phép kiểm 11 của M101 (`PhepKiemMoRong.GiaoCatKhacHe`) đã **tìm ra** mọi điểm giao giữa các cặp hệ
khai trong `clashPairs`, kèm cảnh báo cố định "chỉ xét trên mặt bằng, không thay clash 3D". M109 dùng
đúng danh sách đó làm đầu vào và **vẽ** kết quả ra — không phát minh bộ dò giao cắt thứ hai.

## 2. Outcome và guardrail

- **Target:** một lệnh xử lý toàn bộ điểm giao trong vùng chọn; bản vẽ in ra đúng quy ước trình bày;
  chạy lại sau khi dời tuyến thì ngắt nét cập nhật theo, không để lại vết cũ.
- **Guardrail (bất biến, vi phạm là hỏng cả chuỗi):**
  1. **Polyline tim KHÔNG BAO GIỜ bị cắt, bị chia, bị đổi tọa độ đỉnh.** Tim là nguồn sự thật duy
     nhất của `XBOSS_BOCKL` (M100 FR4); cắt tim = bóc thiếu chiều dài. Mọi thao tác của M109 chỉ
     tác động lên **nét biên** và **đối tượng hiển thị sinh thêm**.
  2. Kết quả phải **gỡ được sạch** (`XBOSS_VE_NGATNET_XOA`) về đúng trạng thái trước khi chạy.
  3. Chạy lại = **idempotent**: xóa đối tượng ngắt nét cũ của đúng các tuyến trong vùng chọn rồi
     dựng lại; không chồng lớp.
  4. 1 lệnh = 1 nhóm UNDO, hỏi đáp ngoài transaction (luật M100 §6.11).

## 3. Scope / non-goals

**Trong phạm vi:** lệnh `XBOSS_VE_NGATNET` + `XBOSS_VE_NGATNET_XOA`; khóa rule pack
`drawTools.crossingPolicy`; 2 cách thể hiện (ngắt nét biên cho tuyến `edgeStyle: "double"`, cầu vượt
cho tuyến đơn nét); thứ tự trên–dưới suy từ **hạng ưu tiên hệ** khai trong rule pack, cho phép đảo
tay từng điểm; báo cáo cuối lệnh và mục trong báo cáo phiên vẽ (`VeSessionReport`).

**Non-goals:**

- **Không quyết định cao độ thật.** Hạng ưu tiên là quy ước trình bày, không phải kết quả phối hợp
  cao độ — việc đó thuộc hướng "phối hợp xung đột 2D (combined services)", chưa có đặc tả.
- Không dò clash 3D, không đụng `Z` của thực thể.
- Không xử lý giao cắt giữa tuyến XBoss và đối tượng **không** mang XData `XBOSS_VE` (nền kiến trúc,
  xref) — bỏ qua kèm lý do đếm được.
- Không tự dời tuyến để né.

## 4. Phương án thể hiện

| Phương án                                             | Lợi ích                                                   | Chi phí/rủi ro                                                                            | Kết luận                           |
| :---------------------------------------------------- | :-------------------------------------------------------- | :---------------------------------------------------------------------------------------- | :--------------------------------- |
| Không làm                                             | 0                                                         | Hồ sơ nộp không đạt quy ước trình bày, kỹ sư phải sửa tay sau khi plugin vẽ               | Loại                               |
| A — Cắt polyline biên thành 2 đoạn tại vùng giao      | Đúng bản chất "ngắt nét", in ra sạch                      | Biên bị chia nhỏ dần sau nhiều lần chạy; liên kết XData 2 chiều tim↔biên phải quản N mảnh | Loại (rủi ro tích lũy)             |
| **B — `Wipeout` che + XData vai trò `NgatNet`**       | Không đụng thực thể biên; gỡ = xóa wipeout; idempotent dễ | Wipeout phụ thuộc thứ tự vẽ (`DrawOrder`), phải đẩy lên trên; in PDF phải kiểm thật       | **Chọn** cho `edgeStyle: "double"` |
| C — Vẽ cầu vượt (cung tròn nhảy qua) trên layer riêng | Quy ước quen thuộc cho tuyến đơn nét (ống nước nhỏ, cáp)  | Không áp dụng được cho ống gió bản rộng                                                   | **Chọn** cho tuyến đơn nét         |

Chốt: **B cho tuyến 2 nét biên, C cho tuyến đơn nét**, cùng chọn theo `edgeStyle` của loại tuyến
trong rule pack — kỹ sư không phải chọn kiểu, plugin biết từ dữ liệu.

## 5. Khóa rule pack mới (`drawTools.crossingPolicy`)

Rule pack version mới = **version hiện hành + 1** (hiện hành `v9`; **lấy số thật lúc code bằng
`ls lib/ky-thuat/cad/rule-packs | sort -V | tail -1`**, không tin số ghi ở đây — bài học số migration
trong `docs/nang-cap/README.md`). Mọi khóa mới **mặc định `enabled: false`** để nạp pack mới không đổi
hành vi trên máy kỹ sư (luật đã áp dụng ở M101/M102).

```jsonc
"crossingPolicy": {
  "enabled": false,
  "priority": ["duct", "pipe-drain", "pipe-supply", "fp", "elec"], // hệ đứng trước đi TRÊN
  "priorityNote": "Hạng trình bày, KHÔNG phải cao độ thật. Hệ không khai xếp sau cùng.",
  "gapMode": "wipeout",          // wipeout | jog — mặc định suy theo edgeStyle, khóa này chỉ để ép
  "clearanceMm": 50,             // bề rộng vùng che tính từ mép biên tuyến đi trên
  "jogRadiusMm": 150,            // bán kính cầu vượt cho tuyến đơn nét
  "layerSuffix": "XING",         // layer đối tượng ngắt nét = <layer tim><layerSuffix>
  "minAngleDeg": 15              // giao gần song song dưới ngưỡng này KHÔNG ngắt nét (báo cáo riêng)
}
```

Validator 2 tầng (TS `lib/ky-thuat/cad/rule-pack*`, C# `RulePack/RulePackLoader.cs`) bắt: `priority`
không được chứa id hệ lạ; `clearanceMm`/`jogRadiusMm` > 0; `layerSuffix` khác rỗng khi `enabled`.

## 6. Functional requirements

- **FR1 Vùng chọn.** Kỹ sư quét chọn (hoặc `Tất cả` trong hộp thoại). Lọc ra thực thể mang XData
  `XBOSS_VE` vai trò `Tim`; đối tượng khác bỏ qua **đếm theo lý do** (không có XData / vai trò khác /
  thuộc xref) — cùng khuôn báo cáo với M107 FR1.
- **FR2 Tìm điểm giao.** Dùng `Segment2D` + đúng thuật toán của phép kiểm 11 (`PhepKiemMoRong`) —
  **tái dùng, không viết lại**; nếu cần thì tách phần tính giao điểm ra hàm dùng chung ở
  `Core/Geometry/`. Mỗi điểm giao gồm: 2 handle tim, tọa độ giao, góc giao.
- **FR3 Quyết định trên–dưới.** Theo `priority` của hệ. Hai tuyến **cùng hệ** → không ngắt nét, ghi
  vào báo cáo mục riêng ("giao cùng hệ — cần kỹ sư xử lý bằng phụ kiện, không phải ngắt nét").
  Góc giao < `minAngleDeg` → không ngắt nét, báo cáo riêng (ngắt nét ở góc gắt tạo hình xấu và che
  mất tuyến).
- **FR4 Thể hiện.** Với tuyến **đi dưới**:
  - `edgeStyle: "double"` → dựng `Wipeout` phủ vùng giao, bề rộng = bề rộng tuyến đi trên +
    `2 × clearanceMm`, đặt **trên** nét biên theo `DrawOrder`, trên layer `<layer tim><layerSuffix>`.
  - đơn nét → dựng cầu vượt: 2 đoạn cắt hiển thị + cung `jogRadiusMm` (hình học tính ở Core thuần —
    tệp mới `Core/Draw/CrossingGeometry.cs`, có test không cần AutoCAD).
- **FR5 XData.** Mọi đối tượng sinh ra mang XData `XBOSS_VE` **vai trò mới `NgatNet`** với
  `HandleTim` = tim ĐI DƯỚI và một trường mới `HandleTimGiao` = tim đi trên. Nhờ đó `XBOSS_VE_DOI`,
  `XBOSS_VE_NHANTUYEN` và lệnh xóa tìm đúng đối tượng của đúng cặp tuyến.
- **FR6 Idempotent.** Chạy lại: xóa mọi đối tượng vai trò `NgatNet` có `HandleTim` thuộc vùng chọn
  rồi dựng lại. Số lần chạy không đổi kết quả (AC4).
- **FR7 Đảo tay.** Hộp thoại có danh sách điểm giao (mã, 2 hệ, ai trên) + nút **đảo** từng dòng;
  lựa chọn đảo ghi vào XData của đối tượng (`DaoTay: true`) nên chạy lại **giữ nguyên** quyết định
  của kỹ sư thay vì áp lại `priority`.
- **FR8 Lệnh xóa.** `XBOSS_VE_NGATNET_XOA` trên vùng chọn (hoặc toàn bản vẽ) xóa sạch vai trò
  `NgatNet`, trả bản vẽ về trước khi chạy.
- **FR9 Báo cáo.** Cuối lệnh: số điểm giao xử lý, số bỏ qua theo từng lý do (cùng hệ / góc gắt /
  không XData), số đảo tay đang có hiệu lực. Mục tương ứng trong `Core/Reporting/VeSessionReport.cs`.
- **FR10 Hộp thoại + đường lui.** Theo khung M106: ViewModel thuần ở `Core/Ui/ViewModels/`,
  `DataTemplate` trong `XBossDialog.xaml`; `XBOSS_UI_DIALOG=0` → hỏi đáp dòng lệnh cho kết quả trùng
  khít. Xếp `BuocQuyTrinh.HoSoBanVe` (bước 5 — trình bày hồ sơ), sau `XBOSS_VE_THONGKE`.
- **NFR1** Bản vẽ 3000 tuyến: tìm giao + dựng ≤ 20 giây (dò giao dùng lưới không gian như phép kiểm 11,
  không O(n²) thuần).
- **NFR2** Không thêm NuGet mới. Toàn bộ hình học ở Core, test chạy trên CI Linux.

## 7. Acceptance criteria

- **AC1** Ống gió `800x400` (hệ `duct`) cắt ngang ống nước `DN100` (hệ `pipe-supply`) → sau lệnh,
  nét biên ống nước bị che tại vùng giao, ống gió liền mạch; in PDF ra đúng như trên màn hình.
- **AC2** **Tọa độ từng đỉnh của cả hai polyline tim không đổi** (so trước/sau, trùng khít) và
  `XBOSS_BOCKL` bóc ra **đúng con số như trước khi chạy M109** — bằng chứng bắt buộc cho guardrail 1.
- **AC3** Tuyến đơn nét (cáp) cắt tuyến đơn nét khác → sinh cầu vượt bán kính đúng `jogRadiusMm`.
- **AC4** Chạy lệnh 3 lần liên tiếp → số đối tượng vai trò `NgatNet` không đổi sau lần 1.
- **AC5** Đảo tay 1 điểm giao rồi chạy lại → điểm đó **giữ chiều đã đảo**, các điểm khác theo `priority`.
- **AC6** `XBOSS_VE_NGATNET_XOA` → không còn thực thể nào vai trò `NgatNet`; bản vẽ trùng khít trạng
  thái trước lệnh.
- **AC7** Một lần `U` hoàn tác trọn vẹn.
- **AC8** `crossingPolicy.enabled: false` (mặc định) → lệnh dừng kèm thông báo tiếng Việt nêu rõ khóa
  chưa bật và cách bật; **không** vẽ gì.
- **AC9** Giao cắt với đối tượng thuộc xref → bỏ qua, đếm và nêu lý do.

## 8. Điểm chạm code

| Tầng           | Tệp                                                                | Vai trò                                               |
| :------------- | :----------------------------------------------------------------- | :---------------------------------------------------- |
| Rule pack (TS) | `lib/ky-thuat/cad/rule-packs/v<next>.json` + validator             | Khóa `crossingPolicy`, tầng đối chứng TS              |
| Core           | `XBoss.Cad.Core/RulePack/RulePackModels.cs`, `RulePackLoader.cs`   | Đọc + validate khóa mới                               |
| Core (mới)     | `XBoss.Cad.Core/Draw/CrossingGeometry.cs`                          | Vùng che, hình cầu vượt, lọc góc gắt — thuần, có test |
| Core           | `XBoss.Cad.Core/Geometry/Segment2D.cs`                             | Tách/dùng lại hàm giao điểm của phép kiểm 11          |
| Core           | `XBoss.Cad.Core/Draw/VeXData.cs`                                   | Thêm `VaiTroVe.NgatNet` + `HandleTimGiao` + `DaoTay`  |
| Core           | `XBoss.Cad.Core/Ui/ViewModels/NgatNetDialogViewModel.cs` (mới)     | Danh sách điểm giao + nút đảo (M106)                  |
| Core           | `XBoss.Cad.Core/Ui/LenhCatalog.cs`                                 | Khai 2 lệnh mới + `Buoc`/`ThuTuTrongBuoc`             |
| Core           | `XBoss.Cad.Core/Reporting/VeSessionReport.cs`                      | Mục ngắt nét trong báo cáo phiên vẽ                   |
| Adapter        | `XBoss.Cad.Acad/Commands/VeNgatNetCommands.cs` (mới)               | 2 `[CommandMethod]`, transaction, `DrawOrder`, UNDO   |
| Adapter        | `XBoss.Cad.Acad/Services/VeThucThe.cs`                             | Dựng/xóa `Wipeout` + cầu vượt theo handle             |
| Adapter        | `XBoss.Cad.Acad/Ui/Wpf/XBossDialog.xaml`                           | `DataTemplate` cho ViewModel mới                      |
| Shim           | `XBoss.Cad.AcadShim/AcadStub.cs`                                   | Stub `Wipeout`/`DrawOrderTable` nếu còn thiếu         |
| Tài liệu       | `plugin-autocad/README.md`, `CAI-DAT.md`, `VERIFY-VA-PHAT-HANH.md` | Mô tả lệnh + mục verify tay mới                       |

Không migration, không API mới, không đụng web.

## 9. Test plan

- **Core (xunit, CI Linux):** vùng che theo bề rộng + `clearanceMm`; cầu vượt đúng bán kính; lọc góc
  < `minAngleDeg`; xếp hạng `priority` (kể cả hệ không khai); `DaoTay` thắng `priority`; validator
  rule pack bắt đủ 3 lỗi ở §5.
- **Đối chứng 2 tầng:** thêm ca `crossingPolicy` vào `plugin-autocad/doi-chung/` để bản TS và bản C#
  không trôi khác nhau (rủi ro số 1 của M99).
- **Verify tay (`VERIFY-VA-PHAT-HANH.md` mục mới):** AC1, AC2 (chụp `LIST` tọa độ đỉnh trước/sau +
  so số bóc), AC3, AC6, AC7 và **in PDF** kiểm wipeout đúng thứ tự vẽ — chỉ làm được trên máy có
  AutoCAD 2026.

## 10. Kế hoạch PR

| PR  | Nội dung                                                                                     | `route:`  |
| :-- | :------------------------------------------------------------------------------------------- | :-------- |
| PR1 | Rule pack `v<next>` + validator 2 tầng + `CrossingGeometry` + `VaiTroVe.NgatNet` + test Core | `spec`    |
| PR2 | Adapter: 2 lệnh, dựng/xóa thực thể, `DrawOrder`, hộp thoại M106 + đảo tay, báo cáo phiên vẽ  | `complex` |

PR2 mang nhãn `complex` vì `DrawOrder` + wipeout là chỗ phải cân nhắc đánh đổi lúc code (ranh giới
được phép quyết: cách đẩy wipeout lên trên, xử lý khi vùng giao trùng nhiều tuyến chồng nhau).

## 11. Rủi ro / open decisions

| Mục                                          | Giảm thiểu                                                                               | Quyết định                                                                                |
| :------------------------------------------- | :--------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| Wipeout in PDF sai thứ tự trên vài driver    | AC1 bắt buộc in PDF thật trong verify tay; có `gapMode: "jog"` để ép sang cầu vượt       | Chấp nhận                                                                                 |
| Cắt tim do lỗi lập trình                     | AC2 là bất biến có test + verify tay; guardrail 1 ghi ở đầu tệp Adapter                  | Chốt                                                                                      |
| `priority` mặc định có hợp lệ với mọi dự án? | Khai trong rule pack, sửa được per-project qua đường `?project=` đã có ở M101 PR4        | **Chốt 2026-08-29: giữ mặc định trong rule pack**, dự án nào khác thì sửa qua `?project=` |
| Giao 3 tuyến trở lên tại một điểm            | Xử lý theo từng cặp, wipeout chồng nhau vẫn đúng hình; ghi rõ trong báo cáo là "đa giao" | Chấp nhận                                                                                 |

## 12. Approval

- [x] Product/scope
- [x] UX (hộp thoại M106 + đường lui)
- [x] Architecture (guardrail tim bất khả xâm phạm)
- [x] Test/verify tay
- [x] Không còn blocking question

**Kết luận:** **Approved for implementation** (người dùng chốt 2026-08-29: "duyệt tất cả").
**Người/ngày duyệt:** Seeker / 2026-08-29
