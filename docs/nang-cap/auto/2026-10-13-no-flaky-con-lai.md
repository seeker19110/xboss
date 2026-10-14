# /auto-complete 2026-10-13-no-flaky-con-lai — hoàn thiện dự án: nợ code còn lại sau #645

- Trạng thái: Done
- Bắt đầu: 2026-10-13 · base `origin/main` `dfd71b2`
- Phạm vi: nợ ghi ở `PROGRESS.md` mục 2026-10-13 (#645): (a) IDB treo ở tab mở SAU khi một tab đã bị chặn (Trung);
  (b) 3 ca chập chờn chưa chẩn đoán — e2e `admin.spec.ts:52`, e2e `payment-certs-canh-bao:306`, unit
  `s16-quyen-luc-ghi-import-quet.test.ts:343` · KHÔNG: skip/quarantine/tăng retries/timeout bừa, đổi workflow CI
  (upload `test-results/` để riêng), đổi hành vi nghiệp vụ ngoài gốc rễ chứng minh được.
- Definition of Complete: mỗi mục có gốc rễ kèm bằng chứng; lỗi app có test hồi quy đỏ-trước; lỗi test sửa đúng
  điều kiện chờ và chạy lặp cục bộ xanh; CI PR + `main` xanh; mục không gỡ được ghi lý do + nợ.

## Kế hoạch

| ID    | Việc (gốc)                                                  | Mức | route  | Phụ thuộc | PR · merge SHA   | Trạng thái · bằng chứng       |
| ----- | ----------------------------------------------------------- | --- | ------ | --------- | ---------------- | ----------------------------- |
| W-401 | IDB: open không sự kiện (tab sau tab bị chặn) → báo lỗi     | S   | tự làm | —         | #647 · `e97f62b` | merged; CI 21/21 xanh lần đầu |
| W-402 | Sửa 2 ca e2e chập chờn (admin nav race, trap Tab hộp)       | S   | tự làm | W-401     | #648 · `c35411c` | merged; CI 21/21 xanh lần đầu |
| W-403 | Ca unit `s16-quyen-luc-ghi-import-quet:343` (lỗi test)      | S   | tự làm | W-401     | #648 · `c35411c` | merged; CI 21/21 xanh lần đầu |
| W-404 | Ca unit `s16-quyen-luc-ghi-hien-truong` cv files (lỗi test) | S   | tự làm | W-401     | #648 · `c35411c` | merged; CI 21/21 xanh lần đầu |

## Quyết định và bằng chứng

- Phạm vi = nợ code-doable ghi ở lượt trước (§0/#572 không có việc mới — `list_issues`/`list_pull_requests`
  2026-10-13 chỉ #570/#572, 0 PR mở) · bậc 1.
- W-401 sửa bằng hạn chờ sự kiện đầu tiên 5s trong `moCsdl` (hết hạn = coi như bị chặn, tái dùng cờ + thông
  báo sẵn có) · loại "BroadcastChannel báo tab khác đang bị chặn" (thêm kênh + giao thức, vẫn hở khi tab bị chặn
  đã đóng) · bậc 2. Bằng chứng đỏ-trước: unit 2 ca treo trên code cũ; e2e "tab mở SAU tab bị chặn" timeout xin
  khoá vault trên build cũ 2/2.
- W-402 chẩn đoán (agent, 32 run CI, 128 log e2e): `admin.spec:52` 8/32 = **lỗi app** — GET `/api/nav-settings`
  của tab ghi đè cập nhật lạc quan khi bấm switch trước khi GET về (switch hiện mặc định BẬT lúc đang tải) →
  UI BẬT trong khi DB TẮT. `payment-certs-canh-bao:306` 7/32 = **lỗi test** (lần mở hộp thứ 2 không chờ focus
  vào hộp; `Modal` focus sau `setTimeout(50)`) + **lỗi app a11y** kèm: trap Tab tính nút `disabled` là phần tử
  cuối → Tab từ "Huỷ" thoát khỏi hộp `aria-modal`. Đã tự đọc `app/admin/page.tsx:167-173,297-317,796-804` và
  `dialogs.tsx:92-135` xác nhận.
- Bằng chứng đỏ-trước e2e W-401 ban đầu SAI: assert `POST vault/keys` ở tab B đỏ cả trên build mới — tab B nhận
  khoá tab A đã xin qua `unlock` (cùng thiết bị + manifest), không có POST để chờ. Đổi sang triệu chứng treo thật
  (tick không ra kết quả): build cũ 4/4 đỏ dòng 398, build mới 8/8 xanh · bậc 3.
- Audit `audit-logic` W-401: ĐẠT, 0 Cao. Trung T1 (máy chậm thật: hết hạn → đóng handle đến muộn → lặp mãi lỗi)
  → sửa: để dành handle hợp lệ đến muộn cho lần mở kế tiếp (đóng khi versionchange) · loại "nâng hạn 10–15s"
  (vẫn lặp trên máy đủ chậm) · bậc 1. Trung T2 (thiếu test canh `clearTimeout` success/error — mutant sống) →
  thêm ca, 2 mutant nay đỏ. Thấp T3/T4 (test giòn/chậm) → `trongHan` + hạn chờ nhỏ. Thấp T5 (thông điệp "tab
  cũ" khi chỉ máy chậm, không log) + `docOpDaGiai().catch(() => [])` → ghi nợ `PROGRESS.md` · bậc 2. T6 (race
  click sau `version===2`): thứ tự hàng open IDB bảo đảm success của tab B tới trước open đọc của tab2 → giữ.
- Gate W-401 (DB mới): 18/20 — đỏ ngoài 3 file chỉ chạy CI (`RESTORE_TEST_*`) là ca mới
  `s16-quyen-luc-ghi-hien-truong` "correspondences/:id/files siết giữa chừng" (1/5 khi chạy riêng file, không
  liên quan offline) → thêm W-404. Gốc rễ (tái hiện, lỗi in tên tệp `cv24-…` của 2 lượt khác nhau): `UPLOAD_DIR`
  dùng chung giữa các DB test (id công văn đánh lại từ 1 ở mỗi DB), test kiểm "không còn tệp `cv<id>-*`" nên vớ
  tệp hợp lệ của test/lượt khác cùng id. Sửa: so ảnh chụp tệp trước/sau lời gọi · loại "UPLOAD_DIR riêng mỗi
  worker" (đổi runner) · bậc 2.
- Đỏ-trước W-402/403/404 (code app cũ, test mới): admin 4/4 đỏ (`aria-checked` "true" sau khi GET áp); hộp
  thoại 2/2 đỏ (Tab từ "Huỷ" thoát hộp); s16 quét 2/2 đỏ khi ép `Date.now()` (test cũ), xanh test mới; s16 hiện
  trường đỏ khi đặt sẵn tệp `cv<id>-*` (test cũ), xanh test mới. Bản đầu e2e admin xanh sai 2 lần: (1)
  `page.route` không thấy request vì SW của app tự fetch `/api/*` → `test.use({ serviceWorkers: "block" })` ở
  describe "Quản trị" (trang admin không dựa SW); (2) `waitForResponse` khớp nhầm GET `?_=` của AppHeader → khớp
  đúng URL không query + chờ "Đang tải…" tắt (đã áp state). Bỏ ý "kéo focus từ ngoài vào" của trap (chờ focus
  trong test là đủ, ít code hơn) · bậc 2.
- Audit `audit-ui` W-402: ĐẠT, 0 Cao. Trung #1 (axe tab AppShell quét lúc switch đang khoá) — xác nhận bằng e2e:
  `disabled:opacity-50` làm axe báo tương phản (2/3 desktop) → bỏ làm mờ (`disabled:cursor-not-allowed`,
  `enabled:hover`), axe chờ `toBeEnabled`. Trung #2 (GET lỗi/!ok → vẫn hiện BẬT mặc định, bấm được = cùng lớp lỗi)
  → sửa: `navLoi` khoá switch + `role="alert"` kèm "Thử lại"; e2e mới đỏ 2/2 trên build trước. Thấp #3/#5 →
  `role="status"`, `aria-busy`, `unroute` trước reload. Thấp #6 (cửa sổ nhỏ còn lại ở test hiện trường khi worker
  khác ghi `cv<id>-*` đúng lúc) → chấp nhận, ghi nợ · bậc 2. Ghi nhận ngoài diff: M129 mobile 1/3
  `page.goto /login: net::ERR_ABORTED` cục bộ (chưa thấy ở 32 run CI).
- M129 lặp lại (desktop, 2/6 lượt) → gốc rễ: dòng 516 `clearCookies()` khi trang app còn mở → poll kế tiếp 401 →
  `lockPrivatePageUntilCachePurged` tự `location.replace("/login")` đua `page.goto("/login")` → lỗi test (có sẵn).
  Sửa: helper `doiTaiKhoan` rời trang (`about:blank`) trước khi xoá cookie, áp 5 chỗ cùng mẫu trong spec ·
  loại "goto about:blank trong `dangNhapCoLap`" (vẫn đua với redirect nếu cookie đã xoá) · bậc 1. Sau sửa
  `payment-certs-canh-bao` 89/89 (2 project × 4); admin + payment-certs 105/105 trừ ca này trước đó.
- Review `reviewer` W-402/403/404: chặn 1 (prettier `dialogs.tsx`) → sửa. Không chặn: race 2 GET chồng nhau khi đổi
  tab qua lại (GET cũ mở khoá sớm/đặt lỗi muộn) → sửa bằng `navLuot` (chỉ lượt mới nhất ghi state) · bậc 1; JSDoc
  `theme()` bị đẩy lệch → sửa; `addInitScript` trên `about:blank` có thể ném `pageerror` vô hại → giữ. Gate DB mới:
  18/20, đỏ chỉ 3 file CI-only + prettier (đã sửa, `format:check` toàn repo xanh). Admin 40/40 sau build cuối.
- Re-audit `audit-logic` phần để dành handle: ĐẠT, 0 Cao/Trung (không giao handle cũ sau xoá/nâng cấp; mỗi
  factory tối đa một request bỏ dở HOẶC một handle để dành; 5/6 mutant bị bắt). Thấp: `db.onclose = bo` không có
  test → thêm ca, mutant nay đỏ. `IdbTxDb.tx` không gỡ `dbPromise` khi connection chết không phát `close` (có từ
  trước, Safari) → nợ · bậc 2.
- W-403 chẩn đoán (agent, tái hiện 3/3 bằng ép `Date.now()`): **lỗi test** — tên tệp quét chứa `RUN` base36;
  regex rev không neo của `parseDrawingInfo` (`lib/ky-thuat/drawings-scan.ts:108`) đọc `r<số>` trong `RUN` thành
  `Rev <số>` (~5–7% lượt) nên revision giữ chỗ cứng `'Rev A'` không chặn tệp 2. Giả thuyết `DRAWINGS_DIR` dùng
  chung bị bác (mỗi worker một DB; 35 lượt chạy song song 0 đỏ). Sửa test: lấy `rev` từ parser · bậc 1.
  Lỗi app kèm (regex rev không neo: `DUCT_FLOOR3.dwg` → `Rev 3`) **không sửa trong lượt** — quét lại sau khi
  đổi parser sinh revision mới cho bản vẽ thật đã lưu sai rev (đụng dữ liệu thật, cần chủ repo đánh giá) → nợ.

- Hoàn thiện: phạm vi = module hàng đợi offline (client) + trang Admin + `Modal` + 4 file test → audit theo file chạm:
  `audit-logic` (W-401, 2 vòng, ĐẠT), `audit-ui` (W-402, ĐẠT, 2 Trung đã sửa), `reviewer` (W-402–404, chặn 1 đã
  sửa); lượt quét cuối không sinh Cao mới. Clone sạch thay bằng CI #647/#648 (checkout sạch: build + test Postgres
  - e2e 4 shard + coverage) · bậc 4. `npm audit --omit=dev`: 0 lỗ hổng.
- DoC: gốc rễ có bằng chứng cho cả 6 ca (W-401 + 5 ca chập chờn) ✔; lỗi app có test hồi quy đỏ-trước (unit + e2e) ✔;
  lỗi test sửa đúng điều kiện chờ, chạy lặp cục bộ xanh (offline-deep 42/42, admin 40/40, payment-certs 89/89) ✔;
  CI PR #647/#648 xanh lần đầu ✔, `main` sau #647 xanh ✔ (sau #648: xem PR đóng lượt); nợ còn lại ghi `PROGRESS.md`
  có chủ đích ✔. GO/NO-GO: không đổi (GO có điều kiện — deploy/UAT vẫn thuộc chủ repo).

## Bàn giao / bước tiếp theo

- Không còn việc làm được bằng code trong phạm vi. Nợ kế tiếp (đợt sau, cần chủ repo): regex rev của
  `parseDrawingInfo` không neo (đổi parser → quét lại sinh revision mới cho bản vẽ thật — đánh giá dữ liệu trước);
  thông điệp/log khi IDB hết hạn chờ vì máy chậm; trap Tab tính `input.hidden`; job e2e không upload `test-results/`
  (đổi workflow).
- Chủ repo trả lời 2026-10-14: regex rev `parseDrawingInfo` "chưa cần" xử lý — giữ nguyên, vẫn là nợ.
