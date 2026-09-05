# PLAN.md — Đợt 5 chiến dịch coverage: phủ `app/api/engineering/**` + vá nốt lỗ hổng cách ly dự án tầng WBS

**Cập nhật:** 2026-09-05 · **Nguồn:** `PROGRESS.md` mục "Đợt 4 chiến dịch coverage" (2026-09-05) —
phần "Đợt sau" và mục đầu của "Ghi nhận, chưa sửa". Khuôn test đã chốt ở `tests/helpers/phien.ts`
và 9 file `tests/route-*.test.ts` của Đợt 4.
**Nhánh nền:** `claude/tiep-tuc-yu4ib7` — đã đồng bộ lên `origin/main` sau khi PR #478 merge
(`2fb5aa04`). Base MỌI worktree trên nhánh này.
**Trạng thái thi hành:** ĐANG THI HÀNH.

## Bối cảnh & ràng buộc CỨNG cho mọi việc

- Worker không thấy hội thoại. Bắt buộc đọc trước: `CLAUDE.md`; `tests/helpers/phien.ts` (toàn bộ
  comment đầu file); file mẫu cùng khuôn `tests/route-tai-chinh-3b.test.ts` (route `[id]`, upload,
  cách ly dự án + tổ chức) và `tests/route-wbs-cach-ly-du-an.test.ts` (khuôn ca xuyên dự án);
  `PROGRESS.md` mục "Đợt 4 chiến dịch coverage" — **đọc kỹ 3 phần**: "7 LỖ HỔNG CÁCH LY DỮ LIỆU",
  "Bài học hạ tầng test", "Bài học điều phối".
- **Test phải THỰC THI route handler thật** (import `@/app/api/.../route`, gọi `GET/POST/...` với
  `NextRequest`), KHÔNG tái hiện SQL trong test, KHÔNG `assert.match` trên mã nguồn route. Mỗi
  handler trong phạm vi tối thiểu: 401 chưa đăng nhập (`dangXuat()`), 403 sai vai trò (nếu route
  kiểm `CAN`), ca hạnh phúc 200/201 **kiểm dữ liệu trả về/ghi DB**, validate 400/422, 404 xuyên
  dự án/tổ chức khi route có lọc, và ca ranh giới nghiệp vụ riêng của route.
- **Mọi ca có dự án dùng `dangNhapDuAn(user, projectId)`** (không `dangNhap` trần). Trước khi báo
  xong: chèn 1 dòng lạ vào `user_projects` rồi chạy lại file — phải vẫn xanh; xong thì xoá dòng đó.
- **KHÔNG giả định BẤT KỲ trạng thái toàn cục nào test không tự dựng** — bài học Đợt 4: gán cứng
  `created_by = 1` (file khác xoá user ⇒ vỡ khoá ngoại) và khẳng định cứng một thư mục trên đĩa
  chưa tồn tại (file khác upload ⇒ nó xuất hiện). Cả hai đều xanh khi chạy riêng, đỏ trong bộ đầy
  đủ. Tự tạo mọi dữ liệu mình cần, hậu tố duy nhất (`uniq()` như file mẫu). Không
  `DELETE`/`TRUNCATE` bảng dùng chung; không sửa `tests/setup.ts`/`tests/helpers/phien.ts`.
- File test: đầu file `import { HAS_TEST_DB } from "./setup"` rồi `import ... from "./helpers/phien"`
  TRƯỚC mọi import route; `const S = { skip: !HAS_TEST_DB }` cho mọi `test(...)`. Comment đầu file
  liệt kê đủ route được phủ.
- **Môi trường (đọc kỹ — Đợt 4 mất một vòng vì hai sai lệch này):**
  - **Node 24** — CI và `.nvmrc` dùng Node 24; máy này mặc định Node 22, mà Node 22 **crash khi in
    bảng coverage**. Dùng `export PATH=/tmp/claude-0/-home-user-xboss/7b19723b-25f4-5aaa-854f-2342694afe35/scratchpad/node24/bin:$PATH`
    (kiểm `node --version` ra v24.x trước khi chạy gì).
  - **DB phải dựng bằng ICU/vi-VN**, KHÔNG dùng `createdb` trần (locale C làm `lower()` không hạ
    chữ hoa có dấu ⇒ đỏ giả):
    `psql -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE <ten> LOCALE_PROVIDER icu ICU_LOCALE 'vi-VN' TEMPLATE template0 ENCODING UTF8;"`
  - Postgres ở `127.0.0.1:5433`, user `postgres`, không mật khẩu. Lệnh chạy 1 file (BẮT BUỘC cờ mock):
    `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/<ten> node --experimental-test-module-mocks --import ./node_modules/tsx/dist/loader.mjs --test tests/<file>.test.ts`
  - **Worktree**: symlink `ln -s /home/user/xboss/node_modules <worktree>/node_modules`, KHÔNG `npm ci`.
- **Khi test lộ BUG THẬT trong route** (lớp lỗi đã gặp: 401 gộp thành 403; thao tác theo `:id`
  không lọc `project_id`/`org_id` trong khi đường đọc danh sách đã lọc; validate ngày không kiểm
  ngày có thật — dùng `isValidDateISO` ở `lib/nen/date.ts`): **sửa tối thiểu ngay trong route cùng
  nhánh**, bám khuôn route anh em đã đúng, viết ca test chứng minh (kiểm cả **dữ liệu bên kia
  không đổi trong DB**, không chỉ mã trạng thái), ghi rõ trong báo cáo.
- **LUẬT MỚI (bài học Đợt 4 — reviewer bác bỏ "ghi nhận, chưa sửa" 3 lần và cả 3 lần đều đúng):**
  mọi mục "ghi nhận, chưa sửa" **BẮT BUỘC kèm bằng chứng đã ĐỌC route anh em cùng cụm** và trích
  dòng code cho thấy nó cũng không lọc. Không được kết luận "cụm này vốn thiết kế toàn hệ" bằng
  suy luận suông — Đợt 4 đã sai đúng kiểu đó 3 lần, mỗi lần giấu một lỗ hổng thật.
- **Không** đụng `lib/tien-do/recompute.ts`, `lib/bao-mat/auth.ts`, `lib/khoi-luong/boq.ts`,
  `lib/vat-tu/material-sync.ts`. Không thêm migration. Không đổi hình dạng JSON trả về.
- Route gọi ra ngoài (LLM/email/Telegram/Zalo/push/S3) → test phải chặn mạng bằng thiếu biến môi
  trường hoặc `mock.module`; **không được để test gọi mạng thật**. Cụm `engineering` có nhiều route
  tên gợi ý AI — đọc code xác nhận chúng là hàm xác định (ENG-2 ghi rõ "không gọi LLM"), nếu route
  nào thật sự gọi ra ngoài thì phải chặn và ghi rõ cách chặn trong báo cáo.
- Tiếng Việt toàn bộ tên ca test/comment/commit. Worker KHÔNG push — commit trong worktree (tách
  commit `test:` và `fix:`).
- **Cổng mỗi việc**: file test xanh trên DB ICU vừa dựng mới; kiểm chứng chống nhiễu `user_projects`;
  `npx eslint <file test> <route đã sửa>` xanh; `npm run typecheck` xanh; nếu sửa route thì chạy lại
  mọi file test cũ nhắc tới route đó (`grep -l`).

---

# Pha 1 — 5 việc song song

## Việc W0 — Vá lỗ hổng cách ly dự án ở `workpackages/**` — `route: standard` (ƯU TIÊN CAO NHẤT)

Nợ đã ghi ở Đợt 4, reviewer đã đọc code xác nhận. Đo lại 2026-09-05: **8 route không có bất kỳ
`visibleProjectIds`/`getCurrentProjectId`/`withProjectScope` nào**, trong khi `workpackages/[id]/route.ts`
(anh em cùng thư mục) ĐÃ lọc đúng:

- `app/api/workpackages/route.ts` (POST tạo gói việc — chỉ kiểm `sheet_type_id` tồn tại)
- `app/api/workpackages/[id]/tasks/route.ts` (POST tạo task dưới gói việc bất kỳ)
- `app/api/workpackages/[id]/move/route.ts` (PATCH đổi thứ tự gói việc dự án khác)
- `app/api/workpackages/[id]/copy/route.ts`
- `app/api/workpackages/[id]/bbnt/route.ts`
- `app/api/workpackages/[id]/drawing/route.ts`
- `app/api/workpackages/[id]/dimensions/route.ts`, `.../dimensions/column/route.ts`,
  `.../dimensions/column/move/route.ts`
- `app/api/workpackages/qc-status/route.ts`

Suy dự án qua `work_packages.sheet_type_id → sheet_types.tower_id → towers.project_id` — **dùng
`LEFT JOIN towers`** để dòng chưa gán tower ra `projectId = null` rồi bị 404, không biến mất khỏi
kết quả (khuôn V9 đã dùng, xem `app/api/work-fronts/[id]/route.ts` và `lib/tien-do/workfronts.ts`).
Không thuộc dự án nhìn thấy được → **404**. Route trả danh sách thì **lọc**, không trả 404.

File test MỚI: `tests/route-workpackages-cach-ly.test.ts`. Mỗi route vá cần **cả hai chiều**: ca
xuyên dự án → 404 (hoặc không xuất hiện trong danh sách) **kèm kiểm dữ liệu dự án B không đổi trong
DB**; và ca thao tác hợp lệ trong dự án của mình → 200/201, dữ liệu đổi đúng.

**Ranh giới:** chỉ 8 route trên + file test. Thấy route khác cùng lớp lỗi → ghi nhận kèm trích code,
không sửa.
**Tiêu chí chấp nhận:** cổng chung; `tests/route-tien-do-3.test.ts` và `tests/route-wbs-con-lai.test.ts`
(đã phủ chính các route này ở Đợt 3/4) **vẫn xanh** — nếu đỏ, phân tích xem ca đó có đang khoá hành
vi thiếu cách ly không, sửa cho đúng và ghi rõ.

## Việc W1 — Engineering: quy trình & duyệt — `route: standard`

File: `tests/route-eng-quy-trinh.test.ts`. Phạm vi (24 route): `agent-sessions` (3, gồm
`[id]/conflicts/[conflictId]/resolve`), `autonomy` (5: kill-switch, policies, requests,
requests/[id]/authorize, requests/[id]/execute), `objects` (3, gồm `[id]/review`), `suggestions`
(3, gồm `[id]/decide`), `swarm` (5: debates, debates/[id], debates/[id]/arguments,
debates/[id]/synthesize, drafts), `workflows` (5: route, [id], [id]/submit, [id]/transition,
[id]/gates/[seq]).

Đọc trước `docs/nang-cap/ENG-3-engineering-workflow-os.md` và `ENG-4-multi-agent-engineering-os.md`
để biết bất biến: **Gate 0 chặn thật**, 5 approval profile A–E, separation of duties, phân xử
xung đột **không dùng majority vote**, `no_consensus` là kết quả hợp lệ. Test phải khoá đúng các
bất biến đó (vd người submit không tự duyệt được; gate chưa qua thì không transition được).

**Tiêu chí chấp nhận:** cổng chung; 24 route được chạm.

## Việc W2 — Engineering: zero-error, tuân thủ & tri thức — `route: standard`

File: `tests/route-eng-zero-error.test.ts`. Phạm vi (22 route): `zero-error` (5: challenge,
issue-certificate, pour-permits, reconcile-quad, verify-photo), `compliance` (4: rules, audits,
audit-element, scan-all), `data-quality` (2, gồm `[id]/resolve`), `memory` (3: lessons, patterns,
transfer), `esign/envelopes`, `digital-handover`, `smart-ipc`, `project-health`, `graph`,
`taxonomy`, `lineage/[id]`, `impact/[id]`.

Lưu ý: `smart-ipc` là **cổng chuỗi thanh toán** — `PROGRESS.md` ghi rõ cổng 1 đọc bảng
`engineering_scan_to_bim_runs` nay không còn ai ghi nên luôn `available: false`; test phải phản ánh
đúng hành vi thật đó, KHÔNG sửa. `verify-photo`/`issue-certificate` đụng lưu trữ file — dùng byte
ảnh thật tối thiểu như file mẫu.

**Tiêu chí chấp nhận:** cổng chung; 22 route được chạm.

## Việc W3 — Engineering: dự báo, đấu thầu & tài chính — `route: standard`

File: `tests/route-eng-du-bao.test.ts`. Phạm vi (22 route): `predictions` (3, gồm `[id]/decide`,
`run`), `prescriptive` (3: scenarios, scenarios/[id]/approve, simulate), `cashflow` (2: forecasts,
simulate), `fidic/claims` + `fidic/claims/generate-dossier`, `fidic-tia`, `bidding` (3: packages,
quotes, analyze), `subcon-ai` (3: scores, evaluate, recommend-shortlist), `carbon-lca`,
`qs-bom-explosion`, `shopdrawing-lod400`, `multi-agent-copilot`, `pinnacle/pulse`.

Lưu ý **tiền tệ (M45 PR1)**: cụm này có route tính tiền — không cộng/nhân tiền bằng float JS trong
test để suy kết quả kỳ vọng; dùng hằng số tính tay hoặc đọc thẳng từ DB. Route "AI" ở đây là hàm
xác định (ENG-2) — xác nhận bằng đọc code, nếu có lời gọi mạng thật thì chặn và ghi rõ.

**Tiêu chí chấp nhận:** cổng chung; 22 route được chạm.

## Việc W4 — Engineering: MEPF & hiện trường số — `route: standard`

File: `tests/route-eng-mepf.test.ts`. Phạm vi (23 route): `mepf-*` (6: hydraulic, nesting,
predictive, takeoff, tc, voice), `pipe-mass-balance`, `pipe-spool-tracking`, `iot` (3: devices,
telemetry, alerts), `spatial` (3: compute, annotations, annotations/[id]), `logistics` (2:
shipments, scan-receive), `ledger` (2: merkle, verify-proof), `hse-vision` (2: scan, scans),
`edge-vision-tracking`, `generative-routing`, `closed-loop-sync`.

Lưu ý: `ledger/merkle` + `verify-proof` là sổ cái băm — test phải kiểm **bằng chứng hợp lệ thì
verify PASS, sửa một byte thì FAIL** (đây là bất biến đáng giá nhất cụm này, đừng chỉ kiểm 200).
`mepf-voice` có thể chạm nhận dạng giọng nói — đọc code, nếu gọi ra ngoài thì chặn.
`closed-loop-sync` từng có test giả ở Đợt 1 (tự tính lại sha256 mà không import module) — lần này
phải gọi module thật.

**Tiêu chí chấp nhận:** cổng chung; 23 route được chạm.

---

# Pha 2 — Tích hợp & đo lại

## Việc W5 — Chạy full suite, cập nhật baseline + PROGRESS — `route: standard`

Sau khi W0–W4 qua reviewer và đã tích hợp vào nhánh nền.

1. Dựng DB ICU mới, chạy `npm run check:coverage` **dưới Node 24** → phải **0 file fail** và cổng
   ĐẠT. Đỏ ở file không thuộc đợt → đối chứng trên `origin/main` trước khi kết luận.
2. Cập nhật `coverage-baseline.json` theo số đo mới (`measuredAt` = hôm nay).
3. `npm run lint` · `typecheck` · `check:lib-layers` · `check:dead-code` · `check:route-perms` ·
   `check:project-scope` xanh.
4. `PROGRESS.md`: thêm mục `## ✅ Đợt 5 chiến dịch coverage` **trên cùng**, đúng khuôn mục Đợt 4
   (bảng từng việc + số ca; "BUG THẬT lộ ra"; "Ghi nhận, chưa sửa" kèm bằng chứng đọc code;
   coverage cũ → mới; "Đợt sau"). Cập nhật câu "Đợt sau" của mục Đợt 4.

**Tiêu chí chấp nhận:** full suite 0 fail dưới Node 24 + DB ICU; prettier sạch cho md/json đã sửa.

---

## Thứ tự & phụ thuộc toàn đợt

W0 ‖ W1 ‖ W2 ‖ W3 ‖ W4 (song song, khác file test, khác DB; chỉ có thể trùng ở route được sửa bug
— trùng thì dừng, báo phiên chính) → tích hợp tuần tự W0→W4 → W5. Mỗi việc 1 worktree tại
`/home/user/xboss-wt/<ma>`, nhánh `claude/cov5-<ma>`, DB `xboss_c5_<ma>` dựng bằng ICU/vi-VN.
`reviewer` soát từng việc trước khi tích hợp. Coordinator/worker KHÔNG push, KHÔNG mở PR.
