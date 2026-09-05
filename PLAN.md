# PLAN.md — Đợt 6: trả nợ "Ghi nhận, chưa sửa" + phủ nốt route + cổng chống hồi quy test

**Cập nhật:** 2026-09-05 · **Nguồn:** `PROGRESS.md` mục "Đợt 5 chiến dịch coverage" — phần
"Đợt sau", "Ghi nhận, CHƯA sửa" (5 mục) và "Bài học quy trình" (mục cuối: cần cổng tự động).
**Nhánh nền:** `claude/tiep-tuc-yu4ib7` — đồng bộ lên `origin/main` sau khi PR #479 merge.
Base MỌI worktree trên nhánh này.
**Trạng thái thi hành:** CHỜ THI HÀNH.

Khác Đợt 1–5 (chiến dịch _phủ test_), Đợt 6 là chiến dịch **sửa tính năng đang hỏng**: sau 5 đợt,
chỉ còn **8/451 route** chưa từng được test thực thi chạm tới, nhưng danh sách "ghi nhận, chưa sửa"
đã tích 5 mục, trong đó 2 mục là **tính năng chưa từng chạy đúng lần nào** ở vùng rủi ro cao.

## Bối cảnh & ràng buộc CỨNG cho mọi việc

- Worker không thấy hội thoại. Bắt buộc đọc trước: `CLAUDE.md`; `PROGRESS.md` mục "Đợt 5 chiến dịch
  coverage" (đọc kỹ "Ghi nhận, CHƯA sửa" + "Bài học quy trình"); `tests/helpers/phien.ts` (toàn bộ
  comment đầu file); file test mẫu `tests/route-eng-quy-trinh.test.ts`.
- **Test phải THỰC THI code thật** (import route/hàm lib, gọi với `NextRequest`), KHÔNG tái hiện SQL
  trong test, KHÔNG `assert.match` trên mã nguồn.
- **Mọi ca có dự án dùng `dangNhapDuAn(user, projectId)`** (không `dangNhap` trần).
- **KHÔNG giả định BẤT KỲ trạng thái toàn cục nào test không tự dựng.** Lớp lỗi này đã LẶP LẠI ở cả
  Đợt 4 lẫn Đợt 5 dù đã ghi thành ràng buộc cứng: gán cứng `created_by = 1` / `actorId = 1` cho cột
  có khoá ngoại tới `users` — xanh khi chạy riêng, ĐỎ trong bộ đầy đủ vì file test khác đã xoá user
  đó. **Mọi id khoá ngoại trong test phải đến từ hàm `tao*()` của chính file test.** Việc D dựng cổng
  tự động chặn lớp lỗi này; các việc còn lại vẫn phải tự tuân thủ (cổng chưa merge lúc họ code).
- File test: đầu file `import { HAS_TEST_DB } from "./setup"` rồi `import ... from "./helpers/phien"`
  TRƯỚC mọi import route; `const S = { skip: !HAS_TEST_DB }` cho mọi `test(...)`.
- **Môi trường (đọc kỹ — đã mất một vòng ở cả Đợt 4 lẫn Đợt 5):**
  - **Node 24** (Node 22 crash khi in bảng coverage):
    `export PATH=/tmp/claude-0/-home-user-xboss/7b19723b-25f4-5aaa-854f-2342694afe35/scratchpad/node24/bin:$PATH`
    — kiểm `node --version` ra v24.x trước khi chạy gì.
  - **DB dựng bằng ICU/vi-VN**, KHÔNG `createdb` trần (locale C làm `lower()` không hạ chữ hoa có
    dấu ⇒ đỏ giả ở `backfill-0137`), và **tên DB không được có dấu gạch ngang** (`createdb` thất bại
    im lặng, sinh lỗi "database does not exist" gây hiểu nhầm là test hỏng):
    `psql -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE <ten> LOCALE_PROVIDER icu ICU_LOCALE 'vi-VN' TEMPLATE template0 ENCODING UTF8;"`
  - Postgres ở `127.0.0.1:5433`, user `postgres`, không mật khẩu. Lệnh chạy 1 file (BẮT BUỘC cờ mock):
    `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/<ten> node --experimental-test-module-mocks --import ./node_modules/tsx/dist/loader.mjs --test tests/<file>.test.ts`
  - **Worktree**: symlink `ln -s /home/user/xboss/node_modules <worktree>/node_modules`, KHÔNG `npm ci`.
- **LUẬT (giữ từ Đợt 5, đã chứng minh giá trị 4 lần):** mọi mục "ghi nhận, chưa sửa" **BẮT BUỘC kèm
  bằng chứng đã ĐỌC code anh em** và trích dòng code. Không kết luận bằng suy luận suông.
- **Không** đụng `lib/tien-do/recompute.ts`, `lib/bao-mat/auth.ts`, `lib/khoi-luong/boq.ts`,
  `lib/vat-tu/material-sync.ts`. Không thêm migration trừ khi việc nói rõ được phép.
- Tiếng Việt toàn bộ tên ca test/comment/commit. Worker KHÔNG push — commit trong worktree.
- **Cổng mỗi việc**: file test xanh trên DB ICU vừa dựng mới; `npx eslint <file đã sửa>` xanh;
  `npm run typecheck` xanh; chạy lại mọi file test cũ nhắc tới file đã sửa (`grep -l`).

---

# Pha 1 — 4 việc song song

## Việc A — Kill switch của Safe Execution Engine: làm cho lệnh huỷ có tính bền — `route: complex`

**File:** `lib/ky-thuat/engineering-autonomy.ts`, hàm `executeExecutionRequest` (khoảng dòng 274–342).

**Lỗi (đã đọc code xác nhận 2026-09-05):** cả thân hàm nằm trong
`withProjectScope(projectId, async () => {...}, { readOnly: false })` — mà `withProjectScope` bọc
`withTransaction`. Khi kill switch bật, code chạy:

```ts
if (!allowance.allowed) {
  await run(`UPDATE engineering_execution_requests SET status = 'killed' WHERE id = ?`, requestId);
  throw new Error(`Thực thi bị hủy bỏ: ${allowance.reason}`);
}
```

`throw` làm transaction rollback ⇒ **`UPDATE` đó bị xoá luôn**. Hậu quả không chỉ là mất nhật ký:
bản ghi ở lại trạng thái `authorized` với `approval_token` còn nguyên và `token_expires_at` còn hạn
(15 phút). Nếu kill switch được bật rồi **tắt lại** trong cửa sổ đó, chính yêu cầu lẽ ra đã bị huỷ
vẫn gọi `executeExecutionRequest` được và lần này **thực thi thật**.

**Yêu cầu:**

1. Lệnh huỷ phải **bền** — trạng thái `killed` phải còn trong DB sau khi hàm ném lỗi.
2. Cùng lúc phải **đóng cửa sổ token**: khi huỷ, `approval_token` về `NULL` (bám đúng cách đường
   thành công đã làm: `SET status = 'completed', execution_result = ?, approval_token = NULL`).
   Yêu cầu đã bị huỷ không được phép thực thi lại kể cả khi kill switch tắt trong 15 phút.
3. `UPDATE` huỷ phải lọc `AND project_id = ?` như mọi câu lệnh khác trong hàm (câu hiện tại chỉ có
   `WHERE id = ?` — thiếu lọc dự án, dù ngữ cảnh đã ở trong `withProjectScope`).
4. Hợp đồng ném lỗi ra ngoài **không đổi**: caller vẫn nhận `Error` với đúng thông điệp
   `Thực thi bị hủy bỏ: <lý do>` (route đang bắt và trả 500 — Việc B sẽ đổi mã trạng thái, đừng làm
   trùng phần đó ở đây).

**Ranh giới được phép quyết (đây là lý do route `complex`, không phải `spec`):**

- **Cách tách ghi huỷ ra khỏi transaction sắp rollback** là quyết định của worker. Hai hướng đều
  chấp nhận được, chọn hướng nào cũng phải giải thích trong comment code:
  (a) tách hàm thành 2 pha — pha đọc/thẩm định trong một `withProjectScope` read-only, pha ghi
  (huỷ **hoặc** hoàn tất) trong một `withProjectScope` ghi riêng sau đó; hoặc
  (b) giữ 1 transaction cho đường thành công, còn nhánh huỷ thì **không throw từ trong transaction**
  mà trả về một giá trị đánh dấu, ghi huỷ ở transaction thứ hai bên ngoài rồi mới `throw`.
- **Xử lý race condition** — nếu chọn hướng (a), giữa pha thẩm định và pha ghi có khoảng trống cho
  hai lời gọi đồng thời cùng token cùng qua được thẩm định. Bắt buộc đóng bằng ít nhất một trong hai:
  `SELECT ... FOR UPDATE` khi đọc bản ghi, **và/hoặc** thêm điều kiện `AND status = 'authorized'`
  (kèm `AND approval_token = ?`) vào `UPDATE` hoàn tất rồi kiểm số dòng thật sự đổi — 0 dòng nghĩa
  là ai đó đã chạy trước, phải ném lỗi thay vì báo thành công. Worker chọn cách, nhưng **phải có**
  một cơ chế và phải có ca test chứng minh nó chặn được lời gọi thứ hai.
- **Không** đổi schema, **không** thêm migration, **không** đổi hình dạng JSON route trả về.

**File test MỚI:** `tests/engineering-autonomy-kill-switch.test.ts`. Tối thiểu các ca:

- Kill switch bật → `executeExecutionRequest` ném lỗi **VÀ** đọc lại DB thấy `status = 'killed'`,
  `approval_token IS NULL` (ca này ĐỎ trên code hiện tại — chạy thử trước khi sửa để chứng minh).
- Kill switch bật rồi **tắt** → gọi lại đúng requestId + token cũ phải **thất bại** (không còn
  `authorized`, token đã NULL). Đây là ca chứng minh lỗ hổng thật sự được đóng.
- Hai lời gọi tuần tự cùng token trên yêu cầu hợp lệ: lần 1 thành công (`completed`), lần 2 thất bại.
- Đường hạnh phúc không hồi quy: `authorized` + token đúng + kill switch tắt → `completed`, kết quả
  `executionResult.success === true`.
- Cách ly dự án: gọi với `projectId` khác → "Không tìm thấy yêu cầu thực thi".

**Tiêu chí chấp nhận:** 5 nhóm ca trên xanh; chạy lại toàn bộ file test cũ nhắc tới
`engineering-autonomy` (`grep -rl engineering-autonomy tests/`) vẫn xanh; `typecheck` + `eslint` xanh;
trong báo cáo ghi rõ **đã chọn hướng nào và vì sao**, kèm output chứng minh ca số 1 ĐỎ trước khi sửa.

## Việc B — Cụm `engineering` không được ép mọi lỗi nghiệp vụ về 500 — `route: complex`

**Phạm vi đo lại 2026-09-05:** `grep -rln 'status: 500' app/api/engineering/` → **72 file**, trong đó
**98 chỗ** dùng đúng một idiom:

```ts
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: msg }, { status: 500 });
}
```

Hậu quả: mọi lỗi nghiệp vụ do hàm `lib/ky-thuat/*` ném ra (QR sai checksum, thẻ quá hạn, sai trạng
thái, không tìm thấy bản ghi…) đều tới client dưới dạng **500**, lẫn với lỗi hệ thống thật. Client
không phân biệt được "bạn gửi sai" với "server hỏng", và log/Sentry ngập 500 giả.

**Yêu cầu:**

1. Thêm lớp lỗi nghiệp vụ ở **tầng 0** — `lib/nen/loi.ts` (ADR-0007: `nen/` là tiện ích thuần, không
   chạm DB; mọi tầng đều import xuống được). Tối thiểu: một lớp mang `status: number` + `message`,
   kèm vài hàm tạo tiện dụng cho các mã hay dùng (400/403/404/409/422). Đặt tên tiếng Việt bám phong
   cách repo (`lib/nen/money.ts`, `lib/nen/date.ts`… đều đặt tên hàm tiếng Việt hoặc tiếng Anh ngắn
   — chọn cho nhất quán với file xung quanh, giải thích lựa chọn trong comment đầu file).
2. Một helper dùng chung để route ánh xạ lỗi → response, đặt cạnh lớp lỗi, để 98 chỗ `catch` rút gọn
   còn **một lời gọi**. Lỗi KHÔNG phải lỗi nghiệp vụ vẫn ra **500** (không được nuốt lỗi hệ thống
   thành 4xx — đó là hồi quy nguy hiểm hơn cả bệnh đang chữa).
3. Đổi các `throw new Error(...)` trong `lib/ky-thuat/*` sang lớp lỗi mới **theo đúng ngữ nghĩa**:
   không tìm thấy → 404; sai đầu vào/định dạng → 400; sai quyền → 403; sai trạng thái/vi phạm bất
   biến nghiệp vụ → 409; dữ liệu hợp lệ về cú pháp nhưng không thoả điều kiện nghiệp vụ → 422.

**Ranh giới được phép quyết:** worker tự chọn tên lớp/hàm, tự quyết ranh giới 409 vs 422 cho từng
lỗi cụ thể, và **tự quyết phạm vi đổi `throw` trong lib** — không bắt buộc đổi hết 100% trong một
việc. Ưu tiên theo thứ tự: (1) các lỗi mà test hiện có đã chạm tới, (2) `lib/ky-thuat/engineering-
smart-ipc.ts` + `engineering-autonomy.ts` + các module QR/scan (đây là chỗ lỗi nghiệp vụ dày nhất),
(3) phần còn lại. Chỗ nào chưa đổi thì vẫn ra 500 như cũ — **không hồi quy**, và ghi rõ trong báo cáo
danh sách file đã đổi / chưa đổi.

**Ràng buộc chống hồi quy — đây là phần dễ hỏng nhất của việc này:**

- **Không đổi hình dạng JSON**: thân phản hồi vẫn là `{ error: "<thông điệp tiếng Việt>" }`.
- Nhiều test hiện có đang khẳng định `res.status === 500` cho chính các lỗi này. **Phải chạy lại
  TOÀN BỘ bộ test** (không chỉ file liên quan) và cập nhật các khẳng định đó sang mã mới — mỗi lần
  sửa một khẳng định phải đọc ca test để chắc mã mới đúng ngữ nghĩa, không phải sửa cho xanh.
- Việc A cũng đụng `engineering-autonomy.ts`. **Đừng đổi `executeExecutionRequest`** — để Việc A làm;
  nếu cần lớp lỗi ở đó, ghi vào báo cáo để phiên chính gộp sau.

**Test:** bổ sung ca vào file test sẵn có của các route đã đổi (đừng tạo file mới trùng phạm vi) —
mỗi mã trạng thái mới cần ít nhất 1 ca chứng minh, **và** ít nhất 1 ca chứng minh lỗi hệ thống thật
(vd lỗi DB) vẫn ra 500.

**Tiêu chí chấp nhận:** `npm test` toàn bộ xanh; `npm run check:lib-layers` xanh (lớp lỗi ở tầng 0
không được import ngược lên); `typecheck` + `eslint` xanh; báo cáo liệt kê file đã đổi/chưa đổi và
số khẳng định test đã cập nhật.

## Việc C — Phủ nốt 8 route chưa có test + vá `tasks/:id/move` nối chuỗi SQL — `route: standard`

**8 route CHƯA có test nào chạm tới** (đo 2026-09-05 bằng cách quét `tests/` tìm chuỗi
`app/api/<key>/route`; đây là toàn bộ phần còn lại của `app/api/**` sau 5 đợt):

- `app/api/diaries/route.ts`
- `app/api/handover-items/route.ts`
- `app/api/inspection-requests/route.ts`
- `app/api/project/route.ts`
- `app/api/qc/documents/route.ts`
- `app/api/tasks/route.ts`
- `app/api/variations/[id]/route.ts`
- `app/api/v1/engineering/agent-sessions/[id]/claims/route.ts`

File test MỚI: `tests/route-con-lai.test.ts`. Mỗi handler tối thiểu: 401 chưa đăng nhập
(`dangXuat()`), 403 sai vai trò (nếu route kiểm `CAN`), ca hạnh phúc 200/201 **kiểm dữ liệu trả về
và/hoặc ghi DB**, validate 400/422, và 404/lọc xuyên dự án nếu route có lọc dự án.
Lưu ý `app/api/project/route.ts` là route **public có fallback khi DB trống** — đọc code trước, đừng
áp khuôn 401 máy móc.

**Vá kèm — `app/api/tasks/[id]/move/route.ts` nối chuỗi vào SQL** (dòng 47–50):

```ts
const op = dir === "up" ? `< ${cur.sort_order} ORDER BY sort_order DESC`
                        : `> ${cur.sort_order} ORDER BY sort_order ASC`;
const neighbor = await queryOne<...>(
  `SELECT id, sort_order FROM tasks WHERE package_id = ? AND sort_order ${op} LIMIT 1`, ...);
```

`cur.sort_order` là số nguyên đọc từ DB nên **không khai thác được** — nhưng lệch quy ước cứng của
`CLAUDE.md` ("SQL luôn dùng helper `lib/db` với placeholder `?` — không nối chuỗi để chèn giá trị").
Sửa: đưa `cur.sort_order` thành tham số `?`, chỉ giữ toán tử `<`/`>` và `ASC`/`DESC` là literal
(chúng đến từ enum `dir` đã kiểm, không phải input tự do). **Không đổi hành vi** — ca test phải
chứng minh thứ tự trước/sau khi move giống hệt code cũ (viết ca test trước, chạy xanh trên code cũ,
rồi sửa, chạy lại vẫn xanh).

**Tiêu chí chấp nhận:** file test mới xanh; ca move xanh **cả trước lẫn sau** khi sửa (dán output cả
hai lần vào báo cáo); `npm run check:db-params` xanh; `typecheck` + `eslint` xanh.

## Việc D — Cổng CI chặn id khoá ngoại gán cứng trong test — `route: standard`

**Vì sao:** lớp lỗi "giả định trạng thái toàn cục" đã làm đỏ bộ test ở **cả Đợt 4 lẫn Đợt 5**, dù
Đợt 5 đã ghi nó thành ràng buộc cứng trong `PLAN.md` kèm ví dụ chính xác. Kết luận ghi trong
`PROGRESS.md`: **viết luật vào kế hoạch là chưa đủ, phải có cổng tự động.** Cả hai lần đều cùng dạng:
một hằng số id (`1`) được truyền vào cột có khoá ngoại tới `users` (`created_by`, `updated_by`,
`actorId`), xanh khi chạy riêng, đỏ khi chạy cả bộ vì file test khác đã xoá user đó.

**Yêu cầu:**

1. Script mới `scripts/check-test-fk-ids.ts` + npm script `check:test-fk-ids`, thêm vào cùng chỗ
   các cổng tĩnh khác đang chạy trong CI (`.github/workflows/ci.yml`, job `static` — đọc
   `package.json` + workflow để bám đúng khuôn `check:db-params` / `check:project-scope`).
2. Quét `tests/**/*.test.ts` tìm **hằng số nguyên nhỏ truyền vào vị trí id khoá ngoại**. Mẫu tối
   thiểu phải bắt được cả hai ca thật đã xảy ra:
   - `INSERT INTO boq_norms (..., created_by) VALUES (..., 1)` — hằng trong chuỗi SQL của test;
   - `await setFlag(moduleKey, projectId, true, 1, 1)` — hằng truyền vào tham số `actorId` của hàm lib.
3. **Có đường thoát tường minh**: whitelist theo `file:dòng` kèm **lý do bắt buộc** (khuôn giống
   `WHITELIST` trong `tests/org-scope-invariant.test.ts` — đọc file đó trước, kể cả phần comment cảnh
   báo "đừng thêm mục mới với lý do …"), và cổng phải **báo lỗi khi whitelist có mục thừa** (không
   còn ứng với dòng nào) để nó không mục ruỗng theo thời gian.
4. **BẮT BUỘC: kèm ca test chứng minh cổng ĐỎ** khi cố ý vi phạm — bài học Đợt 5 ghi rõ:
   `check:db-params` đã báo `[OK]` suốt nhiều tháng trong khi 20 vi phạm thật đang tồn tại, vì regex
   của nó không khớp nổi phong cách gọi phổ biến nhất của repo. Không lặp lại: file
   `tests/check-test-fk-ids.test.ts` phải gọi thẳng hàm quét trên một đoạn mã vi phạm dựng sẵn và
   khẳng định nó **tìm ra**, cộng một đoạn hợp lệ và khẳng định nó **bỏ qua**.
5. Chạy cổng trên `tests/` hiện tại → **phải xanh** (Đợt 5 đã sửa 2 ca thật). Nếu nó tìm ra vi phạm
   còn sót, sửa file test đó (dùng id từ hàm `tao*()`) thay vì whitelist.

**Ranh giới:** worker tự chọn heuristic (chấp nhận false-negative để tránh nhiễu, giống
`project-scope-invariant`), nhưng **không được** chấp nhận false-negative trên đúng hai ca thật ở
mục 2 — chúng là tiêu chí chấp nhận cứng.

**Tiêu chí chấp nhận:** `npm run check:test-fk-ids` xanh trên `tests/` hiện tại; test chứng minh cổng
đỏ khi vi phạm xanh; workflow CI đã thêm bước; `typecheck` + `eslint` xanh.

---

# Pha 2 — sau khi Pha 1 xong

`reviewer` soát diff từng việc (skill `code-review`). **Yêu cầu bổ sung từ bài học Đợt 5:** với Việc
A và Việc B, reviewer phải **revert thử bản vá rồi chạy lại test** để chứng minh ca test thật sự bắt
được lỗi — đây là bằng chứng chắc nhất và đã được dùng hiệu quả ở Đợt 5 (reviewer W4).

Sau đó phiên chính: chạy `npm run check:coverage` đầy đủ trên Node 24 + DB ICU, cập nhật
`coverage-baseline.json`, cập nhật `PROGRESS.md`, mở PR, merge khi CI xanh.

---

# NGOÀI phạm vi Đợt 6 — chờ người dùng chốt nghiệp vụ

Hai mục còn lại của "Ghi nhận, chưa sửa" **không** đưa vào kế hoạch này vì cần quyết định nghiệp vụ
của chủ dự án, không phải quyết định kỹ thuật (luật cứng `CLAUDE.md`: thiếu đặc tả thì HỎI, không đoán):

- **Gate 4 Smart IPC** (`lib/ky-thuat/engineering-smart-ipc.ts` `fetchGate4Context`): đối soát kho
  bằng `materials.boq_code = boq_items.code`, mà cả `materials` lẫn `boq_items` **đều nằm trong
  registry BOQCODE dùng chung** (`migrations/0029_boq_codes.sql` gắn trigger lên đúng 4 bảng:
  `tasks`, `work_packages`, `materials`, `boq_items`) — trigger `RAISE EXCEPTION ... 23505` nếu hai
  bảng cùng giữ một mã, nên hai giá trị đó **không bao giờ trùng được**. `warehouseUsedQty` luôn 0,
  mọi khối lượng dương đều trượt cổng ⇒ "4 cổng tự động thông qua thanh toán" chưa từng tự thông qua
  lần nào. Hướng lỗi là fail-safe (chặn nhầm hồ sơ hợp lệ, không cho qua nhầm hồ sơ sai) nên không
  thất thoát tiền. Liên kết đúng đã có sẵn trong schema: `boq_items.id → boq_norms.boq_item_id`
  (`resource_type = 'material'`) `→ boq_norms.material_id → materials.id`, kèm `qty_per_unit` để quy
  đổi đơn vị — nhưng **quy tắc đối soát là quyết định nghiệp vụ**, không suy ra được từ code.
- **`subcon-ai/evaluate` luôn 422** (`lib/hien-truong/subcon-metrics.ts`): 2/5 chỉ số bắt buộc
  (`ncrIncidentCount`, `costVarianceRate`) gán cứng `null` vì **chưa có bảng nguồn** gắn NCR và chi
  phí với thầu phụ. Cần chốt lấy dữ liệu từ đâu (thêm cột liên kết vào bảng NCR/chi phí hiện có? bỏ
  2 chỉ số này khỏi công thức? hạ chúng thành tuỳ chọn?) trước khi code.
