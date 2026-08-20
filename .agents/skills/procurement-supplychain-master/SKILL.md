---
name: procurement-supplychain-master
description: "Quy chuẩn chuyên sâu về quản trị chuỗi cung ứng xây dựng (Construction Supply Chain), mua sắm vật tư thiết bị DfMA, quản lý đơn hàng PO/GRN, kiểm soát chứng chỉ chất lượng xuất xưởng CO/CQ/Mill Test, tối ưu hóa tồn kho an toàn và điều phối Logistics Just-In-Time (JIT) trong XBoss. Bắt buộc kích hoạt khi xử lý mua sắm, nhà cung cấp, kiểm soát kho hoặc kế hoạch cung ứng."
---

# PROCUREMENT & SUPPLY CHAIN MASTER — QUẢN TRỊ CHUỖI CUNG ỨNG & MUA SẮM DfMA ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức kỹ thuật quản trị chuỗi cung ứng xây dựng (Construction Supply Chain Management), quy hoạch nhu cầu vật tư đa tầng (Material Requirements Planning - MRP), mua sắm thiết bị chính có thời gian sản xuất dài (Long-Lead Items Procurement), cơ chế khớp 3 chiều bất biến (3-Way Matching Invariant), kiểm soát chứng chỉ chất lượng xuất xưởng CO/CQ/Mill Test theo tiêu chuẩn TCVN/ASTM, và quy chuẩn kho phôi thừa tái sử dụng DfMA (Smart Remnant Pool) cho nền tảng XBoss.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Bất biến Khớp Đơn Hàng 3 Chiều Đại Số (3-Way Matching Algebraic Invariant):**
   - Mọi đề nghị thanh toán tiền mua vật tư/thiết bị bắt buộc phải thỏa mãn hệ điều kiện bất biến 3 chiều:
     $$\begin{cases} Q_{\text{Invoice}} \le Q_{\text{GRN}} \le Q_{\text{PO}} \\ P_{\text{Invoice}} = P_{\text{PO}} \\ \Delta Q = |Q_{\text{Invoice}} - Q_{\text{GRN}}| \equiv 0 \\ \text{Vendor}_{\text{Invoice}} \equiv \text{Vendor}_{\text{PO}} \end{cases}$$
   - Mọi sai lệch về số lượng ($> 0\%$) hoặc đơn giá ($> 0\text{ VND}$) đều kích hoạt cảnh báo khóa thanh toán cho đến khi có phê duyệt giải trình từ Giám đốc Dự án.

2. **Bất biến Chứng Chỉ Chất Lượng Trước Lắp Đặt (CO/CQ Pre-installation Invariant):**
   - Tuyệt đối CẤM xuất kho lắp đặt cho bất kỳ lô vật tư/thiết bị nào nếu chưa có đầy đủ:
     1. Chứng chỉ xuất xứ (CO) và Chứng chỉ chất lượng (CQ) / Báo cáo thí nghiệm xuất xưởng (Mill Test Report) có số Heat No./Batch No. trùng khớp $100\%$ với mã dập trên thân vật tư.
     2. Biên bản kiểm tra nghiệm thu tiếp nhận vật tư đầu vào tại hiện trường có chữ ký xác nhận của Tư vấn Giám sát (TVGS).

3. **Bất biến Ưu Tiên Tái Sử Dụng Phôi Thừa DfMA (Remnant-First Invariant):**
   - Trước khi phát hành lệnh xuất kho cây thép/ống mới tiêu chuẩn $6.0\text{m}$, thuật toán cắt phôi DfMA BẮT BUỘC phải quét kho phôi thừa (`engineering_remnant_inventory`) để tận dụng các đoạn phôi có chiều dài khả dụng $L_{\text{remnant}} \ge L_{\text{required}}$, đảm bảo tỷ lệ phế liệu toàn dự án $< 1.2\%$.

4. **Bất biến Quản Lý Thiết Bị Dài Hạn Long-Lead (Long-Lead Critical Milestone Invariant):**
   - Các thiết bị chính có thời gian sản xuất và nhập khẩu dài (Chiller, Máy biến áp, Máy phát điện, Bơm PCCC, Thang máy — lead time $\ge 12\dots 26$ tuần) bắt buộc phải được lập lịch trình đảo ngược (Reverse Scheduling) gắn liền với Mốc bàn giao mặt bằng phòng máy (Room Custody Date).

5. **Bất biến Mức Tồn Kho An Toàn & Điểm Đặt Hàng Lại (Safety Stock & ROP Invariant):**
   - Đối với vật tư tiêu hao và phụ kiện (Nhóm C: ty ren, đai treo, bulong, co, tê, van), mức tồn kho an toàn ($SS$) và Điểm đặt hàng lại ($ROP$) được tính toán tự động:
     $$SS = Z \times \sigma_L \times \sqrt{L}, \quad ROP = (\bar{d} \times L) + SS$$
   - Khi tồn kho khả dụng $\le ROP$, hệ thống tự động sinh Yêu cầu Mua sắm (PR) đề xuất PM phê duyệt.

6. **Bất biến Khu Vực Cách Ly Vật Tư Lỗi (Quarantine Holding Area Invariant):**
   - Mọi lô vật tư giao thừa số lượng so với đơn hàng PO ($Q_{\text{GRN}} > Q_{\text{PO}}$), hoặc bao bì hư hỏng, hoặc chứng chỉ CO/CQ bị nghi ngờ làm giả BẮT BUỘC chuyển vào trạng thái `QUARANTINE` (Kho cách ly tạm thời) và bị khóa cứng trên phần mềm, không cho phép cấp phát thi công.

7. **Bất biến Mã Băm Toàn Vẹn QR Logistics (Barcode/QR Integrity Hash Invariant):**
   - Mỗi mã QR Logistics dán trên kiện hàng, pallet hoặc đầu ống phải chứa chuỗi mã băm bảo mật SHA-256 (8 ký tự đầu):
     $$\text{QR Payload} = \text{"XBOSS|PO:"} + \text{PO\_CODE} + \text{"|MAT:"} + \text{BOQ\_CODE} + \text{"|QTY:"} + Q + \text{"|TAG:"} + \text{TAG\_ID} + \text{"|H:"} + \text{SHA256}(Payload)_{\text{first 8}}$$
   - Quét mã QR sai mã băm sẽ lập tức kích hoạt cảnh báo hàng giả/tem giả tại cổng công trường.

8. **Bất biến Đánh Giá Năng Lực Nhà Cung Cấp Đa Trục (Vendor Scorecard Invariant):**
   - Xếp hạng Nhà cung cấp sau mỗi đợt giao hàng dựa trên ma trận 4 trọng số:
     $$S_{\text{Vendor}} = 0.40 \times S_{\text{Price}} + 0.30 \times S_{\text{Schedule}} + 0.20 \times S_{\text{Quality}} + 0.10 \times S_{\text{Payment}}$$
   - Nhà cung cấp rơi xuống Hạng D ($S < 60$) sẽ tự động bị khóa quyền tham gia đấu thầu các gói mới trong 6 tháng.

9. **Bất biến Khóa Tỷ Giá Ngoại Tệ Khi Nhập Khẩu (Currency Exchange Rate Lock Invariant):**
   - Các hợp đồng mua sắm thiết bị ngoại tệ (USD, EUR, JPY) phải được chốt tỷ giá hối đoái tại thời điểm mở L/C hoặc bảo lãnh thanh toán để triệt tiêu rủi ro biến động tỷ giá trong chi phí dự án.

10. **Bất biến Tải Trọng Giao Hàng & An Toàn Sàn (JIT Delivery Floor-Load Invariant):**
    - Khối lượng vật tư cấp phát tập kết lên từng sàn thi công (Work-Front Floor) không được vượt quá tải trọng tạm thời cho phép của kết cấu sàn ($Q_{\text{tập kết}} \le 250\text{kg/m}^2$), chia nhỏ lô giao hàng theo Lookahead 7 ngày.

---

## 2. QUY TRÌNH 10 BƯỚC KHÉP KÍN CHUỖI CUNG ỨNG & MUA SẮM DfMA

```
[B1: Hoạch định Nhu cầu MRP] ──► [B2: Đấu thầu & Vendor Matrix] ──► [B3: Chốt PO & Ký số Hợp đồng] ──► [B4: Giám sát Vận tải Long-Lead]
                                                                                                                │
                                                                                                                ▼
[B8: Cấp phát JIT Tầng thi công] ◄── [B7: Kho Phôi Thừa Remnant] ◄── [B6: Kiểm định QA CO/CQ] ◄── [B5: Quét QR Tiếp nhận Cổng]
        │
        ▼
[B9: Khớp 3 Chiều & Quyết toán PO] ──► [B10: Cập nhật Điểm Vendor Scorecard & Merkle]
```

### Bước 1: Hoạch định Nhu cầu Vật tư & Thiết bị (Material Requirements Planning - MRP)

- Bóc tách tự động danh mục vật tư từ mô hình BIM/Shopdrawing LOD 400 và tiến độ CPM 5 tầng. Phân rã 3 nhóm: Nhóm A (Long-Lead), Nhóm B (Theo tầng), Nhóm C (Tiêu hao an toàn).

### Bước 2: Đấu thầu Mua sắm & Đánh giá Ma trận Giá (Tendering & Price Matrix)

- Phát hành gói thầu mua sắm, so sánh bảng chào giá tự động và đánh giá xếp hạng hồ sơ năng lực nhà thầu phụ/nhà cung cấp.

### Bước 3: Phê duyệt Trúng thầu & Ký Số Đơn Đặt Hàng (Purchase Order - PO)

- Phát hành đơn đặt hàng chính thức có mã định danh toàn cầu `PO-XXXX`, kèm các điều khoản giao hàng Incoterms 2020 và tiến độ cam kết.

### Bước 4: Giám sát Sản xuất & Lộ trình Vận tải Thiết bị Dài hạn (Inbound Logistics)

- Theo dõi tiến độ chế tạo tại nhà máy, vận chuyển đường biển/hàng không và thủ tục thông quan hải quan thời gian thực.

### Bước 5: Tiếp nhận & Quét Mã QR Logistics Cổng Công Trường (`/engineering/qr-logistics`)

- Kỹ sư dùng camera điện thoại quét mã QR kiện hàng, đối chiếu PO, kiểm tra niêm phong chì và tự động sinh Phiếu nhập kho tạm (GRN).

### Bước 6: Thí nghiệm Kiểm định Chất lượng Đầu vào & Đối soát CO/CQ

- Lấy mẫu thí nghiệm cơ lý độc lập (thử kéo thép, thử nổ áp lực ống nhựa, đo cách điện cáp), ký số Biên bản nghiệm thu vật liệu đầu vào 3 bên.

### Bước 7: Quản trị Kho Phôi Thừa DfMA Tái Sử Dụng (Smart Remnant Pool)

- Đo đạc các đoạn ống/thép thừa $\ge 0.5\text{m}$, gắn mã Barcode Remnant và đưa vào kho ưu tiên cắt cho các đợt gia công Spool tiếp theo.

### Bước 8: Cấp phát Mặt bằng Thi công Just-In-Time (JIT Floor Delivery)

- Cấp phát vật tư trực tiếp lên từng tầng thi công theo Lookahead 7 ngày, kiểm soát tải trọng sàn $\le 250\text{kg/m}^2$.

### Bước 9: Đối Soát Khớp 3 Chiều Đại Số & Phê Duyệt Thanh Toán Hóa Đơn

- Khớp $\text{PO} \equiv \text{GRN} \equiv \text{Invoice}$, khấu trừ tạm ứng, phạt giao trễ hạn (nếu có) và lập lệnh thanh toán.

### Bước 10: Chấm Điểm Năng Lực Vendor Scorecard & Niêm Phong Sổ Cái Merkle

- Tự động cập nhật điểm số nhà cung cấp, đóng gói toàn bộ chứng chỉ chất lượng vào Hộ chiếu số LOD 500.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] mrp-demand-planning-and-safety-stock

# CẨM NANG HOẠCH ĐỊNH NHU CẦU VẬT TƯ (MRP) & TỒN KHO AN TOÀN

## 1. CÔNG THỨC MỨC TỒN KHO AN TOÀN & ĐIỂM ĐẶT HÀNG LẠI (SAFETY STOCK & ROP)

1. **Mức Tồn kho An toàn ($SS$):**
   $$SS = Z \times \sigma_d \times \sqrt{L}$$
   - $Z$: Hệ số độ tin cậy dịch vụ (với Service Level $95\% \rightarrow Z = 1.65$; với $99\% \rightarrow Z = 2.33$).
   - $\sigma_d$: Độ lệch chuẩn của nhu cầu tiêu thụ hàng ngày.
   - $L$: Thời gian chờ hàng giao (Lead time tính bằng ngày).

2. **Điểm Đặt hàng Lại ($ROP$ - Reorder Point):**
   $$ROP = (\bar{d} \times L) + SS$$
   - $\bar{d}$: Nhu cầu tiêu thụ trung bình hàng ngày.

3. **Lượng Đặt hàng Kinh tế ($EOQ$ - Economic Order Quantity):**
   $$EOQ = \sqrt{\frac{2 \times D \times S}{H}}$$
   - $D$: Tổng nhu cầu hàng năm (Annual Demand).
   - $S$: Chi phí cho mỗi lần đặt hàng (Order Cost).
   - $H$: Chi phí lưu kho cho 1 đơn vị hàng trong năm (Holding Cost).

---

### 3.2. [Cẩm nang kỹ thuật] three-way-matching-and-invoice-clearance

# CẨM NANG KHỚP ĐƠN HÀNG 3 CHIỀU & GIẢI TỎA HÓA ĐƠN MUA SẮM

## 1. THUẬT TOÁN KIỂM TRA ĐẠI SỐ KHỚP 3 CHIỀU

```typescript
export function evaluateThreeWayMatch(
  po: PurchaseOrder,
  grn: GoodsReceiptNote,
  invoice: VendorInvoice,
) {
  // 1. Kiểm tra Nhà cung cấp
  if (po.vendorId !== invoice.vendorId || po.vendorId !== grn.vendorId) {
    return {
      isMatch: false,
      reason: "Mã nhà cung cấp trên Hóa đơn/GRN không khớp với Đơn đặt hàng PO!",
    };
  }

  // 2. Kiểm tra Số lượng
  if (invoice.quantity > grn.quantityAccepted) {
    return {
      isMatch: false,
      reason: `Số lượng hóa đơn (${invoice.quantity}) vượt quá số lượng thực nhận đạt chuẩn trên GRN (${grn.quantityAccepted})!`,
    };
  }

  // 3. Kiểm tra Đơn giá
  if (invoice.unitPrice !== po.unitPrice) {
    return {
      isMatch: false,
      reason: `Đơn giá trên Hóa đơn (${invoice.unitPrice}) sai lệch so với đơn giá thỏa thuận trên PO (${po.unitPrice})!`,
    };
  }

  return { isMatch: true, payableAmount: invoice.quantity * po.unitPrice };
}
```

---

### 3.3. [Cẩm nang kỹ thuật] vendor-scorecard-and-award-matrix

# CẨM NANG MA TRẬN ĐÁNH GIÁ NHÀ CUNG CẤP (VENDOR SCORECARD)

## 1. CÔNG THỨC TÍNH ĐIỂM NĂNG LỰC TỔNG HỢP

$$S_{\text{Vendor}} = 0.40 \times S_{\text{Price}} + 0.30 \times S_{\text{Schedule}} + 0.20 \times S_{\text{Quality}} + 0.10 \times S_{\text{Payment}}$$

1. **Điểm Giá Cả ($S_{\text{Price}}$):**
   $$S_{\text{Price}} = \frac{\text{Giá Chào Thấp Nhất Hợp Lệ}}{\text{Giá Chào của Nhà Cung Cấp}} \times 100$$
2. **Điểm Tiến độ Giao hàng ($S_{\text{Schedule}}$):**
   $$S_{\text{Schedule}} = \frac{\text{Số Lô Hàng Giao Đúng Hạn}}{\text{Tổng Số Lô Hàng Đã Giao}} \times 100 - (\text{Số Ngày Trễ Lũy Kế} \times 2)$$
3. **Điểm Chất lượng & CO/CQ ($S_{\text{Quality}}$):**
   $$S_{\text{Quality}} = 100 - (\text{Tỷ lệ Hàng Lỗi \%} \times 5) - (\text{Số Lần Thiếu CO/CQ} \times 10)$$
4. **Điểm Điều khoản Thanh toán ($S_{\text{Payment}}$):**
   - Thanh toán sau 45-60 ngày: 100 điểm.
   - Thanh toán sau 30 ngày: 80 điểm.
   - Trả ngay khi nhận hàng: 50 điểm.
   - Tạm ứng trước $> 30\%$: 30 điểm.

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/procurement_calculator.ts](file:///c:/Users/liend/xboss/.agents/skills/procurement-supplychain-master/scripts/procurement_calculator.ts): Bộ kịch bản CLI kiểm chứng toàn bộ logic Khớp 3 chiều (3-Way Matching), tính toán Tồn kho an toàn & ROP, và chấm điểm Vendor Scorecard.
