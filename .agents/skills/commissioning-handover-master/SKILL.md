---
name: commissioning-handover-master
description: "Quy chuẩn kỹ thuật chuyên sâu về thử nghiệm cân chỉnh (T&C), HVAC TAB, chạy thử liên động PCCC/BMS, nghiệm thu công trình theo Điều 24 Nghị định 06/2021/NĐ-CP, quyết toán vốn đầu tư và bàn giao hồ sơ số COBie / Digital Twin LOD 500 trong XBoss. Bắt buộc kích hoạt khi xử lý chạy thử hệ thống, nghiệm thu bàn giao hoặc quyết toán công trình."
---

# COMMISSIONING & HANDOVER MASTER — THỬ NGHIỆM LIÊN ĐỘNG, HOÀN CÔNG & BÀN GIAO COBie ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức kỹ thuật thử nghiệm và nghiệm thu chạy thử hệ thống cơ điện (Commissioning T&C, HVAC Testing, Adjusting & Balancing theo NEBB/AABC/ASHRAE 202), tích hợp liên động PCCC/BMS, quy trình nghiệm thu cơ quan chuyên môn theo **Điều 24 Nghị định 06/2021/NĐ-CP**, quyết toán vốn đầu tư hoàn thành theo **Thông tư 96/2021/TT-BTC & Nghị định 99/2021/NĐ-CP**, và tiêu chuẩn bàn giao tài sản số **COBie / ISO 19650-3** cho nền tảng XBoss.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Bất biến Thử Nghiệm An Toàn Liên Động 10 Phân Hệ PCCC (PCCC Interlocking Safety Invariant):**
   - Trước khi đề nghị Cơ quan Cảnh sát PCCC kiểm tra nghiệm thu, $100\%$ các kịch bản liên động an toàn bắt buộc phải được thử nghiệm đạt $100\%$ và có biên bản xác nhận:
     $$\text{Tín hiệu Báo cháy} \longrightarrow \begin{cases} \text{Dừng quạt cấp gió tươi AHU/FAU trong } \le 3\text{ giây} \\ \text{Đóng van ngăn lửa MFD trong } \le 5\text{ giây} \\ \text{Kích hoạt quạt hút khói \& Tăng áp buồng thang } (30-50\text{ Pa}) \text{ trong } \le 15\text{ giây} \\ \text{Hạ thang máy về tầng 1 \& Mở cửa trong } \le 30\text{ giây} \\ \text{Mở khóa toàn bộ cửa thoát hiểm từ tính Mag-lock trong } \le 1\text{ giây} \\ \text{Phát âm thanh hướng dẫn sơ tán PA/BGM trong } \le 5\text{ giây} \\ \text{Khởi động máy phát điện dự phòng ATS trong } \le 15\text{ giây} \end{cases}$$

2. **Bất biến Cân Bằng Khí Động Học HVAC TAB Dung Sai $\pm 10\%$ (HVAC TAB Tolerance Invariant):**
   - Sai lệch lưu lượng gió thực tế ($Q_{\text{actual}}$) tại từng miệng gió so với lưu lượng thiết kế ($Q_{\text{design}}$) không được vượt quá dung sai chuẩn NEBB/ASHRAE:
     $$-10\% \le \frac{Q_{\text{actual}} - Q_{\text{design}}}{Q_{\text{design}}} \le +10\%$$

3. **Bất biến Khớp Quyết Toán Không Lệch Số (Zero-Discrepancy Final Settlement Invariant):**
   - Giá trị Quyết toán Hợp đồng A-B bắt buộc phải triệt tiêu hoàn toàn mọi sai lệch giữa khối lượng hoàn công thực tế $\text{QTO}_{\text{As-Built}}$ và giá trị đã thanh toán các kỳ IPC:
     $$\text{Giá trị Quyết toán A-B} = \text{Giá trị Hợp đồng Gốc} + \sum \text{VO Duyệt} \pm \text{Trượt giá Hợp lệ} - \sum \text{IPC Đã Thanh toán} - \text{Phạt/Giảm trừ}$$

4. **Bất biến Hộ Chiếu Dữ Liệu Bàn Giao COBie LOD 500 (COBie Handover Completeness Invariant):**
   - Toàn bộ thiết bị bàn giao sang Ban Quản lý Vận hành BMS/FM bắt buộc phải có đầy đủ 6 trường dữ liệu số:
     $$\text{Asset Passport} = \{\text{Asset Tag, Serial No, Model, Manufacturer, Warranty End Date, O\&M Manual Link}\}$$

5. **Bất biến Thử Áp Lực Thủy Tĩnh 2 Giờ (Hydrostatic Pressure Test Invariant):**
   - Thử nghiệm áp lực đường ống nước (Cấp nước, PCCC, Chiller) phải duy trì ở mức $1.5 \times P_{\text{làm việc}}$ trong tối thiểu **2 giờ liên tục**, độ sụt áp $\Delta P \le 0.02\text{ MPa}$ ($0.2\text{ bar}$) và có biểu đồ áp kế điện tử IoT ghi nhận tự động.

6. **Bất biến Độ Kín Khói Tuyến Ống Gió Theo Chuẩn DW143 (Duct Leakage Rate Invariant):**
   - Tỷ lệ rò rỉ khí cho phép của tuyến ống gió không được vượt quá giới hạn theo cấp áp suất:
     $$Q_{\text{leakage, max}} = C \times P^{0.65} \text{ (l/s/m}^2\text{ diện tích bề mặt ống)}$$
     _(với Class A: $C = 0.027$; Class B: $C = 0.009$; Class C: $C = 0.003$)._

7. **Bất biến Thời Gian Chuyển Đổi Nguồn Dự Phòng ATS $\le 15$ Giây (ATS Transfer Invariant):**
   - Khi cắt điện lưới trung thế đột ngột, hệ thống Tủ chuyển nguồn tự động ATS bắt buộc phải ra lệnh đề nổ Máy phát điện dự phòng, ổn định điện áp/tần số và đóng điện cho tải ưu tiên trong vòng $\le 15$ giây.

8. **Bất biến Hồ Sơ Pháp Lý Nghiệm Thu Điều 24 NĐ 06/2021/NĐ-CP (5 Mandatory Clearances):**
   - Không được phép đề nghị Cơ quan Chuyên môn về Xây dựng (Sở Xây dựng / Cục Giám định) kiểm tra nghiệm thu nếu thiếu 1 trong 5 văn bản chấp thuận: (1) Văn bản PCCC, (2) Giấy phép Môi trường, (3) Tem kiểm định Thang máy/Vận thăng, (4) Đấu nối hạ tầng Điện/Nước, (5) Báo cáo hoàn thành của CĐT & Tổng thầu.

9. **Bất biến Niêm Phong Mật Mã Bản Sao Số Sống (Living Digital Twin Hash Invariant):**
   - Toàn bộ hồ sơ hoàn công số, bản vẽ As-Built DWG/PDF, biên bản T&C và mã QR tài sản thiết bị được đóng gói bằng mã băm SHA-256 vào Gốc Merkle Root của dự án trước khi bàn giao quyền kiểm soát (Admin Handover) cho Ban Quản trị Tòa nhà.

10. **Bất biến Thời Hạn Trách Nhiệm Bảo Hành 24 Tháng (DLP Tracking Invariant):**
    - Hệ thống tự động kích hoạt Cổng Quản lý Bảo hành (`/warranty`) với thời gian đếm ngược 24 tháng (DLP), tự động nhắc nhở lịch bảo trì định kỳ O&M 3/6/12 tháng cho từng chủng loại thiết bị.

---

## 2. QUY TRÌNH 10 BƯỚC KHÉP KÍN THỬ NGHIỆM, HOÀN CÔNG & BÀN GIAO VẬN HÀNH

```
[B1: Pre-Commissioning Cơ học] ──► [B2: Thử Áp Thủy Tĩnh & Kín Ống Gió] ──► [B3: HVAC TAB Cân Bằng Gió/Nước] ──► [B4: Thử Đơn Động Thiết Bị]
                                                                                                                        │
                                                                                                                        ▼
[B8: Quyết toán A-B & Vốn TT 96] ◄── [B7: Nghiệm thu Cơ quan Đ24 NĐ06] ◄── [B6: Tích hợp BMS & IoT] ◄── [B5: Chạy Thử Liên Động IST]
        │
        ▼
[B9: Bàn giao Hộ chiếu COBie LOD 500] ──► [B10: Kích hoạt Bảo hành DLP 24 Tháng]
```

### Bước 1: Kiểm Tra Tiền Chạy Thử Cơ Học & Điện (Pre-Commissioning Checks)

- Kiểm tra chiều quay động cơ, siết lực bu lông mặt bích, đo điện trở cách điện Megger tuyến cáp ($\ge 10\text{ M}\Omega$).

### Bước 2: Thử Nghiệm Áp Lực Thủy Tĩnh & Thử Độ Kín Ống Gió

- Thử áp đường ống $1.5 \times P_{\text{lv}}$ trong 2 giờ; thử kín ống gió theo tiêu chuẩn DW143 bằng máy tạo khói áp suất.

### Bước 3: Cân Chỉnh Khí Động Học HVAC TAB (Testing, Adjusting & Balancing)

- Áp dụng giải thuật Tỷ Lệ Cân Bằng (Proportional Method) căn chỉnh lưu lượng từng miệng gió về dải $-10\% \le \Delta Q \le +10\%$.

### Bước 4: Chạy Thử Đơn Động Thiết Bị Có Tải & Không Tải (Individual Equipment Run)

- Chạy thử 8h liên tục cho Chiller, Bơm, Quạt hút khói, Máy phát điện; đo độ rung chấn (Vibration $\text{mm/s}$) và nhiệt độ ổ bi.

### Bước 5: Chạy Thử Liên Động Toàn Hệ Thống Tích Hợp (Integrated System Testing - IST)

- Thử nghiệm ma trận kích hoạt liên động báo cháy PCCC (Fire Cause & Effect) trên 10 phân hệ an toàn tòa nhà.

### Bước 6: Tích Hợp Giám Sát & Điều Khiển Trung Tâm BMS

- Đồng bộ tín hiệu DDC, giao thức Modbus/BACnet về phòng điều khiển trung tâm BMS; kiểm tra độ trễ hiển thị đồ họa $\le 2$ giây.

### Bước 7: Tổ Chức Nghiệm Thu Cơ Quan Quản Lý Nhà Nước (Điều 24 NĐ 06/2021/NĐ-CP)

- Đón tiếp Đoàn kiểm tra Cảnh sát PCCC, Sở Tài nguyên Môi trường, Sở Xây dựng để nhận **Văn bản chấp thuận kết quả nghiệm thu hoàn thành công trình**.

### Bước 8: Quyết Toán Hợp Đồng A-B & Quyết Toán Vốn Đầu Tư (TT 96/2021 & NĐ 99/2021)

- Đối soát khối lượng 3 chiều $\Delta \text{QTO}$, hoàn trả tạm ứng, giải tỏa tiền giữ lại qua Thư bảo lãnh bảo hành, chốt công nợ dự án.

### Bước 9: Bàn Giao Hộ Chiếu Số Tài Sản COBie LOD 500 (Living Digital Twin Handover)

- Xuất dữ liệu tài sản chuẩn COBie tích hợp mô hình 3D IFC và mã QR dán trên từng thiết bị phục vụ Ban Quản lý Vận hành FM.

### Bước 10: Kích Hoạt Cổng Quản Lý Bảo Hành & Bảo Trì Định Kỳ DLP (24-Month Warranty Setup)

- Khởi tạo lịch trình bảo trì định kỳ 3/6/12 tháng, tiếp nhận và xử lý sự cố bảo hành (Warranty Tickets) trong suốt 24 tháng DLP.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] hvac-tab-and-pccc-interlocking-recipes

# CẨM NANG CÂN CHỈNH HVAC TAB & MA TRẬN LIÊN ĐỘNG BÁO CHÁY PCCC

## 1. GIẢI THUẬT CÂN BẰNG TỶ LỆ HVAC TAB (PROPORTIONAL BALANCING METHOD)

1. **Bước 1 — Đo Đạc Ban Đầu:** Mở $100\%$ van gió (OBD) và van nhánh. Đo lưu lượng thực tế $Q_{\text{actual}, i}$ tại tất cả $N$ miệng gió trên cùng một nhánh ống chính.
2. **Bước 2 — Tính Tỷ Số Lưu Lượng:**
   $$R_i = \frac{Q_{\text{actual}, i}}{Q_{\text{design}, i}}$$
3. **Bước 3 — Xác Định Miệng Gió Chuẩn (Index Terminal):** Miệng gió có tỷ số thấp nhất: $R_{\min} = \min(R_1, R_2, \dots, R_N)$.
4. **Bước 4 — Điều Chỉnh Từng Cặp Ngược Tuyến:** Điều chỉnh van gió tại miệng $i$ để tỷ số $R_i$ hạ dần về khớp với $R_{\min}$ (cho đến khi tất cả các miệng có tỷ số $R$ xấp xỉ bằng nhau).
5. **Bước 5 — Nâng Công Suất Quạt VFD:** Tăng tốc độ biến tần quạt hoặc điều chỉnh van tổng để đưa toàn bộ hệ thống về mức $R \approx 1.0$ (dung sai $\pm 10\%$).

---

## 2. MA TRẬN KÍCH HOẠT LIÊN ĐỘNG BÁO CHÁY PCCC (FIRE CAUSE & EFFECT MATRIX)

Theo QCVN 06:2022/BXD và TCVN 3890:2023, khi Trung tâm Báo cháy nhận tín hiệu kích hoạt từ $\ge 2$ đầu báo địa chỉ hoặc 1 nút ấn khẩn cấp:

| STT | Thiết bị / Hệ thống                        | Trạng thái Bình thường | Trạng thái khi có Cháy                         | Thời gian Đáp ứng Tối đa |
| :-: | :----------------------------------------- | :--------------------- | :--------------------------------------------- | :----------------------- |
|  1  | **Quạt cấp gió tươi điều hòa (AHU/FAU)**   | Đang chạy              | **DỪNG NGAY LẬP TỨC**                          | $\le 3$ giây             |
|  2  | **Van ngăn lửa cầu chì (FD/MFD)**          | Mở                     | **ĐÓNG CHẶT** (ngăn khói lan)                  | $\le 5$ giây             |
|  3  | **Quạt hút khói hành lang & tầng hầm**     | Tắt                    | **CHẠY TỐC ĐỘ CAO**                            | $\le 15$ giây            |
|  4  | **Quạt tăng áp buồng thang & giếng thang** | Tắt                    | **KHỞI ĐỘNG (Duy trì áp $30 - 50\text{ Pa}$)** | $\le 15$ giây            |
|  5  | **Thang máy chở khách**                    | Hoạt động bình thường  | **HẠ VỀ TẦNG 1, MỞ CỬA, KHÓA SỬ DỤNG**         | $\le 30$ giây            |
|  6  | **Cửa thoát hiểm Mag-lock**                | Khóa từ tính           | **CẮT ĐIỆN KHÓA, MỞ TỰ DO**                    | $\le 1$ giây             |
|  7  | **Hệ thống âm thanh thông báo PA/BGM**     | Phát nhạc / Tắt        | **ƯU TIÊN PHÁT BĂNG BÁO CHÁY TỰ ĐỘNG**         | $\le 5$ giây             |
|  8  | **Bơm chữa cháy chính (Điện / Diesel)**    | Chế độ Auto            | **TỰ ĐỘNG KHỞI ĐỘNG KHI TỤT ÁP**               | $\le 10$ giây            |
|  9  | **Máy phát điện dự phòng ATS**             | Chế độ Auto Standby    | **TỰ ĐỘNG ĐỀ NỔ KHI MẤT ĐIỆN LƯỚI**            | $\le 15$ giây            |
| 10  | **Đồ họa Cảnh báo BMS**                    | Giám sát bình thường   | **HIỂN THỊ POP-UP BÁO CHÁY TẦNG/PHÒNG**        | $\le 2$ giây             |

---

### 3.2. [Cẩm nang kỹ thuật] nd06-decree24-and-cobie-handover

# CẨM NANG NGHIỆM THU ĐIỀU 24 NGHỊ ĐỊNH 06/2021/NĐ-CP & LƯỢC ĐỒ COBie LOD 500

## 1. QUY TRÌNH KIỂM TRA CÔNG TÁC NGHIỆM THU (ĐIỀU 24 NGHỊ ĐỊNH 06/2021/NĐ-CP)

```
[Nộp Báo Cáo Hoàn Thành Xong] ──► [Kiểm Tra Hồ Sơ 15 Ngày] ──► [Kiểm Tra Thực Địa Hiện Trường] ──► [Cấp Văn Bản Chấp Thuận Hoàn Thành]
```

### 5 Văn bản pháp lý bắt buộc trong hồ sơ trình Sở Xây dựng:

1. Giấy phép xây dựng và hồ sơ thiết kế bản vẽ thi công đã được thẩm định/phê duyệt.
2. Văn bản chấp thuận kết quả nghiệm thu về PCCC của Cục Cảnh sát PCCC & CNCH.
3. Giấy phép môi trường / Văn bản xác nhận công trình bảo vệ môi trường của Sở Tài nguyên & Môi trường.
4. Giấy chứng nhận kiểm định an toàn của thiết bị nghiêm ngặt (Thang máy, Vận thăng, Bình áp lực).
5. Báo cáo hoàn thành thi công xây dựng công trình của Chủ đầu tư và Tổng thầu.

---

## 2. BẢNG ÁNH XẠ CHUẨN DỮ LIỆU TÀI SẢN COBie LOD 500 SANG BMS/FM

| COBie Sheet   | Trường Thông Tin (Field)                  | Nguồn Dữ Liệu XBoss                 | Ý Nghĩa Quản Lý Tài Sản FM               |
| :------------ | :---------------------------------------- | :---------------------------------- | :--------------------------------------- |
| **Facility**  | Name, Category, Phase                     | `projects`                          | Định danh dự án, tòa tháp                |
| **Floor**     | Name, Elevation                           | `towers`, `work_fronts`             | Cao độ tầng, phân khu                    |
| **Space**     | Name, RoomTag, Area                       | `work_fronts`                       | Phòng kỹ thuật, căn hộ                   |
| **Type**      | Name, Category, Manufacturer, ModelNumber | `materials`, `engineering_objects`  | Chủng loại thiết bị (Model AHU, Bơm)     |
| **Component** | Name, Space, SerialNumber, TagNumber      | `engineering_object_revisions`      | Cá thể thiết bị cụ thể gắn mã QR         |
| **Document**  | Name, Category, DocumentType, FileURL     | `om_documents`, `task_documents`    | Hướng dẫn O&M, Chứng chỉ CO/CQ           |
| **Warranty**  | GuarantorName, Duration, DurationUnit     | `warranty_items`, `insurance_bonds` | Thời hạn bảo hành, Nhà sản xuất bảo hành |

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/commissioning_calculator.ts](file:///c:/Users/liend/xboss/.agents/skills/commissioning-handover-master/scripts/commissioning_calculator.ts): Bộ kịch bản CLI kiểm chứng thuật toán cân bằng HVAC TAB tỷ lệ, xác thực ma trận liên động báo cháy PCCC 10 phân hệ và kiểm tra lược đồ COBie LOD 500.
