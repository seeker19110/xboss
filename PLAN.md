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
