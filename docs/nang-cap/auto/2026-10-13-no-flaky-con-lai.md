# /auto-complete 2026-10-13-no-flaky-con-lai — hoàn thiện dự án: nợ code còn lại sau #645

- Trạng thái: Active
- Bắt đầu: 2026-10-13 · base `origin/main` `dfd71b2`
- Phạm vi: nợ ghi ở `PROGRESS.md` mục 2026-10-13 (#645): (a) IDB treo ở tab mở SAU khi một tab đã bị chặn (Trung);
  (b) 3 ca chập chờn chưa chẩn đoán — e2e `admin.spec.ts:52`, e2e `payment-certs-canh-bao:306`, unit
  `s16-quyen-luc-ghi-import-quet.test.ts:343` · KHÔNG: skip/quarantine/tăng retries/timeout bừa, đổi workflow CI
  (upload `test-results/` để riêng), đổi hành vi nghiệp vụ ngoài gốc rễ chứng minh được.
- Definition of Complete: mỗi mục có gốc rễ kèm bằng chứng; lỗi app có test hồi quy đỏ-trước; lỗi test sửa đúng
  điều kiện chờ và chạy lặp cục bộ xanh; CI PR + `main` xanh; mục không gỡ được ghi lý do + nợ.

## Kế hoạch

| ID    | Việc (gốc)                                                  | Mức | route  | Phụ thuộc | PR · merge SHA | Trạng thái · bằng chứng |
| ----- | ----------------------------------------------------------- | --- | ------ | --------- | -------------- | ----------------------- |
| W-401 | IDB: open không sự kiện (tab sau tab bị chặn) → báo lỗi     | S   | tự làm | —         |                | đang làm                |
| W-402 | Sửa 2 ca e2e chập chờn (admin nav race, trap Tab hộp)       | S   | tự làm | W-401     |                | gốc rễ xong, chờ code   |
| W-403 | Ca unit `s16-quyen-luc-ghi-import-quet:343` (lỗi test)      | S   | tự làm | W-402     |                | gốc rễ xong, chờ code   |
| W-404 | Ca unit `s16-quyen-luc-ghi-hien-truong` cv files (lỗi test) | S   | tự làm | W-402     |                | gốc rễ xong, chờ code   |

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

## Bàn giao / bước tiếp theo

- W-401: e2e xong (offline-deep 42/42, ca mới đỏ cũ 4/4 – xanh mới 8/8), unit 17/17; đang chạy `gate --test
--build` (DB `xboss_gate401`) + re-audit phần để dành handle → commit, PR, merge. Rồi W-402/W-403: bản sửa đã soạn
  trong worktree `scratchpad/wt402` (admin `disabled={navLoading}` + e2e giữ GET; `dialogs.tsx` FOCUSABLE bỏ
  `disabled` + test Tab từ "Huỷ" + chờ focus lần mở 2; s16 lấy `rev` từ parser) — chép sang nhánh sau khi dựng lại
  từ `origin/main`, chứng minh đỏ-trước (e2e admin/payment-certs build cũ; unit s16 với preload
  `scratchpad/datenow-r.mjs`), rồi PR.
