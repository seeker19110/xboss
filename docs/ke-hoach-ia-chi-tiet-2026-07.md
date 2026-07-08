# Kế hoạch chi tiết từng mục — IA đa dự án XBoss (2026-07)

> **Trạng thái: ĐÃ CHỐT hướng đi (2026-07) + ĐÃ VIẾT ĐẶC TẢ CHI TIẾT (2026-07-08)** —
> mỗi module M21–M31 nay có file đặc tả tự chứa riêng trong `docs/nang-cap/` (khuôn
> giống M00–M20: schema/lib/API/UI-UX/test/chia-PR); M22 kèm **ADR-0004** (nền đa dự
> án). Tài liệu này giữ vai trò **bóc tách IA từng dashboard** (bối cảnh); chi tiết
> triển khai xem file `M<xx>-*.md` tương ứng. Công sức/route/dữ liệu **tinh chỉnh khi
> vào từng module**.
> Tài liệu này bóc tách **chi tiết
> từng dashboard** trong cây IA đề xuất (xem tổng quan + bản đồ trực quan ở
> `docs/ke-hoach-appshell-full-ia-2026-07.md`). Mỗi mục gồm: cây con lấy từ mockup,
> độ phủ code hiện tại, khoảng trống, đề xuất dữ liệu/route/quyền, module & công sức.
>
> **Quy ước:** ✅ đã có · 🟡 một phần · 🕓 sắp có (chưa build). Công sức: **S** (≤1
> tuần), **M** (1–2 tuần), **L** (≥3 tuần). Mọi backend theo "Quy ước chung" trong
> `docs/nang-cap/README.md` (migration append-only, API `getCurrentUser()`+`CAN`,
> upload theo `task_documents`, test import `tests/setup.ts` đầu tiên).

## Bảng module đề xuất (nối tiếp M00–M20)

| Module  | Phạm vi                                                                                                                                          | Cụm      | Công sức | Đặc tả                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------- | ----------------------------- |
| **M21** | AppShell IA đầy đủ + cây `dashboardTree.ts` + trang hub + **quản trị hiển thị** (admin/PM bật-tắt mục, notification `nav_enabled` khi admin bật) | (nền)    | M        | `M21-appshell-ia.md`          |
| **M22** | Multi-project: Portfolio, project switcher, scoping `project_id`, `user_projects`                                                                | Tầng 0–1 | L        | `M22-da-du-an.md` + ADR-0004  |
| **M23** | Khởi động & Pháp lý                                                                                                                              | B        | M        | `M23-khoi-dong-phap-ly.md`    |
| **M24** | Nhân sự & Tổ chức                                                                                                                                | B        | L        | `M24-nhan-su-to-chuc.md`      |
| **M25** | Môi trường & Giấy phép                                                                                                                           | H        | M        | `M25-moi-truong-giay-phep.md` |
| **M26** | Quan hệ & Quan trắc (lún/chuyển vị, cộng đồng)                                                                                                   | H        | M        | `M26-quan-he-quan-trac.md`    |
| **M27** | Tài chính – Kế toán công trường                                                                                                                  | I        | L        | `M27-tai-chinh-ke-toan.md`    |
| **M28** | Bảo hiểm & Bảo lãnh                                                                                                                              | I        | S        | `M28-bao-hiem-bao-lanh.md`    |
| **M29** | Bàn giao & Kết thúc (T&C, as-built, demob)                                                                                                       | K        | L        | `M29-ban-giao-ket-thuc.md`    |
| **M30** | Bảo hành – Bảo trì (O&M)                                                                                                                         | K        | M        | `M30-bao-hanh-bao-tri.md`     |
| **M31** | Chuyển đổi số & Công nghệ (CDE, IoT, drone)                                                                                                      | L        | M        | `M31-chuyen-doi-so.md`        |

> Các dashboard còn lại tái dùng/đào sâu module đã đặc tả: Vật tư=M01/M04/M18,
> Chi phí=M02/M16/M17/M19, QAQC=M03, Nhật ký/Hiện trường=M05/M14, VO/Claim=M06,
> Đấu thầu=M07, Bản vẽ/BPTC=M08, Báo cáo=M09, Công văn=M10, HSE=M11, Thiết bị=M12,
> Họp/Rủi ro=M13, Hồ sơ=M20.

---

# CỤM A — Tổng quan & Báo cáo

## A1. Dashboard Báo Cáo & KPI Tổng — 🟡 (M09)

**Cây con (mockup):** Báo cáo tổng hợp (tuần/tháng/CĐT) · Đường cong S · Earned
Value EVM (SPI/CPI) · KPI dự án (tiến độ–chi phí–chất lượng–an toàn) · Bảng cảnh báo.

**Đã có:** `/` (KPI, Pareto trễ, ProgressMap), `/report` (in PDF), `SCurveChart`
(+baseline), `SpiCards`, `ForecastCards` (EVM/dự báo), báo cáo tuần/ngày cron,
thông báo = cảnh báo.

**Khoảng trống:** KPI **4 trụ** gộp (chi phí + chất lượng + an toàn còn rời rạc);
CPI thực (cần dữ liệu chi phí thực từ M02/M27); trang **Alerts** tập trung; báo cáo
"cho CĐT/Ban lãnh đạo" (bản rút gọn 1 trang).

**Đề xuất:** trang hub `/` render 4 thẻ KPI trụ + link con; endpoint
`/api/dashboard/kpi` gộp 4 trục; trang `/report?type=owner` bản CĐT. Không bảng mới
(đọc lại dữ liệu sẵn có). **Công sức S–M.**

---

# CỤM B — Khởi động & Tổ chức

## B1. Dashboard Khởi Động & Pháp Lý — 🕓 (M23)

**Cây con:** Hồ sơ pháp lý (giấy phép XD, phê duyệt quy hoạch–thiết kế, HĐ chính) ·
Bàn giao mặt bằng (biên bản, hiện trạng & mốc giới) · Khảo sát (địa chất, công
trình lân cận) · Trắc đạc & mốc chuẩn (lưới khống chế, tim–cốt–cao độ) · Huy động
công trường (kế hoạch, định vị).

**Đề xuất dữ liệu:** bảng `legal_documents` (loại, số, ngày cấp, hết hạn, file, dự
án) — tái dùng khuôn upload `task_documents`; bảng `mobilization_items` (checklist
huy động, trạng thái). Trắc đạc/mốc chuẩn có thể gắn vào `work_fronts` (M14) như một
loại front. **Route:** `/kickoff` (hub) → tab pháp lý / bàn giao / khảo sát / trắc
đạc / huy động. **Quyền:** admin/pm ghi, còn lại xem. Cảnh báo giấy phép sắp hết hạn
→ thêm loại notification. **Công sức M.**

## B2. Dashboard Nhân Sự & Tổ Chức — 🟡 (M24)

**Cây con:** Sơ đồ tổ chức (ban chỉ huy, ma trận RACI) · Nhân sự (danh sách, phân
công, chấm công) · Nhân công & tổ đội (quản lý tổ đội, nhật ký nhân công) · Đào tạo
(kế hoạch, nâng bậc, chứng chỉ) · An sinh (lán trại, phúc lợi, quan hệ LĐ) · Đánh
giá năng lực & KPI cá nhân.

**Đã có:** `/users` (tài khoản), `/admin` (phân công task), nhân lực nhật ký (M05).

**Khoảng trống:** phần lớn — org chart, RACI, chấm công, tổ đội, đào tạo/chứng chỉ.

**Đề xuất dữ liệu:** `personnel` (nhân sự công trường ≠ user hệ thống), `crews` (tổ
đội) + `crew_members`, `raci_matrix` (task/hạng mục × vai trò), `attendance` (chấm
công ngày), `certifications` (chứng chỉ + hạn). Nhật ký nhân công đã có ở M05 — liên
kết `crew_id`. **Route:** `/org` (sơ đồ + RACI), `/personnel`, `/attendance`,
`/training`. **Công sức L** (chia PR theo nhóm con). Chấm công là mục dùng nhiều nhất
→ ưu tiên.

---

# CỤM C — Thiết kế & Bản vẽ

## C1. Dashboard Thiết Kế & Biện Pháp Thi Công — 🟡 (M08)

**Cây con:** Thẩm tra & phối hợp thiết kế · RFI gửi thiết kế/TVGS (lập→theo dõi→đóng)
· Quản lý thay đổi thiết kế (tiếp nhận→đánh giá tác động→trình duyệt→cập nhật bản vẽ)
· Biện pháp thi công (BPTC theo hệ: Trắc đạc/Xây dựng/MEP + đặc biệt) · Phê duyệt BPTC.

**Đã có:** RFI/công văn (M10 → `/correspondences`), bản vẽ (M08 → `/drawings`).

**Khoảng trống:** **Method Statement (BPTC)** có quy trình phê duyệt riêng theo hệ;
Design Change có luồng đánh giá tác động (kỹ thuật/chi phí/tiến độ).

**Đề xuất:** bảng `method_statements` (mã, hệ, phiên bản, trạng thái duyệt, file) +
`design_changes` (yêu cầu, tác động, quyết định) — cả hai tái dùng luồng duyệt kiểu
`/approvals`. **Route:** `/method-statements`, `/design-changes` (hoặc gộp `/drawings`
thành hub Thiết kế nhiều tab). **Công sức M.**

## C2. Dashboard BIM · Shop-Drawing — ✅ (M08)

**Cây con:** Kế hoạch bản vẽ (BIM-Shop) · Mô hình BIM & phối hợp (clash) · Bản vẽ
trình duyệt · Bản vẽ được duyệt · Quản lý phiên bản (revision) · Bản vẽ chậm tiến độ.

**Đã có:** `/drawings` (danh mục, phiên bản, trạng thái duyệt, trễ).

**Khoảng trống:** BIM/clash detection (nặng — có thể chỉ nhúng link Autodesk/viewer
ngoài); "kế hoạch bản vẽ" dạng lịch trình. **Đề xuất:** thêm cột kế hoạch (ngày dự
kiến phát hành) vào `drawings`; trang con "Chậm tiến độ" lọc sẵn. Clash → ngoài phạm
vi (link CDE). **Công sức S** (mở rộng) — BIM viewer để M31.

---

# CỤM D — Kế hoạch & Tiến độ

## D1. Dashboard Tiến Độ — ✅ (M09 + hệ)

**Cây con:** Tổng thể (Timeline, Gantt, Lookahead, báo cáo ngày/tuần/tháng, S-curve)
· lặp lại theo 8 hệ (Trắc đạc, Kết cấu, Xây tô, ACMV, Điện, CTN, PCCC) · Kiểm soát
đường găng & chậm tiến độ.

**Đã có:** `/timeline`, `/gantt`, `/lookahead`, S-curve, báo cáo cron, `/he/[code]`
lọc theo hệ, Pareto trễ trên dashboard.

**Khoảng trống:** **đường găng (critical path)** thực sự (cần quan hệ phụ thuộc
task — hiện chưa có); Gantt theo từng hệ (đã lọc được nhưng chưa có view riêng gọn).

**Đề xuất:** bảng `task_dependencies` (predecessor/successor) → tính critical path;
trang hub `/schedule` gom Timeline/Gantt/Lookahead + selector hệ. **Công sức M**
(critical path là phần đáng kể — có thể tách đợt sau). Phần còn lại **S**.

---

# CỤM E — Đấu thầu & Nhà thầu phụ

## E1. Dashboard Đấu Thầu & Chọn Thầu Phụ — 🟡 (M07)

**Cây con:** Kế hoạch đấu thầu (danh mục gói, chiến lược) · Chia gói & phạm vi ·
Mời thầu ITB/RFP (hồ sơ, DS nhà thầu, addendum) · Đánh giá HSDT (kỹ thuật, thương
mại, bid tab) · Thương thảo & trao thầu (LOA, ký HĐ).

**Đã có:** `/tenders` (M07 — gói thầu, mời, đánh giá cơ bản).

**Khoảng trống:** **Bid Tab** (bảng so sánh chào giá nhiều nhà thầu), addendum,
LOA→ký HĐ nối sang `contracts` (M16).

**Đề xuất:** mở rộng `/tenders`: bảng `tender_bids` (nhà thầu × hạng mục × giá) cho
bid tab; nút "Trao thầu" tạo bản ghi `contracts`. **Công sức M.**

## E2. Dashboard NTP (Nhà thầu phụ) — 🟡 (M15/M16)

**Cây con:** NTP theo hệ (hồ sơ năng lực + sơ đồ tổ chức, hợp đồng + phạm vi) · Đánh
giá năng lực & hiệu quả NTP · Thanh toán & công nợ NTP.

**Đã có:** hub hệ `/he/[code]` (quản lý theo hệ), hợp đồng (M16), thanh toán KL (M17).

**Khoảng trống:** **hồ sơ năng lực NTP** tập trung; **đánh giá hiệu quả** (chấm điểm
định kỳ); công nợ NTP theo nhà thầu.

**Đề xuất:** bảng `subcontractors` (chuẩn hoá NTP, gắn hệ + user subcon), `subcon_docs`
(hồ sơ năng lực), `subcon_evaluations` (kỳ đánh giá, điểm). Công nợ = view từ
`contracts`+`payment_certs`. **Route:** `/subcontractors` (hoặc tab trong `/he`).
**Công sức M.**

---

# CỤM F — Vật tư & Thiết bị

## F1. Dashboard Vật Tư — ✅ (M01/M04/M18)

**Cây con:** TENDER+BOQ tổng · BOQ theo hệ (Kết cấu/Xây tô/ACMV/Điện/CTN/PCCC) ·
Quản lý định mức (lập→duyệt→giao khoán→cấp phát→theo dõi→so sánh→hao hụt→điều
chỉnh→báo cáo) · Kế hoạch cung ứng · Đặt hàng (PR→RFQ→PO→duyệt→giao→GRN→đối chiếu,
theo hệ & theo NCC) · Kho bãi & bảo quản · Nhập–Xuất–Tồn.

**Đã có:** `/materials`, `/boq`, `/materials/purchase-orders`, `material_transactions`
(±), đồng bộ Google Sheet, BOQCODE toàn hệ.

**Khoảng trống:** **Định mức đầy đủ** (M18 — lập/duyệt/giao khoán/so sánh thực tế);
**RFQ & so sánh báo giá** (M04 mở rộng); **Nhập–Xuất–Tồn kho** (`qty_stock` đã có
cột, cần luồng GRN/xuất kho).

**Đề xuất:** triển khai M18 (`material_norms`, `norm_allocations`) + M04 mở rộng
(`purchase_requests`, `rfq`, `grn`, `stock_movements`). BOQ theo hệ = lọc `/boq?he=`.
**Công sức L** (chia: định mức M18 · RFQ/PO/GRN M04 · kho).

## F2. Dashboard Thiết Bị & Máy Móc — ✅ (M12)

**Cây con:** Máy móc thiết bị (danh mục, lịch bảo trì, nhật ký vận hành) · Kiểm định
an toàn (thiết bị nâng, chứng chỉ) · Công cụ–dụng cụ (cấp phát/thu hồi) · Nhiên liệu
(định mức, nhật ký tiêu hao) · Logistics & điều phối · Xe ra vào.

**Đã có:** `/equipment` (M12 — danh mục, bảo trì, nhật ký), `/vehicles` (xe ra vào).

**Khoảng trống:** **kiểm định + chứng chỉ** (hạn kiểm định → cảnh báo); **nhiên
liệu** (định mức + tiêu hao); công cụ–dụng cụ cấp phát.

**Đề xuất:** cột/bảng `equipment_inspections` (kỳ kiểm định, hạn, file chứng chỉ) +
`fuel_logs` (cấp/tiêu hao theo thiết bị). **Route:** tab trong `/equipment`. Cảnh báo
hạn kiểm định → notification. **Công sức M.**

---

# CỤM G — Thi công hiện trường

## G1. Dashboard Hiện Trường — ✅ (M05/M14)

**Cây con:** Quản lý mặt bằng (site layout, phân khu–phân đợt, kho bãi, vị trí
cẩu–vận thăng, luồng giao thông, cập nhật theo giai đoạn + quy trình duyệt) · Hạ tầng
tạm · An ninh công trường (kiểm soát ra vào, xe, quy trình an ninh, bảo vệ/tuần tra,
camera) · Thi công trắc đạc · Thi công xây dựng (kết cấu, xây tô — phối hợp & điểm
nóng) · Thi công MEP (ACMV/Điện/CTN/PCCC — phối hợp & điểm nóng) · Nhật ký hiện trường.

**Đã có:** `/work-fronts` (mặt bằng M14 — có duyệt thay đổi, PDF), `/diary` (nhật ký
M05), `/tracking` (lưới thi công theo sheet/hệ), `/my-tasks`, `/approvals`, `/vehicles`.

**Khoảng trống:** **"điểm nóng"** (hotspot phối hợp giữa các hệ — gắn vào work-front
hoặc risk M13); an ninh (bảo vệ/tuần tra/camera) phần lớn mới; hạ tầng tạm.

**Đề xuất:** bảng `hotspots` (vị trí × hệ liên quan × trạng thái) gắn `work_fronts`;
an ninh gộp với xe ra vào thành module nhỏ. Camera → M31. **Công sức M** (điểm nóng

- an ninh cơ bản); phần lớn đã phủ.

---

# CỤM H — Chất lượng · An toàn · Môi trường

## H1. Dashboard Chất Lượng (QA/QC) — ✅ (M03)

**Cây con:** Kế hoạch chất lượng ITP (theo hệ) · Mock-up & mẫu (duyệt mẫu, phòng
mẫu, căn hộ mẫu) · Hồ sơ thí nghiệm (theo hệ, kết quả hiện trường) · Nghiệm thu chất
lượng (RFI/RFA: checklist→YCNT→kiểm tra→biên bản→xử lý tồn tại; theo hệ; vật liệu đầu
vào) · Kiểm soát không phù hợp (NCR→nguyên nhân→CAR/PAR→đóng) · Báo cáo & KPI.

**Đã có:** `/quality` (M03 — ITP, phiếu YCNT, chuyển bước), `/approvals` (nghiệm thu
2 bước + biên bản `task_documents`).

**Khoảng trống:** **NCR/CAR/PAR** (sổ không phù hợp); **thí nghiệm** (kết quả test
theo hệ); **mock-up/mẫu** (duyệt mẫu vật liệu).

**Đề xuất:** bảng `ncr` (phát hiện→nguyên nhân→khắc phục→đóng, gắn task/hệ),
`lab_tests` (loại test, mẫu, kết quả, đạt/không), `sample_approvals` (mẫu vật liệu).
**Route:** tab trong `/quality`. Cảnh báo NCR quá hạn → notification. **Công sức M.**

## H2. Dashboard An Toàn – HSE & Rủi Ro — ✅ (M11/M13)

**Cây con:** Hồ sơ an toàn (Safety Plan, JSA, biện pháp) · Quản lý rủi ro (risk
register, giảm thiểu, điểm nóng) · Huấn luyện (định kỳ, thẻ an toàn) · Kiểm tra &
giám sát (checklist, safety walk, vi phạm) · Sự cố & tai nạn (báo cáo, điều tra) ·
Ứng phó khẩn cấp · Y tế & sức khoẻ · Vệ sinh & môi trường (5S, chất thải, bụi–ồn).

**Đã có:** `/hse` (M11 — checklist, vi phạm, sự cố), `/risks` (M13 — sổ rủi ro).

**Khoảng trống:** **huấn luyện & thẻ an toàn** (gắn `certifications` của M24); **điều
tra tai nạn** (biểu mẫu sâu); ứng phó khẩn cấp; y tế. Vệ sinh/chất thải trùng M25.

**Đề xuất:** mở rộng `/hse`: `safety_trainings`, `incidents` (nâng từ sự cố cơ bản
thành điều tra 5-why), `emergency_plans`. **Công sức M.**

## H3. Dashboard Môi Trường & Giấy Phép — 🕓 (M25)

**Cây con:** Hồ sơ môi trường (ĐTM, giấy phép MT, giấy phép xả thải) · Quan trắc
môi trường (nước thải, khí thải–bụi, tiếng ồn–rung) · Quản lý chất thải (rắn XD, nguy
hại, nước thải) · Phát thải & ESG (kiểm kê carbon, báo cáo bền vững) · Báo cáo định kỳ.

**Đề xuất dữ liệu:** `env_permits` (giấy phép MT + hạn), `env_monitoring` (kỳ quan
trắc, chỉ tiêu, ngưỡng, đạt/không), `waste_logs` (loại chất thải, khối lượng, xử lý).
**Route:** `/environment` (hub tab). Cảnh báo vượt ngưỡng quan trắc + giấy phép sắp
hết hạn → notification. **Công sức M.**

## H4. Dashboard Quan Hệ & Quan Trắc — 🕓 (M26)

**Cây con:** Khảo sát hiện trạng lân cận · Quan trắc công trình (lún, chuyển vị/
nghiêng, công trình lân cận) · Quan hệ chính quyền & cộng đồng (giấy phép địa phương,
quan hệ dân cư, xử lý khiếu nại).

**Đề xuất dữ liệu:** `monitoring_points` (mốc quan trắc) + `monitoring_readings` (kỳ
đo, giá trị lún/nghiêng, ngưỡng cảnh báo — vẽ biểu đồ theo thời gian), `community_cases`
(khiếu nại: tiếp nhận→xử lý→đóng). **Route:** `/monitoring`. Cảnh báo vượt ngưỡng lún
→ notification. **Công sức M** (biểu đồ quan trắc là điểm nhấn kỹ thuật).

---

# CỤM I — Chi phí · Hợp đồng · Tài chính

## I1. Dashboard Chi Phí & Hợp Đồng — ✅ (M02/M16/M17/M19)

**Cây con:** Ngân sách (gốc BOQ, điều chỉnh) · Hợp đồng (chính, thầu phụ, phụ lục/VO)
· Đề xuất & duyệt · Thanh toán (IPC: xác nhận KL→hồ sơ→trình duyệt→hoá đơn; thầu phụ;
bảo lãnh & tạm ứng) · Kiểm soát chi phí (thực tế vs ngân sách, phát sinh, cashflow) ·
Quyết toán (khối lượng, hợp đồng).

**Đã có:** `/costs` (M02), `/contracts` (M16), `/payments`+`/payment-certs` (M17),
`/proposals` (M19), `/variations` (VO/M06).

**Khoảng trống:** **cashflow** (dòng tiền — trùng I2/M27); **quyết toán** cuối kỳ;
ngân sách điều chỉnh (versioning).

**Đề xuất:** bổ sung `budget_revisions`; trang `/costs` thêm tab quyết toán. Cashflow
để M27. **Công sức S–M.**

## I2. Dashboard Tài Chính – Kế Toán Công Trường — 🕓 (M27)

**Cây con:** Dòng tiền (kế hoạch, thực tế) · Tạm ứng & hoàn ứng · Quỹ tiền mặt
(petty cash) · Hoá đơn & thuế (VAT vào/ra, kê khai) · Công nợ (phải thu CĐT, phải trả
NCC–NTP) · Lương & thanh toán nhân công · Báo cáo tài chính công trường.

**Đề xuất dữ liệu:** `cash_transactions` (thu/chi, loại, chứng từ), `advances` (tạm
ứng/hoàn ứng), `invoices` (VAT vào/ra), công nợ = view từ `contracts`/`payment_certs`/
`purchase_orders`, `payroll` (kỳ lương, gắn `personnel`/`attendance` của M24).
**Route:** `/finance` (hub tab). **Công sức L.** Phụ thuộc M24 (lương) + M02/M17.

## I3. Dashboard Bảo Hiểm & Bảo Lãnh — 🕓 (M28)

**Cây con:** Bảo hiểm (công trình CAR, trách nhiệm bên thứ ba, tai nạn LĐ) · Bảo lãnh
(thực hiện HĐ, tạm ứng, bảo hành) · Theo dõi hiệu lực & gia hạn.

**Đề xuất dữ liệu:** một bảng `guarantees_insurances` (loại, số, bên phát hành, giá
trị, hiệu lực từ–đến, file, gắn `contract_id`). Cảnh báo **sắp hết hiệu lực** →
notification (giống due_soon). **Route:** `/guarantees`. **Công sức S** (một bảng +
cảnh báo hạn — gọn, giá trị cao cho PM).

## I4. Dashboard Claim & Thay Đổi — 🟡 (M06/M19)

**Cây con:** Yêu cầu thay đổi (VO: đề xuất→định giá→duyệt→phụ lục) · Claim chi phí
(notice→hồ sơ định lượng→đàm phán→chốt) · Gia hạn thời gian EOT (thông báo→phân tích
ảnh hưởng→hồ sơ→duyệt) · Tranh chấp & xử lý HĐ.

**Đã có:** `/variations` (VO — M06), EOT (một phần trong M13/M14 PR3 — badge lưới),
`/proposals` (duyệt online M19).

**Khoảng trống:** **Claim chi phí** (quy trình notice→định lượng→chốt) tách khỏi VO;
**EOT** thành module riêng có phân tích ảnh hưởng tiến độ.

**Đề xuất:** bảng `claims` (loại: cost/EOT, notice date, giá trị/số ngày, trạng
thái), liên kết `variations`. **Route:** `/claims` (hoặc tab trong `/variations`).
**Công sức M.**

---

# CỤM J — Điều hành & Hồ sơ

## J1. Dashboard Họp – Công Văn — ✅ (M10/M13)

**Cây con:** Họp & phối hợp (giao ban, phối hợp thi công, họp CĐT/TVGS) · Nhật ký thi
công (hằng ngày, thời tiết) · Công văn (đi, đến, RFI/RFA).

**Đã có:** `/meetings` (M13 — biên bản họp), `/correspondences` (M10 — công văn +
RFI), `/diary` (nhật ký + thời tiết M05).

**Khoảng trống:** nhỏ — liên kết action item của họp sang task; phân loại họp.
**Đề xuất:** cột `meeting_type` + action items gắn `task_id`. **Công sức S.**

## J2. Dashboard Hồ Sơ — ✅ (M20)

**Cây con:** Hồ sơ NTP · Hồ sơ NCC vật tư (theo nhóm: cát/xi măng/đá/thép/gạch/bê
tông; MEP) · Hồ sơ vật tư trình duyệt · Hồ sơ nghiệm thu (vật liệu đầu vào, vật tư
phụ, công việc — form YCNT/NTCV theo hệ) · Hồ sơ hoàn công (as-built) · Lưu trữ & số
hoá · Transmittal · Document register (mã hoá hồ sơ).

**Đã có:** `/documents` (M20 — kho hồ sơ dự án dạng Drive).

**Khoảng trống:** **Document Register** (danh mục mã hoá + trạng thái) và
**Transmittal** (phiếu chuyển giao) — là chức năng CDE. As-built nối M29.

**Đề xuất:** bảng `document_register` (mã, loại, phiên bản, trạng thái, người giữ) +
`transmittals` (phiếu chuyển × danh sách tài liệu). **Route:** tab trong `/documents`.
**Công sức M.** (Đây là lõi CDE — liên quan M31.)

---

# CỤM K — Bàn giao & Vận hành

## K1. Dashboard Bàn Giao & Kết Thúc — 🕓 (M29)

**Cây con:** Chạy thử & nghiệm thu hệ thống T&C (commissioning MEP, nghiệm thu PCCC
cơ quan) · Nghiệm thu hoàn thành (hạng mục, tổng thể) · Hồ sơ pháp lý kết thúc (nghiệm
thu QLNN, giấy phép sử dụng, đăng ký sở hữu) · Bàn giao CĐT (biên bản, as-built) ·
Giải thể công trường (demob: tháo lán trại, hoàn trả mặt bằng, thanh lý vật tư dư) ·
Quyết toán & kết thúc (quyết toán cuối kỳ, bài học kinh nghiệm).

**Đề xuất dữ liệu:** `commissioning` (hệ thống, checklist T&C, kết quả), `handover_items`
(hạng mục bàn giao + biên bản), `punch_list` (tồn tại khi bàn giao), `lessons_learned`.
As-built = liên kết `document_register`. **Route:** `/handover` (hub tab). **Công sức
L.** Phụ thuộc QA/QC (M03) + Hồ sơ (M20).

## K2. Dashboard Bảo Hành – Bảo Trì — 🕓 (M30)

**Cây con:** Bảo hành (danh mục & thời hạn, xử lý lỗi sau bàn giao, bảo lãnh bảo
hành) · Vận hành & bảo trì O&M (hướng dẫn, đào tạo vận hành cho CĐT).

**Đề xuất dữ liệu:** `warranty_items` (hạng mục, hạn bảo hành, gắn hệ), `warranty_claims`
(lỗi sau bàn giao: tiếp nhận→xử lý→đóng). Bảo lãnh bảo hành = liên kết M28.
**Route:** `/warranty`. Cảnh báo bảo hành sắp hết hạn → notification. **Công sức M.**

---

# CỤM L — Công nghệ & Số hoá

## L1. Dashboard Chuyển Đổi Số & Công Nghệ — 🕓 (M31)

**Cây con:** Môi trường dữ liệu chung CDE (quản lý tài liệu điện tử, phân quyền &
luồng duyệt) · Giám sát bằng công nghệ (camera & AI, flycam/drone theo dõi tiến độ,
cảm biến IoT) · Phần mềm QLDA (P6/MS Project, chi phí–HĐ, app công trường) · Tích hợp
BIM & dữ liệu · An toàn thông tin & sao lưu.

**Đã có:** CDE cơ bản = `/documents` (M20); app công trường = PWA hiện có; luồng duyệt
= `/proposals`/`/approvals`.

**Khoảng trống:** **giám sát công nghệ** (camera/drone/IoT — chủ yếu nhúng nguồn
ngoài + lưu ảnh mốc tiến độ); tích hợp BIM viewer; trạng thái sao lưu/bảo mật (trang
báo cáo vận hành hệ thống — admin).

**Đề xuất:** phần lớn là **tổng hợp & nhúng** hơn là dữ liệu mới: trang `/tech` gom
liên kết CDE, BIM viewer (iframe), drone progress (album ảnh theo mốc — tái dùng
`task_photos`), trạng thái hệ thống (admin). **Công sức M.** Ưu tiên thấp (nền tảng
đã phục vụ phần lõi).

---

## Thứ tự triển khai đề xuất

1. **M21** (AppShell IA) — mở khoá toàn bộ điều hướng, rủi ro thấp, thấy ngay giá trị.
2. **M22** (multi-project) — nền cho tất cả; làm sớm để tránh refactor scoping về sau.
3. **Đào sâu dashboard đã có** (giá trị cao, tái dùng khung): M18 định mức, M04 RFQ/
   kho, NCR (H1), bid tab (E1), kiểm định thiết bị (F2).
4. **Dashboard mới theo nhu cầu PM**: I3 Bảo hiểm (nhỏ, giá trị cao) → B1 Khởi động →
   H3 Môi trường → I2 Tài chính → K1 Bàn giao → còn lại.

> Mỗi module khi hoàn thành: đổi `status` node trong `dashboardTree.ts` từ `coming-soon`
> → `available`, thêm route vào sidebar/hub, cập nhật `PROGRESS.md` + bảng ở trên.
