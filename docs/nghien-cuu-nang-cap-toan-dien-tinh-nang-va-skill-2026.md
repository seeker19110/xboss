# BÁO CÁO NGHIÊN CỨU & QUY HOẠCH NÂNG CẤP TOÀN DIỆN: TÍNH NĂNG & HỆ THỐNG SKILLS CHUYÊN NGHIỆP XBOSS

> **Cấp độ:** Enterprise Construction ERP & Autonomous Cognitive Engineering OS  
> **Tiêu chuẩn tham chiếu:** TCVN, QCVN, Luật Xây dựng 2014/2020, Nghị định 06/2021/NĐ-CP, Nghị định 15/2021/NĐ-CP, Thông tư 12/2021/TT-BXD, FIDIC Red/Yellow Book 1999/2017, ISO 19650 (BIM), ISO 21597 (BCF openBIM), QCVN 18:2021/BXD (An toàn), Nghị định 70/2025/NĐ-CP (Hóa đơn điện tử).

---

## 1. TỔNG QUAN KIẾN TRÚC NGHIỆP VỤ & MA TRẬN VAI TRÒ DỰ ÁN

Để XBoss trở thành một hệ điều hành công trình **"Pro" và chuẩn mực nhất ngành xây dựng & MEPF**, mọi tính năng và kỹ năng (Skill) được xây dựng dựa trên sự thấu hiểu sâu sắc các quy trình thực tế tại công trường, phòng điều hành dự án (PMO), văn phòng thầu chính và ban quản lý chủ đầu tư.

```
                    ┌────────────────────────────────────────────────────────┐
                    │      HỆ THỐNG ĐIỀU PHỐI TRUNG TÂM (XBOSS APEX KERNEL)   │
                    │  - Unified Apex Cockpit (M88)                          │
                    │  - Sổ cái Bất biến Merkle & Cryptographic Audit (M73)   │
                    │  - Multi-Agent Swarm Orchestrator (ENG-4/PIN-3)         │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
             ┌─────────────────────────────────┴─────────────────────────────────┐
             │                                                                   │
    ┌────────▼────────┐                                                 ┌────────▼────────┐
    │ 7 MASTER SKILLS │                                                 │ 17 CỤM PHÂN HỆ  │
    │  - CAD/BIM      │ ──────────── Trang bị tri thức ────────────►   │  - Tiến độ/BIM  │
    │  - EVM Schedule │                                                 │  - Hiện trường  │
    │  - QS Contracts │                                                 │  - QA/QC & HSE  │
    │  - Field Comms  │                                                 │  - Chi phí/Vốn  │
    │  - QAQC Safety  │                                                 │  - Đấu thầu/NTP │
    │  - UI/UX Craft  │                                                 │  - Bàn giao/CDE │
    │  - Swarm Orchest│                                                 │  - Apex AI Hub  │
    └─────────────────┘                                                 └─────────────────┘
```

---

## 2. MA TRẬN 7 BỘ KỸ NĂNG CHUYÊN GIA (MASTER SKILLS MATRIX)

Mỗi Skill được đóng gói thành một tài nguyên tri thức chuyên sâu (Skill Folder) gồm: **Nguyên tắc bất biến (Invariants)**, **Quy trình chuẩn hóa (Standard Workflows)**, **Công thức tính toán (Formulas & Algorithms)** và **Mẫu thực thi (Execution Templates)**.

---

### SKILL 1: `cad-bim-master` (Chuyên gia Kỹ thuật Không gian & BIM/MEPF)

- **Mục tiêu:** Tự động hóa thiết kế không gian, xử lý bản vẽ kỹ thuật, bóc tách khối lượng QTO, kiểm soát xung đột (Clash Detection), sinh mã gia công (Fabrication Nesting), và đồng bộ thực tế Scan-to-BIM.
- **Quy chuẩn & Pháp lý:** TCVN 9377:2012, TCVN 5687:2010 (Thông gió - ĐHKK), ISO 19650 (BIM), ISO 21597 (BCF openBIM), AIA Layer Standard, BS 1192.
- **Nguyên tắc Bất biến (Invariants):**
  1. _Gravity-Pipe Slope:_ Độ dốc thoát nước trọng lực ($1.0\% - 2.0\%$) là bất khả xâm phạm. Ống áp lực luôn phải né ống trọng lực.
  2. _Beam Penetration Zone:_ Lỗ mở xuyên dầm chỉ đặt trong khoảng $L/3 \le x \le 2L/3$, cách mép trên/dưới $\ge 50\text{mm}$. Cấm khoét tại vùng chịu cắt $L/3$ hai đầu dầm.
  3. _Hydraulic Velocity Limits:_ Nước cấp $v \le 1.5 - 2.5\text{m/s}$; Hút bơm $v \le 1.2\text{m/s}$ (chống Cavitation); Gió chính $v \le 8 - 10\text{m/s}$, gió nhánh $v \le 4 - 6\text{m/s}$.
- **Bộ công thức & Thuật toán lõi:**
  - Thủy lực Hazen-Williams: $h_f = 10.67 \cdot L \cdot Q^{1.852} \cdot C^{-1.852} \cdot D^{-4.87}$.
  - Thủy lực Darcy-Weisbach & Colebrook-White: $\Delta P = f \cdot \frac{L}{D} \cdot \frac{\rho v^2}{2}$.
  - Thuật toán Cắt phôi 1D FFD (First-Fit Decreasing) với độ hao hụt $< 1.8\%$.
  - Thuật toán 3D A* Spatial Grid Routing tự động nắn tuyến tránh dầm và né va chạm.
  - Thuật toán so khớp đám mây điểm Nearest-Neighbor Euclidean 3D với Heatmap sai lệch $(\Delta \le 15\text{mm})$.

---

### SKILL 2: `schedule-evm-controller` (Chuyên gia Điều độ Tiến độ & Quản trị Giá trị Thu được EVM)

- **Mục tiêu:** Kiểm soát tiến độ WBS đa cấp độ, tính toán đường găng CPM (Critical Path Method), đo lường hiệu suất Earned Value Management (EVM), điều phối kế hoạch ngắn hạn Lookahead 7/14/21 ngày và truy vết nguyên nhân chậm trễ (Delay Attribution).
- **Quy chuẩn & Pháp lý:** Tiêu chuẩn quản lý dự án PMI/PMBOK 7th, ISO 21500, Thông tư 06/2021/TT-BXD về quản lý chất lượng và tiến độ thi công.
- **Nguyên tắc Bất biến (Invariants):**
  1. _EVM Mathematical Invariant:_ $CV = EV - AC$, $SV = EV - PV$, $CPI = \frac{EV}{AC}$, $SPI = \frac{EV}{PV}$.
  2. _Status Hierarchy Invariant:_ Trạng thái `nghiem_thu` chỉ được xác lập khi $Progress = 100\%$ và có phê duyệt từ Kỹ sư trưởng/PM; không bao giờ bị hạ cấp tự động.
  3. _Critical Path Invariant:_ Mọi công việc có Tổng thời gian dự trữ tự do (Total Float) = 0 ngày thuộc Đường găng; bất kỳ trễ hạn nào trên đường găng phải kích hoạt cảnh báo Red Alert.
- **Bộ công thức & Thuật toán lõi:**
  - Thuật toán CPM Forward/Backward Pass tính $ES, EF, LS, LF$ và $TotalFloat = LS - ES$.
  - Dự báo tổng chi phí khi hoàn thành: $EAC = AC + \frac{BAC - EV}{CPI \cdot SPI}$.
  - Phân tích Pareto 80/20 nguyên nhân trễ hạn (Mặt bằng, Thiết kế, Vật tư, Nhân lực, Tài chính, Thời tiết).
  - Chuỗi tích hợp Recompute Task: $\text{Dimension Checkboxes} \rightarrow \text{Task Progress} \rightarrow \text{Package Progress} \rightarrow \text{WBS Level Rolling-Up}$.

---

### SKILL 3: `qs-cost-contracts-master` (Chuyên gia Định giá Dự toán, FIDIC & Dòng tiền Dự án)

- **Mục tiêu:** Quản trị định mức dự toán, kiểm soát biến động BOQ, phân tích tranh chấp hợp đồng FIDIC, lập hồ sơ khiếu nại bù trừ thời gian/chi phí (EOT & Cost Claims) và mô phỏng dự báo dòng tiền Dynamic Cashflow.
- **Quy chuẩn & Pháp lý:** Thông tư 12/2021/TT-BXD (Định mức dự toán xây dựng), Nghị định 10/2021/NĐ-CP (Quản lý chi phí đầu tư xây dựng), Hợp đồng mẫu FIDIC Red Book / Yellow Book 1999 & 2017, Nghị định 70/2025/NĐ-CP (Hóa đơn điện tử).
- **Nguyên tắc Bất biến (Invariants):**
  1. _FIDIC 28-Day Time-Bar Invariant:_ Thông báo sự kiện khiếu nại (Notice of Claim) BẮT BUỘC phải gửi trong vòng 28 ngày kể từ khi Nhà thầu nhận biết sự kiện (Điều 20.1 FIDIC 1999 / Điều 20.2 FIDIC 2017).
  2. _Money Arithmetic Invariant:_ Không tính toán số tiền trên số thực float của JavaScript. Mọi phép nhân/cộng dồn tiền tệ bắt buộc thực hiện trong PostgreSQL hoặc qua BigInt ($đồng \times 100$) trong `lib/money.ts`.
  3. _Payment Balance Invariant:_ $IPC = \text{Khối lượng lũy kế} - \text{Tạm ứng thu hồi} - \text{Giữ lại bảo hành} - \text{Đã thanh toán kỳ trước} + \text{Phát sinh được duyệt}$.
- **Bộ công thức & Thuật toán lõi:**
  - Thuật toán Time Impact Analysis (TIA): Chèn mạng công việc trễ (Fragnet) vào tiến độ cơ sở (Baseline CPM) để xác định số ngày giãn tiến độ hợp pháp $(\Delta EOT)$.
  - Công thức tính chi phí quản lý gián tiếp hiện trường do kéo dài tiến độ: $\text{Extended Site Overheads} = \Delta EOT \times \text{Định phí ngày}$.
  - Thuật toán phân phối đường cong S-Curve hình chuông tích lũy (Gaussian S-Curve) cho dòng tiền kế hoạch $Cash\text{-}In$ và $Cash\text{-}Out$.

---

### SKILL 4: `site-field-commander` (Chỉ huy trưởng Hiện trường, Mặt bằng & Logistics)

- **Mục tiêu:** Chỉ huy tác nghiệp tại công trường, phân chia và bàn giao mặt bằng thi công (Work-Fronts), quản lý nhật ký thi công điện tử đa bên, quét mã QR Logistics kiểm nhận vật tư tại cổng và vận hành mượt mà ngoại tuyến (Offline PWA).
- **Quy chuẩn & Pháp lý:** Thông tư 06/2021/TT-BXD (Nhật ký thi công và biên bản nghiệm thu), QCVN 18:2021/BXD (An toàn trong xây dựng).
- **Nguyên tắc Bất biến (Invariants):**
  1. _Work-Front Custody Invariant:_ Một phân vùng mặt bằng chỉ có 1 đơn vị/đội thi công nắm quyền kiểm soát tại một thời điểm.
  2. _Diary Integrity Invariant:_ Nhật ký thi công mỗi ngày ghi nhận đầy đủ 4 yếu tố: Thời tiết, Nhân lực thực tế, Thiết bị hoạt động, và Khối lượng thi công chính.
  3. _Offline Queue Idempotency Invariant:_ Mọi thao tác tick chọn hoặc ghi nhật ký khi mất mạng được lưu vào IndexedDB kèm UUID băm và replay lũy đẳng khi online.

---

### SKILL 5: `qaqc-safety-sentinel` (Giám sát Chất lượng QA/QC 3 Bên & An toàn HSE AI)

- **Mục tiêu:** Kiểm soát quy trình nghiệm thu công việc xây dựng theo luật định, giám sát điểm dừng kỹ thuật (Hold-Points), phát hành và đóng phiếu không phù hợp (NCR/Punch-List), và nhận diện nguy cơ mất an toàn lao động tự động qua AI Vision.
- **Quy chuẩn & Pháp lý:** Nghị định 06/2021/NĐ-CP (Quản lý chất lượng công trình xây dựng), QCVN 18:2021/BXD (An toàn trong thi công xây dựng).
- **Nguyên tắc Bất biến (Invariants):**
  1. _Hold-Point Lock Invariant:_ Công việc nằm trong danh mục điểm dừng kiểm tra (Hold-Point) tuyệt đối KHÔNG được làm bước tiếp theo nếu chưa có BBNT ký duyệt bởi TVGS.
  2. _NCR Defect Closure Invariant:_ Phiếu NCR chỉ được đóng khi có đủ 3 ảnh: Hiện trạng sai $\rightarrow$ Biện pháp khắc phục $\rightarrow$ Nghiệm thu lại sau sửa.
  3. _Safety Hazard Escalation Invariant:_ Phát hiện vi phạm an toàn cấp độ CRITICAL $\rightarrow$ Tự động sinh Ticket đình chỉ công việc tức thời và gửi cảnh báo đỏ.

---

### SKILL 6: `ui-ux-craftsman` (Nghệ nhân Thiết kế Giao diện Công trường & Phòng Điều hành)

- **Mục tiêu:** Thiết lập hệ thống thiết kế (Design System) nhất quán, chuẩn công thái học cho cả kỹ sư dùng điện thoại ngoài nắng lẫn lãnh đạo điều hành trên màn hình lớn; bảo đảm chuẩn tiếp cận WCAG 2.2 AA.
- **Quy chuẩn & Phong cách:** Dark-first với cơ chế đảo màu CSS variable, Thang màu kẽm (`zinc`), Bố cục Bento Grid, Typography Tailwind chuẩn hoá, 5 trạng thái bắt buộc cho mọi component.
- **Nguyên tắc Bất biến (Invariants):**
  1. _Zero Hex & No Dark-Variant:_ Cấm tuyệt đối hardcode mã màu hex (`#...`) và tiền tố `dark:`. Mọi màu sắc tuân thủ biến CSS của hệ thống.
  2. _The 5 Mandatory States:_ Mọi màn hình có đủ 5 trạng thái: Empty $\rightarrow$ Loading Skeleton $\rightarrow$ Data Loaded $\rightarrow$ Error/Offline Retry $\rightarrow$ Validation Feedback.
  3. _Field Touch-Target Ergonomics:_ Trên giao diện hiện trường, vùng chạm tối thiểu $44 \times 44\text{px}$, nút hành động chính nằm trong vùng ngón cái (Thumb-Zone).

---

### SKILL 7: `engineering-agent-orchestrator` (Tổng chỉ huy Điều phối Đa Tác tử & Cognitive AI)

- **Mục tiêu:** Điều phối mạng lưới các Tác tử AI chuyên trách (Design Agent, Cost Agent, Safety Agent, Field Agent), vận hành giao thức hòa giải xung đột 7 bước, duy trì sổ cái mật mã Merkle Tree và đảm bảo an toàn phân quyền (Controlled Autonomy A0–A2).
- **Quy chuẩn & Ranh giới:** Ranh giới uỷ quyền ENG-3 / Gate 0, Giao thức đồng thuận đa tác tử ENG-4, Sổ cái Merkle Tree cryptographic tamper-proof ledger.
- **Nguyên tắc Bất biến (Invariants):**
  1. _Gate 0 Pre-execution Invariant:_ Mọi đề xuất thay đổi mô hình, BOQ hoặc chi phí phát sinh từ AI bắt buộc phải vượt qua Gate 0 trước khi trình người duyệt.
  2. _No Majority Voting in Engineering:_ Tranh chấp kỹ thuật bắt buộc giải quyết theo Thứ bậc Thẩm quyền Nguồn dữ liệu (Authority Hierarchy).
  3. _Cryptographic Provenance Token:_ Mỗi bản ghi điều chỉnh dữ liệu quan trọng đều được gắn kèm mã băm Merkle Leaf để đảm bảo tính toàn vẹn.

---

## 3. MA TRẬN 17 CỤM PHÂN HỆ NGHIỆP VỤ & PHÂN CÔNG SKILL

| STT    | Cụm Nghiệp Vụ & Phân Hệ                                                                                                            | Các Công Việc Chuyên Nghiệp Bắt Buộc Phải Thực Hiện                                                           | Skill Đảm Trách                                          |
| :----- | :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------- |
| **1**  | **Tổng quan & Báo cáo** (`/`, `/report`, `/reports`)                                                                               | Tổng hợp 4 chỉ số sinh tồn ($SPI, CPI, SSI, Stock$), vẽ S-Curve dải Monte Carlo, xuất PDF A4/A3.              | `schedule-evm-controller`, `ui-ux-craftsman`             |
| **2**  | **Kế hoạch & Tiến độ (6 Hệ)** (`/progress/*`)                                                                                      | Lưới tracking ma trận đa chiều SSE, chuỗi lăn tiến độ tự động (WBS Roll-up) và phân tích Pareto.              | `schedule-evm-controller`, `ui-ux-craftsman`             |
| **3**  | **Thi công Hiện trường** (`/my-tasks`, `/approvals`, `/diary`, `/work-fronts`, `/resources`)                                       | Nhật ký thi công TT06, quản lý phân chia mặt bằng không gian và phát hiện gán chồng chéo nguồn lực.           | `site-field-commander`, `ui-ux-craftsman`                |
| **4**  | **Thiết Kế - BIM - Shopdrawings** (`/drawings`, `/engineering/bim-viewer`, `/engineering/cad-nesting`)                             | Mô hình 3D IFC/BIM 4D Time-Lapse, quản lý vấn đề BCF ISO 21597 và tự động hóa cắt phôi xưởng 1D/2D.           | `cad-bim-master`                                         |
| **5**  | **Quản lý Vật tư & Mua sắm** (`/boq`, `/materials`, `/materials/purchase-orders`, `/engineering/qr-logistics`)                     | Định danh BOQ duy nhất toàn hệ thống, theo dõi định mức hao hụt và quét mã QR kiểm nhận hàng tại cổng.        | `qs-cost-contracts-master`, `site-field-commander`       |
| **6**  | **Chất lượng (QA/QC)** (`/quality`, `/approvals`, `/engineering/esign`)                                                            | Kiểm soát điểm dừng Hold-Point, phiếu NCR 3 bước và ký số điện tử BBNT 3 bên niêm phong SHA-256.              | `qaqc-safety-sentinel`, `engineering-agent-orchestrator` |
| **7**  | **An toàn HSE & Rủi ro** (`/hse`, `/risks`, `/engineering/hse-vision`)                                                             | AI Camera Vision quét nhận diện vi phạm bảo hộ (PPE), khu vực nguy hiểm và ma trận rủi ro dự án.              | `qaqc-safety-sentinel`                                   |
| **8**  | **Thiết bị & Máy móc** (`/equipment`, `/vehicles`)                                                                                 | Hồ sơ kiểm định an toàn máy móc, nhật trình xe ra vào công trường và lịch bảo dưỡng.                          | `site-field-commander`                                   |
| **9**  | **Đấu thầu & Quản lý Thầu phụ** (`/tenders`, `/subcontractors`)                                                                    | Đóng gói hồ sơ mời thầu (RFP), so sánh phân tích giá thầu và đánh giá định kỳ KPI thầu phụ.                   | `qs-cost-contracts-master`                               |
| **10** | **Môi trường & Quan trắc IoT** (`/environment`, `/monitoring`)                                                                     | Giám sát xả thải, giấy phép môi trường và tiếp nhận dữ liệu cảm biến IoT trắc đạc / bụi PM2.5 / ồn dB.        | `qaqc-safety-sentinel`                                   |
| **11** | **Họp & Công văn (CDE Hub)** (`/meetings`, `/correspondences`)                                                                     | Biên bản họp giao ban kèm Action Items và sổ theo dõi công văn Đi/Đến (RFI/Transmittal).                      | `site-field-commander`                                   |
| **12** | **Chi phí, Hợp đồng & Tài chính** (`/costs`, `/contracts`, `/payment-certs`, `/engineering/cashflow`, `/engineering/fidic-claims`) | Quản trị ngân sách 3 tầng, phân tích tranh chấp FIDIC kèm TIA, và mô phỏng dự báo dòng tiền Cashflow S-Curve. | `qs-cost-contracts-master`                               |
| **13** | **Bàn giao & Vận hành** (`/handover`, `/warranty`)                                                                                 | Hồ sơ hoàn công nghiệm thu đưa công trình vào sử dụng và quản lý bảo hành bảo trì.                            | `site-field-commander`, `qaqc-safety-sentinel`           |
| **14** | **Hồ sơ Dự án** (`/documents`)                                                                                                     | Cây thư mục lưu trữ tập trung tài liệu dự án và tìm kiếm toàn văn Full-Text Search (FTS) trích xuất PDF.      | `ui-ux-craftsman`                                        |
| **15** | **Nhân sự & Tổ chức** (`/users`, `/admin`, `/attendance`, `/personnel`, `/org`)                                                    | Quản lý danh bạ ban chỉ huy, sơ đồ phân cấp và chấm công hiện trường.                                         | `site-field-commander`                                   |
| **16** | **Khởi động & Pháp lý** (`/kickoff`)                                                                                               | Kiểm tra điều kiện khởi công, lưu trữ giấy phép xây dựng và thỏa thuận đấu nối kỹ thuật hạ tầng.              | `site-field-commander`                                   |
| **17** | **Hệ thống & Apex AI Cockpit** (`/admin/*`, `/engineering/*`)                                                                      | Trạm điều khiển Bento Grid kết nối 34+ siêu hệ thống, điều phối AI Swarm Gate 0 và Merkle Ledger.             | `engineering-agent-orchestrator`, `ui-ux-craftsman`      |
