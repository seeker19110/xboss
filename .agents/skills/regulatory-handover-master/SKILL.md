---
name: regulatory-handover-master
description: "Quy chuẩn quản trị pháp lý xây dựng, kiểm soát điều kiện khởi công Điều 107 Luật Xây dựng, thẩm duyệt PCCC/ĐTM, cảnh báo sớm gia hạn giấy phép 30 ngày, kiểm định an toàn máy nghiêm ngặt Thông tư 36/2019/TT-BLĐTBXH, thử nghiệm cân chỉnh T&C, HVAC TAB, chạy thử liên động 10 phân hệ PCCC/BMS, nghiệm thu công trình theo Điều 24 Nghị định 06/2021/NĐ-CP, quyết toán vốn hoàn thành và bàn giao hồ sơ số COBie / Digital Twin LOD 500 trong XBoss. Bắt buộc kích hoạt khi xử lý pháp lý, giấy phép, chạy thử hệ thống, nghiệm thu bàn giao hoặc quyết toán công trình."
---

# REGULATORY, COMMISSIONING & HANDOVER MASTER — PHÁP LÝ KHỞI CÔNG, THỬ NGHIỆM LIÊN ĐỘNG & BÀN GIAO COBie SỐ

Bộ Master Skill này đóng gói toàn bộ tri thức pháp lý xây dựng Việt Nam (Luật Xây dựng 2014 & Luật sửa đổi 62/2020/QH14, Luật PCCC, Luật Bảo vệ Môi trường), kiểm soát điều kiện khởi công Điều 107, quét cảnh báo gia hạn 30/15/7 ngày, kiểm định an toàn máy móc nghiêm ngặt theo **Thông tư 36/2019/TT-BLĐTBXH**, thử nghiệm chạy thử liên động PCCC/BMS, cân bằng khí động học HVAC TAB theo NEBB/ASHRAE 202, nghiệm thu cơ quan chuyên môn theo **Điều 24 Nghị định 06/2021/NĐ-CP**, danh mục hồ sơ hoàn thành 8 tập **Phụ lục VI**, quyết toán vốn đầu tư theo **Thông tư 96/2021/TT-BTC & Nghị định 99/2021/NĐ-CP**, và tiêu chuẩn bàn giao tài sản số **COBie / ISO 19650-3** cho nền tảng XBoss.

---

## 1. MƯỜI HAI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 12 APEX INVARIANTS)

1. **Bất biến Điều Kiện Khởi Công 6 Tiêu Chí (Article 107 Permit-to-Start Invariant):** Không được kích hoạt kế hoạch thi công thực tế trên hệ thống nếu chưa đạt $100\%$ 6 điều kiện khởi công theo Điều 107 Luật Xây dựng: (1) Mặt bằng sạch, (2) Giấy phép XD, (3) BVTC được duyệt, (4) Hợp đồng thi công, (5) Biện pháp An toàn/Môi trường, (6) Thông báo khởi công trước 03 ngày.
2. **Bất biến Cảnh Báo Sớm Pháp Lý 30/15/7 Ngày (Proactive Legal Expiry Invariant):** Hệ thống BẮT BUỘC tự động quét và gửi cảnh báo trước 30, 15 và 7 ngày đối với: Giấy phép xây dựng, Giấy phép xả thải, Bảo lãnh ngân hàng, Chứng chỉ hành nghề kỹ sư và Tem kiểm định thiết bị thi công.
3. **Bất biến Khóa Cấp Phép Làm Việc Máy Nghiêm Ngặt (Strict Machinery Inspection Lock):** Thiết bị có yêu cầu nghiêm ngặt theo **Thông tư 36/2019/TT-BLĐTBXH** (Cần trục tháp, Vận thăng, Cần bơm bê tông, Bình tích áp) tuyệt đối KHÔNG ĐƯỢC PHÉP vận hành nếu chưa có Giấy kiểm định an toàn còn hiệu lực và Thợ vận hành có Thẻ an toàn Nhóm 3.
4. **Bất biến Thử Nghiệm An Toàn Liên Động 10 Phân Hệ PCCC (PCCC Interlocking Safety Invariant):** Trước khi mời Cảnh sát PCCC nghiệm thu, $100\%$ các kịch bản liên động an toàn bắt buộc phải đạt $100\%$: Báo cháy $\rightarrow$ Dừng quạt AHU $\le 3$s $\rightarrow$ Đóng van MFD $\le 5$s $\rightarrow$ Bật quạt hút khói/tăng áp thang $\le 15$s $\rightarrow$ Hạ thang máy về tầng 1 $\le 30$s $\rightarrow$ Mở khóa cửa Mag-lock $\le 1$s $\rightarrow$ Phát âm thanh sơ tán PA $\le 5$s $\rightarrow$ Máy phát điện ATS $\le 15$s.
5. **Bất biến Cân Bằng Khí Động Học HVAC TAB Dung Sai $\pm 10\%$ (HVAC TAB Tolerance Invariant):** Sai lệch lưu lượng gió thực tế tại từng miệng gió so với lưu lượng thiết kế không được vượt quá dung sai chuẩn NEBB/ASHRAE: $-10\% \le \frac{Q_{\text{actual}} - Q_{\text{design}}}{Q_{\text{design}}} \le +10\%$.
6. **Bất biến Thử Áp Lực Thủy Tĩnh 2 Giờ (Hydrostatic Pressure Test Invariant):** Thử áp lực đường ống nước (Cấp nước, PCCC, Chiller) phải duy trì ở mức $1.5 \times P_{\text{làm việc}}$ trong tối thiểu **2 giờ liên tục**, độ sụt áp $\Delta P \le 0.02\text{ MPa}$ ($0.2\text{ bar}$) kèm biểu đồ áp kế điện tử IoT.
7. **Bất biến Độ Kín Khói Tuyến Ống Gió Chuẩn DW143 (Duct Leakage Invariant):** Tỷ lệ rò rỉ khí cho phép không vượt quá $Q_{\text{leakage, max}} = C \times P^{0.65}$ ($\text{l/s/m}^2$).
8. **Bất biến Danh Mục Hồ Sơ Hoàn Thành 8 Tập (Appendix VI Decree 06 Invariant):** Bộ hồ sơ hoàn thành bàn giao công trình phải đóng gói đầy đủ 8 tập theo Phụ lục VI Nghị định 06/2021/NĐ-CP.
9. **Bất biến Khung Dấu Hoàn Công Pháp Lý (NĐ 06/2021/NĐ-CP Invariant):** Bản vẽ hoàn công bắt buộc phải có khung dấu hoàn công chuẩn kích thước $120\text{mm} \times 60\text{mm}$ (Mẫu số 01 - 3 chữ ký) hoặc $120\text{mm} \times 80\text{mm}$ (Mẫu số 02 - 4 chữ ký) tại góc dưới bên phải.
10. **Bất biến Hộ Chiếu Dữ Liệu Bàn Giao COBie LOD 500 (COBie Handover Completeness Invariant):** Toàn bộ thiết bị bàn giao sang BMS/FM bắt buộc phải có đủ 6 trường dữ liệu số: `{Asset Tag, Serial No, Model, Manufacturer, Warranty End Date, O&M Manual Link}`.
11. **Bất biến Khớp Quyết Toán Không Lệch Số (Zero-Discrepancy Final Settlement Invariant):**
    $$\text{Giá trị Quyết toán A-B} = \text{Giá trị Hợp đồng Gốc} + \sum \text{VO Duyệt} \pm \text{Trượt giá} - \sum \text{IPC Đã TT} - \text{Phạt/Giảm trừ}$$
12. **Bất biến Sổ Cái Bàn Giao Mật Mã Merkle (Merkle Provenance Invariant):** Bản vẽ hoàn công, BBNT, kết quả T&C và $\Delta\text{QTO}$ quyết toán được băm SHA-256 đóng vào Cây Merkle xuất Living Digital Twin Passport.

---

## 2. QUY TRÌNH 6 GIAI ĐOẠN PHÁP LÝ & BÀN GIAO HOÀN CÔNG

```
[G1: Khởi Công & Giấy Phép Đ107] ──► [G2: Kiểm Định Máy TT36] ──► [G3: Thử Nghiệm T&C & Liên Động PCCC]
                                                                                │
                                                                                ▼
[G6: Bàn Giao Digital Twin COBie] ◄── [G5: Nghiệm Thu Điều 24 & Quyết Toán] ◄── [G4: Hoàn Công & Hồ Sơ 8 Tập]
```
