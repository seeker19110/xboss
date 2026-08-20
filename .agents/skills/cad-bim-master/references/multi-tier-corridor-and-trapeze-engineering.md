# QUY CHUẨN QUY HOẠCH HÀNH LANG KỸ THUẬT ĐA TẦNG & TÍNH TOÁN KẾT CẤU GIÁ ĐỠ TRAPEZE (MULTI-TIER CORRIDOR & TRAPEZE ENGINEERING)

Tài liệu này chuẩn hóa phương pháp quy hoạch ma trận cao độ hành lang kỹ thuật (Utility Corridor Stacking), khoảng cách cách ly an toàn điện - nhiệt và giải thuật tính toán tải trọng / ứng suất / độ võng của giá đỡ đa tầng Trapeze Hanger trong XBoss.

---

## 1. QUY TẮC PHÂN TẦNG KHÔNG GIAN DỌC (VERTICAL CLEARANCE STACKING)

Trong các hành lang chung cư, tầng hầm hoặc trục hành lang kỹ thuật có nhiều hệ thống đi chung:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [ĐÁY SÀN BÊ TÔNG] (Cao độ +3500mm)                                      │
├────────────────────────────────────────────────────────────────────────┤
│ [ĐÁY DẦM KẾT CẤU] (Cao độ +3100mm)                                     │
│  │                                                                     │
│  ▼ (Khoảng hở 50mm)                                                    │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ TẦNG 1 (TOP): Ống gió Cấp / Hồi / Hút khói Chống cháy PCCC        │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│  │                                                                     │
│  ▼ (Khoảng hở 150mm - Cách ly an toàn)                                │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ TẦNG 2 (MID): Máng Cáp Điện Động lực & Máng Cáp Điện Nhẹ (ELV)    │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│  │                                                                     │
│  ▼ (Khoảng hở 100mm)                                                   │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ TẦNG 3 (BOT): Ống Chiller, Cấp nước sinh hoạt & Thoát nước tự chảy │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│  │                                                                     │
│  ▼ (Khoảng cách trần 75 - 150mm)                                       │
│ ──── Ống nhánh Sprinkler & Đầu phun chữa cháy tự động ──────────────── │
├────────────────────────────────────────────────────────────────────────┤
│ [TRẦN THẠCH CAO HOÀN THIỆN] (Cao độ thông thủy +2600mm)                │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1. Nguyên Tắc Cách Ly An Toàn Bắt Buộc (Safety Invariants)

1. **Cách ly Điện - Nhiệt:** Thang máng cáp điện phải cách ống dẫn nhiệt / ống Chiller tối thiểu $150\text{mm}$. Tuyệt đối không cho phép cáp điện tiếp xúc trực tiếp với bề mặt vỏ bảo ôn ống lạnh để tránh ngưng tụ đọng sương làm hỏng cách điện.
2. **Cách ly Điện - Nước:** Máng cáp điện phải nằm ở tầng trên hoặc có khoảng cách ngang an toàn với ống nước. Nếu bắt buộc phải bố trí bên dưới ống nước, phải có tấm máng che chống rò rỉ (Drip Tray / Deflector).
3. **Độ dốc Thoát Nước:** Tuyến ống thoát nước thải/nước mưa tại Tier 3 phải giữ nguyên độ dốc $1.0\% - 2.0\%$, các ống cấp nước và máng cáp phải đi thẳng theo phương ngang.

---

## 2. CÔNG THỨC TOÁN HỌC TÍNH TOÁN KẾT CẤU GIÁ ĐỠ TRAPEZE

### 2.1. Xác Định Tải Trọng Tính Toán ($Q_{\text{factored}}$)

Tổng tải trọng phân bố trên 1 bộ giá đỡ Trapeze chịu tải $N$ hệ thống:

$$Q_{\text{service}} = \left( \sum_{i=1}^{n} q_i \right) \cdot S_{\text{hanger}} + q_{\text{strut}} \cdot L_{\text{span}}$$

- $q_i$: Trọng lượng đơn vị (kg/m) của hệ thứ $i$ (gồm ống/máng + trọng lượng nước/cáp đầy tải + vỏ bảo ôn cách nhiệt).
- $S_{\text{hanger}}$: Bước khoảng cách giữa 2 giá đỡ liền kề (thường $1.5\text{m} - 2.0\text{m}$).
- $q_{\text{strut}}$: Trọng lượng bản thân của thanh Unistrut ($2.7\text{kg/m}$ cho P1000).
- $L_{\text{span}}$: Khẩu độ nhịp thanh đỡ giữa 2 ty ren (m).

Tải trọng tính toán có xét hệ số độ tin cậy tải trọng $\gamma = 1.4$:

$$Q_{\text{factored}} = Q_{\text{service}} \cdot 9.81 \cdot 1.4 \quad (\text{N})$$

### 2.2. Kiểm Tra Ứng Suất Uốn Thanh Đỡ Unistrut ($\sigma_{\text{bending}}$)

Coi thanh Unistrut như dầm đơn giản 2 đầu gối tựa (tại vị trí 2 ty treo), chịu tải trọng phân bố đều:

$$M_{\max} = \frac{Q_{\text{factored}} \cdot L_{\text{span}}}{8} \quad (\text{N}\cdot\text{mm})$$

$$\sigma_{\text{actual}} = \frac{M_{\max}}{W_x \cdot 1000} \le [\sigma_{\text{allow}}] = 160.0 \quad (\text{MPa})$$

_(Trong đó $W_x$ là mô-men kháng uốn của tiết diện Unistrut tính bằng $\text{cm}^3$)._

### 2.3. Kiểm Tra Độ Võng Đàn Hồi ($f_{\max}$)

Độ võng được kiểm tra dưới tải trọng tiêu chuẩn phục vụ (không nhân hệ số 1.4):

$$f_{\max} = \frac{5 \cdot (Q_{\text{service}} \cdot 9.81) \cdot L_{\text{span}}^3}{384 \cdot E \cdot (I_x \cdot 10000)} \le [f_{\text{allow}}] = \frac{L_{\text{span}}}{360} \quad (\text{mm})$$

- $E = 210,000\text{ MPa}$ (Mô-đun đàn hồi thép carbon).
- $I_x$: Mô-men quán tính tiết diện ($\text{cm}^4$).

### 2.4. Tính Toán Lựa Chọn Ty Ren Treo Trần (Threaded Rods)

Mỗi bên ty ren chịu $50\%$ tổng tải trọng phân bố:

$$P_{\text{rod}} = \frac{Q_{\text{factored}}}{2} \quad (\text{N})$$

$$\sigma_{\text{rod}} = \frac{P_{\text{rod}}}{A_{\text{root}}} \le [\sigma_{\text{rod, allow}}] = 100.0\text{ MPa}$$

| Kích thước Ty | Đường kính $D$ (mm) | Diện tích đáy ren $A_{\text{root}}$ ($\text{mm}^2$) | Tải trọng an toàn tối đa (N) |
| :-----------: | :-----------------: | :-------------------------------------------------: | :--------------------------: |
|    **M8**     |    $8\text{ mm}$    |                 $36.6\text{ mm}^2$                  |       $3,660\text{ N}$       |
|    **M10**    |   $10\text{ mm}$    |                 $58.0\text{ mm}^2$                  |       $5,800\text{ N}$       |
|    **M12**    |   $12\text{ mm}$    |                 $84.3\text{ mm}^2$                  |       $8,430\text{ N}$       |
|    **M16**    |   $16\text{ mm}$    |                 $157.0\text{ mm}^2$                 |      $15,700\text{ N}$       |
