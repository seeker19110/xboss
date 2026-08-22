---
name: cad-bim-dfma-master
description: "Quy chuẩn kỹ thuật chuyên sâu và quy trình tự động hóa CAD/BIM, MEPF Engineering, bóc tách QTO/Micro-BOM, giải quyết xung đột không gian (Clash Solver), chia đốt DfMA Spool LOD 400, tối ưu cắt phôi (1D/2D Nesting & Remnant Pool), chuỗi cung ứng mua sắm vật tư PO/GRN, khớp 3 chiều và đánh giá 6D Carbon LCA trong XBoss. Bắt buộc kích hoạt khi phân tích, thiết kế bản vẽ, chia đốt gia công, bóc tách vật tư hoặc quản lý mua sắm cung ứng DfMA."
---

# CAD/BIM & DfMA SUPPLY CHAIN MASTER — QUY CHUẨN THIẾT KẾ, CHẾ TẠO DfMA & CHUỖI CUNG ỨNG VẬT TƯ

Bộ Master Skill này đóng gói toàn bộ tri thức kỹ thuật không gian (Spatial Engineering), công thức tính toán thủy lực/khí động học MEPF, quy chuẩn phân tầng layer AIA/BS1192, giải thuật giải quyết xung đột không gian (Clash Solver), quy trình chia đốt chế tạo DfMA Spool LOD 400, tối ưu hóa cắt phôi 1D/2D (Nesting & Smart Remnant Pool), bóc tách Micro-BOM 5 cấp, cơ chế khớp đơn hàng 3 chiều bất biến (3-Way Matching PO/GRN/Invoice), kiểm soát chứng chỉ chất lượng CO/CQ/Mill Test, và đánh giá phát thải carbon ẩn 6D Carbon LCA theo tiêu chuẩn **ISO 14040/14044** cho nền tảng XBoss.

---

## 1. MƯỜI HAI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 12 APEX INVARIANTS)

1. **Bảo toàn Độ dốc Trọng lực (Gravity-Pipe Slope Invariant):** Tuyệt đối không được bẻ góc vượt chướng ngại vật làm triệt tiêu độ dốc của hệ thống thoát nước trọng lực ($1.0\% - 2.0\%$). Mọi xung đột giữa ống thoát nước và ống áp lực (Cấp nước, PCCC, Chiller) thì hệ áp lực bắt buộc phải uốn né $45^\circ$ qua hệ trọng lực.
2. **Nguyên tắc Vùng Khoét Dầm (Structural Penetration Zone):** Vị trí lỗ mở xuyên dầm bê tông cốt thép (Sleeve Opening) chỉ được đặt trong khoảng $1/3$ giữa nhịp dầm ($L/3 \le x \le 2L/3$) và cách mép trên/dưới dầm tối thiểu $50\text{mm}$. Đường kính ngoài ống luồn $D_{\text{sleeve}} \le H_{\text{dầm}}/3$. Tuyệt đối không khoét lỗ tại $1/3$ hai đầu dầm (vùng chịu lực cắt lớn).
3. **Bảo tồn Định dạng & Font Tiếng Việt (Zero Corruption):** Mọi văn bản CAD trích xuất từ font nhị phân `.shx`, VNI hoặc TCVN3-ABC phải được tự động chuyển đổi chuẩn xác sang Unicode UTF-8 trước khi lưu trữ vào cơ sở dữ liệu.
4. **Giới hạn Vận tốc Thủy lực & Khí động (Velocity Limit Invariant):**
   - Ống nước cấp/chiller: Vận tốc $v \le 1.5 - 2.5\text{m/s}$ (tránh xói mòn và tiếng ồn).
   - Ống hút bơm: $v \le 1.2\text{m/s}$ (chống xâm thực khí - cavitation).
   - Ống gió nhánh: $v \le 4.0 - 6.0\text{m/s}$; Ống gió trục chính: $v \le 8.0 - 10.0\text{m/s}$.
5. **Bảo toàn Bù trừ Dung sai Mối nối & Chiều dài Cắt Thực tế (Fitting Deduction & Cut-Length Invariant):** Chiều dài ống cắt thực tế ($L_{\text{cut}}$) tại xưởng chế tạo DfMA bắt buộc phải được bù trừ chính xác theo độ ngập âm phụ kiện (Socket Insertion Depth), gờ chặn măng xông ($t_{\text{stop}}$), chiều dài ren ăn khớp (Thread Makeup), khe hở rãnh Grooved, đệm gioăng mặt bích và khe hở đáy hàn, kết hợp dung sai hiện trường (Field Fit Allowance $+50\dots +100\text{mm}$) cho đốt đóng tuyến nhằm triệt tiêu hoàn toàn sai số lắp ráp và đạt tỷ lệ phế liệu toàn dự án $< 1.2\%$.
6. **Bất biến Ưu Tiên Tái Sử Dụng Phôi Thừa DfMA (Remnant-First Invariant):** Trước khi phát hành lệnh xuất kho cây thép/ống mới tiêu chuẩn $6.0\text{m}$, thuật toán cắt phôi DfMA BẮT BUỘC phải quét kho phôi thừa (`engineering_remnant_inventory`) để tận dụng các đoạn phôi có chiều dài khả dụng $L_{\text{remnant}} \ge L_{\text{required}}$.
7. **Bảo toàn Dung sai Thông thủy Gót Hộp Gió & Bù trừ Dài Tích Lũy Tuyến Ống Gió (Duct Diffuser Alignment Invariant):** Kích thước miệng đón / gót hộp gió ($W_{\text{plenum}} \times H_{\text{plenum}}$) bắt buộc phải rộng hơn cổ miệng gió đúng $+10\text{mm}$ ($+5\text{mm}$ mỗi mép); đồng thời độ dài dôi tích lũy từ bích TDC, bích V, nẹp C, van VCD/FD và khớp mềm canvas phải được bù trừ tự động bằng cách cắt ngắn đoạn ống thẳng liền kề để giữ đúng $100\%$ tim miệng gió vào ô trần thiết kế ($600\times 600\text{mm}$).
8. **Bất biến Phân tầng Hành lang Kỹ thuật & Khoảng cách Cách ly An toàn (Multi-Tier Corridor Invariant):** Thang máng cáp điện phải cách ống dẫn nhiệt / ống Chiller tối thiểu $150\text{mm}$ và bố trí phía trên (Tier 2) hoặc có khay hứng rò rỉ khi đi cùng hành lang với ống nước (Tier 3), ống gió đi trên cùng (Tier 1).
9. **Bất biến Khớp Đơn Hàng 3 Chiều Đại Số (3-Way Matching Algebraic Invariant):** Mọi đề nghị thanh toán tiền mua vật tư/thiết bị bắt buộc phải thỏa mãn hệ điều kiện:
   $$\begin{cases} Q_{\text{Invoice}} \le Q_{\text{GRN}} \le Q_{\text{PO}} \\ P_{\text{Invoice}} = P_{\text{PO}} \\ \Delta Q = |Q_{\text{Invoice}} - Q_{\text{GRN}}| \equiv 0 \\ \text{Vendor}_{\text{Invoice}} \equiv \text{Vendor}_{\text{PO}} \end{cases}$$
10. **Bất biến Chứng Chỉ Chất Lượng Trước Lắp Đặt (CO/CQ Pre-installation Invariant):** Tuyệt đối CẤM xuất kho lắp đặt cho bất kỳ lô vật tư/thiết bị nào nếu chưa có đầy đủ: (1) CO/CQ/Mill Test Report khớp $100\%$ số Heat No./Batch No.; (2) Biên bản nghiệm thu vật tư đầu vào có chữ ký TVGS.
11. **Bất biến Quản Lý Thiết Bị Dài Hạn Long-Lead (Long-Lead Critical Milestone Invariant):** Các thiết bị chính có thời gian sản xuất/nhập khẩu dài (Chiller, Biến áp, Máy phát, Bơm PCCC, Thang máy — lead time $\ge 12\dots 26$ tuần) bắt buộc phải lập lịch trình đảo ngược (Reverse Scheduling) gắn với Mốc bàn giao mặt bằng phòng máy (Room Custody Date).
12. **Bất biến Hạn mức Phát thải Carbon Ẩn (Embodied Carbon Cap Invariant):** Toàn bộ vật tư ống thép, tôn tráng kẽm, cáp đồng, nhựa PPR/uPVC phải được tính toán định mức carbon ẩn ($\text{kgCO}_2\text{e/m}^2$) theo ISO 14040/14044 và tự động xuất báo cáo đánh giá tín chỉ LEED / Công trình xanh.
13. **Bất biến Loại Bỏ Ảo Giác AI & Cấm Dữ Liệu Giả (Zero AI Hallucination & Zero Synthetic Data Invariant):** Tuyệt đối CẤM AI tự bịa đặt, phóng đại hoặc tự sinh khối lượng bóc tách (QTO), kích thước hình học, tọa độ, chủng loại vật tư, danh mục ống/ống gió, mã hiệu bản vẽ, xung đột không gian (Clashes), kết quả chẩn đoán lỗi CAD, đường cắt CNC/Nesting hay thông số kỹ thuật nếu không xuất phát trực tiếp từ tệp tin bản vẽ hình học thật (DWG/DXF/IFC), cơ sở dữ liệu PostgreSQL thực tế hoặc dữ liệu đầu vào người dùng cung cấp. Khi không có dữ liệu đầu vào hoặc cơ sở dữ liệu trống, BẮT BUỘC trả về trạng thái rỗng (Empty State) trung thực hoặc thông báo lỗi tham số, tuyệt đối CẤM âm thầm nạp dữ liệu mẫu/giả lập (mock/sample data).

---

## 2. QUY TRÌNH 8 BƯỚC TỰ ĐỘNG HÓA TỪ BẢN VẼ ĐẾN GIA CÔNG & MUA SẮM

```
[B1: Ingestion & Chẩn đoán Dị tật CAD] ──► [B2: Tự Chữa Lành & Clash Solver] ──► [B3: Multi-Tier Corridor & Trapeze]
                                                                                            │
                                                                                            ▼
[B6: Mua sắm PO & 3-Way Matching] ◄── [B5: Quét Remnant & Nesting 1D/2D] ◄── [B4: Chia Đốt Spool LOD 400 & Micro-BOM]
         │
         ▼
[B7: Tiếp nhận GRN & CO/CQ] ──► [B8: 6D Embodied Carbon Footprint LCA]
```

### Bước 1: Tiếp nhận Bản vẽ Đầu vào & Chẩn đoán Dị tật (Ingestion & Defect Diagnostic)

- Quét toàn bộ thực thể CAD/BIM phát hiện lỗi font `.shx`, scale sai lệch, tên layer không chuẩn AIA/BS1192, thuộc tính block bị thiếu.

### Bước 2: Tự Chữa Lành Dữ liệu & Động cơ Giải quyết Xung đột Không gian (Clash Solver)

- Tự động chuyển đổi font sang UTF-8. Áp dụng ma trận ưu tiên không gian: Hệ áp lực tự động uốn né $45^\circ$, bảo toàn độ dốc $1.0\% - 2.0\%$ cho hệ thoát nước, định vị lỗ mở dầm $L/3 \le x \le 2L/3$.

### Bước 3: Quy Hoạch Hành Lang Kỹ Thuật Đa Tầng & Tính Toán Kết Cấu Trapeze

- Tự động phân tầng cao độ 3 tầng: Tier 1 (Ống gió), Tier 2 (Máng cáp), Tier 3 (Ống nước/Chiller).
- Tính toán tải trọng phân bố $Q_{\text{factored}} = 1.4 \times Q_{\text{service}}$, kiểm tra ứng suất uốn $\sigma \le 160\text{MPa}$, độ võng $f \le L/360$, tự động chọn loại Unistrut và ty ren M10/M12/M16.

### Bước 4: Chia Đốt DfMA Spool LOD 400 & Bóc Tách Micro-BOM 5 Cấp

- Cắt phân đoạn Spool theo giới hạn vận chuyển thang máy ($\le 3.0\text{m}$) hoặc xe tải ($\le 6.0\text{m}$).
- Tự động tính toán trừ chiều sâu fitting deduction và cộng dung sai lắp ráp hiện trường $+50\dots +100\text{mm}$ cho đốt đóng tuyến.
- Bóc tách Micro-BOM 5 cấp: (1) Cụm Module $\rightarrow$ (2) Đoạn Spool $\rightarrow$ (3) Ống thẳng $\rightarrow$ (4) Phụ kiện co/lơ/tê/bích $\rightarrow$ (5) Vật tư tiêu hao bulong/que hàn/gioăng.

### Bước 5: Quét Kho Phôi Thừa & Tối Ưu Hóa Cắt Phôi (Nesting & Remnant)

- Quét kho phôi thừa `engineering_remnant_inventory` trước khi xuất cây mới.
- Chạy thuật toán 1D/2D Nesting (First-Fit Decreasing / Best-Fit Decreasing) với độ dày mạch cắt $Kerf = 3\text{mm}$, đảm bảo tỷ lệ hao hụt phế liệu $< 1.2\%$. Các đoạn thừa khả dụng $\ge 300\text{mm}$ tự động nhập lại kho phôi thừa.

### Bước 6: Lập Kế Hoạch Mua Sắm & Cơ Chế Khớp Đơn Hàng 3 Chiều

- Tự động sinh Yêu cầu mua sắm (PR) và Đơn đặt hàng (PO) từ Micro-BOM.
- Thiết lập cơ chế kiểm soát 3-Way Matching: $Q_{\text{Invoice}} \le Q_{\text{GRN}} \le Q_{\text{PO}}$ và $P_{\text{Invoice}} = P_{\text{PO}}$.

### Bước 7: Tiếp Nhận Hàng Hóa & Kiểm Soát CO/CQ/Mill Test

- Quét mã QR tiếp nhận vật tư tại hiện trường, đối soát Heat No./Batch No. với chứng chỉ CO/CQ và phiếu thí nghiệm xuất xưởng trước khi kích hoạt lệnh xuất kho lắp đặt.

### Bước 8: Đánh Giá Phát Thải Carbon Ẩn 6D LCA

- Tính toán tổng lượng phát thải $\text{TonCO}_2\text{e}$ theo hệ số phát thải ISO 14040/14044 cho từng chủng loại vật tư, đối chiếu hạn mức $\text{kgCO}_2\text{e/m}^2$ và ước tính điểm tín chỉ xanh LEED.
