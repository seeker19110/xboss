---
name: qs-cost-contracts-master
description: "Quy chuẩn chuyên sâu về định mức dự toán BOQ, quản lý hợp đồng xây dựng FIDIC 1999/2017, phân tích tác động đường găng TIA (Time Impact Analysis), lập hồ sơ khiếu nại bù trừ EOT/Cost Claims, mô phỏng dòng tiền Dynamic Cashflow và chứng chỉ thanh toán IPC trong XBoss. Bắt buộc kích hoạt khi xử lý chi phí, ngân sách, hợp đồng, thanh toán hoặc tranh chấp pháp lý."
---

# QS, COST & CONTRACTS MASTER — ĐỊNH MỨC DỰ TOÁN, FIDIC CLAIMS & QUẢN TRỊ DÒNG TIỀN

Bộ Skill này đóng gói toàn bộ tri thức kỹ sư định giá (Quantity Surveyor - QS), chuyên gia quản lý hợp đồng FIDIC (Red/Yellow Book), kỹ thuật phân tích tranh chấp tiến độ TIA (Delay & Disruption Protocol của SCL), và mô hình dự báo tài chính xây dựng cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC BẤT BIẾN (INVARIANTS)

1. **Thời hạn Thông báo Khiếu nại 28 ngày (FIDIC 28-Day Time-Bar Invariant):**
   - Theo Điều 20.1 (FIDIC 1999) và Điều 20.2 (FIDIC 2017), Nhà thầu BẮT BUỘC phải phát hành Thông báo Khiếu nại (Notice of Claim) trong vòng **28 ngày** kể từ khi nhận biết hoặc lẽ ra phải nhận biết sự kiện chậm trễ/phát sinh chi phí.
   - Nếu quá 28 ngày: Hệ thống phải tự động đánh dấu cờ rủi ro nghiêm trọng (Time-Bar Risk) và đề xuất các biện pháp bảo vệ quyền lợi hợp pháp (phân tích sự kiện tiếp diễn Continuous Event).
2. **Bất biến Tính toán Tiền tệ (Money Arithmetic Invariant):**
   - Tuyệt đối KHÔNG thực hiện phép cộng, trừ, nhân tiền tệ trên kiểu số thực dấu phẩy động (float) của JavaScript.
   - Mọi phép tính tiền tệ phải làm trong CSDL PostgreSQL (`NUMERIC`, `SUM`, `* rate`) hoặc chuyển qua `lib/money.ts` (`parseMoney`, `addMoney`, `mulRate` làm việc trên đơn vị BigInt = $đồng \times 100$).
3. **Bất biến Cân đối Thanh toán (IPC Balance Invariant):**
   $$\text{Giá trị Đề nghị Kỳ này (Net Payable)} = \text{Khối lượng Luỹ kế Kỳ này} - \text{Khối lượng Luỹ kế Kỳ trước} - \text{Thu hồi Tạm ứng} - \text{Giữ lại Bảo hành (5-10\%)} + \text{Phát sinh VO được duyệt}$$
4. **Tính Duy nhất của Mã BOQ (Global BOQ Code Invariant):**
   - Mã `boq_code` là định danh duy nhất trên toàn hệ thống cho cả công việc (`tasks`), gói thầu (`work_packages`) và vật tư (`materials`).

---

## 2. QUY TRÌNH 5 BƯỚC QUẢN TRỊ CHI PHÍ, HỢP ĐỒNG & FIDIC CLAIMS

```
[B1: Bóc tách BOQ & Định mức] ──► [B2: Quản trị Hợp đồng & Cam kết] ──► [B3: Giám sát Sự kiện Trễ & Notice] ──► [B4: Phân tích TIA & Lập Claim] ──► [B5: Nghiệm thu IPC & Cashflow S-Curve]
```

### Bước 1: Chuẩn hóa BOQ & Ánh xạ Định mức Xây dựng Việt Nam (BOQ & Norm Mapping)

- Phân rã khối lượng theo từng hệ thống (ACMV, Điện, Cấp thoát nước, PCCC, Kết cấu, Xây tô).
- Ánh xạ mã công việc sang Định mức dự toán Thông tư 12/2021/TT-BXD (Vật liệu, Nhân công, Máy thi công).
- Thiết lập đơn giá dự toán, đơn giá trúng thầu và phân bổ đơn giá chi tiết (Unit Rate Breakdown).

### Bước 2: Quản trị Hợp đồng, Bảo lãnh & Cam kết Chi (Contracts & Commitments)

- Theo dõi các loại hình hợp đồng: Trọn gói (Lump-sum), Đơn giá cố định (Fixed Unit Price), Đơn giá điều chỉnh (Adjustable Rate).
- Quản lý hạn bảo lãnh: Bảo lãnh thực hiện hợp đồng (Performance Bond), Bảo lãnh tạm ứng (Advance Payment Guarantee), Bảo lãnh bảo hành (Warranty Bond).
- Kiểm soát 3 tầng ngân sách: Ngân sách được duyệt (Budget) $\rightarrow$ Hợp đồng đã ký/Cam kết chi (Committed Cost) $\rightarrow$ Chi phí thực tế đã thanh toán (Actual Cost).

### Bước 3: Nhận diện Sự kiện Trễ & Trạm gác Thông báo 28 ngày (Delay Sentinel)

- Khi phát hiện sự kiện cản trở thi công do lỗi Chủ đầu tư / Tư vấn (chậm bàn giao mặt bằng, chậm trả lời RFI, chậm duyệt bản vẽ Shop, điều kiện địa chất bất khả kháng):
  - Tự động xác định Điều khoản FIDIC tương ứng (Điều 1.9, 2.1, 4.12, 8.4, 8.5, 10.2, 13.7...).
  - Tự động soạn thảo Thông báo Khiếu nại (Notice of Delay) gửi Chủ đầu tư/Tư vấn trong thời hạn 28 ngày.

### Bước 4: Phân tích Tác động Đường găng TIA & Hồ sơ Bồi thường (TIA & Claim Dossier)

- Thực hiện Time Impact Analysis (TIA): Chèn chuỗi công việc phát sinh (Fragnet) vào tiến độ CPM cơ sở ngay trước thời điểm xảy ra sự kiện để đo lường số ngày kéo dài tiến độ $(\Delta EOT)$.
- Tính toán chi phí quản lý gián tiếp hiện trường (Extended Site Overheads):
  $$\text{Overhead Cost} = \Delta EOT \times \text{Định phí ngày của Ban chỉ huy (Lương, lán trại, tiện ích, khấu hao)}$$
- Tính toán chi phí trượt giá nhân công/vật tư do kéo dài thời gian thi công.
- Tự động biên soạn Hồ sơ khiếu nại (Claim Dossier) song ngữ Anh - Việt đầy đủ 5 phần: Tóm tắt vụ việc, Cơ sở pháp lý/Điều khoản hợp đồng, Phân tích TIA, Bảng tính chi phí thiệt hại, và Tài liệu chứng cứ đính kèm.

### Bước 5: Chứng chỉ Thanh toán IPC & Mô phỏng Dòng tiền Dynamic Cashflow

- Lập chứng chỉ thanh toán khối lượng hoàn thành (Interim Payment Certificate - IPC).
- Tự động áp dụng công thức khấu trừ tạm ứng lũy tiến và trích giữ tiền bảo hành.
- Tích hợp xuất hóa đơn điện tử theo Nghị định 70/2025/NĐ-CP.
- Chạy mô phỏng dòng tiền Dynamic Cashflow S-Curve ($Cash\text{-}In$ vs $Cash\text{-}Out$) theo phân phối chuẩn tích lũy để dự báo trước 30/60/90 ngày nguy cơ thâm hụt vốn lưu động (Working Capital Deficit).

### Bước 6: Quyết Toán Hợp Đồng A-B, Bù Giá Trượt Giá & Quyết Toán Vốn Hoàn Thành

- **Công thức Bù giá Trượt giá đa thành phần:**
  $$P_n = P_0 \times \left( a + b \frac{L_n}{L_0} + c \frac{M_n}{M_0} + d \frac{E_n}{E_0} \right)$$
  _(với $a$ là tỷ lệ không điều chỉnh, $b, c, d$ là tỷ lệ nhân công, vật liệu, máy thi công)._
- **Đối soát Quyết toán Khối lượng Hoàn công 3 Chiều:**
  $$\Delta \text{QTO} = \text{QTO}_{\text{As-Built}} - \text{QTO}_{\text{BOQ Hợp đồng}} - \text{QTO}_{\text{VO được duyệt}}$$
- **Lập Bảng Quyết toán A-B Hợp đồng & Thanh lý Hợp đồng:** Khấu trừ toàn bộ tạm ứng, chuyển đổi tiền giữ lại sang Thư bảo lãnh bảo hành (`insurance_bonds`), chốt công nợ cuối cùng.
- **Báo cáo Quyết toán Vốn Đầu tư Dự án Hoàn thành (Thông tư 96/2021/TT-BTC & Nghị định 99/2021/NĐ-CP):** Tổng hợp toàn bộ chi phí xây dựng, thiết bị, quản lý dự án, tư vấn và chi phí khác phục vụ kiểm toán độc lập và cơ quan thẩm tra quyết toán.
