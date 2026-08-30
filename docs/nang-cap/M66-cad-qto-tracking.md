# M66 — Đặc tả Hệ thống Hợp nhất CAD — Khối Lượng (QTO) — Tracking Tiến Độ & Nghiệm Thu (Closed-Loop CAD-QTO-Tracking Engine)

| Thuộc tính       | Giá trị                                                |
| ---------------- | ------------------------------------------------------ |
| Issue / Goal     | GOAL-2026-PINNACLE-AUTONOMOUS-COGNITIVE-ENGINEERING-OS |
| Spec owner       | Seeker / Chief Engineering Architect                   |
| State            | **Approved for implementation**                        |
| Người/ngày duyệt | Seeker / 2026-08-19                                    |
| Cập nhật         | 2026-08-19                                             |

> **Nguyên tắc bất biến:** Không được phép nghiệm thu hoặc thanh toán khống. Mọi khối lượng nghiệm thu phải có nguồn gốc hình học (Provenance Traceability) liên kết chặt chẽ với Spool ID trên bản vẽ CAD và được duyệt bằng **Single-use Cryptographic Token** (A2 Human-in-the-loop Gate).

---

## 1. Problem, vai trò và bằng chứng

### 1.1 Pain points theo vai trò

- **Kỹ sư MEPF / Shopdrawing:** Phải đo đạc thủ công từng tuyến ống, máng cáp và đếm từng thiết bị trên file CAD rồi gõ lại vào Excel; tốn nhiều ngày mỗi lần có bản vẽ điều chỉnh.
- **Kỹ sư QS / Dự toán:** Không thể đối soát tức thời sự khác biệt giữa khối lượng Hợp đồng (BOQ) và khối lượng Shopdrawing thực tế $\rightarrow$ Bị động khi giải trình phát sinh (VO) với Chủ đầu tư.
- **Chỉ huy trưởng & Giám sát hiện trường:** Phải chấm tiến độ thủ công, khó nắm bắt chính xác phân đoạn nào đã lắp đặt, phân đoạn nào chưa nghiệm thu; mất 2-3 ngày để lập 1 bộ hồ sơ Biên bản nghiệm thu (BBNT) kèm bảng tính khối lượng.
- **Giám đốc Dự án (PM) & Kế toán:** Rủi ro thanh toán vượt khối lượng thực tế (Overpayment) do thiếu số liệu liên kết trực tiếp giữa bản vẽ hoàn công và chứng chỉ thanh toán (Payment Certification).

### 1.2 Bằng chứng & Baseline

- Nghiên cứu thực địa: Kỹ sư mất trung bình **35% thời gian** cho việc đo bóc khối lượng lặp lại và lập hồ sơ nghiệm thu.
- Tỷ lệ hao hụt vật tư không rõ nguyên nhân chiếm **4–7% giá trị vật tư gói thầu** do không theo dõi được sai lệch giữa khối lượng xuất kho và khối lượng lắp đặt thực tế trên bản vẽ.

---

## 2. Outcome, metric và guardrail

### 2.1 Target đo lường (Success Metrics)

1. **Tốc độ Bóc tách Khối lượng CAD (Auto-QTO Speed):** Tự động trích xuất toàn bộ khối lượng ống ($m^2$), đường ống ($m$), dây cáp ($m$) và thiết bị ($cái$) từ bản vẽ CAD $\le 5,000$ đối tượng trong $< 1.5\text{s}$.
2. **Độ chính xác Đối soát 3 Chiều (3-Way Variance Accuracy):** Tính toán chính xác $100\%$ chênh lệch $\Delta_{\text{VO}} = Q_{\text{Shop}} - Q_{\text{Contract}}$ và $\Delta_{\text{Loss}} = Q_{\text{Issued}} - Q_{\text{Installed}}$.
3. **Thời gian Lập Hồ sơ Nghiệm thu (BBNT Generation Time):** Tự động tổng hợp danh mục Spool đã hoàn thành và sinh BBNT kèm phụ lục khối lượng trong $< 2.0\text{s}$ (giảm 95% thời gian so với làm thủ công).
4. **Độ trễ Đồng bộ Tiến độ Không gian (Spatial Tracking Sync Latency):** Khi kỹ sư chấm mốc Spool trên bản vẽ CAD, tiến độ WBS Task và khối lượng luỹ kế được cập nhật trong $< 200\text{ms}$.

### 2.2 Guardrails

- **PostgreSQL Invariant & RLS:** $100\%$ bảng dữ liệu Spool và phiên theo dõi khối lượng tuân thủ RLS strict theo `project_id`.
- **Integrity Lock:** Khối lượng sau khi đã được ký duyệt BBNT (`status = 'bbnt_approved'`) sẽ bị khóa bất biến (Immutable), không cho phép sửa đổi tọa độ hình học hoặc số đo.

---

## 3. Nghiên cứu hiện trạng

- `migrations/0016_drawings.sql`: Quản lý danh mục bản vẽ `drawings` và các bản sửa đổi `drawing_revisions`.
- `migrations/0005_boq.sql` & `0022_boq_norms.sql`: Quản lý hạng mục `boq_items` và định mức vật tư `boq_norms`.
- `migrations/0009_inspection_requests.sql`: Quản lý phiếu yêu cầu nghiệm thu `inspection_requests` và bảng liên kết `inspection_request_tasks`.
- `migrations/0014_payment_certs.sql`: Quản lý chứng chỉ thanh toán `payment_certs` và các dòng khối lượng `payment_cert_items`.
- `lib/engineering-cad-skills.ts` (M65): Đã có engine giải mã vector, phát hiện sai khác diff và sinh mã AutoLISP.

---

## 4. Phương án kiến trúc

| Phương án                                                                                     | Lợi ích                                                                                                                                                                                                           | Chi phí / Rủi ro                                                                                                                    | Kết luận            |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **Không làm**                                                                                 | Không tốn thêm công sức lập trình.                                                                                                                                                                                | Kỹ sư tiếp tục đo bóc thủ công, dữ liệu đứt gãy, thất thoát vật tư và rủi ro chậm thanh toán.                                       | **Bác bỏ**          |
| **Phương án A: Sử dụng phần mềm bóc tách chuyên dụng bên ngoài (Cubicost, PlanSwift)**        | Có sẵn giao diện đo bóc.                                                                                                                                                                                          | Chi phí bản quyền đắt đỏ, dữ liệu nằm rời rạc ngoài hệ thống XBoss, không tự động sinh được BBNT và không liên kết với WBS/Tiến độ. | **Bác bỏ**          |
| **Phương án B (Khuyến nghị): Xây dựng Closed-Loop CAD-QTO-Tracking Engine Native trên XBoss** | Tích hợp hoàn toàn từ Bản vẽ CAD $\rightarrow$ Khối lượng 5D $\rightarrow$ Tracking Tiến độ $\rightarrow$ Nghiệm thu BBNT $\rightarrow$ Thanh toán, tuân thủ tuyệt đối PostgreSQL Raw SQL, RLS và Token Security. | Cần thiết kế mô hình thực thể Spool và thuật toán tính sai lệch 3 chiều chặt chẽ.                                                   | **CHỌN (Approved)** |

---

## 5. Phạm vi (Scope) & Non-goals

### In scope

1. **CAD Spool & Spatial Entity Registry:** Quản lý danh mục phân đoạn tuyến (Spool) gắn với hệ thống, tầng, khu vực (Zone) và mã định danh duy nhất.
2. **Live 5D QTO & 3-Way Variance Matrix:** Bóc tách khối lượng hình học tự động và đối soát 3 chiều giữa Hợp đồng (BOQ) vs Bản vẽ Shopdrawing vs Thi công thực tế.
3. **Interactive Visual CAD Pinning:** Giao diện mặt bằng CAD tương tác cho phép kỹ sư chạm để cập nhật tiến độ 5 mốc (`fabricated` $\rightarrow$ `delivered` $\rightarrow$ `installed` $\rightarrow$ `qc_passed` $\rightarrow$ `bbnt_approved`).
4. **Autonomous BBNT & Inspection Request Linking:** Tự động gom nhóm các Spool đã đạt KCS để tạo Phiếu yêu cầu nghiệm thu và phụ lục khối lượng.
5. **Payment Certification Feed:** Tự động chuyển khối lượng đã duyệt sang kỳ chứng chỉ thanh toán.

### Non-goals

- Không can thiệp vào nghiệp vụ kế toán thuế hoặc hạch toán tài chính bên ngoài phần mềm ERP kế toán chuyên dụng.

---

## 6. User Journeys & Các Trạng thái

1. **Bóc tách Khối lượng từ CAD (Auto-QTO):**
   - Kỹ sư mở bản vẽ CAD $\rightarrow$ Hệ thống tự động chia nhỏ tuyến thành các Spool $\rightarrow$ Bóc tách diện tích ống gió $m^2$, mét dài ống $m$, số lượng thiết bị $\rightarrow$ Khớp nối tự động với mã `boq_items`.
2. **Chấm Tiến độ trên Mặt bằng Số (Visual CAD Tracking):**
   - Kỹ sư hiện trường dùng tablet mở mặt bằng CAD $\rightarrow$ Chạm vào đoạn ống `SP-DUCT-L4-001` $\rightarrow$ Chọn trạng thái "Đã lắp đặt (Installed)" $\rightarrow$ Khối lượng luỹ kế tự động nhảy thêm $12.5\text{ m}^2$, tiến độ công việc Task nhảy từ 60% lên 75%.
3. **Nghiệm thu & Đẩy sang Thanh toán (BBNT to Payment):**
   - Kỹ sư chọn toàn bộ Zone A Tầng 4 $\rightarrow$ Bấm "Lập Yêu Cầu Nghiệm Thu" $\rightarrow$ Hệ thống sinh phiếu `YCNT-2026-008` kèm phụ lục khối lượng $\rightarrow$ TVGS duyệt `bbnt_approved` $\rightarrow$ Khối lượng tự động chuyển sang Kỳ thanh toán đợt 5.

---

## 7. Functional & Non-Functional Requirements

### 7.1 Functional Requirements (FR)

- **FR-01 (Spool Entity Management):** Lưu trữ thông tin từng phân đoạn Spool (Mã Spool, Hệ thống, Tầng, Khu vực, Tọa độ 3D, Kích thước tiết diện, Chiều dài, Diện tích, Khối lượng đơn vị).
- **FR-02 (3-Way Variance Calculation):** Tính toán ma trận sai lệch $Q_{\text{Contract}}$, $Q_{\text{Shop}}$, $Q_{\text{Installed}}$, $Q_{\text{Approved}}$, tự động phát hiện nguy cơ phát sinh VO hoặc vượt định mức.
- **FR-03 (Interactive Spatial Pinning):** Cho phép cập nhật trạng thái tiến độ theo 5 mốc chuẩn kèm ghi nhận thời gian và người thực hiện.
- **FR-04 (Earned Value Physical QTO):** Tính toán khối lượng giá trị thu được ($EV_{\text{qty}}$) theo trọng số mốc hoàn thành.
- **FR-05 (Inspection Request Generation):** Tự động sinh bản ghi `inspection_requests` gắn kèm danh sách Spool và bảng tổng hợp khối lượng nghiệm thu.

### 7.2 Non-Functional Requirements (NFR)

- **NFR-01 (Performance):** Bóc tách khối lượng và đối soát cho bản vẽ 5,000 Spool hoàn thành trong $< 1.5\text{s}$.
- **NFR-02 (Mobile-First Responsiveness):** Giao diện Visual Pinning hoạt động mượt mà trên thiết bị di động/máy tính bảng tại công trường.

---

## 8. Acceptance Criteria (AC)

- **AC-01:** Given bản vẽ Shopdrawing CAD có 20 phân đoạn ống gió, When chạy Auto-QTO, Then hệ thống tính đúng $100\%$ diện tích tôn $m^2$ từng đoạn và gán đúng Spool ID.
- **AC-02:** Given khối lượng Shopdrawing lớn hơn khối lượng BOQ hợp đồng ($Q_{\text{Shop}} > Q_{\text{BOQ}}$), When tính toán ma trận sai lệch, Then hệ thống tự động đưa ra cảnh báo VO và đề xuất giá trị phát sinh VND.
- **AC-03:** Given các Spool ở trạng thái `qc_passed`, When bấm tạo yêu cầu nghiệm thu, Then hệ thống sinh đúng phiếu `inspection_requests` kèm bảng khối lượng nghiệm thu chuẩn xác.

---

## 9. Kiến trúc và Điểm chạm Code

```text
migrations/
└── 0100_cad_qto_tracking.sql         # Migration DDL: Spools, Variance Matrix, Spatial Progress
lib/
└── engineering-cad-qto.ts            # Core Engine: 5D QTO, 3-Way Variance, BBNT Auto-Aggregator
app/
├── api/engineering/cad-qto/
│   ├── spools/route.ts               # GET / POST quản lý Spools
│   ├── variance/route.ts             # GET ma trận đối soát khối lượng 3 chiều
│   ├── progress/route.ts             # POST chấm mốc tiến độ trên bản vẽ
│   └── bbnt-generate/route.ts        # POST sinh phiếu nghiệm thu tự động
├── engineering/cad-tracking/
│   └── page.tsx                      # Giao diện Visual CAD Interactive Tracking Cockpit
tests/
└── engineering-cad-qto.test.ts       # Bộ kiểm thử Unit & Integration Tests
```

---

## 10. Data Contract & DDL (Migration 0100)

```sql
-- Migration: 0100_cad_qto_tracking.sql
-- Hợp nhất CAD, Khối lượng và Tracking Nghiệm thu

CREATE TABLE IF NOT EXISTS engineering_cad_spools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_id INTEGER REFERENCES drawings(id) ON DELETE SET NULL,
  spool_code TEXT NOT NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('hvac', 'plumbing', 'electrical', 'firefighting', 'structure', 'architecture')),
  system_code TEXT NOT NULL,
  floor_label TEXT NOT NULL,
  zone_label TEXT NOT NULL DEFAULT 'Main',
  dimension_spec TEXT NOT NULL, -- e.g. "500x300", "DN100", "300x100"
  length_m NUMERIC(12,3) NOT NULL DEFAULT 0,
  calculated_qty NUMERIC(15,3) NOT NULL DEFAULT 0, -- e.g. m2 duct or m pipe or pcs
  unit TEXT NOT NULL, -- "m2", "m", "kg", "cai", "bo"
  boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'fabricated'
    CHECK (status IN ('fabricated', 'delivered', 'installed', 'qc_passed', 'bbnt_approved')),
  inspection_request_id INTEGER REFERENCES inspection_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cad_spool_project_code UNIQUE (project_id, spool_code)
);

CREATE TABLE IF NOT EXISTS engineering_cad_qto_variances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  qty_contract NUMERIC(15,3) NOT NULL DEFAULT 0,
  qty_shop_cad NUMERIC(15,3) NOT NULL DEFAULT 0,
  qty_installed NUMERIC(15,3) NOT NULL DEFAULT 0,
  qty_approved_bbnt NUMERIC(15,3) NOT NULL DEFAULT 0,
  delta_vo_qty NUMERIC(15,3) GENERATED ALWAYS AS (qty_shop_cad - qty_contract) STORED,
  estimated_vo_vnd NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'vo_risk', 'over_norm', 'critical_variance')),
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cad_qto_variance_proj_boq UNIQUE (project_id, boq_item_id)
);

ALTER TABLE engineering_cad_spools ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_cad_spools FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_cad_spools_project ON engineering_cad_spools;
CREATE POLICY p_eng_cad_spools_project ON engineering_cad_spools
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_cad_qto_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_cad_qto_variances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_cad_qto_variances_project ON engineering_cad_qto_variances;
CREATE POLICY p_eng_cad_qto_variances_project ON engineering_cad_qto_variances
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

CREATE INDEX IF NOT EXISTS idx_cad_spools_proj_status ON engineering_cad_spools(project_id, status);
CREATE INDEX IF NOT EXISTS idx_cad_spools_floor_zone ON engineering_cad_spools(project_id, floor_label, zone_label);
```

---

## 11. Kế hoạch Slice & Triển khai

1. **Slice CQT-1 (Data Layer & Migration 0100):** Tạo bảng `engineering_cad_spools`, `engineering_cad_qto_variances` và RLS policies.
2. **Slice CQT-2 (Core Math Engine & Variance Calculator):** Xây dựng `lib/engineering-cad-qto.ts` với các thuật toán tính toán diện tích/độ dài Spool, Earned Value $EV_{\text{qty}}$, ma trận 3 chiều và sinh phiếu nghiệm thu tự động.
3. **Slice CQT-3 (REST APIs):** Xây dựng 4 API endpoints cho Spools, Variance Matrix, Progress Update và BBNT Generator.
4. **Slice CQT-4 (Interactive UI Cockpit):** Xây dựng trang `/engineering/cad-tracking` (Visual CAD Interactive Tracking Cockpit).
5. **Slice CQT-5 (Full Gate Verification & Delivery):** Chạy toàn bộ kiểm thử Unit Tests, Typecheck, Lint, Next.js Build và đẩy lên production.
