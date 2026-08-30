# Engineering OS Release Manifest v1.0.0 (Draft - Chưa đạt gate)

> **Mốc chuẩn hóa:** Engineering OS Vision Complete (OS-1 → OS-5).
> **Ngày phê duyệt & Chốt sổ:** 2026-08-19.
> **Trạng thái:** Draft/Dự thảo chưa đạt gate.

---

## 1. Tổng quan các phân hệ Engineering OS

| Phân hệ  | Cột mốc             | Khả năng cốt lõi                                                                                                     | Bảng dữ liệu chính                                                                                                                           | Cấp độ / Phạm vi                                   |
| :------- | :------------------ | :------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------- |
| **OS-1** | Knowledge Graph     | Traversal BFS đa tầng, Lineage truy vết nguồn CAD/BIM, Quét & xử lý chất lượng dữ liệu                               | `engineering_object_types`, `engineering_relation_types`, `engineering_data_quality_issues`                                                  | Toàn dự án (RLS strict)                            |
| **OS-2** | Digital Twin        | Liên kết không gian/mặt bằng/BIM (L1), Snapshot trạng thái hiện trường thực tế & Freshness (L3), Twin Impact         | `engineering_twin_bindings`, `engineering_twin_states`                                                                                       | L0–L3 (No fake realtime)                           |
| **OS-3** | Predictive OS       | Dự báo rủi ro tiến độ thi công WBS, bất thường chi phí, xếp hạng xung đột MEP kèm Explainability & Suggestion        | `engineering_prediction_models`, `engineering_prediction_runs`, `engineering_prediction_outputs`                                             | Uncertainty-First (ENG-2 suggestion gate)          |
| **OS-4** | Controlled Autonomy | Ranh giới tự động hóa an toàn A0–A2, Deny-by-default, Bắt buộc Dry-run diff, Single-use approval tokens, Kill Switch | `engineering_autonomy_capabilities`, `engineering_autonomy_policies`, `engineering_execution_requests`, `engineering_autonomy_kill_switches` | A0 (Quan sát) → A1 (Đề xuất) → A2 (Draft workflow) |
| **OS-5** | Program Closeout    | Tổng kết kiến trúc, bàn giao ma trận vận hành RACI, Sổ tay Runbooks và hoàn tất Vision Complete                      | Toàn bộ 132 migrations (`0001`–`0132`)                                                                                                       | 100% bàn giao sản phẩm                             |

---

## 2. Điều kiện chưa đạt (Gate Conditions Not Met)

Mặc dù Engineering OS đã thiết kế đầy đủ 5 phân hệ (OS-1 đến OS-5) và hoàn thành frame code, nhưng chưa sẵn sàng sản xuất do:

- **Không có traffic thật từ MEPF-Agents**: API ingest đã khai báo trong OpenAPI nhưng chưa được thử nghiệm với luồng dữ liệu thực tế từ agent BIM/CAD/IoT.
- **Staging migration chưa hoàn tất**: không chạy smoke test trên staging.
- **C0→C6 chỉ mới code**: các tầng kiểm soát (C0 Đạt chuẩn → C6 Chứng minh) chưa thi hành quy trình thực tế.
- **UAT người thật chưa diễn ra**: chưa có kiểm chứng từ kỹ sư/agent thật trên dự án cụ thể.

**Khuyến cáo:** Deploy sang staging, chạy smoke test với fixture dữ liệu, kiểm tra hiệu năng, mới nâng production.

---

## 3. Danh mục API Endpoints

### 3.1 Knowledge Graph & Quality (OS-1)

- `GET /api/engineering/taxonomy` — Danh mục Taxonomy phân loại đối tượng và quan hệ MEP.
- `GET /api/engineering/graph` — Thuật toán Graph Traversal BFS đa tầng có giới hạn độ sâu.
- `GET /api/engineering/lineage/[id]` — Truy vết phả hệ toàn diện từ bản vẽ nguồn CAD/BIM.
- `GET /api/engineering/impact/[id]` — Phân tích tác động lan truyền của đối tượng.
- `GET /api/engineering/data-quality` — Rà quét và thống kê vi phạm chất lượng dữ liệu.
- `POST /api/engineering/data-quality/[id]/resolve` — Đóng và ghi nhận giải quyết vấn đề chất lượng.

### 3.2 Digital Twin L0–L3 (OS-2)

- `GET /api/engineering/twin/[id]` — Snapshot tổng hợp đối tượng L0, bindings L1 và trạng thái L3.
- `GET /api/engineering/twin/[id]/timeline` — Chuỗi biến thiên trạng thái theo thời gian.
- `GET /api/engineering/twin/[id]/impact` — Tác động vận hành kết hợp Knowledge Graph & Twin States.
- `POST /api/engineering/twin/[id]/bindings` — Gán liên kết tầng/khu vực/phần tử BIM (L1).
- `POST /api/engineering/twin/[id]/states` — Ghi nhận snapshot đo kiểm/vận hành hiện trường (L3).

### 3.3 Predictive OS (OS-3)

- `GET /api/engineering/predictions` — Danh sách dự báo rủi ro & danh mục mô hình.
- `POST /api/engineering/predictions/run` — Kích hoạt pipeline dự báo có kiểm soát.
- `POST /api/engineering/predictions/[id]/decide` — Phản hồi tiếp nhận hoặc bỏ qua dự báo.

### 3.4 Controlled Autonomy (OS-4)

- `GET /api/engineering/autonomy/policies` — Tra cứu danh mục capabilities & chính sách dự án.
- `GET /api/engineering/autonomy/requests` — Danh sách hàng đợi yêu cầu thực thi tự động.
- `POST /api/engineering/autonomy/requests` — Tạo yêu cầu thực thi kèm Dry-run simulation diff.
- `POST /api/engineering/autonomy/requests/[id]/authorize` — Phê duyệt và cấp Approval Token đơn kỳ.
- `POST /api/engineering/autonomy/requests/[id]/execute` — Thực thi an toàn theo Token và kiểm tra hậu điều kiện.
- `POST /api/engineering/autonomy/kill-switch` — Bật/tắt công tắc ngắt khẩn cấp toàn hệ thống / dự án.

---

## 4. Ma trận kiểm soát an toàn & Quy tắc bất biến

1. **Deny by Default & Ranh giới Autonomy A0–A2:**
   - Mọi hành động tự động hóa cấp A3+ (tự ý ghi đè dữ liệu kinh doanh / tài chính mà không qua phê duyệt) đều bị cấm tuyệt đối.
2. **PostgreSQL RLS Strict:**
   - Toàn bộ các bảng `engineering_*` và `twin_*` đều được kích hoạt `ENABLE & FORCE ROW LEVEL SECURITY` và cô lập hoàn toàn theo `app.project_id`.
3. **Audit Trail Bất biến:**
   - Mọi thay đổi trạng thái, phê duyệt token, kích hoạt Kill Switch đều được ghi vết minh bạch trong hệ thống.
