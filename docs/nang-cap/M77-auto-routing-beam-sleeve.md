# M77 — AI Automated CAD/BIM Multi-Trade Auto-Routing & Beam Sleeve Clash Solver

> **Trạng thái:** Đã hoàn thành (2026-08-19)  
> **Phụ thuộc:** `migrations/0111_auto_routing_sleeve_matrix.sql`, `lib/engineering-auto-routing.ts`
>
> **⚠️ Đính chính 2026-08-29 (đọc lại code thật, xem `RESEARCH-AUTO-ROUTING-MEPF.md` §1):** mục §2.1
> dưới đây **mô tả sai code**. `findOptimalRoute3D` **không phải A\*** — không có open set, heuristic
> hay lưới tìm kiếm; thân hàm là một cây quyết định cố định: thử tuyến trực giao 3 đoạn, nếu vướng
> thì nâng **toàn bộ** tuyến lên `max(maxZ của mọi vật cản) + 150`. `doesSegmentIntersectBox` so
> **hộp bao của đoạn thẳng** với hộp vật cản (báo thừa, không báo sót) nên tuyến chéo dài gần như
> luôn bị coi là vướng. `solve3DGenerativeRoute` trong `engineering-generative-routing.ts` cũng là
> cây quyết định, không phải A\* như tiêu đề khối ghi.
>
> **Phạm vi dùng đúng của M77:** ước lượng phía web (chiều dài/số co/sụt áp sơ bộ) + `validateBeamSleeve`
> (phần này là logic kiểm chuẩn thật, dùng được). **Không** dùng làm nền cho auto-routing trong plugin
> AutoCAD — hướng đó đi theo `M114-auto-routing-hanh-lang.md` (đồ thị hành lang), và lệnh plugin
> không gọi vào các hàm ở đây.

## 1. Mục tiêu & Bối cảnh

Tự động hóa tìm hướng tuyến 3D tối ưu cho các hệ thống cơ điện (Ống gió HVAC, Ống PCCC, Cấp thoát nước, Khay máng cáp) tránh va chạm chướng ngại vật (Dầm, Cột, Tuyến ống khác) và tự động kiểm chuẩn kết cấu lỗ khoét dầm (Beam Sleeve Penetration Schedule) theo TCVN / BS EN.

## 2. Năng Lực Cốt Lõi

1. _*3D A* Pathfinding & Elbow Optimization (`findOptimalRoute3D`):_\*
   - Thuật toán tránh va chạm đa giác hộp không gian AABB 3D (`doesSegmentIntersectBox`).
   - Tối ưu hóa hàm chi phí $Cost = L + 3.0 \cdot N_{\text{elbow}}$, ưu tiên giảm số lượng Co lơ để giảm thiểu sụt áp thủy lực ($Pa$).
2. **Beam Sleeve Structural Validation (`validateBeamSleeve`):**
   - Kiểm tra đường kính lỗ khoét dầm: $D \le 0.33 \times H_{\text{beam}}$.
   - Kiểm tra vị trí khoét lỗ dọc nhịp dầm: Nằm trong vùng an toàn $0.2L \le x \le 0.4L$ (tránh vùng cắt cao cạnh gối và vùng uốn cao giữa nhịp).
   - Kiểm tra chiều dày lớp bảo vệ trên/dưới: $\ge 50$ mm hoặc $0.15 \times H_{\text{beam}}$.
3. **Multi-Trade Clash Hierarchy (`recommendClashResolution`):**
   - Phân cấp ưu tiên nhượng bộ: Thoát nước trọng lực (Độ dốc 1-2%) $>$ Ống gió lớn HVAC $>$ PCCC Sprinkler $>$ Ống Chiller $>$ Cấp nước sinh hoạt $>$ Khay máng cáp điện.

## 3. Schema & DDL

- Migration `0111_auto_routing_sleeve_matrix.sql`: Tạo 2 bảng `engineering_sleeve_schedules` và `engineering_auto_routes` có RLS đa dự án nghiêm ngặt.

## 4. API Endpoints

- `POST /api/engineering/routing/compute`: Tính toán tuyến 3D tối ưu và đề xuất nhường đường va chạm.
- `GET/POST /api/engineering/routing/sleeves`: Quản lý và kiểm tra tính hợp chuẩn của lỗ khoét dầm.

## 5. UI/UX

- Giao diện `/engineering/auto-routing` (Bàn điều khiển 3D Auto-Routing, Biểu đồ tuyến Waypoints, Bảng kiểm chuẩn và thống kê Sleeve dầm).
