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

## Review và bằng chứng hiện có

Reviewer độc lập Astra đã đọc hai file fixture/spec và đối chiếu route/UI/export ngày 22/10/2026, không thấy P1/P2. Đã kiểm oracle hai chiều, foreign target tách positive controls, reload tài liệu mới/cookie/menu, workbook thật và cleanup context/pool. Review chỉ đọc; runtime/CI phải xác nhận riêng.

T-001 typecheck PASS; T-002 gồm bảy suite P/H: 48/48 pass, 0 fail, 0 skip, gồm S16 qua app role NOBYPASSRLS thật; T-003 build PASS. T-004 sau D-004 và sửa locator đạt 9/9 pass (43.5 giây), 0 skip/retry. Lớp B chạy server bằng owner của DB disposable; bằng chứng phòng tuyến RLS đến từ P/H S16 chạy app role, không suy từ lượt browser owner.

## Probe observer đọc response

Lượt T-004 đầu trên source 477944f7: 5 pass, 4 fail (select/export ở cả desktop/mobile); cả bốn stack dừng tại response.json sau reload. Đã giữ log, error-context và evidence dưới runtime/a1-browser-red-post-reload*. Đây chưa phải bằng chứng lỗi app. D-003 chuyển body read vào response promise để kiểm giả thuyết timing; probe focused bật trace cho thấy đọc sớm vẫn kẹt CDP body, cần đổi phương pháp thay vì tăng timeout/bỏ assertion.

Probe early-read kết thúc: 1 setup pass, 4 focused select/export fail, cùng body hang; trace/log riêng a1-early-body-focused giữ nguyên. D-004 đổi phương pháp: observer browser gọi fetch thật và đọc clone response, binding chỉ chuyển snapshot/lỗi, Node assert. Trả nguyên Response cho app, cleanup wrapper/binding. Instrumentation trì hoãn app nhận response; chỉ chứng minh chức năng, không chứng minh timing reload nguyên trạng. Reviewer Astra xác nhận phạm vi và yêu cầu giữ toàn oracle.

D-004 focused runtime: 4 pass, 1 fail (42.9 giây). Select cả desktop/mobile đã pass, mobile download/workbook đã pass; desktop chỉ lỗi tên locator. UI hiện hành tại app/components/home/HomeDieuHanh.tsx: desktop link “Excel” (285), mobile aria-label “Xuất Excel” (233). Sửa selector theo viewport và kiểm exact href /api/export/excel, giữ actual download và workbook oracle. Thêm Gate lặp ba lần select/export hai viewport để kiểm observer trên nhiều context/fixture: 12 ca + setup = 13 lượt dự kiến; T-005 đã đạt 13/13 pass (12 ca + setup), 0 skip/retry, 1.8 phút.

T-006: 18/18 cổng tĩnh pass. Review cuối source đóng băng bởi Astra không có P1/P2; nhãn Excel desktop/mobile và exact href đã được đối chiếu. Mọi verdict ở trên là local trước final verify/CI, trạng thái cuối theo HEAD được ghi ở PR.
