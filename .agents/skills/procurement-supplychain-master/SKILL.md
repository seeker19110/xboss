---
name: procurement-supplychain-master
description: "Quy chuẩn chuyên sâu về quản trị chuỗi cung ứng xây dựng (Construction Supply Chain), mua sắm vật tư thiết bị DfMA, quản lý đơn hàng PO/GRN, kiểm soát chứng chỉ chất lượng xuất xưởng CO/CQ/Mill Test, tối ưu hóa tồn kho an toàn và điều phối Logistics Just-In-Time (JIT) trong XBoss. Bắt buộc kích hoạt khi xử lý mua sắm, nhà cung cấp, kiểm soát kho hoặc kế hoạch cung ứng."
---

# PROCUREMENT & SUPPLY CHAIN MASTER — QUẢN TRỊ CHUỖI CUNG ỨNG & MUA SẮM DfMA

Bộ Skill này đóng gói toàn bộ tri thức kỹ thuật quản trị chuỗi cung ứng xây dựng (Construction Supply Chain Management), quy trình mua sắm vật tư thiết bị dài hạn (Long-Lead Items Procurement), cơ chế khớp 3 chiều (3-Way Matching), kiểm soát chất lượng vật tư đầu vào theo **Nghị định 06/2021/NĐ-CP** và quy chuẩn kho phôi thừa thông minh (Smart Remnant Inventory Pool) cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC BẤT BIẾN (INVARIANTS)

1. **Bất biến Khớp Đơn Hàng 3 Chiều (3-Way Matching Invariant):**
   - Mọi khoản thanh toán mua sắm vật tư bắt buộc phải khớp tuyệt đối 3 chiều:
     \text{Đơn đặt hàng (PO)} \equiv \text{Phiếu nhập kho thực tế (GRN)} \equiv \text{Hóa đơn Nhà cung cấp (Vendor Invoice)}
   - Mọi sai lệch về số lượng ($> 0\%$) hoặc đơn giá ($> 0\text{ VND}$) đều kích hoạt cảnh báo chặn thanh toán cho đến khi có phê duyệt giải trình từ Giám đốc Dự án.

2. **Bất biến Chứng chỉ Chất lượng Trước Lắp đặt (CO/CQ Pre-installation Invariant):**
   - Tuyệt đối KHÔNG xuất kho lắp đặt cho bất kỳ lô vật tư/thiết bị nào nếu chưa có đầy đủ:
     1. Chứng chỉ xuất xứ (CO - Certificate of Origin) và Chứng chỉ chất lượng (CQ - Certificate of Quality) / Báo cáo thí nghiệm xuất xưởng (Mill Test Report).
     2. Biên bản nghiệm thu tiếp nhận vật tư đầu vào tại hiện trường (Receiving Inspection Record) có chữ ký xác nhận của Tư vấn Giám sát (TVGS).

3. **Bất biến Ưu tiên Tái sử dụng Phôi thừa (Remnant-First Nesting Invariant):**
   - Trước khi phát hành lệnh xuất kho cây thép/ống mới tiêu chuẩn .0\text{m}$, thuật toán cắt phôi DfMA BẮT BUỘC phải quét kho phôi thừa (Remnant Pool) để tận dụng các đoạn phôi có chiều dài khả dụng {\text{remnant}} \ge L_{\text{required}}$, đảm bảo tỷ lệ phế liệu toàn dự án $< 1.2\%$.

4. **Bất biến Quản lý Hàng Dài hạn (Long-Lead Critical Milestone Invariant):**
   - Các thiết bị chính có thời gian sản xuất và nhập khẩu dài (Chiller, Máy biến áp, Máy phát điện, Bơm PCCC, Thang máy - lead time $\ge 12\dots 20$ tuần) bắt buộc phải được lập lịch trình đảo ngược (Reverse Scheduling) gắn liền với Mốc bàn giao mặt bằng phòng máy (Room Custody Date).

---

## 2. QUY TRÌNH 5 BƯỚC QUẢN TRỊ CHUỖI CUNG ỨNG & MUA SẮM

`[B1: Kế hoạch Nhu cầu MRP] ──► [B2: Đấu thầu & Chốt PO] ──► [B3: Logistics & QR Cổng] ──► [B4: QA/QC CO/CQ] ──► [B5: Cấp phát JIT & Kho Phôi]`

### Bước 1: Hoạch định Nhu cầu Vật tư & Thiết bị (Material Requirements Planning - MRP)

- Phân tích bóc tách khối lượng từ mô hình BIM/Shopdrawing LOD 400 và tiến độ CPM 5 tầng.
- Phân nhóm danh mục vật tư:
  - **Nhóm A (Long-Lead/Thiết bị chính):** Chiller, AHU, Máy phát điện, Tủ trung thế $\rightarrow$ Đặt hàng trước - 6$ tháng.
  - **Nhóm B (Vật tư khối lượng lớn):** Ống thép, ống nhựa uPVC/PPR, dây cáp điện, tôn mạ kẽm $\rightarrow$ Đặt hàng theo đợt thi công từng tầng.
  - **Nhóm C (Vật tư phụ & Tiêu hao):** Ty treo, bu lông, gioăng, que hàn, băng keo $\rightarrow$ Duy trì định mức tồn kho an toàn (Safety Stock Buffer).

### Bước 2: Đấu thầu Mua sắm & Lựa chọn Nhà cung cấp (Tendering & Vendor Award)

- Phát hành gói thầu mua sắm ( ender_packages, ender_items).
- Đánh giá hồ sơ chào giá qua ma trận so sánh giá tự động (Price Matrix), xếp hạng Vendor Scorecard dựa trên 4 tiêu chí: Giá (\%$), Tiến độ giao hàng (\%$), Chất lượng/CO-CQ (\%$), và Điều khoản thanh toán (\%$).
- Phê duyệt trúng thầu và phát hành Đơn đặt hàng chính thức (purchase_orders) có mã định danh toàn cầu.

### Bước 3: Giám sát Vận tải & Tiếp nhận QR Logistics Cổng (Inbound Logistics & QR Check-in)

- Theo dõi hải quan và lộ trình vận chuyển hàng hóa thời gian thực.
- Tiếp nhận xe chở hàng tại cổng công trường (/engineering/qr-logistics):
  - Kỹ sư dùng camera quét mã QR/DataMatrix dán trên từng kiện pallet/đầu ống.
  - Đối chiếu mã PO, kiểm tra tính nguyên vẹn bao bì, niêm phong chì.
  - Sinh Phiếu tiếp nhận tạm (Goods Receipt Note - GRN) và tự động cập nhật trạng thái đơn hàng.

### Bước 4: Kiểm tra Chất lượng Vật tư Tiếp nhận & Phê duyệt Mẫu (Receiving QA/QC & Submittals)

- Đối chiếu quy cách kỹ thuật với Hồ sơ đệ trình vật liệu (Material Submittals) đã được TVGS và CĐT phê duyệt.
- Kiểm tra tính xác thực của CO/CQ, Phiếu kiểm nghiệm xuất xưởng và kết quả lấy mẫu thí nghiệm độc lập (nén kéo thép, thử áp lực mẫu ống, đo điện trở suất cáp).
- Ký số Biên bản kiểm tra nghiệm thu vật tư đầu vào 3 bên (/engineering/esign).

### Bước 5: Cấp phát Mặt bằng Just-In-Time (JIT) & Quản lý Kho Phôi DfMA

- Cấp phát vật tư trực tiếp lên từng tầng thi công (Work-Front Floor) theo kế hoạch Lookahead 7 ngày (tránh tập kết bừa bãi gây quá tải sàn và hư hỏng vật tư).
- Đồng bộ tồn kho phôi thừa (Remnant Inventory) vào CSDL: Mỗi đoạn ống/thép thừa $\ge 0.5\text{m}$ sau khi cắt Spool được gắn mã QR định danh và lưu vào kho phôi để tái sử dụng cho các tầng tiếp theo.

---

## 4. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 4.1. [Cẩm nang kỹ thuật] 3-way-matching-and-grn-standards

# CAM NANG KHOP DON HANG 3 CHIEU & TIEP NHAN KIEM DINH VAT TU CO/CQ

## 1. NGUYEN TAC KHOP 3 CHIEU (THE 3-WAY MATCHING INVARIANT)

Moi de nghi thanh toan tien mua vat tu thiet bi trong XBoss phai thoa man he dieu kien bat bien 3 chieu:

\begin{cases}
Q_{\text{Invoice}} \le Q_{\text{GRN}} \le Q_{\text{PO}} \\
P_{\text{Invoice}} = P_{\text{PO}} \\
\Delta Q = |Q_{\text{Invoice}} - Q_{\text{GRN}}| = 0 \\
\text{Vendor}_{\text{Invoice}} \equiv \text{Vendor}_{\text{PO}}
\end{cases}

### Quy tac xu ly sai lech:

1. **Sai lech Don gia ({\text{Invoice}} \ne P\_{\text{PO}}$):** Tu dong khoa luong thanh toan, thong bao Ky su Mua sam va PM. Khong cho phep phe duyet thanh toan tu dong neu khong co Phu luc dieu chinh don gia PO (contract_addenda).
2. **Giao thua so luong ({\text{GRN}} > Q_{\text{PO}}$):** Thu kho chi duoc ghi nhan phan {\text{PO}}$ vao hang kha dung; phan vuot tran tu dong chuyen sang kho cach ly tam (Quarantine Holding Area) cho xac nhan cua Nha cung cap.

---

## 2. QUY TRINH KIEM TRA CHUNG CHI XUAT XUONG CO/CQ & LAY MAU THI NGHIEM

Khi xe cho vat tu den cong cong truong:

1. **Kiem tra Chung chi Xuat xu (CO):** Do Phong Thuong mai hoac co quan nha nuoc co tham quyen tai nuoc xuat khau cap.
2. **Kiem tra Chung chi Chat luong (CQ) / Mill Test Certificate:** Phai co so lo hang (Heat Number/Batch No.) dap noi tren than vat tu trung khop \%$ voi phieu kiem nghiem.
3. **Lay mau Thi nghiem Doc lap:**
   - Thep xay dung: Cu 20 tan/lo lay 1 to mau keo uon (TCVN 1651:2018).
   - Ong nhua uPVC/PPR/HDPE: Kiem tra do day, thu ap luc no va do ben va dap (TCVN 8499:2010).
   - Day cap dien: Thu dien tro mot chieu ruot dan, do day vo cach dien va thu cach dien cao ap (TCVN 6610:2007).

---

### 4.2. [Cẩm nang kỹ thuật] long-lead-procurement-and-vendor-scorecard

# CẨM NANG VẬT TƯ DÀI HẠN (LONG-LEAD) & ĐÁNH GIÁ NĂNG LỰC NHÀ CUNG CẤP

## 1. QUẢN TRỊ DANH MỤC VẬT TƯ DÀI HẠN (LONG-LEAD MANAGEMENT)

Lịch trình mua sắm đảo ngược (Reverse Scheduling) theo công thức:

T_{\text{Order Date}} = T_{\text{Room Ready}} - (L_{\text{Production}} + L_{\text{Shipping}} + L_{\text{Customs}} + L_{\text{Site Buffer}})

| Thiết bị chính                                | Thời gian sản xuất ({\text{Prod}}$) | Vận chuyển & Hải quan | Buffer dự phòng | Tổng Lead-Time   |
| :-------------------------------------------- | :---------------------------------- | :-------------------- | :-------------- | :--------------- |
| Máy lạnh Chiller giải nhiệt nước              | 16 - 20 tuần                        | 4 tuần                | 2 tuần          | **22 - 26 tuần** |
| Máy phát điện dự phòng ($\ge 1500\text{kVA}$) | 14 - 18 tuần                        | 4 tuần                | 2 tuần          | **20 - 24 tuần** |
| Máy biến áp khô                               | 10 - 14 tuần                        | 2 tuần                | 2 tuần          | **14 - 18 tuần** |
| Thang máy tải khách cao tầng                  | 16 - 22 tuần                        | 4 tuần                | 3 tuần          | **23 - 29 tuần** |
| Bơm PCCC chính công suất lớn                  | 8 - 12 tuần                         | 3 tuần                | 2 tuần          | **13 - 17 tuần** |

---

## 2. MA TRẬN ĐÁNH GIÁ NHÀ CUNG CẤP (VENDOR SCORECARD)

Điểm số tổng hợp của Nhà cung cấp (Vendor Score):

S_{\text{Vendor}} = 0.40 \times S_{\text{Price}} + 0.30 \times S_{\text{Schedule}} + 0.20 \times S_{\text{Quality}} + 0.10 \times S_{\text{Payment}}

- **Hạng A ( \ge 85$ điểm):** Nhà cung cấp chiến lược, ưu tiên giao thầu gói lớn.
- **Hạng B ( \le S < 85$ điểm):** Đạt yêu cầu, theo dõi chặt chẽ tiến độ giao hàng.
- **Hạng C ( < 70$ điểm):** Cảnh báo, yêu cầu nâng mức bảo lãnh thực hiện đơn hàng lên \%$.

---
