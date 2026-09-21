# TRAPS.md — bẫy đã mắc thật trong dự án XBoss

> Sổ bẫy **đã mắc thật**, không phải danh sách "nên tránh" chung chung. Mỗi mục có ngày + PR/commit
> (khi biết) + cách rà + cổng chặn (nếu có). Khác `docs/adr/` (ghi **quyết định kiến trúc**) và
> `docs/audit.md` (checklist rủi ro đúc kết) — file này ghi **lỗi cụ thể đã xảy ra**, để tra trước
> khi đọc code từ đầu lúc gặp lỗi lạ.
>
> Cách dùng: gặp lỗi/hành vi lạ → tìm khuôn khớp ở đây trước. Sửa xong bẫy mới → thêm mục mới; gặp
> lại bẫy cũ (tái phát) → thêm ngày/PR vào mục cũ thay vì tạo mục trùng.

## 1. Nhánh cục bộ lỗi thời khi dispatch song song → trùng số migration

Khi nhiều agent/nhánh code song song mà không `git fetch origin` + đồng bộ base trước, mỗi nhánh
tự chọn số migration kế tiếp theo file lớn nhất **lúc phân nhánh** — merge xong dễ trùng số (đã
xảy ra thật ở đợt M32/M33/M34, xem `PROGRESS.md`). Runner (`lib/db/migrate.ts`) sort theo tên file
nên vẫn chạy được, nhưng thứ tự giữa 2 file trùng số chỉ dựa chữ cái — mập mờ, phải dọn tay lúc
tích hợp.

*Cách rà*: trước khi tạo worktree/nhánh mới cho việc song song, luôn `git fetch origin` và đảm bảo
base khớp `origin/main` mới nhất (quy tắc đã ghi trong `CLAUDE.md` mục "Vai trò & nguyên tắc").
*Chốt chặn*: `npm run check:migrations` (`scripts/check-migration-numbers.ts`) — CI đỏ nếu ≥2 file
migration cùng số thứ tự.

## 2. `--release-gate` bắt buộc khi chạy test cục bộ, thiếu thì SKIP giả trang thành xanh

Chạy `npm test` không có `TEST_DATABASE_URL` khiến toàn bộ test tích hợp (đụng DB) tự SKIP —
runner mặc định chỉ đếm **số file fail**, nên hàng trăm ca bị skip vẫn báo "0 file fail", trông y
hệt một lần chạy xanh thật dù phần lớn logic (đặc biệt `lib/tien-do/recompute.ts`) chưa được test.

*Cách rà*: nghi ngờ một lần chạy xanh bất thường (vd sau khi sửa `lib/tien-do/recompute.ts` mà
không có ca nào đỏ) → kiểm có set `TEST_DATABASE_URL` chưa, chạy lại với `-- --release-gate`.
*Chốt chặn*: `npm test -- --release-gate` (CI dùng cờ này) coi ca SKIP = LỖI trừ file có lý do khai
trong `scripts/test-skip-allowlist.json`.

## 3. Route ghi (POST/PATCH/PUT/DELETE) quên kiểm quyền/phạm vi dự án

Lớp lỗi lặp lại ≥3 đợt audit: route handler mới thiếu `CAN.*`/`canTouchTask`, hoặc nhận thẳng
`projectId` từ client (body/query) mà không chốt qua `chotProjectIdChoGhi` — dẫn tới user dự án A
sửa/xoá được dữ liệu dự án B, hoặc vai trò chỉ-xem (`bch`/`viewer`/`cdt`) ghi được qua endpoint lẽ
ra chỉ nên xem (vd `CAN.viewEngineeringGraph` từng bị dùng làm cổng ghi cho ~20 handler).

*Cách rà*: thêm route API mới — tự hỏi "route này kiểm `getCurrentUser()` + 401 chưa? có
`CAN.*`/`canTouchTask` đúng nghiệp vụ chưa? `projectId` có tin thẳng từ client không?" trước khi
coi là xong.
*Chốt chặn*: `npm run check:route-perms` + `npm run check:project-scope` (static, không cần DB).

## 4. Truyền mảng cho helper `lib/db` thay vì placeholder `?` từng chết 43 file

`query`/`queryOne`/`run`/`insertId` nhận placeholder `?` rồi tự chuyển `$1..$n` — nhầm lẫn phổ
biến là truyền cả mảng tham số vào một placeholder duy nhất (`query(sql, [a, b])` khi SQL chỉ có
1 `?`) khiến câu SQL đầu tiên chết ngay khi chạy thật, dù build/lint không bắt được.

*Cách rà*: viết SQL mới — đếm số `?` trong chuỗi phải khớp đúng số phần tử mảng tham số.
*Chốt chặn*: `npm run check:db-params` (static, không cần DB).
