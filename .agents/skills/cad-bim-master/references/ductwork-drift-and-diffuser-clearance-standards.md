# CẨM NANG KỸ THUẬT: ĐỘ DÀI DÔI TÍCH LŨY TUYẾN ỐNG GIÓ, CĂN CHỈNH TIM MIỆNG GIÓ & DUNG SAI GÓT HỘP GIÓ +10MM (DUCTWORK DRIFT & DIFFUSER CLEARANCE STANDARDS)

Tài liệu này chuẩn hóa toàn bộ công thức toán học hình học, dung sai lắp ráp hộp gió, độ dôi chiều dài do bích nối và phụ kiện, cùng thuật toán triệt tiêu độ trôi tim miệng gió theo hệ lưới trần kiến trúc (Reflected Ceiling Plan - RCP) theo tiêu chuẩn **SMACNA**, **DW/144** và **TCVN 5687:2010** cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC VÀNG: DUNG SAI GÓT HỘP GIÓ +10MM (THE +10MM PLENUM CLEARANCE RULE)

### 1.1 Khái Niệm & Bản Chất Vật Lý

- **Cổ Miệng Gió (Diffuser Neck Size - $W_{\text{neck}} \times H_{\text{neck}}$):** Kích thước phần thân nhôm định hình nhô lên để lọt vào hộp gió (ví dụ: $600\times 600\text{mm}$, $300\times 300\text{mm}$, $1200\times 150\text{mm}$).
- **Viền Mặt Miệng Gió (Diffuser Face Flange Overlap - $W_{\text{flange}}$):** Phần cánh viền nhôm nằm đè lên mặt trần thạch cao hoặc khung trần nhôm, có chiều rộng $20\text{mm} - 25\text{mm}$ mỗi mép.
- **Gót / Miệng Đón Hộp Gió (Plenum Box Bottom Opening / Boot - $W_{\text{plenum}} \times H_{\text{plenum}}$):** Phần đáy của hộp gió tôn tráng kẽm nơi cổ miệng gió đút vào.

### 1.2 Công Thức Tính Toán Kích Thước Hộp Gió Tiêu Chuẩn

Để triệt tiêu hoàn toàn hiện tượng kích kẹt tôn, móp méo hộp gió và xước sơn tĩnh điện khi lắp ráp:
$$W_{\text{plenum\_opening}} = W_{\text{diffuser\_neck}} + 10\text{mm} \quad (\text{tức } +5\text{mm} \text{ mỗi bên mép})$$
$$H_{\text{plenum\_opening}} = H_{\text{diffuser\_neck}} + 10\text{mm} \quad (\text{tức } +5\text{mm} \text{ mỗi bên mép})$$

- Đối với Miệng gió tròn (Round Diffuser):
  $$D_{\text{plenum\_collar}} = D_{\text{diffuser\_neck}} + 10\text{mm}$$
- Đối với Cổ trích nối ống mềm (Plenum Spigot / Collar):
  $$D_{\text{spigot\_outer}} = D_{\text{flexible\_duct}} - 5\text{mm} \quad (\text{để ống mềm lồng vào dễ dàng})$$

```
                   <---------- Plenum Box Opening = W_neck + 10mm ---------->
                   +-------------------------------------------------------+
                   |                     PLENUM BOX                        |
                   |                     (Tôn tráng kẽm)                   |
                   +-------+                                       +-------+
       Khe hở 5mm  |<-5mm->|                                       |<-5mm->|
                   |       +---------------------------------------+       |
                   |       |             DIFFUSER NECK             |       |
                   |       |             (W_neck)                  |       |
+==================+=======+=======================================+=======+==================+
|  Viền che 25mm   |       |             DIFFUSER FACE             |       |  Viền che 25mm   |
+==================+=======+=======================================+=======+==================+
|<----------------- Viền che 25mm che kín hoàn toàn khe hở 5mm ------------------------------->|
```

---

## 2. BẢNG DUNG SAI ĐỘ DÀI DÔI TÍCH LŨY TUYẾN ỐNG GIÓ (DUCTWORK LENGTH ACCUMULATION)

Khi ghép nối các phân đoạn ống gió trên một tuyến dài, các mối bích và thiết bị phụ trợ làm tăng chiều dài tuyến ống thực tế so với khoảng cách tim lý thuyết:

| STT | Loại Mối Nối / Phụ Kiện                             | Chiều Dày / Độ Dôi Chiều Dài ($\Delta L$)                                                       | Ghi Chú Kỹ Thuật                                                      |
| :-- | :-------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| 1   | **Bích tôn liền TDC / TDF**                         | $+3.0\text{mm} \dots +3.5\text{mm}$ / mối nối                                                   | Bao gồm chiều dày 2 mép gập tôn + gioăng xốp PE/cao su nén            |
| 2   | **Bích thép V (Angle Iron Flange L30/L40)**         | $+6.0\text{mm} \dots +7.0\text{mm}$ / mối nối                                                   | Chiều dày thép $2 \times 3\text{mm}$ + gioăng đệm amiang $3\text{mm}$ |
| 3   | **Nẹp C (C-cleat / Drive Slip)**                    | $+2.0\text{mm} \dots +2.5\text{mm}$ / mối nối                                                   | Mép gấp nẹp tôn mỏng                                                  |
| 4   | **Khớp nối mềm Canvas / Simili**                    | $+120.0\text{mm} \dots +150.0\text{mm}$ (tĩnh)<br>$+15.0\text{mm}$ (dãn dài động khi có áp lực) | Tiêu âm và chống rung đầu ra AHU/FCU                                  |
| 5   | **Van điều chỉnh lưu lượng gió (VCD / OBD)**        | $+180.0\text{mm} \dots +210.0\text{mm}$                                                         | Thân van dạng cánh gạt gắn bích                                       |
| 6   | **Van dập lửa chống cháy (Fire Damper - FD / MFD)** | $+300.0\text{mm} \dots +400.0\text{mm}$                                                         | Thân vỏ áo thép dày $1.2 - 1.5\text{mm}$ xuyên tường                  |
| 7   | **Hộp điều lượng gió biến đổi (VAV Box)**           | $+600.0\text{mm} \dots +900.0\text{mm}$                                                         | Thân hộp VAV kèm tiêu âm và cảm biến lưu lượng                        |
| 8   | **Gót giày / Chân rẽ nhánh $45^\circ$ (Shoe Tap)**  | $+50.0\text{mm} \dots +100.0\text{mm}$                                                          | Đoạn vát khí động bẻ nhánh từ ống chính                               |

---

## 3. THUẬT TOÁN TRIỆT TIÊU ĐỘ TRÔI TIM MIỆNG GIÓ (DIFFUSER DRIFT CANCELLATION)

### 3.1 Bài Toán

Tuyến ống gió cấp từ AHU/FCU đi qua $N$ phân đoạn ống thẳng và các van gió. Tại các vị trí rẽ nhánh $k$, hộp gió kết nối với miệng gió tại vị trí tim trần mong muốn $P_{\text{target}}(x_k, y_k)$.

Nếu không bù trừ, vị trí nhánh rẽ thực tế bị đẩy lệch đi một khoảng:
$$\Delta L_{\text{accumulated}, k} = \sum_{i=1}^{k} \Delta L_{\text{joints}, i} + \sum \Delta L_{\text{accessories}, i}$$
Khiến tim miệng gió bị lệch khỏi ô trần: $\Delta x = \Delta L_{\text{accumulated}, k} \approx 30 - 60\text{mm}$.

### 3.2 Giải Thuật Tự Động Nắn Chiều Dài Ống Thẳng

Hệ thống XBoss tự động điều chỉnh chiều dài cắt của đoạn ống thẳng nằm ngay trước vị trí rẽ nhánh:
$$L_{\text{straight\_cut}, k} = L_{\text{straight\_nominal}, k} - \Delta L_{\text{accumulated}, k}$$
Kết quả:

- Vị trí chân rẽ nhánh trùng khớp $100\%$ với tim ô trần kiến trúc ($600\times 600\text{mm}$).
- Không xảy ra hiện tượng ống mềm bị uốn vặn chéo hoặc miệng gió bị lệch mép trần!

---

## 4. QUY CHUẨN ĐỘ CHÙNG & UỐN CONG ỐNG GIÓ MỀM (FLEXIBLE DUCT SAG FACTOR)

- Chiều dài ống mềm nhôm bọc bông thủy tinh cách nhiệt:
  $$L_{\text{flex\_cut}} = L_{\text{direct\_distance}} \times (1 + k_{\text{sag}})$$
  Trong đó $k_{\text{sag}} = 0.10 \dots 0.15$ ($+10\% - 15\%$ chiều dài bù uốn cong).
- Giới hạn chiều dài: $L_{\text{flex}} \le 1.5\text{m} - 2.0\text{m}$ (theo SMACNA / TCVN 5687:2010).
- Bán kính uốn cong tối thiểu: $R_{\text{bend}} \ge 1.5 \times D_{\text{flex}}$ để tránh bẹp gập và sụt áp khí động học.
