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

_Cách rà_: trước khi tạo worktree/nhánh mới cho việc song song, luôn `git fetch origin` và đảm bảo
base khớp `origin/main` mới nhất (quy tắc đã ghi trong `CLAUDE.md` mục "Vai trò & nguyên tắc").
_Chốt chặn_: `npm run check:migrations` (`scripts/check-migration-numbers.ts`) — CI đỏ nếu ≥2 file
migration cùng số thứ tự.

## 2. `--release-gate` bắt buộc khi chạy test cục bộ, thiếu thì SKIP giả trang thành xanh

Chạy `npm test` không có `TEST_DATABASE_URL` khiến toàn bộ test tích hợp (đụng DB) tự SKIP —
runner mặc định chỉ đếm **số file fail**, nên hàng trăm ca bị skip vẫn báo "0 file fail", trông y
hệt một lần chạy xanh thật dù phần lớn logic (đặc biệt `lib/tien-do/recompute.ts`) chưa được test.

_Cách rà_: nghi ngờ một lần chạy xanh bất thường (vd sau khi sửa `lib/tien-do/recompute.ts` mà
không có ca nào đỏ) → kiểm có set `TEST_DATABASE_URL` chưa, chạy lại với `-- --release-gate`.
_Chốt chặn_: `npm test -- --release-gate` (CI dùng cờ này) coi ca SKIP = LỖI trừ file có lý do khai
trong `scripts/test-skip-allowlist.json`.

## 3. Route ghi (POST/PATCH/PUT/DELETE) quên kiểm quyền/phạm vi dự án

Lớp lỗi lặp lại ≥3 đợt audit: route handler mới thiếu `CAN.*`/`canTouchTask`, hoặc nhận thẳng
`projectId` từ client (body/query) mà không chốt qua `chotProjectIdChoGhi` — dẫn tới user dự án A
sửa/xoá được dữ liệu dự án B, hoặc vai trò chỉ-xem (`bch`/`viewer`/`cdt`) ghi được qua endpoint lẽ
ra chỉ nên xem (vd `CAN.viewEngineeringGraph` từng bị dùng làm cổng ghi cho ~20 handler).

_Cách rà_: thêm route API mới — tự hỏi "route này kiểm `getCurrentUser()` + 401 chưa? có
`CAN.*`/`canTouchTask` đúng nghiệp vụ chưa? `projectId` có tin thẳng từ client không?" trước khi
coi là xong.
_Chốt chặn_: `npm run check:route-perms` + `npm run check:project-scope` (static, không cần DB).

## 4. Truyền mảng cho helper `lib/db` thay vì placeholder `?` từng chết 43 file

`query`/`queryOne`/`run`/`insertId` nhận placeholder `?` rồi tự chuyển `$1..$n` — nhầm lẫn phổ
biến là truyền cả mảng tham số vào một placeholder duy nhất (`query(sql, [a, b])` khi SQL chỉ có
1 `?`) khiến câu SQL đầu tiên chết ngay khi chạy thật, dù build/lint không bắt được.

_Cách rà_: viết SQL mới — đếm số `?` trong chuỗi phải khớp đúng số phần tử mảng tham số.
_Chốt chặn_: `npm run check:db-params` (static, không cần DB).

## 5. Bất biến `nghiem_thu ⇒ progress = 1` vỡ qua đường "không phải route tiến độ"

Đã vá ở các route tiến độ/tick ô (L1/L2, audit 2026-09-22) nhưng tái phát 2026-10-01 qua đường
đổi CẤU TRÚC và nạp dữ liệu: thêm/copy cột lưới (ô mới chưa tick làm % tụt), import Excel đè %
thấp hơn — `deriveStatus` cố ý giữ `nghiem_thu`, nên mọi đường làm GIẢM % mà không tự chặn đều
để lại task "đã nghiệm thu" với % < 100%. Cùng đợt: duyệt tầng ghi đè `approval_source` của
task đã duyệt riêng, làm huỷ tầng hạ nhầm task đó.

_Cách rà_: thêm bất kỳ đường nào đổi mẫu số/tử số lưới hoặc ghi `progress_percent`/`status`
hàng loạt → hỏi "task đang `nghiem_thu` thì sao?". Rà dữ liệu:
`SELECT id FROM tasks WHERE status = 'nghiem_thu' AND progress_percent < 1` phải rỗng.
_Chốt chặn_: `tests/route-nghiem-thu-bat-bien.test.ts` (AC1–AC14),
`tests/import-nghiem-thu.test.ts`.

## 6. Test qua lib/UPDATE tay thay vì đi đúng đường người dùng → "có test" mà vẫn lọt lỗi

Engine phê duyệt M46 có test, nhưng test gọi lib với HAI user khác nhau (kỹ sư mở, PM duyệt),
trong khi route thật cho CÙNG một người vừa mở vừa duyệt → luật SoD trả 403 mọi lượt, flow
nghiệm thu không dùng được mà bộ test vẫn xanh. Tương tự, test huỷ nghiệm thu tầng đặt
`approval_source` bằng `UPDATE` tay nên không thấy route duyệt tầng ghi đè nó (audit 2026-10-01).

_Cách rà_: test cho luồng nhiều bước (duyệt, thanh toán theo đợt, nhập kho) phải gọi route
handler thật theo đúng trình tự người dùng bấm (`tests/helpers/phien.ts` ký cookie phiên thật),
không dựng trạng thái giữa chừng bằng SQL tay trừ khi đó chính là dữ liệu đầu vào.
_Chốt chặn_: chưa có cổng tự động — rà khi review test.

## 7. `coordinator` chạy như subagent không giao được việc cho worker

`.claude/agents/coordinator.md` khai `tools: ... Agent ...`, nhưng khi phiên chính gọi nó bằng
tool `Agent`, phiên coordinator **không có** tool Agent/Task (subagent không lồng subagent được) —
nó chỉ đọc PLAN.md rồi trả về "không có công cụ để giao việc", repo không đổi gì (2026-10-01,
đợt tích hợp OCR — PR #554). Tầng 2 của quy trình 3 tầng trong `CLAUDE.md` vì vậy không tự chạy.

_Cách rà_: giao PLAN.md cho coordinator mà báo cáo về chỉ có "không giao được"/0 commit → đúng
bẫy này. Cách đã dùng: phiên chính tự giao từng việc theo nhãn `route:` (mỗi việc
`isolation: worktree`), tự gộp theo thứ tự trong PLAN.md và gọi `reviewer`.
_Chốt chặn_: chưa có — việc đổi quy trình 3 tầng là quyết định của người dùng.
