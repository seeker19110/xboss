---
name: commissioning-handover-master
description: "Quy chuẩn kỹ thuật chuyên sâu về thử nghiệm cân chỉnh (T&C), HVAC TAB, chạy thử liên động PCCC/BMS, nghiệm thu công trình theo Điều 24 Nghị định 06/2021/NĐ-CP, quyết toán vốn đầu tư và bàn giao hồ sơ số COBie / Digital Twin LOD 500 trong XBoss. Bắt buộc kích hoạt khi xử lý chạy thử hệ thống, nghiệm thu bàn giao hoặc quyết toán công trình."
---

# COMMISSIONING & HANDOVER MASTER — THỬ NGHIỆM LIÊN ĐỘNG, HOÀN CÔNG & BÀN GIAO COBie

Bộ Skill này đóng gói toàn bộ tri thức kỹ thuật thử nghiệm và nghiệm thu chạy thử hệ thống cơ điện (Commissioning T&C, HVAC Testing, Adjusting & Balancing theo NEBB/AABC/ASHRAE 202), tích hợp liên động PCCC/BMS, quy trình nghiệm thu cơ quan chuyên môn theo **Điều 24 Nghị định 06/2021/NĐ-CP**, quyết toán vốn đầu tư hoàn thành theo **Thông tư 96/2021/TT-BTC & Nghị định 99/2021/NĐ-CP**, và tiêu chuẩn bàn giao tài sản số **COBie / ISO 19650-3** cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC BẤT BIẾN (INVARIANTS)

1. **Bất biến Thử Nghiệm An Toàn Liên Động PCCC (PCCC Interlocking Safety Invariant):**
   - Trước khi đề nghị Cơ quan Cảnh sát PCCC kiểm tra nghiệm thu, $100\%$ các kịch bản liên động an toàn bắt buộc phải được thử nghiệm đạt $100\%$ và có biên bản xác nhận:
     $$\text{Tín hiệu Báo cháy} \longrightarrow \begin{cases} \text{Cắt toàn bộ tải điện không ưu tiên (Non-essential Power)} \\ \text{Kích hoạt quạt hút khói hành lang \& Quạt tăng áp cầu thang} \\ \text{Hạ toàn bộ thang máy về tầng thoát hiểm (Tầng 1) \& Mở cửa} \\ \text{Mở khóa toàn bộ cửa thoát hiểm từ tính (Mag-lock Access Control)} \\ \text{Phát âm thanh hướng dẫn sơ tán qua hệ thống PA/BGM} \end{cases}$$

2. **Bất biến Cân Bằng Khí Động Học HVAC (HVAC TAB Tolerance Invariant):**
   - Sai lệch lưu lượng gió thực tế ($Q_{\text{actual}}$) tại từng miệng gió so với lưu lượng thiết kế ($Q_{\text{design}}$) không được vượt quá dung sai chuẩn NEBB/ASHRAE:
     $$-10\% \le \frac{Q_{\text{actual}} - Q_{\text{design}}}{Q_{\text{design}}} \le +10\%$$

3. **Bất biến Khớp Quyết Toán Không Lệch Số (Zero-Discrepancy Final Settlement Invariant):**
   - Giá trị Quyết toán Hợp đồng A-B bắt buộc phải triệt tiêu hoàn toàn mọi sai lệch giữa khối lượng hoàn công thực tế $\text{QTO}_{\text{As-Built}}$ và giá trị đã thanh toán các kỳ IPC:
     $$\text{Giá trị Quyết toán A-B} = \text{Giá trị Hợp đồng Gốc} + \sum \text{VO Duyệt} \pm \text{Trượt giá Hợp lệ} - \sum \text{IPC Đã Thanh toán} - \text{Phạt/Giảm trừ}$$

4. **Bất biến Hộ Chiếu Dữ Liệu Bàn Giao COBie LOD 500 (COBie Handover Completeness Invariant):**
   - Toàn bộ thiết bị bàn giao sang Ban Quản lý Vận hành BMS/FM bắt buộc phải có đầy đủ 6 trường dữ liệu số:
     $$\text{Asset Passport} = \{\text{Asset Tag, Serial No, Model, Manufacturer, Warranty End Date, O\&M Manual Link}\}$$

---

## 2. QUY TRÌNH 5 BƯỚC THỬ NGHIỆM, HOÀN CÔNG & BÀN GIAO VẬN HÀNH

```
[B1: Chạy thử Đơn động & TAB] ──► [B2: Liên động PCCC & BMS] ──► [B3: Nghiệm thu Điều 24 NĐ 06] ──► [B4: Quyết toán Hợp đồng] ──► [B5: Bàn giao COBie LOD 500]
```

### Bước 1: Thử Nghiệm Từng Phần, Cân Chỉnh Hệ Thống (Pre-Commissioning & TAB)

- Kiểm tra cơ học, siết lực bu lông, đo cách điện cáp (Megger Test $\ge 10\text{ M}\Omega$).
- Thử áp lực thủy tĩnh đường ống nước (Hydrostatic Pressure Test tại $1.5 \times P_{\text{làm việc}}$ trong 2h).
- Thử độ kín khói ống gió (Duct Leakage Test theo DW143 / SMACNA).
- Cân chỉnh lưu lượng gió miệng gió và áp suất tĩnh hệ thống HVAC TAB (Testing, Adjusting, Balancing).

### Bước 2: Thử Nghiệm Chạy Thử Liên Động Tích Hợp Hệ Thống (Integrated System Testing - IST)

- Thử nghiệm chuyển đổi nguồn tự động máy phát điện dự phòng ATS trong vòng $\le 15$ giây khi mất điện lưới.
- Thử nghiệm ma trận kích hoạt liên động báo cháy PCCC (Fire Cause & Effect Matrix) theo QCVN 06:2022/BXD.
- Tích hợp giám sát tín hiệu vận hành về Trung tâm điều khiển tòa nhà BMS (Building Management System).

### Bước 3: Tổ Chức Nghiệm Thu Cơ Quan Quản Lý Nhà Nước (Regulatory Authorities Acceptance)

- Nghiệm thu cấp Giấy chứng nhận thẩm duyệt nghiệm thu PCCC (Cục Cảnh sát PCCC & CNCH).
- Nghiệm thu hoàn thành công trình bảo vệ môi trường (Sở Tài nguyên và Môi trường).
- Phục vụ Đoàn kiểm tra công tác nghiệm thu của Cơ quan Chuyên môn về Xây dựng (Sở Xây dựng / Cục Giám định - Bộ Xây dựng) theo Điều 24 Nghị định 06/2021/NĐ-CP để nhận **Văn bản chấp thuận kết quả nghiệm thu hoàn thành công trình**.

### Bước 4: Lập Hồ Sơ Quyết Toán Hợp Đồng Toàn Diện (Final Account & Audit)

- Đối soát khối lượng 3 chiều: $\Delta \text{QTO} = \text{QTO}_{\text{As-Built}} - \text{QTO}_{\text{BOQ}} - \text{QTO}_{\text{VO}}$.
- Lập Bảng xác định giá trị quyết toán hợp đồng A-B, hoàn trả tạm ứng, phát hành Bảo lãnh bảo hành (`insurance_bonds`) để giải tỏa tiền giữ lại (Retention Money).
- Tổng hợp Báo cáo quyết toán vốn đầu tư dự án hoàn thành theo mẫu Thông tư 96/2021/TT-BTC & Nghị định 99/2021/NĐ-CP.

### Bước 5: Bàn Giao Hộ Chiếu Số Bản Sao Số (Digital Twin Handover & Warranty Setup)

- Xuất bảng dữ liệu tài sản chuẩn COBie (Construction Operations Building Information Exchange) tích hợp mô hình 3D IFC.
- Bàn giao danh mục phụ tùng dự phòng (Spare Parts) và sổ tay hướng dẫn vận hành bảo trì (O&M Manuals).
- Kích hoạt cổng quản lý bảo hành (`/warranty`), theo dõi khiếu nại bảo hành (Warranty Claims) và bảo trì định kỳ.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] hvac-tab-and-pccc-interlocking-recipes

# CẨM NANG CÂN CHỈNH HVAC TAB & KỊCH BẢN LIÊN ĐỘNG BÁO CHÁY PCCC

## 1. QUY CHUẨN CÂN CHỈNH KHÍ ĐỘNG HỌC HVAC TAB (NEBB / ASHRAE 202)

Quy trình cân chỉnh lưu lượng gió miệng gió bằng giải thuật Tỷ Lệ Cân Bằng (Proportional Balancing Method):

$$R_i = \frac{Q_{\text{actual}, i}}{Q_{\text{design}, i}}$$

1. Đo đạc tất cả các miệng gió trên cùng một nhánh ống chính, xác định miệng gió có tỷ lệ thấp nhất $R_{\min} = \min(R_i)$.
2. Điều chỉnh van gió (OBD - Opposed Blade Damper) tại các miệng gió có tỷ lệ cao hơn để hạ dần về mức $R_{\min}$.
3. Điều chỉnh van gió tổng hoặc biến tần quạt (VFD) để nâng toàn bộ các miệng gió về dải dung sai cho phép:
   $$-10\% \le \frac{Q_{\text{final}} - Q_{\text{design}}}{Q_{\text{design}}} \le +10\%$$

---

## 2. MA TRẬN KÍCH HOẠT LIÊN ĐỘNG BÁO CHÁY PCCC (FIRE CAUSE & EFFECT MATRIX)

Theo QCVN 06:2022/BXD và TCVN 3890:2023, khi Trung tâm Báo cháy nhận tín hiệu kích hoạt từ $\ge 2$ đầu báo địa chỉ hoặc 1 nút ấn khẩn cấp:

| STT | Thiết bị / Hệ thống                        | Trạng thái Bình thường | Trạng thái khi có Cháy                              | Thời gian trễ tối đa |
| :-- | :----------------------------------------- | :--------------------- | :-------------------------------------------------- | :------------------- |
| 1   | Quạt cấp gió tươi điều hòa (AHU/FAU)       | Đang chạy              | **DỪNG NGAY LẬP TỨC**                               | $\le 3$ giây         |
| 2   | Van ngăn lửa cầu chì (FD/MFD)              | Mở                     | **ĐÓNG CHẶT** (ngăn lan truyền khói)                | $\le 5$ giây         |
| 3   | Quạt hút khói hành lang & tầng hầm         | Tắt                    | **KHỞI ĐỘNG CHẠY TỐC ĐỘ CAO**                       | $\le 15$ giây        |
| 4   | Quạt tăng áp buồng thang & giếng thang máy | Tắt                    | **KHỞI ĐỘNG (Duy trì áp suất $30 - 50\text{ Pa}$)** | $\le 15$ giây        |
| 5   | Thang máy chở khách                        | Hoạt động bình thường  | **HẠ VỀ TẦNG 1, MỞ CỬA, KHÓA SỬ DỤNG**              | $\le 30$ giây        |
| 6   | Cửa thoát hiểm Mag-lock                    | Khóa từ tính           | **CẮT ĐIỆN KHÓA, MỞ TỰ DO**                         | $\le 1$ giây         |
| 7   | Hệ thống âm thanh thông báo PA/BGM         | Phát nhạc / Tắt        | **ƯU TIÊN PHÁT BĂNG BÁO CHÁY TỰ ĐỘNG**              | $\le 5$ giây         |
| 8   | Bơm chữa cháy chính (Điện / Diesel)        | Chế độ Auto            | **TỰ ĐỘNG KHỞI ĐỘNG KHI TỤT ÁP**                    | $\le 10$ giây        |

---

### 3.2. [Cẩm nang kỹ thuật] nd06-decree24-and-cobie-handover

# CẨM NANG NGHIỆM THU ĐIỀU 24 NGHỊ ĐỊNH 06/2021/NĐ-CP & BÀN GIAO COBie LOD 500

## 1. QUY TRÌNH KIỂM TRA CÔNG TÁC NGHIỆM THU (ĐIỀU 24 NGHỊ ĐỊNH 06/2021/NĐ-CP)

Cơ quan chuyên môn về xây dựng (Sở Xây dựng / Cục Giám định - Bộ Xây dựng) kiểm tra công tác nghiệm thu của Chủ đầu tư theo 3 bước:

```
[B1: Nộp Báo cáo Hoàn thành] ──► [B2: Kiểm tra Hồ sơ & Hiện trường] ──► [B3: Cấp Văn bản Chấp thuận Nghiệm thu]
```

### Hồ sơ pháp lý bắt buộc:

1. Giấy phép xây dựng và hồ sơ thiết kế bản vẽ thi công đã được thẩm định/phê duyệt.
2. Văn bản chấp thuận kết quả nghiệm thu về PCCC của Cục Cảnh sát PCCC & CNCH.
3. Văn bản xác nhận hoàn thành công trình bảo vệ môi trường của Sở Tài nguyên và Môi trường.
4. Giấy chứng nhận kết quả kiểm định an toàn của các thiết bị có yêu cầu nghiêm ngặt (Thang máy, Cần trục).
5. Báo cáo hoàn thành thi công xây dựng của Chủ đầu tư và Tổng thầu.

---

## 2. CHUẨN DỮ LIỆU BÀN GIAO TÀI SẢN COBie LOD 500 SANG BMS/FM

Bảng ánh xạ các trường dữ liệu COBie (Construction Operations Building Information Exchange) tích hợp mô hình BIM IFC:

| COBie Sheet   | Trường thông tin (Field)                  | Nguồn dữ liệu XBoss                 | Ý nghĩa quản lý tài sản FM               |
| :------------ | :---------------------------------------- | :---------------------------------- | :--------------------------------------- |
| **Facility**  | Name, Category, Phase                     | `projects`                          | Định danh dự án, tòa nhà                 |
| **Floor**     | Name, Elevation                           | `towers`, `work_fronts`             | Cao độ tầng, phân khu                    |
| **Space**     | Name, RoomTag, Area                       | `work_fronts`                       | Phòng kỹ thuật, căn hộ                   |
| **Type**      | Name, Category, Manufacturer, ModelNumber | `materials`, `engineering_objects`  | Chủng loại thiết bị (Model AHU, Bơm)     |
| **Component** | Name, Space, SerialNumber, TagNumber      | `engineering_object_revisions`      | Cá thể thiết bị cụ thể gắn mã QR         |
| **Document**  | Name, Category, DocumentType, FileURL     | `om_documents`, `task_documents`    | Hướng dẫn O&M, Chứng chỉ CO/CQ           |
| **Warranty**  | GuarantorName, Duration, DurationUnit     | `warranty_items`, `insurance_bonds` | Thời hạn bảo hành, Nhà sản xuất bảo hành |

---
