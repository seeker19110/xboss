# ĐẶC TẢ KỸ THUẬT: NEXT-GEN APEX AUTONOMOUS CONSTRUCTION OS

## Hệ Điều Hành Xây Dựng Tự Hành, Trực Quan Hóa Thực Địa & Khép Kín Pháp Lý

- **Mã định danh:** SPEC-ENG-NEXTGEN-APEX-2026
- **Trạng thái:** **Approved for implementation**
- **Người duyệt:** Seeker / Chief Engineering Architect
- **Ngày duyệt:** 2026-08-20
- **Phạm vi:** Nâng cấp đột phá CAD/BIM Generative 3D, Edge-AI 360 SLAM Tracking, Pre-Pour Rebar CV Circuit Breaker, Instant Smart IPC 60s, và Autonomous FIDIC TIA Claims.

---

### 1. BỐI CẢNH & MỤC TIÊU CỐT LÕI

Nhằm vượt qua các rào cản truyền thống của các phần mềm quản lý xây dựng đơn lẻ (Autodesk ACC, Procore, OpenSpace, Buildots), XBoss Next-Gen Apex tích hợp 4 động cơ tự hành khép kín:

1. **Generative 3D Spatial A\* Router**: Tự động giải tỏa xung đột và bẻ tuyến 3D theo đồ thị voxel/octree với các bất biến vật lý thủy lực.
2. **Edge-AI 360 SLAM & Pre-Pour Rebar Verification**: Định vị camera 360 trong BIM và kiểm soát khoảng cách thép sàn/con kê trước khi đổ bê tông.
3. **Instant Smart IPC 60s**: Tự động giải ngân theo chứng chỉ thanh toán tạm thời sau khi thỏa mãn 4 cổng nghiệm thu vật lý và đối soát định lượng.
4. **Autonomous FIDIC TIA Delay Claims**: Chạy phân tích TIA trên đường găng CPM và tự động soạn thảo Thư khiếu nại bù trừ tiến độ/chi phí theo Điều 20.1/20.2 FIDIC.

---

### 2. QUY CHUẨN KỸ THUẬT & CÔNG THỨC TOÁN HỌC

#### 2.1. Động cơ 3D Generative Routing

- Tìm đường đi trong không gian 3D dạng lưới Voxel với hàm chi phí:
  $$f(n) = g(n) + h(n) + \text{Cost}_{\text{elbow}} \cdot N_{\text{bends}} + \text{Cost}_{\text{slope\_violation}}$$
- Bất biến:
  - Hệ thoát nước tự chảy: Bảo toàn độ dốc $1.0\% \le s \le 2.0\%$.
  - Lỗ khoét dầm bê tông: $L/3 \le x_{\text{sleeve}} \le 2L/3$ và $D_{\text{sleeve}} \le H_{\text{beam}}/3$.
  - Tính tổn thất áp suất Darcy-Weisbach:
    $$\Delta P = f \cdot \frac{L}{D} \cdot \frac{\rho v^2}{2} + \sum \xi \cdot \frac{\rho v^2}{2}$$

#### 2.2. Kiểm soát Cốt thép Tiền đổ Bê tông (Pre-Pour Rebar CV)

- Đo bước thép đai/lưới: $|a_{\text{measured}} - a_{\text{design}}| \le 10\text{mm}$.
- Mật độ con kê bảo vệ: $\text{Density}_{\text{spacer}} \ge 4.0\text{ con/m}^2$.
- Nếu vi phạm: Khóa cứng `pour_permit_status = 'LOCKED_CIRCUIT_OPEN'`.

#### 2.3. Thẩm định Smart IPC 4 Cổng (4-Gate Verification)

1. **Gate 1 (Geometry)**: $\Delta_{\text{Scan-to-BIM}} \le 15\text{mm}$.
2. **Gate 2 (Legality)**: BBNT ký số 3 bên (Nhà thầu, TVGS, CĐT).
3. **Gate 3 (Integrity)**: IoT Hydrostatic Test giữ áp $\ge 2\text{h}$, $\Delta P = 0$.
4. **Gate 4 (Quantity)**: $Q_{\text{actual}} \le \min(Q_{\text{BIM}}, Q_{\text{BOQ}}, Q_{\text{GRN}})$.

#### 2.4. Phân tích Chậm trễ TIA (Time Impact Analysis FIDIC)

- Chèn nhánh sự kiện trễ (Fragnet) vào CPM:
  $$\Delta \text{Delay}_{\text{Project}} = \max(0, \text{EarlyFinish}_{\text{post}} - \text{EarlyFinish}_{\text{pre}})$$
- Chi phí kéo dài công trường:
  $$\text{Prolongation Cost} = \text{Daily Site Overhead} \times \text{EOT Days}$$

---

### 3. DATABASE MIGRATION & RLS

Migration `0127_nextgen_apex_engineering_systems.sql` tuân thủ PostgreSQL raw SQL và RLS theo `project_id`.
