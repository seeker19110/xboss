---
name: schedule-evm-controller
description: "Quy chuẩn kỹ thuật và thuật toán quản trị tiến độ WBS, phương pháp đường găng CPM, phân tích giá trị thu được (EVM - Earned Value Management), kế hoạch ngắn hạn Lookahead 7/14/21 ngày và phân tích nguyên nhân chậm trễ Pareto trong XBoss. Bắt buộc kích hoạt khi xử lý tiến độ, tính toán thời gian, lập kế hoạch hoặc đánh giá hiệu suất dự án."
---

# SCHEDULE & EVM CONTROLLER — QUY CHUẨN ĐIỀU ĐỘ TIẾN ĐỘ & QUẢN TRỊ HIỆU SUẤT EVM

Bộ Skill này đóng gói toàn bộ tri thức điều độ công trình chuẩn quốc tế (PMI PMBOK 7th, ISO 21500), thuật toán phương pháp đường găng CPM, mô hình Earned Value Management (EVM), và chuỗi tính toán tiến độ đa cấp độ (WBS Roll-up) cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC BẤT BIẾN (INVARIANTS)

1. **Bất biến Công thức EVM (EVM Mathematical Invariant):**
   - Giá trị thu được: $EV = \text{Tỷ lệ hoàn thành thực tế} \times BAC$ (Budget at Completion).
   - Giá trị kế hoạch: $PV = \text{Tỷ lệ kế hoạch theo tiến độ cơ sở} \times BAC$.
   - Chi phí thực tế: $AC = \text{Tổng chi phí đã ghi nhận thực tế}$.
   - Chỉ số tiến độ: $SPI = \frac{EV}{PV}$; Chỉ số chi phí: $CPI = \frac{EV}{AC}$.
   - Sai lệch tiến độ: $SV = EV - PV$; Sai lệch chi phí: $CV = EV - AC$.

2. **Bất biến Cấp bậc Trạng thái (Status Hierarchy Invariant):**
   - Trạng thái `nghiem_thu` là trạng thái hoàn tất tuyệt đối, chỉ kích hoạt khi $Progress = 100\%$ và có phê duyệt từ Kỹ sư trưởng/PM.
   - Tuyệt đối không để chuỗi tính toán tự động (Cron/Recompute) hạ cấp trạng thái `nghiem_thu` sang `tre` hay `dang_thi_cong`.

3. **Bất biến Đường găng (Critical Path Invariant):**
   - Mọi công việc có Tổng dự trữ tự do (Total Float) $= 0$ ngày nằm trên Đường găng (Critical Path).
   - Bất kỳ độ trễ nào trên công việc đường găng đều làm lùi ngày hoàn thành toàn dự án đúng bằng số ngày trễ đó $(\Delta T_{\text{project}} = \Delta T_{\text{critical}})$.

4. **Bảo tồn Mẫu số Kế hoạch (Denominator Persistence):**
   - Tổng số lượng công việc/kích thước trong ma trận tiến độ (Dimension Denominator) không bao giờ bị thay đổi ngầm khi tick chọn tiến độ; chỉ được điều chỉnh khi có phê duyệt điều chỉnh WBS/Baseline.

---

## 2. QUY TRÌNH 5 BƯỚC ĐIỀU ĐỘ & KIỂM SOÁT TIẾN ĐỘ

```
[B1: Phân rã WBS & Baseline] ──► [B2: Realtime Tracking Sync] ──► [B3: Lăn Tiến độ Roll-up] ──► [B4: Tính EVM & Đường găng] ──► [B5: Dự báo & Lookahead]
```

### Bước 1: Phân rã WBS & Thiết lập Đường cơ sở (WBS & Baseline Setting)

- Phân rã cấu trúc WBS 5 tầng chuẩn XBoss: $\text{Project} \rightarrow \text{Tower} \rightarrow \text{System/Sheet} \rightarrow \text{WorkPackage} \rightarrow \text{Task} \rightarrow \text{ProgressDimension}$.
- Chốt ngày bắt đầu/kết thúc kế hoạch và lưu trữ bản chụp tiến độ cơ sở (Baseline Snapshot) vào bảng `baselines` & `baseline_tasks`.

### Bước 2: Ghi nhận Tiến độ Thời gian thực & Ngoại tuyến (Realtime Tracking Sync)

- Ghi nhận việc hoàn thành theo từng ô kích thước ống, tuyến cáp hoặc căn hộ (Dimension Checkboxes).
- Đồng bộ đa người dùng qua Server-Sent Events (SSE `/api/events?sheet=...`).
- Hỗ trợ lưu trữ tạm thời tại IndexedDB khi mất mạng và tự động đẩy hàng đợi (Offline Queue Replay) khi online.

### Bước 3: Lăn Tiến độ Đa tầng (WBS Level Roll-up)

- Tính toán tiến độ Task: $P_{\text{task}} = \frac{\sum \text{Checked Dimensions}}{\text{Total Dimensions}}$.
- Tự động suy diễn trạng thái Task (`chuan_bi` $\rightarrow$ `dang_thi_cong` $\rightarrow$ `hoan_thanh` $\rightarrow$ `tre` nếu $End < Today \land P < 100\%$).
- Lăn tiến độ lên Gói công việc (WorkPackage): $P_{\text{wp}} = \frac{1}{N} \sum P_{\text{task}}$ hoặc theo tỷ trọng trọng số khối lượng.
- Lăn tiến độ lên Hệ thống ngành (System) và Toàn dự án (Project Milestone).

### Bước 4: Đo lường Hiệu suất EVM & Phát hiện Độ lệch Đường găng (EVM & CPM Calculation)

- Tính toán các chỉ số $PV, EV, AC, SPI, CPI$ tại ngày cắt dữ liệu (Data Date).
- Đánh giá ma trận sức khỏe dự án:
  - $SPI \ge 1.0 \land CPI \ge 1.0$: Xuất sắc (Vượt tiến độ, tiết kiệm chi phí).
  - $SPI < 1.0 \land CPI \ge 1.0$: Cảnh báo trễ tiến độ nhưng kiểm soát tốt chi phí.
  - $SPI < 1.0 \land CPI < 1.0$: Nguy hiểm (Trễ tiến độ và vượt ngân sách).
- Chạy thuật toán CPM Forward/Backward Pass để xác định danh mục các công việc găng (Critical Tasks).

### Bước 5: Dự báo Tương lai & Kế hoạch Ngắn hạn Lookahead (Lookahead & Forecast)

- Tính toán ngày hoàn thành dự kiến: $Duration_{\text{forecast}} = \frac{\text{Baseline Duration}}{SPI}$.
- Tính tổng chi phí dự kiến khi hoàn thành: $EAC = AC + \frac{BAC - EV}{CPI \cdot SPI}$.
- Trích xuất Kế hoạch tuần Lookahead 7/14/21 ngày:
  - Lọc các công việc sắp bắt đầu trong $N$ ngày tới.
  - Lọc các công việc đến hạn hoàn thành trong $N$ ngày tới.
  - Rà soát điều kiện tiên quyết (Mặt bằng, Bản vẽ Shop, Vật tư tại kho) trước khi cho phép triển khai.

---

## 3. PHÂN TÍCH NGUYÊN NHÂN TRỄ HẠN THEO NGUYÊN LÝ PARETO

Khi phát hiện công việc bị trễ hạn ($End < Today \land Progress < 100\%$), Agent phân loại nguyên nhân theo 6 nhóm chuẩn danh mục mềm (`code_lists`):

1. **Mặt bằng thi công (Site Front):** Chưa được bàn giao, vướng kết cấu hoặc thầu phụ khác chưa rút.
2. **Hồ sơ & Bản vẽ (Design/Shopdrawing):** Bản vẽ chưa duyệt, xung đột phối hợp MEPF chưa chốt.
3. **Vật tư & Thiết bị (Materials/Equipment):** Hàng về trễ, hải quan chậm, kiểm tra QA/QC đầu vào không đạt.
4. **Nhân lực & Nhà thầu (Labor/Subcontractor):** Thiếu công nhân lành nghề, thầu phụ bỏ việc.
5. **Tài chính & Thanh toán (Finance/Payment):** Chậm tạm ứng, vướng phê duyệt chứng chỉ IPC.
6. **Thời tiết & Khách quan (Weather/Force Majeure):** Mưa bão lớn, dịch bệnh, dừng thi công theo lệnh cơ quan chức năng.

Phân bổ tần suất và tác động thời gian theo biểu đồ Pareto 80/20 để tập trung xử lý nhóm 20% nguyên nhân gây ra 80% độ trễ dự án.

---

## 4. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 4.1. [Cẩm nang kỹ thuật] cpm-and-evm-algorithms

# CẨM NANG THUẬT TOÁN CPM & CHỈ SỐ DỰ BÁO TÀI CHÍNH EVM

## 1. THUẬT TOÁN ĐƯỜNG GĂNG CPM (CRITICAL PATH METHOD)

1. **Forward Pass (Tính thời gian sớm nhất):**
   - $ES_i = \max_{p \in \text{Predecessors}(i)} (EF_p)$
   - $EF_i = ES_i + \text{Duration}_i$
2. **Backward Pass (Tính thời gian muộn nhất):**
   - $LF_i = \min_{s \in \text{Successors}(i)} (LS_s)$
   - $LS_i = LF_i - \text{Duration}_i$
3. **Tính Dự trữ thời gian (Float):**
   - $\text{Total Float}_i = LS_i - ES_i = LF_i - EF_i$
   - $\text{Free Float}_i = \min_{s} (ES_s) - EF_i$
   - Công việc nằm trên đường găng khi $\text{Total Float} = 0$.

---
