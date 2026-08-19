# M65 — Đặc tả Nâng cấp Toàn diện Năng lực & Công cụ CAD Thông minh (Cognitive CAD Engine & Autonomous Drafting)

| Thuộc tính       | Giá trị                                                |
| ---------------- | ------------------------------------------------------ |
| Issue / Goal     | GOAL-2026-PINNACLE-AUTONOMOUS-COGNITIVE-ENGINEERING-OS |
| Spec owner       | Seeker / Chief Engineering Architect                   |
| State            | **Approved for implementation**                        |
| Người/ngày duyệt | Seeker / 2026-08-19                                    |
| Cập nhật         | 2026-08-19                                             |

> **Nguyên tắc bất biến:** Không cấp quyền tự động hoá không kiểm soát. Bản vẽ phát hành chính thức, biên bản RFI và thay đổi phát sinh khối lượng (VO) bắt buộc phải qua xác thực của Kỹ sư trưởng / PM bằng **Single-use Cryptographic Token** (A2 Human Gate).

---

## 1. Problem, vai trò và bằng chứng

### 1.1 Pain points theo vai trò

- **Kỹ sư MEPF / Shopdrawing:** Tốn 50–70% thời gian vẽ lặp lại các chi tiết mặt cắt điển hình (Typical Details, Hangers & Supports, Sleeve Openings) và xử lý lỗi font chữ SHX/VNI khi nhận file từ nhiều nhà thầu phụ.
- **Kỹ sư QS / Dự toán:** Phải mở từng file CAD đếm thủ công từng block van, miệng gió, tủ điện để bóc tách khối lượng (QTO), dễ sai sót và lệch mã BOQ.
- **Chỉ huy trưởng (BCH) & Giám sát hiện trường:** Khó phát hiện điểm thay đổi giữa các phiên bản bản vẽ (Rev A vs Rev B). Thường chỉ phát hiện khi đã thi công sai lệch, dẫn đến đập phá sửa chữa (rework).
- **Giám đốc Dự án (PM):** Không kịp thời nắm bắt các thay đổi thiết kế dẫn đến phát sinh chi phí (Variation Orders - VO) để bảo vệ quyền lợi tài chính cho nhà thầu với Chủ đầu tư.

### 1.2 Bằng chứng & Baseline

- Thống kê ngành MEPF: Khoảng 35% thời gian vẽ CAD dành cho việc chuẩn hóa layer, chỉnh sửa font và bóc tách thủ công.
- Chi phí phát sinh tranh chấp do không phát hiện kịp thay đổi bản vẽ giữa các lần cập nhật thiết kế chiếm trung bình 3–8% giá trị gói thầu.

---

## 2. Outcome, metric và guardrail

### 2.1 Target đo lường (Success Metrics)

1. **Tốc độ so sánh phiên bản CAD (Visual CAD Diff Latency):** Phân tích và render đối soát vector giữa 2 file CAD (Rev A vs Rev B) trong thời gian $< 2.5\text{s}$ cho bản vẽ $\le 50,000$ thực thể.
2. **Độ chính xác bóc tách Block động (Dynamic Block QTO Accuracy):** Trích xuất đúng $\ge 99.5\%$ số lượng và thuộc tính thiết bị (Mã, công suất, kích thước) từ Block Definitions.
3. **Hiệu suất sinh mã vẽ tự động (Auto-LISP / Script Drafting Speed):** Tự động sinh mã AutoLISP / AutoCAD Script hoàn chỉnh vẽ mặt cắt chi tiết giá đỡ và lỗ mở sleeve trong $< 1.0\text{s}$.
4. **Tỷ lệ chuẩn hóa Layer & Sửa Font thành công (Font Doctor Success Rate):** Chuẩn hóa $\ge 98\%$ các layer theo chuẩn AIA/Dự án và sửa toàn bộ lỗi font SHX/VNI thành Unicode UTF-8.

### 2.2 Guardrails

- **PostgreSQL Invariant & RLS:** $100\%$ dữ liệu bản vẽ và trích xuất thực thể tuân thủ RLS strict theo `project_id`.
- **Zero Local Client Bloat:** Quá trình phân tích hình học CAD nặng được xử lý thông qua Web Worker hoặc background jobs, không làm đơ giao diện người dùng.

---

## 3. Nghiên cứu hiện trạng

- `app/drawings/page.tsx`: Quản lý danh mục bản vẽ (Drawing Register) theo revision (Rev A/B/C) và 5 phân loại (`design`, `shop`, `asbuilt`, `bim`, `method`).
- `lib/engineering-bim-cad.ts`: Đã có module tính toán hộp bao 3D AABB, liên kết 4D/5D và kiểm tra xung đột không gian.
- `lib/engineering-swarm.ts`: Đã có Swarm Debate Protocol và Autonomous Drafting cho RFI/Submittal.

---

## 4. Phương án kiến trúc

| Phương án                                                                                      | Lợi ích                                                                                                                      | Chi phí / Rủi ro                                                                                                | Kết luận            |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------- |
| **Không làm**                                                                                  | Không tốn thêm công sức lập trình.                                                                                           | Kỹ sư tiếp tục vẽ và bóc tách thủ công, giảm năng suất và chậm trễ tiến độ.                                     | **Bác bỏ**          |
| **Phương án A: Dùng phần mềm thương mại bên ngoài (AutoCAD Cloud API, Forge)**                 | Tận dụng công cụ có sẵn.                                                                                                     | Chi phí bản quyền định kỳ rất cao, dữ liệu phụ thuộc cloud bên thứ 3, không tích hợp sâu với WBS/BOQ của XBoss. | **Bác bỏ**          |
| **Phương án B (Khuyến nghị): Phát triển Bộ Công cụ CAD Thông minh Tích hợp Native trên XBoss** | Hoàn toàn làm chủ công nghệ, tích hợp 100% với PostgreSQL Raw SQL, RLS, WBS 4D và BOQ 5D, không phát sinh chi phí bản quyền. | Yêu cầu thiết kế thuật toán vector diff và parser chặt chẽ.                                                     | **CHỌN (Approved)** |

---

## 5. Phạm vi (Scope) & Non-goals

### In scope

1. **CAD Visual Diff Engine:** So sánh vector trực quan giữa 2 revision bản vẽ (Màu xanh = Thêm mới, Màu đỏ = Bị xóa, Màu vàng = Di dời/Sửa đổi).
2. **Dynamic Block & Attribute QTO Extractor:** Trích xuất thuộc tính block thiết bị tự động và map sang danh mục BOQ.
3. **Auto-LISP & Script Shopdrawing Drafter:** AI sinh mã `.lsp`, `.scr` tự động vẽ chi tiết mặt cắt lắp đặt điển hình.
4. **CAD Layer Normalizer & Font Doctor:** Tự động sửa mã font SHX/VNI thành Unicode và chuyển đổi hệ layer.
5. **2D-to-3D Spatial Extrusion:** Đùn khối 3D từ polyline 2D và text cao độ thành hình học 3D Digital Twin.

### Non-goals

- Không thay thế hoàn toàn phần mềm AutoCAD Desktop trong việc biên tập hình học tự do phức tạp.

---

## 6. User Journeys & Các Trạng thái

1. **So sánh Phiên bản CAD (Visual Diff):**
   - Kỹ sư tải lên Rev B $\rightarrow$ Chọn Rev A để đối soát $\rightarrow$ Hệ thống hiển thị bản đồ nhiệt thay đổi (Redline Overlay) $\rightarrow$ Tự động thống kê các khối lượng tăng/giảm gửi phòng Dự toán.
2. **Sinh mã vẽ AutoLISP tự động (Autonomous Drafting):**
   - Kỹ sư chọn loại chi tiết cần vẽ (vd: "Giá đỡ 3 tầng ống D114 + D65 + Máng cáp 300") $\rightarrow$ Nhập khoảng cách ty giằng $\rightarrow$ Hệ thống sinh file `.lsp` $\rightarrow$ Tải về chạy trực tiếp trên AutoCAD.

---

## 7. Functional & Non-Functional Requirements

### 7.1 Functional Requirements (FR)

- **FR-01 (Vector CAD Diffing):** So sánh từng thực thể hình học (Line, Polyline, Circle, Arc, Text) giữa 2 file bản vẽ và phân loại trạng thái (`added`, `removed`, `modified`, `unchanged`).
- **FR-02 (Block Attribute Parser):** Đọc bảng định nghĩa Block Definitions, trích xuất Name, Layer, Coordinates, Rotation, Attribute Tags và Values.
- **FR-03 (AutoLISP Generator):** Sinh cú pháp AutoLISP chuẩn (`(defun c:... () ...)`) tạo các đối tượng CAD theo layer, kích thước và ghi chú tự động.
- **FR-04 (Font Converter):** Tự động chuyển đổi chuỗi nhị phân font SHX tiếng Việt (VNI, TCVN3-ABC) sang bảng mã UTF-8.
- **FR-05 (2D to 3D Extruder):** Dựng hình học 3D Bounding Box từ đường tim tuyến 2D và thuộc tính tiết diện/cao độ.

### 7.2 Non-Functional Requirements (NFR)

- **NFR-01 (Performance):** Thuật toán so sánh diff xử lý xong trong $< 2.5\text{s}$ trên trình duyệt.
- **NFR-02 (Reliability):** Mã AutoLISP sinh ra không gây crash AutoCAD, có kiểm soát bắt lỗi `*error*` handler.

---

## 8. Acceptance Criteria (AC)

- **AC-01:** Given 2 phiên bản bản vẽ Rev A và Rev B, When chạy CAD Diff, Then hệ thống phát hiện chính xác 100% các thực thể bị thêm/xóa/sửa và hiển thị đúng 3 màu quy ước.
- **AC-02:** Given danh sách Block thiết bị trong file CAD, When bấm trích xuất QTO, Then bảng thống kê hiển thị đầy đủ tên, số lượng, tọa độ và tự động map với mã BOQ tương ứng.
- **AC-03:** Given yêu cầu tạo chi tiết giá đỡ ty treo, When chọn thông số ống, Then hệ thống sinh tệp mã `.lsp` hợp lệ, load vào AutoCAD vẽ đúng kích thước và layer.

---

## 9. Kiến trúc và Điểm chạm Code

```text
lib/
├── engineering-cad-skills.ts          # Core Library: Diffing, LISP generator, Font fixer, Extrusion
app/
├── api/engineering/cad/
│   ├── diff/route.ts                 # API so sánh 2 phiên bản CAD
│   ├── blocks/route.ts               # API trích xuất Block & thuộc tính
│   ├── lisp-generator/route.ts       # API sinh mã AutoLISP / Script
│   └── layer-normalizer/route.ts     # API chuẩn hóa Layer & Font
├── engineering/cad/
│   └── page.tsx                      # Giao diện CAD Engineering Studio
tests/
└── engineering-cad-skills.test.ts    # Bộ kiểm thử Unit Tests
```

---

## 10. Data Contract & DDL (Migration 0099)

```sql
-- Migration: 0099_engineering_cad_skills.sql
-- Nâng cấp năng lực xử lý CAD chuyên sâu

CREATE TABLE IF NOT EXISTS engineering_cad_diff_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  base_drawing_id BIGINT REFERENCES drawings(id) ON DELETE CASCADE,
  compare_drawing_id BIGINT REFERENCES drawings(id) ON DELETE CASCADE,
  total_entities_base INT NOT NULL DEFAULT 0,
  total_entities_compare INT NOT NULL DEFAULT 0,
  diff_summary JSONB NOT NULL DEFAULT '{"added": 0, "removed": 0, "modified": 0, "unchanged": 0}'::jsonb,
  diff_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  potential_vo_impact JSONB NOT NULL DEFAULT '{"estimated_cost_vnd": 0, "risk_level": "low"}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_cad_block_catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  block_name TEXT NOT NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('hvac', 'plumbing', 'electrical', 'firefighting', 'structure', 'architecture')),
  category TEXT NOT NULL,
  attribute_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  mapped_boq_code TEXT,
  mapped_material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cad_block_project_name UNIQUE (project_id, block_name)
);

CREATE TABLE IF NOT EXISTS engineering_cad_lisp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  detail_category TEXT NOT NULL CHECK (detail_category IN ('hanger_support', 'sleeve_opening', 'duct_transition', 'manhole_section', 'equipment_pad')),
  lisp_code_template TEXT NOT NULL,
  parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE engineering_cad_diff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_cad_diff_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_cad_diff_project ON engineering_cad_diff_sessions;
CREATE POLICY p_eng_cad_diff_project ON engineering_cad_diff_sessions
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
```

---

## 11. Kế hoạch Slice & Triển khai

1. **Slice CAD-1 (Core Logic & Vector Diff Engine):** Xây dựng `lib/engineering-cad-skills.ts`, Migration `0099` và Unit Tests.
2. **Slice CAD-2 (REST APIs & Auto-LISP Engine):** Xây dựng 4 API endpoints cho Diff, Block Extraction, LISP Generator và Layer Normalizer.
3. **Slice CAD-3 (CAD Engineering Studio UI):** Xây dựng trang `/engineering/cad` với visual canvas, công cụ redline diff và tải script AutoLISP.
4. **Slice CAD-4 (Integration & Gate Verification):** Chạy full suite kiểm thử, typecheck, lint, build và cập nhật tài liệu dự án.
