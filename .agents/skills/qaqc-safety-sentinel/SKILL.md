---
name: qaqc-safety-sentinel
description: "Quy chuẩn kiểm soát chất lượng QA/QC theo Nghị định 06/2021/NĐ-CP, quy trình điểm dừng kỹ thuật (Hold-Points), xử lý phiếu không phù hợp (NCR/Punch-List), nghiệm thu ký số e-Sign 3 bên và giám sát an toàn HSE AI Computer Vision theo QCVN 18:2021/BXD trong XBoss. Bắt buộc kích hoạt khi xử lý chất lượng, nghiệm thu, an toàn lao động hoặc môi trường công trường."
---

# QA/QC & SAFETY SENTINEL — QUY CHUẨN CHẤT LƯỢNG 3 BÊN, BBNT & GIÁM SÁT HSE AI ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức kiểm soát chất lượng công trình xây dựng theo **Nghị định 06/2021/NĐ-CP**, quy chuẩn điểm dừng kỹ thuật (Hold-Points ITP), ma trận đóng phiếu không phù hợp NCR 3 bước khép kín, quy trình ký số điện tử pháp lý 3 bên không giấy tờ (Paperless 3-Way Smart e-Sign), và giải thuật thị giác máy tính AI phát hiện mối nguy an toàn lao động theo **QCVN 18:2021/BXD** & quan trắc môi trường **QCVN 05:2023/BTNMT** cho nền tảng XBoss.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Khóa Chặn Điểm Dừng Kỹ Thuật Bắt Buộc (Hold-Point Hard Lock Invariant):**
   - Đối với các hạng mục công việc quan trọng (Ống luồn trong bê tông sàn/dầm, Thử áp lực ống nước $1.5 \times P_{\text{lv}}$, Thử kín ống gió DW143, Thử liên động PCCC): Tuyệt đối KHÔNG được tiến hành công việc tiếp theo (Đổ bê tông, Đóng trần, Lấp đất) nếu chưa có Biên bản nghiệm thu (BBNT) ký duyệt 3 bên.
   - Mọi nỗ lực cập nhật tiến độ công việc liên quan vượt quá giai đoạn Hold-Point sẽ bị API chặn đứng với mã lỗi 403 / 422.

2. **Quy Trình Khép Kín Phiếu NCR 3 Bước (3-Step NCR Closure Invariant):**
   - Một phiếu Không phù hợp (NCR) hoặc đầu việc Punch-List chỉ được phép chuyển trạng thái `CLOSED` khi có đầy đủ bộ chứng cứ 3 bước:
     1. Ảnh chụp hiện trạng sai lỗi ban đầu kèm tọa độ 3D và mã tham chiếu bản vẽ Shop.
     2. Báo cáo phân tích nguyên nhân gốc rễ (5-Whys / Fishbone) & Biện pháp khắc phục đã được TVGS duyệt.
     3. Ảnh chụp nghiệm thu lại (Re-inspection) sau khi nhà thầu đã khắc phục hoàn tất đạt chuẩn.

3. **Thang Phân Cấp An Toàn & Cảnh Báo Khẩn Tức Thời (Safety Critical Escalation Invariant):**
   - Phát hiện vi phạm an toàn cấp độ `CRITICAL` (Công nhân làm việc trên cao $\ge 2\text{m}$ không đeo dây an toàn móc điểm neo, Mép sàn/lỗ mở không có lan can rào chắn, Làm việc dưới tầm quay cẩu tháp):
   - Hệ thống BẮT BUỘC tự động sinh Phiếu xử lý an toàn (HSE Action Ticket) và gửi thông báo khẩn cấp Push Notification/Telegram cho Chỉ huy trưởng và Kỹ sư An toàn trong vòng $\le 5$ giây.

4. **Bất biến Chữ Ký Số 3 Bên Pháp Lý (3-Party Paperless e-Sign Invariant):**
   - Mọi Biên bản nghiệm thu công việc BBNT phải chứa đủ 3 chữ ký số điện tử:
     $$\text{Signature Package} = \{\text{Kỹ sư NT}, \text{Kỹ sư Giám sát TVGS}, \text{Đại diện Chủ đầu tư/BCH}\}$$
   - Toàn bộ gói dữ liệu được băm SHA-256 niêm phong điện tử, chống chối bỏ (Non-repudiation) và cấp mã chứng thực `CERT-BBNT-...`.

5. **Bất biến Tần Suất Lấy Mẫu Thí Nghiệm Theo TCVN (Sampling Frequency Invariant):**
   - Không được phép nghiệm thu nếu số lượng tổ mẫu thí nghiệm kiểm định độc lập không đạt định mức quy định:
     - Thép cốt bê tông: Tối thiểu 1 tổ mẫu / 20 tấn cùng chủng loại (TCVN 1651:2018).
     - Ống nhựa uPVC/PPR: Thử độ bền va đập và áp lực nổ 1 tổ mẫu / lô nhập xưởng.
     - Cáp điện: Đo điện trở cách điện Megger $100\%$ các tuyến cáp trước khi đóng điện.

6. **Bất biến Thị Giác Máy Tính HSE Chuẩn Xác (Computer Vision PPE Invariant):**
   - Thuật toán AI Computer Vision phát hiện thiếu trang thiết bị bảo hộ cá nhân (PPE: Mũ, Áo phản quang, Dây đai) chỉ kích hoạt cảnh báo khi độ tin cậy $Confidence \ge 0.85$.
   - Mỗi vi phạm được tự động gắn mã người lao động (nhận diện thẻ QR ngực áo) để ghi vào Sổ tay Vi phạm An toàn.

7. **Bất biến Ngắt Mạch Đổ Bê Tông Khi Chưa Cấp Phép (Pour Permit Circuit Breaker Invariant):**
   - Lệnh đổ bê tông (`pour_permits`) bị khóa cứng nếu còn bất kỳ ống chờ luồn điện, ống thoát nước ngầm hoặc hộp sleeve nào nằm trong phạm vi vùng đổ chưa được nghiệm thu Pass.

8. **Bất biến Ngưỡng Bụi & Tiếng Ồn Môi Trường (Environmental Threshold Invariant):**
   - Dữ liệu cảm biến IoT trắc đạc môi trường vượt ngưỡng cho phép theo **QCVN 05:2023/BTNMT** (Bụi PM2.5 $> 50\mu\text{g/m}^3$) hoặc **QCVN 26:2010/BTNMT** (Độ ồn ban đêm $> 55\text{dBA}$) sẽ tự động kích hoạt hệ thống phun sương dập bụi và gửi cảnh báo dừng các thiết bị gây ồn lớn.

9. **Bất biến Cấp Phép Làm Việc Nguy Hiểm PTW (Permit-to-Work Guardrail Invariant):**
   - Tuyệt đối cấm thi công các công việc nguy hiểm (Hàn cắt sinh nhiệt, Làm việc trên cao $\ge 2\text{m}$, Làm việc không gian kín/bể ngầm, Đào đất sâu $\ge 1.5\text{m}$) nếu chưa có Giấy phép PTW được Kỹ sư An toàn phê duyệt trong vòng 24 giờ trước ca làm việc.

10. **Bất biến Sổ Cái Chất Lượng Bất Biến (Permanent Quality Audit Log Invariant):**
    - Toàn bộ lịch sử biên bản nghiệm thu, ảnh hiện trường, phiếu NCR và nhật ký kiểm định an toàn đều được ghi nhận vào Sổ cái bất biến, không một ai (kể cả Quản trị viên) có quyền sửa đổi hoặc xóa bỏ các biên bản đã ký duyệt.

---

## 2. QUY TRÌNH 10 BƯỚC KHÉP KÍN QUẢN LÝ CHẤT LƯỢNG QA/QC & AN TOÀN HSE

```
[B1: Kế hoạch ITP & Hold-Points] ──► [B2: Cấp phép PTW Nguy hiểm] ──► [B3: Yêu cầu Nghiệm thu RFI] ──► [B4: Nghiệm thu Thực địa]
                                                                                                              │
                                                                                                              ▼
[B8: Chấm điểm An toàn SSI] ◄── [B7: Xử lý NCR & 5-Whys] ◄── [B6: AI HSE & IoT Môi trường] ◄── [B5: e-Sign 3 Bên SHA-256]
        │
        ▼
[B9: Đóng Dấu Hoàn Công NĐ 06] ──► [B10: Xuất Hồ sơ Quản lý Chất lượng LOD 500]
```

### Bước 1: Thiết lập Kế hoạch Kiểm tra & Thí nghiệm (ITP Setup)

- Xây dựng bảng ITP (Inspection and Test Plan) cho từng gói thầu, phân định rõ các điểm $H$ (Hold Point), $W$ (Witness Point), $R$ (Review Point).

### Bước 2: Cấp Phép Làm Việc Nguy Hiểm Số (Digital Permit-to-Work - PTW)

- Ký duyệt giấy phép làm việc an toàn cho 4 nhóm: Hot Work, Working at Height, Confined Space, Deep Excavation.

### Bước 3: Phát hành Yêu cầu Nghiệm thu (Request for Inspection - RFI)

- Kỹ sư Nhà thầu gửi phiếu RFI trên ứng dụng di động trước tối thiểu 24 giờ kèm vị trí, gói thầu và bản vẽ Shopdrawing được duyệt.

### Bước 4: Nghiệm thu Thực địa & Đo đạc Kỹ thuật 3 Bên

- Kỹ sư Nhà thầu, TVGS và CĐT trực tiếp kiểm tra cao độ, độ phẳng, độ dốc, thử áp lực thủy lực và chụp ảnh bằng chứng có Dynamic Challenge Code.

### Bước 5: Ký Số Thông Minh 3 Bên & Niêm Phong Điện Tử (e-Sign & SHA-256)

- Ký duyệt biên bản nghiệm thu BBNT trên thiết bị di động, tự động đóng dấu thời gian và mã băm SHA-256 vào sổ cái Merkle.

### Bước 6: Giám sát An toàn Camera AI & Quan trắc Môi trường IoT

- Camera AI quét diện rộng phát hiện vi phạm PPE, xâm nhập vùng nguy hiểm; trạm cảm biến IoT đo bụi PM2.5, độ ồn dBA thời gian thực.

### Bước 7: Quản trị Phiếu Không Phù Hợp (NCR) & Phân tích 5-Whys

- Khi phát hiện sai lỗi: Phát hành phiếu NCR, yêu cầu phân tích nguyên nhân gốc rễ (5-Whys), phê duyệt biện pháp xử lý và nghiệm thu đóng phiếu.

### Bước 8: Tính toán Chỉ số An toàn Công trường Hàng ngày (Site Safety Index - SSI)

- Đánh giá chỉ số $SSI = 100 - \sum (N_i \times W_i)$, xếp hạng an toàn tổ đội thầu phụ và tự động cảnh báo ban chỉ huy.

### Bước 9: Đối soát Dung sai Hình học Scan-to-BIM & Đóng Dấu Bản Vẽ Hoàn Công

- So khớp đám mây điểm 3D LiDAR: $\Delta \le 15\text{mm}$ (Pass), $15 < \Delta \le 35\text{mm}$ (Warning), $\Delta > 35\text{mm}$ (NCR). Đóng khung dấu hoàn công Phụ lục II Nghị định 06/2021/NĐ-CP.

### Bước 10: Đóng Gói Hồ Sơ Quản Lý Chất Lượng Hoàn Công Số LOD 500

- Tổng hợp toàn bộ BBNT ký số, chứng chỉ CO/CQ, kết quả thử nghiệm T&C và bản vẽ As-Built thành Hồ sơ chất lượng số sẵn sàng chuyển giao nghiệm thu Điều 24 NĐ 06.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] itp-matrix-and-hold-point-protocols

# CẨM NANG MA TRẬN ITP & ĐIỂM DỪNG NGHIỆM THU KỸ THUẬT MEPF

## 1. MA TRẬN ITP CHI TIẾT CHO CÁC HỆ THỐNG CƠ ĐIỆN MEPF

| Hệ thống           | Hạng mục Nghiệm thu                |   Cấp độ ITP    | Tiêu chuẩn Kỹ thuật Áp dụng                                  | Bằng chứng Bắt buộc                 |
| :----------------- | :--------------------------------- | :-------------: | :----------------------------------------------------------- | :---------------------------------- |
| **Cấp thoát nước** | Ống luồn trong sàn bê tông dầm     |  **H** (Hold)   | TCVN 4513:1988, TCVN 4519:1988                               | BBNT ký trước khi đổ bê tông        |
| **Cấp thoát nước** | Thử áp lực đường ống cấp nước      |  **H** (Hold)   | $1.5 \times P_{\text{làm việc}}$ duy trì 2h không tụt áp     | Biểu đồ áp kế IoT + Video ghi hình  |
| **HVAC**           | Thử kín ống gió (Duct Leakage)     |  **H** (Hold)   | DW143 / SMACNA Class A/B/C                                   | Báo cáo máy tạo khói/đo áp suất     |
| **HVAC**           | Bọc cách nhiệt ống gió & Chiller   | **W** (Witness) | ASTM C534, TCVN 5687:2010                                    | Kiểm tra độ dày xốp & dán kín mép   |
| **PCCC**           | Thử áp lực đường ống cứu hỏa       |  **H** (Hold)   | Áp suất $\ge 1.4\text{ MPa}$ duy trì 2h                      | BBNT ký xác nhận 3 bên              |
| **Điện**           | Đo cách điện cáp nguồn (Megger)    |  **H** (Hold)   | TCVN 6610:2007, $R_{\text{cách điện}} \ge 10\text{ M}\Omega$ | Bảng đo điện trở từng pha           |
| **Điện**           | Đo điện trở bãi tiếp địa chống sét |  **H** (Hold)   | TCVN 9385:2012, $R_{\text{tiếp địa}} \le 10\text{ }\Omega$   | Báo cáo đo bằng máy Kyoritsu        |
| **PCCC / BMS**     | Thử nghiệm liên động toàn tòa nhà  |  **H** (Hold)   | QCVN 06:2022/BXD, TCVN 3890:2023                             | Biên bản thử nghiệm IST 10 kịch bản |

---

### 3.2. [Cẩm nang kỹ thuật] ncr-punchlist-lifecycle-and-root-cause

# CẨM NANG VÒNG ĐỜI NCR & PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (5-WHYS)

## 1. MA TRẬN TRẠNG THÁI PHIẾU NCR

$$\text{ISSUED} \xrightarrow[\text{Nộp Biện pháp Sửa chữa}]{\text{Bước 1 (Nhà thầu)}} \text{UNDER\_RECTIFICATION} \xrightarrow[\text{Sửa Xong \& Mời TVGS}]{\text{Bước 2 (Nhà thầu)}} \text{RE\_INSPECTED} \xrightarrow[\text{TVGS Ký Duyệt Pass}]{\text{Bước 3 (TVGS)}} \text{CLOSED}$$

## 2. PHƯƠNG PHÁP 5-WHYS TRONG ĐIỀU TRA LỖI THI CÔNG

- **Sự cố:** Ống nước trục đứng tầng 8 bị nứt rò rỉ nước khi thử áp lực.
  - _Why 1:_ Tại sao nứt? $\rightarrow$ Do ống bị kích ứng suất uốn quá giới hạn khi siết đai treo.
  - _Why 2:_ Tại sao bị kích ứng suất? $\rightarrow$ Do tim ống bị lệch $25\text{mm}$ so với lỗ sleeve khoét sàn.
  - _Why 3:_ Tại sao lỗ sleeve bị lệch? $\rightarrow$ Do công nhân đặt sleeve không dùng quả dọi trắc đạc chuẩn.
  - _Why 4:_ Tại sao không dùng quả dọi? $\rightarrow$ Do thiếu dụng cụ trắc đạc chuyên dùng tại tổ đội.
  - _Why 5 (Root Cause):_ Tại sao thiếu dụng cụ? $\rightarrow$ Quy trình bàn giao dụng cụ đầu ca thi công chưa được Kỹ sư giám sát kiểm tra nghiệm thu trước khi cho lắp đặt.
  - **Hành động khắc phục gốc rễ (CAPA):** Bổ sung trạm kiểm tra dụng cụ bắt buộc đầu ca và kiểm tra mốc trắc đạc laser trước khi cố định sleeve.

---

### 3.3. [Cẩm nang kỹ thuật] hse-ai-vision-and-site-safety-index

# CẨM NANG THỊ GIÁC AI AN TOÀN HSE & CHỈ SỐ AN TOÀN CÔNG TRƯỜNG (SSI)

## 1. CÔNG THỨC CHỈ SỐ AN TOÀN CÔNG TRƯỜNG (SITE SAFETY INDEX - SSI)

$$SSI = \max\left(0, 100 - \sum_{i=1}^{k} \left( N_i \times W_i \right)\right)$$

| Mã Vi phạm       | Nội dung Mối nguy An toàn (QCVN 18:2021/BXD)                |         Mức độ          | Trọng số ($W_i$) |
| :--------------- | :---------------------------------------------------------- | :---------------------: | :--------------: |
| `HSE_NO_HELMET`  | Không đội mũ bảo hộ lao động hoặc không cài quai            |           Vừa           |   5 điểm / vụ    |
| `HSE_NO_VEST`    | Không mặc áo phản quang tại khu vực công trường             |           Nhẹ           |   2 điểm / vụ    |
| `HSE_NO_HARNESS` | Làm việc trên cao $\ge 2\text{m}$ không đeo/móc dây an toàn | **Cực kỳ Nghiêm trọng** | **25 điểm / vụ** |
| `HSE_NO_GUARD`   | Mép sàn / Lỗ mở thông tầng không có lan can rào chắn        | **Cực kỳ Nghiêm trọng** | **25 điểm / vụ** |
| `HSE_CRANE_ZONE` | Đi lại dưới vùng bán kính quay của cẩu tháp đang cẩu hàng   |      Nghiêm trọng       |   15 điểm / vụ   |
| `HSE_SMOKING`    | Hút thuốc tại khu vực chứa vật liệu dễ cháy (Sơn, Gas)      |      Nghiêm trọng       |   15 điểm / vụ   |

- **Xếp loại An toàn Công trường:**
  - $SSI \ge 90$: **Hạng A (Công trường An toàn Xuất sắc)**.
  - $75 \le SSI < 90$: **Hạng B (Đạt yêu cầu - Cần nhắc nhở)**.
  - $60 \le SSI < 75$: **Hạng C (Cảnh báo Vàng - Yêu cầu chấn chỉnh ngay)**.
  - $SSI < 60$: **Hạng D (Báo động Đỏ - Tạm dừng thi công để huấn luyện an toàn)**.

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/qaqc_safety_engine.ts](file:///c:/Users/liend/xboss/.agents/skills/qaqc-safety-sentinel/scripts/qaqc_safety_engine.ts): Bộ kịch bản CLI kiểm chứng ma trận ITP Hold-Points, vòng đời NCR 3 bước và tính toán chỉ số Site Safety Index (SSI).
