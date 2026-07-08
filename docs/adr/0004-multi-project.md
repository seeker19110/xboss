# ADR-0004: Đa dự án — scoping theo `project_id` ở tầng API, chọn dự án qua cookie

- **Trạng thái:** Đã chấp nhận (M22 PR1 đã triển khai theo quyết định này — xem PROGRESS.md)
- **Ngày:** 2026-07-08
- **Liên quan:** nền cho M22 (`docs/nang-cap/M22-da-du-an.md`); mở khoá tầng 0–1 của IA (`docs/ke-hoach-appshell-full-ia-2026-07.md` §5).

## Bối cảnh

Schema XBoss đã có bảng `projects` và mô hình `Project → Tower → SheetType → WorkPackage → Task`, nhưng **UI và phần lớn query ngầm giả định 1 dự án**: `/api/project` trả tên 1 dự án (fallback khi DB trống), không có project switcher, nhiều bảng nghiệp vụ mới (M16–M20) còn **chưa có cột `project_id`** (ghi trong từng đặc tả "1 dự án hiện tại → chưa có project_id"). Mockup `xBossmockup.xlsx` lặp nguyên cây 24 dashboard cho `Dự án 2`, `Dự án 3` — XBoss phải quản lý **đa dự án thật**.

Cần chốt **cách cô lập dữ liệu giữa các dự án** trước khi code M22, vì đây là thay đổi nền tảng chạm hầu hết route.

## Quyết định

1. **Mỗi bảng nghiệp vụ gốc mang `project_id`** (FK `projects(id)`), backfill về dự án mặc định hiện tại. Bảng con (task, dimension, addenda…) **không** lặp `project_id` — suy qua khoá ngoại tới bảng cha đã có (tránh phình + lệch dữ liệu). Danh sách bảng cần cột: các bảng "gốc cụm" (`sheet_types` đã có qua tower; `contracts`, `purchase_orders`, `materials`, `boq_items`, `variations`, `payment_certs`, `meetings`, `risks`, `proposals`, `correspondences`, `drawings`, `qc_*`, `ncrs`, `hse_records`, `site_diaries`, `equipment`, `vehicle_logs`, `work_fronts`, `tender_packages`, `project_documents`, …). Rà từng bảng khi triển khai — không cột nào đã suy được `project_id` qua cha thì bỏ qua.
2. **Dự án đang chọn = cookie `xboss_project`** (id), đặt bởi project switcher (client cũng lưu `localStorage` để render nhanh trước khi cookie tới server). API đọc cookie → `getCurrentProjectId(req)`; thiếu → dự án mặc định (dự án đầu user được thấy). **Ranh giới thật ở API**: mọi query lọc `WHERE project_id = $current` — không tin `project_id` client gửi qua body.
3. **Quyền theo dự án qua `user_projects`** (song song `user_disciplines` hiện có): `admin` thấy mọi dự án; vai trò khác chỉ thấy dự án có bản ghi `user_projects` (hoặc mọi dự án nếu bảng rỗng — tương thích ngược 1 dự án). Kiểm ở API cùng chỗ với `getCurrentUser()`.
4. **Portfolio = endpoint gộp cross-project riêng** (`/api/projects` + `/api/portfolio/kpi`), không phá cache/logic 1 dự án — trang Portfolio đọc endpoint này, mọi trang khác vẫn scoped 1 dự án.

## Lý do

- **Cookie thay vì path prefix** (`/p/:id/...`): giữ nguyên **toàn bộ URL hiện có** (30 trang, không đổi route, không sửa mọi link/`href` trong `dashboardTree`) — đúng nguyên tắc "nâng cấp tiến hoá, giữ phần đang tốt". Đổi dự án = đổi cookie + refetch, ở nguyên trang.
- **`project_id` ở bảng gốc, suy ở bảng con**: raw SQL sẵn có, thêm cột + index là append-only migration đúng ADR-0003; không cần ORM. Suy qua JOIN tránh double-source-of-truth.
- **`user_projects` tách khỏi `user_disciplines`**: 2 trục quyền độc lập (dự án nào × hệ nào), không nhồi vào 1 bảng; bảng rỗng = tương thích ngược (không khoá ai khỏi dự án khi chưa cấu hình).
- **Không tin client**: `project_id` luôn suy từ cookie phiên đã xác thực, đối chiếu `user_projects` — client gửi id lạ bị bỏ (giống nguyên tắc "API là ranh giới bảo mật duy nhất").

## Các phương án đã cân nhắc

- **Path prefix `/p/:projectId/...`**: rõ ràng, share link kèm dự án, nhưng phải đổi mọi route + link + middleware, phá URL đang chạy — chi phí refactor lớn, trái nguyên tắc giữ nguyên. Không chọn.
- **Subdomain/DB riêng mỗi dự án**: cô lập mạnh nhất nhưng vận hành nặng (nhiều DB, migrate ×N), thừa cho quy mô 1 công ty vài dự án. Không chọn.
- **Không cột, lọc bằng tower**: một số bảng không nối tới tower (contracts/proposals/documents cấp dự án) → không suy được. Không đủ.

## Hệ quả

- **Tích cực**: mở khoá đa dự án mà giữ nguyên URL + luồng hiện tại; Portfolio + switcher thành lớp mỏng phía trên; nền cho `nav_settings.project_id` (M21) override hiển thị theo dự án.
- **Đánh đổi / rủi ro**: phải rà **mọi query đang ngầm giả định 1 dự án** và thêm `WHERE project_id` — sót chỗ nào = rò dữ liệu chéo dự án (mức nghiêm trọng). Giảm rủi ro bằng: (a) helper `scopedProject(req)` bắt buộc ở mọi route list; (b) test tích hợp tạo 2 dự án, xác nhận không lẫn; (c) triển khai theo cụm, không big-bang.
- **Việc cần làm tiếp**: M22 PR 1 = migration `user_projects` + cột `project_id` + backfill + `getCurrentProjectId`/`user_projects` gate; PR 2 = switcher + Portfolio; PR 3+ = rà scoping từng cụm. Cập nhật `docs/ERD.md`. Trước khi M22 chạy, mọi module mới (M23+) **thêm `project_id` ngay từ migration đầu** để không phải backfill lần 2.
