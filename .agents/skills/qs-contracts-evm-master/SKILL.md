---
name: qs-contracts-evm-master
description: "Quy chuẩn chuyên sâu về định mức dự toán BOQ theo Thông tư 12/2021/TT-BXD, quản lý hợp đồng xây dựng FIDIC 1999/2017, phân tích tác động đường găng TIA (Time Impact Analysis), phương pháp CPM, quản trị giá trị thu được EVM, lập hồ sơ khiếu nại bù trừ EOT/Cost Claims, mô phỏng dòng tiền Dynamic Cashflow S-Curve và chứng chỉ thanh toán IPC trên số học BigInt trong XBoss. Bắt buộc kích hoạt khi xử lý chi phí, ngân sách, hợp đồng, tiến độ, thanh toán hoặc tranh chấp pháp lý."
---

# QS, CONTRACTS & EVM MASTER — DỰ TOÁN BOQ, FIDIC CLAIMS, ĐIỀU ĐỘ CPM & QUẢN TRỊ EVM DÒNG TIỀN

Bộ Master Skill này đóng gói toàn bộ tri thức của Kỹ sư Định giá Trưởng (Chief QS), Chuyên gia Quản lý Hợp đồng Quốc tế FIDIC (Red/Yellow/Silver Book), Giao thức Phân tích Chậm trễ SCL Protocol, Định mức dự toán xây dựng Việt Nam (**Thông tư 12/2021/TT-BXD**), Thuật toán đường găng CPM (Critical Path Method), Quản trị Giá trị Thu được (EVM - Earned Value Management), Kế hoạch ngắn hạn Lookahead 7/14/21 ngày, Phân tích nguyên nhân chậm trễ Pareto, và Mô phỏng Dòng tiền Dynamic Cashflow S-Curve trên số học chuẩn xác BigInt (`lib/money.ts`) cho nền tảng XBoss.

---

## 1. MƯỜI HAI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 12 APEX INVARIANTS)

1. **Bất biến Thời Hạn Thông Báo Khiếu Nại 28 Ngày (FIDIC 28-Day Time-Bar Invariant):** Theo Điều 20.1 (FIDIC 1999) và Điều 20.2 (FIDIC 2017), Nhà thầu BẮT BUỘC phát hành Thông báo Khiếu nại (Notice of Claim) trong vòng **28 ngày** kể từ khi nhận biết hoặc lẽ ra phải nhận biết sự kiện chậm trễ/chi phí. Quá 28 ngày quyền đòi bồi thường bị triệt tiêu.
2. **Bất biến Tính Toán Tiền Tệ Chuẩn Xác Từng Xu (BigInt Money Arithmetic Invariant):** CẤM tính toán tiền tệ trên số thực dấu phẩy động `float` trong JavaScript. Mọi phép tính tiền tệ phải thực hiện trực tiếp trong PostgreSQL (`NUMERIC`, `SUM`, `* rate`) hoặc chuyển qua `lib/money.ts` (`BigInt = đồng * 100`).
3. **Bất biến Cân Đối Thanh Toán Chứng Chỉ IPC (IPC Balance Invariant):**
   $$NetPayable = \text{Luỹ kế Kỳ này} - \text{Luỹ kế Kỳ trước} - \text{Khấu trừ Tạm ứng Lũy tiến} - \text{Giữ lại Bảo hành (5-10\%)} + \text{Phát sinh VO Đã Duyệt}$$
4. **Tính Duy Nhất Toàn Cầu của Mã BOQCODE (Global BOQ Code Invariant):** Mã `boq_code` là định danh duy nhất trên toàn hệ thống cho cả công việc (`tasks`), gói thầu (`work_packages`) và vật tư (`materials`).
5. **Bất biến Thứ Bậc Đơn Giá Phát Sinh (Variation Order Valuation Hierarchy):** Đơn giá phát sinh (VO) tuân thủ thứ bậc Điều 12.3 FIDIC: (1) Đơn giá hợp đồng gốc $\rightarrow$ (2) Đơn giá tương tự điều chỉnh $\rightarrow$ (3) Chi phí thực tế hợp lý + Lợi nhuận định mức $5-10\%$.
6. **Bất biến Công Thức Giá Trị Thu Được EVM (EVM Mathematical Invariant):**
   - $PV = \text{Tỷ lệ Kế hoạch Baseline} \times BAC$; $EV = \text{Tỷ lệ Hoàn thành Thực tế} \times BAC$; $AC = \sum \text{Chi phí Thực tế}$
   - $SV = EV - PV$; $CV = EV - AC$; $SPI = EV / PV$; $CPI = EV / AC$; $CSI = CPI \times SPI$
   - $TCPI_{BAC} = \frac{BAC - EV}{BAC - AC}$; $TCPI_{EAC} = \frac{BAC - EV}{EAC - AC}$
7. **Bất biến Cấp Bậc Trạng Thái (Status Hierarchy Invariant):** Trạng thái `nghiem_thu` là trạng thái hoàn tất tuyệt đối pháp lý ($Progress = 100\%$ + Admin/PM duyệt `CAN.approve`). Mọi tiến trình tự động TUYỆT ĐỐI KHÔNG được hạ cấp `nghiem_thu` sang `tre` hay `dang_thi_cong`.
8. **Bất biến Đường Găng & Tổng Dự Trữ Bằng Không (Critical Path & Total Float Invariant):** Công việc thuộc Đường găng khi $\text{Total Float} (TF) = 0$ (hoặc $TF \le 0$ khi trễ). Mọi chậm trễ $\Delta t$ trên đường găng làm lùi ngày hoàn thành dự án đúng bằng $\Delta t$: $\Delta T_{\text{Project}} = \Delta t_{\text{Critical}}$.
9. **Bảo Tồn Mẫu Số Kế Hoạch Ma Trận (Denominator Persistence Invariant):** Khi cập nhật tiến độ ma trận WBS $N \times M$ (ví dụ Tầng $\times$ Trục), mẫu số tổng số ô $N_{\text{total}}$ là hằng số bảo toàn, không được tự ý giảm mẫu số để làm tăng ảo tỷ lệ hoàn thành.
10. **Bất biến Phương Pháp Phân Tích Chậm Trễ TIA (Time Impact Analysis Invariant):** Phân tích kéo dài thời hạn hoàn thành EOT bắt buộc phải chèn phân đoạn trễ (Fragnet) vào mô hình CPM tại mốc thời gian xảy ra sự kiện (Window Analysis) để chứng minh đường găng bị dịch chuyển.
11. **Bảo Toàn Chuỗi Tính Toán Tiến Độ Đa Cấp (WBS Roll-up 5 Tầng):**
    $$\text{Dimension Tick} \longrightarrow \text{Task \%} \longrightarrow \text{Package \%} \longrightarrow \text{Tower \%} \longrightarrow \text{Project Overall \%}$$
12. **Bất biến Dự Báo Dòng Tiền Động (Dynamic Cashflow Forecast Invariant):** Dòng tiền chi phí thực tế và thanh toán luỹ kế phải được đối soát tự động với đường cong S-Curve kế hoạch và chỉ số hiệu suất chi phí $CPI$.
13. **Bất biến Loại Bỏ Ảo Giác AI Dự Toán & Chi Phí BOQ (Zero QS & BOQ Hallucination Invariant):** Tuyệt đối CẤM AI tự suy diễn, phóng đại hoặc bịa đặt số liệu bóc tách khối lượng BOQ, đơn giá hợp đồng, giá trị phát sinh VO (Variation Order), tiến độ EVM lũy kế ($PV, EV, AC$), số ngày trễ hạn, hoặc số tiền thanh toán IPC. Mọi phép tính QS, BOQ và dòng tiền phải là hàm toán học xác định (Deterministic Mathematical Function) thực thi trên dữ liệu thật từ bảng `boq_items`, `tasks`, `materials`, `contracts` và số học BigInt `lib/money.ts`. Khi chưa có dữ liệu hợp đồng/BOQ hoặc người dùng chưa tải lên bảng dự toán, BẮT BUỘC trả về giá trị 0 hoặc giao diện trống yêu cầu nạp dữ liệu, tuyệt đối CẤM dùng số liệu ước tính giả mạo hiển thị như kết quả thật.

---

## 2. QUY TRÌNH 7 BƯỚC QUẢN TRỊ CHI PHÍ, TIẾN ĐỘ & HỢP ĐỒNG

```
[B1: Chuẩn Hóa BOQ & Baseline CPM] ──► [B2: Điều Độ & Đo Đạc EVM S-Curve] ──► [B3: Lookahead & Phân Tích Pareto Trễ]
                                                                                            │
                                                                                            ▼
[B6: Quyết Toán Hoàn Thành TT96] ◄── [B5: Quản Trị Khiếu Nại FIDIC & TIA] ◄── [B4: Định Giá VO & Phát Hành IPC BigInt]
```
