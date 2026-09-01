# M120 — Nghiên cứu: khả năng tự động hoàn thành bản vẽ Revit qua plugin

> **Trạng thái: NGHIÊN CỨU (chưa duyệt, chưa code).** Tài liệu này là bản khảo sát toàn diện —
> _cái gì làm được, bằng công nghệ nào, ràng buộc gì, kiến trúc đề xuất ra sao_ — để người dùng
> quyết định có mở track plugin Revit song song với plugin AutoCAD (M99→M119) hay không.
> Nếu duyệt, mỗi giai đoạn ở §7 sẽ tách thành đặc tả `M<xx>` riêng theo khung chuẩn trước khi code.

Ngày viết: 2026-09-01. Người viết: phiên nghiên cứu theo yêu cầu
"nghiên cứu về toàn bộ khả năng tự động hoàn thành bản vẽ Revit qua plugin".

---

## 1. Hiện trạng trong XBoss (điểm xuất phát)

| Mảng | Hiện có | Ghi chú |
| --- | --- | --- |
| Plugin **AutoCAD** | `plugin-autocad/` — .NET, 4 project (`XBoss.Cad.Core` net8.0 thuần luật + `XBoss.Cad.Acad` net10.0-windows adapter ObjectARX + Shim + Tests), ~50 lệnh `XBOSS_*`, trọn chuỗi hoàn thiện bản vẽ M100→M119 (vẽ nền → phụ kiện → chia đốt → giá đỡ → lỗ chờ → ngắt nét → tag → thống kê → trang in), rule pack v17, đóng gói `dong-goi.ps1` + phát hành qua `XBOSS_PLUGIN_URL` | Code xong toàn bộ; nút thắt là **verify tay** trên AutoCAD 2026 thật (C9–C15) |
| Plugin **Revit** | `mepf-worker/revit/MEPAgents.extension/` — **đúng 1 nút pyRevit "Auto BOQ"** (CPython3): quét 19 BuiltInCategory MEP, lấy id/category/name/length_mm, POST về FastAPI mepf-worker (`/api/v1/revit/analyze`) nhận file Excel BOQ | Chỉ **đọc** model — chưa có bất kỳ logic vẽ/sửa/ghi ngược nào |
| Pipeline server | `mepf-worker` (FastAPI + LangGraph, DXF/ezdxf) và `lib/ky-thuat/cad/` phía XBoss | Chưa đọc được `.rvt`; khuyến nghị hiện tại là xuất **IFC** khi cần đọc model Revit ngoài Revit |
| ADR liên quan | ADR-0006: bản vẽ không rời hạ tầng tự host → APS/Forge để ngỏ; M65: bác phương án Forge (license, phụ thuộc cloud) | Ràng buộc **air-gapped/tự host** vẫn còn nguyên hiệu lực |

Kết luận hiện trạng: XBoss đã có **bộ não luật** (rule packs, matcher, takeoff, graph tuyến M115)
độc lập nền CAD trong `XBoss.Cad.Core`, nhưng toàn bộ **tay vẽ** mới chỉ có bản AutoCAD.
Câu hỏi của nghiên cứu này: tay vẽ Revit tự động được đến đâu, bằng gì.

---

## 2. Khác biệt bản chất AutoCAD ↔ Revit (định hình lại bài toán)

Trong AutoCAD, "hoàn thiện bản vẽ" = sinh **hình học 2D** (polyline đôi, block phụ kiện, tag,
break line…) từ tuyến tim — plugin phải tự vẽ từng nét. Trong Revit, bản vẽ 2D là **hình chiếu
của model 3D tham số**: đặt đúng phần tử (ống, máng, phụ kiện, giá đỡ, sleeve) thì mặt bằng,
mặt cắt, riser, bảng thống kê **tự ra theo**. Vì vậy bài toán Revit tách làm 2 nửa:

1. **Tự động dựng model** (auto-modeling): tuyến tim → hệ ống/máng hoàn chỉnh kèm phụ kiện.
   Đây là phần khó, tương đương M114/M115 bên AutoCAD nhưng lợi thế lớn: **Revit tự chèn
   fitting** (tê/cút/giảm) theo Routing Preferences khi tạo/nối/rẽ nhánh ống qua API — plugin
   không phải tự suy hình học phụ kiện như `SuyPhuKien` bên AutoCAD, chỉ phải suy **tôpô**
   (chỗ nào nối, size nào) — phần này `XBoss.Cad.Core/Graph/` (TuyenGraph, NutPhanLoai,
   KiemTuyen) tái dùng được gần nguyên vẹn vì nó thuần toán trên polyline/điểm.
2. **Tự động ra hồ sơ** (auto-documentation): model → view/sheet/tag/dimension/schedule.
   Phần này Revit API hỗ trợ rất mạnh và **ít rủi ro** — đây là chỗ nên bắt đầu.

## 3. Bốn con đường công nghệ làm plugin Revit

| Con đường | Bản chất | Ưu | Nhược | Phù hợp XBoss? |
| --- | --- | --- | --- | --- |
| **A. Add-in .NET (Revit API)** | DLL C# nạp vào Revit qua `.addin` manifest; `IExternalCommand`/`IExternalApplication`, Ribbon riêng | Toàn quyền API (tạo/sửa phần tử, transaction, sự kiện, WPF UI); cùng stack C#/.NET với `plugin-autocad`; tái dùng `XBoss.Cad.Core` trực tiếp | Khoá version (mỗi bản Revit một target; Revit 2025+ là .NET 8, 2024 trở về trước .NET Framework 4.8); chỉ chạy trong process Revit trên Windows | ✅ **Khuyến nghị chính** — đồng nhất với kiến trúc plugin AutoCAD hiện có |
| **B. pyRevit (CPython/IronPython)** | Extension script như `MEPAgents.extension` hiện tại | Triển khai nhanh, sửa nóng không build, đã có sẵn 1 nút trong repo | Không tái dùng được Core C#; hiệu năng kém với thao tác hàng loạt; phụ thuộc runtime pyRevit cài ngoài; khó đóng gói/verify như bundle | ⚠️ Giữ cho **tiện ích đọc-gửi dữ liệu** (Auto BOQ hiện tại), không xây tính năng vẽ lớn trên nền này |
| **C. Dynamo** | Visual scripting trong Revit | Kỹ sư tự sửa graph | Không đóng gói thành sản phẩm được, không kiểm soát version/idempotency, repo hiện **không dùng Dynamo** | ❌ Loại |
| **D. APS Design Automation for Revit** | Chạy Revit headless trên cloud Autodesk, không cần mở Revit | Tự động hàng loạt server-side, không cần máy kỹ sư | Bản vẽ phải rời hạ tầng tự host — **vi phạm ràng buộc air-gapped** (ADR-0006, M65 đã bác Forge); tính phí theo lượt | ❌ Loại ở giai đoạn này (để ngỏ như ADR-0006, sau interface `register_cad_backend` của mepf-worker) |

## 4. Toàn cảnh khả năng tự động hoá — Revit API cho phép gì

Đối chiếu từng khâu của chuỗi hoàn thiện đã có bên AutoCAD (M100→M117) sang Revit:

### 4.1 Dựng hệ từ tuyến tim (tương đương M107/M114/M115)

- **API lõi:** `Pipe.Create`/`Duct.Create`/`CableTray.Create`/`Conduit.Create` tạo đoạn theo 2
  điểm + system type + size; `Document.Create.NewElbowFitting/NewTeeFitting/NewTransitionFitting/
  NewUnionFitting` hoặc — tốt hơn — nối connector rồi để **Routing Preferences** của
  pipe/duct type quyết định family fitting (đúng chuẩn dự án, không hard-code block như AutoCAD).
- **Tự suy tôpô:** tái dùng `TuyenGraph`/`NutPhanLoai`/`KiemTuyen` (M115) — input là polyline tim
  (vẽ trong Revit bằng Model Line/Detail Line hoặc import DWG tuyến tim từ chính plugin AutoCAD),
  output là danh sách đoạn + nút đã phân loại để gọi API tạo phần tử. **Đây là điểm tái dùng
  giá trị nhất của cả nghiên cứu:** cùng một graph engine phục vụ hai nền CAD.
- **Cao độ & đoạn lên-xuống:** Revit là 3D thật — set elevation trên từng đoạn, API tự chèn cút
  đứng; bên AutoCAD M115 phải "vẽ ký hiệu lên/xuống", bên Revit là hình học thật → mặt cắt/riser
  đúng luôn.
- **Auto-routing giữa 2 thiết bị** (tương đương M114 `XBOSS_HANHLANG`): Revit API **không có**
  auto-route tổng quát; có tiện ích hẹp (`PlumbingUtils.ConnectPipePlaceholdersAtTee/Elbow`,
  chuyển placeholder → pipe thật). Cách làm chuẩn ngành (eVolve/SysQue cũng vậy): tự tìm đường
  bằng thuật toán của mình (A*/Manhattan theo hành lang — chính là `Routing/` của M114) rồi tạo
  placeholder/pipe theo đường tìm được. Tái dùng được engine M114.
- **Fabrication Parts (ITM):** nhánh API riêng (`FabricationPart`, `DesignToFabricationConverter`)
  chuyển hệ design → fabrication để ra spool chế tạo. Mạnh nhưng cần thư viện ITM chuẩn — xếp
  giai đoạn sau, dùng hệ design-intent trước.

### 4.2 Phụ kiện, thiết bị, thư viện (tương đương M100 PHUKIEN/THIETBI, M103/M104/M113)

- `FamilySymbol` + `NewFamilyInstance` đặt thiết bị/van/accessory lên tuyến (API tự cắt ống chèn
  van khi đặt lên pipe). Thư viện block theo dự án (M113) ánh xạ sang **thư viện family + type
  catalog**; route `/api/engineering/cad/*` phía web tái dùng, chỉ thêm loại tệp `.rfa`.
- Gợi ý AI phân loại (M108, tầng 2/3 qua `lib/nen/ai.ts`) áp nguyên xi: family Revit còn có
  **tham số + category chuẩn** nên tầng 1 tất định (map theo category/family name) mạnh hơn hẳn
  bên block AutoCAD; AI chỉ còn xử lý family đặt tên bừa.

### 4.3 Giá đỡ & lỗ chờ (tương đương M100 GIADO/LOCHO)

- **Giá đỡ:** đặt family hanger theo khoảng cách từ rule pack (đã có luật spacing trong Core);
  bám host structure qua `ReferenceIntersector` (bắn tia tìm sàn/dầm phía trên). Các plugin
  thương mại (MEP Supports, eVolve Hangers) chứng minh mảng này tự động hoá được hoàn toàn.
- **Lỗ chờ/sleeve:** đây là chỗ Revit **vượt hẳn** AutoCAD — dùng `ElementIntersectsElementFilter`
  / `BooleanOperationsUtils` tìm giao ống ↔ tường/dầm/sàn (kể cả qua **link kiến trúc/kết cấu**,
  `RevitLinkInstance`), đặt family sleeve đúng tâm giao, đúng kích thước + tolerance từ rule pack.
  Bên AutoCAD phải đoán từ 2D; bên Revit là clash 3D thật. Có thể xuất luôn báo cáo lỗ chờ gửi
  kết cấu duyệt (nối vào flow nghiệm thu XBoss).

### 4.4 Phối hợp xung đột (tương đương M116 `XBOSS_PHOIHOP`)

- Interference check qua API (`ElementIntersectsElementFilter` giữa các category/hệ, hoặc
  `Document.Application` interference report), gom nhóm va chạm, đặt marker/3D view khoanh vùng,
  đẩy danh sách về XBoss (tái dùng bảng + API liên hệ xung đột đã dựng cho M116 nếu có).
  Chuẩn trao đổi trung lập: **BCF** (BIM Collaboration Format) — để ngỏ.

### 4.5 Hồ sơ 2D tự động (tương đương M100 TAG/THONGKE/TRANGIN, M105 CHIADOT, M109/M110/M112)

Nhóm "ăn chắc" nhất — API đầy đủ và tất định:

- **View & Sheet:** `ViewPlan.Create`, `ViewSection.CreateSection`, `View3D`, `ViewSheet.Create`
  + `Viewport.Create` — sinh trọn bộ mặt bằng theo tầng/hệ, mặt cắt tại vị trí khai báo, sheet
  theo khung tên, đánh số tự động. Tương đương `XBOSS_VE_TRANGIN`/`MATCAT` nhưng model-driven.
- **Tag:** `IndependentTag.Create` + quét phần tử chưa tag; tag size/cao độ/BOQCODE (shared
  parameter — xem §5). Tương đương `XBOSS_VE_TAG`/`NHANTUYEN`, kèm luật né chồng chữ từ rule pack.
- **Dimension:** `Document.Create.NewDimension` theo reference — tự ghi kích thước định vị tuyến
  so với trục/tường ở mức luật đơn giản (dim tuyến chính, offset so với trục gần nhất).
- **Riser/sơ đồ đứng (M112):** view 3D + section box theo trục đứng của hệ, hoặc sinh sơ đồ
  nguyên lý dạng drafting view từ graph hệ thống (đi từ `TuyenGraph`). Bản chất dễ hơn AutoCAD
  vì quan hệ hệ thống (`MEPSystem`) đã có sẵn trong model.
- **Revision cloud (M110):** `RevisionCloud.Create` + `Revision` — API trực tiếp, kèm bảng
  revision trên sheet.
- **Chia đốt (M105):** chia đoạn ống theo chiều dài cây (`BreakCurve`/`PlumbingUtils.BreakCurve`,
  `MechanicalUtils.BreakCurve`), ghi tham số số đốt; hoặc đi đường Fabrication spooling ở giai
  đoạn sau.
- **Nhân bản tầng điển hình (M111):** `ElementTransformUtils.CopyElements` giữa level +
  `CopyPasteOptions`; Revit giữ liên kết hệ thống khi copy nên ít rủi ro "đứt tham chiếu" hơn
  bản AutoCAD (vốn đang là nợ verify C9).
- **Thống kê/BOQ:** `ViewSchedule` sinh bảng thống kê sống trong model (không phải bảng vẽ tay
  như AutoCAD) + xuất về XBoss theo BOQCODE — thay thế/nâng cấp nút pyRevit Auto BOQ hiện tại.

### 4.6 Kiểm tra & chuẩn hoá (tương đương `XBOSS_KIEMTRA`/`CHUANHOA`)

- Quét model theo rule pack: hệ chưa gán system type, đoạn hở (connector chưa nối —
  `Connector.IsConnected`), size đổi không có giảm, thiếu tham số bắt buộc (BOQCODE, hệ, tầng),
  sai naming convention, phần tử ngoài workset chuẩn. Báo lỗi dạng danh sách bấm-nhảy-tới
  (`UIDocument.ShowElements`) — giữ nguyên triết lý "kỹ sư duyệt, plugin không tự sửa ẩn".

### 4.7 Những gì KHÔNG nên hứa (giới hạn thật của Revit API)

- **Không có auto-route tổng quát trong API** — phải tự viết (may là đã có M114). Kỳ vọng đúng:
  route theo hành lang/luật, kỹ sư duyệt; không phải "bấm 1 nút ra toàn bộ hệ MEP toà nhà".
- **Headless không tồn tại on-premise**: mọi lệnh chạy trong Revit đang mở, trên Windows, có
  license. Không thể "server tự hoàn thiện model" như pipeline DXF của mepf-worker — trừ khi
  sau này chấp nhận APS (§3D) hoặc dựng máy Windows nội bộ chạy Revit + hàng đợi lệnh (khả thi
  nhưng là một dự án vận hành riêng, chưa bàn ở đây).
- **Đọc/ghi `.rvt` ngoài Revit** không có đường chính thống; đường trung lập là **IFC** (đã ghi
  trong tài liệu mepf-worker) — chỉ phục vụ đọc/kiểm, không ghi ngược model.
- **Transaction bắt buộc**: mọi thay đổi model phải nằm trong `Transaction` — điểm cộng cho
  bất biến idempotent/duyệt-trước-ghi của XBoss (gom mỗi lệnh 1 transaction, fail là rollback
  sạch — an toàn hơn AutoCAD, nơi M118 phải tự vá try/catch từng giai đoạn).

## 5. Neo dữ liệu vào XBoss (điều kiện để "tự động" có giá trị)

Chuỗi giá trị của plugin AutoCAD là: bản vẽ chuẩn hoá → bóc khối lượng theo **BOQCODE** → đẩy
tiến độ/khối lượng về XBoss. Bên Revit, neo tương đương là **Shared Parameter**:

- Định nghĩa bộ shared parameter `XBOSS_BOQCODE`, `XBOSS_HE`, `XBOSS_TANG`, `XBOSS_DOT` (file
  `.txt` shared param đóng gói kèm plugin, checksum như rule pack) gắn lên các category MEP.
- Lệnh gán hàng loạt theo luật (map từ system type/level/zone — luật nằm trong rule pack, cùng
  registry `lib/ky-thuat/cad/rule-packs/` hiện có, thêm section `revit`).
- Từ đó: schedule BOQ, tag, xuất Excel, POST về `/api/engineering/*` — **tái dùng nguyên các
  API và màn hình `/engineering/chuan-hoa-ban-ve`** (thêm nguồn `revit` bên cạnh `autocad`);
  kiểm `boqTakenBy` như mọi nơi khác.
- Chiều ngược: tiến độ/trạng thái nghiệm thu từ XBoss tô màu model (filter theo tham số) — 
  "4D nhẹ" phục vụ họp BCH — chỉ là ứng viên giai đoạn sau.

## 6. Kiến trúc đề xuất (nếu duyệt)

Sao chép mô hình đã chứng minh của `plugin-autocad/`:

```
plugin-revit/
  XBoss.Cad.Core        ← DÙNG CHUNG với plugin AutoCAD (graph M115, routing M114,
                           matcher, rule pack loader, takeoff, Excel) — không fork
  XBoss.Revit.Addin     ← net8.0-windows, adapter Revit 2025/2026 (multi-target
                           RevitVersion qua Directory.Build.props), [Transaction],
                           Ribbon "XBoss" + LenhCatalog kiểu M106
  XBoss.Revit.Shim      ← KHÔNG cần tự viết: dùng gói NuGet Revit API references
                           (kiểu Nice3point.Revit.Api.*) để compile + test trên CI Linux
  XBoss.Revit.Tests     ← xunit cho phần adapter tách được; luật thuần đã test ở Core
```

- Lệnh đặt tên cùng họ `XBOSS_*` để kỹ sư dùng 2 nền không phải học lại; Ribbon + trình dẫn
  giai đoạn giống M106.
- Đóng gói: script PowerShell kiểu `dong-goi.ps1` tạo bundle `.addin` + DLL + shared param +
  sha256; phát hành cùng cơ chế `XBOSS_PLUGIN_URL` (thêm biến `XBOSS_PLUGIN_REVIT_URL`/
  `_SHA256` hoặc mở rộng payload `GET /api/engineering/cad/plugin-package` thành đa gói).
- pyRevit `MEPAgents.extension` giữ nguyên vai trò cầu nối mepf-worker; về dài hạn nút Auto BOQ
  chuyển thành 1 lệnh trong add-in C# để chỉ còn 1 kênh phát hành.
- **Bất biến kế thừa từ M115:** tuyến tim không bị phá; mọi phần tử plugin tạo gắn tham số
  `XBOSS_NGUON` để idempotent (chạy lại = cập nhật, không nhân đôi); rule pack version hoá;
  mặc định TẮT qua policy; không LLM trên đường găng; kỹ sư duyệt trước khi ghi transaction.

## 7. Lộ trình đề xuất (mỗi giai đoạn ~1 đặc tả M riêng)

| GĐ | Nội dung | Độ khó | Giá trị/rủi ro |
| --- | --- | --- | --- |
| R1 | Khung add-in + Ribbon + login/rule pack/shared param XBOSS_* + lệnh KIEMTRA/CHUANHOA (chỉ đọc + gán tham số) | Thấp | Nền móng; rủi ro thấp nhất, ra giá trị BOQ ngay |
| R2 | Thống kê/BOQ + upload về XBoss (thay nút pyRevit), tag/sheet/view tự động | Thấp–vừa | Ăn chắc — API tất định |
| R3 | Tuyến tim → dựng hệ (port TuyenGraph M115, Routing Preferences chèn fitting), chia đốt, nhân bản tầng | Vừa | Giá trị lớn nhất; tái dùng Core |
| R4 | Giá đỡ + lỗ chờ (clash với link kết cấu) + phối hợp xung đột (port M116) | Vừa | Vượt trội bản AutoCAD nhờ 3D thật |
| R5 | Auto-routing hành lang (port M114), gợi ý AI (port M117/M108), Fabrication/spool, 4D tô màu tiến độ | Cao | Chỉ mở sau khi R1–R4 được verify tay |

## 8. Rủi ro & câu hỏi mở (cần người dùng chốt trước khi lập đặc tả)

1. **Verify tay là nút thắt nhân đôi.** Plugin AutoCAD đang tồn C9–C15 chưa verify vì không có
   máy Windows + AutoCAD; Revit y hệt (TECH_DEBT mepf-worker mục 195 đã ghi). Mở track Revit
   trước khi giải xong nợ verify AutoCAD sẽ chồng thêm nợ cùng loại. → Đề xuất: chỉ duyệt R1
   sau khi có quy trình verify tay chạy được thật (máy kỹ sư + checklist kiểu `VERIFY-VA-PHAT-HANH.md`).
2. **Đội có dùng Revit thật không, bản nào?** Toàn bộ M100–M119 nhắm AutoCAD 2026 — cần xác
   nhận dự án TT AVIO có model Revit MEP (và Revit 2025 hay 2026) trước khi đầu tư; nếu quy
   trình thật là AutoCAD-first thì giá trị Revit chỉ ở BOQ/phối hợp (dừng ở R2 + R4-lỗ chờ).
3. **Family/template chuẩn của dự án** — auto-modeling chỉ đúng khi Routing Preferences + thư
   viện family đã chuẩn; cần một bước "chuẩn hoá template" (con người làm, plugin kiểm).
4. **Multi-version Revit** (2024 .NET Framework vs 2025+ .NET 8): đề xuất chỉ hỗ trợ 2025+
   để ở lại .NET 8 chung với Core; hỗ trợ 2024 là chi phí lớn không nên gánh từ đầu.
5. Kênh phát hành: 1 biến env mới hay mở rộng payload plugin-package hiện có (M118 PR3) — chốt
   ở đặc tả R1.

## 9. Kết luận

- **Khả thi và đáng làm, nhưng theo thứ tự hồ sơ-trước-modeling-sau.** Revit API phủ được toàn
  bộ chuỗi hoàn thiện đã xây bên AutoCAD, nhiều khâu (fitting tự chèn, lỗ chờ 3D, schedule sống,
  nhân bản tầng) còn tất định và an toàn hơn bản AutoCAD.
- **Tài sản lớn nhất đã có sẵn:** `XBoss.Cad.Core` (graph M115, routing M114, rule packs,
  matcher, takeoff) độc lập nền CAD — plugin Revit chủ yếu là viết **adapter mỏng** + bộ shared
  parameter, không phải xây lại bộ não.
- **Con đường:** Add-in .NET (phương án A), Revit 2025+, kiến trúc 4-project như plugin AutoCAD,
  NuGet API stubs để CI Linux test được; pyRevit giữ vai phụ; Dynamo và APS loại.
- **Chưa nên code ngay:** chốt 5 câu hỏi §8 (nhất là "đội có model Revit thật không" và nợ
  verify tay AutoCAD) rồi mới viết đặc tả R1.
