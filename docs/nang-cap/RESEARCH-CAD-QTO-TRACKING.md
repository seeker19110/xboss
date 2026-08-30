# Báo Cáo Nghiên Cứu Chuyên Sâu: Hợp Nhất CAD — Khối Lượng (QTO/BOQ) — Tracking Tiến Độ & Nghiệm Thu (Closed-Loop CAD-QTO-Tracking Engineering Framework)

| Thuộc tính      | Giá trị                                                     |
| --------------- | ----------------------------------------------------------- |
| Ngày thực hiện  | 2026-08-19                                                  |
| Tác giả         | Seeker & Antigravity Engineering Research Group             |
| Phạm vi áp dụng | XBoss Engineering OS & Hệ thống Quản lý Dự án MEPF/Xây dựng |
| Trạng thái      | **Hoàn thành Nghiên cứu — Đã chuyển giao sang Đặc tả M66**  |

---

## 1. Vấn đề Cốt lõi & Hiện trạng Ngành Xây dựng / MEPF

### 1.1 Điểm đứt gãy dữ liệu (The 3-Tier Data Disconnect)

Trong thực tế thi công các dự án quy mô lớn, dữ liệu kỹ thuật bị phân mảnh thành 3 "ốc đảo" tách rời:

```mermaid
graph LR
    CAD["1. CAD / Shopdrawing<br/>(Bản vẽ Vector, DWG/DXF)"] -.->|Đo đạc thủ công<br/>Mất mát dữ liệu| BOQ["2. Khối lượng / Dự toán<br/>(Excel BOQ, Vật tư)"]
    BOQ -.->|Chấm % cảm tính<br/>Sai lệch khối lượng| TRK["3. Hiện trường & Nghiệm thu<br/>(BBNT Word, Nhật ký giấy)"]
    TRK -.->|Tranh chấp quyết toán<br/>Không truy vết được nguồn| CAD
```

1. **Khâu Thiết kế & Shopdrawing (CAD):** Bản vẽ CAD có đầy đủ kích thước hình học, độ dài, cao độ, quy cách ống và thiết bị nhưng chỉ tồn tại ở dạng "nét vẽ vô tri" (dumb lines/polylines).
2. **Khâu Dự toán & Quản lý Vật tư (BOQ / QTO):** Kỹ sư QS phải dùng thước đo hoặc lệnh `LIST` / `MEASUREGEOM` đo từng đoạn ống, gõ tay vào bảng Excel. Sai số đo bóc thủ công trung bình từ **5% đến 12%**.
3. **Khâu Hiện trường & Nghiệm thu (Tracking & BBNT):** Giám sát hiện trường báo cáo tiến độ theo % ước tính ("Tầng 5 xong khoảng 70%"), gây lệch chuẩn với khối lượng thanh toán thực tế. Khi lập Biên bản nghiệm thu (BBNT) và Hồ sơ thanh toán (Payment Certification), kỹ sư phải soạn lại bảng tính khối lượng từ đầu.

### 1.2 Hậu quả Kinh tế

- **Tranh chấp Phát sinh (Variation Orders - VO):** Khối lượng Shopdrawing phát sinh so với hợp đồng ban đầu thường chỉ được phát hiện khi đã lắp đặt xong, dẫn đến Chủ đầu tư từ chối thanh toán.
- **Thất thoát Vật tư Vượt Định mức:** Không kiểm soát được sự chênh lệch giữa khối lượng bản vẽ thiết kế, khối lượng xuất kho và khối lượng thực tế đã nghiệm thu.
- **Lãng phí Nhân lực:** Kỹ sư mất tới 40% thời gian văn phòng cho việc nhập liệu lặp lại giữa CAD $\rightarrow$ Excel $\rightarrow$ Word BBNT.

---

## 2. Mô hình Kiến trúc Trí tuệ Hợp nhất (Unified CAD-QTO-Tracking Framework)

Mô hình **Vòng lặp Kín (Closed-Loop)** giải quyết triệt để sự đứt gãy này bằng cách biến mọi thực thể trên bản vẽ CAD thành một **Đối tượng Kỹ thuật có Định danh (Spatial Spool Entity)** xuyên suốt từ Thiết kế đến Nghiệm thu:

```mermaid
flowchart TD
    subgraph TIER1["TẦNG 1: CAD SPATIAL & SPOOLING ENGINE"]
        D1["Bản vẽ Shopdrawing CAD (DWG/DXF/SVG)"]
        D2["Nhận diện Tim trục & Vùng không gian (Zone/Floor/Grid)"]
        D3["Tự động chia đoạn tuyến thành Spool ID<br/>(SP-DUCT-L4-001, SP-PIPE-012)"]
    end

    subgraph TIER2["TẦNG 2: 5D QTO & 3-WAY VARIANCE MATRIX"]
        Q1["Đo bóc hình học tự động: Độ dài m, Diện tích m², Khối lượng kg"]
        Q2["Đối soát Khối lượng 3 Chiều:<br/>Q_Contract (BOQ) vs Q_Shop (CAD) vs Q_Actual (As-built)"]
        Q3["Cảnh báo Vượt Định mức & Dự báo Phát sinh VO"]
    end

    subgraph TIER3["TẦNG 3: VISUAL PROGRESS PINNING & TRACKING"]
        T1["Chấm mốc 5 bước trên Mặt bằng CAD Số:<br/>Chế tạo → Giao hàng → Lắp đặt → KCS → Nghiệm thu"]
        T2["Cộng dồn Khối lượng Luỹ kế Tức thời (Cumulative Earned QTO)"]
        T3["Ánh xạ Tiến độ vào WBS Tasks & Work Packages"]
    end

    subgraph TIER4["TẦNG 4: AUTONOMOUS BBNT & PAYMENT CERTIFICATION"]
        P1["1-Click sinh Phiếu Yêu cầu Nghiệm thu (Inspection Request)"]
        P2["Tự động đính kèm Bảng tính Khối lượng Trích xuất từ CAD"]
        P3["Đẩy Khối lượng Đã Duyệt sang Kỳ Thanh toán (Payment Cert Item)"]
    end

    TIER1 --> TIER2
    TIER2 --> TIER3
    TIER3 --> TIER4
    TIER4 -.->|Cập nhật trạng thái Hoàn công (As-Built)| TIER1
```

---

## 3. Các Phương Trình Toán Học & Thuật Toán Cốt Lõi

### 3.1 Thuật toán Đo bóc Hình học Không gian CAD (5D Auto-QTO Formulation)

Đối với từng phân đoạn tuyến ống/máng cáp được chia thành Spool $S_i$:

1. **Khối lượng Ống gió ($m^2$ tôn):**
   $$\text{Area}(S_i) = 2 \times (W + H) \times L + A_{\text{flange}}$$
   _(Trong đó $W, H$ là kích thước tiết diện mm, $L$ là chiều dài polyline mm, $A_{\text{flange}}$ là diện tích bù bích nẹp TDC/C)._

2. **Khối lượng Đường ống Thép / PPR / HDPE ($m$ & $kg$):**
   $$\text{Length}(S_i) = \sum_{k=1}^{n-1} \sqrt{(x_{k+1}-x_k)^2 + (y_{k+1}-y_k)^2 + (z_{k+1}-z_k)^2}$$
   $$\text{Weight}(S_i) = \text{Length}(S_i) \times w_{\text{unit}}(\text{DN}, \text{SCH})$$

3. **Khối lượng Dây & Cáp Điện ($m$):**
   $$\text{Cable Length}(S_i) = (\text{Length}_{\text{tray}} + \Delta h_{\text{drop}} + L_{\text{spare}}) \times K_{\text{sag}}$$
   _(Trong đó $\Delta h_{\text{drop}}$ là chiều cao uốn xuống tủ điện, $L_{\text{spare}}$ là đoạn chờ đấu nối, $K_{\text{sag}} = 1.03$ là hệ số võng cáp)._

---

### 3.2 Ma trận Đối soát Khối lượng 3 Chiều (3-Way Variance Matrix)

| Chỉ số                          |        Ký hiệu         | Ý nghĩa Kỹ thuật                                              | Nguồn Dữ liệu            |
| :------------------------------ | :--------------------: | :------------------------------------------------------------ | :----------------------- |
| **Khối lượng Hợp đồng**         | $Q_{\text{Contract}}$  | Khối lượng gói thầu được ký ban đầu trong BOQ                 | `boq_items.qty_contract` |
| **Khối lượng Shopdrawing**      |   $Q_{\text{Shop}}$    | Khối lượng chi tiết bóc tách trực tiếp từ bản vẽ CAD đã duyệt | `cad_spools` sum         |
| **Khối lượng Thi công Thực tế** | $Q_{\text{Installed}}$ | Khối lượng đã lắp ráp tại công trường qua Visual Pinning      | `cad_spool_progress`     |
| **Khối lượng Nghiệm thu**       | $Q_{\text{Approved}}$  | Khối lượng đã được TVGS/CĐT ký xác nhận BBNT                  | `inspection_requests`    |

**Các phương trình phân tích sai lệch (Variance Equations):**

1. **Sai lệch Thiết kế / Phát sinh Hợp đồng ($\Delta_{\text{VO}}$):**
   $$\Delta_{\text{VO}} = Q_{\text{Shop}} - Q_{\text{Contract}}$$
   _Khi $\Delta_{\text{VO}} > 0$: Hệ thống tự động kích hoạt Đề xuất Thay đổi Thiết kế (Variation Order Proposal)._

2. **Hao hụt / Thất thoát Hiện trường ($\Delta_{\text{Loss}}$):**
   $$\Delta_{\text{Loss}} = Q_{\text{Issued}} - Q_{\text{Installed}}$$
   _(Trong đó $Q_{\text{Issued}}$ là lượng vật tư đã xuất kho. So sánh với định mức cho phép $\alpha_{\text{norm}}$ để phát hiện lãng phí)._

3. **Giá trị Khối lượng Đã Đạt (Earned Value Physical QTO - $EV_{\text{qty}}$):**
   $$EV_{\text{qty}} = \sum_{i \in \text{Spools}} (Q_i \times \text{MilestoneWeight}(\text{Status}_i))$$
   _Với bảng trọng số mốc:_
   - `Fabricated` (Đã gia công): $20\%$
   - `Delivered` (Đã giao hàng công trường): $40\%$
   - `Installed` (Đã lắp đặt hoàn chỉnh): $75\%$
   - `QC_Passed` (KCS nội bộ đạt): $90\%$
   - `BBNT_Approved` (CĐT ký BBNT): $100\%$

---

### 3.3 Chu trình Nghiệm thu Tự động (Autonomous BBNT Generation Protocol)

Khi một khu vực (Zone / Floor) có $100\%$ các Spool đạt trạng thái `QC_Passed`:

1. Thuật toán tự động gom nhóm danh sách các Spool thuộc cùng hệ thống.
2. Sinh bản ghi `inspection_requests` và liên kết với các `tasks` liên quan.
3. Xuất bảng tổng hợp khối lượng nghiệm thu (QTO Inspection Annex) kèm mã QR tra cứu tọa độ trực tiếp trên bản vẽ CAD.
4. Sau khi TVGS duyệt `BBNT_Approved`, trạng thái của các Spool trên bản vẽ CAD tự động đổi sang màu Xanh lục và mở khóa cho phép lập Hồ sơ Thanh toán (`payment_cert_items`).

---

## 4. Kết luận Nghiên cứu & Định hướng Triển khai

Nghiên cứu này khẳng định việc tích hợp **CAD $\times$ Khối lượng $\times$ Tracking** là bước ngoặt quyết định đưa XBoss từ hệ thống quản lý tác vụ thông thường trở thành **Hệ điều hành Kỹ thuật Số Toàn diện (Cognitive Engineering OS)**.

Mọi nội dung nghiên cứu trên đã được chuẩn hóa thành tài liệu **Đặc tả Kỹ thuật M66 (Closed-Loop CAD-QTO-Tracking Engine)** sẵn sàng triển khai thành các Slices:

- **CQT-1:** CAD Spooling & Spatial Entity Graph DDL (`migrations/0100_cad_qto_tracking.sql`).
- **CQT-2:** Core Engine Library & 3-Way Variance Calculator (`lib/engineering-cad-qto.ts`).
- **CQT-3:** 5 REST APIs & Visual CAD Interactive Tracking Canvas (`/engineering/cad-tracking`).
