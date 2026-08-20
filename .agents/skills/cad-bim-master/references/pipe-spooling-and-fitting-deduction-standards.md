# CẨM NANG KỸ THUẬT: BÙ TRỪ DUNG SAI MỐI NỐI ĐƯỜNG ỐNG, CHIA ĐỐT SPOOL DfMA & BÓC TÁCH MICRO-BOM (PIPE SPOOLING & FITTING DEDUCTION STANDARDS)

Tài liệu này chuẩn hóa toàn bộ công thức toán học hình học, bảng tra cứu thông số phụ kiện từ các nhà sản xuất hàng đầu và quy trình bóc tách chi tiết chế tạo xưởng (Off-site Prefabrication DfMA LOD 400) cho kỹ sư cơ điện MEPF trong hệ thống XBoss.

---

## 1. CƠ SỞ TOÁN HỌC & HÌNH HỌC TÍNH CHIỀU DÀI CẮT THỰC TẾ ($L_{\text{cut}}$)

### 1.1 Khái Niệm Cốt Lõi

- **Khoảng cách Tâm - Tâm ($L_{\text{center-to-center}}$ / $L_{\text{c-to-c}}$):** Chiều dài đoạn tim ống nối giữa hai giao điểm (Nodes/Vertices) trên mô hình 3D hoặc bản vẽ mặt bằng/trục đo Shopdrawing.
- **Kích thước Tâm - Mép Phụ Kiện ($A$ hoặc $C$ - Center-to-Face / Center-to-End):** Khoảng cách từ tâm góc bẻ của cút/tê đến mặt phẳng mút ngoài của phụ kiện.
- **Chiều Sâu Ngập Ống / Chiều Dài Ăn Khớp ($D_{\text{insert}}$ / $L_{\text{makeup}}$ / $E$):** Chiều dài đoạn đầu ống lồng ngập vào bên trong lòng phụ kiện (Socket Depth đối với mối nối dán keo/hàn nhiệt, hoặc Thread Makeup đối với mối nối ren).
- **Lượng Bù Trừ Kỹ Thuật Đầu Mối Nối ($\Delta L_i$ - Net Take-Off / Fitting Deduction):**
  $$\Delta L_i = \text{CenterToFace}_i - \text{EngagementDepth}_i + \text{GasketGap}_i + \text{WeldGap}_i$$
- **Công Thức Tổng Quát Xác Định Chiều Dài Cắt Ống ($L_{\text{cut}}$):**
  $$L_{\text{cut}} = L_{\text{center-to-center}} - \Delta L_1 - \Delta L_2 + \Delta L_{\text{field\_fit}}$$

```
                      Center-to-Center Length (L_c-to-c)
|<------------------------------------------------------------------------->|
+---------------+                                           +---------------+
|  Fitting 1    |================= Cut Pipe ===============|   Fitting 2   |
| (Elbow/Tee)   |                  (L_cut)                  |  (Elbow/Tee)  |
+---------------+                                           +---------------+
|<-- C2F_1 ---->|                                           |<--- C2F_2 --->|
      |<-- D_1 >|                                                 |<-- D_2 >|
      |<- ΔL_1 >|                                                 |<- ΔL_2 >|
```

---

## 2. BẢNG THÔNG SỐ TRA CỨU DUNG SAI MỐI NỐI THEO HỆ VẬT LIỆU

### 2.1 Ống Nhựa uPVC / cPVC Dán Keo (TCVN 8491 / ISO 1452 / ASTM D2467)

_(Áp dụng cho Tiền Phong, Bình Minh, Đệ Nhất, Siêu Thành)_

| Cỡ danh nghĩa (DN/OD) | Center-to-Face Cút 90° ($A$ mm) | Center-to-Face Tê đều ($A$ mm) | Độ sâu ngập Socket ($D_{\text{insert}}$ mm) | Gờ chặn Măng xông ($t_{\text{stop}}$ mm) | Lượng trừ Cút 90° ($\Delta L$ mm) | Keo dán định mức ($g$/mối nối) |
| :-------------------- | :------------------------------ | :----------------------------- | :------------------------------------------ | :--------------------------------------- | :-------------------------------- | :----------------------------- |
| **DN21 (OD 21)**      | 28.0                            | 28.0                           | 16.0                                        | 2.0                                      | **12.0**                          | 3.0                            |
| **DN27 (OD 27)**      | 34.0                            | 34.0                           | 19.0                                        | 2.0                                      | **15.0**                          | 4.5                            |
| **DN34 (OD 34)**      | 42.0                            | 42.0                           | 23.0                                        | 2.5                                      | **19.0**                          | 6.0                            |
| **DN42 (OD 42)**      | 50.0                            | 50.0                           | 27.0                                        | 2.5                                      | **23.0**                          | 8.0                            |
| **DN49 (OD 49)**      | 58.0                            | 58.0                           | 31.0                                        | 3.0                                      | **27.0**                          | 12.0                           |
| **DN60 (OD 60)**      | 69.0                            | 69.0                           | 37.0                                        | 3.0                                      | **32.0**                          | 18.0                           |
| **DN90 (OD 90)**      | 98.0                            | 98.0                           | 51.0                                        | 4.0                                      | **47.0**                          | 35.0                           |
| **DN114 (OD 114)**    | 122.0                           | 122.0                          | 64.0                                        | 4.0                                      | **58.0**                          | 55.0                           |
| **DN140 (OD 140)**    | 148.0                           | 148.0                          | 76.0                                        | 5.0                                      | **72.0**                          | 80.0                           |
| **DN168 (OD 168)**    | 176.0                           | 176.0                          | 89.0                                        | 5.0                                      | **87.0**                          | 120.0                          |
| **DN220 (OD 220)**    | 230.0                           | 230.0                          | 115.0                                       | 6.0                                      | **115.0**                         | 200.0                          |

> [!WARNING]
> **Đặc Trị Lỗi Măng Xông Nối Thẳng (Coupling Stop Trap):**
> Chiều dài tổng của măng xông $L_{\text{coupling}} = 2 \times D_{\text{insert}} + t_{\text{stop}}$.
> Khi chèn 1 măng xông vào giữa đoạn ống thẳng liên tục, khoảng hở kỹ thuật bị mất đi giữa 2 đầu ống chính bằng $t_{\text{stop}}$ ($2 - 4\text{mm}$).
>
> - Chiều dài cắt ống 1: $L_{\text{cut1}} = L_{\text{segment1}} - (t_{\text{stop}} / 2)$.
> - Chiều dài cắt ống 2: $L_{\text{cut2}} = L_{\text{segment2}} - (t_{\text{stop}} / 2)$.
>   Tuyệt đối không lấy $L_{\text{segment}} - L_{\text{coupling}}$ vì sẽ làm hụt ống nghiêm trọng!

---

### 2.2 Ống PPR / PB Hàn Nhiệt (DIN 8077/8078 / ISO 15874 / TCVN 10097)

_(Áp dụng cho Dekko, Dismy, Tiền Phong, Vesbo, Wavin)_

Nhiệt độ mối hàn tiêu chuẩn: $260^\circ\text{C} \pm 10^\circ\text{C}$.

| Cỡ danh nghĩa (DN) | Center-to-Face Cút 90° ($A$ mm) | Độ sâu ngập nung ($D_{\text{insert}}$ mm) | Thời gian nung (giây) | Thời gian ghép (giây) | Thời gian làm nguội (phút) | Lượng trừ Cút 90° ($\Delta L$ mm) |
| :----------------- | :------------------------------ | :---------------------------------------- | :-------------------- | :-------------------- | :------------------------- | :-------------------------------- |
| **DN20**           | 27.0                            | 14.0                                      | 5                     | 4                     | 2                          | **13.0**                          |
| **DN25**           | 32.0                            | 15.0                                      | 7                     | 4                     | 2                          | **17.0**                          |
| **DN32**           | 38.0                            | 16.5                                      | 8                     | 6                     | 4                          | **21.5**                          |
| **DN40**           | 45.0                            | 18.0                                      | 12                    | 6                     | 4                          | **27.0**                          |
| **DN50**           | 54.0                            | 20.0                                      | 18                    | 6                     | 4                          | **34.0**                          |
| **DN63**           | 67.0                            | 24.0                                      | 24                    | 8                     | 6                          | **43.0**                          |
| **DN75**           | 78.0                            | 26.0                                      | 30                    | 8                     | 8                          | **52.0**                          |
| **DN90**           | 93.0                            | 29.0                                      | 40                    | 10                    | 8                          | **64.0**                          |
| **DN110**          | 113.0                           | 32.5                                      | 50                    | 10                    | 8                          | **80.5**                          |
| **DN160**          | 162.0                           | 40.0                                      | 90                    | 15                    | 10                         | **122.0**                         |

---

### 2.3 Ống Thép Mạ Kẽm / Inox Nối Ren (BS 1387 / ASTM A53 / ASME B1.20.1 / ISO 7-1)

_(Áp dụng cho SeAH, Hòa Phát, VinaPipe, Minh Ngọc, phụ kiện gang dẻo Mech / Siam)_

| Cỡ danh nghĩa (DN/Inch) | Center-to-Face Cút 90° ($A$ mm) | Chiều dài ren ăn khớp ($L_{\text{makeup}}$ mm) | Số vòng bước ren (TPI) | Lượng trừ Cút 90° ($\Delta L$ mm) | Băng tan Teflon (vòng quấn) |
| :---------------------- | :------------------------------ | :--------------------------------------------- | :--------------------- | :-------------------------------- | :-------------------------- |
| **DN15 (1/2")**         | 28.0                            | 13.5                                           | 14                     | **14.5**                          | 5 - 7                       |
| **DN20 (3/4")**         | 33.0                            | 14.0                                           | 14                     | **19.0**                          | 6 - 8                       |
| **DN25 (1")**           | 38.0                            | 17.5                                           | 11.5                   | **20.5**                          | 7 - 9                       |
| **DN32 (1-1/4")**       | 45.0                            | 18.0                                           | 11.5                   | **27.0**                          | 8 - 10                      |
| **DN40 (1-1/2")**       | 50.0                            | 18.5                                           | 11.5                   | **31.5**                          | 9 - 12                      |
| **DN50 (2")**           | 58.0                            | 19.5                                           | 11.5                   | **38.5**                          | 10 - 14                     |
| **DN65 (2-1/2")**       | 69.0                            | 29.0                                           | 8                      | **40.0**                          | 12 - 16                     |
| **DN80 (3")**           | 78.0                            | 30.5                                           | 8                      | **47.5**                          | 14 - 18                     |
| **DN100 (4")**          | 97.0                            | 33.0                                           | 8                      | **64.0**                          | 16 - 22                     |

---

### 2.4 Khớp Nối Rãnh Cơ Khí Grooved (Victaulic / Shurjoint / AWWA C606)

_(Áp dụng cho Hệ Cứu Hỏa Sprinkler, Nước Làm Mát Chiller, Cấp Thoát Nước Trục Đứng)_

| Cỡ danh nghĩa (DN/OD) | Cút 90° Rãnh Center-to-End ($C$ mm) | Khe hở đầu ống cùm mềm ($G_{\text{flex}}$ mm) | Khe hở cùm cứng ($G_{\text{rigid}}$ mm) | Lượng trừ Cút 90° cùm cứng ($\Delta L$ mm) |
| :-------------------- | :---------------------------------- | :-------------------------------------------- | :-------------------------------------- | :----------------------------------------- |
| **DN50 (OD 60.3)**    | 83.0                                | 1.6                                           | 0.8                                     | **82.6**                                   |
| **DN65 (OD 76.1)**    | 95.0                                | 1.6                                           | 0.8                                     | **94.6**                                   |
| **DN80 (OD 88.9)**    | 108.0                               | 1.6                                           | 0.8                                     | **107.6**                                  |
| **DN100 (OD 114.3)**  | 127.0                               | 3.2                                           | 1.0                                     | **126.5**                                  |
| **DN125 (OD 141.3)**  | 140.0                               | 3.2                                           | 1.0                                     | **139.5**                                  |
| **DN150 (OD 168.3)**  | 165.0                               | 3.2                                           | 1.0                                     | **164.5**                                  |
| **DN200 (OD 219.1)**  | 216.0                               | 3.2                                           | 1.2                                     | **215.4**                                  |
| **DN250 (OD 273.0)**  | 267.0                               | 3.2                                           | 1.2                                     | **266.4**                                  |
| **DN300 (OD 323.9)**  | 305.0                               | 3.2                                           | 1.2                                     | **304.4**                                  |

---

### 2.5 Mối Nối Mặt Bích & Hàn Đối Đầu (Flanged & Butt-Weld ASME B16.9 / DIN EN 1092-1)

- **Mặt Bích Hàn Trượt (Slip-on Flange):** Chiều dày bích $T_{\text{flange}}$, ống đút xuyên vào bích và thụt vào $\delta \approx \text{Wall Thickness} + 3\text{mm}$.
- **Mặt Bích Cổ Hàn (Weld Neck Flange):** Chiều dài cổ bích $H_{\text{flange}}$, khe hở đáy hàn Root Gap $G_{\text{root}} = 2.0 - 3.0\text{mm}$.
- **Gioăng Làm Kín (Gasket):** Chiều dày gioăng nén $T_{\text{gasket}} = 2.0 - 3.0\text{mm}$ (EPDM / Non-asbestos / Spiral Wound).
- **Tính toán Chiều dài Bu Lông Bích ($L_{\text{bolt}}$):**
  $$L_{\text{bolt}} = 2 \times T_{\text{flange}} + T_{\text{gasket}} + H_{\text{nut}} + 2 \times T_{\text{washer}} + 3 \times P_{\text{pitch}}$$

---

## 3. NGUYÊN TẮC CHIA ĐỐT SPOOL TIỀN CHẾ XƯỞNG DfMA LOD 400

1. **Ràng Buộc Chiều Dài Gia Công ($L_{\text{spool}} \le 5800\text{mm}$):** Để lọt thùng xe tải $6\text{m}$, vừa thang cẩu tháp hoặc tời sàn.
2. **Ràng Buộc Khối Lượng Bê Tay ($W \le 50\text{kg}$):** Đảm bảo an toàn lao động cho 2 công nhân lắp đặt thủ công mà không cần xe nâng chuyên dụng.
3. **Ràng Buộc Không Gian Lắp Đặt:** Không quá 2-3 mối bẻ góc 3D trên cùng một đốt Spool để không bị kẹt khi luồn qua dầm và sàn.
4. **Vị Trí Mối Nối Hiện Trường (Field Joint Placement):**
   - Cách mép dầm/cột/tường tối thiểu $500\text{mm}$.
   - Tuyệt đối cấm đặt mối nối trong lòng lỗ mở xuyên dầm (Sleeve Opening) hoặc xuyên sàn bê tông.
   - Ưu tiên đặt mối nối ngay sát vị trí treo đỡ (Hanger) để gá lắp cố định tức thì.
5. **Đoạn Đóng Tuyến Tinh Chỉnh Hiện Trường (Field Fit Allowance / Pup Piece):**
   - Đốt Spool cuối cùng kết nối với thiết bị (Bơm, Chiller, Bồn nước, Trục đứng) được tự động gán thêm lượng bù dài:
     $$\Delta L_{\text{field\_fit}} = +50\text{mm} \text{ đến } +100\text{mm}$$
   - Trên bản vẽ và mã QR ghi chú rõ: _"Đoạn cắt tinh chỉnh tại chỗ sau khi định vị thiết bị"_.

---

## 4. QUY TRÌNH BÓC TÁCH MICRO-BOM 5 CẤP ĐỘ

```
[BOM CẤP 1: THÂN ỐNG CHÍNH] ──► Cắt phôi L_cut, vát mép, tiện ren, lăn rãnh
         │
[BOM CẤP 2: PHỤ KIỆN GẮN LIỀN] ─► Cút 90°, Cút 45°, Tê, Măng xông, Côn thu, Bích
         │
[BOM CẤP 3: VAN & THIẾT BỊ] ───► Van cổng, Van bướm, Van 1 chiều, Y lọc, Khớp mềm
         │
[BOM CẤP 4: LIÊN KẾT & PHỤ HAO] ─► Bu lông M16/M20, Gioăng EPDM, Que hàn, Keo dán PVC, Băng tan PTFE
         │
[BOM CẤP 5: GIÁ TREO & BẢO ÔN] ──► Ty ren M10/M12, Cùm Clevis, Nở sắt, Gối PU foam, Tem QR Logistics
```

---

## 5. THUẬT TOÁN TỐI ƯU CẮT PHÔI 1D KÈM KHO PHÔI THỪA (REMNANT POOL BFD)

1. **Đầu Vào:** Danh sách đoạn ống cần cắt $\{L_{\text{cut}, i}\}$, chiều dài cây nguyên $L_{\text{stock}} = 6000\text{mm}$, mạch cưa $W_{\text{kerf}} = 3\text{mm}$, đầu vát $L_{\text{trim}} = 20\text{mm}$, danh sách phôi thừa hiện có trong kho $\{L_{\text{remnant}, j}\}$.
2. **Chiến Lược Ưu Tiên Phôi Thừa (Remnant-First):**
   - Quét kho phôi thừa tìm thanh có chiều dài $L_{\text{remnant}}$ nhỏ nhất nhưng vẫn $\ge L_{\text{cut}} + W_{\text{kerf}}$.
   - Cắt các đoạn ngắn từ phôi thừa trước để giải phóng tồn kho.
3. **Chiến Lược Cắt Cây Nguyên (Best-Fit Decreasing):**
   - Với các đoạn còn lại, sắp xếp giảm dần theo $L_{\text{cut}}$.
   - Xếp vào cây phôi đang mở có khoảng trống còn lại nhỏ nhất.
4. **Phân Loại Đầu Mẩu Cuối Cùng:**
   - $L_{\text{scrap}} \ge 800\text{mm}$: Đóng mã Barcode **Remnant Stock** nhập kho lưu trữ.
   - $300\text{mm} \le L_{\text{scrap}} < 800\text{mm}$: Chuyển xưởng phụ tiện kép ren / đoạn nối ngắn.
   - $L_{\text{scrap}} < 300\text{mm}$: Phế liệu tái chế kim loại/nhựa (Tỷ lệ $< 1.2\%$).

---

## 6. QUY CHUẨN BÓC TÁCH KHỐI LƯỢNG PHÂN RÃ KHÔNG GIAN 6 CHIỀU (MULTI-DIMENSIONAL SPATIAL QTO)

Hệ thống XBoss tự động ánh xạ và phân rã toàn bộ khối lượng ống, phụ kiện và vật tư phụ theo 6 chiều không gian:

1. **Tháp / Khối Nhà (Tower / Block):** Tháp A, Tháp B, Khối Đế Podium, Tầng Hầm... $\rightarrow$ Phục vụ tổng mức đầu tư và kế hoạch mua sắm tổng.
2. **Tầng (Floor / Level):** Tầng Hầm B2, Tầng 1, ..., Tầng 30, Mái $\rightarrow$ Phục vụ phân bổ tiến độ theo mốc hoàn thành tầng (Floor Milestones).
3. **Trục Kỹ Thuật / Hộp Gen (Shaft / Riser):** Trục Cấp nước W-01, Thoát nước D-01, PCCC FP-01, Chiller CHW-01 $\rightarrow$ Phục vụ tổ đội chuyên lắp đặt trục đứng (Riser Crew).
4. **Phân Khu Thi Công (Zone / Work-Front):** Zone 1 Khu Căn hộ Đông, Zone 2 Khu Hành lang Lõi thang, Zone 3 Khu Dịch vụ $\rightarrow$ Bàn giao mặt bằng thi công (Work-Front Custody).
5. **Căn Hộ / Gian Phòng (Apartment / Unit / Room):** Căn A10.01, Căn B12.04, Penthouse, Phòng Điện, Bếp $\rightarrow$ Phục vụ gói đóng thùng **Apartment Kitting Crate** và nghiệm thu thanh toán từng căn.
6. **Tuyến Ống (Pipeline / Run Code):** Tuyến phân phối chính, tuyến nhánh cấp thiết bị, tuyến gom thoát nước... $\rightarrow$ Phục vụ thử áp cục bộ (Hydrostatic Pressure Test Segment).

### Phiếu Đóng Thùng Kitting Crate Căn Hộ (Apartment Kitting Manifest)

Mỗi căn hộ được xuất 1 thùng Kitting Box riêng có dán nhãn mã QR:

- **Mã Thùng:** `CRATE-[TOWER]-[FLOOR]-[UNIT]` (Ví dụ: `CRATE-TOWER_A-FL10-APT_A1001`).
- **Nội Dung Thùng:** Chứa trọn bộ các đốt Spool cắt sẵn, cút, tê, măng xông, van, bu lông, gioăng, keo dán định lượng và cùm treo của riêng căn hộ đó.
- Thợ chỉ việc xách thùng vào căn hộ lắp ghép theo mã Spool, triệt tiêu 100% việc lục tìm hoặc thiếu hụt phụ kiện!
