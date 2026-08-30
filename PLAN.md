# PLAN.md — Đợt M115→M117: tự động triển khai bản vẽ MEPF từ tuyến tim

**Cập nhật:** 2026-08-30 · **Nguồn:** `docs/nang-cap/M115-hoan-thien-ban-ve-tu-tuyen-tim.md`,
`M116-phoi-hop-xung-dot-lien-he.md`, `M117-ai-doc-so-do-nguyen-ly.md` (cả 3 **Approved 2026-08-30**).
**Nhánh nền:** `claude/mepf-auto-deploy-plugin-6qsbq8` — base MỌI worktree trên nhánh này (KHÔNG
origin/main: nhánh này chứa 3 đặc tả; trước khi bắt đầu chạy `git fetch origin` và rebase nhánh nền
lên `origin/main` mới nhất nếu main đã tiến).
**Trạng thái thi hành:** CHƯA KÍCH HOẠT — người dùng sẽ ra lệnh thi hành sau. Khi kích hoạt: giao
nguyên văn tệp này cho `coordinator`.

## Bối cảnh & ràng buộc CỨNG cho mọi việc

- Worker không thấy hội thoại. Bắt buộc đọc trước: `CLAUDE.md`; TOÀN BỘ đặc tả M của việc mình;
  `plugin-autocad/README.md` (Ràng buộc thiết kế); code hiện trạng nêu trong brief.
- **`XBoss.Cad.Acad` KHÔNG build được trên Linux** (net10.0-windows + ObjectARX). Vì vậy: (1) mọi
  logic tính được đẩy xuống `XBoss.Cad.Core` (thuần, có test — `export SSL_CERT_FILE=/root/.ccr/ca-bundle.crt`
  trước `dotnet test plugin-autocad/XBoss.Cad.Tests/XBoss.Cad.Tests.csproj`); (2) Adapter là lớp
  mỏng gọi API AutoCAD, đối chiếu tên API/using với các lệnh `XBOSS_*` đã compile trên máy thật
  (bài học "8 lỗi CI không thể bắt", `PROGRESS.md`); (3) thiếu API trong `XBoss.Cad.AcadShim/AcadStub.cs`
  → bổ sung stub, không đổi chữ ký stub cũ; (4) mô phỏng tay từng luồng lệnh trước khi báo xong.
- Core CẤM tham chiếu assembly AutoCAD. Mỗi lệnh = 1 transaction = 1 UNDO group. KHÔNG đổi hành vi
  lệnh hiện có (M99→M114). Hộp thoại theo khuôn M106: ViewModel thuần trong `Core/Ui/ViewModels/` +
  DataTemplate trong `XBoss.Cad.Acad/Ui/Wpf/XBossDialog.xaml`; lệnh mới khai trong
  `Core/Ui/LenhCatalog.cs` (nguồn sự thật Ribbon/trình dẫn).
- **Rule pack append-only**: version cũ không đổi 1 byte; version mới mọi khoá mặc định TẮT ⇒ merge
  không đổi hành vi máy kỹ sư. Số version lấy theo max thật trong `lib/ky-thuat/cad/rule-packs/`
  tại thời điểm code (hiện v15 — KHÔNG tin số này, ls lại); validator 2 tầng: TS trong
  `lib/ky-thuat/cad/rule-pack.ts` + C# trong `Core/RulePack/`.
- Web sau refactor #438: KHÔNG tạo lại tệp đã gộp — sửa đúng khối `// ===== <tên cũ> =====` trong
  `lib/ky-thuat/cad/{rule-pack,block,drawing,dashboard}.ts`, `lib/dich-vu/cad.ts`.
- Tiếng Việt toàn bộ prompt/thông báo/comment/commit. Worker KHÔNG push — commit trong worktree,
  coordinator tích hợp tuần tự vào nhánh nền.
- Cổng mỗi việc: `dotnet test` xanh toàn bộ (không làm đỏ ca cũ); việc chạm TS thêm
  `npm run lint` + `npm run typecheck` + test node liên quan; việc chạm web/UI thêm `npm run build`.
- Việc cuối mỗi pha cập nhật `PROGRESS.md` + State trong `docs/nang-cap/README.md` + mục verify
  mới trong `plugin-autocad/VERIFY-VA-PHAT-HANH.md` (toàn đợt CHƯA phát hành rộng cho tới khi
  verify tay AutoCAD 2026 — nợ M111 vẫn chặn, ghi rõ trong báo cáo).

---

# Pha 1 — M115: Hoàn thiện bản vẽ từ tuyến tim (làm TRƯỚC, trọn pha rồi mới sang Pha 2)

**Đặc tả:** `docs/nang-cap/M115-hoan-thien-ban-ve-tu-tuyen-tim.md`. Không migration, không API mới.

## Việc V1 — Rule pack `completionPolicy` + Core graph (M115 PR1) — `route: complex`

Đặc tả §6 bước 3, §7 FR2/FR5, §8 AC1/AC5.

1. Rule pack version mới (append-only): khối `drawTools.completionPolicy` — `enabled` (mặc định
   `false`), `nodeToleranceMm` (dung sai gộp điểm chạm/giao thành nút), bảng `fittingRules` (chọn
   co/cút/tê/giảm theo systemId + size + khoảng góc; tham chiếu block `kind=fitting` trong thư
   viện 0139/0145), `stageDefaults` (8 giai đoạn hoàn thiện, mỗi giai đoạn bật/tắt), mô tả tiếng
   Việt từng khoá theo phong cách v13–v15. Validator 2 tầng (TS + C#) + phát hành thành bản hiện hành.
2. `XBoss.Cad.Core/Graph/` (mới, thuần): `TuyenGraph.cs` (input: danh sách polyline tim [đỉnh +
   XData hệ/size/cao độ/kiểu nối — DTO tự định nghĩa, Adapter điền ở V2] + danh sách block thiết bị
   [tâm + kind/systemId/tag] → gộp nút theo `nodeToleranceMm`, cạnh có hướng từ điểm nguồn);
   `NutPhanLoai.cs` (tê 3 nhánh, co/cút tại đỉnh đổi hướng theo khoảng góc, giảm khi size 2 đoạn
   khác, đoạn lên/xuống khi cao độ đổi, kết nối thiết bị khi đầu tuyến chạm block đúng hệ);
   `SuyPhuKien.cs` (nút phân loại → block phụ kiện theo `fittingRules`; không có luật khớp →
   `chua_quyet`, KHÔNG đoán); `KiemTuyen.cs` (lỗi chặn: tuyến hở — đầu tự do không chạm thiết
   bị/tuyến khác, thiếu size, thiết bị sai hệ, cao độ mâu thuẫn tại nút; cảnh báo: tuyến chưa gán
   thuộc tính). Tái dùng `Geometry/Segment2D`; tham khảo cấu trúc `Routing/HanhLangGraph.cs`.
3. Test xunit: AC1 (1 nguồn + 2 nhánh + block FCU → 2 tê + co đúng vị trí + 3 kết nối, 0 lỗi);
   dung sai nút (2 điểm cách < / > tolerance); mỗi loại lỗi chặn 1 ca dương + 1 ca âm; `fittingRules`
   không khớp → `chua_quyet`; AC5 (rule pack mới mặc định tắt → validator nhận cả version cũ,
   test snapshot version cũ không đổi byte). Test node cho validator TS.

**Ranh giới được quyết:** shape DTO input graph; cấu trúc `fittingRules` (miễn đủ hệ+size+góc→block
và validator chặt); thuật toán gộp nút. **KHÔNG được:** sửa version rule pack cũ, đụng
`XBoss.Cad.Acad`, đổi lệnh hiện có.
**Tiêu chí chấp nhận:** dotnet test + npm test liên quan xanh toàn bộ; v1..v15 không đổi 1 byte.

## Việc V2 — `XBOSS_TUYEN_GAN` + `XBOSS_TUYEN_DOTHI` (M115 PR2) — `route: spec` (SAU V1)

Đặc tả §6 bước 2–4, §7 FR1/FR2, §8 AC6.

1. Adapter `Commands/TuyenGanCommands.cs`: `XBOSS_TUYEN_GAN` — chọn 1..n line/pline; form WPF
   (DataTemplate + ViewModel `Core/Ui/ViewModels/TuyenGanViewModel.cs`): hệ (từ `drawTools.systems`),
   size, cao độ mm, vật liệu/cách nhiệt, kiểu nối (từ `jointRules`); layer khớp `layerMap` → điền
   sẵn hệ; ghi XData appname `XBOSS_VE` theo khuôn M107 (đối chiếu code M107 hiện có — KHÔNG đổi
   schema XData cũ, chỉ thêm trường thiếu như cao độ/kiểu nối nếu chưa có); line thường được
   convert? KHÔNG — giữ nguyên thực thể, chỉ ghi XData (bất biến tọa độ). Liệt kê tuyến chưa đủ
   thuộc tính (bấm → zoom).
2. Adapter `Commands/TuyenDoThiCommands.cs`: `XBOSS_TUYEN_DOTHI` — quét tuyến mang XData + block
   thiết bị trong phạm vi chọn (cả bản vẽ / cửa sổ), điền DTO, gọi `Core/Graph/`; hộp thoại kết
   quả (ViewModel `TuyenDoThiViewModel`): tab lỗi chặn/cảnh báo (bấm → zoom đối tượng), tab
   nút/phụ kiện suy ra — kỹ sư sửa từng dòng (đổi block phụ kiện trong danh sách hợp lệ của hệ,
   hoặc "bỏ qua nút này"); bấm "Chốt đồ thị" → ghi kết quả graph (kể cả phần kỹ sư sửa) vào XData
   NOD/dictionary bản vẽ (khuôn lưu trạng thái của `XBOSS_VE_NEN`), làm đầu vào cho V3. Còn lỗi
   chặn → không cho chốt.
3. Test: ViewModel logic thuần (lọc, chuyển trạng thái duyệt) trong xunit; luồng Adapter mô phỏng tay.

**Tiêu chí chấp nhận:** dotnet test xanh; không lỗi chặn mới trong lệnh cũ; 2 lệnh vào `LenhCatalog.cs`
(giai đoạn "Vẽ") + Ribbon.

## Việc V3 — `XBOSS_HOANTHIEN` điều phối 8 giai đoạn (M115 PR3) — `route: spec` (SAU V2)

Đặc tả §6 bước 5–6, §7 FR3/FR4, §8 AC2/AC3/AC4/AC6.

1. Adapter `Commands/HoanThienCommands.cs` + `Services/HoanThienPipeline.cs`: đọc graph đã chốt
   (V2); hộp thoại chọn giai đoạn (mặc định theo `stageDefaults`): ① nét đôi ② phụ kiện tại nút
   ③ chia đốt ④ giá đỡ ⑤ lỗ chờ ⑥ ngắt nét ⑦ tag ⑧ thống kê — mỗi giai đoạn GỌI LẠI service của
   lệnh `XBOSS_VE_*` tương ứng (tái cấu trúc tối thiểu: nếu logic đang nằm trong thân lệnh, tách
   phần thân ra service để gọi chung — hành vi lệnh gốc không đổi; KHÔNG copy-paste logic vẽ).
   Chạy trọn gói hoặc từng giai đoạn; toàn phiên 1 UNDO group.
2. Idempotency (FR4): mọi thực thể sinh ra ghi XData `nguon=M115` + handle tuyến gốc + giai đoạn;
   chạy lại → xoá đúng phần `nguon=M115` của tuyến trong phạm vi rồi sinh lại; thực thể kỹ sư
   vẽ/sửa tay (không mang `nguon=M115`, hoặc cờ `SuaTay` theo băm hình học — tái dùng khuôn M114
   PR4) KHÔNG bị đụng. Bất biến: tọa độ đỉnh mọi polyline tim không đổi (AC2).
3. Báo cáo phiên: thêm mục hoàn thiện (số phần tử theo giai đoạn, số bỏ qua) vào `VeSessionReport`.
4. Test Core cho phần tính được (kế hoạch giai đoạn, tập thực thể cần thay); luồng Adapter mô phỏng tay.

**Tiêu chí chấp nhận:** dotnet test xanh; AC3 (2 lần chạy → số thực thể không đổi) có test ở mức
kế-hoạch-thực-thể trong Core; lệnh vào `LenhCatalog.cs` + Ribbon; không đổi hành vi lệnh `VE_*` gốc.

## Việc V4 — Tài liệu + verify + web (M115 PR4) — `route: standard` (CUỐI PHA 1)

1. `plugin-autocad/README.md` + `CAI-DAT.md`: bảng lệnh thêm 3 lệnh mới + mục "Quy trình hoàn thiện
   từ tuyến tim" (7 bước theo đặc tả §6). Trang `app/engineering/cai-dat-plugin/page.tsx`: thêm 3
   lệnh vào bảng lệnh (đúng phong cách bảng hiện có).
2. `plugin-autocad/VERIFY-VA-PHAT-HANH.md`: mục verify mới (AC2 tọa độ từng byte, AC3 idempotent,
   AC4 khối lượng khớp, luồng 7 bước trên 1 tầng thật AVIO).
3. `PROGRESS.md` + `docs/nang-cap/README.md`: M115 code xong, nợ verify.

**Tiêu chí chấp nhận:** `npm run lint`/`typecheck`/`build` xanh; tài liệu khớp tên lệnh thật.

---

# Pha 2 — M116: Phối hợp xung đột liên hệ (SAU khi Pha 1 tích hợp xong)

**Đặc tả:** `docs/nang-cap/M116-phoi-hop-xung-dot-lien-he.md`. Không migration.

## Việc W1 — Rule pack `coordinationPolicy` + `Core/Coordination/` (M116 PR1) — `route: complex`

Đặc tả §6 bước 2, §7 FR1/FR3/FR5, §8 AC1/AC4.

1. Rule pack version mới: khối `coordinationPolicy` — `enabled` (mặc định `false`), `priority`
   (kế thừa/tham chiếu `crossingPolicy.priority`, không trùng lặp dữ liệu nếu tham chiếu được),
   `minClearancePairsMm` (mảng cặp hệ + khoảng cách tối thiểu, mặc định rỗng), `maintenanceGapMm`.
   Validator 2 tầng.
2. `XBoss.Cad.Core/Coordination/`: `QuetXungDot.cs` — 3 lớp kiểm trên DTO tuyến (đỉnh + hệ + size
   + cao độ + bề cao gồm cách nhiệt từ rule pack): lớp 1 giao cắt mà dải cao độ chồng (tái dùng bộ
   dò giao cắt phép kiểm 11 trong `Inspection/PhepKiemMoRong.cs` — tách phần dò dùng chung nếu
   cần, KHÔNG đổi hành vi phép kiểm 11); lớp 2 tranh chấp hành lang (tổng bề rộng + khoảng bảo trì
   vs bề rộng hành lang — dữ liệu hành lang/làn từ XData M114); lớp 3 khoảng cách quy phạm theo
   `minClearancePairsMm`. `XungDotId.cs` — id ổn định = hash (handle 2 tuyến sắp thứ tự + toạ độ
   điểm/đoạn làm tròn mm). `DeXuatXuLy.cs` — đề xuất theo luật (hệ ưu tiên thấp nhường cao độ /
   dịch làn trống / cần fitting vượt), CHỈ từ bảng luật.
3. Test: AC1 (dải cao độ chồng → CỨNG đúng chiều ưu tiên; tách → không báo); id ổn định qua 2 lần
   quét; tuyến thiếu cao độ → chỉ vào kiểm phẳng kèm nhãn "thiếu cao độ" (đặc tả §11); AC4 snapshot
   version cũ.

**Ranh giới được quyết:** cấu trúc DTO + thuật toán chỉ mục quét (sweep line hay grid — miễn NFR
2.000 đoạn × 4 hệ <5s); cách tham chiếu `crossingPolicy.priority`. **KHÔNG:** đổi phép kiểm 11,
sửa version cũ.
**Tiêu chí chấp nhận:** dotnet test + test node validator xanh; version cũ không đổi.

## Việc W2 — 3 lệnh `XBOSS_PHOIHOP*` (M116 PR2) — `route: spec` (SAU W1)

Đặc tả §6 bước 1–4, §7 FR1/FR2/FR4, §8 AC2/AC3.

`Commands/PhoiHopCommands.cs`: `XBOSS_PHOIHOP` (chọn phạm vi cả bản vẽ/cửa sổ/theo hành lang; quét
tuyến XData M115 kể cả trong xref — chỉ đọc, qua snapshot builder hiện có; gọi `Core/Coordination`;
hộp thoại M106: danh sách lọc theo hệ/mức, bấm → zoom; marker trên layer `XBOSS-PHOIHOP` — khuôn
marker của `XBOSS_KIEMTRA`, XData mang `XungDotId` + trạng thái; chạy lại: đối chiếu id — giữ
trạng thái "bỏ qua có lý do", xoá marker của xung đột đã hết, không nhân đôi); `XBOSS_PHOIHOP_XOA`
(xoá toàn bộ marker, không đụng gì khác — AC3); đánh dấu trạng thái từng dòng (chấp nhận/bỏ qua +
lý do) ghi vào XData marker. 3 lệnh vào `LenhCatalog.cs` (giai đoạn "Kiểm") — lệnh thứ 3 là
`XBOSS_PHOIHOP_BAOCAO` khai ở đây nhưng thân làm ở W3 (stub thông báo "chưa có" nếu W3 chưa tích
hợp — coordinator tích hợp W2+W3 cùng đợt thì bỏ stub).
**Tiêu chí chấp nhận:** dotnet test xanh; mô phỏng tay luồng quét/đánh dấu/xoá; không đổi lệnh cũ.

## Việc W3 — Báo cáo phối hợp + web (M116 PR3) — `route: standard` (SAU W2)

Đặc tả §6 bước 5, §8 AC5. `XBOSS_PHOIHOP_BAOCAO`: xuất Excel (khuôn `Core/Excel/` — bảng
STT/lớp/hệ A–B/vị trí/đề xuất/trạng thái) + ghi mục phối hợp (đếm theo lớp + trạng thái) vào báo
cáo phiên upload (trường JSON mới OPTIONAL, backward-compatible — server cũ bỏ qua). Web: ô "Phối
hợp liên hệ" trên `/engineering/chuan-hoa-ban-ve` (component mới cạnh các panel hiện có, đọc từ
payload upload đã lưu; đúng hệ design ADR-0009/0010, không hex, không `dark:`). Tài liệu + mục
verify M116 + `PROGRESS.md`/README nâng cấp.
**Tiêu chí chấp nhận:** dotnet test + `npm run lint`/`typecheck`/`build` + test node liên quan xanh.

---

# Pha 3 — M117: AI đọc sơ đồ nguyên lý (SAU Pha 1; có thể song song Pha 2 NẾU Pha 2 đã qua W1)

**Đặc tả:** `docs/nang-cap/M117-ai-doc-so-do-nguyen-ly.md`. CÓ migration + 4 API. Nhắc lại: code
được đi, nhưng PHÁT HÀNH rộng chờ M115 verify + pilot — mọi khoá mặc định tắt.

## Việc X1 — Migration + tầng 1 luật (M117 PR1) — `route: complex`

Đặc tả §6 bước 1–2, §7 FR1/FR2, §8 AC1, §9 DDL.

1. Migration `cad_schematic_graphs` đúng DDL §9 + RLS theo `project_id` (pattern
   `0140_cad_boq_code_map.sql`). **Số migration: `ls migrations | sort -V | tail -3` tại thời
   điểm code — không đoán.** Chạy `npm run gen:erd` cùng PR.
2. `lib/ky-thuat/cad/schematic.ts` (module mới, tầng 4 `ky-thuat` — kiểm `npm run check:lib-layers`):
   parse DXF schematic (tái dùng hàm đọc block/text/line của `dxf-parser.ts`, không nhân đôi) →
   graph thô: node từ block (đối chiếu thư viện block theo tên/`kind` — đọc qua khối `block-lib`
   trong `lib/ky-thuat/cad/block.ts`), cạnh từ line/pline chạm nhau + chạm block, size/tag từ text
   gần cạnh (ngưỡng khoảng cách tham số hoá); phần suy được `nguon='luat'`, mơ hồ `chua_quyet`.
   Shape JSONB đúng đặc tả §9.
3. Test node bằng DXF mẫu tự dựng trong `tests/` (AC1: ≥90% cạnh đúng trên mẫu chuẩn; block lạ/
   text xa → `chua_quyet`).

**Ranh giới được quyết:** heuristic bắt cạnh–text (tham số hoá được); cấu trúc chi tiết JSONB trong
khung §9. **KHÔNG:** gọi AI ở việc này, đổi `dxf-parser.ts` hành vi cũ.
**Tiêu chí chấp nhận:** `npm run lint`/`typecheck`/test/`check:lib-layers` xanh; migration idempotent.

## Việc X2 — Tầng 2 AI + 4 API (M117 PR2) — `route: spec` (SAU X1)

Đặc tả §6 bước 3, §7 FR3/FR5, §8 AC2/AC3/AC6.

1. `lib/dich-vu/cad.ts` khối mới `// ===== cad-schematic =====`: hợp đồng Y HỆT khối
   `cad-block-phan-loai` (đọc kỹ code đó trước): chỉ nhận phần `chua_quyet`, một lượt/lô qua
   `lib/nen/ai.ts` (schema Zod: gán node vào block-kind/hệ, size cho cạnh, nối cặp node đứt),
   giá trị ngoài enum → giữ `chua_quyet`, AI không lật `nguon='luat'`, `doTinCay` ghi theo,
   không gửi tên dự án/tài chính; `aiKhaDung()` false → bỏ tầng 2 êm.
2. 4 route dưới `app/api/engineering/cad/schematic/`: POST (upload `.dxf` ≤50MB qua
   `lib/nen/storage.ts`, parse tầng 1, chạy tầng 2 nếu bật, INSERT), GET `:id`, PATCH `:id`
   (sửa node/cạnh + duyệt `trang_thai='da_duyet'` — ghi `duyet_boi/duyet_luc`, audit), GET
   `:id/plugin` (xác thực device pairing như route rule-pack cho plugin; chưa `da_duyet` → 409).
   Chuẩn route: `force-dynamic`, `getCurrentUser()` → 401, quyền Admin/PM/engineer của dự án,
   scope RLS `withProjectScope`, validate input.
3. Test: mock AI (AC3), AC2 (tắt AI vẫn chạy), AC6 (quét payload prompt như test M108), route
   test theo pattern API test hiện có, import `tests/setup.ts` đầu tiên.

**Tiêu chí chấp nhận:** lint/typecheck/test xanh; không đổi hành vi khối `cad-block-phan-loai`.

## Việc X3 — Màn duyệt graph trên web (M117 PR3) — `route: standard` (SAU X2)

Đặc tả §6 bước 1+4. Tab "Sơ đồ nguyên lý" trên `/engineering/chuan-hoa-ban-ve` theo khuôn
`NapLoBlockPanel.tsx` (đọc kỹ trước): upload DXF, danh sách graph của dự án, màn duyệt (bảng
nút/cạnh — nguồn luật/AI/`chua_quyet` + `doTinCay`, sửa từng dòng, SVG sơ hoạ từ toạ độ schematic
— tái dùng cách dựng SVG của `block-preview-svg` trong `lib/ky-thuat/cad/block.ts` nếu hợp), nút
"Chốt graph". Đúng hệ design (ADR-0009/0010, tiếng Việt, skeleton/rỗng/lỗi đủ). E2e axe
`e2e/authed/` theo pattern sẵn có.
**Tiêu chí chấp nhận:** lint/typecheck/build + e2e liên quan xanh.

## Việc X4 — `XBOSS_TUYEN_GOIY` + tài liệu (M117 PR4) — `route: spec` (SAU X2; cần Pha 1 đã tích hợp)

Đặc tả §6 bước 5–6, §7 FR6, §8 AC4/AC5.

Adapter `Commands/TuyenGoiYCommands.cs`: tải graph `da_duyet` qua API `:id/plugin` (service HTTP +
cache offline theo khuôn M113); kỹ sư chỉ điểm nguồn + chọn tầng; ánh xạ node thiết bị graph ↔
block trên mặt bằng theo `kind`/`systemId`/tag (thiếu → liệt kê, sinh phần tìm thấy); sinh tuyến
tim NHÁP qua `Routing/KeHoachDiTuyen` (M114 — hành lang phải có sẵn; chưa có → thông báo chạy
`XBOSS_VE_HANHLANG` trước) trên layer `XBOSS-GOIY`, XData thuộc tính điền sẵn từ graph (khuôn
`XBOSS_TUYEN_GAN` V2); idempotent theo id graph (AC5); lệnh xoá nháp đi kèm (subcommand hoặc
keyword). Sau đó kỹ sư nhận nháp vào quy trình M115. Tài liệu (README/CAI-DAT/bảng lệnh web) + mục
verify M117 + `PROGRESS.md`/README nâng cấp cho trọn đợt.
**Tiêu chí chấp nhận:** dotnet test xanh; mô phỏng tay luồng tải-ánh xạ-sinh nháp; tài liệu khớp.

---

## Thứ tự & phụ thuộc toàn đợt

V1 → V2 → V3 → V4 ‖ sau đó (W1 → W2 → W3) và (X1 → X2 → (X3 ‖ X4)); X-pha có thể chạy song song
W-pha (khác vùng file: W chạm `Core/Coordination` + `Commands/PhoiHop*`, X chạm web/server +
`Commands/TuyenGoiY*`), nhưng X4 cần Pha 1 đã tích hợp. Mỗi việc 1 worktree riêng; tên file như
brief để không đụng nhau; `XBoss.Cad.Acad.csproj` glob SDK-style nên thêm file không sửa csproj.
Reviewer soát từng việc trước khi tích hợp tuần tự vào nhánh nền. Coordinator KHÔNG push/mở PR —
phiên chính duyệt cuối rồi quyết định push/PR theo quy ước repo.
