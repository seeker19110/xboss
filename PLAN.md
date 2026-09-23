# PLAN.md — Đợt 2: xử lý 5 route còn lại + DROP bảng scan-to-bim (2026-09-23)

**Cập nhật:** 2026-09-23 · **Nhánh làm việc:** `claude/amazing-dijkstra-la2kpd` (= `origin/main` `183ee430`, sau PR #526). **Trạng thái:** ĐÃ THI HÀNH 2026-09-23 (3 việc gộp vào nhánh làm việc).
**Bối cảnh (worker không thấy hội thoại):** PR #526 đã nối UI cho baseline/tổ đội/mặt trận/engineering. Quét lại còn 5 route không UI nào gọi. Truy lịch sử git cho kết luận:

| Route                                                                 | Kết luận                                       | Bằng chứng                                                                                                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /api/workpackages/:id/move` (đổi thứ tự nhóm)                  | **Hồi quy** → khôi phục UI                     | Refactor M52 PR5 `5e4db9cf` (#228) tách `page.tsx` giữ nút di chuyển task nhưng làm rơi nút di chuyển nhóm; `TrackingGrid` vẫn nhận prop `pkgIdx`/`pkgCount` không dùng tới. |
| `PATCH /api/workpackages/:id/dimensions/column/move` (đổi thứ tự cột) | **Hồi quy** → khôi phục UI                     | `40ff7d4d` (2026-06-12, "căn cột nhóm thẳng hàng…") xoá hàm `moveColumn` cùng ngày nó được thêm ở `ef699b47`.                                                                |
| `POST /api/workpackages/:id/tasks` (chèn task trống)                  | **Hồi quy** → khôi phục UI                     | Cùng `40ff7d4d`: `addTaskAfter` bị thay bằng `copyTask`; nay lưới chỉ thêm task được bằng cách sao chép.                                                                     |
| `PATCH /api/construction-stages/:id` (đổi tên/ẩn/số ngày công tác)    | Chưa từng có UI → **thêm UI** ở `/work-fronts` | `/work-fronts` có nút "+" thêm công tác nhưng không sửa được.                                                                                                                |
| `GET /api/dashboard/floors`                                           | **Đã bị thay thế** → xoá route                 | #61 (`9df21996`, 2026-07-03) chuyển `ProgressMap` sang `/api/timeline`.                                                                                                      |

Thêm: bảng `engineering_scan_to_bim_runs` (migration 0104) — rà `app/ lib/ scripts/ tests/`: 0 tham chiếu → DROP bằng migration `0157` theo tiền lệ `0156`.

## Ràng buộc CỨNG (mọi việc)

- Đọc `CLAUDE.md` (Auth, ADR-0007, "Thiết kế giao diện (UI/UX)", Quy ước) trước khi code. Không đọc/sửa file `.env*`.
- **Không đổi route/API/schema** (trừ Việc C xoá route và thêm migration). Không đổi `CAN`. Không chạm `lib/bao-mat/`, `lib/tien-do/recompute.ts`.
- UI: dark-first, không `dark:`/hex, `zinc` + nhấn `-300/-400`, `aria-label` + `title` tiếng Việt cho nút icon. **Trong lưới tracking giữ đúng cỡ/phong cách nút icon hiện có của lưới** (lưới dày, các nút Lên/Xuống/Sao chép/Xoá đang là icon `w-3 h-3`) — không tự phóng to lưới. Ngoài lưới: nút ≥40px, hover nền đậm dần. Dùng `appConfirm`/`appPrompt`/`appAlert` (`app/components/dialogs.tsx`), `showToast` (`app/components/Toast.tsx`) — không dùng `window.confirm/prompt/alert`.
- Fetch ghi phải bọc lỗi mạng (try/catch → `appAlert`/`showToast` lỗi) và hiện `error` server khi `!res.ok`.
- Worker làm trong worktree được giao, commit, **không push**, không sửa `PROGRESS.md`. Commit message conventional + tiếng Việt, ghi `(đợt 2 dọn route việc X)`, kết thúc bằng 2 dòng:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` và `Claude-Session: https://claude.ai/code/session_01XDnf2ZeuDMERGnK58GpSB9`.
- **Cổng bắt buộc trước khi báo xong:** `npm run format:check` (worktree không chạy lint-staged — chạy `npx prettier --write <file đổi>` trước), `npm run lint`, `npm run typecheck`, `npm run check:contrast`, `npm run check:mau-accent`, `npm run check:hex-hardcode`; việc xoá file thêm `check:dead-code`, `check:dead-routes`, `check:route-perms`, `check:project-scope`; việc migration thêm `check:migrations`.
- Test chạm DB: `TEST_DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/xboss_test node --experimental-test-module-mocks --import=./node_modules/tsx/dist/loader.mjs --test tests/<file>.test.ts` (cần cờ mock-module).

## Việc A — Khôi phục 3 thao tác cấu trúc trong lưới tracking — `route: standard`

File: `app/tracking/[sheet]/TrackingGrid.tsx` (và `app/tracking/[sheet]/page.tsx` nếu cần truyền callback). Chỉ hiện khi `ce` (= `canEdit && editMode`, Admin/PM ở chế độ sửa).

1. **Đổi thứ tự nhóm** — ở cụm nút tiêu đề nhóm (cạnh "Sao chép nhóm này"/"Xoá nhóm này", ~dòng 1240), thêm 2 nút `ChevronUp`/`ChevronDown` cùng cỡ (`w-[17px] h-[17px]`, `p-0.5 text-zinc-500 hover:text-zinc-200`), `title`/`aria-label` "Chuyển nhóm lên"/"Chuyển nhóm xuống"; disable khi `pkgIdx === 0` / `pkgIdx === pkgCount - 1` (dùng prop sẵn có). Gọi `PATCH /api/workpackages/${pkg.id}/move` body `{ direction: "up" | "down" }` rồi `onChanged()` (trang tải lại danh sách nhóm). Route hoán `sort_order` với nhóm liền kề **trong cùng sheet** (Admin/PM = `CAN.editStructure`).
2. **Đổi thứ tự cột dimension** — ở header mỗi cột (khối `visibleColumns.map`, ~dòng 1311, cạnh nút xoá cột), thêm 2 nút `ChevronLeft`/`ChevronRight` cùng kiểu nút xoá cột (`w-3 h-3`, hiện khi hover trên desktop như nút xoá, luôn hiện trên mobile), `title` "Chuyển cột sang trái/phải"; disable ở cột đầu/cuối của `grid.columns`. Gọi `PATCH /api/workpackages/${pkg.id}/dimensions/column/move` body `{ label: col, direction: "left" | "right" }` rồi `load()` và `onChanged()` (thứ tự cột dùng chung cho cả sheet qua `onColsLoaded`). Đọc route để xác nhận nó đổi cho mọi task của nhóm.
3. **Chèn task trống** — (a) ở menu dòng task (cạnh Lên/Xuống/Sao chép/Xoá, ~dòng 1705) thêm nút `Plus` "Chèn task trống bên dưới"; (b) ở hàng tiêu đề nhóm hoặc cuối bảng nhóm thêm nút "Thêm task vào cuối nhóm" (icon `ListPlus` hoặc `Plus`, cùng cỡ nút nhóm). Cả hai: `appPrompt("Mã task mới (vd A1,10):")` → `appPrompt("Tên task:")` → (tuỳ chọn) `appPrompt("Mã BOQ (bỏ trống nếu không có):")` → `POST /api/workpackages/${pkg.id}/tasks` body `{ code, name, boqCode?, afterId? }` (`afterId` = id task hiện tại cho (a), bỏ trống cho (b)). Đọc route để biết mã lỗi (409 trùng mã/BOQ, 422) và hiện `error` server bằng `appAlert`. Thành công → `load()` + `onChanged()`. Nếu nhóm đang thu gọn thì mở nhóm (`onToggle`) sau khi thêm vào cuối — chỉ khi làm được mà không đổi props; không thì bỏ qua.

Tiêu chí: 3 nhóm nút hiện đúng quyền/chế độ; typecheck/lint/format xanh; test route sẵn có xanh: `tests/route-workpackages-cach-ly.test.ts`, `tests/route-wbs-con-lai.test.ts`, `tests/route-tien-do-3.test.ts`. e2e `e2e/authed/tracking*.spec.ts` không được đổi — đọc để chắc không va selector (vd không thêm nút trùng `title` "Lên"/"Xuống" của task).
Commit: `fix(tracking): khôi phục đổi thứ tự nhóm/cột và chèn task trống trong lưới (đợt 2 dọn route việc A)`.

## Việc B — Sửa/ẩn công tác thi công ở `/work-fronts` — `route: standard`

File: `app/work-fronts/page.tsx`. Route có sẵn `PATCH /api/construction-stages/:id` body `{ name?, active?, durationDays? }` (Admin/PM = `CAN.editStructure`; công tác dùng chung `project_id NULL` chỉ Admin sửa được — route trả lỗi, hiện đúng `error`). Danh sách lấy từ `/api/floor-stage-fronts` chỉ gồm công tác `active = TRUE`.

- Header mỗi cột công tác (`stages.map`, `<th>`): khi `canManage`, bấm tên cột mở menu nhỏ hoặc hiện nút `Pencil` cạnh tên (`aria-label` "Sửa công tác <tên>") → `Modal` (dialogs.tsx) với: tên (bắt buộc), số ngày thi công (số nguyên dương), nút "Lưu" (PATCH `{ name, durationDays }`), nút "Ẩn công tác" màu rose (appConfirm "Ẩn công tác '<tên>' khỏi ma trận? Dữ liệu mặt trận đã ghi vẫn giữ trong hệ thống." → PATCH `{ active: false }`). Thành công → `refresh()` + `showToast`.
- Header phải giữ dạng bảng hiện có, nút ≥40px vùng chạm trong modal; không làm vỡ e2e `e2e/authed/work-fronts.spec.ts` (đọc spec: columnheader name "Trắc đạc", "Xây dựng (Tô Trám)" — tên accessible của `<th>` **không được đổi**: đặt nút sửa ngoài text node hoặc dùng `aria-label` riêng cho nút; kiểm lại bằng cách đọc cấu trúc).

Tiêu chí: typecheck/lint/format/check UI xanh; `tests/route-tien-do-3.test.ts` xanh.
Commit: `feat(mat-bang): sửa tên/số ngày và ẩn công tác thi công ở /work-fronts (đợt 2 dọn route việc B)`.

## Việc C — Xoá `GET /api/dashboard/floors` + migration 0157 DROP `engineering_scan_to_bim_runs` — `route: mechanical`

1. Xoá thư mục `app/api/dashboard/floors/`. Xoá các ca test của route này trong `tests/route-ho-so-bot.test.ts` (dòng liệt kê ở header ~31, comment ~1673 bỏ `/api/dashboard/floors` khỏi danh sách, các `test("GET /api/dashboard/floors…")` ~1735–1760). Grep toàn repo (`app lib scripts tests e2e docs .github`) `dashboard/floors` — sửa chỗ nào còn liệt kê như route sống trong `docs/` hiện hành (không sửa `PROGRESS.md`, không sửa migrations). Cổng xoá file ở trên phải xanh; test `tests/route-ho-so-bot.test.ts` xanh.
2. Mới `migrations/0157_drop_orphaned_scan_to_bim_runs.sql` — header bám **đúng phong cách** `migrations/0156_drop_orphaned_closed_loop_sync_logs.sql` (lý do: module scan-to-bim/CAD-BIM gỡ khỏi sản phẩm ở #476 và các đợt sau; rà app/lib/scripts/tests/e2e 0 tham chiếu; không bảng nào REFERENCES — xác nhận bằng grep `REFERENCES engineering_scan_to_bim_runs` trong migrations; ⚠️ ĐỤNG DỮ LIỆU phải qua staging + `npm run db:migrate -- --dry-run`). Thân: `DROP TABLE IF EXISTS engineering_scan_to_bim_runs CASCADE;`.
3. Sinh lại `docs/ERD.md` bằng công cụ: `psql -h 127.0.0.1 -U ci -d postgres -c "DROP DATABASE IF EXISTS xboss_erd" -c "CREATE DATABASE xboss_erd"`, rồi `DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/xboss_erd npm run db:migrate` và `DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/xboss_erd npm run gen:erd`. Diff ERD phải **chỉ** mất block `### engineering_scan_to_bim_runs`; khác → dừng, báo.
4. `tests/rls.test.ts`, `tests/migrate.test.ts` xanh (nếu `rls.test.ts` liệt kê bảng này thì gỡ khỏi danh sách như tiền lệ 0155).

Commit: `chore: xoá route /api/dashboard/floors đã bị /api/timeline thay thế + migration 0157 DROP engineering_scan_to_bim_runs (đợt 2 dọn route việc C)`.

## Thứ tự

Song song A ∥ B ∥ C trên 3 worktree từ `origin/main`. Mỗi việc qua `reviewer`. Gộp C → B → A. Sau gộp: cổng đầy đủ + `npm test -- --release-gate` + `npm run build`, cập nhật `PROGRESS.md`, PR, merge khi CI xanh.
