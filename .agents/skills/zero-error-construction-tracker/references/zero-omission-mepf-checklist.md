# DANH MỤC CHECKLIST KIỂM SOÁT 100% KHÔNG BỎ SÓT HẠNG MỤC THI CÔNG MEPF

## (THE ZERO-OMISSION MEPF CONSTRUCTION CHECKLIST COMPENDIUM)

---

## 1. NGUYÊN TẮC "CHECKLIST KHÉP KÍN" (CLOSED-LOOP CHECKLIST PROTOCOL)

Một hạng mục thi công cơ điện (MEPF) chỉ được coi là hoàn thành $100\%$ khi và chỉ khi toàn bộ các mục kiểm tra trong danh mục dưới đây đều đạt trạng thái `VERIFIED` kèm chữ ký số và bằng chứng hình ảnh.

---

## 2. HỆ THỐNG CẤP THOÁT NƯỚC & PCCC (PLUMBING & FIRE FIGHTING)

### 2.1. Công tác Ngầm & Âm Sàn (Concealed & Embedded Works):

- [ ] **Sleeves xuyên dầm/sàn:** Đã cố định chắc chắn, bịt nắp 2 đầu chống bê tông lọt vào, cao độ và đường kính đúng Shopdrawing.
- [ ] **Độ dốc đường ống thoát nước:**
  - Ống thoát phân/nước thải D110: Độ dốc tối thiểu $i = 1\% - 2\%$.
  - Ống thoát nước mưa D110/D160: Độ dốc $i \ge 1\%$.
- [ ] **Thử kín ống thoát nước:** Đổ nước đầy đường ống, ngâm trong $24\text{h}$, kiểm tra không rò rỉ tại 100% mối nối keo/zoăng.
- [ ] **Ống ngầm cấp nước PPR/HDPE:** Đã bọc lớp bảo vệ chống va đập cơ học trước khi đổ bê tông lót.

### 2.2. Công tác Lộ Thiên & Trục Đứng (Exposed & Shaft Works):

- [ ] **Khoảng cách giá đỡ / ty treo:**
  - Ống D20 - D32: Khoảng cách ty $\le 1.2\text{m}$.
  - Ống D40 - D63: Khoảng cách ty $\le 1.5\text{m}$.
  - Ống $\ge$ D75: Khoảng cách ty $\le 2.0\text{m}$.
- [ ] **Thử áp lực thủy tĩnh (Hydrostatic Pressure Test):**
  - Áp suất thử: $1.5 \times P_{\text{làm việc}}$ (tối thiểu $10\text{ bar}$ cho hệ PCCC, $8\text{ bar}$ cho hệ cấp nước).
  - Thời gian duy trì: Tối thiểu $2\text{ giờ}$ không sụt áp ($\Delta P = 0$).
  - Có áp kế kiểm định còn hạn và cảm biến IoT truyền telemetry liên tục.
- [ ] **Đầu phun Sprinkler PCCC:** Khoảng cách đến trần $\le 300\text{mm}$, bán kính bảo vệ đúng thiết kế QCVN 06:2022/BXD.

---

## 3. HỆ THỐNG THÔNG GIÓ & ĐIỀU HÒA KHÔNG KHÍ (HVAC / ACMV)

### 3.1. Ống Gió & Thiết Bị:

- [ ] **Độ kín ống gió (Duct Leakage Test):** Thử rò rỉ theo tiêu chuẩn SMACNA / DW144.
- [ ] **Bảo ôn cách nhiệt:** Không bị rách, dán kín băng bạc tại 100% mối nối, không có cầu nhiệt (Thermal Bridge).
- [ ] **Van chặn lửa (Fire Damper - FD):** Đã kiểm tra độ nhạy cầu chì nhiệt ($72^\circ\text{C}$ hoặc $93^\circ\text{C}$), cảm biến liên động BMS hoạt động tốt.
- [ ] **Cân chỉnh lưu lượng gió (TAB):** Sai số lưu lượng tại từng miệng gió (Diffuser/Grille) nằm trong khoảng $[-10\%, +10\%]$.

---

## 4. HỆ THỐNG ĐIỆN & ĐIỆN NHẸ (ELECTRICAL & ELV)

### 4.1. Tiếp Địa & Chống Sét (Grounding & Lightning):

- [ ] **Điện trở tiếp địa an toàn:** $R \le 4\Omega$ (đo bằng máy Kyoritsu có chứng chỉ kiểm định).
- [ ] **Điện trở tiếp địa chống sét:** $R \le 10\Omega$.
- [ ] **Liên kết đồng thế (Equipotential Bonding):** Đã nối cọc tiếp địa vào tất cả vỏ tủ điện, máng cáp, đường ống kim loại lớn.

### 4.2. Kéo Cáp & Tủ Điện:

- [ ] **Đo điện trở cách điện (Megger Test):** Đo giữa các pha và pha với đất $R_{\text{cách điện}} \ge 0.5\text{ M}\Omega$ (điện áp thử $500\text{V}$ hoặc $1000\text{V}$).
- [ ] **Bấm cosse & Siết lực đầu cáp (Torque Check):** Bấm cosse đúng tiết diện, siết ốc bằng cần siết lực (Torque Wrench) và đánh dấu sơn niêm phong (Torque Seal).
- [ ] **Đánh số nhãn cáp (Cable Tagging):** 100% đầu cáp có nhãn ghi rõ nguồn, đích, tiết diện theo sơ đồ nguyên lý Single Line Diagram.
