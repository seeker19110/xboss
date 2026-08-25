# PLAN.md — Đợt M100+M101 Pha 2: bộ lệnh vẽ Adapter (M100 PR3 → PR4/PR6 → PR7)

**Cập nhật:** 2026-08-25 · **Nguồn:** `docs/nang-cap/M100-xboss-ve-shop-drawing.md` (Approved)
**Nhánh nền:** `claude/plugin-capabilities-limits-rrd2gp` — base mọi worktree trên nhánh này (KHÔNG origin/main). Pha 1 đã tích hợp: rule pack v4 + `Core/Draw/{DrawToolsConfig,TakeoffCrossCheck,BlockManifest}` + server block-lib.

## Bối cảnh & ràng buộc CỨNG cho mọi việc

- Worker không thấy hội thoại. Đọc: `CLAUDE.md`, TOÀN BỘ đặc tả M100, `plugin-autocad/README.md` (mục Ràng buộc thiết kế), code hiện trạng `XBoss.Cad.Acad/Commands/` + `Services/` (bám đúng phong cách lệnh M99: transaction, UNDO group, prompt tiếng Việt, xử lý lỗi).
- **`XBoss.Cad.Acad` KHÔNG build được trên Linux** (net10.0-windows + ObjectARX). Code Adapter viết "mù" — vì vậy: (1) mọi logic tính toán được phải đẩy xuống `XBoss.Cad.Core` (net8.0, thuần, CÓ test — `export SSL_CERT_FILE=/root/.ccr/ca-bundle.crt` trước khi chạy `dotnet test`); (2) Adapter chỉ còn lớp mỏng gọi API AutoCAD; (3) đối chiếu kỹ tên API với code Adapter hiện có (`PluginExtension.cs`, các lệnh `XBOSS_*` sẵn có) — dùng đúng các using/pattern đã compile được trên máy thật (bài học "8 lỗi CI không thể bắt" trong PROGRESS.md); (4) mô phỏng tay từng luồng lệnh trong đầu trước khi báo xong.
- Core CẤM tham chiếu assembly AutoCAD. Mỗi lệnh = 1 transaction = 1 UNDO group. Không đụng hành vi lệnh M99.
- XData appname `XBOSS_VE` theo M100 §11; KHÔNG đụng appname `XBOSS_BOCKL`.
- Tiếng Việt toàn bộ prompt/thông báo/comment/commit. Không push — commit trong worktree.
- Node chỉ cần nếu việc chạm TS (Pha 2 không chạm TS trừ khi đặc tả bắt).
- Cổng mỗi việc: `dotnet test plugin-autocad/XBoss.Cad.Tests/XBoss.Cad.Tests.csproj` xanh toàn bộ (không làm đỏ ca cũ).

## Việc V3 — Nền vẽ + tuyến + nhãn (M100 PR3) — `route: complex`

Đặc tả: §6.1 (journey 1–3, 6), §6.11, §7 FR3/FR4/FR7(nhãn)/FR9/FR10, §8 AC1/AC2(phần layer)/AC3.

1. Core `Draw/EdgeOffset.cs`: polyline tim (danh sách đỉnh + bulge) + width → 2 polyline biên offset ±w/2; đoạn thẳng + cung tròn (bulge); spline/tự cắt → trả "không offset được" (Adapter chỉ vẽ tim + cảnh báo). Test kỹ (thẳng/gãy khúc/cung/width lẻ).
2. Adapter `Services/VeContext.cs`: trạng thái phiên vẽ (hệ đang chọn, line đang chọn, size, slope) + đọc `drawTools` qua `DrawToolsConfig` từ rule pack cache hiện có (xem service rule pack của M99).
3. Adapter `Commands/VeNenCommands.cs`: `XBOSS_VE_NEN` — chọn hệ; khóa + transparency (`baseFadePct`) mọi layer hiện có; tạo layer đích của hệ + `-EDGE` (màu/lineweight theo `lineweightMap`); chạy lại → hoàn nguyên (lưu trạng thái trước vào XData NOD hoặc dictionary bản vẽ). KHÔNG sửa/xóa đối tượng nền.
4. Adapter `Commands/VeTuyenCommands.cs`: `XBOSS_VE` — chọn loại tuyến/size (keyword prompt; `slopeRequired` → hỏi slope từ `slopes`); vẽ polyline như PLINE; kết thúc: đặt layer, ghi XData `[systemId, itemId, size, rulePackVersion, custom?, slope?]`; `edgeStyle=double` → `EdgeOffset` sinh biên trên `-EDGE`, XData 2 chiều (biên giữ handle tim, tim giữ handles biên). ESC → abort sạch. `XBOSS_VE_NHAN` — bấm tuyến → MTEXT nhãn size (+`i=…%` kèm block `slope-arrow` nếu có slope; thiếu block trong thư viện → chỉ text) trên layer `G-ANNO-TEXT`, `labelStyle`, XData liên kết tim.
   Ranh giới được quyết: chi tiết prompt/keyword; cách lưu trạng thái VE_NEN; jig hay PLINE wrap.

## Việc V4 — Phụ kiện + thiết bị + thư viện (M100 PR4) — `route: complex` (SAU V3)

Đặc tả: §6.1 bước 4–5, §6.10, §7 FR5/FR6, §8 AC4/AC5/AC7/AC8.

1. Core `Draw/FittingPlacement.cs`: điểm chèn trên polyline → góc tiếp tuyến (đoạn thẳng + cung) + scale theo size (manifest `scaleBySize`); test (giữa đoạn/tại đỉnh/trên cung, sai số ≤0.1°).
2. Adapter `Services/BlockLibraryService.cs`: tải qua `GET /api/engineering/cad/block-lib` (token M99, ETag, cache `%APPDATA%\XBoss\block-lib\`), kiểm sha256 (`BlockManifest`); nhập định nghĩa block vào DWG 1 lần (`Database.Insert` từ tệp cache), trùng tên khác định nghĩa → hỏi (AC7).
3. Adapter `Commands/VePhuKienCommands.cs`: `XBOSS_VE_PHUKIEN` (chọn theo `fittings` của hệ, bấm điểm trên tim → xoay `rotateToPath`, layer hệ), `XBOSS_VE_THIETBI` (equipment, attribute TAG bắt buộc + MODEL/SIZE, prompt nhập), `XBOSS_VE_THUVIEN` (nạp tệp thư viện tay: .dwg + manifest.json cạnh nhau).

## Việc V5 — Trang in + mặt cắt (M100 PR6) — `route: complex` (SAU V3, ∥ V4)

Đặc tả: §6.3, §6.4, §7 FR9a/FR9b, §8 AC10/AC11, `sheetSetup` §11.

1. Core `Draw/SectionBuilder.cs`: tuyến cắt (2 điểm) + danh sách tim (đỉnh + XData size + loại) → giao điểm, thứ tự chiếu lên tuyến cắt, toạ độ ký hiệu (chữ nhật WxH / tròn DN / máng) theo khoảng cách ngang thật; tuyến song song tuyến cắt → bỏ qua kèm cảnh báo. Test kỹ.
2. Adapter `Commands/VeTranginCommands.cs`: `XBOSS_VE_TRANGIN` — layout mới + page setup (`sheetSetup.plotter`, khổ, CTB theo `lineweightMap`), viewport đúng tỉ lệ + LOCK, VP-freeze layer ngoài hệ, chèn titleblock (manifest kind `titleblock` theo khổ) + điền attribute (DU_AN từ cache LOGIN nếu có, còn lại prompt + nhớ lần trước), tên layout theo `layoutNamePattern`; 1 UNDO xóa trọn.
3. Adapter `Commands/VeMatcatCommands.cs`: `XBOSS_VE_MATCAT` — kẻ tuyến cắt, tìm giao qua `SectionBuilder`, cao độ prompt từng tuyến (mặc định `defaultElevations`/lần trước), dựng hình + nhãn + tên A-A tự đánh (`sectionNamePattern`), XData snapshot `[tuyến-cắt-handle, ngày]`.

## Việc V6 — Giá đỡ + lỗ chờ + tag + thống kê (M100 PR7) — `route: complex` (SAU V3+V4)

Đặc tả: §6.7/§6.8/§6.9, FR9c–9g, AC12/AC13/AC14.

1. Core `Draw/SupportSpacing.cs`: chiều dài tuyến + spacing + vị trí phụ kiện nặng → danh sách vị trí giá đỡ (đầu/cuối luôn có, chia đều ≤ spacing); bổ sung đoạn thiếu khi đã có giá đỡ cũ. Test AC12 (10m/2400 → 5 vị trí).
2. Core: bảng lỗ chờ Excel (`Excel/` — ClosedXML, bảng đơn giản STT/vị trí trục/cao độ/size/hệ, KHÔNG đụng mẫu BOQ).
3. Adapter `Commands/VeGiadoCommands.cs` (`XBOSS_VE_GIADO` — block kind `support`, vuông góc tuyến, XData tim↔giá đỡ chống trùng), `Commands/VeLochoCommands.cs` (`XBOSS_VE_LOCHO` — chèn sleeve size ống + `sleeveClearanceMm` tại điểm bấm/giao layer `S-GRID-COLS` có xác nhận; chế độ xuất: Table trong bản vẽ + Excel), `Commands/VeTagCommands.cs` (`XBOSS_VE_TAG` — đánh/đánh lại theo `tagPattern`, tầng nhớ per bản vẽ, quét trùng/nhảy số, option khóa tag), `Commands/VeThongkeCommands.cs` (`XBOSS_VE_THONGKE` — Table thiết bị từ attribute hoặc KL từ XData `XBOSS_BOCKL` (chỉ ĐỌC appname đó), style `tableStyle`, chạy lại cập nhật tại chỗ qua XData đánh dấu bảng).
4. Rule pack: nếu v4 thiếu khóa nào §6.7–6.9 cần → BÁO, không tự sửa v4 (append-only; phiên chính quyết).

## Việc V7 — VE_DOI + báo cáo phiên vẽ + tài liệu (M100 PR5) — `route: standard` (CUỐI)

Đặc tả: §6.2, FR8, §14. `XBOSS_VE_DOI` trong `Commands/VeDoiCommands.cs`: đổi layer/XData/dựng lại biên (EdgeOffset)/cập nhật nhãn; đoạn đã bóc → gỡ đánh dấu (tái dùng logic BOCKL_XOA theo selection) + cảnh báo. Báo cáo phiên vẽ JSON cạnh DWG (khung báo cáo M99). Cập nhật `plugin-autocad/README.md` (bảng lệnh) + `CAI-DAT.md` (mục dùng lệnh vẽ) + M100 State.

## Thứ tự & phụ thuộc

V3 → (V4 ∥ V5) → V6 → V7. Mỗi việc worktree riêng; các file Commands/Core đặt tên như trên để không đụng nhau; `XBoss.Cad.Acad.csproj` dùng glob compile mặc định SDK-style nên thêm file không sửa csproj. Reviewer soát từng việc; tích hợp tuần tự vào nhánh nền, KHÔNG push.

---

# Pha 3 — M101 (nâng trần KIEMTRA/CHUANHOA/BOCKL)

**Đặc tả:** `docs/nang-cap/M101-plugin-nang-tran.md` (Approved). Ràng buộc chung giống Pha 2 (Core thuần test được, Adapter không build trên Linux, tiếng Việt, 1 UNDO, không đụng hành vi M99).

## Việc W1 — Rule pack v5 + 7 phép kiểm mới (M101 PR1) — `route: complex`

Đặc tả M101 §6.1 (bảng 7 phép kiểm 10–16), §7 FR1/FR2, §15, §18.

- `lib/ky-thuat/cad/rule-packs/v5.json` — append-only từ v4 (v1–v4 KHÔNG đổi 1 byte). Mở rộng khối `inspectionPolicy` (xem v2/v3 hiện có): mỗi phép kiểm mới 1 mục có `enabled` riêng, **mặc định `false`** (M101 §6.2/§7 FR1: nạp plugin cũ không đổi hành vi), kèm tham số: `overlapToleranceMm`/`overlapMinLengthMm` (phép 10), `clashPairs` (phép 11, mảng cặp hệ, mặc định rỗng), `titleblockNameMatchAny` (phép 12 — dùng khi manifest M100 chưa có), `scales` cho phép 13 (tái dùng `sheetSetup.scales` nếu có, khai fallback), `styleMap` (phép 14: textstyle/dimstyle chuẩn — đây cũng là dữ liệu bước chuẩn hóa 8 của PR2, khai một lần dùng chung), `strayDistanceFactor` (phép 16). Mô tả tiếng Việt từng khóa như phong cách v3/v4.
- `XBoss.Cad.Core/Inspection/` — thêm 7 phép kiểm THUẦN theo đúng khung `Inspector` hiện có (ĐỌC code hiện trạng trước, giữ nguyên kiểu dữ liệu báo cáo/marker): 10 chồng lấn cùng hệ, 11 clash 2D (nhãn cảnh báo cố định "(mặt bằng) — không thay được clash 3D"), 12 khung tên thiếu trường, 13 viewport không khóa/tỉ lệ lạ, 14 text/dim style lệch, 15 nhãn size lệch XData (thiếu dữ liệu M100 → **tự tắt**, không báo oan), 16 đối tượng ngoài khung. Dữ liệu hình học/viewport/attribute do Adapter cung cấp — **định nghĩa DTO đầu vào trong Core**, Adapter điền ở PR sau (PR này KHÔNG sửa `XBoss.Cad.Acad`).
- Báo cáo JSON: thêm các phép mới vào cùng cấu trúc `checks[]` hiện có, không phá khung cũ.
- Test: mỗi phép 1 ca dương + 1 ca âm (không báo oan), + ca "v5 mặc định tắt hết phép mới → kết quả y hệt v4", + ca "v4 vẫn nạp được sau khi phát hành v5".
- `lib/ky-thuat/cad/rule-pack.ts` + route: phát hành v5 là bản hiện hành (như V1 đã làm với v4).

**Tiêu chí chấp nhận:** dotnet test xanh toàn bộ (119 hiện tại + mới); test node liên quan xanh; v1–v4 không đổi; chứng minh mutation (bật 1 phép + dữ liệu vi phạm → đỏ; gỡ → xanh).

## Việc W3 — Bóc theo size + theo vùng + cách nhiệt + hệ số quy đổi (M101 PR3) — `route: complex`

Đặc tả M101 §6.3 (bảng 6 nâng cấp — làm 4 mục đầu ở PR này, `boqCode` per-project + đối chiếu BOQ để PR4), §7 FR4/FR6, §8 (c)(d), §15, §18.

**Nền có sẵn:** rule pack v5 (hiện hành), `XBoss.Cad.Core/Takeoff/` (bóc hiện tại), `Excel/` (ClosedXML, mẫu công ty §13.2 M99 — **hợp đồng layout, cột/sheet mới chỉ được CỘNG THÊM**), `Draw/VeXData.cs` (đọc XData `XBOSS_VE` do M100 ghi: hệ/item/size/slope), `Matching/TokenMatcher.cs`.

1. **Rule pack v6** (append-only, v1–v5 không đổi 1 byte): `takeoff.items[]` thêm khóa tùy chọn `groupBySize` (bool), `sizeFromNearbyText` (`{enabled, maxDistanceMm, sizePatterns[]}`), `wastagePct` (số, mặc định 0), `perCountAdd` (số, mặc định 0), và item dẫn xuất `derivedFrom` + `formula` (`"perimeter*length"` | `"pi*dn*length"`). Mọi khóa mới **mặc định vắng/0** → v6 cho kết quả y hệt v5 (ca test bắt buộc).
2. **Core `Takeoff/`**: bóc tách dòng theo size khi `groupBySize` — nguồn size ưu tiên XData `XBOSS_VE`, thiếu thì đọc nhãn gần tuyến theo `sizePatterns` (ghi rõ **nguồn** "XData" / "đọc từ nhãn" vào kết quả từng dòng); item dẫn xuất tính từ size đã tách (thiếu size → bỏ qua + đếm mét chưa tính, KHÔNG đoán); `wastagePct`/`perCountAdd` tính thành cột RIÊNG, không trộn vào KL đo.
3. **Core `Zoning/` (MỚI, thuần)**: clip polyline theo ranh giới (polyline kín) — trả phần nằm trong + chiều dài từng phần, cắt đúng tại giao điểm; đoạn cung xử lý đúng. Kết quả bóc gắn tên vùng.
4. **Excel**: thêm cột "Vùng", tách cột "KL đo" / "KL quy đổi" (công thức sống), subtotal theo vùng; giữ nguyên cột A–K + công thức H/J/K + SUBTOTAL tổng của mẫu công ty. Sidecar JSON thêm size/vùng/nguồn size.
5. **Adapter**: chỉ phần tối thiểu để truyền vùng chọn + nhãn gần tuyến vào Core (dùng stub `/tmp/claude-0/-home-user-xboss/3f35183b-b0e6-57b0-a97e-118b57e3f070/scratchpad/acad-shim/` để biên dịch thử). Nếu phần Adapter quá rủi ro khi code mù → làm Core + test trọn vẹn, để Adapter tối thiểu và GHI RÕ trong báo cáo.

**Tiêu chí chấp nhận:** AC (c) tuyến 10m cắt ranh giới 6/4 → vùng A 6.00m, vùng B 4.00m; AC (d) cách nhiệt ống gió 300x200 dài 10m → 10×(0.3+0.2)×2 = 10.00 m²; v6 mặc định = v5; Excel mở được, mẫu cũ không vỡ (test round-trip ClosedXML như M99 đã có).

## Việc W2 — 4 bước chuẩn hóa mới: style/xref/hatch/layout (M101 PR2) — `route: complex`

Đặc tả M101 §6.2 (bảng 4 bước, chèn SAU bước lineweight/CTB hiện tại — thứ tự cố định mới 8/9/10/11), §7 FR3.

- Rule pack **v7** (append-only; v1–v6 KHÔNG đổi 1 byte): thêm `xrefPolicy` (`{enabled:false, pathPolicy:"relative", bindMatchAny:[]}`), `hatchMap` (`{enabled:false, byLayer:[…]}`), `layoutPolicy` (`{enabled:false, removeEmpty:true, renameLayouts:false, namePattern}`). **`styleMap` đã có sẵn từ v5** — bước 8 dùng lại chính nó, KHÔNG khai trùng. Mọi bước mới **mặc định tắt** ⇒ ca test bắt buộc "v7 mặc định = v6".
- `XBoss.Cad.Core`: logic thuần cho 4 bước (quyết định đổi gì → trả danh sách thay đổi + báo cáo), theo đúng khung `StandardizePipeline` hiện có (ĐỌC trước). Adapter áp thay đổi — **chỉ sửa `StandardizePipeline`/lệnh CHUANHOA ở mức tối thiểu**, dùng stub `/tmp/claude-0/-home-user-xboss/3f35183b-b0e6-57b0-a97e-118b57e3f070/scratchpad/acad-shim/app-w3/` để biên dịch thử (W3 đã mở rộng stub đủ cho `XBossCommands.cs`).
- Ràng buộc: dimension không mất associativity (M99 O3); xref mặc định CHỈ BÁO, không bind; 1 UNDO cho cả pipeline; diff preview + báo cáo JSON giữ khung cũ.
- **Nợ phải đóng luôn trong việc này** (hazard có sẵn, ghi ở `PROGRESS.md`): `StandardizePipeline.Buoc2LayerMapping` gộp layer bằng `LayerTable.Has(tên đích)` — `Has` KHÔNG phân biệt hoa/thường, nên layer chỉ lệch hoa/thường với tên đích (vd `m-duct-supp`) rơi vào nhánh "gộp" rồi `Erase()` chính layer đang chứa thực thể. Sửa: bỏ qua khi `string.Equals(cũ, mới, OrdinalIgnoreCase)`. Kèm test.

**Tiêu chí chấp nhận:** dotnet test xanh toàn bộ (hiện 365 ca); v7 mặc định = v6 (ca test); hazard hoa/thường có test chứng minh bắt được.

## Việc W4 — `boqCode` per-project + đối chiếu BOQ chỉ-đọc (M101 PR4) — `route: complex`

⚠️ **Vùng rủi ro cao** (`lib/khoi-luong/boq.ts`) — bắt buộc rà `docs/audit.md` mục "Vùng rủi ro cao" và mục bảo mật/phân quyền trước khi code.

Đặc tả M101 §6.3 (2 dòng cuối bảng: `boqCode` theo dự án, đối chiếu BOQ trong Excel), §7 FR5/FR6, §9, §16 (PR4), §18.

1. **Map `boqCode` theo dự án**: DDL thêm thuần (lấy số migration thật bằng `ls migrations | sort -V | tail -3`) — bảng map `(project_id, takeoff_item_id) → boq_code`; **có `project_id` ⇒ phải vào RLS theo đúng khuôn các bảng theo dự án hiện có** (ĐỌC migration RLS gần nhất + `lib/bao-mat/` trước). Admin/PM nhập trên web (thêm mục vào bảng điều khiển plugin `/engineering/chuan-hoa-ban-ve`).
2. **`GET /api/engineering/cad/rule-pack?project=<id>`**: trả rule pack hiện hành có `takeoff.items[].boqCode` đã gán theo map của dự án; không có `?project=` → giữ nguyên hành vi cũ (toàn cục). Auth như route rule-pack hiện tại; **project scope phải kiểm bằng ngữ cảnh phiên/token, KHÔNG tin id client gửi** (bài học lặp lại nhiều đợt — xem `docs/audit.md`).
3. **`GET /api/engineering/cad/boq-snapshot?project=<id>`** (MỚI, **chỉ đọc**): trả KL BOQ hợp đồng theo item để plugin đặt cạnh KL bóc. Token scope `cad` hoặc phiên; **không mở bất kỳ đường ghi nào** (đường ghi sổ duy nhất vẫn là upload có kiểm định). Cột tiền: M101 PR4 **không đụng tiền** — chỉ khối lượng; nếu buộc phải chạm cột tiền thì cast `::text` theo quy ước M45 (`lib/nen/money.ts`).
4. **Excel**: sheet phụ `Doi-chieu` (tùy chọn khi phát lệnh) — KL BOQ hợp đồng cạnh KL bóc, chênh lệch % bằng **công thức sống**. Không đụng `Data-BOQ` (mẫu công ty) và không đụng sheet `Tong-hop-vung` của PR3.
5. **Adapter**: `XBOSS_BOCKL_XUAT` thêm tùy chọn kéo snapshot (có mạng + token) → dựng sheet đối chiếu; không mạng → bỏ qua kèm thông báo, KHÔNG chặn xuất Excel.

**Tiêu chí chấp nhận:** AC (e) — đổi KL BOQ trên server thì sheet `Doi-chieu` lần xuất sau đổi theo, bản vẽ không đổi; route mới có `getCurrentUser()` + 401 + kiểm quyền; test node phủ auth 401/403 + RLS chéo dự án; dotnet test xanh toàn bộ.

## Việc W5 — `XBOSS_BATCH` bóc hàng loạt + upload kèm KL + web (M101 PR5) — `route: standard`

Đặc tả M101 §6.4.

1. `XBOSS_BATCH` thêm chế độ `bocl`: bóc cả thư mục `.dwg` qua side database → **1 Excel tổng** nhiều bản vẽ (thêm cột "Tệp"), bản gốc giữ nguyên, tệp lỗi bỏ qua + ghi nhật ký (bám đúng khuôn `BatchProcessor` hiện có).
2. `XBOSS_UPLOAD` gửi kèm **sidecar JSON kết quả bóc** (đã có sẵn từ PR-B) → server lưu vào `drawing_revisions.standardize_report` khối `takeoff`. **KHÔNG ghi vào bảng BOQ** (giữ nguyên đường ghi sổ duy nhất).
3. Web: bảng điều khiển hiện KL đã bóc theo revision (biểu đồ theo hệ/vùng) + nút tải Excel gộp.

**Tiêu chí chấp nhận:** dotnet test + test node liên quan xanh; upload cũ (không kèm KL) vẫn chạy y nguyên; không có đường ghi mới nào vào bảng BOQ.
