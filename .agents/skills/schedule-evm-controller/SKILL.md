---
name: schedule-evm-controller
description: "Quy chuẩn kỹ thuật và thuật toán quản trị tiến độ WBS, phương pháp đường găng CPM, phân tích giá trị thu được (EVM - Earned Value Management), kế hoạch ngắn hạn Lookahead 7/14/21 ngày và phân tích nguyên nhân chậm trễ Pareto trong XBoss. Bắt buộc kích hoạt khi xử lý tiến độ, tính toán thời gian, lập kế hoạch hoặc đánh giá hiệu suất dự án."
---

# SCHEDULE & EVM CONTROLLER — QUY CHUẨN ĐIỀU ĐỘ TIẾN ĐỘ & QUẢN TRỊ HIỆU SUẤT EVM ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức điều độ công trình chuẩn quốc tế (PMI PMBOK 7th, ISO 21500, SCL Delay & Disruption Protocol), thuật toán phương pháp đường găng CPM (Critical Path Method), mô hình Quản trị Giá trị Thu được (EVM - Earned Value Management), mô phỏng rủi ro tiến độ Monte Carlo Beta-PERT, và chuỗi tính toán tiến độ đa cấp độ (WBS Roll-up 5 tầng) cho nền tảng XBoss.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Bất biến Công thức Giá trị Thu được EVM (EVM Mathematical Invariant):**
   - Giá trị Kế hoạch: $PV = \text{Tỷ lệ Kế hoạch Baseline} \times BAC$
   - Giá trị Thu được: $EV = \text{Tỷ lệ Hoàn thành Thực tế} \times BAC$
   - Chi phí Thực tế: $AC = \sum \text{Chi phí Thực tế Đã Ghi nhận}$
   - Sai lệch: $SV = EV - PV$ và $CV = EV - AC$
   - Chỉ số: $SPI = \frac{EV}{PV}$ và $CPI = \frac{EV}{AC}$; Chỉ số tổng hợp $CSI = CPI \times SPI$
   - Hiệu suất Cần đạt: $TCPI_{BAC} = \frac{BAC - EV}{BAC - AC}$ (mục tiêu ngân sách gốc) hoặc $TCPI_{EAC} = \frac{BAC - EV}{EAC - AC}$ (mục tiêu ngân sách điều chỉnh).

2. **Bất biến Cấp bậc Trạng thái (Status Hierarchy Invariant):**
   - Trạng thái `nghiem_thu` là trạng thái hoàn tất tuyệt đối pháp lý, chỉ được gán khi $Progress = 100\%$ và có phê duyệt từ Admin/PM (`CAN.approve`).
   - Mọi tiến trình tự động (Cron, Recompute, Import) TUYỆT ĐỐI KHÔNG được hạ cấp trạng thái `nghiem_thu` sang `tre` hay `dang_thi_cong`.

3. **Bất biến Đường găng & Tổng Dự trữ Bằng Không (Critical Path & Total Float Invariant):**
   - Công việc nằm trên Đường găng (Critical Path) khi và chỉ khi Tổng dự trữ thời gian $\text{Total Float} (TF) = 0$ ngày (hoặc $TF \le 0$ khi tiến độ đã bị trễ).
   - Mọi sự chậm trễ $\Delta t$ trên công việc đường găng BẮT BUỘC làm lùi ngày hoàn thành toàn dự án đúng bằng $\Delta t$: $\Delta T_{\text{Project}} = \Delta t_{\text{Critical}}$.

4. **Bảo tồn Mẫu số Kế hoạch Ma trận (Denominator Persistence Invariant):**
   - Tổng số lượng ô kiểm tra tiến độ (Progress Dimension Denominator) của một công việc không bao giờ bị thay đổi ngầm khi tick chọn tiến độ; chỉ được điều chỉnh khi có phiên bản Baseline mới được phê duyệt.

5. **Bất biến Chuyển dịch Lịch Làm việc Hiện trường (Work-Day Calendar Shift Invariant):**
   - Mọi phép cộng/trừ ngày trong tính toán CPM và Lookahead phải đi qua Lịch Dự Án (`project_calendars`), tự động bỏ qua ngày nghỉ Chủ nhật, Lễ Tết và ngày thời tiết bất khả kháng (`rain_impact_hours` $\ge 4\text{h}$).

6. **Bất biến Xếp tầng Cột mốc Giao thức (Milestone Cascade Invariant):**
   - Các mốc nghiệm thu kỹ thuật (Milestone) có thời lượng Duration = 0 không được phép bị bẻ khóa liên kết $FS$ (Finish-to-Start) nếu công việc tiên quyết (Predecessor) chưa hoàn thành $100\%$.

7. **Bất biến Giới hạn San phẳng Nguồn lực (Resource Smoothing Constraint Invariant):**
   - San phẳng nhân lực và thiết bị (Resource Leveling) chỉ được phép dịch chuyển công việc trong phạm vi Dự trữ Tự do $\text{Free Float} (FF)$, tuyệt đối không được làm tăng Tổng thời gian thực hiện dự án ($Duration_{\text{total}}$) trừ khi có sự phê duyệt mở rộng Baseline của PM.

8. **Bất biến Lookahead 5 Trụ cột Sẵn sàng (Lookahead 5-Pillar Constraint Invariant):**
   - Một công việc chỉ được phép đưa vào danh sách **"Sẵn sàng thi công" (Ready-to-Execute)** trong Lookahead 7/14/21 ngày khi đạt $100\%$ 5 điều kiện tiên quyết: (1) Tiên quyết xong, (2) Mặt bằng đã bàn giao (Work-Front Custody), (3) Bản vẽ Shop đã duyệt e-Sign, (4) Vật tư đã nhập kho GRN, (5) Có giấy phép an toàn PTW.

9. **Bất biến Thời gian Thu được Theo Chu kỳ (Earned Schedule Time-Based Invariant):**
   - Khi dự án bước vào giai đoạn cuối ($PV \approx BAC$), chỉ số $SPI$ truyền thống tiến về $1.0$ gây sai lệch. Hệ thống bắt buộc kích hoạt Earned Schedule ($ES_{\text{time}}$) để tính toán $SPI_t = \frac{ES_{\text{time}}}{AT}$ và $SV_t = ES_{\text{time}} - AT$ (với $AT$ là Actual Time).

10. **Bất biến Độ tin cậy Mô phỏng Monte Carlo P80 (Monte Carlo P80 Confidence Invariant):**
    - Ngày cam kết hoàn thành dự án với Chủ đầu tư bắt buộc phải đạt mức tin cậy tối thiểu $P80$ (xác suất $80\%$ hoàn thành đúng hạn) trích xuất từ 1,000 kịch bản mô phỏng phân phối Beta-PERT.

---

## 2. QUY TRÌNH 10 BƯỚC KHÉP KÍN ĐIỀU ĐỘ & QUẢN TRỊ HIỆU SUẤT EVM

```
[B1: WBS & Logic CPM] ──► [B2: Chốt Baseline Snapshot] ──► [B3: Realtime Tracking & SSE] ──► [B4: Roll-up 5 Tầng WBS]
                                                                                                    │
                                                                                                    ▼
[B8: Dự báo EVM & S-Curve] ◄── [B7: Lookahead 5 Điều kiện] ◄── [B6: Phân tích Trễ Pareto] ◄── [B5: CPM & Đường găng]
        │
        ▼
[B9: Mô phỏng Monte Carlo P80] ──► [B10: Báo cáo Tuần & Điều chỉnh Kế hoạch]
```

### Bước 1: Phân rã WBS & Thiết lập Mạng Logic CPM (WBS & Logic CPM)

- Phân rã WBS 5 tầng chuẩn XBoss: $\text{Project} \rightarrow \text{Tower} \rightarrow \text{System/Sheet} \rightarrow \text{WorkPackage} \rightarrow \text{Task} \rightarrow \text{ProgressDimension}$.
- Thiết lập 4 mối quan hệ phụ thuộc: $FS$ (Finish-to-Start), $SS$ (Start-to-Start), $FF$ (Finish-to-Finish), $SF$ (Start-to-Finish) kèm độ trễ $Lag \ge 0$.

### Bước 2: Chốt Bản Chụp Tiến Độ Cơ Sở (Baseline Snapshot)

- Lưu trữ toàn bộ ngày bắt đầu/kết thúc kế hoạch, thời lượng, khối lượng dự toán $BAC$ vào bảng `baselines` & `baseline_tasks`.

### Bước 3: Ghi nhận Tiến độ Thời Gian Thực & Ngoại Tuyến (Realtime Tracking Sync)

- Ghi nhận trạng thái hoàn thành từng ô kích thước/căn hộ, đồng bộ qua Server-Sent Events (`/api/events?sheet=...`) và IndexedDB PWA khi mất mạng.

### Bước 4: Chuỗi Tính Toán Tiến Độ Đa Tầng (WBS Level Roll-up)

- Tính toán tiến độ Task $P_{\text{task}} = \frac{\sum Checked}{\text{Total}}$, suy diễn trạng thái (`chuan_bi`, `dang_thi_cong`, `hoan_thanh`, `tre`).
- Lăn tiến độ lên Gói công việc (WorkPackage), Hệ thống ngành (System) và Toàn dự án.

### Bước 5: Chạy Thuật Toán CPM & Xác Định Đường Găng Hiện Hữu (CPM Engine)

- Tính toán Forward Pass ($ES, EF$), Backward Pass ($LS, LF$), Total Float ($TF$) và Free Float ($FF$).
- Đánh dấu công việc đường găng ($TF = 0$).

### Bước 6: Phân Tích Nguyên Nhân Trễ Hạn Theo Biểu Đồ Pareto (Pareto Delay Analysis)

- Khi phát hiện công việc bị trễ hạn ($End < Today \land P < 1.0$), phân loại nguyên nhân theo 6 nhóm mềm trong `code_lists`.
- Phân tích Pareto 80/20 xác định nhóm nguyên nhân trọng yếu.

### Bước 7: Trích Xuất Kế Hoạch Ngắn Hạn Lookahead 7/14/21 Ngày (Lookahead Engine)

- Lọc danh mục công việc sắp bắt đầu và đến hạn, chạy kiểm tra 5 điều kiện sẵn sàng (5-Pillar Constraint Check).

### Bước 8: Đo Lường Bộ Chỉ Số EVM & Nội Suy Đường Cong S-Curve (EVM & S-Curve)

- Tính toán các chỉ số $PV, EV, AC, SPI, CPI, CSI, SV, CV, TCPI, EAC, ETC, VAC$.
- Tái dựng đường cong kế hoạch và thực tế bằng thuật toán nội suy Cubic Spline.

### Bước 9: Mô Phỏng Rủi Ro Tiến Độ Monte Carlo Beta-PERT (Monte Carlo Risk Engine)

- Chạy 1,000 vòng lặp mô phỏng ngẫu nhiên với 3 ước lượng $(O, M, P)$ để xác định phân phối xác suất hoàn thành $P50, P80, P90$.

### Bước 10: Tự Động Hóa Báo Cáo & Đề Xuất Điều Chỉnh Kế Hoạch (Executive Reporting)

- Tự động sinh báo cáo tuần (`/api/cron/weekly-report`), gửi cảnh báo Telegram/Email và đề xuất kịch bản bù tiến độ (Catch-up Plan).

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] cpm-forward-backward-and-float-algorithms

# CẨM NANG THUẬT TOÁN CPM (CRITICAL PATH METHOD) & TÍNH TOÁN DỰ TRỮ THỜI GIAN

## 1. CÔNG THỨC DUYỆT XUÔI (FORWARD PASS) — XÁC ĐỊNH THỜI GIAN SỚM NHẤT

Với mỗi công việc $i$ trong mạng WBS có tập công việc tiên quyết $\text{Pred}(i)$:

1. **Thời điểm Bắt đầu Sớm nhất ($ES_i$):**
   $$ES_i = \max_{p \in \text{Pred}(i)} \left( EF_p + \text{Lag}_{p, i} \right)$$
   _(Đối với công việc khởi đầu dự án không có predecessor: $ES = 0$ hoặc Ngày khởi công)._

2. **Thời điểm Hoàn thành Sớm nhất ($EF_i$):**
   $$EF_i = ES_i + Duration_i$$

---

## 2. CÔNG THỨC DUYỆT NGƯỢC (BACKWARD PASS) — XÁC ĐỊNH THỜI GIAN MUỘN NHẤT

Với mỗi công việc $i$ có tập công việc kế tiếp $\text{Succ}(i)$:

1. **Thời điểm Hoàn thành Muộn nhất ($LF_i$):**
   $$LF_i = \min_{s \in \text{Succ}(i)} \left( LS_s - \text{Lag}_{i, s} \right)$$
   _(Đối với công việc kết thúc dự án: $LF = EF$)._

2. **Thời điểm Bắt đầu Muộn nhất ($LS_i$):**
   $$LS_i = LF_i - Duration_i$$

---

## 3. CÔNG THỨC TÍNH 4 LOẠI DỰ TRỮ THỜI GIAN (FLOAT METRICS)

1. **Tổng Dự trữ Thời gian (Total Float - $TF$):** Khoảng thời gian một công việc có thể bị trì hoãn mà không làm chậm ngày hoàn thành toàn dự án.
   $$TF_i = LS_i - ES_i = LF_i - EF_i$$

2. **Dự trữ Tự do (Free Float - $FF$):** Khoảng thời gian một công việc có thể bị trì hoãn mà không làm chậm thời điểm bắt đầu sớm nhất của bất kỳ công việc kế tiếp nào.
   $$FF_i = \min_{s \in \text{Succ}(i)} (ES_s - \text{Lag}_{i, s}) - EF_i$$

3. **Dự trữ Can nhiễu (Interfering Float - $IntF$):** Phần dự trữ thời gian mà khi sử dụng sẽ làm giảm Total Float của các công việc kế tiếp.
   $$IntF_i = TF_i - FF_i$$

4. **Dự trữ Độc lập (Independent Float - $IndF$):** Khoảng thời gian dự trữ tồn tại độc lập ngay cả khi tất cả predecessor kết thúc muộn nhất và tất cả successor bắt đầu sớm nhất.
   $$IndF_i = \max\left(0, \min_{s \in \text{Succ}(i)} (ES_s) - \max_{p \in \text{Pred}(i)} (LF_p) - Duration_i\right)$$

---

## 4. THUẬT TOÁN PHÁT HIỆN VÒNG LẶP PHỤ THUỘC (CYCLE DETECTION)

Áp dụng thuật toán Kahn / DFS Topological Sort:
Nếu đồ thị chứa chu trình (ví dụ $A \rightarrow B \rightarrow C \rightarrow A$), hệ thống lập tức chặn lệnh gán và trả về lỗi: `"Phát hiện vòng lặp phụ thuộc khép kín (Circular Dependency) giữa các công việc: A -> B -> C -> A"`.

---

### 3.2. [Cẩm nang kỹ thuật] evm-pinnacle-metrics-and-forecasting

# CẨM NANG BỘ CHỈ SỐ EVM TOÀN DIỆN & DỰ BÁO TƯƠNG LAI

## 1. MA TRẬN 14 CHỈ SỐ QUẢN TRỊ GIÁ TRỊ THU ĐƯỢC (EVM FORMULAS)

| STT | Ký hiệu  | Tên Chỉ số                       | Công thức Tính toán                            | Ý nghĩa Đánh giá                                          |
| :-: | :------- | :------------------------------- | :--------------------------------------------- | :-------------------------------------------------------- |
|  1  | **BAC**  | Budget at Completion             | $\sum \text{Ngân sách Kế hoạch Gốc}$           | Tổng mức đầu tư được duyệt                                |
|  2  | **PV**   | Planned Value                    | $\% \text{Kế hoạch Baseline} \times BAC$       | Giá trị dự kiến phải hoàn thành tại thời điểm xét         |
|  3  | **EV**   | Earned Value                     | $\% \text{Thực tế Hoàn thành} \times BAC$      | Giá trị thực tế đã tạo ra                                 |
|  4  | **AC**   | Actual Cost                      | $\sum \text{Chi phí Thực tế Đã Chi}$           | Tổng chi phí đã tiêu tốn                                  |
|  5  | **SV**   | Schedule Variance                | $SV = EV - PV$                                 | $SV > 0$: Nhanh; $SV < 0$: Chậm tiến độ                   |
|  6  | **CV**   | Cost Variance                    | $CV = EV - AC$                                 | $CV > 0$: Tiết kiệm; $CV < 0$: Vượt ngân sách             |
|  7  | **SPI**  | Schedule Performance Index       | $SPI = \frac{EV}{PV}$                          | $SPI > 1.0$: Nhanh hơn kế hoạch; $SPI < 1.0$: Chậm        |
|  8  | **CPI**  | Cost Performance Index           | $CPI = \frac{EV}{AC}$                          | $CPI > 1.0$: Tiết kiệm chi phí; $CPI < 1.0$: Vượt chi phí |
|  9  | **CSI**  | Cost-Schedule Index              | $CSI = CPI \times SPI$                         | $CSI < 0.8$: Dự án bước vào vùng báo động đỏ              |
| 10  | **TCPI** | To-Complete Performance Index    | $TCPI = \frac{BAC - EV}{BAC - AC}$             | Hiệu suất chi phí cần đạt trong phần việc còn lại         |
| 11  | **EAC₁** | Estimate at Completion (Rate)    | $EAC_1 = \frac{BAC}{CPI}$                      | Dự báo tổng chi phí (nếu hiệu suất chi phí giữ nguyên)    |
| 12  | **EAC₂** | Estimate at Completion (CPI×SPI) | $EAC_2 = AC + \frac{BAC - EV}{CPI \times SPI}$ | Dự báo tổng chi phí (tính cả tác động trễ hạn)            |
| 13  | **ETC**  | Estimate to Complete             | $ETC = EAC - AC$                               | Dự toán chi phí cần thêm để hoàn tất dự án                |
| 14  | **VAC**  | Variance at Completion           | $VAC = BAC - EAC$                              | $VAC > 0$: Thặng dư; $VAC < 0$: Bội chi dự kiến           |

---

## 2. CHỈ SỐ TIẾN ĐỘ THEO THỜI GIAN (EARNED SCHEDULE - $ES_{\text{time}}$)

Khi dự án chậm trễ ở giai đoạn cuối, $SPI \rightarrow 1.0$ làm mất tính cảnh báo. Chuẩn Earned Schedule giải quyết triệt để vấn đề này:

$$ES_{\text{time}} = C + I = C + \frac{EV - PV_C}{PV_{C+1} - PV_C}$$
_(trong đó $C$ là số tháng mà $PV_C \le EV < PV_{C+1}$)._

- **Chỉ số Hiệu suất Tiến độ Thời gian:** $SPI_t = \frac{ES_{\text{time}}}{AT}$ _(với $AT$ là Actual Time — thời gian thực tế đã trôi qua)_.
- **Sai lệch Tiến độ Thời gian:** $SV_t = ES_{\text{time}} - AT$ _(tính theo ngày/tháng)_.

---

### 3.3. [Cẩm nang kỹ thuật] lookahead-7-14-21-and-constraint-filtering

# CẨM NANG KẾ HOẠCH NGẮN HẠN LOOKAHEAD & BỘ LỌC 5 ĐIỀU KIỆN SẴN SÀNG

## 1. THUẬT TOÁN TRÍCH XUẤT LOOKAHEAD

```typescript
export function extractLookaheadTasks(allTasks: Task[], windowDays: 7 | 14 | 21, dataDate: Date) {
  const windowEnd = addWorkDays(dataDate, windowDays);

  return allTasks.filter((task) => {
    // 1. Task chưa hoàn thành
    if (task.progress >= 1.0 || task.status === "hoan_thanh" || task.status === "nghiem_thu")
      return false;

    // 2. Task rơi vào khung cửa sổ Lookahead
    const startsInWindow = task.startDate >= dataDate && task.startDate <= windowEnd;
    const endsInWindow = task.endDate >= dataDate && task.endDate <= windowEnd;
    const inProgress = task.startDate < dataDate && task.progress < 1.0;

    return startsInWindow || endsInWindow || inProgress;
  });
}
```

---

## 2. MA TRẬN KIỂM TRA 5 ĐIỀU KIỆN TIÊN QUYẾT (5-PILLAR READINESS CHECK)

| Điều kiện | Tên Ràng buộc            | Nguồn Dữ liệu Đối chiếu              | Tiêu chí Đạt chuẩn (PASS)                                |
| :-------: | :----------------------- | :----------------------------------- | :------------------------------------------------------- |
|  **C1**   | Predecessors Completed   | `task_dependencies`, `tasks`         | $100\%$ các task tiên quyết đạt $Progress = 100\%$       |
|  **C2**   | Work-Front Custody       | `work_front_handovers`               | Mặt bằng thi công đã bàn giao và có chữ ký xác nhận      |
|  **C3**   | Approved Shopdrawing     | `task_documents`, `esign_records`    | Bản vẽ Shopdrawing thi công có chữ ký số 3 bên           |
|  **C4**   | Material Available (GRN) | `materials`, `material_transactions` | Tồn kho vật tư khả dụng $\ge$ Định mức yêu cầu của task  |
|  **C5**   | Permit-to-Work (PTW)     | `safety_permits`                     | Có giấy phép PTW còn hiệu lực nếu là công việc nguy hiểm |

$$\text{Task Ready Status} = \begin{cases} \text{READY\_FOR\_EXECUTION} & \text{khi } C1 \land C2 \land C3 \land C4 \land C5 = \text{TRUE} \\ \text{BLOCKED\_BY\_CONSTRAINTS} & \text{nếu có bất kỳ } C_k = \text{FALSE} \end{cases}$$

---

### 3.4. [Cẩm nang kỹ thuật] pareto-delay-analysis-and-clustering

# CẨM NANG PHÂN TÍCH NGUYÊN NHÂN TRỄ THEO NGUYÊN LÝ PARETO 80/20

## 1. PHÂN BỔ NGUYÊN NHÂN TRỄ HẠN 6 NHÓM CHUẨN

1. **`MAT` — Vật tư & Thiết bị:** Hàng về trễ, hải quan chậm, kiểm tra QA/QC đầu vào không đạt ($CO/CQ$).
2. **`DWG` — Hồ sơ & Bản vẽ:** Bản vẽ chưa phê duyệt, xung đột không gian MEPF chưa xử lý xong ($RFI$).
3. **`SITE` — Mặt bằng thi công:** Mặt bằng chưa bàn giao, vướng kết cấu, thầu phụ khác chiếm chỗ.
4. **`LABOR` — Nhân lực & Nhà thầu:** Thiếu công nhân lành nghề, thầu phụ bỏ việc, năng suất thấp.
5. **`FIN` — Tài chính & Thanh toán:** Chậm tạm ứng, vướng phê duyệt chứng chỉ IPC, chậm thanh toán thầu phụ.
6. **`FORCE` — Thời tiết & Bất khả kháng:** Mưa bão lớn ($Rain \ge 4\text{h}$), dịch bệnh, lệnh dừng của cơ quan chức năng.

---

## 2. THUẬT TOÁN TÍNH TOÁN PARETO CUMULATIVE PERCENTAGE

1. Tính tổng số ngày trễ tích lũy theo từng nhóm nguyên nhân:
   $$Days_k = \sum_{t \in \text{Tasks}_k} \max(0, \text{DataDate} - \text{EndDate}_t)$$
2. Sắp xếp các nhóm theo thứ tự giảm dần: $Days_1 \ge Days_2 \ge \dots \ge Days_6$.
3. Tính Tỷ lệ Phần trăm Tích lũy:
   $$CumPercent_k = \frac{\sum_{i=1}^{k} Days_i}{\sum_{m=1}^{6} Days_m} \times 100\%$$
4. Các nhóm có $CumPercent \le 80\%$ được xếp vào **Nhóm Nguyên Nhân Trọng Yếu Cần Can Thiệp Ngay (Vital Few 80/20)**.

---

### 3.5. [Cẩm nang kỹ thuật] monte-carlo-schedule-risk-simulation

# CẨM NANG MÔ PHỎNG RỦI RO TIẾN ĐỘ MONTE CARLO BETA-PERT

## 1. PHÂN PHỐI BETA-PERT 3 ĐIỂM ƯỚC LƯỢNG

Với mỗi công việc $i$, Kỹ sư nhập 3 giá trị thời gian:

- $O_i$: Ước lượng Lạc quan (Optimistic)
- $M_i$: Ước lượng Khả dĩ nhất (Most Likely)
- $P_i$: Ước lượng Bi quan (Pessimistic)

1. **Thời lượng Bình quân Kỹ thuật:**
   $$\mu_i = \frac{O_i + 4M_i + P_i}{6}$$
2. **Phương sai Thời lượng:**
   $$\sigma_i^2 = \left( \frac{P_i - O_i}{6} \right)^2$$

---

## 2. GIẢI THUẬT MÔ PHỎNG 1,000 VÒNG LẶP MONTE CARLO

```typescript
export function runMonteCarloSimulation(tasks: PertTask[], iterations = 1000): MonteCarloResult {
  const completionDates: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    // 1. Sinh thời lượng ngẫu nhiên cho từng task theo phân phối Beta-PERT
    const sampledTasks = tasks.map((t) => {
      const sampledDuration = sampleBetaPert(t.optimistic, t.mostLikely, t.pessimistic);
      return { ...t, duration: sampledDuration };
    });

    // 2. Chạy Forward Pass tính tổng thời gian hoàn thành dự án
    const projectDuration = calculateCpmDuration(sampledTasks);
    completionDates.push(projectDuration);
  }

  completionDates.sort((a, b) => a - b);

  return {
    p50: completionDates[Math.floor(iterations * 0.5)], // 50% xác suất
    p80: completionDates[Math.floor(iterations * 0.8)], // 80% cam kết CĐT
    p90: completionDates[Math.floor(iterations * 0.9)], // 90% an toàn tuyệt đối
  };
}
```

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/schedule_evm_calculator.ts](file:///c:/Users/liend/xboss/.agents/skills/schedule-evm-controller/scripts/schedule_evm_calculator.ts): Bộ kịch bản CLI kiểm chứng toàn bộ thuật toán CPM, EVM, Lookahead 5 điều kiện, Pareto trễ và Monte Carlo Beta-PERT.
