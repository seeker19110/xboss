# Research — A1-AC01

Spec gốc: `docs/nang-cap/AUDIT-2026-09-25/A1-SCOPE.md` §4 (dòng 75), Approved 25/09/2026; `TEST-MATRIX.md` dòng 57–58 yêu cầu read/write/select/export, bao phủ các auth method thực của inventory. S15 hiện PARTIAL, thiếu B hai org và M. Lát này bổ sung B cookie; giữ verdict tổng thể PARTIAL.

Các test users hiện có chỉ render/axe; org.spec là sơ đồ tổ chức; project-switcher.spec chỉ dùng một project seed. A4 PM/report và A5 concurrency không thay bằng chứng admin CRUD/export.

- Read: `app/portfolio/page.tsx`, `app/api/projects/route.ts`, `app/api/users/route.ts`. Kiểm tập ID/name chính xác, cùng org có dữ liệu trước khi kiểm loại foreign.
- Write: `app/users/page.tsx`, `app/api/users/[id]/route.ts`. Combobox “Vai trò của {name}”, role viewer hợp lệ; “Xoá người dùng” → dialog “Xoá”. Foreign PATCH/DELETE 404, own 200. Target foreign tách khỏi positive controls.
- Select: `ProjectSwitcher.tsx`, `app/lib/chuyenDuAn.ts`, route project/select. UI POST 200 rồi reload cùng URL; foreign 403 giữ cookie xboss_project. Mobile mở “Mở menu”, scope sidebar-mobile. Kiểm absence trong listbox đang mở và có own option.
- Export: `HomeDieuHanh.tsx` link “Xuất Excel” là anchor; route export/excel. KPI headers literal: Sheet / Tổng task / Tiến độ TB / Số trễ. Tracking có chín cột tại `lib/tien-do/excel-tracking.ts`. Đọc download bằng ExcelJS, kiểm selected task, loại foreign và own project chưa chọn.
- Fixture: gọi riêng `dungToChucCoLap(roles, 2)` cho hai org, mỗi org bảy role hợp lệ, ID/membership thật. Không role qs. SQL chỉ dựng input 0%; đóng context/pool, giữ audit đến global setup disposable.

## Auth inventory và bằng chứng P/H chạy lại

| Cơ chế               | Suite và phạm vi                                                                                                  | Giới hạn                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Session cookie       | route-users-cach-ly-org, project-select-org, s02c-dashboard-scope; B mới bốn luồng hai chiều                      | B không chứng minh mọi route                                |
| API-key Bearer       | api-key-tenant-security: cấp key/scoped key; s16-app-role-duong-phu: handler v1 tasks/materials thật, foreign 404 | Write bằng API-key hai org/hai chiều chưa nằm trong lát này |
| Cron secret          | s16-app-role-duong-phu: sync-sheets đúng project, foreign row bất biến                                            | Mock mạng Google; DB/auth thật                              |
| 2FA/OIDC             | S16: cấp phiên và upsert đúng org                                                                                 | Chưa có hành trình OIDC browser đầy đủ                      |
| Token traffic nội bộ | traffic-token: token hợp lệ/sai; s02e-org-config: traffic theo org và cookie ký                                   | Không phải quyền CRUD/export người dùng                     |
| AutoCAD device       | Dùng API-key hiện hữu, không thêm cơ chế login độc lập                                                            | Offline device proof không thay session                     |

P/H dùng mock next/headers làm transport, S16 mock mạng Google; không mock DB/withOrgScope/auth. Chỉ lớp B mới có cam kết browser/HTTP/download không mock. Gate yêu cầu 0 skip và ghi số ca thực tế, không suy coverage từ tên file.

S16 đọc TEST_DATABASE_URL, mở pool xboss_app với mật khẩu placeholder migration 0069 trên DB disposable. Role đã kiểm tại container local: LOGIN, NOSUPERUSER, NOBYPASSRLS. Migrations chạy bằng owner ci; không dùng DB hoặc mật khẩu production.

Stack giữ theo lock: Node 24.21.0, Next 16, PostgreSQL 16, Playwright 1.63, ExcelJS hiện có. Không thêm dependency/capability hoặc sửa auth. Review độc lập khác model xác nhận phạm vi và giới hạn trên ngày 22/10/2026.
