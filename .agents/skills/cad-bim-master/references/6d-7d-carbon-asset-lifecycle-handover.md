# CẨM NANG BẢN SAO SỐ 6D CARBON LCA & 7D QUẢN TRỊ TÀI SẢN LOD 500 (6D/7D CARBON LCA & ASSET LIFECYCLE HANDOVER)

Tài liệu chuẩn hóa phương pháp bóc tách phát thải carbon ẩn 6D (Embodied Carbon Lifecycle Assessment), đánh giá sức khỏe và tuổi thọ hữu dụng còn lại 7D (MTBF/RUL), và đóng gói Hộ chiếu số bàn giao Living Digital Twin Passport LOD 500 trong XBoss.

---

## 1. BÓC TÁCH CARBON ẨN 6D (6D EMBODIED CARBON ASSESSMENT)

Theo các tiêu chuẩn quốc tế ISO 14040/14044 và EN 15978, lượng phát thải carbon ẩn của hệ thống MEPF từ giai đoạn sản xuất vật liệu đến thi công tại hiện trường (Cradle-to-Practical-Completion, Giai đoạn A1 - A5) được tính toán tự động:

$$E_{\text{carbon, total}} = \sum_{i=1}^{M} \left( W_i \cdot \text{ECF}_i \right) \quad \left( \text{kgCO}_2\text{e} \right)$$

- $W_i$: Khối lượng tịnh của vật liệu loại $i$ (kg).
- $\text{ECF}_i$: Hệ số phát thải carbon ẩn (Embodied Carbon Factor - $\text{kgCO}_2\text{e/kg}$).

### 1.1. Bảng Hệ Số Phát Thải Vật Liệu MEPF Chuẩn

- **Tôn mạ kẽm (Ống gió, máng cáp):** $2.85\text{ kgCO}_2\text{e/kg}$
- **Thép đen / Thép đúc (Ống nước, Unistrut):** $2.15\text{ kgCO}_2\text{e/kg}$
- **Đồng đỏ (Ống gas lạnh, Cáp điện):** $3.82\text{ kgCO}_2\text{e/kg}$
- **Nhựa PPR (Cấp nước hàn nhiệt):** $2.41\text{ kgCO}_2\text{e/kg}$
- **Nhựa uPVC (Thoát nước dán keo):** $2.18\text{ kgCO}_2\text{e/kg}$
- **Bê tông kết cấu dầm sàn:** $0.14\text{ kgCO}_2\text{e/kg}$ ($140\text{ kgCO}_2\text{e/m}^3$)

### 1.2. Đánh Giá Xếp Hạng Công Trình Xanh

- **Hạng A+ (Low-Carbon Apex):** Phát thải MEPF $< 45\text{ kgCO}_2\text{e/m}^2$ sàn xây dựng.
- **Hạng B (Standard Compliant):** Phát thải MEPF $45 - 80\text{ kgCO}_2\text{e/m}^2$ sàn xây dựng.
- **Hạng C (High Emissions Alert):** Phát thải MEPF $> 80\text{ kgCO}_2\text{e/m}^2$ sàn xây dựng.

---

## 2. QUẢN TRỊ VÒNG ĐỜI TÀI SẢN SỐ 7D (7D SMART ASSET & MTBF/RUL ENGINE)

Mọi thiết bị cơ điện trong mô hình BIM (Bơm, Chiller, AHU, Quạt thông gió, Van điện từ, Tủ điện) được gắn mã định danh GUID tài sản số liên kết với hồ sơ vận hành:

1. **Tuổi Thọ Hữu Dụng Còn Lại (Remaining Useful Life - RUL %):**
   $$\text{RUL } \% = \max \left( 0, \frac{T_{\text{lifespan, hours}} - T_{\text{operating, hours}}}{T_{\text{lifespan, hours}}} \cdot 100 \right)$$
2. **Dự Báo Chu Kỳ Hỏng Hóc Tiếp Theo (Next MTBF Horizon):**
   $$\Delta T_{\text{next, days}} = \frac{\text{MTBF} - (T_{\text{operating}} \pmod{\text{MTBF}})}{24}$$
3. **Chỉ Số Sức Khỏe Thiết Bị (Health Score %):**
   $$\text{Health Score } \% = \max \left( 0, \min \left( 100, \text{RUL } \% - N_{\text{incidents}} \cdot 5 \right) \right)$$

---

## 3. HỘ CHIẾU SỐ BÀN GIAO LIVING DIGITAL TWIN PASSPORT LOD 500 (COBie COMPLIANT)

Hồ sơ bàn giao số cho Chủ đầu tư và Đơn vị Quản lý Tòa nhà (BMS/FM) bao gồm:

```
[Bản vẽ As-Built DWG/IFC] ──► [Hồ sơ COBie Tài sản] ──► [Báo cáo Carbon 6D] ──► [Mã Băm Merkle Root] ──► [LOD 500 Digital Passport Token]
```

- **Mã Token Bàn Giao:** `PASSPORT-LOD500-<SHA256_HASH>`
- **Chứng thực Sổ Cái Bất Biến:** Toàn bộ bản vẽ hoàn công, biên bản nghiệm thu BBNT, thông số thiết bị và báo cáo carbon được băm SHA-256 đóng vào Merkle Tree Ledger đảm bảo tính toàn vẹn và chống chỉnh sửa dữ liệu hậu nghiệm thu.
