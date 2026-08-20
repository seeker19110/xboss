# CÔNG THỨC TÍNH TOÁN THỦY LỰC MEPF & KẾT CẤU GIÁ TREO (FORMULAS & TABLES)

Tài liệu cung cấp các công thức vật lý thực nghiệm tính toán lưu lượng, đường kính, tổn thất áp và khoảng cách giá treo chuẩn theo tiêu chuẩn TCVN, NFPA 13, SMACNA và ASHRAE.

---

## 1. Tính Toán Thủy Lực Đường Ống Nước (Hazen-Williams & Darcy-Weisbach)

### 1.1 Công thức Hazen-Williams (Ống nước áp lực có $D \ge 50\text{mm}$)

Tổn thất áp lực ma sát trên $1\text{m}$ chiều dài ống ($h_f$ tính bằng $\text{m nước} / \text{m}$):

\[
h_f = 10.67 \times \frac{Q^{1.852}}{C^{1.852} \times D^{4.87}}
\]

Trong đó:

- $Q$: Lưu lượng nước $(\text{m}^3/\text{s})$.
- $D$: Đường kính trong của ống $(\text{m})$.
- $C$: Hệ số nhám Hazen-Williams:
  - Ống nhựa uPVC / PPR / HDPE: $C = 140 - 150$.
  - Ống thép đúc mới (Black Steel / Galvanized): $C = 120 - 130$.
  - Ống thép đã qua sử dụng / ống gang: $C = 100$.

### 1.2 Vận tốc Dòng Chảy & Đường Kính Yêu Cầu

\[
v = \frac{4 \times Q}{\pi \times D^2} \le v_{\text{allowable}}
\]

| Loại hệ thống                         | Vận tốc cho phép $v_{\text{allowable}}$ |      Giới hạn tổn thất ma sát khuyến nghị       |
| :------------------------------------ | :-------------------------------------: | :---------------------------------------------: |
| Ống hút máy bơm (Pump Suction)        |         $0.8 - 1.2\text{ m/s}$          |         $\le 2.0\text{ m}/100\text{m}$          |
| Ống đẩy máy bơm / Cấp nước chính      |         $1.5 - 2.2\text{ m/s}$          |        $2.0 - 4.0\text{ m}/100\text{m}$         |
| Ống nước lạnh Chiller (Chilled Water) |         $1.2 - 2.4\text{ m/s}$          |        $1.5 - 3.0\text{ m}/100\text{m}$         |
| Ống chữa cháy tự động Sprinkler       |         $2.0 - 4.5\text{ m/s}$          | Theo NFPA 13 (tối đa $10\text{ m}/100\text{m}$) |

---

## 2. Tính Toán Khí Động Học Ống Gió (Air Duct Sizing - SMACNA/ASHRAE)

### 2.1 Đường Kính Tương Đương Ống Gió Chữ Nhật ($D_{\text{eq}}$)

Khi chuyển đổi từ ống gió chữ nhật kích thước $a \times b$ sang ống tròn tương đương cùng độ sụt áp:

\[
D_{\text{eq}} = \frac{1.30 \times (a \times b)^{0.625}}{(a + b)^{0.25}}
\]

### 2.2 Tổn Thất Áp Suất Do Ma Sát Trên Ống Gió

\[
\Delta P = f \times \frac{L}{D_{\text{eq}}} \times \frac{\rho \times v^2}{2} \quad (\text{Pa})
\]

- Vận tốc khí trong ống gió trục chính: $v \le 7.5 - 9.0\text{ m/s}$ (tòa nhà thương mại).
- Vận tốc khí trong ống nhánh cấp miệng gió: $v \le 3.5 - 5.0\text{ m/s}$ (đảm bảo độ ồn $NC \le 35$).
- Độ sụt áp ma sát thiết kế tiêu chuẩn: $\Delta P_{\text{unit}} = 0.8 - 1.0\text{ Pa/m}$.

---

## 3. Bảng Tra Khoảng Cách & Tải Trọng Ty Treo / Giá Đỡ (Hangers & Supports)

Theo tiêu chuẩn MSS SP-69 và TCVN:

| Kích cỡ Ống danh định | Khoảng cách giá treo Ống Nước Thép ($L_{\max}$) | Khoảng cách giá treo Ống Nhựa uPVC/PPR | Đường kính Ty treo tối thiểu |
| :-------------------: | :---------------------------------------------: | :------------------------------------: | :--------------------------: |
|    **DN15 – DN25**    |                 $2.0\text{ m}$                  |             $1.0\text{ m}$             |              M8              |
|    **DN32 – DN50**    |                 $2.7\text{ m}$                  |             $1.2\text{ m}$             |             M10              |
|   **DN65 – DN100**    |                 $3.6\text{ m}$                  |             $1.5\text{ m}$             |             M12              |
|   **DN125 – DN150**   |                 $4.2\text{ m}$                  |             $1.8\text{ m}$             |             M16              |
|   **DN200 – DN300**   |                 $5.0\text{ m}$                  |             $2.0\text{ m}$             |             M20              |

> **Quy tắc tính tải trọng tĩnh thiết kế ty treo ($P_{\text{load}}$):**
> \[
> P_{\text{load}} = (W_{\text{pipe}} + W_{\text{water}} + W_{\text{insulation}}) \times L_{\text{span}} \times 1.5 \text{ (Hệ số an toàn)}
> \]
