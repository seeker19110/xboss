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
    │ 11 MASTER SKILL │                                                 │ 17 CỤM PHÂN HỆ  │
    │  - User Healing │ ──────────── Trang bị tri thức ────────────►   │  - Tiến độ/BIM  │
    │  - CAD/BIM      │                                                 │  - Hiện trường  │
    │  - EVM Schedule │                                                 │  - QA/QC & HSE  │
    │  - QS Contracts │                                                 │  - Chi phí/Vốn  │
    │  - Field Comms  │                                                 │  - Đấu thầu/NTP │
    │  - QAQC Safety  │                                                 │  - Bàn giao/CDE │
    │  - Procurement  │                                                 │  - Apex AI Hub  │
    │  - Commissioning│                                                 │  - Pháp lý XD   │
    │  - Compliance   │                                                 │  - Chuỗi cung   │
    │  - UI/UX Craft  │                                                 │                 │
    │  - Swarm Orchest│                                                 │                 │
    └─────────────────┘                                                 └─────────────────┘
```

---

## 2. MA TRẬN 11 BỘ KỸ NĂNG CHUYÊN GIA (MASTER SKILLS MATRIX)

Mỗi Skill được đóng gói thành một tài nguyên tri thức chuyên sâu (Skill Folder) gồm: **Nguyên tắc bất biến (Invariants)**, **Quy trình chuẩn hóa (Standard Workflows)**, **Công thức tính toán (Formulas & Algorithms)** và **Mẫu thực thi (Execution Templates)**.

1. **`cad-bim-master`**: Kỹ thuật không gian, Clash Solver, Spooling DfMA, Nesting $<1.2\%$, As-Built Redline & Khung dấu NĐ 06/2021.
2. **`schedule-evm-controller`**: WBS 5 tầng, CPM đường găng, EVM ($SPI, CPI, EAC$), Lookahead 7/14/21 ngày, Pareto Delay.
3. **`qs-cost-contracts-master`**: BOQ TT 12/2021, FIDIC Red/Yellow, Cảnh báo Claim 28 ngày, TIA, IPC, Bù giá trượt giá, Quyết toán A-B TT 96/2021.
4. **`site-field-commander`**: Mặt bằng Work-Front Custody, Histogram tài nguyên, Nhật ký TT 06/2021 qua NLP Voice, PWA Offline.
5. **`qaqc-safety-sentinel`**: Kế hoạch ITP, Khóa chặn Hold-Points, e-Sign 3 bên, NCR/Punch-list 3 bước, Camera AI HSE QCVN 18.
6. **`procurement-supplychain-master`**: Mua sắm Long-Lead, Đấu thầu PO, Khớp 3 chiều ($\text{PO} \equiv \text{GRN} \equiv \text{Invoice}$), Kiểm định CO/CQ, Kho phôi DfMA.
7. **`commissioning-handover-master`**: Thử nghiệm T&C, HVAC TAB, Liên động báo cháy PCCC (QCVN 06), Nghiệm thu Điều 24 NĐ 06, Bàn giao COBie LOD 500.
8. **`regulatory-compliance-master`**: Điều kiện khởi công Điều 107 Luật XD, Cảnh báo 30 ngày giấy phép/bảo lãnh, Kiểm định an toàn máy móc (TT 36/2019/TT-BLĐTBXH).
9. **`user-error-healing-master`**: Tự chữa lành lỗi L1-L4, Khớp mờ tiếng lóng, Phục hồi công thức Excel `#REF!`, CRDT Merge, Time-Travel Undo 24h.
10. **`ui-ux-craftsman`**: Thiết kế WCAG 2.2 AA, Mobile-first công trường ($\ge 44\text{px}$), Đảo màu CSS variable, Bento Grid, 5 trạng thái.
11. **`engineering-agent-orchestrator`**: Tổng chỉ huy AI Swarm, Hòa giải xung đột 7 bước, Ranh giới tự trị Gate 0 (A0-A2), Sổ cái Merkle Tree bất biến.

---

## 3. MA TRẬN 17 CỤM PHÂN HỆ NGHIỆP VỤ & PHÂN CÔNG SKILL

| STT    | Cụm Nghiệp Vụ & Phân Hệ                                                                                                            | Các Công Việc Chuyên Nghiệp Bắt Buộc Phải Thực Hiện                                                           | Skill Đảm Trách                                               |
| :----- | :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------ |
| **1**  | **Tổng quan & Báo cáo** (`/`, `/report`, `/reports`)                                                                               | Tổng hợp 4 chỉ số sinh tồn ($SPI, CPI, SSI, Stock$), vẽ S-Curve dải Monte Carlo, xuất PDF A4/A3.              | `schedule-evm-controller`, `ui-ux-craftsman`                  |
| **2**  | **Kế hoạch & Tiến độ (6 Hệ)** (`/progress/*`)                                                                                      | Lưới tracking ma trận đa chiều SSE, chuỗi lăn tiến độ tự động (WBS Roll-up) và phân tích Pareto.              | `schedule-evm-controller`, `ui-ux-craftsman`                  |
| **3**  | **Thi công Hiện trường** (`/my-tasks`, `/approvals`, `/diary`, `/work-fronts`, `/resources`)                                       | Nhật ký thi công TT06, quản lý phân chia mặt bằng không gian và phát hiện gán chồng chéo nguồn lực.           | `site-field-commander`, `ui-ux-craftsman`                     |
| **4**  | **Thiết Kế - BIM - Shopdrawings** (`/drawings`, `/engineering/bim-viewer`, `/engineering/cad-nesting`)                             | Mô hình 3D IFC/BIM 4D Time-Lapse, quản lý vấn đề BCF ISO 21597 và tự động hóa cắt phôi xưởng 1D/2D.           | `cad-bim-master`                                              |
| **5**  | **Quản lý Vật tư & Chuỗi cung ứng** (`/boq`, `/materials`, `/materials/purchase-orders`, `/engineering/qr-logistics`)              | Mua sắm Long-Lead, kiểm soát định mức hao hụt, khớp 3 chiều PO-GRN-Invoice và quét mã QR cổng.                | `procurement-supplychain-master`, `qs-cost-contracts-master`  |
| **6**  | **Chất lượng (QA/QC)** (`/quality`, `/approvals`, `/engineering/esign`)                                                            | Kiểm soát điểm dừng Hold-Point, phiếu NCR 3 bước và ký số điện tử BBNT 3 bên niêm phong SHA-256.              | `qaqc-safety-sentinel`, `engineering-agent-orchestrator`      |
| **7**  | **An toàn HSE & Rủi ro** (`/hse`, `/risks`, `/engineering/hse-vision`)                                                             | AI Camera Vision quét nhận diện vi phạm bảo hộ (PPE), khu vực nguy hiểm và ma trận rủi ro dự án.              | `qaqc-safety-sentinel`                                        |
| **8**  | **Thiết bị & Máy móc** (`/equipment`, `/vehicles`)                                                                                 | Hồ sơ kiểm định kỹ thuật an toàn máy móc nghiêm ngặt (TT 36/2019/TT-BLĐTBXH) và lịch bảo dưỡng định kỳ.       | `regulatory-compliance-master`, `site-field-commander`        |
| **9**  | **Đấu thầu & Quản lý Thầu phụ** (`/tenders`, `/subcontractors`)                                                                    | Đóng gói hồ sơ mời thầu (RFP), so sánh phân tích giá thầu và đánh giá định kỳ KPI thầu phụ/NCC.               | `qs-cost-contracts-master`, `procurement-supplychain-master`  |
| **10** | **Môi trường & Quan trắc IoT** (`/environment`, `/monitoring`)                                                                     | Giám sát xả thải, giấy phép môi trường và tiếp nhận dữ liệu cảm biến IoT trắc đạc / bụi PM2.5 / ồn dB.        | `qaqc-safety-sentinel`, `regulatory-compliance-master`        |
| **11** | **Họp & Công văn (CDE Hub)** (`/meetings`, `/correspondences`)                                                                     | Biên bản họp giao ban kèm Action Items và sổ theo dõi công văn Đi/Đến (RFI/Transmittal).                      | `site-field-commander`                                        |
| **12** | **Chi phí, Hợp đồng & Tài chính** (`/costs`, `/contracts`, `/payment-certs`, `/engineering/cashflow`, `/engineering/fidic-claims`) | Quản trị ngân sách 3 tầng, phân tích tranh chấp FIDIC kèm TIA, trượt giá và quyết toán hợp đồng A-B.          | `qs-cost-contracts-master`                                    |
| **13** | **Thử nghiệm & Bàn giao (T&C)** (`/handover`, `/warranty`)                                                                         | Chạy thử liên động T&C, HVAC TAB, nghiệm thu PCCC, Điều 24 NĐ 06 và bàn giao COBie Digital Twin LOD 500.      | `commissioning-handover-master`, `cad-bim-master`             |
| **14** | **Hồ sơ Dự án** (`/documents`)                                                                                                     | Cây thư mục lưu trữ tập trung tài liệu dự án và tìm kiếm toàn văn Full-Text Search (FTS) trích xuất PDF.      | `ui-ux-craftsman`, `regulatory-compliance-master`             |
| **15** | **Nhân sự & Tổ chức** (`/users`, `/admin`, `/attendance`, `/personnel`, `/org`)                                                    | Quản lý danh bạ ban chỉ huy, sơ đồ phân cấp RACI, chứng chỉ hành nghề và chấm công hiện trường.               | `site-field-commander`, `regulatory-compliance-master`        |
| **16** | **Khởi động & Pháp lý** (`/kickoff`)                                                                                               | Kiểm tra điều kiện khởi công Điều 107 Luật XD, thẩm duyệt PCCC/ĐTM và cảnh báo sớm 30 ngày gia hạn giấy phép. | `regulatory-compliance-master`                                |
| **17** | **Hệ thống & Apex AI Cockpit** (`/admin/*`, `/engineering/*`)                                                                      | Trạm điều khiển Bento Grid kết nối 34+ siêu hệ thống, điều phối AI Swarm Gate 0 và Merkle Ledger.             | `engineering-agent-orchestrator`, `user-error-healing-master` |
