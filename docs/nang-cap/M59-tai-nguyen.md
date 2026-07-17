# M59 — Quản lý tài nguyên: histogram nhân lực/thiết bị + cảnh báo gán chồng (P3)

> **Mục tiêu**: lớp tổng hợp tài nguyên mà ERP xây dựng chuyên nghiệp (Primavera-tier) có còn XBoss chưa: nhìn TẢI nhân lực/thiết bị theo thời gian và bắt xung đột phân bổ. KHÔNG nhập liệu mới — chỉ tổng hợp dữ liệu đã có: `tasks.assigned_to` + ngày BĐ/KT (nhớ kế thừa `COALESCE(t.end_date, wp.end_date)` — bài học fix 2026-07-16), `attendance` (chấm công ngày theo tổ/người, cột `headcount/hours`), `crews`/`crew_members`, `equipment_logs`.
>
> **Điều kiện tiên quyết người dùng đã xác nhận** (2026-07-17): phân công + chấm công đang được nhập đều — nếu thực tế nhập thưa, histogram sẽ rỗng, module thành trang chết. PR1 phải kèm empty-state hướng dẫn rõ "cần nhập gì để có số".
>
> **Không làm**: resource leveling tự động (dời lịch tối ưu — bài toán lớn, Primavera làm nửa đời người), định mức nhân công theo BOQ (đã có `boq_norms` cho vật tư — mở rộng sang nhân công là đợt khác), lương/chi phí nhân công (dính kế toán — người dùng đã loại).

## PR1 — API tổng hợp + trang `/resources` (`route: complex` — quyết định cách quy đổi tải trong ranh giới: quy tắc bên dưới là đặc tả, chỗ tự quyết là xử lý dữ liệu bẩn/thiếu)

### Không migration — chỉ đọc. `lib/resources.ts` (mới)

- `workloadByWeek({ projectId, from, to })`: mỗi tuần × mỗi user được gán — số task đang chạy giao nhau với tuần đó (dải ngày hiệu lực `COALESCE` kế thừa nhóm; task `hoan_thanh`/`nghiem_thu` loại). Trả kèm tổng theo hệ. Đây là tải KẾ HOẠCH (từ phân công).
- `manpowerByWeek({ projectId, from, to })`: tổng `headcount`/`hours` từ `attendance` theo tuần × tổ — tải THỰC TẾ. 2 đường đặt cạnh nhau trên chart (kế hoạch vs thực tế — cùng triết lý S-curve).
- `equipmentUsageByWeek(...)`: từ `equipment_logs` (đọc schema thật trước khi viết — cột giờ hoạt động/ngày).
- `assignmentConflicts({ projectId })`: user có ≥ N task (mặc định 5, query param) giao nhau cùng khoảng ngày → danh sách xung đột xếp theo mức chồng; thiết bị: cùng thiết bị 2 log giao nhau (nếu schema log có dải ngày) hoặc bỏ nếu dữ liệu không cho phép — quyết định trong ranh giới worker, ghi rõ lý do trong code.
- Toàn bộ tính trên SQL (GROUP BY tuần qua `date_trunc`), không kéo bảng về JS; project scope + quyền: mọi vai trò xem được trừ nhóm chỉ-xem thương mại hẹp? — KHÔNG: dùng quyền xem chung (không dữ liệu tiền), `subcon` chỉ thấy tải của chính mình (lọc `assigned_to = user.id` — nhất quán `canTouchTask`).

### API + UI

- `GET /api/resources?from=&to=&view=manpower|equipment|conflicts` — auth chuẩn, `force-dynamic`.
- Trang `/resources` (sidebar nhóm Hiện trường, `dashboardTree.ts`): chart cột chồng theo tuần (recharts, token màu hệ như mọi chart), bảng xung đột bấm nhảy tới task (khuôn panel Pareto trễ), toggle kế hoạch/thực tế, empty-state hướng dẫn. Mobile: chart cuộn ngang, bảng sticky.

### Test + tiêu chí

- `tests/resources.test.ts` (integration): dựng 2 user × 6 task chồng lịch → workload đúng từng tuần (đối chiếu số tay), task kế thừa ngày nhóm tính đúng, conflict bắt đúng ngưỡng, subcon chỉ thấy mình, 2 dự án không lẫn; attendance headcount gộp tổ đúng tuần.
- Verify UI thật với dữ liệu seed: chart 2 đường kế hoạch/thực tế render, bấm xung đột nhảy đúng task.

## PR2 — Cảnh báo + tích hợp lookahead (`route: standard`, sau PR1 dùng thật ≥1 tuần)

- Notification loại mới `resource_conflict` (khuôn dedup on-fetch của `/api/notifications`, tự dọn khi hết xung đột) — CHỈ gửi Admin/PM, ngưỡng đọc từ `alert_rules` (M47 PR4 — nếu đợt "đóng dở dang" đã xong thì dùng thật, chưa thì hard-code kèm ghi chú trỏ nợ).
- `/lookahead` thêm cột "người phụ trách đang quá tải" (icon cảnh báo cạnh tên khi tuần đó vượt ngưỡng) — dữ liệu từ cùng `workloadByWeek`, không query mới.
