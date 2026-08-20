---
name: cad-bim-master
description: "Quy chuẩn kỹ thuật chuyên sâu và quy trình tự động hóa CAD/BIM, MEPF Engineering, bóc tách QTO, giải quyết xung đột không gian (Clash Solver), tối ưu cắt phôi (Nesting) và đồng bộ Scan-to-BIM trong XBoss. Bắt buộc kích hoạt khi phân tích, thiết kế, xuất mã vẽ hoặc xử lý dữ liệu bản vẽ kỹ thuật."
---

# CAD/BIM MASTER — QUY CHUẨN KỸ THUẬT & TỰ ĐỘNG HÓA TỪ BẢN VẼ LỖI ĐẾN HOÀN CÔNG

Bộ Skill này đóng gói toàn bộ tri thức kỹ thuật không gian (Spatial Engineering), công thức tính toán thủy lực MEPF, quy chuẩn phân tầng layer AIA/BS1192, định mức dự toán xây dựng Việt Nam, giải thuật giải quyết xung đột không gian (Clash Solver), và quy trình khép kín pháp lý từ **Bản vẽ lỗi $\rightarrow$ Bản vẽ hoàn công & Hồ sơ nghiệm thu hoàn công số** theo **Nghị định 06/2021/NĐ-CP** và **Thông tư 10/2021/TT-BXD** cho nền tảng XBoss.

---

## 1. BẢY NGUYÊN TẮC BẤT BIẾN (THE 7 INVARIANTS)

1. **Bảo toàn Độ dốc Trọng lực (Gravity-Pipe Slope Invariant):** Tuyệt đối không được bẻ góc vượt chướng ngại vật làm triệt tiêu độ dốc của hệ thống thoát nước trọng lực ($1.0\% - 2.0\%$). Mọi xung đột giữa ống thoát nước và ống áp lực (Cấp nước, Cứu hỏa, Chiller) thì hệ áp lực bắt buộc phải uốn né hệ trọng lực.
2. **Nguyên tắc Vùng Khoét Dầm (Structural Penetration Zone):** Vị trí lỗ mở xuyên dầm bê tông cốt thép (Sleeve Opening) chỉ được đặt trong khoảng $1/3$ giữa nhịp dầm ($L/3 \le x \le 2L/3$) và cách mép trên/dưới dầm tối thiểu $50\text{mm}$. Đường kính ngoài ống luồn $D_{\text{sleeve}} \le H_{\text{dầm}}/3$. Tuyệt đối không khoét lỗ tại $1/3$ hai đầu dầm (vùng chịu lực cắt lớn).
3. **Bảo tồn Định dạng & Font Tiếng Việt (Zero Corruption):** Mọi văn bản CAD trích xuất từ font nhị phân `.shx`, VNI hoặc TCVN3-ABC phải được tự động chuyển đổi chuẩn xác sang Unicode UTF-8 trước khi lưu trữ vào cơ sở dữ liệu.
4. **Giới hạn Vận tốc Thủy lực & Khí động (Velocity Limit Invariant):**
   - Ống nước cấp/chiller: Vận tốc $v \le 1.5 - 2.5\text{m/s}$ (tránh xói mòn và tiếng ồn).
   - Ống hút bơm: $v \le 1.2\text{m/s}$ (chống xâm thực khí - cavitation).
   - Ống gió nhánh: $v \le 4.0 - 6.0\text{m/s}$; Ống gió trục chính: $v \le 8.0 - 10.0\text{m/s}$.
5. **Bất biến Nét đỏ Hoàn công (As-Built Redline Invariant):** Mọi sai lệch hình học giữa hiện trường và bản vẽ Shopdrawing được duyệt phải được thể hiện bằng đường nét đỏ (Revision Cloud) kèm mã trỏ đến Phiếu yêu cầu thay đổi hiện trường (FCR), Phiếu làm rõ thiết kế (RFI) hoặc Biên bản nghiệm thu (BBNT) đã ký duyệt.
6. **Bất biến Khung Dấu Hoàn công Pháp lý (NĐ 06/2021/NĐ-CP Invariant):** Bản vẽ hoàn công bắt buộc phải có khung dấu hoàn công chuẩn kích thước $120\text{mm} \times 60\text{mm}$ (Mẫu số 01 - 3 chữ ký) hoặc $120\text{mm} \times 80\text{mm}$ (Mẫu số 02 - 4 chữ ký) theo Phụ lục II Nghị định 06/2021/NĐ-CP tại góc dưới bên phải bản vẽ.
7. **Bất biến Sổ cái Mật mã Bàn giao (Merkle Provenance Invariant):** Toàn bộ bản vẽ As-Built, BBNT ký số 3 bên, kết quả T&C và bảng cân đối khối lượng quyết toán $\Delta \text{QTO}$ được băm SHA-256 đóng vào Cây Merkle bất biến để xuất Hộ chiếu số bàn giao LOD 500 (Living Digital Twin Passport).
8. **Bảo toàn Bù trừ Dung sai Mối nối & Chiều dài Cắt Thực tế (Fitting Deduction & Cut-Length Invariant):** Chiều dài ống cắt thực tế ($L_{\text{cut}}$) tại xưởng chế tạo DfMA bắt buộc phải được bù trừ chính xác theo độ ngập âm phụ kiện (Socket Insertion Depth), gờ chặn măng xông ($t_{\text{stop}}$), chiều dài ren ăn khớp (Thread Makeup), khe hở rãnh Grooved, đệm gioăng mặt bích và khe hở đáy hàn, kết hợp dung sai hiện trường (Field Fit Allowance $+50\dots +100\text{mm}$) cho đốt đóng tuyến nhằm triệt tiêu hoàn toàn sai số lắp ráp và đạt phế liệu $< 1.2\%$.
9. **Bảo toàn Dung sai Thông thủy Gót Hộp Gió & Bù trừ Dài Tích Lũy Tuyến Ống Gió (Duct Length Accumulation & Diffuser +10mm Clearance Invariant):** Kích thước miệng đón / gót hộp gió ($W_{\text{plenum}} \times H_{\text{plenum}}$) bắt buộc phải rộng hơn cổ miệng gió đúng $+10\text{mm}$ ($+5\text{mm}$ mỗi mép) để đảm bảo lắp ráp nhẹ nhàng không bị kích kẹt; đồng thời mọi độ dài dôi tích lũy từ bích TDC, bích V, nẹp C, van VCD/FD và khớp mềm canvas bắt buộc phải được bù trừ tự động bằng cách cắt ngắn đoạn ống thẳng liền kề để giữ đúng $100\%$ tim miệng gió vào ô trần thiết kế ($600\times 600\text{mm}$).

---

## 2. QUY TRÌNH 8 BƯỚC KHÉP KÍN: TỪ BẢN VẼ LỖI ──► HOÀN CÔNG SỐ

```
[B1: Ingestion & Lọc 12 Dị Tật] ──► [B2: Tự Chữa Lành & Clash Solver] ──► [B3: RFI & Shop LOD 400] ──► [B4: Ký Số 3 Bên & PWA Sync]
               │
               ▼
[B8: Chốt ΔQTO & Merkle Passport] ◄── [B7: Redline & Dấu Hoàn Công] ◄── [B6: Hold-Points & Scan 3D] ◄── [B5: Quét QR & Nhật Ký TT 06]
```

### Bước 1: Tiếp nhận Bản vẽ Đầu vào & Chẩn đoán 12 Dạng Dị tật (Ingestion & Defect Diagnostic)

- Quét toàn bộ thực thể CAD/BIM để phát hiện 12 dị tật phổ biến theo tài liệu [references/drawing-defect-taxonomy-and-healing.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/drawing-defect-taxonomy-and-healing.md).
- Kiểm tra font nhị phân `.shx`/TCVN3, tỷ lệ DimText so với hình học (Scale 1:1), tên Layer không chuẩn, và Block attributes bị thiếu thông số kỹ thuật.

### Bước 2: Tự Chữa Lành Dữ liệu & Động cơ Giải quyết Xung đột Không gian (Healing & Clash Solver)

- Tự động chuyển font sang UTF-8 và chuẩn hóa layer theo AIA/BS1192.
- Áp dụng ma trận ưu tiên không gian theo tài liệu [references/clash-solver-and-generative-shopdrawing.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/clash-solver-and-generative-shopdrawing.md).
- Khi có xung đột: Hệ áp lực tự động uốn né $45^\circ$, bảo toàn độ dốc $1.0\% - 2.0\%$ cho hệ thoát nước, và định vị lỗ xuyên dầm tại $L/3 \le x \le 2L/3$.

### Bước 3: Tự động Sinh RFI, Chia Đốt DfMA Spool LOD 400 & Bóc Tách Micro-BOM 5 Cấp (RFI, Spooling & Micro-BOM)

- Khi phát hiện xung đột vượt thẩm quyền A2 (cần khoét dầm mới hoặc hạ trần kiến trúc): Tự động phát hành phiếu RFI gửi Kỹ sư Thiết kế và TVGS.
- Tự động bẻ phân đoạn ống gia công xưởng (Prefabrication Spools $\le 5.8\text{m}$, Khối lượng $\le 50\text{kg}$), chèn cặp mặt bích và ty treo.
- Tự động tính toán bù trừ dung sai mối nối (Fitting Take-Off & Socket Insertion Depth), độ ngập âm măng xông $t_{\text{stop}}$, và gán lượng bù Field Fit Allowance $+50\dots +100\text{mm}$ cho đốt đóng tuyến theo [references/pipe-spooling-and-fitting-deduction-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/pipe-spooling-and-fitting-deduction-standards.md).
- Tự động bùng nổ Micro-BOM 5 cấp độ (Ống chính $\rightarrow$ Phụ kiện $\rightarrow$ Van thiết bị $\rightarrow$ Bu lông/Gioăng/Keo/Que hàn $\rightarrow$ Giá treo/Bảo ôn/Mã QR Kitting).
- Áp dụng giải thuật Best-Fit Decreasing kết hợp quét kho phôi thừa (Remnant Pool Nesting) để cắt phôi cây thép/ống nhựa $6.0\text{m}$ với độ hao hụt phế liệu $< 1.2\%$.

### Bước 4: Cổng Ký số 3 Bên Duyệt Shopdrawing & Phân phối Ngoại tuyến PWA (Gate 0 & Mobile Sync)

- Ký số thông minh 3 bên (Nhà thầu - TVGS - CĐT) phê duyệt bản vẽ Shopdrawing chính thức (`/engineering/esign`).
- Tự động đồng bộ bản vẽ số và danh mục Spools xuống ứng dụng di động công trường (PWA Offline Cache).

### Bước 5: Chỉ huy Tác nghiệp Hiện trường, QR Logistics & Ghi Nhật ký (Field & Logistics QR)

- Bàn giao quyền kiểm soát mặt bằng thi công (Work-Front Custody).
- Quét mã QR tại cổng công trường đối chiếu danh mục PO, kiểm tra CO/CQ và tình trạng vật tư đầu vào trước khi lắp đặt.
- Ghi nhật ký thi công điện tử theo Thông tư 06/2021/TT-BXD qua NLP Voice/Chat Copilot.

### Bước 6: Kiểm soát Điểm dừng Nghiệm thu, Quét 3D Scan-to-BIM & Vòng lặp NCR (Hold-Points & QA/QC)

- Chặn cứng thi công tại các điểm dừng Hold-Points (không cho đổ bê tông nếu chưa nghiệm thu ống luồn trong sàn).
- So khớp dữ liệu quét LiDAR / Scan-to-BIM với bản vẽ Shopdrawing:
  - $\Delta \le 15\text{mm}$: Pass (Chấp thuận).
  - $15\text{mm} < \Delta \le 35\text{mm}$: Warning (Chỉnh sửa ty treo/căn chỉnh lại).
  - $\Delta > 35\text{mm}$: Critical Defect (Tạo phiếu NCR 3 bước hoặc kích hoạt FCR nếu do chướng ngại vật hiện trường).

### Bước 7: Tự động Cập nhật Bản vẽ Hoàn công & Đóng Dấu Pháp lý Nghị định 06 (Redline & As-Built Stamp)

- Cập nhật tọa độ thực tế từ điểm đo trắc đạc vào mô hình CAD/BIM As-Built.
- Tự động vẽ nét đỏ (Revision Cloud) và ghi chú mã tham chiếu FCR/RFI theo quy chuẩn [references/asbuilt-redline-and-handover-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/asbuilt-redline-and-handover-standards.md).
- Tự động sinh khung con dấu bản vẽ hoàn công chuẩn Phụ lục II Nghị định 06/2021/NĐ-CP (Mẫu số 01 hoặc Mẫu số 02).

### Bước 8: Ký số 3 Bên Hồ sơ Hoàn công, Chốt $\Delta \text{QTO}$ & Merkle Passport LOD 500 (Final Handover)

- Ký số 3 bên điện tử niêm phong bản vẽ Hoàn công và Biên bản nghiệm thu hoàn thành hạng mục.
- Chạy động cơ đối soát 3 chiều: $\Delta \text{QTO} = \text{QTO}_{\text{As-Built}} - \text{QTO}_{\text{BOQ}} - \text{QTO}_{\text{VO}}$ để chốt quyết toán hợp đồng.
- Nối toàn bộ mã băm tài liệu vào Cây Merkle (`engineering_merkle_roots`), xuất Hộ chiếu số bàn giao LOD 500 (Living Digital Twin Passport) chuyển giao sang hệ thống Quản trị Vận hành BMS/FM.

---

## 3. TÀI LIỆU THAM CHIẾU KỸ THUẬT (REFERENCES)

- [references/ductwork-drift-and-diffuser-clearance-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/ductwork-drift-and-diffuser-clearance-standards.md): Cẩm nang độ dài dôi ống gió, căn chỉnh tim miệng gió trần và dung sai gót hộp gió +10mm.
- [references/pipe-spooling-and-fitting-deduction-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/pipe-spooling-and-fitting-deduction-standards.md): Cẩm nang tra cứu dung sai mối nối, ngập âm socket, DfMA Spooling và Micro-BOM 5 cấp.
- [references/drawing-defect-taxonomy-and-healing.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/drawing-defect-taxonomy-and-healing.md): Cẩm nang phân loại 12 dị tật bản vẽ và giải thuật tự chữa lành.
- [references/clash-solver-and-generative-shopdrawing.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/clash-solver-and-generative-shopdrawing.md): Ma trận ưu tiên không gian, quy chuẩn xuyên dầm $L/3$ và xuất Shopdrawing LOD 400.
- [references/asbuilt-redline-and-handover-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/asbuilt-redline-and-handover-standards.md): Quy chuẩn vẽ nét đỏ Redline, mẫu con dấu hoàn công NĐ 06/2021/NĐ-CP và Hộ chiếu số LOD 500.
- [references/cad-layer-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/cad-layer-standards.md): Chuẩn layer AIA/BS1192 & Bảng màu ACI.
- [references/mepf-hydraulic-formulas.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/mepf-hydraulic-formulas.md): Công thức Hazen-Williams, Darcy-Weisbach, tính tải trọng ty treo.
- [references/vietnam-norms-mapping.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/vietnam-norms-mapping.md): Bảng mã định mức Thông tư 12/2021/TT-BXD cho hệ Cơ điện.
- [references/autolisp-templates.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/autolisp-templates.md): Mẫu code AutoLISP vẽ mặt cắt, giá treo và ký hiệu kỹ thuật.
- [references/1d-2d-nesting-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/1d-2d-nesting-recipes.md): Công thức và giải thuật tối ưu cắt phôi xưởng.
