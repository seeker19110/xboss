# Kế hoạch nâng cấp hệ thống XBoss — quản lý trọn chuỗi dự án thi công

> **Trạng thái: CHỈ LẬP KẾ HOẠCH — chưa triển khai.** Chờ lệnh "triển khai" của người dùng mới bắt đầu code từng hạng mục. Tài liệu này là kết quả nghiên cứu các phần mềm quản lý dự án xây dựng (quốc tế: Procore, Oracle Primavera, Mastt; Việt Nam: FastCons, QLDA GXD, Nghiệm thu 360) đối chiếu với hiện trạng XBoss, theo yêu cầu mở rộng: **đấu thầu → BOQ → nhà cung cấp → đặt hàng/đơn hàng → kế hoạch & tiến độ thi công → QA&QC → hồ sơ chất lượng → bản vẽ BIM/Shop → nghiệm thu → thanh toán**.
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
| **Khung UI** | Top nav (`AppHeader`) — **yêu cầu mới: sidebar trái + nút thu gọn** | 🔄 đổi |

## 4. Các hạng mục nâng cấp

### M0 — Khung UI: sidebar trái thu gọn được (yêu cầu trực tiếp)

- Menu điều hướng chuyển từ top-nav sang **sidebar cố định bên trái**, phần hiển thị nội dung bên phải; **nút bấm thu gọn** sidebar (collapse về dải icon hẹp hoặc ẩn hẳn) để dành toàn bộ chiều rộng cho phần hiển thị — quan trọng với lưới tracking/Gantt/bảng dày cột.
- Chi tiết: nhóm menu theo 9 nhóm nghiệp vụ ở §2; trạng thái thu gọn lưu `localStorage` (cùng pattern `xboss_theme`); mobile giữ hành vi hiện tại (drawer/off-canvas, vùng chạm ≥40px); tooltip tên menu khi ở chế độ icon; giữ `NotificationBell`/`GlobalSearch`/`ThemeToggle` ở thanh trên mỏng.
- Kỹ thuật: refactor `AppHeader` → `AppShell` (sidebar + topbar) trong `app/components/`, áp qua `app/layout.tsx`; không hardcode hex, dark-first như quy ước.
- **Độ phức tạp: Trung bình** (chạm mọi trang nhưng thuần UI, không đổi API/schema). Làm **đầu tiên** vì các module mới sau đó đều thêm menu vào sidebar.

### M1 — BOQ đầy đủ (nền cho đấu thầu + chi phí)

- Bảng mới `boq_items`: mã hiệu (tận dụng quy ước BOQCODE), tên công tác, đơn vị, khối lượng HĐ, đơn giá, thành tiền, nhóm/hệ; liên kết mềm tới `tasks`/`work_packages`/`materials` qua BOQCODE sẵn có.
- 3 lớp khối lượng: **nhận thầu** (với CĐT) / **giao thầu** (cho thầu phụ) / **thực hiện** (suy từ % tiến độ task × KL). Import từ Excel dự toán (mở rộng `lib/import.ts`).
- API `/api/boq` CRUD + import; trang `/boq` dạng bảng nhóm theo hệ, cột KL 3 lớp so sánh.
- **Độ phức tạp: Trung bình-Cao.** Là **phụ thuộc** của M2 (đấu thầu) và M6 (chi phí).

### M2 — Đấu thầu

- Bảng `tender_packages` (gói thầu: tên, phạm vi, hạn nộp, trạng thái mở/đóng/đã trao), `tender_bids` (nhà thầu tham gia — tái dùng `suppliers`, giá chào theo dòng BOQ hoặc trọn gói, file chào thầu), kết quả trúng thầu → sinh `floor_contracts`/hợp đồng giao thầu.
- Trang `/tenders`: bảng so sánh giá chào các nhà thầu theo từng dòng BOQ (như bảng so sánh của Procore/FastCons), highlight giá thấp nhất.
- Quyền: Admin/PM tạo & trao thầu; kỹ sư xem.
- **Độ phức tạp: Trung bình** (sau khi có M1).

### M3 — Nhà cung cấp & đơn hàng nâng cao

- Mở rộng chuỗi PR → PO sẵn có: **trạng thái dòng đời đơn hàng** (đặt → xác nhận → đang giao → giao một phần → đủ → đối chiếu công nợ), ngày giao dự kiến vs thực tế, cảnh báo trễ giao (nối vào hệ notification sẵn có).
- Đánh giá NCC (điểm chất lượng/tiến độ giao/giá sau mỗi PO), công nợ theo NCC (tổng PO − đã thanh toán, nối `payment_bills`).
- **Độ phức tạp: Trung bình** (chủ yếu mở rộng bảng + UI hiện có, ít bảng mới).

### M4 — QA&QC + hồ sơ chất lượng

- **ITP/checklist**: bảng `qc_checklists` (mẫu checklist theo loại công tác — vd nghiệm thu ống gió: độ kín, treo giá đỡ, cách nhiệt...) + `qc_inspections` (lần kiểm tra gắn task/work package: người kiểm, kết quả từng mục đạt/không đạt, ảnh, chữ ký cấp phê duyệt). Gắn vào luồng nghiệm thu 2 bước sẵn có: task chỉ được `nghiem_thu` khi inspection đạt (cấu hình bật/tắt).
- **NCR**: bảng `ncrs` (điểm không phù hợp: mô tả, ảnh, task liên quan, người chịu trách nhiệm, hạn khắc phục, vòng đời mở → đang khắc phục → chờ kiểm lại → đóng); notification khi quá hạn (cùng pattern `delayed`).
- **Hồ sơ chất lượng**: phân loại `task_documents` theo danh mục (biên bản vật liệu đầu vào / nghiệm thu công việc / giai đoạn / hoàn công), trang tổng hợp `/quality` lọc theo tầng/hệ/loại — tiến tới **xuất trọn bộ hồ sơ** theo tầng (zip/PDF, tái dùng `@react-pdf/renderer` sẵn có).
- **Độ phức tạp: Cao** (nhiều bảng + luồng nghiệp vụ, nhưng độc lập tương đối, chia được ≥3 PR: checklist → NCR → hồ sơ).

### M5 — Quản lý bản vẽ BIM/Shop drawing

- **Drawing register**: bảng `drawings` (mã bản vẽ, tên, hệ/tầng, loại: shop/as-built/BIM export) + `drawing_revisions` (rev A/B/C..., file PDF/ảnh, ngày trình, **trạng thái trình duyệt**: đang trình → TVGS góp ý → duyệt/duyệt có điều kiện/trả lại → thi công), thay cho 1 file `drawing` gắn work package hiện tại (migrate dữ liệu cũ thành rev đầu tiên).
- Ma trận phân phối đơn giản (vai trò nào thấy/duyệt loại bản vẽ nào — theo mô hình document matrix); viewer PDF trên mobile cho kỹ sư/thầu phụ tra tại hiện trường (ưu tiên bản rev mới nhất đã duyệt, cảnh báo khi xem rev cũ).
- Phạm vi BIM ở mức **quản lý file xuất từ BIM** (PDF/ảnh/IFC lưu trữ), **không** viewer 3D IFC trong đợt này (nặng, cần thư viện lớn — ghi nhận là hạng mục tương lai nếu thật sự cần).
- **Độ phức tạp: Trung bình-Cao.**

### M6 — Kiểm soát chi phí & cảnh báo vượt

- Ngân sách theo BOQ/work package (từ M1) vs **cam kết** (PO + hợp đồng giao thầu) vs **thực chi** (`payment_bills` + nhập kho) — 3 cột chuẩn của cost control.
- **Cảnh báo tức thì vượt chi phí** (như sơ đồ luồng dữ liệu tham chiếu): notification type mới `cost_over` khi cam kết/thực chi vượt ngân sách theo ngưỡng %, cùng hệ với `material_over` sẵn có.
- Trang `/costs`: bảng ngân sách–cam kết–thực chi theo hệ/tầng, drill-down tới PO/đợt thanh toán.
- **Độ phức tạp: Trung bình** (sau M1; phần lớn là query tổng hợp + UI, ít bảng mới).

### M7 — Dashboard mở rộng

- Thêm **cash flow** (dòng tiền vào từ thanh toán CĐT vs ra cho NCC/thầu phụ theo tháng — dữ liệu từ `payment_bills` + PO), KPI chi phí (CPI đơn giản = giá trị thực hiện/thực chi), KPI chất lượng (NCR mở/đóng), KPI đấu thầu-mua sắm (PO trễ giao).
- Giữ nguyên recharts + hệ màu status; các thẻ KPI bấm vào drill-down như Pareto hiện có.
- **Độ phức tạp: Thấp-Trung bình** (làm cuối, khi các module đã có dữ liệu).

### M8 — Phát sinh / thay đổi khối lượng (VO — Variation Order)

- Nghiệp vụ quyết định lời/lỗ của nhà thầu MEP: khối lượng **ngoài hợp đồng gốc** phải được ghi nhận ngay tại hiện trường, trình CĐT/TVGS, duyệt xong mới vào được khối lượng thanh toán. Thiếu VO thì M1 (BOQ) và M6 (chi phí) chỉ phản ánh hợp đồng gốc.
- Bảng `variation_orders` (mã VO, mô tả, nguyên nhân: thay đổi thiết kế/CĐT yêu cầu/điều kiện hiện trường, KL + đơn giá đề xuất, file đính kèm, **vòng đời**: ghi nhận → trình → CĐT duyệt/duyệt một phần/từ chối → bổ sung phụ lục HĐ) + dòng chi tiết theo cấu trúc `boq_items` (đánh dấu `is_vo`).
- VO đã duyệt tự cộng vào ngân sách/KL nhận thầu ở M1/M6 (tách cột "HĐ gốc" vs "gốc + VO"); trang `/variations` liệt kê + tổng giá trị VO theo trạng thái; notification khi VO chờ duyệt quá N ngày.
- **Độ phức tạp: Trung bình** (sau M1; mô hình dữ liệu mượn cấu trúc BOQ, vòng đời duyệt mượn pattern nghiệm thu 2 bước sẵn có).

### M9 — Nhật ký thi công + nhân lực hiện trường

- **Bắt buộc theo Nghị định 06/2021/NĐ-CP** (nhật ký thi công là hồ sơ pháp lý phải có khi nghiệm thu/hoàn công); các phần mềm VN (Nghiệm thu 360) lấy đây làm tính năng đinh.
- Bảng `site_diaries` (ngày, thời tiết sáng/chiều, mô tả công việc, vướng mắc/chỉ đạo, người lập, khoá sổ theo ngày) + `diary_manpower` (số công nhân theo từng thầu phụ/tổ đội trong ngày — nguồn cho KPI năng suất, **không** phải chấm công nhân sự từng người).
- **Sinh gần tự động**: phần "công việc thực hiện" prefill từ `task_history` trong ngày (task nào tăng %, ai tick) + ảnh hiện trường đã upload trong ngày — người lập chỉ bổ sung thời tiết/nhân lực/vướng mắc rồi khoá sổ. Xuất PDF theo mẫu (tái dùng `@react-pdf/renderer`) để in ký.
- **Độ phức tạp: Trung bình** (độc lập, dữ liệu nguồn đã có sẵn; giá trị pháp lý cao so với công sức).

### Mở rộng M4 — T&C (Testing & Commissioning) cho ACMV

Không tách module riêng: chạy thử **đơn động → liên động → hiệu chỉnh (TAB)** của hệ ACMV là một **loại checklist/biên bản riêng trong M4** (`qc_checklists.category = 'tc'`), gắn theo hệ/thiết bị thay vì theo tầng, có trường thông số đo (lưu lượng gió, áp suất, dòng điện...) so với thiết kế. Đưa vào phạm vi M4 khi triển khai đợt 2.

## 4b. Đã cân nhắc và KHÔNG đưa vào (YAGNI)

| Hạng mục | Lý do loại |
|---|---|
| RFI / quản lý công văn CĐT-TVGS | Giá trị có nhưng khối lượng trao đổi ở quy mô 1 dự án chưa đáng 1 module; vướng mắc hằng ngày đã có chỗ ghi trong nhật ký (M9) + bình luận task. Xem lại nếu số lượng công văn thực tế lớn. |
| HSE / an toàn lao động | Trách nhiệm chính thuộc tổng thầu trên công trường; nhà thầu MEP chủ yếu nộp hồ sơ theo yêu cầu tổng thầu — chưa cần hệ quản lý riêng. |
| Quản lý thiết bị/máy móc thi công | MEP dùng ít máy lớn (chủ yếu dụng cụ cầm tay); theo dõi qua Excel/kho hiện tại là đủ. |
| Biên bản họp, risk register | Mastt/Procore có nhưng ở tầm portfolio/CĐT; với 1 dự án là over-engineering. |
| Chấm công nhân sự từng người, ERP kế toán, viewer BIM 3D | Đã loại từ đầu (§6) — ngoài phạm vi công cụ quản lý thi công. |

## 5. Lộ trình đề xuất (3 đợt)

```
Đợt 1 (nền):    M0 sidebar  →  M1 BOQ  →  M6 chi phí (phần ngân sách vs thực chi cơ bản)
Đợt 2 (nghiệp vụ): M4 QA&QC + hồ sơ chất lượng (gồm T&C)  //  M3 đơn hàng nâng cao  //  M9 nhật ký thi công   (song song được)
Đợt 3 (hoàn thiện): M8 phát sinh VO  →  M2 đấu thầu  →  M5 bản vẽ  →  M7 dashboard mở rộng + cảnh báo chi phí đầy đủ
```

- Phụ thuộc cứng: M1 → M2, M1 → M6, M1 → M8, M6 → M7 (phần cash flow/CPI); M8 nên xong trước khi chốt báo cáo chi phí M7. Còn lại độc lập (M9 độc lập hoàn toàn — kéo lên sớm hơn được nếu cần hồ sơ pháp lý gấp).
- Mỗi module chia 2–4 PR nhỏ (migration → API + test → UI → tích hợp notification/dashboard).
- Sau mỗi module: cập nhật `PROGRESS.md`, `docs/ERD.md`, viết ADR nếu có quyết định kiến trúc mới (vd cấu trúc bảng drawings).

## 6. Rủi ro & điểm cần quyết khi triển khai

- **Khối lượng thực hiện suy từ % task** (M1) chỉ đúng khi task map 1-1 với dòng BOQ — thực tế có thể n-n; cần chốt quy tắc map (qua BOQCODE, cho phép 1 dòng BOQ ↔ nhiều task chia tỷ trọng) trước khi code.
- **`payment_bills` hiện gắn `responsible` dạng TEXT** — muốn nối công nợ NCC/thầu phụ chuẩn cần thêm FK về `suppliers`/`users` (migration + backfill, có script mẫu `scripts/backfill-*.ts`).
- **Dung lượng file** (bản vẽ + hồ sơ chất lượng) sẽ lớn hơn ảnh hiện tại nhiều — `data/uploads/` trên VPS cần theo dõi dung lượng; cân nhắc giới hạn/nén, chưa cần object storage ở quy mô 1 dự án.
- **Không mở rộng** sang viewer BIM 3D, ERP kế toán đầy đủ, chấm công nhân sự — ngoài phạm vi, tránh over-engineer (YAGNI).

## 7. Nguồn tham khảo

- Procore project/cost management: procore.com/project-management, procore.com/cost-management
- So sánh Procore vs Oracle Primavera: g2.com, capterra.com (2026)
- FastCons — quy trình thanh toán khối lượng thầu phụ, quản lý khối lượng thi công: fastcons.fastwork.vn
- Nghiệm thu 360 (hồ sơ nghiệm thu/hoàn công VN): nghiemthuxaydung.com
- QLDA GXD (dự toán, thanh quyết toán VN); tổng quan thị trường: amis.misa.vn
