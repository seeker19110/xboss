# M74 — Trình Xem Bản Vẽ Tương Tác WebGL 2D/3D & Chấm Mốc Không Gian (Interactive CAD/BIM Pinning Studio)

> **Trạng thái:** Đã hoàn thành (2026-08-19)  
> **Phụ thuộc:** `migrations/0108_spatial_annotations_pinning.sql`, `lib/engineering-spatial-pinning.ts`

## 1. Mục tiêu & Bối cảnh

Mang bản vẽ CAD (2D Vector) và mô hình không gian 3D trực quan lên trình duyệt web (desktop & mobile công trường), cho phép Kỹ sư / Chỉ huy trưởng tương tác Pan/Zoom, Bật/Tắt Layer và Chấm mốc hiện trường (Spatial Pinning) trực tiếp lên toạ độ bản vẽ.

## 2. Các Năng Lực Cốt Lõi

1. **Interactive Vector Canvas:**
   - Render vector 2D HTML5 Canvas với hệ toạ độ thực tế $(X, Y)$ tính bằng milimet.
   - Hỗ trợ chuột kéo Pan, cuộn chuột Zoom (0.3x – 5x) và hiển thị toạ độ con trỏ thời gian thực.
   - Bật/Tắt các lớp Layer độc lập: `HVAC`, `PLUMBING`, `ELECTRICAL`, `FIREFIGHTING`, `GRID`, `ANNOTATIONS`.
2. **Spatial Pinning & Annotation Engine:**
   - Chấm mốc toạ độ $(X, Y, Z)$ trên bản vẽ với 5 loại:
     - `progress_pin`: Ghim % tiến độ thi công WBS.
     - `ncr_issue`: Đánh dấu lỗi kỹ thuật / phiếu NCR không phù hợp.
     - `bbnt_request`: Gom cụm yêu cầu nghiệm thu bàn giao.
     - `rfi_markup`: Đánh dấu ghi chú phát hành RFI.
     - `general_note`: Ghi chú kỹ thuật chung.
3. **Toán học Không gian (Computational Spatial Geometry):**
   - Thuật toán Ray-Casting đa giác Polyline (`isPointInPolygon`).
   - Thuật toán hộp bao AABB Bounding Box (`computeBoundingBoxFromPoints`).
   - Thuật toán tính chiều dài tuyến ống/cáp 3D (`calculatePolylineLength`).

## 3. Schema & DDL

- Migration `0108_spatial_annotations_pinning.sql`: Bảng `engineering_spatial_annotations` có RLS đa dự án nghiêm ngặt.

## 4. API Endpoints

- `GET /api/engineering/spatial/annotations`: Lấy danh sách điểm ghim theo bản vẽ/tầng.
- `POST /api/engineering/spatial/annotations`: Tạo điểm ghim mới.
- `PATCH /api/engineering/spatial/annotations/[id]`: Cập nhật trạng thái / liên kết WBS/NCR.
- `DELETE /api/engineering/spatial/annotations/[id]`: Xoá điểm ghim.

## 5. UI/UX

- Giao diện `/engineering/spatial-viewer` (Canvas tương tác, Drawer danh sách điểm ghim, KPI card, Chế độ 2D CAD & 3D Spatial Mesh).
