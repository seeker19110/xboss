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

- [references/engineering-rationale-and-annotation-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/engineering-rationale-and-annotation-standards.md): Cẩm nang quy chuẩn ghi chú, giải thích lý do kỹ thuật và từ điển giải trình chế tạo MEPF.
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

---

## 4. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 4.1. [Cẩm nang kỹ thuật] 1d-2d-nesting-recipes

# GIẢI THUẬT TỐI ƯU CẮT PHÔI 1D & 2D XƯỞNG GIA CÔNG (NESTING RECIPES)

Tài liệu cung cấp giải thuật toán học và công thức tối ưu xếp cắt phôi ống thép, máng cáp (1D Cutting Stock) và tôn ống gió (2D Sheet Metal Nesting) giúp giảm tỷ lệ phế liệu xuống dưới $1.8\%$.

---

## 1. Bài Toán Cắt Phôi Tuyến Tính 1D (1D Linear Cutting Stock Problem)

### 1.1 Thông số Đầu vào & Ràng buộc Kỹ thuật

- **Chiều dài cây phôi tiêu chuẩn ($L_{\text{stock}}$):** Thông thường $6000\text{mm}$ (6.0m) cho ống thép, ống đồng, máng cáp và thanh Unistrut.
- **Bề rộng mạch cắt cưa ($W_{\text{kerf}}$):** $3\text{mm} - 5\text{mm}$ cho mỗi lần cắt.
- **Đoạn đầu mút loại bỏ ($L_{\text{trim}}$):** $10\text{mm} - 20\text{mm}$ cho mỗi đầu cây nguyên phôi (đầu ba via hoặc vát xưởng).
- **Danh sách đoạn ống yêu cầu ($D = \{(l_1, q_1), (l_2, q_2), \dots, (l_n, q_n)\}$):**
  - Chiều dài đoạn gia công $l_i$ và số lượng $q_i$.

### 1.2 Giải thuật First-Fit Decreasing (FFD)

```python
def optimize_1d_nesting(demand_items, stock_length=6000, kerf_width=3, trim_loss=20):
    """
    demand_items: list of cut lengths [1200, 2400, 1500, 800, ...]
    returns: list of stocks, each containing cuts and remaining scrap
    """
    usable_length = stock_length - (2 * trim_loss)
    # Sắp xếp giảm dần chiều dài để ưu tiên phôi lớn
    sorted_items = sorted(demand_items, reverse=True)

    stocks = [] # [{'cuts': [], 'remaining': usable_length}]

    for item in sorted_items:
        placed = False
        for stock in stocks:
            # Kiểm tra khoảng trống còn lại tính cả bề rộng mạch cắt kerf
            needed_space = item if len(stock['cuts']) == 0 else (item + kerf_width)
            if stock['remaining'] >= needed_space:
                stock['cuts'].append(item)
                stock['remaining'] -= needed_space
                placed = True
                break

        if not placed:
            # Mở cây phôi mới
            stocks.append({
                'cuts': [item],
                'remaining': usable_length - item
            })

    total_material_used = len(stocks) * stock_length
    total_net_length = sum(demand_items)
    scrap_rate = (total_material_used - total_net_length) / total_material_used * 100

    return {
        'total_stocks': len(stocks),
        'scrap_rate_percent': round(scrap_rate, 2),
        'cut_patterns': stocks
    }
```

---

## 2. Bài Toán Xếp Cắt Tôn Tấm 2D (2D Sheet Metal Nesting)

### 2.1 Quy tắc Xếp Tôn Ống Gió (Guillotine Cut Invariants)

- **Kích thước cuộn tôn tiêu chuẩn:** Chiều rộng cuộn $1200\text{mm}$ hoặc tấm tiêu chuẩn $1200\text{mm} \times 2400\text{mm}$.
- **Đường cắt Suốt (Guillotine cut):** Máy xả băng và máy cắt tôn chỉ cắt thẳng xuyên suốt cạnh tấm tôn.
- **Quy tắc Ghép Khai Triển (Pattern Pairing):**
  - Luôn ghép cặp 2 chi tiết Cút 90° (Elbow Cheek) quay lưng vào nhau để lấp đầy hình chữ nhật bao.
  - Các chi tiết Côn thu (Reducer) xếp lồng đối đỉnh để triệt tiêu diện tích tam giác phế liệu.

---

## 3. Quản Lý Phôi Thừa Tái Sử Dụng (Remnant Management)

Khi lượng phế liệu thừa ($L_{\text{remnant}}$) của một cây phôi:

1. $L_{\text{remnant}} \ge 1200\text{mm}$: Tự động gán mã Barcode **Remnant Stock** và đưa vào kho phôi ưu tiên cho các đợt cắt chi tiết ngắn sau.
2. $300\text{mm} \le L_{\text{remnant}} < 1200\text{mm}$: Chuyển sang tổ gia công bích phụ, cút ngắn hoặc giá đỡ gối ngắn.
3. $L_{\text{remnant}} < 300\text{mm}$: Bán phế liệu tái chế kim loại (Scrap metal).

---

### 4.2. [Cẩm nang kỹ thuật] asbuilt-redline-and-handover-standards

# QUY CHUẨN BẢN VẼ HOÀN CÔNG, MẪU DẤU PHÁP LÝ NGHỊ ĐỊNH 06/2021/NĐ-CP & DIGITAL PASSPORT LOD 500

Tài liệu này quy định chuẩn hóa kỹ thuật và pháp lý cho việc tự động tạo lập Bản vẽ Hoàn công (As-Built Redlining), đóng khung dấu bản vẽ hoàn công chuẩn Nghị định 06/2021/NĐ-CP, đối soát khối lượng quyết toán $(\Delta \text{QTO})$ và đóng gói hồ sơ bàn giao số LOD 500 trong XBoss.

---

## 1. NGUYÊN TẮC BẢN VẼ HOÀN CÔNG (AS-BUILT INVARIANTS)

1. **Bất biến Nguồn gốc Thay đổi (Change Provenance Invariant):**
   - Mọi nét vẽ điều chỉnh trên bản vẽ hoàn công so với bản vẽ Shopdrawing được duyệt bắt buộc phải có đám mây sửa đổi (Revision Cloud) màu đỏ, kèm mã tham chiếu đến Phiếu xử lý hiện trường (FCR - Field Change Request) hoặc Phiếu trả lời thiết kế (RFI) hoặc Biên bản nghiệm thu (BBNT) tương ứng.
2. **Bất biến Mẫu Dấu Pháp lý (Nghị định 06/2021/NĐ-CP - Phụ lục II):**
   - Mọi bản vẽ hoàn công phát hành chính thức phải có khung dấu hoàn công chuẩn kích thước $120\text{mm} \times 60\text{mm}$ hoặc $120\text{mm} \times 80\text{mm}$ đặt tại góc dưới bên phải bản vẽ (ngay phía trên Khung tên).
3. **Bất biến Dung sai Thực tế (Reality Scan Tolerance Invariant):**
   - Dữ liệu đo đạc trắc đạc / LiDAR 3D Point Cloud được so khớp với tọa độ thiết kế theo 3 ngưỡng:
     - $\Delta \le 15\text{mm}$: **PASS** $\rightarrow$ Chấp thuận nghiệm thu và cập nhật tọa độ As-Built trực tiếp.
     - $15\text{mm} < \Delta \le 35\text{mm}$: **WARNING** $\rightarrow$ Yêu cầu nắn chỉnh ty treo/giá đỡ hiện trường trước khi ký BBNT.
     - $\Delta > 35\text{mm}$: **CRITICAL DEFECT** $\rightarrow$ Tự động sinh Phiếu không phù hợp (NCR) và chặn xuất bản vẽ hoàn công.

---

## 2. QUY CHUẨN KHUNG DẤU BẢN VẼ HOÀN CÔNG (PHỤ LỤC II - NĐ 06/2021/NĐ-CP)

### 2.1. Mẫu số 01: Áp dụng cho Nhà thầu độc lập / Tổng thầu không có Thầu phụ

Kích thước tiêu chuẩn: $120\text{mm} \times 60\text{mm}$.

```
┌────────────────────────────────────────────────────────┐
│                   BẢN VẼ HOÀN CÔNG                     │
├────────────────────────────────────────────────────────┤
│ Tên nhà thầu: [Tên Tổng thầu / Nhà thầu thi công]      │
├──────────────────────────┬─────────────────────────────┤
│   NGƯỜI LẬP BẢN VẼ       │    CHỈ HUY TRƯỞNG           │
│   (Ký và ghi rõ họ tên)  │    (Ký và ghi rõ họ tên)    │
├──────────────────────────┴─────────────────────────────┤
│   TƯ VẤN GIÁM SÁT TRƯỞNG (HOẶC GIÁM SÁT TRƯỞNG CĐT)    │
│   (Ký và ghi rõ họ tên)                                │
│   Ngày ..... tháng ..... năm 202...                    │
└────────────────────────────────────────────────────────┘
```

### 2.2. Mẫu số 02: Áp dụng khi có Nhà thầu phụ thi công

Kích thước tiêu chuẩn: $120\text{mm} \times 80\text{mm}$.

```
┌────────────────────────────────────────────────────────┐
│                   BẢN VẼ HOÀN CÔNG                     │
├────────────────────────────────────────────────────────┤
│ Tên nhà thầu chính: [Tên Tổng thầu / Nhà thầu chính]   │
│ Tên nhà thầu phụ:   [Tên Nhà thầu phụ thi công]        │
├──────────────────────────┬─────────────────────────────┤
│   NGƯỜI LẬP BẢN VẼ       │    CHỈ HUY TRƯỞNG THẦU PHỤ  │
│   (Ký và ghi rõ họ tên)  │    (Ký và ghi rõ họ tên)    │
├──────────────────────────┼─────────────────────────────┤
│   CHỈ HUY TRƯỞNG THẦU CHÍNH│  TƯ VẤN GIÁM SÁT TRƯỞNG    │
│   (Ký và ghi rõ họ tên)  │    (Ký và ghi rõ họ tên)    │
│   Ngày ..... tháng ..... năm 202...                    │
└────────────────────────────────────────────────────────┘
```

---

## 3. CÔNG THỨC ĐỐI SOÁT MA TRẬN KHỐI LƯỢNG QUYẾT TOÁN 3 CHIỀU ($\Delta \text{QTO}$)

Hệ thống tính toán cân đối khối lượng thực tế hoàn công phục vụ quyết toán hợp đồng:

$$\Delta \text{QTO}_{\text{Quyết toán}} = \text{QTO}_{\text{As-Built}} - \text{QTO}_{\text{Hợp đồng}} - \text{QTO}_{\text{Phát sinh VO đã duyệt}}$$

- Nếu $|\Delta \text{QTO}_{\text{Quyết toán}}| \le 0.01$ (Khối lượng khớp tuyệt đối): **Status = `RECONCILED_CLEAN`** $\rightarrow$ Cho phép đóng hồ sơ quyết toán.
- Nếu $\Delta \text{QTO}_{\text{Quyết toán}} > 0$ (Khối lượng thực tế vượt khối lượng hợp đồng + VO): **Status = `OVERRUN_UNAPPROVED_RISK`** $\rightarrow$ Cảnh báo rủi ro xuất toán, yêu cầu bổ sung Phụ lục Hợp đồng.
- Nếu $\Delta \text{QTO}_{\text{Quyết toán}} < 0$ (Khối lượng thực tế thi công ít hơn hợp đồng): **Status = `DEDUCTION_SAVINGS`** $\rightarrow$ Tự động tính toán giá trị giảm trừ quyết toán cho Chủ đầu tư.

---

## 4. QUY TRÌNH KÝ SỐ 3 BÊN & ĐÓNG GÓI HỘ CHIẾU BÀN GIAO SỐ (LOD 500 PASSPORT)

```
[Bản vẽ As-Built & BBNT] ──► [Ký số 3 Bên SHA-256] ──► [Cân đối QTO] ──► [Gốc Cây Merkle Ledger] ──► [LOD 500 Digital Passport]
```

1. **Ký số Điện tử 3 Bên (Paperless 3-Way Smart e-Sign):**
   - **Bên 1:** Kỹ sư Shopdrawing / Kỹ thuật Nhà thầu ký số vào lớp chữ ký `SIG_CONTRACTOR_AUTHOR`.
   - **Bên 2:** Chỉ huy trưởng công trường ký số vào lớp chữ ký `SIG_SITE_COMMANDER`.
   - **Bên 3:** Tư vấn Giám sát trưởng / Giám đốc Dự án CĐT ký duyệt vào lớp `SIG_SUPERVISOR_LEAD`.
2. **Niêm phong Mật mã & Merkle Root Hash:**
   - Tập hợp mã băm SHA-256 của toàn bộ bản vẽ As-Built DWG/PDF, biên bản nghiệm thu BBNT, chứng chỉ vật liệu CO/CQ, và kết quả chạy thử T&C.
   - Nối vào Cây Merkle bất biến của dự án (`engineering_merkle_roots`), sinh chứng chỉ Token số:
     $$\text{Token Passport} = \text{"SIG-PASSPORT-LOD500-" } + \text{SHA256}(Dossier)_{\text{first 24 chars}}$$
3. **Bàn giao Vận hành Bản sao số sống (Living Digital Twin Handover):**
   - Tích hợp dữ liệu thuộc tính tài sản (Asset Tagging, Serial, Thông số kỹ thuật, Chu kỳ bảo trì MTBF/RUL) trực tiếp vào mô hình BIM/CAD phục vụ chuyển giao sang hệ thống Quản lý Tòa nhà BMS / CAFM.

---

### 4.3. [Cẩm nang kỹ thuật] autolisp-templates

# MẪU CODE AUTOLISP & AUTOCAD SCRIPT CHUẨN KỸ THUẬT (AUTOLISP TEMPLATES)

Tài liệu cung cấp các đoạn mã AutoLISP chuẩn mẫu giúp AI Agent sinh mã vẽ tự động (Autonomous Drafting) các chi tiết lắp đặt điển hình, giá đỡ và ký hiệu kỹ thuật.

---

## 1. Cấu Trúc Khung Chuẩn Của Một Lệnh AutoLISP

Mọi hàm AutoLISP sinh ra phải tuân thủ chuẩn cấu trúc an toàn, lưu/khôi phục biến hệ thống (`osmode`, `cmdecho`, `clayer`) và có xử lý lỗi `*error*`:

```lisp
;;; =========================================================================
;;; LỆNH: C:XBOSS_DRAW_TRAPEZE
;;; MÔ TẢ: Tự động vẽ chi tiết mặt cắt Giá Đỡ Đa Tầng (Trapeze Hanger)
;;; =========================================================================
(defun c:XBOSS_DRAW_TRAPEZE (/ old-osmode old-cmdecho old-layer pt-ins width depth rod-dia)
  ;; Xử lý lỗi an toàn
  (defun *error* (msg)
    (if old-osmode (setvar "OSMODE" old-osmode))
    (if old-cmdecho (setvar "CMDECHO" old-cmdecho))
    (if old-layer (setvar "CLAYER" old-layer))
    (princ (strcat "\n[XBOSS-CAD] Lỗi hoặc Hủy lệnh: " msg))
    (princ)
  )

  (setq old-cmdecho (getvar "CMDECHO"))
  (setq old-osmode (getvar "OSMODE"))
  (setq old-layer (getvar "CLAYER"))
  (setvar "CMDECHO" 0)
  (setvar "OSMODE" 0)

  ;; Tạo hoặc chuyển layer chuẩn
  (if (not (tblsearch "LAYER" "M-HVAC-SUPP"))
    (command "-LAYER" "M" "M-HVAC-SUPP" "C" "4" "" "")
  )
  (setvar "CLAYER" "M-HVAC-SUPP")

  ;; Nhập thông số hình học (hoặc truyền tự động)
  (setq pt-ins (getpoint "\nChọn điểm gốc treo trần (Insertion Point): "))
  (if pt-ins
    (progn
      (setq width 600.0)    ; Bề rộng thanh Unistrut (mm)
      (setq depth 800.0)    ; Chiều dài ty treo hạ trần (mm)
      (setq rod-dia 10.0)   ; Đường kính ty M10 (mm)

      ;; 1. Vẽ Ty Treo Trái & Phải
      (setq pt-top-l (list (- (car pt-ins) (/ width 2.0)) (cadr pt-ins) 0.0))
      (setq pt-bot-l (list (- (car pt-ins) (/ width 2.0)) (- (cadr pt-ins) depth) 0.0))
      (command "._LINE" pt-top-l pt-bot-l "")

      (setq pt-top-r (list (+ (car pt-ins) (/ width 2.0)) (cadr pt-ins) 0.0))
      (setq pt-bot-r (list (+ (car pt-ins) (/ width 2.0)) (- (cadr pt-ins) depth) 0.0))
      (command "._LINE" pt-top-r pt-bot-r "")

      ;; 2. Vẽ Thanh Unistrut Đỡ Dưới (Thép U 41x41)
      (setq pt-strut-l (list (- (car pt-ins) (/ width 2.0) 25.0) (- (cadr pt-ins) depth) 0.0))
      (setq pt-strut-r (list (+ (car pt-ins) (/ width 2.0) 25.0) (- (cadr pt-ins) depth) 0.0))
      (command "._RECTANG" pt-strut-l (list (car pt-strut-r) (- (cadr pt-strut-r) 41.0) 0.0))

      ;; 3. Thêm Text Ghi Chú Kỹ Thuật
      (if (not (tblsearch "LAYER" "M-ANNO-TEXT"))
        (command "-LAYER" "M" "M-ANNO-TEXT" "C" "7" "" "")
      )
      (setvar "CLAYER" "M-ANNO-TEXT")
      (command "._MTEXT" (list (car pt-ins) (- (cadr pt-ins) depth 60.0) 0.0)
               "J" "MC" "H" "25" (list (+ (car pt-ins) 200.0) (- (cadr pt-ins) depth 80.0) 0.0)
               "GIÁ ĐỠ UNISTRUT 41x41 - TY M10" "")

      (princ "\n[XBOSS-CAD] Đã hoàn thành vẽ chi tiết giá đỡ Trapeze.")
    )
  )

  ;; Khôi phục biến hệ thống
  (setvar "OSMODE" old-osmode)
  (setvar "CMDECHO" old-cmdecho)
  (setvar "CLAYER" old-layer)
  (princ)
)
```

---

## 2. Kịch Bản AutoCAD Script (`.scr`) Chuyển Đổi & Dọn Dẹp Bản Vẽ

Dùng để chạy hàng loạt (Batch Processing) không cần mở giao diện:

```scr
;;; XBOSS BATCH CLEANUP SCRIPT
FILEDIA 0
CMDECHO 0
-PURGE ALL * N
-PURGE REGAPPS * N
AUDIT Y
-LAYER SET "0" ""
ZOOM E
QSAVE
QUIT
```

---

## 3. Mẫu AutoLISP Vẽ Lỗ Mở Xuyên Dầm (Sleeve Opening Detail)

```lisp
(defun DrawSleeveOpening (ptCenter pipeDia sleeveDia wallThickness / pt1 pt2 pt3 pt4)
  (setq radius (/ sleeveDia 2.0))
  ;; Vẽ vòng tròn sleeve bao ngoài
  (command "._CIRCLE" ptCenter radius)
  ;; Vẽ vòng tròn đường ống bên trong
  (command "._CIRCLE" ptCenter (/ pipeDia 2.0))
  ;; Vẽ đường bao vật liệu chèn chống cháy (Firestop Sealant)
  (command "._HATCH" "ANSI31" 1.0 0.0 "L" "")
)
```

---

### 4.4. [Cẩm nang kỹ thuật] cad-layer-standards

# HỆ THỐNG CHUẨN LAYER CAD & BẢNG MÃ MÀU MEPF (AIA / BS1192 STANDARDS)

Tài liệu quy định cấu trúc tên layer, mã màu AutoCAD Index Color (ACI) và trọng số nét vẽ (Lineweight) chuẩn cho toàn bộ dự án trên XBoss.

---

## 1. Cấu Trúc Đặt Tên Layer (AIA Standard Naming Convention)

Cú pháp chuẩn: `<Ngành>-<Hệ thống>-<Thực thể>-<Mô tả/Trạng thái>`

| Ký hiệu Ngành | Ý nghĩa                                | Ví dụ hệ thống                                                                                          |
| :------------ | :------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| **`M-`**      | Cơ khí & HVAC (Mechanical)             | `M-HVAC-DUCT` (Ống gió), `M-HVAC-PIPE` (Ống Chiller), `M-HVAC-EQPM` (Thiết bị AHU/FCU)                  |
| **`P-`**      | Cấp thoát nước (Plumbing & Sanitation) | `P-PLUM-DOMW` (Cấp nước sinh hoạt), `P-PLUM-SANR` (Thoát nước thải), `P-PLUM-VENT` (Thông hơi)          |
| **`F-`**      | Phòng cháy chữa cháy (Fire Fighting)   | `F-PROT-SPKL` (Đầu phun Sprinkler), `F-PROT-PIPE` (Ống cứu hỏa chính), `F-PROT-EQPM` (Tủ vòi PCCC)      |
| **`E-`**      | Điện & Điện nhẹ (Electrical & ELV)     | `E-POWR-CABL` (Cáp nguồn), `E-POWR-TRAY` (Máng cáp), `E-LITE-FIXT` (Đèn), `E-COMM-DATA` (Mạng Lan/CCTV) |
| **`S-`**      | Kết cấu (Structural)                   | `S-COLS` (Cột), `S-BEAM` (Dầm), `S-SLAB` (Sàn), `S-WALL` (Vách)                                         |
| **`A-`**      | Kiến trúc (Architectural)              | `A-WALL` (Tường xây), `A-DOOR` (Cửa đi), `A-GLAZ` (Vách kính/Cửa sổ)                                    |

---

## 2. Bảng Mã Màu (ACI) & Trọng Số Nét Vẽ Chuẩn

| Tên Layer          | Mô tả Thực thể                           |      Mã màu ACI      | RGB Tương đương | Lineweight (mm) |
| :----------------- | :--------------------------------------- | :------------------: | :-------------: | :-------------: |
| `M-HVAC-DUCT-SUPP` | Ống gió cấp (Supply Air Duct)            |     **4 (Cyan)**     |  `0, 255, 255`  |     0.35 mm     |
| `M-HVAC-DUCT-RETN` | Ống gió hồi (Return Air Duct)            |   **6 (Magenta)**    |  `255, 0, 255`  |     0.35 mm     |
| `M-HVAC-DUCT-EXHT` | Ống gió thải/hút khói (Exhaust)          |     **1 (Red)**      |   `255, 0, 0`   |     0.35 mm     |
| `M-HVAC-PIPE-CHWS` | Ống Chiller Cấp (Cold Supply)            |     **5 (Blue)**     |   `0, 0, 255`   |     0.40 mm     |
| `M-HVAC-PIPE-CHWR` | Ống Chiller Hồi (Cold Return)            |  **150 (Sky Blue)**  |  `0, 127, 255`  |     0.40 mm     |
| `P-PLUM-DOMW-COLD` | Ống cấp nước lạnh sinh hoạt              |    **3 (Green)**     |   `0, 255, 0`   |     0.35 mm     |
| `P-PLUM-DOMW-HOTP` | Ống cấp nước nóng                        |    **2 (Yellow)**    |  `255, 255, 0`  |     0.35 mm     |
| `P-PLUM-SANR-SOIL` | Ống thoát phân/nước bẩn (uPVC/HDPE)      |   **30 (Orange)**    |  `255, 127, 0`  |     0.40 mm     |
| `F-PROT-PIPE-MAIN` | Ống chính chữa cháy vách tường/Sprinkler |     **1 (Red)**      |   `255, 0, 0`   |     0.50 mm     |
| `E-POWR-TRAY-MAIN` | Máng cáp điện động lực (Cable Tray)      |    **2 (Yellow)**    |  `255, 255, 0`  |     0.30 mm     |
| `E-COMM-TRAY-DATA` | Máng cáp điện nhẹ (ELV Trunking)         | **130 (Cyan/Green)** |  `0, 255, 127`  |     0.30 mm     |
| `*-*-ANNO-TEXT`    | Văn bản ghi chú, kích thước (Dimension)  | **7 (White/Black)**  | `255, 255, 255` |     0.18 mm     |
| `*-*-ANNO-DIMS`    | Đường kích thước đo đạc                  |  **8 (Dark Gray)**   | `128, 128, 128` |     0.13 mm     |

---

## 3. Quy Chuẩn Xử Lý Bảng Mã Font Tiếng Việt trong Bản Vẽ Cũ

Khi phân tích bản vẽ DWG/DXF cũ, bắt buộc chuyển đổi các chuỗi ký tự theo bảng ánh xạ:

1. **TCVN3 (ABC) sang UTF-8:**
   - Ký tự `a` có dấu: `¸` $\rightarrow$ à, `µ` $\rightarrow$ ả, `·` $\rightarrow$ ã, `¹` $\rightarrow$ á, `¹` $\rightarrow$ ạ.
   - Ký tự `ă` có dấu: `¨` $\rightarrow$ ă, `»` $\rightarrow$ ằ, `¾` $\rightarrow$ ẳ, `Æ` $\rightarrow$ ẵ, `¾` $\rightarrow$ ắ, `Æ` $\rightarrow$ ặ.
   - Ký tự `đ`: `®` $\rightarrow$ đ, `§` $\rightarrow$ Đ.
2. **VNI-Windows sang UTF-8:**
   - Số đuôi dấu thanh: `1` $\rightarrow$ sắc, `2` $\rightarrow$ huyền, `3` $\rightarrow$ hỏi, `4` $\rightarrow$ ngã, `5` $\rightarrow$ nặng.
   - Ký tự gốc kèm dấu mũ: `a8` $\rightarrow$ ă, `a6` $\rightarrow$ â, `e6` $\rightarrow$ ê, `o6` $\rightarrow$ ô, `o7` $\rightarrow$ ơ, `u7` $\rightarrow$ ư, `d9` $\rightarrow$ đ.

---

### 4.5. [Cẩm nang kỹ thuật] clash-solver-and-generative-shopdrawing

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

---

### 4.6. [Cẩm nang kỹ thuật] drawing-defect-taxonomy-and-healing

# CẨM NANG PHÂN LOẠI 12 DỊ TẬT BẢN VẼ & GIẢI THUẬT TỰ CHỮA LÀNH (DRAWING DEFECT TAXONOMY & AUTO-HEALING)

Tài liệu này định nghĩa chi tiết 12 dạng dị tật bản vẽ đầu vào (từ 2D CAD DWG/DXF đến mô hình 3D IFC/Revit), các tiêu chí nhận diện và giải thuật tự động nắn chỉnh/chữa lành cho nền tảng XBoss.

---

## 1. MA TRẬN 12 DẠNG DỊ TẬT BẢN VẼ

|  STT   | Nhóm Dị tật                | Dạng lỗi cụ thể                                  | Biểu hiện nhận biết                                                                                 | Mức độ rủi ro | Giải thuật xử lý tự động                                                                                                      |
| :----: | :------------------------- | :----------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :-----------: | :---------------------------------------------------------------------------------------------------------------------------- |
| **01** | **Dữ liệu & Ký tự**        | Lỗi font chữ tiếng Việt `.shx` / TCVN3 / VNI     | Chữ hiển thị dấu hỏi `???`, ký tự rác `®`, `µ`, `¶`                                                 |    Medium     | Ánh xạ bảng mã ký tự nhị phân sang chuẩn Unicode UTF-8 (`font_shx_converter.py`).                                             |
| **02** | **Tỷ lệ & Đơn vị**         | Lệch tỷ lệ (Scale Mismatch) & Hệ đơn vị          | Kích thước dim ghi $1000\text{mm}$ nhưng đo hình học thực tế là $1.0\text{m}$ hoặc $39.37\text{in}$ |     High      | Tự động phân tích tỷ lệ giữa DimText và chiều dài Entity thực tế, chuẩn hóa về hệ Mét/Milimét ($1:1$).                        |
| **03** | **Cấu trúc Tầng Layer**    | Layer hỗn tạp, vẽ sai layer chuyên ngành         | Ống thoát nước nằm trong layer `0`, `Defpoints` hoặc `E-LIGHT`                                      |    Medium     | Phân loại ngữ nghĩa đối tượng bằng AI/Pattern Matching và chuyển về hệ layer chuẩn AIA/BS1192.                                |
| **04** | **Thuộc tính Thực thể**    | Block vỡ, thiếu Dynamic Attributes               | Block van/bơm không có thông số DN, công suất kW, lưu lượng $m^3/h$                                 |     High      | Khôi phục Schema thuộc tính từ Catalog chuẩn XBoss (`cad_block_catalog`), điền giá trị mặc định theo loại thiết bị.           |
| **05** | **Xung đột Hình học Cứng** | Ống/Máng cáp cắt ngang Dầm/Cột bê tông           | Bounding Box AABB giao cắt với thể tích khối dầm chịu lực                                           |   Critical    | Đề xuất hạ cao độ ống hoặc tìm vị trí khoét lỗ hợp lệ theo nguyên tắc dầm $L/3$.                                              |
| **06** | **Xuyên Dầm Trái Phép**    | Lỗ mở xuyên dầm ngoài khoảng cho phép            | Tim ống xuyên dầm tại vị trí $x < L/3$ hoặc $x > 2L/3$, hoặc cách mép dầm $< 50\text{mm}$           |   Critical    | Tự động dịch chuyển tim xuyên vào vùng an toàn $L/3 \le x \le 2L/3$, kiểm tra tỷ lệ $D_{\text{sleeve}} \le H_{\text{dầm}}/3$. |
| **07** | **Triệt tiêu Độ dốc**      | Ống thoát nước bị bẻ võng/ngược độ dốc           | Hướng dốc có gradient $< 1.0\%$ hoặc dốc ngược ($z_{\text{sau}} > z_{\text{trước}}$)                |   Critical    | **Bảo toàn Độ dốc Trọng lực:** Cố định cao độ ống thoát $1-2\%$, ép các hệ áp lực (Nước cấp, Cứu hỏa) uốn lượn né tránh.      |
| **08** | **Xung đột Mềm**           | Khoảng cách bảo ôn nhiệt $< 50\text{mm}$         | Khoảng cách hình học giữa 2 ống/máng cáp song song nhỏ hơn độ dày bông thủy tinh/Armaflex           |     High      | Tự động mở rộng khoảng hở tim ống $S_{\text{clear}} \ge D_1/2 + D_2/2 + t_{\text{ins1}} + t_{\text{ins2}} + 50\text{mm}$.     |
| **09** | **Vi phạm Thủy lực**       | Vận tốc dòng chảy hoặc lưu lượng vượt ngưỡng     | Ống nước cấp $v > 2.5\text{m/s}$, ống hút bơm $v > 1.2\text{m/s}$, ống gió chính $v > 10\text{m/s}$ |     High      | Áp dụng công thức Hazen-Williams / Darcy-Weisbach, tự động đề xuất tăng cỡ đường kính danh định (DN / WxH).                   |
| **10** | **Bất nhất Đa bộ môn**     | Lệch tim trục hộp gen (Shaft) giữa AR - ST - MEP | Hộp kỹ thuật kiến trúc lệch so với lỗ khoét sàn kết cấu và tim ống đứng MEP                         |   Critical    | Bắn cảnh báo RFI đa bên, tự động lấy tim trục kết cấu (Structural Grid) làm hệ quy chiếu gốc (Single Source of Truth).        |
| **11** | **Chênh lệch Khối lượng**  | Vênh khối lượng CAD so với BOQ mời thầu          | Khối lượng bóc tách hình học vượt quá $\pm 5\%$ so với bảng khối lượng hợp đồng                     |     High      | Kích hoạt Động cơ Đối soát 3 Chiều (`compute3WayVariance`), tự động phát hiện rủi ro phát sinh (VO Risk).                     |
| **12** | **Thiếu Chi tiết Chế tạo** | Bản vẽ sơ phác LOD 200 thiếu phụ kiện thi công   | Tuyến ống dài không chia đoạn Spool, thiếu bích, ty treo, côn cút thực tế                           |    Medium     | Tự động chuyển đổi LOD 200 $\rightarrow$ LOD 400 DfMA (`convertToLod400Dfma`), chia đoạn $\le 5.8\text{m}$ và chèn bích.      |

---

## 2. GIẢI THUẬT TỰ ĐỘNG NẮN CHỈNH & CHỮA LÀNH (AUTO-HEALING RECIPES)

### 2.1. Giải thuật Chữa lành Tỷ lệ & Đơn vị (Scale Healing Algorithm)

Khi nhập bản vẽ CAD, hệ thống phân tích tỷ lệ giữa chuỗi kích thước ghi trên DimText ($D_{\text{text}}$) và khoảng cách tọa độ thực giữa 2 điểm đo ($L_{\text{coord}} = \sqrt{\Delta x^2 + \Delta y^2}$):

$$\text{Scale Ratio } K = \frac{D_{\text{text}}}{L_{\text{coord}}}$$

- Nếu $K \approx 1000 \rightarrow$ Bản vẽ đang vẽ theo mét nhưng dim theo milimét $\rightarrow$ Áp dụng hệ số co giãn $Scale(1000, 1000, 1000)$ về hệ chuẩn $\text{mm}$.
- Nếu $K \approx 25.4 \rightarrow$ Bản vẽ đang ở hệ Inch $\rightarrow$ Chuyển đổi toàn bộ tọa độ nhân với $25.4$.
- Nếu $K \approx 1.0 \rightarrow$ Tỷ lệ chuẩn $1:1$.

### 2.2. Giải thuật Chữa lành Font Ký tự Tiếng Việt (Vietnamese CAD Font Sanitizer)

Ánh xạ các byte ký tự đặc thù của bảng mã VNI / TCVN3 (ABC) sang bảng mã Unicode UTF-8 chuẩn xác:

```typescript
export function sanitizeCadVietnameseText(rawText: string): string {
  if (!rawText) return "";
  let text = rawText;

  // 1. Loại bỏ các mã định dạng nội bộ AutoCAD (ví dụ: \A1;, \P, %%u)
  text = text.replace(/\\[A-Z0-9]+;?/gi, "").replace(/%%[A-Z0-9]/gi, "");

  // 2. Chuyển đổi bảng mã TCVN3 (ABC) sang UTF-8
  const tcvn3Map: Record<string, string> = {
    µ: "à",
    "¸": "á",
    "¶": "ả",
    "·": "ã",
    "¹": "ạ",
    "¨": "ă",
    "¾": "ằ",
    "»": "ắ",
    "¼": "ẳ",
    "½": "ẵ",
    Æ: "ặ",
    "©": "â",
    Ç: "ầ",
    È: "ấ",
    É: "ẩ",
    Ê: "ẫ",
    Ë: "ậ",
    Ì: "è",
    Ð: "é",
    Î: "ẻ",
    Ï: "ẽ",
    Ñ: "ẹ",
    ª: "ê",
    Ò: "ề",
    Ó: "ế",
    Ô: "ể",
    Õ: "ễ",
    Ö: "ệ",
    "×": "ì",
    Ø: "í",
    Ù: "ỉ",
    Ú: "ĩ",
    Û: "ị",
    Ü: "ò",
    Ý: "ó",
    Þ: "ỏ",
    ß: "õ",
    à: "ọ",
    "«": "ô",
    á: "ồ",
    â: "ố",
    ã: "ổ",
    ä: "ỗ",
    å: "ộ",
    "¬": "ơ",
    æ: "ờ",
    ç: "ớ",
    è: "ở",
    é: "ỡ",
    ê: "ợ",
    ë: "ù",
    í: "ú",
    î: "ủ",
    ï: "ũ",
    ñ: "ụ",
    "­": "ư",
    ó: "ừ",
    ô: "ứ",
    õ: "ử",
    ö: "ữ",
    "÷": "ự",
    ø: "ỳ",
    ý: "ý",
    þ: "ỷ",
    ÿ: "ỹ",
    ỳ: "ỵ",
    "®": "đ",
    "§": "Đ",
  };

  for (const [src, dest] of Object.entries(tcvn3Map)) {
    text = text.split(src).join(dest);
  }

  return text.trim();
}
```

### 2.3. Giải thuật Tự Chữa Lành Độ Dốc (Gravity Slope Healing Algorithm)

Đối với các ống thoát nước tự chảy (Sanitary / Storm Drainage), độ dốc $S$ bắt buộc thỏa mãn:

$$0.01 \le S \le 0.02 \quad (\text{tương đương } 1\% - 2\%)$$

- Khi phân tích đoạn ống từ điểm $A(x_1, y_1, z_1)$ đến điểm $B(x_2, y_2, z_2)$:
  - Chiều dài phẳng: $L_{\text{plan}} = \sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}$.
  - Độ chênh cao thực tế: $\Delta z = z_1 - z_2$.
  - Nếu $\Delta z < 0$ (dốc ngược) hoặc $\Delta z / L_{\text{plan}} < 0.01$:
    - Tự động hiệu chỉnh cao độ điểm kết thúc:
      $$z_2^* = z_1 - (L_{\text{plan}} \times 0.015)$$
    - Gắn cờ thông báo tự động nắn chỉnh độ dốc về chuẩn $1.5\%$.

---

## 3. RANH GIỚI TỰ TRỊ XỬ LÝ LỖI BẢN VẼ (A0 - A2 BOUNDARIES)

1. **Cấp độ A2 (Tự động thực thi an toàn):**
   - Chuyển đổi font chữ UTF-8.
   - Chuẩn hóa tên Layer theo chuẩn AIA/BS1192.
   - Nắn chỉnh tỷ lệ bản vẽ theo DimText ($1:1$).
   - Bẻ uốn né va chạm $45^\circ$ cho ống cấp nước / máng cáp (không ảnh hưởng trần và kết cấu).
   - Chia đoạn ống gia công Spooling $\le 5.8\text{m}$ và chèn bích tiêu chuẩn.

2. **Cấp độ A1 (Tạo đề xuất RFI - Trình Kỹ sư duyệt):**
   - Khoét lỗ mở xuyên dầm bê tông cốt thép mới.
   - Thay đổi cao độ đáy ống làm hạ trần giả kiến trúc $> 50\text{mm}$.
   - Tăng cỡ đường kính ống dẫn tới thay đổi công suất bơm/quạt.
   - Chênh lệch khối lượng $\Delta \text{QTO} > 5\%$ dẫn tới rủi ro vượt dự toán hợp đồng.

---

### 4.7. [Cẩm nang kỹ thuật] ductwork-drift-and-diffuser-clearance-standards

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

---

### 4.8. [Cẩm nang kỹ thuật] engineering-rationale-and-annotation-standards

# QUY CHUẨN GHI CHÚ, GIẢI THÍCH LÝ DO KỸ THUẬT & TỪ ĐIỂN GIẢI TRÌNH CHẾ TẠO MEPF (ENGINEERING RATIONALE & ANNOTATION STANDARDS)

Tài liệu này chuẩn hóa ngôn ngữ, văn phong, cấu trúc giải trình kỹ thuật và các mẫu ghi chú thực chiến cho toàn bộ bản vẽ Shopdrawing, Spool Fabrication Sheet, Bảng kê cắt phôi và Phiếu Kitting Logistics trong XBoss.

---

## 1. NGUYÊN TẮC GHI CHÚ THỰC CHIẾN (THE 4 CLARITY INVARIANTS)

1. **Minh Bạch Số Liệu (Data Provenance):** Mọi kích thước cắt ($L_{\text{cut}}$) bắt buộc phải giải trình rõ từ kích thước thiết kế gốc ($L_{\text{c-to-c}}$) đã trừ đi bao nhiêu milimét ở từng đầu phụ kiện và bù bao nhiêu milimét dung sai hiện trường.
2. **Giải Thích Rõ Ràng Lý Do Kỹ Thuật (Engineering Rationale):** Không chỉ đưa ra con số mà phải giải thích _tại sao_ (Ví dụ: tại sao gót hộp gió phải rộng hơn $+10\text{mm}$, tại sao măng xông chỉ trừ $2\text{mm}$, tại sao ống thẳng bị cắt ngắn $186\text{mm}$).
3. **Chỉ Dẫn Thi Công Từng Bước (Step-by-Step Field Instructions):** Mỗi đốt Spool và hộp gió phải kèm hướng dẫn thao tác rõ ràng để công nhân và thợ xưởng không cần hỏi lại kỹ sư.
4. **Không Thừa - Không Thiếu:** Câu từ cô đọng, chuẩn thuật ngữ cơ điện Việt Nam kết hợp quốc tế (uPVC, PPR, Grooved Victaulic, TDC/TDF, VCD, FD, OBD).

---

## 2. BỘ MẪU GIẢI TRÌNH KỸ THUẬT TIÊU CHUẨN (STANDARD RATIONALE DICTIONARY)

### 2.1 Bù Trừ Kích Thước Cắt Ống ($L_{\text{cut}}$ vs $L_{\text{c-to-c}}$)

> _"Kích thước tâm-tâm $L_{\text{c-to-c}} = 3000\text{mm}$. Đầu 1 (Elbow 90° DN114) trừ $58\text{mm}$ (Center-to-Face $122\text{mm}$ - Độ sâu ngập socket $64\text{mm}$); Đầu 2 (Elbow 90° DN114) trừ $58\text{mm}$. Chiều dài cắt thực tế $L_{\text{cut}} = 2884\text{mm}$."_

### 2.2 Đặc Trị Bẫy Măng Xông Nối Thẳng (Coupling Stop Trap)

> _"Măng xông nối thẳng uPVC DN114 dài tổng $132\text{mm}$, độ sâu ngập mỗi bên $64\text{mm}$, gờ chặn giữa dày $4\text{mm}$. Lượng trừ mối nối của mỗi đầu ống chỉ bằng đúng một nửa gờ chặn $\Delta L = 2\text{mm}$ để ống đút ngập trọn vẹn chạm khít đáy gờ chặn. Tuyệt đối không trừ cả chiều dài măng xông làm hụt ống."_

### 2.3 Đoạn Đóng Tuyến Bù Dung Sai Hiện Trường (Closing Spool / Pup Piece)

> _"Đốt đóng tuyến kết nối thiết bị — Đã cộng $+50\text{mm}$ dung sai hiện trường (Field Fit Allowance). Thợ đo khoảng cách thực tế sau khi định vị thiết bị/bê tông rồi mới cắt tinh chỉnh trước khi dán/hàn nối cố định."_

### 2.4 Dung Sai Gót Hộp Gió $+10\text{mm}$ & Viền Miệng Gió Che Phủ

> _"Cổ miệng gió nhôm danh nghĩa $450\times 450\text{mm}$. Gót hộp gió gia công lọt lòng $460\times 460\text{mm}$ (rộng hơn đúng $+10\text{mm}$, tức $+5\text{mm}$ mỗi mép) để cổ miệng gió trượt vào nhẹ nhàng, không bị kích kẹt bavia tôn và góc gập. Viền mặt miệng gió $600\times 600\text{mm}$ có cánh phủ $75\text{mm}$ che kín hoàn toàn $100\%$ khe hở $5\text{mm}$ trên mặt trần. Cổ trích spigot $D=195\text{mm}$ (nhỏ hơn ống mềm $5\text{mm}$) để lồng ống mềm D200 dễ dàng."_

### 2.5 Bù Trừ Dài Dôi Tuyến Ống Gió & Căn Chuẩn Tim Trần $600\times 600\text{mm}$

> _"Tuyến ống gió có 2 mối bích TDC ($+6\text{mm}$) và 1 van gió VCD ($+180\text{mm}$) làm dôi chiều dài tích lũy $+186\text{mm}$. Để giữ đúng $100\%$ tim miệng gió vào tâm ô trần $600\times 600\text{mm}$, đoạn ống thẳng thiết kế lý thuyết $3000\text{mm}$ được tự động cắt ngắn còn $2814\text{mm}$ (sai lệch tim trần $= 0.0\text{mm}$)."_

### 2.6 Độ Chùng & Uốn Cong Ống Gió Mềm (Sag Factor)

> _"Khoảng cách hình học từ ống gió xuống hộp gió $1.2\text{m}$ được cắt thực tế $1.35\text{m}$ (bù $+12\%$ hệ số uốn chùng - Sag Factor) để ống mềm nhôm bọc bông thủy tinh lượn cong $90^\circ$ mượt mà vào cổ trích, không bị bẹp gập (Kinking) gây sụt áp lưu lượng khí."_

---

## 3. QUY TRÌNH KIỂM TRA CHẤT LƯỢNG GHI CHÚ TRƯỚC KHI XUẤT XƯỞNG

1. **Khớp nối dữ liệu:** Mọi số liệu trong phần giải trình phải khớp tuyệt đối với BOM và tọa độ 3D.
2. **Không dùng ký hiệu bí hiểm:** Mọi ký hiệu viết tắt phải có chú giải đi kèm (ví dụ: SW = Shop Weld / Mối hàn xưởng, FW = Field Weld / Mối hàn hiện trường).
3. **Mã QR liên kết:** Quét mã QR phải hiển thị đầy đủ văn bản giải trình kỹ thuật và hướng dẫn lắp đặt trực quan.

---

### 4.9. [Cẩm nang kỹ thuật] mepf-hydraulic-formulas

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

---

### 4.10. [Cẩm nang kỹ thuật] pipe-spooling-and-fitting-deduction-standards

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

---

### 4.11. [Cẩm nang kỹ thuật] vietnam-norms-mapping

# BẢNG ÁNH XẠ ĐỊNH MỨC DỰ TOÁN MEPF THEO THÔNG TƯ 12/2021/TT-BXD

Tài liệu cung cấp bảng ánh xạ tự động giữa các thực thể hình học CAD/BIM và mã hiệu định mức xây dựng Việt Nam phục vụ bóc tách QTO và lập dự toán (BOQ).

---

## 1. Hệ Thống Cấp Thoát Nước & Thiết Bị Vệ Sinh (Chương BB - TT12/2021/TT-BXD)

| Loại Cấu Kiện CAD / BIM    | Tiêu Chí Phân Loại         | Mã Hiệu Định Mức |    Đơn Vị     | Ghi Chú Kỹ Thuật              |
| :------------------------- | :------------------------- | :--------------- | :-----------: | :---------------------------- |
| **Ống nhựa PPR hàn nhiệt** | $D \le 32\text{mm}$        | `BB.11101`       | $100\text{m}$ | Cấp nước lạnh/nóng trong nhà  |
| **Ống nhựa PPR hàn nhiệt** | $32 < D \le 63\text{mm}$   | `BB.11102`       | $100\text{m}$ | Trục cấp nước chính           |
| **Ống nhựa PPR hàn nhiệt** | $63 < D \le 110\text{mm}$  | `BB.11103`       | $100\text{m}$ | Trục đứng cấp nước            |
| **Ống uPVC dán keo**       | $D \le 60\text{mm}$        | `BB.12101`       | $100\text{m}$ | Thoát nước nhánh bồn rửa      |
| **Ống uPVC dán keo**       | $60 < D \le 114\text{mm}$  | `BB.12102`       | $100\text{m}$ | Thoát phân, thoát sàn         |
| **Ống uPVC dán keo**       | $114 < D \le 200\text{mm}$ | `BB.12103`       | $100\text{m}$ | Trục đứng thoát nước mưa/thải |
| **Van cổng đồng ren**      | $DN \le 50\text{mm}$       | `BB.21101`       |      Cái      | Van chặn nhánh vệ sinh        |
| **Van bướm tay gạt/quay**  | $50 < DN \le 150\text{mm}$ | `BB.22102`       |      Cái      | Van chặn trục đứng/phòng bơm  |

---

## 2. Hệ Thống Thông Gió & Điều Hòa Không Khí (Chương BA - TT12/2021/TT-BXD)

| Loại Cấu Kiện CAD / BIM                     | Tiêu Chí Phân Loại                      | Mã Hiệu Định Mức |    Đơn Vị    | Ghi Chú Kỹ Thuật                                  |
| :------------------------------------------ | :-------------------------------------- | :--------------- | :----------: | :------------------------------------------------ |
| **Gia công lắp đặt ống gió tôn mạ kẽm**     | Độ dày $\delta = 0.58\text{mm}$         | `BA.11101`       | $\text{m}^2$ | Chu vi ống $\le 1000\text{mm}$                    |
| **Gia công lắp đặt ống gió tôn mạ kẽm**     | Độ dày $\delta = 0.75\text{mm}$         | `BA.11102`       | $\text{m}^2$ | Chu vi $1000 < P \le 2500\text{mm}$               |
| **Gia công lắp đặt ống gió tôn mạ kẽm**     | Độ dày $\delta = 0.95\text{mm}$         | `BA.11103`       | $\text{m}^2$ | Chu vi $2500 < P \le 4000\text{mm}$               |
| **Bảo ôn ống gió bằng cao su lưu hóa**      | Dày $19\text{mm} - 25\text{mm}$         | `BA.21201`       | $\text{m}^2$ | Dán keo chuyên dụng chống đọng sương              |
| **Lắp đặt miệng gió khuếch tán (Diffuser)** | Kích thước $\le 600\times 600\text{mm}$ | `BA.31101`       |     Cái      | Kèm hộp gió (Plenum Box)                          |
| **Lắp đặt Van dập lửa (FD/VCD)**            | Tiết diện $\le 0.5\text{m}^2$           | `BA.41101`       |     Cái      | Kèm cầu chì nhiệt $70^\circ\text{C}$ hoặc động cơ |

---

## 3. Hệ Thống Điện & Điện Nhẹ (Chương BD - TT12/2021/TT-BXD)

| Loại Cấu Kiện CAD / BIM                  | Tiêu Chí Phân Loại                       | Mã Hiệu Định Mức |    Đơn Vị     | Ghi Chú Kỹ Thuật                  |
| :--------------------------------------- | :--------------------------------------- | :--------------- | :-----------: | :-------------------------------- |
| **Lắp đặt thang máng cáp sơn tĩnh điện** | Chiều rộng $W \le 200\text{mm}$          | `BD.11201`       | $100\text{m}$ | Kèm nắp đậy và phụ kiện co nối    |
| **Lắp đặt thang máng cáp sơn tĩnh điện** | $200 < W \le 600\text{mm}$               | `BD.11202`       | $100\text{m}$ | Máng cáp chính tầng kỹ thuật      |
| **Kéo rải cáp đồng Cu/XLPE/PVC**         | Tiết diện $S \le 16\text{mm}^2$          | `BD.21101`       | $100\text{m}$ | Luồn trong ống luồn/trên máng cáp |
| **Kéo rải cáp đồng Cu/XLPE/PVC**         | $16 < S \le 50\text{mm}^2$               | `BD.21102`       | $100\text{m}$ | Cáp nguồn phụ tải máy lạnh/bơm    |
| **Kéo rải cáp đồng Cu/XLPE/PVC**         | $50 < S \le 240\text{mm}^2$              | `BD.21104`       | $100\text{m}$ | Cáp nguồn lộ tổng từ tủ MSB       |
| **Lắp đặt tủ điện phân phối treo tường** | Kích thước $\le 1000\times 800\text{mm}$ | `BD.31101`       |      Cái      | Đã bao gồm đấu nối nội bộ tủ      |

---

## 4. Công Thức Quy Đổi Kích Thước Hình Học Sang Khối Lượng Định Mức

1. **Diện tích ống gió tôn chữ nhật ($S_{\text{duct}}$ tính bằng $\text{m}^2$):**
   \[
   S_{\text{duct}} = 2 \times (W + H) \times L \times 1.15 \text{ (Hệ số diện tích bích nẹp và hao hụt)}
   \]
2. **Khối lượng cáp điện ($L_{\text{cable}}$ tính bằng $\text{m}$):**
   \[
   L_{\text{cable}} = L_{\text{routing}} \times 1.05 + 2 \times H_{\text{drop}} + L_{\text{spare}}
   \]
   _(Trong đó $H_{\text{drop}}$ là độ cao hạ từ trần vào tủ điện, $L_{\text{spare}} = 0.5 - 1.0\text{m}$ đoạn uốn đấu nối tủ)._

---
