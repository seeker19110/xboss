---
name: cad-bim-master
description: "Quy chuẩn kỹ thuật chuyên sâu và quy trình tự động hóa CAD/BIM, MEPF Engineering, bóc tách QTO, giải quyết xung đột không gian (Clash Solver), tối ưu cắt phôi (Nesting) và đồng bộ Scan-to-BIM trong XBoss. Bắt buộc kích hoạt khi phân tích, thiết kế, xuất mã vẽ hoặc xử lý dữ liệu bản vẽ kỹ thuật."
---

# CAD/BIM MASTER — QUY CHUẨN KỸ THUẬT & TỰ ĐỘNG HÓA KỸ THUẬT KHÔNG GIAN

Bộ Skill này đóng gói toàn bộ tri thức kỹ thuật không gian (Spatial Engineering), công thức tính toán thủy lực MEPF, quy chuẩn phân tầng layer AIA/BS1192, định mức dự toán xây dựng Việt Nam và giải thuật tối ưu gia công chế tạo cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC BẤT BIẾN (INVARIANTS)

1. **Bảo toàn Độ dốc Trọng lực (Gravity-Pipe Slope Invariant):** Tuyệt đối không được bẻ góc vượt chướng ngại vật làm triệt tiêu độ dốc của hệ thống thoát nước trọng lực ($1.0\% - 2.0\%$). Mọi xung đột giữa ống thoát nước và ống áp lực (Cấp nước, Cứu hỏa, Gas lạnh) thì hệ áp lực bắt buộc phải uốn né hệ trọng lực.
2. **Nguyên tắc Vùng Khoét Dầm (Structural Penetration Zone):** Vị trí lỗ mở xuyên dầm bê tông cốt thép (Sleeve Opening) chỉ được đặt trong khoảng $1/3$ giữa nhịp dầm ($L/3 \le x \le 2L/3$) và cách mép trên/dưới dầm tối thiểu $50\text{mm}$. Tuyệt đối không khoét lỗ tại $1/3$ hai đầu dầm (vùng chịu lực cắt lớn).
3. **Bảo tồn Định dạng & Font (Zero Corruption):** Mọi văn bản CAD tiếng Việt trích xuất từ font nhị phân `.shx`, VNI hoặc TCVN3-ABC phải được chuyển đổi chuẩn xác sang Unicode UTF-8 trước khi lưu trữ vào cơ sở dữ liệu.
4. **Giới hạn Vận tốc Dòng chảy (Velocity Limit Invariant):**
   - Ống nước cấp/chiller: Vận tốc $v \le 1.5 - 2.5\text{m/s}$ (tránh xói mòn và tiếng ồn).
   - Ống hút bơm: $v \le 1.2\text{m/s}$ (chống xâm thực khí - cavitation).
   - Ống gió nhánh: $v \le 4.0 - 6.0\text{m/s}$; Ống gió trục chính: $v \le 8.0 - 10.0\text{m/s}$.
5. **Cổng Kiểm soát Con người (A2 Human Gate):** Mọi bản vẽ phát hành chính thức, bảng khối lượng BOQ chênh lệch $(\Delta \text{QTO})$ và chứng chỉ thanh toán IPC liên kết với mô hình phải có xác thực chữ ký số/token từ Kỹ sư trưởng hoặc Giám đốc Dự án.

---

## 2. QUY TRÌNH 5 BƯỚC XỬ LÝ DỮ LIỆU CAD/BIM

Mỗi khi AI Agent xử lý tác vụ liên quan đến bản vẽ hoặc mô hình 3D, hãy tuân thủ chu trình 5 bước sau:

```
[B1: Ingestion & Sanitize] ──► [B2: Semantic Parse & QTO] ──► [B3: Spatial Clash & Solver] ──► [B4: Code/Fabrication Gen] ──► [B5: Verification & Gate]
```

### Bước 1: Tiếp nhận, Chuẩn hóa Layer & Khắc phục Lỗi Font (Ingestion & Sanitize)

- Quét và kiểm tra bảng mã ký tự trong toàn bộ Text/MText/Attributes. Áp dụng bảng ánh xạ font tại [references/cad-layer-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/cad-layer-standards.md) để chuyển đổi sạch sang UTF-8.
- Chuẩn hóa hệ layer về chuẩn thống nhất (ví dụ: `M-HVAC-DUCT`, `P-PLUM-PIPE`, `E-POWR-CABL`, `F-PROT-PIPE`).

### Bước 2: Phân tích Thực thể & Bóc tách Khối lượng Tự động (Semantic Parse & QTO)

- Đọc sâu Block Definitions: Trích xuất Name, X, Y, Z, Rotation, và các dynamic attributes (Công suất kW, Lưu lượng CFM/LPS, Kích thước WxH, Đường kính DN).
- Tính chiều dài ống/dây thực tế: Bù trừ chiều dài fitting (Cút 90°, Tê, Côn thu) và nhân hệ số uốn lượn/chùng dây ($1.05 - 1.10$).
- Ánh xạ mã BOQ sang Định mức Xây dựng Việt Nam theo tài liệu [references/vietnam-norms-mapping.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/vietnam-norms-mapping.md).

### Bước 3: Kiểm tra Xung đột Không gian & Đề xuất Hướng Tuyến (Spatial Clash & Solver)

- Tính toán va chạm 3D Bounding Box (AABB) và khoảng hở cách nhiệt (_Soft clearance_ tối thiểu $50\text{mm}$).
- Khi phát hiện xung đột:
  - Nếu là Xung đột Cứng với Kết cấu $\rightarrow$ Đề xuất hạ cao độ hoặc kiểm tra vùng khoét dầm hợp lệ.
  - Nếu là Xung đột Cơ điện (MEP vs MEP) $\rightarrow$ Ưu tiên giữ thẳng hệ Ống gió chính & Ống thoát nước tự chảy; bẻ uốn ống cấp nước/cáp điện góc $45^\circ$.

### Bước 4: Sinh Mã Bản vẽ & Tối ưu Gia công Xưởng (Generative Drafting & Nesting)

- Tự động sinh mã AutoLISP (`.lsp`) hoặc AutoCAD Script (`.scr`) dựa trên các mẫu chuẩn tại [references/autolisp-templates.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/autolisp-templates.md).
- Khi có danh mục đoạn ống cần chế tạo tại xưởng (Prefabrication Spools): Áp dụng giải thuật First-Fit Decreasing (FFD) tại [references/1d-2d-nesting-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/1d-2d-nesting-recipes.md) để xếp phôi vào cây tiêu chuẩn $6.0\text{m}$ với độ hao hụt $< 1.8\%$.

### Bước 5: Kiểm tra Sai lệch Thực tế & Đóng Vòng Lặp Thanh toán (Verification & Closed-Loop)

- So khớp dữ liệu đo đạc LiDAR / Reality Scan với tọa độ thiết kế:
  - $\Delta \le 15\text{mm}$: Pass (Chấp thuận nghiệm thu).
  - $15\text{mm} < \Delta \le 35\text{mm}$: Warning (Chỉnh sửa ty treo/giá đỡ).
  - $\Delta > 35\text{mm}$: Critical Defect (Tạo phiếu lỗi kèm tọa độ 3D và chặn nghiệm thu).
- Tự động đồng bộ khối lượng nghiệm thu sang tiến độ WBS và chứng chỉ thanh toán IPC.

---

## 3. TÀI LIỆU THAM CHIẾU KỸ THUẬT (REFERENCES)

- [references/cad-layer-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/cad-layer-standards.md): Chuẩn layer AIA/BS1192 & Bảng màu ACI.
- [references/mepf-hydraulic-formulas.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/mepf-hydraulic-formulas.md): Công thức Hazen-Williams, Darcy-Weisbach, tính tải trọng ty treo.
- [references/vietnam-norms-mapping.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/vietnam-norms-mapping.md): Bảng mã định mức Thông tư 12/2021/TT-BXD cho hệ Cơ điện.
- [references/autolisp-templates.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/autolisp-templates.md): Mẫu code AutoLISP vẽ mặt cắt, giá treo và ký hiệu kỹ thuật.
- [references/1d-2d-nesting-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/1d-2d-nesting-recipes.md): Công thức và giải thuật tối ưu cắt phôi xưởng.
