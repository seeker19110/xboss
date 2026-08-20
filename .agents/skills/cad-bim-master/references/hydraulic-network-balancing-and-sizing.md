# CẨM NANG CÂN BẰNG THỦY LỰC MẠNG LƯỚI & TỰ ĐỘNG CHỌN TIẾT DIỆN (HYDRAULIC NETWORK BALANCING & AUTO-SIZING)

Tài liệu cung cấp cơ sở toán học và giải thuật tự động tính toán lưu lượng tích lũy, định cỡ đường kính ống (Auto-Sizing), xác định tuyến trở lực bất lợi nhất (Critical Index Run), và tính toán van cân bằng tĩnh/động trong XBoss.

---

## 1. GIẢI THUẬT TỰ ĐỘNG CHỌN ĐƯỜNG KÍNH ỐNG (AUTO-SIZING ENGINE)

Đường kính danh định của từng đoạn ống được tự động lựa chọn thỏa mãn 2 điều kiện biên:

1. **Khống chế Vận tốc Dòng chảy ($v_{\min} \le v \le v_{\max}$):**
   - Ống cấp nước sinh hoạt: $0.6\text{ m/s} \le v \le 1.8 - 2.0\text{ m/s}$ (TCVN 4513:1988).
   - Ống Chiller cấp/hồi: $0.9\text{ m/s} \le v \le 2.2 - 2.5\text{ m/s}$ (ASHRAE Fundamentals).
   - Ống hút bơm: $v \le 1.2\text{ m/s}$ (chống xâm thực khí Cavitation).
2. **Khống chế Tổn Thất Cột Áp Đơn Vị ($R = \frac{\Delta P}{L}$):**
   - Giới hạn tổn thất ma sát thông thường: $R \le 100 - 300\text{ Pa/m}$ ($1.0 - 3.0\text{ m H}_2\text{O}/100\text{m}$).

---

## 2. CÔNG THỨC TỔN THẤT ÁP SUẤT DARCY-WEISBACH & COLEBROOK-WHITE

Tổng tổn thất áp suất trên một đoạn ống thứ $k$ bao gồm tổn thất dọc đường ma sát ($\Delta P_{\text{friction}}$) và tổn thất cục bộ qua phụ kiện van ($\Delta P_{\text{local}}$):

$$\Delta P_k = f_k \cdot \frac{L_k}{D_k} \cdot \frac{\rho v_k^2}{2} + \sum \zeta_i \cdot \frac{\rho v_k^2}{2} \quad (\text{Pa})$$

Trong đó hệ số ma sát Darcy $f$ được tính bằng phương trình Swamee-Jain (xấp xỉ Colebrook-White):

$$f = \frac{0.25}{\left[ \log_{10} \left( \frac{\varepsilon}{3.7 D} + \frac{5.74}{Re^{0.9}} \right) \right]^2}$$

- $\varepsilon$: Độ nhám tuyệt đối thành ống ($0.046\text{mm}$ cho thép, $0.007\text{mm}$ cho nhựa PPR/HDPE).
- $Re = \frac{v \cdot D}{\nu}$: Số Reynolds dòng chảy ($\nu \approx 1.0 \times 10^{-6}\text{ m}^2/\text{s}$ đối với nước ở $20^\circ\text{C}$).
- $\sum \zeta$: Tổng hệ số trở lực cục bộ (Cút $90^\circ$: $\zeta = 0.5 - 0.9$, Tê nhánh: $\zeta = 1.0 - 1.5$, Van cổng mở hoàn toàn: $\zeta = 0.2$).

---

## 3. XÁC ĐỊNH TUYẾN BẤT LỢI NHẤT (CRITICAL INDEX RUN PATH)

Trong mạng lưới phân nhánh từ Nguồn cấp (Bơm/Chiller) đến các Thiết bị đầu cuối (Terminals):

$$H_{\text{pump, req}} = \max_{j \in \text{Terminals}} \left( \sum_{k \in \text{Path}(S \rightarrow T_j)} \Delta P_k \right) + \Delta P_{\text{terminal}, j} + \Delta P_{\text{source}}$$

- Tuyến đường dẫn từ Nguồn đến Thiết bị $T^*$ có tổng chênh áp $\Delta P_{\text{path}}$ lớn nhất được định nghĩa là **Tuyến Trở Lực Lớn Nhất (Critical Index Run)**.
- Cột áp yêu cầu của Bơm được định kích thước dựa trên tuyến này.

---

## 4. GIẢI THUẬT CÂN BẰNG THỦY LỰC & CHỌN VAN CÂN BẰNG (BALANCING VALVES)

Các nhánh ngắn hơn (non-critical branches) sẽ có áp lực dư thừa ($\Delta P_{\text{excess}}$), dẫn đến hiện tượng thừa lưu lượng ở nhánh đầu nguồn và thiếu lưu lượng ở nhánh cuối nguồn.

Chênh áp cần triệt tiêu tại van cân bằng của nhánh $i$:

$$\Delta P_{\text{excess}, i} = \Delta P_{\text{critical}} - \Delta P_{\text{branch}, i} \quad (\text{bar})$$

Hệ số lưu lượng van cân bằng yêu cầu ($K_v$ tính bằng $\text{m}^3/\text{h}$ tại $\Delta P = 1\text{ bar}$):

$$K_v = \frac{Q_i \left( \text{m}^3/\text{h} \right)}{\sqrt{\Delta P_{\text{excess}, i} \left( \text{bar} \right)}}$$

Độ mở đặt trước của van cân bằng (Preset Position %):

$$\text{Preset } \% = \min \left( 100, \max \left( 10, \frac{K_v}{K_{vs}} \cdot 100 \right) \right)$$

_(Trong đó $K_{vs}$ là hệ số lưu lượng cực đại khi van mở $100\%$)._
