---
name: qs-cost-contracts-master
description: "Quy chuẩn chuyên sâu về định mức dự toán BOQ, quản lý hợp đồng xây dựng FIDIC 1999/2017, phân tích tác động đường găng TIA (Time Impact Analysis), lập hồ sơ khiếu nại bù trừ EOT/Cost Claims, mô phỏng dòng tiền Dynamic Cashflow và chứng chỉ thanh toán IPC trong XBoss. Bắt buộc kích hoạt khi xử lý chi phí, ngân sách, hợp đồng, thanh toán hoặc tranh chấp pháp lý."
---

# QS, COST & CONTRACTS MASTER — ĐỊNH MỨC DỰ TOÁN, FIDIC CLAIMS & QUẢN TRỊ DÒNG TIỀN ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức của Kỹ sư Định giá Trưởng (Chief Quantity Surveyor - QS), Chuyên gia Quản lý Hợp đồng Quốc tế FIDIC (Red/Yellow/Silver Book 1999/2017), Giao thức Phân tích Chậm trễ & Tranh chấp SCL Protocol (Society of Construction Law Delay & Disruption Protocol), Định mức dự toán xây dựng Việt Nam (**Thông tư 12/2021/TT-BXD**), Quyết toán vốn đầu tư hoàn thành (**Thông tư 96/2021/TT-BTC & Nghị định 99/2021/NĐ-CP**), và Kỹ thuật Mô phỏng Dòng tiền Dynamic Cashflow S-Curve cho nền tảng XBoss.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Bất biến Thời hạn Thông báo Khiếu nại 28 Ngày (FIDIC 28-Day Time-Bar Invariant):**
   - Theo Điều 20.1 (FIDIC 1999) và Điều 20.2 (FIDIC 2017), Nhà thầu BẮT BUỘC phải phát hành **Thông báo Khiếu nại (Notice of Claim)** trong vòng **28 ngày** kể từ khi nhận biết hoặc lẽ ra phải nhận biết sự kiện chậm trễ/phát sinh chi phí.
   - Nếu quá 28 ngày: Quyền đòi bồi thường thời gian EOT và chi phí Cost sẽ bị triệt tiêu theo luật hợp đồng. Hệ thống tự động kích hoạt cảnh báo rủi ro `TIME_BAR_BREACH_RISK` và hướng dẫn phân tích sự kiện tiếp diễn (Continuous Event Clause 20.1(c)).

2. **Bất biến Tính toán Tiền tệ Chuẩn Xác Từng Xu (BigInt Money Arithmetic Invariant):**
   - Tuyệt đối CẤM cộng, trừ, nhân, chia tiền tệ trên kiểu số thực dấu phẩy động (`float`) của JavaScript (tránh lỗi $0.1 + 0.2 = 0.30000000000000004$).
   - Mọi phép tính tiền tệ phải thực hiện trực tiếp trong PostgreSQL (`NUMERIC`, `SUM`, `* rate`) hoặc chuyển qua `lib/money.ts` (`parseMoney`, `addMoney`, `subMoney`, `mulRate`, `formatVnd` làm việc trên đơn vị BigInt = $\text{đồng} \times 100$).

3. **Bất biến Cân đối Thanh toán Chứng chỉ IPC (IPC Balance & Recoupment Invariant):**
   - Giá trị Đề nghị Thanh toán Kỳ này ($NetPayable$) bắt buộc phải thỏa mãn phương trình kế toán bất biến:
     $$NetPayable = \text{Luỹ kế Kỳ này} - \text{Luỹ kế Kỳ trước} - \text{Khấu trừ Tạm ứng Lũy tiến} - \text{Giữ lại Bảo hành (5-10\%)} + \text{Phát sinh VO Đã Duyệt}$$

4. **Tính Duy Nhất Toàn Cầu của Mã BOQCODE (Global BOQ Code Invariant):**
   - Mã `boq_code` là định danh duy nhất trên toàn hệ thống cho cả công việc (`tasks`), gói thầu (`work_packages`) và vật tư (`materials`). Kiểm tra `boqTakenBy()` trước mọi thao tác tạo mới hoặc chỉnh sửa.

5. **Bất biến Thứ bậc Đơn giá Phát sinh (Variation Order Valuation Hierarchy Invariant):**
   - Đơn giá cho khối lượng phát sinh (VO) phải tuân thủ thứ bậc ưu tiên theo Điều 12.3 FIDIC:
     $$\text{Đơn giá Hợp đồng (nếu có)} > \text{Đơn giá Tương tự Đã Duyệt} > \text{Đơn giá Chiết tính Mới theo TT 12/2021/TT-BXD}$$

6. **Bất biến Chuyển đổi Bảo lãnh Bảo hành (Retention Bond Replacement Invariant):**
   - Tiền giữ lại bảo hành ($5\% - 10\%$) chỉ được giải tỏa thanh toán $100\%$ cho Nhà thầu khi Nhà thầu nộp Thư Bảo lãnh Bảo hành Ngân hàng (`insurance_bonds`) có giá trị tương đương và thời hạn hiệu lực bao trùm toàn bộ Thời gian Trách nhiệm Khuyết tật (DLP - Defect Liability Period 24 tháng).

7. **Bất biến Bù giá Trượt giá Đa Thành phần (Multi-Component Price Escalation Invariant):**
   - Công thức bù giá hợp đồng điều chỉnh theo chỉ số giá của Tổng cục Thống kê (GSO) và Sở Xây dựng:
     $$P_n = P_0 \times \left( a + b \frac{L_n}{L_0} + c \frac{M_n}{M_0} + d \frac{E_n}{E_0} \right)$$
     _(với $a + b + c + d = 1.0$; $a$ là tỷ lệ không điều chỉnh, $b, c, d$ là tỷ trọng nhân công, vật liệu, máy thi công)._

8. **Bất biến Chi phí Quản lý Gián tiếp Hiện trường Kéo dài (Extended Site Overheads Invariant):**
   - Khi được chấp thuận Gia hạn Tiến độ Hợp lệ (EOT) do lỗi của Chủ đầu tư/Tư vấn, Nhà thầu có quyền đòi chi phí quản lý hiện trường gián tiếp theo công thức Hudson / Emden / Eichleay:
     $$\text{Claim}_{\text{Overhead}} = \Delta EOT_{\text{Approved}} \times \frac{\text{Tổng Định phí Quản lý Dự án}}{\text{Thời gian Hợp đồng Gốc (ngày)}}$$

9. **Bất biến Đối soát Khối lượng Quyết toán 3 Chiều ($\Delta \text{QTO}$ Invariant):**
   - Giá trị Quyết toán Hợp đồng A-B bắt buộc phải triệt tiêu hoàn toàn sai lệch:
     $$\Delta \text{QTO} = \text{QTO}_{\text{As-Built}} - \text{QTO}_{\text{Hợp đồng Gốc}} - \text{QTO}_{\text{VO Đã Phê duyệt}} \equiv 0$$

10. **Bất biến Tuân thủ Hóa đơn Điện tử & Thuế VAT (Decree 70/2025/NĐ-CP Invariant):**
    - Mọi chứng chỉ IPC được duyệt thanh toán đều phải tích hợp bảng kê hóa đơn điện tử, mã cơ quan thuế và tính đúng thuế suất VAT hiện hành ($8\%$ hoặc $10\%$).

---

## 2. QUY TRÌNH 10 BƯỚC KHÉP KÍN QUẢN TRỊ CHI PHÍ, HỢP ĐỒNG & FIDIC CLAIMS

```
[B1: Bóc tách BOQ & TT 12] ──► [B2: Hợp đồng & Bảo lãnh] ──► [B3: Giám sát Trễ 28 Ngày] ──► [B4: Phân tích TIA SCL]
                                                                                                    │
                                                                                                    ▼
[B8: Quyết toán A-B & VO] ◄── [B7: Bù giá GSO Đa thành phần] ◄── [B6: Cashflow S-Curve] ◄── [B5: Chứng chỉ IPC]
        │
        ▼
[B9: Báo cáo Vốn TT 96 / NĐ 99] ──► [B10: Lưu trữ Merkle & Đóng Hợp đồng]
```

### Bước 1: Chuẩn hóa BOQ & Ánh xạ Định mức Dự toán TT 12/2021/TT-BXD

- Phân rã khối lượng chi tiết từng hệ thống MEPF. Ánh xạ mã công việc sang định mức Nhà nước (Vật liệu, Nhân công, Ca máy thi công).

### Bước 2: Quản trị Hợp đồng, Cam kết Chi & Hạn Bảo lãnh Ngân hàng

- Theo dõi các tầng ngân sách: Ngân sách duyệt (Budget) $\rightarrow$ Hợp đồng đã ký/Cam kết (Committed) $\rightarrow$ Đã thanh toán (Actual).
- Giám sát hạn bảo lãnh: Thực hiện hợp đồng, Tạm ứng, Bảo hành.

### Bước 3: Nhận diện Sự kiện Chậm trễ & Trạm gác Thông báo 28 Ngày (Notice of Claim)

- Tự động nhận diện sự kiện do lỗi Chủ đầu tư (chậm mặt bằng Cl. 2.1, chậm bản vẽ Cl. 1.9, địa chất bất lợi Cl. 4.12).
- Tự động phát hành Thông báo Khiếu nại (Notice of Delay) trong 28 ngày.

### Bước 4: Phân tích Tác động Đường găng TIA theo SCL Delay Protocol

- Chèn chuỗi công việc phát sinh (Fragnet) vào tiến độ CPM cơ sở, đo lường $\Delta EOT$ hợp lệ và phân định chậm trễ đồng thời (Concurrent Delays).

### Bước 5: Lập Chứng chỉ Thanh toán Khối lượng Hoàn thành (Interim Payment Certificate - IPC)

- Tính toán khối lượng hoàn thành kỳ này, khấu trừ tạm ứng lũy tiến theo tỷ lệ, giữ lại tiền bảo hành ($5\%$), tính thuế VAT và xuất chứng chỉ IPC.

### Bước 6: Mô phỏng Dòng tiền Dynamic Cashflow S-Curve ($Cash\text{-}In$ vs $Cash\text{-}Out$)

- Mô phỏng dòng tiền theo phân phối chuẩn tích lũy, dự báo trước 30/60/90 ngày nguy cơ thâm hụt vốn lưu động.

### Bước 7: Tính toán Bù giá Trượt giá Đa Thành phần theo Chỉ số GSO

- Cập nhật chỉ số giá nguyên vật liệu, xăng dầu, nhân công từ Sở Xây dựng / Tổng cục Thống kê, tự động tính hệ số bù giá $P_n / P_0$.

### Bước 8: Xử lý Thay đổi Thiết kế (VO) & Đối soát Quyết toán Khối lượng A-B

- Thẩm định đơn giá phát sinh VO, đối soát khối lượng hoàn công $\Delta \text{QTO} = \text{QTO}_{\text{As-Built}} - \text{QTO}_{\text{Contract}} - \text{QTO}_{\text{VO}}$.

### Bước 9: Tổng hợp Báo cáo Quyết toán Vốn Đầu tư Hoàn thành (TT 96/2021 & NĐ 99/2021)

- Lập Báo cáo quyết toán vốn đầu tư dự án hoàn thành theo Biểu mẫu chuẩn (Chi phí xây dựng, thiết bị, QLDA, tư vấn và chi phí khác).

### Bước 10: Niêm phong Mật mã Merkle & Đóng Hồ sơ Thanh lý Hợp đồng

- Thu hồi bảo lãnh tạm ứng, chuyển tiền giữ lại sang Bảo lãnh bảo hành, niêm phong Leaf Hash vào Cây Merkle và ký Biên bản thanh lý hợp đồng.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] fidic-1999-2017-clause-mapping-and-claims

# CẨM NANG ÁNH XẠ ĐIỀU KHOẢN FIDIC (RED / YELLOW BOOK) & THỦ TỤC KHIẾU NẠI

## 1. MA TRẬN ÁNH XẠ ĐIỀU KHOẢN KHIẾU NẠI FIDIC 1999 & 2017

| Tình huống Sự kiện Hiện trường                     | FIDIC 1999 (Red Book) | FIDIC 2017 (Red Book)          | Quyền lợi Nhà thầu                                | Thời hạn Thông báo Bắt buộc            |
| :------------------------------------------------- | :-------------------- | :----------------------------- | :------------------------------------------------ | :------------------------------------- |
| **Chậm bàn giao Mặt bằng thi công**                | Điều 2.1              | Điều 2.1                       | $\text{EOT} + \text{Cost} + \text{Profit}$        | Notice trong 28 ngày (Cl. 20.1 / 20.2) |
| **Chậm phát hành Bản vẽ / Chỉ dẫn**                | Điều 1.9              | Điều 1.9                       | $\text{EOT} + \text{Cost} + \text{Profit}$        | Notice nhắc nhở trước 14 ngày          |
| **Điều kiện Địa chất Bất lợi Không lường trước**   | Điều 4.12             | Điều 4.12                      | $\text{EOT} + \text{Cost}$                        | Notice ngay lập tức khi phát hiện      |
| **Tạm dừng Thi công theo lệnh Kỹ sư**              | Điều 8.8 / 8.9        | Điều 8.9 / 8.10                | $\text{EOT} + \text{Cost}$                        | Ghi nhận nhật ký máy/người nằm chờ     |
| **Thay đổi Thiết kế / Khối lượng lớn (VO)**        | Điều 13.1 / 13.3      | Điều 13.1 / 13.3               | Điều chỉnh Giá HĐ + EOT                           | Đệ trình Variation Proposal            |
| **Chậm thanh toán Chứng chỉ IPC**                  | Điều 14.8             | Điều 14.8                      | Lãi suất Chậm trả (Financing Charges)             | Thông báo sau 56 ngày kể từ khi nộp    |
| **Rủi ro Bất khả kháng / Chiến tranh / Dịch bệnh** | Điều 19.4             | Điều 18.4 (Exceptional Events) | $\text{EOT} + \text{Cost (nếu tại Nước chủ nhà)}$ | Notice trong 14 ngày                   |

---

## 2. CẤU TRÚC HỒ SƠ KHIẾU NẠI CHUẨN 5 PHẦN (CLAIM DOSSIER)

1. **Phần 1 — Tóm tắt Vụ việc (Executive Summary):** Diễn biến sự việc, các mốc thời gian, tổng số ngày EOT yêu cầu và tổng chi phí đòi bồi thường.
2. **Phần 2 — Cơ sở Pháp lý & Điều khoản Hợp đồng (Contractual Entitlement):** Viện dẫn chính xác các điều khoản FIDIC và quy định pháp luật Việt Nam.
3. **Phần 3 — Phân tích Tác động Tiến độ TIA (Time Impact Analysis):** Báo cáo mô hình mạng CPM, so sánh Baseline vs Impacted Schedule, chứng minh tác động trực tiếp vào đường găng.
4. **Phần 4 — Bảng Tính Chi phí Bồi thường Chi tiết (Quantum / Cost Calculation):** Định phí quản lý gián tiếp hiện trường, chi phí máy móc/nhân lực nằm chờ, trượt giá vật tư và chi phí tài chính.
5. **Phần 5 — Tập Hợp Chứng Cứ Đính Kèm (Evidentiary Documentation):** Nhật ký thi công điện tử TT 06, biên bản hiện trường TVGS, ảnh chụp có Dynamic Challenge Code, phiếu RFI và các văn bản qua lại.

---

### 3.2. [Cẩm nang kỹ thuật] time-impact-analysis-scl-protocol

# CẨM NANG PHÂN TÍCH TÁC ĐỘNG ĐƯỜNG GĂNG TIA THEO SCL DELAY PROTOCOL

## 1. QUY TRÌNH 4 BƯỚC CHÈN MẠNG FRAGNET VÀO CPM

```
[B1: Cập nhật Tiến độ Cơ sở đến Ngày Sự kiện] ──► [B2: Xây dựng Chuỗi Công việc Fragnet] ──► [B3: Chèn Fragnet & Chạy Lại CPM] ──► [B4: Đo Lường ΔEOT Đường Găng]
```

1. **Bước 1:** Lấy bản chụp tiến độ cơ sở (Unimpacted Baseline) tại thời điểm ngay trước ngày phát sinh sự kiện ($T_{\text{event}}$).
2. **Bước 2:** Xây dựng mạng công việc phụ (Fragnet) mô tả chuỗi hoạt động bị ảnh hưởng kèm thời lượng ước tính và liên kết logic ($FS/SS$).
3. **Bước 3:** Chèn Fragnet vào tiến độ cơ sở, liên kết với các công việc bị tác động và chạy lại Forward/Backward Pass.
4. **Bước 4:** Tính toán độ dời ngày hoàn thành dự án:
   $$\Delta EOT = \text{Project Completion Date}_{\text{Impacted CPM}} - \text{Project Completion Date}_{\text{Baseline CPM}}$$

---

## 2. PHÂN ĐỊNH CHẬM TRỄ ĐỒNG THỜI (CONCURRENT DELAY PRINCIPLE)

Khi xảy ra đồng thời 2 sự kiện làm chậm đường găng:

- Sự kiện A: Do lỗi Chủ đầu tư (Employer Delay - ví dụ chậm bàn giao mặt bằng).
- Sự kiện B: Do lỗi Nhà thầu (Contractor Delay - ví dụ thiếu nhân lực).

Theo SCL Delay Protocol Core Principle 10:

- **Về Thời gian:** Nhà thầu ĐƯỢC QUYỀN gia hạn tiến độ EOT tương ứng với thời gian chậm trễ do Sự kiện A gây ra (không bị phạt trễ hạn Liquidated Damages).
- **Về Chi phí:** Nhà thầu KHÔNG ĐƯỢC đòi chi phí quản lý hiện trường gián tiếp (Extended Overheads) trong khoảng thời gian có sự chậm trễ đồng thời của Sự kiện B.

---

### 3.3. [Cẩm nang kỹ thuật] extended-overheads-and-financial-damages

# CẨM NANG TÍNH TOÁN CHI PHÍ QUẢN LÝ HIỆN TRƯỜNG KÉO DÀI & THIỆT HẠI TÀI CHÍNH

## 1. CÔNG THỨC HUDSON / EMDEN / EICHLEAY CHO ĐỊNH PHÍ QUẢN LÝ

1. **Công thức Hudson:**
   $$\text{Head Office Overhead Claim} = \frac{\text{Tỷ lệ Overhead \& Lợi nhuận (\%)}}{100} \times \frac{\text{Giá trị Hợp đồng Gốc}}{\text{Thời gian Hợp đồng (ngày)}} \times \Delta EOT_{\text{chấp thuận}}$$

2. **Công thức Eichleay (Chuẩn quốc tế chính xác nhất):**
   - Bước 1 — Phân bổ Định phí Doanh nghiệp cho Dự án:
     $$\text{Overhead Dự án} = \text{Tổng Overhead Doanh nghiệp trong kỳ} \times \frac{\text{Doanh thu Dự án}}{\text{Tổng Doanh thu Toàn Doanh nghiệp}}$$
   - Bước 2 — Tính Định phí Ngày của Dự án:
     $$\text{Định phí Ngày} = \frac{\text{Overhead Dự án}}{\text{Thời gian Thực hiện Thực tế (ngày)}}$$
   - Bước 3 — Tính Tổng Bồi thường Overhead Kéo dài:
     $$\text{Claim}_{\text{Eichleay}} = \text{Định phí Ngày} \times \Delta EOT_{\text{chấp thuận}}$$

---

## 2. CHI PHÍ QUẢN LÝ HIỆN TRƯỜNG GIÁN TIẾP THỰC TẾ (SITE OVERHEADS)

$$\text{Site Overheads Claim} = \Delta EOT \times \left( \sum \text{Lương BCH Dự án/ngày} + \text{Thuê Lán trại/ngày} + \text{Điện nước Tạm/ngày} + \text{Khấu hao Thiết bị Tạm/ngày} \right)$$

---

### 3.4. [Cẩm nang kỹ thuật] ipc-payment-certification-and-advance-recoupment

# CẨM NANG CHỨNG CHỈ THANH TOÁN IPC & THU HỒI TẠM ỨNG LŨY TIẾN

## 1. CÔNG THỨC KHẤU TRỪ TẠM ỨNG LŨY TIẾN (ADVANCE RECOUPMENT)

Tạm ứng hợp đồng (thường $10\% - 20\%$) được thu hồi dần trong từng kỳ IPC khi khối lượng hoàn thành đạt từ $20\%$ đến $80\%$ giá trị hợp đồng:

$$Recoupment_i = \begin{cases} 0 & \text{khi } CumProgress < 20\% \\ \text{GrossValue}_i \times \frac{\text{Tổng Tiền Tạm Ứng}}{0.80 \times \text{ContractValue} - 0.20 \times \text{ContractValue}} & \text{khi } 20\% \le CumProgress \le 80\% \\ \text{Thu hồi nốt số còn lại} & \text{khi } CumProgress > 80\% \end{cases}$$

---

## 2. BẢO TOÀN GIỮ LẠI BẢO HÀNH & GIỚI HẠN PHẠT TRỄ HẠN

- **Tiền Giữ lại (Retention Money):** Trích giữ $5\% - 10\%$ trên giá trị nghiệm thu từng kỳ IPC.
- **Giới hạn Phạt Trễ hạn (Liquidated Damages Cap):**
  $$\text{Mức Phạt Ngày} = 0.05\% - 0.10\% \times \text{Giá trị Hợp đồng / ngày trễ}$$
  $$\text{Tổng Mức Phạt Tối Đa} \le 8.0\% \text{ Giá trị Phần Hợp đồng Vi phạm (theo Điều 146 Luật Xây dựng 2014)}$$

---

### 3.5. [Cẩm nang kỹ thuật] multi-component-price-escalation-indexing

# CẨM NANG BÙ GIÁ TRƯỢT GIÁ THEO CHỈ SỐ GIÁ GSO & SỞ XÂY DỰNG

## 1. CÔNG THỨC ĐIỀU CHỈNH GIÁ ĐA THÀNH PHẦN

$$P_n = P_0 \times \left( a + b \frac{L_n}{L_0} + c \frac{M_n}{M_0} + d \frac{E_n}{E_0} \right)$$

- $P_0$: Đơn giá gốc trong hợp đồng tại thời điểm đấu thầu.
- $P_n$: Đơn giá điều chỉnh tại thời điểm thanh toán kỳ $n$.
- $a$: Hệ số cố định không điều chỉnh (thường $0.15 - 0.20$).
- $b$: Tỷ trọng chi phí nhân công (Chỉ số giá nhân công xây dựng do Sở Xây dựng công bố $L_n / L_0$).
- $c$: Tỷ trọng chi phí vật liệu (Chỉ số giá nhóm vật liệu sắt thép, xi măng, cát đá $M_n / M_0$).
- $d$: Tỷ trọng chi phí máy thi công (Chỉ số giá nhiên liệu diesel, điện $E_n / E_0$).

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/qs_contracts_calculator.ts](file:///c:/Users/liend/xboss/.agents/skills/qs-cost-contracts-master/scripts/qs_contracts_calculator.ts): Bộ kịch bản CLI kiểm chứng toàn bộ tính toán FIDIC claim, TIA, chứng chỉ thanh toán IPC và bù giá trượt giá GSO.
