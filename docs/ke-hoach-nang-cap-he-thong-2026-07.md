# Kế hoạch nâng cấp hệ thống XBoss — quản lý trọn chuỗi dự án thi công

> **Trạng thái: CHỈ LẬP KẾ HOẠCH — chưa triển khai.** Chờ lệnh "triển khai" của người dùng mới bắt đầu code từng hạng mục. Tài liệu này là kết quả nghiên cứu các phần mềm quản lý dự án xây dựng (quốc tế: Procore, Oracle Primavera, Mastt; Việt Nam: FastCons, QLDA GXD, Nghiệm thu 360) đối chiếu với hiện trạng XBoss, theo yêu cầu mở rộng: **đấu thầu → BOQ → nhà cung cấp → đặt hàng/đơn hàng → kế hoạch & tiến độ thi công → QA&QC → hồ sơ chất lượng → bản vẽ BIM/Shop → nghiệm thu → thanh toán**.
>
> **Số module = thứ tự triển khai** (M0 làm trước, M13 làm cuối), chia 4 đợt — xem §5.
>
> Kế hoạch nâng cấp **dependency + hạ tầng chất lượng** (việc riêng, độc lập) xem `docs/ke-hoach-nang-cap-2026-07.md`.

## 1. Nguyên tắc xuyên suốt

- **Giữ nguyên nền tảng theo ADR**: Postgres raw SQL (ADR-0001), `node:test` (ADR-0002), migrate append-only (ADR-0003). Mọi bảng mới = file `migrations/000N_*.sql` mới.
- **Tái dùng xương sống sẵn có**: WBS (`work_packages`/`tasks`), BOQCODE duy nhất toàn hệ thống (`lib/boq.ts`), phân quyền `CAN`/`canTouchTask`/`canTouchPackage`, upload file (`data/uploads/` + pattern `task_documents`), thông báo + Web Push, recompute chain.
- **Mỗi module = nhiều PR nhỏ**, mỗi PR tự chạy được (migration + API + UI + test), không big-bang.
- UI/UX theo đúng hệ design hiện tại (dark-first, thang zinc, lucide-react, mobile-first công trường).

## 2. Benchmark — nhóm tính năng chuẩn ngành

Từ các phần mềm tham chiếu, một hệ quản lý dự án thi công đầy đủ gồm 9 nhóm:

| # | Nhóm | Procore / Primavera / FastCons có gì |
|---|------|--------------------------------------|
| 1 | Đấu thầu (bidding/tender) | Gói thầu, mời thầu, so sánh bảng chào giá nhiều nhà thầu, kết quả trúng thầu → sinh hợp đồng |
| 2 | BOQ / khối lượng | Danh mục công tác: mã hiệu, đơn vị, KL hợp đồng, đơn giá, thành tiền; KL nhận thầu vs giao thầu vs thực hiện |
| 3 | Mua sắm (procurement) | NCC + đánh giá, PR → PO → giao hàng → nhập kho → công nợ; trạng thái đơn hàng theo dòng đời |
| 4 | Kế hoạch & tiến độ | WBS, Gantt + phụ thuộc + critical path, baseline, look-ahead, % kế hoạch vs thực tế |
| 5 | QA&QC | ITP (kế hoạch nghiệm thu), checklist theo công tác, NCR (điểm không phù hợp) + vòng đời mở→khắc phục→đóng, ảnh hiện trường |
| 6 | Hồ sơ chất lượng | Biên bản nghiệm thu vật liệu/công việc/giai đoạn theo mẫu, trình tự ký, xuất trọn bộ hồ sơ hoàn công |
| 7 | Bản vẽ BIM/Shop | Drawing register: mã bản vẽ, phiên bản (rev), trạng thái trình duyệt (trình→TVGS/CĐT duyệt→thi công), ma trận phân phối, xem file trên mobile |
| 8 | Chi phí & thanh toán | Ngân sách theo BOQ vs cam kết (PO/hợp đồng) vs thực chi; đợt thanh toán khối lượng với CĐT/thầu phụ; cảnh báo vượt chi phí; cash flow |
| 9 | Dashboard & báo cáo | KPI tổng hợp, S-curve, cash flow, cảnh báo tức thì (trễ tiến độ, vượt chi phí), báo cáo định kỳ |

## 3. Hiện trạng XBoss theo chuỗi giá trị

| Nhóm | Hiện trạng | Mức độ |
|------|-----------|--------|
| Đấu thầu | **Chưa có** | ❌ |
| BOQ | Mới có **mã** BOQCODE gắn tasks/work_packages/materials (`lib/boq.ts`) — chưa có bảng BOQ với KL/đơn giá/thành tiền | 🟡 một phần |
| Mua sắm | Đã có `suppliers`, `purchase_requests`, `purchase_orders` + `po_items`, `warehouse_receipts` + `receipt_items`, vật tư + sync Google Sheet | 🟢 khá đủ |
| Kế hoạch & tiến độ | **Mạnh nhất**: WBS 5 cấp, lưới tracking checkbox, Gantt + `package_dependencies` + critical path (`lib/cpm.ts`), baseline, S-curve, lookahead, SSE realtime, PWA offline | 🟢 đủ |
| QA&QC | Chưa có ITP/checklist/NCR; mới có ảnh hiện trường + bình luận theo task | ❌ |
| Hồ sơ chất lượng | Nghiệm thu 2 bước + upload biên bản (`task_documents`), nghiệm thu theo tầng (`floor_approvals`) — chưa có mẫu biên bản, trình tự ký, hồ sơ hoàn công | 🟡 một phần |
| Bản vẽ BIM/Shop | Mới có 1 file `drawing` gắn work package — chưa có register/phiên bản/trạng thái trình duyệt | 🟡 sơ khai |
| Chi phí & thanh toán | Đã có `floor_contracts` (giá trị HĐ theo tầng), `payment_bills` (đợt thanh toán/tạm ứng), trang `/payments` — chưa nối với BOQ/PO, chưa có ngân sách vs thực chi, chưa cảnh báo vượt | 🟡 một phần |
| Dashboard | KPI + S-curve + forecast + Pareto lý do trễ + báo cáo ngày/tuần (email/Telegram/push) — chưa có cash flow, chưa cảnh báo chi phí | 🟢 khá đủ |
| **Khung UI** | Top nav (`AppHeader`) — **yêu cầu mới: sidebar trái + nút thu gọn + title trang trên header** | 🔄 đổi |

## 4. Các hạng mục nâng cấp (đánh số theo thứ tự triển khai)

Tổng quan 14 module, 4 đợt:

| Module | Nội dung | Đợt | Phức tạp | Phụ thuộc |
|---|---|---|---|---|
| M0 | Khung UI sidebar + title AppHeader | 1 | Trung bình | — |
| M1 | BOQ đầy đủ | 1 | Trung bình-Cao | — |
| M2 | Kiểm soát chi phí + cảnh báo vượt | 1 | Trung bình | M1 |
| M3 | QA&QC + hồ sơ chất lượng (gồm T&C) | 2 | Cao | — |
| M4 | Nhà cung cấp & đơn hàng nâng cao | 2 | Trung bình | — |
| M5 | Nhật ký thi công + nhân lực hiện trường | 2 | Trung bình | — |
| M6 | Phát sinh / thay đổi khối lượng (VO) | 3 | Trung bình | M1, M2 |
| M7 | Đấu thầu | 3 | Trung bình | M1 |
| M8 | Bản vẽ BIM/Shop drawing | 3 | Trung bình-Cao | — |
| M9 | Dashboard mở rộng (cash flow, CPI...) | 3 | Thấp-Trung bình | M2 (+dữ liệu M3/M4/M6) |
| M10 | RFI / công văn CĐT-TVGS | 4 | Thấp-Trung bình | (M8 nếu nối bản vẽ) |
| M11 | HSE / an toàn lao động | 4 | Trung bình | M3 (checklist engine) |
| M12 | Thiết bị/máy móc thi công | 4 | Thấp-Trung bình | — |
| M13 | Biên bản họp + sổ rủi ro | 4 | Trung bình | — |

### M0 — Khung UI: sidebar trái thu gọn được (yêu cầu trực tiếp)

- Menu điều hướng chuyển từ top-nav sang **sidebar cố định bên trái**, phần hiển thị nội dung bên phải; **nút bấm thu gọn** sidebar (collapse về dải icon hẹp hoặc ẩn hẳn) để dành toàn bộ chiều rộng cho phần hiển thị — quan trọng với lưới tracking/Gantt/bảng dày cột.
- **Title trang trên AppHeader**: mục menu nào đang được chọn thì **tiêu đề của mục đó hiển thị trên thanh AppHeader phía trên** (topbar mỏng) — người dùng luôn biết đang ở trang nào kể cả khi sidebar đã thu gọn; kèm breadcrumb ngắn khi ở trang con (vd "Vật tư / Đơn đặt hàng").
- Chi tiết: nhóm menu theo các nhóm nghiệp vụ ở §2; trạng thái thu gọn lưu `localStorage` (cùng pattern `xboss_theme`); mobile giữ hành vi hiện tại (drawer/off-canvas, vùng chạm ≥40px); tooltip tên menu khi ở chế độ icon; giữ `NotificationBell`/`GlobalSearch`/`ThemeToggle` ở thanh trên mỏng.
- Kỹ thuật: refactor `AppHeader` → `AppShell` (sidebar + topbar) trong `app/components/`, áp qua `app/layout.tsx`; không hardcode hex, dark-first như quy ước.
- **Độ phức tạp: Trung bình** (chạm mọi trang nhưng thuần UI, không đổi API/schema). Làm **đầu tiên** vì các module mới sau đó đều thêm menu vào sidebar.

### M1 — BOQ đầy đủ (nền cho chi phí, VO, đấu thầu)

- Bảng mới `boq_items`: mã hiệu (tận dụng quy ước BOQCODE), tên công tác, đơn vị, khối lượng HĐ, đơn giá, thành tiền, nhóm/hệ; liên kết mềm tới `tasks`/`work_packages`/`materials` qua BOQCODE sẵn có.
- 3 lớp khối lượng: **nhận thầu** (với CĐT) / **giao thầu** (cho thầu phụ) / **thực hiện** (suy từ % tiến độ task × KL). Import từ Excel dự toán (mở rộng `lib/import.ts`).
- API `/api/boq` CRUD + import; trang `/boq` dạng bảng nhóm theo hệ, cột KL 3 lớp so sánh.
- **Độ phức tạp: Trung bình-Cao.** Là **phụ thuộc** của M2 (chi phí), M6 (VO) và M7 (đấu thầu).

### M2 — Kiểm soát chi phí & cảnh báo vượt

- Ngân sách theo BOQ/work package (từ M1) vs **cam kết** (PO + hợp đồng giao thầu) vs **thực chi** (`payment_bills` + nhập kho) — 3 cột chuẩn của cost control.
- **Cảnh báo tức thì vượt chi phí** (như sơ đồ luồng dữ liệu tham chiếu): notification type mới `cost_over` khi cam kết/thực chi vượt ngân sách theo ngưỡng %, cùng hệ với `material_over` sẵn có.
- Trang `/costs`: bảng ngân sách–cam kết–thực chi theo hệ/tầng, drill-down tới PO/đợt thanh toán.
- **Độ phức tạp: Trung bình** (sau M1; phần lớn là query tổng hợp + UI, ít bảng mới).

### M3 — QA&QC + hồ sơ chất lượng (gồm T&C)

- **ITP/checklist**: bảng `qc_checklists` (mẫu checklist theo loại công tác — vd nghiệm thu ống gió: độ kín, treo giá đỡ, cách nhiệt...) + `qc_inspections` (lần kiểm tra gắn task/work package: người kiểm, kết quả từng mục đạt/không đạt, ảnh, chữ ký cấp phê duyệt). Gắn vào luồng nghiệm thu 2 bước sẵn có: task chỉ được `nghiem_thu` khi inspection đạt (cấu hình bật/tắt).
- **NCR**: bảng `ncrs` (điểm không phù hợp: mô tả, ảnh, task liên quan, người chịu trách nhiệm, hạn khắc phục, vòng đời mở → đang khắc phục → chờ kiểm lại → đóng); notification khi quá hạn (cùng pattern `delayed`).
- **Hồ sơ chất lượng**: phân loại `task_documents` theo danh mục (biên bản vật liệu đầu vào / nghiệm thu công việc / giai đoạn / hoàn công), trang tổng hợp `/quality` lọc theo tầng/hệ/loại — tiến tới **xuất trọn bộ hồ sơ** theo tầng (zip/PDF, tái dùng `@react-pdf/renderer` sẵn có).
- **T&C (Testing & Commissioning) cho ACMV**: chạy thử **đơn động → liên động → hiệu chỉnh (TAB)** là một loại checklist/biên bản riêng (`qc_checklists.category = 'tc'`), gắn theo hệ/thiết bị thay vì theo tầng, có trường thông số đo (lưu lượng gió, áp suất, dòng điện...) so với thiết kế.
- **Độ phức tạp: Cao** (nhiều bảng + luồng nghiệp vụ, nhưng độc lập tương đối, chia được ≥4 PR: checklist → NCR → hồ sơ → T&C). Checklist engine của module này được M11 (HSE) tái dùng.

### M4 — Nhà cung cấp & đơn hàng nâng cao

- Mở rộng chuỗi PR → PO sẵn có: **trạng thái dòng đời đơn hàng** (đặt → xác nhận → đang giao → giao một phần → đủ → đối chiếu công nợ), ngày giao dự kiến vs thực tế, cảnh báo trễ giao (nối vào hệ notification sẵn có).
- Đánh giá NCC (điểm chất lượng/tiến độ giao/giá sau mỗi PO), công nợ theo NCC (tổng PO − đã thanh toán, nối `payment_bills`).
- **Độ phức tạp: Trung bình** (chủ yếu mở rộng bảng + UI hiện có, ít bảng mới).

### M5 — Nhật ký thi công + nhân lực hiện trường

- **Bắt buộc theo Nghị định 06/2021/NĐ-CP** (nhật ký thi công là hồ sơ pháp lý phải có khi nghiệm thu/hoàn công); các phần mềm VN (Nghiệm thu 360) lấy đây làm tính năng đinh.
- Bảng `site_diaries` (ngày, thời tiết sáng/chiều, mô tả công việc, vướng mắc/chỉ đạo, người lập, khoá sổ theo ngày) + `diary_manpower` (số công nhân theo từng thầu phụ/tổ đội trong ngày — nguồn cho KPI năng suất, **không** phải chấm công nhân sự từng người).
- **Sinh gần tự động**: phần "công việc thực hiện" prefill từ `task_history` trong ngày (task nào tăng %, ai tick) + ảnh hiện trường đã upload trong ngày — người lập chỉ bổ sung thời tiết/nhân lực/vướng mắc rồi khoá sổ. Xuất PDF theo mẫu (tái dùng `@react-pdf/renderer`) để in ký.
- **Độ phức tạp: Trung bình** (độc lập hoàn toàn, dữ liệu nguồn đã có sẵn; giá trị pháp lý cao so với công sức — kéo lên sớm hơn được nếu cần hồ sơ gấp).

### M6 — Phát sinh / thay đổi khối lượng (VO — Variation Order)

- Nghiệp vụ quyết định lời/lỗ của nhà thầu MEP: khối lượng **ngoài hợp đồng gốc** phải được ghi nhận ngay tại hiện trường, trình CĐT/TVGS, duyệt xong mới vào được khối lượng thanh toán. Thiếu VO thì M1 (BOQ) và M2 (chi phí) chỉ phản ánh hợp đồng gốc.
- Bảng `variation_orders` (mã VO, mô tả, nguyên nhân: thay đổi thiết kế/CĐT yêu cầu/điều kiện hiện trường, KL + đơn giá đề xuất, file đính kèm, **vòng đời**: ghi nhận → trình → CĐT duyệt/duyệt một phần/từ chối → bổ sung phụ lục HĐ) + dòng chi tiết theo cấu trúc `boq_items` (đánh dấu `is_vo`).
- VO đã duyệt tự cộng vào ngân sách/KL nhận thầu ở M1/M2 (tách cột "HĐ gốc" vs "gốc + VO"); trang `/variations` liệt kê + tổng giá trị VO theo trạng thái; notification khi VO chờ duyệt quá N ngày.
- **Độ phức tạp: Trung bình** (sau M1/M2; mô hình dữ liệu mượn cấu trúc BOQ, vòng đời duyệt mượn pattern nghiệm thu 2 bước sẵn có).

### M7 — Đấu thầu

- Bảng `tender_packages` (gói thầu: tên, phạm vi, hạn nộp, trạng thái mở/đóng/đã trao), `tender_bids` (nhà thầu tham gia — tái dùng `suppliers`, giá chào theo dòng BOQ hoặc trọn gói, file chào thầu), kết quả trúng thầu → sinh `floor_contracts`/hợp đồng giao thầu.
- Trang `/tenders`: bảng so sánh giá chào các nhà thầu theo từng dòng BOQ (như bảng so sánh của Procore/FastCons), highlight giá thấp nhất.
- Quyền: Admin/PM tạo & trao thầu; kỹ sư xem.
- **Độ phức tạp: Trung bình** (sau khi có M1).

### M8 — Quản lý bản vẽ BIM/Shop drawing

- **Drawing register**: bảng `drawings` (mã bản vẽ, tên, hệ/tầng, loại: shop/as-built/BIM export) + `drawing_revisions` (rev A/B/C..., file PDF/ảnh, ngày trình, **trạng thái trình duyệt**: đang trình → TVGS góp ý → duyệt/duyệt có điều kiện/trả lại → thi công), thay cho 1 file `drawing` gắn work package hiện tại (migrate dữ liệu cũ thành rev đầu tiên).
- Ma trận phân phối đơn giản (vai trò nào thấy/duyệt loại bản vẽ nào — theo mô hình document matrix); viewer PDF trên mobile cho kỹ sư/thầu phụ tra tại hiện trường (ưu tiên bản rev mới nhất đã duyệt, cảnh báo khi xem rev cũ).
- Phạm vi BIM ở mức **quản lý file xuất từ BIM** (PDF/ảnh/IFC lưu trữ), **không** viewer 3D IFC trong đợt này (nặng, cần thư viện lớn — ghi nhận là hạng mục tương lai nếu thật sự cần).
- **Độ phức tạp: Trung bình-Cao.**

### M9 — Dashboard mở rộng

- Thêm **cash flow** (dòng tiền vào từ thanh toán CĐT vs ra cho NCC/thầu phụ theo tháng — dữ liệu từ `payment_bills` + PO), KPI chi phí (CPI đơn giản = giá trị thực hiện/thực chi — từ M2), KPI chất lượng (NCR mở/đóng — từ M3), KPI mua sắm (PO trễ giao — từ M4).
- Giữ nguyên recharts + hệ màu status; các thẻ KPI bấm vào drill-down như Pareto hiện có.
- **Độ phức tạp: Thấp-Trung bình** (làm cuối đợt 3, khi các module đã có dữ liệu; M6 nên xong trước để báo cáo chi phí gồm cả VO).

### M10 — RFI / quản lý công văn CĐT-TVGS

- Bảng `correspondences` (số văn bản, loại: RFI/công văn đi/công văn đến/chỉ thị hiện trường, bên gửi/nhận, trích yếu, file đính kèm, hạn phản hồi, trạng thái: chờ phản hồi → đã phản hồi → đóng, liên kết mềm tới task/work package/bản vẽ liên quan).
- Trang `/correspondences`: sổ theo dõi công văn, lọc theo trạng thái/bên/hạn; notification khi quá hạn phản hồi (cùng pattern `delayed`); RFI liên quan bản vẽ nối với drawing register (M8).
- **Độ phức tạp: Thấp-Trung bình** (1 bảng chính + upload file theo pattern sẵn có; nên sau M8 nếu muốn nối RFI ↔ bản vẽ, không bắt buộc).

### M11 — HSE / an toàn lao động

- Bảng `hse_records` (loại: kiểm tra an toàn định kỳ/toolbox talk/sự cố-cận nguy/giấy phép làm việc nóng-trên cao, ngày, khu vực/tầng, mô tả, ảnh, người ghi nhận, hành động khắc phục + hạn + trạng thái đóng/mở).
- Checklist kiểm tra an toàn tái dùng cơ chế checklist của M3 (`qc_checklists.category = 'hse'`); thống kê trên dashboard (số sự cố/cận nguy theo tháng, hành động khắc phục quá hạn); xuất báo cáo HSE nộp tổng thầu (PDF).
- **Độ phức tạp: Trung bình** (làm sau M3 để tái dùng checklist engine).

### M12 — Quản lý thiết bị/máy móc thi công

- Bảng `equipment` (mã thiết bị, tên, loại: máy hàn/máy khoan/giàn giáo/dụng cụ đo..., số serial, tình trạng, hạn kiểm định/hiệu chuẩn, file giấy kiểm định) + `equipment_logs` (điều chuyển giữa kho ↔ tầng/khu vực, giao cho tổ đội nào, ngày mượn/trả).
- Notification khi sắp hết hạn kiểm định (quan trọng với thiết bị đo dùng cho T&C — nối M3); trang `/equipment` lọc theo tình trạng/vị trí/tổ đội.
- **Độ phức tạp: Thấp-Trung bình** (độc lập hoàn toàn, mô hình mượn `materials` + transactions sẵn có).

### M13 — Biên bản họp + sổ rủi ro (risk register)

- **Biên bản họp**: bảng `meetings` (ngày, loại: giao ban tuần/họp CĐT/họp thầu phụ, thành phần, nội dung) + `meeting_actions` (việc phải làm sau họp: nội dung, người phụ trách, hạn, trạng thái — liên kết mềm tới task; notification quá hạn). Điểm khác Excel: action item được **theo dõi tự động** thay vì chìm trong file biên bản.
- **Sổ rủi ro**: bảng `risks` (mô tả, nhóm: tiến độ/chi phí/chất lượng/an toàn/vật tư, xác suất × ảnh hưởng (ma trận 5×5), biện pháp giảm thiểu, người phụ trách, trạng thái mở/đang xử lý/đóng); heatmap rủi ro trên dashboard.
- **Độ phức tạp: Trung bình** (2 nghiệp vụ gộp 1 module vì cùng mô hình "danh sách + action item + hạn").

## 4b. NGOÀI phạm vi (giữ nguyên quyết định loại)

| Hạng mục | Lý do loại |
|---|---|
| Chấm công nhân sự từng người, ERP kế toán, viewer BIM 3D | Ngoài phạm vi công cụ quản lý thi công (§6); nhân lực hiện trường đã theo dõi mức tổ đội/ngày ở M5, tài chính kế toán làm trên hệ kế toán riêng, BIM 3D cần hạ tầng nặng — xem lại khi có nhu cầu thật. |

## 5. Lộ trình (4 đợt — số module đúng thứ tự làm)

```
Đợt 1 (nền):            M0 sidebar + title AppHeader  →  M1 BOQ  →  M2 chi phí
Đợt 2 (nghiệp vụ lõi):  M3 QA&QC + hồ sơ chất lượng (gồm T&C)  //  M4 đơn hàng nâng cao  //  M5 nhật ký thi công   (song song được)
Đợt 3 (chuỗi tiền + bản vẽ): M6 phát sinh VO  →  M7 đấu thầu  →  M8 bản vẽ  →  M9 dashboard mở rộng
Đợt 4 (quản trị mở rộng): M10 RFI/công văn  //  M11 HSE  //  M12 thiết bị  //  M13 họp + rủi ro   (song song được, thứ tự linh hoạt theo nhu cầu thực tế)
```

- Phụ thuộc cứng: M1 → M2, M1 → M6, M1 → M7, M2 → M9 (cash flow/CPI); M6 nên xong trước khi chốt báo cáo chi phí M9; M11 sau M3 (tái dùng checklist engine); M10 nên sau M8 nếu muốn nối RFI ↔ bản vẽ (không bắt buộc). Còn lại độc lập (M5/M12 độc lập hoàn toàn — kéo lên sớm hơn được nếu cần).
- Mỗi module chia 2–4 PR nhỏ (migration → API + test → UI → tích hợp notification/dashboard).
- Sau mỗi module: cập nhật `PROGRESS.md`, `docs/ERD.md`, viết ADR nếu có quyết định kiến trúc mới (vd cấu trúc bảng drawings).

## 6. Rủi ro & điểm cần quyết khi triển khai

- **Khối lượng thực hiện suy từ % task** (M1) chỉ đúng khi task map 1-1 với dòng BOQ — thực tế có thể n-n; cần chốt quy tắc map (qua BOQCODE, cho phép 1 dòng BOQ ↔ nhiều task chia tỷ trọng) trước khi code.
- **`payment_bills` hiện gắn `responsible` dạng TEXT** — muốn nối công nợ NCC/thầu phụ chuẩn cần thêm FK về `suppliers`/`users` (migration + backfill, có script mẫu `scripts/backfill-*.ts`).
- **Dung lượng file** (bản vẽ + hồ sơ chất lượng) sẽ lớn hơn ảnh hiện tại nhiều — `data/uploads/` trên VPS cần theo dõi dung lượng; cân nhắc giới hạn/nén, chưa cần object storage ở quy mô 1 dự án.
- **Không mở rộng** sang viewer BIM 3D, ERP kế toán đầy đủ, chấm công nhân sự từng người — ngoài phạm vi, tránh over-engineer (YAGNI).

## 7. Nguồn tham khảo

- Procore project/cost management: procore.com/project-management, procore.com/cost-management
- So sánh Procore vs Oracle Primavera: g2.com, capterra.com (2026)
- FastCons — quy trình thanh toán khối lượng thầu phụ, quản lý khối lượng thi công: fastcons.fastwork.vn
- Nghiệm thu 360 (hồ sơ nghiệm thu/hoàn công VN): nghiemthuxaydung.com
- QLDA GXD (dự toán, thanh quyết toán VN); tổng quan thị trường: amis.misa.vn
