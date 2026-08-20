# GIẢI THUẬT CLASH SOLVER & TỰ ĐỘNG HÓA SINH BẢN VẼ SHOPDRAWING LOD 400

Tài liệu này đóng gói toàn bộ ma trận giải quyết xung đột không gian (Spatial Clash Solver), quy chuẩn xuyên dầm kết cấu, và giải thuật tự động sinh bản vẽ thi công Shopdrawing kèm danh mục gia công chế tạo chi tiết (DfMA Spools & 1D Nesting).

---

## 1. MA TRẬN THỨ BẬC ƯU TIÊN GIẢI QUYẾT XUNG ĐỘT (SPATIAL PRIORITY MATRIX)

Khi phát hiện giao cắt không gian giữa các đối tượng trong mô hình 3D hoặc bản vẽ phối hợp (Coordination Drawing), AI Agent bắt buộc áp dụng **Thứ bậc Ưu tiên Tuyệt đối (Strict Spatial Hierarchy)** sau:

$$\text{Cột/Dầm Kết cấu (1)} > \text{Ống Thoát nước Trọng lực } 1-2\% \text{ (2)} > \text{Ống Gió Chính (3)} > \text{Ống Áp lực MEPF (4)} > \text{Thang Máng Cáp (5)} > \text{Dây Tín hiệu (6)}$$

```
┌────────────────────────────────────────────────────────────────────────┐
│                      MA TRẬN ƯU TIÊN GIẢI QUYẾT VA CHẠM                │
├────────────────────────────────┬───────────────────────────────────────┤
│ Hệ thống Cố định (Không bẻ)   │ Hệ thống Phải Uốn Né (Reroute)        │
├────────────────────────────────┼───────────────────────────────────────┤
│ 1. Dầm / Cột / Sàn Bê tông CT  │ Toàn bộ hệ MEPF (Chỉ xuyên tại L/3)   │
│ 2. Thoát nước tự chảy (Gravity)│ Cấp nước, Cứu hỏa, Chiller, Máng cáp  │
│ 3. Ống gió kích thước lớn     │ Ống nước cấp, Ống PCCC, Dây điện      │
│ 4. Ống Chiller cách nhiệt      │ Ống cấp nước sinh hoạt, Máng cáp nhẹ  │
│ 5. Thang máng cáp điện động lực│ Cáp tín hiệu, Cáp BMS, Dây chiếu sáng │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

## 2. QUY CHUẨN KỸ THUẬT LỖ MỞ XUYÊN DẦM (BEAM PENETRATION RULES)

Đối với các vị trí ống MEPF bắt buộc phải đâm xuyên dầm bê tông cốt thép để duy trì cao độ trần, hệ thống kiểm tra 3 điều kiện kỹ thuật bất biến theo TCVN 5574:2018:

1. **Vị trí Dọc Trục Dầm (Span Location):**
   - Chỉ được phép bố trí Sleeve trong khoảng $1/3$ giữa nhịp dầm:
     $$L/3 \le x_{\text{sleeve}} \le 2L/3$$
   - Tuyệt đối cấm xuyên dầm tại $1/3$ hai đầu dầm (vùng tập trung ứng suất cắt lớn $Q_{\max}$).

2. **Giới hạn Đường kính Lỗ mở (Diameter Ratio):**
   - Đường kính ngoài của ống luồn (Sleeve Outer Diameter $D_{\text{sleeve}}$) không được vượt quá $1/3$ chiều cao tiết diện dầm ($H_{\text{beam}}$):
     $$D_{\text{sleeve}} \le \frac{H_{\text{beam}}}{3}$$

3. **Khoảng cách Mép An toàn (Edge Clearances):**
   - Khoảng cách từ mép trên/dưới lỗ mở đến mép trên/dưới dầm bê tông tối thiểu $50\text{mm}$.
   - Khoảng cách giữa 2 lỗ mở xuyên dầm liền kề:
     $$S_{\text{sleeve}} \ge 3 \times \max(D_1, D_2)$$

---

## 3. GIẢI THUẬT TỰ ĐỘNG BẺ TUYẾN NÉ VA CHẠM $45^\circ$ (AUTO-REROUTING)

Khi ống áp lực (Cấp nước, PCCC, Gas lạnh) va chạm với ống thoát nước hoặc ống gió:

1. Xác định điểm va chạm $P_{\text{clash}}(x_c, y_c, z_c)$ và bán kính vùng ảnh hưởng $R_{\text{zone}} = D_{\text{obstacle}}/2 + \text{Clearance } (50\text{mm})$.
2. Tự động chèn 4 cút $45^\circ$ (Offset Elbows) để uốn vòng lên hoặc hạ xuống dưới chướng ngại vật:
   - Khoảng dịch chuyển độ cao: $\Delta h = R_{\text{zone}} + D_{\text{pipe}}/2$.
   - Chiều dài đoạn uốn chéo: $L_{\text{diagonal}} = \frac{\Delta h}{\sin(45^\circ)} = \Delta h \times \sqrt{2}$.
3. Cập nhật tọa độ tuyến ống mới và chèn ký hiệu phụ kiện (Fittings) vào bản vẽ Shop.

---

## 4. QUY TRÌNH TỰ ĐỘNG XUẤT SHOPDRAWING LOD 400 & PREFAB SPOOLS

```
[Bản vẽ Thiết kế LOD 200] ──► [Auto-Clash & Slope Check] ──► [Chia đoạn Spool <= 5.8m] ──► [Chèn Bích & Ty Treo] ──► [Xuất DXF & Bảng Gia công]
```

### 4.1. Thuật toán Chia đoạn Ống Chế tạo Xưởng (Prefabrication Spooling)

- Giới hạn chiều dài vận chuyển thùng xe tải: $L_{\max} = 5.8\text{m}$ (tương thích cây ống chuẩn $6.0\text{m}$).
- Tuyến ống dài $L_{\text{total}} > 5.8\text{m}$ được tự động bẻ thành $N = \lceil L_{\text{total}} / 5.8 \rceil$ đoạn Spool.
- Giữa các đoạn Spool tự động chèn cặp mặt bích tiêu chuẩn (Flange Pair) hoặc khớp nối mềm/măng-sông rãnh (Grooved Coupling).

### 4.2. Tối ưu Xếp Phôi Cắt Cây Ống (First-Fit Decreasing 1D Nesting)

- Danh mục đoạn ống cần gia công được sắp xếp theo thứ tự giảm dần chiều dài: $L_1 \ge L_2 \ge \dots \ge L_k$.
- Đưa từng đoạn vào cây ống thô $6.0\text{m}$ đầu tiên còn đủ chỗ chứa (First-Fit).
- Giữ tỷ lệ hao hụt đầu mẩu (Scrap Waste Rate) dưới mức trần:
  $$\text{Waste Rate } = \frac{\sum L_{\text{cây ống}} - \sum L_{\text{thành phẩm}}}{\sum L_{\text{cây ống}}} \le 1.8\%$$
